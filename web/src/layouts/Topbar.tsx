import { useEffect, useState } from 'react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useUiStore } from '@/store/uiStore';
import { format } from 'date-fns';
import { DeviceLinkChip } from '@/components/DeviceLinkChip';
import { ThemeToggle } from '@/components/ThemeToggle';
import { formatRelative } from '@/lib/format';
import { useAuthStore } from '@/store/authStore';
import { useConnectionStore } from '@/store/connectionStore';

export function Topbar() {
  const user = useAuthStore((s) => s.user);
  const { online, lastSync, pendingCount, phase } = useConnectionStore();
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggleCollapsed = useUiStore((s) => s.toggleSidebarCollapsed);
  const setOpen = useUiStore((s) => s.setSidebarOpen);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);

  return (
    <header className="no-print relative z-20 flex h-14 shrink-0 items-center gap-3 border-b border-line/80 bg-[var(--chrome)] px-4 backdrop-blur-xl md:h-[60px] md:px-6">
      <div className="flex min-w-0 flex-1 items-center gap-2 md:gap-3">
        <button
          type="button"
          className="tap grid h-10 w-10 shrink-0 place-items-center rounded-full hover:bg-[var(--hover-fill)] lg:hidden"
          aria-label="Open menu"
          onClick={() => setOpen(true)}
        >
          <PanelLeftOpen className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="tap hidden h-10 shrink-0 items-center gap-2 rounded-full px-3 text-[12px] font-semibold text-ink hover:bg-[var(--hover-fill)] lg:flex"
          title={collapsed ? 'Maximize sidebar' : 'Minimize sidebar'}
          aria-label={collapsed ? 'Maximize sidebar' : 'Minimize sidebar'}
          onClick={toggleCollapsed}
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          <span>{collapsed ? 'Maximize' : 'Minimize'}</span>
        </button>
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-2 md:gap-3">
        <div className="hidden text-[12px] text-ink-soft tabular-nums xl:block">{format(now, 'dd/MM/yyyy, hh:mm a')}</div>
        <DeviceLinkChip />
        <ConnectionChip online={online} pendingCount={pendingCount} phase={phase} lastSync={lastSync} />
        <ThemeToggle />
        <div className="hidden items-center gap-2 sm:flex">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-accent text-[11px] font-extrabold text-white">
            {user?.avatarInitials}
          </span>
          <div className="leading-tight">
            <div className="text-[13px] font-semibold text-ink">{user?.name}</div>
            <div className="text-[11px] capitalize text-ink-soft">{user?.role.replaceAll('_', ' ').toLowerCase()}</div>
          </div>
        </div>
      </div>
    </header>
  );
}

function ConnectionChip({
  online,
  pendingCount,
  phase,
  lastSync,
}: {
  online: boolean;
  pendingCount: number;
  phase: string;
  lastSync: string | null;
}) {
  if (!online) {
    return (
      <div className="rounded-full border border-warn/30 bg-warn-bg px-2.5 py-1 text-[11px] font-bold text-warn">
        OFFLINE
      </div>
    );
  }
  if (phase === 'syncing') {
    return (
      <div className="rounded-full border border-accent/25 bg-accent-soft px-2.5 py-1 text-[11px] font-bold text-accent">
        SYNC · {pendingCount}
      </div>
    );
  }
  if (phase === 'complete') {
    return (
      <div className="rounded-full border border-ok/25 bg-ok-bg px-2.5 py-1 text-[11px] font-bold text-ok">
        SYNCED
      </div>
    );
  }
  return (
    <div className="hidden items-center gap-2 md:flex">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-ok-bg px-2.5 py-1 text-[11px] font-bold text-ok">
        <span className="h-1.5 w-1.5 rounded-full bg-ok" />
        LIVE
      </span>
      <span className="hidden text-ink-soft xl:inline">{lastSync ? formatRelative(lastSync) : 'now'}</span>
    </div>
  );
}
