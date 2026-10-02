export type SiteData = {
  institution: string;
  institutionId?: string;
};

let site: SiteData = {
  institution: 'Fitnessworld001',
  institutionId: 'Fitnessworld001',
};

export function getInstitution() {
  return site.institution || site.institutionId || 'Fitnessworld001';
}

export function getSite() {
  return site;
}

export async function loadSite() {
  const res = await fetch('/data.json', { cache: 'no-store' });
  if (!res.ok) return site;
  const data = (await res.json()) as Partial<SiteData> & Record<string, unknown>;
  const institution = String(data.institution || data.institutionId || '').trim();
  if (institution) {
    site = { institution, institutionId: String(data.institutionId || institution) };
  }
  return site;
}
