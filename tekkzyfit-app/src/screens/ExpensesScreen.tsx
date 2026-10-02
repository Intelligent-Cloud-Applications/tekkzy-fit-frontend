import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { removeExpense } from '../api';
import { ConfirmDialog } from '../confirm';
import { errorMessage } from '../errors';
import { formatDate, formatINR } from '../format';
import { useSyncing } from '../cache';
import { useGym } from '../GymContext';
import { Icon } from '../icons';
import type { RootStackParamList } from '../nav';
import { IconBtn, PageTitle, PaginationBar, ScreenPad, SearchBox } from '../page';
import { pushToast } from '../toast';
import { useTheme } from '../theme';
import { Empty, ErrorText, Select } from '../ui';
import type { ExpenseCategory } from '../types';

const PAGE_SIZE = 15;
const CATEGORIES: Array<ExpenseCategory | 'ALL'> = [
  'ALL', 'Rent', 'Salary', 'Electricity', 'Water', 'Maintenance', 'Equipment', 'Supplies', 'Marketing', 'Cleaning', 'Other',
];
const MONTHS = [
  { value: '01', label: 'Jan' },
  { value: '02', label: 'Feb' },
  { value: '03', label: 'Mar' },
  { value: '04', label: 'Apr' },
  { value: '05', label: 'May' },
  { value: '06', label: 'Jun' },
  { value: '07', label: 'Jul' },
  { value: '08', label: 'Aug' },
  { value: '09', label: 'Sep' },
  { value: '10', label: 'Oct' },
  { value: '11', label: 'Nov' },
  { value: '12', label: 'Dec' },
];

function methodLabel(method?: string) {
  const value = String(method || '').toUpperCase();
  if (value === 'CASH') return 'Cash';
  if (value === 'UPI') return 'UPI';
  if (value === 'CARD') return 'Card';
  if (value === 'BANK') return 'Bank';
  return value || '—';
}

function nowParts() {
  const today = new Date().toISOString().slice(0, 10);
  return { year: today.slice(0, 4), month: today.slice(5, 7), today };
}

export function ExpensesScreen({
  navigation,
}: {
  navigation: NativeStackNavigationProp<RootStackParamList>;
}) {
  const t = useTheme();
  const { expenses, loading, error, refresh, setExpenses } = useGym();
  const syncing = useSyncing();
  const now = nowParts();
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('ALL');
  const [year, setYear] = useState(now.year);
  const [month, setMonth] = useState(now.month);
  const [page, setPage] = useState(0);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const yearOptions = useMemo(() => {
    const years = new Set<string>([now.year]);
    for (const row of expenses) {
      const y = String(row.date || '').slice(0, 4);
      if (/^\d{4}$/.test(y)) years.add(y);
    }
    return ['ALL', ...Array.from(years).sort((a, b) => b.localeCompare(a))];
  }, [expenses, now.year]);

  const rows = useMemo(() => {
    return expenses.filter((row) => {
      const date = String(row.date || '');
      const hay = `${row.title} ${row.category} ${row.notes || ''}`.toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
      if (category !== 'ALL' && row.category !== category) return false;
      if (year !== 'ALL' && !date.startsWith(year)) return false;
      if (month !== 'ALL' && date.slice(5, 7) !== month) return false;
      return true;
    });
  }, [expenses, q, category, year, month]);

  useEffect(() => {
    setPage(0);
  }, [rows[0]?.id, q, category, year, month]);

  const currentMonthKey = now.today.slice(0, 7);
  const todaySpend = expenses.filter((row) => row.date === now.today).reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const monthSpend = expenses.filter((row) => String(row.date).startsWith(currentMonthKey)).reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const filteredSpend = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const slice = rows.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const kpis = [
    { label: 'Today', value: formatINR(todaySpend) },
    { label: 'This month', value: formatINR(monthSpend) },
    { label: 'Filtered', value: formatINR(filteredSpend) },
    { label: 'Records', value: String(rows.length) },
  ];

  async function onDelete() {
    if (!confirm) return;
    setBusy(true);
    try {
      await removeExpense(confirm);
      setExpenses(expenses.filter((row) => row.id !== confirm));
      pushToast({ kind: 'success', title: 'Expense deleted' });
      setConfirm(null);
    } catch (err) {
      pushToast({ kind: 'error', title: errorMessage(err, 'Could not delete expense') });
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ScreenPad>
        <PageTitle>Expenses</PageTitle>
        <View style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Select
              pill
              title="Filter expenses"
              value={category}
              onChange={(value) => { setCategory(value); setPage(0); }}
              options={CATEGORIES.map((item) => ({ value: item, label: item === 'ALL' ? 'All' : item }))}
            />
          </View>
          <Pressable
            onPress={() => navigation.navigate('ExpenseForm', {})}
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
            <Text style={{ color: t.accentInk, fontSize: 13, fontWeight: '700' }}>Add expense</Text>
          </Pressable>
        </View>
        <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Select
              pill
              title="Year"
              value={year}
              onChange={(value) => { setYear(value); setPage(0); }}
              options={yearOptions.map((item) => ({ value: item, label: item === 'ALL' ? 'All years' : item }))}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Select
              pill
              title="Month"
              value={month}
              onChange={(value) => { setMonth(value); setPage(0); }}
              options={[{ value: 'ALL', label: 'All months' }, ...MONTHS]}
            />
          </View>
        </View>
        <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <SearchBox
            style={{ flex: 1 }}
            value={q}
            onChange={(value) => { setQ(value); setPage(0); }}
            placeholder="Search"
          />
          <Pressable
            onPress={() => void refresh()}
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
            backgroundColor: t.card,
            flexDirection: 'row',
            overflow: 'hidden',
          }}
        >
          {kpis.map((item, index) => (
            <View
              key={item.label}
              style={{
                flex: 1,
                minWidth: 0,
                paddingVertical: 8,
                paddingHorizontal: 4,
                alignItems: 'center',
                borderLeftWidth: index ? 1 : 0,
                borderLeftColor: t.line,
              }}
            >
              <Text numberOfLines={1} style={{ color: t.muted, fontSize: 9, fontWeight: '800', letterSpacing: 0.2 }}>
                {item.label}
              </Text>
              <Text numberOfLines={1} style={{ marginTop: 4, color: t.text, fontSize: 11, fontWeight: '800' }}>
                {item.value}
              </Text>
            </View>
          ))}
        </View>
      </ScreenPad>
      {loading && !expenses.length ? <ActivityIndicator color={t.accent} style={{ marginTop: 32 }} /> : null}
      <FlatList
        data={slice}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, paddingTop: 10, paddingBottom: 16 }}
        ListEmptyComponent={!loading ? <Empty text="No expenses yet" /> : null}
        ListFooterComponent={<PaginationBar page={page} pageSize={PAGE_SIZE} total={rows.length} onPage={setPage} />}
        renderItem={({ item }) => (
          <View
            style={{
              marginBottom: 8,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: t.line,
              backgroundColor: t.card,
              paddingHorizontal: 12,
              paddingVertical: 10,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
              <Text numberOfLines={1} style={{ flex: 1, color: t.accent, fontSize: 12, fontWeight: '800' }}>
                {item.category}
              </Text>
              <Text style={{ color: t.text, fontSize: 15, fontWeight: '800' }}>{formatINR(item.amount)}</Text>
            </View>
            <Text numberOfLines={1} style={{ marginTop: 4, color: t.text, fontSize: 14, fontWeight: '700' }}>
              {item.title}
            </Text>
            <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
              <Text numberOfLines={2} style={{ flex: 1, minWidth: 0, color: t.muted, fontSize: 11, lineHeight: 15 }}>
                {[formatDate(item.date), methodLabel(item.method), item.notes].filter(Boolean).join('  ·  ')}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <IconBtn name="pencil" color={t.muted} onPress={() => navigation.navigate('ExpenseForm', { expenseId: item.id })} />
                <IconBtn name="trash" color={t.name === 'light' ? '#c81e1e' : '#ff6b6b'} onPress={() => setConfirm(item.id)} />
              </View>
            </View>
          </View>
        )}
      />
      <ConfirmDialog
        open={Boolean(confirm)}
        title="Delete expense"
        message="This expense will be removed from the gym record."
        danger
        confirmLabel="Delete"
        busy={busy}
        onClose={() => setConfirm(null)}
        onConfirm={() => void onDelete()}
      />
    </View>
  );
}
