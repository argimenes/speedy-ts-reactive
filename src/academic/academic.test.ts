import {parseAcademic} from './parse';
import { zipSync } from 'fflate';
import { it, expect } from 'vitest';
import { academicIdentifier, isbnId, orcidId } from './identifiers';
import { parseOcr } from './ocr';
import { parseEpub, epubPath } from './epub';
import { bibliography, exportBibliography } from './bibliography';
import { normalizeProvider } from './providers';
import { xml } from './xml';
import { alto, page, epub, orcid, arxiv, pubmed } from './fixtures';
const bytes = (s: string) => new TextEncoder().encode(s);
it('checks ORCID and ISBN identities and preserves separate namespaces/versions', () => {
  expect(orcidId('0000-0002-1825-0097')).toBe('0000-0002-1825-0097');
  expect(orcidId('0000-0002-1825-0098')).toBeUndefined();
  expect(isbnId('0-306-40615-2')).toBe('9780306406157');
  expect(isbnId('9780306406158')).toBeUndefined();
  expect(academicIdentifier('12345')).toBeUndefined();
  for (const value of [
    'arXiv:2301.00001v2',
    'hep-th/9901001v1',
    'PMID:12345',
    'PMC12345',
    'https://openlibrary.org/isbn/9780306406157',
  ])
    expect(academicIdentifier(value)).toBeTruthy();
  expect(academicIdentifier('https://orcid.org.evil.test/0000-0002-1825-0097')).toBeUndefined();
});
it('parses exact provider identities, versions and source fields without canonical mutation', () => {
  const o = normalizeProvider(academicIdentifier('0000-0002-1825-0097')!, bytes(orcid));
  expect(o.person?.name).toBe('Jane Researcher');
  expect(o.person?.works).toHaveLength(1);
  const a = normalizeProvider(academicIdentifier('arXiv:2301.00001')!, bytes(arxiv));
  expect(a.citations[0].key).toBe('2301.00001v2');
  expect(() => normalizeProvider(academicIdentifier('arXiv:2301.00001v1')!, bytes(arxiv))).toThrow(
    /mismatch/
  );
  const p = normalizeProvider(academicIdentifier('PMID:12345')!, bytes(pubmed));
  expect(p.citations[0].abstract).toContain('BACKGROUND');
  const pmc = normalizeProvider(
    academicIdentifier('PMC12345')!,
    bytes('{"records":[{"pmcid":"PMC12345","pmid":"12345"}]}'),
    bytes(pubmed)
  );
  expect(pmc.kind).toBe('pmcid');
  expect(pmc.citations[0].identifiers.some((i) => i.namespace === 'pmid')).toBe(true);
  expect(() => normalizeProvider(academicIdentifier('PMID:12346')!, bytes(pubmed))).toThrow(
    /mismatch/
  );
});
it('preserves BibTeX macros, concatenation, authors, raw fields and duplicate keys', () => {
  const source =
      '@string{j={Journal}}\n@article{key,title={Café {Research}},author={Smith, Jane and {World Group}},journal=j # { More},year=2020,custom={Retain}}\n@book{key,title={Other}}',
    p = bibliography(source, 'bibtex');
  expect(p.citations).toHaveLength(2);
  expect(p.citations[0].creators[0].family).toBe('Smith');
  expect(p.citations[0].venue).toBe('Journal More');
  expect(p.citations[0].rawFields).toContainEqual(['custom', 'Retain']);
  expect(p.diagnostics.join(' ')).toContain('Duplicate');
  const exported = exportBibliography(p.citations, 'bibtex');
  expect(bibliography(exported.source, 'bibtex').citations.map((c) => c.key)).toEqual([
    'key',
    'key_2',
  ]);
});
it('preserves repeated RIS fields and multiline values, with inert Unicode round trips', () => {
  const p = bibliography(
    'TY  - JOUR\nID  - x\nTI  - Unicode café\nAU  - One\nAU  - Two\nKW  - first\nKW  - second\nAB  - Line one\n  line two\nZZ  - retained\nER  -\n',
    'ris'
  );
  expect(p.citations[0].creators).toHaveLength(2);
  expect(p.citations[0].abstract).toBe('Line one\nline two');
  expect(p.citations[0].rawFields.filter(([k]) => k === 'KW')).toHaveLength(2);
  const round = bibliography(exportBibliography(p.citations, 'ris').source, 'ris');
  expect(round.citations[0].title).toBe('Unicode café');
  expect(round.citations[0].creators).toHaveLength(2);
  expect(() => bibliography('TY  - BOOK\nTI  - incomplete', 'ris')).toThrow(/ER/);
  const book = bibliography('TY  - BOOK\nTI  - Book\nER  -', 'ris');
  expect(
    bibliography(exportBibliography(book.citations, 'bibtex').source, 'bibtex').citations[0]
      .providerType
  ).toBe('book');
});
it('retains ALTO explicit reading order, confidence and original page coordinates', () => {
  const p = parseOcr(alto);
  expect(p.kind).toBe('alto');
  expect(p.pages![0].text).toBe('First\nSecond\n');
  expect(p.pages![0].order).toBe('explicit');
  expect(p.pages![0].lines[0].words[0]).toMatchObject({
    start: 0,
    end: 5,
    confidence: 0.9,
    points: [
      [10, 10],
      [110, 10],
      [110, 30],
      [10, 30],
    ],
  });
});
it('preserves PAGE polygons and marks uncertain order; rejects invalid geometry and XML attacks', () => {
  const p = parseOcr(page);
  expect(p.kind).toBe('page');
  expect(p.pages![0].order).toBe('source-order');
  expect(p.pages![0].lines[0].words[0].confidence).toBe(0.95);
  expect(() => parseOcr(page.replace('110,40', '900,40'))).toThrow(/coordinates/);
  for (const source of [
    '<!DOCTYPE a [<!ENTITY x SYSTEM "file:///etc/passwd">]><a>&x;</a>',
    '<a>'.repeat(70) + '</a>'.repeat(70),
    '<TEI xmlns="http://www.tei-c.org/ns/1.0"/>',
  ])
    expect(() => parseOcr(source)).toThrow();
  expect(() => xml('<a><b></a>')).toThrow();
});
it.each(['2.0', '3.0'])(
  'reads EPUB %s metadata, spine, fragments and navigation without active content',
  (version) => {
    const p = parseEpub(epub(version));
    expect(p.title).toBe('Retained book');
    expect(p.chapters![0].html).toContain('Readable');
    expect(p.chapters![0].anchors).toContain('heading');
    expect(p.navigation?.some((n) => n.href === 'book/chapter.xhtml#heading')).toBe(true);
  }
);
it('rejects malicious/encrypted EPUB paths and scripts', () => {
  expect(() => epubPath('book/ch.xhtml', '../../etc/passwd')).toThrow();
  expect(() => parseEpub(epub('3.0', { 'META-INF/encryption.xml': '<encryption/>' }))).toThrow(
    /Encrypted/
  );
  expect(() =>
    parseEpub(
      epub('3.0', {
        'book/chapter.xhtml':
          '<html xmlns="http://www.w3.org/1999/xhtml"><body><script>alert(1)</script></body></html>',
      })
    )
  ).toThrow(/Active/);
  expect(() => parseEpub(epub('3.0', { '../escape': 'bad' }))).toThrow(/Unsafe/);
});

it('bounds ZIP inflation and refuses untrusted declarations while retaining same-chapter anchors', () => {
  expect(epubPath('book/chapter.xhtml', '#heading')).toEqual({
    path: 'book/chapter.xhtml',
    fragment: 'heading',
  });
  expect(() =>
    parseEpub(
      zipSync(
        { mimetype: bytes('application/epub+zip'), bomb: bytes('x'.repeat(2000000)) },
        { level: 9 }
      )
    )
  ).toThrow(/expansion/);
  expect(() => xml('<!DOCTYPE html [<!ENTITY boom "x">]><html>&boom;</html>')).toThrow(/DTD/);
});
it('offers only provider-declared PMC PDF originals with pinned rights and distinct identities', () => {
  const metadata = bytes(
    JSON.stringify({
      pmcid: 'PMC12345',
      version: 2,
      is_pmc_openaccess: true,
      license_code: 'CC BY',
      pdf_url: 's3://pmc-oa-opendata/PMC12345.2/file.pdf?md5=abc',
    })
  );
  const p = normalizeProvider(
    academicIdentifier('PMC12345')!,
    bytes('{"records":[{"pmcid":"PMC12345","pmid":"12345"}]}'),
    bytes(pubmed),
    [metadata]
  );
  expect(p.citations[0].fullTextCandidates).toEqual([
    'https://pmc-oa-opendata.s3.amazonaws.com/PMC12345.2/file.pdf?md5=abc',
  ]);
  expect(p.citations[0].rights).toContain('CC BY');
  expect(p.citations[0].identifiers[0].namespace).toBe('pmcid');
});

it('detects OCR dialect from parsed namespaces after bounded leading comments',()=>{expect(parseAcademic(bytes('<!--'+'x'.repeat(5000)+'-->'+alto),'ocr').kind).toBe('alto');});
