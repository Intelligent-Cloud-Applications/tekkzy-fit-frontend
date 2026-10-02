import type { AccessEvent } from '@shared/types';
import { formatTime } from '@/lib/format';
import { MemberAvatar } from './MemberAvatar';
import { StatusBadge } from './StatusBadge';

export function ActivityFeed({ events }: { events: AccessEvent[] }) {
  return (
    <ul className="divide-y divide-line">
      {events.map((event) => (
        <li key={event.id} className="flex items-center gap-2 px-3 py-2">
          <MemberAvatar name={event.memberName} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-medium">{event.memberName}</div>
            <div className="text-[11px] text-ink-soft">
              {formatTime(event.timestamp)} · {event.deviceName}
            </div>
          </div>
          <StatusBadge value={event.decision} />
        </li>
      ))}
    </ul>
  );
}
