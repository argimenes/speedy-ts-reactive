import { createHash } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import ipaddr from 'ipaddr.js';
import { IMAGE_LIMITS } from './asset-image-validation.mjs';
export function remoteAssetUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.port && url.port !== '443' || url.username || url.password || url.hash || value.length > 4096) throw Error('Remote images require a credential-free HTTPS URL on port 443.');
  return url;
}
export function publicAddress(address) {
  try { const ip = ipaddr.parse(address); return ip.range() === 'unicast' && !(ip.kind() === 'ipv6' && ip.isIPv4MappedAddress()); } catch { return false; }
}
/** Explicit consent is checked by the route. DNS and redirects cannot change the allowed origin/address policy. */
export async function acquireRemoteAsset(value, signal, dependencies = {}) {
  return (await acquire(value, signal, dependencies, {accept:'image/png, image/jpeg', bytes:IMAGE_LIMITS.bytes})).bytes;
}
async function acquire(value, signal, dependencies, policy) {
  const origin = remoteAssetUrl(value).origin, resolve = dependencies.lookup ?? lookup, connect = dependencies.request ?? request;
  const controller = new AbortController(), cancel = () => controller.abort();
  signal?.throwIfAborted(); signal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(cancel, 15000);
  try {
    let url = remoteAssetUrl(value);
    for (let hop = 0; hop <= 3; hop++) {
      controller.signal.throwIfAborted();
      if (url.origin !== origin) throw Error('A different image origin requires new consent.');
      const host = url.hostname.replace(/^\[|\]$/g, '');
      const answers = await Promise.race([resolve(host, { all: true, verbatim: true }), new Promise((_, reject) => controller.signal.addEventListener('abort', () => reject(Error('Image download cancelled or timed out.')), { once: true }))]);
      controller.signal.throwIfAborted();
      if (!answers.length || answers.some(a => !publicAddress(a.address))) throw Error('Remote image address is not public.');
      const address = answers[0];
      const result = await new Promise((resolve, reject) => {
        // Some hosts reject anonymous clients. Identify the application without impersonating a browser or sending user data.
        const req = connect(url, { agent: false, signal: controller.signal, headers: { Accept: policy.accept, 'Accept-Encoding': 'identity', 'User-Agent': 'MutableOS/0.0.0 (Flint; user-requested resource import)' }, lookup: (_host, options, cb) => options?.all ? cb(null, [address]) : cb(null, address.address, address.family) }, res => {
          if ([301,302,303,307,308].includes(res.statusCode)) { const redirect = res.headers.location; res.destroy(); resolve({ redirect }); return; }
          if (res.statusCode !== 200) { res.destroy(); reject(Error(`Remote server refused the download (HTTP ${res.statusCode}).`)); return; }
          if (res.headers['content-encoding'] && res.headers['content-encoding'] !== 'identity' || Number(res.headers['content-length'] ?? 0) > policy.bytes) { res.destroy(); reject(Error('Remote image response was rejected.')); return; }
          const chunks = []; let size = 0;
          res.on('data', chunk => { size += chunk.length; if (size > policy.bytes) { req.destroy(Error('Remote image exceeds the byte limit.')); return; } chunks.push(chunk); });
          res.on('end', () => resolve({ bytes: Buffer.concat(chunks), mediaType: res.headers['content-type'], url:url.href })); res.on('error', reject); res.on('aborted', () => reject(Error('Remote image response was interrupted.')));
        });
        req.on('error', reject); req.end();
      });
      if (result.bytes) return result;
      if (!result.redirect || hop === 3) throw Error('Remote image redirect limit exceeded.');
      url = remoteAssetUrl(new URL(result.redirect, url).href);
    }
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel); }
}

/** Internal DOI adapters only; callers cannot choose an arbitrary API endpoint. */
export async function acquireScholarlyJson(provider,doi,signal,dependencies={}) {
  if(!['agency','crossref','datacite'].includes(provider)||typeof doi!=='string'||doi.length>4096||!/^10\.\d{4,9}\/[^\s]+$/.test(doi))throw Error('Invalid scholarly endpoint');
  const encoded=encodeURIComponent(doi),endpoint=provider==='datacite'?`https://api.datacite.org/dois/${encoded}`:`https://api.crossref.org/works/${encoded}${provider==='agency'?'/agency':''}`;
  const result=await acquire(endpoint,signal,dependencies,{accept:'application/json, application/vnd.api+json',bytes:2*1024*1024});
  if(!/^application\/(?:json|vnd\.api\+json)(?:;|$)/i.test(String(result.mediaType)))throw Error('Scholarly response is not JSON');
  return {bytes:new Uint8Array(result.bytes),endpoint:result.url};
}

export const TEXT_POLICIES = Object.freeze({html:'text/html', markdown:'text/markdown', text:'text/plain'});
export function textPolicy(format) {
  if (!Object.hasOwn(TEXT_POLICIES, format)) throw Error('Unsupported linked-resource format.');
  return TEXT_POLICIES[format];
}
/** Same protected transport as images; text is never rendered or executed here. */
export async function acquireRemoteText(value, format, signal, dependencies = {}) {
  const expected=textPolicy(format);
  const result=await acquire(value,signal,dependencies,{accept:format==='markdown'?'text/markdown, text/plain':expected,bytes:2*1024*1024});
  const parts=String(result.mediaType??'').toLowerCase().split(';').map(p=>p.trim());
  const mediaType=parts.shift();
  if(mediaType!==expected&&!(format==='markdown'&&mediaType==='text/plain'))throw Error('Linked resource Content-Type does not match the chosen format.');
  if(parts.some(p=>!/^charset=(?:"?(?:utf-8|us-ascii)"?)$/.test(p)))throw Error('Linked text requires UTF-8 or US-ASCII; unsupported charset or Content-Type parameter.');
  let source;try{source=new TextDecoder('utf-8',{fatal:true}).decode(result.bytes);}catch{throw Error('Linked text is not valid UTF-8.');}
  if(parts.some(p=>p.includes('us-ascii'))&&/[^\x00-\x7f]/.test(source))throw Error('Linked text does not match its US-ASCII charset.');
  if(/[\u0000-\u0008\u000b\u000e-\u001f]/.test(source)||[...source].length>200000)throw Error('Linked text contains binary controls or exceeds 200,000 characters.');
  if(format==='html')for(const meta of source.match(/<meta\b[^>]*>/gi)??[])for(const match of meta.matchAll(/charset\s*=\s*["']?([^\s"'/>;]+)/gi))if(!['utf-8','us-ascii'].includes(match[1].toLowerCase()))throw Error('HTML declares an unsupported charset.');
  if(format==='markdown'&&/^\s*(?:<!doctype\s+html|<html\b)/i.test(source))throw Error('The response is HTML, not Markdown.');
  return {source,format,url:result.url,mediaType,byteHash:createHash('sha256').update(result.bytes).digest('hex')};
}

/** Fixed Wikimedia API operations, not an arbitrary proxy. One resource, no graph traversal. */
export async function acquireEncyclopedia(source,signal,dependencies={}) {
 const get=async url=>{const r=await acquire(url,signal,dependencies,{accept:'application/json',bytes:2*1024*1024});if(!/^application\/json(?:;|$)/i.test(String(r.mediaType)))throw Error('Wikimedia response is not JSON');return {bytes:new Uint8Array(r.bytes),endpoint:r.url};};
 if(typeof source==='string'){
  if(!/^Q[1-9]\d{0,14}$/.test(source))throw Error('Invalid Wikidata identity');
  const r=await get(`https://www.wikidata.org/wiki/Special:EntityData/${source}.json`);return {endpoint:r.endpoint,responses:[r.bytes]};
 }
 if(!source||!/^[a-z][a-z0-9-]{0,30}\.wikipedia\.org$/.test(source.site)||source.oldid!==undefined&&(!Number.isSafeInteger(source.oldid)||source.oldid<1))throw Error('Invalid Wikipedia source');
 const api=params=>`https://${source.site}/w/api.php?${new URLSearchParams({format:'json',formatversion:'2',...params})}`;
 if(!source.oldid&&(typeof source.title!=='string'||!source.title||source.title.length>512))throw Error('Invalid Wikipedia title');
 const first=await get(api({action:'query',prop:'revisions|pageprops',rvprop:'ids|timestamp',...(source.oldid?{revids:String(source.oldid)}:{titles:source.title,redirects:'1'})}));
 const page=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(first.bytes)).query?.pages?.[0],revision=page?.revisions?.[0]?.revid;
 if(page?.ns!==0||page?.missing||!Number.isSafeInteger(revision)||revision<1||source.oldid&&source.oldid!==revision)throw Error('Wikipedia article/revision unavailable');
 const second=await get(api({action:'parse',oldid:String(revision),prop:'text|wikitext|revid',disableeditsection:'1'}));
 return {endpoint:second.endpoint,responses:[first.bytes,second.bytes]};
}

/** IIIF URLs are selected only by scoped application operations. Redirects stay
 * on their reviewed origin; public DNS is pinned for every request. */
export async function acquireIIIF(url,format,signal,dependencies={}) {
 if(!['json','tile'].includes(format))throw Error('Invalid IIIF acquisition format');
 const r=await acquire(url,signal,dependencies,{accept:format==='json'?(/\/info\.json(?:\?|$)/.test(url)?'application/ld+json, application/json':'application/ld+json;profile="http://iiif.io/api/presentation/3/context.json", application/json'):'image/jpeg, image/png',bytes:(format==='json'?8:2)*1024*1024});
 if(format==='json'){
  if(!/^application\/(?:ld\+)?json(?:;|$)/i.test(String(r.mediaType)))throw Error('IIIF information is not JSON');
  return {bytes:new Uint8Array(r.bytes),endpoint:r.url};
 }
 if(!/^image\/(?:jpeg|png)(?:;|$)/i.test(String(r.mediaType)))throw Error('IIIF tile is not PNG/JPEG');
 const {validateIIIFTile}=await import('./asset-image-validation.mjs'),metadata=await validateIIIFTile(r.bytes,signal);
 return {bytes:new Uint8Array(r.bytes),endpoint:r.url,width:metadata.width,height:metadata.height};
}
