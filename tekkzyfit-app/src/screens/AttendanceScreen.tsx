import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Text, View } from 'react-native';
import { formatDate, formatTime, todayISO, ymd } from '../format';
import { useSyncing } from '../cache';
import { useGym } from '../GymContext';
import { fetchDeviceLogs } from '../device';
import { errorMessage } from '../errors';
import { ActionBar, ActionBtn, ChipText, ListCard, PageTitle, PaginationBar, ScreenPad, SearchBox } from '../page';
import { loadDeviceCreds } from '../session';
import { useTheme } from '../theme';
import { DateField, Empty, Select, StatusBadge } from '../ui';

const PAGE_SIZE = 20;

export function AttendanceScreen() {
  const t = useTheme();
  const { members, attendance, loading, refresh, mergeAttendance } = useGym();
  const syncing = useSyncing();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('ALL');
  const [type, setType] = useState('ALL');
  const [page, setPage] = useState(0);
  const today = todayISO();
  const weekAgo = (() => {
    const d = new Date(`${today}T00:00:00`);
    d.setDate(d.getDate() - 6);
    return d.toISOString().slice(0, 10);
  })();
  const [from, setFrom] = useState(weekAgo);
  const [to, setTo] = useState(today);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  const rows = useMemo(() => {
    return attendance.filter((row) => {
      const day = ymd(row.timestamp);
      const hay = `${row.memberName} ${row.memberCode || ''}`.toLowerCase();
      const rowStatus = String(row.status || '').toUpperCase();
      const rowType = String(row.type || '').toUpperCase();
      return (
        hay.includes(q.toLowerCase())
        && day >= from
        && day <= to
        && (status === 'ALL' || rowStatus === status)
        && (type === 'ALL' || rowType === type)
      );
    });
  }, [attendance, from, to, q, status, type]);

  const todayRows = attendance.filter((r) => ymd(r.timestamp) === today && String(r.status).toUpperCase() === 'GRANTED').length;
  const month = today.slice(0, 7);
  const monthRows = attendance.filter((r) => ymd(r.timestamp).startsWith(month) && String(r.status).toUpperCase() === 'GRANTED').length;
  const slice = rows.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  async function pullDevice() {
    setBusy(true);
    setNote('');
    try {
      const creds = await loadDeviceCreds();
      const logs = await fetchDeviceLogs(creds.host, creds.password);
      mergeAttendance(logs.filter((log) => log.time).map((log) => ({
        id: `dev-${log.enrollid}-${log.time}`,
        memberId: log.enrollid,
        memberName: log.name || members.find((m) => m.deviceEnrollId === log.enrollid)?.name || `User ${log.enrollid}`,
        memberCode: log.enrollid,
        timestamp: log.time,
        type: 'ENTRY',
        status: 'GRANTED',
      })));
      setNote(`${logs.length} punches from the face machine.`);
    } catch (err) {
      setNote(errorMessage(err, 'Could not read the face machine. Open Terminal and connect first.', 'device'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ScreenPad>
        <PageTitle>Attendance</PageTitle>
        <Text style={{ marginTop: 6, color: t.muted, fontSize: 12, fontWeight: '600' }}>
          Today {todayRows} · This range {rows.length} · This month {monthRows}
        </Text>
        <ActionBar>
          <ActionBtn title="Refresh" icon="refresh" busy={loading || syncing} onPress={() => void refresh()} />
          <ActionBtn title="Pull machine" primary busy={busy} onPress={() => void pullDevice()} />
        </ActionBar>
        {note ? <Text style={{ marginTop: 8, color: t.muted, fontSize: 12 }}>{note}</Text> : null}
        <SearchBox value={q} onChange={(value) => { setQ(value); setPage(0); }} placeholder="Member" />
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
          <View style={{ flex: 1 }}>
            <DateField value={from} onChange={(value) => { setFrom(value); setPage(0); }} />
          </View>
          <View style={{ flex: 1 }}>
            <DateField value={to} onChange={(value) => { setTo(value); setPage(0); }} />
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
          <View style={{ flex: 1 }}>
            <Select
              pill
              value={status}
              onChange={(value) => { setStatus(value); setPage(0); }}
              options={[
                { value: 'ALL', label: 'All statuses' },
                { value: 'GRANTED', label: 'Granted' },
                { value: 'DENIED', label: 'Denied' },
                { value: 'UNKNOWN', label: 'Unknown' },
                { value: 'EXPIRED', label: 'Expired' },
                { value: 'SUSPENDED', label: 'Suspended' },
              ]}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Select
              pill
              value={type}
              onChange={(value) => { setType(value); setPage(0); }}
              options={[
                { value: 'ALL', label: 'Entry / Exit' },
                { value: 'ENTRY', label: 'Entry' },
                { value: 'EXIT', label: 'Exit' },
              ]}
            />
          </View>
        </View>
      </ScreenPad>
      {loading && !rows.length ? <ActivityIndicator color={t.accent} style={{ marginTop: 32 }} /> : null}
      <FlatList
        data={slice}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, paddingTop: 10, paddingBottom: 16 }}
        ListEmptyComponent={!loading ? <Empty text="No attendance in this range." /> : null}
        ListFooterComponent={<PaginationBar page={page} pageSize={PAGE_SIZE} total={rows.length} onPage={setPage} />}
        renderItem={({ item }) => (
          <ListCard>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={{ color: t.text, fontSize: 15, fontWeight: '700' }}>{item.memberName}</Text>
                <Text style={{ marginTop: 2, color: t.muted, fontSize: 12 }}>
                  {formatDate(item.timestamp)} · {formatTime(item.timestamp)}
                </Text>
              </View>
              <StatusBadge compact value={item.status} />
            </View>
            <View style={{ marginTop: 10, flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              <ChipText>ID {item.memberCode || '—'}</ChipText>
              <ChipText>{item.type}</ChipText>
            </View>
          </ListCard>
        )}
      />
    </View>
  );
}
