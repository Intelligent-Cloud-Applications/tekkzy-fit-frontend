import { useEffect, useState } from 'react';
import { Button } from '@/components/Button';
import { ChartCard } from '@/components/ChartCard';
import { Field, TextInput } from '@/components/Field';
import { ensureAutoDeviceLink, getLiveConfig, saveLiveConfig, discoverLiveDevice, testLiveDevice, liveCommand } from '@/services/liveDevice';
import { useUiStore } from '@/store/uiStore';

export function SetupHub() {
  return (
    <div className="space-y-6">
      <SetupPanel />
      <LockPanel />
    </div>
  );
}

export function SetupPanel() {
  const toast = useUiStore((s) => s.pushToast);
  const [host, setHost] = useState('');
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [laptop, setLaptop] = useState<string[]>([]);
  const [onWifi, setOnWifi] = useState(true);
  const [ready, setReady] = useState(false);
  const [bridgeHint, setBridgeHint] = useState('Connecting…');
  const [linkOk, setLinkOk] = useState(false);

  function applyConfig(cfg: Awaited<ReturnType<typeof getLiveConfig>> & { ok?: boolean; message?: string }) {
    setHost(cfg.host);
    setUsername(cfg.username || 'admin');
    setReady(cfg.passwordSet);
    setLaptop(cfg.laptopIps ?? []);
    setOnWifi(cfg.hostOnThisWifi);
    setLinkOk(Boolean(cfg.ok));
    if (cfg.ok) {
      setBridgeHint(cfg.message || `Connected to ${cfg.host}`);
      return;
    }
    setBridgeHint(cfg.laptopServer === false ? (cfg.laptopServerMessage || cfg.message || '') : (cfg.message || ''));
  }

  useEffect(() => {
    void ensureAutoDeviceLink().then(applyConfig).catch((e: Error) => setBridgeHint(e.message));
  }, []);

  return (
    <div className="space-y-3">
      <p className="text-[13px] text-ink-soft">
        Keep the gym laptop and the face terminal on the same Wi‑Fi — not a guest network. After you change Wi‑Fi, wait until the terminal screen shows a new IP, then tap Find on this Wi‑Fi.
      </p>
      <div className="rounded-xl border border-line px-3 py-2 text-[13px]">
        Laptop: <strong>{laptop.join(', ') || '—'}</strong>
        {bridgeHint ? <span className={`mt-1 block ${linkOk ? '' : 'text-warn'}`}>{bridgeHint}</span> : null}
        {!bridgeHint && !onWifi ? <span className="mt-1 block text-warn">Saved IP {host} is from another Wi‑Fi. Join the terminal to this network, then tap Find on this Wi‑Fi.</span> : null}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Device IP"><TextInput value={host} onChange={(e) => setHost(e.target.value)} /></Field>
        <Field label="Web account"><TextInput value={username} onChange={(e) => setUsername(e.target.value)} /></Field>
        <Field label="Web password">
          <TextInput type="password" value={password} placeholder={ready ? 'Saved — type to replace' : ''} onChange={(e) => setPassword(e.target.value)} />
        </Field>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => {
            setBridgeHint('Connecting…');
            void ensureAutoDeviceLink()
              .then((cfg) => {
                applyConfig(cfg);
                toast({ kind: cfg.ok ? 'success' : 'error', title: cfg.message || (cfg.ok ? 'Connected' : 'Not connected') });
              })
              .catch((e: Error) => toast({ kind: 'error', title: e.message }));
          }}
        >
          Connect
        </Button>
        <Button
          variant="secondary"
          onClick={() =>
            void discoverLiveDevice({ full: true })
              .then((r) => {
                if (r.applied) {
                  setHost(r.applied);
                  setOnWifi(true);
                  toast({ kind: 'success', title: `Found ${r.applied}` });
                } else {
                  toast({ kind: 'error', title: 'No terminal on this Wi‑Fi', message: r.lan?.[0] || 'No device answered on this network.' });
                }
              })
              .catch((e: Error) => toast({ kind: 'error', title: e.message }))
          }
        >
          Find on this Wi‑Fi
        </Button>
        <Button
          onClick={() =>
            void saveLiveConfig({ host, username, password: password || undefined })
              .then((cfg) => {
                setReady(cfg.passwordSet);
                setOnWifi(cfg.hostOnThisWifi);
                setBridgeHint('');
                toast({ kind: 'success', title: 'Connection saved' });
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
              .then((r) => toast({ kind: r.ok ? 'success' : 'error', title: r.message }))
              .catch((e: Error) => toast({ kind: 'error', title: e.message }))
          }
        >
          Test
        </Button>
        {host ? (
          <>
            <a className="tap inline-flex min-h-10 items-center rounded-full border border-line px-3.5 text-[13px] font-semibold" href={`http://${host}/home.html`} target="_blank" rel="noreferrer">
              Device website
            </a>
            <a className="tap inline-flex min-h-10 items-center rounded-full border border-line px-3.5 text-[13px] font-semibold" href={`http://${host}/`} target="_blank" rel="noreferrer">
              Firmware
            </a>
          </>
        ) : null}
      </div>
    </div>
  );
}

export function DataPanel() {
  const toast = useUiStore((s) => s.pushToast);
  const [host, setHost] = useState('');
  useEffect(() => {
    void getLiveConfig().then((cfg) => setHost(cfg.host)).catch(() => undefined);
  }, []);
  return (
    <ChartCard title="Data management">
      <p className="mb-3 text-[13px] text-ink-soft">
        Export users and logs from User view and Log info. Firmware upgrades stay on the terminal website.
      </p>
      <div className="flex flex-wrap gap-2">
        {host ? (
          <a className="tap inline-flex min-h-10 items-center rounded-full border border-line px-3.5 text-[13px] font-semibold" href={`http://${host}/`} target="_blank" rel="noreferrer">
            Open firmware / data pages
          </a>
        ) : null}
        <Button
          variant="secondary"
          onClick={() =>
            void liveCommand({ cmd: 'getdevinfo' })
              .then(() => toast({ kind: 'success', title: 'Device answered' }))
              .catch((e: Error) => toast({ kind: 'error', title: e.message }))
          }
        >
          Ping device
        </Button>
      </div>
    </ChartCard>
  );
}

export function LockPanel() {
  const toast = useUiStore((s) => s.pushToast);
  const [delay, setDelay] = useState('5');
  return (
    <ChartCard title="How long the door stays open">
      <p className="mb-3 text-[13px] text-ink-soft">Open the door from Status or Access. This only changes the pulse time on the device.</p>
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Seconds"><TextInput value={delay} onChange={(e) => setDelay(e.target.value)} /></Field>
        <Button
          onClick={() =>
            void liveCommand({ cmd: 'setlock', delay: Number(delay) || 5 })
              .then((r) => toast({ kind: r.result === false ? 'error' : 'success', title: String(r.msg ?? 'Lock setting sent') }))
              .catch((e: Error) => toast({ kind: 'error', title: e.message }))
          }
        >
          Save on device
        </Button>
      </div>
    </ChartCard>
  );
}
