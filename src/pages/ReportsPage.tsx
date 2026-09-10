import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/Button';
import { DataExportButton, PrintButton } from '@/components/DataExportButton';
import { DataTable } from '@/components/DataTable';
import { DateRangePicker } from '@/components/DateRangePicker';
import { FilterBar } from '@/components/FilterBar';
import { LoadingState } from '@/components/LoadingState';
import { PageHeader } from '@/components/PageHeader';
import { StatCard } from '@/components/StatCard';
import { useAttendance, useMembers, usePayments } from '@/hooks/useGymQueries';
import { attendanceMonthKey, formatDate, formatINR, istYmd } from '@/lib/format';
import {
  buildMonthlySnapshot,
  listMonthlyReports,
  saveMonthlyReport,
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
  const navigate = useNavigate();
  const members = useMembers({ full: true });
  const attendance = useAttendance();
  const payments = usePayments();
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
    if (!members.data || !payments.data || !attendance.data) return null;
    const archived = rows.find((r) => r.month === month)?.deletedAttendance || [];
    return buildMonthlySnapshot(month, members.data, payments.data, attendance.data, archived);
  }, [month, members.data, payments.data, attendance.data, rows]);

  const current = rows.find((r) => r.month === month) || snapshot;

  async function reupdate() {
    if (!snapshot) return;
    setBusy(true);
    try {
      const saved = await saveMonthlyReport(snapshot);
      setRows((prev) => {
        const next = prev.filter((r) => r.month !== saved.month);
        return [saved, ...next].sort((a, b) => String(b.month).localeCompare(String(a.month)));
      });
      toast({ kind: 'success', title: 'Monthly report updated' });
    } catch (err) {
      toast({ kind: 'error', title: err instanceof Error ? err.message : 'Could not update the report' });
    } finally {
      setBusy(false);
    }
  }

  if (!members.data || !payments.data || !attendance.data || loading) return <LoadingState />;

  const all = rows.length ? rows : current ? [current] : [];
  const table = all.filter((r) => monthInRange(r.month, range.from || range.to, range.to || range.from));
  const totals = table.reduce(
    (sum, r) => ({
      totalAttendance: sum.totalAttendance + Number(r.totalAttendance || 0),
      totalMembers: Math.max(sum.totalMembers, Number(r.totalMembers || 0)),
      cashPayment: sum.cashPayment + Number(r.cashPayment || 0),
      upiPayment: sum.upiPayment + Number(r.upiPayment || 0),
      razorpayPayment: sum.razorpayPayment + Number(r.razorpayPayment || 0),
      totalDiscontinued: sum.totalDiscontinued + Number(r.totalDiscontinued || 0),
    }),
    { totalAttendance: 0, totalMembers: 0, cashPayment: 0, upiPayment: 0, razorpayPayment: 0, totalDiscontinued: 0 },
  );
  const shown = table.length === 1 ? table[0] : table.length ? totals : current;

  return (
    <div className="flex flex-col lg:min-h-full lg:flex-1">
      <PageHeader
        title="Reports"
        description="Monthly totals stored in the monthly report table. Pick dates to filter months. Reupdate saves the selected month."
        actions={
          <>
            <Button variant="secondary" onClick={() => navigate('/reimbursement')}>
              Reimbursement
            </Button>
            <Button onClick={() => void reupdate()} disabled={busy || !snapshot}>
              {busy ? 'Updating…' : 'Reupdate'}
            </Button>
            <DataExportButton
              filename="monthly-report.csv"
              headers={['Month', 'Attendance', 'Members', 'Cash', 'UPI', 'Razorpay', 'Discontinued', 'Updated']}
              rows={table.map((r) => [
                r.month,
                r.totalAttendance,
                r.totalMembers,
                r.cashPayment,
                r.upiPayment ?? 0,
                r.razorpayPayment,
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
      <div className="mb-3 grid w-full grid-cols-2 gap-2.5 md:grid-cols-6">
        <StatCard label={`${table.length > 1 ? 'Selected' : month} attendance`} value={shown?.totalAttendance ?? 0} />
        <StatCard label="Total members" value={shown?.totalMembers ?? 0} />
        <StatCard label="Cash" value={formatINR(shown?.cashPayment ?? 0)} />
        <StatCard label="UPI" value={formatINR(shown?.upiPayment ?? 0)} />
        <StatCard label="Razorpay" value={formatINR(shown?.razorpayPayment ?? 0)} />
        <StatCard label="Discontinued" value={shown?.totalDiscontinued ?? 0} tone="warn" />
      </div>
      <DataTable
        fit
        compact
        empty="No monthly report yet. Tap Reupdate to calculate and store this month."
        columns={[
          { key: 'm', header: 'Month', render: (r) => r.month },
          { key: 'a', header: 'Attendance', render: (r) => r.totalAttendance },
          { key: 't', header: 'Members', render: (r) => r.totalMembers },
          { key: 'c', header: 'Cash', render: (r) => formatINR(r.cashPayment) },
          { key: 'u', header: 'UPI', render: (r) => formatINR(r.upiPayment ?? 0) },
          { key: 'r', header: 'Razorpay', render: (r) => formatINR(r.razorpayPayment) },
          { key: 'd', header: 'Discontinued', render: (r) => r.totalDiscontinued },
          { key: 'u', header: 'Updated', render: (r) => (r.updatedAt ? formatDate(r.updatedAt) : '—') },
        ]}
        rows={table}
        rowKey={(r) => r.month}
      />
    </div>
  );
}
