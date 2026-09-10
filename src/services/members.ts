import { applyMembershipRules } from '@shared/access/checkAccess';
import { repairCycleEnd } from '@shared/dates';
import type { AttendanceRecord, Member, Membership, MembershipPlan } from '@shared/types';
import { deviceLogStamp, enrollKey, isSameDay, newId } from '@/lib/format';
import { deleteLiveUser, forgetLiveUser, memberFromLiveUser, peekLiveLogs, peekLiveUsers, pushLiveUser, schedulePushMissingWebsiteMembers, withTerminalPaused, type LiveLog } from '@/services/liveDevice';
import { getDeviceProvider } from '@/providers/device';
import { localStore } from '@/providers/database/LocalDatabase';
import { enqueueSync } from '@/services/sync';
import { getInstitution } from '@/config/site';
import { tryApi, apiRequest } from '@/services/api';
import { bustPaymentsCache, isPaidPayment, listPayments, paymentBelongsToMember } from '@/services/payments';
import { filterDeletedMembers, forgetDeletedMember, isDeletedMember, rememberDeletedMember } from '@/services/deletedMembers';

export type CloudMember = Member & {
  cognitoId?: string;
  paymentStatus?: string;
  renewDate?: string | null;
  renewDateSource?: string | null;
  subscriptionId?: string;
  subscriptionStatus?: string;
  paymentMethod?: string;
  durationDays?: number | null;
  paymentLinkUrl?: string;
  planId?: string;
  membership?: Membership;
};

export type SaveMemberInput = Omit<Member, 'id' | 'createdAt' | 'updatedAt' | 'name'> & {
  id?: string;
  planId?: string;
  planName?: string;
  amount?: number;
  durationDays?: number;
  sendPayLink?: boolean;
  skipPayment?: boolean;
  paymentMethod?: 'CASH' | 'ONLINE';
  startDate?: string;
  renewDate?: string | null;
  renewDateSource?: string | null;
};

export interface SaveMemberResult extends Member {
  paymentLinkUrl?: string;
  paymentStatus?: string;
  renewDate?: string | null;
  renewDateSource?: string | null;
  subscriptionStatus?: string;
  subscriptionId?: string;
  membership?: Membership;
  deviceOk?: boolean;
  deviceError?: string;
}

export interface MemberRow extends Member {
  cognitoId?: string;
  membership?: Membership;
  plan?: MembershipPlan;
  attendanceCount: number;
  todayPresence: 'PRESENT' | 'ABSENT';
  paymentLinkUrl?: string;
  paymentStatus?: string;
  renewDate?: string | null;
  subscriptionStatus?: string;
  subscriptionId?: string;
  paymentMethod?: string;
}

let membersCloudCache: CloudMember[] | null = null;
let membersCloudRefresh: Promise<CloudMember[] | null> | null = null;

export function bustMembersCache() {
  membersCloudCache = null;
}

export function memberDueDate(member?: {
  renewDate?: string | null;
  deviceEnd?: string | null;
  membership?: { expiryDate?: string } | null;
} | null): string {
  const match = String(member?.renewDate || member?.membership?.expiryDate || member?.deviceEnd || '')
    .match(/(\d{4}-\d{2}-\d{2})/);
  return match?.[1] || '';
}

function rowEnroll(row: Pick<CloudMember, 'deviceEnrollId' | 'memberCode'>) {
  const direct = enrollKey(row.deviceEnrollId);
  if (direct) return direct;
  return /^DEV-/i.test(row.memberCode || '') ? enrollKey(row.memberCode) : '';
}

function collapseMembers(rows: CloudMember[]): CloudMember[] {
  const byEnroll = new Map<string, CloudMember>();
  const leftover: CloudMember[] = [];
  for (const row of rows) {
    const enroll = rowEnroll(row);
    if (!enroll) {
      leftover.push(row);
      continue;
    }
    const prev = byEnroll.get(enroll);
    byEnroll.set(enroll, prev ? pickMember(prev, row) : row);
  }
  const byPhone = new Map<string, CloudMember>();
  const rest: CloudMember[] = [];
  for (const row of leftover) {
    const phone = realPhone(row.phone);
    if (!phone) {
      rest.push(row);
      continue;
    }
    const prev = byPhone.get(phone);
    byPhone.set(phone, prev ? pickMember(prev, row) : row);
  }
  const seen = new Set<string>();
  const unique: CloudMember[] = [];
  for (const row of rest) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    unique.push(row);
  }
  return [...byEnroll.values(), ...byPhone.values(), ...unique];
}

function mapLiteRows(rows: CloudMember[]): MemberRow[] {
  return collapseMembers(rows).map((member) => {
    const start = member.membership?.startDate || member.joinDate;
    const stored = member.renewDate || member.membership?.expiryDate;
    const cash = String(member.paymentMethod || '').toUpperCase() === 'CASH'
      || member.renewDateSource === 'manual'
      || String(member.subscriptionStatus || '').toUpperCase() === 'OFFLINE';
    const expiry = member.renewDateSource === 'razorpay'
      ? stored
      : cash
        ? stored
        : repairCycleEnd(start, stored, member.durationDays);
    const due = expiry || memberDueDate(member);
    return {
      ...member,
      renewDate: due || member.renewDate,
      membership: member.membership
        ? { ...member.membership, startDate: start || member.membership.startDate, expiryDate: due || member.membership.expiryDate }
        : due
          ? {
              id: `ms-${member.id}`,
              memberId: member.id,
              planId: member.planId || '',
              startDate: start || member.joinDate || due,
              expiryDate: due,
              price: 0,
              discount: 0,
              paymentStatus: String(member.paymentStatus || 'PENDING').toUpperCase() === 'PAID' ? 'PAID' : 'PENDING',
              autoRenewal: Boolean(member.subscriptionId),
              status: 'ACTIVE',
              accessStatus: 'ACTIVE',
              createdAt: member.createdAt || '',
              updatedAt: '',
            }
          : member.membership,
      attendanceCount: 0,
      todayPresence: 'ABSENT',
      paymentStatus: String(member.paymentStatus || '').toUpperCase() === 'PAID'
        && !member.paymentLinkUrl
        ? 'PAID'
        : (member.paymentLinkUrl ? 'PENDING' : member.paymentStatus),
    };
  });
}

async function refreshMembersCache(): Promise<CloudMember[] | null> {
  if (membersCloudRefresh) return membersCloudRefresh;
  membersCloudRefresh = tryApi<CloudMember[]>('/members')
    .then((cloudMembers) => {
      if (cloudMembers) {
        membersCloudCache = cloudMembers;
        schedulePushMissingWebsiteMembers(cloudMembers);
      }
      return cloudMembers;
    })
    .finally(() => {
      membersCloudRefresh = null;
    });
  return membersCloudRefresh;
}

export async function listCloudMembersLite(opts?: { force?: boolean }): Promise<MemberRow[]> {
  if (!opts?.force && membersCloudCache) {
    return mapLiteRows(membersCloudCache);
  }
  const cloudMembers = await refreshMembersCache();
  const rows = cloudMembers ?? membersCloudCache;
  if (rows) return mapLiteRows(rows);
  return mapLiteRows((await localStore.allMembers()) as CloudMember[]);
}

function realPhone(phone?: string) {
  const digits = (phone || '').replace(/\D/g, '');
  return digits.length >= 10 && !digits.startsWith('99') ? digits : '';
}

function pickMember(a: CloudMember, b: CloudMember): CloudMember {
  const score = (m: CloudMember) =>
    (realPhone(m.phone) ? 4 : 0)
    + (m.membership || m.paymentLinkUrl ? 2 : 0)
    + (m.lastVisit ? 1 : 0)
    + (m.memberCode?.startsWith('DEV-') ? 0 : 1)
    + (m.devicePhotoUrl ? 1 : 0);
  const keep = score(a) >= score(b) ? a : b;
  const other = keep === a ? b : a;
  return {
    ...other,
    ...keep,
    id: keep.cognitoId || other.cognitoId || keep.id,
    cognitoId: keep.cognitoId || other.cognitoId,
    deviceEnrollId: keep.deviceEnrollId || other.deviceEnrollId,
    phone: realPhone(keep.phone) ? keep.phone : other.phone,
    lastVisit: [keep.lastVisit, other.lastVisit].filter(Boolean).sort().at(-1),
    membership: keep.membership || other.membership,
    paymentStatus: [keep.paymentStatus, other.paymentStatus].find((s) => s && String(s).toUpperCase() !== 'PAID') || 'PENDING',
    paymentLinkUrl: keep.paymentLinkUrl || other.paymentLinkUrl,
  };
}

function punchedToday(
  enroll: string,
  ids: Set<string>,
  logs: LiveLog[],
  attendance: AttendanceRecord[],
): boolean {
  if (enroll) {
    for (const log of logs) {
      if (enrollKey(String(log.enrollid)) !== enroll) continue;
      const stamp = deviceLogStamp(log.time) || log.time || '';
      if (stamp && isSameDay(stamp)) return true;
    }
    for (const row of attendance) {
      if (enrollKey(row.memberCode) === enroll && isSameDay(row.timestamp)) return true;
    }
    return false;
  }
  for (const row of attendance) {
    if (row.memberId && ids.has(row.memberId) && isSameDay(row.timestamp)) return true;
  }
  return false;
}

export async function listMemberRows(opts?: { force?: boolean }): Promise<MemberRow[]> {
  let cloudMembers = membersCloudCache;
  if (opts?.force || !cloudMembers) {
    cloudMembers = await refreshMembersCache();
  }
  const [localMembers, memberships, plans, attendance, payments] = await Promise.all([
    localStore.allMembers(),
    localStore.allMemberships(),
    localStore.allPlans(),
    localStore.allAttendance(),
    listPayments({ force: opts?.force }),
  ]);
  const cloudRows = cloudMembers ?? [];
  const cloudOk = cloudMembers !== null;
  const merged: CloudMember[] = [];
  if (cloudOk) {
    for (const row of cloudRows) {
      const enroll = rowEnroll(row);
      const local = enroll
        ? localMembers.find((m) => rowEnroll(m) === enroll)
        : localMembers.find((m) => m.id === row.id || m.id === row.cognitoId || (row.cognitoId && m.id === row.cognitoId));
      merged.push({
        ...(local as CloudMember | undefined),
        ...row,
        id: row.id || local?.id || '',
        cognitoId: row.cognitoId || (local as CloudMember | undefined)?.cognitoId,
        faceRegistered: Boolean(row.faceRegistered || local?.faceRegistered),
        devicePhotoUrl: row.devicePhotoUrl || local?.devicePhotoUrl,
        deviceEnrollId: row.deviceEnrollId || local?.deviceEnrollId,
      });
    }
    void pruneLocalNotInCloud(cloudRows);
  } else {
    for (const row of localMembers) merged.push(row as CloudMember);
  }
  const collapsed = collapseMembers(merged);
  void pruneLocalTwins(collapsed);
  const idsFor = (member: CloudMember) => {
    const enroll = rowEnroll(member);
    return new Set(
      [
        member.id,
        member.cognitoId,
        ...localMembers.filter((row) =>
          row.id === member.id
          || row.id === member.cognitoId
          || (enroll && rowEnroll(row) === enroll),
        ).map((row) => row.id),
      ].filter(Boolean) as string[],
    );
  };
  const logs = peekLiveLogs();
  const visits = new Map<string, { count: number; last?: string }>();
  for (const member of collapsed) {
    const enroll = rowEnroll(member);
    const ids = idsFor(member);
    const seen = new Set<string>();
    let last = member.lastVisit;
    if (logs.length) {
      for (const log of logs) {
        const logEnroll = enrollKey(String(log.enrollid));
        const same = Boolean(enroll && logEnroll === enroll);
        if (!same) continue;
        const key = log.time || logEnroll;
        if (seen.has(key)) continue;
        seen.add(key);
        const stamp = deviceLogStamp(log.time);
        if (stamp && (!last || stamp > last)) last = stamp;
      }
    } else {
      for (const row of attendance) {
        const same = (row.memberId && ids.has(row.memberId))
          || (enroll && enrollKey(row.memberCode) === enroll);
        if (!same) continue;
        if (seen.has(row.timestamp)) continue;
        seen.add(row.timestamp);
        if (!last || row.timestamp > last) last = row.timestamp;
      }
    }
    visits.set(member.id, { count: seen.size, last });
  }
  const visible = cloudOk ? collapsed : await filterDeletedMembers(collapsed);
  schedulePushMissingWebsiteMembers(visible);
  if (!cloudOk) {
    const haveEnroll = new Set(visible.map((row) => rowEnroll(row)).filter(Boolean));
    for (const user of peekLiveUsers()) {
      const key = enrollKey(String(user.id ?? ''));
      if (!key || haveEnroll.has(key)) continue;
      if (await isDeletedMember(undefined, key)) continue;
      visible.push(memberFromLiveUser(user) as CloudMember);
      haveEnroll.add(key);
    }
  }
  return visible
    .map((member) => {
      const cloud = member as CloudMember;
      const ids = idsFor(member);
      const visit = visits.get(member.id);
      let membership = cloud.membership
        || memberships
          .filter((m) => ids.has(m.memberId))
          .map((m) => applyMembershipRules(m))
          .sort((a, b) => b.expiryDate.localeCompare(a.expiryDate))[0];
      const plan = plans.find((p) => p.id === membership?.planId || p.id === cloud.planId);
      const ownPayments = payments.filter((p) => paymentBelongsToMember(p, cloud));
      const paidReceipt = ownPayments.some(isPaidPayment);
      const awaitingLink = Boolean(cloud.paymentLinkUrl)
        || ownPayments.some((p) => p.status === 'PENDING' && p.paymentLinkUrl);
      const cashPaid = String(cloud.paymentMethod || '').toUpperCase() === 'CASH'
        && String(cloud.paymentStatus || '').toUpperCase() === 'PAID';
      const paid = (paidReceipt && !awaitingLink) || cashPaid;
      const paymentStatus = paid ? 'PAID' : 'PENDING';
      const pendingLink = ownPayments.find((p) => p.status === 'PENDING' && p.paymentLinkUrl)?.paymentLinkUrl;
      const start = membership?.startDate || cloud.joinDate;
      const stored = cloud.renewDate || membership?.expiryDate;
      const cash = String(cloud.paymentMethod || '').toUpperCase() === 'CASH'
        || ownPayments.some((p) => p.method === 'CASH')
        || cloud.renewDateSource === 'manual'
        || (!cloud.subscriptionId && cloud.renewDateSource !== 'razorpay' && paid && !pendingLink && !cloud.paymentLinkUrl);
      const expiry = cloud.renewDateSource === 'razorpay'
        ? stored
        : cash
          ? stored
          : repairCycleEnd(start, stored, plan?.durationDays || cloud.durationDays);
      if (membership) {
        membership = applyMembershipRules({
          ...membership,
          startDate: start || membership.startDate,
          expiryDate: expiry || membership.expiryDate,
          status: member.status === 'SUSPENDED' ? 'SUSPENDED' : membership.status,
        });
      } else if (expiry) {
        membership = applyMembershipRules({
          id: `ms-${member.id}`,
          memberId: member.id,
          planId: cloud.planId || '',
          startDate: start || cloud.joinDate || expiry,
          expiryDate: expiry,
          price: Number(cloud.amount || 0),
          discount: 0,
          paymentStatus,
          autoRenewal: Boolean(cloud.subscriptionId),
          status: member.status === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE',
          accessStatus: 'ACTIVE',
          createdAt: member.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
      if (membership && paymentStatus === 'PAID') {
        membership = {
          ...membership,
          paymentStatus: 'PAID',
          accessStatus: membership.status === 'EXPIRED' || membership.status === 'SUSPENDED' ? 'DENIED' : 'ACTIVE',
        };
      } else if (membership && paymentStatus === 'PENDING') {
        membership = { ...membership, paymentStatus: 'PENDING' };
      }
      const rawSub = String(cloud.subscriptionStatus || '').toUpperCase();
      const subscriptionStatus = (['ACTIVE', 'PAUSED', 'CANCELLED', 'PENDING'].includes(rawSub)
        ? rawSub
        : cash
          ? 'OFFLINE'
          : rawSub) || undefined;
      return {
        ...member,
        lastVisit: visit?.last || member.lastVisit,
        renewDate: expiry || cloud.renewDate,
        membership,
        plan,
        attendanceCount: visit?.count ?? 0,
        todayPresence: (punchedToday(rowEnroll(member), ids, logs, attendance) ? 'PRESENT' : 'ABSENT') as MemberRow['todayPresence'],
        paymentStatus,
        paymentLinkUrl: paid ? '' : pendingLink || cloud.paymentLinkUrl || member.paymentLinkUrl,
        subscriptionStatus,
        paymentMethod: cloud.paymentMethod,
      };
    })
    .sort((a, b) => (b.createdAt || b.joinDate || '').localeCompare(a.createdAt || a.joinDate || ''));
}

export async function getMemberRow(id: string): Promise<MemberRow | undefined> {
  const rows = await listMemberRows();
  return rows.find((r) => r.id === id);
}

async function pruneLocalNotInCloud(cloud: CloudMember[]) {
  const keepIds = new Set(
    cloud.flatMap((row) => [row.id, row.cognitoId].filter(Boolean) as string[]),
  );
  const keepEnroll = new Set(cloud.map((row) => rowEnroll(row)).filter(Boolean));
  const local = await localStore.allMembers();
  await Promise.all(
    local
      .filter((row) => {
        if (keepIds.has(row.id)) return false;
        const enroll = rowEnroll(row);
        return !(enroll && keepEnroll.has(enroll));
      })
      .map((row) => localStore.deleteMember(row.id)),
  );
}

async function pruneLocalTwins(kept: CloudMember[]) {
  const local = await localStore.allMembers();
  const keepIds = new Set(kept.map((row) => row.id));
  const keepEnroll = new Map<string, string>();
  for (const row of kept) {
    const enroll = rowEnroll(row);
    if (enroll) keepEnroll.set(enroll, row.id);
  }
  await Promise.all(
    local
      .filter((row) => {
        const enroll = rowEnroll(row);
        const keeper = enroll ? keepEnroll.get(enroll) : undefined;
        if (!keeper || row.id === keeper || keepIds.has(row.id)) return false;
        if (realPhone(row.phone)) return false;
        return /^dev-/i.test(row.id);
      })
      .map((row) => localStore.deleteMember(row.id)),
  );
}

export function findRelatedMember<T extends { id: string; cognitoId?: string; deviceEnrollId?: string; memberCode?: string }>(
  members: T[],
  hint: { memberId?: string; memberCode?: string },
): T | undefined {
  const id = hint.memberId || '';
  const code = enrollKey(hint.memberCode || hint.memberId || '');
  return members.find((member) =>
    (id && (member.id === id || member.cognitoId === id))
    || (code && matchesEnroll({ deviceEnrollId: member.deviceEnrollId, memberCode: member.memberCode || '' }, code)),
  );
}

export function matchesEnroll(member: Pick<Member, 'deviceEnrollId' | 'memberCode'>, enroll: string) {
  const e = enrollKey(enroll);
  if (!e) return false;
  if (enrollKey(member.deviceEnrollId) === e) return true;
  return /^DEV-/i.test(member.memberCode || '') && enrollKey(member.memberCode) === e;
}

export async function findMemberByEnroll(enroll: string): Promise<Member | undefined> {
  if (!enroll.trim()) return undefined;
  return (await localStore.allMembers()).find((m) => matchesEnroll(m, enroll));
}

export async function saveMember(input: SaveMemberInput): Promise<SaveMemberResult> {
  const now = new Date().toISOString();
  const isEdit = Boolean(input.id);
  const enroll = input.deviceEnrollId?.trim() ?? '';
  const existing = isEdit
    ? (await localStore.getMember(input.id as string))
      || membersCloudCache?.find((row) => row.id === input.id || row.cognitoId === input.id)
    : undefined;
  const plans = await localStore.allPlans();
  const plan = plans.find((p) => p.id === input.planId);
  const payload = {
    ...input,
    id: isEdit ? existing?.id ?? input.id : undefined,
    planName: input.planName || plan?.name,
    amount: input.amount ?? plan?.price,
    durationDays: input.durationDays ?? plan?.durationDays,
    sendPayLink: input.sendPayLink ?? (!isEdit && input.paymentMethod !== 'CASH'),
    skipPayment: input.skipPayment ?? input.paymentMethod === 'CASH',
    paymentMethod: input.paymentMethod,
    institution: getInstitution(),
  };

  bustMembersCache();
  bustPaymentsCache();
  await forgetDeletedMember(existing?.id ?? input.id, enroll);

  const displayName = `${input.firstName} ${input.lastName}`.trim() || existing?.name || `Member ${enroll}`;
  const pushDevice = () => (enroll
    ? pushLiveUser({
        enrollid: enroll,
        name: displayName,
        department: input.department,
        shiftid: input.deviceShift,
        admin: input.devicePrivilege,
        pwd: input.devicePwd,
        card: input.deviceCard,
        weekzone: input.deviceWeekzone,
        group: input.deviceGroup,
        access_times: input.deviceAccessTimes,
        verifymode: input.deviceVerifyMode,
        birthday: input.dateOfBirth,
        starttime: input.deviceStart || input.joinDate || input.startDate,
        endtime: input.deviceEnd || '',
      }).then((sent) => ({
        ok: Boolean(sent.ok),
        error: sent.ok ? undefined : 'Terminal rejected the user.',
      })).catch((err) => ({
        ok: false,
        error: err instanceof Error ? err.message : 'Terminal is offline.',
      }))
    : Promise.resolve({ ok: true, error: undefined as string | undefined }));

  let remote: { member: SaveMemberResult; payment?: { paymentLinkUrl?: string } } | SaveMemberResult;
  if (isEdit) {
    const cloudId = (existing as CloudMember | undefined)?.cognitoId || existing?.id || input.id;
    remote = await apiRequest(`/members/${cloudId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  } else {
    remote = await apiRequest('/members', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }
  const cloudMember = remote && 'member' in remote ? remote.member : remote;
  const paymentLinkUrl = (remote && 'payment' in remote ? remote.payment?.paymentLinkUrl : undefined)
    || cloudMember?.paymentLinkUrl;
  const device = isEdit
    ? { ok: true, error: undefined as string | undefined }
    : await withTerminalPaused(pushDevice);
  if (isEdit && enroll) void pushDevice();

  const member: SaveMemberResult = {
    ...existing,
    ...input,
    ...(cloudMember || {}),
    id: cloudMember?.id ?? existing?.id ?? input.id ?? newId('mem'),
    memberCode: cloudMember?.memberCode ?? existing?.memberCode ?? input.memberCode,
    name: cloudMember?.name || displayName,
    createdAt: cloudMember?.createdAt ?? existing?.createdAt ?? now,
    updatedAt: now,
    faceRegistered: input.faceRegistered ?? existing?.faceRegistered ?? false,
    status: input.status,
    renewDate: input.renewDate || input.deviceEnd || cloudMember?.renewDate || existing?.renewDate,
    deviceEnd: input.deviceEnd || cloudMember?.deviceEnd || existing?.deviceEnd,
    renewDateSource: input.renewDateSource || (cloudMember as CloudMember | undefined)?.renewDateSource,
    membership: cloudMember?.membership
      ? {
          ...cloudMember.membership,
          expiryDate: input.deviceEnd || input.renewDate || cloudMember.membership.expiryDate,
        }
      : (existing as CloudMember | undefined)?.membership,
    paymentLinkUrl,
    deviceOk: device.ok,
    deviceError: device.error,
  };

  await localStore.putMember(member);
  if (isEdit && enroll) {
    const twins = (await localStore.allMembers()).filter((m) => m.id !== member.id && matchesEnroll(m, enroll));
    await Promise.all(twins.map((twin) => localStore.deleteMember(twin.id)));
  }
  membersCloudCache = [
    member as CloudMember,
    ...(membersCloudCache || []).filter((row) => row.id !== member.id && row.cognitoId !== member.id),
  ];
  await enqueueSync('member', member.id, isEdit ? 'UPDATE' : 'CREATE', member);
  return member;
}

function resolveEnrollId(member: Member): string {
  const direct = member.deviceEnrollId?.trim();
  if (direct) return direct;
  const fromCode = member.memberCode?.match(/^DEV-(\d+)$/i);
  return fromCode?.[1] ?? '';
}

export type RemoveMemberInput = {
  id: string;
  deviceEnrollId?: string;
  memberCode?: string;
  cognitoId?: string;
};

export async function removeMember(
  input: string | RemoveMemberInput,
): Promise<{ removedFromDevice: boolean }> {
  const hint = typeof input === 'string' ? { id: input } : input;
  const id = hint.id;
  const local = await localStore.getMember(id);
  const cached = membersCloudCache?.find((row) =>
    row.id === id || row.cognitoId === id || (hint.cognitoId && (row.id === hint.cognitoId || row.cognitoId === hint.cognitoId)),
  );
  const fromStore = local || cached || (await localStore.allMembers()).find((row) =>
    row.id === id
    || (hint.deviceEnrollId && matchesEnroll(row, hint.deviceEnrollId))
    || (hint.memberCode && matchesEnroll(row, hint.memberCode)),
  );
  const member = fromStore || (hint.deviceEnrollId || hint.memberCode
    ? { id, deviceEnrollId: hint.deviceEnrollId, memberCode: hint.memberCode || '' } as Member
    : undefined);
  const enroll = resolveEnrollId({
    deviceEnrollId: member?.deviceEnrollId || hint.deviceEnrollId,
    memberCode: member?.memberCode || hint.memberCode || '',
  } as Member);
  const cloudIds = [...new Set(
    [id, hint.cognitoId, cached?.id, cached?.cognitoId, local?.id, fromStore?.id].filter(Boolean) as string[],
  )];

  if (enroll) {
    await withTerminalPaused(async () => {
      await deleteLiveUser(enroll);
      forgetLiveUser(enroll);
    });
  }

  let cloudError: unknown;
  let cloudDeleted = false;
  for (const cloudId of cloudIds) {
    try {
      const q = enroll ? `?enroll=${encodeURIComponent(enroll)}` : '';
      await apiRequest(`/members/${encodeURIComponent(cloudId)}${q}`, { method: 'DELETE' });
      cloudDeleted = true;
    } catch (err) {
      cloudError = err;
    }
  }
  if (!cloudDeleted && cloudIds.length && cloudError) {
    throw cloudError instanceof Error ? cloudError : new Error('Delete failed');
  }

  if (membersCloudCache) {
    membersCloudCache = membersCloudCache.filter((row) =>
      !cloudIds.includes(row.id)
      && !cloudIds.includes(row.cognitoId || '')
      && !(enroll && rowEnroll(row) === enroll),
    );
  }
  bustPaymentsCache();

  await rememberDeletedMember(id, enroll);
  for (const cloudId of cloudIds) {
    if (cloudId !== id) await rememberDeletedMember(cloudId, enroll);
  }

  const leftover = await localStore.allMembers();
  await Promise.all(
    leftover
      .filter((row) => cloudIds.includes(row.id) || (enroll && matchesEnroll(row, enroll)))
      .map((row) => localStore.deleteMember(row.id)),
  );
  await enqueueSync('member', id, 'DELETE', { id });
  try {
    await getDeviceProvider().removeMember(id);
  } catch {
    /* mock/smart optional */
  }
  return { removedFromDevice: true };
}

export async function setMemberStatus(id: string, status: Member['status']): Promise<SaveMemberResult> {
  const local = await localStore.getMember(id);
  const cached = membersCloudCache?.find((row) => row.id === id || row.cognitoId === id);
  const existing = (local || cached) as CloudMember | undefined;
  if (!existing) throw new Error('Member not found');
  const cloudId = existing.cognitoId || existing.id;
  const action = status === 'SUSPENDED' ? 'pause' : 'resume';
  bustMembersCache();
  const remote = await apiRequest<{ member?: SaveMemberResult } | SaveMemberResult>(`/members/${cloudId}`, {
    method: 'PUT',
    body: JSON.stringify({
      id: cloudId,
      status,
      subscriptionAction: action,
    }),
  });
  const cloudMember = (remote && typeof remote === 'object' && 'member' in remote
    ? remote.member
    : remote) as SaveMemberResult | undefined;
  const next: SaveMemberResult = {
    ...existing,
    ...cloudMember,
    id: cloudMember?.id ?? existing.id,
    status: cloudMember?.status || status,
    updatedAt: new Date().toISOString(),
  };
  await localStore.putMember(next);
  membersCloudCache = [
    next as CloudMember,
    ...(membersCloudCache || []).filter((row) => row.id !== next.id && row.cognitoId !== next.id),
  ];
  await enqueueSync('member', next.id, 'UPDATE', next);
  return next;
}

export async function registerMemberFace(memberId: string, deviceId: string): Promise<Member> {
  const member = await localStore.getMember(memberId);
  if (!member) throw new Error('Member not found');
  const result = await getDeviceProvider().registerFace({ memberId, deviceId });
  if (!result.success) throw new Error(result.message);
  const next: Member = {
    ...member,
    faceRegistered: true,
    faceDeviceId: deviceId,
    updatedAt: new Date().toISOString(),
  };
  await localStore.putMember(next);
  await enqueueSync('member', memberId, 'UPDATE', next);
  return next;
}
