import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { fetchPaymentsPage, fetchPaymentSummary, type PaymentSummary } from '../api';
import { readCache, trackSync, useSyncing, writeCache } from '../cache';
import {
  displayPaymentId,
  formatDateShort,
  formatINR,
  memberDue,
  methodLabel,
  paymentAmount,
  paymentBelongsToMember,
  todayISO,
} from '../format';
import { useGym } from '../GymContext';
import { errorMessage, openExternal } from '../errors';
import type { RootStackParamList } from '../nav';
import { Icon } from '../icons';
import { InvoiceShareIcons } from '../InvoiceShareIcons';
import { PageTitle, PaginationBar, ScreenPad, SearchBox } from '../page';
import { useTheme } from '../theme';
import type { Member, Payment } from '../types';
import { Empty, ErrorText, Select, StatusBadge } from '../ui';

const PAGE_SIZE = 20;

function monthLabel(ym: string) {
  const [y, m] = ym.split('-').map(Number);
  if (!y || !m) return ym;
  return new Date(y, m - 1, 1).toLocaleString('en-IN', { month: 'short', year: 'numeric' });
}

function dueMonthOptions() {
  const now = new Date(`${todayISO()}T00:00:00`);
  const rows: Array<{ value: string; label: string }> = [{ value: 'ALL', label: 'All due months' }];
  for (let i = -2; i <= 6; i += 1) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = i === 0 ? `This month (${monthLabel(value)})` : monthLabel(value);
    rows.push({ value, label });
  }
  return rows;
}

function payMonthOptions() {
  const now = new Date(`${todayISO()}T00:00:00`);
  const rows: Array<{ value: string; label: string }> = [];
  for (let i = 0; i < 12; i += 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    rows.push({ value, label: i === 0 ? `This month (${monthLabel(value)})` : monthLabel(value) });
  }
  return rows;
}

export function PaymentsScreen({
  navigation,
}: {
  navigation: NativeStackNavigationProp<RootStackParamList>;
}) {
  const t = useTheme();
  const { members, loading: appLoading, error: appError, refresh } = useGym();
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('ALL');
  const [mode, setMode] = useState('ALL');
  const [dueMonth, setDueMonth] = useState('ALL');
  const [payMonth, setPayMonth] = useState(todayISO().slice(0, 7));
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<Payment[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [summary, setSummary] = useState<PaymentSummary | null>(null);
  const [listLoading, setListLoading] = useState(false);
  const [moreLoading, setMoreLoading] = useState(false);
  const [listError, setListError] = useState('');
  const syncing = useSyncing();
  const requestId = useRef(0);
  const monthChoices = useMemo(() => dueMonthOptions(), []);
  const payMonthChoices = useMemo(() => payMonthOptions(), []);
  const showingDue = dueMonth !== 'ALL';
  const loading = showingDue ? appLoading : listLoading;
  const error = showingDue ? appError : listError;

  useEffect(() => {
    const timer = setTimeout(() => setQuery(q.trim()), 350);
    return () => clearTimeout(timer);
  }, [q]);

  const loadFirst = useCallback(async () => {
    const id = ++requestId.current;
    setListLoading(true);
    setListError('');
    const cacheKey = query ? '' : `payments:${payMonth}:${status}:${mode}`;
    try {
      if (cacheKey) {
        const cached = await readCache<{ items: Payment[]; cursor: string | null; summary: PaymentSummary | null }>(cacheKey);
        if (cached && id === requestId.current) {
          setRows(cached.value.items);
          setCursor(cached.value.cursor);
          if (cached.value.summary) setSummary(cached.value.summary);
          setListLoading(false);
        }
      }
      const [first, sum] = await trackSync(Promise.all([
        fetchPaymentsPage({ month: payMonth, q: query, status, method: mode, limit: PAGE_SIZE }),
        fetchPaymentSummary(payMonth).catch(() => null),
      ]));
      if (cacheKey) writeCache(cacheKey, { items: first.items, cursor: first.cursor, summary: sum });
      if (id !== requestId.current) return;
      setRows(first.items);
      setCursor(first.cursor);
      if (sum) setSummary(sum);
    } catch (err) {
      if (id === requestId.current) setListError(errorMessage(err, 'Could not load payments'));
    } finally {
      if (id === requestId.current) setListLoading(false);
    }
  }, [payMonth, query, status, mode]);

  async function loadMore() {
    if (!cursor || moreLoading || listLoading) return;
    const id = requestId.current;
    setMoreLoading(true);
    try {
      const next = await fetchPaymentsPage({ month: payMonth, q: query, status, method: mode, cursor, limit: PAGE_SIZE });
      if (id !== requestId.current) return;
      setRows((prev) => [...prev, ...next.items.filter((row) => !prev.some((p) => p.id === row.id))]);
      setCursor(next.cursor);
    } catch {
      /* keep loaded rows; user can scroll again */
    } finally {
      setMoreLoading(false);
    }
  }

  useEffect(() => {
    if (!showingDue) void loadFirst();
  }, [loadFirst, showingDue]);

  const firstFocus = useRef(true);
  useEffect(() => navigation.addListener('focus', () => {
    if (firstFocus.current) {
      firstFocus.current = false;
      return;
    }
    if (!showingDue) void loadFirst();
  }), [navigation, loadFirst, showingDue]);

  const dueMembers = useMemo(() => {
    if (dueMonth === 'ALL') return [] as Member[];
    const query = q.trim().toLowerCase();
    return members
      .filter((m) => {
        const due = memberDue(m);
        if (!due || !due.startsWith(dueMonth)) return false;
        if (!query) return true;
        return `${m.name} ${m.phone || ''} ${m.email || ''} ${m.planName || ''}`.toLowerCase().includes(query);
      })
      .sort((a, b) => String(memberDue(a)).localeCompare(String(memberDue(b))));
  }, [members, dueMonth, q]);

  useEffect(() => {
    setPage(0);
  }, [dueMembers[0]?.id, q, dueMonth]);

  const month = todayISO().slice(0, 7);
  const renewalsDue = members.filter((m) => {
    const due = memberDue(m);
    return Boolean(due && due.startsWith(month));
  }).length;
  const memberSlice = dueMembers.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const isThisMonth = payMonth === month;
  const smallStats = [
    { label: 'Pending', value: summary?.pending ?? 0 },
    { label: 'Failed', value: summary?.failed ?? 0 },
    { label: 'Due', value: renewalsDue },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ScreenPad>
        <PageTitle>{showingDue ? 'Due this month' : 'Payment History'}</PageTitle>
        <View style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Select
              pill
              title="Due month"
              value={dueMonth}
              onChange={(value) => { setDueMonth(value); setPage(0); }}
              options={monthChoices}
            />
          </View>
          {!showingDue ? (
            <View style={{ flex: 1 }}>
              <Select
                pill
                title="Payment month"
                value={payMonth}
                onChange={(value) => { setPayMonth(value); setPage(0); }}
                options={payMonthChoices}
              />
            </View>
          ) : null}
          <Pressable
            onPress={() => navigation.navigate('PaymentForm', {})}
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
        </View>
        <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <SearchBox
            style={{ flex: 1 }}
            value={q}
            onChange={(value) => { setQ(value); setPage(0); }}
            placeholder={showingDue ? 'Member name or phone' : 'Search'}
          />
          {!showingDue ? (
            <View style={{ width: 104 }}>
              <Select
                pill
                title="Payment mode"
                value={mode}
                onChange={(value) => { setMode(value); setPage(0); }}
                options={[
                  { value: 'ALL', label: 'All modes' },
                  { value: 'ONLINE', label: 'Online' },
                  { value: 'OFFLINE', label: 'Offline (Cash + UPI)' },
                  { value: 'CASH', label: 'Cash' },
                  { value: 'UPI', label: 'UPI' },
                ]}
              />
            </View>
          ) : null}
          <Pressable
            onPress={() => void (showingDue ? refresh() : loadFirst())}
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
        <View
          style={{
            marginTop: 10,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: t.line,
            backgroundColor: t.accentSoft,
            flexDirection: 'row',
            alignItems: 'center',
            paddingVertical: 8,
          }}
        >
          <View style={{ flex: 1.15, minWidth: 0, alignItems: 'center', paddingHorizontal: 4 }}>
            <Text numberOfLines={1} style={{ color: t.muted, fontSize: 10, fontWeight: '600' }}>Today</Text>
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={{ marginTop: 3, color: t.text, fontSize: 14, fontWeight: '700' }}>
              {isThisMonth ? formatINR(Math.round(summary?.today || 0)) : '—'}
            </Text>
          </View>
          <View style={{ width: 1, alignSelf: 'stretch', backgroundColor: t.line }} />
          <View style={{ flex: 1.45, minWidth: 0, alignItems: 'center', paddingHorizontal: 4 }}>
            <Text numberOfLines={1} style={{ color: t.muted, fontSize: 10, fontWeight: '600' }}>{isThisMonth ? 'This Month' : monthLabel(payMonth)}</Text>
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={{ marginTop: 3, color: t.text, fontSize: 14, fontWeight: '700' }}>
              {formatINR(Math.round(summary?.revenue || 0))}
            </Text>
          </View>
          <View style={{ width: 1, alignSelf: 'stretch', backgroundColor: t.line }} />
          <View style={{ flex: 1.6, minWidth: 0, flexDirection: 'row', alignItems: 'center', paddingLeft: 6, paddingRight: 2 }}>
            <Icon name="chart" color={t.muted} size={13} />
            {smallStats.map((s) => (
              <View key={s.label} style={{ flex: 1, minWidth: 0, alignItems: 'center' }}>
                <Text numberOfLines={1} style={{ color: t.muted, fontSize: 9, fontWeight: '600' }}>{s.label}</Text>
                <Text numberOfLines={1} style={{ marginTop: 3, color: t.text, fontSize: 12, fontWeight: '700' }}>{s.value}</Text>
              </View>
            ))}
          </View>
        </View>
      </ScreenPad>
      {loading && !(showingDue ? members.length : rows.length) ? <ActivityIndicator color={t.accent} style={{ marginTop: 32 }} /> : null}
      {showingDue ? (
        <FlatList
          data={memberSlice}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, paddingTop: 10, paddingBottom: 16 }}
          ListEmptyComponent={!loading ? <Empty text="No members due in this month." /> : null}
          ListFooterComponent={<PaginationBar page={page} pageSize={PAGE_SIZE} total={dueMembers.length} onPage={setPage} />}
          renderItem={({ item }) => {
            const due = memberDue(item);
            const pay = String(item.paymentStatus || '').toUpperCase() || '—';
            return (
              <Pressable
                onPress={() => navigation.navigate('PaymentForm', { memberId: item.id })}
                style={{
                  marginBottom: 8,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: t.line,
                  backgroundColor: t.card,
                  paddingHorizontal: 12,
                  paddingVertical: 9,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={{ color: t.text, fontSize: 14, fontWeight: '700' }}>
                      {item.name}
                    </Text>
                    <Text numberOfLines={1} style={{ marginTop: 2, color: t.muted, fontSize: 11 }}>
                      {[item.planName || 'No plan', item.phone || ''].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <Text style={{ color: t.text, fontSize: 13, fontWeight: '800' }}>
                      Due {formatDateShort(due)}
                    </Text>
                    <StatusBadge compact value={pay} />
                  </View>
                </View>
              </Pressable>
            );
          }}
        />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, paddingTop: 10, paddingBottom: 16 }}
          onEndReached={() => void loadMore()}
          onEndReachedThreshold={0.4}
          ListEmptyComponent={!loading ? <Empty text="No records found" /> : null}
          ListFooterComponent={
            moreLoading
              ? <ActivityIndicator color={t.accent} style={{ marginVertical: 12 }} />
              : cursor
                ? (
                  <Pressable onPress={() => void loadMore()} style={{ alignSelf: 'center', marginVertical: 10, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: t.line, backgroundColor: t.card }}>
                    <Text style={{ color: t.text, fontSize: 12, fontWeight: '700' }}>Load more</Text>
                  </Pressable>
                )
                : rows.length
                  ? <Text style={{ textAlign: 'center', color: t.muted, fontSize: 11, marginVertical: 10 }}>{`${rows.length} of ${summary?.count ?? rows.length} payments`}</Text>
                  : null
          }
          renderItem={({ item }) => {
            const member = members.find((m) => paymentBelongsToMember(item, m));
            const unpaid = Boolean(item.paymentLinkUrl) && String(item.status).toUpperCase() !== 'PAID';
            const paidOn = formatDateShort(item.date);
            const renew = formatDateShort(item.renewDate || member?.renewDate);
            const invoice = item.invoiceNumber ? String(item.invoiceNumber) : '';
            const details = [
              member?.planName || '',
              methodLabel(item.method),
              paidOn ? `Paid ${paidOn}` : '',
              renew ? `Renew ${renew}` : '',
              invoice ? `Inv ${invoice}` : '',
            ].filter(Boolean);

            return (
              <Pressable
                onPress={() => navigation.navigate('PaymentDetail', { paymentId: item.id })}
                style={{
                  marginBottom: 8,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: t.line,
                  backgroundColor: t.card,
                  paddingHorizontal: 12,
                  paddingVertical: 9,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={{ color: t.accent, fontSize: 12, fontWeight: '800' }}>
                      {displayPaymentId(item)}
                    </Text>
                    <Text numberOfLines={1} style={{ marginTop: 2, color: t.text, fontSize: 14, fontWeight: '700' }}>
                      {member?.name || item.memberName || '—'}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <Text style={{ color: t.text, fontSize: 15, fontWeight: '800' }}>
                      {formatINR(item.netAmount ?? paymentAmount(item))}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <StatusBadge compact value={item.status} />
                      {unpaid ? (
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
                          <Text style={{ color: t.accent, fontSize: 9, fontWeight: '800', letterSpacing: 0.5 }}>LINK</Text>
                          <Icon name="link" color={t.accent} size={10} />
                        </Pressable>
                      ) : null}
                    </View>
                  </View>
                </View>
                {details.length || item.status === 'PAID' ? (
                  <View style={{ marginTop: 6, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text numberOfLines={2} style={{ flex: 1, color: t.muted, fontSize: 11, lineHeight: 15 }}>
                      {details.join('  ·  ')}
                    </Text>
                    {item.status === 'PAID' ? <InvoiceShareIcons member={member} payment={item} size={30} /> : null}
                  </View>
                ) : null}
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}
