import { cn } from '@/lib/cn';

export function DateRangePicker({
  from,
  to,
  onChange,
  className,
}: {
  from: string;
  to: string;
  onChange: (next: { from: string; to: string }) => void;
  className?: string;
}) {
  return (
    <div className={cn('grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:shrink-0 sm:items-center sm:gap-1.5', className)}>
      <input
        type="date"
        value={from}
        onChange={(e) => onChange({ from: e.target.value, to })}
        className="h-10 w-full min-w-0 rounded-full border border-line bg-[var(--input-bg)] px-2.5 text-[13px] text-ink outline-none transition focus:border-accent/70 focus:ring-2 focus:ring-accent/15 sm:w-[9.75rem] sm:px-3"
      />
      <input
        type="date"
        value={to}
        onChange={(e) => onChange({ from, to: e.target.value })}
        className="h-10 w-full min-w-0 rounded-full border border-line bg-[var(--input-bg)] px-2.5 text-[13px] text-ink outline-none transition focus:border-accent/70 focus:ring-2 focus:ring-accent/15 sm:w-[9.75rem] sm:px-3"
      />
    </div>
  );
}
