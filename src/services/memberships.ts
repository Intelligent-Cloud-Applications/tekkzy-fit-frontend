import { applyMembershipRules } from '@shared/access/checkAccess';
import { addPlanDuration } from '@shared/dates';
import type { Membership, MembershipPlan, Payment, PaymentMethod } from '@shared/types';
import { newId, newOfflinePaymentId } from '@/lib/format';
import { getDeviceProvider } from '@/providers/device';
import { localStore } from '@/providers/database/LocalDatabase';
import { apiRequest } from '@/services/api';
import { enqueueSync } from '@/services/sync';

export function addDays(dateIso: string, days: number): string {
  return addPlanDuration(dateIso, days);
}

export async function listMemberships(): Promise<Membership[]> {
  return (await localStore.allMemberships()).map((m) => applyMembershipRules(m));
}

export async function currentMembership(memberId: string): Promise<Membership | undefined> {
  const rows = (await localStore.membershipsFor(memberId))
    .map((m) => applyMembershipRules(m))
    .sort((a, b) => b.expiryDate.localeCompare(a.expiryDate));
  return rows[0];
}

export async function createMembership(input: {
  memberId: string;
  planId: string;
  startDate: string;
  discount?: number;
  autoRenewal?: boolean;
  paymentStatus?: Payment['status'];
}): Promise<Membership> {
  const plan = (await localStore.allPlans()).find((p) => p.id === input.planId);
  if (!plan) throw new Error('Plan not found');
  const now = new Date().toISOString();
  const raw: Membership = {
    id: newId('ms'),
    memberId: input.memberId,
    planId: input.planId,
    startDate: input.startDate,
    expiryDate: addDays(input.startDate, plan.durationDays),
    price: plan.price,
    discount: input.discount ?? 0,
    paymentStatus: input.paymentStatus ?? 'PENDING',
    autoRenewal: input.autoRenewal ?? false,
    status: 'ACTIVE',
    accessStatus: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
  };
  const membership = applyMembershipRules(raw);
  await localStore.putMembership(membership);
  await enqueueSync('membership', membership.id, 'CREATE', membership);
  return membership;
}

export async function updateMembershipStatus(
  id: string,
  status: Membership['status'],
): Promise<Membership> {
  const all = await localStore.allMemberships();
  const current = all.find((m) => m.id === id);
  if (!current) throw new Error('Membership not found');
  const next = applyMembershipRules({
    ...current,
    status,
    updatedAt: new Date().toISOString(),
  });
  await localStore.putMembership(next);
  await enqueueSync('membership', id, 'UPDATE', next);
  return next;
}

export async function renewMembership(
  membershipId: string,
  options?: { method?: PaymentMethod; amount?: number },
): Promise<{ membership: Membership; payment: Payment }> {
  const all = await localStore.allMemberships();
  const current = all.find((m) => m.id === membershipId);
  if (!current) throw new Error('Membership not found');
  const plan = (await localStore.allPlans()).find((p) => p.id === current.planId);
  if (!plan) throw new Error('Plan not found');

  const base =
    new Date(current.expiryDate) > new Date() ? current.expiryDate : new Date().toISOString().slice(0, 10);
  const next = applyMembershipRules({
    ...current,
    startDate: current.startDate,
    expiryDate: addDays(base, plan.durationDays),
    paymentStatus: 'PAID',
    status: 'ACTIVE',
    accessStatus: 'ACTIVE',
    updatedAt: new Date().toISOString(),
  });
  await localStore.putMembership(next);

  const method = options?.method ?? 'UPI';
  const offlineId = method === 'RAZORPAY' ? newId('pay') : newOfflinePaymentId();
  const payment: Payment = {
    id: offlineId,
    paymentCode: offlineId,
    memberId: current.memberId,
    membershipId: next.id,
    planId: current.planId,
    amount: options?.amount ?? plan.price - current.discount,
    date: new Date().toISOString().slice(0, 10),
    method,
    status: 'PAID',
    invoiceNumber: `INV-${new Date().getFullYear()}-${newId('I').slice(-6).toUpperCase()}`,
    renewDate: next.expiryDate,
    createdAt: new Date().toISOString(),
  };
  await localStore.putPayment(payment);
  await enqueueSync('membership', next.id, 'UPDATE', next);
  await enqueueSync('payment', payment.id, 'CREATE', payment);

  const member = await localStore.getMember(current.memberId);
  if (member) {
    try {
      await getDeviceProvider().syncMember(member);
    } catch {
      /* mock or unconfigured hardware */
    }
  }

  return { membership: next, payment };
}

export async function changePlan(membershipId: string, planId: string): Promise<Membership> {
  const all = await localStore.allMemberships();
  const current = all.find((m) => m.id === idSafe(membershipId));
  if (!current) throw new Error('Membership not found');
  const plan = (await localStore.allPlans()).find((p) => p.id === planId);
  if (!plan) throw new Error('Plan not found');
  const next = applyMembershipRules({
    ...current,
    planId,
    price: plan.price,
    expiryDate: addDays(current.startDate, plan.durationDays),
    updatedAt: new Date().toISOString(),
  });
  await localStore.putMembership(next);
  await enqueueSync('membership', next.id, 'UPDATE', next);
  return next;
}

function idSafe(id: string): string {
  return id;
}

export async function listPlans(): Promise<MembershipPlan[]> {
  try {
    const remote = await apiRequest<MembershipPlan[]>('/plans');
    if (Array.isArray(remote)) {
      await localStore.replacePlans(remote);
      return remote;
    }
  } catch {
    /* keep whatever is already on this computer */
  }
  return localStore.allPlans();
}

export async function savePlan(plan: MembershipPlan): Promise<MembershipPlan> {
  const saved = await apiRequest<MembershipPlan>(`/plans/${encodeURIComponent(plan.id)}`, {
    method: 'PUT',
    body: JSON.stringify(plan),
  });
  await localStore.putPlan(saved);
  return saved;
}

export async function removePlan(id: string): Promise<void> {
  await apiRequest(`/plans/${encodeURIComponent(id)}`, { method: 'DELETE' });
  await localStore.deletePlan(id);
}
