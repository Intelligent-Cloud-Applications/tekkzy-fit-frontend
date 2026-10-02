import { enrollKey } from '@/lib/format';
import { getMeta, setMeta } from '@/providers/database/LocalDatabase';

const META_KEY = 'deleted-members';

type Tomb = { ids: string[]; enrolls: string[] };

let cache: Tomb | null = null;

async function load(): Promise<Tomb> {
  if (cache) return cache;
  const raw = await getMeta(META_KEY);
  try {
    cache = raw ? (JSON.parse(raw) as Tomb) : { ids: [], enrolls: [] };
  } catch {
    cache = { ids: [], enrolls: [] };
  }
  cache.ids = cache.ids || [];
  cache.enrolls = cache.enrolls || [];
  return cache;
}

async function save(next: Tomb) {
  cache = next;
  await setMeta(META_KEY, JSON.stringify(next));
}

export async function rememberDeletedMember(id: string, enroll?: string) {
  const t = await load();
  const e = enrollKey(enroll || '');
  await save({
    ids: id && !t.ids.includes(id) ? [...t.ids, id] : t.ids,
    enrolls: e && !t.enrolls.includes(e) ? [...t.enrolls, e] : t.enrolls,
  });
}

export async function clearDeletedMembers() {
  await save({ ids: [], enrolls: [] });
}

export async function forgetDeletedMember(id?: string, enroll?: string) {
  const t = await load();
  const e = enrollKey(enroll || '');
  await save({
    ids: id ? t.ids.filter((row) => row !== id) : t.ids,
    enrolls: e ? t.enrolls.filter((row) => row !== e) : t.enrolls,
  });
}

export async function isDeletedMember(id?: string, enroll?: string) {
  const t = await load();
  if (id && t.ids.includes(id)) return true;
  const e = enrollKey(enroll || '');
  return Boolean(e && t.enrolls.includes(e));
}

export async function filterDeletedMembers<T extends { id: string; deviceEnrollId?: string; memberCode?: string }>(rows: T[]): Promise<T[]> {
  const t = await load();
  return rows.filter((row) => {
    if (t.ids.includes(row.id)) return false;
    const enroll = enrollKey(row.deviceEnrollId || row.memberCode || '');
    return !(enroll && t.enrolls.includes(enroll));
  });
}
