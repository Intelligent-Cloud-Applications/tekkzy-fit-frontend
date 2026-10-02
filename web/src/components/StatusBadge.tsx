import { cn } from '@/lib/cn';

const styles: Record<string, string> = {
  ACTIVE: 'bg-ok-bg text-ok',
  GRANTED: 'bg-ok-bg text-ok',
  PAID: 'bg-ok-bg text-ok',
  UPI: 'bg-ok-bg text-ok',
  ONLINE: 'bg-ok-bg text-ok',
  REGISTERED: 'bg-ok-bg text-ok',
  EXPIRING: 'bg-warn-bg text-warn',
  PAUSED: 'bg-paused-bg text-paused',
  PENDING: 'bg-warn-bg text-warn',
  EXPIRED: 'bg-bad-bg text-bad',
  DENIED: 'bg-bad-bg text-bad',
  FAILED: 'bg-bad-bg text-bad',
  SUSPENDED: 'bg-bad-bg text-bad',
  UNKNOWN: 'bg-mute-bg text-mute',
  CANCELLED: 'bg-bad-bg text-bad',
  INACTIVE: 'bg-mute-bg text-mute',
  OFFLINE: 'bg-mute-bg text-mute',
  REFUNDED: 'bg-mute-bg text-mute',
  UNLOCKED: 'bg-ok-bg text-ok',
  LOCKED: 'bg-mute-bg text-mute',
  PRESENT: 'bg-ok-bg text-ok',
  ABSENT: 'bg-mute-bg text-mute',
};

export function StatusBadge({ value, compact }: { value: string; compact?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full font-bold uppercase tracking-[0.06em]',
        compact ? 'px-1.5 py-px text-[9px]' : 'px-2 py-0.5 text-[10px] tracking-[0.08em]',
        styles[value] ?? 'bg-mute-bg text-mute',
      )}
    >
      {value.replaceAll('_', ' ')}
    </span>
  );
}
