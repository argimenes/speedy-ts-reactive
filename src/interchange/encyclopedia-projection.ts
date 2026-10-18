import {compileSourcePreview} from './source-preview';
import {validQid,type WikiInput,type ArticleProjection,type WikidataProjection,type WikiStatement} from './encyclopedia';
export function jsonCapture(bytes:Uint8Array){if(!bytes.length||bytes.length>2*1024*1024)throw Error('Encyclopedia response exceeds 2 MiB');return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}
const positive=(n:unknown):n is number=>Number.isSafeInteger(n)&&Number(n)>0;
export function articleProjection(input:WikiInput,lookup:Uint8Array,parsed:Uint8Array):ArticleProjection {
 const query=jsonCapture(lookup),pages=query.query?.pages,p=Array.isArray(pages)?pages[0]:undefined,article=jsonCapture(parsed).parse;
 if(!p||pages.length!==1||p.missing||p.ns!==0||!positive(p.pageid))throw Error('Select one available Wikipedia article in the main namespace');
 const revision=p.revisions?.[0]?.revid;
 if(!positive(revision)||input.oldid&&input.oldid!==revision||article?.revid!==revision||article?.pageid!==p.pageid)throw Error('Article page/revision changed during capture');
 if(typeof article.text!=='string'||typeof article.wikitext!=='string'||typeof p.title!=='string')throw Error('Missing revision-specific article source');
 const safe=compileSourcePreview(article.text,'html'),qid=p.pageprops?.wikibase_item;
 if(qid!==undefined&&!validQid(qid))throw Error('Invalid declared Wikidata identity');
 const permalink=`https://${input.site}/w/index.php?oldid=${revision}`;
 return {site:input.site,pageId:p.pageid,revision,title:p.title.slice(0,512),...(qid?{qid}:{}),html:safe.body,links:safe.links,permalink,diagnostics:[...safe.warnings,...(query.query.redirects?.length?['Wikipedia redirects were resolved; original URL retained.']:[]),...(qid?['Subject QID is the page association observed at capture time, not a historical assertion about this revision.']:['This article has no declared Wikidata subject.']), 'Revision-specific parser output may include templates from their state at retrieval. Images, scripts, styles and embedded media are not acquired.']};
}
export const WIKIDATA_PROPERTIES:Record<string,string>={P31:'instance of',P279:'subclass of',P106:'occupation',P27:'country of citizenship',P569:'date of birth',P570:'date of death',P19:'place of birth',P20:'place of death',P571:'inception',P856:'official website'};
function supportedSnak(s:any):boolean {
 if(!s||!/^P[1-9]\d*$/.test(s.property))return false;
 if(['somevalue','novalue'].includes(s.snaktype))return true;
 if(s.snaktype!=='value')return false;const d=s.datavalue;
 if(s.datatype==='wikibase-item')return d?.type==='wikibase-entityid'&&validQid(d.value?.id);
 if(['string','external-id','url'].includes(s.datatype))return d?.type==='string'&&typeof d.value==='string'&&d.value.length<=4096;
 if(s.datatype==='time')return d?.type==='time'&&typeof d.value?.time==='string'&&Number.isInteger(d.value.precision)&&typeof d.value.calendarmodel==='string';
 if(s.datatype==='quantity')return d?.type==='quantity'&&typeof d.value?.amount==='string'&&typeof d.value.unit==='string';
 if(s.datatype==='monolingualtext')return d?.type==='monolingualtext'&&typeof d.value?.text==='string'&&typeof d.value.language==='string';
 return false;
}
export function wikidataProjection(qid:string,bytes:Uint8Array):WikidataProjection {
 if(!validQid(qid))throw Error('Invalid QID');const raw=jsonCapture(bytes),e=raw.entities?.[qid];
 if(e?.id!==qid||!positive(e.lastrevid))throw Error('Wikidata returned a different or missing entity/revision');
 const diagnostics:string[]=[],statements:WikiStatement[]=[];let eligible=0;
 for(const [property,label] of Object.entries(WIKIDATA_PROPERTIES))for(const s of e.claims?.[property]??[]){
  eligible++;if(statements.length>=50)continue;
  if(typeof s.id!=='string'||!s.id.toUpperCase().startsWith(qid+'$')||s.id.length>200||s.mainsnak?.property!==property){diagnostics.push('Malformed statement omitted.');continue;}
  const nested=[...Object.values(s.qualifiers??{}).flat() as any[],...(s.references??[]).flatMap((r:any)=>Object.values(r.snaks??{}).flat())];
  const oversized=new TextEncoder().encode(JSON.stringify(s)).length>12000;
  const supported=!oversized&&supportedSnak(s.mainsnak)&&nested.every(supportedSnak);
  const notes=supported?[]:['Unsupported value/qualifier/reference type or oversized statement; retained in original snapshot, not accepted as a Claim.'];
  const value=s.mainsnak,summary=value.snaktype==='somevalue'?'unknown value':value.snaktype==='novalue'?'no value':JSON.stringify(value.datavalue?.value);
  statements.push({id:s.id,property,label,rank:['preferred','normal','deprecated'].includes(s.rank)?s.rank:'unknown',value:oversized?{snaktype:value.snaktype,datatype:value.datatype,property}:value,qualifiers:oversized?{}:s.qualifiers??{},qualifierOrder:!oversized&&Array.isArray(s['qualifiers-order'])?s['qualifiers-order']:[],references:oversized?[]:s.references??[],summary:(summary??'unsupported').slice(0,2000),supported,diagnostics:notes});
 }
 if(eligible>50)diagnostics.push(`${eligible-50} additional selected-property statements omitted from this review; original response retained.`);
 diagnostics.push('Only the configured property subset is offered. No related entities or citation graph were fetched. Conflicting statements are not reconciled automatically.');
 return {qid,revision:e.lastrevid,label:String(e.labels?.en?.value??e.labels?.mul?.value??qid).slice(0,512),description:String(e.descriptions?.en?.value??'').slice(0,1000),statements,diagnostics};
}
