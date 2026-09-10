import { repairCycleEnd } from '@shared/dates';
import type { Payment, PaymentMethod, PaymentStatus } from '@shared/types';
import { isSameDay, newId, newOfflinePaymentId } from '@/lib/format';
import { getNotificationProvider } from '@/providers/notification';
import { getPaymentProvider } from '@/providers/payment';
import { localStore } from '@/providers/database/LocalDatabase';
import { enqueueSync } from '@/services/sync';
import { apiRequest, tryApi } from '@/services/api';
import { renewMembership } from '@/services/memberships';

let paymentsCloudCache: Payment[] | null = null;
let paymentsCloudRefresh: Promise<Payment[] | null> | null = null;

export function bustPaymentsCache() {
  paymentsCloudCache = null;
}

async function refreshPaymentsCache(): Promise<Payment[] | null> {
  if (paymentsCloudRefresh) return paymentsCloudRefresh;
  paymentsCloudRefresh = tryApi<Payment[]>('/payments')
    .then((cloud) => {
      if (!cloud) return null;
      const rows = dedupePayments(cloud).filter(isRealPayment);
      paymentsCloudCache = rows;
      void Promise.all(rows.map((p) => localStore.putPayment(p)));
      void Promise.all(cloud.filter((p) => !isRealPayment(p)).map((p) => localStore.deletePayment(p.id)));
      return rows;
    })
    .finally(() => {
      paymentsCloudRefresh = null;
    });
  return paymentsCloudRefresh;
}

export { newOfflinePaymentId };

export function isDeskCollection(method?: string) {
  const value = String(method || '').toUpperCase();
  return value === 'CASH' || value === 'UPI';
}

export function paymentMethodLabel(method?: string) {
  const value = String(method || '').toUpperCase();
  if (value === 'CASH') return 'Cash';
  if (value === 'UPI') return 'UPI';
  if (value === 'RAZORPAY' || value === 'ONLINE') return 'Online';
  if (!value) return '—';
  return value.charAt(0) + value.slice(1).toLowerCase();
}

export function displayPaymentId(payment: Payment): string {
  if (isDeskCollection(payment.method)) {
    const stored = String(payment.paymentCode || payment.id || '');
    if (stored.startsWith('off_')) return stored;
    return stored ? `off_${stored.replace(/^pay-?/i, '')}` : stored;
  }
  return payment.razorpayPaymentId
    || payment.subscriptionId
    || payment.paymentLinkId
    || payment.paymentCode
    || payment.id;
}

export function paymentAmount(payment: Payment): number {
  const raw = payment.status === 'PAID' && !isDeskCollection(payment.method)
    ? (payment.netAmount ?? payment.amount)
    : payment.amount;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

export function isRealPayment(payment: Payment): boolean {
  if (paymentAmount(payment) <= 0) return false;
  const invoice = String(payment.invoiceNumber || '');
  const notes = String(payment.notes || '');
  if (/^DEV-CASH-/i.test(invoice) || /^PAY-DEV-/i.test(String(payment.paymentCode || ''))) return false;
  if (/created on terminal/i.test(notes)) return false;
  return true;
}

export function isPaidPayment(payment: Payment): boolean {
  return payment.status === 'PAID' && isRealPayment(payment);
}

export function paymentBelongsToMember(
  payment: Payment,
  member: {
    id: string;
    cognitoId?: string;
    memberCode?: string;
    deviceEnrollId?: string;
    phone?: string;
    subscriptionId?: string;
  },
): boolean {
  const ids = new Set(
    [member.id, member.cognitoId, member.memberCode].filter(Boolean).map(String),
  );
  if (ids.has(String(payment.memberId || ''))) return true;
  if (member.subscriptionId && payment.subscriptionId && member.subscriptionId === payment.subscriptionId) return true;
  return false;
}

export function paymentRenewDate(
  payment: Payment,
  member?: {
    joinDate?: string;
    renewDate?: string | null;
    renewDateSource?: string | null;
    durationDays?: number | null;
    plan?: { durationDays?: number };
    membership?: { startDate?: string; expiryDate?: string } | null;
  },
): string {
  const stored = payment.renewDate || member?.renewDate || member?.membership?.expiryDate || '';
  if (member?.renewDateSource === 'razorpay' || payment.subscriptionId) return stored;
  const cash = member?.renewDateSource === 'manual'
    || isDeskCollection((member as { paymentMethod?: string } | undefined)?.paymentMethod);
  if (cash) return member?.renewDate || member?.membership?.expiryDate || stored;
  return repairCycleEnd(
    member?.membership?.startDate || member?.joinDate,
    stored,
    member?.plan?.durationDays || member?.durationDays,
  );
}

export function dedupePayments(payments: Payment[]): Payment[] {
  const groups = new Map<string, Payment[]>();
  for (const payment of payments) {
    const day = payment.date?.slice(0, 10) ?? '';
    const invoice = (payment.invoiceNumber || '').trim();
    const link = (payment.paymentLinkUrl || '').trim();
    const key = invoice
      ? `inv:${invoice}`
      : link
        ? `link:${link}`
        : `stub:${payment.memberId}|${payment.amount}|${day}|${payment.method}|${payment.status}`;
    const list = groups.get(key) ?? [];
    list.push(payment);
    groups.set(key, list);
  }
  return [...groups.values()].map((list) =>
    list.slice().sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''))[0],
  );
}

export async function listPayments(opts?: { force?: boolean }): Promise<Payment[]> {
  if (!opts?.force && paymentsCloudCache) return paymentsCloudCache;
  const cloud = await refreshPaymentsCache();
  if (cloud) return cloud;
  const local = dedupePayments(await localStore.allPayments());
  const rows = local.filter(isRealPayment);
  await Promise.all(local.filter((p) => !isRealPayment(p)).map((p) => localStore.deletePayment(p.id)));
  return rows;
}

export async function recordPayment(input: {
  memberId: string;
  planId: string;
  membershipId?: string;
  amount: number;
  method: PaymentMethod | 'ONLINE';
  status?: PaymentStatus;
  notes?: string;
  renew?: boolean;
  durationDays?: number;
  renewDate?: string;
  phone?: string;
  email?: string;
  planName?: string;
}): Promise<Payment> {
  paymentsCloudCache = null;
  const method = input.method === 'ONLINE' ? 'RAZORPAY' : input.method;
  if (method === 'RAZORPAY') {
    const link = await apiRequest<Payment>('/payments', {
      method: 'POST',
      body: JSON.stringify({
        memberId: input.memberId,
        planId: input.planId,
        planName: input.planName,
        amount: input.amount,
        durationDays: input.durationDays ?? 30,
        phone: input.phone,
        email: input.email,
      }),
    });
    await localStore.putPayment(link);
    return link;
  }
  if (isDeskCollection(method)) {
    const remote = await tryApi<{ payment?: { id?: string } }>(`/members/${input.memberId}`, {
      method: 'PUT',
      body: JSON.stringify({
        phone: input.phone,
        email: input.email,
        planId: input.planId,
        planName: input.planName,
        amount: input.amount,
        durationDays: input.durationDays,
        paymentMethod: method,
        renewDate: input.renewDate,
        deviceEnd: input.renewDate,
        renewDateSource: 'manual',
      }),
    });
    const rows = await listPayments({ force: true });
    const created = rows.find((row) => row.id === remote?.payment?.id)
      || rows.find((row) => paymentBelongsToMember(row, { id: input.memberId }) && isDeskCollection(row.method));
    if (created) return created;
  }
  if (input.renew && input.membershipId) {
    const { payment } = await renewMembership(input.membershipId, {
      method,
      amount: input.amount,
    });
    return payment;
  }

  const offlineId = isDeskCollection(method) ? newOfflinePaymentId() : newId('pay');
  const payment: Payment = {
    id: offlineId,
    paymentCode: offlineId,
    memberId: input.memberId,
    membershipId: input.membershipId,
    planId: input.planId,
    amount: input.amount,
    date: new Date().toISOString().slice(0, 10),
    method,
    status: input.status ?? 'PAID',
    invoiceNumber: `INV-${new Date().getFullYear()}-${newId('I').slice(-6).toUpperCase()}`,
    notes: input.notes,
    createdAt: new Date().toISOString(),
  };
  await localStore.putPayment(payment);
  await enqueueSync('payment', payment.id, 'CREATE', payment);
  if (payment.status === 'PAID' && payment.amount > 0) {
    await tryApi(`/members/${input.memberId}`, {
      method: 'PUT',
      body: JSON.stringify({
        paymentMethod: isDeskCollection(method) ? method : undefined,
        amount: input.amount,
        planId: input.planId,
        durationDays: input.durationDays,
      }),
    });
  }

  const member = await localStore.getMember(input.memberId);
  if (member && payment.status === 'PAID') {
    await getNotificationProvider().send({
      to: member.phone,
      title: 'Payment successful',
      message: `Received ₹${payment.amount} for invoice ${payment.invoiceNumber}.`,
      channel: 'WHATSAPP',
    });
  }
  return payment;
}

export async function startOnlineCheckout(amount: number, memberId: string, receipt: string) {
  return getPaymentProvider().createOrder({
    amount,
    currency: 'INR',
    receipt,
    memberId,
  });
}

export function paymentKpis(payments: Payment[]) {
  const today = payments.filter((p) => p.status === 'PAID' && isSameDay(p.date));
  const month = new Date().getMonth();
  const year = new Date().getFullYear();
  const monthly = payments.filter((p) => {
    const d = new Date(p.date);
    return p.status === 'PAID' && d.getMonth() === month && d.getFullYear() === year;
  });
  return {
    todayRevenue: today.filter(isPaidPayment).reduce((s, p) => s + paymentAmount(p), 0),
    monthlyRevenue: monthly.filter(isPaidPayment).reduce((s, p) => s + paymentAmount(p), 0),
    pending: payments.filter((p) => p.status === 'PENDING').length,
    failed: payments.filter((p) => p.status === 'FAILED').length,
  };
}
