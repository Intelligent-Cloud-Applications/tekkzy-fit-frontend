import { newId } from '@/lib/format';
import { getMeta, localStore, setMeta } from '@/providers/database/LocalDatabase';
import { HttpCloudDatabase } from '@/providers/database/CloudDatabase';
import { useConnectionStore } from '@/store/connectionStore';
import type { SyncOp, SyncQueueItem } from '@shared/types';

const cloud = new HttpCloudDatabase(import.meta.env.VITE_API_URL || '/api');

export async function enqueueSync(
  entity: string,
  entityId: string,
  operation: SyncOp,
  payload: unknown,
): Promise<void> {
  const existing = (await localStore.allSync()).find(
    (row) =>
      row.entity === entity &&
      row.entityId === entityId &&
      row.operation === operation &&
      row.status === 'PENDING',
  );
  if (existing) {
    await localStore.putSync({
      ...existing,
      payload: JSON.stringify(payload),
      createdAt: new Date().toISOString(),
    });
    await refreshPending();
    return;
  }
  const item: SyncQueueItem = {
    id: newId('sync'),
    entity,
    entityId,
    operation,
    payload: JSON.stringify(payload),
    createdAt: new Date().toISOString(),
    retryCount: 0,
    status: 'PENDING',
  };
  await localStore.putSync(item);
  await refreshPending();
}

export async function refreshPending(): Promise<number> {
  const rows = await localStore.allSync();
  const pending = rows.filter((r) => r.status === 'PENDING' || r.status === 'FAILED').length;
  useConnectionStore.getState().setPendingCount(pending);
  return pending;
}

export async function processSyncQueue(): Promise<void> {
  const online = useConnectionStore.getState().online;
  if (!online) return;

  const rows = (await localStore.allSync()).filter(
    (r) => r.status === 'PENDING' || r.status === 'FAILED',
  );
  if (rows.length === 0) {
    useConnectionStore.getState().setPhase('idle');
    await setMeta('lastSync', new Date().toISOString());
    useConnectionStore.getState().setLastSync(new Date().toISOString());
    return;
  }

  useConnectionStore.getState().setPhase('syncing');
  for (const row of rows) {
    const next: SyncQueueItem = { ...row, status: 'SYNCING' };
    await localStore.putSync(next);
    try {
      await cloud.push({
        entity: row.entity,
        entityId: row.entityId,
        operation: row.operation,
        data: JSON.parse(row.payload) as unknown,
      });
      await localStore.putSync({ ...next, status: 'SYNCED' });
    } catch {
      await localStore.putSync({
        ...row,
        status: 'FAILED',
        retryCount: row.retryCount + 1,
        lastError: 'Cloud API unreachable. Will retry.',
      });
    }
  }
  await refreshPending();
  await setMeta('lastSync', new Date().toISOString());
  useConnectionStore.getState().setLastSync(new Date().toISOString());
  useConnectionStore.getState().setPhase('complete');
  window.setTimeout(() => {
    if (useConnectionStore.getState().phase === 'complete') {
      useConnectionStore.getState().setPhase('idle');
    }
  }, 2500);
}

export async function hydrateSyncClock(): Promise<void> {
  const last = await getMeta('lastSync');
  if (last) useConnectionStore.getState().setLastSync(last);
  await refreshPending();
}

export function startConnectionManager(): () => void {
  const setOnline = (online: boolean) => {
    useConnectionStore.getState().setOnline(online);
    if (online) void processSyncQueue();
  };
  const onOnline = () => setOnline(true);
  const onOffline = () => setOnline(false);
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);
  setOnline(navigator.onLine);
  const timer = window.setInterval(() => {
    if (navigator.onLine) void processSyncQueue();
  }, 30_000);
  return () => {
    window.removeEventListener('online', onOnline);
    window.removeEventListener('offline', onOffline);
    window.clearInterval(timer);
  };
}
