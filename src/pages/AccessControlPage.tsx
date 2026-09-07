import { useEffect, useState } from 'react';
import { AccessDecisionPanel } from '@/components/AccessDecision';
import { Button } from '@/components/Button';
import { ChartCard } from '@/components/ChartCard';
import { StatusBadge } from '@/components/StatusBadge';
import { useAccessEvents, useDevices, useInvalidateGym, useSettings } from '@/hooks/useGymQueries';
import { formatTime } from '@/lib/format';
import { SIMULATION_TARGETS } from '@/data/demo';
import { simulateScan, type AccessOutcome } from '@/services/access';
import { getLiveConfig, ingestRtLogs, liveUnlock } from '@/services/liveDevice';
import { mockDeviceProvider } from '@/providers/device';
import { useUiStore } from '@/store/uiStore';
import { LoadingState } from '@/components/LoadingState';
import { PageHeader } from '@/components/PageHeader';

export function AccessControlPage() {
  const events = useAccessEvents();
  const devices = useDevices();
  const settings = useSettings();
  const invalidate = useInvalidateGym();
  const toast = useUiStore((s) => s.pushToast);
  const [outcome, setOutcome] = useState<AccessOutcome | null>(null);
  const [busy, setBusy] = useState(false);
  const [gate, setGate] = useState<'LOCKED' | 'UNLOCKED'>('LOCKED');
  const [liveHost, setLiveHost] = useState('');
  const [liveReady, setLiveReady] = useState(false);

  const main = devices.data?.find((d) => d.id === 'dev-entry-01');

  useEffect(() => {
    const deviceId = 'dev-entry-01';
    void mockDeviceProvider.listenForEvents(deviceId, (event) => {
      if (event.kind === 'GATE_UNLOCKED') setGate('UNLOCKED');
      if (event.kind === 'GATE_LOCKED') setGate('LOCKED');
    });
    void getLiveConfig()
      .then((cfg) => {
        setLiveHost(cfg.host);
        setLiveReady(cfg.passwordSet);
      })
      .catch(() => setLiveReady(false));
    const timer = window.setInterval(() => {
      void ingestRtLogs()
        .then((n) => {
          if (n > 0) invalidate();
        })
        .catch(() => undefined);
    }, 3000);
    return () => {
      void mockDeviceProvider.stopListening(deviceId);
      window.clearInterval(timer);
    };
  }, [invalidate]);

  async function run(memberId: string | null, label: string) {
    setBusy(true);
    try {
      const next = await simulateScan(memberId);
      setOutcome(next);
      setGate(next.gateState);
      toast({
        kind: next.result.decision === 'GRANTED' ? 'success' : 'error',
        title: `${label}: ${next.result.decision}`,
        message: next.message,
      });
      invalidate();
      if (next.gateState === 'UNLOCKED' && settings.data) {
        window.setTimeout(() => setGate('LOCKED'), settings.data.gateUnlockDurationSeconds * 1000);
      }
    } finally {
      setBusy(false);
    }
  }

  if (!events.data || !devices.data || !settings.data) return <LoadingState />;

  return (
    <div className="flex w-full flex-col gap-3 lg:min-h-full lg:flex-1">
      <PageHeader title="Access" description="Watch the door and test who can come in." />
      <div className="surface flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">Door</div>
          <div className="font-display text-[1.35rem] font-bold tracking-tight sm:text-2xl">{liveReady ? liveHost || 'Connected' : 'Connect the terminal first'}</div>
        </div>
        <div className="sm:text-right">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">Main gate</div>
          <div className="mt-1 flex items-center gap-2 sm:justify-end">
            <StatusBadge value={main?.status ?? 'ONLINE'} />
            <StatusBadge value={gate} />
          </div>
          <div className="mt-1 text-[11px] text-ink-soft">
            Unlock {settings.data.gateUnlockDurationSeconds}s · Cooldown {settings.data.duplicateScanCooldownSeconds}s
          </div>
        </div>
      </div>

      <div className="grid w-full flex-1 grid-cols-1 gap-3 xl:grid-cols-3">
        <div className="space-y-3 xl:col-span-2">
          <AccessDecisionPanel outcome={outcome} />
          <ChartCard title="Open or test">
            <p className="mb-3 text-[12px] text-ink-soft">
              Real faces update this page by themselves. Use the buttons below only to try a case.
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Button
                className="w-full"
                disabled={!liveReady}
                onClick={() =>
                  liveUnlock()
                    .then((r) => {
                      if (r.ok) setGate('UNLOCKED');
                      toast({ kind: r.ok ? 'success' : 'error', title: r.message });
                    })
                    .catch((e: Error) => toast({ kind: 'error', title: e.message }))
                }
              >
                Open door
              </Button>
              <Button className="w-full" disabled={busy} onClick={() => void run(SIMULATION_TARGETS.active, 'Rahul Sharma')}>
                Scan Rahul Sharma
              </Button>
              <Button className="w-full" disabled={busy} variant="secondary" onClick={() => void run(SIMULATION_TARGETS.expired, 'Expired member')}>
                Scan expired member
              </Button>
              <Button className="w-full" disabled={busy} variant="secondary" onClick={() => void run(SIMULATION_TARGETS.suspended, 'Suspended member')}>
                Scan suspended member
              </Button>
              <Button className="w-full sm:col-span-2" disabled={busy} variant="danger" onClick={() => void run(null, 'Unknown face')}>
                Scan unknown face
              </Button>
            </div>
          </ChartCard>
        </div>
        <ChartCard title="Recent scans">
          <ul className="space-y-2 text-[13px] lg:max-h-[520px] lg:overflow-auto">
            {events.data.slice(0, 40).map((ev) => (
              <li key={ev.id} className="border-b border-line pb-2.5 last:border-0">
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate font-medium">{ev.memberName}</span>
                  <StatusBadge value={ev.decision} />
                </div>
                <div className="mt-0.5 text-[11px] text-ink-soft">
                  {formatTime(ev.timestamp)} · {ev.reason.replaceAll('_', ' ').toLowerCase()}
                </div>
              </li>
            ))}
          </ul>
        </ChartCard>
      </div>
    </div>
  );
}
