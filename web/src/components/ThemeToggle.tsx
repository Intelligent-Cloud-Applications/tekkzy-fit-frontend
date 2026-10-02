import { Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useThemeStore } from '@/store/themeStore';

export function ThemeToggle({ className, iconOnly = false }: { className?: string; iconOnly?: boolean }) {
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);
  const light = theme === 'light';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={cn(
        'tap text-ink',
        iconOnly
          ? 'grid h-11 w-11 place-items-center rounded-full border border-line bg-panel'
          : 'inline-flex h-10 items-center gap-2 rounded-full border border-line px-2 text-[12px] font-semibold',
        className,
      )}
      aria-label={light ? 'Switch to dark theme' : 'Switch to light theme'}
    >
      {iconOnly ? (
        light ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />
      ) : (
        <>
          <span className="grid h-6 w-6 place-items-center rounded-full bg-accent text-white">
            {light ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
          </span>
          <span className="hidden pr-1.5 sm:inline">{light ? 'Light' : 'Dark'}</span>
        </>
      )}
    </button>
  );
}
