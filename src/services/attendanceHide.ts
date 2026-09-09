import { deviceLogStamp, enrollKey } from '@/lib/format';
import { getMeta, setMeta } from '@/providers/database/LocalDatabase';
import { listMonthlyReports } from '@/services/reports';
import type { AttendanceRecord } from '@shared/types';

const META_KEY = 'hiddenAttendance';
const hidden = new Set<string>();
let ready = false;

export function punchHideKey(row: { id?: string; memberId?: string; memberCode?: string; timestamp?: string }) {
  const enroll = enrollKey(row.memberCode || row.memberId);
  return `${enroll}|${row.timestamp || ''}`;
}

export function hideKeysForAttendance(row: AttendanceRecord): string[] {
  const enroll = enrollKey(row.memberCode || row.memberId);
  return [row.id, punchHideKey(row), `${enroll}|${row.timestamp}`, `live-${enroll}-${row.timestamp}`].filter(Boolean);
}

export function hideKeysForLog(log: { enrollid?: string | number; time?: string }) {
  const enroll = enrollKey(String(log.enrollid ?? ''));
  const stamp = deviceLogStamp(log.time);
  return [`live-${enroll}-${log.time || ''}`, `${enroll}|${stamp}`, `${enroll}|${log.time || ''}`];
}

function remember(keys: string[]) {
  for (const key of keys) {
    if (key) hidden.add(key);
  }
}

async function persist() {
  await setMeta(META_KEY, JSON.stringify([...hidden].slice(-4000)));
}

export async function ensureHiddenAttendance() {
  if (ready) return hidden;
  const raw = await getMeta(META_KEY);
  if (raw) {
    try {
      remember(JSON.parse(raw) as string[]);
    } catch {
      /* ignore broken cache */
    }
  }
  try {
    const reports = await listMonthlyReports();
    for (const report of reports) {
      for (const row of report.deletedAttendance || []) {
        remember(hideKeysForAttendance({
          id: row.id,
          memberId: row.memberId,
          memberName: row.memberName,
          memberCode: row.memberCode,
          deviceId: 'dev-entry-01',
          deviceName: row.deviceName || 'Entry terminal',
          timestamp: row.timestamp,
          type: (row.type as AttendanceRecord['type']) || 'ENTRY',
          status: (row.status as AttendanceRecord['status']) || 'GRANTED',
          createdAt: row.deletedAt || row.timestamp,
        }));
      }
    }
    await persist();
  } catch {
    /* offline — local list is enough */
  }
  ready = true;
  return hidden;
}

export function isHiddenAttendance(row: AttendanceRecord) {
  return hideKeysForAttendance(row).some((key) => hidden.has(key));
}

export function isHiddenLiveLog(log: { enrollid?: string | number; time?: string }) {
  return hideKeysForLog(log).some((key) => hidden.has(key));
}

export async function hideAttendance(row: AttendanceRecord) {
  await hideAttendanceRows([row]);
}

export async function hideAttendanceRows(rows: AttendanceRecord[]) {
  await ensureHiddenAttendance();
  for (const row of rows) remember(hideKeysForAttendance(row));
  await persist();
}

export function filterHiddenLogs<T extends { enrollid?: string | number; time?: string }>(logs: T[]): T[] {
  return logs.filter((log) => !isHiddenLiveLog(log));
}
