import { Link } from 'react-router-dom';
import { DashboardSkeleton } from '@/components/Skeleton';
import { RefreshButton } from '@/components/RefreshButton';
import { Alert } from '@/components/Alert';
import { Button } from '@/components/Button';
import { isSameDay, localISODate } from '@/lib/format';
import { attendanceHourBuckets, weekdayBuckets } from '@/services/attendance';
import {
  useAccessEvents,
  useAttendance,
  useDevices,
  useExpiring,
  useKpis,
  useMembers,
  usePayments,
} from '@/hooks/useGymQueries';
import { useEffect, useState } from 'react';
import { activateLiveGym } from '@/services/liveDevice';
import { getMeta } from '@/providers/database/LocalDatabase';
import { useUiStore } from '@/store/uiStore';
import { useInvalidateGym } from '@/hooks/useGymQueries';
import { HomeDashboard } from './HomeDashboard';

export function DashboardPage() {
  const toast = useUiStore((s) => s.pushToast);
  const invalidate = useInvalidateGym();
  const [dataMode, setDataMode] = useState<string>('demo');
  const [liveReady, setLiveReady] = useState(false);
  const [loadingLive, setLoadingLive] = useState(false);
  const kpis = useKpis();
  const attendance = useAttendance();
  const events = useAccessEvents();
  const expiring = useExpiring();
  const devices = useDevices();
  const members = useMembers();
  const payments = usePayments();

  useEffect(() => {
    void getMeta('dataMode').then((mode) => setDataMode(mode ?? 'demo'));
    setLiveReady(true);
  }, []);

  if (!kpis.data || !members.data || !payments.data) {
    return <DashboardSkeleton />;
  }

  const payRows = payments.data;
  const pendingLinks =
    payRows.filter((p) => p.paymentLinkUrl && p.status !== 'PAID').length +
    members.data.filter((m) => m.paymentLinkUrl && m.paymentStatus !== 'PAID' && !payRows.some((p) => p.paymentLinkUrl === m.paymentLinkUrl)).length;

  const todayRows = (attendance.data ?? []).filter((r) => isSameDay(r.timestamp));
  const hourData = attendanceHourBuckets(todayRows);
  const weekData = weekdayBuckets(attendance.data ?? []);
  const revenue = Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (13 - i));
    const key = localISODate(d);
    const total = payRows
      .filter((p) => p.status === 'PAID' && p.date.slice(0, 10) === key)
      .reduce((s, p) => s + p.amount, 0);
    return { day: `${d.getDate()}/${d.getMonth() + 1}`, amount: total };
  });

  return (
    <div className="flex w-full flex-col">
      {dataMode !== 'live' && (
        <Alert
          tone="warn"
          title="Showing demo data"
          action={
            <>
              <Button
                disabled={loadingLive}
                loading={loadingLive}
                onClick={() => {
                  setLoadingLive(true);
                  void activateLiveGym()
                    .then((r) => {
                      setDataMode('live');
                      invalidate();
                      toast({
                        kind: 'success',
                        title: 'Live terminal loaded',
                        message: `${r.users} users and ${r.logs} logs imported from the device.`,
                      });
                    })
                    .catch((e: Error) => toast({ kind: 'error', title: e.message }))
                    .finally(() => setLoadingLive(false));
                }}
              >
                {loadingLive ? 'Loading from terminal…' : liveReady ? 'Use terminal members' : 'Load members from terminal'}
              </Button>
              <Link to="/devices?tab=setup">
                <Button variant="secondary">Connect terminal</Button>
              </Link>
            </>
          }
        >
          Sample numbers so you can look around. Connect the face terminal when you want real members.
        </Alert>
      )}
      <div className="mb-3 hidden items-center justify-between lg:flex">
        <h1 className="font-display text-[1.35rem] font-bold tracking-tight">Home</h1>
        <RefreshButton size="sm" />
      </div>
      <HomeDashboard
        kpis={kpis.data}
        hourData={hourData}
        weekData={weekData}
        revenue={revenue}
        events={events.data ?? []}
        expiring={expiring.data ?? []}
        devices={devices.data ?? []}
        pendingLinks={pendingLinks}
      />
    </div>
  );
}
