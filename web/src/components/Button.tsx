import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  loading,
  disabled,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; loading?: boolean }) {
  return (
    <button
      className={cn(
        'tap inline-flex items-center justify-center gap-1.5 rounded-full font-semibold tracking-tight disabled:cursor-not-allowed disabled:opacity-40',
        size === 'sm' ? 'min-h-8 px-2.5 text-[12px]' : 'min-h-10 px-3.5 text-[13px]',
        variant === 'primary' && 'bg-accent text-white hover:brightness-110',
        variant === 'secondary' && 'border border-line bg-[var(--hover-fill)] text-ink hover:brightness-105',
        variant === 'ghost' && 'text-ink-soft hover:bg-[var(--hover-fill)] hover:text-ink',
        variant === 'danger' && 'bg-bad text-white hover:brightness-110',
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <span className="tf-btn-loader" aria-hidden /> : null}
      {children}
    </button>
  );
}
