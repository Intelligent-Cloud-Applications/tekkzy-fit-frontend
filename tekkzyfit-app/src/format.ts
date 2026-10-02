import type { Member, Payment, Plan } from './types';

export function todayISO() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

export function monthKey(date = todayISO()) {
  const parsed = new Date(`${date.slice(0, 10)}T00:00:00`);
  return parsed.toLocaleString('en-US', { month: 'long', year: 'numeric' }).replace(' ', '-');
}

const MONTH_NAMES = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

/** "September-2026" (monthKey) → "2026-09". Hermes cannot parse "September 2026 1" with new Date(). */
export function monthPrefix(month: string) {
  const [name, year] = String(month || '').trim().split(/[-\s]+/);
  const index = MONTH_NAMES.findIndex((m) => m.startsWith(String(name || '').toLowerCase().slice(0, 3)));
  return index >= 0 && /^\d{4}$/.test(String(year || '')) ? `${year}-${String(index + 1).padStart(2, '0')}` : '';
}

/** First and last YYYY-MM-DD of a monthKey month, or null when it cannot be read. */
export function monthBounds(month: string) {
  const prefix = monthPrefix(month);
  if (!prefix) return null;
  const [y, m] = prefix.split('-').map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { start: `${prefix}-01`, end: `${prefix}-${String(lastDay).padStart(2, '0')}` };
}

export function addDays(iso: string, days: number) {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function ymd(value?: string | null) {
  const raw = String(value || '').trim();
  const iso = raw.match(/(\d{4})[-/](\d{2})[-/](\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = raw.match(/(\d{2})[-/](\d{2})[-/](\d{4})/);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  return '';
}

export function formatTime(value?: string | null) {
  const raw = String(value || '');
  const match = raw.match(/T(\d{2}:\d{2})/) || raw.match(/[ T](\d{2}:\d{2})(?::\d{2})?/);
  return match?.[1] || '';
}

export function displayPaymentId(payment?: { id?: string; paymentCode?: string; razorpayPaymentId?: string } | null) {
  return String(payment?.paymentCode || payment?.razorpayPaymentId || payment?.id || '—');
}

export function formatDate(value?: string | null) {
  const day = ymd(value);
  if (!day) return '—';
  const [y, m, d] = day.split('-');
  return `${d}/${m}/${y}`;
}

export function formatDateTime(value?: string | null) {
  const date = formatDate(value);
  const time = formatTime(value);
  if (date === '—') return '—';
  return time ? `${date} · ${time}` : date;
}

export function formatDateShort(value?: string | null) {
  const day = ymd(value);
  if (!day) return '';
  const [y, m, d] = day.split('-');
  return `${d}/${m}/${y.slice(-2)}`;
}

export function parseDateInput(value?: string | null) {
  const raw = String(value || '').trim();
  const iso = ymd(raw);
  if (iso) return iso;
  const match = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2}|\d{4})$/);
  if (!match) return '';
  const d = match[1].padStart(2, '0');
  const m = match[2].padStart(2, '0');
  let y = match[3];
  if (y.length === 2) y = `20${y}`;
  const next = `${y}-${m}-${d}`;
  const test = new Date(`${next}T00:00:00`);
  if (Number.isNaN(test.getTime())) return '';
  if (test.getFullYear() !== Number(y) || test.getMonth() + 1 !== Number(m) || test.getDate() !== Number(d)) return '';
  return next;
}

export function maskDateInput(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 6);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

export function formatINR(amount?: number | null) {
  const n = Number(amount || 0);
  return `₹${n.toLocaleString('en-IN')}`;
}

export function newId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
}

export function splitName(name?: string) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  return { firstName: parts[0] || '', lastName: parts.slice(1).join(' ') };
}

export function memberDue(member?: Pick<Member, 'renewDate' | 'deviceEnd' | 'membership'> | null) {
  return ymd(member?.renewDate || member?.membership?.expiryDate || member?.deviceEnd);
}

/** Badge status: EXPIRED when end date has passed (unless paused/cancelled). */
export function memberDisplayStatus(
  member?: Pick<Member, 'status' | 'subscriptionStatus' | 'renewDate' | 'deviceEnd' | 'membership'> | null,
) {
  const sub = String(member?.subscriptionStatus || '').toUpperCase();
  if (['PAUSED', 'CANCELLED', 'CANCELED'].includes(sub)) return sub;
  if (String(member?.status || '').toUpperCase() === 'SUSPENDED') return 'SUSPENDED';
  if (sub === 'EXPIRED' || String(member?.membership?.status || '').toUpperCase() === 'EXPIRED') return 'EXPIRED';
  const due = memberDue(member);
  if (due && due < todayISO()) return 'EXPIRED';
  return sub || String(member?.membership?.status || member?.status || 'ACTIVE').toUpperCase();
}

function addedAt(member?: Pick<Member, 'createdAt' | 'joinDate' | 'deviceEnrollId'> | null) {
  const raw = String(member?.createdAt || '').trim();
  if (raw) {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 1e12) return n;
    if (Number.isFinite(n) && n > 1e9) return n * 1000;
    const parsed = Date.parse(raw);
    if (!Number.isNaN(parsed)) return parsed;
  }
  const join = Date.parse(String(member?.joinDate || ''));
  return Number.isNaN(join) ? 0 : join;
}

export function compareNewestMembers(a: Member, b: Member) {
  const diff = Math.floor(addedAt(b) / 60000) - Math.floor(addedAt(a) / 60000);
  if (diff) return diff;
  const enroll = (Number(b.deviceEnrollId) || 0) - (Number(a.deviceEnrollId) || 0);
  if (enroll) return enroll;
  return String(b.id || '').localeCompare(String(a.id || ''));
}

export function isPaid(payment: Payment) {
  return String(payment.status || '').toUpperCase() === 'PAID' && Number(payment.amount || 0) > 0;
}

export function paymentAmount(payment: Payment) {
  const desk = ['CASH', 'UPI'].includes(String(payment.method || '').toUpperCase());
  const raw = payment.status === 'PAID' && !desk ? (payment.netAmount ?? payment.amount) : payment.amount;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

/** What the member was charged (plan price), before any Razorpay fee is deducted. */
export function billedAmount(payment: Payment) {
  const n = Number(payment.grossAmount || payment.amount || payment.netAmount || 0);
  return Number.isFinite(n) ? n : 0;
}

export function methodLabel(method?: string) {
  const value = String(method || '').toUpperCase();
  if (value === 'CASH') return 'Cash';
  if (value === 'UPI') return 'UPI';
  if (value === 'RAZORPAY' || value === 'ONLINE') return 'Online';
  return value || '—';
}

export function billingLabel(plan: Pick<Plan, 'durationDays' | 'billingPeriod' | 'billingInterval' | 'durationLabel'>) {
  if (plan.durationLabel) return plan.durationLabel;
  const days = Number(plan.durationDays || 30);
  if (plan.billingPeriod && plan.billingInterval) {
    const unit = plan.billingPeriod === 'daily' ? 'day' : plan.billingPeriod === 'weekly' ? 'week' : plan.billingPeriod === 'yearly' ? 'year' : 'month';
    return `Every ${plan.billingInterval} ${unit}${plan.billingInterval === 1 ? '' : 's'}`;
  }
  if (days >= 330) return 'Every 1 year';
  if (days >= 150) return 'Every 6 months';
  if (days >= 75) return 'Every 3 months';
  if (days === 7) return 'Every 1 week';
  return 'Every 1 month';
}

export function durationFromBilling(interval: number, period: Plan['billingPeriod']) {
  const n = Math.max(1, Number(interval) || 1);
  if (period === 'daily') return Math.max(7, n);
  if (period === 'weekly') return n * 7;
  if (period === 'yearly') return n * 365;
  if (n === 1) return 30;
  if (n === 3) return 90;
  if (n === 6) return 180;
  return n * 30;
}

export function paymentBelongsToMember(payment: Payment, member: Member) {
  const ids = new Set([member.id, member.cognitoId, member.memberCode].filter(Boolean).map(String));
  if (ids.has(String(payment.memberId || ''))) return true;
  return Boolean(member.subscriptionId && payment.subscriptionId && member.subscriptionId === payment.subscriptionId);
}

export function isStaffEmail(email?: string) {
  const value = String(email || '').trim().toLowerCase();
  return value === 'admin@tekkzy.com' || value === 'manager@tekkzy.com';
}

export function isStaffMember(row?: Pick<Member, 'email' | 'userType' | 'cognitoRole'> | null) {
  const type = String(row?.userType || row?.cognitoRole || '').trim().toLowerCase();
  if (type === 'staff' || type === 'admin' || type === 'manager' || type === 'super_admin') return true;
  return isStaffEmail(row?.email);
}

export function initials(name?: string) {
  const parts = String(name || '?').trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?';
}
