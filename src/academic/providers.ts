import { academicIdentifier, type AcademicIdentifier } from './identifiers';
import { xml, text, value, child, children, descendants, type XmlNode } from './xml';
import { emptyCitation, type AcademicProjection } from './model';
const safe = (v: unknown, max = 2000) =>
  typeof v === 'string' ? v.replace(/<[^>]*>/g, '').slice(0, max) : '';
function providerJson(source: string) {
  const root = JSON.parse(source),
    pending = [{ value: root, depth: 0 }];
  let count = 0;
  while (pending.length) {
    const { value, depth } = pending.pop()!;
    if (++count > 100000 || depth > 32) throw Error('Provider JSON structure limit');
    if (value && typeof value === 'object')
      for (const child of Object.values(value)) pending.push({ value: child, depth: depth + 1 });
  }
  return root;
}
export function providerEndpoint(id: AcademicIdentifier) {
  switch (id.family) {
    case 'orcid':
      return `https://pub.orcid.org/v3.0/${id.key}/record`;
    case 'arxiv':
      return `https://export.arxiv.org/api/query?id_list=${encodeURIComponent(id.key)}&max_results=1`;
    case 'pmid':
      return `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${id.key}&retmode=xml&tool=MutableOS`;
    case 'pmcid':
      return `https://pmc.ncbi.nlm.nih.gov/tools/idconv/api/v1/articles/?ids=${id.key}&format=json&tool=MutableOS`;
    case 'isbn':
      return `https://openlibrary.org/api/books?bibkeys=ISBN:${id.key}&jscmd=data&format=json`;
  }
}
export function normalizeProvider(
  id: AcademicIdentifier,
  bytes: Uint8Array,
  secondary?: Uint8Array,
  discovery: Uint8Array[] = []
): AcademicProjection {
  if (bytes.length > 2 * 1024 * 1024) throw Error('Provider response exceeds 2 MiB');
  const source = new TextDecoder('utf-8', { fatal: true }).decode(bytes),
    c = emptyCitation(id.key, '', id.url),
    out: AcademicProjection = {
      version: 1,
      kind: id.family,
      title: '',
      diagnostics: [],
      citations: [c],
    };
  c.identifiers = [{ namespace: id.family, key: id.key }];
  if (id.family === 'orcid') {
    const raw = providerJson(source);
    if (raw['orcid-identifier']?.path !== id.key) throw Error('ORCID response identity mismatch');
    const person = raw.person,
      name = person?.name;
    c.title =
      safe(name?.['credit-name']?.value) ||
      [name?.['given-names']?.value, name?.['family-name']?.value].filter(Boolean).join(' ');
    if (!c.title) throw Error('ORCID public name is unavailable');
    c.type = 'Person';
    c.providerType = 'person';
    const activities = raw['activities-summary'] ?? {};
    const affiliations = [
      'employments',
      'educations',
      'qualifications',
      'distinctions',
      'memberships',
      'services',
    ].flatMap((k) =>
      (activities[k]?.['affiliation-group'] ?? [])
        .flatMap((g: any) => g.summaries ?? [])
        .map((v: any) => ({ kind: k, record: v }))
    );
    const works = activities.works?.group ?? [];
    out.person = {
      name: c.title,
      affiliations: affiliations.slice(0, 100),
      works: works.slice(0, 100),
      dates: raw.history ?? null,
    };
    if (affiliations.length > 100 || works.length > 100)
      out.diagnostics.push('Showing 100 affiliations/works; exact public record retained.');
    out.diagnostics.push(
      'Public source assertions are unreviewed. No Person, works or affiliations were accepted into knowledge.'
    );
  } else if (id.family === 'isbn') {
    const r = providerJson(source)[`ISBN:${id.key}`];
    if (!r) throw Error('ISBN not found in Open Library');
    c.title = safe(r.title);
    c.type = 'BookEdition';
    c.providerType = 'book';
    c.creators = (r.authors ?? []).slice(0, 200).map((a: any) => ({ literal: safe(a.name) }));
    c.publisher = (r.publishers ?? []).map((p: any) => safe(p.name)).join('; ');
    c.dates = { publication: safe(r.publish_date) };
    c.rawFields = Object.entries(r).map(([k, v]) => [k, JSON.stringify(v)]);
    c.diagnostics.push(
      'ISBN identifies this edition/product. Work links and other editions are not merged; full book access is not implied.'
    );
  } else if (id.family === 'arxiv') {
    const root = xml(source),
      entries = children(root, 'entry');
    if (root.uri !== 'http://www.w3.org/2005/Atom' || entries.length !== 1)
      throw Error('Expected one arXiv Atom entry');
    const e = entries[0],
      returned = academicIdentifier(value(e, 'id').replace(/^http:/, 'https:'));
    if (
      returned?.family !== 'arxiv' ||
      returned.key.replace(/v\d+$/, '') !== id.key.replace(/v\d+$/, '') ||
      (/v\d+$/.test(id.key) && returned.key !== id.key) ||
      !/v\d+$/.test(returned.key)
    )
      throw Error('arXiv version/identity mismatch');
    c.key = returned.key;
    c.identifiers = [{ namespace: 'arxiv', key: returned.key }];
    c.url = returned.url;
    c.title = value(e, 'title').replace(/\s+/g, ' ');
    c.abstract = value(e, 'summary');
    c.creators = children(e, 'author').map((a) => ({ literal: value(a, 'name') }));
    c.dates = { published: value(e, 'published'), updated: value(e, 'updated') };
    c.doi = value(e, 'doi') || undefined;
    c.venue = value(e, 'journal_ref') || undefined;
    c.providerType = 'preprint';
    c.rawFields = children(e, 'category').map((n) => ['category', n.attrs.term]);
    c.fullTextCandidates = children(e, 'link')
      .filter((l) => l.attrs.type === 'application/pdf')
      .map((l) => l.attrs.href.replace(/^http:/, 'https:'))
      .filter((v) => /^https:\/\/arxiv.org\/pdf\//.test(v))
      .slice(0, 1);
    c.diagnostics.push(
      'Preprint version is pinned; DOI/journal references remain unreviewed relationships. PDF acquisition is separate.'
    );
  } else {
    let pmid = id.key;
    if (id.family === 'pmcid') {
      const r = providerJson(source).records?.find((r: any) => r.pmcid === id.key);
      if (!r || r.status === 'error') throw Error('PMCID unavailable');
      if (!r.pmid || !secondary)
        throw Error('PMC record has no supported PubMed metadata; no citation fabricated');
      pmid = String(r.pmid);
      c.identifiers.push({ namespace: 'pmid', key: pmid });
      if (r.doi) c.identifiers.push({ namespace: 'doi', key: String(r.doi) });
      c.diagnostics.push(
        'PMCID and PMID are distinct resources. The conversion record is retained as source evidence, not accepted identity equivalence. Full-text rights have not been established.'
      );
    }
    let input =
      id.family === 'pmcid' ? new TextDecoder('utf-8', { fatal: true }).decode(secondary) : source;
    // NCBI emits an external PUBLIC DTD declaration. Remove only this declaration;
    // internal subsets/entities remain rejected and no DTD is ever resolved.
    input = input.replace(
      /<!DOCTYPE PubmedArticleSet PUBLIC "[^"<>\[\]]*" "https?:\/\/[^"<>\[\]]*">/,
      ''
    );
    const root = xml(input),
      articles = descendants(root, 'PubmedArticle');
    if (articles.length !== 1) throw Error('Expected one PubMed article');
    const a = articles[0],
      citation = child(a, 'MedlineCitation'),
      article = child(citation, 'Article');
    if (value(citation, 'PMID') !== pmid) throw Error('PMID response mismatch');
    c.title = value(article, 'ArticleTitle');
    c.abstract = descendants(a, 'AbstractText')
      .map((n) => (n.attrs.Label ? n.attrs.Label + ': ' : '') + text(n))
      .join('\n');
    c.creators = descendants(a, 'Author').map((n) => ({
      family: value(n, 'LastName') || undefined,
      given: value(n, 'ForeName') || undefined,
      literal: value(n, 'CollectiveName') || undefined,
    }));
    const journal = child(article, 'Journal');
    c.venue = value(journal, 'Title');
    c.providerType = 'journal-article';
    c.dates = { publication: text(child(child(journal, 'JournalIssue'), 'PubDate')) };
    c.rights = descendants(a, 'CopyrightInformation').map(text);
    for (const n of descendants(a, 'ArticleId')) {
      const namespace = n.attrs.IdType,
        key = text(n);
      if (namespace && key) c.identifiers.push({ namespace, key });
      if (namespace === 'doi') c.doi = key;
    }
    c.diagnostics.push(
      'A bibliographic citation does not guarantee open full text. Publisher links require explicit inspection.'
    );
  }
  if (id.family === 'pmcid') {
    if (discovery.length > 3) throw Error('PMC discovery version limit');
    for (const bytes of discovery) {
      if (bytes.length > 2 * 1024 * 1024) throw Error('PMC metadata limit');
      const r = providerJson(new TextDecoder().decode(bytes));
      if (r.pmcid !== id.key || !Number.isSafeInteger(r.version) || r.version < 1)
        throw Error('PMC full-text identity mismatch');
      c.rawFields.push(['PMC version ' + r.version, JSON.stringify(r)]);
      if (r.license_code) c.rights = [...(c.rights ?? []), String(r.license_code)];
      if (r.pdf_url && r.is_pmc_openaccess === true) {
        const u = new URL(
          String(r.pdf_url).replace(
            /^s3:\/\/pmc-oa-opendata\//,
            'https://pmc-oa-opendata.s3.amazonaws.com/'
          )
        );
        if (
          u.protocol === 'https:' &&
          u.hostname === 'pmc-oa-opendata.s3.amazonaws.com' &&
          !u.username &&
          !u.password &&
          !u.port &&
          u.pathname.startsWith('/' + id.key + '.' + r.version + '/') &&
          /\.pdf$/i.test(u.pathname)
        )
          c.fullTextCandidates.push(u.href);
      }
    }
    c.diagnostics.push(
      'PMC Cloud metadata is pinned source evidence. PDF candidates are separate, explicit acquisitions; review each version and licence. No PDF is inferred when the provider offers none.'
    );
  }
  if (!c.title) throw Error('Source has no supported title/name');
  if (c.creators.length > 200) throw Error('Creator count exceeds 200');
  if (c.abstract && c.abstract.length > 50000) throw Error('Abstract size limit');
  out.title = c.title;
  out.diagnostics.push(...c.diagnostics);
  return out;
}
