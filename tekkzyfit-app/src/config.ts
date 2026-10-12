import AsyncStorage from '@react-native-async-storage/async-storage';
import site from '../data.json';

type SiteFile = { institutionId?: string; institution?: string; apiUrl?: string };
type DeviceKindName = 'ai806' | 'hikvision';
type Runtime = { apiUrl: string; deviceKind: DeviceKindName; updateUrl: string };

const file = site as SiteFile;

/** The only per-build value: everything else comes from this gym's code generator row. */
export const INSTITUTION = String(file.institutionId || file.institution || '').trim() || 'Tekkzyfit001';
export const GYM_API_KEY = 'tekkzy-fit-dev-9f3c2a71';

/** Tried in order; the first API whose code generator table has INSTITUTION serves the app. */
const API_CANDIDATES = [
  'https://3yn75zpn5m.execute-api.us-east-1.amazonaws.com/prod',
  'https://g87iwuddyc.execute-api.us-east-2.amazonaws.com/dev',
];
const RUNTIME_KEY = `tf-runtime:v1:${INSTITUTION}`;

let runtime: Runtime = {
  apiUrl: String(file.apiUrl || '').trim() || API_CANDIDATES[0],
  deviceKind: 'ai806',
  updateUrl: '',
};

export function apiUrl() {
  return runtime.apiUrl;
}

export function deviceKind(): DeviceKindName {
  return runtime.deviceKind;
}

/** Folder that holds version.json and the APK for this gym's app ('' = no in-app updates). */
export function updateUrl() {
  return runtime.updateUrl;
}

type SettingsReply = { found?: boolean; deviceKind?: string; appUpdateUrl?: string };

function applyReply(api: string, reply: SettingsReply): Runtime {
  return {
    apiUrl: api,
    deviceKind: String(reply.deviceKind || '').toLowerCase() === 'hikvision' ? 'hikvision' : 'ai806',
    updateUrl: String(reply.appUpdateUrl || '').replace(/\/+$/, ''),
  };
}

async function lookup(api: string): Promise<SettingsReply | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${api}/settings`, {
      headers: { 'X-Gym-Key': GYM_API_KEY, 'X-Institution': INSTITUTION },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return (await res.json()) as SettingsReply;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function discover(): Promise<Runtime | null> {
  const pinned = String(file.apiUrl || '').trim();
  for (const api of pinned ? [pinned] : API_CANDIDATES) {
    const reply = await lookup(api);
    if (reply?.found) return applyReply(api, reply);
  }
  return null;
}

/**
 * Picks the API, machine type and update folder for INSTITUTION. Uses the last answer saved on the
 * phone straight away (so the app opens offline) and refreshes it from the code generator table.
 */
export async function resolveRuntime(): Promise<Runtime> {
  const saved = await AsyncStorage.getItem(RUNTIME_KEY).catch(() => null);
  if (saved) {
    try {
      runtime = { ...runtime, ...(JSON.parse(saved) as Runtime) };
      void discover().then((next) => {
        if (!next) return;
        runtime = next;
        void AsyncStorage.setItem(RUNTIME_KEY, JSON.stringify(next)).catch(() => undefined);
      });
      return runtime;
    } catch {
      /* fall through to a fresh lookup */
    }
  }
  const next = await discover();
  if (next) {
    runtime = next;
    await AsyncStorage.setItem(RUNTIME_KEY, JSON.stringify(next)).catch(() => undefined);
  }
  return runtime;
}

export const HOST_HINT_OCTETS = [
  227, 225, 92, 231, 253, 164, 80, 100, 101, 1, 2, 10, 20, 50, 110, 126, 200, 210, 220, 230, 240, 250,
];

export const TERMINAL_MARKS = [
  'biometric',
  'ai806',
  'getdevinfo',
  'enrollid',
  'opendoor',
  'password error',
  'uistr_ai_bio',
  'home.html',
];
