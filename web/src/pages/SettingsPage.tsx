import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, LogOut } from 'lucide-react';
import { Button } from '@/components/Button';
import { ChartCard } from '@/components/ChartCard';
import { Field, TextInput } from '@/components/Field';
import { LoadingState } from '@/components/LoadingState';
import { StatusBadge } from '@/components/StatusBadge';
import { useGymMutation, useInvalidateGym, useSettings } from '@/hooks/useGymQueries';
import { saveGymSettings } from '@/services/settings';
import { processSyncQueue } from '@/services/sync';
import { activateLiveGym } from '@/services/liveDevice';
import { SetupHub } from '@/pages/terminal/SetupPanels';
import { useAuthStore } from '@/store/authStore';
import { useUiStore } from '@/store/uiStore';
import { useConnectionStore } from '@/store/connectionStore';
import { useThemeStore } from '@/store/themeStore';
import type { GymSettings } from '@shared/types';

const sections = [
  'Appearance',
  'Gym profile',
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
  const [params, setParams] = useSearchParams();
  const requested = sections.find((s) => s.toLowerCase() === String(params.get('tab') || '').toLowerCase());
  const [tab, setTab] = useState<(typeof sections)[number]>(requested || 'Appearance');
  const [mobileMenu, setMobileMenu] = useState(true);
  const [draft, setDraft] = useState<GymSettings | null>(null);
  const save = useGymMutation(async (row: GymSettings) => saveGymSettings(row));

  useEffect(() => {
    if (settings.data && !draft) setDraft(settings.data);
  }, [settings.data, draft]);

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
              className={`tap flex w-full items-center justify-between border-b border-line/70 px-4 py-3.5 text-left text-[14px] last:border-0 lg:mb-0.5 lg:rounded-xl lg:border-0 lg:px-3 lg:py-2.5 lg:text-[13px] ${tab === s ? 'bg-accent font-semibold text-white' : 'text-ink hover:bg-[var(--hover-fill)] lg:text-ink-soft'}`}
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
                <div className="mt-2 text-[13px] text-ink-soft">Red and black for the night desk.</div>
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
              save.mutate(draft, {
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

function LiveDeviceSettings() {
  const toast = useUiStore((s) => s.pushToast);
  const invalidate = useInvalidateGym();
  const [busy, setBusy] = useState(false);

  return (
    <div className="space-y-3">
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
