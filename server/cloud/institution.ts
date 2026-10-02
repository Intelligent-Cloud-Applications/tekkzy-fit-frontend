import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Request } from 'express';

function fromDataJson() {
  try {
    const raw = readFileSync(resolve(process.cwd(), 'public/data.json'), 'utf8');
    const data = JSON.parse(raw) as { institution?: string; institutionId?: string };
    return String(data.institution || data.institutionId || '').trim();
  } catch {
    return '';
  }
}

export function requestInstitution(req?: Request) {
  const header = String(req?.headers['x-institution'] || '').trim();
  const body = req?.body as { institution?: string; institutionId?: string } | undefined;
  return header || String(body?.institution || body?.institutionId || '').trim() || fromDataJson() || 'Fitnessworld001';
}
