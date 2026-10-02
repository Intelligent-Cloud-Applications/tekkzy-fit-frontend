import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Alert, Pressable, Text, View } from 'react-native';
import { openDeviceSetup } from './DeviceSetupModal';
import { errorMessage } from './errors';
import { isDeviceSetupDone, loadDeviceCreds } from './session';
import { font } from './fonts';
import { useGym } from './GymContext';
import { Icon } from './icons';
import type { RootStackParamList } from './nav';
import { useTheme, type ThemeName } from './theme';
import type { User } from './types';

export function MobileHeader({
  user,
  themeName,
  onTheme,
}: {
  user?: User | null;
  themeName: ThemeName;
  onTheme: (name: ThemeName) => void;
}) {
  const t = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { deviceStatus, reconnectDevice, settings } = useGym();
  const gymName = String(settings?.gymName || settings?.legalName || '').trim() || 'Tekkzy Fit';
  const connected = deviceStatus === 'connected';
  const busy = deviceStatus === 'checking' || deviceStatus === 'reconnecting';
  const label = connected
    ? 'Connected'
    : deviceStatus === 'reconnecting'
      ? 'Reconnecting'
      : deviceStatus === 'checking'
        ? 'Checking'
        : 'Reconnect';

  async function onChip() {
    if (connected) {
      navigation.navigate('Terminal');
      return;
    }
    if (busy) return;
    if (!isDeviceSetupDone(await loadDeviceCreds())) {
      openDeviceSetup();
      return;
    }
    const next = await reconnectDevice();
    if (next.ok) {
      Alert.alert('Connected', next.message || (next.pushed ? `${next.pushed} members added to the machine.` : undefined));
      return;
    }
    Alert.alert(
      'Still not connected',
      errorMessage(next.message, 'Turn the face machine on, use the same Wi-Fi as this phone, then tap Reconnect.', 'device'),
    );
  }

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 16,
        paddingBottom: 8,
        paddingTop: 12,
        backgroundColor: t.header,
        borderBottomWidth: 1,
        borderBottomColor: t.name === 'dark' ? t.glow : 'transparent',
      }}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ color: '#fff', fontFamily: font.brand, fontSize: 15, letterSpacing: 1, textTransform: 'uppercase' }}>
          {gymName}
        </Text>
        <Pressable
          onPress={() => void onChip()}
          style={{
            alignSelf: 'flex-start',
            marginTop: 4,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.15)',
            backgroundColor: 'rgba(255,255,255,0.1)',
            paddingHorizontal: 10,
            paddingVertical: 4,
          }}
        >
          <View
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: connected ? '#34C759' : '#FF3B30',
              opacity: busy ? 0.55 : 1,
            }}
          />
          <Text style={{ color: 'rgba(255,255,255,0.88)', fontSize: 11, fontWeight: '700' }}>{label}</Text>
        </Pressable>
      </View>
      <RoundIcon
        name={themeName === 'light' ? 'sun' : 'moon'}
        onPress={() => onTheme(themeName === 'light' ? 'dark' : 'light')}
      />
    </View>
  );
}

function RoundIcon({ name, onPress }: { name: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        width: 44,
        height: 44,
        borderRadius: 22,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        backgroundColor: 'rgba(255,255,255,0.08)',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon name={name} color="#ffffff" size={16} />
    </Pressable>
  );
}
