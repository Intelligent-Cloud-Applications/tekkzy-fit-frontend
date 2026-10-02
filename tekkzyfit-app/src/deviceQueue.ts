import AsyncStorage from '@react-native-async-storage/async-storage';
import { errorMessage } from './errors';
import { fetchDeviceUsers, loginDevice, probeHost, setDeviceUser } from './device';
import { loadDeviceCreds } from './session';
import type { Member } from './types';

const QUEUE_KEY = 'tekkzy.deviceQueue';

export type QueuedDeviceUser = {
  enrollid: string;
  name: string;
  memberId?: string;
  shiftid?: string;
  card?: string;
  verifymode?: string;
  birthday?: string;
  starttime?: string;
  endtime?: string;
};

export type DeviceSyncResult = {
  pushed: number;
  failed: number;
  connected: boolean;
  message?: string;
  updates: Array<{ memberId: string; enrollid: string }>;
};

function deviceDay(value?: string | null) {
  return String(value || '').match(/(\d{4}-\d{2}-\d{2})/)?.[1] || '';
}

function formatDeviceEnd(day: string, _previous?: string) {
  if (!day) return '';
  const ymd = deviceDay(day) || day;
  return `${ymd} 23:59:59`;
}

export function enrollKey(value?: string | null) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  return digits.replace(/^0+/, '') || digits || raw;
}

export function namesMatch(a?: string, b?: string) {
  const left = String(a || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const right = String(b || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!left || !right) return false;
  if (left === right) return true;
  return left.startsWith(right) || right.startsWith(left);
}

export function nextFreeEnroll(used: Set<string>) {
  for (let n = 1; n < 99999; n += 1) {
    if (!used.has(String(n))) return String(n);
  }
  return String(Date.now()).slice(-6);
}

export async function listQueuedDeviceUsers() {
  return readQueue();
}

async function readQueue(): Promise<QueuedDeviceUser[]> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  if (!raw) return [];
  try {
    const rows = JSON.parse(raw) as QueuedDeviceUser[];
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

async function writeQueue(rows: QueuedDeviceUser[]) {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(rows));
}

export async function queueDeviceUser(row: QueuedDeviceUser) {
  const enroll = String(row.enrollid || '').trim();
  if (!enroll || !row.name) return;
  const rows = await readQueue();
  await writeQueue([row, ...rows.filter((item) => enrollKey(item.enrollid) !== enrollKey(enroll))]);
}

export async function dropQueuedDeviceUser(enrollid: string) {
  const rows = await readQueue();
  await writeQueue(rows.filter((item) => enrollKey(item.enrollid) !== enrollKey(enrollid)));
}

export function deviceUserFromMember(input: {
  id?: string;
  cognitoId?: string;
  deviceEnrollId?: string;
  memberCode?: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  deviceShift?: string;
  deviceCard?: string;
  deviceVerifyMode?: string;
  dateOfBirth?: string;
  startDate?: string;
  joinDate?: string;
  deviceEnd?: string | null;
  renewDate?: string | null;
  membership?: { expiryDate?: string } | null;
}): QueuedDeviceUser | null {
  const name = `${input.firstName || ''} ${input.lastName || ''}`.trim() || input.name || '';
  if (!name) return null;
  const enrollid = enrollKey(input.deviceEnrollId)
    || (/^DEV-/i.test(String(input.memberCode || '')) ? enrollKey(input.memberCode) : '');
  const day = deviceDay(input.deviceEnd || input.renewDate || input.membership?.expiryDate);
  const joined = deviceDay(input.startDate || input.joinDate);
  // Terminals reject a validity window whose start is after its end (due date moved before join date).
  const start = day && joined && joined > day ? day : joined;
  return {
    enrollid,
    name,
    memberId: input.cognitoId || input.id,
    shiftid: input.deviceShift || '0',
    card: input.deviceCard,
    verifymode: input.deviceVerifyMode || '0',
    birthday: input.dateOfBirth || '',
    starttime: start,
    endtime: formatDeviceEnd(day),
  };
}

export async function syncCloudMembersToDevice(members: Member[] = []): Promise<DeviceSyncResult> {
  const creds = await loadDeviceCreds();
  const probe = await probeHost(creds.host);
  if (!probe.ok) return { pushed: 0, failed: 0, connected: false, message: probe.message, updates: [] };
  await loginDevice(creds.host, creds.username, creds.password);

  let deviceUsers;
  try {
    deviceUsers = await fetchDeviceUsers(creds.host, creds.password);
  } catch (err) {
    return {
      pushed: 0,
      failed: 0,
      connected: true,
      updates: [],
      message: errorMessage(err, 'Connected but could not read people on the machine.', 'device'),
    };
  }
  const used = new Set(deviceUsers.map((row) => enrollKey(row.id)).filter(Boolean));
  const byId = new Map(deviceUsers.map((row) => [enrollKey(row.id), row]));
  const queued = await readQueue();
  const pending: QueuedDeviceUser[] = [];
  const updates: Array<{ memberId: string; enrollid: string }> = [];
  const seen = new Set<string>();

  function takeId(preferred: string, name: string) {
    const key = enrollKey(preferred);
    const occupant = key ? byId.get(key) : undefined;
    if (key && occupant && (namesMatch(occupant.name, name) || !String(occupant.name || '').trim())) return key;
    const named = deviceUsers.find((row) => namesMatch(row.name, name));
    if (named) return enrollKey(named.id);
    if (key && !occupant && !used.has(key)) {
      used.add(key);
      return key;
    }
    const next = nextFreeEnroll(used);
    used.add(next);
    return next;
  }

  for (const member of members) {
    const row = deviceUserFromMember(member);
    if (!row) continue;
    const enrollid = takeId(row.enrollid, row.name);
    const token = `${enrollid}|${row.name.toLowerCase()}`;
    if (seen.has(token)) continue;
    seen.add(token);
    if (enrollid !== row.enrollid && (member.cognitoId || member.id)) {
      updates.push({ memberId: member.cognitoId || member.id, enrollid });
    }
    const occupant = byId.get(enrollid);
    const samePerson = Boolean(occupant && namesMatch(occupant.name, row.name));
    // Person already on the terminal: leave face + end date alone. Cloud sync only fills gaps.
    if (samePerson) continue;
    pending.push({
      ...row,
      enrollid,
      endtime: formatDeviceEnd(deviceDay(row.endtime), occupant?.endtime),
    });
  }

  for (const row of queued) {
    const key = enrollKey(row.enrollid) || takeId('', row.name);
    if (seen.has(`${key}|${row.name.toLowerCase()}`)) continue;
    const occupant = byId.get(key);
    const samePerson = Boolean(occupant && namesMatch(occupant.name, row.name));
    if (samePerson) continue;
    pending.push({
      ...row,
      enrollid: key,
      endtime: formatDeviceEnd(deviceDay(row.endtime), occupant?.endtime),
    });
  }

  let pushed = 0;
  let failed = 0;
  const leftover: QueuedDeviceUser[] = [];
  const errors: string[] = [];
  for (const row of pending) {
    try {
      await setDeviceUser(creds.host, row);
      await dropQueuedDeviceUser(row.enrollid);
      byId.set(enrollKey(row.enrollid), { id: row.enrollid, name: row.name });
      used.add(enrollKey(row.enrollid));
      pushed += 1;
    } catch (err) {
      leftover.push(row);
      failed += 1;
      errors.push(`${row.name}: ${errorMessage(err, 'rejected', 'device')}`);
    }
  }
  await writeQueue(leftover);
  const already = members.length - pushed - failed;
  return {
    pushed,
    failed,
    connected: true,
    updates,
    message: [
      pushed ? `${pushed} added to the machine` : '',
      already > 0 && !pushed && !failed ? 'All cloud members are already on the machine' : '',
      failed ? `${failed} failed (${errors.slice(0, 2).join('; ')})` : '',
    ].filter(Boolean).join('. ') || 'Sync finished.',
  };
}

export async function flushDeviceQueue(): Promise<DeviceSyncResult> {
  return syncCloudMembersToDevice([]);
}
