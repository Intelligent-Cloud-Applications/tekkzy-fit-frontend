import type { ReactNode } from 'react';

export function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: 'default' | 'ok' | 'bad' | 'warn';
}) {
  return (
    <div className="surface h-full min-w-0 px-3 py-3 sm:px-4 sm:py-3.5">
      <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-soft sm:text-[11px] sm:tracking-[0.12em]">{label}</div>
      <div className="mt-1.5 break-all font-display text-[1.2rem] font-bold leading-none tabular-nums tracking-tight text-ink sm:text-[1.35rem] xl:text-[1.55rem]">
        {value}
      </div>
      {hint ? <div className="mt-1.5 text-[11px] text-ink-soft">{hint}</div> : null}
    </div>
  );
}
