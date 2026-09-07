import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Button } from './Button';

export function RowActions({ children }: { children: ReactNode }) {
  return <div className="flex items-center gap-1.5">{children}</div>;
}

export function IconAction({
  label,
  icon: Icon,
  onClick,
  variant = 'secondary',
  loading,
  disabled,
}: {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  variant?: 'secondary' | 'danger';
  loading?: boolean;
  disabled?: boolean;
}) {
  return (
    <Button
      size="sm"
      variant={variant}
      className="w-8 px-0"
      title={label}
      aria-label={label}
      onClick={onClick}
      loading={loading}
      disabled={disabled}
    >
      {loading ? null : <Icon className="h-3.5 w-3.5" />}
    </Button>
  );
}
