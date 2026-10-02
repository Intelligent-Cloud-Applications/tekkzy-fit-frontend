import { useEffect } from 'react';
import { useUiStore } from '@/store/uiStore';

export function ToastViewport() {
  const toasts = useUiStore((s) => s.toasts);
  const dismiss = useUiStore((s) => s.dismissToast);

  return (
    <div className="pointer-events-none fixed inset-x-3 top-3 z-[70] flex flex-col gap-2 sm:inset-x-auto sm:right-4 sm:top-4 sm:w-80">
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
  useEffect(() => {
    const t = window.setTimeout(() => onDone(id), 3500);
    return () => window.clearTimeout(t);
  }, [id, onDone]);

  const border =
    kind === 'success' ? 'border-ok' : kind === 'error' ? 'border-bad' : kind === 'warning' ? 'border-warn' : 'border-accent';

  return (
    <div className={`surface pointer-events-auto border-l-2 ${border} px-3.5 py-2.5`}>
      <div className="text-[13px] font-semibold tracking-tight">{title}</div>
      {message ? <div className="text-[12px] text-ink-soft">{message}</div> : null}
    </div>
  );
}
