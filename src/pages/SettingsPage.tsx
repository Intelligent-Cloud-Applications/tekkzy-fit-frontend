import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Download, LogOut, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/Button';
import { ChartCard } from '@/components/ChartCard';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Field, TextInput } from '@/components/Field';
import { LoadingState } from '@/components/LoadingState';
import { IconAction, RowActions } from '@/components/RowActions';
import { StatusBadge } from '@/components/StatusBadge';
import { useGymMutation, useInvalidateGym, useSettings } from '@/hooks/useGymQueries';
import { saveGymSettings } from '@/services/settings';
import { listStaff, removeMember, saveStaff, type MemberRow } from '@/services/members';
import { processSyncQueue } from '@/services/sync';
import { activateLiveGym } from '@/services/liveDevice';
import { SetupHub } from '@/pages/terminal/SetupPanels';
import { useAuthStore } from '@/store/authStore';
import { useUiStore } from '@/store/uiStore';
import { useConnectionStore } from '@/store/connectionStore';
import { useThemeStore } from '@/store/themeStore';
import { PRIMARY_THEMES, type PrimaryColor } from '@shared/theme/primaryColor';
import type { GymSettings } from '@shared/types';

const sections = [
  'Appearance',
  'Gym profile',
  'Staff',
  'Terminal',
  'Backup & sync',
] as const;

export function SettingsPage() {
  const settings = useSettings();
  const logout = useAuthStore((s) => s.logout);
  const user = useAuthStore((s) => s.user);
  const toast = useUiStore((s) => s.pushToast);
  const { online, pendingCount, lastSync } = useConnectionStore();
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const primary = useThemeStore((s) => s.primary);
  const setPrimary = useThemeStore((s) => s.setPrimary);
  const [params, setParams] = useSearchParams();
  const requested = sections.find((s) => s.toLowerCase() === String(params.get('tab') || '').toLowerCase());
  const [tab, setTab] = useState<(typeof sections)[number]>(requested || 'Appearance');
  const [mobileMenu, setMobileMenu] = useState(true);
  const [draft, setDraft] = useState<GymSettings | null>(null);
  const save = useGymMutation(async (row: GymSettings) => saveGymSettings(row));

  async function pickColor(id: PrimaryColor) {
    if (!draft) return;
    const previous = primary;
    setPrimary(id);
    try {
      const saved = await saveGymSettings({ ...draft, primaryColor: id });
      setDraft(saved);
      toast({ kind: 'success', title: `${PRIMARY_THEMES.find((row) => row.id === id)?.label} theme saved` });
    } catch (err) {
      setPrimary(previous);
      toast({ kind: 'error', title: err instanceof Error ? err.message : 'Could not save gym color' });
    }
  }

  useEffect(() => {
    if (settings.data && !draft) setDraft(settings.data);
    if (settings.data?.primaryColor) setPrimary(settings.data.primaryColor);
  }, [settings.data, draft, setPrimary]);

  if (!settings.data || !draft) return <LoadingState />;

  return (
    <div className="grid w-full grid-cols-1 items-start gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
      <aside className={`${mobileMenu ? 'block' : 'hidden'} lg:block`}>
        <h1 className="mb-3 font-display text-[1.45rem] font-bold tracking-tight lg:hidden">Settings</h1>
        <div className="surface overflow-hidden lg:sticky lg:top-0 lg:p-2">
          {sections.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setTab(s);
                setParams(s === 'Appearance' ? {} : { tab: s }, { replace: true });
                setMobileMenu(false);
              }}
              className={`tap flex w-full items-center justify-between border-b border-line/70 px-4 py-3.5 text-left text-[14px] last:border-0 lg:mb-0.5 lg:rounded-xl lg:border-0 lg:px-3 lg:py-2.5 lg:text-[13px] ${tab === s ? 'bg-accent font-semibold text-[color:var(--accent-ink,#fff)]' : 'text-ink hover:bg-[var(--hover-fill)] lg:text-ink-soft'}`}
            >
              {s}
              <ChevronRight className="h-4 w-4 shrink-0 opacity-50 lg:hidden" />
            </button>
          ))}
          <div className="border-t border-line px-4 py-3 lg:hidden">
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft">Signed in</div>
            <div className="mt-0.5 truncate text-[14px] font-semibold">{user?.name}</div>
            <div className="text-[12px] capitalize text-ink-soft">{user?.role.replaceAll('_', ' ').toLowerCase()}</div>
            <button
              type="button"
              onClick={logout}
              className="tap mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-line text-[14px] font-semibold text-ink hover:bg-[var(--hover-fill)]"
            >
              <LogOut className="h-4 w-4" />
              Logout
            </button>
          </div>
        </div>
      </aside>
      <div className={`${mobileMenu ? 'hidden' : 'block'} min-w-0 space-y-3 lg:block`}>
        <button
          type="button"
          className="tap mb-1 flex items-center gap-1 text-[13px] font-semibold text-ink-soft lg:hidden"
          onClick={() => setMobileMenu(true)}
        >
          <ChevronLeft className="h-4 w-4" />
          Settings
        </button>
        {tab === 'Appearance' && (
          <ChartCard fit title="Theme">
            <p className="mb-3 text-[13px] text-ink-soft">
              Light is the default for daytime reception. Switch to dark for the night desk.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setTheme('dark')}
                className={`tap rounded-2xl border px-5 py-5 text-left ${theme === 'dark' ? 'border-accent bg-accent-soft' : 'border-line'}`}
              >
                <div className="font-display text-2xl font-bold">Dark</div>
                <div className="mt-2 text-[13px] text-ink-soft">Black desk with your gym color.</div>
              </button>
              <button
                type="button"
                onClick={() => setTheme('light')}
                className={`tap rounded-2xl border px-5 py-5 text-left ${theme === 'light' ? 'border-accent bg-accent-soft' : 'border-line'}`}
              >
                <div className="font-display text-2xl font-bold">Light</div>
                <div className="mt-2 text-[13px] text-ink-soft">Clean reception for daytime.</div>
              </button>
            </div>
            <p className="mb-3 mt-6 text-[13px] text-ink-soft">
              Gym color. Most gyms use red, yellow, or lime green. This is saved for the whole gym.
            </p>
            <div className="grid grid-cols-3 gap-3">
              {PRIMARY_THEMES.map((item) => {
                const selected = primary === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => void pickColor(item.id)}
                    className={`tap rounded-2xl border px-3 py-4 text-left sm:px-4 ${selected ? 'border-accent bg-accent-soft' : 'border-line'}`}
                  >
                    <span
                      className="mb-3 block h-9 w-9 rounded-full border border-black/10 shadow-sm"
                      style={{ background: item.accent }}
                    />
                    <div className="font-display text-lg font-bold sm:text-xl">{item.label}</div>
                    <div className="mt-1 text-[12px] text-ink-soft">{item.hint}</div>
                  </button>
                );
              })}
            </div>
          </ChartCard>
        )}
        {tab === 'Gym profile' && (
          <ChartCard fit title="Gym profile">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <Field label="Gym name"><TextInput value={draft.gymName} onChange={(e) => setDraft({ ...draft, gymName: e.target.value })} /></Field>
              <Field label="Legal name"><TextInput value={draft.legalName} onChange={(e) => setDraft({ ...draft, legalName: e.target.value })} /></Field>
              <Field label="Phone"><TextInput value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} /></Field>
              <Field label="Email"><TextInput value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} /></Field>
              <Field label="Address"><TextInput value={draft.address} onChange={(e) => setDraft({ ...draft, address: e.target.value })} /></Field>
              <Field label="City"><TextInput value={draft.city} onChange={(e) => setDraft({ ...draft, city: e.target.value })} /></Field>
              <Field label="State"><TextInput value={draft.state} onChange={(e) => setDraft({ ...draft, state: e.target.value })} /></Field>
              <Field label="PIN"><TextInput value={draft.pincode} onChange={(e) => setDraft({ ...draft, pincode: e.target.value })} /></Field>
              <Field label="GSTIN"><TextInput value={draft.gstin ?? ''} onChange={(e) => setDraft({ ...draft, gstin: e.target.value })} /></Field>
            </div>
          </ChartCard>
        )}
        {tab === 'Terminal' && <LiveDeviceSettings />}
        {tab === 'Staff' && <StaffSettings />}
        {tab === 'Backup & sync' && (
          <ChartCard fit title="Backup & sync">
            <div className="mb-2 flex items-center gap-2 text-[13px]">
              <StatusBadge value={online ? 'ONLINE' : 'OFFLINE'} />
              <span>Waiting: {pendingCount}</span>
              <span>Last sync: {lastSync ?? '—'}</span>
            </div>
            <Button
              onClick={() =>
                processSyncQueue().then(() => toast({ kind: 'info', title: 'Sync attempted' }))
              }
            >
              Sync now
            </Button>
          </ChartCard>
        )}
        {tab === 'Gym profile' ? (
          <Button
            className="w-full lg:w-auto"
            disabled={save.isPending}
            onClick={() =>
              save.mutate({ ...draft, primaryColor: primary }, {
                onSuccess: (row) => {
                  setDraft(row);
                  toast({ kind: 'success', title: 'Settings saved' });
                },
                onError: (err) => toast({
                  kind: 'error',
                  title: err instanceof Error ? err.message : 'Could not save gym profile',
                }),
              })
            }
          >
            Save settings
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function StaffSettings() {
  const toast = useUiStore((s) => s.pushToast);
  const [rows, setRows] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [editingId, setEditingId] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<MemberRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function reload() {
    setLoading(true);
    try {
      setRows(await listStaff());
    } catch (err) {
      toast({ kind: 'error', title: err instanceof Error ? err.message : 'Could not load staff' });
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  function resetForm() {
    setEditingId(undefined);
    setFirstName('');
    setLastName('');
    setPhone('');
    setEmail('');
  }

  async function onSave() {
    if (!firstName.trim()) {
      toast({ kind: 'error', title: 'First name is required' });
      return;
    }
    setBusy(true);
    try {
      await saveStaff({
        id: editingId,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim(),
        email: email.trim(),
      });
      toast({ kind: 'success', title: editingId ? 'Staff updated' : 'Staff added' });
      resetForm();
      await reload();
    } catch (err) {
      toast({ kind: 'error', title: err instanceof Error ? err.message : 'Could not save staff' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <ChartCard fit title={editingId ? 'Edit staff' : 'Add staff'}>
        <p className="mb-3 text-[13px] text-ink-soft">
          Saved with user type Staff. Staff stay out of the Members list.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="First name"><TextInput value={firstName} onChange={(e) => setFirstName(e.target.value)} /></Field>
          <Field label="Last name"><TextInput value={lastName} onChange={(e) => setLastName(e.target.value)} /></Field>
          <Field label="Phone"><TextInput value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
          <Field label="Email"><TextInput value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button disabled={busy} onClick={() => void onSave()}>
            {busy ? 'Saving…' : editingId ? 'Save staff' : 'Add staff'}
          </Button>
          {editingId ? (
            <Button variant="secondary" disabled={busy} onClick={resetForm}>Cancel</Button>
          ) : null}
        </div>
      </ChartCard>
      <ChartCard fit title="Staff list">
        {loading ? <LoadingState /> : rows.length === 0 ? (
          <p className="text-[13px] text-ink-soft">No staff yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((row) => (
              <li key={row.id} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[14px] font-semibold text-ink">{row.name}</span>
                    <StatusBadge compact value="STAFF" />
                  </div>
                  <p className="truncate text-[12px] text-ink-soft">{row.phone || row.email || 'No contact'}</p>
                </div>
                <RowActions>
                  <IconAction
                    label="Edit"
                    icon={Pencil}
                    onClick={() => {
                      setEditingId(row.cognitoId || row.id);
                      setFirstName(row.firstName || row.name.split(' ')[0] || '');
                      setLastName(row.lastName || row.name.split(' ').slice(1).join(' ') || '');
                      setPhone(row.phone || '');
                      setEmail(row.email || '');
                    }}
                  />
                  <IconAction label="Delete" icon={Trash2} variant="danger" onClick={() => setPendingDelete(row)} />
                </RowActions>
              </li>
            ))}
          </ul>
        )}
      </ChartCard>
      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Remove staff"
        message={`Remove ${pendingDelete?.name} from staff?`}
        confirmLabel="Remove"
        danger
        onClose={() => { if (!deleting) setPendingDelete(null); }}
        onConfirm={() => {
          if (!pendingDelete || deleting) return;
          setDeleting(true);
          void removeMember(pendingDelete.id)
            .then(async () => {
              toast({ kind: 'success', title: 'Staff removed' });
              setPendingDelete(null);
              await reload();
            })
            .catch((err: Error) => toast({ kind: 'error', title: err.message || 'Could not delete staff' }))
            .finally(() => setDeleting(false));
        }}
      />
    </div>
  );
}

function LiveDeviceSettings() {
  const toast = useUiStore((s) => s.pushToast);
  const invalidate = useInvalidateGym();
  const [busy, setBusy] = useState(false);

  return (
    <div className="space-y-3">
      <ChartCard fit title="Tekkzy Fit mobile app">
        <p className="mb-3 text-[13px] text-ink-soft">
          Download the Android app. Connect the phone to the same Wi‑Fi as the face machine.
        </p>
        <a
          href="/downloads/TekkzyFit.apk"
          download="TekkzyFit.apk"
          className="tap inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-full bg-accent px-3.5 text-[13px] font-semibold text-[color:var(--accent-ink,#fff)] hover:brightness-110 sm:w-auto"
        >
          <Download className="h-4 w-4" />
          Download mobile app
        </a>
        <p className="mt-2 text-[11px] text-ink-soft">
          On the phone, tap the downloaded TekkzyFit.apk. If Android asks, allow install from this browser, then Open.
        </p>
      </ChartCard>
      <ChartCard fit title="Face machine">
        <SetupHub />
        <div className="mt-4 border-t border-line pt-4">
          <p className="mb-3 text-[13px] text-ink-soft">
            Copy people who are already on the face machine into Members.
          </p>
          <Button
            variant="secondary"
            className="w-full sm:w-auto"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void activateLiveGym()
                .then((r) => {
                  invalidate();
                  toast({
                    kind: r.users ? 'success' : 'error',
                    title: r.users ? 'People copied' : 'No people on the face machine',
                    message: r.users
                      ? `${r.users} people from the face machine.`
                      : 'Turn the face machine on, wait for the home screen, then try again.',
                  });
                })
                .catch((e: Error) => toast({ kind: 'error', title: e.message }))
                .finally(() => setBusy(false));
            }}
          >
            {busy ? 'Copying…' : 'Copy people from the face machine'}
          </Button>
        </div>
      </ChartCard>
    </div>
  );
}
