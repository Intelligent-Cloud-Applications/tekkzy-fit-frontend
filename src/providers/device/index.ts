import { mockDeviceProvider } from './MockDeviceProvider';
import { SmartAccessDeviceProvider } from './SmartAccessDeviceProvider';
import type { DeviceProvider } from './types';

export type { DeviceProvider, DeviceEvent, DeviceEventCallback } from './types';
export { MockDeviceProvider, mockDeviceProvider } from './MockDeviceProvider';
export { SmartAccessDeviceProvider } from './SmartAccessDeviceProvider';

export function getDeviceProvider(): DeviceProvider {
  const mode = import.meta.env.VITE_DEVICE_PROVIDER ?? 'mock';
  if (mode === 'smartaccess') {
    return new SmartAccessDeviceProvider();
  }
  return mockDeviceProvider;
}
