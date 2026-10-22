import {collectDocumentEntities} from './document-entities';
import type {CompletionSession} from '../autocomplete/session';
import {usage,clearUsage,recordUsage} from '../autocomplete/history';
import {AuthorityPanel} from '../autocomplete/authority-view';
import {createManagedFloatingTool} from "../../rendering/managed-floating-tool";
import {useManagedViewActivity,useManagedWindowOwner} from "../../rendering/window-manager";
import {For,Show,createEffect,createSignal,untrack,onCleanup,onMount} from 'solid-js';
import type {AnnotationCapabilities,PanelSession,SearchRange} from '../../feature-api';
import {graphemeBoundaries,createFloatingWindowResize,FloatingWindowResizeHandle,type FloatingWindowSize} from '../../feature-api';
import type {CanonicalEntity,EntityService,EntityResolution,EntityResolutionQuery} from '../../feature-api/entities';
import {chooseEntity,type EntitySearchData} from './entity-search';
import {EntityCandidates} from './entity-candidates';
import {EntityCandidatesPanel} from './candidates-view';
import './entity-search.css';

/** Target, query, and resolved identity are deliberately independent session state. */
export function EntitySearch(props:{api:AnnotationCapabilities;panel:PanelSession;completion?:{session:CompletionSession;target():EntitySearchData;adjust(edge:'start'|'end',direction:-1|1,word:boolean):void;controls(value:{run(id:string):boolean;busy():boolean;canClose():boolean}|undefined):void}}) {
 const {api,panel,completion}=props;
 const activity=useManagedViewActivity(),owner=useManagedWindowOwner();
 const [target,setTarget]=createSignal<EntitySearchData>({...panel.data as EntitySearchData});
 const [query,setQuery]=createSignal(target().workstation?.query??target().entityQuery),[stream,setStream]=createSignal<EntityResolutionQuery['stream']>('all');
 const [match,setMatch]=createSignal<EntityResolutionQuery['match']>('partial'),[searchScope,setScope]=createSignal<EntityResolutionQuery['scope']|'blend'|'session'|'day'|'week'>(completion?'blend':'vault');
 const [result,setResult]=createSignal<EntityResolution>(),[current,setCurrent]=createSignal(0),[page,setPage]=createSignal(0),[retry,setRetry]=createSignal(0);
 const [busy,setBusy]=createSignal(false),[error,setError]=createSignal(''),[working,setWorking]=createSignal(false),[valid,setValid]=createSignal(true);
 const [creating,setCreating]=createSignal(false),[createForm,setCreateForm]=createSignal(false),[canonicalName,setCanonicalName]=createSignal('');
 const [created,setCreated]=createSignal<CanonicalEntity>(),[outcome,setOutcome]=createSignal('Not created'),[details,setDetails]=createSignal<CanonicalEntity>();
 const [aliasName,setAliasName]=createSignal(''),[aliasEdit,setAliasEdit]=createSignal<CanonicalEntity['aliases'][number]>();
 const [rename,setRename]=createSignal('');
 const [authority,setAuthority]=createSignal(!!target().workstation?.authority);
 let candidatesStale=false;
 const review=()=>{if(candidatesStale){candidates().dispose();setCandidates(newCandidates());candidates().configure({scope:'document'});candidatesStale=false;}candidates().enable();};
 createEffect(()=>{if(!completion)return;completion.session.state.revision;const next=untrack(completion.target);untrack(()=>{setTarget(next);setValid(true);candidates().disable();candidatesStale=true;});});
 createEffect(()=>{if(completion)setQuery(completion.session.state.searchQuery);});
 let service:EntityService|undefined;try{service=api.entities?.(panel.ownerKey);}catch(e){setError(String(e));}
 let alive=true,editing=false;
 let acquisitionGuard=()=>true;
 const [usageScope,setUsageScope]=createSignal<string>();
 const [localRows,setLocalRows]=createSignal<ReturnType<typeof collectDocumentEntities>['rows']>([]);
 if(completion){const refresh=()=>setLocalRows(collectDocumentEntities(api,panel.ownerKey).rows);refresh();const watch=api.watchDocumentEntities(panel.ownerKey,change=>{if(!change.removed)refresh();});onCleanup(()=>watch.dispose());}
 if(target().workstation)void service?.historyScope?.().then(key=>{if(alive)setUsageScope(key);}).catch(()=>{});
 const used=(entity:{id:string;name:string})=>{if(usageScope())recordUsage(usageScope()!,entity);};
 const [attempt,setAttempt]=createSignal<{id:string;operationId:string;name:string}>();
 const newCandidates=()=>new EntityCandidates(api,{...panel,data:target()});
 const [candidates,setCandidates]=createSignal(newCandidates());
 const preview=api.decorations(`entity-selection:${panel.key}`);
 createEffect(()=>{const ranges=activity()?.visible&&valid()?target().entityRanges:undefined;untrack(()=>{if(ranges)preview.ranges(ranges,{type:'editor/panel-selection',fill:'#f2c767'});else preview.clear();});});
 onCleanup(()=>{target().workstation?.scry?.cancel();alive=false;service?.dispose();preview.dispose();candidates().dispose();});
 createEffect(()=>{if(!completion&&target().workstation?.scry&&(activity()&&!activity()!.visible||owner&&!owner.manager.registry.windows[owner.windowId]?.active))untrack(()=>target().workstation?.scry?.cancel());});
 let root!:HTMLDivElement,input!:HTMLInputElement;
 const width=Math.min(1100,Math.max(1,window.innerWidth-24));
 const [position,setPosition]=createSignal({x:Math.max(8,(window.innerWidth-width)/2),y:Math.max(8,window.innerHeight*.06)});
 const [size,setSize]=createSignal<FloatingWindowSize>();
 const floating=completion?undefined:createManagedFloatingTool({element:()=>root,initial:{...position(),width,height:window.innerHeight*.76},minimum:{width:480,height:320}});
 const resize=floating?.resize??createFloatingWindowResize({element:()=>root,size:()=>size()??{width:root?.offsetWidth||width,height:root?.offsetHeight||window.innerHeight*.76},minimum:{width:480,height:320},onCommit:setSize});
 let drag:{id:number;x:number;y:number;left:number;top:number}|undefined;
 const close=()=>panel.close();
 const canClose=()=>acquisitionGuard()&&(editing||!creating()&&!working()&&(!attempt()||!!created()||window.confirm('Entity creation outcome is unconfirmed. Close this tool and discard its retry receipt?')));
 const run=async(action:()=>Promise<void>)=>{if(working())return;setWorking(true);setError('');try{await action();}catch(e){if(alive)setError(String(e));}finally{if(alive)setWorking(false);}};
 const bind=(entity:CanonicalEntity,replace=false)=>{
  const scry=target().workstation?.scry;
  if(scry){if(!scry.valid())throw Error('The Scry source changed.');editing=true;try{scry.commit(entity);used(entity);panel.close(false);return;}finally{editing=false;}}
  if(!target().entityRanges.length)throw Error('Enable Search additional occurrences and review mentions, or select text first.');
  if(!valid())throw Error('The original target is stale. Bind to a new selection.');
  editing=true;try{
   const invocation=target().workstation?.invocation;
   if(invocation){if(!api.replaceAndAnnotate)throw Error('Atomic completion unavailable');const label=replace?entity.name:target().entityQuery||entity.name;api.replaceAndAnnotate(invocation,label,'codex/entity-reference',entity.id,{entityId:entity.id,entityName:entity.name},target().entityRevision);used(entity);panel.close(false);api.focusRange?.({...invocation,version:api.text(invocation.nodeKey)!.version,end:invocation.start+[...label].length},api.revision());return;}
   if(replace){if(target().entityRanges.length!==1||!api.replaceAndAnnotate)throw Error('Replace & Link requires one plain-text Block');api.replaceAndAnnotate(target().entityRanges[0],entity.name,'codex/entity-reference',entity.id,{entityId:entity.id,entityName:entity.name},target().entityRevision);}
   else chooseEntity(api,target(),entity);
   used(entity);setOutcome('Created and linked');
   if(replace&&api.focusRange){const r=target().entityRanges[0],next=snapshotTarget([{nodeKey:r.nodeKey,start:r.start,end:r.start+[...entity.name].length}],api);panel.close(false);api.focusRange(next.entityRanges[0],next.entityRevision);}else close();
  }finally{editing=false;}
 };
 const select=(id:string,replace=false)=>void run(async()=>{
  result()?.current();if(!service)throw Error('Canonical Entity service unavailable');const entity=await service.get(id);if(!entity)throw Error('Entity unresolved in this vault');if(!alive)return;
  if(candidates().state.enabled&&!replace){candidates().nominate(entity);setDetails(entity);setRename(entity.name);return;}
  bind(entity,replace);
 });
 const showDetails=(id:string)=>void run(async()=>{const e=await service?.get(id);if(!e)throw Error('Entity unavailable');if(alive){setDetails(e);setRename(e.name);setAliasEdit(undefined);setAliasName(target().workstation?target().entityQuery:'');}});
 const create=()=>void run(async()=>{
  if(!service)throw Error('Canonical Entity service unavailable');
  if(!attempt()&&(!valid()||api.revision()!==target().entityRevision))throw Error('Select a valid target before creating an Entity');
  if(!canonicalName().trim())throw Error('Enter a canonical name');
  const retrying=!!attempt();
  if(!attempt())setAttempt({id:crypto.randomUUID(),operationId:crypto.randomUUID(),name:canonicalName()});
  setCreating(true);setOutcome('Creating Entity…');
  try{
   const e=await service.create(attempt()!);if(!alive)return;
   setCreated(e);setDetails(e);setRename(e.name);setOutcome('Created but not linked');
   try{bind(e);}catch(reason){setValid(false);setError(`${e.name} was created, but the original text could no longer be linked. ${String(reason)}`);panel.allowDocumentInput(true);}
  }catch(error){if(alive){if(!retrying&&(error as any)?.entityCreationOutcome==='not-created'){setOutcome('Not created');setAttempt(undefined);}else setOutcome('Creation outcome unconfirmed');}throw error;}finally{if(alive)setCreating(false);}
 });
 const recover=()=>void run(async()=>{
  const e=created();if(!e)throw Error('No confirmed Entity creation to recover');
  if(!await service?.get(e.id))throw Error('Created Entity is unavailable in the original vault');if(!alive)return;
  const ranges=api.recoverySelection?.(panel.ownerKey)??api.selection(panel.ownerKey);
  const snapshot=snapshotTarget(ranges,api);editing=true;try{chooseEntity(api,snapshot,e);if(api.focusRange){panel.close(false);api.focusRange(snapshot.entityRanges[0],api.revision());}else close();}finally{editing=false;}
 });
 const adjust=(edge:'start'|'end',direction:number,word:boolean)=>{
  try{
   if(completion?.session.source.brackets){completion.adjust(edge,direction as -1|1,word);return;}
   if(target().workstation?.scry)throw Error('Adjust Scry boundaries in the compact interaction before opening this tool.');
   if(!valid()||target().entityRanges.length!==1||api.revision()!==target().entityRevision)throw Error('Range adjustment requires one current plain-text Block');
   const r=target().entityRanges[0],node=api.text(r.nodeKey)!;if(node.cells.some(c=>!c.plain))throw Error('Range adjustment cannot cross inline objects');
   const text=node.cells.map(c=>c.text).join(''),boundaries=word?wordBoundaries(text):graphemeBoundaries(text);
   const next=direction<0?[...boundaries].reverse().find(i=>i<r[edge]):boundaries.find(i=>i>r[edge]);if(next===undefined)return;
   const range={...r,[edge]:next};if(range.end<=range.start)return;
   candidates().dispose();setTarget(snapshotTarget([range],api));setCandidates(newCandidates());setError('');
  }catch(e){setError(String(e));}
 };
 let refreshed=0;
 createEffect(()=>{
  if(activity()&&!activity()!.visible)return;
  const refresh=retry()!==refreshed;refreshed=retry();
  const scope=searchScope(),history=usageScope(),local=localRows();
  const options:EntityResolutionQuery={query:query(),stream:stream(),match:match(),scope:scope==='document'?'document':'vault',...(refresh?{refresh:true}:{})};
  const matches=(name:string)=>options.match==='exact'?name.toLocaleLowerCase()===options.query.toLocaleLowerCase():name.toLocaleLowerCase().includes(options.query.toLocaleLowerCase());
  const recent=history?usage(history,scope==='day'?1:scope==='week'?7:undefined):[];
  const localCandidates=[...(scope==='blend'?local.map(r=>({id:r.id,name:r.fallbackName??r.id,evidence:[{kind:'local',text:`${r.documentMentions} committed Document mentions`}]})):[]),...(['blend','session','day','week'].includes(scope)?recent.map(r=>({id:r.id,name:r.name,evidence:[{kind:'recent',text:scope==='day'?'Used in last 24 hours':scope==='week'?'Used in last 7 days':'Used this session'}]})):[])].filter(r=>matches(r.name));
  const controller=new AbortController();let active=true;setBusy(true);setResult(undefined);setCurrent(0);setPage(0);
  const publish=(r:EntityResolution)=>{if(active){const merged=new Map(localCandidates.map(c=>[c.id,c]));for(const c of r.candidates)merged.set(c.id,c);setResult({...r,candidates:[...merged.values()]});if(!attempt())setError('');}};
  const timer=setTimeout(async()=>{try{if(['session','day','week'].includes(scope)||scope==='blend'&&!options.query.trim()){publish({candidates:[],complete:true,diagnostics:[],current:()=>controller.signal.throwIfAborted()});return;}if(!service)throw Error('Open a bound native Document in a Flint vault to use canonical Entities.');publish(await service.search(options,controller.signal,publish));}catch(e){if(active)setError(String(e));}finally{if(active)setBusy(false);}},200);
  onCleanup(()=>{active=false;clearTimeout(timer);controller.abort();});
 });
 onMount(()=>{
  const initial=target().workstation;
  if(initial?.review){candidates().configure({scope:'document'});candidates().enable();}
  if(initial?.createName){setCanonicalName(initial.createName);setCreateForm(true);}
  if(initial?.entityId){if(initial.review)select(initial.entityId);else void showDetails(initial.entityId);}
  const mount=panel.mountWidget(root,()=>{input.focus();input.select();});if(!completion?.session.source.inline){input.focus();input.select();}
  const invalidate=()=>{if(editing)return;if(api.watchTarget||creating()||created()){setValid(false);candidates().disable();panel.allowDocumentInput(true);setError('The original target changed. Select a new target before linking.');}else close();};
  let stop:()=>void;
  if(completion)stop=()=>{};
  else if(api.watchTarget) stop=api.watchTarget(panel.ownerKey,target().workstation?.invocation?[target().workstation!.invocation!]:target().entityRanges,change=>{
   if(editing)return;
   // Preserve source ranges and identity. This does not retarget or repaint.
   if(change.valid&&valid()) target().entityRevision=change.revision;
   else invalidate();
  });
  else stop=api.beforeChange(invalidate);
  const guard=panel.guardClose?.(canClose);
  onCleanup(()=>guard?.());
  onCleanup(()=>{mount();stop();});
 });
 completion?.controls({canClose,busy:()=>working()||creating(),run:id=>{if(id==='close'){close();return true;}if(id==='review'){review();return true;}if(id==='create'){setCreateForm(true);setCanonicalName(query());return true;}if(id==='authority'){setAuthority(true);return true;}if(id==='next'||id==='previous'){const n=pageRows().length;if(n)setCurrent((current()+(id==='next'?1:-1)+n)%n);return true;}if(id==='choose'){const row=pageRows()[current()];if(row&&!working())select(row.id);return true;}return false;}});
 onCleanup(()=>completion?.controls(undefined));
 const pageRows=()=>result()?.candidates.slice(page()*10,page()*10+10)??[];
 const keys=(e:KeyboardEvent)=>{
  e.stopPropagation();if(e.isComposing)return;
  if(e.key==='Escape'){e.preventDefault();close();return;}
  if(target().workstation&&e.ctrlKey&&!e.metaKey&&api.bindings.dispatch(e,['entity-search'],id=>{if(id!=='entity.candidates.selectAll')return false;review();return true;}))return;
  const field=(e.target as Element).closest('input,textarea,select');
  if(api.bindings.dispatch(e,['entity-search'],id=>{
   if(id==='entity.candidates.open'){review();return true;}
   if(id==='entity.candidates.selectAll'&&!field){review();return true;}
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
  else if(e.key==='Enter'&&(e.target===input||!field&&!(e.target as Element).closest('button'))){e.preventDefault();const row=pageRows()[current()];if(row&&!working())select(row.id);}
  else if(!field&&e.key==='Home'){e.preventDefault();setCurrent(0);}
  else if(!field&&e.key==='End'){e.preventDefault();setCurrent(Math.max(0,pageRows().length-1));}
  else if(!field&&/^[0-9]$/.test(e.key)){e.preventDefault();const row=pageRows()[Number(e.key)];if(row)select(row.id);}
 };
 return <div ref={root} class="reactive-entity-search" classList={{'reactive-entity-search--embedded':!!completion,'reactive-entity-search--candidates':candidates().state.enabled}} role="dialog" aria-modal={api.watchTarget?false:!candidates().state.enabled&&!created()} aria-label="Link Entity Reference" data-native-context-menu onKeyDown={keys}
  style={completion?{}:{left:`${(floating?.rectangle()??position()).x}px`,top:`${(floating?.rectangle()??position()).y}px`,width:`${floating?.rectangle().width??(resize.preview()??size())?.width??width}px`,...(floating?{height:`${floating.rectangle().height}px`}:{}),...(!floating&&(resize.preview()??size())?{height:`${(resize.preview()??size())!.height}px`}:{})}}>
  <Show when={!completion}><header class="reactive-entity-search__header" data-window-move tabIndex={floating?0:undefined} onKeyDown={e=>{if(floating&&e.target===e.currentTarget){if(!floating.mode()&&e.key.startsWith("Arrow"))floating.keyboard("move");floating.keyDown(e);}}} onBlur={()=>floating?.cancel()} onLostPointerCapture={e=>floating?.cancelPointer(e)} onPointerDown={e=>{if(e.button!==0||(e.target as Element).closest('button'))return;if(floating){floating.beginMove(e);return;}drag={id:e.pointerId,x:e.clientX,y:e.clientY,left:position().x,top:position().y};e.currentTarget.setPointerCapture?.(e.pointerId);e.preventDefault();}} onPointerMove={e=>{if(floating){floating.movePointer(e);return;}if(drag?.id===e.pointerId)setPosition({x:Math.max(8,Math.min(window.innerWidth-80,drag.left+e.clientX-drag.x)),y:Math.max(8,Math.min(window.innerHeight-60,drag.top+e.clientY-drag.y))});}} onPointerUp={e=>floating?floating.endPointer(e):drag=undefined} onPointerCancel={e=>floating?floating.cancelPointer(e):drag=undefined}>
   <strong>Link Entity Reference</strong><button onClick={close}>Cancel</button>
  </header></Show>
  <div class="entity-search-columns"><section class="entity-search-lookup" aria-label="Entity lookup"><div class="entity-search-source">
   <Show when={target().workstation?.scry}><p>{target().workstation?.scry?.mode==='mention'?'((mention)): linking preserves your exact wording.':'[[autocomplete]]: linking uses the canonical Entity name.'}</p><button disabled={working()||creating()} onClick={()=>{target().workstation?.scry?.keepLiteral();close();}}>Keep literal brackets</button></Show>
   <p>Target: <strong data-entity-target>{target().entityQuery}</strong> {!valid()&&'— selection changed'}</p>
   <details class="entity-boundaries"><summary>Source range controls and shortcuts</summary><For each={['start','end'] as const}>{edge=><For each={[false,true]}>{word=><div><span>{edge==='start'?'Start':'End'} · {word?'word':'character'}: </span><For each={[-1,1] as const}>{d=><button disabled={!valid()||working()} onPointerDown={e=>e.preventDefault()} onClick={()=>adjust(edge,d,word)}>{edge} {d<0?'back':'forward'} {word?'word':'character'}</button>}</For><Show when={completion?.session.source.brackets}><kbd>Ctrl{edge==='start'?'+Alt':''}{word?'':'+Shift'}+←/→</kbd></Show></div>}</For>}</For></details>
   <label>Search<input ref={input} aria-label="Search entities" value={query()} maxLength={1000} onInput={e=>{setQuery(e.currentTarget.value);completion?.session.input(e.currentTarget.value);}}/></label>
   <Show when={completion?.session.state.queryMode==='independent'}><button onClick={()=>completion?.session.follow()}>Resume following source</button></Show>
   <div class="entity-search-options">
    <label>Stream<select aria-label="Entity stream" value={stream()} onChange={e=>setStream(e.currentTarget.value as any)}><option value="all">All</option><option value="name">Name</option><option value="alias">Alias</option><option value="mention">Mention</option></select></label>
    <label>Match<select aria-label="Entity match" value={match()} onChange={e=>setMatch(e.currentTarget.value as any)}><option value="partial">Partial</option><option value="exact">Exact</option></select></label>
    <label>Scope<select aria-label="Entity scope" value={searchScope()} onChange={e=>setScope(e.currentTarget.value as any)}><Show when={completion}><option value="blend">Local blend</option><option value="session">This session</option><option value="day">Last 24 hours</option><option value="week">Last 7 days</option></Show><option value="document">Current Document</option><option value="vault">Vault</option></select></label>
    <Show when={completion}><button onClick={()=>{if(usageScope())clearUsage(usageScope()!);setRetry(n=>n+1);}}>Clear usage history</button></Show>
    <button disabled={busy()&&!result()} onClick={()=>setRetry(n=>n+1)}>Refresh candidates</button>
   </div>
   <Show when={stream()==='all'||stream()==='mention'||searchScope()==='document'}><small>Mention matches use saved text; unsaved edits are not included.</small></Show>
   <p role="status">{busy()?(result()?`${result()!.candidates.length} candidates. Resolving mention evidence…`:'Resolving…'):result()?`${result()!.candidates.length} candidates. ${result()!.complete?'Coverage complete.':'Incomplete coverage; zero matches do not establish absence.'}`:'Resolution unavailable.'}</p>
   <Show when={result()?.diagnostics.length}><details><summary>Coverage details</summary><For each={result()!.diagnostics}>{d=><p>{d}</p>}</For></details></Show>
   <Show when={error()}><p role="alert">{error()}</p></Show>
   </div><div class="entity-search-results">
   <table aria-label="Entity results" tabIndex={0}><thead><tr><th>Entity</th><th>Why it matched</th><th>Actions</th></tr></thead><tbody><For each={pageRows()}>{(row,i)=><tr classList={{current:current()===i()}}><td>{i()} · {row.name}<small>{row.id}</small></td><td><For each={row.evidence.slice(0,3)}>{e=><div>{e.kind==='name'?'Canonical-name match':e.kind==='alias'?'Alias match':e.kind==='mention'?'Mention match':e.kind==='recent'?'Recent use':'Document evidence'}: {e.text}</div>}</For></td><td><button disabled={working()||!valid()} aria-label={`Select ${row.name}`} onClick={()=>select(row.id)}>Link</button><button disabled={working()} onClick={()=>showDetails(row.id)}>Details / aliases</button><Show when={!target().workstation?.scry}><button disabled={working()||!valid()||target().entityRanges.length!==1} onClick={()=>select(row.id,true)}>Replace &amp; Link</button></Show></td></tr>}</For></tbody></table>
   <footer><button disabled={!page()} onClick={()=>{setPage(n=>n-1);setCurrent(0);}}>Previous page</button><span>Page {page()+1}</span><button disabled={(page()+1)*10>=(result()?.candidates.length??0)} onClick={()=>{setPage(n=>n+1);setCurrent(0);}}>Next page</button></footer>
   <button onClick={()=>{setCreateForm(true);if(!attempt())setCanonicalName(query().trim()||target().entityQuery);}}>+ Create Entity</button>
   <Show when={createForm()}><section aria-label="Create canonical Entity"><label>Canonical name<input aria-label="Canonical name" value={canonicalName()} disabled={!!attempt()} maxLength={1000} onInput={e=>setCanonicalName(e.currentTarget.value)}/></label><button disabled={working()||!!created()||(!valid()&&!attempt())} onClick={create}>{creating()?'Creating…':attempt()?'Retry creation and link':'Create and link'}</button><p role="status">{outcome()}</p><small>Creation is independent of linking. Cancel after dispatch cannot undo creation.</small></section></Show>
   <Show when={created()&&!valid()}><button onPointerDown={e=>e.preventDefault()} disabled={working()} onClick={recover}>Bind to new selection</button></Show>
   <Show when={details()}>{entity=><section aria-label="Canonical Entity details"><strong>{entity().name}</strong><small>{entity().id}</small>
    <label>Preferred name<input aria-label="Preferred name" value={rename()} onInput={e=>setRename(e.currentTarget.value)}/></label><button disabled={working()} onClick={()=>void run(async()=>{setDetails(await service!.rename({id:entity().id,name:rename(),expected:entity().revision,operationId:crypto.randomUUID()}));setRetry(n=>n+1);})}>Update name</button>
    <For each={entity().aliases}>{a=><div>{a.name} <small>{a.origin}</small><button onClick={()=>{setAliasEdit(a);setAliasName(a.name);}}>Edit alias</button><button disabled={working()} onClick={()=>void run(async()=>{setDetails(await service!.alias({op:'alias-remove',id:a.id,entityId:entity().id,expected:a.revision,operationId:crypto.randomUUID()}));setRetry(n=>n+1);})}>Remove alias</button></div>}</For>
    <label>Explicit alias<input aria-label="Explicit alias" value={aliasName()} onInput={e=>setAliasName(e.currentTarget.value)}/></label><button disabled={working()||!aliasName().trim()} onClick={()=>void run(async()=>{const a=aliasEdit();setDetails(await service!.alias({op:a?'alias-update':'alias-add',id:a?.id??crypto.randomUUID(),entityId:entity().id,name:aliasName(),expected:a?.revision,operationId:crypto.randomUUID()}));setAliasEdit(undefined);setAliasName('');setRetry(n=>n+1);})}>{aliasEdit()?'Update alias':'Add alias'}</button><button onClick={()=>{setAliasEdit(undefined);setAliasName('');}}>Clear alias input</button>
   </section>}</Show>
   <Show when={completion && service}><button onClick={()=>setAuthority(true)}>External authorities…</button></Show>
   <button disabled={!valid()} onClick={review}>Find other occurrences</button>
   <small>Up/Down: candidates · Enter: link or nominate · Escape: cancel · Alt+S/M/V: stream/match/scope. Tab keeps normal focus traversal. Number keys choose candidates outside text fields.</small>
  <Show when={authority() && service}><AuthorityPanel service={service!} query={query()} guard={fn=>acquisitionGuard=fn} imported={e=>{setCreated(e);setDetails(e);setRename(e.name);setOutcome('Created but not linked');}}/></Show>
  </div></section><Show when={candidates()} keyed>{session=><EntityCandidatesPanel session={session} bind={()=>void run(async()=>{const e=candidates().state.entity;if(!e||!await service?.get(e.id))throw Error('Entity unavailable');editing=true;try{const scry=target().workstation?.scry;if(scry)scry.batch(()=>candidates().bind());else candidates().bind();used(e);close();}finally{editing=false;}})}/>}</Show></div>
  <Show when={!completion}><FloatingWindowResizeHandle controller={resize} class="reactive-entity-search__resize" label="Resize Entity Search window"/></Show>
 </div>;
}
export function snapshotTarget(ranges:readonly {nodeKey:string;start:number;end:number}[],api:AnnotationCapabilities):EntitySearchData {
 const valid=ranges.filter(r=>r.end>r.start);if(!valid.length)throw Error('Select nonempty text in this Document');
 const snapshots:SearchRange[]=valid.map(r=>{const n=api.text(r.nodeKey);if(!n||r.start<0||r.end>n.cells.length)throw Error('Selection unavailable');const b=graphemeBoundaries(n.cells.map(c=>c.text).join(''));if(!b.includes(r.start)||!b.includes(r.end)||n.cells.slice(r.start,r.end).some(c=>!c.plain))throw Error('Selection splits a grapheme or includes inline media');return {...r,contentKey:n.contentKey,placementKey:n.placementKey,version:n.version,coordinate:'cell'};});
 return {entityRanges:snapshots,entityRevision:api.revision(),entityQuery:snapshots.map(r=>api.text(r.nodeKey)!.cells.slice(r.start,r.end).map(c=>c.text).join('')).join(' ')};
}
function wordBoundaries(text:string){const graphemes=new Set(graphemeBoundaries(text));let at=0;const out=[0];for(const part of new Intl.Segmenter(undefined,{granularity:'word'}).segment(text)){at+=[...part.segment].length;if(graphemes.has(at))out.push(at);}return out;}
