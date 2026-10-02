import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { gymData } from '../../home';
import { hostOnThisWifi, localSubnets } from './lanInfo';

export interface DeviceAuth {
  host: string;
  username: string;
  password: string;
}

const file = gymData('device-auth.json');

export function loadDeviceAuth(): DeviceAuth {
  const fallback: DeviceAuth = {
    host: process.env.DEVICE_HOST || '192.168.29.231',
    username: process.env.DEVICE_WEB_USER || 'admin',
    password: process.env.DEVICE_WEB_PASSWORD || '',
  };
  if (!existsSync(file)) return fallback;
  try {
    const saved = JSON.parse(readFileSync(file, 'utf8')) as Partial<DeviceAuth>;
    return {
      host: saved.host || fallback.host,
      username: saved.username || fallback.username,
      password: saved.password || fallback.password,
    };
  } catch {
    return fallback;
  }
}

export function saveDeviceAuth(auth: DeviceAuth): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(auth, null, 2));
}

export function publicDeviceAuth(): Omit<DeviceAuth, 'password'> & {
  passwordSet: boolean;
  laptopIps: string[];
  hostOnThisWifi: boolean;
} {
  const auth = loadDeviceAuth();
  const nets = localSubnets();
  return {
    host: auth.host,
    username: auth.username,
    passwordSet: Boolean(auth.password),
    laptopIps: nets.map((n) => n.self),
    hostOnThisWifi: hostOnThisWifi(auth.host, nets),
  };
}
