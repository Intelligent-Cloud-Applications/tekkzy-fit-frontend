export type Role = 'SUPER_ADMIN' | 'GYM_ADMIN' | 'RECEPTIONIST' | 'MANAGER';

export type MemberAccountStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';

export type MembershipStatus =
  | 'ACTIVE'
  | 'EXPIRING'
  | 'EXPIRED'
  | 'SUSPENDED'
  | 'CANCELLED';

export type AccessStatus = 'ACTIVE' | 'DENIED';

export type PaymentStatus = 'PAID' | 'PENDING' | 'FAILED' | 'REFUNDED';

export type PaymentMethod = 'CASH' | 'UPI' | 'CARD' | 'RAZORPAY' | 'BANK';

export type AttendanceStatus =
  | 'GRANTED'
  | 'DENIED'
  | 'UNKNOWN'
  | 'EXPIRED'
  | 'SUSPENDED';

export type AttendanceType = 'ENTRY' | 'EXIT';

export type AccessDecision = 'GRANTED' | 'DENIED';

export type AccessReason =
  | 'ACCESS_GRANTED'
  | 'UNKNOWN_MEMBER'
  | 'EXPIRED_MEMBERSHIP'
  | 'SUSPENDED_MEMBERSHIP'
  | 'NO_ACTIVE_MEMBERSHIP'
  | 'DEVICE_ERROR';

export type FaceMatchResult = 'MATCHED' | 'UNKNOWN' | 'ERROR';

export type DeviceKind = 'FACE_TERMINAL' | 'ACCESS_CONTROLLER' | 'TURNSTILE';

export type DeviceOnlineStatus = 'ONLINE' | 'OFFLINE';

export type GateState = 'LOCKED' | 'UNLOCKED';

export type PlanAccessType = 'ALL_HOURS' | 'PEAK' | 'OFF_PEAK';

export type PlanStatus = 'ACTIVE' | 'INACTIVE';

export type SyncOp = 'CREATE' | 'UPDATE' | 'DELETE';

export type SyncItemStatus = 'PENDING' | 'SYNCING' | 'SYNCED' | 'FAILED';

export type NotificationKind =
  | 'MEMBERSHIP_EXPIRING'
  | 'MEMBERSHIP_EXPIRED'
  | 'PAYMENT_SUCCESS'
  | 'PAYMENT_FAILED'
  | 'ACCESS_DENIED'
  | 'DEVICE_OFFLINE'
  | 'DEVICE_ONLINE'
  | 'SYNC_FAILED';

export type NotificationChannel = 'IN_APP' | 'WHATSAPP' | 'SMS' | 'EMAIL';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  gymId: string;
  phone?: string;
  avatarInitials: string;
}

export interface AuthSession {
  token: string;
  user: User;
}

export interface Member {
  id: string;
  memberCode: string;
  firstName: string;
  lastName: string;
  name: string;
  phone: string;
  email: string;
  gender: 'Male' | 'Female' | 'Other';
  dateOfBirth: string;
  address: string;
  city: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  bloodGroup?: string;
  joinDate: string;
  status: MemberAccountStatus;
  faceRegistered: boolean;
  faceDeviceId?: string;
  deviceEnrollId?: string;
  department?: string;
  deviceShift?: string;
  devicePrivilege?: string;
  deviceCard?: string;
  deviceFingerprint?: string;
  devicePwd?: string;
  deviceWeekzone?: string;
  deviceGroup?: string;
  deviceAccessTimes?: string;
  deviceVerifyMode?: string;
  deviceStart?: string;
  deviceEnd?: string;
  deviceEndPending?: boolean;
  renewDate?: string | null;
  devicePhotoUrl?: string;
  lastVisit?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MembershipPlan {
  id: string;
  name: string;
  durationDays: number;
  durationLabel: string;
  price: number;
  description: string;
  accessType: PlanAccessType;
  status: PlanStatus;
  createdAt: string;
}

export interface Membership {
  id: string;
  memberId: string;
  planId: string;
  startDate: string;
  expiryDate: string;
  price: number;
  discount: number;
  paymentStatus: PaymentStatus;
  autoRenewal: boolean;
  status: MembershipStatus;
  accessStatus: AccessStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AttendanceRecord {
  id: string;
  memberId?: string;
  memberName: string;
  memberCode?: string;
  deviceId: string;
  deviceName: string;
  timestamp: string;
  type: AttendanceType;
  status: AttendanceStatus;
  reason?: string;
  createdAt: string;
}

export interface Payment {
  id: string;
  paymentCode: string;
  memberId: string;
  memberName?: string;
  membershipId?: string;
  planId: string;
  amount: number;
  date: string;
  method: PaymentMethod;
  status: PaymentStatus;
  invoiceNumber: string;
  notes?: string;
  paymentLinkUrl?: string;
  paymentLinkId?: string;
  subscriptionId?: string;
  razorpayPaymentId?: string;
  renewDate?: string | null;
  createdAt: string;
}

export interface Device {
  id: string;
  deviceCode: string;
  name: string;
  type: DeviceKind;
  model: string;
  ipAddress: string;
  location: string;
  status: DeviceOnlineStatus;
  lastHeartbeat: string;
  firmware: string;
  userCount: number;
  logCount: number;
  gateState: GateState;
}

export interface AccessEvent {
  id: string;
  memberId?: string;
  memberName: string;
  memberCode?: string;
  deviceId: string;
  deviceName: string;
  timestamp: string;
  type: AttendanceType;
  decision: AccessDecision;
  reason: AccessReason;
  faceResult: FaceMatchResult;
  gateAction: 'UNLOCKED' | 'LOCKED' | 'NONE';
  membershipStatus?: MembershipStatus;
  expiryDate?: string;
}

export interface AppNotification {
  id: string;
  type: NotificationKind;
  title: string;
  message: string;
  channel: NotificationChannel;
  read: boolean;
  memberId?: string;
  deviceId?: string;
  createdAt: string;
}

export interface SyncQueueItem {
  id: string;
  entity: string;
  entityId: string;
  operation: SyncOp;
  payload: string;
  createdAt: string;
  retryCount: number;
  status: SyncItemStatus;
  lastError?: string;
}

export interface GymSettings {
  id: string;
  gymName: string;
  legalName: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  gstin?: string;
  gateUnlockDurationSeconds: number;
  duplicateScanCooldownSeconds: number;
  allowExpired: boolean;
  allowSuspended: boolean;
  unknownFacePolicy: 'DENY' | 'ALLOW';
  offlineModeEnabled: boolean;
  reminderDays: number[];
  currency: 'INR';
  timezone: string;
}

export interface FaceRegistration {
  id: string;
  memberId: string;
  deviceId: string;
  registeredAt: string;
  status: 'REGISTERED' | 'PENDING' | 'FAILED';
}

export interface AccessCheckInput {
  member?: Member | null;
  membership?: Membership | null;
  now?: Date;
  allowExpired?: boolean;
  allowSuspended?: boolean;
}

export interface AccessCheckResult {
  decision: AccessDecision;
  reason: AccessReason;
  attendanceStatus: AttendanceStatus;
  member?: Member;
  membership?: Membership;
}

export interface FaceScanResult {
  matched: boolean;
  memberId?: string;
  confidence?: number;
  livenessPassed?: boolean;
  deviceId: string;
  raw?: Record<string, unknown>;
}

export interface FaceRegistrationInput {
  memberId: string;
  deviceId: string;
  templateRef?: string;
}

export interface FaceRegistrationResult {
  success: boolean;
  memberId: string;
  deviceId: string;
  message: string;
}

export interface DeviceStatusSnapshot {
  deviceId: string;
  online: boolean;
  gateState: GateState;
  lastHeartbeat: string;
  firmware?: string;
  userCount?: number;
  message?: string;
}

export interface DashboardKpis {
  totalMembers: number;
  activeMembers: number;
  expiringSoon: number;
  expired: number;
  todayAttendance: number;
  todayRevenue: number;
  currentlyInside: number;
  accessDeniedToday: number;
}

export type Permission =
  | 'members.read'
  | 'members.write'
  | 'memberships.write'
  | 'payments.read'
  | 'payments.write'
  | 'attendance.read'
  | 'attendance.write'
  | 'devices.read'
  | 'devices.control'
  | 'reports.read'
  | 'settings.write'
  | 'users.write';
