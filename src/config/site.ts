export type SiteData = {
  institution: string;
  institutionId?: string;
  apiUrl?: string;
};

const API_CANDIDATES = [
  'https://3yn75zpn5m.execute-api.us-east-1.amazonaws.com/prod',
  'https://g87iwuddyc.execute-api.us-east-2.amazonaws.com/dev',
];

const BUILD_API = (import.meta.env.VITE_API_URL || '/api').replace(/\/+$/, '');

let site: SiteData = {
  institution: 'Fitnessworld001',
  institutionId: 'Fitnessworld001',
};

let api = BUILD_API;

export function getInstitution() {
  return site.institution || site.institutionId || 'Fitnessworld001';
}

export function getSite() {
  return site;
}

export function apiBase() {
  return api;
}

function isLocalApi(url: string) {
  return url.startsWith('/') || /localhost|127\.0\.0\.1/.test(url);
}

async function hasInstitution(base: string, institution: string) {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), 8000);
  try {
    const headers: Record<string, string> = { 'X-Institution': institution };
    const key = import.meta.env.VITE_GYM_API_KEY;
    if (key) headers['X-Gym-Key'] = key;
    const res = await fetch(`${base}/settings`, { headers, signal: ctrl.signal, cache: 'no-store' });
    if (!res.ok) return false;
    const body = (await res.json()) as { found?: boolean };
    return body.found === true;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timer);
  }
}

async function resolveApi(institution: string) {
  const cacheKey = `tf-api:v1:${institution}`;
  const cached = localStorage.getItem(cacheKey);
  const probe = async () => {
    const ordered = [BUILD_API, ...API_CANDIDATES.filter((url) => url !== BUILD_API)];
    for (const base of ordered) {
      if (await hasInstitution(base, institution)) {
        localStorage.setItem(cacheKey, base);
        return base;
      }
    }
    return null;
  };
  if (cached) {
    void probe();
    return cached;
  }
  return (await probe()) || BUILD_API;
}

export async function loadSite() {
  try {
    const res = await fetch('/data.json', { cache: 'no-store' });
    if (res.ok) {
      const data = (await res.json()) as Partial<SiteData> & Record<string, unknown>;
      const institution = String(data.institutionId || data.institution || '').trim();
      if (institution) {
        site = {
          institution,
          institutionId: institution,
          apiUrl: data.apiUrl ? String(data.apiUrl).replace(/\/+$/, '') : undefined,
        };
      }
    }
  } catch {
    /* keep defaults */
  }
  if (site.apiUrl) api = site.apiUrl;
  else if (!isLocalApi(BUILD_API)) api = await resolveApi(getInstitution());
  return site;
}
