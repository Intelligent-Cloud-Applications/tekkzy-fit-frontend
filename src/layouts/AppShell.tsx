import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { MobileHeader } from './MobileHeader';
import { BottomNav } from './BottomNav';
import { ToastViewport } from '@/components/Toast';
import { useUiStore } from '@/store/uiStore';
import { useLiveTerminalSync } from '@/hooks/useLiveTerminalSync';

export function AppShell() {
  const open = useUiStore((s) => s.sidebarOpen);
  const setOpen = useUiStore((s) => s.setSidebarOpen);
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const location = useLocation();
  useLiveTerminalSync();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setOpen]);

  return (
    <div className="ambient flex h-full">
      <div className="hidden h-full lg:block">
        <Sidebar collapsed={collapsed} />
      </div>
      {open ? (
        <div className="fixed inset-0 z-40 fade-in lg:hidden">
          <button type="button" className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="sheet-in relative h-full w-[min(88vw,260px)]">
            <Sidebar />
          </div>
        </div>
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="hidden lg:block">
          <Topbar />
        </div>
        <MobileHeader />
        <main className="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto overscroll-y-contain">
          <div key={location.pathname} className="page-enter page px-4 py-3 pb-32 sm:px-5 lg:px-6 lg:py-5 xl:px-8 lg:pb-6">
            <Outlet />
          </div>
        </main>
      </div>
      <BottomNav />
      <ToastViewport />
    </div>
  );
}
