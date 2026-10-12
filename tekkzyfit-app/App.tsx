import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer, DarkTheme, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useEffect, useMemo, useState } from 'react';
import { Alert, AppState, StatusBar, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useAppFonts } from './src/fonts';
import { LoadingScreen } from './src/LoadingScreen';
import { DockTabBar } from './src/DockTabBar';
import { DeviceSetupModal } from './src/DeviceSetupModal';
import { GymProvider } from './src/GymContext';
import { MobileHeader } from './src/MobileHeader';
import type { RootStackParamList } from './src/nav';
import { AttendanceScreen } from './src/screens/AttendanceScreen';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { DashboardListScreen } from './src/screens/DashboardListScreen';
import { ExpensesScreen } from './src/screens/ExpensesScreen';
import { ExpenseFormScreen } from './src/screens/ExpenseFormScreen';
import { LogsScreen } from './src/screens/LogsScreen';
import { GymProfileScreen } from './src/screens/GymProfileScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { MemberFormScreen } from './src/screens/MemberFormScreen';
import { MemberProfileScreen } from './src/screens/MemberProfileScreen';
import { MembersScreen } from './src/screens/MembersScreen';
import { PaymentDetailScreen } from './src/screens/PaymentDetailScreen';
import { PaymentFormScreen } from './src/screens/PaymentFormScreen';
import { PaymentsScreen } from './src/screens/PaymentsScreen';
import { PlanFormScreen } from './src/screens/PlanFormScreen';
import { PlansScreen } from './src/screens/PlansScreen';
import { ReportsScreen } from './src/screens/ReportsScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { StaffScreen } from './src/screens/StaffScreen';
import { TerminalScreen } from './src/screens/TerminalScreen';
import { clearSession, loadDeviceCreds, loadSession, loadTheme, saveTheme } from './src/session';
import { clearCache } from './src/cache';
import { resolveRuntime } from './src/config';
import { startDeskKeepAlive, stopDeskKeepAlive } from './src/deskKeepAlive';
import { checkAppUpdate, installAppUpdate, type RemoteAppVersion } from './src/appUpdate';
import { formScreenOptions } from './src/sheet';
import { ThemeProvider, makeTheme, useTheme, type ThemeName } from './src/theme';
import { getAppPrimary, subscribeAppPrimary } from './src/primaryColor';
import { ToastViewport } from './src/toast';
import type { AuthSession, User } from './src/types';
import { visibleTabs } from './src/types';

export type { RootStackParamList };

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator();
let promptedUpdate = 0;

function promptAppUpdate(remote: RemoteAppVersion | null) {
  if (!remote || remote.versionCode <= promptedUpdate) return;
  promptedUpdate = remote.versionCode;
  Alert.alert('App update', `Version ${remote.versionName} is ready to install.`, [
    { text: 'Later' },
    { text: 'Update', onPress: () => void installAppUpdate(remote.apkUrl) },
  ]);
}

function MainTabs({
  user,
  themeName,
  onTheme,
  onLogout,
}: {
  user?: User | null;
  themeName: ThemeName;
  onTheme: (name: ThemeName) => void;
  onLogout: () => void;
}) {
  const t = useTheme();
  const tabs = visibleTabs(user?.role);
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.header }} edges={['top']}>
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <MobileHeader user={user} themeName={themeName} onTheme={onTheme} />
      <Tab.Navigator
        tabBar={(props) => <DockTabBar {...props} />}
        screenOptions={{
          headerShown: false,
          tabBarHideOnKeyboard: true,
        }}
      >
      {tabs.includes('Dashboard') ? (
        <Tab.Screen name="Dashboard" options={{ tabBarLabel: 'Dash' }}>
          {(props) => <DashboardScreen navigation={props.navigation as never} user={user} />}
        </Tab.Screen>
      ) : null}
      {tabs.includes('Members') ? (
        <Tab.Screen name="Members">
          {(props) => <MembersScreen navigation={props.navigation as never} role={user?.role} />}
        </Tab.Screen>
      ) : null}
      {tabs.includes('Plans') ? (
        <Tab.Screen name="Plans">
          {(props) => <PlansScreen navigation={props.navigation as never} />}
        </Tab.Screen>
      ) : null}
      {tabs.includes('Payments') ? (
        <Tab.Screen name="Payments">
          {(props) => <PaymentsScreen navigation={props.navigation as never} />}
        </Tab.Screen>
      ) : null}
      {tabs.includes('Settings') ? (
        <Tab.Screen name="Settings" options={{ tabBarLabel: 'More' }}>
          {(props) => (
            <SettingsScreen
              navigation={props.navigation as never}
              user={user}
              themeName={themeName}
              onTheme={onTheme}
              onLogout={onLogout}
            />
          )}
        </Tab.Screen>
      ) : null}
      </Tab.Navigator>
    </View>
    </SafeAreaView>
  );
}

function DeskApp({
  user,
  themeName,
  onTheme,
  onLogout,
}: {
  user?: User | null;
  themeName: ThemeName;
  onTheme: (name: ThemeName) => void;
  onLogout: () => void;
}) {
  const t = useTheme();
  return (
    <GymProvider>
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <Stack.Navigator
          screenOptions={{
            headerStyle: { backgroundColor: t.header },
            headerTintColor: t.name === 'light' ? '#ffffff' : t.text,
            headerShadowVisible: false,
            contentStyle: { backgroundColor: t.bg },
          }}
        >
          <Stack.Screen name="Tabs" options={{ headerShown: false }}>
            {() => <MainTabs user={user} themeName={themeName} onTheme={onTheme} onLogout={onLogout} />}
          </Stack.Screen>
          <Stack.Screen name="DashboardList" component={DashboardListScreen} options={{ title: 'Dashboard' }} />
          <Stack.Screen name="Expenses" options={{ title: 'Expenses' }}>
            {(props) => <ExpensesScreen navigation={props.navigation as never} />}
          </Stack.Screen>
          <Stack.Screen name="MemberForm" component={MemberFormScreen} options={formScreenOptions} />
          <Stack.Screen name="MemberProfile" component={MemberProfileScreen} options={{ title: 'Profile' }} />
          <Stack.Screen name="PlanForm" component={PlanFormScreen} options={formScreenOptions} />
          <Stack.Screen name="PaymentForm" component={PaymentFormScreen} options={formScreenOptions} />
          <Stack.Screen name="PaymentDetail" component={PaymentDetailScreen} options={{ title: 'Payment' }} />
          <Stack.Screen name="ExpenseForm" component={ExpenseFormScreen} options={formScreenOptions} />
          <Stack.Screen name="Logs" component={LogsScreen} options={{ title: 'Logs' }} />
          <Stack.Screen name="Terminal" component={TerminalScreen} options={{ title: 'Terminal' }} />
          <Stack.Screen name="Staff" component={StaffScreen} options={{ title: 'Staff' }} />
          <Stack.Screen name="GymProfile" component={GymProfileScreen} options={{ title: 'Gym profile' }} />
          <Stack.Screen name="Attendance" component={AttendanceScreen} options={{ title: 'Attendance' }} />
          <Stack.Screen name="Reports" component={ReportsScreen} options={{ title: 'Reports' }} />
          <Stack.Screen name="Settings" options={{ title: 'Settings' }}>
            {(props) => (
              <SettingsScreen
                navigation={props.navigation as never}
                user={user}
                themeName={themeName}
                onTheme={onTheme}
                onLogout={onLogout}
              />
            )}
          </Stack.Screen>
        </Stack.Navigator>
        <ToastViewport />
        <DeviceSetupModal />
      </View>
    </GymProvider>
  );
}

export default function App() {
  const fontsReady = useAppFonts();
  const [ready, setReady] = useState(false);
  const [splashGone, setSplashGone] = useState(false);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [themeName, setThemeName] = useState<ThemeName>('light');
  const [primary, setPrimary] = useState(getAppPrimary);

  useEffect(() => {
    let cancelled = false;
    const splash = new Promise<void>((resolve) => setTimeout(resolve, 3000));
    const boot = resolveRuntime()
      .catch(() => undefined)
      .then(() => Promise.all([loadSession(), loadTheme(), loadDeviceCreds()]))
      .then(([next, theme]) => {
      if (cancelled) return;
      setSession(next);
      setThemeName(theme);
    });
    void Promise.all([boot, splash]).then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => subscribeAppPrimary(setPrimary), []);

  const navTheme = useMemo(() => {
    const base = themeName === 'light' ? DefaultTheme : DarkTheme;
    const colors = makeTheme(themeName, primary);
    return {
      ...base,
      colors: {
        ...base.colors,
        background: colors.bg,
        card: colors.card,
        text: colors.text,
        border: colors.line,
        primary: colors.accent,
      },
    };
  }, [themeName, primary]);

  useEffect(() => {
    if (!session) return;
    const boot = setTimeout(() => {
      void startDeskKeepAlive();
      void checkAppUpdate().then(promptAppUpdate).catch(() => null);
    }, 500);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void checkAppUpdate().then(promptAppUpdate).catch(() => null);
    });
    return () => {
      clearTimeout(boot);
      sub.remove();
    };
  }, [session]);

  async function changeTheme(name: ThemeName) {
    setThemeName(name);
    await saveTheme(name);
  }

  async function logout() {
    await stopDeskKeepAlive();
    await clearSession();
    await clearCache();
    setSession(null);
  }

  return (
    <SafeAreaProvider>
      <ThemeProvider name={themeName}>
        <StatusBar barStyle={session ? 'light-content' : themeName === 'light' ? 'dark-content' : 'light-content'} />
        <View style={{ flex: 1 }}>
          {session ? (
            <NavigationContainer theme={navTheme}>
              <DeskApp
                user={session.user}
                themeName={themeName}
                onTheme={(name) => void changeTheme(name)}
                onLogout={() => void logout()}
              />
            </NavigationContainer>
          ) : ready ? (
            <LoginScreen onAuthed={setSession} />
          ) : null}
          {!splashGone ? (
            <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, zIndex: 50 }}>
              <LoadingScreen exiting={ready && fontsReady} onExited={() => setSplashGone(true)} />
            </View>
          ) : null}
        </View>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
