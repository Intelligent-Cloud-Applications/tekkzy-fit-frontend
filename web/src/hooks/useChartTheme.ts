import { useThemeStore } from '@/store/themeStore';

export function useChartTheme() {
  const theme = useThemeStore((s) => s.theme);
  const light = theme === 'light';
  return {
    grid: light ? '#eedada' : '#2a1c1e',
    tick: light ? '#6f5c5e' : '#8b93a7',
    tooltipBg: light ? '#ffffff' : '#110d0e',
    tooltipBorder: light ? '#eedada' : '#2a1c1e',
    accent: '#e10600',
    fill: light ? '#ffe8e8' : '#2a0b0b',
    secondary: light ? '#b42318' : '#8a1a1a',
    tooltip: {
      background: light ? '#ffffff' : '#110d0e',
      border: `1px solid ${light ? '#eedada' : '#2a1c1e'}`,
      borderRadius: 12,
      color: light ? '#1a1213' : '#f4f6fb',
    },
  };
}
