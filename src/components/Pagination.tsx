import { Button } from './Button';

export function Pagination({
  page,
  pageSize,
  total,
  hasMore,
  onPage,
}: {
  page: number;
  pageSize: number;
  total?: number;
  hasMore?: boolean;
  onPage: (page: number) => void;
}) {
  const knownTotal = typeof total === 'number' && total >= 0;
  if (knownTotal && total === 0 && !hasMore && page === 0) return null;
  const pages = knownTotal ? Math.max(1, Math.ceil((total || 0) / pageSize)) : page + (hasMore ? 2 : 1);
  const start = knownTotal ? ((total || 0) === 0 ? 0 : page * pageSize + 1) : page * pageSize + 1;
  const end = knownTotal ? Math.min(total || 0, (page + 1) * pageSize) : start + Math.max(pageSize - 1, 0);
  const canNext = knownTotal ? page < pages - 1 : Boolean(hasMore);
  return (
    <div className="mt-2.5 flex items-center justify-between gap-3 rounded-2xl border border-line bg-panel px-3 py-2 text-[12px] text-ink-soft lg:mt-0 lg:rounded-none lg:border-0 lg:border-t lg:bg-transparent">
      <span className="tabular-nums">
        {knownTotal ? `${start}–${end} of ${total}` : hasMore || page > 0 ? `Page ${page + 1}` : `${start}–${end}`}
      </span>
      <div className="flex gap-1.5">
        <Button size="sm" variant="secondary" disabled={page === 0} onClick={() => onPage(page - 1)}>
          Prev
        </Button>
        <Button size="sm" variant="secondary" disabled={!canNext} onClick={() => onPage(page + 1)}>
          Next
        </Button>
      </div>
    </div>
  );
}
