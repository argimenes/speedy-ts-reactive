import type {PublicationPorts,PublicationRecord} from './publication-ports';
import type {PublicFile} from './publication-contracts';
import type {DocumentReceipt} from './publication-directory-job';
import {SearchShards,searchEntry} from '../publication/search';
import {readerScript} from '../publication/reader-runtime';
import {readerPage,escapePublic} from '../publication/shell';
import {interactive,themeCss} from '../publication/reader';
import {relativeLink} from '../interchange/collection/plan';
/** Extra artifacts use filtered per-document receipts. No source/knowledge access. */
export async function readerArtifacts(p:PublicationPorts,r:PublicationRecord,receipts:AsyncIterable<DocumentReceipt>,signal:AbortSignal):Promise<PublicFile[]>{
 const profile=r.site.profile,reader=profile.reader;if(!reader)return [];
 const files:PublicFile[]=[];let total=0,occurrenceCount=0;const occurrences=new Map<string,Array<{route:string;title:string;anchor?:string}>>();
 const emit=async(path:string,text:string,mediaType='application/json')=>{signal.throwIfAborted();const bytes=new TextEncoder().encode(text);total+=bytes.length;if(total>48*1024*1024||bytes.length>16*1024*1024)throw Error('Reader artifacts exceed budget');files.push({path,hash:await p.storage.put(r.job.id,bytes,'reader'),size:bytes.length,mediaType,unit:'reader'});};
 const shards=reader.search?new SearchShards((path,text)=>emit(path,text)):undefined;
 for await(const receipt of receipts){signal.throwIfAborted();if(shards)await shards.add(receipt.search??searchEntry(receipt.entry.route,receipt.entry.title,receipt.text,receipt.headings??[]));
  for(const occurrence of receipt.occurrences??[]){if(++occurrenceCount>20000)throw Error('Public occurrence limit exceeded');const list=occurrences.get(occurrence.key)??[];if(!list.some(o=>o.route===receipt.entry.route&&o.anchor===occurrence.anchor))list.push({route:receipt.entry.route,title:receipt.entry.title,anchor:occurrence.anchor});occurrences.set(occurrence.key,list);}
 }
 await emit('reader.css',themeCss(reader.theme),'text/css');if(interactive(reader))await emit('reader.js',readerScript(),'text/javascript');
 const home=(route:string)=>`<nav aria-label="Publication"><a href="${relativeLink(route,profile.route)}">Contents</a></nav>`;
 if(reader.preset==='research'){
  const entries=r.research?.entries??[];
  await emit('research.html',readerPage(profile,'research.html','Research details',home('research.html')+'<p>Only explicitly reviewed fields and in-scope occurrences are included.</p><ul>'+entries.map(e=>`<li><a href="entities/${e.key}.html">${escapePublic(e.name)}</a> — ${escapePublic(e.kindLabel)}</li>`).join('')+'</ul>'),'text/html');
  for(const e of entries){signal.throwIfAborted();const route=`entities/${e.key}.html`,fields=[['Description',e.description],['Aliases',e.aliases?.join('; ')],['Statement',e.statement],['Time expression',e.expression]].filter(([,value])=>value!==undefined);
   const summary=`<section data-reader-summary><h2>${escapePublic(e.name)}</h2><p>${escapePublic(e.kindLabel)}</p><dl>${fields.map(([label,value])=>`<dt>${label}</dt><dd>${escapePublic(value!)}</dd>`).join('')}</dl></section>`;
   const references=(occurrences.get(e.key)??[]).map(o=>`<li><a href="${relativeLink(route,o.route)}${o.anchor?'#'+o.anchor:''}">${escapePublic(o.title)}</a></li>`).join('');
   const html=readerPage(profile,route,e.name,home(route)+summary+'<h2>Published occurrences</h2><ul>'+references+'</ul>');if(new TextEncoder().encode(html).length>64*1024)throw Error('Semantic detail page exceeds 64 KiB; narrow scope');await emit(route,html,'text/html');
   if(shards)await shards.add(searchEntry(route,e.name,[e.kindLabel,...fields.map(([,v])=>v)].join('\n')));
  }
 }
 if(shards){await shards.flush();await emit('search/manifest.json',JSON.stringify({version:1,tokenizer:'nfkc-unicode-word-v1',shards:shards.shards}));
  await emit('search.html',readerPage(profile,'search.html','Search',home('search.html')+'<label for="reader-query">Search this publication</label><input id="reader-query" data-reader-search type="search" maxlength="256" disabled autocomplete="off" aria-describedby="reader-search-status"><p id="reader-search-status" data-reader-status role="status" aria-live="polite">Enter words to search approved public content.</p><ol class="reader-results"></ol><noscript>Search requires JavaScript. Reading, contents and research detail links remain available.</noscript>'),'text/html');
 }
 return files;
}
