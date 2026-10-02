import {
  Children,
  isValidElement,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';

type Option = { value: string; label: string };

function readOptions(children: ReactNode): Option[] {
  return Children.toArray(children).flatMap((child) => {
    if (!isValidElement<{ value?: string | number; children?: ReactNode }>(child)) return [];
    const label = String(child.props.children ?? child.props.value ?? '');
    const value = child.props.value;
    if (value === undefined && child.type !== 'option') return [];
    return [{ value: String(value ?? label), label }];
  });
}

export function ThemedSelect({
  value,
  onValue,
  children,
  disabled,
  className,
  pill = false,
}: {
  value?: string | number;
  onValue: (value: string) => void;
  children: ReactNode;
  disabled?: boolean;
  className?: string;
  pill?: boolean;
}) {
  const options = useMemo(() => readOptions(children), [children]);
  const current = String(value ?? '');
  const selected = options.find((o) => o.value === current) ?? options[0];
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ top: 0, left: 0, width: 0, maxHeight: 280 });

  function place() {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const gap = 6;
    const pad = 12;
    const width = Math.min(Math.max(r.width, 176), window.innerWidth - pad * 2);
    const spaceBelow = window.innerHeight - r.bottom - pad;
    const spaceAbove = r.top - pad;
    const maxHeight = Math.min(280, Math.max(120, Math.max(spaceBelow, spaceAbove)));
    const openUp = spaceBelow < 160 && spaceAbove > spaceBelow;
    let left = r.left;
    if (left + width > window.innerWidth - pad) {
      left = r.right - width;
    }
    left = Math.min(Math.max(pad, left), window.innerWidth - width - pad);
    setBox({
      top: openUp ? Math.max(pad, r.top - maxHeight - gap) : r.bottom + gap,
      left,
      width,
      maxHeight,
    });
  }

  useLayoutEffect(() => {
    if (!open) return;
    place();
    const onMove = () => place();
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    return () => {
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex h-10 items-center justify-between gap-2 border border-line bg-[var(--input-bg)] px-3 text-left text-[13px] text-ink outline-none transition',
          'focus:border-accent/70 focus:ring-2 focus:ring-accent/15 disabled:cursor-not-allowed disabled:opacity-55',
          pill ? 'w-auto min-w-[6.75rem] shrink-0 rounded-full' : 'w-full rounded-[12px]',
          open && 'border-accent/70 ring-2 ring-accent/15',
          className,
        )}
      >
        <span className="min-w-0 truncate">{selected?.label || 'Select'}</span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-ink-soft transition', open && 'rotate-180')} />
      </button>
      {open
        ? createPortal(
            <div
              ref={menuRef}
              role="listbox"
              style={{ top: box.top, left: box.left, width: box.width, maxHeight: box.maxHeight }}
              className="fixed z-[80] overflow-auto rounded-2xl border border-line bg-[var(--panel)] p-1 shadow-[0_18px_40px_-20px_rgba(0,0,0,0.55)]"
            >
              {options.map((option) => {
                const active = option.value === current;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => {
                      onValue(option.value);
                      setOpen(false);
                    }}
                    className={cn(
                      'tap flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-[13px]',
                      active ? 'bg-accent text-white' : 'text-ink hover:bg-[var(--hover-fill)]',
                    )}
                  >
                    <span className="min-w-0 truncate">{option.label}</span>
                    {active ? <Check className="h-3.5 w-3.5 shrink-0" /> : null}
                  </button>
                );
              })}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

export function NativeSelect({
  value,
  onChange,
  children,
  disabled,
  className,
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <ThemedSelect
      value={value as string}
      disabled={disabled}
      className={className}
      onValue={(next) => onChange?.({ target: { value: next } } as never)}
    >
      {children}
    </ThemedSelect>
  );
}
