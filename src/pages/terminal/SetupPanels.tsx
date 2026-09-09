import { useEffect, useState } from 'react';
import { Button } from '@/components/Button';
import { Field, TextInput } from '@/components/Field';
import { StatusBadge } from '@/components/StatusBadge';
import { useDeviceLink } from '@/hooks/useDeviceLink';
import { saveLiveConfig, discoverLiveDevice, testLiveDevice, liveCommand } from '@/services/liveDevice';
import { useDeviceLinkStore, type DeviceLinkConfig, type DeviceLinkStatus } from '@/store/deviceLinkStore';
import { useUiStore } from '@/store/uiStore';

function statusCopy(status: DeviceLinkStatus, cfg: DeviceLinkConfig | null) {
  if (status === 'reconnecting') {
    return { ok: false, title: 'Reconnecting…', detail: 'Looking for the face machine on this Wi‑Fi.' };
  }
  if (status === 'checking' && !cfg) {
    return { ok: false, title: 'Checking…', detail: 'Looking for the gym laptop and the face machine.' };
  }
  if (status === 'connected') {
    return { ok: true, title: 'Connected', detail: 'The face machine is ready. You can add members and take attendance.' };
  }
  if (status === 'disconnected' || !cfg?.laptopServer) {
    return {
      ok: false,
      title: 'Gym laptop is off',
      detail: 'Open Tekkzy Fit on the gym laptop. Keep that laptop and the face machine on the same Wi‑Fi.',
    };
  }
  if (cfg.host && !cfg.hostOnThisWifi) {
    return {
      ok: false,
      title: 'Different Wi‑Fi',
      detail: 'On the face machine, join the same Wi‑Fi as the gym laptop. Then tap Find the terminal.',
    };
  }
  return {
    ok: false,
    title: 'Face machine is off',
    detail: 'Turn the face machine on and wait for its home screen. Then tap Find the terminal.',
  };
}

export function SetupHub() {
  return <SetupPanel />;
}

export function SetupPanel() {
  const toast = useUiStore((s) => s.pushToast);
  const { status, cfg, reconnect } = useDeviceLink();
  const ingest = useDeviceLinkStore((s) => s.ingest);
  const [host, setHost] = useState('');
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState('');
  const [advanced, setAdvanced] = useState(false);
  const [delay, setDelay] = useState('5');

  useEffect(() => {
    if (!cfg) return;
    setHost((current) => current || cfg.host);
    setUsername(cfg.username || 'admin');
    setReady(cfg.passwordSet);
  }, [cfg]);

  const view = statusCopy(status, cfg);
  const laptopIps = cfg?.laptopIps?.filter(Boolean) ?? [];
  const deviceIp = host || cfg?.host || '—';

  async function findTerminal() {
    setBusy('find');
    try {
      const found = await discoverLiveDevice({ full: true });
      if (found?.applied) setHost(found.applied);
      const next = await reconnect();
      if (next && (next.ok || (next.laptopServer && next.deviceOnline && next.hostOnThisWifi))) {
        toast({ kind: 'success', title: 'Connected' });
        return;
      }
      toast({ kind: 'error', title: found?.applied ? 'Found the machine, but it is not ready yet' : 'No face machine on this Wi‑Fi' });
    } catch (e) {
      toast({ kind: 'error', title: e instanceof Error ? e.message : 'Could not search' });
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_16rem] lg:items-start">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge value={view.ok ? 'ONLINE' : 'OFFLINE'} />
            <div className="font-display text-lg font-bold tracking-tight">{view.title}</div>
          </div>
          <p className="text-[13px] leading-relaxed text-ink-soft">{cfg?.message && !cfg.laptopServer ? cfg.message : view.detail}</p>
          <div className="flex flex-wrap gap-2">
            <Button disabled={Boolean(busy)} onClick={() => void findTerminal()}>
              {busy === 'find' ? 'Searching…' : 'Find the terminal'}
            </Button>
          </div>
        </div>
        <div className="rounded-xl border border-line bg-[var(--input-bg)] px-3 py-3 text-[13px]">
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft">IP details</div>
          <div className="mt-2 space-y-2">
            <div>
              <div className="text-[11px] text-ink-soft">Gym laptop</div>
              <div className="font-medium tabular-nums">{laptopIps.join(', ') || '—'}</div>
            </div>
            <div>
              <div className="text-[11px] text-ink-soft">Face machine</div>
              <div className="font-medium tabular-nums">{deviceIp}</div>
            </div>
            <div>
              <div className="text-[11px] text-ink-soft">Same Wi‑Fi</div>
              <div className="font-medium">{cfg?.hostOnThisWifi ? 'Yes' : 'No'}</div>
            </div>
          </div>
        </div>
      </div>

      <button
        type="button"
        className="text-[12px] font-semibold text-ink-soft hover:text-ink"
        onClick={() => setAdvanced((v) => !v)}
      >
        {advanced ? 'Hide extra settings' : 'Extra settings'}
      </button>

      {advanced ? (
        <div className="space-y-3 rounded-xl border border-line px-3 py-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Device address"><TextInput value={host} onChange={(e) => setHost(e.target.value)} /></Field>
            <Field label="Web account"><TextInput value={username} onChange={(e) => setUsername(e.target.value)} /></Field>
            <Field label="Web password">
              <TextInput type="password" value={password} placeholder={ready ? 'Saved — type to replace' : ''} onChange={(e) => setPassword(e.target.value)} />
            </Field>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() =>
                void saveLiveConfig({ host, username, password: password || undefined })
                  .then((next) => {
                    ingest(next);
                    toast({ kind: 'success', title: 'Saved' });
                  })
                  .catch((e: Error) => toast({ kind: 'error', title: e.message }))
              }
            >
              Save
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                void testLiveDevice()
                  .then((r) => toast({ kind: r.ok ? 'success' : 'error', title: r.ok ? 'Face machine answered' : r.message }))
                  .catch((e: Error) => toast({ kind: 'error', title: e.message }))
              }
            >
              Test
            </Button>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Door open time (seconds)">
              <TextInput value={delay} onChange={(e) => setDelay(e.target.value)} />
            </Field>
            <Button
              variant="secondary"
              onClick={() =>
                void liveCommand({ cmd: 'setlock', delay: Number(delay) || 5 })
                  .then((r) => toast({ kind: r.result === false ? 'error' : 'success', title: String(r.msg ?? 'Saved on the face machine') }))
                  .catch((e: Error) => toast({ kind: 'error', title: e.message }))
              }
            >
              Save door time
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function DataPanel() {
  return null;
}

export function LockPanel() {
  return null;
}
