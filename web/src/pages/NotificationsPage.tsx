import { Button } from '@/components/Button';
import { LoadingState } from '@/components/LoadingState';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { useGymMutation, useNotifications } from '@/hooks/useGymQueries';
import { formatDateTime } from '@/lib/format';
import { localStore } from '@/providers/database/LocalDatabase';
import { getNotificationProvider } from '@/providers/notification';
import { useUiStore } from '@/store/uiStore';

export function NotificationsPage() {
  const notes = useNotifications();
  const toast = useUiStore((s) => s.pushToast);
  const mark = useGymMutation(async (id: string) => {
    const all = await localStore.allNotifications();
    const row = all.find((n) => n.id === id);
    if (row) await localStore.putNotification({ ...row, read: true });
  });

  if (!notes.data) return <LoadingState />;

  return (
    <div className="flex flex-col lg:min-h-full lg:flex-1">
      <PageHeader
        title="Alerts"
        description="Reminders and messages sent to members."
      />
      <div className="space-y-2.5">
        {notes.data.map((n) => (
          <div key={n.id} className="surface p-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[15px] font-semibold leading-snug">{n.title}</div>
                <div className="mt-0.5 text-[11px] text-ink-soft">
                  {n.channel} · {formatDateTime(n.createdAt)}
                </div>
              </div>
              {!n.read ? <StatusBadge value="PENDING" /> : null}
            </div>
            <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">{n.message}</p>
            <div className="mt-3 flex gap-2">
              {!n.read ? (
                <Button variant="ghost" className="flex-1" onClick={() => mark.mutate(n.id)}>Mark read</Button>
              ) : null}
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() =>
                  getNotificationProvider()
                    .send({ to: 'member', title: n.title, message: n.message, channel: n.channel })
                    .then((r) => toast({ kind: 'info', title: 'Channel mock', message: r.detail }))
                }
              >
                Resend
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
