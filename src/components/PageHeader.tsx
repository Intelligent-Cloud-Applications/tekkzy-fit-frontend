import type { ReactNode } from 'react';

export function PageHeader({
  title,
  description,
  actions,
  compact = false,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={`mb-2 flex w-full flex-col gap-2 sm:flex-row sm:items-end sm:justify-between ${compact ? 'sm:mb-3' : 'sm:mb-6'}`}>
      <div className="min-w-0 flex-1">
        <h1 className="font-display text-[1.25rem] font-bold leading-[1.1] tracking-tight text-ink sm:text-[1.75rem]">
          {title}
        </h1>
        {description ? <p className="mt-1.5 hidden max-w-none text-[13px] leading-relaxed text-ink-soft lg:block">{description}</p> : null}
      </div>
      {actions ? (
        <div className="flex w-full shrink-0 items-stretch gap-2 sm:w-auto sm:flex-wrap sm:items-center [&>*]:min-h-10 [&>*]:flex-1 sm:[&>*]:flex-none">
          {actions}
        </div>
      ) : null}
    </div>
  );
}
