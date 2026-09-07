export function DateRangePicker({
  from,
  to,
  onChange,
}: {
  from: string;
  to: string;
  onChange: (next: { from: string; to: string }) => void;
}) {
  return (
    <div className="grid w-full grid-cols-2 items-center gap-2 lg:flex lg:w-auto lg:shrink-0 lg:gap-1.5">
      <input
        type="date"
        value={from}
        onChange={(e) => onChange({ from: e.target.value, to })}
        className="h-10 w-full min-w-0 rounded-full border border-line bg-[var(--input-bg)] px-3 text-[13px] text-ink outline-none transition focus:border-accent/70 focus:ring-2 focus:ring-accent/15 lg:w-auto"
      />
      <input
        type="date"
        value={to}
        onChange={(e) => onChange({ from, to: e.target.value })}
        className="h-10 w-full min-w-0 rounded-full border border-line bg-[var(--input-bg)] px-3 text-[13px] text-ink outline-none transition focus:border-accent/70 focus:ring-2 focus:ring-accent/15 lg:w-auto"
      />
    </div>
  );
}
