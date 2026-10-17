/** Directory publication policy and allocation; no filesystem or editor dependencies. */
import type {NativeLocation} from '../application-services/contracts';
import type {PublicationProfile} from '../application-services/publication-contracts';
import {nativeRead,object} from '../application-services/validation';
const escapeHtml=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
import {relativeLink} from '../interchange/collection/plan';
import {PUBLICATION_CSP} from './policy';
export const DIRECTORY_LIMITS={documents:1000,entries:5000,nativeBytes:128*1024*1024,outputBytes:128*1024*1024,assets:200,assetBytes:80*1024*1024,files:2002};
export interface DirectoryScope {folder:string;recursive:boolean;excluded:string[]}
export interface RouteEntry {resourceId:string;route:string;title:string}
export interface DirectoryEntry extends RouteEntry {location:NativeLocation;hash:string;size:number}
export interface DirectoryInventory {documents:DirectoryEntry[];diagnostics:string[];directories:string[]}
export interface DirectoryProjectionContext {namespace:string;route:string;home:string;pages:RouteEntry[]}
export function directoryScope(v:unknown):asserts v is DirectoryScope {
 object(v,['folder','recursive','excluded']);nativeRead({location:{folder:v.folder,filename:'scope.ink'}});
 if(typeof v.recursive!=='boolean'||!Array.isArray(v.excluded)||v.excluded.length>1000)throw Error('Invalid directory scope');
 for(const p of v.excluded)if(typeof p!=='string'||p.length>240||p.split('/').some(s=>!s||s.startsWith('.')||/[\\\u0000-\u001f:]/.test(s)))throw Error('Invalid exclusion');
}
export function publicRoute(route:string){return typeof route==='string'&&route.length<=240&&route.split('/').length<=16&&/^(?:[a-z0-9][a-z0-9_-]{0,63}\/)*[a-z0-9][a-z0-9_-]{0,79}\.html$/.test(route)&&!route.split('/').some(p=>/^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/.test(p))&&!/^(?:assets|search|entities)\//.test(route);}
export function routeEntries(v:unknown,home:string):asserts v is RouteEntry[]{
 if(!Array.isArray(v)||!v.length||v.length>DIRECTORY_LIMITS.documents)throw Error('Directory supports 1–1,000 saved documents');
 const ids=new Set(),routes=new Set([home.normalize('NFC').toLowerCase()]);
 for(const p of v){object(p,['resourceId','route','title']);if(typeof p.resourceId!=='string'||!p.resourceId||p.resourceId.length>1024||ids.has(p.resourceId)||!publicRoute(p.route)||typeof p.title!=='string'||!p.title.trim()||p.title.length>200||routes.has(p.route.normalize('NFC').toLowerCase()))throw Error('Invalid or duplicate document identity/public route');ids.add(p.resourceId);routes.add(p.route.normalize('NFC').toLowerCase());}
}
export function allocateRoutes(inventory:DirectoryInventory,prior:RouteEntry[],home:string,alias:(id:string)=>string){
 const byId=new Map(prior.map(p=>[p.resourceId,p])),used=new Set([home]);
 // Reserve existing routes before allocating additions; filenames never become public defaults.
 for(const p of prior){if(used.has(p.route))throw Error('Existing route collides with index; review route settings');used.add(p.route);}
 return inventory.documents.map((d,i)=>{const old=byId.get(d.resourceId);if(old)return {...d,...old};let route=`pages/${alias(d.resourceId)}.html`,n=2;while(used.has(route))route=`pages/${alias(d.resourceId)}-${n++}.html`;used.add(route);return {...d,route,title:`Document ${i+1}`};});
}
export function navigation(context:DirectoryProjectionContext){
 const i=context.pages.findIndex(p=>p.route===context.route),link=(p:RouteEntry,label:string)=>`<a href="${escapeHtml(relativeLink(context.route,p.route))}">${escapeHtml(label)}</a>`;
 return `<nav aria-label="Publication"><a href="${escapeHtml(relativeLink(context.route,context.home))}">Contents</a>${i>0?' · '+link(context.pages[i-1],'Previous'):''}${i>=0&&i+1<context.pages.length?' · '+link(context.pages[i+1],'Next'):''}</nav>`;
}
export function directoryIndex(profile:PublicationProfile,pages:RouteEntry[]){return `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${PUBLICATION_CSP}"><meta name="referrer" content="no-referrer"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(profile.title)}</title><link rel="stylesheet" href="reader.css"></head><body><main><h1>${escapeHtml(profile.title)}</h1><nav aria-label="Contents"><ol>${pages.map(p=>`<li><a href="${escapeHtml(relativeLink(profile.route,p.route))}">${escapeHtml(p.title)}</a></li>`).join('')}</ol></nav></main></body></html>\n`;}
