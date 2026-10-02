import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import {
  fetchDashboardList,
  type DashboardExpenseRow,
  type DashboardListPage,
  type DashboardMemberRow,
  type DashboardPaymentRow,
} from '../api';
import { swr } from '../cache';
import { errorMessage } from '../errors';
import { formatDate, formatINR, initials, todayISO } from '../format';
import { font } from '../fonts';
import type { RootStackParamList } from '../nav';
import { PaginationBar } from '../page';
import { useTheme } from '../theme';
import { AddedByTag, Empty, ErrorText, Select, StatusBadge } from '../ui';
import { addedByOptions } from '../addedBy';
import { useGym } from '../GymContext';

type Props = NativeStackScreenProps<RootStackParamList, 'DashboardList'>;

const PAGE_SIZE = 20;
const TITLES = {
  dues: 'Upcoming Dues',
  active: 'Active Members',
  new: 'New This Month',
  revenue: 'Revenue After Expense',
} as const;

const inr = (n: number) => formatINR(Math.round(n));

export function DashboardListScreen({ navigation, route }: Props) {
  const t = useTheme();
  const { kind } = route.params;
  const month = todayISO().slice(0, 7);
  const [data, setData] = useState<DashboardListPage | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [type, setType] = useState<'payments' | 'expenses'>('payments');
  const [addedBy, setAddedBy] = useState('');
  const { staff } = useGym();
  const reqId = useRef(0);

  useLayoutEffect(() => {
    navigation.setOptions({ title: TITLES[kind] });
  }, [navigation, kind]);

  const load = useCallback(async (pageIndex: number, rowsType: 'payments' | 'expenses', by: string) => {
    const id = ++reqId.current;
    setLoading(true);
    setError('');
    try {
      await swr(
        `dash-list:${kind}:${kind === 'revenue' ? rowsType : ''}:${by}:${month}:${pageIndex}`,
        () => fetchDashboardList(kind, month, {
          offset: pageIndex * PAGE_SIZE,
          limit: PAGE_SIZE,
          type: kind === 'revenue' ? rowsType : undefined,
          addedBy: kind === 'revenue' ? undefined : by,
        }),
        (next) => {
          if (id !== reqId.current) return;
          setData(next);
          setLoading(false);
        },
      );
    } catch (err) {
      if (id === reqId.current) setError(errorMessage(err, 'Could not load this list'));
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, [kind, month]);

  useEffect(() => {
    void load(page, type, addedBy);
  }, [load, page, type, addedBy]);

  function switchAddedBy(next: string) {
    setPage(0);
    setAddedBy(next);
  }

  function switchType(next: 'payments' | 'expenses') {
    if (next === type) return;
    setPage(0);
    setType(next);
  }

  const total = data?.total ?? 0;
  const rows = data?.rows ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={{ padding: 16, paddingBottom: 8, gap: 10 }}>
        <ErrorText text={error} />
        {kind === 'revenue' ? (
          <>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Summary label="Income" value={inr(data?.income ?? 0)} />
              <Summary label="Expense" value={inr(data?.expense ?? 0)} />
              <Summary label="Net" value={inr((data?.income ?? 0) - (data?.expense ?? 0))} />
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {(['payments', 'expenses'] as const).map((key) => {
                const on = type === key;
                const count = key === 'payments' ? data?.paymentsCount : data?.expensesCount;
                return (
                  <Pressable
                    key={key}
                    onPress={() => switchType(key)}
                    style={{
                      flex: 1,
                      alignItems: 'center',
                      paddingVertical: 9,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: on ? t.accent : t.line,
                      backgroundColor: on ? t.accentSoft : t.card,
                    }}
                  >
                    <Text style={{ color: on ? t.accent : t.text, fontSize: 13, fontWeight: '700' }}>
                      {`${key === 'payments' ? 'Payments' : 'Expenses'}${count != null ? ` (${count})` : ''}`}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        ) : (
          <>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Summary label="Members" value={String(total)} />
              {kind === 'dues' ? <Summary label="Amount due" value={inr(data?.amount ?? 0)} /> : null}
            </View>
            {staff.length ? (
              <Select pill title="Added by" value={addedBy} onChange={switchAddedBy} options={addedByOptions(staff)} />
            ) : null}
          </>
        )}
      </View>

      {loading && !data ? (
        <ActivityIndicator color={t.accent} style={{ marginTop: 32 }} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, paddingTop: 4 }}
          ListEmptyComponent={!loading ? <Empty text={emptyText(kind, type)} /> : null}
          renderItem={({ item }) => {
            if (kind === 'revenue' && type === 'payments') {
              const p = item as DashboardPaymentRow;
              return (
                <Row
                  title={p.memberName || 'Member'}
                  sub={`${p.planName || 'Payment'} · ${formatDate(p.date)} · ${p.method || '—'}`}
                  amount={inr(p.amount)}
                  onPress={p.memberId ? () => navigation.navigate('MemberProfile', { memberId: p.memberId }) : undefined}
                />
              );
            }
            if (kind === 'revenue') {
              const e = item as DashboardExpenseRow;
              return <Row title={e.title} sub={`${e.category} · ${formatDate(e.date)} · ${e.method}`} amount={inr(e.amount)} negative />;
            }
            const m = item as DashboardMemberRow;
            return (
              <Row
                avatar={m.name}
                title={m.name}
                sub={`${m.planName || 'No plan'} · ${kind === 'new' ? `Joined ${formatDate(m.joinDate)}` : `Due ${formatDate(m.renewDate)}`} · ${m.phone || 'No phone'}`}
                amount={m.amount ? inr(m.amount) : undefined}
                badge={m.status}
                addedByName={m.addedByName}
                onPress={() => navigation.navigate('MemberProfile', { memberId: m.id })}
              />
            );
          }}
          ListFooterComponent={
            <View style={{ opacity: loading ? 0.5 : 1 }}>
              <PaginationBar page={page} pageSize={PAGE_SIZE} total={total} onPage={setPage} />
            </View>
          }
        />
      )}
    </View>
  );
}

function emptyText(kind: keyof typeof TITLES, type: 'payments' | 'expenses') {
  if (kind === 'revenue') return type === 'payments' ? 'No payments this month.' : 'No expenses this month.';
  return 'Nobody here right now.';
}

function Summary({ label, value }: { label: string; value: string }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 16, backgroundColor: t.card, borderWidth: 1, borderColor: t.line }}>
      <Text style={{ color: t.muted, fontSize: 11, fontWeight: '700' }}>{label}</Text>
      <Text numberOfLines={1} adjustsFontSizeToFit style={{ marginTop: 4, color: t.text, fontFamily: font.display, fontSize: 18, letterSpacing: -0.5 }}>{value}</Text>
    </View>
  );
}

function Row({
  avatar,
  title,
  sub,
  amount,
  badge,
  addedByName,
  negative,
  onPress,
}: {
  avatar?: string;
  title: string;
  sub: string;
  amount?: string;
  badge?: string;
  addedByName?: string;
  negative?: boolean;
  onPress?: () => void;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={{
        marginBottom: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: t.line,
        backgroundColor: t.card,
      }}
    >
      {avatar ? (
        <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: t.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: t.accent, fontSize: 13, fontWeight: '800' }}>{initials(avatar)}</Text>
        </View>
      ) : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ color: t.text, fontSize: 14, fontWeight: '700' }}>{title}</Text>
        <Text numberOfLines={1} style={{ marginTop: 2, color: t.muted, fontSize: 11 }}>{sub}</Text>
        {badge || addedByName ? (
          <View style={{ marginTop: 4, flexDirection: 'row', gap: 4 }}>
            {badge ? <StatusBadge compact value={badge} /> : null}
            {addedByName ? <AddedByTag name={addedByName} /> : null}
          </View>
        ) : null}
      </View>
      {amount ? (
        <Text style={{ color: negative ? (t.name === 'light' ? '#c81e1e' : '#ff6b6b') : t.text, fontSize: 14, fontWeight: '800' }}>
          {negative ? `−${amount}` : amount}
        </Text>
      ) : null}
    </Pressable>
  );
}
