import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/cn';
import { useDeviceLink } from '@/hooks/useDeviceLink';
import { isFaceMachineLinked } from '@/services/liveDevice';
import { useUiStore } from '@/store/uiStore';

export function DeviceLinkChip({ compact = false, light = false }: { compact?: boolean; light?: boolean }) {
  const { status, reconnect } = useDeviceLink();
  const navigate = useNavigate();
  const toast = useUiStore((s) => s.pushToast);
  const connected = status === 'connected';
  const machineOff = status === 'machine-off';
  const busy = status === 'checking' || status === 'reconnecting';
  const label = connected
    ? compact ? 'Connected' : 'Connected with the device'
    : machineOff
      ? compact ? 'Machine off' : 'Face machine is off'
      : status === 'reconnecting'
        ? compact ? 'Reconnecting' : 'Reconnecting…'
        : status === 'checking'
          ? compact ? 'Checking' : 'Checking the device'
          : compact ? 'Reconnect' : 'Reconnect';

  async function onClick() {
    if (connected) {
      navigate('/settings?tab=Terminal');
      return;
    }
    if (busy) return;
    const next = await reconnect();
    if (next && isFaceMachineLinked(next)) {
      toast({ kind: 'success', title: 'Connected' });
      return;
    }
    toast({
      kind: 'error',
      title: 'Still not connected',
      message: next?.message || 'Turn the face machine on, use the same Wi‑Fi as the gym laptop, then tap Reconnect.',
    });
  }

  return (
    <button
      type="button"
      title={connected ? 'Open terminal settings' : 'Try to connect the face machine'}
      onClick={() => void onClick()}
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 truncate rounded-full px-2.5 py-1 text-[11px] font-bold',
        connected
          ? light
            ? 'border border-white/15 bg-white/10 text-white'
            : 'border border-ok/25 bg-ok-bg text-ok'
          : machineOff
            ? light
              ? 'border border-white/15 bg-white/10 text-white/80'
              : 'border border-warn/30 bg-warn-bg text-warn'
          : light
            ? 'border border-white/15 bg-white/10 text-white/80'
            : 'border border-accent/25 bg-accent-soft text-accent',
      )}
    >
      <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', connected ? 'bg-ok' : machineOff ? 'bg-warn' : 'bg-accent', busy && 'animate-pulse')} />
      <span className="truncate">{label}</span>
    </button>
  );
}
