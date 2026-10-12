import AsyncStorage from '@react-native-async-storage/async-storage';
import { deviceKind } from './config';
import { setDeviceKind, setDevicePassword } from './device';
import type { AuthSession, User } from './types';

const SESSION_KEY = 'tekkzy.session';
const DEVICE_KEY = 'tekkzy.device';
const THEME_KEY = 'tekkzy.theme';

let token = '';
let user: User | null = null;

export function getToken() {
  return token;
}

export function getUser() {
  return user;
}

export async function loadSession(): Promise<AuthSession | null> {
  const raw = await AsyncStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const session = JSON.parse(raw) as AuthSession;
    token = session.token || '';
    user = session.user || null;
    return session.token && session.user ? session : null;
  } catch {
    return null;
  }
}

export async function saveSession(session: AuthSession) {
  token = session.token;
  user = session.user;
  await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export async function clearSession() {
  token = '';
  user = null;
  await AsyncStorage.removeItem(SESSION_KEY);
}

export type DeviceCreds = {
  host: string;
  username: string;
  password: string;
  kind?: 'ai806' | 'hikvision';
  /** Unset until staff finish (or skip) the first-run face machine setup on this phone. */
  setup?: 'done' | 'skipped';
};

export function isDeviceSetupDone(creds: DeviceCreds) {
  return creds.setup === 'done';
}

export async function loadDeviceCreds(): Promise<DeviceCreds> {
  const fallback = { host: '', username: 'admin', password: '2323' as string };
  const raw = await AsyncStorage.getItem(DEVICE_KEY);
  let creds: DeviceCreds = fallback;
  if (raw) {
    try {
      creds = { ...fallback, ...JSON.parse(raw) };
    } catch {
      creds = fallback;
    }
  }
  // Phones that linked before first-run setup existed already have a working saved machine.
  if (!creds.setup && creds.kind && creds.host) creds.setup = 'done';
  // CardM default password stays 2323. Hikvision must use its own web password.
  creds.kind = deviceKind();
  if (creds.kind === 'hikvision') {
    if (creds.password === '2323') creds.password = '';
  } else if (!creds.password) {
    creds.password = '2323';
  }
  setDevicePassword(creds.password);
  setDeviceKind(creds.kind);
  return creds;
}

export async function saveDeviceCreds(creds: DeviceCreds) {
  setDevicePassword(creds.password);
  await AsyncStorage.setItem(DEVICE_KEY, JSON.stringify(creds));
}

export async function loadTheme(): Promise<'dark' | 'light'> {
  const value = await AsyncStorage.getItem(THEME_KEY);
  if (value === 'dark') return 'dark';
  return 'light';
}

export async function saveTheme(theme: 'dark' | 'light') {
  await AsyncStorage.setItem(THEME_KEY, theme);
}
