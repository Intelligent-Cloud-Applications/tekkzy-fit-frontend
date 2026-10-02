import { loadDeviceAuth } from './deviceAuth';
import { ensureReachableHost, probeSavedHost } from './discoverLan';
import { hostOnThisWifi, localSubnets } from './lanInfo';

export interface WifiFollowStatus {
  scanning: boolean;
  laptopIps: string[];
  host: string;
  hostOnThisWifi: boolean;
  deviceOnline: boolean;
}

let scanning = false;
let started = false;
let deviceOnline = false;
let failCount = 0;
let lastScanAt = 0;

export function markDeviceOnline(online = true) {
  deviceOnline = online;
  if (online) failCount = 0;
}

export function wifiFollowStatus(): WifiFollowStatus {
  const nets = localSubnets();
  const host = loadDeviceAuth().host;
  return {
    scanning,
    laptopIps: nets.map((n) => n.self),
    host,
    hostOnThisWifi: hostOnThisWifi(host, nets),
    deviceOnline,
  };
}

export function startWifiFollow() {
  if (started) return;
  started = true;
  let lastLan = '';

  async function probe() {
    const ok = await probeSavedHost().catch(() => false);
    if (ok) {
      failCount = 0;
      deviceOnline = true;
      return;
    }
    failCount += 1;
    if (failCount >= 2) deviceOnline = false;
  }

  async function tick() {
    const nets = localSubnets();
    const lan = nets.map((n) => n.base).join(',');
    const lanChanged = lan !== lastLan;
    if (lanChanged) {
      lastLan = lan;
      failCount = 0;
      console.log(`[wifi] Laptop network is now ${lan || 'offline'}`);
      // Keep last online state until probe fails — avoid flicker disconnects.
    }
    await probe();
    if (!lan || scanning || deviceOnline || failCount < 3) return;
    if (!lanChanged && Date.now() - lastScanAt < 30_000) return;
    lastScanAt = Date.now();

    scanning = true;
    try {
      // ensureReachableHost already probes saved IP first, then scans.
      const found = await ensureReachableHost({ full: lanChanged || !hostOnThisWifi(loadDeviceAuth().host, nets) });
      if (found && (await probeSavedHost())) {
        failCount = 0;
        deviceOnline = true;
        console.log(`[wifi] Terminal found at ${found}`);
      }
    } catch (err) {
      console.log(`[wifi] Scan failed: ${err instanceof Error ? err.message : err}`);
    } finally {
      scanning = false;
    }
  }

  void tick();
  setInterval(() => void tick(), 5_000);
}
