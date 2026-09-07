import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/Button';
import { ChartCard } from '@/components/ChartCard';
import { Field, TextInput } from '@/components/Field';
import { LoadingState } from '@/components/LoadingState';
import { StatusBadge } from '@/components/StatusBadge';
import { useGymMutation, useInvalidateGym, useSettings } from '@/hooks/useGymQueries';
import { localStore } from '@/providers/database/LocalDatabase';
import { processSyncQueue } from '@/services/sync';
import { activateLiveGym } from '@/services/liveDevice';
import { SetupHub } from '@/pages/terminal/SetupPanels';
import { useUiStore } from '@/store/uiStore';
import { useConnectionStore } from '@/store/connectionStore';
import { useThemeStore } from '@/store/themeStore';
import type { GymSettings } from '@shared/types';

const sections = [
  'Appearance',
  'Gym profile',
  'Terminal',
  'Payments',
  'Backup & sync',
] as const;

export function SettingsPage() {
  const settings = useSettings();
  const toast = useUiStore((s) => s.pushToast);
  const { online, pendingCount, lastSync } = useConnectionStore();
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const [params, setParams] = useSearchParams();
  const requested = sections.find((s) => s.toLowerCase() === String(params.get('tab') || '').toLowerCase());
  const [tab, setTab] = useState<(typeof sections)[number]>(requested || 'Appearance');
  const [mobileMenu, setMobileMenu] = useState(true);
  const [draft, setDraft] = useState<GymSettings | null>(null);
  const save = useGymMutation(async (row: GymSettings) => {
    await localStore.putSettings(row);
    return row;
  });

  useEffect(() => {
    if (settings.data && !draft) setDraft(settings.data);
  }, [settings.data, draft]);

  if (!settings.data || !draft) return <LoadingState />;

  return (
    <div className="grid w-full grid-cols-1 gap-4 lg:min-h-full lg:flex-1 lg:grid-cols-[240px_minmax(0,1fr)]">
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
          <ChartCard title="Theme">
            <p className="mb-3 text-[13px] text-ink-soft">
              Dark for the night desk. Light for daytime reception.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setTheme('dark')}
                className={`tap min-h-32 rounded-2xl border px-5 py-6 text-left sm:min-h-48 sm:py-8 ${theme === 'dark' ? 'border-accent bg-accent-soft' : 'border-line'}`}
              >
                <div className="font-display text-2xl font-bold">Dark</div>
                <div className="mt-2 text-[13px] text-ink-soft">Red and black for the night desk.</div>
              </button>
              <button
                type="button"
                onClick={() => setTheme('light')}
                className={`tap min-h-32 rounded-2xl border px-5 py-6 text-left sm:min-h-48 sm:py-8 ${theme === 'light' ? 'border-accent bg-accent-soft' : 'border-line'}`}
              >
                <div className="font-display text-2xl font-bold">Light</div>
                <div className="mt-2 text-[13px] text-ink-soft">Clean reception for daytime.</div>
              </button>
            </div>
          </ChartCard>
        )}
        {tab === 'Gym profile' && (
          <ChartCard title="Gym profile">
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
        {tab === 'Payments' && (
          <ChartCard title="Payments">
            <p className="text-[13px] text-ink-soft">
              Card and UPI secrets stay on the server. Current mode: {import.meta.env.VITE_PAYMENT_PROVIDER || 'counter only'}.
            </p>
          </ChartCard>
        )}
        {tab === 'Terminal' && <LiveDeviceSettings />}
        {tab === 'Backup & sync' && (
          <ChartCard title="Backup & sync">
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
        {tab !== 'Terminal' ? (
          <Button
            className="w-full lg:w-auto"
            onClick={() =>
              save.mutate(draft, { onSuccess: () => toast({ kind: 'success', title: 'Settings saved' }) })
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
      <ChartCard title="Face terminal">
        <SetupHub />
      </ChartCard>
      <ChartCard title="Load into Members">
        <p className="mb-3 text-[13px] text-ink-soft">
          Pull enrolled people from the terminal into Members, Attendance, and Payment History.
        </p>
        <Button
          className="w-full sm:w-auto"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void activateLiveGym()
              .then((r) => {
                invalidate();
                toast({
                  kind: r.users ? 'success' : 'error',
                  title: r.users ? 'Members loaded' : 'No people on the terminal',
                  message: r.users
                    ? (r.pulled + r.pushed
                      ? `${r.users} people from the terminal.`
                      : `${r.users} already in Members.`)
                    : 'The terminal answered, but it sent no enrolled people. Wait a few seconds and try again. Restart Tekkzy Fit if the chip still says Connecting.',
                });
              })
              .catch((e: Error) => toast({ kind: 'error', title: e.message }))
              .finally(() => setBusy(false));
          }}
        >
          {busy ? 'Loading…' : 'Load members from terminal'}
        </Button>
      </ChartCard>
    </div>
  );
}
