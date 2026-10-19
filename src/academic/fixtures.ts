import { zipSync } from 'fflate';
export const alto = `<alto xmlns="http://www.loc.gov/standards/alto/ns-v4#"><Description><MeasurementUnit>pixel</MeasurementUnit></Description><Layout><Page ID="p" WIDTH="800" HEIGHT="1000"><ReadingOrder><OrderedGroup><RegionRefIndexed index="0" regionRef="b"/><RegionRefIndexed index="1" regionRef="a"/></OrderedGroup></ReadingOrder><PrintSpace><TextBlock ID="a"><TextLine ID="la" HPOS="10" VPOS="50" WIDTH="100" HEIGHT="20"><String ID="wa" CONTENT="Second" HPOS="10" VPOS="50" WIDTH="100" HEIGHT="20" WC="0.8"/></TextLine></TextBlock><TextBlock ID="b"><TextLine ID="lb" HPOS="10" VPOS="10" WIDTH="100" HEIGHT="20"><String ID="wb" CONTENT="First" HPOS="10" VPOS="10" WIDTH="100" HEIGHT="20" WC="0.9"/></TextLine></TextBlock></PrintSpace></Page></Layout></alto>`;
export const page = `<PcGts xmlns="http://schema.primaresearch.org/PAGE/gts/pagecontent/2019-07-15"><Page imageFilename="page.png" imageWidth="800" imageHeight="1000"><TextRegion id="r"><Coords points="10,10 110,10 110,40 10,40"/><TextLine id="line"><Coords points="10,10 110,10 110,40 10,40"/><Word id="word"><Coords points="10,10 110,10 110,40 10,40"/><TextEquiv conf="0.95"><Unicode>Word</Unicode></TextEquiv></Word><TextEquiv><Unicode>Word</Unicode></TextEquiv></TextLine></TextRegion></Page></PcGts>`;
export function epub(version = '3.0', extra: Record<string, string> = {}) {
  const files: Record<string, string> = {
    mimetype: 'application/epub+zip',
    'META-INF/container.xml':
      '<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="book/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
    'book/content.opf': `<package xmlns="http://www.idpf.org/2007/opf" version="${version}" unique-identifier="bookid"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Retained book</dc:title><dc:identifier id="bookid">urn:test:book</dc:identifier></metadata><manifest><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/></manifest><spine><itemref idref="chapter"/></spine></package>`,
    'book/chapter.xhtml':
      '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>One</title></head><body><h1 id="heading">Chapter one</h1><p>Readable <strong>text</strong>.</p><a href="#heading">Heading</a></body></html>',
    'book/nav.xhtml':
      '<html xmlns="http://www.w3.org/1999/xhtml"><body><nav><a href="chapter.xhtml#heading">One</a></nav></body></html>',
    ...extra,
  };
  return zipSync(
    Object.fromEntries(Object.entries(files).map(([p, s]) => [p, new TextEncoder().encode(s)])),
    { level: 0 }
  );
}
export const orcid = JSON.stringify({
  'orcid-identifier': { path: '0000-0002-1825-0097' },
  person: { name: { 'given-names': { value: 'Jane' }, 'family-name': { value: 'Researcher' } } },
  history: { 'last-modified-date': { value: 123 } },
  'activities-summary': {
    works: { group: [{ 'work-summary': [{ title: { title: { value: 'Work' } } }] }] },
  },
});
export const arxiv =
  '<feed xmlns="http://www.w3.org/2005/Atom" xmlns:arxiv="http://arxiv.org/schemas/atom"><entry><id>http://arxiv.org/abs/2301.00001v2</id><title>Preprint</title><summary>Abstract</summary><author><name>Jane Researcher</name></author><published>2023-01-01</published><updated>2023-02-01</updated><arxiv:doi>10.1234/test</arxiv:doi><link type="application/pdf" href="http://arxiv.org/pdf/2301.00001v2"/></entry></feed>';
export const pubmed =
  '<PubmedArticleSet><PubmedArticle><MedlineCitation><PMID>12345</PMID><Article><ArticleTitle>Medical paper</ArticleTitle><Abstract><AbstractText Label="BACKGROUND">Abstract</AbstractText></Abstract><AuthorList><Author><LastName>Smith</LastName><ForeName>Jane</ForeName></Author></AuthorList><Journal><Title>Journal</Title><JournalIssue><PubDate><Year>2020</Year></PubDate></JournalIssue></Journal></Article></MedlineCitation><PubmedData><ArticleIdList><ArticleId IdType="doi">10.1234/medical</ArticleId><ArticleId IdType="pmc">PMC12345</ArticleId></ArticleIdList></PubmedData></PubmedArticle></PubmedArticleSet>';
