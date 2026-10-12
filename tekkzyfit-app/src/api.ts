import { apiUrl, GYM_API_KEY, INSTITUTION } from './config';
import { cloudFetch, httpError, errorMessage } from './errors';
import { deleteDeviceUser, ensureDeviceFace, fetchDeviceUsers, loginDevice, peekDeviceUserIds, probeHost, setDeviceUser, type DeviceLog, type DeviceUser } from './device';
import { deviceUserFromMember, dropQueuedDeviceUser, enrollKey, listQueuedDeviceUsers, namesMatch, nextFreeEnroll, queueDeviceUser } from './deviceQueue';
import { loadDeviceCreds } from './session';
import {
  addDays,
  compareNewestMembers,
  isStaffMember,
  memberDue,
  monthKey,
  paymentAmount,
  paymentBelongsToMember,
  monthBounds,
  monthPrefix,
  splitName,
  todayISO,
  ymd,
} from './format';
import { getToken } from './session';
import type {
  AttendanceRow,
  AuthSession,
  Expense,
  GymSettings,
  Member,
  MonthlyReport,
  Payment,
  Plan,
  SaveMemberInput,
} from './types';

let settingsCache: GymSettings | null = null;
let settingsInflight: Promise<GymSettings> | null = null;

function headers() {
  const token = getToken();
  return {
    'Content-Type': 'application/json',
    'X-Gym-Key': GYM_API_KEY,
    'X-Institution': INSTITUTION,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function needsSettingsFirst(path: string) {
  const route = path.split('?')[0];
  return route === '/members' || route.startsWith('/members/') || route === '/payments' || route.startsWith('/payments/');
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  if (needsSettingsFirst(path)) await ensureGymSettings();
  const res = await cloudFetch(`${apiUrl()}${path}`, { ...init, headers: { ...headers(), ...(init?.headers || {}) } });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let message = text || `Request failed (${res.status})`;
    try {
      const json = JSON.parse(text) as { error?: string; message?: string };
      message = json.error || json.message || message;
    } catch {
      /* keep */
    }
    throw httpError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  try {
    return (await res.json()) as T;
  } catch {
    throw new Error('The server sent an unexpected reply. Try again.');
  }
}

export async function loginWithPassword(email: string, password: string): Promise<AuthSession> {
  return apiRequest<AuthSession>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: email.trim(), password }),
  });
}

export async function requestPasswordReset(email: string) {
  await apiRequest('/auth/forgot', {
    method: 'POST',
    body: JSON.stringify({ email: email.trim() }),
  });
}

export async function confirmPasswordReset(email: string, code: string, password: string) {
  await apiRequest('/auth/confirm-forgot', {
    method: 'POST',
    body: JSON.stringify({ email: email.trim(), code: code.trim(), password }),
  });
}

export async function fetchGymSettings(): Promise<GymSettings> {
  const cloud = await apiRequest<GymSettings>('/settings');
  settingsCache = cloud || {};
  return settingsCache;
}

export function loadGymSettings() {
  if (settingsCache && !settingsInflight) return Promise.resolve(settingsCache);
  if (settingsInflight) return settingsInflight;
  settingsInflight = fetchGymSettings().finally(() => {
    settingsInflight = null;
  });
  return settingsInflight;
}

export function ensureGymSettings() {
  return loadGymSettings();
}

export async function saveGymSettings(row: GymSettings) {
  const saved = await apiRequest<GymSettings>('/settings', {
    method: 'PUT',
    body: JSON.stringify(row),
  });
  settingsCache = { ...row, ...saved };
  return settingsCache;
}

function mapMember(row: Record<string, unknown>): Member {
  const membership = (row.membership || {}) as Record<string, unknown>;
  const name = String(row.name || row.userName || '').trim();
  const parts = splitName(name);
  const attendanceDays = (row.attendanceDays && typeof row.attendanceDays === 'object'
    ? row.attendanceDays
    : {}) as Record<string, boolean>;
  const month = todayISO().slice(0, 7);
  const attendanceCount = Object.entries(attendanceDays).filter(([day, present]) => present && day.startsWith(`${month}-`)).length;
  const lastVisit = ymd(String(row.lastVisit || ''));
  return {
    id: String(row.id || row.cognitoId || ''),
    cognitoId: row.cognitoId ? String(row.cognitoId) : undefined,
    memberCode: row.memberCode ? String(row.memberCode) : undefined,
    firstName: String(row.firstName || parts.firstName),
    lastName: String(row.lastName || parts.lastName),
    name: name || `${row.firstName || ''} ${row.lastName || ''}`.trim() || 'Member',
    phone: String(row.phone || row.phoneNumber || ''),
    email: String(row.email || row.emailId || ''),
    gender: row.gender ? String(row.gender) : undefined,
    dateOfBirth: row.dateOfBirth ? String(row.dateOfBirth) : undefined,
    notes: row.notes ? String(row.notes) : undefined,
    joinDate: ymd(String(row.joinDate || membership.startDate || '')),
    createdAt: row.createdAtIso ? String(row.createdAtIso) : row.createdAt != null ? String(row.createdAt) : undefined,
    status: String(row.status || 'ACTIVE'),
    userType: row.userType ? String(row.userType) : undefined,
    cognitoRole: row.cognitoRole ? String(row.cognitoRole) : undefined,
    planId: String(row.planId || membership.planId || ''),
    planName: String(row.planName || ''),
    amount: Number(row.amount || 0) || undefined,
    durationDays: row.durationDays != null ? Number(row.durationDays) : null,
    paymentStatus: String(row.paymentStatus || membership.paymentStatus || ''),
    paymentMethod: row.paymentMethod ? String(row.paymentMethod) : undefined,
    paymentLinkUrl: row.paymentLinkUrl ? String(row.paymentLinkUrl) : undefined,
    renewDate: ymd(String(row.renewDate || membership.expiryDate || row.deviceEnd || '')) || null,
    renewDateSource: row.renewDateSource ? String(row.renewDateSource) : undefined,
    subscriptionId: row.subscriptionId ? String(row.subscriptionId) : undefined,
    subscriptionStatus: row.subscriptionStatus ? String(row.subscriptionStatus) : undefined,
    deviceEnrollId: row.deviceEnrollId ? String(row.deviceEnrollId) : undefined,
    deviceEnd: ymd(String(row.deviceEnd || '')),
    devicePhotoUrl: row.devicePhotoUrl ? String(row.devicePhotoUrl) : undefined,
    deviceCard: row.deviceCard != null ? String(row.deviceCard) : undefined,
    deviceFingerprint: row.deviceFingerprint != null ? String(row.deviceFingerprint) : undefined,
    deviceVerifyMode: row.deviceVerifyMode != null ? String(row.deviceVerifyMode) : undefined,
    deviceShift: row.deviceShift != null ? String(row.deviceShift) : undefined,
    faceRegistered: Boolean(row.faceRegistered || row.devicePhotoUrl),
    addedById: row.addedById ? String(row.addedById) : undefined,
    addedByName: row.addedByName ? String(row.addedByName) : undefined,
    staffRole: row.staffRole ? String(row.staffRole) : undefined,
    loginEmail: row.loginEmail ? String(row.loginEmail) : undefined,
    loginSub: row.loginSub ? String(row.loginSub) : undefined,
    lastLoginAt: row.lastLoginAt ? String(row.lastLoginAt) : undefined,
    lastVisit: lastVisit || undefined,
    attendanceCount,
    attendanceDays,
    attendance: row.attendance as Record<string, number> | undefined,
    membership: Object.keys(membership).length
      ? {
          id: membership.id ? String(membership.id) : undefined,
          planId: membership.planId ? String(membership.planId) : undefined,
          startDate: ymd(String(membership.startDate || '')),
          expiryDate: ymd(String(membership.expiryDate || '')),
          paymentStatus: membership.paymentStatus ? String(membership.paymentStatus) : undefined,
          status: membership.status ? String(membership.status) : undefined,
        }
      : undefined,
    todayPresence: lastVisit === todayISO() ? 'PRESENT' : 'ABSENT',
  };
}

export async function fetchMembers(): Promise<Member[]> {
  const rows = await apiRequest<Array<Record<string, unknown>> | { members?: Array<Record<string, unknown>> }>('/members');
  const list = Array.isArray(rows) ? rows : rows.members || [];
  return list
    .map(mapMember)
    .filter((row) => row.id && !isStaffMember(row))
    .sort(compareNewestMembers);
}

export async function fetchMember(id: string): Promise<Member | null> {
  try {
    const row = await apiRequest<Record<string, unknown>>(`/members/${encodeURIComponent(id)}`);
    return row ? mapMember(row) : null;
  } catch {
    return null;
  }
}

export type MembersPage = {
  members: Member[];
  cursor: string | null;
};

/** Server-paged members (search + cursor). Prefer this for the Members list. */
export async function fetchMembersPage(opts?: {
  q?: string;
  status?: string;
  limit?: number;
  cursor?: string | null;
  /** Staff id, or `none` for members the owner added. */
  addedBy?: string;
}): Promise<MembersPage> {
  const params = new URLSearchParams();
  const limit = Math.min(Math.max(Number(opts?.limit) || 15, 1), 100);
  params.set('limit', String(limit));
  const q = String(opts?.q || '').trim();
  if (q) params.set('q', q);
  if (opts?.addedBy) params.set('addedBy', opts.addedBy);
  const status = String(opts?.status || '').trim();
  if (status && status.toUpperCase() !== 'ALL') params.set('status', status);
  if (opts?.cursor) params.set('cursor', opts.cursor);
  const raw = await apiRequest<Array<Record<string, unknown>> | { members?: Array<Record<string, unknown>>; cursor?: string | null }>(
    `/members?${params.toString()}`,
  );
  const list = Array.isArray(raw) ? raw : raw.members || [];
  const members = list
    .map(mapMember)
    .filter((row) => row.id && !isStaffMember(row));
  const cursor = Array.isArray(raw) ? null : raw.cursor ?? null;
  return { members, cursor };
}

export type Dashboard = {
  month: string;
  generatedAt?: string;
  upcomingDues: { amount: number; members: number; withinDays: number };
  activeMembers: { count: number; newThisMonth: number };
  revenue: { income: number; expense: number; net: number; previousNet: number; changePct: number | null };
  staff: { total: number; trainers: number; others: number };
  trend: { days: number; income: number[]; expense: number[] };
};

/** `month` is YYYY-MM. */
export async function fetchDashboard(month: string): Promise<Dashboard> {
  return apiRequest<Dashboard>(`/dashboard?month=${encodeURIComponent(month)}`);
}

export type DashboardListKind = 'dues' | 'active' | 'new' | 'revenue';
export type DashboardMemberRow = {
  id: string;
  name: string;
  phone?: string;
  planName?: string;
  amount: number;
  joinDate?: string;
  renewDate?: string | null;
  status?: string;
  paymentStatus?: string;
  devicePhotoUrl?: string;
  addedById?: string;
  addedByName?: string;
};
export type DashboardPaymentRow = { id: string; memberId: string; memberName: string; planName?: string; amount: number; date: string; method: string };
export type DashboardExpenseRow = { id: string; title: string; category: string; amount: number; date: string; method: string };
/** One page of the rows behind a dashboard card; totals cover the whole list. */
export type DashboardListPage = {
  month: string;
  list: DashboardListKind;
  total: number;
  offset: number;
  limit: number;
  amount?: number;
  type?: 'payments' | 'expenses';
  income?: number;
  expense?: number;
  paymentsCount?: number;
  expensesCount?: number;
  rows: Array<DashboardMemberRow | DashboardPaymentRow | DashboardExpenseRow>;
};

export async function fetchDashboardList(
  kind: DashboardListKind,
  month: string,
  opts: { offset: number; limit: number; type?: 'payments' | 'expenses'; addedBy?: string },
): Promise<DashboardListPage> {
  const params = new URLSearchParams({ list: kind, month, offset: String(opts.offset), limit: String(opts.limit) });
  if (opts.type) params.set('type', opts.type);
  if (opts.addedBy) params.set('addedBy', opts.addedBy);
  return apiRequest<DashboardListPage>(`/dashboard?${params.toString()}`);
}

export async function fetchStaff(): Promise<Member[]> {
  const raw = await apiRequest<Array<Record<string, unknown>> | { members?: Array<Record<string, unknown>> }>(
    '/members?userType=staff&limit=100',
  );
  const list = Array.isArray(raw) ? raw : raw.members || [];
  return list
    .map(mapMember)
    .filter((row) => row.id && isStaffMember(row))
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
}

export async function saveStaff(input: {
  id?: string;
  firstName: string;
  lastName: string;
  phone?: string;
  email?: string;
  notes?: string;
  /** Creates or resets the staff member's app login (email + password). */
  password?: string;
  cognitoRole?: string;
  staffRole?: string;
  deviceEnrollId?: string;
  devicePhotoUrl?: string;
  faceRegistered?: boolean;
  deviceFingerprint?: string;
  deviceVerifyMode?: string;
  deviceEnd?: string | null;
  renewDate?: string | null;
  skipPayment?: boolean;
}): Promise<Member> {
  const openEnd = input.deviceEnd || input.renewDate || '2037-12-31';
  const forDevice: SaveMemberInput = {
    id: input.id,
    firstName: input.firstName,
    lastName: input.lastName,
    phone: input.phone || '',
    email: input.email || '',
    notes: input.notes,
    deviceEnrollId: input.deviceEnrollId,
    devicePhotoUrl: input.devicePhotoUrl,
    faceRegistered: input.faceRegistered,
    deviceFingerprint: input.deviceFingerprint,
    deviceVerifyMode: input.deviceVerifyMode,
    deviceEnd: openEnd,
    renewDate: openEnd,
    skipPayment: true,
    status: 'ACTIVE',
    userType: 'staff',
  };
  const device = await addOnMachineFirst(forDevice);
  const payload = {
    ...input,
    name: `${input.firstName} ${input.lastName}`.trim(),
    userType: 'staff',
    skipPayment: true,
    cognitoRole: input.cognitoRole || 'staff',
    deviceEnrollId: forDevice.deviceEnrollId || input.deviceEnrollId,
    deviceEnd: openEnd,
    renewDate: openEnd,
    renewDateSource: 'manual',
    institution: INSTITUTION,
  };
  const remote = input.id
    ? await apiRequest<Record<string, unknown> | { member: Record<string, unknown> }>(`/members/${encodeURIComponent(input.id)}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      })
    : await apiRequest<Record<string, unknown> | { member: Record<string, unknown> }>('/members', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
  const raw = remote && typeof remote === 'object' && 'member' in remote
    ? (remote as { member: Record<string, unknown> }).member
    : (remote as Record<string, unknown>);
  const mapped = mapMember(raw || payload);
  return { ...mapped, deviceQueued: device.queued, deviceError: device.error };
}

/** Copy people from the terminal into cloud. Only creates members that are not already there. */
export async function importDeviceUsersToCloud(
  host: string,
  password: string,
  existing: Member[] = [],
  knownUsers?: DeviceUser[],
): Promise<{ imported: number; updated: number; skipped: number; read: number }> {
  const users = knownUsers?.length ? knownUsers : await fetchDeviceUsers(host, password);
  const byEnroll = new Map<string, Member>();
  const byCode = new Map<string, Member>();
  const byName = new Map<string, Member>();
  for (const row of existing) {
    const enroll = enrollKey(row.deviceEnrollId)
      || (/^(DEV|MEM)-/i.test(String(row.memberCode || '')) ? enrollKey(row.memberCode) : '');
    if (enroll && !byEnroll.has(enroll)) byEnroll.set(enroll, row);
    const code = String(row.memberCode || '').trim().toLowerCase();
    if (code && !byCode.has(code)) byCode.set(code, row);
    const name = String(row.name || `${row.firstName || ''} ${row.lastName || ''}`).trim().toLowerCase();
    if (name && !byName.has(name)) byName.set(name, row);
  }

  const payloads: Record<string, unknown>[] = [];
  let skipped = 0;
  for (const user of users) {
    const enroll = enrollKey(user.id);
    if (!enroll) continue;
    const nameKey = String(user.name || '').trim().toLowerCase();
    const found = byEnroll.get(enroll)
      || byCode.get(`dev-${enroll}`)
      || byCode.get(`mem-${enroll}`)
      || byCode.get(enroll)
      || (nameKey ? byName.get(nameKey) : undefined);
    // Already in cloud — never create another copy.
    if (found) {
      skipped += 1;
      continue;
    }
    const endDay = ymd(user.endtime);
    const startDay = ymd(user.starttime) || todayISO();
    const parts = String(user.name || `Device User ${enroll}`).trim().split(/\s+/);
    const firstName = parts[0] || 'Member';
    const lastName = parts.slice(1).join(' ') || enroll;
    payloads.push({
      fromDevice: true,
      skipPayment: true,
      sendPayLink: false,
      paymentMethod: '',
      firstName,
      lastName,
      name: user.name || `${firstName} ${lastName}`.trim(),
      phone: `99${enroll.padStart(8, '0').slice(-8)}`,
      email: `terminal.${enroll}@tekkzy.fit`,
      gender: 'Other',
      joinDate: startDay,
      status: 'ACTIVE',
      faceRegistered: Boolean(Number(user.face)) || Boolean(user.photourl),
      deviceEnrollId: enroll,
      devicePhotoUrl: user.photourl || '',
      deviceCard: user.card && user.card !== '0' ? user.card : undefined,
      deviceStart: startDay,
      deviceEnd: endDay || '',
      renewDate: endDay || null,
      renewDateSource: endDay ? 'device' : undefined,
      deviceEndPending: false,
      memberCode: `DEV-${enroll}`,
      institution: INSTITUTION,
    });
  }

  let imported = 0;
  let updated = 0;
  const CHUNK = 40;
  for (let i = 0; i < payloads.length; i += CHUNK) {
    const members = payloads.slice(i, i + CHUNK);
    try {
      const res = await apiRequest<{ imported?: number; updated?: number }>('/members', {
        method: 'POST',
        body: JSON.stringify({ members, fromDevice: true }),
      });
      imported += Number(res.imported || 0);
      updated += Number(res.updated || 0);
    } catch {
      for (const payload of members) {
        try {
          await apiRequest('/members', {
            method: 'POST',
            body: JSON.stringify(payload),
          });
          imported += 1;
        } catch {
          /* skip failed row */
        }
      }
    }
  }
  return { imported, updated, skipped, read: users.length };
}

async function addOnMachineFirst(input: SaveMemberInput): Promise<{ queued: boolean; error?: string }> {
  const queued = deviceUserFromMember(input);
  if (!queued) return { queued: false };
  let reached = false;
  try {
    const creds = await loadDeviceCreds();
    const probe = await probeHost(creds.host);
    if (!probe.ok) {
      if (!queued.enrollid) {
        queued.enrollid = nextFreeEnroll(new Set());
        input.deviceEnrollId = queued.enrollid;
      }
      await queueDeviceUser(queued);
      return { queued: true };
    }
    reached = true;
    await loginDevice(creds.host, creds.username, creds.password);
    const users = await fetchDeviceUsers(creds.host, creds.password).catch(() => []);
    const used = new Set(users.map((row) => enrollKey(row.id)).filter(Boolean));
    const preferred = enrollKey(queued.enrollid || input.deviceEnrollId);
    const occupant = preferred
      ? users.find((row) => enrollKey(row.id) === preferred)
      : undefined;
    // Keep the existing device ID on edit / known enroll. Only allocate a new ID when
    // creating and the preferred slot is taken by a differently named person.
    const editing = Boolean(input.id);
    const occupantName = String(occupant?.name || '').trim();
    const sameSlot = Boolean(
      preferred
      && (
        editing
        || !occupant
        || !occupantName
        || namesMatch(occupantName, queued.name)
        // Face retake used to rename Hikvision users to the enroll number — still our slot.
        || enrollKey(occupantName) === preferred
      ),
    );
    if (preferred && sameSlot) {
      queued.enrollid = preferred;
      input.deviceEnrollId = preferred;
    } else {
      queued.enrollid = nextFreeEnroll(used);
      input.deviceEnrollId = queued.enrollid;
    }
    await setDeviceUser(creds.host, queued);
    // setuserinfo on some firmware drops the face; put the captured photo back if it did.
    await ensureDeviceFace(creds.host, queued.enrollid, queued.name, input.devicePhotoUrl).catch(() => false);
    await dropQueuedDeviceUser(queued.enrollid);
    return { queued: false };
  } catch (err) {
    if (!queued.enrollid) {
      queued.enrollid = nextFreeEnroll(new Set());
      input.deviceEnrollId = queued.enrollid;
    }
    await queueDeviceUser(queued);
    return { queued: true, error: reached ? String((err as Error)?.message || 'The terminal rejected the update.') : undefined };
  }
}

export async function saveMemberEnroll(member: Member, enrollid: string) {
  const id = member.cognitoId || member.id;
  if (!id || !enrollid) return;
  await apiRequest(`/members/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify({
      firstName: member.firstName,
      lastName: member.lastName,
      name: member.name,
      phone: member.phone,
      email: member.email,
      deviceEnrollId: enrollid,
      memberCode: member.memberCode || `MEM-${enrollid}`,
      institution: INSTITUTION,
    }),
  });
}

/** Uploads a face (data:image URL) to cloud storage for one member; returns the member with its new photo link. */
export async function saveMemberPhoto(member: Pick<Member, 'id' | 'cognitoId'>, dataUrl: string): Promise<Member> {
  const id = member.cognitoId || member.id;
  const out = await apiRequest<{ member: Record<string, unknown> }>(`/members/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify({ setPhoto: true, devicePhotoUrl: dataUrl, institution: INSTITUTION }),
  });
  return mapMember(out.member);
}

export async function persistDeviceEnrolls(
  members: Member[],
  updates: Array<{ memberId: string; enrollid: string }>,
): Promise<Member[]> {
  if (!updates.length) return members;
  await Promise.all(updates.map((item) => {
    const member = members.find((row) => row.id === item.memberId || row.cognitoId === item.memberId);
    return member ? saveMemberEnroll(member, item.enrollid).catch(() => undefined) : Promise.resolve();
  }));
  return members.map((row) => {
    const next = updates.find((item) => item.memberId === row.id || item.memberId === row.cognitoId);
    return next ? { ...row, deviceEnrollId: next.enrollid } : row;
  });
}

export async function saveMember(input: SaveMemberInput): Promise<Member> {
  const device = await addOnMachineFirst(input);
  const payload = {
    ...input,
    name: `${input.firstName} ${input.lastName}`.trim(),
    institution: INSTITUTION,
  };
  const remote = input.id
    ? await apiRequest<Record<string, unknown> | { member: Record<string, unknown> }>(`/members/${encodeURIComponent(input.id)}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      })
    : await apiRequest<Record<string, unknown> | { member: Record<string, unknown> }>('/members', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
  const raw = remote && typeof remote === 'object' && 'member' in remote
    ? (remote as { member: Record<string, unknown> }).member
    : (remote as Record<string, unknown>);
  const mapped = mapMember(raw || payload);
  return {
    ...mapped,
    createdAt: mapped.createdAt || new Date().toISOString(),
    deviceQueued: device.queued,
    deviceError: device.error,
  };
}

export async function removeMember(member: Pick<Member, 'id' | 'cognitoId' | 'deviceEnrollId' | 'memberCode'>) {
  const enroll = String(member.deviceEnrollId || '').trim()
    || (String(member.memberCode || '').match(/^DEV-(\d+)$/i)?.[1] ?? '');
  if (enroll) await dropQueuedDeviceUser(enroll);
  if (enroll) {
    const creds = await loadDeviceCreds();
    let deleted = false;
    let lastErr: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        let host = creds.host;
        const probe = await probeHost(host);
        if (!probe.ok) {
          const { connectAndLoadUsers } = await import('./device');
          const next = await connectAndLoadUsers(creds.host, creds.username, creds.password).catch(() => null);
          host = String(next?.probe?.host || host || '').trim();
          if (!host || !next?.probe?.ok) {
            throw new Error('Face machine offline. Stay on the gym Wi‑Fi and try again.');
          }
        }
        await loginDevice(host, creds.username, creds.password);
        await deleteDeviceUser(host, enroll);
        deleted = true;
        break;
      } catch (err) {
        lastErr = err;
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      }
    }
    if (!deleted) {
      throw new Error(errorMessage(lastErr, 'Could not delete from the face machine.', 'device'));
    }
  }
  const id = member.cognitoId || member.id;
  const q = enroll ? `?enroll=${encodeURIComponent(enroll)}` : '';
  await apiRequest(`/members/${encodeURIComponent(id)}${q}`, { method: 'DELETE' });
}

export async function setMemberStatus(member: Member, status: 'ACTIVE' | 'SUSPENDED') {
  const id = member.cognitoId || member.id;
  const remote = await apiRequest<Record<string, unknown> | { member: Record<string, unknown> }>(`/members/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify({
      id,
      status,
      subscriptionAction: status === 'SUSPENDED' ? 'pause' : 'resume',
    }),
  });
  const raw = remote && typeof remote === 'object' && 'member' in remote
    ? (remote as { member: Record<string, unknown> }).member
    : (remote as Record<string, unknown>);
  return mapMember(raw || { ...member, status });
}

export async function fetchPlans(): Promise<Plan[]> {
  const rows = await apiRequest<Plan[]>('/plans');
  return Array.isArray(rows) ? rows : [];
}

export async function savePlan(plan: Plan): Promise<Plan> {
  return apiRequest<Plan>(`/plans/${encodeURIComponent(plan.id)}`, {
    method: 'PUT',
    body: JSON.stringify(plan),
  });
}

export async function removePlan(id: string) {
  await apiRequest(`/plans/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

function mapPayment(row: Record<string, unknown>): Payment {
  return {
    id: String(row.id || row.paymentCode || ''),
    paymentCode: row.paymentCode ? String(row.paymentCode) : undefined,
    memberId: String(row.memberId || ''),
    memberName: row.memberName ? String(row.memberName) : undefined,
    planId: row.planId ? String(row.planId) : undefined,
    amount: Number(row.amount || 0),
    netAmount: row.netAmount != null ? Number(row.netAmount) : undefined,
    grossAmount: row.grossAmount != null ? Number(row.grossAmount) : undefined,
    date: ymd(String(row.date || row.createdAt || '')) || todayISO(),
    method: String(row.method || ''),
    status: String(row.status || ''),
    invoiceNumber: row.invoiceNumber ? String(row.invoiceNumber) : undefined,
    notes: row.notes ? String(row.notes) : undefined,
    paymentLinkUrl: row.paymentLinkUrl ? String(row.paymentLinkUrl) : undefined,
    subscriptionId: row.subscriptionId ? String(row.subscriptionId) : undefined,
    razorpayPaymentId: row.razorpayPaymentId ? String(row.razorpayPaymentId) : undefined,
    renewDate: ymd(String(row.renewDate || '')) || null,
    createdAt: row.createdAt ? String(row.createdAt) : undefined,
  };
}

export function isRealPayment(payment: Payment) {
  if (paymentAmount(payment) <= 0) return false;
  if (/^DEV-CASH-/i.test(String(payment.invoiceNumber || ''))) return false;
  if (/created on terminal/i.test(String(payment.notes || ''))) return false;
  return true;
}

/** opts: { month: 'YYYY-MM' } or { from, to } (YYYY-MM-DD). No opts = every payment (slow; avoid). */
export async function fetchPayments(opts: { month?: string; from?: string; to?: string } = {}): Promise<Payment[]> {
  const qs = new URLSearchParams();
  if (opts.month) qs.set('month', opts.month);
  if (opts.from) qs.set('from', opts.from);
  if (opts.to) qs.set('to', opts.to);
  const query = qs.toString();
  const rows = await apiRequest<Array<Record<string, unknown>>>(`/payments${query ? `?${query}` : ''}`);
  return rows.map(mapPayment).filter(isRealPayment);
}

export type PaymentsPage = { items: Payment[]; cursor: string | null; total?: number };

export async function fetchPaymentsPage(opts: {
  month: string;
  q?: string;
  status?: string;
  method?: string;
  cursor?: string | null;
  limit?: number;
}): Promise<PaymentsPage> {
  const qs = new URLSearchParams({ month: opts.month, page: '1', limit: String(opts.limit || 20) });
  if (opts.q?.trim()) qs.set('q', opts.q.trim());
  if (opts.status && opts.status !== 'ALL') qs.set('status', opts.status);
  if (opts.method && opts.method !== 'ALL') qs.set('method', opts.method);
  if (opts.cursor) qs.set('cursor', opts.cursor);
  const raw = await apiRequest<{ items?: Array<Record<string, unknown>>; cursor?: string | null; total?: number }>(`/payments?${qs.toString()}`);
  return {
    items: (raw.items || []).map(mapPayment).filter(isRealPayment),
    cursor: raw.cursor || null,
    total: raw.total,
  };
}

export type PaymentSummary = { count: number; revenue: number; today: number; paid: number; pending: number; failed: number };

export async function fetchPaymentSummary(month: string): Promise<PaymentSummary> {
  return apiRequest<PaymentSummary>(`/payments?month=${encodeURIComponent(month)}&summary=1`);
}

export async function fetchMemberPayments(memberId: string): Promise<Payment[]> {
  const rows = await apiRequest<Array<Record<string, unknown>>>(`/payments?memberId=${encodeURIComponent(memberId)}`);
  return rows.map(mapPayment).filter(isRealPayment);
}

export async function fetchPaymentById(id: string): Promise<Payment | null> {
  try {
    const row = await apiRequest<Record<string, unknown>>(`/payments/${encodeURIComponent(id)}`);
    return row ? mapPayment(row) : null;
  } catch {
    return null;
  }
}

export async function recordPayment(input: {
  memberId: string;
  planId: string;
  planName?: string;
  amount: number;
  method: 'CASH' | 'UPI' | 'ONLINE';
  durationDays?: number;
  renewDate?: string;
  phone?: string;
  email?: string;
}): Promise<Payment> {
  if (input.method === 'ONLINE') {
    const row = await apiRequest<Record<string, unknown>>('/payments', {
      method: 'POST',
      body: JSON.stringify({
        memberId: input.memberId,
        planId: input.planId,
        planName: input.planName,
        amount: input.amount,
        durationDays: input.durationDays ?? 30,
        phone: input.phone,
        email: input.email,
      }),
    });
    return mapPayment(row);
  }
  await apiRequest(`/members/${encodeURIComponent(input.memberId)}`, {
    method: 'PUT',
    body: JSON.stringify({
      phone: input.phone,
      email: input.email,
      planId: input.planId,
      planName: input.planName,
      amount: input.amount,
      durationDays: input.durationDays,
      paymentMethod: input.method,
      renewDate: input.renewDate,
      deviceEnd: input.renewDate,
      renewDateSource: 'manual',
    }),
  });
  const rows = await fetchMemberPayments(input.memberId);
  return rows[0] || {
    id: new Date().toISOString(),
    memberId: input.memberId,
    planId: input.planId,
    amount: input.amount,
    date: todayISO(),
    method: input.method,
    status: 'PAID',
    renewDate: input.renewDate,
  };
}

function mapExpense(row: Record<string, unknown>): Expense {
  return {
    id: String(row.id || row.expenseId || ''),
    title: String(row.title || ''),
    category: (row.category as Expense['category']) || 'Other',
    amount: Number(row.amount || 0),
    date: String(row.date || '').slice(0, 10),
    method: (String(row.method || 'CASH').toUpperCase() as Expense['method']),
    notes: row.notes ? String(row.notes) : '',
    createdAt: row.createdAt ? String(row.createdAt) : undefined,
    updatedAt: row.updatedAt ? String(row.updatedAt) : undefined,
  };
}

export async function fetchExpenses(): Promise<Expense[]> {
  const rows = await apiRequest<Array<Record<string, unknown>>>('/expenses');
  return (Array.isArray(rows) ? rows : []).map(mapExpense);
}

export async function saveExpense(row: Partial<Expense> & { title: string; amount: number }): Promise<Expense> {
  const path = row.id ? `/expenses/${encodeURIComponent(row.id)}` : '/expenses';
  const saved = await apiRequest<Record<string, unknown>>(path, {
    method: row.id ? 'PUT' : 'POST',
    body: JSON.stringify(row),
  });
  return mapExpense(saved);
}

export async function removeExpense(id: string): Promise<void> {
  await apiRequest(`/expenses/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function fetchMonthlyReports(): Promise<MonthlyReport[]> {
  return (await apiRequest<MonthlyReport[]>('/reports/monthly')) || [];
}

export async function saveMonthlyReport(row: MonthlyReport) {
  return apiRequest<MonthlyReport>('/reports/monthly', {
    method: 'PUT',
    body: JSON.stringify(row),
  });
}

export function mapAttendance(row: Record<string, unknown>): AttendanceRow {
  return {
    id: String(row.id || `${row.memberId || ''}-${row.timestamp || ''}`),
    memberId: row.memberId ? String(row.memberId) : undefined,
    memberName: String(row.memberName || row.name || 'Member'),
    memberCode: row.memberCode != null ? String(row.memberCode) : row.enrollid != null ? String(row.enrollid) : undefined,
    timestamp: String(row.timestamp || row.time || ''),
    type: String(row.type || 'ENTRY'),
    status: String(row.status || 'GRANTED'),
  };
}

export async function fetchAttendance(): Promise<AttendanceRow[]> {
  try {
    const rows = await apiRequest<Array<Record<string, unknown>>>('/attendance');
    return (Array.isArray(rows) ? rows : []).map(mapAttendance).filter((row) => row.timestamp);
  } catch {
    return [];
  }
}

export function memberAccessStart(member: Member) {
  return ymd(member.joinDate || member.startDate || member.membership?.startDate || member.createdAt);
}

export function attendanceBelongsToMember(row: AttendanceRow, member: Member) {
  const enroll = enrollKey(member.deviceEnrollId)
    || (/^DEV-/i.test(String(member.memberCode || '')) ? enrollKey(member.memberCode) : '');
  const ids = new Set([member.id, member.cognitoId].filter(Boolean) as string[]);
  const byId = Boolean(row.memberId && ids.has(row.memberId));
  const byEnroll = Boolean(enroll && (enrollKey(row.memberCode) === enroll || enrollKey(row.memberId) === enroll));
  if (!byId && !byEnroll) return false;
  if (byEnroll && !byId && row.memberName && !namesMatch(row.memberName, member.name)) return false;
  const start = memberAccessStart(member);
  const day = ymd(row.timestamp);
  if (start && day && day < start) return false;
  return true;
}

export function logsToAttendance(logs: DeviceLog[], members: Member[] = []): AttendanceRow[] {
  return logs.filter((log) => log.time).flatMap((log) => {
    const enroll = enrollKey(log.enrollid);
    const byName = () => {
      const name = String(log.name || '').trim().toLowerCase();
      if (!name) return undefined;
      const hits = members.filter((row) => String(row.name || '').trim().toLowerCase() === name);
      return hits.length === 1 ? hits[0] : undefined;
    };
    const member = (enroll
      ? members.find((row) => enrollKey(row.deviceEnrollId) === enroll || enrollKey(row.memberCode) === enroll)
      : undefined) || byName();
    if (!enroll && !member) return [];
    const row: AttendanceRow = {
      id: `dev-${enroll}-${log.time}`,
      memberId: member?.id || enroll,
      memberName: log.name || member?.name || `User ${enroll}`,
      memberCode: enroll || member?.deviceEnrollId || '',
      timestamp: log.time,
      type: Number(log.inout) === 1 ? 'EXIT' : 'ENTRY',
      status: 'GRANTED',
    };
    if (member && !attendanceBelongsToMember(row, member)) return [];
    return [row];
  });
}

const savedVisitDays = new Set<string>();

/** Stores each member's scan days on their cloud profile so visit counts and history survive restarts. */
export async function saveAttendanceDays(rows: AttendanceRow[], members: Member[]): Promise<Member[]> {
  const pending = new Map<string, { member: Member; days: Set<string> }>();
  for (const row of rows) {
    if (String(row.status || 'GRANTED').toUpperCase() !== 'GRANTED') continue;
    const day = ymd(row.timestamp);
    if (!day) continue;
    const member = members.find((m) => row.memberId && (m.id === row.memberId || m.cognitoId === row.memberId))
      || members.find((m) => attendanceBelongsToMember(row, m));
    if (!member || member.attendanceDays?.[day]) continue;
    const start = memberAccessStart(member);
    if (start && day < start) continue;
    const key = `${member.id}|${day}`;
    if (savedVisitDays.has(key)) continue;
    savedVisitDays.add(key);
    const entry = pending.get(member.id) || { member, days: new Set<string>() };
    entry.days.add(day);
    pending.set(member.id, entry);
  }
  const updated: Member[] = [];
  for (const { member, days } of pending.values()) {
    const id = member.cognitoId || member.id;
    try {
      const remote = await apiRequest<{ member?: Record<string, unknown> }>(`/members/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: JSON.stringify({ id, recordAttendance: true, attendanceDays: [...days] }),
      });
      updated.push(remote?.member ? mapMember(remote.member) : {
        ...member,
        attendanceDays: { ...(member.attendanceDays || {}), ...Object.fromEntries([...days].map((d) => [d, true])) },
      });
    } catch {
      for (const day of days) savedVisitDays.delete(`${member.id}|${day}`);
    }
  }
  return updated;
}

export function countMemberVisits(member: Member, rows: AttendanceRow[]): number {
  const month = todayISO().slice(0, 7);
  const start = memberAccessStart(member);
  const days = new Set<string>();
  for (const [day, present] of Object.entries(member.attendanceDays || {})) {
    if (present && day.startsWith(`${month}-`) && (!start || day >= start)) days.add(day);
  }
  for (const row of rows) {
    if (String(row.status || 'GRANTED').toUpperCase() !== 'GRANTED') continue;
    if (!attendanceBelongsToMember(row, member)) continue;
    const day = ymd(row.timestamp);
    if (day.startsWith(`${month}-`)) days.add(day);
  }
  return days.size;
}

export function attendanceFromMembers(members: Member[]): AttendanceRow[] {
  const rows: AttendanceRow[] = [];
  for (const member of members) {
    const start = memberAccessStart(member);
    const days = member.attendanceDays || {};
    const seen = new Set<string>();
    for (const [day, present] of Object.entries(days)) {
      if (!present || seen.has(day) || (start && day < start)) continue;
      seen.add(day);
      rows.push({
        id: `${member.id}-${day}`,
        memberId: member.id,
        memberName: member.name,
        memberCode: member.deviceEnrollId || member.memberCode,
        timestamp: day,
        type: 'ENTRY',
        status: 'GRANTED',
      });
    }
    const last = ymd(member.lastVisit);
    if (last && !seen.has(last) && (!start || last >= start)) {
      rows.push({
        id: `${member.id}-last-${last}`,
        memberId: member.id,
        memberName: member.name,
        memberCode: member.deviceEnrollId || member.memberCode,
        timestamp: member.lastVisit || last,
        type: 'ENTRY',
        status: 'GRANTED',
      });
    }
  }
  return rows.sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
}

export function monthExpenseTotal(month: string, expenses: Array<Pick<Expense, 'date' | 'amount'>> = []) {
  const prefix = monthPrefix(month);
  if (!prefix) return 0;
  return expenses
    .filter((row) => String(row.date || '').startsWith(prefix))
    .reduce((sum, row) => sum + Number(row.amount || 0), 0);
}

export function reportIncome(row: Pick<MonthlyReport, 'cashPayment' | 'upiPayment' | 'razorpayPayment'>) {
  return Number(row.cashPayment || 0) + Number(row.upiPayment || 0) + Number(row.razorpayPayment || 0);
}

export function reportNet(row: Pick<MonthlyReport, 'cashPayment' | 'upiPayment' | 'razorpayPayment' | 'totalExpense'>) {
  return reportIncome(row) - Number(row.totalExpense || 0);
}

export function withExpenseTotal(row: MonthlyReport, expenses?: Array<Pick<Expense, 'date' | 'amount'>> | null): MonthlyReport {
  if (expenses == null) return row;
  return { ...row, totalExpense: monthExpenseTotal(row.month, expenses) };
}

export function isActiveMember(member: Member) {
  const status = String(member.membership?.status || member.status || '').toUpperCase();
  return !['DELETED', 'HIDDEN', 'ARCHIVED'].includes(status);
}

export function isDiscontinued(member: Member) {
  if (!isActiveMember(member)) return false;
  const status = String(member.membership?.status || member.status || '').toUpperCase();
  const end = memberDue(member);
  if (['EXPIRED', 'CANCELLED', 'INACTIVE'].includes(status)) return true;
  return Boolean(end && end < todayISO());
}

export function buildMonthlySnapshot(month: string, members: Member[], payments: Payment[], attendance: AttendanceRow[], expenses: Expense[] = []): MonthlyReport {
  const active = members.filter(isActiveMember);
  const { start, end } = monthBounds(month) || { start: '', end: '' };
  const inMonth = (iso: string) => {
    const day = ymd(iso);
    return Boolean(day && day >= start && day <= end);
  };
  const paid = payments.filter((p) => String(p.status).toUpperCase() === 'PAID' && inMonth(p.date));
  return {
    month,
    totalAttendance: attendance.filter((row) => inMonth(row.timestamp)).length,
    totalMembers: active.length,
    cashPayment: paid.filter((p) => p.method === 'CASH').reduce((s, p) => s + paymentAmount(p), 0),
    upiPayment: paid.filter((p) => p.method === 'UPI').reduce((s, p) => s + paymentAmount(p), 0),
    razorpayPayment: paid.filter((p) => !['CASH', 'UPI'].includes(p.method)).reduce((s, p) => s + paymentAmount(p), 0),
    totalExpense: monthExpenseTotal(month, expenses),
    totalDiscontinued: active.filter(isDiscontinued).length,
  };
}

function enrollNumber(value?: string | number | null) {
  const n = Number(String(value ?? '').replace(/\D/g, ''));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function nextEnrollId(members: Member[], extra: Array<string | number> = []) {
  const nums = [
    ...members.map((m) => enrollNumber(m.deviceEnrollId || m.memberCode)),
    ...peekDeviceUserIds().map((id) => enrollNumber(id)),
    ...extra.map((id) => enrollNumber(id)),
  ].filter((n) => n > 0);
  return String((nums.length ? Math.max(...nums) : 0) + 1);
}

export async function resolveNextEnrollId(members: Member[]) {
  const extra: string[] = [];
  try {
    const queued = await listQueuedDeviceUsers();
    extra.push(...queued.map((row) => row.enrollid));
  } catch {
    /* queue unavailable */
  }
  try {
    const creds = await loadDeviceCreds();
    const probe = await probeHost(creds.host);
    if (probe.ok) {
      await loginDevice(creds.host, creds.username, creds.password);
      const users = await fetchDeviceUsers(creds.host, creds.password);
      extra.push(...users.map((row) => row.id));
    }
  } catch {
    /* device offline — use cloud + last cached machine IDs */
  }
  return nextEnrollId(members, extra);
}

export function planEndDate(start: string, plan?: Plan | null) {
  return addDays(start || todayISO(), plan?.durationDays || 30);
}

export { paymentBelongsToMember };
