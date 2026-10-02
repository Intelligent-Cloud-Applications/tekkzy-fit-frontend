import { DeviceEventEmitter, NativeModules, Platform } from 'react-native';
import { UPDATE_DIR, UPDATE_HOST } from './config';

export const APP_UPDATE_EVENT = 'tekkzy.appUpdate';
export const VERSION_URL = `${UPDATE_HOST}/${UPDATE_DIR}/version.json`;

const native = Platform.OS === 'android' ? NativeModules.DeskKeepAlive : null;

export type AppVersion = {
  versionCode: number;
  versionName: string;
};

export type RemoteAppVersion = AppVersion & {
  apkUrl: string;
};

export async function getInstalledVersion(): Promise<AppVersion> {
  if (!native?.getAppVersion) return { versionCode: 0, versionName: '' };
  return native.getAppVersion();
}

export async function checkAppUpdate(): Promise<RemoteAppVersion | null> {
  const installed = await getInstalledVersion();
  const res = await fetch(`${VERSION_URL}?t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) {
    await native?.checkForUpdate?.().catch(() => false);
    return null;
  }
  // Strip UTF-8 BOM if a host wrote version.json with one.
  const text = (await res.text()).replace(/^\uFEFF/, '');
  const json = JSON.parse(text) as { versionCode?: number; versionName?: string; apkUrl?: string };
  const remote: RemoteAppVersion = {
    versionCode: Number(json.versionCode || 0),
    versionName: String(json.versionName || ''),
    apkUrl: String(json.apkUrl || `${UPDATE_HOST}/${UPDATE_DIR}/TekkzyFit.apk`),
  };
  if (!(remote.versionCode > installed.versionCode)) return null;
  await native?.setUpdateAvailable?.(remote.apkUrl).catch(() => false);
  DeviceEventEmitter.emit(APP_UPDATE_EVENT, remote);
  return remote;
}

export async function installAppUpdate(url?: string): Promise<string> {
  if (!native?.installUpdate) return 'Updates are only available on the Android app.';
  return native.installUpdate(url || '');
}
