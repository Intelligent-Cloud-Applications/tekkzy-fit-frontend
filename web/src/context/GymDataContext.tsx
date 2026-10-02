import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { AccessEvent, AttendanceRecord, DashboardKpis, Device, Membership, MembershipPlan, Payment } from '@shared/types';
import { peopleCurrentlyInside } from '@/services/access';
import { expiringFromMembers, kpisFromSlices, type ExpiringRow } from '@/services/dashboard';
import { bustMembersCache, listCloudMembersLite, listMemberRows, type MemberRow } from '@/services/members';
import { listMemberships, listPlans } from '@/services/memberships';
import { listAttendance } from '@/services/attendance';
import { bustPaymentsCache, listPayments } from '@/services/payments';
import { listDevices } from '@/services/devices';
import { localStore } from '@/providers/database/LocalDatabase';
import { fetchLiveUsers, ingestRtLogs } from '@/services/liveDevice';
import { useAuthStore } from '@/store/authStore';

export type { ExpiringRow };

export type GymSlice =
  | 'membersLite'
  | 'membersFull'
  | 'payments'
  | 'attendance'
  | 'events'
  | 'devices'
  | 'plans'
  | 'memberships'
  | 'expiring'
  | 'inside';

type Loaded = Partial<Record<GymSlice, boolean>>;

type GymData = {
  kpis: DashboardKpis | null;
  members: MemberRow[];
  payments: Payment[];
  attendance: AttendanceRecord[];
  events: AccessEvent[];
  devices: Device[];
  plans: MembershipPlan[];
  memberships: Membership[];
  expiring: ExpiringRow[];
  loaded: Loaded;
  homeReady: boolean;
  refreshing: boolean;
  ensure: (...slices: GymSlice[]) => Promise<void>;
  refresh: (opts?: { syncDevice?: boolean; slices?: GymSlice[]; quiet?: boolean }) => Promise<void>;
  reloadMembers: (opts?: { cloud?: boolean }) => Promise<void>;
};

const GymDataContext = createContext<GymData | null>(null);

export function useGymData() {
  const value = useContext(GymDataContext);
  if (!value) throw new Error('useGymData must be used inside GymDataProvider');
  return value;
}

function emptyState() {
  return {
    kpis: null as DashboardKpis | null,
    members: [] as MemberRow[],
    payments: [] as Payment[],
    attendance: [] as AttendanceRecord[],
    events: [] as AccessEvent[],
    devices: [] as Device[],
    plans: [] as MembershipPlan[],
    memberships: [] as Membership[],
    expiring: [] as ExpiringRow[],
    inside: 0,
    loaded: {} as Loaded,
  };
}

export function GymDataProvider({ children }: { children: ReactNode }) {
  const [kpis, setKpis] = useState<DashboardKpis | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [events, setEvents] = useState<AccessEvent[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [plans, setPlans] = useState<MembershipPlan[]>([]);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [expiring, setExpiring] = useState<ExpiringRow[]>([]);
  const [inside, setInside] = useState(0);
  const [loaded, setLoaded] = useState<Loaded>({});
  const [refreshing, setRefreshing] = useState(false);
  const loadedRef = useRef<Loaded>({});
  const inflight = useRef<Partial<Record<GymSlice, Promise<void>>>>({});

  const mark = useCallback((slice: GymSlice) => {
    loadedRef.current = { ...loadedRef.current, [slice]: true };
    setLoaded((prev) => (prev[slice] ? prev : { ...prev, [slice]: true }));
  }, []);

  const loadSlice = useCallback(async (slice: GymSlice, force = false) => {
    if (!force && loadedRef.current[slice]) return;
    if (!force && inflight.current[slice]) return inflight.current[slice];

    const run = (async () => {
      switch (slice) {
        case 'membersLite': {
          const rows = await listCloudMembersLite({ force });
          setMembers((prev) => (loadedRef.current.membersFull ? prev : rows));
          break;
        }
        case 'membersFull': {
          const rows = await listMemberRows({ force });
          setMembers(rows);
          loadedRef.current = { ...loadedRef.current, membersLite: true };
          setLoaded((prev) => ({ ...prev, membersLite: true, membersFull: true }));
          return;
        }
        case 'payments':
          setPayments(await listPayments({ force }));
          break;
        case 'attendance':
          setAttendance(await listAttendance());
          break;
        case 'events':
          setEvents(await localStore.allAccessEvents());
          break;
        case 'devices':
          setDevices(await listDevices());
          break;
        case 'plans':
          setPlans(await listPlans());
          break;
        case 'memberships':
          setMemberships(await listMemberships());
          break;
        case 'expiring':
          setExpiring(expiringFromMembers(members.length ? members : await listCloudMembersLite()));
          break;
        case 'inside':
          setInside(await peopleCurrentlyInside());
          break;
        default:
          break;
      }
      mark(slice);
    })().finally(() => {
      delete inflight.current[slice];
    });

    inflight.current[slice] = run;
    return run;
  }, [mark]);

  const ensure = useCallback(async (...slices: GymSlice[]) => {
    await Promise.all(slices.map((slice) => loadSlice(slice)));
  }, [loadSlice]);

  const reloadMembers = useCallback(async (opts?: { cloud?: boolean }) => {
    if (opts?.cloud) bustMembersCache();
    const rows = await listMemberRows({ force: Boolean(opts?.cloud) });
    setMembers(rows);
    loadedRef.current = { ...loadedRef.current, membersLite: true, membersFull: true };
    setLoaded((prev) => ({ ...prev, membersLite: true, membersFull: true }));
  }, []);

  const refresh = useCallback(async (opts?: { syncDevice?: boolean; slices?: GymSlice[]; quiet?: boolean }) => {
    if (!opts?.quiet) setRefreshing(true);
    const previous = { ...loadedRef.current };
    const slices = opts?.slices?.length
      ? opts.slices
      : (Object.keys(previous) as GymSlice[]).filter((key) => previous[key]);
    const next = slices.length ? slices : ['membersLite', 'payments', 'plans'] as GymSlice[];
    try {
      if (opts?.syncDevice) {
        await fetchLiveUsers().catch(() => undefined);
        await ingestRtLogs().catch(() => undefined);
      }
      if (next.includes('membersLite') || next.includes('membersFull')) bustMembersCache();
      if (next.includes('payments')) bustPaymentsCache();
      await Promise.all(next.map((slice) => loadSlice(slice, true)));
    } finally {
      if (!opts?.quiet) setRefreshing(false);
    }
  }, [loadSlice]);

  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    if (user) return;
    const next = emptyState();
    loadedRef.current = {};
    setKpis(next.kpis);
    setMembers(next.members);
    setPayments(next.payments);
    setAttendance(next.attendance);
    setEvents(next.events);
    setDevices(next.devices);
    setPlans(next.plans);
    setMemberships(next.memberships);
    setExpiring(next.expiring);
    setInside(next.inside);
    setLoaded({});
  }, [user]);

  useEffect(() => {
    if (!loaded.membersLite || !loaded.payments) return;
    setExpiring(expiringFromMembers(members));
    setKpis(kpisFromSlices({
      members,
      memberships: loaded.memberships ? memberships : [],
      attendance,
      payments,
      events,
      currentlyInside: loaded.inside ? inside : 0,
    }));
  }, [members, memberships, attendance, payments, events, inside, loaded.membersLite, loaded.payments, loaded.attendance, loaded.events, loaded.memberships, loaded.inside]);

  const homeReady = Boolean(kpis && loaded.membersLite && loaded.payments);

  const value = useMemo<GymData>(() => ({
    kpis,
    members,
    payments,
    attendance,
    events,
    devices,
    plans,
    memberships,
    expiring,
    loaded,
    homeReady,
    refreshing,
    ensure,
    refresh,
    reloadMembers,
  }), [kpis, members, payments, attendance, events, devices, plans, memberships, expiring, loaded, homeReady, refreshing, ensure, refresh, reloadMembers]);

  return <GymDataContext.Provider value={value}>{children}</GymDataContext.Provider>;
}
