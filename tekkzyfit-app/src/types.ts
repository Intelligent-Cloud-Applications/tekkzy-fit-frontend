export type Role = 'SUPER_ADMIN' | 'GYM_ADMIN' | 'RECEPTIONIST' | 'MANAGER';

export type Permission =
  | 'members.read'
  | 'members.write'
  | 'memberships.write'
  | 'payments.read'
  | 'payments.write'
  | 'expenses.read'
  | 'expenses.write'
  | 'attendance.read'
  | 'attendance.write'
  | 'devices.read'
  | 'devices.control'
  | 'reports.read'
  | 'settings.write';

export type User = {
  id: string;
  name: string;
  email: string;
  role: Role;
  gymId?: string;
  phone?: string;
  avatarInitials?: string;
};

export type AuthSession = {
  token: string;
  user: User;
};

export type Membership = {
  id?: string;
  memberId?: string;
  planId?: string;
  startDate?: string;
  expiryDate?: string;
  price?: number;
  paymentStatus?: string;
  status?: string;
  accessStatus?: string;
};

export type Member = {
  id: string;
  cognitoId?: string;
  memberCode?: string;
  firstName?: string;
  lastName?: string;
  name: string;
  phone?: string;
  email?: string;
  gender?: string;
  dateOfBirth?: string;
  notes?: string;
  joinDate?: string;
  createdAt?: string;
  startDate?: string;
  status?: string;
  userType?: string;
  cognitoRole?: string;
  staffRole?: string;
  planId?: string;
  planName?: string;
  amount?: number;
  durationDays?: number | null;
  paymentStatus?: string;
  paymentMethod?: string;
  paymentLinkUrl?: string;
  renewDate?: string | null;
  renewDateSource?: string | null;
  subscriptionId?: string;
  subscriptionStatus?: string;
  deviceEnrollId?: string;
  deviceEnd?: string;
  devicePhotoUrl?: string;
  deviceCard?: string;
  deviceFingerprint?: string;
  deviceVerifyMode?: string;
  deviceShift?: string;
  faceRegistered?: boolean;
  addedById?: string;
  addedByName?: string;
  loginEmail?: string;
  loginSub?: string;
  lastLoginAt?: string;
  lastVisit?: string;
  attendanceCount?: number;
  attendanceDays?: Record<string, boolean>;
  attendance?: Record<string, number>;
  deviceQueued?: boolean;
  deviceError?: string;
  membership?: Membership;
  todayPresence?: 'PRESENT' | 'ABSENT';
};

export type Plan = {
  id: string;
  name: string;
  durationDays: number;
  durationLabel?: string;
  price: number;
  addonAmount?: number;
  description?: string;
  accessType?: string;
  status?: string;
  billingPeriod?: 'daily' | 'weekly' | 'monthly' | 'yearly';
  billingInterval?: number;
  createdAt?: string;
};

export type ExpenseCategory =
  | 'Rent'
  | 'Salary'
  | 'Electricity'
  | 'Water'
  | 'Maintenance'
  | 'Equipment'
  | 'Supplies'
  | 'Marketing'
  | 'Cleaning'
  | 'Other';

export type ExpenseMethod = 'CASH' | 'UPI' | 'CARD' | 'BANK';

export type Expense = {
  id: string;
  title: string;
  category: ExpenseCategory;
  amount: number;
  date: string;
  method: ExpenseMethod;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type Payment = {
  id: string;
  paymentCode?: string;
  memberId: string;
  memberName?: string;
  planId?: string;
  amount: number;
  netAmount?: number;
  grossAmount?: number;
  date: string;
  method: string;
  status: string;
  invoiceNumber?: string;
  notes?: string;
  paymentLinkUrl?: string;
  subscriptionId?: string;
  razorpayPaymentId?: string;
  renewDate?: string | null;
  createdAt?: string;
};

export type GymSettings = {
  id?: string;
  gymName?: string;
  legalName?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  gstin?: string;
  currency?: string;
  timezone?: string;
  primaryColor?: string;
  invoice?: InvoiceSettings;
};

export type InvoiceSettings = {
  logo?: string;
  prefix?: string;
  title?: string;
  terms?: string;
  note?: string;
  upiId?: string;
  bankDetails?: string;
  signatory?: string;
  website?: string;
  taxPercent?: number;
  showGst?: boolean;
};

export type MonthlyReport = {
  month: string;
  totalAttendance: number;
  totalMembers: number;
  cashPayment: number;
  upiPayment?: number;
  razorpayPayment: number;
  totalExpense?: number;
  totalDiscontinued: number;
  reimbursements?: Reimbursement[];
  updatedAt?: string;
};

export type Reimbursement = {
  id: string;
  date: string;
  amount: number;
  paidTo: string;
  reason: string;
  method: 'CASH' | 'ONLINE';
  createdAt: string;
  month?: string;
};

export type AttendanceRow = {
  id: string;
  memberId?: string;
  memberName: string;
  memberCode?: string;
  timestamp: string;
  type: string;
  status: string;
};

export type SaveMemberInput = {
  id?: string;
  firstName: string;
  lastName: string;
  name?: string;
  phone: string;
  email: string;
  gender?: string;
  dateOfBirth?: string;
  notes?: string;
  joinDate?: string;
  startDate?: string;
  status?: string;
  userType?: 'member' | 'staff';
  planId?: string;
  planName?: string;
  amount?: number;
  durationDays?: number;
  paymentMethod?: 'CASH' | 'UPI' | 'ONLINE';
  sendPayLink?: boolean;
  skipPayment?: boolean;
  renewDate?: string | null;
  deviceEnrollId?: string;
  deviceEnd?: string;
  renewDateSource?: string;
  extendDueDate?: boolean;
  memberCode?: string;
  faceRegistered?: boolean;
  devicePhotoUrl?: string;
  deviceCard?: string;
  deviceFingerprint?: string;
  deviceVerifyMode?: string;
  deviceShift?: string;
  addedById?: string;
  addedByName?: string;
};

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  SUPER_ADMIN: [
    'members.read', 'members.write', 'memberships.write', 'payments.read', 'payments.write',
    'expenses.read', 'expenses.write',
    'attendance.read', 'attendance.write', 'devices.read', 'devices.control', 'reports.read', 'settings.write',
  ],
  GYM_ADMIN: [
    'members.read', 'members.write', 'memberships.write', 'payments.read', 'payments.write',
    'expenses.read', 'expenses.write',
    'attendance.read', 'attendance.write', 'devices.read', 'devices.control', 'reports.read', 'settings.write',
  ],
  RECEPTIONIST: [
    'members.read', 'members.write', 'payments.read', 'payments.write',
    'expenses.read', 'expenses.write',
    'attendance.read', 'attendance.write',
  ],
  MANAGER: [
    'members.read', 'members.write', 'memberships.write',
    'expenses.read', 'expenses.write',
    'attendance.read', 'attendance.write',
    'devices.read', 'devices.control', 'settings.write',
  ],
};

export function hasPermission(role: Role | undefined, permission: Permission) {
  if (!role) return false;
  return ROLE_PERMISSIONS[role].includes(permission);
}

export type TabKey = 'Dashboard' | 'Members' | 'Plans' | 'Payments' | 'Settings';

export function isStaffRole(role?: Role | null) {
  return role === 'MANAGER' || role === 'RECEPTIONIST';
}

export function visibleTabs(role?: Role | null): TabKey[] {
  // Expenses and Reports live under Dashboard/Settings. Staff/managers: no Payments.
  if (isStaffRole(role)) {
    return ['Dashboard', 'Members', 'Plans', 'Settings'];
  }
  return ['Dashboard', 'Members', 'Plans', 'Payments', 'Settings'];
}
