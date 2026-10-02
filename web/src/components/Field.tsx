import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react';

export { NativeSelect } from './ThemedSelect';

export function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={`block text-[12px] ${className ?? ''}`}>
      <span className="mb-1.5 block font-semibold tracking-tight text-ink-soft">{label}</span>
      {children}
    </div>
  );
}

const control =
  'w-full rounded-[12px] border border-line bg-[var(--input-bg)] px-3 text-[13px] text-ink outline-none transition placeholder:text-ink-soft focus:border-accent/70 focus:ring-2 focus:ring-accent/15 disabled:cursor-not-allowed disabled:opacity-55';

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`h-10 ${control} ${props.className ?? ''}`} />;
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${control} py-2 ${props.className ?? ''}`} />;
}

