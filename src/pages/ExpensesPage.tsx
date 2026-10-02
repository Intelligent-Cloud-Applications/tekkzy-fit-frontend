import { useEffect, useMemo, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/Button';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { DataTable } from '@/components/DataTable';
import { Field, NativeSelect, TextArea, TextInput } from '@/components/Field';
import { FilterBar, Select } from '@/components/FilterBar';
import { LoadingState } from '@/components/LoadingState';
import { Modal } from '@/components/Modal';
import { PageHeader } from '@/components/PageHeader';
import { RowActions } from '@/components/RowActions';
import { SearchInput } from '@/components/SearchInput';
import { StatCard } from '@/components/StatCard';
import { useExpenses, useGymMutation } from '@/hooks/useGymQueries';
import { formatDate, formatINR } from '@/lib/format';
import {
  emptyExpense,
  EXPENSE_CATEGORIES,
  EXPENSE_METHODS,
  expenseKpis,
  expenseMethodLabel,
  removeExpense,
  saveExpense,
} from '@/services/expenses';
import { useUiStore } from '@/store/uiStore';
import type { Expense, ExpenseCategory, ExpenseMethod } from '@shared/types';

const PAGE_SIZE = 20;

const MONTHS = [
  { value: '01', label: 'January' },
  { value: '02', label: 'February' },
  { value: '03', label: 'March' },
  { value: '04', label: 'April' },
  { value: '05', label: 'May' },
  { value: '06', label: 'June' },
  { value: '07', label: 'July' },
  { value: '08', label: 'August' },
  { value: '09', label: 'September' },
  { value: '10', label: 'October' },
  { value: '11', label: 'November' },
  { value: '12', label: 'December' },
];

function nowParts() {
  const today = new Date().toISOString().slice(0, 10);
  return { year: today.slice(0, 4), month: today.slice(5, 7), today };
}

export function ExpensesPage() {
  const toast = useUiStore((s) => s.pushToast);
  const expenses = useExpenses();
  const save = useGymMutation(saveExpense);
  const del = useGymMutation(removeExpense);
  const now = nowParts();
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('ALL');
  const [year, setYear] = useState(now.year);
  const [month, setMonth] = useState(now.month);
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);

  const yearOptions = useMemo(() => {
    const years = new Set<string>([now.year]);
    for (const row of expenses.data ?? []) {
      const y = String(row.date || '').slice(0, 4);
      if (/^\d{4}$/.test(y)) years.add(y);
    }
    return ['ALL', ...Array.from(years).sort((a, b) => b.localeCompare(a))];
  }, [expenses.data, now.year]);

  const rows = useMemo(() => {
    return (expenses.data ?? []).filter((row) => {
      const date = String(row.date || '');
      const hay = `${row.title} ${row.category} ${row.notes || ''}`.toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
      if (category !== 'ALL' && row.category !== category) return false;
      if (year !== 'ALL' && !date.startsWith(year)) return false;
      if (month !== 'ALL' && date.slice(5, 7) !== month) return false;
      return true;
    });
  }, [expenses.data, q, category, year, month]);

  if (!expenses.data) return <LoadingState />;
  const kpis = expenseKpis(expenses.data);
  const filteredTotal = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const slice = rows.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  return (
    <div className="flex flex-col lg:min-h-full lg:flex-1">
      <PageHeader
        title="Expenses"
        description="Gym spending by date, category, and payment method."
        actions={
          <>
            <Button variant="secondary" onClick={() => void expenses.refetch()}>Refresh</Button>
            <Button onClick={() => setEditing(emptyExpense())}>Add expense</Button>
          </>
        }
      />
      <div className="mb-3 grid w-full grid-cols-2 gap-2.5 md:grid-cols-4">
        <StatCard label="Today" value={formatINR(kpis.today)} />
        <StatCard label="This month" value={formatINR(kpis.month)} />
        <StatCard label="Filtered" value={formatINR(filteredTotal)} />
        <StatCard label="Records" value={rows.length} />
      </div>
      <FilterBar>
        <SearchInput value={q} onChange={(v) => { setQ(v); setPage(0); }} className="min-w-0 flex-1 lg:min-w-[16rem]" />
        <Select value={year} onChange={(v) => { setYear(v); setPage(0); }}>
          {yearOptions.map((item) => (
            <option key={item} value={item}>{item === 'ALL' ? 'All years' : item}</option>
          ))}
        </Select>
        <Select value={month} onChange={(v) => { setMonth(v); setPage(0); }}>
          <option value="ALL">All months</option>
          {MONTHS.map((item) => (
            <option key={item.value} value={item.value}>{item.label}</option>
          ))}
        </Select>
        <Select value={category} onChange={(v) => { setCategory(v); setPage(0); }}>
          <option value="ALL">All categories</option>
          {EXPENSE_CATEGORIES.map((item) => (
            <option key={item} value={item}>{item}</option>
          ))}
        </Select>
      </FilterBar>
      <DataTable
        columns={[
          { key: 'd', header: 'Date', render: (row) => formatDate(row.date) },
          { key: 't', header: 'Title', render: (row) => row.title },
          { key: 'c', header: 'Category', render: (row) => row.category },
          { key: 'm', header: 'Method', render: (row) => expenseMethodLabel(row.method) },
          { key: 'a', header: 'Amount', render: (row) => formatINR(row.amount) },
          { key: 'n', header: 'Notes', render: (row) => row.notes || '—' },
          {
            key: 'act',
            header: 'Actions',
            width: '196px',
            render: (row) => (
              <RowActions>
                <Button size="sm" variant="secondary" onClick={() => setEditing(row)}>
                  <Pencil className="h-3.5 w-3.5" />
                  Edit
                </Button>
                <Button size="sm" variant="danger" onClick={() => setConfirm(row.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </Button>
              </RowActions>
            ),
          },
        ]}
        rows={slice}
        rowKey={(row) => row.id}
        page={page}
        pageSize={PAGE_SIZE}
        total={rows.length}
        onPage={setPage}
        renderCard={(row) => (
          <div className="surface p-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 truncate text-[12px] font-extrabold text-accent">{row.category}</div>
              <div className="shrink-0 text-[15px] font-extrabold">{formatINR(row.amount)}</div>
            </div>
            <div className="mt-1 truncate text-[14px] font-bold">{row.title}</div>
            <div className="mt-2 flex items-end justify-between gap-3">
              <div className="min-w-0 text-[11px] leading-4 text-ink-soft">
                {[formatDate(row.date), expenseMethodLabel(row.method), row.notes].filter(Boolean).join('  ·  ')}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button type="button" className="tap grid h-8 w-8 place-items-center rounded-full text-ink-soft hover:bg-[var(--hover-fill)]" aria-label="Edit" onClick={() => setEditing(row)}>
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button type="button" className="tap grid h-8 w-8 place-items-center rounded-full text-[#c81e1e] hover:bg-bad/15 dark:text-[#ff6b6b]" aria-label="Delete" onClick={() => setConfirm(row.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}
      />
      <ExpenseModal
        expense={editing}
        onClose={() => setEditing(null)}
        onSave={async (row) => {
          try {
            await save.mutateAsync(row);
            toast({ kind: 'success', title: row.id ? 'Expense updated' : 'Expense added' });
            setEditing(null);
          } catch (err) {
            toast({ kind: 'error', title: err instanceof Error ? err.message : 'Could not save expense' });
          }
        }}
      />
      <ConfirmDialog
        open={Boolean(confirm)}
        title="Delete expense"
        message="This expense will be removed from the gym record."
        danger
        confirmLabel="Delete"
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          if (!confirm) return;
          del.mutate(confirm, {
            onSuccess: () => toast({ kind: 'success', title: 'Expense deleted' }),
            onError: (err) => toast({ kind: 'error', title: err instanceof Error ? err.message : 'Could not delete expense' }),
          });
        }}
      />
    </div>
  );
}

function ExpenseModal({
  expense,
  onClose,
  onSave,
}: {
  expense: Expense | null;
  onClose: () => void;
  onSave: (row: Expense) => Promise<void>;
}) {
  const [draft, setDraft] = useState<Expense | null>(expense);
  const [amountText, setAmountText] = useState('');

  useEffect(() => {
    setDraft(expense);
    setAmountText(expense && Number(expense.amount) > 0 ? String(expense.amount) : '');
  }, [expense]);

  if (!expense || !draft) return null;

  return (
    <Modal open={Boolean(expense)} title={expense.id ? 'Edit expense' : 'Add expense'} onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void onSave({ ...draft, amount: Number(amountText || draft.amount || 0) });
        }}
      >
        <Field label="Title">
          <TextInput value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="e.g. April rent" required />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Category">
            <NativeSelect
              value={draft.category}
              onChange={(e) => setDraft({ ...draft, category: e.target.value as ExpenseCategory })}
            >
              {EXPENSE_CATEGORIES.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Date">
            <TextInput type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Amount (₹)">
            <TextInput value={amountText} onChange={(e) => setAmountText(e.target.value)} inputMode="decimal" placeholder="0" />
          </Field>
          <Field label="Method">
            <NativeSelect
              value={draft.method}
              onChange={(e) => setDraft({ ...draft, method: e.target.value as ExpenseMethod })}
            >
              {EXPENSE_METHODS.map((item) => (
                <option key={item} value={item}>{expenseMethodLabel(item)}</option>
              ))}
            </NativeSelect>
          </Field>
        </div>
        <Field label="Notes">
          <TextArea rows={3} value={draft.notes || ''} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} placeholder="Optional" />
        </Field>
        <div className="flex justify-end">
          <Button type="submit" className="w-full sm:w-auto">Save</Button>
        </div>
      </form>
    </Modal>
  );
}
