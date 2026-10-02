import { useEffect, useState } from 'react';
import { Button } from '@/components/Button';
import { DataTable } from '@/components/DataTable';
import { Field, TextInput } from '@/components/Field';
import {
  fetchSchedules,
  pushSchedules,
  saveSchedules,
  type DeviceSchedules,
} from '@/services/liveDevice';
import { useUiStore } from '@/store/uiStore';
import { downloadCsv } from './helpers';

function useSchedules() {
  const toast = useUiStore((s) => s.pushToast);
  const [data, setData] = useState<DeviceSchedules | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetchSchedules().then(setData).catch((e: Error) => toast({ kind: 'error', title: e.message }));
  }, [toast]);

  async function persist(next: DeviceSchedules) {
    setData(next);
    await saveSchedules(next);
  }

  async function send(kind: 'shift' | 'holiday' | 'bell' | 'question') {
    if (!data) return;
    setBusy(true);
    try {
      await saveSchedules(data);
      const result = await pushSchedules(kind);
      toast({
        kind: result.result === false ? 'error' : 'success',
        title: result.result === false ? String(result.msg ?? 'Device rejected the update') : 'Sent to device',
      });
    } catch (e) {
      toast({ kind: 'error', title: e instanceof Error ? e.message : 'Send failed' });
    } finally {
      setBusy(false);
    }
  }

  return { data, set: persist, send, busy };
}

const scheduleTabs = [
  { id: 'shift', label: 'Shifts' },
  { id: 'holidays', label: 'Holidays' },
  { id: 'bell', label: 'Bells' },
  { id: 'question', label: 'Questions' },
] as const;

export function ScheduleHub() {
  const [tab, setTab] = useState<(typeof scheduleTabs)[number]['id']>('shift');
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        {scheduleTabs.map((item) => (
          <Button key={item.id} variant={tab === item.id ? 'primary' : 'secondary'} onClick={() => setTab(item.id)}>
            {item.label}
          </Button>
        ))}
      </div>
      {tab === 'shift' ? <ShiftPanel /> : null}
      {tab === 'holidays' ? <HolidaysPanel /> : null}
      {tab === 'bell' ? <BellPanel /> : null}
      {tab === 'question' ? <QuestionPanel /> : null}
    </div>
  );
}

function Actions({ onSend, onExport, busy }: { onSend: () => void; onExport: () => void; busy: boolean }) {
  return (
    <div className="mb-3 flex flex-wrap gap-2">
      <Button disabled={busy} onClick={onSend}>{busy ? 'Sending…' : 'Save on device'}</Button>
      <Button variant="secondary" onClick={onExport}>Export</Button>
    </div>
  );
}

export function ShiftPanel() {
  const { data, set, send, busy } = useSchedules();
  if (!data) return null;
  return (
    <div>
      <p className="mb-3 text-[13px] text-ink-soft">
        Name up to 10 letters. Times are HH:MM. Type 0 is normal, 1 is overtime.
      </p>
      <Actions
        busy={busy}
        onSend={() => void send('shift')}
        onExport={() =>
          downloadCsv(
            'shifts.csv',
            ['NO', 'Name', 'Sec1 On', 'Sec1 Off', 'Sec1 Type', 'Sec2 On', 'Sec2 Off', 'Sec2 Type', 'Sec3 On', 'Sec3 Off', 'Sec3 Type', 'Cutoff'],
            data.shifts.map((s) => [s.no, s.name, s.sec1.on, s.sec1.off, s.sec1.type, s.sec2.on, s.sec2.off, s.sec2.type, s.sec3.on, s.sec3.off, s.sec3.type, s.cutoff]),
          )
        }
      />
      <DataTable
        rows={data.shifts}
        rowKey={(row) => String(row.no)}
        columns={[
          { key: 'no', header: 'No', render: (row) => row.no },
          { key: 'name', header: 'Name', render: (row) => (
            <TextInput value={row.name} onChange={(e) => {
              const shifts = data.shifts.map((s) => s.no === row.no ? { ...s, name: e.target.value } : s);
              void set({ ...data, shifts });
            }} />
          ) },
          { key: 's1on', header: 'Sec1 on', render: (row) => (
            <TextInput value={row.sec1.on} onChange={(e) => {
              const shifts = data.shifts.map((s) => s.no === row.no ? { ...s, sec1: { ...s.sec1, on: e.target.value } } : s);
              void set({ ...data, shifts });
            }} />
          ) },
          { key: 's1off', header: 'Off', render: (row) => (
            <TextInput value={row.sec1.off} onChange={(e) => {
              const shifts = data.shifts.map((s) => s.no === row.no ? { ...s, sec1: { ...s.sec1, off: e.target.value } } : s);
              void set({ ...data, shifts });
            }} />
          ) },
          { key: 's1type', header: 'Type', render: (row) => (
            <TextInput value={row.sec1.type} onChange={(e) => {
              const shifts = data.shifts.map((s) => s.no === row.no ? { ...s, sec1: { ...s.sec1, type: e.target.value } } : s);
              void set({ ...data, shifts });
            }} />
          ) },
          { key: 's2on', header: 'Sec2 on', render: (row) => (
            <TextInput value={row.sec2.on} onChange={(e) => {
              const shifts = data.shifts.map((s) => s.no === row.no ? { ...s, sec2: { ...s.sec2, on: e.target.value } } : s);
              void set({ ...data, shifts });
            }} />
          ) },
          { key: 's2off', header: 'Off', render: (row) => (
            <TextInput value={row.sec2.off} onChange={(e) => {
              const shifts = data.shifts.map((s) => s.no === row.no ? { ...s, sec2: { ...s.sec2, off: e.target.value } } : s);
              void set({ ...data, shifts });
            }} />
          ) },
          { key: 's2type', header: 'Type', render: (row) => (
            <TextInput value={row.sec2.type} onChange={(e) => {
              const shifts = data.shifts.map((s) => s.no === row.no ? { ...s, sec2: { ...s.sec2, type: e.target.value } } : s);
              void set({ ...data, shifts });
            }} />
          ) },
          { key: 's3on', header: 'Sec3 on', render: (row) => (
            <TextInput value={row.sec3.on} onChange={(e) => {
              const shifts = data.shifts.map((s) => s.no === row.no ? { ...s, sec3: { ...s.sec3, on: e.target.value } } : s);
              void set({ ...data, shifts });
            }} />
          ) },
          { key: 's3off', header: 'Off', render: (row) => (
            <TextInput value={row.sec3.off} onChange={(e) => {
              const shifts = data.shifts.map((s) => s.no === row.no ? { ...s, sec3: { ...s.sec3, off: e.target.value } } : s);
              void set({ ...data, shifts });
            }} />
          ) },
          { key: 's3type', header: 'Type', render: (row) => (
            <TextInput value={row.sec3.type} onChange={(e) => {
              const shifts = data.shifts.map((s) => s.no === row.no ? { ...s, sec3: { ...s.sec3, type: e.target.value } } : s);
              void set({ ...data, shifts });
            }} />
          ) },
          { key: 'cut', header: 'Cutoff', render: (row) => (
            <TextInput value={row.cutoff} onChange={(e) => {
              const shifts = data.shifts.map((s) => s.no === row.no ? { ...s, cutoff: e.target.value } : s);
              void set({ ...data, shifts });
            }} />
          ) },
        ]}
      />
    </div>
  );
}

export function HolidaysPanel() {
  const { data, set, send, busy } = useSchedules();
  if (!data) return null;
  return (
    <div>
      <p className="mb-3 text-[13px] text-ink-soft">Dates use mm-dd. Shift and timezone are 0–8.</p>
      <Actions
        busy={busy}
        onSend={() => void send('holiday')}
        onExport={() =>
          downloadCsv('holidays.csv', ['NO', 'Name', 'Start', 'End', 'Shift', 'Timezone'], data.holidays.map((h) => [h.no, h.name, h.start, h.end, h.shift, h.timezone]))
        }
      />
      <DataTable
        rows={data.holidays}
        rowKey={(row) => String(row.no)}
        columns={[
          { key: 'no', header: 'No', render: (row) => row.no },
          { key: 'name', header: 'Name', render: (row) => (
            <TextInput value={row.name} onChange={(e) => {
              const holidays = data.holidays.map((h) => h.no === row.no ? { ...h, name: e.target.value } : h);
              void set({ ...data, holidays });
            }} />
          ) },
          { key: 'start', header: 'Start', render: (row) => (
            <TextInput value={row.start} onChange={(e) => {
              const holidays = data.holidays.map((h) => h.no === row.no ? { ...h, start: e.target.value } : h);
              void set({ ...data, holidays });
            }} />
          ) },
          { key: 'end', header: 'End', render: (row) => (
            <TextInput value={row.end} onChange={(e) => {
              const holidays = data.holidays.map((h) => h.no === row.no ? { ...h, end: e.target.value } : h);
              void set({ ...data, holidays });
            }} />
          ) },
          { key: 'shift', header: 'Shift', render: (row) => (
            <TextInput value={row.shift} onChange={(e) => {
              const holidays = data.holidays.map((h) => h.no === row.no ? { ...h, shift: e.target.value } : h);
              void set({ ...data, holidays });
            }} />
          ) },
          { key: 'tz', header: 'Timezone', render: (row) => (
            <TextInput value={row.timezone} onChange={(e) => {
              const holidays = data.holidays.map((h) => h.no === row.no ? { ...h, timezone: e.target.value } : h);
              void set({ ...data, holidays });
            }} />
          ) },
        ]}
      />
    </div>
  );
}

export function BellPanel() {
  const { data, set, send, busy } = useSchedules();
  if (!data) return null;
  const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
  return (
    <div>
      <p className="mb-3 text-[13px] text-ink-soft">Bell time uses HH:MM. Tick the days the terminal should ring.</p>
      <Actions
        busy={busy}
        onSend={() => void send('bell')}
        onExport={() =>
          downloadCsv('bells.csv', ['NO', 'Time', ...days], data.bells.map((b) => [b.no, b.time, ...days.map((d) => b[d] ? '1' : '0')]))
        }
      />
      <DataTable
        rows={data.bells}
        rowKey={(row) => String(row.no)}
        columns={[
          { key: 'no', header: 'No', render: (row) => row.no },
          { key: 'time', header: 'Time', render: (row) => (
            <TextInput value={row.time} onChange={(e) => {
              const bells = data.bells.map((b) => b.no === row.no ? { ...b, time: e.target.value } : b);
              void set({ ...data, bells });
            }} />
          ) },
          ...days.map((day) => ({
            key: day,
            header: day.toUpperCase(),
            render: (row: (typeof data.bells)[number]) => (
              <input
                type="checkbox"
                checked={row[day]}
                onChange={(e) => {
                  const bells = data.bells.map((b) => b.no === row.no ? { ...b, [day]: e.target.checked } : b);
                  void set({ ...data, bells });
                }}
              />
            ),
          })),
        ]}
      />
    </div>
  );
}

export function QuestionPanel() {
  const { data, set, send, busy } = useSchedules();
  if (!data) return null;
  const q = data.question;
  return (
    <div className="space-y-3">
      <Actions
        busy={busy}
        onSend={() => void send('question')}
        onExport={() =>
          downloadCsv('questionnaire.csv', ['Single', 'Title', 'Voice', 'Error', 'Event', 'Info', 'Required'], [
            [q.single, q.title, q.voice, q.error, '', '', ''],
            ...q.events.map((ev) => ['', '', '', '', ev.no, ev.info, ev.required]),
          ])
        }
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Single choice"><TextInput value={q.single} onChange={(e) => void set({ ...data, question: { ...q, single: e.target.value } })} /></Field>
        <Field label="Title"><TextInput value={q.title} onChange={(e) => void set({ ...data, question: { ...q, title: e.target.value } })} /></Field>
        <Field label="Voice"><TextInput value={q.voice} onChange={(e) => void set({ ...data, question: { ...q, voice: e.target.value } })} /></Field>
        <Field label="Error message"><TextInput value={q.error} onChange={(e) => void set({ ...data, question: { ...q, error: e.target.value } })} /></Field>
      </div>
      {q.events.map((ev, i) => (
        <div key={ev.no} className="grid grid-cols-3 gap-2">
          <Field label={`Event ${ev.no}`}><TextInput value={String(ev.no)} readOnly /></Field>
          <Field label="Event information"><TextInput value={ev.info} onChange={(e) => {
            const events = q.events.map((row, idx) => idx === i ? { ...row, info: e.target.value } : row);
            void set({ ...data, question: { ...q, events } });
          }} /></Field>
          <Field label="Required"><TextInput value={ev.required} onChange={(e) => {
            const events = q.events.map((row, idx) => idx === i ? { ...row, required: e.target.value } : row);
            void set({ ...data, question: { ...q, events } });
          }} /></Field>
        </div>
      ))}
    </div>
  );
}
