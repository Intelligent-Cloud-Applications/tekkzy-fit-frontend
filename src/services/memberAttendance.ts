import { deviceLogStamp, enrollKey, istYmd } from '@/lib/format';
import { localStore } from '@/providers/database/LocalDatabase';
import { apiRequest } from '@/services/api';
import { peekLiveLogs } from '@/services/liveDevice';
import type { CloudMember } from '@/services/members';

const attendanceQueue = new Map<string, Set<string>>();
let attendanceFlush: ReturnType<typeof setTimeout> | null = null;

function enrollOf(member: Pick<CloudMember, 'deviceEnrollId' | 'memberCode'>) {
  const direct = enrollKey(member.deviceEnrollId);
  if (direct) return direct;
  return /^DEV-/i.test(member.memberCode || '') ? enrollKey(member.memberCode) : '';
}

export async function recordMemberAttendanceDays(memberId: string, days: string[]): Promise<void> {
  const unique = [...new Set(days.map((day) => day.slice(0, 10)).filter((day) => /^\d{4}-\d{2}-\d{2}$/.test(day)))];
  if (!memberId || !unique.length) return;
  try {
    await apiRequest(`/members/${memberId}`, {
      method: 'PATCH',
      body: JSON.stringify({ recordAttendance: true, attendanceDays: unique }),
    });
  } catch {
    /* keep local attendance even if cloud write fails */
  }
}

export function queueMemberAttendanceDay(memberId: string, day: string) {
  const ymd = day.slice(0, 10);
  if (!memberId || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return;
  if (!attendanceQueue.has(memberId)) attendanceQueue.set(memberId, new Set());
  attendanceQueue.get(memberId)!.add(ymd);
  if (attendanceFlush) return;
  attendanceFlush = setTimeout(() => {
    attendanceFlush = null;
    const batch = [...attendanceQueue.entries()];
    attendanceQueue.clear();
    void Promise.all(batch.map(([id, days]) => recordMemberAttendanceDays(id, [...days])));
  }, 1200);
}

export async function backfillMemberAttendance(member: CloudMember): Promise<void> {
  const days = new Set<string>();
  const enroll = enrollOf(member);
  const rows = await localStore.allAttendance();
  for (const row of rows) {
    if (row.status !== 'GRANTED') continue;
    const match = row.memberId === member.id || (enroll && enrollKey(row.memberCode) === enroll);
    if (match) days.add(istYmd(row.timestamp));
  }
  for (const log of peekLiveLogs()) {
    if (enroll && enrollKey(String(log.enrollid)) === enroll) {
      const stamp = deviceLogStamp(log.time) || log.time || '';
      if (stamp) days.add(istYmd(stamp));
    }
  }
  if (days.size) await recordMemberAttendanceDays(member.id, [...days]);
}
