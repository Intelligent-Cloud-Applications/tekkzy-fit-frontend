import { useEffect, useState } from 'react';
import { deviceSeenRecently, getLiveConfig } from '@/services/liveDevice';

export type DeviceLinkStatus = 'connecting' | 'connected';

export function useDeviceLink() {
  const [status, setStatus] = useState<DeviceLinkStatus>('connecting');

  useEffect(() => {
    let stopped = false;
    let misses = 0;

    async function tick() {
      try {
        const cfg = await getLiveConfig();
        if (stopped) return;
        if (cfg.laptopServer && (cfg.deviceOnline || deviceSeenRecently())) {
          misses = 0;
          setStatus('connected');
          return;
        }
        misses += 1;
        if (misses >= 1) setStatus('connecting');
      } catch {
        if (stopped) return;
        misses += 1;
        if (misses >= 2) setStatus('connecting');
      }
    }

    void tick();
    const timer = window.setInterval(() => void tick(), 15_000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, []);

  return status;
}
