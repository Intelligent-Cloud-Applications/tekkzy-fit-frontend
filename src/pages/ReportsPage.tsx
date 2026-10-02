import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/Button';
import { DataExportButton, PrintButton } from '@/components/DataExportButton';
import { DataTable } from '@/components/DataTable';
import { DateRangePicker } from '@/components/DateRangePicker';
import { FilterBar } from '@/components/FilterBar';
import { LoadingState } from '@/components/LoadingState';
import { PageHeader } from '@/components/PageHeader';
import { StatCard } from '@/components/StatCard';
import { useAttendance, useExpenses, useMembers, usePayments } from '@/hooks/useGymQueries';
import { attendanceMonthKey, formatDate, formatINR, istYmd } from '@/lib/format';
import {
  buildMonthlySnapshot,
  listMonthlyReports,
  reportNet,
  saveMonthlyReport,
  withExpenseTotal,
  type MonthlyReport,
} from '@/services/reports';

function monthInRange(month: string, from: string, to: string) {
  const parsed = new Date(`${String(month || '').replace('-', ' ')} 1`);
  if (Number.isNaN(parsed.getTime())) return false;
  const start = `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-01`;
  const last = new Date(parsed.getFullYear(), parsed.getMonth() + 1, 0);
  const end = `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`;
  return start <= to && end >= from;
}
import { useUiStore } from '@/store/uiStore';

export function ReportsPage() {
  const members = useMembers({ full: true });
  const attendance = useAttendance();
  const payments = usePayments();
  const expenses = useExpenses();
  const toast = useUiStore((s) => s.pushToast);
  const [rows, setRows] = useState<MonthlyReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const today = istYmd();
  const monthStart = `${today.slice(0, 7)}-01`;
  const [range, setRange] = useState({ from: monthStart, to: today });
  const month = attendanceMonthKey(range.to || range.from || today);

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

  const snapshot = useMemo(() => {
    if (!members.data || !payments.data || !attendance.data || !expenses.data) return null;
    const archived = rows.find((r) => r.month === month)?.deletedAttendance || [];
    return buildMonthlySnapshot(month, members.data, payments.data, attendance.data, archived, expenses.data);
  }, [month, members.data, payments.data, attendance.data, expenses.data, rows]);

  const currentRaw = rows.find((r) => r.month === month) || snapshot;
  const current = currentRaw ? withExpenseTotal(currentRaw, expenses.data) : null;

  async function reupdate() {
    if (!snapshot) return;
    setBusy(true);
    try {
      const prev = rows.find((r) => r.month === month);
      // Attendance keeps the higher of previous/live. Members, expense, payments follow live data
      // so deletes reduce the report.
      const merged: MonthlyReport = {
        ...snapshot,
        totalAttendance: Math.max(Number(prev?.totalAttendance || 0), Number(snapshot.totalAttendance || 0)),
        totalMembers: Number(snapshot.totalMembers || 0),
        cashPayment: Number(snapshot.cashPayment || 0),
        upiPayment: Number(snapshot.upiPayment || 0),
        razorpayPayment: Number(snapshot.razorpayPayment || 0),
        totalExpense: Number(snapshot.totalExpense || 0),
        totalDiscontinued: Number(snapshot.totalDiscontinued || 0),
        deletedAttendance: prev?.deletedAttendance || snapshot.deletedAttendance,
        reimbursements: prev?.reimbursements || snapshot.reimbursements,
      };
      const saved = await saveMonthlyReport(merged);
      setRows((prevRows) => {
        const next = prevRows.filter((r) => r.month !== saved.month);
        return [saved, ...next].sort((a, b) => String(b.month).localeCompare(String(a.month)));
      });
      toast({ kind: 'success', title: 'Monthly report updated' });
    } catch (err) {
      toast({ kind: 'error', title: err instanceof Error ? err.message : 'Could not update the report' });
    } finally {
      setBusy(false);
    }
  }

  if (!members.data || !payments.data || !attendance.data || expenses.data == null || loading) return <LoadingState />;

  const all = rows.length ? rows : current ? [current] : [];
  const table = all
    .filter((r) => monthInRange(r.month, range.from || range.to, range.to || range.from))
    .map((r) => withExpenseTotal(r, expenses.data));
  const totals = table.reduce(
    (sum, r) => ({
      totalAttendance: sum.totalAttendance + Number(r.totalAttendance || 0),
      totalMembers: Math.max(sum.totalMembers, Number(r.totalMembers || 0)),
      cashPayment: sum.cashPayment + Number(r.cashPayment || 0),
      upiPayment: sum.upiPayment + Number(r.upiPayment || 0),
      razorpayPayment: sum.razorpayPayment + Number(r.razorpayPayment || 0),
      totalExpense: sum.totalExpense + Number(r.totalExpense || 0),
      totalDiscontinued: sum.totalDiscontinued + Number(r.totalDiscontinued || 0),
    }),
    { totalAttendance: 0, totalMembers: 0, cashPayment: 0, upiPayment: 0, razorpayPayment: 0, totalExpense: 0, totalDiscontinued: 0 },
  );
  const shown = table.length === 1 ? table[0] : table.length ? totals : current;

  return (
    <div className="flex flex-col lg:min-h-full lg:flex-1">
      <PageHeader
        title="Reports"
        description="Monthly totals stored in the monthly report table. Pick dates to filter months. Reupdate saves the selected month."
        actions={
          <>
            <Button onClick={() => void reupdate()} disabled={busy || !snapshot}>
              {busy ? 'Updating…' : 'Reupdate'}
            </Button>
            <DataExportButton
              filename="monthly-report.csv"
              headers={['Month', 'Members', 'Cash', 'UPI', 'Razorpay', 'Expense', 'Net', 'Discontinued', 'Updated']}
              rows={table.map((r) => [
                r.month,
                r.totalMembers,
                r.cashPayment,
                r.upiPayment ?? 0,
                r.razorpayPayment,
                r.totalExpense ?? 0,
                reportNet(r),
                r.totalDiscontinued,
                r.updatedAt || '',
              ])}
            />
            <PrintButton />
          </>
        }
      />
      <FilterBar>
        <DateRangePicker from={range.from} to={range.to} onChange={setRange} />
      </FilterBar>
      <div className="mb-3 grid w-full grid-cols-2 gap-2.5 md:grid-cols-4 xl:grid-cols-7">
        <StatCard label="Total members" value={shown?.totalMembers ?? 0} />
        <StatCard label="Cash" value={formatINR(shown?.cashPayment ?? 0)} />
        <StatCard label="UPI" value={formatINR(shown?.upiPayment ?? 0)} />
        <StatCard label="Razorpay" value={formatINR(shown?.razorpayPayment ?? 0)} />
        <StatCard label="Expense" value={formatINR(shown?.totalExpense ?? 0)} />
        <StatCard label="Net" value={formatINR(shown ? reportNet(shown) : 0)} />
        <StatCard label="Discontinued" value={shown?.totalDiscontinued ?? 0} tone="warn" />
      </div>
      <DataTable
        fit
        compact
        empty="No monthly report yet. Tap Reupdate to calculate and store this month."
        columns={[
          { key: 'm', header: 'Month', render: (r) => r.month },
          { key: 't', header: 'Members', render: (r) => r.totalMembers },
          { key: 'c', header: 'Cash', render: (r) => formatINR(r.cashPayment) },
          { key: 'upi', header: 'UPI', render: (r) => formatINR(r.upiPayment ?? 0) },
          { key: 'rz', header: 'Razorpay', render: (r) => formatINR(r.razorpayPayment) },
          { key: 'ex', header: 'Expense', render: (r) => formatINR(r.totalExpense ?? 0) },
          { key: 'net', header: 'Net', render: (r) => formatINR(reportNet(r)) },
          { key: 'd', header: 'Discontinued', render: (r) => r.totalDiscontinued },
          { key: 'upd', header: 'Updated', render: (r) => (r.updatedAt ? formatDate(r.updatedAt) : '—') },
        ]}
        rows={table}
        rowKey={(r) => r.month}
      />
    </div>
  );
}
