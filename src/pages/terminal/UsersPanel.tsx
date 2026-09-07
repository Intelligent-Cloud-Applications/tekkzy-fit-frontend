import { useEffect, useMemo, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/Button';
import { IconAction, RowActions } from '@/components/RowActions';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { DataTable } from '@/components/DataTable';
import { SearchInput } from '@/components/SearchInput';
import {
  deleteLiveUser,
  fetchLiveUsers,
  importLiveUsers,
  pushLiveUser,
  type LiveUser,
} from '@/services/liveDevice';
import { useInvalidateGym } from '@/hooks/useGymQueries';
import { useUiStore } from '@/store/uiStore';
import { downloadCsv, mark, parseCsv, privilegeLabel, verifyLabel } from './helpers';

export function UsersPanel({ onAdd }: { onAdd: (user?: LiveUser) => void }) {
  const toast = useUiStore((s) => s.pushToast);
  const invalidate = useInvalidateGym();
  const [users, setUsers] = useState<LiveUser[]>([]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [remove, setRemove] = useState<LiveUser | null>(null);

  async function load() {
    const preview = await fetchLiveUsers();
    if (preview.offline) return;
    setUsers(preview.users);
    await importLiveUsers(preview.users).catch(() => undefined);
    invalidate();
  }

  useEffect(() => {
    void load().catch((e: Error) => toast({ kind: 'error', title: e.message }));
    const timer = window.setInterval(() => void load().catch(() => undefined), 15_000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rows = useMemo(() => {
    const needle = q.toLowerCase();
    return users.filter((u) => `${u.id} ${u.name} ${u.department ?? ''}`.toLowerCase().includes(needle));
  }, [users, q]);

  function exportCsv() {
    downloadCsv(
      'terminal-users.csv',
      ['ID', 'Name', 'Dept', 'Shift', 'Privilege', 'Face', 'FP', 'PWD', 'Card', 'TZone', 'Group', 'Access', 'Verify', 'Birthday', 'Start', 'End'],
      rows.map((u) => [
        u.id, u.name, u.department, u.shift, privilegeLabel(u.admin), u.face, u.fingerprint, u.password, u.card,
        u.weekzone, u.group, u.access_times, u.verifymode, u.birthday, u.starttime, u.endtime,
      ]),
    );
  }

  async function importFile(file: File) {
    const text = await file.text();
    const [header, ...body] = parseCsv(text);
    const idIdx = header.findIndex((h) => h.toLowerCase() === 'id');
    const nameIdx = header.findIndex((h) => h.toLowerCase() === 'name');
    setBusy(true);
    try {
      for (const line of body) {
        const enrollid = line[idIdx] || line[0];
        const name = line[nameIdx] || line[1];
        if (enrollid && name) await pushLiveUser({ enrollid, name, department: line[2], shiftid: line[3] });
      }
      await load();
      toast({ kind: 'success', title: `Imported ${body.length} users` });
    } catch (e) {
      toast({ kind: 'error', title: e instanceof Error ? e.message : 'Import failed' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex w-full flex-wrap items-center gap-2">
        <Button onClick={() => onAdd()}>Add person</Button>
        <Button variant="secondary" onClick={exportCsv}>Export</Button>
        <label className="tap inline-flex min-h-10 cursor-pointer items-center rounded-full border border-line px-3.5 text-[13px] font-semibold">
          Import
          <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void importFile(file);
            e.target.value = '';
          }} />
        </label>
        <Button variant="secondary" disabled={busy} onClick={() => void load()}>Refresh</Button>
        <SearchInput value={q} onChange={setQ} placeholder="Find ID or name" className="min-w-[16rem] flex-1" />
      </div>
      <DataTable
        rows={rows}
        rowKey={(u) => u.id}
        empty="No users on the terminal"
        columns={[
          { key: 'id', header: 'ID', render: (u) => u.id },
          { key: 'n', header: 'Name', render: (u) => u.name },
          { key: 'd', header: 'Dept', render: (u) => u.department || '—' },
          { key: 's', header: 'Shift', render: (u) => String(u.shift ?? '1') },
          { key: 'p', header: 'Role', render: (u) => privilegeLabel(u.admin) },
          { key: 'f', header: 'Face', render: (u) => mark(u.face) },
          { key: 'fp', header: 'Finger', render: (u) => mark(u.fingerprint) },
          { key: 'c', header: 'Card', render: (u) => String(u.card ?? '0') === '0' ? '—' : String(u.card) },
          { key: 'v', header: 'Unlock with', render: (u) => verifyLabel(u.verifymode) },
          {
            key: 'x',
            header: 'Actions',
            render: (u) => (
              <RowActions>
                <IconAction label="Edit" icon={Pencil} onClick={() => onAdd(u)} />
                <IconAction label="Delete" icon={Trash2} variant="danger" onClick={() => setRemove(u)} />
              </RowActions>
            ),
          },
        ]}
      />
      <ConfirmDialog
        open={Boolean(remove)}
        title="Delete user on terminal"
        message={remove ? `Remove ${remove.name} (ID ${remove.id}) from the device?` : ''}
        confirmLabel="Delete"
        danger
        onClose={() => setRemove(null)}
        onConfirm={() => {
          if (!remove) return;
          void deleteLiveUser(remove.id)
            .then(() => {
              toast({ kind: 'success', title: 'User deleted on terminal' });
              void load();
            })
            .catch((e: Error) => toast({ kind: 'error', title: e.message }))
            .finally(() => setRemove(null));
        }}
      />
    </div>
  );
}
