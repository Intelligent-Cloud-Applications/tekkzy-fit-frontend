import type { Request } from 'express';
import { requestInstitution } from './institution';

const BASE = String(process.env.CLOUD_API_URL || '').replace(/\/$/, ''); // deployed API Gateway
const KEY = String(process.env.GYM_API_KEY || '');

export function cloudEnabled() {
  return Boolean(BASE && KEY);
}

export async function cloudRequest<T>(path: string, init?: RequestInit & { institution?: string }): Promise<T> {
  if (!BASE) throw new Error('CLOUD_API_URL is not set');
  const headers = new Headers(init?.headers);
  headers.set('Content-Type', 'application/json');
  headers.set('X-Gym-Key', KEY);
  if (init?.institution) headers.set('X-Institution', init.institution);
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    /* keep text */
  }
  if (!res.ok) {
    const err = body as { error?: string; message?: string };
    throw new Error(err?.error || err?.message || text || `Cloud API ${res.status}`);
  }
  return body as T;
}

export function cloudFor(req: Request) {
  const institution = requestInstitution(req);
  return <T>(path: string, init?: RequestInit) => cloudRequest<T>(path, { ...init, institution });
}
