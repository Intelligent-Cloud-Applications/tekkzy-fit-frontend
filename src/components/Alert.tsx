import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function Alert({
  tone = 'info',
  title,
  children,
  action,
}: {
  tone?: 'info' | 'ok' | 'warn' | 'bad';
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div
      className={cn(
        'surface mb-5 w-full px-4 py-3.5 sm:px-5',
        tone === 'ok' && 'border-ok/25',
        tone === 'warn' && 'border-warn/30',
        tone === 'bad' && 'border-bad/30',
      )}
    >
      <div
        className={cn(
          'text-[13px] font-semibold tracking-tight',
          tone === 'ok' && 'text-ok',
          tone === 'warn' && 'text-warn',
          tone === 'bad' && 'text-bad',
        )}
      >
        {title}
      </div>
      {children ? <div className="mt-1 text-[13px] leading-relaxed text-ink-soft">{children}</div> : null}
      {action ? <div className="mt-3 flex flex-wrap gap-2">{action}</div> : null}
    </div>
  );
}
