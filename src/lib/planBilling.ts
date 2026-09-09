import type { BillingPeriod, MembershipPlan } from '@shared/types';

export const BILLING_PERIODS: { value: BillingPeriod; label: string }[] = [
  { value: 'daily', label: 'Day(s)' },
  { value: 'weekly', label: 'Week(s)' },
  { value: 'monthly', label: 'Month(s)' },
  { value: 'yearly', label: 'Year(s)' },
];

export function minBillingInterval(period: BillingPeriod): number {
  return period === 'daily' ? 7 : 1;
}

export function durationDaysFromBilling(interval: number, period: BillingPeriod): number {
  const n = Math.max(minBillingInterval(period), Number(interval) || minBillingInterval(period));
  if (period === 'daily') return n;
  if (period === 'weekly') return n * 7;
  if (period === 'yearly') return n * 365;
  if (n === 1) return 30;
  if (n === 3) return 90;
  if (n === 6) return 180;
  return n * 30;
}

export function billingFromPlan(plan: Pick<MembershipPlan, 'durationDays' | 'billingPeriod' | 'billingInterval'>): {
  interval: number;
  period: BillingPeriod;
} {
  if (plan.billingPeriod && plan.billingInterval) {
    return { interval: Number(plan.billingInterval) || 1, period: plan.billingPeriod };
  }
  const days = Number(plan.durationDays || 30);
  if (days >= 330) return { interval: Math.max(1, Math.round(days / 365)), period: 'yearly' };
  if (days >= 150) return { interval: 6, period: 'monthly' };
  if (days >= 75) return { interval: 3, period: 'monthly' };
  if (days === 7) return { interval: 1, period: 'weekly' };
  if (days === 1) return { interval: 1, period: 'daily' };
  return { interval: 1, period: 'monthly' };
}

export function billingLabel(interval: number, period: BillingPeriod): string {
  const unit = period === 'daily' ? 'day' : period === 'weekly' ? 'week' : period === 'yearly' ? 'year' : 'month';
  return `Every ${interval} ${unit}${interval === 1 ? '' : 's'}`;
}
