import { cloudEnabled, cloudRequest } from '../../cloud/client';
import { publicDeviceAuth } from './deviceAuth';
import { wifiFollowStatus } from './wifiFollow';

const LOCAL = `http://127.0.0.1:${Number(process.env.PORT || 8787)}/api`;

type BridgeCommand = {
  id: string;
  method: string;
  path: string;
  body?: unknown;
  query?: string;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runLocal(command: BridgeCommand): Promise<{ statusCode: number; payload: unknown }> {
  const path = `${command.path}${command.query || ''}`;
  const method = String(command.method || 'GET').toUpperCase();
  const init: RequestInit = { method, headers: { 'Content-Type': 'application/json' } };
  if (method !== 'GET' && method !== 'HEAD') {
    init.body = JSON.stringify(command.body ?? {});
  }
  const res = await fetch(`${LOCAL}${path}`, init);
  const type = res.headers.get('content-type') || '';
  if (type.startsWith('image/')) {
    const bytes = Buffer.from(await res.arrayBuffer());
    return {
      statusCode: res.status,
      payload: { __photo: true, contentType: type, base64: bytes.toString('base64') },
    };
  }
  const text = await res.text();
  try {
    return { statusCode: res.status, payload: text ? JSON.parse(text) : {} };
  } catch {
    return { statusCode: res.status, payload: { message: text } };
  }
}

function bridgeStatus() {
  const wifi = wifiFollowStatus();
  return {
    ...publicDeviceAuth(),
    scanning: wifi.scanning,
    hostOnThisWifi: wifi.hostOnThisWifi,
    deviceOnline: wifi.deviceOnline,
  };
}

export function startCloudDeviceBridge() {
  if (!cloudEnabled()) {
    console.log('[bridge] Set CLOUD_API_URL and GYM_API_KEY so phones and other PCs can use the terminal');
    return;
  }

  let running = false;

  async function heartbeat() {
    try {
      await cloudRequest('/devices/bridge/heartbeat', {
        method: 'POST',
        body: JSON.stringify(bridgeStatus()),
      });
    } catch {
      /* next tick */
    }
  }

  async function loop() {
    if (running) return;
    running = true;
    try {
      const next = await cloudRequest<{ command: BridgeCommand | null }>('/devices/bridge/next', {
        method: 'POST',
        body: JSON.stringify(bridgeStatus()),
      });
      if (!next.command) return;
      const result = await runLocal(next.command);
      await cloudRequest('/devices/bridge/result', {
        method: 'POST',
        body: JSON.stringify({ id: next.command.id, ...result }),
      });
    } catch (err) {
      console.log(`[bridge] ${err instanceof Error ? err.message : err}`);
      await sleep(2500);
    } finally {
      running = false;
    }
  }

  console.log('[bridge] Relaying the face terminal to the live website');
  void heartbeat();
  void loop();
  setInterval(() => void heartbeat(), 8_000);
  setInterval(() => void loop(), 400);
}
