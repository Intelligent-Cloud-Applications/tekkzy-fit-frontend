import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

const SIZES = {
  sm: 'max-w-[22rem]',
  md: 'max-w-[28rem]',
  lg: 'max-w-[56rem]',
  xl: 'max-w-[72rem]',
};

const EXIT_MS = 280;

function lockPageScroll() {
  const scroller = document.querySelector('main');
  const top = scroller?.scrollTop ?? window.scrollY;
  document.documentElement.style.overflow = 'hidden';
  document.body.style.overflow = 'hidden';
  if (scroller instanceof HTMLElement) {
    scroller.dataset.modalScroll = String(top);
    scroller.style.overflow = 'hidden';
  }
  return () => {
    document.documentElement.style.overflow = '';
    document.body.style.overflow = '';
    if (scroller instanceof HTMLElement) {
      scroller.style.overflow = '';
      scroller.scrollTop = Number(scroller.dataset.modalScroll || top);
      delete scroller.dataset.modalScroll;
    }
  };
}

export function Modal({
  open,
  title,
  children,
  onClose,
  width,
  size = 'md',
  footer,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  width?: string;
  size?: keyof typeof SIZES;
  footer?: ReactNode;
}) {
  const [visible, setVisible] = useState(open);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (open) {
      setVisible(true);
      setLeaving(false);
      return undefined;
    }
    if (!visible) return undefined;
    setLeaving(true);
    const timer = window.setTimeout(() => {
      setVisible(false);
      setLeaving(false);
    }, EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [open, visible]);

  useEffect(() => {
    if (!visible) return undefined;
    const unlock = lockPageScroll();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      unlock();
      window.removeEventListener('keydown', onKey);
    };
  }, [visible, onClose]);

  if (!visible || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-5">
      <button
        type="button"
        className={`absolute inset-0 bg-black/55 backdrop-blur-[6px] ${leaving ? 'fade-out' : 'fade-in'}`}
        aria-label="Close dialog"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className={`${leaving ? 'dialog-out' : 'dialog-in'} surface relative flex w-full flex-col overflow-hidden rounded-t-[1.6rem] shadow-[0_24px_80px_-20px_rgba(0,0,0,0.5)] sm:rounded-2xl ${width ?? SIZES[size]}`}
        style={{ maxHeight: 'min(92dvh, 52rem)' }}
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-line sm:hidden" aria-hidden />
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
          <h2 id="modal-title" className="min-w-0 truncate font-display text-base font-bold tracking-tight sm:text-lg">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="tap grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-soft hover:bg-[var(--hover-fill)] hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">{children}</div>
        {footer ? (
          <div className="shrink-0 border-t border-line bg-[var(--panel)] px-4 py-3 sm:px-5">{footer}</div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
