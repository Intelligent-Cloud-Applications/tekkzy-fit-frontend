import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { logsToAttendance } from '../api';
import { errorMessage } from '../errors';
import { fetchDeviceLogs, fetchLiveDeviceLogs, loginDevice, type DeviceLog } from '../device';
import { formatDate, formatTime } from '../format';
import { useGym } from '../GymContext';
import type { RootStackParamList } from '../nav';
import { ChipText, ListCard, PageTitle, PaginationBar, ScreenPad, SearchBox } from '../page';
import { loadDeviceCreds } from '../session';
import { useTheme } from '../theme';
import { Empty, StatusBadge } from '../ui';

const PAGE_SIZE = 20;

function verifyLabel(mode?: string) {
  const n = Number(mode);
  if (n === 8) return 'Face';
  if (n === 1) return 'Fingerprint';
  if (n === 2) return 'Card';
  if (n === 3) return 'Password';
  return mode ? String(mode) : 'Device';
}

export function LogsScreen({ route }: NativeStackScreenProps<RootStackParamList, 'Logs'> | { route?: { params?: { q?: string } } }) {
  const t = useTheme();
  const { members, attendance, mergeAttendance, deviceStatus } = useGym();
  const [view, setView] = useState<'live' | 'history'>('live');
  const [q, setQ] = useState(route?.params?.q || '');
  const [page, setPage] = useState(0);
  const [logs, setLogs] = useState<DeviceLog[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const loadingRef = useRef(false);

  async function load(kind = view, quiet = false) {
    if (loadingRef.current) return;
    loadingRef.current = true;
    if (!quiet) setBusy(true);
    if (!quiet) setNote('');
    try {
      const creds = await loadDeviceCreds();
      await loginDevice(creds.host, creds.username, creds.password);
      const rows = kind === 'live'
        ? await fetchLiveDeviceLogs(creds.host, creds.password)
        : await fetchDeviceLogs(creds.host, creds.password);
      setLogs(rows);
      mergeAttendance(logsToAttendance(rows, members));
      setNote(rows.length ? `${rows.length} punches from the face machine.` : 'No punches on the machine yet.');
    } catch (err) {
      setNote(errorMessage(err, 'Connect the face machine first, then open Logs.', 'device'));
    } finally {
      loadingRef.current = false;
      setBusy(false);
    }
  }

  useEffect(() => {
    void load('live');
  }, []);

  useEffect(() => {
    if (view !== 'live' || deviceStatus !== 'connected') return;
    const timer = setInterval(() => void load('live', true), 8000);
    return () => clearInterval(timer);
  }, [view, deviceStatus]);

  const fallback = useMemo(() => attendance.map((row) => ({
    enrollid: String(row.memberCode || row.memberId || ''),
    name: row.memberName,
    time: row.timestamp,
  })), [attendance]);

  const source = logs.length ? logs : fallback;
  const rows = source.filter((row) => `${row.name} ${row.enrollid}`.toLowerCase().includes(q.toLowerCase()));
  const slice = rows.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ScreenPad>
        <PageTitle>Logs</PageTitle>
        <Text style={{ marginTop: 6, color: t.muted, fontSize: 12 }}>
          {view === 'live' ? 'Live punches from the face machine.' : 'Past scans stored on the machine.'}
        </Text>
        <View style={{ marginTop: 12, flexDirection: 'row', gap: 8 }}>
          {(['live', 'history'] as const).map((key) => (
            <Pressable
              key={key}
              onPress={() => {
                setView(key);
                setPage(0);
                void load(key);
              }}
              style={{
                flex: 1,
                height: 40,
                borderRadius: 999,
                backgroundColor: view === key ? t.accent : t.card,
                borderWidth: 1,
                borderColor: view === key ? t.accent : t.line,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: view === key ? t.accentInk : t.text, fontSize: 13, fontWeight: '700' }}>
                {key === 'live' ? 'Live' : 'History'}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <SearchBox
            style={{ flex: 1 }}
            value={q}
            onChange={(value) => { setQ(value); setPage(0); }}
            placeholder="Name or ID"
          />
          <Pressable
            onPress={() => void load(view)}
            style={{
              height: 40,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: t.line,
              backgroundColor: t.card,
              paddingHorizontal: 14,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {busy ? <ActivityIndicator color={t.accent} size="small" /> : <Text style={{ color: t.text, fontSize: 13, fontWeight: '700' }}>Refresh</Text>}
          </Pressable>
        </View>
        {note ? <Text style={{ marginTop: 8, color: t.muted, fontSize: 12 }}>{note}</Text> : null}
      </ScreenPad>
      <FlatList
        data={slice}
        keyExtractor={(item, index) => `${item.enrollid}-${item.time}-${index}`}
        contentContainerStyle={{ padding: 16, paddingTop: 10, paddingBottom: 16 }}
        ListEmptyComponent={!busy ? <Empty text="No punches yet. Scan a face on the terminal." /> : null}
        ListFooterComponent={<PaginationBar page={page} pageSize={PAGE_SIZE} total={rows.length} onPage={setPage} />}
        renderItem={({ item }) => (
          <ListCard>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={{ color: t.text, fontSize: 15, fontWeight: '700' }}>{item.name || `User ${item.enrollid}`}</Text>
                <Text style={{ marginTop: 2, color: t.muted, fontSize: 12 }}>
                  {formatDate(item.time)} · {formatTime(item.time) || item.time}
                </Text>
              </View>
              <StatusBadge compact value="GRANTED" />
            </View>
            <View style={{ marginTop: 10, flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              <ChipText>ID {item.enrollid || '—'}</ChipText>
              <ChipText>{verifyLabel(item.mode)}</ChipText>
              <ChipText>{Number(item.inout) === 1 ? 'Out' : 'In'}</ChipText>
            </View>
          </ListCard>
        )}
      />
    </View>
  );
}
