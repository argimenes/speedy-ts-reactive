/** Pure encyclopedia identity and bounded projection; no network or editor state. */
import type {ManagedAssetReference} from './managed-asset';
export const WEB_ARTICLE='mutable/web-article-block';
export interface WikiInput {site:string;title?:string;oldid?:number;sourceUrl:string}
export function wikipediaInput(value:unknown):WikiInput|undefined {
 if(typeof value!=='string'||value.length>4096)return;
 try{const sourceUrl=value.trim(),u=new URL(sourceUrl),m=/^([a-z][a-z0-9-]{0,30})(?:\.m)?\.wikipedia\.org$/.exec(u.hostname);
  if(!m||!['http:','https:'].includes(u.protocol)||u.username||u.password||u.port)return;
  const site=m[1]+'.wikipedia.org';let title:string|undefined,oldid:number|undefined;
  if(u.searchParams.has('oldid')){const n=u.searchParams.get('oldid')!;if(!/^[1-9]\d{0,14}$/.test(n))return;oldid=Number(n);}
  if(u.pathname.startsWith('/wiki/'))title=decodeURIComponent(u.pathname.slice(6)).replaceAll('_',' ');
  else if(u.pathname==='/w/index.php')title=u.searchParams.get('title')??undefined;
  else return;
  if(!oldid&&(!title||title.length>512||/[\u0000-\u001f]/.test(title)))return;
  if(u.searchParams.has('diff'))return;
  if(u.searchParams.has('action')&&u.searchParams.get('action')!=='view')return;
  return {site,...(title?{title}:{}),...(oldid?{oldid}:{}),sourceUrl};
 }catch{return;}
}
export const validQid=(q:unknown):q is string=>typeof q==='string'&&/^Q[1-9]\d{0,14}$/.test(q);
export interface ArticleProjection {site:string;pageId:number;revision:number;title:string;qid?:string;html:string;links:string[];diagnostics:string[];permalink:string}
export interface WikiStatement {id:string;property:string;label:string;rank:string;value:unknown;qualifiers:unknown;qualifierOrder:string[];references:unknown;summary:string;supported:boolean;diagnostics:string[]}
export interface WikidataProjection {qid:string;revision:number;label:string;description:string;statements:WikiStatement[];diagnostics:string[]}
export interface WikiSnapshot {version:1;kind:'article'|'wikidata';entityId:string;resourceId:string;snapshotId:string;identityId:string;subjectId?:string;qid?:string;site?:string;pageId?:number;revision:number;title:string;retrievedAt:string;endpoint:string;assets:ManagedAssetReference[];association?:'current-page-properties'}
export interface ArticleCapture {snapshot:WikiSnapshot;projection:ArticleProjection}
export interface EnrichmentCapture {snapshot:WikiSnapshot;projection:WikidataProjection;reviews:Array<{statementId:string;decision:string;claimGuid?:string}>;existingClaims:Array<{guid:string;expression:string;typename:string;attributes:unknown}>}
