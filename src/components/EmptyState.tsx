import type { ReactNode } from 'react';

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="px-4 py-14 text-center">
      <div className="text-[14px] font-semibold tracking-tight text-ink">{title}</div>
      {description ? <p className="mx-auto mt-1 max-w-sm text-[13px] text-ink-soft">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
