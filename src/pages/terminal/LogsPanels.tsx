import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/Button';
import { DataTable } from '@/components/DataTable';
import { Field, TextInput } from '@/components/Field';
import { SearchInput } from '@/components/SearchInput';
import { cleanLiveLogs, fetchLiveLogs, fetchRtLogs, type LiveLog } from '@/services/liveDevice';
import { useUiStore } from '@/store/uiStore';
import { downloadCsv, verifyLabel } from './helpers';

function LogTable({ rows, empty }: { rows: LiveLog[]; empty: string }) {
  return (
    <DataTable
      rows={rows}
      rowKey={(r) => `${r.enrollid}-${r.time}-${r.name ?? ''}-${r.event ?? ''}`}
      empty={empty}
      columns={[
        { key: 't', header: 'Time', render: (r) => r.time || '—' },
        { key: 'id', header: 'ID', render: (r) => String(r.enrollid) },
        { key: 'n', header: 'Name', render: (r) => r.name || '—' },
        { key: 'm', header: 'How', render: (r) => verifyLabel(r.mode) },
        { key: 'io', header: 'In / out', render: (r) => String(r.inout ?? '') },
        { key: 'e', header: 'Event', render: (r) => String(r.event ?? 'Normal Access') },
        { key: 'note', header: 'Note', render: (r) => r.note || '—' },
      ]}
    />
  );
}

export function RtLogPanel() {
  const toast = useUiStore((s) => s.pushToast);
  const [logs, setLogs] = useState<LiveLog[]>([]);
  const [q, setQ] = useState('');

  async function load() {
    const { logs: rows, offline } = await fetchRtLogs();
    if (offline) return;
    setLogs(rows);
  }

  useEffect(() => {
    void load().catch((e: Error) => toast({ kind: 'error', title: e.message }));
    const timer = window.setInterval(() => void load().catch(() => undefined), 8_000);
    return () => window.clearInterval(timer);
  }, [toast]);

  const rows = logs.filter((r) => `${r.enrollid} ${r.name ?? ''}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="space-y-3">
      <div className="flex w-full flex-wrap items-center gap-2">
        <SearchInput value={q} onChange={setQ} placeholder="Name or ID" className="min-w-[16rem] flex-1" />
        <Button variant="secondary" onClick={() => void load()}>Refresh</Button>
      </div>
      <LogTable rows={rows} empty="No live punches yet. Scan a face on the terminal." />
    </div>
  );
}

export function LogInfoPanel() {
  const toast = useUiStore((s) => s.pushToast);
  const [logs, setLogs] = useState<LiveLog[]>([]);
  const [id, setId] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');

  async function load() {
    const { logs: rows, offline } = await fetchLiveLogs();
    if (offline) return;
    setLogs(rows);
  }

  useEffect(() => {
    void load().catch((e: Error) => toast({ kind: 'error', title: e.message }));
  }, [toast]);

  const rows = useMemo(() => logs.filter((r) => {
    if (id && String(r.enrollid) !== id) return false;
    const day = (r.time ?? '').slice(0, 10);
    if (start && day && day < start) return false;
    if (end && day && day > end) return false;
    return true;
  }), [logs, id, start, end]);

  return (
    <div className="space-y-3">
      <p className="text-[13px] text-ink-soft">Past scans stored on the device.</p>
      <div className="surface grid grid-cols-1 gap-3 p-4 sm:grid-cols-3">
        <Field label="Device ID"><TextInput value={id} onChange={(e) => setId(e.target.value)} /></Field>
        <Field label="From"><TextInput type="date" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
        <Field label="To"><TextInput type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => downloadCsv('terminal-logs.csv', ['Time', 'ID', 'Name', 'Mode', 'Inout', 'Event', 'Note'], rows.map((r) => [r.time, r.enrollid, r.name, r.mode, r.inout, r.event, r.note]))}>
          Export
        </Button>
        <Button
          variant="danger"
          onClick={() =>
            void cleanLiveLogs()
              .then(() => {
                toast({ kind: 'success', title: 'Device logs cleared' });
                void load();
              })
              .catch((e: Error) => toast({ kind: 'error', title: e.message }))
          }
        >
          Clear device logs
        </Button>
      </div>
      <PunchTotals rows={rows} />
      <LogTable rows={rows} empty="No matching records found." />
    </div>
  );
}

function PunchTotals({ rows }: { rows: LiveLog[] }) {
  const byUser = new Map<string, { name: string; count: number }>();
  for (const log of rows) {
    const key = String(log.enrollid);
    const cur = byUser.get(key) ?? { name: log.name || key, count: 0 };
    cur.count += 1;
    byUser.set(key, cur);
  }
  const summary = [...byUser.entries()].map(([id, v]) => ({ id, ...v })).slice(0, 8);
  if (!summary.length) return null;
  return (
    <div className="rounded-xl border border-line px-4 py-3 text-[13px]">
      <div className="mb-2 font-semibold">Scans in this list</div>
      <div className="grid gap-1 sm:grid-cols-2 xl:grid-cols-4">
        {summary.map((row) => (
          <div key={row.id} className="flex justify-between gap-3">
            <span className="truncate text-ink-soft">{row.name}</span>
            <span className="font-semibold">{row.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function LogsHub() {
  const [view, setView] = useState<'live' | 'history'>('live');
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        <Button variant={view === 'live' ? 'primary' : 'secondary'} onClick={() => setView('live')}>Live</Button>
        <Button variant={view === 'history' ? 'primary' : 'secondary'} onClick={() => setView('history')}>History</Button>
      </div>
      {view === 'live' ? <RtLogPanel /> : <LogInfoPanel />}
    </div>
  );
}

export function ReportPanel({ logs }: { logs?: LiveLog[] }) {
  const [rows, setRows] = useState<LiveLog[]>([]);
  useEffect(() => {
    if (logs) {
      setRows(logs);
      return;
    }
    void fetchLiveLogs().then((r) => setRows(r.logs)).catch(() => undefined);
  }, [logs]);

  const byUser = new Map<string, { name: string; count: number }>();
  for (const log of rows) {
    const key = String(log.enrollid);
    const cur = byUser.get(key) ?? { name: log.name || key, count: 0 };
    cur.count += 1;
    byUser.set(key, cur);
  }
  const summary = [...byUser.entries()].map(([id, v]) => ({ id, ...v }));

  return (
    <div className="space-y-3">
      <p className="text-[13px] text-ink-soft">How many times each person scanned.</p>
      <Button variant="secondary" onClick={() => downloadCsv('terminal-report.csv', ['ID', 'Name', 'Punches'], summary.map((r) => [r.id, r.name, r.count]))}>
        Export totals
      </Button>
      <DataTable
        rows={summary}
        rowKey={(r) => r.id}
        empty="No log data yet"
        columns={[
          { key: 'id', header: 'ID', render: (r) => r.id },
          { key: 'n', header: 'Name', render: (r) => r.name },
          { key: 'c', header: 'Punches', render: (r) => r.count },
        ]}
      />
    </div>
  );
}
