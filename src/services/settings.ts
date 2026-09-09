import { demoSettings } from '@/data/demo';
import { localStore } from '@/providers/database/LocalDatabase';
import { apiRequest, tryApi } from '@/services/api';
import type { GymSettings } from '@shared/types';

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
  };
}

export async function loadGymSettings(): Promise<GymSettings> {
  const local = (await localStore.getSettings()) || demoSettings;
  const cloud = await tryApi<GymSettings>('/settings');
  if (!cloud) return local;
  const merged = mergeSettings(local, cloud);
  await localStore.putSettings(merged);
  return merged;
}

export async function saveGymSettings(row: GymSettings): Promise<GymSettings> {
  await localStore.putSettings(row);
  const saved = await apiRequest<GymSettings>('/settings', {
    method: 'PUT',
    body: JSON.stringify(row),
  });
  const merged = mergeSettings(row, saved);
  await localStore.putSettings(merged);
  return merged;
}
