import { useEffect } from 'react';
import { Check, TriangleAlert, X } from 'lucide-react';
import { useUiStore } from '@/store/uiStore';

export function ToastViewport() {
  const toasts = useUiStore((s) => s.toasts);
  const dismiss = useUiStore((s) => s.dismissToast);

  return (
    <div className="pointer-events-none fixed inset-x-3 top-3 z-[70] flex flex-col gap-2.5 sm:inset-x-auto sm:right-4 sm:top-4 sm:w-[22rem]">
      {(toasts ?? []).map((toast) => (
        <ToastCard key={toast.id} id={toast.id} kind={toast.kind} title={toast.title} message={toast.message} onDone={dismiss} />
      ))}
    </div>
  );
}

function ToastCard({
  id,
  kind,
  title,
  message,
  onDone,
}: {
  id: string;
  kind: string;
  title: string;
  message?: string;
  onDone: (id: string) => void;
}) {
  const life = kind === 'error' ? 4600 : 3200;
  useEffect(() => {
    const t = window.setTimeout(() => onDone(id), life);
    return () => window.clearTimeout(t);
  }, [id, life, onDone]);

  const label = kind === 'success' ? 'Done' : kind === 'error' ? 'Failed' : kind === 'warning' ? 'Check' : 'Note';
  const Icon = kind === 'success' ? Check : kind === 'warning' ? TriangleAlert : kind === 'error' ? X : Check;
  const mark = kind === 'success' ? 'bg-[#7cde2a] text-[#111]' : kind === 'warning' ? 'bg-[#f5c400] text-[#111]' : 'bg-accent text-[color:var(--accent-ink,#111)]';

  return (
    <button
      type="button"
      onClick={() => onDone(id)}
      className="tf-toast pointer-events-auto w-full overflow-hidden rounded-[22px] border border-white/10 bg-[#111111] px-3.5 pb-3 pt-3.5 text-left shadow-[0_18px_40px_-20px_color-mix(in_srgb,var(--accent)_70%,transparent)]"
    >
      <span className="flex items-center gap-3">
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${mark}`}>
          <Icon className="h-4 w-4" strokeWidth={2.6} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-brand text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">{label}</span>
          <span className="mt-0.5 block font-display text-[16px] font-bold leading-tight tracking-tight text-[#f6f1f1]">{title}</span>
          {message ? <span className="mt-1 block text-[12px] leading-4 text-white/55">{message}</span> : null}
        </span>
      </span>
      <span className="mt-3 block h-0.5 overflow-hidden rounded-full bg-white/10">
        <span className={`tf-toast-bar block h-full origin-left rounded-full ${kind === 'success' ? 'bg-[#7cde2a]' : kind === 'warning' ? 'bg-[#f5c400]' : 'bg-accent'}`} style={{ animationDuration: `${life}ms` }} />
      </span>
    </button>
  );
}
