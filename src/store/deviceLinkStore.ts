import { create } from 'zustand';
import {
  getLiveConfig,
  isFaceMachineLinked,
  pingLiveDevice,
  reconnectDevice,
  type LiveDeviceConfig,
} from '@/services/liveDevice';

export type DeviceLinkStatus = 'checking' | 'connected' | 'machine-off' | 'disconnected' | 'reconnecting';
export type DeviceLinkConfig = LiveDeviceConfig & { ok?: boolean; message?: string };

interface DeviceLinkState {
  status: DeviceLinkStatus;
  cfg: DeviceLinkConfig | null;
  ingest: (cfg: DeviceLinkConfig) => void;
  setStatus: (status: DeviceLinkStatus) => void;
}

let pollTimer = 0;
let inFlight = false;

function nextStatus(cfg: DeviceLinkConfig): DeviceLinkStatus {
  if (isFaceMachineLinked(cfg)) return 'connected';
  return cfg.laptopServer ? 'machine-off' : 'disconnected';
}

export const useDeviceLinkStore = create<DeviceLinkState>((set) => ({
  status: 'checking',
  cfg: null,
  setStatus: (status) => set({ status }),
  ingest: (cfg) => {
    const incoming = nextStatus(cfg);
    set({ status: incoming, cfg: { ...cfg, ok: incoming === 'connected' } });
  },
}));

async function pollOnce() {
  if (inFlight) return;
  inFlight = true;
  try {
    const cfg = await getLiveConfig();
    if (!cfg.laptopServer) {
      useDeviceLinkStore.getState().ingest(cfg);
      return;
    }
    const ping = await pingLiveDevice();
    useDeviceLinkStore.getState().ingest({ ...cfg, deviceOnline: ping || cfg.deviceOnline });
  } catch {
    useDeviceLinkStore.getState().ingest({
      host: '',
      username: '',
      passwordSet: false,
      laptopIps: [],
      hostOnThisWifi: false,
      laptopServer: false,
      deviceOnline: false,
      ok: false,
    });
  } finally {
    inFlight = false;
  }
}

export function startDeviceLinkPolling() {
  if (pollTimer) return;
  void pollOnce();
  pollTimer = window.setInterval(() => void pollOnce(), 8_000);
}

export async function reconnectDeviceLink() {
  const store = useDeviceLinkStore.getState();
  store.setStatus('reconnecting');
  try {
    const next = await reconnectDevice();
    store.ingest(next);
    return next;
  } catch {
    store.ingest({
      host: '',
      username: '',
      passwordSet: false,
      laptopIps: [],
      hostOnThisWifi: false,
      laptopServer: false,
      deviceOnline: false,
      ok: false,
    });
    return null;
  }
}
