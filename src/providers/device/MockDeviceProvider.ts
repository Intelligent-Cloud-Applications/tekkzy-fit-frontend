import type { AttendanceRecord, Device, DeviceStatusSnapshot, FaceRegistrationInput, FaceRegistrationResult, Member } from '@shared/types';
import type { DeviceEvent, DeviceEventCallback, DeviceProvider, DeviceProviderMeta } from './types';

interface InternalDevice {
  snapshot: DeviceStatusSnapshot;
  listeners: Set<DeviceEventCallback>;
  lockTimer?: ReturnType<typeof setTimeout>;
}

/**
 * In-browser simulation of a face terminal + lock output.
 * Used until the manufacturer SDK / TCP protocol is available.
 */
export class MockDeviceProvider implements DeviceProvider {
  readonly meta: DeviceProviderMeta = {
    id: 'mock',
    label: 'Mock device provider (demo)',
    isRealHardware: false,
  };

  private devices = new Map<string, InternalDevice>();
  private faces = new Set<string>();

  private ensure(deviceId: string): InternalDevice {
    let row = this.devices.get(deviceId);
    if (!row) {
      row = {
        snapshot: {
          deviceId,
          online: true,
          gateState: 'LOCKED',
          lastHeartbeat: new Date().toISOString(),
          firmware: 'MOCK-1.0',
          userCount: 0,
          message: 'Simulated device',
        },
        listeners: new Set(),
      };
      this.devices.set(deviceId, row);
    }
    return row;
  }

  private emit(deviceId: string, event: Omit<DeviceEvent, 'deviceId' | 'timestamp'>): void {
    const row = this.ensure(deviceId);
    const full: DeviceEvent = {
      ...event,
      deviceId,
      timestamp: new Date().toISOString(),
    };
    row.listeners.forEach((cb) => cb(full));
  }

  async connect(device: Device): Promise<DeviceStatusSnapshot> {
    const row = this.ensure(device.id);
    row.snapshot.online = device.status !== 'OFFLINE';
    row.snapshot.lastHeartbeat = new Date().toISOString();
    this.emit(device.id, { kind: row.snapshot.online ? 'ONLINE' : 'OFFLINE' });
    return row.snapshot;
  }

  async disconnect(deviceId: string): Promise<void> {
    const row = this.ensure(deviceId);
    row.snapshot.online = false;
    this.emit(deviceId, { kind: 'OFFLINE', message: 'Disconnected' });
  }

  async getStatus(deviceId: string): Promise<DeviceStatusSnapshot> {
    const row = this.ensure(deviceId);
    row.snapshot.lastHeartbeat = new Date().toISOString();
    this.emit(deviceId, { kind: 'HEARTBEAT' });
    return { ...row.snapshot };
  }

  async registerFace(data: FaceRegistrationInput): Promise<FaceRegistrationResult> {
    this.faces.add(`${data.deviceId}:${data.memberId}`);
    return {
      success: true,
      memberId: data.memberId,
      deviceId: data.deviceId,
      message: 'Face template stored on mock terminal.',
    };
  }

  async updateFace(data: FaceRegistrationInput): Promise<void> {
    this.faces.add(`${data.deviceId}:${data.memberId}`);
  }

  async deleteFace(deviceId: string, memberId: string): Promise<void> {
    this.faces.delete(`${deviceId}:${memberId}`);
  }

  async getAttendanceLogs(_deviceId: string): Promise<AttendanceRecord[]> {
    return [];
  }

  async syncMember(member: Member): Promise<void> {
    const snap = this.ensure('dev-entry-01').snapshot;
    snap.userCount = (snap.userCount ?? 0) + 1;
    void member;
  }

  async removeMember(memberId: string): Promise<void> {
    for (const key of [...this.faces]) {
      if (key.endsWith(`:${memberId}`)) this.faces.delete(key);
    }
  }

  async unlockGate(deviceId: string, durationSeconds: number): Promise<void> {
    const row = this.ensure(deviceId);
    if (!row.snapshot.online) {
      throw new Error('Device offline');
    }
    row.snapshot.gateState = 'UNLOCKED';
    this.emit(deviceId, { kind: 'GATE_UNLOCKED', message: `Unlocked for ${durationSeconds}s` });
    if (row.lockTimer) clearTimeout(row.lockTimer);
    row.lockTimer = setTimeout(() => {
      void this.lockGate(deviceId);
    }, durationSeconds * 1000);
  }

  async lockGate(deviceId: string): Promise<void> {
    const row = this.ensure(deviceId);
    row.snapshot.gateState = 'LOCKED';
    if (row.lockTimer) {
      clearTimeout(row.lockTimer);
      row.lockTimer = undefined;
    }
    this.emit(deviceId, { kind: 'GATE_LOCKED' });
  }

  async listenForEvents(deviceId: string, callback: DeviceEventCallback): Promise<void> {
    this.ensure(deviceId).listeners.add(callback);
  }

  async stopListening(deviceId: string): Promise<void> {
    this.ensure(deviceId).listeners.clear();
  }

  /** Used by the Access Control page to feed a scan into the same event bus. */
  simulateFaceScan(deviceId: string, face: DeviceEvent['face']): void {
    this.emit(deviceId, { kind: 'FACE_SCAN', face });
  }

  setOnline(deviceId: string, online: boolean): void {
    const row = this.ensure(deviceId);
    row.snapshot.online = online;
    this.emit(deviceId, { kind: online ? 'ONLINE' : 'OFFLINE' });
  }
}

export const mockDeviceProvider = new MockDeviceProvider();
