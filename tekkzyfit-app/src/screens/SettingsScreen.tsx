import { useEffect, useState } from 'react';
import { Alert, BackHandler, DeviceEventEmitter, Pressable, ScrollView, Text, View } from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { errorMessage } from '../errors';
import { useGym } from '../GymContext';
import { Icon } from '../icons';
import type { RootStackParamList } from '../nav';
import { font } from '../fonts';
import { Hint, ScreenPad } from '../page';
import { PRIMARY_THEMES, setAppPrimary, type PrimaryColor } from '../primaryColor';
import { saveGymSettings } from '../api';
import { useTheme, type ThemeName } from '../theme';
import type { User } from '../types';
import { APP_UPDATE_EVENT, checkAppUpdate, getInstalledVersion, installAppUpdate, type RemoteAppVersion } from '../appUpdate';
import { pushToast } from '../toast';

const ALL_SECTIONS = ['Gym profile', 'Staff', 'Expenses', 'Reports', 'Terminal', 'Logs', 'Appearance'] as const;
type Section = (typeof ALL_SECTIONS)[number];

const MANAGE: readonly Section[] = ['Gym profile', 'Staff', 'Expenses', 'Reports'];

const SECTION_META: Record<Section, { icon: string; hint: string }> = {
  'Gym profile': { icon: 'building', hint: 'Name, address, invoice' },
  Staff: { icon: 'users', hint: 'Trainers and desk team' },
  Expenses: { icon: 'receipt', hint: 'Rent, salaries, bills' },
  Reports: { icon: 'chart', hint: 'Daily and monthly' },
  Terminal: { icon: 'device', hint: 'Device connection and sync' },
  Logs: { icon: 'list', hint: 'Entry and activity history' },
  Appearance: { icon: 'sun', hint: 'Light or dark, gym color' },
};

function SectionLabel({ text }: { text: string }) {
  const t = useTheme();
  return (
    <Text style={{ marginBottom: 8, marginLeft: 4, color: t.muted, fontSize: 11, fontWeight: '800', letterSpacing: 0.8 }}>
      {text.toUpperCase()}
    </Text>
  );
}

export function SettingsScreen({
  navigation,
  user,
  themeName,
  onTheme,
  onLogout,
}: {
  navigation: NativeStackNavigationProp<RootStackParamList>;
  user?: User | null;
  themeName: ThemeName;
  onTheme: (name: ThemeName) => void;
  onLogout: () => void;
}) {
  const t = useTheme();
  const { settings, setSettings } = useGym();
  const staffOnly = user?.role === 'RECEPTIONIST' || user?.role === 'MANAGER';
  const SECTIONS = (staffOnly
    ? ALL_SECTIONS.filter((s) => s !== 'Staff' && s !== 'Reports')
    : ALL_SECTIONS);
  const [tab, setTab] = useState<Section | null>(null);
  const [busy, setBusy] = useState('');
  const [appVersion, setAppVersion] = useState('');
  const [update, setUpdate] = useState<RemoteAppVersion | null>(null);
  const role = (user?.role || '').replaceAll('_', ' ').toLowerCase();

  useEffect(() => {
    void getInstalledVersion().then((row) => setAppVersion(row.versionName || ''));
    void checkAppUpdate().then(setUpdate).catch(() => setUpdate(null));
    const sub = DeviceEventEmitter.addListener(APP_UPDATE_EVENT, (remote: RemoteAppVersion) => {
      if (remote?.versionCode) setUpdate(remote);
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!tab) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setTab(null);
      return true;
    });
    return () => sub.remove();
  }, [tab]);

  async function onUpdate() {
    setBusy('update');
    try {
      const message = await installAppUpdate(update?.apkUrl);
      if (!message.toLowerCase().includes('download')) {
        Alert.alert('App update', message);
      }
    } catch (err) {
      Alert.alert('App update', errorMessage(err, 'Could not install the update.'));
    } finally {
      setBusy('');
    }
  }

  async function pickColor(id: PrimaryColor) {
    setAppPrimary(id);
    setBusy('color');
    try {
      const saved = await saveGymSettings({ ...settings, primaryColor: id });
      setSettings(saved);
      pushToast({ kind: 'success', title: `${PRIMARY_THEMES.find((row) => row.id === id)?.label} theme saved` });
    } catch (err) {
      setAppPrimary(settings?.primaryColor);
      pushToast({ kind: 'error', title: errorMessage(err, 'Could not save gym color') });
    } finally {
      setBusy('');
    }
  }

  function open(section: Section) {
    if (section === 'Gym profile') navigation.navigate('GymProfile');
    else if (section === 'Staff') navigation.navigate('Staff');
    else if (section === 'Expenses') navigation.navigate('Expenses');
    else if (section === 'Terminal') navigation.navigate('Terminal');
    else if (section === 'Logs') navigation.navigate('Logs', undefined);
    else if (section === 'Reports') navigation.navigate('Reports');
    else setTab(section);
  }

  if (!tab) {
    const manage = SECTIONS.filter((s) => MANAGE.includes(s));
    const more = SECTIONS.filter((s) => !MANAGE.includes(s));
    const card = { borderRadius: 18, borderWidth: 1, borderColor: t.line, backgroundColor: t.card } as const;

    return (
      <ScrollView style={{ flex: 1, backgroundColor: t.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 14 }}>
        <View style={{ borderRadius: 18, backgroundColor: t.header, overflow: 'hidden' }}>
          <View
            style={{
              position: 'absolute',
              right: -40,
              top: -50,
              width: 150,
              height: 150,
              borderRadius: 75,
              backgroundColor: t.accent,
              opacity: 0.18,
            }}
          />
          <View style={{ padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={{ color: '#ffffff', fontFamily: font.display, fontSize: 18, letterSpacing: -0.4 }}>
                {user?.name || 'Signed in'}
              </Text>
              <Text
                numberOfLines={1}
                style={{ marginTop: 2, color: 'rgba(255,255,255,0.6)', fontSize: 12, textTransform: 'capitalize' }}
              >
                {[role, settings?.gymName].filter(Boolean).join(' · ')}
              </Text>
            </View>
            <Pressable
              onPress={onLogout}
              hitSlop={8}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                borderRadius: 999,
                paddingHorizontal: 12,
                paddingVertical: 8,
                backgroundColor: pressed ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.1)',
              })}
            >
              <Icon name="logout" color="#ffffff" size={15} />
              <Text style={{ color: '#ffffff', fontSize: 12, fontWeight: '800' }}>Log out</Text>
            </Pressable>
          </View>
        </View>

        {update ? (
          <Pressable
            onPress={() => void onUpdate()}
            disabled={busy === 'update'}
            style={{
              borderRadius: 18,
              backgroundColor: t.accent,
              padding: 14,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              opacity: busy === 'update' ? 0.7 : 1,
            }}
          >
            <Icon name="download" color={t.accentInk} size={20} />
            <Text style={{ flex: 1, color: t.accentInk, fontFamily: font.display, fontSize: 15 }}>
              {busy === 'update' ? 'Downloading update…' : `Update to ${update.versionName}`}
            </Text>
            <Icon name="chevronRight" color={t.accentInk} size={18} />
          </Pressable>
        ) : null}

        {manage.length ? (
          <View>
            <SectionLabel text="Manage" />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {manage.map((section) => (
                <Pressable
                  key={section}
                  onPress={() => open(section)}
                  style={({ pressed }) => [
                    card,
                    { flexBasis: '47%', flexGrow: 1, padding: 14, gap: 12, transform: [{ scale: pressed ? 0.97 : 1 }] },
                  ]}
                >
                  <View
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 12,
                      backgroundColor: t.accentSoft,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Icon name={SECTION_META[section].icon} color={t.accent} size={19} />
                  </View>
                  <View>
                    <Text style={{ color: t.text, fontFamily: font.display, fontSize: 15 }}>{section}</Text>
                    <Text numberOfLines={1} style={{ marginTop: 2, color: t.muted, fontSize: 11 }}>
                      {SECTION_META[section].hint}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        <View>
          <SectionLabel text="App" />
          <View style={[card, { overflow: 'hidden' }]}>
            {more.map((section, index) => (
              <Pressable
                key={section}
                onPress={() => open(section)}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  paddingHorizontal: 14,
                  paddingVertical: 13,
                  borderTopWidth: index ? 1 : 0,
                  borderTopColor: t.line,
                  backgroundColor: pressed ? t.input : 'transparent',
                })}
              >
                <View
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 10,
                    backgroundColor: t.input,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon name={SECTION_META[section].icon} color={t.text} size={17} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.text, fontSize: 14, fontWeight: '700' }}>{section}</Text>
                  <Text style={{ marginTop: 1, color: t.muted, fontSize: 11 }}>{SECTION_META[section].hint}</Text>
                </View>
                <Icon name="chevronRight" color={t.muted} size={16} />
              </Pressable>
            ))}
          </View>
        </View>

        {appVersion ? (
          <Text style={{ textAlign: 'center', color: t.muted, fontSize: 11 }}>
            Tekkzy Fit {appVersion}{update ? '' : ' · up to date'}
          </Text>
        ) : null}
      </ScrollView>
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: t.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <ScreenPad>
        <Pressable onPress={() => setTab(null)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8 }}>
          <Icon name="chevronLeft" color={t.muted} size={16} />
          <Text style={{ color: t.muted, fontSize: 13, fontWeight: '700' }}>More</Text>
        </Pressable>
        <View style={{ borderRadius: 16, borderWidth: 1, borderColor: t.line, backgroundColor: t.card, padding: 14 }}>
          <Text style={{ color: t.text, fontFamily: font.display, fontSize: 16, letterSpacing: -0.4 }}>Theme</Text>
          <Hint>Light is the default for daytime reception. Switch to dark for the night desk.</Hint>
          <View style={{ gap: 10, marginTop: 12 }}>
            <Pressable
              onPress={() => onTheme('dark')}
              style={{
                borderRadius: 16,
                borderWidth: 1,
                borderColor: themeName === 'dark' ? t.accent : t.line,
                backgroundColor: themeName === 'dark' ? t.accentSoft : 'transparent',
                padding: 20,
              }}
            >
              <Text style={{ color: t.text, fontFamily: font.displayX, fontSize: 24, letterSpacing: -0.5 }}>Dark</Text>
              <Text style={{ marginTop: 8, color: t.muted, fontSize: 13 }}>Black desk with your gym color.</Text>
            </Pressable>
            <Pressable
              onPress={() => onTheme('light')}
              style={{
                borderRadius: 16,
                borderWidth: 1,
                borderColor: themeName === 'light' ? t.accent : t.line,
                backgroundColor: themeName === 'light' ? t.accentSoft : 'transparent',
                padding: 20,
              }}
            >
              <Text style={{ color: t.text, fontFamily: font.displayX, fontSize: 24, letterSpacing: -0.5 }}>Light</Text>
              <Text style={{ marginTop: 8, color: t.muted, fontSize: 13 }}>Clean reception for daytime.</Text>
            </Pressable>
          </View>
          <Text style={{ marginTop: 20, color: t.text, fontFamily: font.display, fontSize: 16, letterSpacing: -0.4 }}>Gym color</Text>
          <Hint>Most gyms use red, yellow, or lime green. This is saved for the whole gym.</Hint>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
            {PRIMARY_THEMES.map((item) => {
              const selected = t.accent.toLowerCase() === item.accent;
              return (
                <Pressable
                  key={item.id}
                  disabled={busy === 'color'}
                  onPress={() => void pickColor(item.id)}
                  style={{
                    flex: 1,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: selected ? t.accent : t.line,
                    backgroundColor: selected ? t.accentSoft : 'transparent',
                    padding: 12,
                    opacity: busy === 'color' ? 0.7 : 1,
                  }}
                >
                  <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: item.accent, marginBottom: 8 }} />
                  <Text style={{ color: t.text, fontFamily: font.display, fontSize: 15 }}>{item.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </ScreenPad>
    </ScrollView>
  );
}
