import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState, DeviceEventEmitter } from 'react-native';
import { readCache, trackSync, writeCache } from './cache';
import {
  attendanceFromMembers,
  fetchAttendance,
  fetchExpenses,
  fetchGymSettings,
  fetchMember,
  fetchMemberPayments,
  fetchMembers,
  fetchMonthlyReports,
  fetchPayments,
  fetchPlans,
  fetchStaff,
  loadGymSettings,
  logsToAttendance,
  persistDeviceEnrolls,
  saveAttendanceDays,
} from './api';
import { errorMessage } from './errors';
import { connectAndLoadUsers, ensureLanPermissions, fetchDeviceLogs, hostOnLan, phoneLanIp, sameLan } from './device';
import { syncCloudMembersToDevice } from './deviceQueue';
import { isDeviceSetupDone, loadDeviceCreds, saveDeviceCreds } from './session';
import { DESK_TICK_EVENT, loadBackgroundPunches } from './deskKeepAlive';
import { setAppPrimary } from './primaryColor';
import type { AttendanceRow, Expense, GymSettings, Member, MonthlyReport, Payment, Plan } from './types';

export type DeviceLinkStatus = 'checking' | 'connected' | 'reconnect' | 'reconnecting';

type GymData = {
  settings: GymSettings | null;
  members: Member[];
  staff: Member[];
  plans: Plan[];
  payments: Payment[];
  expenses: Expense[];
  reports: MonthlyReport[];
  attendance: AttendanceRow[];
  loading: boolean;
  error: string;
  deviceStatus: DeviceLinkStatus;
  queuedPushed: number;
  refresh: () => Promise<void>;
  /** Loads one YYYY-MM of payments into the cache (skips if already loaded unless force). */
  loadPaymentMonth: (ym: string, force?: boolean) => Promise<void>;
  loadMemberPayments: (memberId: string) => Promise<Payment[]>;
  /** Re-fetches one member + their payments instead of reloading everything. */
  refreshMember: (memberId: string, fallback?: Member) => Promise<void>;
  reconnectDevice: (rows?: Member[]) => Promise<{ ok: boolean; pushed: number; failed?: number; message?: string }>;
  markDeviceConnected: (ok: boolean) => void;
  setMembers: (rows: Member[] | ((prev: Member[]) => Member[])) => void;
  setStaff: (rows: Member[] | ((prev: Member[]) => Member[])) => void;
  setPlans: (rows: Plan[]) => void;
  setPayments: (rows: Payment[]) => void;
  setExpenses: (rows: Expense[]) => void;
  setReports: (rows: MonthlyReport[]) => void;
  setSettings: (row: GymSettings) => void;
  mergeAttendance: (rows: AttendanceRow[]) => void;
};

const GymContext = createContext<GymData | null>(null);

function monthOf(iso: string) {
  return String(iso || '').slice(0, 7);
}

function sortPayments(rows: Payment[]) {
  return rows.sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

const CACHE_KEY = 'gym';
/** Foreground refresh is skipped if the last one finished less than this long ago. */
const RESUME_STALE_MS = 60_000;
const POLL_MS = 5 * 60_000;

type GymSnapshot = {
  settings: GymSettings | null;
  members: Member[];
  staff: Member[];
  plans: Plan[];
  payments: Payment[];
  expenses: Expense[];
  reports: MonthlyReport[];
};

/** Inline base64 photos can be megabytes each; they are refetched rather than cached. */
function slimPerson(m: Member): Member {
  return m.devicePhotoUrl?.startsWith('data:') ? { ...m, devicePhotoUrl: undefined } : m;
}

function upsertPayments(prev: Payment[], rows: Payment[]) {
  const byId = new Map(prev.map((p) => [p.id, p]));
  for (const row of rows) byId.set(row.id, row);
  return sortPayments([...byId.values()]);
}

export function GymProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<GymSettings | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [staff, setStaff] = useState<Member[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [reports, setReports] = useState<MonthlyReport[]>([]);
  const [extraAttendance, setExtraAttendance] = useState<AttendanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deviceStatus, setDeviceStatus] = useState<DeviceLinkStatus>('checking');
  const [queuedPushed, setQueuedPushed] = useState(0);
  const membersRef = useRef(members);
  membersRef.current = members;
  const staffRef = useRef(staff);
  staffRef.current = staff;
  const storeVisitDaysRef = useRef<(rows: AttendanceRow[]) => void>(() => undefined);

  const reconnectDevice = useCallback(async (rows?: Member[]) => {
    setDeviceStatus((prev) => (prev === 'connected' ? prev : 'reconnecting'));
    try {
      const creds = await loadDeviceCreds();
      if (!isDeviceSetupDone(creds)) {
        setDeviceStatus('reconnect');
        return { ok: false, pushed: 0, message: 'Set up the face machine on this phone first.' };
      }
      await ensureLanPermissions({ openSettings: true });
      const phone = await phoneLanIp();
      // Prefer saved IP only when it is still on this Wi‑Fi; otherwise scan like Scan Wi‑Fi.
      let prefer = '';
      if (phone && creds.host && sameLan(creds.host, phone)) prefer = creds.host;
      else if (phone && creds.host) prefer = hostOnLan(creds.host, phone) || '';

      const { probe } = await connectAndLoadUsers(prefer, creds.username, creds.password);
      if (!probe.ok) {
        setDeviceStatus('reconnect');
        return { ok: false, pushed: 0, message: probe.message };
      }
      if (probe.host && probe.host !== creds.host) {
        await saveDeviceCreds({ ...creds, host: probe.host });
      }
      // Mark linked immediately — do not wait on cloud import / full roster sync.
      setDeviceStatus('connected');

      const source = rows || membersRef.current;
      void (async () => {
        try {
          const flushed = await syncCloudMembersToDevice(source);
          if (flushed.updates.length) {
            setMembers(await persistDeviceEnrolls(source, flushed.updates));
          }
          setQueuedPushed(flushed.pushed);
          const logs = await fetchDeviceLogs(probe.host, creds.password).catch(() => []);
          if (logs.length) {
            const deviceRows = logsToAttendance(logs, [...membersRef.current, ...staffRef.current]);
            setExtraAttendance((prev) => [...deviceRows, ...prev.filter((row) => !String(row.id).startsWith('dev-'))]);
            storeVisitDaysRef.current(deviceRows);
          }
        } catch {
          /* link already up; background sync is best-effort */
        }
      })();

      return { ok: true, pushed: 0, message: probe.message };
    } catch (err) {
      setDeviceStatus('reconnect');
      return { ok: false, pushed: 0, message: errorMessage(err, 'Still not connected', 'device') };
    }
  }, []);

  const markDeviceConnected = useCallback((ok: boolean) => {
    setDeviceStatus(ok ? 'connected' : 'reconnect');
  }, []);

  const loadedMonths = useRef(new Set<string>());

  const loadPaymentMonth = useCallback(async (ym: string, force = false) => {
    if (!/^\d{4}-\d{2}$/.test(ym)) return;
    if (!force && loadedMonths.current.has(ym)) return;
    const rows = await fetchPayments({ month: ym });
    loadedMonths.current.add(ym);
    setPayments((prev) => sortPayments([...prev.filter((p) => monthOf(p.date) !== ym), ...rows]));
  }, []);

  const loadMemberPayments = useCallback(async (memberId: string) => {
    const rows = await fetchMemberPayments(memberId);
    setPayments((prev) => upsertPayments(prev, rows));
    return rows;
  }, []);

  const refreshMember = useCallback(async (memberId: string, fallback?: Member) => {
    const [fresh] = await Promise.all([
      fetchMember(memberId).catch(() => null),
      loadMemberPayments(memberId).catch(() => [] as Payment[]),
    ]);
    const row = fresh || fallback;
    if (!row) return;
    setMembers((prev) => {
      const at = prev.findIndex((m) => m.id === row.id || (row.cognitoId && m.cognitoId === row.cognitoId));
      if (at < 0) return [row, ...prev];
      const next = prev.slice();
      next[at] = { ...prev[at], ...row };
      return next;
    });
  }, [loadMemberPayments]);

  const hasDataRef = useRef(false);
  const hydratedRef = useRef(false);
  const lastRefreshRef = useRef(0);
  const refreshingRef = useRef<Promise<void> | null>(null);

  const load = useCallback(async (background: boolean) => {
    if (!hasDataRef.current) setLoading(true);
    setError('');
    try {
      const gym = await fetchGymSettings().catch(() => loadGymSettings());
      setSettings(gym);
      setAppPrimary(gym.primaryColor);
      const [nextMembers, nextPlans, nextExpenses, nextReports, nextAttendance, nextStaff] = await Promise.all([
        fetchMembers(),
        fetchPlans(),
        fetchExpenses().catch(() => [] as Expense[]),
        fetchMonthlyReports().catch(() => [] as MonthlyReport[]),
        fetchAttendance(),
        fetchStaff().catch(() => staffRef.current),
      ]);
      setMembers(nextMembers);
      setStaff(nextStaff);
      staffRef.current = nextStaff;
      setPlans(nextPlans);
      const reloadMonths = [...loadedMonths.current];
      loadedMonths.current = new Set();
      for (const ym of reloadMonths) void loadPaymentMonth(ym, true).catch(() => undefined);
      setExpenses(nextExpenses);
      setReports(nextReports);
      if (nextAttendance.length) {
        setExtraAttendance((prev) => [...nextAttendance, ...prev.filter((row) => String(row.id).startsWith('dev-'))]);
      }
      hasDataRef.current = true;
      lastRefreshRef.current = Date.now();
      if (!background) void reconnectDevice(nextMembers);
    } catch (err) {
      if (!background || !hasDataRef.current) setError(errorMessage(err, 'Could not load gym data'));
    } finally {
      setLoading(false);
    }
  }, [reconnectDevice, loadPaymentMonth]);

  const runLoad = useCallback((background: boolean) => {
    if (!refreshingRef.current) {
      refreshingRef.current = trackSync(load(background)).finally(() => {
        refreshingRef.current = null;
      });
    }
    return refreshingRef.current;
  }, [load]);

  const refresh = useCallback(() => runLoad(false), [runLoad]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const cached = await readCache<GymSnapshot>(CACHE_KEY);
      if (cancelled) return;
      if (cached) {
        const snap = cached.value;
        if (snap.settings) {
          setSettings(snap.settings);
          setAppPrimary(snap.settings.primaryColor);
        }
        setMembers(snap.members || []);
        setStaff(snap.staff || []);
        staffRef.current = snap.staff || [];
        setPlans(snap.plans || []);
        setPayments(snap.payments || []);
        setExpenses(snap.expenses || []);
        setReports(snap.reports || []);
        hasDataRef.current = true;
        setLoading(false);
      }
      hydratedRef.current = true;
      void refresh();
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  useEffect(() => {
    if (!hydratedRef.current || !hasDataRef.current) return;
    const timer = setTimeout(() => {
      writeCache<GymSnapshot>(CACHE_KEY, {
        settings,
        members: members.map(slimPerson),
        staff: staff.map(slimPerson),
        plans,
        payments,
        expenses,
        reports,
      });
    }, 800);
    return () => clearTimeout(timer);
  }, [settings, members, staff, plans, payments, expenses, reports]);

  useEffect(() => {
    let poll: ReturnType<typeof setInterval> | null = null;
    const startPoll = () => {
      if (!poll) poll = setInterval(() => void runLoad(true), POLL_MS);
    };
    const stopPoll = () => {
      if (poll) clearInterval(poll);
      poll = null;
    };
    if (AppState.currentState === 'active') startPoll();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        if (hydratedRef.current && Date.now() - lastRefreshRef.current > RESUME_STALE_MS) void runLoad(true);
        startPoll();
      } else {
        stopPoll();
      }
    });
    return () => {
      stopPoll();
      sub.remove();
    };
  }, [runLoad]);

  const attendance = useMemo(() => {
    const fromMembers = attendanceFromMembers(members);
    const seen = new Set<string>();
    const rows: AttendanceRow[] = [];
    for (const row of [...extraAttendance, ...fromMembers]) {
      const key = `${row.memberCode || row.memberId}|${row.timestamp}`;
      if (seen.has(key) || !row.timestamp) continue;
      seen.add(key);
      rows.push(row);
    }
    return rows.sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
  }, [members, extraAttendance]);

  const storeVisitDays = useCallback((rows: AttendanceRow[]) => {
    const people = [...membersRef.current, ...staffRef.current];
    if (!rows.length || !people.length) return;
    void saveAttendanceDays(rows, people).then((updated) => {
      if (!updated.length) return;
      const apply = (prev: Member[]) => prev.map((m) => {
        const hit = updated.find((u) => u.id === m.id || (u.cognitoId && u.cognitoId === m.cognitoId));
        return hit ? { ...m, attendanceDays: hit.attendanceDays, attendanceCount: hit.attendanceCount } : m;
      });
      setMembers(apply);
      setStaff(apply);
    }).catch(() => undefined);
  }, []);

  const mergeAttendance = useCallback((rows: AttendanceRow[]) => {
    setExtraAttendance((prev) => {
      const seen = new Set(prev.map((row) => row.id));
      return [...rows.filter((row) => row.id && !seen.has(row.id)), ...prev];
    });
    storeVisitDays(rows);
  }, [storeVisitDays]);
  storeVisitDaysRef.current = storeVisitDays;

  useEffect(() => {
    void loadBackgroundPunches().then((rows) => {
      if (rows.length) mergeAttendance(rows);
    });
    const sub = DeviceEventEmitter.addListener(DESK_TICK_EVENT, (payload: { connected?: boolean; punches?: AttendanceRow[]; pushed?: number }) => {
      if (payload?.connected != null) markDeviceConnected(payload.connected);
      if (payload?.punches?.length) mergeAttendance(payload.punches);
      if (typeof payload?.pushed === 'number' && payload.pushed > 0) setQueuedPushed(payload.pushed);
    });
    return () => sub.remove();
  }, [markDeviceConnected, mergeAttendance]);

  const value = useMemo(
    () => ({
      settings,
      members,
      staff,
      plans,
      payments,
      expenses,
      reports,
      attendance,
      loading,
      error,
      deviceStatus,
      queuedPushed,
      refresh,
      loadPaymentMonth,
      loadMemberPayments,
      refreshMember,
      reconnectDevice,
      markDeviceConnected,
      setMembers,
      setStaff,
      setPlans,
      setPayments,
      setExpenses,
      setReports,
      setSettings,
      mergeAttendance,
    }),
    [settings, members, staff, plans, payments, expenses, reports, attendance, loading, error, deviceStatus, queuedPushed, refresh, loadPaymentMonth, loadMemberPayments, refreshMember, reconnectDevice, markDeviceConnected, mergeAttendance],
  );

  return <GymContext.Provider value={value}>{children}</GymContext.Provider>;
}

export function useGym() {
  const ctx = useContext(GymContext);
  if (!ctx) throw new Error('useGym must be used inside GymProvider');
  return ctx;
}
