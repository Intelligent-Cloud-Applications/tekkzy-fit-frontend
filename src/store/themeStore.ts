import { create } from 'zustand';
import { normalizePrimary, primaryPalette, type PrimaryColor } from '@shared/theme/primaryColor';

export type Theme = 'dark' | 'light';

const THEME_KEY = 'tekkzy.theme.v2';
const PRIMARY_KEY = 'tekkzy.primary.v1';

function readStoredTheme(): Theme {
  try {
    const next = localStorage.getItem(THEME_KEY);
    return next === 'dark' || next === 'light' ? next : 'light';
  } catch {
    return 'light';
  }
}

function readStoredPrimary(): PrimaryColor {
  try {
    return normalizePrimary(localStorage.getItem(PRIMARY_KEY));
  } catch {
    return 'red';
  }
}

export function applyPrimary(primary: PrimaryColor, theme: Theme = readStoredTheme()) {
  const palette = primaryPalette(primary);
  const root = document.documentElement;
  root.dataset.accent = palette.id;
  root.style.setProperty('--accent', palette.accent);
  root.style.setProperty('--accent-soft', theme === 'light' ? palette.softLight : palette.softDark);
  root.style.setProperty('--accent-ink', palette.ink);
  root.style.setProperty('--glow', theme === 'light' ? palette.glowLight : palette.glowDark);
  if (theme === 'light') {
    root.style.setProperty('--glow-2', palette.glowLight);
  } else {
    root.style.setProperty('--glow-2', 'rgba(0, 0, 0, 0.2)');
  }
}

export function applyTheme(theme: Theme, primary: PrimaryColor = readStoredPrimary()) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'light' ? '#f7f2f2' : '#050506');
  applyPrimary(primary, theme);
}

export const useThemeStore = create<{
  theme: Theme;
  primary: PrimaryColor;
  setTheme: (theme: Theme) => void;
  setPrimary: (primary: string) => void;
  toggleTheme: () => void;
}>((set, get) => ({
  theme: readStoredTheme(),
  primary: readStoredPrimary(),
  setTheme: (theme) => {
    localStorage.setItem(THEME_KEY, theme);
    applyTheme(theme, get().primary);
    set({ theme });
  },
  setPrimary: (value) => {
    const primary = normalizePrimary(value);
    localStorage.setItem(PRIMARY_KEY, primary);
    applyTheme(get().theme, primary);
    set({ primary });
  },
  toggleTheme: () => {
    get().setTheme(get().theme === 'dark' ? 'light' : 'dark');
  },
}));
