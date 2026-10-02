import { Alert, Linking } from 'react-native';

export const ERROR = {
  offline: 'No network. Turn on mobile data or Wi-Fi with internet, then try again.',
  unstable: 'Unstable network connection. Check the signal and try again.',
  airplane: 'Airplane mode is on. Turn it off, then try again.',
  server: 'Tekkzy Fit is busy. Try again in a moment.',
  auth: 'Your session expired. Sign in again.',
  device: 'Could not reach the face machine. Stay on the gym Wi-Fi and try Reconnect.',
  unexpected: 'Something went wrong. Try again.',
};

const OFFLINE_RE =
  /unable to resolve host|unknownhost|no address associated|failed to fetch|internet is unreachable|name not resolved|dns|nodename nor servname|enotfound/i;
const UNSTABLE_RE =
  /timed out|timeout|aborted|econnreset|econnrefused|failed to connect|connection reset|socket|broken pipe|network request failed|the internet connection appears to be offline|network error/i;
const AUTH_RE = /401|unauthorized|not authenticated|invalid token|jwt expired|forbidden|403/i;
const SERVER_RE = /502|503|504|500|bad gateway|service unavailable|internal server error/i;
const FRIENDLY_RE =
  /^(No network\.|Unstable network|Airplane mode|Tekkzy Fit is busy|Your session expired|Could not reach the face machine)/;

export function errorMessage(err: unknown, fallback = ERROR.unexpected, scope: 'cloud' | 'device' = 'cloud'): string {
  const raw = err instanceof Error ? err.message : String(err || '').trim();
  if (!raw) return fallback;
  if (FRIENDLY_RE.test(raw)) return raw;
  if (scope === 'device') {
    // Keep concrete LAN / Hikvision guidance instead of the generic reconnect line.
    if (/http:\/\/|192\.168\.|10\.\d+\.|hikvision|AP isolation|browser/i.test(raw) && raw.length <= 240) {
      return raw;
    }
    if (OFFLINE_RE.test(raw) || UNSTABLE_RE.test(raw) || /device http/i.test(raw)) return ERROR.device;
    return raw.length <= 160 ? raw : fallback;
  }
  if (OFFLINE_RE.test(raw)) return ERROR.offline;
  if (UNSTABLE_RE.test(raw)) return ERROR.unstable;
  if (AUTH_RE.test(raw)) return ERROR.auth;
  if (SERVER_RE.test(raw)) return ERROR.server;
  if (/exception|at java\.|httpstatus|statuscode/i.test(raw) || raw.length > 180) return fallback;
  return raw;
}

async function cloudNetwork(): Promise<'airplane' | 'offline' | 'no_internet' | 'ok' | 'unknown'> {
  try {
    const net = require('expo-network') as {
      getNetworkStateAsync?: () => Promise<{ isConnected?: boolean | null; isInternetReachable?: boolean | null }>;
      isAirplaneModeEnabledAsync?: () => Promise<boolean>;
    };
    if (await net.isAirplaneModeEnabledAsync?.()) return 'airplane';
    const state = await net.getNetworkStateAsync?.();
    if (state?.isConnected === false) return 'offline';
    if (state?.isInternetReachable === false) return 'no_internet';
    return 'ok';
  } catch {
    return 'unknown';
  }
}

export async function explainCloudFailure(err: unknown, fallback = ERROR.unexpected): Promise<Error> {
  const net = await cloudNetwork();
  if (net === 'airplane') return new Error(ERROR.airplane);
  if (net === 'offline' || net === 'no_internet') return new Error(ERROR.offline);
  const message = errorMessage(err, fallback, 'cloud');
  if (message === ERROR.offline && net === 'ok') return new Error(ERROR.unstable);
  return new Error(message);
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function cloudFetch(url: string, init?: RequestInit, timeoutMs = 18000): Promise<Response> {
  const send = () => fetch(url, { ...init, signal: init?.signal ?? AbortSignal.timeout(timeoutMs) });
  try {
    return await send();
  } catch (err) {
    const first = await explainCloudFailure(err);
    if (first.message === ERROR.airplane || first.message === ERROR.offline || first.message === ERROR.auth) {
      throw first;
    }
    await wait(700);
    try {
      return await send();
    } catch (retryErr) {
      throw await explainCloudFailure(retryErr, ERROR.unstable);
    }
  }
}

export function httpError(status: number, serverMessage?: string): Error {
  if (status === 401 || status === 403) return new Error(ERROR.auth);
  if (status === 408 || status === 429) return new Error(ERROR.unstable);
  if (status >= 500) return new Error(ERROR.server);
  const text = String(serverMessage || '').trim();
  if (text && text.length <= 160 && !/exception|html/i.test(text)) return new Error(text);
  return new Error(status === 404 ? 'That record was not found. Refresh and try again.' : ERROR.unexpected);
}

export async function openExternal(url: string) {
  try {
    await Linking.openURL(url);
  } catch (err) {
    Alert.alert('Could not open link', errorMessage(err, 'Check the network and try again.'));
  }
}
