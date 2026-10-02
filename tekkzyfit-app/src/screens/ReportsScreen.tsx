import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  buildMonthlySnapshot,
  fetchExpenses,
  fetchMonthlyReports,
  monthExpenseTotal,
  reportNet,
  saveMonthlyReport,
  withExpenseTotal,
} from '../api';
import { errorMessage } from '../errors';
import { formatDate, formatINR, monthBounds, monthKey, todayISO } from '../format';
import { useSyncing } from '../cache';
import { useGym } from '../GymContext';
import type { RootStackParamList } from '../nav';
import { ActionBar, ActionBtn, Hint, ListCard, PageTitle, ScreenPad, StatTile } from '../page';
import { useTheme } from '../theme';
import { DateField, Empty, ErrorText } from '../ui';

export function ReportsScreen({
  navigation: _navigation,
}: {
  navigation: NativeStackNavigationProp<RootStackParamList>;
}) {
  const t = useTheme();
  const { members, payments, attendance, expenses, setExpenses, reports, setReports, loading, error: loadError, refresh, loadPaymentMonth } = useGym();
  const bgSync = useSyncing();
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const today = todayISO();
  const [from, setFrom] = useState(`${today.slice(0, 7)}-01`);
  const [to, setTo] = useState(today);
  const month = monthKey(to || from || today);
  const payMonth = String(to || from || today).slice(0, 7);
  useEffect(() => {
    void loadPaymentMonth(payMonth).catch(() => undefined);
  }, [payMonth, loadPaymentMonth]);
  const snapshot = useMemo(
    () => buildMonthlySnapshot(month, members, payments, attendance, expenses),
    [month, members, payments, attendance, expenses],
  );
  const live = useRef({ month, payMonth, snapshot, reports });
  live.current = { month, payMonth, snapshot, reports };

  // Expenses and payments can change on the web or another phone, so reload them every time Reports opens
  // and store a fresh cloud-computed report for the month on screen.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setSyncing(true);
      void (async () => {
        try {
          const [nextExpenses] = await Promise.all([
            fetchExpenses(),
            loadPaymentMonth(live.current.payMonth, true).catch(() => undefined),
          ]);
          if (cancelled) return;
          setExpenses(nextExpenses);
          const { month: m, snapshot: snap, reports: stored } = live.current;
          const prev = stored.find((r) => r.month === m);
          const saved = await saveMonthlyReport({
            ...snap,
            totalExpense: monthExpenseTotal(m, nextExpenses),
            totalAttendance: Math.max(Number(prev?.totalAttendance || 0), Number(snap.totalAttendance || 0)),
          });
          const nextReports = await fetchMonthlyReports().catch(() => null);
          if (cancelled) return;
          const base = nextReports || live.current.reports;
          setReports([saved, ...base.filter((r) => r.month !== saved.month)]);
        } catch (err) {
          if (!cancelled) setError(errorMessage(err, 'Could not refresh the report'));
        } finally {
          if (!cancelled) setSyncing(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [loadPaymentMonth, setExpenses, setReports]),
  );
  const currentRaw = reports.find((r) => r.month === month) || snapshot;
  const current = withExpenseTotal(currentRaw, expenses);
  const table = (reports.length ? reports : current ? [current] : [])
    .filter((r) => {
      const bounds = monthBounds(String(r.month || ''));
      if (!bounds) return true;
      return bounds.start <= (to || from) && bounds.end >= (from || to);
    })
    .map((r) => withExpenseTotal(r, expenses));
  const totals = table.reduce(
    (sum, r) => ({
      totalAttendance: sum.totalAttendance + Number(r.totalAttendance || 0),
      totalMembers: Math.max(sum.totalMembers, Number(r.totalMembers || 0)),
      cashPayment: sum.cashPayment + Number(r.cashPayment || 0),
      upiPayment: sum.upiPayment + Number(r.upiPayment || 0),
      razorpayPayment: sum.razorpayPayment + Number(r.razorpayPayment || 0),
      totalExpense: sum.totalExpense + Number(r.totalExpense || 0),
      totalDiscontinued: sum.totalDiscontinued + Number(r.totalDiscontinued || 0),
    }),
    { totalAttendance: 0, totalMembers: 0, cashPayment: 0, upiPayment: 0, razorpayPayment: 0, totalExpense: 0, totalDiscontinued: 0 },
  );
  const shown = table.length === 1 ? table[0] : table.length ? totals : current;

  async function update() {
    setBusy(true);
    setError('');
    try {
      const prev = reports.find((r) => r.month === month);
      const merged = {
        ...snapshot,
        totalAttendance: Math.max(Number(prev?.totalAttendance || 0), Number(snapshot.totalAttendance || 0)),
        totalMembers: Number(snapshot.totalMembers || 0),
        cashPayment: Number(snapshot.cashPayment || 0),
        upiPayment: Number(snapshot.upiPayment || 0),
        razorpayPayment: Number(snapshot.razorpayPayment || 0),
        totalExpense: Number(snapshot.totalExpense || 0),
        totalDiscontinued: Number(snapshot.totalDiscontinued || 0),
      };
      const saved = await saveMonthlyReport(merged);
      setReports([saved, ...reports.filter((r) => r.month !== saved.month)]);
    } catch (err) {
      setError(errorMessage(err, 'Could not update the report'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: t.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <ScreenPad>
        <PageTitle>Reports</PageTitle>
        <ActionBar>
          <ActionBtn title={busy ? 'Updating…' : 'Reupdate'} primary busy={busy} onPress={() => void update()} />
        </ActionBar>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
          <View style={{ flex: 1 }}>
            <DateField value={from} onChange={setFrom} />
          </View>
          <View style={{ flex: 1 }}>
            <DateField value={to} onChange={setTo} />
          </View>
        </View>
        <Hint>{syncing ? 'Updating with the latest payments and expenses…' : 'Updates automatically when opened. Pick dates to filter months.'}</Hint>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          <StatTile label="Total members" value={shown?.totalMembers ?? 0} />
          <StatTile label="Cash" value={formatINR(shown?.cashPayment ?? 0)} />
          <StatTile label="UPI" value={formatINR(shown?.upiPayment ?? 0)} />
          <StatTile label="Razorpay" value={formatINR(shown?.razorpayPayment ?? 0)} />
          <StatTile label="Expense" value={formatINR(shown?.totalExpense ?? 0)} />
          <StatTile label="Net" value={formatINR(shown ? reportNet(shown) : 0)} />
          <StatTile label="Discontinued" value={shown?.totalDiscontinued ?? 0} />
        </View>
        <ErrorText text={error || loadError} />
      </ScreenPad>
      <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
        {table.length ? table.map((row) => (
          <ListCard key={row.month}>
            <Text style={{ color: t.text, fontSize: 14, fontWeight: '700' }}>{row.month}</Text>
            <View style={{ marginTop: 8, gap: 4 }}>
              <Meta label="Members" value={String(row.totalMembers)} />
              <Meta label="Cash" value={formatINR(row.cashPayment)} />
              <Meta label="UPI" value={formatINR(row.upiPayment ?? 0)} />
              <Meta label="Razorpay" value={formatINR(row.razorpayPayment)} />
              <Meta label="Expense" value={formatINR(row.totalExpense ?? 0)} />
              <Meta label="Net" value={formatINR(reportNet(row))} />
              <Meta label="Discontinued" value={String(row.totalDiscontinued)} />
              <Meta label="Updated" value={row.updatedAt ? formatDate(row.updatedAt) : '—'} />
            </View>
          </ListCard>
        )) : !loading ? <Empty text="No monthly report yet. Tap Reupdate to calculate and store this month." /> : null}
        <ActionBar>
          <ActionBtn title="Refresh" icon="refresh" busy={loading || syncing || bgSync} onPress={() => void refresh()} />
        </ActionBar>
      </View>
    </ScrollView>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
      <Text style={{ color: t.muted, fontSize: 12 }}>{label}</Text>
      <Text style={{ color: t.text, fontSize: 12, fontWeight: '600' }}>{value}</Text>
    </View>
  );
}
