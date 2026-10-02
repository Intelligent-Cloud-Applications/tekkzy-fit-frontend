import type { ReactNode } from 'react';
import { ThemedSelect } from './ThemedSelect';

export function FilterBar({ children }: { children: ReactNode }) {
  return <div className="mb-3 flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">{children}</div>;
}

export function Select({
  value,
  onChange,
  children,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <ThemedSelect pill value={value} onValue={onChange} className={className}>
      {children}
    </ThemedSelect>
  );
}
