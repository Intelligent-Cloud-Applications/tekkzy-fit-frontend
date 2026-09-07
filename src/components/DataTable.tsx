import { useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { paymentLinkPopoverPos } from '@/components/PaymentLinkCell';
import { EmptyState } from './EmptyState';
import { Pagination } from './Pagination';

export interface Column<T> {
  key: string;
  header: string;
  className?: string;
  width?: string;
  render: (row: T) => ReactNode;
}

function colWidth<T>(col: Column<T>) {
  if (col.width) return col.width;
  const header = col.header.toLowerCase();
  if (header === 'photo') return '64px';
  if (header === 'actions' || header === 'action') return '132px';
  if (header === 'status' || header === 'payment') return '118px';
  if (header === 'attendance' || header === 'visits') return '104px';
  if (header === 'amount') return '120px';
  return undefined;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  page,
  pageSize,
  total,
  onPage,
  empty = 'No records found',
  embedded = false,
  fit = false,
  rowHoverCard,
  renderCard,
  rowClassName,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  page?: number;
  pageSize?: number;
  total?: number;
  onPage?: (page: number) => void;
  empty?: string;
  embedded?: boolean;
  fit?: boolean;
  rowHoverCard?: (row: T) => ReactNode;
  renderCard?: (row: T) => ReactNode;
  rowClassName?: (row: T) => string | undefined;
}) {
  const hideTimer = useRef<number>(0);
  const [hover, setHover] = useState<{ key: string; top: number; left: number; node: ReactNode } | null>(null);

  function clearHide() {
    window.clearTimeout(hideTimer.current);
  }

  function showCard(row: T, el: HTMLElement) {
    const node = rowHoverCard?.(row);
    if (!node) {
      setHover(null);
      return;
    }
    clearHide();
    const box = el.getBoundingClientRect();
    const { top, left } = paymentLinkPopoverPos(box);
    setHover({
      key: rowKey(row),
      top,
      left,
      node,
    });
  }

  function hideCard() {
    clearHide();
    hideTimer.current = window.setTimeout(() => setHover(null), 280);
  }

  const titleCol = columns.find((col) => !/^(photo|actions?|status)$/i.test(col.header)) ?? columns[0];
  const photoCol = columns.find((col) => /^photo$/i.test(col.header));
  const actionCol = columns.find((col) => /^actions?$/i.test(col.header));
  const statusCol = columns.find((col) => /^status$/i.test(col.header));
  const metaCols = columns.filter((col) => col !== titleCol && col !== photoCol && col !== actionCol && col !== statusCol).slice(0, 4);

  return (
    <div className={
      fit
        ? '-mx-4 overflow-visible sm:-mx-5'
        : embedded
          ? '-mx-4 flex flex-col overflow-visible sm:-mx-5 lg:-mb-5 lg:min-h-0 lg:flex-1 lg:overflow-hidden'
          : 'flex min-w-0 flex-col overflow-visible lg:min-h-0 lg:min-h-[22rem] lg:flex-1 lg:overflow-hidden lg:surface'
    }>
      <div className="space-y-2.5 overflow-visible lg:hidden">
        {rows.length === 0 ? (
          <EmptyState title={empty} />
        ) : renderCard ? (
          rows.map((row) => (
            <div key={rowKey(row)} className={rowClassName?.(row)}>
              {renderCard(row)}
            </div>
          ))
        ) : (
          rows.map((row) => (
            <div key={rowKey(row)} className="surface p-3.5">
              <div className="flex items-start gap-3">
                {photoCol ? <div className="shrink-0 scale-125 pt-1">{photoCol.render(row)}</div> : null}
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 truncate text-[14px] font-semibold leading-snug">{titleCol?.render(row)}</div>
                    {statusCol ? <div className="shrink-0 pt-0.5">{statusCol.render(row)}</div> : null}
                  </div>
                  <div className="mt-2.5 space-y-1.5">
                    {metaCols.map((col) => (
                      <div key={col.key} className="flex items-center justify-between gap-3 text-[12px]">
                        <span className="shrink-0 text-ink-soft">{col.header}</span>
                        <span className="min-w-0 truncate text-right font-medium">{col.render(row)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              {actionCol ? <div className="mt-3 flex justify-end border-t border-line/60 pt-3">{actionCol.render(row)}</div> : null}
            </div>
          ))
        )}
      </div>
      <div className="hidden min-h-0 flex-1 overflow-auto lg:block">
        <table className="w-full min-w-full table-fixed text-left text-[13px]">
          <thead>
            <tr className="border-b border-line text-[11px] font-semibold uppercase tracking-wide text-ink-soft">
              {columns.map((col) => (
                <th
                  key={col.key}
                  style={{ width: colWidth(col) }}
                  className={`px-3 py-2 font-semibold ${col.className ?? ''}`}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="p-0">
                  <EmptyState title={empty} />
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={rowKey(row)}
                  className={`group border-b border-line/50 last:border-0 hover:bg-[var(--hover-fill)] ${rowClassName?.(row) ?? ''}`}
                  onMouseEnter={rowHoverCard ? (e) => showCard(row, e.currentTarget) : undefined}
                  onMouseLeave={rowHoverCard ? hideCard : undefined}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`px-3 py-2 align-middle ${/^(photo|actions?)$/i.test(col.header) ? '' : 'truncate'} ${col.className ?? ''}`}
                    >
                      {col.render(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {onPage && page !== undefined && pageSize !== undefined && total !== undefined ? (
        <Pagination page={page} pageSize={pageSize} total={total} onPage={onPage} />
      ) : null}
      {hover
        ? createPortal(
            <div
              className="fixed z-50 pl-2"
              style={{ top: hover.top, left: hover.left - 8 }}
              onMouseEnter={clearHide}
              onMouseLeave={hideCard}
            >
              {hover.node}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
