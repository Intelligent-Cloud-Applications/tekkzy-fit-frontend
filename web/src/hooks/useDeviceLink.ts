import { useEffect } from 'react';
import {
  reconnectDeviceLink,
  startDeviceLinkPolling,
  useDeviceLinkStore,
  type DeviceLinkStatus,
} from '@/store/deviceLinkStore';

export type { DeviceLinkStatus };

export function useDeviceLink() {
  const status = useDeviceLinkStore((s) => s.status);
  const cfg = useDeviceLinkStore((s) => s.cfg);

  useEffect(() => {
    startDeviceLinkPolling();
  }, []);

  return { status, cfg, reconnect: reconnectDeviceLink };
}
