import { md5 } from './md5';
import { errorMessage } from './errors';

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fetchWithTimeout(url: string, ms: number, init: RequestInit = {}): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => {
    try { ctrl.abort(); } catch { /* already aborted */ }
  }, ms);
  return Promise.race([
    fetch(url, { ...init, signal: ctrl.signal }),
    wait(ms + 150).then(() => {
      throw Object.assign(new Error('timeout'), { name: 'TimeoutError' });
    }),
  ]).finally(() => clearTimeout(timer));
}

export type HikDevice = {
  host: string;
  username: string;
  password: string;
};

export type HikUser = {
  id: string;
  name: string;
  card?: string;
  face?: string;
  endtime?: string;
};

export type HikLog = {
  enrollid: string;
  name: string;
  time: string;
  mode?: string;
  inout?: string;
  event?: string;
  note?: string;
};

const HIK_PORTS = [80, 8000];

let active: HikDevice | null = null;
let ncCounter = 0;

export function setHikDevice(creds: HikDevice | null) {
  active = creds;
}

export function getHikDevice() {
  return active;
}

export function parseHostPort(value: string): { ip: string; port: number | null; authority: string } {
  const clean = String(value || '').replace(/^https?:\/\//, '').split('/')[0].trim();
  if (!clean) return { ip: '', port: null, authority: '' };
  const [ip, portText] = clean.split(':');
  const port = portText ? Number(portText) : null;
  return {
    ip,
    port: Number.isFinite(port) && port! > 0 ? port : null,
    authority: clean,
  };
}

function authorityFor(ip: string, port: number) {
  return port === 80 ? ip : `${ip}:${port}`;
}

function toBase64(value: string) {
  if (typeof globalThis.btoa === 'function') return globalThis.btoa(value);
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const bytes = Array.from(value).map((ch) => ch.charCodeAt(0) & 0xff);
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    const triplet = (a << 16) | ((b || 0) << 8) | (c || 0);
    out += chars[(triplet >> 18) & 63];
    out += chars[(triplet >> 12) & 63];
    out += i + 1 < bytes.length ? chars[(triplet >> 6) & 63] : '=';
    out += i + 2 < bytes.length ? chars[triplet & 63] : '=';
  }
  return out;
}

function parseDigestChallenge(header: string) {
  const params: Record<string, string> = {};
  const body = header.replace(/^Digest\s+/i, '');
  const re = /(\w+)=(?:"([^"]*)"|([^,\s]*))/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(body))) {
    params[match[1]] = match[2] ?? match[3] ?? '';
  }
  return params;
}

function buildDigestAuth(
  username: string,
  password: string,
  method: string,
  uri: string,
  challenge: Record<string, string>,
) {
  ncCounter += 1;
  const nc = String(ncCounter).padStart(8, '0');
  const cnonce = md5(`${Date.now()}:${Math.random()}`).slice(0, 16);
  const realm = challenge.realm || '';
  const nonce = challenge.nonce || '';
  // Only use qop when the device offered it — inventing qop=auth breaks many Hikvision units.
  const qopRaw = String(challenge.qop || '').trim();
  const qop = qopRaw ? qopRaw.split(',')[0].trim().replace(/"/g, '') : '';
  const algorithm = String(challenge.algorithm || 'MD5').replace(/"/g, '');
  const user = String(username || '');
  const pass = String(password || '');
  let ha1 = md5(`${user}:${realm}:${pass}`);
  if (/md5-sess/i.test(algorithm)) {
    ha1 = md5(`${ha1}:${nonce}:${cnonce}`);
  }
  const ha2 = md5(`${method.toUpperCase()}:${uri}`);
  const response = qop
    ? md5(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`)
    : md5(`${ha1}:${nonce}:${ha2}`);
  const parts = [
    `username="${user}"`,
    `realm="${realm}"`,
    `nonce="${nonce}"`,
    `uri="${uri}"`,
    `response="${response}"`,
  ];
  if (challenge.opaque) parts.push(`opaque="${challenge.opaque}"`);
  if (algorithm) parts.push(`algorithm=${algorithm}`);
  if (qop) {
    parts.push(`qop=${qop}`);
    parts.push(`nc=${nc}`);
    parts.push(`cnonce="${cnonce}"`);
  }
  return `Digest ${parts.join(', ')}`;
}

async function rawFetch(url: string, timeoutMs: number, init: RequestInit = {}): Promise<{
  status: number;
  headers: Headers;
  text: () => Promise<string>;
  arrayBuffer: () => Promise<ArrayBuffer>;
  ok: boolean;
}> {
  // Prefer XHR so Android exposes WWW-Authenticate for Digest login.
  if (typeof XMLHttpRequest !== 'undefined') {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open(String(init.method || 'GET'), url, true);
      xhr.timeout = timeoutMs;
      xhr.responseType = 'arraybuffer';
      const headers = init.headers instanceof Headers
        ? init.headers
        : new Headers(init.headers as Record<string, string> || {});
      headers.forEach((value, key) => xhr.setRequestHeader(key, value));
      xhr.onload = () => {
        const map = new Headers();
        const raw = xhr.getAllResponseHeaders() || '';
        raw.trim().split(/[\r\n]+/).forEach((line) => {
          const idx = line.indexOf(':');
          if (idx > 0) map.append(line.slice(0, idx).trim(), line.slice(idx + 1).trim());
        });
        const buf = xhr.response as ArrayBuffer;
        resolve({
          status: xhr.status,
          headers: map,
          ok: xhr.status >= 200 && xhr.status < 300,
          text: async () => new TextDecoder().decode(buf || new ArrayBuffer(0)),
          arrayBuffer: async () => buf || new ArrayBuffer(0),
        });
      };
      xhr.onerror = () => reject(new Error('network error'));
      xhr.ontimeout = () => reject(Object.assign(new Error('timeout'), { name: 'TimeoutError' }));
      xhr.send((init.body as string | ArrayBuffer | Blob | null | undefined) ?? null);
    });
  }
  const res = await fetchWithTimeout(url, timeoutMs, init);
  return {
    status: res.status,
    headers: res.headers,
    ok: res.ok,
    text: () => res.text(),
    arrayBuffer: () => res.arrayBuffer(),
  };
}

async function hikFetch(
  authority: string,
  path: string,
  username: string,
  password: string,
  init: RequestInit = {},
  timeoutMs = 10000,
): Promise<{ status: number; ok: boolean; text: () => Promise<string>; arrayBuffer: () => Promise<ArrayBuffer> }> {
  const method = String(init.method || 'GET').toUpperCase();
  const uri = path.startsWith('/') ? path : `/${path}`;
  const url = `http://${authority}${uri}`;
  const headers = new Headers(init.headers || {});

  const first = await rawFetch(url, timeoutMs, { ...init, method, headers }).catch((err) => {
    throw new Error(
      `No reply from ${authority}. On this phone open http://${authority} — if the page does not load, the router is blocking phone↔machine (AP isolation). Same Wi-Fi is not enough.`,
    );
  });
  if (first.status !== 401) return first;

  const www = first.headers.get('www-authenticate') || first.headers.get('WWW-Authenticate') || '';
  try { await first.arrayBuffer(); } catch { /* drain */ }

  // 2) Digest response
  if (/digest/i.test(www)) {
    const auth = buildDigestAuth(username, password, method, uri, parseDigestChallenge(www));
    headers.set('Authorization', auth);
    const digestRes = await rawFetch(url, timeoutMs, { ...init, method, headers }).catch(() => {
      throw new Error(
        `Lost connection to ${authority} during login. Retry on gym Wi-Fi, or open http://${authority} in the phone browser.`,
      );
    });
    // Retrying a rejected Digest login with Basic only adds a second strike toward the device lock.
    return digestRes;
  }

  // 3) Basic auth fallback (some Hikvision firmwares accept this on LAN)
  const basic = `Basic ${toBase64(`${username}:${password}`)}`;
  headers.set('Authorization', basic);
  return rawFetch(url, timeoutMs, { ...init, method, headers }).catch(() => {
    throw new Error(
      `No reply from ${authority}. Open http://${authority} in the phone browser to test.`,
    );
  });
}

export async function probeHikvision(ipOrHost: string): Promise<{ host: string; label: string } | null> {
  const { ip, port } = parseHostPort(ipOrHost);
  if (!ip) return null;
  const ports = port ? [port] : HIK_PORTS;
  for (const p of ports) {
    const authority = authorityFor(ip, p);
    try {
      const res = await fetchWithTimeout(`http://${authority}/ISAPI/System/deviceInfo`, 900);
      if (res.status === 401) return { host: authority, label: 'Hikvision' };
      if (res.ok || res.status === 403) {
        const text = (await res.text()).slice(0, 4000).toLowerCase();
        if (
          text.includes('deviceinfo')
          || text.includes('devicename')
          || text.includes('hikvision')
          || text.includes('minmoe')
          || text.includes('ds-k')
        ) {
          return { host: authority, label: 'Hikvision' };
        }
      }
    } catch {
      /* try next port */
    }
  }
  return null;
}

const REJECTED_TTL_MS = 30 * 60 * 1000;
const rejectedLogins = new Map<string, number>();

function parseLoginLock(body: string) {
  const tag = (name: string) => body.match(new RegExp(`<${name}>([^<]*)</${name}>`, 'i'))?.[1]
    ?? body.match(new RegExp(`"${name}"\\s*:\\s*"?([^",}]*)`, 'i'))?.[1]
    ?? '';
  const unlock = Number(tag('unlockTime'));
  const tries = tag('retryLoginTime');
  return {
    locked: /^lock/i.test(tag('lockStatus')) || unlock > 0,
    unlockSeconds: unlock > 0 ? unlock : 0,
    triesLeft: tries === '' ? null : Number(tries),
  };
}

function lockedError(ip: string, ms: number) {
  const minutes = Math.max(1, Math.ceil(ms / 60000));
  return new Error(
    `The machine at ${ip} has locked the admin login after too many wrong passwords. Wait about ${minutes} min (or restart the machine), then enter the correct web password and tap Connect once.`,
  );
}

function wrongPasswordError(ip: string, triesLeft: number | null = null) {
  const left = triesLeft != null && Number.isFinite(triesLeft)
    ? ` The machine allows ${triesLeft} more ${triesLeft === 1 ? 'try' : 'tries'} before it locks.`
    : '';
  return new Error(
    `Wrong Hikvision password for ${ip}. Type the web password that works at http://${ip} and tap Connect.${left}`,
  );
}

export async function loginHikvision(host: string, username: string, password: string): Promise<string> {
  const { ip, port } = parseHostPort(host);
  const user = String(username || 'admin').trim() || 'admin';
  const pass = String(password || '').trim();
  if (!pass) {
    throw new Error('Enter the Hikvision web password (open the machine IP in a browser to confirm it).');
  }
  if (!ip) throw new Error('Enter the Hikvision device IP.');

  // Hikvision locks the admin account after a few wrong passwords, and while locked it rejects the
  // correct one too. Never resend a password the machine already rejected.
  if (pass.length < 8) {
    throw new Error('Enter the Hikvision web password (at least 8 characters) and tap Connect. The CardM code 2323 does not work on this machine.');
  }
  const key = `${ip}|${user}|${pass}`;
  if (Date.now() - (rejectedLogins.get(key) || 0) < REJECTED_TTL_MS) throw wrongPasswordError(ip);

  // Prefer the port that actually accepts this password. This DS-K1T unit serves ISAPI on :80.
  const ports = port ? [port, ...HIK_PORTS.filter((p) => p !== port)] : HIK_PORTS;
  // A busy terminal or a Wi-Fi blip often drops one request, so retry before reporting "no reply".
  let answerErr: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt) await new Promise((resolve) => setTimeout(resolve, 1500));
    for (const p of ports) {
      const authority = authorityFor(ip, p);
      let res: Awaited<ReturnType<typeof hikFetch>>;
      try {
        res = await hikFetch(authority, '/ISAPI/System/deviceInfo', user, pass, { method: 'GET' }, attempt ? 5000 : 8000);
      } catch {
        continue;
      }
      if (res.status === 401) {
        const lock = parseLoginLock(await res.text().catch(() => ''));
        if (lock.locked) throw lockedError(ip, (lock.unlockSeconds || 1800) * 1000);
        rejectedLogins.set(key, Date.now());
        throw wrongPasswordError(ip, lock.triesLeft);
      }
      if (!res.ok) {
        answerErr = new Error(`Hikvision HTTP ${res.status} at ${authority}`);
        continue;
      }
      const text = await res.text();
      const name = text.match(/<deviceName>([^<]+)<\/deviceName>/i)?.[1]
        || text.match(/"deviceName"\s*:\s*"([^"]+)"/i)?.[1]
        || authority;
      setHikDevice({ host: authority, username: user, password: pass });
      return `Signed in to ${name}`;
    }
    if (answerErr) throw answerErr;
  }
  throw new Error(
    `The machine at ${ip} did not answer (tried 3 times on port ${ports.join(' and ')}). Check the machine is switched on and this phone is on the gym Wi-Fi, then tap Connect again. If it keeps failing, open http://${ip} in the phone browser — if that page does not load either, the router is blocking phone-to-machine traffic.`,
  );
}

async function hikJson<T = Record<string, unknown>>(
  path: string,
  method: string,
  body?: unknown,
  timeoutMs = 12000,
): Promise<T> {
  if (!active) throw new Error('Not signed in to Hikvision. Open Terminal and tap Connect.');
  const headers: Record<string, string> = { Accept: 'application/json' };
  let payload: string | undefined;
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await hikFetch(active.host, path, active.username, active.password, {
    method,
    headers,
    body: payload,
  }, timeoutMs);
  if (res.status === 401) throw new Error('Wrong Hikvision web password.');
  const text = await res.text();
  if (!res.ok) {
    const msg = text.match(/"statusString"\s*:\s*"([^"]+)"/i)?.[1]
      || text.match(/<statusString>([^<]+)<\/statusString>/i)?.[1]
      || `Hikvision HTTP ${res.status}`;
    const sub = text.match(/"subStatusCode"\s*:\s*"([^"]+)"/i)?.[1]
      || text.match(/<subStatusCode>([^<]+)<\/subStatusCode>/i)?.[1];
    throw new Error(sub ? `${msg} (${sub})` : msg);
  }
  if (!text.trim()) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return { raw: text } as T;
  }
}

function mapUser(row: Record<string, unknown>): HikUser {
  const valid = (row.Valid && typeof row.Valid === 'object' ? row.Valid : {}) as Record<string, unknown>;
  const end = String(valid.endTime || valid.endtime || row.endTime || '');
  const face = row.numOfFace || row.faceURL || (row.Face ? 1 : 0);
  return {
    id: String(row.employeeNo ?? row.employeeNoString ?? row.id ?? ''),
    name: String(row.name ?? `User ${row.employeeNo ?? ''}`),
    card: row.numOfCard != null ? String(row.numOfCard) : '',
    face: face ? String(face) : '',
    endtime: end,
  };
}

export async function fetchHikUsers(): Promise<HikUser[]> {
  const rows: HikUser[] = [];
  const searchID = `tekkzy-${Date.now()}`;
  let position = 0;
  for (let page = 0; page < 40; page += 1) {
    const json = await hikJson<{
      UserInfoSearch?: {
        responseStatusStrg?: string;
        numOfMatches?: number;
        UserInfo?: Record<string, unknown> | Record<string, unknown>[];
      };
    }>('/ISAPI/AccessControl/UserInfo/Search?format=json', 'POST', {
      UserInfoSearchCond: {
        searchID,
        searchResultPosition: position,
        maxResults: 30,
      },
    });
    const block = json.UserInfoSearch || {};
    const list = block.UserInfo;
    const batch = (Array.isArray(list) ? list : list ? [list] : []) as Record<string, unknown>[];
    for (const item of batch) {
      const user = mapUser(item);
      if (user.id) rows.push(user);
    }
    const status = String(block.responseStatusStrg || '').toUpperCase();
    const matched = Number(block.numOfMatches || batch.length || 0);
    if (status !== 'MORE' || matched <= 0) break;
    position += matched;
  }
  return rows;
}

function validTimes(starttime?: string, endtime?: string) {
  const begin = String(starttime || '').trim() || '2020-01-01T00:00:00';
  const end = String(endtime || '').trim() || '2037-12-31T23:59:59';
  const toIso = (value: string) => {
    if (/T/.test(value)) return value.replace(' ', 'T').slice(0, 19);
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
      const day = value.slice(0, 10);
      const time = value.length > 11 ? value.slice(11, 19) : '00:00:00';
      return `${day}T${time}`;
    }
    return value;
  };
  const beginTime = toIso(begin);
  const endTime = toIso(end);
  return {
    enable: true,
    beginTime: beginTime > endTime ? `${endTime.slice(0, 10)}T00:00:00` : beginTime,
    endTime,
    timeType: 'local',
  };
}

export async function setHikUser(row: {
  enrollid: string;
  name: string;
  card?: string;
  starttime?: string;
  endtime?: string;
}): Promise<boolean> {
  const employeeNo = String(row.enrollid || '').trim();
  if (!employeeNo) throw new Error('Missing device ID for Hikvision user.');
  const body = {
    UserInfo: {
      employeeNo,
      name: String(row.name || '').trim().slice(0, 32) || employeeNo,
      userType: 'normal',
      Valid: validTimes(row.starttime, row.endtime),
      doorRight: '1',
      RightPlan: [{ doorNo: 1, planTemplateNo: '1' }],
      ...(row.card && row.card !== '0' ? {
        CorrespondingCardNoList: [{ cardNo: String(row.card) }],
      } : {}),
    },
  };
  try {
    await hikJson('/ISAPI/AccessControl/UserInfo/Record?format=json', 'POST', body);
    return true;
  } catch {
    try {
      await hikJson('/ISAPI/AccessControl/UserInfo/Modify?format=json', 'PUT', body);
    } catch {
      // Some firmware rejects door/plan fields on Modify ("Invalid Operation"); send only what changes.
      await hikJson('/ISAPI/AccessControl/UserInfo/Modify?format=json', 'PUT', {
        UserInfo: { employeeNo, name: body.UserInfo.name, userType: 'normal', Valid: body.UserInfo.Valid },
      });
    }
    return true;
  }
}

/** Create the person only if missing. Never Modify here — that resets their validity dates. */
export async function ensureHikUser(enrollid: string, name?: string): Promise<void> {
  const employeeNo = String(enrollid || '').trim();
  if (!employeeNo) throw new Error('Missing device ID for Hikvision user.');
  const displayName = String(name || '').trim().slice(0, 32) || employeeNo;
  try {
    await hikJson('/ISAPI/AccessControl/UserInfo/Record?format=json', 'POST', {
      UserInfo: {
        employeeNo,
        name: displayName,
        userType: 'normal',
        Valid: validTimes(),
        doorRight: '1',
        RightPlan: [{ doorNo: 1, planTemplateNo: '1' }],
      },
    });
  } catch (err) {
    const msg = String((err as Error)?.message || '');
    if (/alreadyExist|already exist/i.test(msg)) return;
    const found = await getHikUserInfo(employeeNo).catch(() => null);
    if (found?.name) return;
    // Record was rejected for another reason; the full upsert still creates the person.
    await setHikUser({ enrollid: employeeNo, name: displayName });
  }
}

export async function deleteHikUser(enrollid: string): Promise<void> {
  const employeeNo = String(enrollid || '').trim();
  await hikJson('/ISAPI/AccessControl/UserInfo/Delete?format=json', 'PUT', {
    UserInfoDelCond: {
      EmployeeNoList: [{ employeeNo }],
    },
  });
}

export async function getHikUserInfo(enrollid: string) {
  const employeeNo = String(enrollid || '').trim();
  const json = await hikJson<{
    UserInfoSearch?: { UserInfo?: Record<string, unknown> | Record<string, unknown>[] };
  }>('/ISAPI/AccessControl/UserInfo/Search?format=json', 'POST', {
    UserInfoSearchCond: {
      searchID: `one-${employeeNo}`,
      searchResultPosition: 0,
      maxResults: 1,
      EmployeeNoList: [{ employeeNo }],
    },
  });
  const list = json.UserInfoSearch?.UserInfo;
  const rows = (Array.isArray(list) ? list : list ? [list] : []) as Record<string, unknown>[];
  // Some firmware ignores EmployeeNoList and returns other people; only accept an exact match.
  const item = rows.find((row) => String(row.employeeNo ?? '').trim() === employeeNo);
  if (!item) {
    return { id: employeeNo, name: '', face: 0, fingerprint: 0, card: '', photourl: '', endtime: '' };
  }
  const mapped = mapUser(item);
  return {
    id: mapped.id,
    name: mapped.name,
    face: mapped.face || 0,
    fingerprint: 0,
    card: mapped.card || '',
    photourl: faceUrlOf(item),
    endtime: mapped.endtime || '',
  };
}

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function localStamp(d = new Date(), withTz = true) {
  const base = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
  return withTz ? `${base}+05:30` : base;
}

function mapAcsInfo(item: Record<string, unknown>): HikLog {
  const employeeList = item.employeeNoList as Array<{ employeeNo?: string }> | undefined;
  return {
    enrollid: String(employeeList?.[0]?.employeeNo || item.employeeNoString || item.employeeNo || item.cardNo || ''),
    name: String(item.name || ''),
    time: String(item.time || ''),
    mode: item.currentVerifyMode != null ? String(item.currentVerifyMode) : undefined,
    event: item.minor != null ? String(item.minor) : undefined,
    note: item.doorNo != null ? `Door ${item.doorNo}` : undefined,
  };
}

/** Newest punches first. `days` is the look-back window; only the latest `limit` events are read. */
export async function fetchHikLogs(opts: { days?: number; limit?: number } = {}): Promise<HikLog[]> {
  const days = opts.days ?? 7;
  const limit = opts.limit ?? 500;
  const now = new Date();
  // Pad the end: if the terminal clock is ahead of the phone, a scan made just now is still included.
  const end = new Date(now.getTime() + 12 * 60 * 60 * 1000);
  const start = days <= 1
    ? new Date(now.getFullYear(), now.getMonth(), now.getDate())
    : new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const pairs = [
    { begin: localStamp(start, true), finish: localStamp(end, true) },
    { begin: localStamp(start, false), finish: localStamp(end, false) },
  ];
  const fieldSets: Array<Record<string, unknown>> = [];
  for (const { begin, finish } of pairs) {
    fieldSets.push(
      { major: 5, beginTime: begin, endTime: finish },
      { major: 5, minor: 75, beginTime: begin, endTime: finish },
      { major: 5, minor: 1, beginTime: begin, endTime: finish },
      { major: 5, startTime: begin, endTime: finish },
      { beginTime: begin, endTime: finish },
      { startTime: begin, endTime: finish },
    );
  }
  let lastErr: Error | null = null;
  for (const fields of fieldSets) {
    try {
      const rows = await fetchHikLogsOnce(fields, limit);
      return rows.sort((a, b) => String(b.time).localeCompare(String(a.time)));
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      if (!/invalid content/i.test(lastErr.message)) throw lastErr;
    }
  }
  throw new Error(
    /invalid content/i.test(String(lastErr?.message || ''))
      ? 'This Hikvision firmware rejected the log request. Open Terminal, reconnect, or pull attendance from Attendance.'
      : (lastErr?.message || 'Could not read Hikvision logs.'),
  );
}

async function fetchHikLogsOnce(fields: Record<string, unknown>, limit: number): Promise<HikLog[]> {
  const rows: HikLog[] = [];
  const searchID = `logs-${Date.now()}`;
  const pageSize = 30;
  let position = 0;
  let skippedToTail = false;
  // Results come oldest-first. Read the total, then jump to the tail so the newest punches load.
  for (let page = 0; page < Math.ceil(limit / pageSize) + 2; page += 1) {
    const json = await hikJson<{
      AcsEvent?: {
        responseStatusStrg?: string;
        numOfMatches?: number;
        totalMatches?: number;
        InfoList?: Array<Record<string, unknown>> | Record<string, unknown>;
      };
    }>('/ISAPI/AccessControl/AcsEvent?format=json', 'POST', {
      AcsEventCond: {
        searchID,
        searchResultPosition: position,
        maxResults: pageSize,
        ...fields,
      },
    }, 15000);
    const block = json.AcsEvent || {};
    const total = Number(block.totalMatches || 0);
    if (!skippedToTail && total > limit && position === 0) {
      skippedToTail = true;
      position = total - limit;
      continue;
    }
    skippedToTail = true;
    const list = block.InfoList;
    const batch = (Array.isArray(list) ? list : list ? [list] : []) as Record<string, unknown>[];
    for (const item of batch) rows.push(mapAcsInfo(item));
    const status = String(block.responseStatusStrg || '').toUpperCase();
    const matched = Number(block.numOfMatches || batch.length || 0);
    if (status !== 'MORE' || matched <= 0) break;
    position += matched;
  }
  return rows;
}

export async function openHikDoor(): Promise<string> {
  await hikJson('/ISAPI/AccessControl/RemoteControl/door/1', 'PUT', {
    RemoteControlDoor: { cmd: 'open' },
  });
  return 'Door unlock sent to Hikvision.';
}

export async function startHikFaceCapture(enrollid?: string): Promise<{ ok: boolean; message: string; faceData?: string }> {
  if (!active) throw new Error('Not signed in to Hikvision.');
  const employeeNo = String(enrollid || '').trim();
  const xml = '<?xml version="1.0" encoding="UTF-8"?>'
    + '<CaptureFaceDataCond version="2.0" xmlns="http://www.isapi.org/ver20/XMLSchema">'
    + '<captureInfrared>false</captureInfrared>'
    + '<dataType>binary</dataType>'
    + (employeeNo ? `<employeeNo>${employeeNo}</employeeNo>` : '')
    + '</CaptureFaceDataCond>';
  const res = await hikFetch(
    active.host,
    '/ISAPI/AccessControl/CaptureFaceData',
    active.username,
    active.password,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/xml', Accept: '*/*' },
      body: xml,
    },
    90000,
  );
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return {
      ok: false,
      message: text.match(/"statusString"\s*:\s*"([^"]+)"/i)?.[1]
        || text.match(/<statusString>([^<]+)<\/statusString>/i)?.[1]
        || `Hikvision face capture HTTP ${res.status}`,
    };
  }
  const faceData = jpegDataUrl(new Uint8Array(await res.arrayBuffer()));
  if (!faceData) {
    // Capture may have enrolled model data without returning a JPEG.
    if (employeeNo && res.ok) {
      return { ok: true, message: 'Face captured on Hikvision.' };
    }
    return { ok: false, message: 'No face image returned. Look at the terminal and try again.' };
  }
  return { ok: true, message: 'Face captured on Hikvision.', faceData };
}

/** Cuts the JPEG (SOI..EOI) out of a possibly multipart body; '' when there is none. */
function jpegDataUrl(bytes: Uint8Array): string {
  let jpeg = bytes;
  for (let i = 0; i < bytes.length - 2; i += 1) {
    if (bytes[i] === 0xff && bytes[i + 1] === 0xd8 && bytes[i + 2] === 0xff) {
      jpeg = bytes.subarray(i);
      break;
    }
  }
  for (let i = jpeg.length - 2; i > 1; i -= 1) {
    if (jpeg[i] === 0xff && jpeg[i + 1] === 0xd9) {
      jpeg = jpeg.subarray(0, i + 2);
      break;
    }
  }
  if (jpeg.byteLength < 100 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8) return '';
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < jpeg.length; i += chunk) {
    binary += String.fromCharCode(...jpeg.subarray(i, i + chunk));
  }
  return `data:image/jpeg;base64,${toBase64(binary)}`;
}

type FaceSearchReply = {
  responseStatusStrg?: string;
  numOfMatches?: number;
  MatchList?: Array<{ FPID?: string; faceURL?: string; modelData?: string }>;
};

function faceUrlOf(item: Record<string, unknown> | undefined) {
  return String(item?.faceURL || item?.faceUrl || item?.picURL || '').trim();
}

/** employeeNo → faceURL for every face enrolled in the terminal's face libraries, plus the first error seen. */
export async function listHikFaceUrls(): Promise<{ urls: Map<string, string>; error: string }> {
  if (!active) throw new Error('Not signed in to Hikvision.');
  const urls = new Map<string, string>();
  let error = '';
  for (const FDID of await hikFaceLibraries()) {
    let position = 0;
    for (let page = 0; page < 200; page += 1) {
      let json: FaceSearchReply;
      try {
        json = await hikJson<FaceSearchReply>('/ISAPI/Intelligent/FDLib/FDSearch?format=json', 'POST', {
          searchResultPosition: position,
          maxResults: 30,
          faceLibType: 'blackFD',
          FDID,
        });
      } catch (err) {
        error = error || String((err as Error)?.message || err);
        break;
      }
      const list = Array.isArray(json.MatchList) ? json.MatchList : [];
      for (const item of list) {
        const id = String(item.FPID || '').trim();
        const url = faceUrlOf(item);
        if (id && url && !urls.has(id)) urls.set(id, url);
      }
      const matched = Number(json.numOfMatches || list.length || 0);
      if (String(json.responseStatusStrg || '').toUpperCase() !== 'MORE' || matched <= 0) break;
      position += matched;
    }
  }
  return { urls, error };
}

/** One person's faceURL: face library search by FPID first, then the user record. '' when none is found. */
export async function findHikFaceUrl(enrollid: string): Promise<string> {
  if (!active) throw new Error('Not signed in to Hikvision.');
  const employeeNo = String(enrollid || '').trim();
  if (!employeeNo) return '';
  for (const FDID of await hikFaceLibraries()) {
    const json = await hikJson<FaceSearchReply>('/ISAPI/Intelligent/FDLib/FDSearch?format=json', 'POST', {
      searchResultPosition: 0,
      maxResults: 5,
      faceLibType: 'blackFD',
      FDID,
      FPID: employeeNo,
    }).catch(() => ({} as FaceSearchReply));
    const list = Array.isArray(json.MatchList) ? json.MatchList : [];
    const hit = list.find((item) => String(item.FPID || '').trim() === employeeNo) || (list.length === 1 ? list[0] : undefined);
    const url = faceUrlOf(hit as Record<string, unknown> | undefined);
    if (url) return url;
  }
  const info = await hikJson<{ UserInfoSearch?: { UserInfo?: Record<string, unknown> | Record<string, unknown>[] } }>(
    '/ISAPI/AccessControl/UserInfo/Search?format=json',
    'POST',
    { UserInfoSearchCond: { searchID: `face-${employeeNo}`, searchResultPosition: 0, maxResults: 1, EmployeeNoList: [{ employeeNo }] } },
  ).catch(() => ({} as { UserInfoSearch?: { UserInfo?: Record<string, unknown> | Record<string, unknown>[] } }));
  const rows = info.UserInfoSearch?.UserInfo;
  const list = (Array.isArray(rows) ? rows : rows ? [rows] : []) as Record<string, unknown>[];
  return faceUrlOf(list.find((row) => String(row.employeeNo ?? '').trim() === employeeNo));
}

/** Downloads one faceURL through the signed-in session (the URL host can be the terminal's internal IP). */
export async function downloadHikFace(faceUrl: string): Promise<string> {
  if (!active) throw new Error('Not signed in to Hikvision.');
  const path = /^https?:\/\/[^/]+(\/.*)$/i.exec(String(faceUrl || '').trim())?.[1]
    || (String(faceUrl || '').startsWith('/') ? String(faceUrl) : '');
  if (!path) return '';
  const res = await hikFetch(active.host, path, active.username, active.password, { method: 'GET', headers: { Accept: '*/*' } }, 15000);
  if (!res.ok) return '';
  return jpegDataUrl(new Uint8Array(await res.arrayBuffer()));
}

function utf8Bytes(text: string): Uint8Array {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(text);
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i += 1) out[i] = text.charCodeAt(i) & 0xff;
  return out;
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function base64ToBytes(base64: string): Uint8Array {
  const clean = base64.replace(/\s+/g, '');
  if (typeof globalThis.atob === 'function') {
    const bin = globalThis.atob(clean);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
    return out;
  }
  // Minimal fallback
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const ch of clean.replace(/=+$/, '')) {
    const val = chars.indexOf(ch);
    if (val < 0) continue;
    buffer = (buffer << 6) | val;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return new Uint8Array(bytes);
}

async function hikFaceLibraries(): Promise<string[]> {
  try {
    const json = await hikJson<{ FDLibBaseCfg?: Array<{ FDID?: string }> | { FDID?: string } }>(
      '/ISAPI/Intelligent/FDLib?format=json',
      'GET',
    );
    const rows = json.FDLibBaseCfg;
    const list = Array.isArray(rows) ? rows : rows ? [rows] : [];
    const ids = list.map((row) => String(row.FDID || '')).filter(Boolean);
    return ids.length ? ids : ['1'];
  } catch {
    return ['1'];
  }
}

/** Remove the enrolled face for an employee so a retake can bind a new picture. */
export async function deleteHikFace(enrollid: string): Promise<void> {
  if (!active) throw new Error('Not signed in to Hikvision.');
  const employeeNo = String(enrollid || '').trim();
  if (!employeeNo) return;
  const fdids = await hikFaceLibraries();
  const deleteBodies: unknown[] = [
    { FPID: [{ value: employeeNo }] },
    { FaceModeList: [{ mode: 'FPID', value: employeeNo }] },
    { FaceModeList: [{ mode: 'byEmployeeNo', value: employeeNo }] },
    { FPID: [employeeNo] },
    { FPID: employeeNo },
  ];
  for (const FDID of fdids) {
    for (const body of deleteBodies) {
      await hikJson(
        `/ISAPI/Intelligent/FDLib/FDSearch/Delete?format=json&FDID=${encodeURIComponent(FDID)}&faceLibType=blackFD`,
        'PUT',
        body,
      ).catch(() => undefined);
    }
  }
  // Never call AccessControl/UserInfoDetail/Delete here: it deletes the whole person in the
  // background, and the face upload then fails with employeeNoNotExist.
}

function faceUploadOk(text: string, httpOk: boolean) {
  // Terminals answer in JSON or XML (ResponseStatus) depending on route; read both.
  const statusCode = Number(
    text.match(/"statusCode"\s*:\s*(\d+)/)?.[1]
    || text.match(/<statusCode>(\d+)<\/statusCode>/)?.[1]
    || (httpOk ? 1 : 0),
  );
  const statusString = text.match(/"statusString"\s*:\s*"([^"]+)"/)?.[1]
    || text.match(/<statusString>([^<]+)<\/statusString>/)?.[1]
    || text.match(/"errorMsg"\s*:\s*"([^"]+)"/)?.[1]
    || '';
  const subStatusCode = text.match(/"subStatusCode"\s*:\s*"([^"]+)"/)?.[1]
    || text.match(/<subStatusCode>([^<]+)<\/subStatusCode>/)?.[1]
    || '';
  const ok = httpOk && (statusCode === 1 || !statusString || /ok/i.test(statusString));
  return { ok, statusCode, statusString, subStatusCode };
}

async function postHikFaceImage(employeeNo: string, FDID: string, jpeg: Uint8Array, method: 'POST' | 'PUT', path: string) {
  if (!active) throw new Error('Not signed in to Hikvision.');
  const meta = JSON.stringify({ faceLibType: 'blackFD', FDID, FPID: employeeNo });
  const boundary = `----TekkzyFace${Date.now()}`;
  const head = utf8Bytes(
    `--${boundary}\r\n`
    + 'Content-Disposition: form-data; name="FaceDataRecord"\r\n'
    + 'Content-Type: application/json\r\n'
    + `Content-Length: ${utf8Bytes(meta).byteLength}\r\n\r\n`
    + `${meta}\r\n`
    + `--${boundary}\r\n`
    + 'Content-Disposition: form-data; name="FaceImage"; filename="face.jpg"\r\n'
    + 'Content-Type: image/jpeg\r\n'
    + `Content-Length: ${jpeg.byteLength}\r\n\r\n`,
  );
  const tail = utf8Bytes(`\r\n--${boundary}--\r\n`);
  const body = concatBytes([head, jpeg, tail]);
  const res = await hikFetch(active.host, path, active.username, active.password, {
    method,
    headers: {
      Accept: 'application/json',
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
    },
    body: body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer,
  }, 45000);
  const text = await res.text();
  return { ...faceUploadOk(text, res.ok), httpStatus: res.status, text };
}

export async function attachHikFace(enrollid: string, faceDataUrl: string, name?: string): Promise<boolean> {
  if (!active) throw new Error('Not signed in to Hikvision.');
  const employeeNo = String(enrollid || '').trim();
  const base64 = faceDataUrl.replace(/^data:image\/\w+;base64,/, '');
  if (!employeeNo || !base64) throw new Error('Missing face data for Hikvision.');
  const jpeg = base64ToBytes(base64);
  if (jpeg.byteLength < 500) throw new Error('Face image is empty or too small for Hikvision.');

  await ensureHikUser(employeeNo, name);

  // Always wipe the old face first. Uploading over an existing FPID often reports OK
  // (or faceExist) while the terminal keeps recognizing the previous person.
  await deleteHikFace(employeeNo).catch(() => undefined);

  const fdids = await hikFaceLibraries();
  // POST FaceDataRecord is the route this terminal accepts; the rest are fallbacks for other firmware.
  const tryPaths: Array<{ method: 'POST' | 'PUT'; path: string }> = [
    { method: 'POST', path: '/ISAPI/Intelligent/FDLib/FaceDataRecord?format=json' },
    { method: 'PUT', path: '/ISAPI/Intelligent/FDLib/FaceDataRecord?format=json' },
    { method: 'PUT', path: '/ISAPI/Intelligent/FDLib/FDSetUp?format=json' },
    { method: 'PUT', path: '/ISAPI/Intelligent/FDLib/FDSetUp/Modify?format=json' },
  ];
  let firstErr = '';

  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (attempt > 0) await deleteHikFace(employeeNo).catch(() => undefined);
    for (const FDID of fdids) {
      for (const route of tryPaths) {
        const result = await postHikFaceImage(employeeNo, FDID, jpeg, route.method, route.path);
        if (result.ok) return true;
        const err = [result.statusString, result.subStatusCode].filter(Boolean).join(' / ')
          || `HTTP ${result.httpStatus}`;
        // "Invalid Operation" / notSupport only means this firmware lacks the route.
        if (!firstErr && !/invalid operation|notSupport/i.test(err)) firstErr = err;
        if (/employeeNoNotExist/i.test(err) && attempt === 0) {
          await setHikUser({ enrollid: employeeNo, name: String(name || '').trim() || employeeNo }).catch(() => undefined);
          await new Promise((resolve) => setTimeout(resolve, 1200));
          firstErr = '';
          break;
        }
        if (/alreadyExist|faceExist/i.test(err)) break;
      }
    }
  }
  throw new Error(hikFaceError(firstErr));
}

function hikFaceError(raw: string) {
  if (/faceQuality|poorQuality|noFace|faceNotDetected|modeling|liveness/i.test(raw)) {
    return 'The terminal could not read a clear face. Face the camera in good light, remove mask/cap, and retake.';
  }
  if (/busy/i.test(raw)) return 'The terminal is busy. Leave it on the home screen for a few seconds and retake.';
  if (/alreadyExist|faceExist/i.test(raw)) {
    return 'The terminal still has the old face for this Device ID. Retake once more; if it repeats, delete the face on the terminal menu.';
  }
  return `The terminal did not accept the new face${raw ? ` (${raw})` : ''}. Leave it on the home screen and retake.`;
}
