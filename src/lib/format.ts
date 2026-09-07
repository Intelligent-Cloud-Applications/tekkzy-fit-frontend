import { format, formatDistanceToNow, parseISO } from 'date-fns';

export function formatINR(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(value?: string): string {
  if (!value) return '—';
  return format(parseISO(value.length === 10 ? `${value}T00:00:00` : value), 'dd/MM/yyyy');
}

export function formatTime(value?: string): string {
  if (!value) return '—';
  return format(parseISO(value), 'hh:mm a');
}

export function formatDateTime(value?: string): string {
  if (!value) return '—';
  return format(parseISO(value), 'dd/MM/yyyy, hh:mm a');
}

export function formatRelative(value?: string): string {
  if (!value) return '—';
  return formatDistanceToNow(parseISO(value), { addSuffix: true });
}

export function todayISODate(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

export function localISODate(compare = new Date()): string {
  const y = compare.getFullYear();
  const m = String(compare.getMonth() + 1).padStart(2, '0');
  const d = String(compare.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function isSameDay(value: string, compare = new Date()): boolean {
  if (!value) return false;
  if (value.length === 10) return value === localISODate(compare);
  const d = parseISO(value);
  return (
    d.getFullYear() === compare.getFullYear() &&
    d.getMonth() === compare.getMonth() &&
    d.getDate() === compare.getDate()
  );
}

export function enrollKey(value?: string): string {
  if (!value) return '';
  const digits = value.replace(/\D/g, '');
  if (!digits) return value.trim();
  return String(Number(digits));
}

export function foldName(value?: string): string {
  return (value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+\d+$/, '')
    .replace(/\b(\w+)(?:\s+\1)+\b/g, '$1')
    .replace(/\s+/g, ' ');
}

export function deviceLogStamp(time?: string): string {
  if (!time) return '';
  const parsed = new Date(time.includes('T') ? time : time.replace(' ', 'T'));
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString();
}

export function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

export function newOfflinePaymentId() {
  return `off_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}
