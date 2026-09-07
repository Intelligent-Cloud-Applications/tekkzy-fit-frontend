import { Link } from 'react-router-dom';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  CalendarCheck,
  Crown,
  DoorOpen,
  Flame,
  Plus,
  Users,
  Wallet,
} from 'lucide-react';
import { MemberAvatar } from '@/components/MemberAvatar';
import { StatusBadge } from '@/components/StatusBadge';
import { useChartTheme } from '@/hooks/useChartTheme';
import { formatDate, formatINR, formatRelative, formatTime } from '@/lib/format';
import type { AccessEvent, DashboardKpis, Device } from '@shared/types';

export type ExpiringRow = {
  membership: { id: string; expiryDate: string; paymentStatus: string };
  member?: { id: string; name: string };
  plan?: { name: string };
  daysLeft: number;
};

export function HomeDashboard(props: {
  kpis: DashboardKpis;
  hourData: { hour: string; count: number }[];
  weekData: { day: string; count: number }[];
  revenue: { day: string; amount: number }[];
  events: AccessEvent[];
  expiring: ExpiringRow[];
  devices: Device[];
  pendingLinks: number;
}) {
  return (
    <>
      <div className="lg:hidden">
        <MobileHome {...props} />
      </div>
      <div className="hidden lg:block">
        <DesktopHome {...props} />
      </div>
    </>
  );
}

type HomeProps = Parameters<typeof HomeDashboard>[0];

function DesktopHome({
  kpis,
  hourData,
  weekData,
  revenue,
  events,
  expiring,
  devices,
  pendingLinks,
}: HomeProps) {
  const chart = useChartTheme();
  const weekVisits = weekData.reduce((sum, day) => sum + day.count, 0);
  const periodRevenue = revenue.reduce((sum, day) => sum + day.amount, 0);
  const showPeriodRevenue = kpis.todayRevenue === 0 && periodRevenue > 0;
  const goal = Math.max(20, kpis.todayAttendance, ...weekData.map((d) => d.count));
  const attendPct = Math.min(100, Math.round((kpis.todayAttendance / goal) * 100));
  const activePct = kpis.totalMembers
    ? Math.round((kpis.activeMembers / kpis.totalMembers) * 100)
    : 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-2.5">
        <div className="surface flex items-center justify-between px-4 py-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft">Today's attendance</div>
            <div className="mt-1 flex items-end gap-2">
              <span className="font-display text-[1.75rem] font-bold leading-none">{kpis.todayAttendance}</span>
              <span className="pb-0.5 text-[11px] text-ink-soft">
                {weekVisits ? `${weekVisits} this week` : 'Granted visits today'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Sparkline values={hourData.map((h) => h.count)} />
            <ProgressRing value={attendPct} compact />
          </div>
        </div>
        <Link to="/members" className="tile-accent tap flex items-center justify-between rounded-2xl px-4 py-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-white/70">Active members</div>
            <div className="mt-1 font-display text-[1.75rem] font-bold leading-none">{kpis.activeMembers}</div>
            <div className="mt-1 text-[11px] text-white/70">{activePct}% of {kpis.totalMembers}</div>
          </div>
          <Users className="h-5 w-5 text-white/80" />
        </Link>
        <div className="surface flex items-center justify-between px-4 py-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft">
              {showPeriodRevenue ? 'Revenue (14 days)' : "Today's revenue"}
            </div>
            <div className="mt-1 font-display text-[1.55rem] font-bold leading-none">
              {formatINR(showPeriodRevenue ? periodRevenue : kpis.todayRevenue)}
            </div>
            <div className="mt-1 text-[11px] text-ink-soft">
              {showPeriodRevenue ? `Today ${formatINR(0)} · ` : ''}
              {pendingLinks} unpaid links
            </div>
          </div>
          <MiniBars values={revenue.slice(-7).map((d) => d.amount)} labels={revenue.slice(-7).map((d) => d.day)} />
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2.5">
        <MiniStat to="/members" label="Members" value={kpis.totalMembers} />
        <MiniStat to="/memberships" label="Expired" value={kpis.expired} />
        <MiniStat to="/access" label="Denied" value={kpis.accessDeniedToday} />
        <MiniStat to="/memberships" label="Expiring" value={kpis.expiringSoon || expiring.length} />
      </div>
      <div className="flex gap-2">
        <QuickPill to="/members?new=1" label="Add member" icon={Plus} primary />
        <QuickPill to="/access" label="Access" icon={DoorOpen} />
        <QuickPill to="/payments" label="Pay" icon={Wallet} />
        <QuickPill to="/attendance" label="Visits" icon={CalendarCheck} />
      </div>

      <div className="grid grid-cols-3 gap-2.5">
        <CompactChart title="Attendance today">
          <div className="h-40">
            <ResponsiveContainer>
              <AreaChart data={hourData}>
                <CartesianGrid stroke={chart.grid} vertical={false} />
                <XAxis dataKey="hour" tick={{ fontSize: 10, fill: chart.tick }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: chart.tick }} width={24} />
                <Tooltip contentStyle={chart.tooltip} />
                <Area type="monotone" dataKey="count" stroke={chart.accent} fill={chart.fill} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CompactChart>
        <CompactChart title="Weekly attendance">
          <div className="h-40">
            <ResponsiveContainer>
              <BarChart data={weekData} barCategoryGap="28%">
                <CartesianGrid stroke={chart.grid} vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: chart.tick }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: chart.tick }} width={24} />
                <Tooltip contentStyle={chart.tooltip} />
                <Bar dataKey="count" fill={chart.accent} maxBarSize={18} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CompactChart>
        <CompactChart title="Revenue (14 days)">
          <div className="h-40">
            <ResponsiveContainer>
              <BarChart data={revenue} barCategoryGap="24%">
                <CartesianGrid stroke={chart.grid} vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: chart.tick }} />
                <YAxis tick={{ fontSize: 10, fill: chart.tick }} width={32} />
                <Tooltip formatter={(v) => formatINR(Number(v))} contentStyle={chart.tooltip} />
                <Bar dataKey="amount" fill={chart.accent} maxBarSize={14} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CompactChart>
      </div>

      <div className="grid grid-cols-3 gap-2.5">
        <ListCard title="Recent access" to="/access">
          {events.length === 0 ? (
            <Empty>No door activity yet today.</Empty>
          ) : (
            events.slice(0, 5).map((event) => (
              <li key={event.id} className="flex items-center gap-2.5 border-t border-line/60 px-3.5 py-2">
                <MemberAvatar name={event.memberName} size={32} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-semibold">{event.memberName}</div>
                  <div className="text-[11px] text-ink-soft">{formatTime(event.timestamp)} · {event.type}</div>
                </div>
                <StatusBadge value={event.decision} />
              </li>
            ))
          )}
        </ListCard>
        <ListCard title="Expiring this week" to="/memberships">
          {expiring.length === 0 ? (
            <Empty>No memberships expire in the next 7 days.</Empty>
          ) : (
            expiring.slice(0, 5).map((row) => (
              <li key={row.membership.id} className="flex items-center justify-between gap-2.5 border-t border-line/60 px-3.5 py-2">
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-semibold">{row.member?.name ?? '—'}</div>
                  <div className="text-[11px] text-ink-soft">{row.plan?.name ?? 'Plan'} · {formatDate(row.membership.expiryDate)}</div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-[12px] font-bold">{row.daysLeft}d</div>
                  <StatusBadge value={row.membership.paymentStatus} />
                </div>
              </li>
            ))
          )}
        </ListCard>
        <ListCard title="Devices" to="/devices" linkLabel="Terminal">
          {devices.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-2.5 border-t border-line/60 px-3.5 py-2">
              <div className="min-w-0">
                <div className="truncate text-[13px] font-semibold">{d.name}</div>
                <div className="text-[11px] text-ink-soft">{formatRelative(d.lastHeartbeat)}</div>
              </div>
              <StatusBadge value={d.status} />
            </li>
          ))}
        </ListCard>
      </div>
    </div>
  );
}

function MobileHome({
  kpis,
  hourData,
  weekData,
  revenue,
  events,
  expiring,
  devices,
  pendingLinks,
}: HomeProps) {
  const weekVisits = weekData.reduce((sum, day) => sum + day.count, 0);
  const periodRevenue = revenue.reduce((sum, day) => sum + day.amount, 0);
  const showPeriodRevenue = kpis.todayRevenue === 0 && periodRevenue > 0;
  const goal = Math.max(20, kpis.todayAttendance, ...weekData.map((d) => d.count));
  const attendPct = Math.min(100, Math.round((kpis.todayAttendance / goal) * 100));
  const activePct = kpis.totalMembers
    ? Math.round((kpis.activeMembers / kpis.totalMembers) * 100)
    : 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="app-card col-span-2 p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[12px] font-medium text-ink-soft">Today's attendance</div>
              <div className="mt-1 font-display text-[2rem] font-bold leading-none tracking-tight">
                {kpis.todayAttendance}
              </div>
              <div className="mt-1.5 text-[11px] text-ink-soft">
                {weekVisits ? `${weekVisits} this week` : 'Granted visits today'}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Sparkline values={hourData.map((h) => h.count)} />
              <ProgressRing value={attendPct} />
            </div>
          </div>
        </div>
        <Link to="/members" className="tile-accent tap col-span-2 flex flex-col justify-between rounded-[1.6rem] p-4">
          <div className="flex items-start justify-between">
            <Flame className="h-5 w-5" />
            <span className="grid h-7 w-7 place-items-center rounded-full bg-black/20">
              <Users className="h-3.5 w-3.5" />
            </span>
          </div>
          <div>
            <div className="font-display text-[2rem] font-bold leading-none">{kpis.activeMembers}</div>
            <div className="mt-1 text-[12px] font-medium text-white/80">
              {activePct}% of {kpis.totalMembers} active
            </div>
          </div>
        </Link>
        <div className="app-card col-span-2 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-1.5 text-[12px] font-medium text-ink-soft">
                <Wallet className="h-3.5 w-3.5" />
                {showPeriodRevenue ? 'Revenue (14 days)' : "Today's revenue"}
              </div>
              <div className="mt-1 font-display text-[1.7rem] font-bold leading-none tracking-tight">
                {formatINR(showPeriodRevenue ? periodRevenue : kpis.todayRevenue)}
              </div>
              <div className="mt-1.5 text-[11px] text-ink-soft">
                {showPeriodRevenue ? `Today ${formatINR(0)} · ` : ''}
                {pendingLinks} unpaid links
              </div>
            </div>
            <MiniBars values={revenue.slice(-7).map((d) => d.amount)} labels={revenue.slice(-7).map((d) => d.day)} />
          </div>
        </div>
        <Link to="/members" className="app-card tap p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft">Total members</div>
          <div className="mt-2 font-display text-[1.7rem] font-bold leading-none">{kpis.totalMembers}</div>
        </Link>
        <Link to="/memberships" className="app-card tap p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft">Expired</div>
          <div className="mt-2 font-display text-[1.7rem] font-bold leading-none">{kpis.expired}</div>
        </Link>
        <Link to="/access" className="app-card tap p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft">Denied today</div>
          <div className="mt-2 font-display text-[1.7rem] font-bold leading-none">{kpis.accessDeniedToday}</div>
        </Link>
        <Link to="/memberships" className="app-card tap flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-warn-bg text-warn">
              <Crown className="h-4 w-4" />
            </span>
            <div>
              <div className="text-[13px] font-bold">Expiring</div>
              <div className="text-[11px] text-ink-soft">Next 7 days</div>
            </div>
          </div>
          <div className="font-display text-[1.5rem] font-bold">{kpis.expiringSoon || expiring.length}</div>
        </Link>
      </div>
      <div className="app-card px-3 py-4">
        <div className="mb-3 px-1 text-[13px] font-semibold">Quick actions</div>
        <div className="grid grid-cols-4 gap-1">
          <QuickAction to="/members?new=1" label="Add" icon={Plus} />
          <QuickAction to="/access" label="Access" icon={DoorOpen} />
          <QuickAction to="/payments" label="Pay" icon={Wallet} />
          <QuickAction to="/attendance" label="Visits" icon={CalendarCheck} />
        </div>
      </div>
      <div className="app-card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="text-[13px] font-semibold">Recent access</div>
          <Link to="/access" className="text-[12px] font-semibold text-accent">See all</Link>
        </div>
        {events.length === 0 ? (
          <div className="px-4 pb-5 text-[13px] text-ink-soft">No door activity yet today.</div>
        ) : (
          <ul>
            {events.slice(0, 5).map((event) => (
              <li key={event.id} className="flex items-center gap-3 border-t border-line/60 px-4 py-3">
                <MemberAvatar name={event.memberName} size={40} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-semibold">{event.memberName}</div>
                  <div className="text-[11px] text-ink-soft">{formatTime(event.timestamp)} · {event.type}</div>
                </div>
                <StatusBadge value={event.decision} />
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="app-card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="text-[13px] font-semibold">Expiring this week</div>
          <Link to="/memberships" className="text-[12px] font-semibold text-accent">See all</Link>
        </div>
        {expiring.length === 0 ? (
          <div className="px-4 pb-5 text-[13px] text-ink-soft">No memberships expire in the next 7 days.</div>
        ) : (
          <ul>
            {expiring.slice(0, 5).map((row) => (
              <li key={row.membership.id} className="flex items-center justify-between gap-3 border-t border-line/60 px-4 py-3">
                <div className="min-w-0">
                  <div className="truncate text-[14px] font-semibold">{row.member?.name ?? '—'}</div>
                  <div className="text-[11px] text-ink-soft">{row.plan?.name ?? 'Plan'} · {formatDate(row.membership.expiryDate)}</div>
                </div>
                <div className="text-[12px] font-bold">{row.daysLeft}d</div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="app-card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="text-[13px] font-semibold">Devices</div>
          <Link to="/devices" className="text-[12px] font-semibold text-accent">Terminal</Link>
        </div>
        <ul>
          {devices.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-3 border-t border-line/60 px-4 py-3">
              <div className="min-w-0">
                <div className="truncate text-[14px] font-semibold">{d.name}</div>
                <div className="text-[11px] text-ink-soft">{formatRelative(d.lastHeartbeat)}</div>
              </div>
              <StatusBadge value={d.status} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function MiniStat({ to, label, value }: { to: string; label: string; value: number }) {
  return (
    <Link to={to} className="surface tap px-3 py-2.5">
      <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-soft">{label}</div>
      <div className="mt-1 font-display text-[1.25rem] font-bold leading-none">{value}</div>
    </Link>
  );
}

function QuickPill({
  to,
  label,
  icon: Icon,
  primary,
}: {
  to: string;
  label: string;
  icon: typeof Plus;
  primary?: boolean;
}) {
  return (
    <Link
      to={to}
      className={`tap inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full text-[12px] font-semibold ${
        primary ? 'bg-accent text-white' : 'border border-line bg-[var(--hover-fill)] text-ink'
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </Link>
  );
}

function CompactChart({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="surface overflow-hidden">
      <div className="px-3.5 pt-3 text-[12px] font-semibold">{title}</div>
      <div className="px-2 pb-2 pt-1">{children}</div>
    </section>
  );
}

function ListCard({
  title,
  to,
  linkLabel = 'See all',
  children,
}: {
  title: string;
  to: string;
  linkLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="surface overflow-hidden">
      <div className="flex items-center justify-between px-3.5 py-2.5">
        <div className="text-[12px] font-semibold">{title}</div>
        <Link to={to} className="text-[11px] font-semibold text-accent">{linkLabel}</Link>
      </div>
      <ul>{children}</ul>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <li className="border-t border-line/60 px-3.5 py-4 text-[12px] text-ink-soft">{children}</li>;
}

function QuickAction({
  to,
  label,
  icon: Icon,
}: {
  to: string;
  label: string;
  icon: typeof Plus;
}) {
  return (
    <Link to={to} className="tap flex flex-col items-center gap-2 py-1">
      <span className="grid h-14 w-14 place-items-center rounded-full border border-line bg-canvas">
        <Icon className="h-5 w-5" />
      </span>
      <span className="text-[11px] font-semibold text-ink-soft">{label}</span>
    </Link>
  );
}

function ProgressRing({ value, compact }: { value: number; compact?: boolean }) {
  const r = compact ? 18 : 28;
  const box = compact ? 48 : 72;
  const c = 2 * Math.PI * r;
  const offset = c - (value / 100) * c;
  return (
    <div className={`relative grid place-items-center ${compact ? 'h-11 w-11' : 'h-[4.6rem] w-[4.6rem]'}`}>
      <svg viewBox={`0 0 ${box} ${box}`} className="h-full w-full -rotate-90">
        <circle cx={box / 2} cy={box / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={compact ? 4 : 6} />
        <circle
          cx={box / 2}
          cy={box / 2}
          r={r}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={compact ? 4 : 6}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
        />
      </svg>
      <Flame className={`absolute text-accent ${compact ? 'h-3.5 w-3.5' : 'h-5 w-5'}`} />
    </div>
  );
}

function Sparkline({ values }: { values: number[] }) {
  const w = 88;
  const h = 36;
  const max = Math.max(1, ...values);
  const pts = values.map((v, i) => {
    const x = values.length <= 1 ? w / 2 : (i / (values.length - 1)) * w;
    const y = h - (v / max) * (h - 4) - 2;
    return `${x},${y}`;
  });
  if (!pts.length) return <div className="h-9 w-[5.5rem]" />;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-8 w-[4.75rem]" aria-hidden>
      <polyline fill="none" stroke="var(--accent)" strokeWidth="2" points={pts.join(' ')} />
    </svg>
  );
}

function MiniBars({ values, labels }: { values: number[]; labels: string[] }) {
  const max = Math.max(1, ...values);
  return (
    <div className="flex h-12 items-end gap-1">
      {values.map((v, i) => (
        <div key={`${labels[i]}-${i}`} className="flex w-2.5 flex-col items-center">
          <div
            className="w-full rounded-full bg-accent"
            style={{ height: `${Math.max(10, (v / max) * 100)}%` }}
          />
        </div>
      ))}
    </div>
  );
}
