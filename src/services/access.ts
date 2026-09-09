import { checkAccess, reasonLabel } from '@shared/access/checkAccess';
import type {
  AccessCheckResult,
  AccessEvent,
  AttendanceRecord,
  FaceScanResult,
} from '@shared/types';
import { deviceLogStamp, enrollKey, istYmd, newId } from '@/lib/format';
import { getDeviceProvider, mockDeviceProvider } from '@/providers/device';
import { localStore } from '@/providers/database/LocalDatabase';
import { enqueueSync } from '@/services/sync';
import { currentMembership } from '@/services/memberships';
import { queueMemberAttendanceDay } from '@/services/memberAttendance';

export interface AccessOutcome {
  result: AccessCheckResult;
  event: AccessEvent;
  attendance: AttendanceRecord;
  gateState: 'LOCKED' | 'UNLOCKED';
  message: string;
}

const lastScanAt = new Map<string, number>();

export async function handleFaceRecognition(
  face: FaceScanResult,
  options?: { at?: string; replay?: boolean },
): Promise<AccessOutcome> {
  const settings = await localStore.getSettings();
  const device = (await localStore.allDevices()).find((d) => d.id === face.deviceId);
  const deviceName = device?.name ?? 'Unknown device';

  if (!options?.replay && face.matched && face.memberId) {
    const last = lastScanAt.get(face.memberId) ?? 0;
    if (Date.now() - last < settings.duplicateScanCooldownSeconds * 1000) {
      const member = await localStore.getMember(face.memberId);
      const result: AccessCheckResult = {
        decision: 'DENIED',
        reason: 'DEVICE_ERROR',
        attendanceStatus: 'DENIED',
        member,
      };
      return persistOutcome({
        result,
        face,
        deviceName,
        extraReason: 'Duplicate scan cooldown',
        at: options?.at,
        replay: options?.replay,
      });
    }
  }

  const member = face.matched && face.memberId ? await localStore.getMember(face.memberId) : undefined;
  const membership = member ? await currentMembership(member.id) : undefined;
  const result = checkAccess({
    member,
    membership,
    allowExpired: settings.allowExpired,
    allowSuspended: settings.allowSuspended,
  });

  if (settings.unknownFacePolicy === 'ALLOW' && result.reason === 'UNKNOWN_MEMBER') {
    result.decision = 'GRANTED';
    result.reason = 'ACCESS_GRANTED';
    result.attendanceStatus = 'GRANTED';
  }

  const outcome = await persistOutcome({ result, face, deviceName, at: options?.at, replay: options?.replay });

  if (outcome.result.decision === 'GRANTED' && !options?.replay) {
    if (face.memberId) lastScanAt.set(face.memberId, Date.now());
    try {
      await getDeviceProvider().unlockGate(face.deviceId, settings.gateUnlockDurationSeconds);
      if (device) {
        await localStore.putDevice({ ...device, gateState: 'UNLOCKED' });
      }
      window.setTimeout(() => {
        void (async () => {
          await getDeviceProvider().lockGate(face.deviceId);
          const latest = await localStore.getDevice(face.deviceId);
          if (latest) await localStore.putDevice({ ...latest, gateState: 'LOCKED' });
        })();
      }, settings.gateUnlockDurationSeconds * 1000);
      outcome.gateState = 'UNLOCKED';
    } catch {
      outcome.result.decision = 'DENIED';
      outcome.result.reason = 'DEVICE_ERROR';
      outcome.message = 'Membership valid, but the gate device reported an error.';
    }
  }

  return outcome;
}

async function persistOutcome(input: {
  result: AccessCheckResult;
  face: FaceScanResult;
  deviceName: string;
  extraReason?: string;
  at?: string;
  replay?: boolean;
  enroll?: string;
  memberName?: string;
}): Promise<AccessOutcome> {
  const now = input.at || new Date().toISOString();
  const { result, face } = input;
  const member = result.member;
  const reasonText = input.extraReason ?? reasonLabel(result.reason);
  const memberName = member?.name || input.memberName || 'Unknown Person';
  const memberCode = input.enroll || enrollKey(member?.deviceEnrollId) || member?.memberCode;

  const event: AccessEvent = {
    id: newId('acc'),
    memberId: member?.id,
    memberName,
    memberCode,
    deviceId: face.deviceId,
    deviceName: input.deviceName,
    timestamp: now,
    type: 'ENTRY',
    decision: result.decision,
    reason: result.reason,
    faceResult: face.matched ? 'MATCHED' : 'UNKNOWN',
    gateAction: result.decision === 'GRANTED' ? 'UNLOCKED' : 'NONE',
    membershipStatus: result.membership?.status,
    expiryDate: result.membership?.expiryDate,
  };

  const attendance: AttendanceRecord = {
    id: newId('att'),
    memberId: member?.id,
    memberName,
    memberCode,
    deviceId: face.deviceId,
    deviceName: input.deviceName,
    timestamp: now,
    type: 'ENTRY',
    status: result.attendanceStatus,
    reason: reasonText,
    createdAt: now,
  };

  await localStore.putAccessEvent(event);
  await localStore.putAttendance(attendance);
  if (member && result.decision === 'GRANTED') {
    await localStore.putMember({ ...member, lastVisit: now, updatedAt: now });
    queueMemberAttendanceDay(member.id, istYmd(now));
  }
  if (!input.replay) {
    await enqueueSync('accessEvent', event.id, 'CREATE', event);
    await enqueueSync('attendance', attendance.id, 'CREATE', attendance);
  }

  return {
    result,
    event,
    attendance,
    gateState: result.decision === 'GRANTED' ? 'UNLOCKED' : 'LOCKED',
    message: reasonText,
  };
}

export async function ingestDeviceScan(
  log: { enrollid: string | number; name?: string; time?: string },
  _options?: { skipDuplicates?: boolean },
): Promise<AccessOutcome | null> {
  const enroll = enrollKey(String(log.enrollid));
  const stamp = deviceLogStamp(log.time) || new Date().toISOString();
  const members = await localStore.allMembers();
  let member = members.find((m) =>
    enrollKey(m.deviceEnrollId) === enroll
    || (/^DEV-/i.test(m.memberCode || '') && enrollKey(m.memberCode) === enroll),
  );
  if (member && enroll && enrollKey(member.deviceEnrollId) !== enroll) {
    member = { ...member, deviceEnrollId: String(log.enrollid), updatedAt: new Date().toISOString() };
    await localStore.putMember(member);
  }
  const existing = await localStore.allAttendance();
  if (existing.some((r) =>
    r.timestamp === stamp
    && (r.memberId === member?.id || enrollKey(r.memberCode) === enroll),
  )) {
    return null;
  }
  const outcome = await persistOutcome({
    result: {
      decision: 'GRANTED',
      reason: 'ACCESS_GRANTED',
      attendanceStatus: 'GRANTED',
      member,
    },
    face: {
      matched: Boolean(member),
      memberId: member?.id,
      deviceId: 'dev-entry-01',
      confidence: 1,
      livenessPassed: true,
    },
    deviceName: 'Entry terminal',
    extraReason: 'Device scan',
    at: stamp,
    replay: true,
    enroll,
    memberName: log.name,
  });
  return outcome;
}


/** Development helper — same production path as a real terminal event. */
export async function simulateScan(memberId: string | null, deviceId = 'dev-entry-01'): Promise<AccessOutcome> {
  const face: FaceScanResult = memberId
    ? { matched: true, memberId, confidence: 0.98, livenessPassed: true, deviceId }
    : { matched: false, deviceId };
  mockDeviceProvider.simulateFaceScan(deviceId, face);
  return handleFaceRecognition(face);
}

export async function peopleCurrentlyInside(): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  const rows = (await localStore.allAttendance()).filter(
    (r) => r.timestamp.slice(0, 10) === today && r.status === 'GRANTED' && r.memberId,
  );
  const latest = new Map<string, AttendanceRecord>();
  for (const row of rows) {
    if (!row.memberId) continue;
    const prev = latest.get(row.memberId);
    if (!prev || row.timestamp > prev.timestamp) latest.set(row.memberId, row);
  }
  return [...latest.values()].filter((r) => r.type === 'ENTRY').length;
}
