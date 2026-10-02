import { AppRegistry, DeviceEventEmitter, NativeModules, PermissionsAndroid, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchMembers, fetchStaff, logsToAttendance, persistDeviceEnrolls, saveAttendanceDays } from './api';
import { fetchLiveDeviceLogs, hostOnLan, loginDevice, phoneLanIp, sameLan } from './device';
import { flushDeviceQueue, syncCloudMembersToDevice } from './deviceQueue';
import { getToken, isDeviceSetupDone, loadDeviceCreds, loadSession, saveDeviceCreds } from './session';
import type { AttendanceRow, Member } from './types';
import { checkAppUpdate } from './appUpdate';

const PUNCH_KEY = 'tekkzy.bgPunches';
const native = Platform.OS === 'android' ? NativeModules.DeskKeepAlive : null;
let tickCount = 0;
let membersCache: Member[] = [];
let staffCache: Member[] = [];
let ticking = false;

export const DESK_TICK_EVENT = 'tekkzy.deskTick';

function nativeCall<T>(fn: string, ...args: unknown[]): Promise<T> {
  if (!native?.[fn]) return Promise.resolve(false as T);
  return native[fn](...args);
}

async function askNotifyPermission() {
  if (Platform.OS !== 'android' || Number(Platform.Version) < 33) return;
  try {
    await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
  } catch {
    /* older build or denied */
  }
}

export async function loadBackgroundPunches(): Promise<AttendanceRow[]> {
  const raw = await AsyncStorage.getItem(PUNCH_KEY);
  if (!raw) return [];
  try {
    const rows = JSON.parse(raw) as AttendanceRow[];
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

async function saveBackgroundPunches(rows: AttendanceRow[]) {
  const next = rows.slice(0, 400);
  await AsyncStorage.setItem(PUNCH_KEY, JSON.stringify(next));
}

async function rememberPunches(rows: AttendanceRow[]) {
  if (!rows.length) return rows;
  const prev = await loadBackgroundPunches();
  const seen = new Set(prev.map((row) => row.id));
  const merged = [...rows.filter((row) => row.id && !seen.has(row.id)), ...prev].slice(0, 400);
  await saveBackgroundPunches(merged);
  return rows.filter((row) => row.id && !seen.has(row.id));
}

async function notify(title: string, text: string) {
  await nativeCall('updateNotification', title, text).catch(() => false);
}

async function findHost() {
  const creds = await loadDeviceCreds();
  if (!isDeviceSetupDone(creds)) {
    return { ...creds, ok: false as const, message: 'Face machine not set up on this phone' };
  }
  const phone = await phoneLanIp().catch(() => '');
  let prefer = '';
  if (phone && creds.host && sameLan(creds.host, phone)) prefer = creds.host;
  else if (phone && creds.host) prefer = hostOnLan(creds.host, phone) || '';
  try {
    const { connectAndLoadUsers } = await import('./device');
    const { probe } = await connectAndLoadUsers(prefer, creds.username, creds.password);
    if (probe.ok) {
      if (probe.host !== creds.host) await saveDeviceCreds({ ...creds, host: probe.host });
      return { ...creds, host: probe.host, ok: true as const, message: probe.message };
    }
    return { ...creds, ok: false as const, message: probe.message || 'Waiting for the terminal on this Wi‑Fi' };
  } catch {
    return { ...creds, ok: false as const, message: 'Waiting for the terminal on this Wi‑Fi' };
  }
}

export async function runDeskTick() {
  if (ticking) return;
  ticking = true;
  tickCount += 1;
  try {
    await loadSession();
    if (!getToken()) {
      await stopDeskKeepAlive();
      return;
    }
    if (tickCount === 1 || tickCount % 6 === 0) {
      await checkAppUpdate().catch(() => null);
    }
    const found = await findHost();
    if (!found.ok) {
      await notify('Tekkzy Fit', found.message);
      DeviceEventEmitter.emit(DESK_TICK_EVENT, { connected: false });
      return;
    }
    await loginDevice(found.host, found.username, found.password);
    const logs = await fetchLiveDeviceLogs(found.host, found.password).catch(() => []);
    let pushed = 0;
    if (tickCount % 5 === 1) {
      membersCache = await fetchMembers().catch(() => membersCache);
      staffCache = await fetchStaff().catch(() => staffCache);
      // Do not auto-import machine people here — that duplicated members. Use Terminal → Add all.
      const synced = await syncCloudMembersToDevice(membersCache);
      pushed = synced.pushed;
      if (synced.updates.length && membersCache.length) {
        membersCache = await persistDeviceEnrolls(membersCache, synced.updates);
      }
    } else {
      const flushed = await flushDeviceQueue();
      pushed = flushed.pushed;
    }
    const people = [...membersCache, ...staffCache];
    const punches = await rememberPunches(logsToAttendance(logs, people));
    if (punches.length && people.length) await saveAttendanceDays(punches, people).catch(() => []);
    if (tickCount === 1 || tickCount % 18 === 0) {
      await checkAppUpdate().catch(() => null);
    }
    await notify('Tekkzy Fit', pushed ? `Terminal linked · ${pushed} queued on machine` : 'Terminal linked');
    DeviceEventEmitter.emit(DESK_TICK_EVENT, { connected: true, punches, pushed });
  } catch {
    await notify('Tekkzy Fit', 'Waiting for the terminal on this Wi‑Fi');
    DeviceEventEmitter.emit(DESK_TICK_EVENT, { connected: false });
  } finally {
    ticking = false;
  }
}

export async function startDeskKeepAlive() {
  void nativeCall('checkForUpdate');
  if (Platform.OS !== 'android') return;
  await askNotifyPermission();
  await nativeCall('start');
}

export async function stopDeskKeepAlive() {
  if (Platform.OS !== 'android') return;
  await nativeCall('stop');
}

AppRegistry.registerHeadlessTask('TekkzyDeskKeepAlive', () => async () => {
  await runDeskTick();
});
