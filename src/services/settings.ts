import { demoSettings } from '@/data/demo';
import { localStore } from '@/providers/database/LocalDatabase';
import { apiRequest, tryApi } from '@/services/api';
import type { GymSettings } from '@shared/types';

let settingsInflight: Promise<GymSettings> | null = null;
let settingsCache: GymSettings | null = null;

function mergeSettings(base: GymSettings, next: Partial<GymSettings>): GymSettings {
  return {
    ...base,
    ...next,
    id: base.id || next.id || 'settings-1',
    gymName: String(next.gymName ?? base.gymName ?? ''),
    legalName: String(next.legalName ?? base.legalName ?? ''),
    phone: String(next.phone ?? base.phone ?? ''),
    email: String(next.email ?? base.email ?? ''),
    address: String(next.address ?? base.address ?? ''),
    city: String(next.city ?? base.city ?? ''),
    state: String(next.state ?? base.state ?? ''),
    pincode: String(next.pincode ?? base.pincode ?? ''),
    gstin: String(next.gstin ?? base.gstin ?? ''),
    primaryColor: String(next.primaryColor ?? base.primaryColor ?? 'red'),
  };
}

async function fetchGymSettings(): Promise<GymSettings> {
  const local = (await localStore.getSettings()) || { ...demoSettings, gymName: '', legalName: '' };
  const cloud = await tryApi<GymSettings>('/settings');
  if (!cloud) {
    return local.gymName === demoSettings.gymName ? { ...local, gymName: '', legalName: '' } : local;
  }
  const merged = mergeSettings(local, cloud);
  if (!String(merged.gymName || '').trim()) merged.gymName = '';
  await localStore.putSettings(merged);
  return merged;
}

export function loadGymSettings(): Promise<GymSettings> {
  if (settingsCache && !settingsInflight) return Promise.resolve(settingsCache);
  if (settingsInflight) return settingsInflight;
  settingsInflight = fetchGymSettings()
    .then((row) => {
      settingsCache = row;
      return row;
    })
    .finally(() => {
      settingsInflight = null;
    });
  return settingsInflight;
}

export function ensureGymSettings(): Promise<GymSettings> {
  return loadGymSettings();
}

export async function saveGymSettings(row: GymSettings): Promise<GymSettings> {
  await localStore.putSettings(row);
  const saved = await apiRequest<GymSettings>('/settings', {
    method: 'PUT',
    body: JSON.stringify(row),
  });
  const merged = mergeSettings(row, saved);
  settingsCache = merged;
  await localStore.putSettings(merged);
  return merged;
}
