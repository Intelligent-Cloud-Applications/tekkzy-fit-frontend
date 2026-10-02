import type {
  AccessCheckInput,
  AccessCheckResult,
  Membership,
  MembershipStatus,
} from '../types';

const DAY_MS = 24 * 60 * 60 * 1000;
const EXPIRING_WINDOW_DAYS = 7;

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function daysUntil(dateIso: string, now = new Date()): number {
  const target = startOfDay(new Date(dateIso));
  const today = startOfDay(now);
  return Math.round((target.getTime() - today.getTime()) / DAY_MS);
}

export function deriveMembershipStatus(
  membership: Membership,
  now = new Date(),
): MembershipStatus {
  if (membership.status === 'SUSPENDED' || membership.status === 'CANCELLED') {
    return membership.status;
  }
  const remaining = daysUntil(membership.expiryDate, now);
  if (remaining < 0) return 'EXPIRED';
  if (remaining <= EXPIRING_WINDOW_DAYS) return 'EXPIRING';
  return 'ACTIVE';
}

export function applyMembershipRules(
  membership: Membership,
  now = new Date(),
): Membership {
  const status = deriveMembershipStatus(membership, now);
  const accessStatus =
    status === 'ACTIVE' || status === 'EXPIRING' ? 'ACTIVE' : 'DENIED';
  return { ...membership, status, accessStatus };
}

/**
 * Production access decision. Used by the live Access Control page,
 * MockDeviceProvider simulations, and the Node.js access service.
 * Do not create a separate demo-only decision path.
 */
export function checkAccess(input: AccessCheckInput): AccessCheckResult {
  const { member, membership, now = new Date() } = input;
  const allowExpired = input.allowExpired === true;
  const allowSuspended = input.allowSuspended === true;

  if (!member) {
    return {
      decision: 'DENIED',
      reason: 'UNKNOWN_MEMBER',
      attendanceStatus: 'UNKNOWN',
    };
  }

  if (!membership) {
    return {
      decision: 'DENIED',
      reason: 'NO_ACTIVE_MEMBERSHIP',
      attendanceStatus: 'DENIED',
      member,
    };
  }

  const live = applyMembershipRules(membership, now);

  if (live.status === 'SUSPENDED' && !allowSuspended) {
    return {
      decision: 'DENIED',
      reason: 'SUSPENDED_MEMBERSHIP',
      attendanceStatus: 'SUSPENDED',
      member,
      membership: live,
    };
  }

  if (live.status === 'CANCELLED') {
    return {
      decision: 'DENIED',
      reason: 'NO_ACTIVE_MEMBERSHIP',
      attendanceStatus: 'DENIED',
      member,
      membership: live,
    };
  }

  if (live.status === 'EXPIRED' && !allowExpired) {
    return {
      decision: 'DENIED',
      reason: 'EXPIRED_MEMBERSHIP',
      attendanceStatus: 'EXPIRED',
      member,
      membership: live,
    };
  }

  return {
    decision: 'GRANTED',
    reason: 'ACCESS_GRANTED',
    attendanceStatus: 'GRANTED',
    member,
    membership: live,
  };
}

export function reasonLabel(reason: AccessCheckResult['reason']): string {
  switch (reason) {
    case 'ACCESS_GRANTED':
      return 'Membership active';
    case 'UNKNOWN_MEMBER':
      return 'Face not recognized';
    case 'EXPIRED_MEMBERSHIP':
      return 'Membership expired';
    case 'SUSPENDED_MEMBERSHIP':
      return 'Membership suspended';
    case 'NO_ACTIVE_MEMBERSHIP':
      return 'No active membership';
    case 'DEVICE_ERROR':
      return 'Device error';
    default:
      return 'Access denied';
  }
}
