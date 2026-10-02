import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export function gymHome(): string {
  if (process.env.TEKKZY_HOME) return process.env.TEKKZY_HOME;
  try {
    return join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  } catch {
    return process.cwd();
  }
}

export function gymData(...parts: string[]): string {
  return join(gymHome(), 'data', ...parts);
}
