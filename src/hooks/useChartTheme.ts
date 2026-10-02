import { useThemeStore } from '@/store/themeStore';
import { primaryPalette } from '@shared/theme/primaryColor';

export function useChartTheme() {
  const theme = useThemeStore((s) => s.theme);
  const primary = useThemeStore((s) => s.primary);
  const light = theme === 'light';
  const palette = primaryPalette(primary);
  return {
    grid: light ? '#eedada' : '#2a1c1e',
    tick: light ? '#6f5c5e' : '#8b93a7',
    tooltipBg: light ? '#ffffff' : '#110d0e',
    tooltipBorder: light ? '#eedada' : '#2a1c1e',
    accent: palette.accent,
    fill: light ? palette.softLight : palette.softDark,
    secondary: palette.accent,
    tooltip: {
      background: light ? '#ffffff' : '#110d0e',
      border: `1px solid ${light ? '#eedada' : '#2a1c1e'}`,
      borderRadius: 12,
      color: light ? '#1a1213' : '#f4f6fb',
    },
  };
}
