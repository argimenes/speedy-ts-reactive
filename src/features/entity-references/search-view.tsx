import {For,Show,createEffect,createSignal,untrack,onCleanup,onMount} from 'solid-js';
import type {AnnotationCapabilities,PanelSession,SearchRange} from '../../feature-api';
import {graphemeBoundaries,createFloatingWindowResize,FloatingWindowResizeHandle,type FloatingWindowSize} from '../../feature-api';
import type {CanonicalEntity,EntityService,EntityResolution,EntityResolutionQuery} from '../../feature-api/entities';
import {chooseEntity,type EntitySearchData} from './entity-search';
import {EntityCandidates} from './entity-candidates';
import {EntityCandidatesPanel} from './candidates-view';
import './entity-search.css';

/** Target, query, and resolved identity are deliberately independent session state. */
export function EntitySearch(props:{api:AnnotationCapabilities;panel:PanelSession}) {
 const {api,panel}=props;
 const [target,setTarget]=createSignal<EntitySearchData>({...panel.data as EntitySearchData});
 const [query,setQuery]=createSignal(target().entityQuery),[stream,setStream]=createSignal<EntityResolutionQuery['stream']>('all');
 const [match,setMatch]=createSignal<EntityResolutionQuery['match']>('partial'),[searchScope,setScope]=createSignal<EntityResolutionQuery['scope']>('vault');
 const [result,setResult]=createSignal<EntityResolution>(),[current,setCurrent]=createSignal(0),[page,setPage]=createSignal(0),[retry,setRetry]=createSignal(0);
 const [busy,setBusy]=createSignal(false),[error,setError]=createSignal(''),[working,setWorking]=createSignal(false),[valid,setValid]=createSignal(true);
 const [creating,setCreating]=createSignal(false),[createForm,setCreateForm]=createSignal(false),[canonicalName,setCanonicalName]=createSignal('');
 const [created,setCreated]=createSignal<CanonicalEntity>(),[outcome,setOutcome]=createSignal('Not created'),[details,setDetails]=createSignal<CanonicalEntity>();
 const [aliasName,setAliasName]=createSignal(''),[aliasEdit,setAliasEdit]=createSignal<CanonicalEntity['aliases'][number]>();
 const [rename,setRename]=createSignal('');
 let service:EntityService|undefined;try{service=api.entities?.(panel.ownerKey);}catch(e){setError(String(e));}
 let alive=true,editing=false;
 const [attempt,setAttempt]=createSignal<{id:string;operationId:string;name:string}>();
 const newCandidates=()=>new EntityCandidates(api,{...panel,data:target()});
 const [candidates,setCandidates]=createSignal(newCandidates());
 const preview=api.decorations(`entity-selection:${panel.key}`);
 createEffect(()=>{const ranges=valid()?target().entityRanges:undefined;untrack(()=>{if(ranges)preview.ranges(ranges,{type:'editor/panel-selection',fill:'#f2c767'});else preview.clear();});});
 onCleanup(()=>{alive=false;service?.dispose();preview.dispose();candidates().dispose();});
 let root!:HTMLDivElement,input!:HTMLInputElement;
 const width=Math.min(1100,Math.max(1,window.innerWidth-24));
 const [position,setPosition]=createSignal({x:Math.max(8,(window.innerWidth-width)/2),y:Math.max(8,window.innerHeight*.06)});
 const [size,setSize]=createSignal<FloatingWindowSize>();
 const resize=createFloatingWindowResize({element:()=>root,size:()=>size()??{width:root?.offsetWidth||width,height:root?.offsetHeight||window.innerHeight*.76},minimum:{width:480,height:320},onCommit:setSize});
 let drag:{id:number;x:number;y:number;left:number;top:number}|undefined;
 const close=()=>panel.close();
 const run=async(action:()=>Promise<void>)=>{if(working())return;setWorking(true);setError('');try{await action();}catch(e){if(alive)setError(String(e));}finally{if(alive)setWorking(false);}};
 const bind=(entity:CanonicalEntity,replace=false)=>{
  if(!target().entityRanges.length)throw Error('Enable Search additional occurrences and review mentions, or select text first.');
  if(!valid())throw Error('The original target is stale. Bind to a new selection.');
  editing=true;try{
   if(replace){if(target().entityRanges.length!==1||!api.replaceAndAnnotate)throw Error('Replace & Link requires one plain-text Block');api.replaceAndAnnotate(target().entityRanges[0],entity.name,'codex/entity-reference',entity.id,{entityId:entity.id,entityName:entity.name},target().entityRevision);}
   else chooseEntity(api,target(),entity);
   setOutcome('Created and linked');
   if(replace&&api.focusRange){const r=target().entityRanges[0],next=snapshotTarget([{nodeKey:r.nodeKey,start:r.start,end:r.start+[...entity.name].length}],api);panel.close(false);api.focusRange(next.entityRanges[0],next.entityRevision);}else close();
  }finally{editing=false;}
 };
 const select=(id:string,replace=false)=>void run(async()=>{
  result()?.current();if(!service)throw Error('Canonical Entity service unavailable');const entity=await service.get(id);if(!entity)throw Error('Entity unresolved in this vault');if(!alive)return;
  if(candidates().state.enabled&&!replace){candidates().nominate(entity);setDetails(entity);setRename(entity.name);return;}
  bind(entity,replace);
 });
 const showDetails=(id:string)=>void run(async()=>{const e=await service?.get(id);if(!e)throw Error('Entity unavailable');if(alive){setDetails(e);setRename(e.name);setAliasEdit(undefined);setAliasName('');}});
 const create=()=>void run(async()=>{
  if(!service)throw Error('Canonical Entity service unavailable');
  if(!attempt()&&(!valid()||api.revision()!==target().entityRevision))throw Error('Select a valid target before creating an Entity');
  if(!canonicalName().trim())throw Error('Enter a canonical name');
  const retrying=!!attempt();
  if(!attempt())setAttempt({id:crypto.randomUUID(),operationId:crypto.randomUUID(),name:canonicalName()});
  setCreating(true);setOutcome('Creation outcome unconfirmed');
  try{
   const e=await service.create(attempt()!);if(!alive)return;
   setCreated(e);setDetails(e);setRename(e.name);setOutcome('Created but not linked');
   try{bind(e);}catch(reason){setValid(false);setError(`${e.name} was created, but the original text could no longer be linked. ${String(reason)}`);panel.allowDocumentInput(true);}
  }catch(error){if(alive&&!retrying&&(error as any)?.entityCreationOutcome==='not-created'){setOutcome('Not created');setAttempt(undefined);}throw error;}finally{if(alive)setCreating(false);}
 });
 const recover=()=>void run(async()=>{
  const e=created();if(!e)throw Error('No confirmed Entity creation to recover');
  if(!await service?.get(e.id))throw Error('Created Entity is unavailable in the original vault');if(!alive)return;
  const ranges=api.recoverySelection?.(panel.ownerKey)??api.selection(panel.ownerKey);
  const snapshot=snapshotTarget(ranges,api);editing=true;try{chooseEntity(api,snapshot,e);if(api.focusRange){panel.close(false);api.focusRange(snapshot.entityRanges[0],api.revision());}else close();}finally{editing=false;}
 });
 const adjust=(edge:'start'|'end',direction:number,word:boolean)=>{
  try{
   if(!valid()||target().entityRanges.length!==1||api.revision()!==target().entityRevision)throw Error('Range adjustment requires one current plain-text Block');
   const r=target().entityRanges[0],node=api.text(r.nodeKey)!;if(node.cells.some(c=>!c.plain))throw Error('Range adjustment cannot cross inline objects');
   const text=node.cells.map(c=>c.text).join(''),boundaries=word?wordBoundaries(text):graphemeBoundaries(text);
   const next=direction<0?[...boundaries].reverse().find(i=>i<r[edge]):boundaries.find(i=>i>r[edge]);if(next===undefined)return;
   const range={...r,[edge]:next};if(range.end<=range.start)return;
   candidates().dispose();setTarget(snapshotTarget([range],api));setCandidates(newCandidates());setError('');
  }catch(e){setError(String(e));}
 };
 createEffect(()=>{
  const options={query:query(),stream:stream(),match:match(),scope:searchScope()};retry();
  const controller=new AbortController();let active=true;setBusy(true);setResult(undefined);setCurrent(0);setPage(0);
  const timer=setTimeout(async()=>{try{if(!service)throw Error('Open a bound native Document in a Flint vault to use canonical Entities.');const r=await service.search(options,controller.signal);if(active){setResult(r);if(!attempt())setError('');}}catch(e){if(active)setError(String(e));}finally{if(active)setBusy(false);}},200);
  onCleanup(()=>{active=false;clearTimeout(timer);controller.abort();});
 });
 onMount(()=>{
  const mount=panel.mountWidget(root,()=>{input.focus();input.select();});input.focus();input.select();
  const stop=api.beforeChange(()=>{if(editing)return;if(creating()||created()){setValid(false);candidates().disable();panel.allowDocumentInput(true);}else close();});
  onCleanup(()=>{mount();stop();});
 });
 const pageRows=()=>result()?.candidates.slice(page()*10,page()*10+10)??[];
 const keys=(e:KeyboardEvent)=>{
  e.stopPropagation();if(e.isComposing)return;
  if(e.key==='Escape'){e.preventDefault();close();return;}
  const field=(e.target as Element).closest('input,textarea,select');
  if(api.bindings.dispatch(e,['entity-search'],id=>{
   if(id==='entity.candidates.open'){candidates().enable();return true;}
   if(id==='entity.candidates.selectAll'&&!field){candidates().enable();return true;}
   if(id==='entity.clear'&&!(e.target as Element).closest('.entity-candidates')){setQuery('');return true;}
   return false;
  }))return;
  const candidateRow=(e.target as Element).closest<HTMLElement>('[data-candidate-row]');
  if(candidateRow&&!field&&!(e.target as Element).closest('button')&&api.bindings.dispatch(e,['entity-search/candidates'],id=>{
   const rows=[...root.querySelectorAll<HTMLElement>('[data-candidate-row]')],index=rows.indexOf(candidateRow);
   if(id==='entity.candidates.toggle'){const row=candidates().state.rows.find(r=>r.key===candidateRow.dataset.candidateKey);if(row)candidates().toggle(row.key,!row.checked);return true;}
   if(id==='entity.candidates.next'||id==='entity.candidates.previous'){rows[(index+(id.endsWith('next')?1:-1)+rows.length)%rows.length]?.focus();return true;}
   return false;
  }))return;
  if(e.altKey&&e.key.toLowerCase()==='s'){e.preventDefault();const modes=['all','name','alias','mention'] as const;setStream(modes[(modes.indexOf(stream())+1)%4]);return;}
  if(e.altKey&&e.key.toLowerCase()==='m'){e.preventDefault();setMatch(match()==='exact'?'partial':'exact');return;}
  if(e.altKey&&e.key.toLowerCase()==='v'){e.preventDefault();setScope(searchScope()==='vault'?'document':'vault');return;}
  if((e.target as Element).closest('.entity-candidates'))return;
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){if(field&&e.target!==input)return;e.preventDefault();const n=pageRows().length;if(n)setCurrent((current()+(e.key==='ArrowDown'?1:-1)+n)%n);}
  else if(e.key==='Enter'&&(e.target===input||!field&&!(e.target as Element).closest('button'))){e.preventDefault();const row=pageRows()[current()];if(row&&!busy()&&!working())select(row.id);}
  else if(!field&&e.key==='Home'){e.preventDefault();setCurrent(0);}
  else if(!field&&e.key==='End'){e.preventDefault();setCurrent(Math.max(0,pageRows().length-1));}
  else if(!field&&/^[0-9]$/.test(e.key)){e.preventDefault();const row=pageRows()[Number(e.key)];if(row)select(row.id);}
 };
 return <div ref={root} class="reactive-entity-search" classList={{'reactive-entity-search--candidates':candidates().state.enabled}} role="dialog" aria-modal={!candidates().state.enabled&&!created()} aria-label="Link Entity Reference" data-native-context-menu onKeyDown={keys}
  style={{left:`${position().x}px`,top:`${position().y}px`,width:`${(resize.preview()??size())?.width??width}px`,...((resize.preview()??size())?{height:`${(resize.preview()??size())!.height}px`}:{})}}>
  <header class="reactive-entity-search__header" onPointerDown={e=>{if(e.button!==0||(e.target as Element).closest('button'))return;drag={id:e.pointerId,x:e.clientX,y:e.clientY,left:position().x,top:position().y};e.currentTarget.setPointerCapture?.(e.pointerId);e.preventDefault();}} onPointerMove={e=>{if(drag?.id===e.pointerId)setPosition({x:Math.max(8,Math.min(window.innerWidth-80,drag.left+e.clientX-drag.x)),y:Math.max(8,Math.min(window.innerHeight-60,drag.top+e.clientY-drag.y))});}} onPointerUp={()=>drag=undefined} onPointerCancel={()=>drag=undefined}>
   <strong>Link Entity Reference</strong><button onClick={close}>Cancel</button>
  </header>
  <div class="entity-search-columns"><section class="entity-search-lookup" aria-label="Entity lookup">
   <p>Target: <strong data-entity-target>{target().entityQuery}</strong> {!valid()&&'— selection changed'}</p>
   <details><summary>Adjust target boundaries</summary><For each={['start','end'] as const}>{edge=><For each={[false,true]}>{word=><For each={[-1,1]}>{d=><button disabled={!valid()||working()} onClick={()=>adjust(edge,d,word)}>{edge} {d<0?'back':'forward'} {word?'word':'character'}</button>}</For>}</For>}</For></details>
   <label>Search<input ref={input} aria-label="Search entities" value={query()} maxLength={1000} onInput={e=>setQuery(e.currentTarget.value)}/></label>
   <div class="entity-search-options">
    <label>Stream<select aria-label="Entity stream" value={stream()} onChange={e=>setStream(e.currentTarget.value as any)}><option value="all">All</option><option value="name">Name</option><option value="alias">Alias</option><option value="mention">Mention</option></select></label>
    <label>Match<select aria-label="Entity match" value={match()} onChange={e=>setMatch(e.currentTarget.value as any)}><option value="partial">Partial</option><option value="exact">Exact</option></select></label>
    <label>Scope<select aria-label="Entity scope" value={searchScope()} onChange={e=>setScope(e.currentTarget.value as any)}><option value="document">Current Document</option><option value="vault">Vault</option></select></label>
    <button disabled={busy()} onClick={()=>setRetry(n=>n+1)}>Refresh candidates</button>
   </div>
   <p role="status">{busy()?'Resolving…':result()?`${result()!.candidates.length} candidates. ${result()!.complete?'Coverage complete.':'Incomplete coverage; zero matches do not establish absence.'}`:'Resolution unavailable.'}</p>
   <Show when={result()?.diagnostics.length}><details><summary>Coverage details</summary><For each={result()!.diagnostics}>{d=><p>{d}</p>}</For></details></Show>
   <Show when={error()}><p role="alert">{error()}</p></Show>
   <table aria-label="Entity results" tabIndex={0}><thead><tr><th>Entity</th><th>Why it matched</th><th>Actions</th></tr></thead><tbody><For each={pageRows()}>{(row,i)=><tr classList={{current:current()===i()}}><td>{i()} · {row.name}<small>{row.id}</small></td><td><For each={row.evidence.slice(0,3)}>{e=><div>{e.kind==='name'?'Canonical-name match':e.kind==='alias'?'Alias match':e.kind==='mention'?'Mention match':'Document evidence'}: {e.text}</div>}</For></td><td><button disabled={working()||busy()||!valid()} aria-label={`Select ${row.name}`} onClick={()=>select(row.id)}>Link</button><button disabled={working()} onClick={()=>showDetails(row.id)}>Details / aliases</button><button disabled={working()||!valid()||target().entityRanges.length!==1} onClick={()=>select(row.id,true)}>Replace &amp; Link</button></td></tr>}</For></tbody></table>
   <footer><button disabled={!page()} onClick={()=>{setPage(n=>n-1);setCurrent(0);}}>Previous page</button><span>Page {page()+1}</span><button disabled={(page()+1)*10>=(result()?.candidates.length??0)} onClick={()=>{setPage(n=>n+1);setCurrent(0);}}>Next page</button></footer>
   <button onClick={()=>{setCreateForm(true);if(!attempt())setCanonicalName(query().trim()||target().entityQuery);}}>+ Create Entity</button>
   <Show when={createForm()}><section aria-label="Create canonical Entity"><label>Canonical name<input aria-label="Canonical name" value={canonicalName()} disabled={!!attempt()} maxLength={1000} onInput={e=>setCanonicalName(e.currentTarget.value)}/></label><button disabled={working()||!!created()||(!valid()&&!attempt())} onClick={create}>{attempt()?'Retry creation and link':'Create and link'}</button><p role="status">{outcome()}</p><small>Creation is independent of linking. Cancel after dispatch cannot undo creation.</small></section></Show>
   <Show when={created()&&!valid()}><button onPointerDown={e=>e.preventDefault()} disabled={working()} onClick={recover}>Bind to new selection</button></Show>
   <Show when={details()}>{entity=><section aria-label="Canonical Entity details"><strong>{entity().name}</strong><small>{entity().id}</small>
    <label>Preferred name<input aria-label="Preferred name" value={rename()} onInput={e=>setRename(e.currentTarget.value)}/></label><button disabled={working()} onClick={()=>void run(async()=>{setDetails(await service!.rename({id:entity().id,name:rename(),expected:entity().revision,operationId:crypto.randomUUID()}));setRetry(n=>n+1);})}>Update name</button>
    <For each={entity().aliases}>{a=><div>{a.name} <small>{a.origin}</small><button onClick={()=>{setAliasEdit(a);setAliasName(a.name);}}>Edit alias</button><button disabled={working()} onClick={()=>void run(async()=>{setDetails(await service!.alias({op:'alias-remove',id:a.id,entityId:entity().id,expected:a.revision,operationId:crypto.randomUUID()}));setRetry(n=>n+1);})}>Remove alias</button></div>}</For>
    <label>Explicit alias<input aria-label="Explicit alias" value={aliasName()} onInput={e=>setAliasName(e.currentTarget.value)}/></label><button disabled={working()||!aliasName().trim()} onClick={()=>void run(async()=>{const a=aliasEdit();setDetails(await service!.alias({op:a?'alias-update':'alias-add',id:a?.id??crypto.randomUUID(),entityId:entity().id,name:aliasName(),expected:a?.revision,operationId:crypto.randomUUID()}));setAliasEdit(undefined);setAliasName('');setRetry(n=>n+1);})}>{aliasEdit()?'Update alias':'Add alias'}</button><button onClick={()=>{setAliasEdit(undefined);setAliasName('');}}>Clear alias input</button>
   </section>}</Show>
   <button disabled={!valid()} onClick={()=>candidates().enable()}>Find other occurrences</button>
   <small>Up/Down: candidates · Enter: link or nominate · Escape: cancel · Alt+S/M/V: stream/match/scope. Tab keeps normal focus traversal. Number keys choose candidates outside text fields.</small>
  </section><Show when={candidates()} keyed>{session=><EntityCandidatesPanel session={session} bind={()=>void run(async()=>{const e=candidates().state.entity;if(!e||!await service?.get(e.id))throw Error('Entity unavailable');editing=true;try{candidates().bind();close();}finally{editing=false;}})}/>}</Show></div>
  <FloatingWindowResizeHandle controller={resize} class="reactive-entity-search__resize" label="Resize Entity Search window"/>
 </div>;
}
export function snapshotTarget(ranges:readonly {nodeKey:string;start:number;end:number}[],api:AnnotationCapabilities):EntitySearchData {
 const valid=ranges.filter(r=>r.end>r.start);if(!valid.length)throw Error('Select nonempty text in this Document');
 const snapshots:SearchRange[]=valid.map(r=>{const n=api.text(r.nodeKey);if(!n||r.start<0||r.end>n.cells.length)throw Error('Selection unavailable');const b=graphemeBoundaries(n.cells.map(c=>c.text).join(''));if(!b.includes(r.start)||!b.includes(r.end)||n.cells.slice(r.start,r.end).some(c=>!c.plain))throw Error('Selection splits a grapheme or includes inline media');return {...r,contentKey:n.contentKey,placementKey:n.placementKey,version:n.version,coordinate:'cell'};});
 return {entityRanges:snapshots,entityRevision:api.revision(),entityQuery:snapshots.map(r=>api.text(r.nodeKey)!.cells.slice(r.start,r.end).map(c=>c.text).join('')).join(' ')};
}
function wordBoundaries(text:string){const graphemes=new Set(graphemeBoundaries(text));let at=0;const out=[0];for(const part of new Intl.Segmenter(undefined,{granularity:'word'}).segment(text)){at+=[...part.segment].length;if(graphemes.has(at))out.push(at);}return out;}
