import { Link } from 'react-router-dom';
import { cn } from '@/lib/cn';
import { useDeviceLink } from '@/hooks/useDeviceLink';

export function DeviceLinkChip({ compact = false, light = false }: { compact?: boolean; light?: boolean }) {
  const status = useDeviceLink();
  const connected = status === 'connected';
  const label = connected
    ? compact ? 'Connected' : 'Connected with the device'
    : compact ? 'Connecting' : 'Connecting with the device';

  return (
    <Link to="/settings?tab=Terminal" title={label}
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 truncate rounded-full px-2.5 py-1 text-[11px] font-bold',
        connected
          ? light
            ? 'border border-white/15 bg-white/10 text-white'
            : 'border border-ok/25 bg-ok-bg text-ok'
          : light
            ? 'border border-white/15 bg-white/10 text-white/80'
            : 'border border-accent/25 bg-accent-soft text-accent',
      )}
    >
      <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', connected ? 'bg-ok' : 'bg-accent animate-pulse')} />
      <span className="truncate">{label}</span>
    </Link>
  );
}
