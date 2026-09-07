import {
  BarChart3,
  CalendarCheck,
  CreditCard,
  Settings,
  Users,
  Wallet,
} from 'lucide-react';

export const navLinks = [
  { to: '/members', label: 'Members', icon: Users },
  { to: '/attendance', label: 'Attendance', icon: CalendarCheck },
  { to: '/payments', label: 'Payment History', icon: Wallet },
  { to: '/plans', label: 'Plans', icon: CreditCard },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
  { to: '/settings', label: 'Settings', icon: Settings },
] as const;

export const mobileTabs = [
  { to: '/members', label: 'Members', icon: Users },
  { to: '/payments', label: 'Payments', icon: Wallet },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
  { to: '/settings', label: 'Settings', icon: Settings },
] as const;

export function mobileTabIndex(pathname: string) {
  return mobileTabs.findIndex((tab) => pathname === tab.to || pathname.startsWith(`${tab.to}/`));
}
