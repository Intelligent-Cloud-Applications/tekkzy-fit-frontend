import type {
  AttendanceRecord,
  Device,
  DeviceStatusSnapshot,
  FaceRegistrationInput,
  FaceRegistrationResult,
  Member,
} from '@shared/types';
import type { DeviceEventCallback, DeviceProvider, DeviceProviderMeta } from './types';

/**
 * SmartAccess SA-AI21 class face terminal.
 *
 * Known hardware capabilities (from product literature, not a public API):
 * - 4-inch touch screen, dual camera
 * - face recognition + liveness / anti-spoofing
 * - 5,000 face capacity, 500,000 attendance logs
 * - TCP/IP, optional Wi-Fi
 * - lock output, Wiegand in/out
 *
 * There is no confirmed public REST API or public SDK at integration time.
 * Do not invent endpoints. Wire the official SDK / TCP protocol here
 * after the manufacturer provides documentation.
 */
export class SmartAccessDeviceProvider implements DeviceProvider {
  readonly meta: DeviceProviderMeta = {
    id: 'smartaccess',
    label: 'SmartAccess SA-AI21 (not configured)',
    isRealHardware: true,
  };

  private notReady(action: string): Error {
    return new Error(
      `SmartAccess SA-AI21 provider is a placeholder. ${action} requires the official SDK or TCP protocol. Use MockDeviceProvider until the manufacturer delivers the integration kit.`,
    );
  }

  async connect(_device: Device): Promise<DeviceStatusSnapshot> {
    // TODO: open TCP/IP session using manufacturer protocol.
    // TODO: authenticate with DEVICE_USERNAME / DEVICE_PASSWORD from server env.
    throw this.notReady('connect()');
  }

  async disconnect(_deviceId: string): Promise<void> {
    // TODO: close TCP session / SDK handle.
    throw this.notReady('disconnect()');
  }

  async getStatus(_deviceId: string): Promise<DeviceStatusSnapshot> {
    // TODO: query heartbeat / door relay status from the terminal.
    throw this.notReady('getStatus()');
  }

  async registerFace(_data: FaceRegistrationInput): Promise<FaceRegistrationResult> {
    // TODO: push face template to device user database.
    // Do not capture camera frames in the web app unless the SDK requires it.
    throw this.notReady('registerFace()');
  }

  async updateFace(_data: FaceRegistrationInput): Promise<void> {
    throw this.notReady('updateFace()');
  }

  async deleteFace(_deviceId: string, _memberId: string): Promise<void> {
    throw this.notReady('deleteFace()');
  }

  async getAttendanceLogs(_deviceId: string): Promise<AttendanceRecord[]> {
    // TODO: pull attendance records (device stores up to 500,000 logs).
    throw this.notReady('getAttendanceLogs()');
  }

  async syncMember(_member: Member): Promise<void> {
    // TODO: upsert user + access permission on the terminal.
    throw this.notReady('syncMember()');
  }

  async removeMember(_memberId: string): Promise<void> {
    throw this.notReady('removeMember()');
  }

  async unlockGate(_deviceId: string, _durationSeconds: number): Promise<void> {
    // TODO: trigger lock output / relay for the configured pulse width.
    throw this.notReady('unlockGate()');
  }

  async lockGate(_deviceId: string): Promise<void> {
    throw this.notReady('lockGate()');
  }

  async listenForEvents(_deviceId: string, _callback: DeviceEventCallback): Promise<void> {
    // TODO: subscribe to recognition events over TCP or SDK callback.
    throw this.notReady('listenForEvents()');
  }

  async stopListening(_deviceId: string): Promise<void> {
    throw this.notReady('stopListening()');
  }
}
