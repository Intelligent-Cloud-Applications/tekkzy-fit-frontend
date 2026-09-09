import { apiRequest, deviceRequest, fetchDeviceAsset, friendlyDeviceMessage, LAPTOP_BRIDGE_HINT, tryApi, wakeGymPcHelper } from '@/services/api';
import { localStore, setMeta } from '@/providers/database/LocalDatabase';
import { ingestDeviceScan } from '@/services/access';
import { deviceLogStamp, enrollKey } from '@/lib/format';
import { ensureHiddenAttendance, filterHiddenLogs, isHiddenLiveLog } from '@/services/attendanceHide';
import { getInstitution } from '@/config/site';
import { forgetDeletedMember, isDeletedMember } from '@/services/deletedMembers';
import type { Member } from '@shared/types';

export interface LiveDeviceConfig {
  host: string;
  username: string;
  passwordSet: boolean;
  laptopIps: string[];
  hostOnThisWifi: boolean;
  deviceOnline?: boolean;
  scanning?: boolean;
  offline?: boolean;
  laptopServer?: boolean;
  laptopServerMessage?: string;
}

export interface LiveUser {
  id: string;
  name: string;
  department?: string;
  shift?: string | number;
  admin?: string | number;
  fingerprint?: string | number;
  palm?: string | number;
  face?: string | number;
  password?: string | number;
  card?: string | number;
  weekzone?: string | number;
  group?: string | number;
  access_times?: string | number;
  verifymode?: string | number;
  birthday?: string;
  starttime?: string;
  endtime?: string;
  photourl?: string;
}

export interface LiveUserInput {
  enrollid: string;
  name: string;
  admin?: string | number;
  department?: string;
  shiftid?: string | number;
  pwd?: string | number;
  card?: string | number;
  weekzone?: string | number;
  group?: string | number;
  access_times?: string | number;
  verifymode?: string | number;
  birthday?: string;
  starttime?: string;
  endtime?: string;
}

export interface LiveLog {
  enrollid: string | number;
  name?: string;
  time?: string;
  mode?: string | number;
  inout?: string | number;
  event?: string | number;
  note?: string;
  photourl?: string;
}

const cloudDevice = {
  host: '',
  username: '',
  passwordSet: false,
  laptopIps: [] as string[],
  hostOnThisWifi: false,
};

export async function getLiveConfig(): Promise<LiveDeviceConfig> {
  try {
    const cfg = await deviceRequest<LiveDeviceConfig>('/devices/live/config');
    const online = cfg.laptopServer !== false && !cfg.offline;
    return {
      ...cfg,
      laptopServer: online,
      laptopServerMessage: online ? undefined : (cfg.laptopServerMessage || LAPTOP_BRIDGE_HINT),
      hostOnThisWifi: Boolean(online && cfg.hostOnThisWifi),
      deviceOnline: Boolean(online && cfg.deviceOnline),
    };
  } catch (err) {
    return {
      ...cloudDevice,
      hostOnThisWifi: false,
      deviceOnline: false,
      laptopServer: false,
      laptopServerMessage: err instanceof Error ? err.message : LAPTOP_BRIDGE_HINT,
    };
  }
}

export function isFaceMachineLinked(cfg: Pick<LiveDeviceConfig, 'laptopServer' | 'deviceOnline'>) {
  return Boolean(cfg.laptopServer && cfg.deviceOnline);
}

export async function saveLiveConfig(input: { host: string; username: string; password?: string }): Promise<LiveDeviceConfig> {
  return deviceRequest<LiveDeviceConfig>('/devices/live/config', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function discoverLiveDevice(opts?: { full?: boolean }) {
  const q = opts?.full ? '?full=1' : '';
  return deviceRequest<{
    lan: string[];
    found: { host: string; label: string }[];
    applied: string | null;
  }>(`/devices/live/discover${q}`);
}

export async function pingLiveDevice(): Promise<boolean> {
  try {
    const res = await deviceRequest<{ ok?: boolean; deviceOnline?: boolean }>('/devices/live/ping');
    if (res.ok || res.deviceOnline) return true;
  } catch {
    /* older gym helper has no ping route */
  }
  try {
    const login = await testLiveDevice();
    return Boolean(login.ok);
  } catch {
    return false;
  }
}

export async function testLiveDevice() {
  const login = await deviceRequest<{ ok: boolean; message: string; sn?: string }>('/devices/live/test', { method: 'POST' });
  if (login.ok) markDeviceSeen();
  return login;
}

let autoLinkInFlight: Promise<LiveDeviceConfig & { ok?: boolean; message?: string }> | null = null;
let autoLinkCache: (LiveDeviceConfig & { ok?: boolean; message?: string }) | null = null;
let autoLinkAt = 0;

export function clearDeviceLinkCache() {
  autoLinkCache = null;
  autoLinkAt = 0;
}

export async function reconnectDevice() {
  clearDeviceLinkCache();
  return ensureAutoDeviceLink({ scan: true });
}

export async function ensureAutoDeviceLink(opts?: { scan?: boolean }): Promise<LiveDeviceConfig & { ok?: boolean; message?: string }> {
  if (autoLinkCache && Date.now() - autoLinkAt < 5_000) return autoLinkCache;
  if (autoLinkInFlight) return autoLinkInFlight;
  autoLinkInFlight = (async () => {
    wakeGymPcHelper();
    const cfg = await getLiveConfig();
    if (!cfg.laptopServer) {
      autoLinkCache = { ...cfg, ok: false, message: cfg.laptopServerMessage || LAPTOP_BRIDGE_HINT };
      autoLinkAt = Date.now();
      return autoLinkCache;
    }
    if (!cfg.host || !cfg.hostOnThisWifi || opts?.scan) {
      const found = await discoverLiveDevice({ full: true }).catch(() => null);
      if (found?.applied) {
        const next = await getLiveConfig();
        autoLinkCache = {
          ...next,
          ok: Boolean(next.passwordSet && next.deviceOnline && next.hostOnThisWifi),
          message: next.deviceOnline
            ? 'The face machine is connected.'
            : 'Turn the face machine on and wait for its home screen.',
        };
        autoLinkAt = Date.now();
        return autoLinkCache;
      }
    }
    if (!cfg.host) {
      autoLinkCache = { ...cfg, ok: false, message: 'No face machine on this Wi‑Fi yet. Put it on the same Wi‑Fi as the gym laptop, then tap Find the terminal.' };
      autoLinkAt = Date.now();
      return autoLinkCache;
    }
    autoLinkCache = {
      ...cfg,
      ok: Boolean(cfg.hostOnThisWifi && cfg.passwordSet && cfg.deviceOnline),
      message: !cfg.deviceOnline
        ? 'Turn the face machine on and wait for its home screen. Then tap Find the terminal.'
        : cfg.hostOnThisWifi
          ? 'The face machine is connected.'
          : 'Put the face machine on the same Wi‑Fi as the gym laptop, then tap Find the terminal.',
    };
    autoLinkAt = Date.now();
    return autoLinkCache;
  })().finally(() => {
    autoLinkInFlight = null;
  });
  return autoLinkInFlight;
}

export async function liveUnlock() {
  return deviceRequest<{ ok: boolean; message: string }>('/devices/live/unlock', { method: 'POST' });
}

let cachedLiveUsers: LiveUser[] = [];
let liveUsersAt = 0;
let lastDeviceSeenAt = 0;

export function markDeviceSeen() {
  lastDeviceSeenAt = Date.now();
}

export function deviceSeenRecently(ms = 15_000) {
  return lastDeviceSeenAt > 0 && Date.now() - lastDeviceSeenAt < ms;
}
let syncPaused = 0;
let syncBusy = false;
const idleWaiters: Array<() => void> = [];

export function pauseLiveDeviceSync() {
  syncPaused += 1;
}

export function resumeLiveDeviceSync() {
  syncPaused = Math.max(0, syncPaused - 1);
}

export function isLiveSyncPaused() {
  return syncPaused > 0;
}

function setSyncBusy(next: boolean) {
  syncBusy = next;
  if (next) return;
  while (idleWaiters.length) idleWaiters.shift()?.();
}

export function waitForLiveDeviceIdle(timeoutMs = 4_000): Promise<void> {
  if (!syncBusy) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = window.setTimeout(resolve, timeoutMs);
    idleWaiters.push(() => {
      window.clearTimeout(timer);
      resolve();
    });
  });
}

export async function withTerminalPaused<T>(fn: () => Promise<T>): Promise<T> {
  pauseLiveDeviceSync();
  try {
    await waitForLiveDeviceIdle(4_000);
    return await fn();
  } finally {
    resumeLiveDeviceSync();
  }
}

function canRetryDevice(message: string) {
  return /busy|offline|same network|no terminal|did not respond|timeout|gym computer|try again/i.test(message);
}

async function retryDeviceWrite<T>(fn: () => Promise<T>, times = 2): Promise<T> {
  let last: unknown;
  for (let attempt = 0; attempt < times; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      const message = err instanceof Error ? err.message : '';
      if (!canRetryDevice(message) || attempt === times - 1) throw err;
      await new Promise((resolve) => window.setTimeout(resolve, 700));
    }
  }
  throw last;
}

export function peekLiveUsers(): LiveUser[] {
  return cachedLiveUsers;
}

export async function fetchLiveUsers() {
  let res: { users: LiveUser[]; offline?: boolean; error?: string };
  try {
    res = await deviceRequest<{ users: LiveUser[]; offline?: boolean; error?: string }>('/devices/live/users');
  } catch (err) {
    return { users: [] as LiveUser[], offline: true, error: err instanceof Error ? err.message : LAPTOP_BRIDGE_HINT };
  }
  if (!res.offline && Array.isArray(res.users)) {
    cachedLiveUsers = res.users;
    liveUsersAt = Date.now();
    markDeviceSeen();
  }
  return res;
}

export async function ensureLiveUsers(): Promise<LiveUser[]> {
  if (cachedLiveUsers.length && Date.now() - liveUsersAt < 20_000) return cachedLiveUsers;
  try {
    const res = await fetchLiveUsers();
    return res.offline ? cachedLiveUsers : res.users;
  } catch {
    return cachedLiveUsers;
  }
}

export async function membersFromDeviceAndStore(): Promise<Member[]> {
  const existing = await localStore.allMembers();
  const users = await ensureLiveUsers();
  const have = new Set(existing.map((m) => memberEnroll(m)).filter(Boolean));
  for (const row of users) {
    const key = enrollKey(String(row.id ?? ''));
    if (!key || have.has(key)) continue;
    if (existing.length && await isDeletedMember(undefined, key)) continue;
    const member = memberFromLiveUser(row);
    await localStore.putMember(member);
    existing.push(member);
    have.add(key);
  }
  return existing;
}

export function memberFromLiveUser(row: LiveUser): Member {
  const enroll = String(row.id ?? '');
  const parts = (row.name || `Device User ${enroll}`).trim().split(/\s+/);
  return {
    id: `dev-${enroll}`,
    memberCode: `DEV-${enroll}`,
    firstName: parts[0] ?? 'Member',
    lastName: parts.slice(1).join(' ') || enroll,
    name: row.name || `Device User ${enroll}`,
    phone: '',
    email: `device.${enroll}@ironworks.fit`,
    gender: 'Other',
    dateOfBirth: row.birthday || '1990-01-01',
    address: 'Imported from terminal',
    city: 'Bengaluru',
    emergencyContactName: '—',
    emergencyContactPhone: '',
    joinDate: new Date().toISOString().slice(0, 10),
    status: 'ACTIVE',
    faceRegistered: Boolean(Number(row.face)),
    faceDeviceId: 'dev-entry-01',
    deviceEnrollId: enroll,
    department: row.department ?? '',
    deviceShift: String(row.shift ?? '1'),
    devicePrivilege: String(row.admin ?? '0'),
    deviceCard: String(row.card ?? '0'),
    deviceFingerprint: Number(row.fingerprint) > 0 ? '1' : '',
    devicePwd: String(row.password ?? ''),
    deviceWeekzone: String(row.weekzone ?? '0'),
    deviceGroup: String(row.group ?? '0'),
    deviceAccessTimes: String(row.access_times ?? '0'),
    deviceVerifyMode: String(row.verifymode ?? '0'),
    deviceStart: row.starttime ?? '',
    deviceEnd: row.endtime ?? '',
    devicePhotoUrl: row.photourl || '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

let cachedLiveLogs: LiveLog[] = [];
let liveLogsAt = 0;

export function peekLiveLogs(): LiveLog[] {
  return cachedLiveLogs;
}

export async function fetchLiveLogs() {
  let res: { logs: LiveLog[]; offline?: boolean; error?: string };
  try {
    res = await deviceRequest<{ logs: LiveLog[]; offline?: boolean; error?: string }>('/devices/live/logs');
  } catch (err) {
    return { logs: [] as LiveLog[], offline: true, error: err instanceof Error ? err.message : LAPTOP_BRIDGE_HINT };
  }
  if (!res.offline && Array.isArray(res.logs)) {
    await ensureHiddenAttendance();
    cachedLiveLogs = filterHiddenLogs(res.logs);
    liveLogsAt = Date.now();
    return { ...res, logs: cachedLiveLogs };
  }
  return res;
}

export function dropLiveLogsMatching(row: { memberId?: string; memberCode?: string; timestamp?: string }) {
  const enroll = enrollKey(row.memberCode || row.memberId);
  cachedLiveLogs = cachedLiveLogs.filter((log) => {
    if (enrollKey(String(log.enrollid)) !== enroll) return true;
    const stamp = deviceLogStamp(log.time);
    return stamp !== row.timestamp && (log.time || '') !== row.timestamp;
  });
}

export async function ensureLiveLogs(): Promise<LiveLog[]> {
  if (cachedLiveLogs.length && Date.now() - liveLogsAt < 20_000) return cachedLiveLogs;
  try {
    const res = await fetchLiveLogs();
    return res.offline ? cachedLiveLogs : res.logs;
  } catch {
    return cachedLiveLogs;
  }
}

export async function fetchRtLogs() {
  try {
    const res = await deviceRequest<{ logs: LiveLog[]; offline?: boolean; error?: string }>('/devices/live/rtlog');
    if (!res.offline) markDeviceSeen();
    return res;
  } catch (err) {
    return { logs: [] as LiveLog[], offline: true, error: err instanceof Error ? err.message : LAPTOP_BRIDGE_HINT };
  }
}

export async function pushLiveUser(input: LiveUserInput | string, name?: string) {
  const body = typeof input === 'string' ? { enrollid: input, name: name ?? '' } : input;
  const res = await retryDeviceWrite(() => deviceRequest<{ ok: boolean }>('/devices/live/users', {
    method: 'POST',
    body: JSON.stringify(body),
  }));
  if (res.ok && body.enrollid) {
    const id = String(body.enrollid);
    const next: LiveUser = {
      id,
      name: body.name,
      department: body.department != null ? String(body.department) : undefined,
      shift: body.shiftid,
      admin: body.admin,
      card: body.card,
      weekzone: body.weekzone,
      group: body.group,
      access_times: body.access_times,
      verifymode: body.verifymode,
      birthday: body.birthday,
      starttime: body.starttime,
      endtime: body.endtime,
    };
    const idx = cachedLiveUsers.findIndex((row) => enrollKey(String(row.id ?? '')) === enrollKey(id));
    cachedLiveUsers = idx >= 0
      ? cachedLiveUsers.map((row, i) => (i === idx ? { ...row, ...next } : row))
      : [...cachedLiveUsers, next];
    liveUsersAt = Date.now();
  }
  return res;
}

export function forgetLiveUser(enrollid: string) {
  const key = enrollKey(enrollid);
  if (!key) return;
  cachedLiveUsers = cachedLiveUsers.filter((row) => enrollKey(String(row.id ?? '')) !== key);
}

export async function deleteLiveUser(enrollid: string) {
  forgetLiveUser(enrollid);
  const res = await retryDeviceWrite(() => deviceRequest<{ ok: boolean; error?: string }>(
    `/devices/live/users/${encodeURIComponent(enrollid)}`,
    { method: 'DELETE' },
  ));
  if (!res.ok) throw new Error(friendlyDeviceMessage(res.error || 'Terminal did not delete this user.'));
  return res;
}

function canRetryEnroll(message: string) {
  return /busy|offline|same network|no terminal|did not respond|timeout|gym computer|try again/i.test(message);
}

export async function startLiveFaceEnroll(
  enrollid: string,
  name: string,
  backupnum = 50,
  replace = false,
) {
  pauseLiveDeviceSync();
  try {
    await waitForLiveDeviceIdle(800);
    let last = { ok: false, message: 'Terminal is busy. Try again.' };
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const alreadyOnDevice = peekLiveUsers().some((row) => enrollKey(String(row.id ?? '')) === enrollKey(enrollid));
        const r = await deviceRequest<{ ok: boolean; message: string }>('/devices/live/enroll-face', {
          method: 'POST',
          body: JSON.stringify({ enrollid, name, backupnum, replace, skipSetUser: alreadyOnDevice }),
        });
        const message = friendlyDeviceMessage(r.message || '');
        if (r.ok) return { ...r, message };
        last = { ...r, message };
        if (!canRetryEnroll(message)) return last;
      } catch (err) {
        last = { ok: false, message: friendlyDeviceMessage(err instanceof Error ? err.message : 'Terminal is busy. Try again.') };
        if (!canRetryEnroll(last.message)) throw err;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 600));
    }
    return last;
  } finally {
    resumeLiveDeviceSync();
  }
}

export async function fetchRegStatus() {
  return deviceRequest<{ result?: boolean; status?: number; msg?: string; image?: string }>(
    '/devices/live/reg-status',
    { method: 'POST' },
  );
}

function enrollStatusText(msg?: string) {
  const raw = (msg || '').trim();
  if (!raw || /device is working/i.test(raw) || /^working$/i.test(raw)) {
    return 'Look at the terminal camera now.';
  }
  return raw;
}

export async function waitForDeviceEnroll(
  enrollid: string,
  onProgress?: (p: { status: string; image?: string }) => void,
  timeoutMs = 90_000,
  kind: 'face' | 'finger' | 'card' = 'face',
): Promise<{ photourl: string; face?: string | number; preview?: string } | null> {
  pauseLiveDeviceSync();
  const started = Date.now();
  let preview = '';
  try {
    while (Date.now() - started < timeoutMs) {
      const tickAt = Date.now();
      let status = Number.NaN;
      let msg = '';
      let image = '';
      try {
        const row = await fetchRegStatus();
        status = Number(row.status);
        msg = String(row.msg ?? '');
        image = row.image || '';
      } catch {
        /* photo fallback below */
      }
      const nextPreview = image
        ? (image.startsWith('data:') ? image : `data:image/jpeg;base64,${image}`)
        : '';
      if (nextPreview) preview = nextPreview;
      onProgress?.({
        status: kind === 'finger'
          ? (msg && !/device is working/i.test(msg) ? msg : 'Place a finger on the terminal sensor.')
          : enrollStatusText(msg),
        image: preview || undefined,
      });

      const done = status === 100 || /success|captured|enroll ok|register ok/i.test(msg);
      if (Number.isFinite(status) && (status < 0 || status > 100) && !done) {
        return null;
      }
      if (done) {
        if (kind === 'face') {
          return {
            photourl: guessFacePhotoPath(enrollid),
            face: 1,
            preview,
          };
        }
        return { photourl: '', preview };
      }
      const wait = Math.max(0, 400 - (Date.now() - tickAt));
      if (wait) await new Promise((resolve) => window.setTimeout(resolve, wait));
    }
    if (kind === 'face') {
      const photo = await waitForFacePhoto(enrollid, undefined, 2_500);
      if (photo) return { ...photo, preview };
    }
    return preview ? { photourl: kind === 'face' ? guessFacePhotoPath(enrollid) : '', preview } : null;
  } finally {
    resumeLiveDeviceSync();
  }
}

export async function fetchLiveUserInfo(enrollid: string) {
  return deviceRequest<{ user: LiveUser | null }>(`/devices/live/users/${encodeURIComponent(enrollid)}`);
}

export function guessFacePhotoPath(enrollid: string, photourl?: string) {
  if (photourl) return photourl.startsWith('/') ? photourl : `/${photourl}`;
  const id = enrollid.replace(/\D/g, '').padStart(8, '0');
  return `/photos/LF${id}.jpg`;
}

function dataUrlFromBase64(raw: string, contentType = 'image/jpeg') {
  const value = String(raw || '').trim();
  if (!value) return '';
  if (value.startsWith('data:image/') && value.length > 80) return value;
  if (value.length < 80) return '';
  return `data:${contentType};base64,${value}`;
}

function photoSrcFromJson(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const row = data as { image?: string; base64?: string; contentType?: string; offline?: boolean; __photo?: boolean };
  if (row.offline) return null;
  const fromImage = dataUrlFromBase64(row.image || '', row.contentType || 'image/jpeg');
  if (fromImage) return fromImage;
  return dataUrlFromBase64(row.base64 || '', row.contentType || 'image/jpeg') || null;
}

function jpegObjectUrl(buf: ArrayBuffer): string | null {
  if (buf.byteLength < 80) return null;
  const u8 = new Uint8Array(buf);
  if (u8[0] !== 0xFF || u8[1] !== 0xD8) return null;
  return URL.createObjectURL(new Blob([buf], { type: 'image/jpeg' }));
}

async function readPhotoSrc(res: Response): Promise<string | null> {
  if (!res.ok) return null;
  const type = (res.headers.get('content-type') || '').toLowerCase();
  if (type.includes('json')) {
    return photoSrcFromJson(await res.json().catch(() => null));
  }
  const buf = await res.arrayBuffer();
  const jpeg = jpegObjectUrl(buf);
  if (jpeg) return jpeg;
  try {
    return photoSrcFromJson(JSON.parse(new TextDecoder().decode(buf)));
  } catch {
    return null;
  }
}

function photoSrcByteLength(src: string | null): number {
  if (!src) return 0;
  const b64 = src.includes(',') ? src.slice(src.indexOf(',') + 1) : src;
  return Math.floor((b64.length * 3) / 4);
}

async function photoBytes(photourl: string): Promise<number> {
  const res = await fetchDeviceAsset(`/devices/live/photo?path=${encodeURIComponent(photourl)}&t=${Date.now()}`);
  if (!res.ok) return 0;
  const type = (res.headers.get('content-type') || '').toLowerCase();
  if (type.includes('json')) {
    return photoSrcByteLength(photoSrcFromJson(await res.json().catch(() => null)));
  }
  const buf = await res.arrayBuffer();
  if (buf.byteLength >= 80) {
    const u8 = new Uint8Array(buf);
    if (u8[0] === 0xFF && u8[1] === 0xD8) return buf.byteLength;
  }
  try {
    return photoSrcByteLength(photoSrcFromJson(JSON.parse(new TextDecoder().decode(buf))));
  } catch {
    return 0;
  }
}

export async function fetchLivePhotoObjectUrl(photourl: string): Promise<string | null> {
  const res = await fetchDeviceAsset(`/devices/live/photo?path=${encodeURIComponent(photourl)}&t=${Date.now()}`);
  return readPhotoSrc(res);
}

export async function waitForFacePhoto(
  enrollid: string,
  previousPath?: string,
  timeoutMs = 90_000,
): Promise<{ photourl: string; face?: string | number } | null> {
  const guessed = guessFacePhotoPath(enrollid, previousPath);
  const before = await photoBytes(guessed);
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    let photourl = '';
    let face: string | number | undefined;
    try {
      const info = await fetchLiveUserInfo(enrollid);
      photourl = info.user?.photourl || '';
      face = info.user?.face;
    } catch {
      /* list fallback */
    }
    if (!photourl) {
      try {
        const { users } = await fetchLiveUsers();
        const row = users.find((u) => String(u.id) === String(enrollid));
        photourl = row?.photourl || '';
        face = row?.face ?? face;
      } catch {
        /* keep guessing */
      }
    }
    const path = guessFacePhotoPath(enrollid, photourl);
    const size = await photoBytes(path);
    if (size >= 80 && (size !== before || Date.now() - started > 600)) {
      return { photourl: path, face: face ?? 1 };
    }
    await new Promise((resolve) => window.setTimeout(resolve, 1500));
  }
  return null;
}

export async function fetchLiveInfo() {
  return deviceRequest<{
    host: string;
    laptopIps: string[];
    hostOnThisWifi: boolean;
    deviceOnline?: boolean;
    scanning?: boolean;
    login: { ok: boolean; message: string; sn?: string };
    info: Record<string, unknown>;
  }>('/devices/live/info');
}

export async function syncLiveTime() {
  return deviceRequest<Record<string, unknown>>('/devices/live/time', { method: 'POST' });
}

export async function cleanLiveLogs() {
  return deviceRequest<Record<string, unknown>>('/devices/live/clean-logs', { method: 'POST' });
}

export async function liveCommand(body: Record<string, unknown>) {
  return deviceRequest<Record<string, unknown>>('/devices/live/command', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function fetchSchedules() {
  return deviceRequest<DeviceSchedules>('/devices/live/schedules');
}

export async function saveSchedules(data: DeviceSchedules) {
  return deviceRequest<DeviceSchedules>('/devices/live/schedules', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function pushSchedules(kind: 'shift' | 'holiday' | 'bell' | 'question') {
  return deviceRequest<Record<string, unknown>>('/devices/live/schedules/push', {
    method: 'POST',
    body: JSON.stringify({ kind }),
  });
}

export interface DeviceSchedules {
  shifts: {
    no: number;
    name: string;
    sec1: { on: string; off: string; type: string };
    sec2: { on: string; off: string; type: string };
    sec3: { on: string; off: string; type: string };
    cutoff: string;
  }[];
  holidays: { no: number; name: string; start: string; end: string; shift: string; timezone: string }[];
  bells: {
    no: number;
    time: string;
    sun: boolean;
    mon: boolean;
    tue: boolean;
    wed: boolean;
    thu: boolean;
    fri: boolean;
    sat: boolean;
  }[];
  question: {
    single: string;
    title: string;
    voice: string;
    error: string;
    events: { no: number; info: string; required: string }[];
  };
}

function memberEnroll(member: Member): string {
  const direct = enrollKey(member.deviceEnrollId);
  if (direct) return direct;
  return /^DEV-/i.test(member.memberCode || '') ? enrollKey(member.memberCode) : '';
}

function isDemoSeed(member: Member): boolean {
  return /^mem-\d{3}$/.test(member.id);
}

function findCloudTwin(cloudMembers: Member[], _member: Member, key: string): Member | undefined {
  if (!key) return undefined;
  return cloudMembers.find((row) => memberEnroll(row) === key);
}

async function hydrateCloudMembers(): Promise<Member[]> {
  const localOnly = await localStore.allMembers();
  if (localOnly.length) return localOnly;
  const cloud = await tryApi<Member[]>('/members');
  if (!cloud?.length) return [];
  const local = await localStore.allMembers();
  const merged = cloud.map((row) => {
    const prev = local.find((m) =>
      m.id === row.id
      || (memberEnroll(m) && memberEnroll(m) === memberEnroll(row)),
    );
    return {
      ...row,
      deviceEnrollId: prev?.deviceEnrollId || row.deviceEnrollId,
      devicePhotoUrl: prev?.devicePhotoUrl || row.devicePhotoUrl,
      faceRegistered: Boolean(prev?.faceRegistered || row.faceRegistered),
    };
  });
  await Promise.all(merged.map((row) => localStore.putMember(row)));
  return merged;
}

function unwrapMember(remote: unknown): Member | null {
  if (!remote || typeof remote !== 'object') return null;
  const row = remote as { member?: Member };
  if (row.member?.id) return row.member;
  if ('id' in row && typeof (row as Member).id === 'string') return row as Member;
  return null;
}

async function publishDeviceMember(member: Member, method: 'POST' | 'PUT'): Promise<Member> {
  const enroll = memberEnroll(member) || member.deviceEnrollId || '';
  const payload = {
    firstName: member.firstName || member.name.split(/\s+/)[0] || 'Member',
    lastName: member.lastName && !/^\d+$/.test(member.lastName)
      ? member.lastName
      : member.name.split(/\s+/).slice(1).join(' ') || 'Member',
    phone: member.phone?.trim() || `99${enrollKey(enroll).padStart(8, '0').slice(-8)}`,
    email: member.email?.trim() || `terminal.${enrollKey(enroll) || member.id}@tekkzy.fit`,
    gender: member.gender || 'Other',
    dateOfBirth: member.dateOfBirth,
    address: member.address || 'Imported from terminal',
    city: member.city || 'Bengaluru',
    emergencyContactName: member.emergencyContactName || '—',
    emergencyContactPhone: member.emergencyContactPhone || '',
    joinDate: member.joinDate,
    status: member.status || 'ACTIVE',
    faceRegistered: member.faceRegistered,
    deviceEnrollId: member.deviceEnrollId || enroll,
    memberCode: member.memberCode,
    sendPayLink: false,
    skipPayment: true,
    paymentMethod: '',
    id: member.id,
    institution: getInstitution(),
  };
  const path = method === 'PUT' && member.id ? `/members/${member.id}` : '/members';
  let remote: unknown = null;
  try {
    remote = await apiRequest<unknown>(path, { method, body: JSON.stringify(payload) });
  } catch {
    remote = await tryApi<unknown>('/members', { method: 'POST', body: JSON.stringify(payload) });
  }
  const cloud = unwrapMember(remote);
  if (!cloud) return member;
  const merged: Member = {
    ...member,
    ...cloud,
    id: cloud.id || member.id,
    deviceEnrollId: member.deviceEnrollId || cloud.deviceEnrollId,
    faceRegistered: member.faceRegistered || cloud.faceRegistered,
    devicePhotoUrl: member.devicePhotoUrl || cloud.devicePhotoUrl,
  };
  await localStore.putMember(merged);
  if (cloud.id && cloud.id !== member.id) {
    await localStore.deleteMember(member.id);
  }
  return merged;
}

function memberDisplayName(member: Member): string {
  return (member.name || `${member.firstName} ${member.lastName}`).trim();
}

function deviceDay(value?: string | null) {
  const match = String(value || '').match(/(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '';
}

function formatDeviceEnd(day: string, previous?: string) {
  if (!day) return previous || '';
  return /\d{2}:\d{2}/.test(String(previous || '')) ? `${day} 23:59:59` : day;
}

function membershipEndDay(member: Member) {
  const row = member as Member & { membership?: { expiryDate?: string } };
  return deviceDay(row.renewDate || row.membership?.expiryDate || member.deviceEnd);
}

function toLiveInput(member: Member, enrollid: string, previousEnd?: string): LiveUserInput {
  const end = membershipEndDay(member);
  return {
    enrollid,
    name: memberDisplayName(member),
    admin: member.devicePrivilege,
    department: member.department,
    shiftid: member.deviceShift,
    pwd: member.devicePwd,
    card: member.deviceCard,
    weekzone: member.deviceWeekzone,
    group: member.deviceGroup,
    access_times: member.deviceAccessTimes,
    verifymode: member.deviceVerifyMode,
    birthday: member.dateOfBirth,
    starttime: member.deviceStart || member.joinDate || '',
    endtime: formatDeviceEnd(end || member.deviceEnd || '', previousEnd || member.deviceEnd),
  };
}

async function ackDeviceEnd(member: Member, deviceEnd: string) {
  const enroll = memberEnroll(member);
  await tryApi('/devices/bridge/expiry-applied', {
    method: 'POST',
    body: JSON.stringify({
      cognitoId: (member as Member & { cognitoId?: string }).cognitoId || member.id,
      enroll,
      deviceEnd,
    }),
  });
}

export async function exportWebsiteMembers(deviceUsers: LiveUser[]): Promise<number> {
  await hydrateCloudMembers();
  const members = [];
  for (const row of await localStore.allMembers()) {
    if (isDemoSeed(row) || await isDeletedMember(row.id, memberEnroll(row))) continue;
    members.push(row);
  }
  const liveById = new Map(deviceUsers.map((row) => [enrollKey(String(row.id ?? '')), row]));
  let pushed = 0;

  for (const member of members) {
    const enroll = memberEnroll(member);
    if (!enroll) continue;
    const remote = liveById.get(enroll);
    const name = memberDisplayName(member);
    const want = membershipEndDay(member);
    if (remote && (remote.name || '').trim() === name && (!want || want === deviceDay(remote.endtime))) continue;
    try {
      const res = await pushLiveUser(toLiveInput({ ...member, deviceEnrollId: enroll }, enroll, remote?.endtime));
      if (res.ok) {
        pushed += 1;
        liveById.set(enroll, { ...(remote ?? { id: enroll }), id: enroll, name });
      }
    } catch {
      /* terminal busy or offline — next pass */
    }
  }
  return pushed;
}

let missingPushTimer: number | undefined;
let missingPushInFlight = false;
let missingPushAt = 0;

function onDeviceEnrolls(users: LiveUser[]) {
  return new Set(users.map((row) => enrollKey(String(row.id ?? ''))).filter(Boolean));
}

async function websiteMembersForDevicePush(hint?: Member[]): Promise<Member[]> {
  const rows = hint?.length ? hint : [
    ...await localStore.allMembers(),
    ...(await tryApi<Member[]>('/members') ?? []),
  ];
  const seen = new Set<string>();
  const unique: Member[] = [];
  for (const row of rows) {
    if (isDemoSeed(row)) continue;
    const enroll = memberEnroll(row);
    if (!enroll || seen.has(enroll)) continue;
    if (await isDeletedMember(row.id, enroll)) continue;
    seen.add(enroll);
    unique.push(row);
  }
  return unique;
}

/** Add website members that are missing on the terminal. Does not change people already on the device. */
export async function pushMissingWebsiteMembers(hint?: Member[]): Promise<number> {
  if (missingPushInFlight || syncPaused) return 0;
  missingPushInFlight = true;
  try {
    const cfg = await getLiveConfig();
    if (!cfg.laptopServer || !cfg.deviceOnline) return 0;

    const members = await websiteMembersForDevicePush(hint);
    const cachedUsers = peekLiveUsers();
    const cached = onDeviceEnrolls(cachedUsers);
    const obviousMissing = members.filter((row) => !cached.has(memberEnroll(row)));
    const obviousStale = members.filter((row) => {
      const enroll = memberEnroll(row);
      const user = cachedUsers.find((item) => enrollKey(String(item.id ?? '')) === enroll);
      const want = membershipEndDay(row);
      return Boolean(user && want && want !== deviceDay(user.endtime));
    });
    const cacheFresh = liveUsersAt > 0 && Date.now() - liveUsersAt < 90_000;
    if (!obviousMissing.length && !obviousStale.length && cacheFresh && Date.now() - missingPushAt < 45_000) return 0;

    let users = cachedUsers;
    if (!cacheFresh) {
      const preview = await fetchLiveUsers();
      if (preview.offline) return 0;
      users = preview.users;
    }

    const liveById = new Map(users.map((row) => [enrollKey(String(row.id ?? '')), row]));
    const onDevice = onDeviceEnrolls(users);
    const missing = members.filter((row) => !onDevice.has(memberEnroll(row)));
    const stale = members.filter((row) => {
      const enroll = memberEnroll(row);
      const user = liveById.get(enroll);
      const want = membershipEndDay(row);
      return Boolean(user && want && want !== deviceDay(user.endtime));
    });
    if (!missing.length && !stale.length) {
      missingPushAt = Date.now();
      return 0;
    }

    let pushed = 0;
    let failed = false;
    await withTerminalPaused(async () => {
      for (const member of [...missing, ...stale]) {
        const enroll = memberEnroll(member);
        const remote = liveById.get(enroll);
        try {
          const res = await pushLiveUser(toLiveInput({ ...member, deviceEnrollId: enroll }, enroll, remote?.endtime));
          if (res.ok) {
            pushed += 1;
            onDevice.add(enroll);
            const want = membershipEndDay(member);
            if (want) await ackDeviceEnd(member, want);
          } else {
            failed = true;
            break;
          }
        } catch {
          failed = true;
          break;
        }
      }
    });
    if (!failed) missingPushAt = Date.now();
    return pushed;
  } finally {
    missingPushInFlight = false;
  }
}

export function schedulePushMissingWebsiteMembers(hint?: Member[]) {
  if (typeof window === 'undefined') return;
  if (missingPushTimer) window.clearTimeout(missingPushTimer);
  missingPushTimer = window.setTimeout(() => {
    void pushMissingWebsiteMembers(hint);
  }, 1_500);
}

export async function syncLiveRoster(
  knownUsers?: LiveUser[],
  options?: { recoverDeleted?: boolean },
): Promise<{ pulled: number; pushed: number }> {
  const preview = knownUsers ? { users: knownUsers, offline: false } : await fetchLiveUsers();
  if (preview.offline) return { pulled: 0, pushed: 0 };
  const pulled = await importLiveUsers(preview.users, { recoverDeleted: options?.recoverDeleted });
  const pushed = await exportWebsiteMembers(preview.users);
  return { pulled, pushed };
}

export async function importLiveUsers(
  knownUsers?: LiveUser[],
  options?: { pruneMissing?: boolean; recoverDeleted?: boolean },
): Promise<number> {
  const payload = knownUsers ? { users: knownUsers, offline: false } : await fetchLiveUsers();
  if (payload.offline) return 0;
  const { users } = payload;
  const cloudMembers = await hydrateCloudMembers();
  const cloudByEnroll = new Map(
    cloudMembers
      .map((row) => [memberEnroll(row), row] as const)
      .filter(([key]) => Boolean(key)),
  );
  const existing = await localStore.allMembers();
  let changed = 0;
  for (const row of users) {
    const enroll = String(row.id ?? '');
    if (!enroll) continue;
    const key = enrollKey(enroll);
    const websiteEmpty = existing.length === 0 && cloudMembers.length === 0;
    if (options?.recoverDeleted) {
      await forgetDeletedMember(undefined, enroll);
    } else if (!websiteEmpty && await isDeletedMember(undefined, enroll)) {
      const stale = existing.filter((m) => memberEnroll(m) === key);
      if (stale.length) {
        await Promise.all(stale.map((twin) => localStore.deleteMember(twin.id)));
        changed += 1;
      }
      continue;
    }
    const matches = existing.filter((m) => memberEnroll(m) === key);
    const found = matches[0];
    if (matches.length > 1) {
      await Promise.all(matches.slice(1).map((twin) => localStore.deleteMember(twin.id)));
    }
    if (found) {
      const next = {
        ...found,
        name: row.name || found.name,
        firstName: row.name?.split(/\s+/)[0] || found.firstName,
        lastName: row.name?.split(/\s+/).slice(1).join(' ') || found.lastName,
        dateOfBirth: row.birthday || found.dateOfBirth,
        faceRegistered: Boolean(Number(row.face)) || found.faceRegistered,
        faceDeviceId: 'dev-entry-01',
        deviceEnrollId: enroll,
        department: row.department ?? found.department,
        deviceShift: String(row.shift ?? found.deviceShift ?? '1'),
        devicePrivilege: String(row.admin ?? found.devicePrivilege ?? '0'),
        deviceCard: String(row.card ?? found.deviceCard ?? '0'),
        deviceFingerprint: Number(row.fingerprint) > 0 ? '1' : found.deviceFingerprint,
        devicePwd: String(row.password ?? found.devicePwd ?? ''),
        deviceWeekzone: String(row.weekzone ?? found.deviceWeekzone ?? '0'),
        deviceGroup: String(row.group ?? found.deviceGroup ?? '0'),
        deviceAccessTimes: String(row.access_times ?? found.deviceAccessTimes ?? '0'),
        deviceVerifyMode: String(row.verifymode ?? found.deviceVerifyMode ?? '0'),
        deviceStart: row.starttime ?? found.deviceStart,
        deviceEnd: row.endtime ?? found.deviceEnd,
        devicePhotoUrl: row.photourl || found.devicePhotoUrl,
        updatedAt: new Date().toISOString(),
      };
      const same =
        next.name === found.name
        && next.deviceEnrollId === found.deviceEnrollId
        && next.faceRegistered === found.faceRegistered
        && (next.devicePhotoUrl || '') === (found.devicePhotoUrl || '');
      if (!same) {
        await localStore.putMember(next);
        changed += 1;
      }
      const cloudRow =
        cloudByEnroll.get(key)
        || findCloudTwin(cloudMembers, same ? found : next, key);
      if (!cloudRow) {
        const published = await publishDeviceMember(same ? found : next, 'POST');
        existing.push(published);
        cloudMembers.push(published);
        cloudByEnroll.set(key, published);
        changed += 1;
      } else {
        if (!same) await publishDeviceMember({ ...next, id: cloudRow.id }, 'PUT');
      }
      continue;
    }
    const member = memberFromLiveUser(row);
    await localStore.putMember(member);
    const cloudRow = cloudByEnroll.get(key) || findCloudTwin(cloudMembers, member, key);
    if (cloudRow) {
      const published = await publishDeviceMember({ ...member, id: cloudRow.id }, 'PUT');
      existing.push(published);
      cloudByEnroll.set(key, published);
    } else {
      const published = await publishDeviceMember(member, 'POST');
      existing.push(published);
      cloudMembers.push(published);
      cloudByEnroll.set(key, published);
    }
    changed += 1;
  }

  if (options?.pruneMissing) {
    const liveIds = new Set(users.map((row) => String(row.id ?? '')).filter(Boolean));
    const cached = await localStore.allMembers();
    await Promise.all(
      cached
        .filter((member) => {
          const enroll = memberEnroll(member);
          return Boolean(enroll && !liveIds.has(enroll));
        })
        .map((member) => localStore.deleteMember(member.id)),
    );
  }

  const device = await localStore.getDevice('dev-entry-01');
  if (device) {
    await localStore.putDevice({ ...device, userCount: users.length, lastHeartbeat: new Date().toISOString(), status: 'ONLINE' });
  }
  return changed;
}

export async function importLiveLogs(): Promise<number> {
  const { logs, offline } = await fetchLiveLogs();
  if (offline) return 0;
  const seen = new Set<string>();
  let added = 0;
  await ensureHiddenAttendance();
  for (const log of logs) {
    if (isHiddenLiveLog(log)) continue;
    const key = `${enrollKey(String(log.enrollid))}|${log.time ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const created = await ingestDeviceScan(log, { skipDuplicates: true });
    if (created) added += 1;
  }
  return added;
}

const seenRt = new Set<string>();

export async function ingestRtLogs(knownLogs?: LiveLog[]): Promise<number> {
  const payload = knownLogs ? { logs: knownLogs, offline: false } : await fetchRtLogs();
  if (payload.offline) return 0;
  const { logs } = payload;
  let added = 0;
  await ensureHiddenAttendance();
  for (const log of logs) {
    if (isHiddenLiveLog(log)) continue;
    const key = `${log.enrollid}|${log.time}`;
    if (seenRt.has(key)) continue;
    seenRt.add(key);
    const enroll = enrollKey(String(log.enrollid));
    const already = cachedLiveLogs.some(
      (row) => enrollKey(String(row.enrollid)) === enroll && (row.time || '') === (log.time || ''),
    );
    if (!already) cachedLiveLogs = [log, ...cachedLiveLogs];
    const created = await ingestDeviceScan(log, { skipDuplicates: true });
    if (created) added += 1;
  }
  return added;
}

export async function activateLiveGym(): Promise<{ users: number; pulled: number; pushed: number; logs: number }> {
  return withTerminalPaused(async () => {
    await discoverLiveDevice().catch(() => undefined);
    const login = await testLiveDevice();
    if (!login.ok) {
      throw new Error(login.message || 'Device login failed. Save the web password in Settings → Devices.');
    }
    const preview = await fetchLiveUsers();
    if (preview.offline) {
      throw new Error(preview.error || 'Terminal is offline. Connect it to the same Wi‑Fi, then try again.');
    }
    const { pulled, pushed } = await syncLiveRoster(preview.users, { recoverDeleted: true });
    const logs = await importLiveLogs();
    await setMeta('dataMode', 'live');
    return { users: preview.users.length, pulled, pushed, logs };
  });
}

export function startLiveTerminalSync(onChange: (changed: boolean) => void): () => void {
  let stopped = false;
  let busy = false;
  let needsCatchup = true;

  async function pullAttendance() {
    if (stopped || busy || syncPaused) return;
    busy = true;
    setSyncBusy(true);
    try {
      const preview = await fetchRtLogs();
      if (preview.offline) {
        needsCatchup = true;
        return;
      }
      liveLogsAt = Date.now();
      if (needsCatchup) {
        needsCatchup = false;
        schedulePushMissingWebsiteMembers();
      }
      const n = await ingestRtLogs(preview.logs);
      if (n > 0 || (preview.logs?.length ?? 0) > 0) onChange(true);
    } catch {
      /* try again on the next tick */
    } finally {
      busy = false;
      setSyncBusy(false);
    }
  }

  const startTimer = window.setTimeout(() => void pullAttendance(), 400);
  const logsTimer = window.setInterval(() => void pullAttendance(), 5_000);

  return () => {
    stopped = true;
    window.clearTimeout(startTimer);
    window.clearInterval(logsTimer);
  };
}

export async function patchMainDeviceRecord(): Promise<void> {
  const device = await localStore.getDevice('dev-entry-01');
  const cfg = await getLiveConfig().catch(() => null);
  if (!device) return;
  await localStore.putDevice({
    ...device,
    ipAddress: cfg?.host || device.ipAddress,
    model: 'AI806 / SA-AI21 class',
    firmware: 'ai806_fp06v_v5.16',
    location: 'Main Gate',
  });
}
