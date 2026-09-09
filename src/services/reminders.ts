import { daysUntil } from '@shared/access/checkAccess';
import { newId } from '@/lib/format';
import { localStore } from '@/providers/database/LocalDatabase';
import { getNotificationProvider } from '@/providers/notification';
import { listMemberRows } from '@/services/members';

function prettyDate(ymd?: string) {
  if (!ymd) return '';
  const [year, month, day] = ymd.split('-').map(Number);
  if (!year || !month || !day) return ymd;
  return new Date(year, month - 1, day).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function expiryReminderMessage(row: {
  name?: string;
  firstName?: string;
  plan?: { name?: string };
  membership?: { expiryDate?: string } | null;
  renewDate?: string | null;
  subscriptionStatus?: string;
  paymentMethod?: string;
}, gymName = 'Tekkzy Fit') {
  const brand = gymName || 'Tekkzy Fit';
  const name = (row.firstName || row.name || 'Member').trim().split(/\s+/)[0] || 'Member';
  const plan = row.plan?.name || 'membership';
  const end = prettyDate(row.membership?.expiryDate || row.renewDate || '');
  const sub = String(row.subscriptionStatus || row.paymentMethod || '').toUpperCase();
  const open = `Dear ${name}, greetings from ${brand}. Your ${plan} membership expires on ${end}.`;
  if (sub === 'ACTIVE') {
    return `${open} Please maintain sufficient balance in your bank account so the auto-payment is processed smoothly. Thank you, ${brand}.`;
  }
  if (sub === 'PAUSED') {
    return `${open} Please unpause your subscription at the earliest to continue training without interruption. Thank you, ${brand}.`;
  }
  if (sub === 'CANCELLED') {
    return `${open} Kindly complete payment in advance for a smooth continuation of your membership. Thank you, ${brand}.`;
  }
  if (sub === 'OFFLINE' || sub === 'CASH') {
    return `${open} Please renew at the reception desk to continue uninterrupted access. Thank you, ${brand}.`;
  }
  return `${open} Kindly complete payment at the earliest to continue your membership without interruption. Thank you, ${brand}.`;
}

export async function runExpiryReminders(): Promise<number> {
  const settings = await localStore.getSettings();
  const existing = await localStore.allNotifications();
  const members = await listMemberRows();
  let created = 0;
  const today = new Date().toISOString().slice(0, 10);
  const days = settings?.reminderDays?.length ? settings.reminderDays : [7, 3, 2, 1, 0];

  for (const row of members) {
    if (!row.membership) continue;
    const left = daysUntil(row.membership.expiryDate);
    if (!days.includes(left)) continue;
    const type = left < 0 ? 'MEMBERSHIP_EXPIRED' : 'MEMBERSHIP_EXPIRING';
    const already = existing.some(
      (n) => n.memberId === row.id && n.type === type && n.createdAt.slice(0, 10) === today,
    );
    if (already) continue;
    const title =
      left < 0
        ? `Membership expired — ${row.name}`
        : left === 0
          ? `Membership expires today — ${row.name}`
          : `Membership expires in ${left} day${left === 1 ? '' : 's'} — ${row.name}`;
    const message = left === 2
      ? expiryReminderMessage(row, settings?.gymName || settings?.legalName || 'Tekkzy Fit')
      : left < 0
        ? `${row.name} is blocked at the gate until renewal.`
        : `Ask ${row.name} to renew the ${row.plan?.name ?? 'plan'} before ${row.membership.expiryDate}.`;
    await localStore.putNotification({
      id: newId('ntf'),
      type,
      title,
      message,
      channel: 'WHATSAPP',
      read: false,
      memberId: row.id,
      createdAt: new Date().toISOString(),
    });
    if (left === 2 && row.phone) {
      await getNotificationProvider().send({
        to: row.phone,
        title,
        message,
        channel: 'WHATSAPP',
      });
    }
    created += 1;
  }
  return created;
}
