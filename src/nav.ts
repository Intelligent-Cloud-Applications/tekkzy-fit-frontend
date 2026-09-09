import {
  BarChart3,
  CalendarCheck,
  CreditCard,
  Settings,
  Users,
  Wallet,
} from 'lucide-react';
import { canAccessPath } from '@shared/auth/permissions';
import type { Role } from '@shared/types';

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

const managerMobileTabs = [
  { to: '/members', label: 'Members', icon: Users },
  { to: '/attendance', label: 'Attendance', icon: CalendarCheck },
  { to: '/plans', label: 'Plans', icon: CreditCard },
  { to: '/settings', label: 'Settings', icon: Settings },
] as const;

export function visibleNavLinks(role: Role) {
  return navLinks.filter((link) => canAccessPath(role, link.to));
}

export function visibleMobileTabs(role: Role) {
  const tabs = role === 'MANAGER' ? managerMobileTabs : mobileTabs;
  return tabs.filter((tab) => canAccessPath(role, tab.to));
}

export function mobileTabIndex(pathname: string, role?: Role | null) {
  const tabs = role ? visibleMobileTabs(role) : mobileTabs;
  return tabs.findIndex((tab) => pathname === tab.to || pathname.startsWith(`${tab.to}/`));
}
