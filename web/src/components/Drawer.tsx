import type { ReactNode } from 'react';
import { X } from 'lucide-react';

export function Drawer({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm fade-in">
      <div className="h-full w-full max-w-md overflow-y-auto border-l border-line bg-panel">
        <div className="sticky top-0 flex items-center justify-between border-b border-line bg-panel/90 px-5 py-3.5 backdrop-blur">
          <h2 className="font-display text-base font-bold tracking-tight">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-full p-1.5 text-ink-soft hover:bg-white/8 hover:text-ink">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
