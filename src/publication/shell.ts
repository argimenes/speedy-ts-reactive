import type {PublicationProfile} from '../application-services/publication-contracts';
import {relativeLink} from '../interchange/collection/plan';
import {interactive} from './reader';
import {PUBLICATION_CSP,INTERACTIVE_CSP} from './policy';
export const escapePublic=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function readerNavigation(profile:PublicationProfile,route:string){const r=profile.reader;if(!r||!r.search&&r.preset!=='research')return '';return `<nav aria-label="Reader tools">${r.search?`<a href="${escapePublic(relativeLink(route,'search.html'))}">Search</a>`:''}${r.preset==='research'?`${r.search?' · ':''}<a href="${escapePublic(relativeLink(route,'research.html'))}">Research details</a>`:''}</nav>`;}
export function readerPage(profile:PublicationProfile,route:string,title:string,content:string){const r=profile.reader;
 return `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${interactive(r)?INTERACTIVE_CSP:PUBLICATION_CSP}"><meta name="referrer" content="no-referrer"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapePublic(title)}</title><link rel="stylesheet" href="${relativeLink(route,'reader.css')}">${interactive(r)?`<script defer src="${relativeLink(route,'reader.js')}"></script>`:''}</head><body><main>${readerNavigation(profile,route)}<h1>${escapePublic(title)}</h1>${content}</main></body></html>\n`;
}
/** Only generated reader files, never an arbitrary extension allowlist. */
export function readerArtifact(path:string){return /^(?:reader\.js|search\/(?:manifest|shard-\d{4})\.json|entities\/e-[a-f0-9]{32}\.html)$/.test(path);}
