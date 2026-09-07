import type { Permission, Role } from '../types';

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  SUPER_ADMIN: [
    'members.read',
    'members.write',
    'memberships.write',
    'payments.read',
    'payments.write',
    'attendance.read',
    'attendance.write',
    'devices.read',
    'devices.control',
    'reports.read',
    'settings.write',
    'users.write',
  ],
  GYM_ADMIN: [
    'members.read',
    'members.write',
    'memberships.write',
    'payments.read',
    'payments.write',
    'attendance.read',
    'attendance.write',
    'devices.read',
    'devices.control',
    'reports.read',
    'settings.write',
  ],
  RECEPTIONIST: [
    'members.read',
    'members.write',
    'payments.read',
    'payments.write',
    'attendance.read',
    'attendance.write',
  ],
  MANAGER: [
    'members.read',
    'attendance.read',
    'reports.read',
  ],
};

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function canAccessPath(role: Role, path: string): boolean {
  if (path.startsWith('/settings')) {
    return hasPermission(role, 'devices.read') || hasPermission(role, 'settings.write') || hasPermission(role, 'members.read');
  }
  if (path.startsWith('/reports')) return hasPermission(role, 'reports.read');
  if (path.startsWith('/payments')) return hasPermission(role, 'payments.read');
  if (path.startsWith('/memberships') || path.startsWith('/plans')) {
    return hasPermission(role, 'memberships.write') || hasPermission(role, 'members.read');
  }
  if (path.startsWith('/members')) return hasPermission(role, 'members.read');
  if (path.startsWith('/attendance') || path.startsWith('/access')) {
    return hasPermission(role, 'attendance.read');
  }
  return true;
}
