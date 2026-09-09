import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { Button } from '@/components/Button';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { DataTable } from '@/components/DataTable';
import { Field, NativeSelect, TextInput } from '@/components/Field';
import { IconAction, RowActions } from '@/components/RowActions';
import { LoadingState } from '@/components/LoadingState';
import { PageHeader } from '@/components/PageHeader';
import { StatCard } from '@/components/StatCard';
import { formatDate, formatINR, istYmd, newId } from '@/lib/format';
import {
  addReimbursement,
  listMonthlyReports,
  listReimbursements,
  removeReimbursement,
  type MonthlyReport,
  type Reimbursement,
} from '@/services/reports';
import { useUiStore } from '@/store/uiStore';

export function ReimbursementPage() {
  const navigate = useNavigate();
  const toast = useUiStore((s) => s.pushToast);
  const [rows, setRows] = useState<MonthlyReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [remove, setRemove] = useState<Reimbursement | null>(null);
  const [date, setDate] = useState(istYmd());
  const [amount, setAmount] = useState('');
  const [paidTo, setPaidTo] = useState('');
  const [reason, setReason] = useState('');
  const [method, setMethod] = useState<'CASH' | 'ONLINE'>('CASH');

  async function load() {
    setLoading(true);
    try {
      setRows(await listMonthlyReports());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const items = useMemo(() => listReimbursements(rows), [rows]);
  const total = items.reduce((sum, row) => sum + Number(row.amount || 0), 0);

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    const rupees = Number(amount);
    if (!paidTo.trim() || !rupees || rupees < 0) {
      toast({ kind: 'error', title: 'Enter who was paid and a valid amount' });
      return;
    }
    setBusy(true);
    try {
      const saved = await addReimbursement({
        id: newId('rbm'),
        date,
        amount: rupees,
        paidTo: paidTo.trim(),
        reason: reason.trim(),
        method,
        createdAt: new Date().toISOString(),
      });
      setRows((prev) => {
        const next = prev.filter((row) => row.month !== saved.month);
        return [saved, ...next];
      });
      setAmount('');
      setPaidTo('');
      setReason('');
      toast({ kind: 'success', title: 'Reimbursement saved' });
    } catch (err) {
      toast({ kind: 'error', title: err instanceof Error ? err.message : 'Could not save reimbursement' });
    } finally {
      setBusy(false);
    }
  }

  async function onRemove() {
    if (!remove?.id || !remove.month) return;
    setBusy(true);
    try {
      const saved = await removeReimbursement(remove.month, remove.id);
      setRows((prev) => {
        const next = prev.filter((row) => row.month !== saved.month);
        return [saved, ...next];
      });
      toast({ kind: 'success', title: 'Reimbursement removed' });
    } catch (err) {
      toast({ kind: 'error', title: err instanceof Error ? err.message : 'Could not remove reimbursement' });
    } finally {
      setBusy(false);
      setRemove(null);
    }
  }

  if (loading) return <LoadingState />;

  return (
    <div className="flex flex-col lg:min-h-full lg:flex-1">
      <PageHeader
        title="Reimbursement"
        description="Record money paid out from the gym — staff expenses, refunds, or petty cash."
        actions={
          <Button variant="secondary" onClick={() => navigate('/reports')}>
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to reports
          </Button>
        }
      />

      <div className="mb-3 grid w-full grid-cols-2 gap-2.5 md:grid-cols-3">
        <StatCard label="Entries" value={items.length} />
        <StatCard label="Total paid out" value={formatINR(total)} tone="warn" />
      </div>

      <form onSubmit={onAdd} className="surface mb-4 grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 xl:grid-cols-6">
        <Field label="Date">
          <TextInput type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Amount (₹)">
          <TextInput
            type="number"
            min="1"
            step="1"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="500"
          />
        </Field>
        <Field label="Paid to">
          <TextInput required value={paidTo} onChange={(e) => setPaidTo(e.target.value)} placeholder="Name or vendor" />
        </Field>
        <Field label="Reason">
          <TextInput value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Cleaning supplies" />
        </Field>
        <Field label="Method">
          <NativeSelect value={method} onChange={(e) => setMethod(e.target.value === 'ONLINE' ? 'ONLINE' : 'CASH')}>
            <option value="CASH">Cash</option>
            <option value="ONLINE">Online</option>
          </NativeSelect>
        </Field>
        <div className="flex items-end">
          <Button type="submit" className="h-10 w-full" loading={busy} disabled={busy}>
            {busy ? 'Saving…' : 'Add reimbursement'}
          </Button>
        </div>
      </form>

      <DataTable
        fit
        compact
        empty="No reimbursements yet. Add one above."
        columns={[
          { key: 'd', header: 'Date', render: (row) => formatDate(row.date) },
          { key: 'p', header: 'Paid to', render: (row) => row.paidTo },
          { key: 'r', header: 'Reason', render: (row) => row.reason || '—' },
          { key: 'm', header: 'Method', render: (row) => (row.method === 'ONLINE' ? 'Online' : 'Cash') },
          { key: 'a', header: 'Amount', render: (row) => formatINR(row.amount) },
          {
            key: 'x',
            header: '',
            render: (row) => (
              <RowActions>
                <IconAction label="Remove" icon={Trash2} variant="danger" onClick={() => setRemove(row)} />
              </RowActions>
            ),
          },
        ]}
        rows={items}
        rowKey={(row) => row.id}
      />

      <ConfirmDialog
        open={Boolean(remove)}
        title="Remove reimbursement"
        message={remove ? `Remove ${formatINR(remove.amount)} paid to ${remove.paidTo}?` : ''}
        confirmLabel="Remove"
        danger
        onConfirm={() => void onRemove()}
        onClose={() => setRemove(null)}
      />
    </div>
  );
}
