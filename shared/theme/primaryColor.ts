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
  },
  {
    id: 'yellow',
    label: 'Yellow',
    hint: 'Bright floor yellow.',
    accent: '#f5c400',
    ink: '#1a1400',
    softDark: '#2a2410',
    softLight: '#fff6d4',
    glowDark: 'rgba(245, 196, 0, 0.28)',
    glowLight: 'rgba(245, 196, 0, 0.16)',
  },
  {
    id: 'lime',
    label: 'Lime',
    hint: 'Lime green energy.',
    accent: '#7cde2a',
    ink: '#102000',
    softDark: '#17240f',
    softLight: '#eefbd6',
    glowDark: 'rgba(124, 222, 42, 0.28)',
    glowLight: 'rgba(124, 222, 42, 0.16)',
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
