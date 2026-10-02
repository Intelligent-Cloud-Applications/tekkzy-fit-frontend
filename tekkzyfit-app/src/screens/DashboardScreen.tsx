import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, ImageBackground, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { fetchDashboard, type Dashboard } from '../api';
import { swr, useSyncing } from '../cache';
import { addDays, formatINR, isPaid, isStaffMember, memberDue, paymentAmount, todayISO, ymd } from '../format';
import { font } from '../fonts';
import { useGym } from '../GymContext';
import { Icon } from '../icons';
import type { RootStackParamList } from '../nav';
import { PageTitle } from '../page';
import { useTheme } from '../theme';
import type { Expense, Member, Payment, User } from '../types';
import { isStaffRole } from '../types';

const HERO = require('../../assets/dashboard-hero.png');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DUE_WINDOW_DAYS = 7;

const inr = (n: number) => formatINR(Math.round(n));

function daysIn(ym: string) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function greeting() {
  const hour = Number(new Date().toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'Asia/Kolkata' }));
  if (hour < 12) return 'Good Morning';
  if (hour < 17) return 'Good Afternoon';
  return 'Good Evening';
}

/** Used until the /dashboard API answers (or if it is unreachable). */
function localDashboard(ym: string, members: Member[], staff: Member[], payments: Payment[], expenses: Expense[]): Dashboard {
  const today = todayISO();
  const dueBy = addDays(today, DUE_WINDOW_DAYS);
  const days = daysIn(ym);
  const income = Array(days).fill(0) as number[];
  const expense = Array(days).fill(0) as number[];
  const dues = { amount: 0, members: 0, withinDays: DUE_WINDOW_DAYS };
  const active = { count: 0, newThisMonth: 0 };
  for (const m of members) {
    if (isStaffMember(m)) continue;
    const status = String(m.status || 'ACTIVE').toUpperCase();
    const due = memberDue(m);
    if (status !== 'SUSPENDED' && (!due || due >= today)) active.count += 1;
    if (String(m.joinDate || '').startsWith(ym)) active.newThisMonth += 1;
    if (status !== 'SUSPENDED' && due && due >= today && due <= dueBy) {
      dues.members += 1;
      dues.amount += Number(m.amount || 0);
    }
  }
  for (const p of payments) {
    const day = ymd(p.date);
    if (!isPaid(p) || !day.startsWith(ym)) continue;
    income[Number(day.slice(8, 10)) - 1] += paymentAmount(p);
  }
  for (const e of expenses) {
    const day = ymd(e.date);
    if (!day.startsWith(ym)) continue;
    expense[Number(day.slice(8, 10)) - 1] += Number(e.amount || 0);
  }
  const team = staff.filter((s) => !['admin', 'manager', 'super_admin'].includes(String(s.cognitoRole || '').toLowerCase()));
  const trainers = team.filter((s) => String(s.staffRole || '').toLowerCase() === 'trainer').length;
  const totalIncome = income.reduce((a, b) => a + b, 0);
  const totalExpense = expense.reduce((a, b) => a + b, 0);
  return {
    month: ym,
    upcomingDues: dues,
    activeMembers: active,
    revenue: { income: totalIncome, expense: totalExpense, net: totalIncome - totalExpense, previousNet: 0, changePct: null },
    staff: { total: team.length, trainers, others: team.length - trainers },
    trend: { days, income, expense },
  };
}

export function DashboardScreen({
  navigation,
  user,
}: {
  navigation: NativeStackNavigationProp<RootStackParamList>;
  user?: User | null;
}) {
  const t = useTheme();
  const { members, staff, payments, expenses, refresh } = useGym();
  const month = todayISO().slice(0, 7);
  const [remote, setRemote] = useState<Dashboard | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const syncing = useSyncing();
  const showMoney = !isStaffRole(user?.role);

  const load = useCallback(async () => {
    try {
      await swr(`dashboard:${month}`, () => fetchDashboard(month), setRemote);
    } catch {
      /* keep the cached dashboard, or fall back to the local one */
    }
  }, [month]);

  useEffect(() => {
    void load();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void load();
    });
    return () => sub.remove();
  }, [load]);

  const local = useMemo(
    () => localDashboard(month, members, staff, payments, expenses),
    [month, members, staff, payments, expenses],
  );
  const data = remote?.month === month ? remote : local;

  async function onRefresh() {
    setRefreshing(true);
    await Promise.all([refresh().catch(() => null), load()]);
    setRefreshing(false);
  }

  const firstName = String(user?.name || '').trim().split(/\s+/)[0] || 'there';
  const change = data.revenue.changePct;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: t.bg }}
      contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8, gap: 10 }}
      refreshControl={<RefreshControl refreshing={refreshing || syncing} onRefresh={() => void onRefresh()} tintColor={t.accent} colors={[t.accent]} />}
    >
      <PageTitle>Dashboard</PageTitle>
      <HeroCard greeting={`${greeting()}, ${firstName}`} />

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        <StatCard
          icon="calendar"
          label="Upcoming Dues"
          value={inr(data.upcomingDues.amount)}
          sub={`${data.upcomingDues.members} members`}
          onPress={() => navigation.navigate('DashboardList', { kind: 'dues' })}
        />
        <StatCard
          icon="users"
          label="Active Members"
          value={data.activeMembers.count.toLocaleString('en-IN')}
          sub={`+${data.activeMembers.newThisMonth} this month`}
          subTone="ok"
          onPress={() => navigation.navigate('DashboardList', { kind: 'active' })}
          onSubPress={() => navigation.navigate('DashboardList', { kind: 'new' })}
        />
        {showMoney ? (
          <StatCard
            icon="wallet"
            label="Revenue After Expense"
            value={inr(data.revenue.net)}
            sub={change == null ? 'This month' : `${change >= 0 ? '+' : ''}${change}% this month`}
            subTone={change == null ? undefined : change >= 0 ? 'ok' : 'bad'}
            onPress={() => navigation.navigate('DashboardList', { kind: 'revenue' })}
          />
        ) : null}
        <StatCard
          icon="finger"
          label="Total Staffs"
          value={String(data.staff.total)}
          sub={`${data.staff.trainers} Trainers · ${data.staff.others} Others`}
          onPress={() => navigation.navigate('Staff')}
        />
      </View>

      {showMoney ? <RevenueTrend data={data} month={month} onOpen={() => navigation.navigate('DashboardList', { kind: 'revenue' })} /> : null}
    </ScrollView>
  );
}

function HeroCard({ greeting: text }: { greeting: string }) {
  const t = useTheme();
  return (
    <View style={{ borderRadius: 16, overflow: 'hidden', backgroundColor: '#000' }}>
      <ImageBackground source={HERO} resizeMode="cover" imageStyle={{ left: '22%' }} style={{ height: 104, justifyContent: 'center' }}>
        <View style={{ position: 'absolute', right: -24, bottom: -40, width: 20, height: 120, backgroundColor: t.accent, transform: [{ rotate: '35deg' }] }} />
        <View style={{ position: 'absolute', right: 18, bottom: -46, width: 8, height: 100, backgroundColor: t.accent, opacity: 0.85, transform: [{ rotate: '35deg' }] }} />
        <View style={{ paddingHorizontal: 16, maxWidth: '64%' }}>
          <Text numberOfLines={2} style={{ color: '#fff', fontFamily: font.display, fontSize: 17, lineHeight: 21, letterSpacing: -0.4 }}>{text}</Text>
          <Text numberOfLines={2} style={{ color: 'rgba(255,255,255,0.72)', fontSize: 11, marginTop: 4, lineHeight: 15 }}>
            Keep your members fitter and stronger.
          </Text>
        </View>
      </ImageBackground>
    </View>
  );
}

function StatCard({
  icon,
  label,
  value,
  sub,
  subTone,
  onPress,
  onSubPress,
}: {
  icon: string;
  label: string;
  value: string;
  sub: string;
  subTone?: 'ok' | 'bad';
  onPress?: () => void;
  onSubPress?: () => void;
}) {
  const t = useTheme();
  const subColor = subTone === 'ok' ? '#1f9d55' : subTone === 'bad' ? '#e5484d' : t.muted;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexGrow: 1,
        flexBasis: '46%',
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 16,
        backgroundColor: t.card,
        borderWidth: 1,
        borderColor: t.line,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <View style={{ width: 22, height: 22, borderRadius: 7, backgroundColor: t.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={icon} color={t.accent} size={12} />
        </View>
        <Text numberOfLines={1} style={{ flex: 1, color: t.muted, fontSize: 11, fontWeight: '700' }}>{label}</Text>
      </View>
      <Text numberOfLines={1} adjustsFontSizeToFit style={{ marginTop: 6, color: t.text, fontFamily: font.display, fontSize: 20, letterSpacing: -0.5 }}>
        {value}
      </Text>
      <Text
        numberOfLines={1}
        onPress={onSubPress}
        suppressHighlighting
        style={{ marginTop: 2, color: subColor, fontSize: 11, fontWeight: '600', textDecorationLine: onSubPress ? 'underline' : 'none' }}
      >
        {sub}
      </Text>
    </Pressable>
  );
}

type Week = { label: string; range: string; from: number; to: number; income: number; expense: number };

/** Splits the month into 1–7, 8–14, 15–21, 22–28 and 29–end. */
function weeksOf(income: number[], expense: number[], month: string): Week[] {
  const mon = MONTHS[Number(month.slice(5, 7)) - 1];
  const weeks: Week[] = [];
  for (let start = 0; start < income.length; start += 7) {
    const end = Math.min(start + 7, income.length);
    const add = (list: number[]) => list.slice(start, end).reduce((a, b) => a + b, 0);
    weeks.push({
      label: `W${weeks.length + 1}`,
      range: start + 1 === end ? `${mon} ${end}` : `${start + 1}–${end} ${mon}`,
      from: start + 1,
      to: end,
      income: add(income),
      expense: add(expense),
    });
  }
  return weeks;
}

function RevenueTrend({ data, month, onOpen }: { data: Dashboard; month: string; onOpen: () => void }) {
  const t = useTheme();
  const weeks = useMemo(() => weeksOf(data.trend.income, data.trend.expense, month), [data.trend, month]);
  const today = month === todayISO().slice(0, 7) ? Number(todayISO().slice(8, 10)) : data.trend.days;
  const currentWeek = Math.max(0, weeks.findIndex((w) => today >= w.from && today <= w.to));
  const [selected, setSelected] = useState<number | null>(null);
  const active = weeks[selected ?? currentWeek];
  const max = Math.max(1, ...weeks.map((w) => Math.max(w.income, w.expense)));
  const expenseColor = t.name === 'light' ? '#c9c2c2' : '#4a4545';

  return (
    <View style={{ flex: 1, minHeight: 200, borderRadius: 16, backgroundColor: t.card, borderWidth: 1, borderColor: t.line, padding: 12 }}>
      <Pressable onPress={onOpen} style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: t.muted, fontSize: 11, fontWeight: '700' }}>Revenue Trend · This Month</Text>
          <Text style={{ marginTop: 4, color: t.text, fontFamily: font.display, fontSize: 20, letterSpacing: -0.5 }}>{inr(data.revenue.net)}</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Legend color={t.accent} label="Income" />
          <Legend color={expenseColor} label="Expense" />
        </View>
      </Pressable>

      {active ? (
        <View
          style={{
            marginTop: 10,
            flexDirection: 'row',
            alignItems: 'center',
            borderRadius: 12,
            backgroundColor: t.name === 'light' ? '#f6f1f1' : t.input,
            paddingHorizontal: 10,
            paddingVertical: 7,
          }}
        >
          <Text style={{ flex: 1, color: t.muted, fontSize: 11, fontWeight: '700' }}>{active.range}</Text>
          <Text style={{ color: t.accent, fontSize: 12, fontWeight: '800' }}>{inr(active.income)}</Text>
          <Text style={{ color: t.muted, fontSize: 12, fontWeight: '700' }}>{'  ·  '}</Text>
          <Text style={{ color: t.text, fontSize: 12, fontWeight: '700' }}>{`−${inr(active.expense)}`}</Text>
        </View>
      ) : null}

      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'stretch', gap: 6, marginTop: 10 }}>
        {weeks.map((w, i) => {
          const on = active === w;
          return (
            <Pressable key={w.label} onPress={() => setSelected(i)} style={{ flex: 1, alignItems: 'center' }}>
              <View
                style={{
                  flex: 1,
                  width: '100%',
                  flexDirection: 'row',
                  alignItems: 'flex-end',
                  justifyContent: 'center',
                  gap: 3,
                  borderRadius: 10,
                  paddingTop: 4,
                  backgroundColor: on ? t.accentSoft : 'transparent',
                }}
              >
                <Bar value={w.income} max={max} color={t.accent} faded={!on} />
                <Bar value={w.expense} max={max} color={expenseColor} faded={!on} />
              </View>
              <Text style={{ marginTop: 5, color: on ? t.text : t.muted, fontSize: 10, fontWeight: on ? '800' : '600' }}>{w.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function Bar({ value, max, color, faded }: { value: number; max: number; color: string; faded: boolean }) {
  const pct = value > 0 ? Math.max(4, (value / max) * 100) : 0;
  return (
    <View
      style={{
        width: '32%',
        maxWidth: 14,
        height: `${pct}%`,
        minHeight: value > 0 ? 4 : 2,
        borderTopLeftRadius: 6,
        borderTopRightRadius: 6,
        borderBottomLeftRadius: 2,
        borderBottomRightRadius: 2,
        backgroundColor: color,
        opacity: value > 0 ? (faded ? 0.55 : 1) : 0.25,
      }}
    />
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <View style={{ width: 8, height: 8, borderRadius: 3, backgroundColor: color }} />
      <Text style={{ color: t.muted, fontSize: 10, fontWeight: '700' }}>{label}</Text>
    </View>
  );
}
