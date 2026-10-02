import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createDemoDataset, type DemoDataset } from '../../src/data/demo';
import type { SyncQueueItem } from '../../shared/types';
import { gymData } from '../home';

const file = gymData('local-db.json');

export interface ServerState extends DemoDataset {
  syncQueue: SyncQueueItem[];
}

function empty(): ServerState {
  return { ...createDemoDataset(), syncQueue: [] };
}

export function loadState(): ServerState {
  if (!existsSync(file)) {
    mkdirSync(dirname(file), { recursive: true });
    const state = empty();
    writeFileSync(file, JSON.stringify(state, null, 2));
    return state;
  }
  return JSON.parse(readFileSync(file, 'utf8')) as ServerState;
}

export function saveState(state: ServerState): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(state, null, 2));
}

let memory = loadState();

export function db(): ServerState {
  return memory;
}

export function persist(): void {
  saveState(memory);
}

export function reload(): void {
  memory = loadState();
}
