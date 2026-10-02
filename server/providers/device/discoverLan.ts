import { execFile } from 'node:child_process';
import net from 'node:net';
import { promisify } from 'node:util';
import { saveDeviceAuth, loadDeviceAuth } from './deviceAuth';
import { hostOnThisWifi, localSubnets, type LanInfo } from './lanInfo';

const execFileAsync = promisify(execFile);

export interface FoundTerminal {
  host: string;
  label: string;
}

export type { LanInfo };

const FINGERPRINTS = [
  'biometric',
  'ai806',
  'getdevinfo',
  'enrollid',
  'opendoor',
  'password error',
  'uistr_ai_bio',
  'home.html',
];

async function arpNeighbors(): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync('arp', ['-a'], { windowsHide: true });
    return [...stdout.matchAll(/(\d{1,3}(?:\.\d{1,3}){3})/g)]
      .map((m) => m[1])
      .filter((ip) => !ip.endsWith('.255') && !ip.startsWith('224.') && !ip.startsWith('239.'));
  } catch {
    return [];
  }
}

function portOpen(host: string, port = 80, ms = 350): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const timer = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, ms);
    socket.on('connect', () => {
      clearTimeout(timer);
      socket.destroy();
      resolve(true);
    });
    socket.on('error', () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
}

async function pageLooksLikeHikvision(host: string): Promise<string | null> {
  for (const port of [80, 8000]) {
    const authority = port === 80 ? host : `${host}:${port}`;
    try {
      const page = await fetch(`http://${authority}/ISAPI/System/deviceInfo`, {
        signal: AbortSignal.timeout(900),
      });
      if (page.status === 401) return `Hikvision (${authority})`;
      if (page.ok || page.status === 403) {
        const text = (await page.text()).toLowerCase();
        if (text.includes('deviceinfo') || text.includes('hikvision') || text.includes('minmoe') || text.includes('ds-k')) {
          return `Hikvision (${authority})`;
        }
      }
    } catch {
      /* next port */
    }
  }
  return null;
}

async function pageLooksLikeTerminal(host: string): Promise<string | null> {
  for (const path of ['/home.html', '/', '/login.html']) {
    try {
      const page = await fetch(`http://${host}${path}`, { signal: AbortSignal.timeout(2500) });
      const html = (await page.text()).toLowerCase();
      if (FINGERPRINTS.some((p) => html.includes(p))) return 'AI Biometric terminal';
    } catch {
      /* next */
    }
  }
  return pageLooksLikeHikvision(host);
}

export async function looksLikeTerminal(host: string): Promise<string | null> {
  const open80 = await portOpen(host, 80);
  const open8000 = await portOpen(host, 8000);
  if (!open80 && !open8000 && !(await portOpen(host, 5005))) return null;
  return pageLooksLikeTerminal(host);
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R | null>): Promise<R[]> {
  const found: R[] = [];
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i;
      i += 1;
      const row = await fn(items[idx]);
      if (row) found.push(row);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return found;
}

function hintHosts(nets: ReturnType<typeof localSubnets>): string[] {
  const last = loadDeviceAuth().host.replace(/^https?:\/\//, '').split('/')[0].split('.').pop();
  const extras = [last, '227', '231', '253', '92', '164', '80', '100', '101'].filter(Boolean) as string[];
  const out = new Set<string>();
  for (const net of nets) {
    for (const octet of extras) {
      const n = Number(octet);
      if (!Number.isInteger(n) || n < 1 || n > 254) continue;
      const host = `${net.base}.${n}`;
      if (host !== net.self) out.add(host);
    }
  }
  return [...out];
}

async function identify(hosts: string[]): Promise<FoundTerminal[]> {
  return uniqueHosts(
    await mapPool(hosts, 80, async (host) => {
      const label = await looksLikeTerminal(host);
      return label ? { host, label } : null;
    }),
  );
}

export async function discoverTerminals(opts?: { full?: boolean }): Promise<{
  lan: string[];
  found: FoundTerminal[];
}> {
  const nets = localSubnets();
  const lan = nets.map((n) => `${n.base}.0/24 (laptop ${n.self})`);
  if (!nets.length) return { lan, found: [] };

  const hinted = await identify(hintHosts(nets));
  if (hinted.length) return { lan, found: hinted };

  const neighbors = (await arpNeighbors()).filter((ip) => hostOnThisWifi(ip, nets));
  const fromArp = await identify(neighbors);
  if (fromArp.length || !opts?.full) return { lan, found: fromArp };

  const hosts = new Set<string>();
  for (const net of nets) {
    for (let n = 1; n <= 254; n += 1) {
      const host = `${net.base}.${n}`;
      if (host !== net.self) hosts.add(host);
    }
  }
  return { lan, found: await identify([...hosts]) };
}

function uniqueHosts(rows: FoundTerminal[]): FoundTerminal[] {
  const unique = new Map<string, FoundTerminal>();
  for (const row of rows) unique.set(row.host, row);
  return [...unique.values()];
}

export function applyDiscoveredHost(host: string) {
  const current = loadDeviceAuth();
  saveDeviceAuth({ ...current, host: host.trim() });
}

let lastScan = 0;
let lastLanKey = '';
let scanInFlight: Promise<string> | null = null;

function savedHost() {
  return loadDeviceAuth().host.replace(/^https?:\/\//, '').split('/')[0].trim();
}

async function httpLooksLikeTerminal(host: string): Promise<boolean> {
  for (const path of ['/home.html', '/login.html']) {
    try {
      const page = await fetch(`http://${host}${path}`, { signal: AbortSignal.timeout(3500) });
      const html = (await page.text()).toLowerCase();
      if (FINGERPRINTS.some((p) => html.includes(p))) return true;
    } catch {
      /* next */
    }
  }
  return false;
}

export async function hostIsPowered(host = savedHost()): Promise<boolean> {
  const ip = host.replace(/^https?:\/\//, '').split('/')[0].trim();
  if (!ip) return false;
  if (await portOpen(ip, 80, 2000)) return true;
  return portOpen(ip, 5005, 2000);
}

export async function probeSavedHost(): Promise<boolean> {
  const host = savedHost();
  if (!host) return false;
  if (await httpLooksLikeTerminal(host)) return true;
  return hostIsPowered(host);
}

export async function ensureReachableHost(opts?: { full?: boolean }): Promise<string> {
  const nets = localSubnets();
  if (!nets.length) return '';
  const current = savedHost();

  // Always try the previously saved IP first (even across brief blips).
  if (current && (await probeSavedHost())) {
    return current;
  }

  if (scanInFlight) return scanInFlight;
  const lanKey = nets.map((n) => n.base).join(',');
  const mustScan = Boolean(opts?.full) || !current || !hostOnThisWifi(current, nets);
  if (!mustScan && lanKey === lastLanKey && Date.now() - lastScan < 2_500) {
    return current || '';
  }
  lastLanKey = lanKey;
  lastScan = Date.now();
  scanInFlight = (async () => {
    try {
      // One more quick probe before scanning away from the saved IP.
      if (current && (await probeSavedHost())) return current;

      const { found } = await discoverTerminals({ full: mustScan });
      const prefer = current
        ? found.find((row) => row.host === current)
        : undefined;
      const next = prefer?.host || found[0]?.host;
      if (next) {
        if (next !== current) applyDiscoveredHost(next);
        return next;
      }
      return current || '';
    } finally {
      scanInFlight = null;
    }
  })();
  return scanInFlight;
}
