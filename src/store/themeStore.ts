import { create } from 'zustand';

export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'tekkzy.theme';

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'light' ? '#f7f2f2' : '#050506');
}

export const useThemeStore = create<{
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}>((set, get) => ({
  theme: (localStorage.getItem(STORAGE_KEY) as Theme | null) ?? 'dark',
  setTheme: (theme) => {
    localStorage.setItem(STORAGE_KEY, theme);
    applyTheme(theme);
    set({ theme });
  },
  toggleTheme: () => {
    get().setTheme(get().theme === 'dark' ? 'light' : 'dark');
  },
}));
