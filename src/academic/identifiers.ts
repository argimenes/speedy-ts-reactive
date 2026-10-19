/** Recognition only. No network and no identity reconciliation. */
export type AcademicFamily = 'orcid' | 'arxiv' | 'pmid' | 'pmcid' | 'isbn';
export interface AcademicIdentifier {
  family: AcademicFamily;
  key: string;
  source: string;
  url: string;
}
export function orcidId(value: string) {
  const s = value.replace(/-/g, '').toUpperCase();
  if (!/^\d{15}[\dX]$/.test(s)) return;
  let n = 0;
  for (const c of s.slice(0, 15)) n = (n + Number(c)) * 2;
  const check = (12 - (n % 11)) % 11;
  if (s[15] !== String(check === 10 ? 'X' : check)) return;
  return s.match(/.{4}/g)!.join('-');
}
export function isbnId(value: string) {
  let s = value.replace(/[\s-]/g, '').toUpperCase();
  if (/^\d{9}[\dX]$/.test(s)) {
    if ([...s].reduce((n, c, i) => n + (c === 'X' ? 10 : Number(c)) * (10 - i), 0) % 11) return;
    s = '978' + s.slice(0, 9);
    s += String((10 - ([...s].reduce((n, c, i) => n + Number(c) * (i % 2 ? 3 : 1), 0) % 10)) % 10);
  } else if (
    !/^97[89]\d{10}$/.test(s) ||
    [...s].reduce((n, c, i) => n + Number(c) * (i % 2 ? 3 : 1), 0) % 10
  )
    return;
  return s;
}
export function academicIdentifier(value: unknown): AcademicIdentifier | undefined {
  if (typeof value !== 'string' || value.length > 4096) return;
  const source = value.trim();
  let s = source,
    family: AcademicFamily | undefined;
  if (/^https:\/\//i.test(s)) {
    let u: URL;
    try {
      u = new URL(s);
    } catch {
      return;
    }
    if (u.username || u.password || u.port) return;
    const host = u.hostname.toLowerCase(),
      p = u.pathname.replace(/\/$/, '');
    if (host === 'orcid.org') {
      family = 'orcid';
      s = p.slice(1);
    } else if (['arxiv.org', 'www.arxiv.org'].includes(host) && p.startsWith('/abs/')) {
      family = 'arxiv';
      s = p.slice(5);
    } else if (host === 'pubmed.ncbi.nlm.nih.gov') {
      family = 'pmid';
      s = p.slice(1);
    } else if (
      ['pmc.ncbi.nlm.nih.gov', 'www.ncbi.nlm.nih.gov'].includes(host) &&
      /^\/(?:pmc\/)?articles\/PMC\d+$/i.test(p)
    ) {
      family = 'pmcid';
      s = p.split('/').at(-1)!;
    } else if (host === 'openlibrary.org' && p.startsWith('/isbn/')) {
      family = 'isbn';
      s = p.slice(6);
    } else return;
  } else {
    const prefix = s.match(/^(ORCID|arXiv|PMID|PMCID|ISBN(?:-1[03])?):\s*(.+)$/i);
    if (prefix) {
      family = prefix[1].toLowerCase().replace(/-1[03]$/, '') as AcademicFamily;
      s = prefix[2];
    } else if (/^PMC\d+$/i.test(s)) family = 'pmcid';
    else if (/^\d{4}-\d{4}-\d{4}-[\dXx]{4}$/.test(s)) family = 'orcid';
    else if (/^(?:\d{4}\.\d{4,5}|[a-z-]+(?:\.[A-Z]{2})?\/\d{7})(?:v[1-9]\d*)?$/.test(s))
      family = 'arxiv';
    else if (/^[\dXx\s-]{10,20}$/.test(s) && isbnId(s)) family = 'isbn';
  }
  let key: string | undefined,
    url = '';
  if (family === 'orcid') {
    key = orcidId(s);
    url = 'https://orcid.org/' + key;
  }
  if (family === 'isbn') {
    key = isbnId(s);
    url = 'https://openlibrary.org/isbn/' + key;
  }
  if (
    family === 'arxiv' &&
    /^(?:\d{4}\.(?:\d{4}|\d{5})|[a-z-]+(?:\.[A-Z]{2})?\/\d{7})(?:v[1-9]\d{0,3})?$/.test(s)
  ) {
    key = s;
    url = 'https://arxiv.org/abs/' + key;
  }
  if (family === 'pmid' && /^[1-9]\d{0,8}$/.test(s)) {
    key = s;
    url = 'https://pubmed.ncbi.nlm.nih.gov/' + key + '/';
  }
  if (family === 'pmcid' && /^PMC[1-9]\d{0,8}$/i.test(s)) {
    key = s.toUpperCase();
    url = 'https://pmc.ncbi.nlm.nih.gov/articles/' + key + '/';
  }
  return family && key ? { family, key, source, url } : undefined;
}

export const academicJob = (value: string) =>
  value.trim().match(/^mutable-academic-job:([a-f0-9-]{36})$/i)?.[1];
