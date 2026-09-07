import { useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Copy, ExternalLink } from 'lucide-react';
import { Button } from '@/components/Button';
import { useUiStore } from '@/store/uiStore';

function isPaid(status?: string) {
  return String(status || '').toUpperCase() === 'PAID';
}

export function hasUnpaidLink(url?: string, status?: string) {
  return Boolean(url && !isPaid(status));
}

const POPOVER_WIDTH = 288;
const POPOVER_HEIGHT = 168;

export function paymentLinkPopoverPos(box: DOMRect) {
  const pad = 12;
  const gap = 10;
  const besideName = box.left + Math.min(200, Math.max(72, box.width * 0.22));
  let left = besideName + gap;
  if (left + POPOVER_WIDTH > window.innerWidth - pad) {
    left = box.left - POPOVER_WIDTH - gap;
  }
  if (left < pad) left = pad;
  if (left + POPOVER_WIDTH > window.innerWidth - pad) {
    left = window.innerWidth - POPOVER_WIDTH - pad;
  }
  let top = box.top + box.height / 2 - POPOVER_HEIGHT / 2;
  if (top < pad) top = pad;
  if (top + POPOVER_HEIGHT > window.innerHeight - pad) {
    top = Math.max(pad, window.innerHeight - POPOVER_HEIGHT - pad);
  }
  return { top, left };
}

export function PaymentLinkCard({ url }: { url: string }) {
  const toast = useUiStore((s) => s.pushToast);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      toast({ kind: 'success', title: 'Payment link copied' });
    } catch {
      toast({ kind: 'error', title: 'Could not copy the link' });
    }
  }

  return (
    <div className="surface w-72 p-3 text-ink">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">Subscription link</div>
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="mt-1.5 block break-all text-[12px] leading-5 text-accent hover:underline"
      >
        {url}
      </a>
      <div className="mt-2.5 flex gap-2">
        <Button type="button" size="sm" variant="secondary" onClick={() => void copy()}>
          <Copy className="h-3.5 w-3.5" />
          Copy
        </Button>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="tap inline-flex min-h-8 items-center gap-1.5 rounded-full bg-accent px-2.5 text-[12px] font-semibold text-white hover:brightness-110"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Open
        </a>
      </div>
    </div>
  );
}

export function PaymentLinkHover({
  url,
  status,
  children,
}: {
  url?: string;
  status?: string;
  children: ReactNode;
}) {
  const wrapRef = useRef<HTMLSpanElement>(null);
  const hideTimer = useRef<number>(0);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  if (!hasUnpaidLink(url, status)) return <>{children}</>;

  function clearHide() {
    window.clearTimeout(hideTimer.current);
  }

  function show() {
    clearHide();
    const box = wrapRef.current?.getBoundingClientRect();
    if (!box) return;
    setPos(paymentLinkPopoverPos(box));
  }

  function hide() {
    clearHide();
    hideTimer.current = window.setTimeout(() => setPos(null), 280);
  }

  return (
    <span ref={wrapRef} className="block" onMouseEnter={show} onMouseLeave={hide}>
      {children}
      {pos
        ? createPortal(
            <div
              className="fixed z-50 pl-2"
              style={{ top: pos.top, left: pos.left - 8 }}
              onMouseEnter={clearHide}
              onMouseLeave={hide}
            >
              <PaymentLinkCard url={url!} />
            </div>,
            document.body,
          )
        : null}
    </span>
  );
}
