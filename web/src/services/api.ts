import { getInstitution } from '@/config/site';
import { useAuthStore } from '@/store/authStore';

const BASE = import.meta.env.VITE_API_URL || '/api';
const GYM_KEY = import.meta.env.VITE_GYM_API_KEY || '';

export const LAPTOP_BRIDGE_HINT =
  'Turn on the gym computer and open this website. The software connects the face terminal by itself.';

export function friendlyDeviceMessage(message: string) {
  if (/no terminal on this wi|same network|scan again|not found on this wi|not on this wi/i.test(message)) {
    return 'Terminal is busy. Try again.';
  }
  return message;
}

let lastGymWake = 0;

export function wakeGymPcHelper() {
  if (typeof document === 'undefined') return;
  if (Date.now() - lastGymWake < 12_000) return;
  lastGymWake = Date.now();
  const frame = document.createElement('iframe');
  frame.src = 'tekkzyfit://start';
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;width:0;height:0;border:0;opacity:0;pointer-events:none';
  document.body.appendChild(frame);
  window.setTimeout(() => frame.remove(), 2500);
}

export function isLocalGymApi() {
  return BASE === '/api' || BASE.startsWith('/') || /localhost|127\.0\.0\.1/.test(BASE);
}

function isNetworkFailure(err: unknown) {
  return err instanceof TypeError || (err instanceof Error && /failed to fetch|networkerror|load failed/i.test(err.message));
}

function apiHeaders(init?: RequestInit) {
  const token = useAuthStore.getState().token;
  const headers = new Headers(init?.headers);
  headers.set('X-Institution', getInstitution());
  if (GYM_KEY) headers.set('X-Gym-Key', GYM_KEY);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return headers;
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = apiHeaders(init);
  headers.set('Content-Type', 'application/json');
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  if (!res.ok) {
    const text = await res.text();
    let message = text || `Request failed (${res.status})`;
    try {
      const json = JSON.parse(text) as { error?: string; message?: string };
      message = json.error || json.message || message;
    } catch {
      /* keep raw text */
    }
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export async function deviceRequest<T>(path: string, init?: RequestInit): Promise<T> {
  try {
    return await apiRequest<T>(path, init);
  } catch (err) {
    if (!isLocalGymApi() && isNetworkFailure(err)) throw new Error(LAPTOP_BRIDGE_HINT);
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(friendlyDeviceMessage(message));
  }
}

export async function fetchDeviceAsset(path: string): Promise<Response> {
  return fetch(`${BASE}${path}`, { headers: apiHeaders() });
}

export async function tryApi<T>(path: string, init?: RequestInit): Promise<T | null> {
  try {
    return await apiRequest<T>(path, init);
  } catch {
    return null;
  }
}
