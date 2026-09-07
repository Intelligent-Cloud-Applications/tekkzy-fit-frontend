import { openDB, type IDBPDatabase } from 'idb';
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
  SyncQueueItem,
  User,
} from '@shared/types';
import { createDemoDataset } from '@/data/demo';

const DB_NAME = 'gym-access-local';
const DB_VERSION = 1;

interface MetaRecord {
  key: string;
  value: string;
}

export interface GymDB {
  members: {
    key: string;
    value: Member;
    indexes: { 'by-code': string; 'by-name': string };
  };
  memberships: {
    key: string;
    value: Membership;
    indexes: { 'by-member': string };
  };
  plans: { key: string; value: MembershipPlan };
  attendance: {
    key: string;
    value: AttendanceRecord;
    indexes: { 'by-member': string; 'by-time': string };
  };
  payments: {
    key: string;
    value: Payment;
    indexes: { 'by-member': string };
  };
  devices: { key: string; value: Device };
  accessEvents: {
    key: string;
    value: AccessEvent;
    indexes: { 'by-time': string };
  };
  notifications: { key: string; value: AppNotification };
  syncQueue: { key: string; value: SyncQueueItem };
  settings: { key: string; value: GymSettings };
  users: { key: string; value: User };
  meta: { key: string; value: MetaRecord };
}

let dbPromise: Promise<IDBPDatabase<GymDB>> | null = null;

export function getLocalDb(): Promise<IDBPDatabase<GymDB>> {
  if (!dbPromise) {
    dbPromise = openDB<GymDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const members = db.createObjectStore('members', { keyPath: 'id' });
        members.createIndex('by-code', 'memberCode');
        members.createIndex('by-name', 'name');
        const memberships = db.createObjectStore('memberships', { keyPath: 'id' });
        memberships.createIndex('by-member', 'memberId');
        db.createObjectStore('plans', { keyPath: 'id' });
        const attendance = db.createObjectStore('attendance', { keyPath: 'id' });
        attendance.createIndex('by-member', 'memberId');
        attendance.createIndex('by-time', 'timestamp');
        const payments = db.createObjectStore('payments', { keyPath: 'id' });
        payments.createIndex('by-member', 'memberId');
        db.createObjectStore('devices', { keyPath: 'id' });
        const events = db.createObjectStore('accessEvents', { keyPath: 'id' });
        events.createIndex('by-time', 'timestamp');
        db.createObjectStore('notifications', { keyPath: 'id' });
        db.createObjectStore('syncQueue', { keyPath: 'id' });
        db.createObjectStore('settings', { keyPath: 'id' });
        db.createObjectStore('users', { keyPath: 'id' });
        db.createObjectStore('meta', { keyPath: 'key' });
      },
    });
  }
  return dbPromise;
}

export async function seedLocalDatabase(): Promise<void> {
  const db = await getLocalDb();
  const seeded = await db.get('meta', 'seeded');
  if (seeded?.value === '2') return;
  if (seeded?.value === '1') {
    const clear = db.transaction(['members', 'memberships', 'attendance', 'payments', 'accessEvents', 'notifications', 'meta'], 'readwrite');
    await Promise.all([
      clear.objectStore('members').clear(),
      clear.objectStore('memberships').clear(),
      clear.objectStore('attendance').clear(),
      clear.objectStore('payments').clear(),
      clear.objectStore('accessEvents').clear(),
      clear.objectStore('notifications').clear(),
      clear.objectStore('meta').put({ key: 'seeded', value: '2' }),
      clear.objectStore('meta').put({ key: 'dataMode', value: 'live' }),
    ]);
    await clear.done;
    return;
  }

  const data = createDemoDataset();
  const tx = db.transaction(
    [
      'members',
      'memberships',
      'plans',
      'attendance',
      'payments',
      'devices',
      'accessEvents',
      'notifications',
      'settings',
      'users',
      'meta',
    ],
    'readwrite',
  );
  await Promise.all([
    ...data.members.map((row) => tx.objectStore('members').put(row)),
    ...data.memberships.map((row) => tx.objectStore('memberships').put(row)),
    ...data.plans.map((row) => tx.objectStore('plans').put(row)),
    ...data.attendance.map((row) => tx.objectStore('attendance').put(row)),
    ...data.payments.map((row) => tx.objectStore('payments').put(row)),
    ...data.devices.map((row) => tx.objectStore('devices').put(row)),
    ...data.accessEvents.map((row) => tx.objectStore('accessEvents').put(row)),
    ...data.notifications.map((row) => tx.objectStore('notifications').put(row)),
    ...data.users.map((row) => tx.objectStore('users').put(row)),
    tx.objectStore('settings').put(data.settings),
    tx.objectStore('meta').put({ key: 'seeded', value: '2' }),
    tx.objectStore('meta').put({ key: 'dataMode', value: 'live' }),
    tx.objectStore('meta').put({ key: 'lastSync', value: new Date(Date.now() - 2 * 60_000).toISOString() }),
  ]);
  await tx.done;
}

export async function getMeta(key: string): Promise<string | undefined> {
  const db = await getLocalDb();
  return (await db.get('meta', key))?.value;
}

export async function setMeta(key: string, value: string): Promise<void> {
  const db = await getLocalDb();
  await db.put('meta', { key, value });
}

export async function clearOperationalData(): Promise<void> {
  const db = await getLocalDb();
  const tx = db.transaction(
    ['members', 'memberships', 'attendance', 'payments', 'accessEvents', 'notifications'],
    'readwrite',
  );
  await Promise.all([
    tx.objectStore('members').clear(),
    tx.objectStore('memberships').clear(),
    tx.objectStore('attendance').clear(),
    tx.objectStore('payments').clear(),
    tx.objectStore('accessEvents').clear(),
    tx.objectStore('notifications').clear(),
  ]);
  await tx.done;
}

export const localStore = {
  async allMembers(): Promise<Member[]> {
    return (await getLocalDb()).getAll('members');
  },
  async getMember(id: string): Promise<Member | undefined> {
    return (await getLocalDb()).get('members', id);
  },
  async putMember(member: Member): Promise<void> {
    await (await getLocalDb()).put('members', member);
  },
  async deleteMember(id: string): Promise<void> {
    const db = await getLocalDb();
    await db.delete('members', id);
    const memberships = await db.getAllFromIndex('memberships', 'by-member', id);
    await Promise.all(memberships.map((row) => db.delete('memberships', row.id)));
  },
  async allMemberships(): Promise<Membership[]> {
    return (await getLocalDb()).getAll('memberships');
  },
  async membershipsFor(memberId: string): Promise<Membership[]> {
    return (await getLocalDb()).getAllFromIndex('memberships', 'by-member', memberId);
  },
  async putMembership(row: Membership): Promise<void> {
    await (await getLocalDb()).put('memberships', row);
  },
  async allPlans(): Promise<MembershipPlan[]> {
    return (await getLocalDb()).getAll('plans');
  },
  async putPlan(row: MembershipPlan): Promise<void> {
    await (await getLocalDb()).put('plans', row);
  },
  async deletePlan(id: string): Promise<void> {
    await (await getLocalDb()).delete('plans', id);
  },
  async allAttendance(): Promise<AttendanceRecord[]> {
    const rows = await (await getLocalDb()).getAll('attendance');
    return rows.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  },
  async putAttendance(row: AttendanceRecord): Promise<void> {
    await (await getLocalDb()).put('attendance', row);
  },
  async deleteAttendance(id: string): Promise<void> {
    await (await getLocalDb()).delete('attendance', id);
  },
  async allPayments(): Promise<Payment[]> {
    const rows = await (await getLocalDb()).getAll('payments');
    return rows.sort((a, b) => b.date.localeCompare(a.date));
  },
  async paymentsFor(memberId: string): Promise<Payment[]> {
    return (await getLocalDb()).getAllFromIndex('payments', 'by-member', memberId);
  },
  async putPayment(row: Payment): Promise<void> {
    await (await getLocalDb()).put('payments', row);
  },
  async deletePayment(id: string): Promise<void> {
    await (await getLocalDb()).delete('payments', id);
  },
  async allDevices(): Promise<Device[]> {
    return (await getLocalDb()).getAll('devices');
  },
  async getDevice(id: string): Promise<Device | undefined> {
    return (await getLocalDb()).get('devices', id);
  },
  async putDevice(row: Device): Promise<void> {
    await (await getLocalDb()).put('devices', row);
  },
  async allAccessEvents(): Promise<AccessEvent[]> {
    const rows = await (await getLocalDb()).getAll('accessEvents');
    return rows.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  },
  async putAccessEvent(row: AccessEvent): Promise<void> {
    await (await getLocalDb()).put('accessEvents', row);
  },
  async allNotifications(): Promise<AppNotification[]> {
    const rows = await (await getLocalDb()).getAll('notifications');
    return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
  async putNotification(row: AppNotification): Promise<void> {
    await (await getLocalDb()).put('notifications', row);
  },
  async allUsers(): Promise<User[]> {
    return (await getLocalDb()).getAll('users');
  },
  async getSettings(): Promise<GymSettings> {
    const rows = await (await getLocalDb()).getAll('settings');
    return rows[0];
  },
  async putSettings(row: GymSettings): Promise<void> {
    await (await getLocalDb()).put('settings', row);
  },
  async allSync(): Promise<SyncQueueItem[]> {
    return (await getLocalDb()).getAll('syncQueue');
  },
  async putSync(row: SyncQueueItem): Promise<void> {
    await (await getLocalDb()).put('syncQueue', row);
  },
};
