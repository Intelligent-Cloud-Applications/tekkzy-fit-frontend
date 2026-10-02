import type { AttendanceRecord, Expense, Payment } from '@shared/types';
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
  totalExpense?: number;
  totalDiscontinued: number;
  deletedAttendance?: ArchivedAttendance[];
  reimbursements?: Reimbursement[];
  updatedAt?: string;
};

export function monthPrefix(month: string) {
  const parsed = new Date(`${String(month || '').replace('-', ' ')} 1`);
  if (Number.isNaN(parsed.getTime())) return '';
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}`;
}

export function monthExpenseTotal(month: string, expenses: Array<Pick<Expense, 'date' | 'amount'>> = []) {
  const prefix = monthPrefix(month);
  if (!prefix) return 0;
  return expenses
    .filter((row) => String(row.date || '').startsWith(prefix))
    .reduce((sum, row) => sum + Number(row.amount || 0), 0);
}

export function reportIncome(row: Pick<MonthlyReport, 'cashPayment' | 'upiPayment' | 'razorpayPayment'>) {
  return Number(row.cashPayment || 0) + Number(row.upiPayment || 0) + Number(row.razorpayPayment || 0);
}

export function reportNet(row: Pick<MonthlyReport, 'cashPayment' | 'upiPayment' | 'razorpayPayment' | 'totalExpense'>) {
  return reportIncome(row) - Number(row.totalExpense || 0);
}

export function withExpenseTotal(
  row: MonthlyReport,
  expenses?: Array<Pick<Expense, 'date' | 'amount'>> | null,
): MonthlyReport {
  // Keep stored expense until the live expense list has actually loaded.
  if (expenses == null) return row;
  return { ...row, totalExpense: monthExpenseTotal(row.month, expenses) };
}

export function currentMonthKey(date = new Date()) {
  return date.toLocaleString('en-US', { month: 'long', year: 'numeric' }).replace(' ', '-');
}

export function isActiveMember(member: MemberRow) {
  const status = String(member.membership?.status || member.status || '').toUpperCase();
  if (['DELETED', 'HIDDEN', 'ARCHIVED'].includes(status)) return false;
  return true;
}

export function isDiscontinuedMember(member: MemberRow) {
  if (!isActiveMember(member)) return false;
  const status = String(member.membership?.status || member.status || '').toUpperCase();
  const sub = String(member.subscriptionStatus || '').toUpperCase();
  const end = String(member.renewDate || member.membership?.expiryDate || '').slice(0, 10);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  const expired = Boolean(end && end < today);
  if (['EXPIRED', 'CANCELLED', 'INACTIVE'].includes(status)) return true;
  if (['CANCELLED', 'EXPIRED', 'HALTED'].includes(sub)) return true;
  if (expired) return true;
  return false;
}

export function buildMonthlySnapshot(
  month: string,
  members: MemberRow[],
  payments: Payment[],
  attendance: AttendanceRecord[],
  archived: ArchivedAttendance[] = [],
  expenses: Array<Pick<Expense, 'date' | 'amount'>> = [],
): MonthlyReport {
  const active = members.filter(isActiveMember);
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
    totalMembers: active.length,
    cashPayment,
    upiPayment,
    razorpayPayment,
    totalExpense: monthExpenseTotal(month, expenses),
    totalDiscontinued: active.filter(isDiscontinuedMember).length,
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
