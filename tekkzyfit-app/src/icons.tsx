import Svg, { Circle, Path, Polyline, Rect } from 'react-native-svg';

export function Icon({
  name,
  color = '#9a9a9a',
  size = 20,
}: {
  name: string;
  color?: string;
  size?: number;
}) {
  const s = { width: size, height: size };
  switch (name) {
    case 'dashboard':
      return (
        <Svg {...s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <Rect x="3" y="3" width="7" height="9" rx="1.5" />
          <Rect x="14" y="3" width="7" height="5" rx="1.5" />
          <Rect x="14" y="12" width="7" height="9" rx="1.5" />
          <Rect x="3" y="16" width="7" height="5" rx="1.5" />
        </Svg>
      );
    case 'users':
      return (
        <Svg {...s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <Circle cx="9" cy="7" r="4" />
          <Path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <Path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </Svg>
      );
    case 'calendar':
      return (
        <Svg {...s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <Rect x="3" y="4" width="18" height="18" rx="2" />
          <Path d="M16 2v4M8 2v4M3 10h18" />
          <Path d="m9 16 2 2 4-4" />
        </Svg>
      );
    case 'card':
      return (
        <Svg {...s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <Rect x="2" y="5" width="20" height="14" rx="2" />
          <Path d="M2 10h20" />
        </Svg>
      );
    case 'receipt':
      return (
        <Svg {...s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M6 3h12v18l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4-2 1.4V3z" />
          <Path d="M9 8h6M9 12h6M9 16h3" />
        </Svg>
      );
    case 'wallet':
      return (
        <Svg {...s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" />
          <Path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />
        </Svg>
      );
    case 'chart':
      return (
        <Svg {...s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M3 3v18h18" />
          <Path d="M18 17V9" />
          <Path d="M13 17V5" />
          <Path d="M8 17v-3" />
        </Svg>
      );
    case 'settings':
      return (
        <Svg {...s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <Circle cx="12" cy="12" r="3" />
          <Path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </Svg>
      );
    case 'more':
      return (
        <Svg {...s} viewBox="0 0 24 24" fill={color} stroke="none">
          <Circle cx="5" cy="12" r="2.2" />
          <Circle cx="12" cy="12" r="2.2" />
          <Circle cx="19" cy="12" r="2.2" />
        </Svg>
      );
    case 'building':
      return (
        <Svg {...s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <Rect x="4" y="3" width="16" height="18" rx="2" />
          <Path d="M9 21v-4h6v4M8 7h2M14 7h2M8 11h2M14 11h2" />
        </Svg>
      );
    case 'list':
      return (
        <Svg {...s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M9 6h11M9 12h11M9 18h11" />
          <Path d="M4 6h.01M4 12h.01M4 18h.01" />
        </Svg>
      );
    case 'device':
      return (
        <Svg {...s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <Rect x="5" y="2" width="14" height="20" rx="2" />
          <Circle cx="12" cy="10" r="3" />
          <Path d="M9 17h6" />
        </Svg>
      );
    case 'logout':
      return (
        <Svg {...s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <Polyline points="16 17 21 12 16 7" />
          <Path d="M21 12H9" />
        </Svg>
      );
    case 'download':
      return (
        <Svg {...s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <Polyline points="7 10 12 15 17 10" />
          <Path d="M12 15V3" />
        </Svg>
      );
    case 'pencil':
      return (
        <Svg {...s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M21.174 6.812a2.12 2.12 0 0 0-3-3L6 16l-2 5 5-2z" />
          <Path d="m15 6 3 3" />
        </Svg>
      );
    case 'pause':
      return (
        <Svg {...s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <Rect x="6" y="4" width="4" height="16" rx="1" />
          <Rect x="14" y="4" width="4" height="16" rx="1" />
        </Svg>
      );
    case 'play':
      return (
        <Svg {...s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <Path d="m7 4 13 8-13 8z" />
        </Svg>
      );
    case 'trash':
      return (
        <Svg {...s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M3 6h18" />
          <Path d="M8 6V4h8v2" />
          <Path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
        </Svg>
      );
    case 'face':
      return (
        <Svg {...s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M3 7V5a2 2 0 0 1 2-2h2" />
          <Path d="M17 3h2a2 2 0 0 1 2 2v2" />
          <Path d="M21 17v2a2 2 0 0 1-2 2h-2" />
          <Path d="M7 21H5a2 2 0 0 1-2-2v-2" />
          <Circle cx="9" cy="10" r="1" />
          <Circle cx="15" cy="10" r="1" />
          <Path d="M9 15s1.2 1.5 3 1.5 3-1.5 3-1.5" />
        </Svg>
      );
    case 'finger':
      return (
        <Svg {...s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M12 10a4 4 0 0 0-4 4c0 2 1 3 2 4.5" />
          <Path d="M12 10V4a2 2 0 1 1 4 0v8" />
          <Path d="M8 10.5V8a2 2 0 1 0-4 0v7a8 8 0 0 0 16 0v-2a2 2 0 0 0-4 0" />
        </Svg>
      );
    case 'search':
      return (
        <Svg {...s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <Circle cx="11" cy="11" r="7" />
          <Path d="m20 20-3-3" />
        </Svg>
      );
    case 'refresh':
      return (
        <Svg {...s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M21 12a9 9 0 1 1-3-6.7" />
          <Path d="M21 3v6h-6" />
        </Svg>
      );
    case 'sun':
      return (
        <Svg {...s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <Circle cx="12" cy="12" r="4" />
          <Path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </Svg>
      );
    case 'moon':
      return (
        <Svg {...s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M21 14.5A8.5 8.5 0 1 1 9.5 3 7 7 0 0 0 21 14.5z" />
        </Svg>
      );
    case 'link':
      return (
        <Svg {...s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M15 3h6v6" />
          <Path d="M10 14 21 3" />
          <Path d="M18 13v7a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h7" />
        </Svg>
      );
    case 'chevron':
      return (
        <Svg {...s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <Polyline points="6 9 12 15 18 9" />
        </Svg>
      );
    case 'chevronLeft':
      return (
        <Svg {...s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <Polyline points="15 6 9 12 15 18" />
        </Svg>
      );
    case 'chevronRight':
      return (
        <Svg {...s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <Polyline points="9 6 15 12 9 18" />
        </Svg>
      );
    case 'whatsapp':
      return (
        <Svg {...s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M3 21l1.65-3.8A9 9 0 1 1 8.4 20.3L3 21z" />
          <Path d="M9 10a.5.5 0 0 0 1 0V9a.5.5 0 0 0-1 0v1a5 5 0 0 0 5 5h1a.5.5 0 0 0 0-1h-1a.5.5 0 0 0 0 1" />
        </Svg>
      );
    case 'share':
      return (
        <Svg {...s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <Circle cx="18" cy="5" r="3" />
          <Circle cx="6" cy="12" r="3" />
          <Circle cx="18" cy="19" r="3" />
          <Path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" />
        </Svg>
      );
    case 'image':
      return (
        <Svg {...s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <Rect x="3" y="3" width="18" height="18" rx="2" />
          <Circle cx="9" cy="9" r="2" />
          <Path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" />
        </Svg>
      );
    case 'mail':
      return (
        <Svg {...s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <Rect x="3" y="5" width="18" height="14" rx="2" />
          <Path d="m3 7 9 6 9-6" />
        </Svg>
      );
    case 'eye':
      return (
        <Svg {...s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" />
          <Circle cx="12" cy="12" r="3" />
        </Svg>
      );
    case 'bell':
      return (
        <Svg {...s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M6 8a6 6 0 1 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9" />
          <Path d="M10 21a2 2 0 0 0 4 0" />
        </Svg>
      );
    case 'plus':
      return (
        <Svg {...s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M12 5v14M5 12h14" />
        </Svg>
      );
    case 'check':
      return (
        <Svg {...s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
          <Path d="m5 12 5 5 9-10" />
        </Svg>
      );
    case 'alert':
      return (
        <Svg {...s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M12 9v5" />
          <Path d="M12 17h.01" />
          <Path d="M10.3 4.3 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0z" />
        </Svg>
      );
    case 'x':
      return (
        <Svg {...s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M18 6 6 18M6 6l12 12" />
        </Svg>
      );
    case 'eyeOff':
      return (
        <Svg {...s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M3 3l18 18" />
          <Path d="M10.6 10.6A3 3 0 0 0 12 15a3 3 0 0 0 2.4-4.4" />
          <Path d="M9.9 5.1A11 11 0 0 1 12 5c6 0 10 7 10 7a18 18 0 0 1-4.2 4.8" />
          <Path d="M6.1 6.1C3.8 7.8 2 12 2 12s4 7 10 7a10 10 0 0 0 4.2-.9" />
        </Svg>
      );
    default:
      return (
        <Svg {...s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2}>
          <Circle cx="12" cy="12" r="9" />
        </Svg>
      );
  }
}

export const TAB_ICONS: Record<string, string> = {
  Dashboard: 'dashboard',
  Members: 'users',
  Expenses: 'receipt',
  Logs: 'calendar',
  Attendance: 'calendar',
  Plans: 'card',
  Payments: 'wallet',
  Reports: 'chart',
  Settings: 'more',
};
