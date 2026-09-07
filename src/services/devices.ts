import { getDeviceProvider } from '@/providers/device';
import { localStore } from '@/providers/database/LocalDatabase';
import { enqueueSync } from '@/services/sync';
import { importLiveLogs, liveUnlock, syncLiveRoster, testLiveDevice } from '@/services/liveDevice';
import type { Device } from '@shared/types';

export async function listDevices(): Promise<Device[]> {
  return localStore.allDevices();
}

export async function getDevice(id: string): Promise<Device | undefined> {
  return localStore.getDevice(id);
}

export async function testConnection(id: string): Promise<Device> {
  const device = await requireDevice(id);
  if (device.id === 'dev-entry-01') {
    const live = await testLiveDevice();
    const next: Device = {
      ...device,
      status: live.ok ? 'ONLINE' : 'OFFLINE',
      lastHeartbeat: new Date().toISOString(),
      firmware: live.sn ? `ai806 ${live.sn}` : device.firmware,
    };
    await localStore.putDevice(next);
    if (!live.ok) throw new Error(live.message);
    return next;
  }
  const status = await getDeviceProvider().connect(device);
  const next: Device = {
    ...device,
    status: status.online ? 'ONLINE' : 'OFFLINE',
    lastHeartbeat: status.lastHeartbeat,
    firmware: status.firmware ?? device.firmware,
  };
  await localStore.putDevice(next);
  return next;
}

export async function syncDeviceMembers(id: string): Promise<number> {
  const device = await requireDevice(id);
  if (device.id === 'dev-entry-01') {
    const { pulled, pushed } = await syncLiveRoster();
    return pulled + pushed;
  }
  const members = (await localStore.allMembers()).filter((m) => m.status === 'ACTIVE');
  const provider = getDeviceProvider();
  for (const member of members) {
    await provider.syncMember(member);
  }
  return members.length;
}

export async function pullDeviceAttendance(id: string) {
  const device = await requireDevice(id);
  if (device.id === 'dev-entry-01') {
    const count = await importLiveLogs();
    return { length: count };
  }
  return getDeviceProvider().getAttendanceLogs(id);
}

export async function unlockDeviceGate(id: string, seconds: number): Promise<void> {
  const device = await requireDevice(id);
  if (device.id === 'dev-entry-01') {
    const result = await liveUnlock();
    if (!result.ok) throw new Error(result.message);
    await localStore.putDevice({ ...device, gateState: 'UNLOCKED' });
    window.setTimeout(() => {
      void lockDeviceGate(id);
    }, seconds * 1000);
    return;
  }
  await getDeviceProvider().unlockGate(id, seconds);
  await localStore.putDevice({ ...device, gateState: 'UNLOCKED' });
  await enqueueSync('device', id, 'UPDATE', { id, gateState: 'UNLOCKED' });
}

export async function lockDeviceGate(id: string): Promise<void> {
  const device = await requireDevice(id);
  await getDeviceProvider().lockGate(id);
  await localStore.putDevice({ ...device, gateState: 'LOCKED' });
}

async function requireDevice(id: string): Promise<Device> {
  const device = await localStore.getDevice(id);
  if (!device) throw new Error('Device not found');
  return device;
}
