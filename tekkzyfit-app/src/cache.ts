import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { apiUrl, INSTITUTION } from './config';

const VERSION = 1;

function prefix() {
  const host = apiUrl().replace(/^https?:\/\//, '').split('/')[0];
  return `tf-cache:v${VERSION}:${INSTITUTION}:${host}:`;
}
/** Android's SQLite cursor window fails on single values above ~2 MB, so big entries are split. */
const CHUNK = 400_000;

const memory = new Map<string, unknown>();

let inflight = 0;
const syncListeners = new Set<(busy: boolean) => void>();

function setInflight(delta: number) {
  const was = inflight > 0;
  inflight = Math.max(0, inflight + delta);
  if (was !== inflight > 0) syncListeners.forEach((fn) => fn(inflight > 0));
}

/** Marks a network load as running so the header sync indicator can show it. */
export async function trackSync<T>(work: Promise<T>): Promise<T> {
  setInflight(1);
  try {
    return await work;
  } finally {
    setInflight(-1);
  }
}

export function subscribeSync(fn: (busy: boolean) => void) {
  syncListeners.add(fn);
  fn(inflight > 0);
  return () => {
    syncListeners.delete(fn);
  };
}

/** True while any background load is running; drives the per-page refresh spinners. */
export function useSyncing() {
  const [busy, setBusy] = useState(inflight > 0);
  useEffect(() => subscribeSync(setBusy), []);
  return busy;
}

type Envelope<T> = { at: number; value: T };

export async function readCache<T>(key: string): Promise<{ value: T; at: number } | null> {
  const hit = memory.get(key) as Envelope<T> | undefined;
  if (hit) return hit;
  try {
    const head = await AsyncStorage.getItem(prefix() + key);
    if (!head) return null;
    let text = head;
    const chunked = /^#chunks:(\d+)$/.exec(head);
    if (chunked) {
      const keys = Array.from({ length: Number(chunked[1]) }, (_, i) => `${prefix()}${key}#${i}`);
      const parts = await AsyncStorage.multiGet(keys);
      if (parts.some(([, part]) => part == null)) return null;
      text = parts.map(([, part]) => part).join('');
    }
    const row = JSON.parse(text) as Envelope<T>;
    memory.set(key, row);
    return row;
  } catch {
    return null;
  }
}

export function writeCache<T>(key: string, value: T) {
  const row: Envelope<T> = { at: Date.now(), value };
  memory.set(key, row);
  void (async () => {
    try {
      const text = JSON.stringify(row);
      if (text.length <= CHUNK) {
        await AsyncStorage.setItem(prefix() + key, text);
        return;
      }
      const pairs: [string, string][] = [];
      for (let i = 0; i * CHUNK < text.length; i += 1) {
        pairs.push([`${prefix()}${key}#${i}`, text.slice(i * CHUNK, (i + 1) * CHUNK)]);
      }
      await AsyncStorage.multiSet(pairs);
      await AsyncStorage.setItem(prefix() + key, `#chunks:${pairs.length}`);
    } catch {
      /* cache is best-effort; the next refresh fills it again */
    }
  })();
}

export async function clearCache() {
  memory.clear();
  try {
    const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith('tf-cache:'));
    if (keys.length) await AsyncStorage.multiRemove(keys);
  } catch {
    /* ignore */
  }
}

/**
 * Stale-while-revalidate: hands back the cached value first (if any), then the fresh one.
 * `apply` is called up to twice; the promise resolves with the fresh value.
 */
export async function swr<T>(key: string, fetcher: () => Promise<T>, apply: (value: T, fresh: boolean) => void): Promise<T> {
  const cached = await readCache<T>(key);
  if (cached) apply(cached.value, false);
  const fresh = await trackSync(fetcher());
  writeCache(key, fresh);
  apply(fresh, true);
  return fresh;
}
