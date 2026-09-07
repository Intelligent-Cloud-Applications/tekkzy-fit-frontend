import { Settings } from 'lucide-react';
import { Link } from 'react-router-dom';
import { DeviceLinkChip } from '@/components/DeviceLinkChip';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useAuthStore } from '@/store/authStore';

export function MobileHeader() {
  const user = useAuthStore((s) => s.user);

  return (
    <header className="mobile-chrome no-print sticky top-0 z-20 flex items-center gap-3 px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))] lg:hidden">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent text-[13px] font-extrabold text-white">
        {user?.avatarInitials || 'TF'}
      </span>
      <div className="min-w-0 flex-1 leading-tight">
        <div className="truncate text-[16px] font-bold tracking-tight text-white">{user?.name || 'Tekkzy Fit'}</div>
        <div className="mt-1">
          <DeviceLinkChip compact light />
        </div>
      </div>
      <ThemeToggle iconOnly className="border-white/10 bg-white/8 text-white" />
      <Link
        to="/settings"
        aria-label="Settings"
        className="tap grid h-11 w-11 place-items-center rounded-full border border-white/10 bg-white/8 text-white"
      >
        <Settings className="h-4 w-4" />
      </Link>
    </header>
  );
}
