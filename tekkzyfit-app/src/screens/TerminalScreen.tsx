import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Linking, Pressable, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { deviceKind } from '../config';
import {
  connectAndLoadUsers,
  downloadDeviceFace,
  fetchDeviceUsers,
  getDeviceKind,
  hostOnLan,
  lanPrefix,
  listDeviceFaceUrls,
  phoneLanIp,
  sameLan,
  type DeviceUser,
  type ProbeResult,
} from '../device';
import { errorMessage } from '../errors';
import { fetchMembers, importDeviceUsersToCloud, persistDeviceEnrolls, saveMemberPhoto } from '../api';
import { Icon } from '../icons';
import { AppSheet } from '../sheet';
import type { Member } from '../types';
import { useGym } from '../GymContext';
import { syncCloudMembersToDevice } from '../deviceQueue';
import { isDeviceSetupDone, loadDeviceCreds, saveDeviceCreds } from '../session';
import type { RootStackParamList } from '../nav';
import { ActionBar, ActionBtn, Hint, ListCard, PageTitle } from '../page';
import { useTheme } from '../theme';
import { Field, Label, StatusBadge, row } from '../ui';

export function TerminalScreen({
  navigation,
}: {
  navigation: NativeStackNavigationProp<RootStackParamList>;
}) {
  const t = useTheme();
  const { members, setMembers, markDeviceConnected, deviceStatus } = useGym();
  const deviceStatusRef = useRef(deviceStatus);
  deviceStatusRef.current = deviceStatus;
  const [host, setHost] = useState('');
  const [savedHost, setSavedHost] = useState('');
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState(deviceKind() === 'hikvision' ? '' : '2323');
  const [lanIp, setLanIp] = useState('');
  const [lanReady, setLanReady] = useState(false);
  const [busy, setBusy] = useState('');
  const [probe, setProbe] = useState<ProbeResult | null>(null);
  const [users, setUsers] = useState<DeviceUser[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const connecting = useRef(false);
  const credsRef = useRef({ host: '', username: 'admin', password: '2323' });
  const membersRef = useRef(members);
  membersRef.current = members;

  async function refreshPhoneIp() {
    const phone = await phoneLanIp();
    setLanIp(phone);
    setLanReady(true);
    return phone;
  }

  const autoConnect = useCallback(async (preferHost = '', saved?: { username: string; password: string }) => {
    if (connecting.current) return;
    connecting.current = true;
    setBusy(preferHost ? 'connect' : 'scan');
    setProbe({ host: preferHost, ok: false, message: preferHost ? `Signing in at ${preferHost}…` : 'Looking for the terminal…' });
    try {
      // The focus effect runs a stale closure, so it must pass the saved login instead of form state.
      const login = saved || { username, password };
      credsRef.current = { ...credsRef.current, ...login, host: preferHost || credsRef.current.host };
      const { username: user, password: pass } = credsRef.current;
      const next = await connectAndLoadUsers(preferHost, user, pass, (text) => {
        setProbe({ host: preferHost, ok: false, message: text });
      });
      setProbe(next.probe);
      if (!next.probe.ok) {
        markDeviceConnected(false);
        return;
      }
      setHost(next.probe.host);
      setSavedHost(next.probe.host);
      credsRef.current.host = next.probe.host;
      await saveDeviceCreds({
        host: next.probe.host,
        username: user,
        password: pass,
        kind: getDeviceKind() || undefined,
        setup: 'done',
      });
      markDeviceConnected(true);
      setBusy('');
      const list = await fetchDeviceUsers(next.probe.host, pass).catch(() => next.users);
      setUsers(list);
      setProbe({
        ...next.probe,
        message: `${next.probe.message}. ${list.length} ${list.length === 1 ? 'person' : 'people'} on the machine.`,
      });
      const source = membersRef.current;
      const flushed = await syncCloudMembersToDevice(source).catch(() => null);
      if (flushed?.updates.length) {
        setMembers(await persistDeviceEnrolls(source, flushed.updates));
      }
      if (flushed?.message) {
        setProbe((prev) => (prev ? { ...prev, message: `${prev.message}. ${flushed.message}` } : prev));
      }
    } catch (err) {
      markDeviceConnected(false);
      setProbe({ host: preferHost, ok: false, message: errorMessage(err, 'Could not connect', 'device') });
    } finally {
      connecting.current = false;
      setBusy('');
    }
  }, [markDeviceConnected, password, setMembers, username]);

  useFocusEffect(
    useCallback(() => {
      const failSafe = setTimeout(() => setLanReady(true), 2000);
      void (async () => {
        const creds = await loadDeviceCreds();
        credsRef.current = creds;
        setUsername(creds.username);
        setPassword(creds.password);
        const phone = await refreshPhoneIp();
        const onThisLan = Boolean(phone && creds.host && sameLan(creds.host, phone));
        const remembered = onThisLan ? creds.host : hostOnLan(creds.host, phone);
        setSavedHost(remembered || creds.host);
        if (deviceStatusRef.current === 'connected' && creds.host) {
          setHost(creds.host);
          setProbe({ host: creds.host, ok: true, message: `Connected at ${creds.host}` });
          const list = await fetchDeviceUsers(creds.host, creds.password).catch(() => []);
          setUsers(list);
          if (list.length) {
            setProbe({ host: creds.host, ok: true, message: `Connected at ${creds.host}. ${list.length} ${list.length === 1 ? 'person' : 'people'} on the machine.` });
          }
          return;
        }
        if (isDeviceSetupDone(creds)) {
          await autoConnect(onThisLan ? creds.host : '', { username: creds.username, password: creds.password });
        }
      })().finally(() => clearTimeout(failSafe));
      return () => clearTimeout(failSafe);
    }, []),
  );

  async function retryConnect() {
    connecting.current = false;
    credsRef.current = { ...credsRef.current, host, username, password };
    await autoConnect(host.trim() || savedHost);
  }

  async function scanWifi() {
    connecting.current = false;
    credsRef.current = { ...credsRef.current, username, password };
    // Empty host forces a LAN scan — same path that works for you every time.
    await autoConnect('');
  }

  async function ensureConnected(task: string) {
    let ip = host.trim() || savedHost;
    let pass = password;
    if (!probe?.ok) {
      setProbe({ host: ip, ok: false, message: 'Connecting to the face machine…' });
      connecting.current = false;
      credsRef.current = { ...credsRef.current, host: ip, username, password: pass };
      await autoConnect(ip);
      setBusy(task);
      ip = credsRef.current.host || ip;
      pass = credsRef.current.password || pass;
    }
    return { ip, pass };
  }

  async function copyMachineToCloud() {
    setBusy('pull');
    try {
      const { ip, pass } = await ensureConnected('pull');
      const list = await fetchDeviceUsers(ip, pass);
      setUsers(list);
      setProbe({
        host: ip,
        ok: true,
        message: `Adding ${list.length} people from the machine to cloud…`,
      });
      const result = await importDeviceUsersToCloud(ip, pass, membersRef.current, list);
      const refreshed = await fetchMembers().catch(() => membersRef.current);
      setMembers(refreshed);
      markDeviceConnected(true);
      setProbe({
        host: ip,
        ok: true,
        message: `Done. ${result.imported} new in cloud, ${result.skipped} already there (${result.read} on machine).`,
      });
    } catch (err) {
      setProbe({
        host: host.trim() || savedHost,
        ok: false,
        message: errorMessage(err, 'Could not add machine people to cloud', 'device'),
      });
    } finally {
      setBusy('');
    }
  }

  async function copyCloudToMachine() {
    setBusy('push');
    try {
      const flushed = await syncCloudMembersToDevice(membersRef.current);
      if (flushed.updates.length) {
        setMembers(await persistDeviceEnrolls(membersRef.current, flushed.updates));
      }
      markDeviceConnected(true);
      const list = await fetchDeviceUsers(host.trim() || savedHost, password).catch(() => []);
      setUsers(list);
      setProbe({
        host: host.trim() || savedHost,
        ok: true,
        message: flushed.message || `${list.length} people on the machine.`,
      });
    } catch (err) {
      setProbe({
        host: host.trim() || savedHost,
        ok: false,
        message: errorMessage(err, 'Could not copy members', 'device'),
      });
    } finally {
      setBusy('');
    }
  }

  async function fetchFacesFromMachine() {
    setBusy('faces');
    const enrollKey = (value?: string) => String(value || '').replace(/\D/g, '').replace(/^0+/, '');
    const hasCloudPhoto = (m: Member) => /X-Amz-Signature=|^data:image\//i.test(String(m.devicePhotoUrl || ''));
    try {
      const { ip, pass } = await ensureConnected('faces');
      setProbe({ host: ip, ok: true, message: 'Reading faces on the machine…' });
      const { urls, error: listError } = await listDeviceFaceUrls(ip, pass);
      const byEnroll = new Map([...urls].map(([id, url]) => [enrollKey(id), url]));
      const withEnroll = membersRef.current.filter((m) => enrollKey(m.deviceEnrollId));
      const alreadyInApp = withEnroll.filter(hasCloudPhoto).length;
      // Members found in the face list go first; the rest are looked up one by one.
      const todo = withEnroll
        .filter((m) => !hasCloudPhoto(m))
        .sort((a, b) => Number(byEnroll.has(enrollKey(b.deviceEnrollId))) - Number(byEnroll.has(enrollKey(a.deviceEnrollId))));
      const libraryNote = `Machine face list: ${urls.size} ${urls.size === 1 ? 'face' : 'faces'}${listError ? ` (${listError})` : ''}`;
      if (!todo.length) {
        setProbe({ host: ip, ok: true, message: `${libraryNote}. All ${alreadyInApp} members with a machine ID already have a face in the app.` });
        return;
      }
      const saved = new Map<string, Member>();
      let done = 0;
      let missing = 0;
      let failed = 0;
      const queue = [...todo];
      const worker = async () => {
        for (let m = queue.shift(); m; m = queue.shift()) {
          try {
            const face = await downloadDeviceFace(ip, m.deviceEnrollId || '', byEnroll.get(enrollKey(m.deviceEnrollId)));
            if (face) saved.set(m.id, await saveMemberPhoto(m, face));
            else missing += 1;
          } catch {
            failed += 1;
          }
          done += 1;
          setProbe({ host: ip, ok: true, message: `Fetching faces ${done}/${todo.length} · ${saved.size} saved` });
        }
      };
      await Promise.all([worker(), worker()]);
      if (saved.size) {
        setMembers(membersRef.current.map((row) => {
          const next = saved.get(row.id);
          return next ? { ...row, devicePhotoUrl: next.devicePhotoUrl, faceRegistered: true } : row;
        }));
      }
      setProbe({
        host: ip,
        ok: true,
        message: [
          `Done. ${saved.size} ${saved.size === 1 ? 'face' : 'faces'} saved to the app`,
          libraryNote,
          alreadyInApp ? `${alreadyInApp} already had one` : '',
          missing ? `${missing} had no face on the machine` : '',
          failed ? `${failed} failed (tap again to retry)` : '',
        ].filter(Boolean).join(' · '),
      });
    } catch (err) {
      setProbe({
        host: host.trim() || savedHost,
        ok: false,
        message: errorMessage(err, 'Could not fetch faces from the machine', 'device'),
      });
    } finally {
      setBusy('');
    }
  }

  function runFromMenu(action: () => Promise<void>) {
    setMenuOpen(false);
    void action();
  }

  const menuItems: Array<{ key: string; icon: string; title: string; hint: string; onPress: () => void }> = [
    { key: 'pull', icon: 'download', title: 'Copy machine members to cloud', hint: 'Adds people on the terminal who are missing in the app.', onPress: () => runFromMenu(copyMachineToCloud) },
    { key: 'push', icon: 'device', title: 'Copy cloud members to machine', hint: 'Sends app members and their end dates to the terminal.', onPress: () => runFromMenu(copyCloudToMachine) },
    { key: 'faces', icon: 'face', title: 'Fetch faces from machine', hint: 'Saves each member\'s terminal photo to the app. Skips members who already have one.', onPress: () => runFromMenu(fetchFacesFromMachine) },
    { key: 'logs', icon: 'calendar', title: 'Open logs', hint: 'Entry history from the terminal.', onPress: () => { setMenuOpen(false); navigation.navigate('Logs'); } },
  ];

  const header = (
    <View style={{ paddingBottom: 8 }}>
      <PageTitle>Terminal</PageTitle>
      <Hint>
        Same gym Wi-Fi. Copy members, fetch faces and open logs from More options.
      </Hint>

      <View style={{ marginTop: 12 }}>
        <ActionBtn
          title="More options"
          icon="more"
          primary
          busy={busy === 'pull' || busy === 'push' || busy === 'faces'}
          onPress={() => setMenuOpen(true)}
        />
      </View>

      <View style={[row.split, { marginTop: 14 }]}>
        <View style={{ flex: 1 }}>
          <Label>Mobile IP</Label>
          <Field
            value={lanIp || (lanReady ? 'Tap to refresh' : 'Looking up…')}
            editable={false}
            onPressIn={() => void refreshPhoneIp()}
            selectTextOnFocus
          />
        </View>
        <View style={{ flex: 1 }}>
          <Label>Device IP</Label>
          <Field
            value={host}
            onChangeText={setHost}
            autoCapitalize="none"
            keyboardType="numeric"
            placeholder={lanIp && lanPrefix(lanIp) ? `${lanPrefix(lanIp)}.x` : 'Enter device IP'}
          />
        </View>
      </View>
      <View style={row.split}>
        <View style={{ flex: 1 }}>
          <Label>Web account</Label>
          <Field value={username} onChangeText={setUsername} autoCapitalize="none" placeholder="admin" />
        </View>
        <View style={{ flex: 1 }}>
          <Label>Web password</Label>
          <Field value={password} onChangeText={setPassword} autoCapitalize="none" secureTextEntry placeholder={deviceKind() === 'hikvision' ? 'Hikvision web password' : 'CardM password (2323)'} />
        </View>
      </View>
      <ActionBar>
        <ActionBtn title="Connect" busy={busy === 'connect'} onPress={() => void retryConnect()} />
        <ActionBtn title="Scan Wi-Fi" busy={busy === 'scan'} onPress={() => void scanWifi()} />
      </ActionBar>
      <ActionBar>
        <ActionBtn
          title="Open machine in browser"
          onPress={() => {
            const ip = (host.trim() || savedHost || '192.168.29.227').replace(/^https?:\/\//, '').split('/')[0];
            void Linking.openURL(`http://${ip.includes(':') ? ip : ip}`);
          }}
        />
      </ActionBar>

      {probe ? (
        <View style={{ marginTop: 12, borderRadius: 16, borderWidth: 1, borderColor: t.line, backgroundColor: t.card, padding: 12 }}>
          <StatusBadge compact value={probe.ok ? 'ONLINE' : 'OFFLINE'} />
          <Text style={{ marginTop: 8, color: t.text, fontWeight: '800' }}>{probe.ok ? 'Connected' : 'Not connected'}</Text>
          <Text style={{ marginTop: 6, color: t.muted, fontSize: 13 }}>{probe.message}</Text>
        </View>
      ) : null}

      {busy ? <ActivityIndicator color={t.accent} style={{ marginTop: 16 }} /> : null}
      {users.length ? (
        <Text style={{ marginTop: 14, color: t.muted, fontSize: 12 }}>
          {users.length} people on the terminal — tap one to edit
        </Text>
      ) : null}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <FlatList
        data={users}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={header}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40 }}
        renderItem={({ item }) => (
          <ListCard onPress={() => navigation.navigate('MemberForm', { enrollId: item.id, name: item.name })}>
            <Text style={{ color: t.text, fontWeight: '800' }}>{item.name}</Text>
            <Text style={{ marginTop: 4, color: t.muted, fontSize: 12 }}>
              {[`ID ${item.id}`, item.face ? 'Face' : '', item.card ? `Card ${item.card}` : ''].filter(Boolean).join(' · ')}
            </Text>
            <Text style={{ marginTop: 6, color: t.accent, fontSize: 12, fontWeight: '700' }}>Open / edit</Text>
          </ListCard>
        )}
      />
      {menuOpen ? (
        <AppSheet title="Terminal options" onClose={() => setMenuOpen(false)}>
          {menuItems.map((item, index) => (
            <Pressable
              key={item.key}
              disabled={Boolean(busy)}
              onPress={item.onPress}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                paddingVertical: 12,
                borderTopWidth: index ? 1 : 0,
                borderTopColor: t.line,
                opacity: busy ? 0.4 : pressed ? 0.6 : 1,
              })}
            >
              <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: t.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={item.icon} color={t.accent} size={18} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: t.text, fontWeight: '700', fontSize: 14 }}>{item.title}</Text>
                <Text style={{ marginTop: 2, color: t.muted, fontSize: 12 }}>{item.hint}</Text>
              </View>
              <Icon name="chevron" color={t.muted} size={14} />
            </Pressable>
          ))}
        </AppSheet>
      ) : null}
    </View>
  );
}
