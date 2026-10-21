/** Production PDF component investigation. No automatic handover or fallback. */
import {candidate,setup,settle,pdf} from './proof-support';
import {pdfFixture} from '../../src/pdf/fixtures';
import '../../src/index.css';
import '../../src/demo/workspace-demo.css';
const trusted=(action:object)=>new Promise<void>((resolve,reject)=>{(globalThis as any).__mwmResume=(r:any)=>r.error?reject(Error(r.error)):resolve();(globalThis as any).mwmInput(JSON.stringify(action));});
const click=async(el:HTMLElement)=>{el.scrollIntoView({block:'center'});await settle();const r=el.getBoundingClientRect();await trusted({type:'click',x:r.x+r.width/2,y:r.y+r.height/2});await settle();};
const button=(root:ParentNode,text:string)=>[...root.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.trim()===text)!;
const until=async(fn:()=>boolean)=>{for(let i=0;i<300;i++){if(fn())return;await settle();}throw Error('PDF proof timed out');};
export async function qualifyWindowManager(){
 const checks:string[]=[],requests:string[]=[],readSignals:AbortSignal[]=[];
 const check=(v:unknown,label:string)=>{if(!v)throw Error(label);checks.push(label);};
 const realFetch=window.fetch;let hold=false,finish:(()=>void)|undefined;
 window.fetch=(async(input:RequestInfo|URL,init?:RequestInit)=>{
  const url=String(input);if(!url.startsWith('/api/'))return realFetch(input,init);requests.push(url);
  if(url==='/api/services/pdf.read'){
   if(init?.signal)readSignals.push(init.signal);
   if(hold)await new Promise<void>(resolve=>finish=resolve);
   return new Response(pdfFixture(),{headers:{'Content-Type':'application/octet-stream','X-Mutable-Cavern-Id':'proof','X-Mutable-Result':JSON.stringify({snapshot:pdf})}});
  }
  return new Response(JSON.stringify({Success:false,Error:'isolated proof; no backend'}),{status:503});
 }) as typeof fetch;
 const f=await setup();let c:ReturnType<typeof candidate>|undefined;
 try{
  const store=f.workspace.documentSessions!,source=f.source,original=source.element.querySelector<HTMLElement>('.mutable-pdf')!;
  check(!!original,'actual production PdfBlockView mounted inside Flint');
  await click(button(original,'Open retained PDF'));await until(()=>!!original.querySelector('.textLayer span'));
  check(original.querySelector('.textLayer')!.textContent!.includes('Academic PDF page 1'),'actual PDF.js canvas and text layer read deterministic retained PDF bytes');
  await click(button(original,'Next PDF page'));await until(()=>original.querySelector('.textLayer')?.textContent?.includes('page 2')===true);
  await click(button(original,'Zoom in'));await until(()=>!button(original,'Zoom in').disabled);
  const details=[...original.querySelectorAll('details')].find(d=>d.querySelector('summary')?.textContent?.startsWith('PDF annotations'))!;details.open=true;
  await click(button(original,'Use selection / visible region'));
  const note=original.querySelector<HTMLInputElement>('[aria-label="PDF note"]')!;
  await click(note);await trusted({type:'text',text:'Canonical PDF annotation'});await click(button(original,'Add PDF annotation'));
  await click(note);await trusted({type:'text',text:'Uncommitted annotation draft'});
  const text=f.text(source);f.editor.commands.replaceInlineRange(text.key,0,0,'Unsaved ');
  const revision=f.editor.repository.state.revision,contentCount=Object.keys(f.editor.repository.state.contents).length;
  const sourceHeight=original.querySelector<HTMLCanvasElement>('canvas')!.style.height;
  const span=original.querySelector('.textLayer span')!;const selection=window.getSelection()!;selection.setBaseAndExtent(span.firstChild!,1,span.firstChild!,5);
  check(selection.toString().length===4,'PDF browser selection exists before candidate construction');
  c=candidate(f);await settle();const replacement=c.session.element.querySelector<HTMLElement>('.mutable-pdf')!;
  check(c.session.id!==source.id&&c.session.projection.viewId!==source.projection.viewId&&replacement!==original,'replacement has distinct editor session, projection and PDF DOM');
  check(source.current()&&original.isConnected&&note.value==='Uncommitted annotation draft','candidate construction leaves source PDF and unfinished note alive');
  check(!replacement.querySelector('canvas'),'mount completion does not mean an embedded PDF viewer is ready');
  check(f.editor.repository.state.revision===revision&&Object.keys(f.editor.repository.state.contents).length===contentCount,'construction performs no canonical write or resource duplication');
  check(f.editor.mounts.get(f.text(c.session).key)!.captureText!().startsWith('Unsaved '),'replacement sees unsaved canonical text');
  const pdfNode=Object.values(c.session.projection.state.nodes).find(n=>n.payload.id==='proof-pdf-block')!;
  check((pdfNode.payload.blockProperties as any[])?.some(p=>p.value==='Canonical PDF annotation'),'committed PDF annotation is shared canonical state');
  await click(button(replacement,'Open retained PDF'));await until(()=>!!replacement.querySelector('.textLayer span'));
  const input=replacement.querySelector<HTMLInputElement>('[aria-label="PDF page"]')!;
  check(input.value==='1'&&replacement.querySelector<HTMLCanvasElement>('canvas')!.style.height!==sourceHeight,'naive PDF reconstruction resets page and zoom');
  check(replacement.querySelector<HTMLInputElement>('[aria-label="PDF note"]')!.value==='','uncommitted PDF note is not reconstructed from canonical state');
  check(!replacement.contains(window.getSelection()?.anchorNode??null),'source PDF text selection is not mapped into replacement viewer');
  check(store.size===2&&store.transfers.atOrigin(c.session)&&!store.transfers.hasTransferredSessions(),'existing primitives leave two sessions and no detached-origin relationship');
  c.dispose();c=undefined;await settle();
  check(source.current()&&note.value==='Uncommitted annotation draft'&&store.size===1,'abandoning candidate preserves source transient state');
  // A second candidate demonstrates local cancellation, not a handover protocol.
  c=candidate(f);await settle();const next=c.session.element.querySelector<HTMLElement>('.mutable-pdf')!;
  hold=true;await click(button(next,'Open retained PDF'));await until(()=>!!finish);const pending=readSignals.at(-1)!;
  check(button(next,'Open retained PDF').disabled,'production PDF exposes a component-local pending read');
  c.dispose();c=undefined;finish!();await settle();
  check(pending.aborted&&source.current()&&!readSignals[0].aborted,'candidate disposal aborts its own viewer request without aborting original');
  check(!requests.some(r=>r.includes('/save')),'proof issues no native or workspace Save');
  return {kind:'reconstruction-boundary-proof-not-product-fallback',browser:navigator.userAgent,checks,requests,observations:{sourcePdfPage:2,sourceZoom:1.25,candidatePdfPage:1,candidateZoom:1,canonicalState:'shared',editorIdentity:'new',pdfTransientState:'not restored',sessionsAfterCandidateCleanup:store.size}};
 }finally{c?.dispose();finish?.();f.dispose();window.fetch=realFetch;}
}
