import { applyMembershipRules, daysUntil } from '@shared/access/checkAccess';
import type { AccessEvent, AttendanceRecord, DashboardKpis, Member, Membership, MembershipPlan, Payment } from '@shared/types';
import { isSameDay } from '@/lib/format';
import { localStore } from '@/providers/database/LocalDatabase';
import { peopleCurrentlyInside } from '@/services/access';
import { listCloudMembersLite, type MemberRow } from '@/services/members';
import { listPayments } from '@/services/payments';

export type ExpiringRow = {
  membership: Membership;
  member?: Member;
  plan?: MembershipPlan;
  payment?: Payment;
  daysLeft: number;
};

type MemberLike = Member & {
  membership?: Membership;
  renewDate?: string | null;
  paymentStatus?: string;
  plan?: MembershipPlan;
};

function expiryOf(row: MemberLike) {
  return row.renewDate || row.membership?.expiryDate || '';
}

function cycleStatus(row: MemberLike) {
  if (row.membership) return applyMembershipRules(row.membership).status;
  const expiry = expiryOf(row);
  if (!expiry) return row.status === 'INACTIVE' ? 'EXPIRED' : 'ACTIVE';
  const left = daysUntil(expiry);
  if (left < 0) return 'EXPIRED';
  if (left <= 7) return 'EXPIRING';
  return 'ACTIVE';
}

export function expiringFromMembers(members: MemberLike[], days = 7): ExpiringRow[] {
  return members
    .map((member) => {
      const expiry = expiryOf(member);
      if (!expiry) return null;
      const left = daysUntil(expiry);
      if (left < 0 || left > days) return null;
      const membership = member.membership
        ? applyMembershipRules(member.membership)
        : {
            id: `ms-${member.id}`,
            memberId: member.id,
            planId: member.plan?.id || '',
            startDate: member.joinDate,
            expiryDate: expiry,
            price: 0,
            discount: 0,
            paymentStatus: (member.paymentStatus === 'PAID' ? 'PAID' : 'PENDING') as Payment['status'],
            autoRenewal: false,
            status: 'EXPIRING' as const,
            accessStatus: 'ACTIVE' as const,
            createdAt: member.createdAt,
            updatedAt: member.updatedAt,
          };
      return {
        membership,
        member,
        plan: member.plan,
        daysLeft: left,
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
    .sort((a, b) => a.daysLeft - b.daysLeft);
}

export function kpisFromSlices(input: {
  members: MemberLike[];
  memberships: Membership[];
  attendance: AttendanceRecord[];
  payments: Payment[];
  events: AccessEvent[];
  currentlyInside: number;
}): DashboardKpis {
  const statuses = input.members.map(cycleStatus);
  return {
    totalMembers: input.members.length,
    activeMembers: statuses.filter((status) => status === 'ACTIVE' || status === 'EXPIRING').length,
    expiringSoon: statuses.filter((status) => status === 'EXPIRING').length,
    expired: statuses.filter((status) => status === 'EXPIRED').length,
    todayAttendance: input.attendance.filter((a) => isSameDay(a.timestamp) && a.status === 'GRANTED').length,
    todayRevenue: input.payments.filter((p) => p.status === 'PAID' && isSameDay(p.date)).reduce((s, p) => s + p.amount, 0),
    currentlyInside: input.currentlyInside,
    accessDeniedToday:
      input.events.filter((e) => isSameDay(e.timestamp) && e.decision === 'DENIED').length
      || input.attendance.filter((a) => isSameDay(a.timestamp) && (a.status === 'DENIED' || a.status === 'EXPIRED')).length,
  };
}

export async function getDashboardKpis(): Promise<DashboardKpis> {
  const [members, memberships, attendance, payments, events, currentlyInside] = await Promise.all([
    listCloudMembersLite(),
    localStore.allMemberships(),
    localStore.allAttendance(),
    listPayments(),
    localStore.allAccessEvents(),
    peopleCurrentlyInside(),
  ]);
  return kpisFromSlices({ members, memberships, attendance, payments, events, currentlyInside });
}

export async function expiringWithinDays(days = 7) {
  const [cloud, local, memberships, plans] = await Promise.all([
    listCloudMembersLite().catch(() => [] as MemberRow[]),
    localStore.allMembers(),
    localStore.allMemberships(),
    localStore.allPlans(),
  ]);
  const fromMembers = expiringFromMembers(cloud.length ? cloud : local, days);
  if (fromMembers.length) return fromMembers;
  return memberships
    .map((m) => applyMembershipRules(m))
    .filter((m) => {
      const left = daysUntil(m.expiryDate);
      return left >= 0 && left <= days && m.status !== 'CANCELLED' && m.status !== 'SUSPENDED';
    })
    .map((m) => {
      const member = local.find((x) => x.id === m.memberId);
      const plan = plans.find((p) => p.id === m.planId);
      return {
        membership: m,
        member,
        plan,
        daysLeft: daysUntil(m.expiryDate),
      };
    })
    .sort((a, b) => a.daysLeft - b.daysLeft);
}
