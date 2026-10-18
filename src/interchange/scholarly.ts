/** Pure, bounded academic interchange. No network, editor state or filesystem. */
export type ScholarlyProvider = 'crossref' | 'datacite';
export interface ScholarlyMetadata {
 version:1; doi:string; title:string; type:string; providerType:string;
 creators:Array<{literal?:string;family?:string;given?:string;ORCID?:string}>;
 issued?:number[]; publisher?:string; venue?:string; url:string;
 licenses:string[]; fullTextCandidates:string[]; diagnostics:string[];
}
export interface ScholarlyCitation {
 version:1; entityId:string; resourceId:string; snapshotId:string;
 provider:ScholarlyProvider; retrievedAt:string; endpoint:string;
 asset:{kind:'managed';cavernId:string;assetId:string}; metadata:ScholarlyMetadata;
}
export function doiInput(value:unknown):{doi:string;sourceUrl:string}|undefined {
 if(typeof value!=='string'||value.length>4096)return;
 const sourceUrl=value.trim();let doi=sourceUrl;
 if(/^https?:\/\//i.test(doi)){
  let u:URL;try{u=new URL(doi);}catch{return;}
  if(!['doi.org','dx.doi.org'].includes(u.hostname.toLowerCase())||u.username||u.password||u.port)return;
  try{doi=decodeURIComponent(u.pathname.slice(1));}catch{return;}
 }
 // ASCII equivalence only. Do not strip suffix punctuation or normalize Unicode.
 if(!/^10\.\d{4,9}\/[^\s\u0000-\u001f\u007f]+$/.test(doi))return;
 return {doi:doi.replace(/[A-Z]/g,c=>c.toLowerCase()),sourceUrl};
}
const clean=(v:unknown,max=1000)=>typeof v==='string'?v.replace(/<[^>]*>/g,'').replace(/[\u0000-\u001f]/g,' ').trim().slice(0,max):'';
const url=(v:unknown)=>{try{const u=new URL(String(v));return u.protocol==='https:'&&!u.username&&!u.password&&u.href.length<=4096?u.href:undefined;}catch{return;}};
export function normalizeScholarly(provider:ScholarlyProvider,doi:string,bytes:Uint8Array):ScholarlyMetadata {
 if(!bytes.length||bytes.length>2*1024*1024)throw Error('Scholarly response exceeds 2 MiB');
 const raw=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
 const m=provider==='crossref'?raw.message:raw.data?.attributes;
 if(!m||doiInput(m.DOI??m.doi)?.doi!==doi)throw Error('Provider returned a different or missing DOI');
 const title=clean(provider==='crossref'?m.title?.[0]:m.titles?.[0]?.title);
 if(!title)throw Error('Provider metadata has no title');
 const providerType=clean(provider==='crossref'?m.type:m.types?.resourceTypeGeneral,256)||'unknown';
 const key=providerType.toLowerCase();
 const publications=new Set(['journal-article','book','book-chapter','proceedings-article','posted-content','dissertation','report','monograph','reference-entry','journalarticle','bookchapter','conferencepaper','preprint','text']);
 const type=key.includes('dataset')?'Dataset':key.includes('software')?'Software':key.includes('instrument')?'ResearchInstrument':publications.has(key)?'ScholarlyWork':'ResearchObject';
 const authors=provider==='crossref'?m.author:m.creators;
 const diagnostics:string[]=[];if(Array.isArray(authors)&&authors.length>200)diagnostics.push('Creator list limited to 200; original response retained.');
 const creators=(Array.isArray(authors)?authors:[]).slice(0,200).map((a:any)=>{
  const family=clean(a.family??a.familyName,200),given=clean(a.given??a.givenName,200),literal=clean(a.name,400);
  const orcid=url(a.ORCID??a.nameIdentifiers?.find((n:any)=>n.nameIdentifierScheme==='ORCID')?.nameIdentifier);
  return {...(family?{family}:{}),...(given?{given}:{}),...(!family&&literal?{literal}:{}),...(orcid&&/^https:\/\/orcid.org\/\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/.test(orcid)?{ORCID:orcid}:{})};
 });
 const date=provider==='crossref'?(m.issued?.['date-parts']?.[0]??m.published?.['date-parts']?.[0]):[m.publicationYear];
 const issued=Array.isArray(date)&&date.length>0&&date.length<=3&&date.every((n:any)=>Number.isInteger(Number(n)))?date.map(Number):undefined;
 const licenses=(provider==='crossref'?m.license?.map((l:any)=>l.URL):m.rightsList?.map((l:any)=>l.rightsUri))??[];
 const links=provider==='crossref'?m.link?.map((l:any)=>l.URL):[];
 return {version:1,doi,title,type,providerType,creators,...(issued?{issued}:{}),publisher:clean(m.publisher)||undefined,venue:clean(m['container-title']?.[0])||undefined,url:url(m.URL??m.url)??doiUrl(doi),licenses:[...new Set<string>(licenses.map(url).filter(Boolean))].slice(0,20),fullTextCandidates:[...new Set<string>((links??[]).map(url).filter(Boolean))].slice(0,20),diagnostics};
}
export const doiUrl=(doi:string)=>'https://doi.org/'+encodeURIComponent(doi).replaceAll('%2F','/');
export function cslJson(m:ScholarlyMetadata){
 const types:Record<string,string>={'dataset':'dataset','software':'software','journal-article':'article-journal','book':'book','book-chapter':'chapter','proceedings-article':'paper-conference','Dataset':'dataset','Software':'software','JournalArticle':'article-journal','Book':'book'};
 return {id:doiUrl(m.doi),type:types[m.providerType]??'document',title:m.title,DOI:m.doi,author:m.creators.map(({ORCID,...name})=>name),custom:{providerType:m.providerType,authorIdentifiers:m.creators.flatMap((a,index)=>a.ORCID?[{index,ORCID:a.ORCID}]:[])},...(m.issued?{issued:{'date-parts':[m.issued]}}:{}),...(m.publisher?{publisher:m.publisher}:{}),...(m.venue?{'container-title':m.venue}:{}),URL:m.url};
}
/** Fixed author–year presentation; not a claim of compliance with a named CSL style. */
export function citationText(m:ScholarlyMetadata){
 const names=m.creators.slice(0,3).map(a=>a.literal??[a.family,a.given].filter(Boolean).join(', ')).filter(Boolean).join('; ');
 return `${names}${m.creators.length>3?' et al.':''}${names?' ':''}(${m.issued?.[0]??'n.d.'}). ${m.title}.${m.venue?' '+m.venue+'.':''} https://doi.org/${m.doi}`;
}
export function citationData(value:unknown):ScholarlyCitation|undefined {
 const c=value as ScholarlyCitation,m=c?.metadata;
 if(c?.version!==1||typeof c.entityId!=='string'||typeof c.snapshotId!=='string'||!m||typeof m.title!=='string'||m.title.length>1000||!Array.isArray(m.creators)||m.creators.length>200||typeof m.doi!=='string'||!doiInput(m.doi))return;
 if(m.creators.some(a=>!a||typeof a!=='object'||Object.values(a).some(v=>typeof v!=='string')))return;
 if(m.issued!==undefined&&(!Array.isArray(m.issued)||m.issued.length>3||m.issued.some(n=>!Number.isInteger(n))))return;
 if(m.diagnostics!==undefined&&(!Array.isArray(m.diagnostics)||m.diagnostics.some(s=>typeof s!=='string')))return;
 return c;
}
