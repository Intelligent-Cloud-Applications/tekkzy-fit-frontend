import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function ChartCard({
  title,
  children,
  action,
  className,
  fit = false,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
  fit?: boolean;
}) {
  return (
    <section className={cn(
      fit ? 'surface min-w-0 overflow-visible' : 'surface flex h-full min-w-0 flex-col overflow-hidden',
      className,
    )}>
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
        <h2 className="text-[13px] font-semibold tracking-tight">{title}</h2>
        {action}
      </header>
      <div className={fit ? 'p-4 sm:p-5' : 'min-h-0 flex-1 p-4 sm:p-5'}>{children}</div>
    </section>
  );
}
