import { NavLink } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { cn } from '@/lib/cn';
import { BRAND } from '@/brand';
import { BrandWordmark } from '@/components/BrandMark';
import { navLinks } from '@/nav';
import { useAuthStore } from '@/store/authStore';
import { useUiStore } from '@/store/uiStore';
import { demoSettings } from '@/data/demo';

export function Sidebar({ collapsed = false }: { collapsed?: boolean }) {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const setOpen = useUiStore((s) => s.setSidebarOpen);

  return (
    <aside
      className={cn(
        'sidebar-rail flex h-full shrink-0 flex-col border-r text-ink transition-[width] duration-200 ease-out',
        collapsed ? 'w-[76px]' : 'w-[248px]',
      )}
    >
      <div className={cn('border-b border-line/80', collapsed ? 'px-2 py-4' : 'px-5 py-5')}>
        {collapsed ? (
          <div className="text-center font-brand text-[15px] font-semibold uppercase tracking-[0.12em]">
            T<span className="text-accent">F</span>
          </div>
        ) : (
          <>
            <BrandWordmark />
            <div className="mt-1.5 text-[11px] text-ink-soft">{BRAND.tagline}</div>
          </>
        )}
      </div>
      <nav className={cn('flex-1 space-y-0.5 overflow-y-auto py-3', collapsed ? 'px-2' : 'px-3')}>
        {navLinks.map((link) => {
          const Icon = link.icon;
          return (
            <NavLink
              key={link.to}
              to={link.to}
              end={false}
              title={link.label}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                cn(
                  'tap flex items-center rounded-xl text-[13px] font-medium',
                  collapsed ? 'justify-center px-0 py-2.5' : 'gap-2.5 px-3 py-2.5',
                  link.to === '/attendance' && 'hidden lg:flex',
                  isActive
                    ? 'bg-accent text-white shadow-[0_10px_24px_-12px_rgba(225,6,0,0.9)]'
                    : 'text-ink-soft hover:bg-[var(--hover-fill)] hover:text-ink',
                )
              }
            >
              <Icon className="h-4 w-4 shrink-0" />
              {collapsed ? <span className="sr-only">{link.label}</span> : link.label}
            </NavLink>
          );
        })}
      </nav>
      {collapsed ? (
        <div className="m-2 space-y-2">
          <div
            title={`${demoSettings.gymName} · ${user?.name ?? ''}`}
            className="grid h-10 place-items-center rounded-xl border border-line text-[11px] font-extrabold text-white"
          >
            <span className="grid h-8 w-8 place-items-center rounded-full bg-accent">{user?.avatarInitials}</span>
          </div>
          <button
            type="button"
            title="Logout"
            aria-label="Logout"
            onClick={logout}
            className="tap grid h-10 w-full place-items-center rounded-xl border border-line text-ink-soft hover:bg-[var(--hover-fill)] hover:text-ink"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <div className="m-3 rounded-2xl border border-line bg-black/25 p-3.5">
          <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-ink-soft">Gym</div>
          <div className="mt-0.5 truncate text-[13px] font-semibold">{demoSettings.gymName}</div>
          <div className="mt-3 text-[10px] font-bold uppercase tracking-[0.16em] text-ink-soft">Signed in</div>
          <div className="mt-0.5 truncate text-[13px] font-semibold">{user?.name}</div>
          <div className="text-[11px] capitalize text-ink-soft">{user?.role.replaceAll('_', ' ').toLowerCase()}</div>
          <button
            type="button"
            onClick={logout}
            className="tap mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-line text-[13px] font-semibold text-ink-soft hover:bg-[var(--hover-fill)] hover:text-ink"
          >
            <LogOut className="h-3.5 w-3.5" />
            Logout
          </button>
        </div>
      )}
    </aside>
  );
}
