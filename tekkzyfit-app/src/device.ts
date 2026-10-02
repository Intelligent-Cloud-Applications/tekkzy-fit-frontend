import { Linking, PermissionsAndroid, Platform } from 'react-native';
import { DEVICE_KIND, HOST_HINT_OCTETS, TERMINAL_MARKS } from './config';
import { errorMessage } from './errors';
import {
  attachHikFace,
  deleteHikFace,
  deleteHikUser,
  downloadHikFace,
  ensureHikUser,
  fetchHikLogs,
  fetchHikUsers,
  getHikDevice,
  getHikUserInfo,
  findHikFaceUrl,
  listHikFaceUrls,
  loginHikvision,
  openHikDoor,
  parseHostPort,
  probeHikvision,
  setHikDevice,
  setHikUser,
  startHikFaceCapture,
} from './hikvision';

export type DeviceKind = 'ai806' | 'hikvision';

let deviceKind: DeviceKind | '' = '';

export function getDeviceKind(): DeviceKind | '' {
  return deviceKind;
}

export function setDeviceKind(kind: DeviceKind | '') {
  deviceKind = kind;
  if (kind !== 'hikvision') setHikDevice(null);
}

/** True only after a successful Hikvision login this session. CardM path never uses this. */
function useHikvision(): boolean {
  return deviceKind === 'hikvision' && Boolean(getHikDevice());
}

function hostIp(value?: string | null) {
  return parseHostPort(String(value || '')).ip;
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([promise, wait(ms).then(() => fallback)]);
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

let lanPermsAsked: Promise<void> | null = null;

export async function ensureLanPermissions(opts?: { openSettings?: boolean; timeoutMs?: number }) {
  if (Platform.OS !== 'android') return;
  if (lanPermsAsked && !opts?.openSettings) return lanPermsAsked;
  const run = (async () => {
    try {
      const perms = [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
      if (Number(Platform.Version) >= 33 && PermissionsAndroid.PERMISSIONS.NEARBY_WIFI_DEVICES) {
        perms.push(PermissionsAndroid.PERMISSIONS.NEARBY_WIFI_DEVICES);
      }
      const already = await PermissionsAndroid.check(perms[0]);
      if (already && !opts?.openSettings) return;
      const result = await withTimeout(
        PermissionsAndroid.requestMultiple(perms),
        opts?.timeoutMs ?? (opts?.openSettings ? 20000 : 6000),
        {} as Record<string, string>,
      );
      const blocked = perms.some((perm) => result[perm] === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN);
      if (blocked && opts?.openSettings) await Linking.openSettings();
    } catch {
      /* older Android or denied */
    }
  })();
  lanPermsAsked = run;
  return run;
}

export type ProbeResult = {
  host: string;
  ok: boolean;
  label?: string;
  message: string;
};

let lastLiveHost = '';

function rememberLiveHost(host: string) {
  if (isIpv4(host)) lastLiveHost = host;
}

async function pageLooksLikeTerminal(host: string): Promise<{ host: string; label: string } | null> {
  if (DEVICE_KIND === 'hikvision') return probeHikvision(host);
  const ip = hostIp(host) || host;
  try {
    const res = await fetchWithTimeout(`http://${ip}/home.html`, 400);
    const html = (await res.text()).slice(0, 2500).toLowerCase();
    if (TERMINAL_MARKS.some((mark) => html.includes(mark))) {
      return { host: ip, label: 'Face machine' };
    }
  } catch {
    /* try root once */
  }
  try {
    const res = await fetchWithTimeout(`http://${ip}/`, 350);
    const html = (await res.text()).slice(0, 2500).toLowerCase();
    if (TERMINAL_MARKS.some((mark) => html.includes(mark))) {
      return { host: ip, label: 'Face machine' };
    }
  } catch {
    /* not AI806 */
  }
  return null;
}

export async function probeHost(host: string): Promise<ProbeResult> {
  const raw = host.replace(/^https?:\/\//, '').split('/')[0].trim();
  if (!raw) return { host: '', ok: false, message: 'Enter the face machine IP.' };
  const found = await pageLooksLikeTerminal(raw);
  if (found) {
    rememberLiveHost(found.host);
    return { host: found.host, ok: true, label: found.label, message: `Connected at ${found.host}` };
  }
  return { host: raw, ok: false, message: `No face machine at ${raw}. Use the same Wi-Fi and the home screen.` };
}

function usableIp(value?: string | null) {
  const ip = String(value || '').trim();
  return ip && ip !== '0.0.0.0' && !ip.startsWith('127.') && isIpv4(ip) ? ip : '';
}

async function readPhoneIp(): Promise<string> {
  try {
    const net = require('expo-network') as { getIpAddressAsync?: () => Promise<string> };
    return usableIp(await withTimeout(net.getIpAddressAsync?.() ?? Promise.resolve(''), 800, ''));
  } catch {
    return '';
  }
}

export async function phoneLanIp(): Promise<string> {
  const first = await readPhoneIp();
  if (first) return first;
  void ensureLanPermissions();
  await wait(250);
  return readPhoneIp();
}

export function isIpv4(value?: string | null) {
  const ip = hostIp(value) || String(value || '').trim();
  const parts = ip.split('.');
  return parts.length === 4 && parts.every((part) => /^\d+$/.test(part) && Number(part) >= 0 && Number(part) <= 255);
}

export function lanPrefix(ip?: string | null) {
  const value = hostIp(ip) || String(ip || '').trim();
  return isIpv4(value) ? value.split('.').slice(0, 3).join('.') : '';
}

export function lastOctet(ip?: string | null) {
  const value = hostIp(ip) || String(ip || '').trim();
  return isIpv4(value) ? value.split('.')[3] : '';
}

export function sameLan(a?: string | null, b?: string | null) {
  const left = lanPrefix(a);
  const right = lanPrefix(b);
  return Boolean(left && right && left === right);
}

export function hostOnLan(host?: string | null, lanIp?: string | null) {
  const prefix = lanPrefix(lanIp);
  const octet = lastOctet(host);
  if (!prefix || !octet) return '';
  const next = `${prefix}.${octet}`;
  return next === lanIp ? '' : next;
}

function hintHosts(self: string, prefer?: string): string[] {
  const prefix = lanPrefix(self);
  if (!prefix) return [prefer, lastLiveHost].filter((ip) => isIpv4(ip)) as string[];
  const octets = [...HOST_HINT_OCTETS];
  for (const ip of [lastLiveHost, prefer]) {
    const n = Number(lastOctet(ip));
    if (Number.isFinite(n) && n > 0 && sameLan(ip, self)) octets.unshift(n);
  }
  return [...new Set(octets)]
    .map((n) => `${prefix}.${n}`)
    .filter((ip) => ip !== self);
}

function subnetHosts(self: string, prefer?: string): string[] {
  const prefix = lanPrefix(self);
  const first = hintHosts(self, prefer);
  if (!prefix) return first;
  const rest: string[] = [];
  for (let n = 1; n <= 254; n += 1) {
    const ip = `${prefix}.${n}`;
    if (ip !== self && !first.includes(ip)) rest.push(ip);
  }
  return [...first, ...rest];
}

async function mapPool(
  hosts: string[],
  limit: number,
  fn: (host: string) => Promise<ProbeResult | null>,
  shouldStop?: () => boolean,
) {
  const found: ProbeResult[] = [];
  let i = 0;
  async function worker() {
    while (i < hosts.length && !found.length && !shouldStop?.()) {
      const idx = i;
      i += 1;
      const row = await fn(hosts[idx]);
      if (row) found.push(row);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, hosts.length) }, () => worker()));
  return found;
}

const SCAN_MS = 10000;
let activeScan: Promise<ProbeResult> | null = null;

async function probeList(
  hosts: string[],
  onProgress?: (text: string) => void,
  deadline = Date.now() + SCAN_MS,
) {
  return mapPool(hosts, 36, async (host) => {
    if (Date.now() > deadline) return null;
    onProgress?.(`Scanning ${host}…`);
    const found = await pageLooksLikeTerminal(host);
    return found ? { host: found.host, ok: true, label: found.label, message: `Found at ${found.host}` } : null;
  }, () => Date.now() > deadline);
}

export async function scanForTerminal(onProgress?: (text: string) => void, preferHost?: string): Promise<ProbeResult> {
  if (activeScan) {
    onProgress?.('Scanning Wi-Fi…');
    return activeScan;
  }
  activeScan = (async () => {
    await ensureLanPermissions();
    const self = await phoneLanIp();
    if (!self) {
      return {
        host: '',
        ok: false,
        message: 'Could not see this phone’s Wi-Fi. Type the machine IP and tap Connect.',
      };
    }
    const quick = [lastLiveHost, preferHost].filter((ip): ip is string => isIpv4(ip) && ip !== self && (!self || sameLan(ip, self)));
    for (const ip of [...new Set(quick)]) {
      onProgress?.(`Checking ${ip}…`);
      const found = await pageLooksLikeTerminal(ip);
      if (found) {
        rememberLiveHost(found.host);
        return { host: found.host, ok: true, label: found.label, message: `Found at ${found.host}` };
      }
    }
    onProgress?.(`Scanning ${self.replace(/\.\d+$/, '.x')}…`);
    const deadline = Date.now() + SCAN_MS;
    const hints = await probeList(hintHosts(self, preferHost), onProgress, deadline);
    if (hints[0]) {
      rememberLiveHost(hints[0].host);
      return hints[0];
    }
    const rest = subnetHosts(self, preferHost).filter((ip) => !hintHosts(self, preferHost).includes(ip));
    const found = await probeList(rest, onProgress, deadline);
    if (found[0]) {
      rememberLiveHost(found[0].host);
      return found[0];
    }
    return {
      host: '',
      ok: false,
      message: `No face machine on ${self.replace(/\.\d+$/, '.0/24')}. Same Wi-Fi, home screen, then scan again.`,
    };
  })().finally(() => {
    activeScan = null;
  });
  return activeScan;
}

export type DeviceUser = {
  id: string;
  name: string;
  card?: string;
  face?: string;
  starttime?: string;
  endtime?: string;
  photourl?: string;
};

type DeviceJson = {
  result?: boolean;
  ret?: string;
  msg?: string;
  record?: unknown;
  count?: number;
  to?: number;
  status?: number;
  image?: string;
  reason?: number;
  face?: string | number;
  fingerprint?: string | number;
  card?: string | number;
  photourl?: string;
};

let devicePassword = '';

export function setDevicePassword(password: string) {
  devicePassword = String(password || '');
}

async function deviceApi(host: string, body: Record<string, unknown>, timeoutMs = 8000): Promise<DeviceJson> {
  const password = String(body.password ?? devicePassword ?? '');
  if (!password && String(body.cmd) !== 'login') {
    throw new Error('No password. Open Settings → Terminal, enter the web password, and tap Connect.');
  }
  const res = await fetchWithTimeout(`http://${host}/api`, timeoutMs, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, password: body.password ?? password }),
  }).catch((err) => {
    throw new Error(errorMessage(err, 'Could not reach the face machine. Stay on the gym Wi-Fi and try Reconnect.', 'device'));
  });
  if (!res.ok) throw new Error(`Device HTTP ${res.status}`);
  const json = (await res.json()) as DeviceJson;
  const msg = String(json.msg || '');
  if (json.result === false && /password/i.test(msg)) {
    throw new Error(msg || 'No password. Open Settings → Terminal, enter the web password, and tap Connect.');
  }
  return json;
}

export async function loginDevice(host: string, username: string, password: string): Promise<string> {
  setDevicePassword(password);
  const ip = hostIp(host) || String(host || '').trim();
  const pass = String(password || '');
  const user = String(username || 'admin').trim() || 'admin';

  if (DEVICE_KIND === 'hikvision') {
    const msg = await loginHikvision(host || ip, user, pass);
    setDeviceKind('hikvision');
    rememberLiveHost(getHikDevice()?.host || host || ip);
    return msg.startsWith('Signed in') ? msg.replace('Signed in', 'Signed in (Hikvision)') : msg;
  }

  if (!ip) throw new Error('Enter the CardM machine IP address.');
  const json = await deviceApi(ip, { cmd: 'login', username: user, password: pass, rememberMe: false }, 4000);
  if (json.result === true && json.ret === 'login') {
    setDeviceKind('ai806');
    rememberLiveHost(ip);
    return 'Signed in (CardM)';
  }
  throw new Error(String(json.msg || 'CardM login failed. Check the machine password.'));
}

export type EnrollKind = 'face' | 'finger' | 'card';
export const ENROLL_BACKUP: Record<EnrollKind, number> = { face: 50, finger: 0, card: 11 };

export function guessFacePhotoUrl(host: string, enrollid: string) {
  const id = String(enrollid || '').replace(/\D/g, '').padStart(8, '0');
  return `http://${host}/photos/LF${id}.jpg`;
}

/** Turn relative CardM paths (/photos/LF….jpg) into phone-reachable URLs. */
export function absoluteDevicePhotoUrl(host: string, url?: string) {
  const src = String(url || '').trim();
  if (!src) return '';
  if (src.startsWith('data:') || /^https?:\/\//i.test(src)) return src;
  const path = src.startsWith('/') ? src : `/${src}`;
  return `http://${host}${path}`;
}

export function withPhotoCacheBust(url?: string, token?: string | number) {
  const src = String(url || '').trim();
  if (!src || src.startsWith('data:') || /X-Amz-Signature=/i.test(src)) return src;
  const stamp = String(token || Date.now());
  const stripped = src.replace(/([?&])t=\d+/, '').replace(/[?&]$/, '');
  return stripped.includes('?') ? `${stripped}&t=${stamp}` : `${stripped}?t=${stamp}`;
}

async function jpegDataUrlFromResponse(res: Response): Promise<string> {
  if (!res.ok) return '';
  const buf = await res.arrayBuffer();
  if (!buf.byteLength) return '';
  const bytes = new Uint8Array(buf);
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return '';
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return `data:image/jpeg;base64,${btoa(binary)}`;
}

export async function fetchFacePreviewFromUrl(url: string): Promise<string> {
  const src = String(url || '').trim();
  if (!src) return '';
  if (src.startsWith('data:image/') && src.length > 80) return src;
  try {
    const res = await fetchWithTimeout(withPhotoCacheBust(src), 4000);
    return jpegDataUrlFromResponse(res);
  } catch {
    return '';
  }
}

export async function fetchFacePreview(host: string, enrollid: string): Promise<string> {
  return fetchFacePreviewFromUrl(guessFacePhotoUrl(host, enrollid));
}

function isHikvisionKind() {
  return deviceKind === 'hikvision' || DEVICE_KIND === 'hikvision';
}

/** Hikvision: enroll id → faceURL from the face library. CardM has no listing, so it returns an empty map. */
export async function listDeviceFaceUrls(host: string, password: string): Promise<{ urls: Map<string, string>; error: string }> {
  if (!isHikvisionKind()) return { urls: new Map(), error: '' };
  if (!getHikDevice()) await loginHikvision(host, 'admin', password || devicePassword);
  return listHikFaceUrls();
}

/** One member's face from the terminal as a data:image/jpeg URL, or '' if it has none. */
export async function downloadDeviceFace(host: string, enrollid: string, faceUrl?: string): Promise<string> {
  if (isHikvisionKind()) {
    if (!getHikDevice()) await loginHikvision(host, 'admin', devicePassword);
    const fromList = faceUrl ? await downloadHikFace(faceUrl).catch(() => '') : '';
    if (fromList) return fromList;
    const found = await findHikFaceUrl(enrollid);
    return found ? downloadHikFace(found) : '';
  }
  return fetchFacePreview(host, enrollid);
}

/** Load the face already on the terminal for edit/view screens. */
export async function loadExistingFaceFromDevice(
  host: string,
  enrollid: string,
  storedUrl?: string,
): Promise<{ preview: string; photourl: string; faceRegistered: boolean }> {
  const id = String(enrollid || '').trim();
  if (!host || !id) return { preview: '', photourl: '', faceRegistered: false };
  if (isHikvisionKind()) {
    const stored = String(storedUrl || '');
    if (/X-Amz-Signature=|^data:image\//i.test(stored)) return { preview: stored, photourl: stored, faceRegistered: true };
    const preview = await downloadDeviceFace(host, id).catch(() => '');
    return { preview, photourl: preview, faceRegistered: Boolean(preview) };
  }
  const storedAbs = absoluteDevicePhotoUrl(host, storedUrl);
  let preview = storedAbs ? await fetchFacePreviewFromUrl(storedAbs) : '';
  let photourl = storedAbs || '';
  if (!preview) {
    preview = await fetchFacePreview(host, id);
    if (preview) photourl = guessFacePhotoUrl(host, id);
  }
  let faceRegistered = Boolean(preview);
  try {
    const info = await getDeviceUserInfo(host, id);
    if (Number(info.face) || info.face === true || info.face === '1') faceRegistered = true;
    const fromInfo = absoluteDevicePhotoUrl(host, info.photourl);
    if (!preview && fromInfo) {
      preview = await fetchFacePreviewFromUrl(fromInfo);
      if (preview) photourl = fromInfo;
    }
    if (!preview) {
      preview = await fetchFacePreview(host, id);
      if (preview) photourl = guessFacePhotoUrl(host, id);
    }
  } catch {
    /* machine offline — keep stored/guessed preview if any */
  }
  return { preview, photourl: photourl || storedAbs, faceRegistered: faceRegistered || Boolean(preview) };
}

export async function deleteDeviceUser(host: string, enrollid: string) {
  if (useHikvision()) {
    if (!getHikDevice()) await loginHikvision(host, 'admin', devicePassword);
    await deleteHikUser(enrollid);
    return;
  }
  const json = await deviceApi(host, {
    cmd: 'deleteuser',
    enrollid: Number(enrollid) || enrollid,
    backupnum: 13,
  }, 12000);
  if (json.result === true) return;
  throw new Error(String(json.msg || 'The face machine did not delete this member.'));
}

export async function setDeviceUser(
  host: string,
  row: {
    enrollid: string;
    name: string;
    shiftid?: string;
    card?: string;
    verifymode?: string;
    birthday?: string;
    starttime?: string;
    endtime?: string;
  },
): Promise<boolean> {
  if (useHikvision()) {
    if (!getHikDevice()) await loginHikvision(host, 'admin', devicePassword);
    return setHikUser(row);
  }
  const enrollid = Number(row.enrollid) || row.enrollid;
  const name = String(row.name || '').trim().slice(0, 24);
  const full = await deviceApi(host, {
    cmd: 'setuserinfo',
    enrollid,
    name,
    admin: 0,
    department: '',
    shiftid: Number(row.shiftid ?? 0) || 0,
    pwd: 0,
    card: row.card && row.card !== '0' ? row.card : 0,
    weekzone: 0,
    zoneid: 0,
    group: 0,
    groupid: 0,
    access_times: 0,
    verifymode: Number(row.verifymode ?? 0) || 0,
    birthday: row.birthday ?? '',
    starttime: row.starttime ?? '',
    endtime: row.endtime ?? '',
  }, 15000);
  if (full.result === true) return true;
  const withDates = await deviceApi(host, {
    cmd: 'setuserinfo',
    enrollid,
    name,
    admin: 0,
    starttime: row.starttime ?? '',
    endtime: row.endtime ?? '',
  }, 15000);
  if (withDates.result === true) return true;
  const simple = await deviceApi(host, {
    cmd: 'setuserinfo',
    enrollid,
    name,
    admin: 0,
  }, 15000);
  if (simple.result === true && !row.endtime) return true;
  const created = await deviceApi(host, {
    cmd: 'adduser',
    enrollid,
    name,
    admin: 0,
  }, 15000);
  if (created.result === true && row.endtime) {
    const after = await deviceApi(host, {
      cmd: 'setuserinfo',
      enrollid,
      name,
      admin: 0,
      starttime: row.starttime ?? '',
      endtime: row.endtime,
    }, 15000);
    if (after.result === true) return true;
  }
  if (created.result === true && !row.endtime) return true;
  throw new Error(String(full.msg || withDates.msg || simple.msg || created.msg || 'The face machine rejected this member.'));
}

export async function getDeviceUserInfo(host: string, enrollid: string) {
  if (useHikvision()) {
    if (!getHikDevice()) await loginHikvision(host, 'admin', devicePassword);
    return getHikUserInfo(enrollid);
  }
  const json = await deviceApi(host, { cmd: 'getuserinfo', enrollid: Number(enrollid) || enrollid });
  const raw = json.record;
  const item = (Array.isArray(raw) ? raw[0] : raw && typeof raw === 'object' ? raw : json) as Record<string, unknown>;
  return {
    id: String(item.id ?? item.enrollid ?? enrollid),
    name: String(item.name ?? ''),
    face: item.face ?? item.faceflag,
    fingerprint: item.fingerprint,
    card: item.card,
    photourl: String(item.photourl ?? item.photo ?? ''),
    endtime: String(item.endtime ?? item.validtime ?? item.end ?? ''),
  };
}

export async function setDeviceFacePhoto(
  host: string,
  enrollid: string,
  name: string,
  faceDataUrl: string,
): Promise<void> {
  const dataUrl = String(faceDataUrl || '').trim();
  if (!dataUrl.startsWith('data:image/')) throw new Error('Missing face image to save on the terminal.');
  if (useHikvision()) {
    if (!getHikDevice()) await loginHikvision(host, 'admin', devicePassword);
    await attachHikFace(enrollid, dataUrl, name);
    return;
  }
  const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');
  if (base64.length < 500) throw new Error('Face image is empty or too small.');
  const payload = {
    cmd: 'setuserinfo',
    enrollid: Number(enrollid) || enrollid,
    name: String(name || '').trim().slice(0, 24) || String(enrollid),
    admin: 0,
    backupnum: 50,
    record: base64,
  };
  const json = await deviceApi(host, payload, 30_000);
  if (json.result === true) return;
  throw new Error(String(json.msg || 'The face machine rejected the new face photo.'));
}

export async function clearDeviceFace(host: string, enrollid: string): Promise<void> {
  if (useHikvision()) {
    if (!getHikDevice()) await loginHikvision(host, 'admin', devicePassword);
    await deleteHikFace(enrollid);
    return;
  }
  const id = Number(enrollid) || enrollid;
  const wiped = await deviceApi(host, { cmd: 'deleteuserface', enrollid: id }, 12_000).catch(() => null);
  if (wiped?.result !== true) {
    await deviceApi(host, { cmd: 'deleteuser', enrollid: id, backupnum: 50 }, 12_000).catch(() => undefined);
  }
}

export function hasDeviceFace(info: { face?: unknown } | null) {
  const face = info?.face;
  return face === true || Number(face) > 0;
}

/** After saving a member, make sure the captured face is still on the terminal; rewrite it if not. */
export async function ensureDeviceFace(host: string, enrollid: string, name: string, faceDataUrl?: string): Promise<boolean> {
  const dataUrl = String(faceDataUrl || '').trim();
  // Hikvision already stored the face during capture, and attachHikFace deletes before uploading.
  if (useHikvision() || !dataUrl.startsWith('data:image/')) return false;
  const info = await getDeviceUserInfo(host, enrollid).catch(() => null);
  if (hasDeviceFace(info)) return true;
  await setDeviceFacePhoto(host, enrollid, name, dataUrl);
  return true;
}

export async function startDeviceEnroll(
  host: string,
  enrollid: string,
  name: string,
  kind: EnrollKind,
  replace = false,
): Promise<{ ok: boolean; message: string }> {
  if (useHikvision()) {
    if (!getHikDevice()) await loginHikvision(host, 'admin', devicePassword);
    if (kind !== 'face') {
      return { ok: false, message: 'This Hikvision machine supports face enroll from the app. Use face, or enroll finger/card on the device menu.' };
    }
    await ensureHikUser(enrollid, name);
    // Always wipe before capture so retake cannot keep the previous person.
    await deleteHikFace(enrollid).catch(() => undefined);
    return {
      ok: true,
      message: 'Look at the Hikvision camera now. Keep still until capture finishes.',
    };
  }
  const backupnum = ENROLL_BACKUP[kind];
  const existing = await getDeviceUserInfo(host, enrollid).catch(() => null);
  const alreadyHas = Boolean(existing && (
    kind === 'face' ? Number(existing.face || 0) > 0
      : kind === 'card' ? Boolean(existing.card && String(existing.card) !== '0')
        : Number(existing.fingerprint || 0) > 0
  ));
  if (alreadyHas && !replace) {
    return {
      ok: false,
      message: `Device ID ${enrollid} already has a ${kind === 'face' ? 'face' : kind === 'finger' ? 'fingerprint' : 'card'} (${existing?.name || 'existing user'}). Use a new ID, or edit that member.`,
    };
  }
  if (kind === 'face' && (alreadyHas || (replace && !existing))) {
    await clearDeviceFace(host, enrollid).catch(() => undefined);
  } else if (alreadyHas && replace) {
    try {
      await deviceApi(host, { cmd: 'deleteuser', enrollid: Number(enrollid) || enrollid, backupnum });
    } catch {
      /* adduser may still overwrite */
    }
  }
  await deviceApi(host, {
    cmd: 'setuserinfo',
    enrollid: Number(enrollid) || enrollid,
    name: name || existing?.name || '',
    admin: 0,
  }).catch(() => undefined);

  const payload = {
    cmd: 'adduser',
    flag: 2,
    backupnum,
    enrollid: Number(enrollid) || enrollid,
    ...(name || existing?.name ? { name: name || existing?.name } : {}),
  };
  let json = await deviceApi(host, payload, 12000);
  if (json.result === false && Number(json.reason) === 3) {
    await deviceApi(host, { cmd: 'adduser', cancel: true }).catch(() => undefined);
    json = await deviceApi(host, payload, 12000);
  }
  if (json.result === true) {
    return {
      ok: true,
      message: kind === 'face'
        ? 'Look at the terminal camera now.'
        : kind === 'finger'
          ? 'Place a finger on the terminal sensor.'
          : 'Tap the card on the terminal.',
    };
  }
  return {
    ok: false,
    message: String(json.msg || `Terminal rejected ${kind} enroll. Leave the device on the home screen and try again.`),
  };
}

export async function waitDeviceEnroll(
  host: string,
  enrollid: string,
  kind: EnrollKind,
  onProgress?: (p: { status: string; image?: string }) => void,
  timeoutMs = 90_000,
  memberName?: string,
): Promise<{ photourl: string; preview?: string } | null> {
  if (useHikvision()) {
    onProgress?.({ status: 'Look at the Hikvision camera now…' });
    // One capture only (with employeeNo). Double-capture made retake feel stuck.
    const capture = await startHikFaceCapture(enrollid);
    if (!capture.ok) {
      onProgress?.({ status: capture.message });
      return null;
    }
    if (capture.faceData) {
      onProgress?.({ status: 'Saving new face to Hikvision…', image: capture.faceData });
      await attachHikFace(enrollid, capture.faceData, memberName);
      return { photourl: '', preview: capture.faceData };
    }
    onProgress?.({ status: 'Face saved on Hikvision.' });
    return { photourl: '', preview: '' };
  }
  const started = Date.now();
  let preview = '';
  while (Date.now() - started < timeoutMs) {
    const tickAt = Date.now();
    let status = Number.NaN;
    let msg = '';
    try {
      const row = await deviceApi(host, { cmd: 'checkregstatus' }, 2500);
      status = Number(row.status);
      msg = String(row.msg ?? '');
      const image = row.image || '';
      if (image) preview = image.startsWith('data:') ? image : `data:image/jpeg;base64,${image}`;
    } catch {
      /* keep polling */
    }
    const waitText = kind === 'finger'
      ? (msg && !/device is working/i.test(msg) ? msg : 'Place a finger on the terminal sensor.')
      : kind === 'card'
        ? (msg && !/device is working/i.test(msg) ? msg : 'Tap the card on the terminal.')
        : (!msg || /device is working/i.test(msg) ? 'Look at the terminal camera now.' : msg);
    onProgress?.({ status: waitText, image: preview || undefined });
    const done = status === 100 || /success|captured|enroll ok|register ok/i.test(msg);
    if (Number.isFinite(status) && (status < 0 || status > 100) && !done) return null;
    if (done) {
      if (kind === 'face') {
        // The terminal built its template from its own camera. Overwriting it with the small
        // checkregstatus preview makes it answer "Stranger", so only write the photo if no face stuck.
        await new Promise((resolve) => setTimeout(resolve, 800));
        let info = await getDeviceUserInfo(host, enrollid).catch(() => null);
        if (!hasDeviceFace(info)) {
          // Unless the terminal confirms it kept a face, write the captured photo (old firmware
          // only stores the face this way).
          if (!preview.startsWith('data:image/')) throw new Error('The terminal finished but did not keep the face. Retake and keep still until it beeps.');
          onProgress?.({ status: 'Saving face on the terminal…', image: preview });
          await setDeviceFacePhoto(host, enrollid, memberName || `Member ${enrollid}`, preview);
          info = await getDeviceUserInfo(host, enrollid).catch(() => null);
          if (info && info.face != null && !hasDeviceFace(info)) {
            throw new Error('The terminal did not keep the face. Stand closer in good light and retake.');
          }
        }
      }
      return { photourl: kind === 'face' ? guessFacePhotoUrl(host, enrollid) : '', preview };
    }
    const waitMs = Math.max(0, 400 - (Date.now() - tickAt));
    if (waitMs) await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
  if (kind === 'face' && preview.startsWith('data:image/')) {
    await setDeviceFacePhoto(host, enrollid, memberName || `Member ${enrollid}`, preview).catch(() => undefined);
    return { photourl: guessFacePhotoUrl(host, enrollid), preview };
  }
  return preview ? { photourl: '', preview } : null;
}

let lastDeviceUserIds: string[] = [];

export function peekDeviceUserIds() {
  return lastDeviceUserIds;
}

export async function fetchDeviceUsers(host: string, password: string): Promise<DeviceUser[]> {
  if (useHikvision()) {
    if (!getHikDevice()) {
      await loginHikvision(host, 'admin', password || devicePassword);
    }
    const rows = await fetchHikUsers();
    lastDeviceUserIds = rows.map((row) => row.id).filter(Boolean);
    return rows;
  }
  const seen = new Set<string>();
  const rows: DeviceUser[] = [];
  let stn = 0;
  let reportedCount = 0;
  // ~8–10 per page → 900 members needs 100+ pages (old cap of 40 truncated the list and looked "busy").
  for (let i = 0; i < 300; i += 1) {
    let json: DeviceJson;
    try {
      json = await deviceApi(host, { password, cmd: 'getuserlist', stn }, 20_000);
    } catch (err) {
      if (rows.length) break;
      throw err;
    }
    const raw = json.record;
    const batch = (Array.isArray(raw) ? raw : raw ? [raw] : []) as Array<Record<string, unknown>>;
    let added = 0;
    for (const item of batch) {
      const id = String(item.id ?? item.enrollid ?? item.userid ?? '');
      if (!id || seen.has(id)) continue;
      seen.add(id);
      rows.push({
        id,
        name: String(item.name ?? `User ${id}`),
        card: item.card != null ? String(item.card) : '',
        face: item.face != null ? String(item.face) : '',
        starttime: String(item.starttime ?? item.start ?? ''),
        endtime: String(item.endtime ?? item.validtime ?? item.end ?? ''),
        photourl: String(item.photourl ?? item.photo ?? ''),
      });
      added += 1;
    }
    if (i === 0 && rows.length === 0 && stn === 0) {
      stn = 1;
      continue;
    }
    reportedCount = Number(json.count ?? reportedCount) || reportedCount;
    const to = Number(json.to ?? 0);
    if (reportedCount > 0 && (rows.length >= reportedCount || to + 1 >= reportedCount)) break;
    const morePages = json.to !== undefined && reportedCount > 0 && to + 1 < reportedCount;
    const fullPage = added > 0 && batch.length >= 8;
    if (!morePages && !fullPage) break;
    const next = to > 0 || json.to !== undefined ? to + 1 : stn + Math.max(batch.length, 1);
    if (next <= stn) break;
    stn = next;
    if (i > 0 && i % 10 === 0) await wait(150);
  }
  lastDeviceUserIds = rows.map((row) => row.id).filter(Boolean);
  return rows;
}

export type DeviceLog = {
  enrollid: string;
  name: string;
  time: string;
  mode?: string;
  inout?: string;
  event?: string;
  note?: string;
};

function readLog(item: Record<string, unknown>): DeviceLog {
  return {
    enrollid: String(item.enrollid ?? item.id ?? ''),
    name: String(item.name ?? ''),
    time: String(item.time ?? ''),
    mode: item.mode != null ? String(item.mode) : undefined,
    inout: item.inout != null ? String(item.inout) : undefined,
    event: item.event != null ? String(item.event) : undefined,
    note: item.note != null ? String(item.note) : undefined,
  };
}

export async function fetchDeviceLogs(host: string, password: string): Promise<DeviceLog[]> {
  if (useHikvision()) {
    if (!getHikDevice()) await loginHikvision(host, 'admin', password || devicePassword);
    return fetchHikLogs();
  }
  const rows: DeviceLog[] = [];
  let cursor = 0;
  for (let i = 0; i < 20; i += 1) {
    const json = await deviceApi(host, { password, cmd: 'getlog', index: cursor }, 10000);
    const raw = json.record;
    const batch = (Array.isArray(raw) ? raw : raw ? [raw] : []) as Array<Record<string, unknown>>;
    for (const item of batch) rows.push(readLog(item));
    const count = Number(json.count ?? 0);
    const to = Number(json.to ?? 0);
    if (!(count > to)) break;
    cursor = to + 1;
  }
  try {
    const live = await deviceApi(host, { password, cmd: 'getrtlog', index: 0 }, 6000);
    const raw = live.record;
    const batch = (Array.isArray(raw) ? raw : raw ? [raw] : []) as Array<Record<string, unknown>>;
    for (const item of batch) rows.push(readLog(item));
  } catch {
    /* optional live logs */
  }
  return rows;
}

export async function fetchLiveDeviceLogs(host: string, password: string): Promise<DeviceLog[]> {
  if (useHikvision()) {
    if (!getHikDevice()) await loginHikvision(host, 'admin', password || devicePassword);
    return fetchHikLogs({ days: 1, limit: 100 });
  }
  const json = await deviceApi(host, { password, cmd: 'getrtlog', index: 0 }, 6000);
  const raw = json.record;
  const batch = (Array.isArray(raw) ? raw : raw ? [raw] : []) as Array<Record<string, unknown>>;
  return batch.map(readLog).filter((row) => row.time || row.enrollid);
}

export async function ringDeviceBell(creds: { host: string; username: string; password: string }): Promise<string> {
  const probe = await probeHost(creds.host);
  if (!probe.ok) throw new Error(probe.message || 'Connect the face machine first.');
  await loginDevice(creds.host, creds.username, creds.password);
  if (useHikvision()) {
    return openHikDoor();
  }
  const attempts: Record<string, unknown>[] = [
    { cmd: 'enablebell' },
    { cmd: 'testbell' },
    { cmd: 'bell' },
    { cmd: 'playsound' },
    { cmd: 'opendoor' },
  ];
  for (const body of attempts) {
    try {
      const json = await deviceApi(creds.host, body, 8000);
      if (json.result === true) return 'Bell sent to the face machine.';
    } catch {
      /* try the next command this firmware understands */
    }
  }
  throw new Error('The face machine is connected but did not ring. Try again from the home screen.');
}

export async function connectAndLoadUsers(
  host: string,
  username: string,
  password: string,
  onProgress?: (text: string) => void,
): Promise<{ probe: ProbeResult; users: DeviceUser[] }> {
  const typed = String(host || lastLiveHost || '').trim();
  let ip = typed;
  if (ip) {
    onProgress?.(`Signing in at ${ip}…`);
    try {
      await loginDevice(ip, username, password);
      ip = getHikDevice()?.host || hostIp(ip) || ip;
    } catch {
      onProgress?.('Looking for the face machine…');
      const scanned = await scanForTerminal(onProgress, hostIp(ip) || ip);
      if (!scanned.ok) return { probe: scanned, users: [] };
      ip = scanned.host;
      onProgress?.(`Signing in at ${ip}…`);
      await loginDevice(ip, username, password);
      ip = getHikDevice()?.host || ip;
    }
  } else {
    onProgress?.('Looking for the face machine…');
    const scanned = await scanForTerminal(onProgress);
    if (!scanned.ok) return { probe: scanned, users: [] };
    ip = scanned.host;
    onProgress?.(`Signing in at ${ip}…`);
    await loginDevice(ip, username, password);
    ip = getHikDevice()?.host || ip;
  }
  rememberLiveHost(ip);
  const label = useHikvision() ? 'Hikvision' : 'CardM face machine';
  return {
    probe: { host: ip, ok: true, label, message: `Connected at ${ip}` },
    users: [],
  };
}
