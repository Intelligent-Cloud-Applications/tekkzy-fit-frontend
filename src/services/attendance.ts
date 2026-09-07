import { deviceLogStamp, enrollKey, isSameDay } from '@/lib/format';
import { localStore } from '@/providers/database/LocalDatabase';
import { peekLiveLogs } from '@/services/liveDevice';
import type { AttendanceRecord } from '@shared/types';

function uniqueAttendance(rows: AttendanceRecord[]): AttendanceRecord[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = `${enrollKey(row.memberCode || row.memberId)}|${row.timestamp}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function liveAsAttendance(log: { enrollid?: string | number; name?: string; time?: string }): AttendanceRecord {
  const enroll = enrollKey(String(log.enrollid ?? ''));
  return {
    id: `live-${enroll}-${log.time || ''}`,
    memberId: enroll,
    memberName: log.name || `User ${enroll}`,
    memberCode: enroll,
    deviceId: 'dev-entry-01',
    deviceName: 'Entry terminal',
    timestamp: deviceLogStamp(log.time) || new Date().toISOString(),
    type: 'ENTRY',
    status: 'GRANTED',
    createdAt: new Date().toISOString(),
  };
}

export async function listAttendance(): Promise<AttendanceRecord[]> {
  const local = await localStore.allAttendance();
  const live = peekLiveLogs().map(liveAsAttendance);
  return uniqueAttendance([...local, ...live]).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

export async function todayAttendance(): Promise<AttendanceRecord[]> {
  return (await listAttendance()).filter((r) => isSameDay(r.timestamp));
}

export function attendanceBelongsToMember(
  row: AttendanceRecord,
  member: { id?: string; cognitoId?: string; deviceEnrollId?: string; memberCode?: string },
) {
  const enroll = enrollKey(member.deviceEnrollId) || enrollKey(member.memberCode);
  if (member.id && row.memberId === member.id) return true;
  if (member.cognitoId && row.memberId === member.cognitoId) return true;
  if (enroll && (enrollKey(row.memberId) === enroll || enrollKey(row.memberCode) === enroll)) return true;
  return false;
}

export async function attendanceForMember(memberId: string): Promise<AttendanceRecord[]> {
  const member = await localStore.getMember(memberId);
  const rows = await listAttendance();
  if (member) return rows.filter((r) => attendanceBelongsToMember(r, member));
  const enroll = enrollKey(memberId);
  return rows.filter((r) =>
    r.memberId === memberId
    || (enroll && (enrollKey(r.memberId) === enroll || enrollKey(r.memberCode) === enroll)),
  );
}

export function attendanceHourBuckets(rows: AttendanceRecord[]): { hour: string; count: number }[] {
  const buckets = new Map<number, number>();
  for (let h = 6; h <= 21; h += 1) buckets.set(h, 0);
  for (const row of rows) {
    if (row.status !== 'GRANTED') continue;
    const hour = new Date(row.timestamp).getHours();
    if (buckets.has(hour)) buckets.set(hour, (buckets.get(hour) ?? 0) + 1);
  }
  return [...buckets.entries()].map(([hour, count]) => ({
    hour: `${String(hour).padStart(2, '0')}:00`,
    count,
  }));
}

export function weekdayBuckets(rows: AttendanceRecord[]): { day: string; count: number }[] {
  const labels = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const counts = [0, 0, 0, 0, 0, 0, 0];
  for (const row of rows) {
    if (row.status !== 'GRANTED') continue;
    const js = new Date(row.timestamp).getDay();
    const idx = js === 0 ? 6 : js - 1;
    counts[idx] += 1;
  }
  return labels.map((day, i) => ({ day, count: counts[i] }));
}
