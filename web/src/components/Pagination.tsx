import { Button } from './Button';

export function Pagination({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : page * pageSize + 1;
  const end = Math.min(total, (page + 1) * pageSize);
  return (
    <div className="mt-2.5 flex items-center justify-between gap-3 rounded-2xl border border-line bg-panel px-3 py-2 text-[12px] text-ink-soft lg:mt-0 lg:rounded-none lg:border-0 lg:border-t lg:bg-transparent">
      <span className="tabular-nums">
        {start}–{end} of {total}
      </span>
      <div className="flex gap-1.5">
        <Button size="sm" variant="secondary" disabled={page === 0} onClick={() => onPage(page - 1)}>
          Prev
        </Button>
        <Button size="sm" variant="secondary" disabled={page >= pages - 1} onClick={() => onPage(page + 1)}>
          Next
        </Button>
      </div>
    </div>
  );
}
