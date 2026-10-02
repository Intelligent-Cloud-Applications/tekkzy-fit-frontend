import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, DeviceEventEmitter, KeyboardAvoidingView, Modal, Platform, Pressable, Text, View } from 'react-native';
import { DEVICE_KIND } from './config';
import { ensureLanPermissions, getDeviceKind, loginDevice, scanForTerminal } from './device';
import { getHikDevice } from './hikvision';
import { errorMessage } from './errors';
import { useGym } from './GymContext';
import { ActionBtn } from './page';
import { isDeviceSetupDone, loadDeviceCreds, saveDeviceCreds } from './session';
import { useTheme } from './theme';
import { Field, Label } from './ui';

const OPEN_EVENT = 'tekkzy.deviceSetup.open';

export function openDeviceSetup() {
  DeviceEventEmitter.emit(OPEN_EVENT);
}

/** First-run face machine link: nothing talks to the machine until staff enter its real password here. */
export function DeviceSetupModal() {
  const t = useTheme();
  const { markDeviceConnected, reconnectDevice } = useGym();
  const [visible, setVisible] = useState(false);
  const [host, setHost] = useState('');
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const scanned = useRef(false);

  async function findMachine(preferHost?: string) {
    setScanning(true);
    setFailed(false);
    setMessage('Looking for the face machine on this Wi-Fi…');
    const found = await scanForTerminal((text) => setMessage(text), preferHost).catch(() => null);
    setScanning(false);
    if (found?.ok) {
      setHost(found.host);
      setMessage(`Found the face machine at ${found.host}. Enter its web password.`);
    } else {
      setFailed(true);
      setMessage(found?.message || 'Could not find the face machine. Type its IP address below.');
    }
  }

  async function show() {
    const creds = await loadDeviceCreds();
    setHost(creds.host || '');
    setUsername(creds.username || 'admin');
    setPassword(DEVICE_KIND === 'hikvision' ? '' : creds.password || '2323');
    setVisible(true);
    if (!scanned.current || !creds.host) {
      scanned.current = true;
      void findMachine(creds.host);
    }
  }

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        const creds = await loadDeviceCreds();
        if (cancelled || creds.setup) return;
        await ensureLanPermissions({ timeoutMs: 120000 });
        if (!cancelled) await show();
      })();
    }, 1200);
    const sub = DeviceEventEmitter.addListener(OPEN_EVENT, () => void show());
    return () => {
      cancelled = true;
      clearTimeout(timer);
      sub.remove();
    };
  }, []);

  async function connect() {
    const ip = host.trim();
    const pass = password.trim();
    const user = username.trim() || 'admin';
    if (!ip) {
      setFailed(true);
      setMessage('Enter the face machine IP address, or tap Scan again.');
      return;
    }
    if (!pass) {
      setFailed(true);
      setMessage('Enter the face machine web password.');
      return;
    }
    setBusy(true);
    setFailed(false);
    setMessage(`Signing in at ${ip}…`);
    try {
      await loginDevice(ip, user, pass);
      const linked = getHikDevice()?.host || ip;
      const creds = await loadDeviceCreds();
      await saveDeviceCreds({
        ...creds,
        host: linked,
        username: user,
        password: pass,
        kind: getDeviceKind() || undefined,
        setup: 'done',
      });
      markDeviceConnected(true);
      setVisible(false);
      void reconnectDevice();
    } catch (err) {
      setFailed(true);
      setMessage(errorMessage(err, 'Could not sign in to the face machine.', 'device'));
    } finally {
      setBusy(false);
    }
  }

  async function skip() {
    const creds = await loadDeviceCreds();
    if (!isDeviceSetupDone(creds)) await saveDeviceCreds({ ...creds, setup: 'skipped' });
    setVisible(false);
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => void skip()}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: 20 }}
      >
        <View style={{ borderRadius: 22, backgroundColor: t.card, borderWidth: 1, borderColor: t.line, padding: 18 }}>
          <Text style={{ color: t.text, fontSize: 17, fontWeight: '800' }}>Connect the face machine</Text>
          <Text style={{ marginTop: 6, color: t.muted, fontSize: 13, lineHeight: 18 }}>
            Stay on the gym Wi-Fi. Enter the machine's web password once — this phone remembers it and reconnects on its own.
          </Text>

          <Label>Device IP</Label>
          <Field value={host} onChangeText={setHost} autoCapitalize="none" keyboardType="numeric" placeholder="192.168.29.x" />
          <Label>Web account</Label>
          <Field value={username} onChangeText={setUsername} autoCapitalize="none" placeholder="admin" />
          <Label>Web password</Label>
          <Field
            value={password}
            onChangeText={setPassword}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            placeholder={DEVICE_KIND === 'hikvision' ? 'Hikvision web password' : 'CardM password (2323)'}
            onSubmitEditing={() => void connect()}
          />

          {message ? (
            <View style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {scanning || busy ? <ActivityIndicator size="small" color={t.accent} /> : null}
              <Text style={{ flex: 1, color: failed ? '#e5484d' : t.muted, fontSize: 12, lineHeight: 17 }}>{message}</Text>
            </View>
          ) : null}

          <View style={{ marginTop: 14, gap: 8 }}>
            <ActionBtn title="Connect" primary busy={busy} onPress={() => void connect()} />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <ActionBtn title="Scan again" busy={scanning} onPress={() => void findMachine(host.trim())} />
              </View>
              <View style={{ flex: 1 }}>
                <ActionBtn title="Skip for now" onPress={() => void skip()} />
              </View>
            </View>
          </View>
          <Pressable onPress={() => void skip()} hitSlop={8}>
            <Text style={{ marginTop: 10, color: t.muted, fontSize: 11, textAlign: 'center' }}>
              Not at the gym? Skip — you can connect later in Settings → Terminal.
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
