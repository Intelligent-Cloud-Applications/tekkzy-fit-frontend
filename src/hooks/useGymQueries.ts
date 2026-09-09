import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useGymData, type GymSlice } from '@/context/GymDataContext';
import { attendanceForMember, todayAttendance } from '@/services/attendance';
import { getDevice } from '@/services/devices';
import { localStore } from '@/providers/database/LocalDatabase';
import { loadGymSettings } from '@/services/settings';

export const qk = {
  kpis: ['kpis'] as const,
  members: ['members'] as const,
  member: (id: string) => ['member', id] as const,
  memberships: ['memberships'] as const,
  plans: ['plans'] as const,
  attendance: ['attendance'] as const,
  attendanceToday: ['attendance', 'today'] as const,
  attendanceMember: (id: string) => ['attendance', id] as const,
  payments: ['payments'] as const,
  devices: ['devices'] as const,
  device: (id: string) => ['device', id] as const,
  events: ['events'] as const,
  notifications: ['notifications'] as const,
  settings: ['settings'] as const,
  expiring: ['expiring'] as const,
};

function useSlice(slices: GymSlice | GymSlice[]) {
  const { ensure } = useGymData();
  const list = Array.isArray(slices) ? slices : [slices];
  const key = list.join(',');
  useEffect(() => {
    void ensure(...list);
  }, [ensure, key]);
}

export function useInvalidateGym() {
  const { refresh } = useGymData();
  const qc = useQueryClient();
  return () => {
    void refresh({ slices: ['membersFull', 'payments', 'plans', 'memberships'] });
    void qc.invalidateQueries();
  };
}

export function useKpis() {
  useSlice(['membersLite', 'payments', 'attendance', 'events']);
  const { kpis, loaded } = useGymData();
  const ready = Boolean(kpis && loaded.membersLite && loaded.payments);
  return { data: ready ? kpis ?? undefined : undefined, isLoading: !ready };
}

export function useMembers(opts?: { full?: boolean }) {
  useSlice(opts?.full ? 'membersFull' : 'membersLite');
  const { members, loaded } = useGymData();
  const ready = Boolean(loaded.membersLite || loaded.membersFull);
  return { data: ready ? members : undefined, isLoading: !ready };
}

export function useMember(id: string) {
  useSlice('membersFull');
  const { members, loaded } = useGymData();
  const data = members.find((m) =>
    m.id === id
    || (m as { cognitoId?: string }).cognitoId === id
    || m.memberCode === id
    || m.deviceEnrollId === id,
  );
  return { data, isLoading: !loaded.membersFull && !loaded.membersLite };
}

export function useMemberships() {
  useSlice('memberships');
  const { memberships, loaded } = useGymData();
  return { data: loaded.memberships ? memberships : undefined, isLoading: !loaded.memberships };
}

export function usePlans() {
  useSlice('plans');
  const { plans, loaded } = useGymData();
  return { data: loaded.plans ? plans : undefined, isLoading: !loaded.plans };
}

export function useAttendance() {
  useSlice('attendance');
  const { attendance, loaded } = useGymData();
  return { data: loaded.attendance ? attendance : undefined, isLoading: !loaded.attendance };
}

export function useTodayAttendance() {
  return useQuery({ queryKey: qk.attendanceToday, queryFn: todayAttendance });
}

export function useMemberAttendance(id: string) {
  return useQuery({ queryKey: qk.attendanceMember(id), queryFn: () => attendanceForMember(id), enabled: Boolean(id) });
}

export function usePayments() {
  useSlice('payments');
  const { payments, loaded } = useGymData();
  return { data: loaded.payments ? payments : undefined, isLoading: !loaded.payments };
}

export function useRefreshCloud() {
  const { refresh, refreshing } = useGymData();
  return {
    refresh: () => refresh({
      syncDevice: true,
      slices: ['membersFull', 'payments', 'plans', 'memberships'],
    }),
    busy: refreshing,
  };
}

export function useDevices() {
  useSlice('devices');
  const { devices, loaded } = useGymData();
  return { data: loaded.devices ? devices : undefined, isLoading: !loaded.devices };
}

export function useDevice(id: string) {
  return useQuery({ queryKey: qk.device(id), queryFn: () => getDevice(id), enabled: Boolean(id) });
}

export function useAccessEvents() {
  useSlice('events');
  const { events, loaded } = useGymData();
  return { data: loaded.events ? events : undefined, isLoading: !loaded.events };
}

export function useNotifications() {
  return useQuery({ queryKey: qk.notifications, queryFn: () => localStore.allNotifications() });
}

export function useSettings() {
  return useQuery({ queryKey: qk.settings, queryFn: () => loadGymSettings() });
}

export function useExpiring() {
  useSlice('expiring');
  const { expiring, loaded } = useGymData();
  return { data: loaded.expiring ? expiring : undefined, isLoading: !loaded.expiring };
}

export function useGymMutation<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>) {
  const invalidate = useInvalidateGym();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => invalidate(),
  });
}
