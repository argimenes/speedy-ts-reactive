import {describe,it,expect} from 'vitest';
import {wikipediaInput} from './encyclopedia';
import {articleProjection,wikidataProjection} from './encyclopedia-projection';
import {bytes,wikiFixture,wdFixture} from './encyclopedia-fixtures';
describe('encyclopedia projections',()=>{
 it('recognizes language/mobile and revision URLs without broad URL probing',()=>{
  expect(wikipediaInput('https://fr.m.wikipedia.org/wiki/Douglas_Adams?tracking=1#Life')).toMatchObject({site:'fr.wikipedia.org',title:'Douglas Adams',sourceUrl:'https://fr.m.wikipedia.org/wiki/Douglas_Adams?tracking=1#Life'});
  expect(wikipediaInput('https://en.wikipedia.org/w/index.php?oldid=123')).toMatchObject({oldid:123});
  for(const s of ['https://en.wikipedia.org.evil/wiki/A','https://me@en.wikipedia.org/wiki/A','https://en.wikipedia.org/w/index.php?action=edit&title=A','https://en.wikipedia.org/wiki/%ZZ','file:///wiki/A','https://en.wikipedia.org/w/index.php?oldid=1&diff=2'])expect(wikipediaInput(s)).toBeUndefined();
 });
 it('pins revision and strips active HTML while retaining diagnostics and subject association',()=>{const f=wikiFixture(),p=articleProjection(f.source,...f.responses as [Uint8Array,Uint8Array]);expect(p.revision).toBe(123);expect(p.qid).toBe('Q42');expect(p.html).toContain('<b>writer</b>');expect(p.html).not.toMatch(/script|iframe|onerror|evil\(\)/);expect(p.diagnostics.join(' ')).toContain('redirects');});
 it('rejects revision races, absent revision source and non-article namespaces',()=>{const f=wikiFixture();expect(()=>articleProjection({...f.source,oldid:124},...f.responses as [Uint8Array,Uint8Array])).toThrow('revision');expect(()=>articleProjection(f.source,f.responses[0],bytes({parse:{pageid:99,revid:123}}))).toThrow('revision');});
 it('allows absent QIDs without inventing a subject',()=>{const f=wikiFixture('en.wikipedia.org',undefined); // explicit absence fixture
  const first=JSON.parse(new TextDecoder().decode(f.responses[0]));first.query.pages[0].pageprops={};expect(articleProjection(f.source,bytes(first),f.responses[1]).qid).toBeUndefined();});
 it('preserves rank, typed values, qualifiers, references and unsupported data',()=>{const p=wikidataProjection('Q42',wdFixture()),s=p.statements.find(x=>x.id==='Q42$one')!;expect(s.supported).toBe(true);expect(s.qualifiers).toHaveProperty('P580');expect(s.references).toHaveLength(1);expect(p.statements.find(x=>x.id==='Q42$two')).toMatchObject({rank:'deprecated',summary:'no value',supported:true});expect(p.statements.find(x=>x.id==='Q42$unsupported')?.supported).toBe(false);});
 it('bounds review and rejects redirected/mismatched entity JSON',()=>{const lower=JSON.parse(new TextDecoder().decode(wdFixture()));lower.entities.Q42.claims.P106[0].id='q42$legacy';lower.entities.Q42.labels={mul:{value:'Universal label'}};expect(wikidataProjection('Q42',bytes(lower))).toMatchObject({label:'Universal label'});expect(wikidataProjection('Q42',bytes(lower)).statements.some(s=>s.id==='q42$legacy')).toBe(true);
  const raw=JSON.parse(new TextDecoder().decode(wdFixture()));raw.entities.Q42.claims.P31=Array.from({length:55},(_,i)=>({id:'Q42$'+i,rank:'normal',mainsnak:{property:'P31',snaktype:'somevalue'}}));const p=wikidataProjection('Q42',bytes(raw));expect(p.statements).toHaveLength(50);expect(p.diagnostics.join(' ')).toContain('omitted');expect(()=>wikidataProjection('Q43',wdFixture())).toThrow('different');});
});
