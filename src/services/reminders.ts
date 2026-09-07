import { daysUntil } from '@shared/access/checkAccess';
import { newId } from '@/lib/format';
import { localStore } from '@/providers/database/LocalDatabase';
import { getNotificationProvider } from '@/providers/notification';
import { listMemberRows } from '@/services/members';

export async function runExpiryReminders(): Promise<number> {
  const settings = await localStore.getSettings();
  const existing = await localStore.allNotifications();
  const members = await listMemberRows();
  let created = 0;
  const today = new Date().toISOString().slice(0, 10);

  for (const row of members) {
    if (!row.membership) continue;
    const left = daysUntil(row.membership.expiryDate);
    if (!settings.reminderDays.includes(left)) continue;
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
    const message =
      left < 0
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
    await getNotificationProvider().send({
      to: row.phone,
      title,
      message,
      channel: 'WHATSAPP',
    });
    created += 1;
  }
  return created;
}
