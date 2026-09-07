import { useEffect, useState } from 'react';
import { Button } from '@/components/Button';
import { ChartCard } from '@/components/ChartCard';
import { StatusBadge } from '@/components/StatusBadge';
import { fetchLiveInfo, liveUnlock, syncLiveTime } from '@/services/liveDevice';
import { useUiStore } from '@/store/uiStore';

export function HomePanel() {
  const toast = useUiStore((s) => s.pushToast);
  const [host, setHost] = useState('');
  const [laptop, setLaptop] = useState<string[]>([]);
  const [onWifi, setOnWifi] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [message, setMessage] = useState('');
  const [info, setInfo] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState('');

  async function load() {
    const row = await fetchLiveInfo();
    setHost(row.host);
    setLaptop(row.laptopIps ?? []);
    setOnWifi(row.hostOnThisWifi);
    setScanning(Boolean(row.scanning));
    setMessage(row.login.message);
    setInfo(row.info ?? {});
  }

  useEffect(() => {
    void load().catch((e: Error) => setMessage(e.message));
    const timer = window.setInterval(() => void load().catch(() => undefined), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(label);
    try {
      await fn();
      toast({ kind: 'success', title: label });
      await load();
    } catch (e) {
      toast({ kind: 'error', title: e instanceof Error ? e.message : label });
    } finally {
      setBusy('');
    }
  }

  const sn = String(info.sn ?? '');
  const ip = String(info.ip ?? info.ipaddress ?? host);
  const firmware = String(info.firmware ?? info.fwversion ?? '');

  return (
    <div className="space-y-3">
      <div className="surface flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="font-display text-xl font-bold tracking-tight">
              {onWifi ? ip || host || 'Terminal' : 'Not on this Wi‑Fi'}
            </div>
            <StatusBadge value={onWifi ? 'ONLINE' : 'OFFLINE'} />
          </div>
          <p className="mt-1 text-[13px] text-ink-soft">
            {onWifi
              ? [sn && `Serial ${sn}`, firmware, message].filter(Boolean).join(' · ')
              : `${scanning ? 'Looking for the device on this Wi‑Fi.' : 'Put the terminal on the same Wi‑Fi as this laptop.'} ${laptop.join(', ')}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button disabled={Boolean(busy)} onClick={() => void run('Door opened', () => liveUnlock())}>
            {busy === 'Door opened' ? 'Opening…' : 'Open door'}
          </Button>
          <Button variant="secondary" disabled={Boolean(busy)} onClick={() => void run('Time synced', () => syncLiveTime())}>
            {busy === 'Time synced' ? 'Syncing…' : 'Sync time'}
          </Button>
          <Button variant="secondary" onClick={() => void load()}>Refresh</Button>
        </div>
      </div>

      <ChartCard title="Stored on the device">
        <div className="grid grid-cols-2 gap-2 text-[13px] sm:grid-cols-3 xl:grid-cols-6">
          {[
            ['People', info.users ?? info.usercount],
            ['Faces', info.face ?? info.facecount],
            ['Fingerprints', info.fp ?? info.fingerprint],
            ['Cards', info.card ?? info.cardcount],
            ['Passwords', info.pwd ?? info.password],
            ['Logs', info.logcount ?? info.alllog],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-xl border border-line px-3 py-2">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">{String(label)}</div>
              <div className="mt-1 font-semibold">{value == null ? '—' : String(value)}</div>
            </div>
          ))}
        </div>
      </ChartCard>
    </div>
  );
}
