import { applyMembershipRules } from '../../shared/access/checkAccess';
import type {
  AccessEvent,
  AppNotification,
  AttendanceRecord,
  Device,
  GymSettings,
  Member,
  Membership,
  MembershipPlan,
  Payment,
  User,
} from '../../shared/types';

const now = new Date();

function iso(daysFromNow: number, hours = 9, minutes = 0): string {
  const d = new Date(now);
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(hours, minutes, 0, 0);
  return d.toISOString();
}

function todayAt(hours: number, minutes: number): string {
  const d = new Date(now);
  d.setHours(hours, minutes, 0, 0);
  return d.toISOString();
}

export const DEMO_PASSWORD = 'Admin@123';

export const demoUsers: User[] = [
  {
    id: 'user-1',
    name: 'Naresh Behera',
    email: 'admin@gymaccess.in',
    role: 'SUPER_ADMIN',
    gymId: 'gym-1',
    phone: '+91 98450 11223',
    avatarInitials: 'NB',
  },
  {
    id: 'user-2',
    name: 'Vikram Shetty',
    email: 'gymadmin@gymaccess.in',
    role: 'GYM_ADMIN',
    gymId: 'gym-1',
    phone: '+91 98860 33445',
    avatarInitials: 'VS',
  },
  {
    id: 'user-3',
    name: 'Pooja Nair',
    email: 'reception@gymaccess.in',
    role: 'RECEPTIONIST',
    gymId: 'gym-1',
    phone: '+91 99001 55667',
    avatarInitials: 'PN',
  },
  {
    id: 'user-4',
    name: 'Sanjay Mehta',
    email: 'manager@gymaccess.in',
    role: 'MANAGER',
    gymId: 'gym-1',
    phone: '+91 97311 77889',
    avatarInitials: 'SM',
  },
];

export const demoSettings: GymSettings = {
  id: 'settings-1',
  gymName: 'IronWorks Fitness',
  legalName: 'IronWorks Fitness Pvt Ltd',
  phone: '+91 80 4123 7788',
  email: 'front@ironworks.fit',
  address: '14, 100 Feet Road, Indiranagar',
  city: 'Bengaluru',
  state: 'Karnataka',
  pincode: '560038',
  gstin: '29AABCI1234M1Z5',
  gateUnlockDurationSeconds: 5,
  duplicateScanCooldownSeconds: 30,
  allowExpired: false,
  allowSuspended: false,
  unknownFacePolicy: 'DENY',
  offlineModeEnabled: true,
  reminderDays: [7, 3, 2, 1, 0],
  currency: 'INR',
  timezone: 'Asia/Kolkata',
};

export const demoPlans: MembershipPlan[] = [
  {
    id: 'plan-monthly',
    name: 'Monthly',
    durationDays: 30,
    durationLabel: '30 days',
    price: 2499,
    description: 'Full gym access for 30 days. Includes locker and group classes.',
    accessType: 'ALL_HOURS',
    status: 'ACTIVE',
    createdAt: iso(-240),
  },
  {
    id: 'plan-quarterly',
    name: 'Quarterly',
    durationDays: 90,
    durationLabel: '90 days',
    price: 6499,
    description: 'Three-month membership with one free PT assessment.',
    accessType: 'ALL_HOURS',
    status: 'ACTIVE',
    createdAt: iso(-240),
  },
  {
    id: 'plan-half',
    name: 'Half-Yearly',
    durationDays: 180,
    durationLabel: '180 days',
    price: 11499,
    description: 'Six-month plan with diet consult and two PT sessions.',
    accessType: 'ALL_HOURS',
    status: 'ACTIVE',
    createdAt: iso(-240),
  },
  {
    id: 'plan-yearly',
    name: 'Yearly',
    durationDays: 365,
    durationLabel: '365 days',
    price: 19999,
    description: 'Annual membership with locker, classes, and four PT sessions.',
    accessType: 'ALL_HOURS',
    status: 'ACTIVE',
    createdAt: iso(-240),
  },
];

interface SeedMember {
  firstName: string;
  lastName: string;
  gender: 'Male' | 'Female' | 'Other';
  city: string;
  bloodGroup: string;
}

const SEED_PEOPLE: SeedMember[] = [
  { firstName: 'Rahul', lastName: 'Sharma', gender: 'Male', city: 'Bengaluru', bloodGroup: 'B+' },
  { firstName: 'Amit', lastName: 'Kumar', gender: 'Male', city: 'Bengaluru', bloodGroup: 'O+' },
  { firstName: 'Priya', lastName: 'Singh', gender: 'Female', city: 'Bengaluru', bloodGroup: 'A+' },
  { firstName: 'Sneha', lastName: 'Patel', gender: 'Female', city: 'Ahmedabad', bloodGroup: 'AB+' },
  { firstName: 'Vikram', lastName: 'Reddy', gender: 'Male', city: 'Hyderabad', bloodGroup: 'O-' },
  { firstName: 'Anjali', lastName: 'Mehta', gender: 'Female', city: 'Mumbai', bloodGroup: 'B+' },
  { firstName: 'Rohit', lastName: 'Verma', gender: 'Male', city: 'Delhi', bloodGroup: 'A+' },
  { firstName: 'Kavya', lastName: 'Nair', gender: 'Female', city: 'Kochi', bloodGroup: 'O+' },
  { firstName: 'Arjun', lastName: 'Iyer', gender: 'Male', city: 'Chennai', bloodGroup: 'B+' },
  { firstName: 'Deepak', lastName: 'Joshi', gender: 'Male', city: 'Pune', bloodGroup: 'A-' },
  { firstName: 'Meera', lastName: 'Shah', gender: 'Female', city: 'Surat', bloodGroup: 'O+' },
  { firstName: 'Karan', lastName: 'Malhotra', gender: 'Male', city: 'Delhi', bloodGroup: 'B+' },
  { firstName: 'Pooja', lastName: 'Gupta', gender: 'Female', city: 'Jaipur', bloodGroup: 'A+' },
  { firstName: 'Siddharth', lastName: 'Rao', gender: 'Male', city: 'Bengaluru', bloodGroup: 'O+' },
  { firstName: 'Neha', lastName: 'Kapoor', gender: 'Female', city: 'Mumbai', bloodGroup: 'AB+' },
  { firstName: 'Aditya', lastName: 'Jain', gender: 'Male', city: 'Indore', bloodGroup: 'B+' },
  { firstName: 'Riya', lastName: 'Desai', gender: 'Female', city: 'Vadodara', bloodGroup: 'O+' },
  { firstName: 'Manish', lastName: 'Tiwari', gender: 'Male', city: 'Lucknow', bloodGroup: 'A+' },
  { firstName: 'Shreya', lastName: 'Banerjee', gender: 'Female', city: 'Kolkata', bloodGroup: 'B+' },
  { firstName: 'Nikhil', lastName: 'Pillai', gender: 'Male', city: 'Thiruvananthapuram', bloodGroup: 'O+' },
  { firstName: 'Divya', lastName: 'Krishnan', gender: 'Female', city: 'Chennai', bloodGroup: 'A+' },
  { firstName: 'Harsh', lastName: 'Agarwal', gender: 'Male', city: 'Kanpur', bloodGroup: 'B+' },
  { firstName: 'Tanvi', lastName: 'Bhatt', gender: 'Female', city: 'Ahmedabad', bloodGroup: 'O+' },
  { firstName: 'Rajesh', lastName: 'Nair', gender: 'Male', city: 'Bengaluru', bloodGroup: 'A+' },
  { firstName: 'Ananya', lastName: 'Sen', gender: 'Female', city: 'Kolkata', bloodGroup: 'AB+' },
  { firstName: 'Vivek', lastName: 'Chauhan', gender: 'Male', city: 'Chandigarh', bloodGroup: 'O+' },
  { firstName: 'Isha', lastName: 'Menon', gender: 'Female', city: 'Bengaluru', bloodGroup: 'B+' },
  { firstName: 'Gaurav', lastName: 'Saxena', gender: 'Male', city: 'Noida', bloodGroup: 'A+' },
  { firstName: 'Nisha', lastName: 'Bansal', gender: 'Female', city: 'Gurugram', bloodGroup: 'O+' },
  { firstName: 'Abhishek', lastName: 'Yadav', gender: 'Male', city: 'Patna', bloodGroup: 'B+' },
  { firstName: 'Swati', lastName: 'Mishra', gender: 'Female', city: 'Bhopal', bloodGroup: 'A+' },
  { firstName: 'Kunal', lastName: 'Ghosh', gender: 'Male', city: 'Kolkata', bloodGroup: 'O+' },
  { firstName: 'Preeti', lastName: 'Kulkarni', gender: 'Female', city: 'Pune', bloodGroup: 'B+' },
  { firstName: 'Mohit', lastName: 'Bhatia', gender: 'Male', city: 'Delhi', bloodGroup: 'A+' },
  { firstName: 'Ankita', lastName: 'Reddy', gender: 'Female', city: 'Hyderabad', bloodGroup: 'O+' },
  { firstName: 'Suresh', lastName: 'Iyer', gender: 'Male', city: 'Chennai', bloodGroup: 'B+' },
  { firstName: 'Lakshmi', lastName: 'Narayan', gender: 'Female', city: 'Bengaluru', bloodGroup: 'A+' },
  { firstName: 'Varun', lastName: 'Khanna', gender: 'Male', city: 'Mumbai', bloodGroup: 'O+' },
  { firstName: 'Aditi', lastName: 'Sharma', gender: 'Female', city: 'Jaipur', bloodGroup: 'B+' },
  { firstName: 'Ravi', lastName: 'Prasad', gender: 'Male', city: 'Bengaluru', bloodGroup: 'A+' },
  { firstName: 'Sonali', lastName: 'Joshi', gender: 'Female', city: 'Pune', bloodGroup: 'O+' },
  { firstName: 'Farhan', lastName: 'Ahmed', gender: 'Male', city: 'Hyderabad', bloodGroup: 'B+' },
  { firstName: 'Zara', lastName: 'Khan', gender: 'Female', city: 'Mumbai', bloodGroup: 'A+' },
  { firstName: 'Imran', lastName: 'Sheikh', gender: 'Male', city: 'Delhi', bloodGroup: 'O+' },
  { firstName: 'Ayesha', lastName: 'Khan', gender: 'Female', city: 'Bengaluru', bloodGroup: 'AB+' },
  { firstName: 'Dev', lastName: 'Patel', gender: 'Male', city: 'Surat', bloodGroup: 'B+' },
  { firstName: 'Krisha', lastName: 'Shah', gender: 'Female', city: 'Ahmedabad', bloodGroup: 'O+' },
  { firstName: 'Yash', lastName: 'Mehta', gender: 'Male', city: 'Mumbai', bloodGroup: 'A+' },
  { firstName: 'Sanjana', lastName: 'Rao', gender: 'Female', city: 'Bengaluru', bloodGroup: 'B+' },
  { firstName: 'Kabir', lastName: 'Singh', gender: 'Male', city: 'Chandigarh', bloodGroup: 'O+' },
  { firstName: 'Nandini', lastName: 'Iyer', gender: 'Female', city: 'Chennai', bloodGroup: 'A+' },
  { firstName: 'Harshita', lastName: 'Goel', gender: 'Female', city: 'Delhi', bloodGroup: 'B+' },
];

const PLAN_CYCLE = ['plan-monthly', 'plan-quarterly', 'plan-half', 'plan-yearly'] as const;

function phoneFor(index: number): string {
  const base = 9800001000 + index * 17;
  const s = String(base);
  return `+91 ${s.slice(0, 5)} ${s.slice(5)}`;
}

export function buildDemoMembers(): Member[] {
  return SEED_PEOPLE.map((person, index) => {
    const id = `mem-${String(index + 1).padStart(3, '0')}`;
    const memberCode = `MEM-${1001 + index}`;
    const suspended = index === 5;
    return {
      id,
      memberCode,
      firstName: person.firstName,
      lastName: person.lastName,
      name: `${person.firstName} ${person.lastName}`,
      phone: phoneFor(index),
      email: `${person.firstName}.${person.lastName}`.toLowerCase() + '@gmail.com',
      gender: person.gender,
      dateOfBirth: `19${70 + (index % 25)}-${String((index % 12) + 1).padStart(2, '0')}-15`,
      address: `${12 + index}, ${person.city} Layout`,
      city: person.city,
      emergencyContactName: index % 2 === 0 ? 'Parent / Spouse' : 'Sibling',
      emergencyContactPhone: phoneFor(index + 80),
      bloodGroup: person.bloodGroup,
      joinDate: iso(-200 + (index % 80)).slice(0, 10),
      status: suspended ? 'SUSPENDED' : 'ACTIVE',
      faceRegistered: index !== 18 && index !== 41,
      faceDeviceId: index !== 18 && index !== 41 ? 'dev-entry-01' : undefined,
      lastVisit: index % 9 === 0 ? iso(-1, 18, 10) : iso(-(index % 6), 7 + (index % 12), 12 + index),
      notes: suspended ? 'Suspended for payment dispute. Review before reactivation.' : undefined,
      createdAt: iso(-200 + (index % 80)),
      updatedAt: iso(-2),
    };
  });
}

export function buildDemoMemberships(members: Member[]): Membership[] {
  return members.map((member, index) => {
    const planId = PLAN_CYCLE[index % PLAN_CYCLE.length];
    const plan = demoPlans.find((p) => p.id === planId)!;
    let startOffset = -40;
    let expiryOffset = 20;
    let status: Membership['status'] = 'ACTIVE';
    let paymentStatus: Payment['status'] = 'PAID';

    if (index === 1) {
      startOffset = -70;
      expiryOffset = -8;
      status = 'EXPIRED';
    } else if (index === 5) {
      startOffset = -20;
      expiryOffset = 40;
      status = 'SUSPENDED';
    } else if (index % 11 === 3) {
      startOffset = -26;
      expiryOffset = 4;
      status = 'EXPIRING';
    } else if (index % 13 === 7) {
      startOffset = -50;
      expiryOffset = -3;
      status = 'EXPIRED';
      paymentStatus = 'PENDING';
    } else if (index % 17 === 2) {
      startOffset = -27;
      expiryOffset = 2;
      status = 'EXPIRING';
    }

    const raw: Membership = {
      id: `ms-${member.id}`,
      memberId: member.id,
      planId,
      startDate: iso(startOffset).slice(0, 10),
      expiryDate: iso(expiryOffset).slice(0, 10),
      price: plan.price,
      discount: index % 8 === 0 ? 200 : 0,
      paymentStatus,
      autoRenewal: index % 5 === 0,
      status,
      accessStatus: 'ACTIVE',
      createdAt: iso(startOffset),
      updatedAt: iso(-1),
    };
    return applyMembershipRules(raw);
  });
}

export const demoDevices: Device[] = [
  {
    id: 'dev-entry-01',
    deviceCode: 'ENTRY-01',
    name: 'Main Entrance',
    type: 'FACE_TERMINAL',
    model: 'AI806 / SA-AI21 class',
    ipAddress: '192.168.29.231',
    location: 'Main Gate',
    status: 'ONLINE',
    lastHeartbeat: new Date(Date.now() - 12_000).toISOString(),
    firmware: 'ai806_fp06v_v5.16',
    userCount: 48,
    logCount: 18420,
    gateState: 'LOCKED',
  },
  {
    id: 'dev-reception-01',
    deviceCode: 'RCPT-01',
    name: 'Reception Terminal',
    type: 'FACE_TERMINAL',
    model: 'SA-AI21',
    ipAddress: '192.168.1.51',
    location: 'Reception Desk',
    status: 'ONLINE',
    lastHeartbeat: new Date(Date.now() - 8_000).toISOString(),
    firmware: '2.4.1',
    userCount: 48,
    logCount: 2210,
    gateState: 'LOCKED',
  },
  {
    id: 'dev-backup-01',
    deviceCode: 'BKP-01',
    name: 'Backup Terminal',
    type: 'FACE_TERMINAL',
    model: 'SA-AI21',
    ipAddress: '192.168.1.52',
    location: 'Staff Entrance',
    status: 'OFFLINE',
    lastHeartbeat: new Date(Date.now() - 3_600_000).toISOString(),
    firmware: '2.3.8',
    userCount: 12,
    logCount: 640,
    gateState: 'LOCKED',
  },
  {
    id: 'dev-gate-01',
    deviceCode: 'GATE-01',
    name: 'Main Turnstile',
    type: 'TURNSTILE',
    model: 'AC-LOCK-200',
    ipAddress: '192.168.1.60',
    location: 'Main Gate',
    status: 'ONLINE',
    lastHeartbeat: new Date(Date.now() - 5_000).toISOString(),
    firmware: '1.8.0',
    userCount: 0,
    logCount: 18420,
    gateState: 'LOCKED',
  },
];

export function attendanceForWeek(members: Member[]): AttendanceRecord[] {
  const records: AttendanceRecord[] = [];
  let n = 1;
  for (let day = -6; day <= 0; day += 1) {
    const dailyCount = day === 0 ? 28 : 18 + ((day + 9) % 8);
    for (let i = 0; i < dailyCount; i += 1) {
      const member = members[(i * 3 + Math.abs(day) * 2) % members.length];
      const hour = 6 + (i % 14);
      const minute = (i * 7) % 60;
      const granted = !(i % 11 === 0 && member.id === 'mem-002');
      const expired = member.id === 'mem-002';
      records.push({
        id: `att-${n}`,
        memberId: member.id,
        memberName: member.name,
        memberCode: member.memberCode,
        deviceId: 'dev-entry-01',
        deviceName: 'Main Entrance',
        timestamp: iso(day, hour, minute),
        type: 'ENTRY',
        status: expired ? 'EXPIRED' : granted ? 'GRANTED' : 'DENIED',
        reason: expired ? 'Membership expired' : granted ? undefined : 'Duplicate scan cooldown',
        createdAt: iso(day, hour, minute),
      });
      n += 1;
    }
  }

  const todaySlots: Array<[number, number, string | undefined, AttendanceRecord['status'], string?]> = [
    [7, 12, 'mem-001', 'GRANTED', undefined],
    [7, 28, 'mem-014', 'GRANTED', undefined],
    [8, 32, 'mem-001', 'GRANTED', undefined],
    [8, 36, 'mem-002', 'EXPIRED', 'Membership expired'],
    [8, 41, 'mem-008', 'GRANTED', undefined],
    [8, 44, undefined, 'UNKNOWN', 'Face not recognized'],
    [9, 5, 'mem-011', 'GRANTED', undefined],
    [9, 18, 'mem-006', 'SUSPENDED', 'Membership suspended'],
    [17, 40, 'mem-027', 'GRANTED', undefined],
    [18, 12, 'mem-033', 'GRANTED', undefined],
  ];

  for (const [h, m, memberId, status, reason] of todaySlots) {
    const member = members.find((x) => x.id === memberId);
    records.push({
      id: `att-${n}`,
      memberId,
      memberName: member?.name ?? 'Unknown Person',
      memberCode: member?.memberCode,
      deviceId: 'dev-entry-01',
      deviceName: 'Main Entrance',
      timestamp: todayAt(h, m),
      type: 'ENTRY',
      status,
      reason,
      createdAt: todayAt(h, m),
    });
    n += 1;
  }

  return records.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

export function buildPayments(members: Member[], memberships: Membership[]): Payment[] {
  return memberships.map((ms, index) => {
    const member = members.find((m) => m.id === ms.memberId)!;
    const methods: Payment['method'][] = ['UPI', 'CARD', 'CASH', 'RAZORPAY', 'BANK'];
    return {
      id: `pay-${index + 1}`,
      paymentCode: `PAY-2026-${String(1001 + index)}`,
      memberId: member.id,
      membershipId: ms.id,
      planId: ms.planId,
      amount: ms.price - ms.discount,
      date: ms.startDate,
      method: methods[index % methods.length],
      status: ms.paymentStatus,
      invoiceNumber: `INV-26-${String(2401 + index)}`,
      createdAt: ms.createdAt,
    };
  });
}

export function buildAccessEvents(attendance: AttendanceRecord[]): AccessEvent[] {
  return attendance.map((row) => {
    let decision: AccessEvent['decision'] = 'GRANTED';
    let reason: AccessEvent['reason'] = 'ACCESS_GRANTED';
    let face: AccessEvent['faceResult'] = 'MATCHED';
    if (row.status === 'UNKNOWN') {
      decision = 'DENIED';
      reason = 'UNKNOWN_MEMBER';
      face = 'UNKNOWN';
    } else if (row.status === 'EXPIRED') {
      decision = 'DENIED';
      reason = 'EXPIRED_MEMBERSHIP';
    } else if (row.status === 'SUSPENDED') {
      decision = 'DENIED';
      reason = 'SUSPENDED_MEMBERSHIP';
    } else if (row.status === 'DENIED') {
      decision = 'DENIED';
      reason = 'NO_ACTIVE_MEMBERSHIP';
    }
    return {
      id: `acc-${row.id}`,
      memberId: row.memberId,
      memberName: row.memberName,
      memberCode: row.memberCode,
      deviceId: row.deviceId,
      deviceName: row.deviceName,
      timestamp: row.timestamp,
      type: row.type,
      decision,
      reason,
      faceResult: face,
      gateAction: decision === 'GRANTED' ? 'UNLOCKED' : 'NONE',
    };
  });
}

export function buildDemoNotifications(members: Member[]): AppNotification[] {
  const expiring = members.filter((_, i) => i % 11 === 3).slice(0, 4);
  return [
    {
      id: 'ntf-1',
      type: 'DEVICE_OFFLINE',
      title: 'Backup Terminal offline',
      message: 'BKP-01 at Staff Entrance has not sent a heartbeat for 60 minutes.',
      channel: 'IN_APP',
      read: false,
      deviceId: 'dev-backup-01',
      createdAt: iso(0, 8, 10),
    },
    {
      id: 'ntf-2',
      type: 'ACCESS_DENIED',
      title: 'Access denied — Amit Kumar',
      message: 'Main Entrance denied entry. Membership expired.',
      channel: 'IN_APP',
      read: false,
      memberId: 'mem-002',
      createdAt: todayAt(8, 36),
    },
    {
      id: 'ntf-3',
      type: 'PAYMENT_SUCCESS',
      title: 'Payment received',
      message: '₹19,999 received from Kabir Singh for Yearly plan.',
      channel: 'IN_APP',
      read: true,
      memberId: 'mem-050',
      createdAt: iso(-1, 16, 20),
    },
    ...expiring.map((member, i) => ({
      id: `ntf-exp-${i}`,
      type: 'MEMBERSHIP_EXPIRING' as const,
      title: `Membership expiring — ${member.name}`,
      message: `${member.name}'s plan expires within 7 days. Send a renewal reminder.`,
      channel: 'WHATSAPP' as const,
      read: i > 1,
      memberId: member.id,
      createdAt: iso(-i, 10, 0),
    })),
    {
      id: 'ntf-4',
      type: 'SYNC_FAILED',
      title: 'Cloud sync retry scheduled',
      message: '3 payment records are queued. They will sync when the link is stable.',
      channel: 'IN_APP',
      read: true,
      createdAt: iso(-1, 21, 5),
    },
  ];
}

export interface DemoDataset {
  users: User[];
  settings: GymSettings;
  plans: MembershipPlan[];
  members: Member[];
  memberships: Membership[];
  devices: Device[];
  attendance: AttendanceRecord[];
  payments: Payment[];
  accessEvents: AccessEvent[];
  notifications: AppNotification[];
}

export function createDemoDataset(): DemoDataset {
  return {
    users: demoUsers,
    settings: demoSettings,
    plans: demoPlans,
    members: [],
    memberships: [],
    devices: demoDevices,
    attendance: [],
    payments: [],
    accessEvents: [],
    notifications: [],
  };
}

export const SIMULATION_TARGETS = {
  active: 'mem-001',
  expired: 'mem-002',
  suspended: 'mem-006',
} as const;
