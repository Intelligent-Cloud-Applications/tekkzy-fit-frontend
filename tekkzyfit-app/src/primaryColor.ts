export const PRIMARY_IDS = ['red', 'yellow', 'lime'] as const;
export type PrimaryColor = (typeof PRIMARY_IDS)[number];

export type PrimaryPalette = {
  id: PrimaryColor;
  label: string;
  hint: string;
  accent: string;
  ink: string;
  softDark: string;
  softLight: string;
  glowDark: string;
  glowLight: string;
  light: {
    bg: string;
    card: string;
    input: string;
    line: string;
    muted: string;
  };
  dark: {
    bg: string;
    card: string;
    input: string;
    line: string;
    muted: string;
  };
};

export const PRIMARY_THEMES: PrimaryPalette[] = [
  {
    id: 'red',
    label: 'Red',
    hint: 'The current gym red.',
    accent: '#e10600',
    ink: '#ffffff',
    softDark: '#2a1516',
    softLight: '#ffe8e8',
    glowDark: 'rgba(225, 6, 0, 0.28)',
    glowLight: 'rgba(225, 6, 0, 0.12)',
    light: {
      bg: '#f7f2f2',
      card: '#ffffff',
      input: '#ffffff',
      line: '#eedada',
      muted: '#6f5c5e',
    },
    dark: {
      bg: '#0b0b0c',
      card: '#171314',
      input: '#20181a',
      line: '#3a2729',
      muted: '#a39496',
    },
  },
  {
    id: 'yellow',
    label: 'Yellow',
    hint: 'Bright floor yellow.',
    accent: '#f5c400',
    ink: '#111111',
    softDark: '#2a2410',
    softLight: '#fff6d4',
    glowDark: 'rgba(245, 196, 0, 0.28)',
    glowLight: 'rgba(245, 196, 0, 0.16)',
    light: {
      bg: '#f7f5ea',
      card: '#fffdf6',
      input: '#fffdf6',
      line: '#eee4c0',
      muted: '#6f6648',
    },
    dark: {
      bg: '#0c0b09',
      card: '#17150f',
      input: '#211c12',
      line: '#3a3420',
      muted: '#a39a7a',
    },
  },
  {
    id: 'lime',
    label: 'Lime',
    hint: 'Lime green energy.',
    accent: '#7cde2a',
    ink: '#111111',
    softDark: '#17240f',
    softLight: '#eefbd6',
    glowDark: 'rgba(124, 222, 42, 0.28)',
    glowLight: 'rgba(124, 222, 42, 0.16)',
    light: {
      bg: '#f2f7ee',
      card: '#fbfef8',
      input: '#fbfef8',
      line: '#d5e6c8',
      muted: '#5a6b4c',
    },
    dark: {
      bg: '#0a0c09',
      card: '#131714',
      input: '#182018',
      line: '#273a29',
      muted: '#8fa394',
    },
  },
];

const BY_ID = Object.fromEntries(PRIMARY_THEMES.map((row) => [row.id, row])) as Record<PrimaryColor, PrimaryPalette>;

export function isPrimaryColor(value: unknown): value is PrimaryColor {
  return PRIMARY_IDS.includes(String(value || '') as PrimaryColor);
}

export function normalizePrimary(value?: string | null): PrimaryColor {
  const raw = String(value || '').trim().toLowerCase();
  if (isPrimaryColor(raw)) return raw;
  const compact = raw.replace(/[^a-z0-9#]/g, '');
  if (compact.includes('yellow') || compact.includes('gold') || compact === '#f5c400' || compact === '#e6b800' || compact === '#ffcc00') {
    return 'yellow';
  }
  if (compact.includes('lime') || compact.includes('green') || compact === '#7cde2a' || compact === '#84cc16' || compact === '#32cd32') {
    return 'lime';
  }
  return 'red';
}

export function primaryPalette(value?: string | null): PrimaryPalette {
  return BY_ID[normalizePrimary(value)];
}

type Listener = (id: PrimaryColor) => void;
let current: PrimaryColor = 'red';
const listeners = new Set<Listener>();

export function getAppPrimary() {
  return current;
}

export function setAppPrimary(value?: string | null) {
  const next = normalizePrimary(value);
  if (next === current) return next;
  current = next;
  listeners.forEach((fn) => fn(next));
  return next;
}

export function subscribeAppPrimary(fn: Listener) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
