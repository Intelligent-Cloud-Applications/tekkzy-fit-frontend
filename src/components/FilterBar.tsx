import type { ReactNode } from 'react';
import { ThemedSelect } from './ThemedSelect';

export function FilterBar({ children }: { children: ReactNode }) {
  return <div className="mb-3 flex w-full flex-row flex-wrap items-center gap-2">{children}</div>;
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
