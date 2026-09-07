import { create } from 'zustand';

export type SyncPhase = 'idle' | 'syncing' | 'complete' | 'error';

interface ConnectionState {
  online: boolean;
  lastSync: string | null;
  pendingCount: number;
  phase: SyncPhase;
  setOnline: (online: boolean) => void;
  setLastSync: (iso: string) => void;
  setPendingCount: (count: number) => void;
  setPhase: (phase: SyncPhase) => void;
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  lastSync: null,
  pendingCount: 0,
  phase: 'idle',
  setOnline: (online) => set({ online }),
  setLastSync: (lastSync) => set({ lastSync }),
  setPendingCount: (pendingCount) => set({ pendingCount }),
  setPhase: (phase) => set({ phase }),
}));
