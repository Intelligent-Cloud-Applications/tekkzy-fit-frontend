export function todayYmd(timeZone = 'Asia/Kolkata'): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function parseYmd(value?: string | null): { y: number; m: number; d: number } | null {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  return { y: Number(match[1]), m: Number(match[2]) - 1, d: Number(match[3]) };
}

export function formatYmd(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function addCalendarDays(start: string, days: number): string {
  const parsed = parseYmd(start);
  if (!parsed) return addCalendarDays(todayYmd(), days);
  const date = new Date(parsed.y, parsed.m, parsed.d + Number(days || 0));
  return formatYmd(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addCalendarMonths(start: string, months: number): string {
  const parsed = parseYmd(start);
  if (!parsed) return addCalendarMonths(todayYmd(), months);
  const last = new Date(parsed.y, parsed.m + Number(months || 0) + 1, 0).getDate();
  const day = Math.min(parsed.d, last);
  const date = new Date(parsed.y, parsed.m + Number(months || 0), day);
  return formatYmd(date.getFullYear(), date.getMonth(), date.getDate());
}

export function monthsFromPlanDays(days: number): number | null {
  const n = Number(days || 0);
  if (n === 365 || n === 366) return 12;
  if (n === 180) return 6;
  if (n === 90) return 3;
  if (n === 28 || n === 29 || n === 30 || n === 31) return 1;
  return null;
}

export function addPlanDuration(start: string, days: number): string {
  const months = monthsFromPlanDays(days);
  return months != null ? addCalendarMonths(start, months) : addCalendarDays(start, days);
}

export function ymdDay(value?: string | null): number {
  return parseYmd(value)?.d ?? 0;
}

export function diffDays(a: string, b: string): number {
  const left = parseYmd(a);
  const right = parseYmd(b);
  if (!left || !right) return 0;
  return Math.round(
    (Date.UTC(left.y, left.m, left.d) - Date.UTC(right.y, right.m, right.d)) / 86_400_000,
  );
}

export function repairCycleEnd(
  start?: string | null,
  stored?: string | null,
  days?: number | null,
): string {
  const duration = Number(days || 30);
  if (!start) return stored || '';
  const intended = addPlanDuration(start, duration);
  if (!stored) return intended;
  if (ymdDay(stored) === ymdDay(start)) return stored;
  if (Math.abs(diffDays(stored, intended)) <= 4) return intended;
  return stored;
}
