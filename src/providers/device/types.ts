import type {
  AttendanceRecord,
  Device,
  DeviceStatusSnapshot,
  FaceRegistrationInput,
  FaceRegistrationResult,
  FaceScanResult,
  Member,
} from '@shared/types';

export type DeviceEventKind =
  | 'FACE_SCAN'
  | 'GATE_UNLOCKED'
  | 'GATE_LOCKED'
  | 'HEARTBEAT'
  | 'ONLINE'
  | 'OFFLINE'
  | 'ERROR';

export interface DeviceEvent {
  kind: DeviceEventKind;
  deviceId: string;
  timestamp: string;
  face?: FaceScanResult;
  message?: string;
}

export type DeviceEventCallback = (event: DeviceEvent) => void;

export interface DeviceProvider {
  connect(device: Device): Promise<DeviceStatusSnapshot>;
  disconnect(deviceId: string): Promise<void>;
  getStatus(deviceId: string): Promise<DeviceStatusSnapshot>;
  registerFace(data: FaceRegistrationInput): Promise<FaceRegistrationResult>;
  updateFace(data: FaceRegistrationInput): Promise<void>;
  deleteFace(deviceId: string, memberId: string): Promise<void>;
  getAttendanceLogs(deviceId: string): Promise<AttendanceRecord[]>;
  syncMember(member: Member): Promise<void>;
  removeMember(memberId: string): Promise<void>;
  unlockGate(deviceId: string, durationSeconds: number): Promise<void>;
  lockGate(deviceId: string): Promise<void>;
  listenForEvents(deviceId: string, callback: DeviceEventCallback): Promise<void>;
  stopListening(deviceId: string): Promise<void>;
}

export interface DeviceProviderMeta {
  id: 'mock' | 'smartaccess';
  label: string;
  isRealHardware: boolean;
}
