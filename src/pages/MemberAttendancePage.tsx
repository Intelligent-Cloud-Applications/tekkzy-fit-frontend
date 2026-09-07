import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button } from '@/components/Button';
import { ChartCard } from '@/components/ChartCard';
import { ErrorState } from '@/components/ErrorState';
import { LoadingState } from '@/components/LoadingState';
import { PageHeader } from '@/components/PageHeader';
import { StatCard } from '@/components/StatCard';
import { StatusBadge } from '@/components/StatusBadge';
import { useMember, useMemberAttendance } from '@/hooks/useGymQueries';
import { formatDate } from '@/lib/format';

export function MemberAttendancePage() {
  const { memberId = '' } = useParams();
  const member = useMember(memberId);
  const attendance = useMemberAttendance(memberId);

  const granted = useMemo(
    () => (attendance.data ?? []).filter((r) => r.status === 'GRANTED'),
    [attendance.data],
  );

  const calendar = useMemo(() => {
    const days: { date: string; count: number }[] = [];
    for (let i = 34; i >= 0; i -= 1) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      days.push({
        date: key,
        count: granted.filter((r) => r.timestamp.slice(0, 10) === key).length,
      });
    }
    return days;
  }, [granted]);

  if (member.isLoading || attendance.isLoading) return <LoadingState />;
  if (!member.data) return <ErrorState message="Member not found." />;

  const first = granted.at(-1);
  const last = granted[0];
  const weeks = 8;
  const avg = granted.length / weeks;

  return (
    <div className="flex w-full flex-col lg:min-h-full lg:flex-1">
      <PageHeader
        title={member.data.name}
        description={member.data.memberCode}
        actions={
          <Link to={`/members/${member.data.id}`}>
            <Button variant="secondary">Member profile</Button>
          </Link>
        }
      />
      <div className="mb-3 grid w-full grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Total visits" value={granted.length} />
        <StatCard label="Avg visits / week" value={avg.toFixed(1)} />
        <StatCard label="Last visit" value={formatDate(last?.timestamp)} />
        <StatCard label="First visit" value={formatDate(first?.timestamp)} />
      </div>
      <ChartCard title="Last 35 days">
        <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
          {calendar.map((day) => (
            <div
              key={day.date}
              title={`${day.date}: ${day.count}`}
              className="flex aspect-[1.6] items-center justify-center rounded-lg border border-line text-center text-[11px] sm:aspect-[2] lg:text-[12px]"
              style={{ background: day.count ? `rgba(225,6,0,${Math.min(0.14 + day.count * 0.18, 0.75)})` : 'var(--input-bg)' }}
            >
              {day.date.slice(8)}
            </div>
          ))}
        </div>
      </ChartCard>
      <div className="mt-3 space-y-1">
        {(attendance.data ?? []).slice(0, 20).map((row) => (
          <div key={row.id} className="surface flex items-center justify-between px-4 py-2.5 text-[13px]">
            <span>{formatDate(row.timestamp)} · {row.deviceName}</span>
            <StatusBadge value={row.status} />
          </div>
        ))}
      </div>
    </div>
  );
}
