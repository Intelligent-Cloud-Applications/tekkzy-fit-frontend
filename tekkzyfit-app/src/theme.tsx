import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  getAppPrimary,
  primaryPalette,
  subscribeAppPrimary,
  type PrimaryColor,
} from './primaryColor';

export type ThemeName = 'dark' | 'light';

export type Theme = {
  name: ThemeName;
  bg: string;
  card: string;
  input: string;
  text: string;
  muted: string;
  line: string;
  accent: string;
  accentSoft: string;
  accentInk: string;
  glow: string;
  ok: string;
  bad: string;
  warn: string;
  tab: string;
  header: string;
};

const darkBase = {
  name: 'dark' as const,
  text: '#f6f1f1',
  ok: '#163024',
  bad: '#2f1719',
  warn: '#3a2a12',
  tab: '#0a0a0a',
  header: '#080808',
};

const lightBase = {
  name: 'light' as const,
  text: '#1a1213',
  ok: '#e8f7ef',
  bad: '#ffe8e8',
  warn: '#fff4e0',
  tab: '#111111',
  header: '#000000',
};

export function makeTheme(name: ThemeName, primary: PrimaryColor = 'red'): Theme {
  const palette = primaryPalette(primary);
  const surfaces = name === 'light' ? palette.light : palette.dark;
  const base = name === 'light' ? lightBase : darkBase;
  return {
    ...base,
    bg: surfaces.bg,
    card: surfaces.card,
    input: surfaces.input,
    muted: surfaces.muted,
    line: surfaces.line,
    accent: palette.accent,
    accentSoft: name === 'light' ? palette.softLight : palette.softDark,
    accentInk: palette.ink,
    glow: name === 'light' ? palette.glowLight : palette.glowDark,
  };
}

const ThemeContext = createContext<Theme>(makeTheme('light'));

export function ThemeProvider({ name, children }: { name: ThemeName; children: ReactNode }) {
  const [primary, setPrimary] = useState<PrimaryColor>(() => getAppPrimary());
  useEffect(() => subscribeAppPrimary(setPrimary), []);
  const value = useMemo(() => makeTheme(name, primary), [name, primary]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
