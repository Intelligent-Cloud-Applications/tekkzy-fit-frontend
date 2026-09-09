import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/Button';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { DataExportButton, PrintButton } from '@/components/DataExportButton';
import { DataTable } from '@/components/DataTable';
import { DateRangePicker } from '@/components/DateRangePicker';
import { FilterBar, Select } from '@/components/FilterBar';
import { LoadingState } from '@/components/LoadingState';
import { PageHeader } from '@/components/PageHeader';
import { SearchInput } from '@/components/SearchInput';
import { StatusBadge } from '@/components/StatusBadge';
import { useGymData } from '@/context/GymDataContext';
import { useAttendance, useMembers } from '@/hooks/useGymQueries';
import { findRelatedMember } from '@/services/members';
import { formatDate, formatTime, isSameDay } from '@/lib/format';
import { attendanceInDateRange, deleteAttendanceRows, weekdayBuckets } from '@/services/attendance';
import { importLiveLogs, ingestRtLogs, isLiveSyncPaused } from '@/services/liveDevice';
import { useUiStore } from '@/store/uiStore';

const PAGE_SIZE = 20;

export function AttendancePage() {
  const attendance = useAttendance();
  const members = useMembers({ full: true });
  const { refresh } = useGymData();
  const toast = useUiStore((s) => s.pushToast);
  const [params] = useSearchParams();
  const [q, setQ] = useState(params.get('q') || '');
  const [status, setStatus] = useState('ALL');
  const [type, setType] = useState('ALL');
  const [page, setPage] = useState(0);
  const [confirm, setConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
  const [range, setRange] = useState({ from: weekAgo, to: today });
  const [deleteRange, setDeleteRange] = useState({ from: '', to: '' });

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

  const deleteRows = useMemo(
    () => attendanceInDateRange(attendance.data ?? [], deleteRange.from, deleteRange.to),
    [attendance.data, deleteRange],
  );
  const deleteCount = deleteRows.length;
  const deleteReady = Boolean(deleteRange.from || deleteRange.to);

  if (!attendance.data || !members.data) return <LoadingState />;

  const todayRows = attendance.data.filter((r) => isSameDay(r.timestamp) && r.status === 'GRANTED');
  const month = new Date().getMonth();
  const monthRows = attendance.data.filter(
    (r) => r.status === 'GRANTED' && new Date(r.timestamp).getMonth() === month,
  );

  function deleteLabel() {
    const start = deleteRange.from || deleteRange.to;
    const end = deleteRange.to || deleteRange.from;
    if (start === end) return formatDate(start);
    return `${formatDate(start)} to ${formatDate(end)}`;
  }

  return (
    <div className="flex flex-col lg:min-h-full lg:flex-1">
      <PageHeader
        compact
        title="Attendance"
        description={`Today ${todayRows.length} · This week ${weekdayBuckets(attendance.data).reduce((s, d) => s + d.count, 0)} · This month ${monthRows.length}`}
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
      <div className="flex flex-col">
        <p className="mb-3 text-[12px] font-medium text-ink-soft lg:hidden">
          Today {todayRows.length} · This week {weekdayBuckets(attendance.data).reduce((s, d) => s + d.count, 0)} · This month {monthRows.length}
        </p>
        <FilterBar>
          <SearchInput value={q} onChange={(v) => { setQ(v); setPage(0); }} className="w-full sm:max-w-xs" placeholder="Member" />
          <DateRangePicker from={range.from} to={range.to} onChange={(next) => { setRange(next); setPage(0); }} />
          <div className="grid w-full grid-cols-2 gap-2 sm:contents">
            <Select className="w-full min-w-0" value={status} onChange={(v) => { setStatus(v); setPage(0); }}>
              <option value="ALL">All statuses</option>
              <option value="GRANTED">Granted</option>
              <option value="DENIED">Denied</option>
              <option value="UNKNOWN">Unknown</option>
              <option value="EXPIRED">Expired</option>
              <option value="SUSPENDED">Suspended</option>
            </Select>
            <Select className="w-full min-w-0" value={type} onChange={(v) => { setType(v); setPage(0); }}>
              <option value="ALL">Entry / Exit</option>
              <option value="ENTRY">Entry</option>
              <option value="EXIT">Exit</option>
            </Select>
          </div>
        </FilterBar>
        <div className="mb-3 flex w-full flex-col gap-2.5 rounded-2xl border border-line bg-[var(--hover-fill)] px-3 py-3 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="text-[12px] font-semibold text-ink">Delete by date</div>
          <DateRangePicker
            from={deleteRange.from}
            to={deleteRange.to}
            onChange={(next) => {
              const from = next.from;
              const to = next.to || next.from;
              setDeleteRange({ from, to: to || from });
            }}
          />
          <div className="min-w-0 text-[13px] font-semibold text-ink sm:flex-1">
            {deleteReady
              ? `${deleteCount} log${deleteCount === 1 ? '' : 's'} will be deleted`
              : 'Select dates to see how many logs will be deleted'}
          </div>
          <Button
            variant="danger"
            className="w-full sm:w-auto"
            disabled={!deleteReady || deleteCount === 0 || deleting}
            loading={deleting}
            onClick={() => setConfirm(true)}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete {deleteReady ? deleteCount : ''}
          </Button>
        </div>
        <DataTable
          fit
          compact
          renderCard={(r) => {
            const member = findRelatedMember(members.data ?? [], { memberId: r.memberId, memberCode: r.memberCode });
            const name = member?.name || r.memberName;
            return (
              <div className="surface p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-[15px] font-semibold leading-snug">
                      {member ? (
                        <Link className="text-accent hover:underline" to={`/members/${member.id}`}>{name}</Link>
                      ) : name}
                    </div>
                    <div className="mt-0.5 text-[12px] text-ink-soft">
                      {formatDate(r.timestamp)} · {formatTime(r.timestamp)}
                    </div>
                  </div>
                  <StatusBadge value={r.status} />
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <span className="rounded-full border border-line px-2 py-0.5 text-[11px] font-semibold">ID {r.memberCode ?? '—'}</span>
                  <span className="rounded-full border border-line px-2 py-0.5 text-[11px] font-semibold">{r.type}</span>
                  {r.reason ? (
                    <span className="rounded-full border border-line px-2 py-0.5 text-[11px] font-medium text-ink-soft">{r.reason}</span>
                  ) : null}
                </div>
              </div>
            );
          }}
          columns={[
            { key: 'd', header: 'Date', width: '14%', render: (r) => formatDate(r.timestamp) },
            { key: 't', header: 'Time', width: '13%', render: (r) => formatTime(r.timestamp) },
            {
              key: 'm',
              header: 'Member',
              width: '22%',
              render: (r) => {
                const member = findRelatedMember(members.data ?? [], { memberId: r.memberId, memberCode: r.memberCode });
                const name = member?.name || r.memberName;
                return member ? (
                  <Link className="text-accent hover:underline" to={`/members/${member.id}`}>{name}</Link>
                ) : name;
              },
            },
            { key: 'id', header: 'ID', width: '10%', render: (r) => r.memberCode ?? '—' },
            { key: 'ty', header: 'In/Out', width: '13%', render: (r) => r.type },
            { key: 's', header: 'Status', width: '14%', render: (r) => <StatusBadge value={r.status} /> },
            { key: 'r', header: 'Reason', width: '14%', render: (r) => r.reason ?? '—' },
          ]}
          rows={rows.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE)}
          rowKey={(r) => r.id}
          page={page}
          pageSize={PAGE_SIZE}
          total={rows.length}
          onPage={setPage}
        />
      </div>
      <ConfirmDialog
        open={confirm}
        title="Delete attendance"
        message={`${deleteCount} log${deleteCount === 1 ? '' : 's'} from ${deleteLabel()} will be saved in the monthly report and removed from attendance.`}
        confirmLabel={`Delete ${deleteCount}`}
        danger
        onClose={() => setConfirm(false)}
        onConfirm={() => {
          const selected = deleteRows;
          setDeleting(true);
          void deleteAttendanceRows(selected)
            .then(async (count) => {
              await refresh({ slices: ['attendance', 'events'], quiet: true });
              toast({ kind: 'success', title: `${count} logs saved to monthly report and removed` });
            })
            .catch((err: unknown) => {
              toast({ kind: 'error', title: err instanceof Error ? err.message : 'Could not delete attendance' });
            })
            .finally(() => setDeleting(false));
        }}
      />
    </div>
  );
}
