import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, Text, View } from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { countMemberVisits, fetchMembersPage, removeMember, setMemberStatus } from '../api';
import { swr, trackSync, useSyncing } from '../cache';
import { addedByOptions } from '../addedBy';
import { withPhotoCacheBust } from '../device';
import { ConfirmDialog } from '../confirm';
import { errorMessage, openExternal } from '../errors';
import { feedbackDeleted } from '../feedback';
import { pushToast } from '../toast';
import { compareNewestMembers, formatDate, initials, memberDisplayStatus, memberDue } from '../format';
import { useGym } from '../GymContext';
import type { RootStackParamList } from '../nav';
import { useTheme } from '../theme';
import { Icon } from '../icons';
import { hasPermission, type Member, type Role } from '../types';
import { IconBtn, PageTitle, PaginationBar, ScreenPad, SearchBox } from '../page';
import { AddedByTag, Empty, ErrorText, Select, StatusBadge } from '../ui';

const PAGE_SIZE = 15;
const AVATAR = ['#3a0d0d', '#2a1214', '#1a0a0a', '#4a1010', '#2a0808', '#161012'];

function mergeMembers(prev: Member[], page: Member[]) {
  const byId = new Map(prev.map((row) => [row.id, row]));
  for (const row of page) byId.set(row.id, { ...byId.get(row.id), ...row });
  return Array.from(byId.values());
}

export function MembersScreen({
  navigation,
  role,
}: {
  navigation: NativeStackNavigationProp<RootStackParamList>;
  role?: Role;
}) {
  const t = useTheme();
  const { members, attendance, setMembers, staff } = useGym();
  const [addedBy, setAddedBy] = useState('');
  const addedByRef = useRef(addedBy);
  addedByRef.current = addedBy;
  const canWrite = hasPermission(role, 'members.write');
  const canPay = hasPermission(role, 'payments.read');
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [status, setStatus] = useState('ALL');
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<Member[]>([]);
  const [cursorStack, setCursorStack] = useState<(string | null)[]>([null]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const syncing = useSyncing();
  const reqId = useRef(0);
  const membersRef = useRef(members);
  membersRef.current = members;

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(timer);
  }, [q]);

  const loadPage = useCallback(async (pageIndex: number, stack: (string | null)[], query: string, filter: string) => {
    const id = ++reqId.current;
    setLoading(true);
    setError('');
    const by = addedByRef.current;
    try {
      const fetchPage = () => fetchMembersPage({
        q: query,
        status: filter,
        limit: PAGE_SIZE,
        cursor: stack[pageIndex] || null,
        addedBy: by,
      });
      const cacheable = pageIndex === 0 && !query;
      const res = cacheable
        ? await swr(`members:${filter}:${by}`, fetchPage, (page, fresh) => {
          if (id !== reqId.current || fresh) return;
          setRows(page.members);
          setNextCursor(page.cursor);
          setLoading(false);
        })
        : await trackSync(fetchPage());
      if (id !== reqId.current) return;
      setRows(res.members);
      setNextCursor(res.cursor);
      setMembers(mergeMembers(membersRef.current, res.members));
    } catch (err) {
      if (id !== reqId.current) return;
      setError(errorMessage(err, 'Could not load members'));
      setRows([]);
      setNextCursor(null);
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, [setMembers]);

  useEffect(() => {
    const stack = [null] as (string | null)[];
    setCursorStack(stack);
    setPage(0);
    void loadPage(0, stack, debouncedQ, status);
  }, [debouncedQ, status, addedBy, loadPage]);

  const firstFocus = useRef(true);
  const reloadRef = useRef(() => {});
  reloadRef.current = () => void loadPage(page, cursorStack, debouncedQ, status);
  useEffect(() => navigation.addListener('focus', () => {
    if (firstFocus.current) {
      firstFocus.current = false;
      return;
    }
    reloadRef.current();
  }), [navigation]);
  useEffect(() => {
    if (page !== 0 || debouncedQ || status !== 'ALL' || addedBy) return;
    const shown = new Set(rows.map((m) => m.id));
    const fresh = members.filter((m) => !shown.has(m.id) && rows.length > 0 && compareNewestMembers(m, rows[0]) < 0);
    if (fresh.length) setRows((prev) => [...fresh.sort(compareNewestMembers), ...prev].slice(0, PAGE_SIZE));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members]);

  function onPage(next: number) {
    if (next === page) return;
    if (next > page) {
      if (!nextCursor) return;
      const stack = [...cursorStack.slice(0, page + 1), nextCursor];
      setCursorStack(stack);
      setPage(next);
      void loadPage(next, stack, debouncedQ, status);
      return;
    }
    setPage(next);
    void loadPage(next, cursorStack, debouncedQ, status);
  }

  async function pause(id: string, next: 'ACTIVE' | 'SUSPENDED') {
    const member = rows.find((m) => m.id === id) || members.find((m) => m.id === id);
    if (!member) return;
    setBusyId(id);
    try {
      const saved = await setMemberStatus(member, next);
      setRows((prev) => prev.map((m) => (m.id === id || m.cognitoId === id ? { ...m, ...saved, status: next } : m)));
      setMembers(members.map((m) => (m.id === id || m.cognitoId === id ? { ...m, ...saved, status: next } : m)));
      pushToast({ kind: 'success', title: next === 'SUSPENDED' ? 'Member paused' : 'Member resumed' });
    } catch (err) {
      pushToast({ kind: 'error', title: errorMessage(err, 'Could not update subscription') });
    } finally {
      setBusyId('');
    }
  }

  async function deleteMember() {
    if (!pendingDelete) return;
    const member = rows.find((m) => m.id === pendingDelete.id) || members.find((m) => m.id === pendingDelete.id);
    if (!member) return;
    setDeleting(true);
    setBusyId(member.id);
    try {
      await removeMember(member);
      setRows((prev) => prev.filter((m) => m.id !== member.id && m.cognitoId !== member.id));
      setMembers(members.filter((m) => m.id !== member.id && m.cognitoId !== member.id));
      feedbackDeleted();
      setPendingDelete(null);
      pushToast({ kind: 'success', title: 'Deleted from the terminal and the website' });
    } catch (err) {
      pushToast({ kind: 'error', title: errorMessage(err, 'Delete failed') });
    } finally {
      setDeleting(false);
      setBusyId('');
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ScreenPad>
        <PageTitle>Members</PageTitle>
        <View style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Select
              pill
              title="Filter members"
              value={status}
              onChange={(value) => setStatus(value)}
              options={[
                { value: 'ALL', label: 'All statuses' },
                { value: 'ACTIVE', label: 'Active' },
                { value: 'EXPIRED', label: 'Expired' },
                { value: 'PAUSED', label: 'Paused' },
                { value: 'CANCELLED', label: 'Cancelled' },
                { value: 'PENDING', label: 'Pending' },
                { value: 'ONLINE', label: 'Online payers' },
                { value: 'OFFLINE', label: 'Offline (Cash + UPI)' },
              ]}
            />
          </View>
          {staff.length ? (
            <View style={{ flex: 1 }}>
              <Select pill title="Added by" value={addedBy} onChange={setAddedBy} options={addedByOptions(staff)} />
            </View>
          ) : null}
        </View>
        <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <SearchBox
            style={{ flex: 1 }}
            value={q}
            onChange={setQ}
            placeholder="Name, phone, email, ID"
          />
          {canWrite ? (
            <Pressable
              onPress={() => navigation.navigate('MemberForm', {})}
              style={{
                height: 40,
                borderRadius: 999,
                backgroundColor: t.accent,
                paddingHorizontal: 14,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Icon name="plus" color={t.accentInk} size={15} />
              <Text style={{ color: t.accentInk, fontSize: 13, fontWeight: '700' }}>Add</Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => void loadPage(page, cursorStack, debouncedQ, status)}
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              borderWidth: 1,
              borderColor: t.line,
              backgroundColor: t.card,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {loading || syncing ? <ActivityIndicator color={t.accent} size="small" /> : <Icon name="refresh" color={t.text} size={16} />}
          </Pressable>
        </View>
        <ErrorText text={error} />
      </ScreenPad>
      {loading && !rows.length ? (
        <View style={{ padding: 16, paddingTop: 10 }}>
          {Array.from({ length: 6 }, (_, index) => (
            <MemberSkeleton key={index} />
          ))}
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, paddingTop: 10, paddingBottom: 16 }}
          ListEmptyComponent={!loading ? <Empty text="No members match this search." /> : null}
          renderItem={({ item }) => {
            const due = formatDate(memberDue(item));
            const pay = item.paymentStatus || 'PENDING';
            const sub = memberDisplayStatus(item);
            const unpaid = Boolean(item.paymentLinkUrl) && String(pay).toUpperCase() !== 'PAID';
            const seed = item.name.split('').reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
            return (
              <View style={{ marginBottom: 10, borderRadius: 16, borderWidth: 1, borderColor: t.line, backgroundColor: t.card, overflow: 'hidden' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, paddingVertical: 8 }}>
                  <Pressable onPress={() => navigation.navigate('MemberProfile', { memberId: item.id })} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <View
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 20,
                        backgroundColor: AVATAR[seed % AVATAR.length],
                        alignItems: 'center',
                        justifyContent: 'center',
                        overflow: 'hidden',
                      }}
                    >
                      {item.devicePhotoUrl ? (
                        <Image source={{ uri: withPhotoCacheBust(item.devicePhotoUrl, item.updatedAt) }} style={{ width: 40, height: 40 }} />
                      ) : (
                        <Text style={{ color: t.accent, fontSize: 13, fontWeight: '800' }}>{initials(item.name)}</Text>
                      )}
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text numberOfLines={1} style={{ color: t.text, fontSize: 14, fontWeight: '700' }}>{item.name}</Text>
                      <Text numberOfLines={1} style={{ marginTop: 1, color: t.muted, fontSize: 11 }}>
                        {item.planName || 'No plan'} · {due === '—' ? 'No expiry' : due} · {item.phone || 'No phone'}
                      </Text>
                      <View style={{ marginTop: 4, flexDirection: 'row', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                        {sub ? <StatusBadge compact value={sub} /> : null}
                        {canPay ? <StatusBadge compact value={pay} /> : null}
                        <Pressable
                          onPress={() => navigation.navigate('Logs', { q: item.name })}
                          style={{ borderRadius: 999, backgroundColor: t.name === 'light' ? '#f3eeee' : '#242424', paddingHorizontal: 6, paddingVertical: 1 }}
                        >
                          <Text style={{ color: t.text, fontSize: 9, fontWeight: '800', letterSpacing: 0.5 }}>{countMemberVisits(item, attendance)} THIS MO</Text>
                        </Pressable>
                        {item.addedByName ? <AddedByTag name={item.addedByName} /> : null}
                        {canPay && unpaid ? (
                          <Pressable
                            onPress={() => void openExternal(item.paymentLinkUrl!)}
                            style={{
                              borderRadius: 999,
                              backgroundColor: t.accentSoft,
                              paddingHorizontal: 6,
                              paddingVertical: 1,
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: 2,
                            }}
                          >
                            <Text style={{ color: t.accent, fontSize: 9, fontWeight: '800', letterSpacing: 0.5 }}>PAY</Text>
            <Icon name="link" color={t.accent} size={10} />
                          </Pressable>
                        ) : null}
                      </View>
                    </View>
                  </Pressable>
                  {canWrite ? (
                    <View style={{ alignItems: 'center', gap: 2 }}>
                      <IconBtn name="pencil" color={t.muted} onPress={() => navigation.navigate('MemberForm', { memberId: item.id })} />
                      {canPay ? (
                        <IconBtn
                          name={item.status === 'SUSPENDED' ? 'play' : 'pause'}
                          color={t.muted}
                          onPress={() => void pause(item.id, item.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED')}
                        />
                      ) : null}
                      <IconBtn name="trash" color={t.name === 'light' ? '#c81e1e' : '#ff6b6b'} onPress={() => setPendingDelete({ id: item.id, name: item.name })} />
                    </View>
                  ) : null}
                </View>
                {busyId === item.id ? (
                  <View style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(18,18,18,0.35)', alignItems: 'center', justifyContent: 'center' }}>
                    <ActivityIndicator color={t.accent} />
                  </View>
                ) : null}
              </View>
            );
          }}
          ListFooterComponent={
            <PaginationBar
              page={page}
              pageSize={PAGE_SIZE}
              hasMore={Boolean(nextCursor)}
              onPage={onPage}
            />
          }
        />
      )}
      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Delete member"
        message={`Delete ${pendingDelete?.name} from the gym and the face terminal? Attendance history is kept.`}
        confirmLabel="Delete"
        danger
        busy={deleting}
        onClose={() => { if (!deleting) setPendingDelete(null); }}
        onConfirm={() => void deleteMember()}
      />
    </View>
  );
}

function MemberSkeleton() {
  const t = useTheme();
  const bone = { backgroundColor: t.name === 'light' ? '#efe6e6' : '#242424', borderRadius: 8 };
  return (
    <View style={{ marginBottom: 10, borderRadius: 16, borderWidth: 1, borderColor: t.line, backgroundColor: t.card, paddingHorizontal: 10, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View style={{ width: 40, height: 40, borderRadius: 20, ...bone }} />
      <View style={{ flex: 1, gap: 6 }}>
        <View style={{ width: '58%', height: 12, ...bone }} />
        <View style={{ width: '78%', height: 9, ...bone }} />
        <View style={{ width: '42%', height: 8, ...bone }} />
      </View>
    </View>
  );
}
