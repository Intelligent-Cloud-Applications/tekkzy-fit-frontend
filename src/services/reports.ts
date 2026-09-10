import type { AttendanceRecord, Payment } from '@shared/types';
import { attendanceMonthKey } from '@/lib/format';
import { apiRequest, tryApi } from '@/services/api';
import { isPaidPayment } from '@/services/payments';
import type { MemberRow } from '@/services/members';

export type ArchivedAttendance = {
  id: string;
  memberId?: string;
  memberName: string;
  memberCode?: string;
  timestamp: string;
  type?: string;
  status?: string;
  reason?: string;
  deviceName?: string;
  deletedAt?: string;
};

export type Reimbursement = {
  id: string;
  date: string;
  amount: number;
  paidTo: string;
  reason: string;
  method: 'CASH' | 'ONLINE';
  createdAt: string;
  month?: string;
};

export type MonthlyReport = {
  month: string;
  totalAttendance: number;
  totalMembers: number;
  cashPayment: number;
  upiPayment?: number;
  razorpayPayment: number;
  totalDiscontinued: number;
  deletedAttendance?: ArchivedAttendance[];
  reimbursements?: Reimbursement[];
  updatedAt?: string;
};

export function currentMonthKey(date = new Date()) {
  return date.toLocaleString('en-US', { month: 'long', year: 'numeric' }).replace(' ', '-');
}

export function isDiscontinuedMember(member: MemberRow) {
  const status = String(member.membership?.status || member.status || '').toUpperCase();
  const pay = String(member.paymentStatus || member.membership?.paymentStatus || '').toUpperCase();
  const sub = String(member.subscriptionStatus || '').toUpperCase();
  const end = String(member.renewDate || member.membership?.expiryDate || '').slice(0, 10);
  const expired = Boolean(end && end < new Date().toISOString().slice(0, 10));
  if (['EXPIRED', 'CANCELLED', 'INACTIVE'].includes(status)) return true;
  if (['CANCELLED', 'EXPIRED', 'HALTED'].includes(sub)) return true;
  if (pay === 'PENDING' || pay === 'FAILED') return true;
  return expired;
}

export function buildMonthlySnapshot(
  month: string,
  members: MemberRow[],
  payments: Payment[],
  attendance: AttendanceRecord[],
  archived: ArchivedAttendance[] = [],
): MonthlyReport {
  const parsed = new Date(`${month.replace('-', ' ')} 1`);
  const start = new Date(parsed.getFullYear(), parsed.getMonth(), 1);
  const end = new Date(parsed.getFullYear(), parsed.getMonth() + 1, 1);
  const inMonth = (iso: string) => {
    const day = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
    return day >= start && day < end;
  };
  const monthPays = payments.filter((p) => isPaidPayment(p) && inMonth(p.date));
  const cashPayment = monthPays.filter((p) => p.method === 'CASH').reduce((s, p) => s + Number(p.amount || 0), 0);
  const upiPayment = monthPays.filter((p) => p.method === 'UPI').reduce((s, p) => s + Number(p.amount || 0), 0);
  const razorpayPayment = monthPays
    .filter((p) => p.method !== 'CASH' && p.method !== 'UPI')
    .reduce((s, p) => s + Number(p.netAmount ?? p.amount ?? 0), 0);
  const seen = new Set<string>();
  let totalAttendance = 0;
  for (const row of [...attendance, ...archived]) {
    if (String(row.status || 'GRANTED').toUpperCase() !== 'GRANTED' || !inMonth(row.timestamp)) continue;
    const key = `${row.memberCode || row.memberId || row.id}|${row.timestamp}`;
    if (seen.has(key)) continue;
    seen.add(key);
    totalAttendance += 1;
  }
  return {
    month,
    totalAttendance,
    totalMembers: members.length,
    cashPayment,
    upiPayment,
    razorpayPayment,
    totalDiscontinued: members.filter(isDiscontinuedMember).length,
    deletedAttendance: archived,
  };
}

export async function listMonthlyReports(): Promise<MonthlyReport[]> {
  return (await tryApi<MonthlyReport[]>('/reports/monthly')) || [];
}

export async function saveMonthlyReport(row: MonthlyReport): Promise<MonthlyReport> {
  return apiRequest<MonthlyReport>('/reports/monthly', {
    method: 'PUT',
    body: JSON.stringify(row),
  });
}

function compactArchive(row: AttendanceRecord) {
  return {
    id: row.id,
    memberId: row.memberId,
    memberName: row.memberName,
    memberCode: row.memberCode,
    timestamp: row.timestamp,
    type: row.type,
    status: row.status,
    reason: row.reason,
    deviceName: row.deviceName,
  };
}

export async function archiveAttendanceToReport(row: AttendanceRecord): Promise<MonthlyReport> {
  return apiRequest<MonthlyReport>('/reports/monthly', {
    method: 'PUT',
    body: JSON.stringify({
      month: attendanceMonthKey(row.timestamp),
      archiveAttendance: compactArchive(row),
    }),
  });
}

function monthFromDate(ymd: string) {
  const [year, month] = String(ymd || '').split('-').map(Number);
  if (!year || !month) return currentMonthKey();
  return new Date(year, month - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' }).replace(' ', '-');
}

export function listReimbursements(rows: MonthlyReport[]): Reimbursement[] {
  return rows
    .flatMap((row) => (row.reimbursements || []).map((item) => ({ ...item, month: row.month })))
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
}

export async function addReimbursement(row: Reimbursement): Promise<MonthlyReport> {
  return apiRequest<MonthlyReport>('/reports/monthly', {
    method: 'PUT',
    body: JSON.stringify({
      month: monthFromDate(row.date),
      addReimbursement: row,
    }),
  });
}

export async function removeReimbursement(month: string, id: string): Promise<MonthlyReport> {
  return apiRequest<MonthlyReport>('/reports/monthly', {
    method: 'PUT',
    body: JSON.stringify({
      month,
      removeReimbursementId: id,
    }),
  });
}

export async function archiveAttendanceRows(rows: AttendanceRecord[]): Promise<void> {
  const byMonth = new Map<string, AttendanceRecord[]>();
  for (const row of rows) {
    const month = attendanceMonthKey(row.timestamp);
    const list = byMonth.get(month) || [];
    list.push(row);
    byMonth.set(month, list);
  }
  for (const [month, list] of byMonth) {
    await apiRequest<MonthlyReport>('/reports/monthly', {
      method: 'PUT',
      body: JSON.stringify({
        month,
        deletedAttendance: list.map(compactArchive),
      }),
    });
  }
}
