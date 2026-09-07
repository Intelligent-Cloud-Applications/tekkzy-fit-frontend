import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartCard } from '@/components/ChartCard';
import { DataExportButton, PrintButton } from '@/components/DataExportButton';
import { DataTable } from '@/components/DataTable';
import { DateRangePicker } from '@/components/DateRangePicker';
import { FilterBar, Select } from '@/components/FilterBar';
import { LoadingState } from '@/components/LoadingState';
import { PageHeader } from '@/components/PageHeader';
import { SearchInput } from '@/components/SearchInput';
import { StatCard } from '@/components/StatCard';
import { StatusBadge } from '@/components/StatusBadge';
import { useGymData } from '@/context/GymDataContext';
import { useAttendance, useMembers } from '@/hooks/useGymQueries';
import { findRelatedMember } from '@/services/members';
import { formatDate, formatTime, isSameDay } from '@/lib/format';
import { weekdayBuckets } from '@/services/attendance';
import { useChartTheme } from '@/hooks/useChartTheme';
import { importLiveLogs, ingestRtLogs, isLiveSyncPaused } from '@/services/liveDevice';

const PAGE_SIZE = 8;

export function AttendancePage() {
  const attendance = useAttendance();
  const members = useMembers({ full: true });
  const { refresh } = useGymData();
  const chart = useChartTheme();
  const [params] = useSearchParams();
  const [q, setQ] = useState(params.get('q') || '');
  const [status, setStatus] = useState('ALL');
  const [type, setType] = useState('ALL');
  const [page, setPage] = useState(0);
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
  const [range, setRange] = useState({ from: weekAgo, to: today });

  useEffect(() => {
    const next = params.get('q') || '';
    if (next) setQ(next);
  }, [params]);

  useEffect(() => {
    let stop = false;
    let caughtUp = false;
    async function pull(fromHistory = false) {
      if (stop || isLiveSyncPaused()) return;
      try {
        if (fromHistory && !caughtUp) {
          await importLiveLogs().catch(() => 0);
          caughtUp = true;
        }
        await ingestRtLogs();
        if (!stop) await refresh({ slices: ['attendance', 'events'], quiet: true });
      } catch {
        /* next tick */
      }
    }
    void pull(true);
    const timer = window.setInterval(() => void pull(), 4_000);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, [refresh]);

  const rows = useMemo(() => {
    return (attendance.data ?? []).filter((r) => {
      const day = r.timestamp.slice(0, 10);
      const hay = `${r.memberName} ${r.memberCode ?? ''}`.toLowerCase();
      return (
        hay.includes(q.toLowerCase()) &&
        (status === 'ALL' || r.status === status) &&
        (type === 'ALL' || r.type === type) &&
        day >= range.from &&
        day <= range.to
      );
    });
  }, [attendance.data, q, status, type, range]);

  if (!attendance.data || !members.data) return <LoadingState />;

  const todayRows = attendance.data.filter((r) => isSameDay(r.timestamp) && r.status === 'GRANTED');
  const month = new Date().getMonth();
  const monthRows = attendance.data.filter(
    (r) => r.status === 'GRANTED' && new Date(r.timestamp).getMonth() === month,
  );

  return (
    <div className="flex flex-col lg:min-h-full lg:flex-1">
      <PageHeader
        title="Attendance"
        description="Visits from the face terminal as they happen. Keep Tekkzy Fit on the gym PC."
        actions={
          <>
            <DataExportButton
              filename="attendance.csv"
              headers={['Date', 'Time', 'Member', 'ID', 'Device', 'Type', 'Status', 'Reason']}
              rows={rows.map((r) => [
                formatDate(r.timestamp),
                formatTime(r.timestamp),
                r.memberName,
                r.memberCode ?? '',
                r.deviceName,
                r.type,
                r.status,
                r.reason ?? '',
              ])}
            />
            <PrintButton />
          </>
        }
      />
      <div className="mb-3 grid w-full grid-cols-3 gap-2.5">
        <StatCard label="Today" value={todayRows.length} />
        <StatCard label="This week" value={weekdayBuckets(attendance.data).reduce((s, d) => s + d.count, 0)} />
        <StatCard label="This month" value={monthRows.length} />
      </div>
      <div className="mb-3 hidden lg:block">
        <ChartCard title="Weekly granted entries">
          <div className="h-56 lg:h-72">
            <ResponsiveContainer>
              <BarChart data={weekdayBuckets(attendance.data)} barCategoryGap="24%">
                <CartesianGrid stroke={chart.grid} vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: chart.tick }} />
                <YAxis allowDecimals={false} width={28} tick={{ fill: chart.tick }} />
                <Tooltip contentStyle={chart.tooltip} />
                <Bar dataKey="count" fill={chart.accent} maxBarSize={24} radius={[5, 5, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>
      <div className="flex flex-col lg:min-h-0 lg:flex-1">
        <FilterBar>
          <SearchInput value={q} onChange={(v) => { setQ(v); setPage(0); }} className="min-w-0 w-full basis-full flex-1 lg:min-w-[16rem] lg:basis-auto" placeholder="Member" />
          <DateRangePicker from={range.from} to={range.to} onChange={(next) => { setRange(next); setPage(0); }} />
          <div className="grid w-full grid-cols-2 gap-2 lg:contents">
            <Select value={status} onChange={(v) => { setStatus(v); setPage(0); }} className="w-full min-w-0">
              <option value="ALL">All statuses</option>
              <option value="GRANTED">Granted</option>
              <option value="DENIED">Denied</option>
              <option value="UNKNOWN">Unknown</option>
              <option value="EXPIRED">Expired</option>
              <option value="SUSPENDED">Suspended</option>
            </Select>
            <Select value={type} onChange={(v) => { setType(v); setPage(0); }} className="col-span-2 w-full min-w-0 lg:col-span-1">
              <option value="ALL">Entry / Exit</option>
              <option value="ENTRY">Entry</option>
              <option value="EXIT">Exit</option>
            </Select>
          </div>
        </FilterBar>
        <DataTable
          columns={[
            { key: 'd', header: 'Date', render: (r) => formatDate(r.timestamp) },
            { key: 't', header: 'Time', render: (r) => formatTime(r.timestamp) },
            {
              key: 'm',
              header: 'Member',
              render: (r) => {
                const member = findRelatedMember(members.data ?? [], { memberId: r.memberId, memberCode: r.memberCode });
                const name = member?.name || r.memberName;
                return member ? (
                  <Link className="text-accent hover:underline" to={`/members/${member.id}`}>{name}</Link>
                ) : name;
              },
            },
            { key: 'id', header: 'Member ID', render: (r) => r.memberCode ?? '—' },
            { key: 'ty', header: 'Entry/Exit', render: (r) => r.type },
            { key: 's', header: 'Status', render: (r) => <StatusBadge value={r.status} /> },
            { key: 'r', header: 'Reason', render: (r) => r.reason ?? '—' },
          ]}
          rows={rows.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE)}
          rowKey={(r) => r.id}
          page={page}
          pageSize={PAGE_SIZE}
          total={rows.length}
          onPage={setPage}
        />
      </div>
    </div>
  );
}
