import os from 'node:os';

export interface LanInfo {
  self: string;
  base: string;
  name: string;
}

function isVirtualNic(name: string) {
  return /vethernet|hyper-v|wsl|docker|virtualbox|vmware|vbox|zerotier|hamachi|radmin|wireguard|nordlynx|cloudflare|warp|tap-windows|vpn|loopback/i.test(name);
}

export function localSubnets(): LanInfo[] {
  const out: LanInfo[] = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    if (isVirtualNic(name)) continue;
    for (const row of list ?? []) {
      if (row.family !== 'IPv4' && Number(row.family) !== 4) continue;
      if (row.internal) continue;
      if (row.address.startsWith('169.254.')) continue;
      const parts = row.address.split('.');
      if (parts.length !== 4) continue;
      out.push({ self: row.address, base: `${parts[0]}.${parts[1]}.${parts[2]}`, name });
    }
  }
  return out;
}

export function hostOnThisWifi(host: string, nets = localSubnets()): boolean {
  const ip = host.replace(/^https?:\/\//, '').split('/')[0];
  return nets.some((n) => ip.startsWith(`${n.base}.`));
}
