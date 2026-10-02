import { Link, useParams } from 'react-router-dom';
import { Button } from '@/components/Button';
import { ChartCard } from '@/components/ChartCard';
import { ErrorState } from '@/components/ErrorState';
import { LoadingState } from '@/components/LoadingState';
import { StatusBadge } from '@/components/StatusBadge';
import { useAccessEvents, useDevice, useGymMutation, useMembers, useSettings } from '@/hooks/useGymQueries';
import { formatDateTime, formatRelative } from '@/lib/format';
import { lockDeviceGate, pullDeviceAttendance, syncDeviceMembers, testConnection, unlockDeviceGate } from '@/services/devices';
import { useUiStore } from '@/store/uiStore';

export function DeviceDetailPage() {
  const { id = '' } = useParams();
  const device = useDevice(id);
  const members = useMembers();
  const events = useAccessEvents();
  const settings = useSettings();
  const toast = useUiStore((s) => s.pushToast);
  const ping = useGymMutation(testConnection);
  const sync = useGymMutation(syncDeviceMembers);
  const pull = useGymMutation(pullDeviceAttendance);
  const unlock = useGymMutation(({ deviceId, seconds }: { deviceId: string; seconds: number }) =>
    unlockDeviceGate(deviceId, seconds),
  );
  const lock = useGymMutation(lockDeviceGate);

  if (device.isLoading) return <LoadingState />;
  if (!device.data) return <ErrorState message="Device not found." />;
  const d = device.data;

  function run(label: string, fn: () => void) {
    try {
      fn();
    } catch (e) {
      toast({ kind: 'error', title: label, message: e instanceof Error ? e.message : 'Failed' });
    }
  }

  return (
    <div className="flex w-full flex-col gap-3 lg:min-h-full lg:flex-1">
      <div className="surface flex flex-col gap-3 px-4 py-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:px-5">
        <div className="min-w-0">
          <div className="font-display text-xl font-bold tracking-tight sm:text-2xl">{d.name}</div>
          <div className="text-[12px] text-ink-soft">
            {d.deviceCode} · {d.model} · {d.ipAddress}
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 sm:justify-end">
          <StatusBadge value={d.status} />
          <Link to="/devices"><Button variant="secondary">Open terminal</Button></Link>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 lg:flex lg:flex-wrap">
        <Button className="w-full lg:w-auto" onClick={() => ping.mutate(d.id, { onSuccess: () => toast({ kind: 'success', title: 'Test connection: mock OK' }) })}>
          Test connection
        </Button>
        <Button className="w-full lg:w-auto" variant="secondary" onClick={() => sync.mutate(d.id, { onSuccess: (n) => toast({ kind: 'success', title: `Synced ${n} members to mock device` }) })}>
          Sync members
        </Button>
        <Button
          className="w-full lg:w-auto"
          variant="secondary"
          onClick={() =>
            pull.mutate(d.id, {
              onSuccess: (logs) => toast({ kind: 'info', title: `Pulled ${logs.length} attendance logs` }),
            })
          }
        >
          Pull attendance
        </Button>
        <Button className="w-full lg:w-auto" variant="secondary" onClick={() => toast({ kind: 'info', title: 'Push users', message: 'Use Sync members to import from the live terminal, or Register face on a member profile.' })}>
          Push users
        </Button>
        <Button className="w-full lg:w-auto" variant="secondary" onClick={() => toast({ kind: 'warning', title: 'Restart unavailable', message: 'Requires the SmartAccess SDK.' })}>
          Restart device
        </Button>
        <Button
          className="w-full lg:w-auto"
          onClick={() =>
            run('Unlock', () =>
              unlock.mutate({ deviceId: d.id, seconds: settings.data?.gateUnlockDurationSeconds ?? 5 }, {
                onSuccess: () => toast({ kind: 'success', title: 'Gate unlocked (mock)' }),
              }),
            )
          }
        >
          Unlock gate
        </Button>
        <Button className="col-span-2 w-full lg:col-auto lg:w-auto" variant="secondary" onClick={() => lock.mutate(d.id, { onSuccess: () => toast({ kind: 'info', title: 'Gate locked' }) })}>
          Lock gate
        </Button>
      </div>
      <div className="grid w-full flex-1 grid-cols-1 gap-3 lg:grid-cols-2">
        <ChartCard title="Connection">
          <Row label="Location" value={d.location} />
          <Row label="Last heartbeat" value={formatRelative(d.lastHeartbeat)} />
          <Row label="Firmware" value={d.firmware} />
          <Row label="Gate" value={d.gateState} />
        </ChartCard>
        <ChartCard title="Face database">
          <Row label="Users on device" value={String(d.userCount)} />
          <Row label="Registered members" value={String(members.data?.filter((m) => m.faceRegistered).length ?? 0)} />
          <p className="mt-2 text-[12px] text-ink-soft">
            SA-AI21 capacity is 5,000 faces / 500,000 logs. This screen reads local records until the official protocol is wired.
          </p>
        </ChartCard>
      </div>
      <ChartCard title="Access events on this device">
        <ul className="divide-y divide-line text-[13px]">
          {(events.data ?? [])
            .filter((e) => e.deviceId === d.id)
            .slice(0, 12)
            .map((e) => (
              <li key={e.id} className="flex justify-between py-1.5">
                <span>{e.memberName}</span>
                <span className="text-ink-soft">{formatDateTime(e.timestamp)} · {e.decision}</span>
              </li>
            ))}
        </ul>
      </ChartCard>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-line py-1.5 text-[13px]">
      <span className="text-ink-soft">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
