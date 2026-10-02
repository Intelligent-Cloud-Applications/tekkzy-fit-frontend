/**
 * Hikvision ISAPI client (Digest auth) for gym-pc / desk helper.
 * Used when the saved terminal is a Hikvision MinMoe / DS-K unit.
 */
import { createHash } from 'node:crypto';
import { loadDeviceAuth } from './deviceAuth';
import { ensureReachableHost } from './discoverLan';
import { markDeviceOnline } from './wifiFollow';
import type { DeviceLogRow, DeviceUserInput, DeviceUserRow } from './Ai806Client';

function md5(input: string) {
  return createHash('md5').update(input).digest('hex');
}

type Auth = { host: string; username: string; password: string };

let nc = 0;

function parseAuthority(host: string) {
  const clean = host.replace(/^https?:\/\//, '').split('/')[0].trim();
  return clean;
}

function parseChallenge(header: string) {
  const params: Record<string, string> = {};
  const body = header.replace(/^Digest\s+/i, '');
  const re = /(\w+)=(?:"([^"]*)"|([^,\s]*))/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(body))) params[match[1]] = match[2] ?? match[3] ?? '';
  return params;
}

function digestHeader(username: string, password: string, method: string, uri: string, challenge: Record<string, string>) {
  nc += 1;
  const ncStr = String(nc).padStart(8, '0');
  const cnonce = md5(`${Date.now()}:${Math.random()}`).slice(0, 16);
  const realm = challenge.realm || '';
  const nonce = challenge.nonce || '';
  const qop = (challenge.qop || 'auth').split(',')[0].trim();
  const ha1 = md5(`${username}:${realm}:${password}`);
  const ha2 = md5(`${method.toUpperCase()}:${uri}`);
  const response = qop
    ? md5(`${ha1}:${nonce}:${ncStr}:${cnonce}:${qop}:${ha2}`)
    : md5(`${ha1}:${nonce}:${ha2}`);
  const parts = [
    `username="${username}"`,
    `realm="${realm}"`,
    `nonce="${nonce}"`,
    `uri="${uri}"`,
    `response="${response}"`,
  ];
  if (challenge.opaque) parts.push(`opaque="${challenge.opaque}"`);
  if (qop) parts.push(`qop=${qop}`, `nc=${ncStr}`, `cnonce="${cnonce}"`);
  return `Digest ${parts.join(', ')}`;
}

async function hikFetch(auth: Auth, path: string, init: RequestInit = {}, timeoutMs = 12000) {
  const authority = parseAuthority(auth.host);
  const uri = path.startsWith('/') ? path : `/${path}`;
  const url = `http://${authority}${uri}`;
  const method = String(init.method || 'GET').toUpperCase();
  const headers = new Headers(init.headers || {});
  const first = await fetch(url, { ...init, method, headers, signal: AbortSignal.timeout(timeoutMs) });
  if (first.status !== 401) return first;
  const www = first.headers.get('www-authenticate') || '';
  if (!/digest/i.test(www)) throw new Error('Hikvision Digest auth failed');
  await first.arrayBuffer().catch(() => undefined);
  headers.set('Authorization', digestHeader(auth.username, auth.password, method, uri, parseChallenge(www)));
  return fetch(url, { ...init, method, headers, signal: AbortSignal.timeout(timeoutMs) });
}

async function hikJson(auth: Auth, path: string, method: string, body?: unknown) {
  const headers: Record<string, string> = { Accept: 'application/json' };
  let payload: string | undefined;
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await hikFetch(auth, path, { method, headers, body: payload });
  const text = await res.text();
  if (!res.ok) throw new Error(text.slice(0, 200) || `Hikvision HTTP ${res.status}`);
  return text.trim() ? JSON.parse(text) : {};
}

export async function isHikvisionHost(host: string): Promise<string | null> {
  const ip = host.replace(/^https?:\/\//, '').split('/')[0].split(':')[0];
  for (const port of [80, 8000]) {
    const authority = port === 80 ? ip : `${ip}:${port}`;
    try {
      const res = await fetch(`http://${authority}/ISAPI/System/deviceInfo`, { signal: AbortSignal.timeout(900) });
      if (res.status === 401 || res.ok) return authority;
    } catch {
      /* next */
    }
  }
  return null;
}

export class HikvisionClient {
  private auth(): Auth {
    const a = loadDeviceAuth();
    return { host: a.host, username: a.username || 'admin', password: a.password };
  }

  configured(): boolean {
    const a = this.auth();
    return Boolean(a.host && a.password);
  }

  async login(): Promise<{ ok: boolean; sn?: string; message: string; host?: string }> {
    try {
      let host = await ensureReachableHost();
      const hik = host ? await isHikvisionHost(host) : null;
      if (hik) host = hik;
      if (!host) return { ok: false, message: 'No saved terminal IP.' };
      const auth = { ...this.auth(), host };
      const res = await hikFetch(auth, '/ISAPI/System/deviceInfo', { method: 'GET' }, 8000);
      if (res.status === 401) return { ok: false, message: 'Wrong Hikvision web password.' };
      if (!res.ok) return { ok: false, message: `Hikvision HTTP ${res.status}` };
      const text = await res.text();
      const sn = text.match(/<deviceName>([^<]+)<\/deviceName>/i)?.[1] || host;
      markDeviceOnline(true);
      return { ok: true, sn, host, message: `Connected to ${sn}` };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : 'Hikvision unreachable' };
    }
  }

  async getUserList(): Promise<DeviceUserRow[]> {
    const auth = this.auth();
    const hik = await isHikvisionHost(auth.host);
    if (hik) auth.host = hik;
    const rows: DeviceUserRow[] = [];
    const searchID = `desk-${Date.now()}`;
    let position = 0;
    for (let page = 0; page < 40; page += 1) {
      const json = await hikJson(auth, '/ISAPI/AccessControl/UserInfo/Search?format=json', 'POST', {
        UserInfoSearchCond: { searchID, searchResultPosition: position, maxResults: 30 },
      });
      const block = json.UserInfoSearch || {};
      const list = block.UserInfo;
      const batch = Array.isArray(list) ? list : list ? [list] : [];
      for (const item of batch) {
        rows.push({
          id: String(item.employeeNo ?? ''),
          name: String(item.name ?? ''),
          face: item.numOfFace || (item.Face ? 1 : 0),
          card: item.numOfCard,
          endtime: item.Valid?.endTime,
        });
      }
      if (String(block.responseStatusStrg || '').toUpperCase() !== 'MORE') break;
      position += Number(block.numOfMatches || batch.length || 0);
      if (!batch.length) break;
    }
    return rows;
  }

  async setUser(row: DeviceUserInput): Promise<boolean> {
    const auth = this.auth();
    const hik = await isHikvisionHost(auth.host);
    if (hik) auth.host = hik;
    const body = {
      UserInfo: {
        employeeNo: String(row.enrollid),
        name: String(row.name || '').slice(0, 32),
        userType: 'normal',
        Valid: {
          enable: true,
          beginTime: String(row.starttime || '2020-01-01T00:00:00').replace(' ', 'T').slice(0, 19),
          endTime: String(row.endtime || '2037-12-31T23:59:59').replace(' ', 'T').slice(0, 19),
          timeType: 'local',
        },
        doorRight: '1',
        RightPlan: [{ doorNo: 1, planTemplateNo: '1' }],
      },
    };
    try {
      await hikJson(auth, '/ISAPI/AccessControl/UserInfo/Record?format=json', 'POST', body);
      return true;
    } catch {
      await hikJson(auth, '/ISAPI/AccessControl/UserInfo/Modify?format=json', 'PUT', body);
      return true;
    }
  }

  async deleteUser(id: string): Promise<boolean> {
    const auth = this.auth();
    const hik = await isHikvisionHost(auth.host);
    if (hik) auth.host = hik;
    await hikJson(auth, '/ISAPI/AccessControl/UserInfo/Delete?format=json', 'PUT', {
      UserInfoDelCond: { EmployeeNoList: [{ employeeNo: String(id) }] },
    });
    return true;
  }

  async getUserInfo(id: string): Promise<DeviceUserRow> {
    const list = await this.getUserList();
    return list.find((row) => String(row.id) === String(id)) || { id: String(id), name: '' };
  }

  async getLogs(): Promise<DeviceLogRow[]> {
    return [];
  }

  async getRtLogs(): Promise<DeviceLogRow[]> {
    return [];
  }

  async openDoor(): Promise<{ ok: boolean; message: string }> {
    const auth = this.auth();
    const hik = await isHikvisionHost(auth.host);
    if (hik) auth.host = hik;
    await hikJson(auth, '/ISAPI/AccessControl/RemoteControl/door/1', 'PUT', {
      RemoteControlDoor: { cmd: 'open' },
    });
    return { ok: true, message: 'Door unlock sent' };
  }
}

export const hikvision = new HikvisionClient();
