import type { CitationRecord } from './model';
const plain = (s: string) => s.replace(/[\r\n]+/g, ' ').replace(/[\u0000-\u001f]/g, '');
const bib = (s: string) =>
  plain(s).replace(/\\|[{}%&#_$]/g, (c) => (c === '\\' ? '\\textbackslash{}' : '\\' + c));
export function exportBibliography(records: CitationRecord[], format: 'bibtex' | 'ris') {
  if (!records.length || records.length > 200) throw Error('Select 1–200 citations');
  const diagnostics = [
    'Normalized export preserves mapped citation fields; original syntax, macros and unmapped fields remain in the retained source.',
  ];
  const keys = new Map<string, number>();
  const source = records
    .map((c, i) => {
      const base = c.key.replace(/[^A-Za-z0-9_.:-]/g, '_') || 'citation' + i,
        n = (keys.get(base) ?? 0) + 1;
      keys.set(base, n);
      const key = base + (n > 1 ? '_' + n : '');
      const authors = c.creators.map(
        (a) => a.literal ?? [a.family, a.given].filter(Boolean).join(', ')
      );
      if (format === 'bibtex') {
        const fields = [
          ['title', c.title],
          ['author', authors.join(' and ')],
          [
            /^\d{4}$/.test(c.dates?.publication ?? c.issued?.[0]?.toString() ?? '')
              ? 'year'
              : 'date',
            c.dates?.publication ?? c.issued?.[0]?.toString(),
          ],
          ['publisher', c.publisher],
          ['journal', c.venue],
          ['doi', c.doi],
          ['url', c.url],
        ].filter(([, v]) => v);
        const type = [
          'article',
          'book',
          'inbook',
          'incollection',
          'inproceedings',
          'proceedings',
          'phdthesis',
          'mastersthesis',
          'techreport',
          'manual',
          'unpublished',
          'misc',
        ].includes(c.providerType)
          ? c.providerType
          : ((
              {
                'journal-article': 'article',
                JOUR: 'article',
                BOOK: 'book',
                CHAP: 'incollection',
                CONF: 'inproceedings',
                RPRT: 'techreport',
              } as Record<string, string>
            )[c.providerType] ?? 'misc');
        return `@${type}{${key},\n${fields.map(([k, v]) => `  ${k} = {${bib(v!)}},`).join('\n')}\n}`;
      }
      const fields = [
        [
          'TY',
          (
            {
              book: 'BOOK',
              article: 'JOUR',
              'journal-article': 'JOUR',
              BOOK: 'BOOK',
              JOUR: 'JOUR',
              THES: 'THES',
              RPRT: 'RPRT',
              CONF: 'CONF',
            } as Record<string, string>
          )[c.providerType] ?? 'GEN',
        ],
        ['ID', key],
        ['TI', c.title],
        ...authors.map((a) => ['AU', a]),
        ['PY', c.dates?.publication ?? c.issued?.[0]?.toString()],
        ['PB', c.publisher],
        ['JO', c.venue],
        ['DO', c.doi],
        ['UR', c.url],
      ].filter(([, v]) => v);
      return fields.map(([k, v]) => `${k}  - ${plain(v!)}`).join('\r\n') + '\r\nER  -';
    })
    .join(format === 'ris' ? '\r\n\r\n' : '\n\n');
  return { source, diagnostics };
}
