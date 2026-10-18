import {describe,it,expect} from 'vitest';
import {doiInput,normalizeScholarly,cslJson,citationText} from './scholarly';
const bytes=(v:unknown)=>new TextEncoder().encode(JSON.stringify(v));
describe('scholarly identifiers and projections',()=>{
 it('preserves supplied provenance, decodes once and folds only ASCII',()=>{
  expect(doiInput(' https://doi.org/10.1234%2FAbC(Ä)?tracking=yes ')).toEqual({doi:'10.1234/abc(Ä)',sourceUrl:'https://doi.org/10.1234%2FAbC(Ä)?tracking=yes'});
  expect(doiInput('10.1234/A.')).toMatchObject({doi:'10.1234/a.'});
  expect(doiInput('https://doi.org/10.1234/a%252Fb')?.doi).toBe('10.1234/a%2fb');
  for(const value of ['words 10.1234/a','10.1234/a b','https://doi.org.evil/10.1234/a','https://me@doi.org/10.1234/a','https://doi.org/%ZZ','javascript:10.1234/a'])expect(doiInput(value)).toBeUndefined();
 });
 it('retains datasets and versions rather than inferring an article identity',()=>{
  const m=normalizeScholarly('datacite','10.1234/data',bytes({data:{attributes:{doi:'10.1234/DATA',titles:[{title:'Dataset v2'}],types:{resourceTypeGeneral:'Dataset'},creators:[{name:'A Lab'}],publicationYear:2024}}}));
  expect(normalizeScholarly('datacite','10.1234/object',bytes({data:{attributes:{doi:'10.1234/object',titles:[{title:'Model'}],types:{resourceTypeGeneral:'Model'}}}})).type).toBe('ResearchObject');
  expect(m.type).toBe('Dataset');expect(cslJson(m).type).toBe('dataset');expect(citationText(m)).toContain('A Lab (2024). Dataset v2.');
 });
 it('normalizes bounded safe Crossref metadata and rejects mismatched identity',()=>{
  const raw={message:{DOI:'10.1234/abc',title:['<b>Work</b>'],type:'journal-article',author:[{family:'Smith',given:'Jane',ORCID:'https://orcid.org/0000-0002-1825-0097'}],issued:{'date-parts':[[2020,2]]},link:[{URL:'javascript:alert(1)'},{URL:'https://example.org/paper.pdf'}]}};
  const m=normalizeScholarly('crossref','10.1234/abc',bytes(raw));expect(m.title).toBe('Work');expect(cslJson(m).author[0]).not.toHaveProperty('ORCID');expect(cslJson(m).custom.authorIdentifiers[0].ORCID).toBe('https://orcid.org/0000-0002-1825-0097');expect(m.fullTextCandidates).toEqual(['https://example.org/paper.pdf']);expect(cslJson(m)).toMatchObject({type:'article-journal',DOI:'10.1234/abc',issued:{'date-parts':[[2020,2]]}});
  expect(()=>normalizeScholarly('crossref','10.1234/other',bytes(raw))).toThrow('different');
  expect(()=>normalizeScholarly('crossref','10.1234/abc',new Uint8Array(2*1024*1024+1))).toThrow('2 MiB');
 });
});
