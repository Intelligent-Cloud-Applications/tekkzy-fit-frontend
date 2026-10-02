import { cloudEnabled, cloudRequest } from '../../cloud/client';
import { ai806 } from './Ai806Client';
import { wifiFollowStatus } from './wifiFollow';

type CloudMember = {
  id?: string;
  cognitoId?: string;
  name?: string;
  deviceEnrollId?: string;
  memberCode?: string;
  joinDate?: string;
  deviceStart?: string;
  deviceEnd?: string;
  deviceEndPending?: boolean;
  renewDate?: string | null;
  membership?: { expiryDate?: string };
};

function deviceDay(value?: string) {
  const match = String(value || '').match(/(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '';
}

function formatDeviceEnd(day: string, _previous?: string) {
  if (!day) return '';
  const ymd = deviceDay(day) || day;
  return `${ymd} 23:59:59`;
}

function enrollOf(member: CloudMember) {
  const direct = String(member.deviceEnrollId || '').replace(/\D/g, '');
  if (direct) return String(Number(direct));
  const fromCode = String(member.memberCode || '').match(/^DEV-(\d+)$/i);
  return fromCode ? String(Number(fromCode[1])) : '';
}

function wantedEnd(member: CloudMember) {
  return deviceDay(member.renewDate || member.membership?.expiryDate || member.deviceEnd);
}

async function ack(member: CloudMember, deviceEnd: string) {
  await cloudRequest('/devices/bridge/expiry-applied', {
    method: 'POST',
    body: JSON.stringify({
      cognitoId: member.cognitoId || member.id,
      enroll: enrollOf(member),
      deviceEnd,
    }),
  }).catch(() => undefined);
}

async function tick() {
  if (!cloudEnabled()) return;
  if (!wifiFollowStatus().deviceOnline) return;

  const members = await cloudRequest<CloudMember[]>('/members').catch(() => [] as CloudMember[]);
  const pending = members.filter((row) => row.deviceEndPending && enrollOf(row) && wantedEnd(row));
  if (!pending.length) return;

  for (const member of pending) {
    const enroll = enrollOf(member);
    const want = wantedEnd(member);
    try {
      const existing = await ai806.getUserInfo(enroll);
      if (!existing?.id) continue;
      if (deviceDay(existing.endtime) === want) {
        await ack(member, want);
        continue;
      }
      const ok = await ai806.setUser({
        enrollid: enroll,
        name: existing.name || member.name || `User ${enroll}`,
        admin: existing.admin,
        department: existing.department,
        shiftid: existing.shift,
        pwd: existing.password,
        card: existing.card,
        weekzone: existing.weekzone,
        group: existing.group,
        access_times: existing.access_times,
        verifymode: existing.verifymode,
        birthday: existing.birthday,
        starttime: existing.starttime || member.deviceStart || member.joinDate || '',
        endtime: formatDeviceEnd(want, existing.endtime),
      });
      if (ok) await ack(member, want);
    } catch {
      break;
    }
  }
}

export function startExpirySync() {
  if (!cloudEnabled()) return;
  console.log('[expiry] Will copy paid end dates from the website to the terminal');
  void tick();
  setInterval(() => void tick(), 60_000);
}
