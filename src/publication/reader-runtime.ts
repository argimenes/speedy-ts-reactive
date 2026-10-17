/** Serialized trusted runtime: self-contained, no imports, editor bridge or persistence. */
function readerRuntime(){
 const script=document.currentScript as HTMLScriptElement|null;if(!script)return;const base=new URL('.',script.src),cache=new Map<string,{text:string;bytes:number}>();let retained=0,serial=0,controller:AbortController|undefined,timer:ReturnType<typeof setTimeout>;
 const safe=(path:string)=>{if(!/^(?:[a-z0-9_-]+\/)*[a-z0-9_-]+\.(?:html|json)$/.test(path)||path.includes('..'))throw Error('Invalid reader path');return new URL(path,base).href;};
 const read=async(path:string,limit:number,signal?:AbortSignal)=>{
  const hit=cache.get(path);if(hit){cache.delete(path);cache.set(path,hit);return hit.text;}
  const response=await fetch(safe(path),{credentials:'omit',referrerPolicy:'no-referrer',redirect:'error',signal});if(!response.ok)throw Error('Local publication resource unavailable');
  const reader=response.body!.getReader(),chunks:Uint8Array[]=[];let size=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit)throw Error('Reader resource exceeds limit');chunks.push(value);}}finally{await reader.cancel();}
  const bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}const text=new TextDecoder().decode(bytes);
  while(retained+size>4*1024*1024&&cache.size){const key=cache.keys().next().value!;retained-=cache.get(key)!.bytes;cache.delete(key);}cache.set(path,{text,bytes:size});retained+=size;return text;
 };
 const input=document.querySelector<HTMLInputElement>('[data-reader-search]'),status=document.querySelector<HTMLElement>('[data-reader-status]'),results=document.querySelector<HTMLOListElement>('.reader-results');
 if(input&&status&&results){input.disabled=false;input.addEventListener('input',()=>{clearTimeout(timer);controller?.abort();const token=++serial;timer=setTimeout(()=>void(async()=>{
   results.replaceChildren();const query=input.value.normalize('NFKC').toLowerCase(),terms=[...new Set(query.match(/[\p{L}\p{N}][\p{L}\p{M}\p{N}]*/gu)??[])];
   if(query.length>256||terms.length>16){status.textContent='Use at most 256 characters and 16 words.';return;}if(!terms.length){status.textContent='Enter words to search this publication.';return;}
   const active=controller=new AbortController();status.textContent='Searching…';try{
    const manifest=JSON.parse(await read('search/manifest.json',128*1024,active.signal));if(manifest.version!==1||!Array.isArray(manifest.shards)||manifest.shards.length>64)throw Error('Unsupported search index');
    const matches:Array<{route:string;title:string;text:string;score:number}>=[];let count=0;const order=(a:{score:number;route:string},b:{score:number;route:string})=>b.score-a.score||(a.route<b.route?-1:a.route>b.route?1:0);
    for(const shard of manifest.shards){if(token!==serial)return;if(!/^search\/shard-\d{4}\.json$/.test(shard.path)||shard.bytes>1024*1024)throw Error('Invalid shard');const entries=JSON.parse(await read(shard.path,1024*1024,active.signal));
     for(let i=0;i<entries.length;i++){if(i%50===0){await new Promise(r=>setTimeout(r,0));if(token!==serial)return;}const e=entries[i];if(terms.every(w=>Object.hasOwn(e.terms,w))){count++;matches.push({route:e.route,title:e.title,text:e.text.slice(0,220),score:terms.reduce((n,w)=>n+e.terms[w],0)});matches.sort(order);if(matches.length>100)matches.pop();}}
    }
    if(token!==serial)return;matches.sort((a,b)=>b.score-a.score||(a.route<b.route?-1:a.route>b.route?1:0));
    for(const e of matches.slice(0,100)){const li=document.createElement('li'),a=document.createElement('a'),p=document.createElement('p');a.href=safe(e.route);a.textContent=e.title;p.textContent=e.text.slice(0,220);li.append(a,p);results.append(li);}status.textContent=`${count} results${count>100?' — showing first 100':''}.`;
   }catch(error){if(token===serial&&!active.signal.aborted)status.textContent='Search unavailable. Use the static contents links.';}
  })(),150);});}
 let popover:HTMLElement|undefined,trigger:HTMLButtonElement|undefined,popSerial=0,popController:AbortController|undefined;
 const close=()=>{popSerial++;popController?.abort();if(popover)popover.hidden=true;trigger?.setAttribute('aria-expanded','false');trigger?.focus();};
 for(const anchor of document.querySelectorAll<HTMLAnchorElement>('a[data-reader-detail]')){
  const button=document.createElement('button');button.type='button';button.className='reader-preview';button.textContent='Preview';button.setAttribute('aria-label','Preview '+anchor.dataset.readerDetail);button.setAttribute('aria-expanded','false');button.setAttribute('aria-controls','reader-popover');anchor.after(button);
  button.addEventListener('click',()=>void(async()=>{if(trigger===button&&popover&&!popover.hidden){close();return;}close();trigger=button;const token=++popSerial;popController=new AbortController();
   if(!popover){popover=document.createElement('section');popover.id='reader-popover';popover.className='reader-popover';popover.setAttribute('role','region');popover.setAttribute('aria-label','Reference preview');document.body.append(popover);}popover.replaceChildren();popover.hidden=false;button.setAttribute('aria-expanded','true');
   const dismiss=document.createElement('button');dismiss.type='button';dismiss.textContent='Close preview';dismiss.addEventListener('click',close);const text=document.createElement('p');text.textContent='Loading local detail…';const full=document.createElement('a');full.textContent='Open full details';full.href=anchor.href;popover.append(dismiss,text,full);dismiss.focus();
   try{const url=new URL(anchor.href);if(url.origin!==base.origin||!url.href.startsWith(base.href))throw Error('Invalid detail path');const path=url.href.slice(base.href.length);if(!/^entities\/e-[a-f0-9]{32}\.html$/.test(path))throw Error('Invalid detail');const html=await read(path,64*1024,popController.signal);if(token!==popSerial)return;const page=new DOMParser().parseFromString(html,'text/html');text.textContent=page.querySelector('[data-reader-summary]')?.textContent??'Use the full detail page.';
   }catch{if(token===popSerial)text.textContent='Preview unavailable. Use the full detail page.';}
  })());
 }
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&popover&&!popover.hidden){e.preventDefault();close();}});
}
export const readerScript=()=>`(${readerRuntime.toString()})();\n`;
