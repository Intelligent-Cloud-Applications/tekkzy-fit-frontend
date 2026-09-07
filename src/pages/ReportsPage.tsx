import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartCard } from '@/components/ChartCard';
import { DataExportButton, PrintButton } from '@/components/DataExportButton';
import { DataTable } from '@/components/DataTable';
import { DateRangePicker } from '@/components/DateRangePicker';
import { FilterBar, Select } from '@/components/FilterBar';
import { LoadingState } from '@/components/LoadingState';
import { PageHeader } from '@/components/PageHeader';
import { useAttendance, useMembers, usePayments } from '@/hooks/useGymQueries';
import { paymentBelongsToMember } from '@/services/payments';
import { formatDate, formatINR } from '@/lib/format';
import { useChartTheme } from '@/hooks/useChartTheme';

const PAGE_SIZE = 8;

const kinds = [
  { id: 'attendance', label: 'Attendance' },
  { id: 'payments', label: 'Payment History' },
  { id: 'membership', label: 'Members' },
  { id: 'expired', label: 'Expired members' },
  { id: 'expiring', label: 'Expiring plans' },
] as const;

export function ReportsPage() {
  const members = useMembers({ full: true });
  const attendance = useAttendance();
  const payments = usePayments();
  const chart = useChartTheme();
  const [kind, setKind] = useState<(typeof kinds)[number]['id']>('attendance');
  const today = new Date().toISOString().slice(0, 10);
  const fromDefault = new Date(Date.now() - 13 * 86400000).toISOString().slice(0, 10);
  const [range, setRange] = useState({ from: fromDefault, to: today });
  const [status, setStatus] = useState('ALL');
  const [page, setPage] = useState(0);

  const dataReady = members.data && attendance.data && payments.data;

  const table = useMemo(() => {
    if (!dataReady) return { headers: [] as string[], rows: [] as Array<Array<string | number>>, visual: [] as { name: string; value: number }[] };
    const inRange = (iso: string) => iso.slice(0, 10) >= range.from && iso.slice(0, 10) <= range.to;
    if (kind === 'attendance') {
      const rows = attendance.data!.filter((r) => inRange(r.timestamp) && (status === 'ALL' || r.status === status));
      return {
        headers: ['Date', 'Member', 'Status', 'Device'],
        rows: rows.map((r) => [formatDate(r.timestamp), r.memberName, r.status, r.deviceName]),
        visual: weekdayish(rows.map((r) => r.timestamp)),
      };
    }
    if (kind === 'payments') {
      const rows = payments.data!.filter((p) => inRange(p.date) && (status === 'ALL' || p.status === status));
      return {
        headers: ['Date', 'Member', 'Amount', 'Status'],
        rows: rows.map((p) => [
          formatDate(p.date),
          members.data!.find((m) => paymentBelongsToMember(p, m))?.name || p.memberName || '',
          p.amount,
          p.status,
        ]),
        visual: weekdayish(rows.filter((p) => p.status === 'PAID').map((p) => p.date), rows.filter((p) => p.status === 'PAID').map((p) => p.amount)),
      };
    }
    if (kind === 'expired' || kind === 'expiring' || kind === 'membership') {
      const want = kind === 'expired' ? 'EXPIRED' : kind === 'expiring' ? 'EXPIRING' : status;
      const rows = members.data!.filter((m) => (want === 'ALL' ? true : m.membership?.status === want));
      return {
        headers: ['Member', 'Plan', 'Status', 'Expiry'],
        rows: rows.map((m) => [m.name, m.plan?.name ?? '', m.membership?.status ?? '', formatDate(m.membership?.expiryDate)]),
        visual: [
          { name: 'Active', value: members.data!.filter((m) => m.membership?.status === 'ACTIVE').length },
          { name: 'Expiring', value: members.data!.filter((m) => m.membership?.status === 'EXPIRING').length },
          { name: 'Expired', value: members.data!.filter((m) => m.membership?.status === 'EXPIRED').length },
        ],
      };
    }
    return {
      headers: ['Member', 'Plan', 'Status', 'Expiry'],
      rows: members.data!.map((m) => [m.name, m.plan?.name ?? '', m.membership?.status ?? '', formatDate(m.membership?.expiryDate)]),
      visual: [
        { name: 'Active', value: members.data!.filter((m) => m.membership?.status === 'ACTIVE').length },
        { name: 'Expiring', value: members.data!.filter((m) => m.membership?.status === 'EXPIRING').length },
        { name: 'Expired', value: members.data!.filter((m) => m.membership?.status === 'EXPIRED').length },
      ],
    };
  }, [kind, range, status, dataReady, members.data, attendance.data, payments.data]);

  if (!dataReady) return <LoadingState />;

  return (
    <div className="flex flex-col lg:min-h-full lg:flex-1">
      <PageHeader
        title="Reports"
        description="The same Members, Attendance, and Payment History data, as charts you can export."
        actions={
          <>
            <DataExportButton filename={`${kind}.csv`} headers={table.headers} rows={table.rows} />
            <PrintButton />
          </>
        }
      />
      <FilterBar>
        <Select value={kind} onChange={(v) => { setKind(v as typeof kind); setPage(0); }} className="w-full min-w-0 lg:w-auto">
          {kinds.map((k) => (
            <option key={k.id} value={k.id}>{k.label}</option>
          ))}
        </Select>
        <DateRangePicker from={range.from} to={range.to} onChange={(next) => { setRange(next); setPage(0); }} />
        <Select value={status} onChange={(v) => { setStatus(v); setPage(0); }} className="w-full min-w-0 lg:w-auto">
          <option value="ALL">All statuses</option>
          <option value="GRANTED">Granted</option>
          <option value="DENIED">Denied</option>
          <option value="PAID">Paid</option>
          <option value="PENDING">Pending</option>
          <option value="ACTIVE">Active</option>
          <option value="EXPIRED">Expired</option>
        </Select>
      </FilterBar>
      <ChartCard title="Chart">
        <div className="h-44 lg:h-80">
          <ResponsiveContainer>
            <BarChart data={table.visual} barCategoryGap="22%">
              <CartesianGrid stroke={chart.grid} vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: chart.tick }} />
              <YAxis width={36} tick={{ fill: chart.tick }} />
              <Tooltip
                formatter={(v) => (kind === 'payments' ? formatINR(Number(v)) : v)}
                contentStyle={chart.tooltip}
              />
              <Bar dataKey="value" fill={chart.accent} maxBarSize={26} radius={[5, 5, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>
      <div className="mt-3 flex flex-col lg:min-h-0 lg:flex-1">
        <DataTable
          columns={table.headers.map((h, i) => ({
            key: h,
            header: h,
            render: (row: Array<string | number>) => String(row[i]),
          }))}
          rows={table.rows.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE)}
          rowKey={(row) => row.join('|')}
          page={page}
          pageSize={PAGE_SIZE}
          total={table.rows.length}
          onPage={setPage}
        />
      </div>
    </div>
  );
}

function weekdayish(dates: string[], amounts?: number[]) {
  const map = new Map<string, number>();
  dates.forEach((d, i) => {
    const key = d.slice(5, 10);
    map.set(key, (map.get(key) ?? 0) + (amounts?.[i] ?? 1));
  });
  return [...map.entries()].slice(-14).map(([name, value]) => ({ name, value }));
}
