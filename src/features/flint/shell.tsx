import { For, Show, createSignal, lazy } from 'solid-js';
import type { DocumentApplicationInstance } from '../../feature-api/document-application';
import { Dynamic } from "solid-js/web";
import { KnowledgeView } from './knowledge-view';
import { VaultView, DocumentProperties } from './vault-view';
import { StorageSheet } from './storage-sheet';
import { useCurrentCavern } from '../../application/cavern-startup';
import { MaterialChrome, materialChromePresentation } from './material/material-chrome';
import { FlintProbe } from './probe/probe';
import { SceneChrome } from './scene-chrome/scene-chrome';

// A runtime crop of the supplied, unmodified master: no generated substitute artwork.
const DocumentGraph = lazy(() => import('./graph/document-graph').then(module => ({default:module.DocumentGraph})));
const identity = new URL('../../../docs/assets/flint/flint-app-icon-master.png', import.meta.url).href;
export function FlintView(props:{application:DocumentApplicationInstance; materialChrome?:boolean; probe?:boolean; spatialGraph?:boolean; sceneChrome?:boolean}) {
  const cavern = useCurrentCavern();
  const app=props.application;
  const [library,setLibrary]=createSignal(true),[context,setContext]=createSignal(true);
  const [browse,setBrowse]=createSignal<'browse'|'search'>('browse');
  const [view,setView]=createSignal<'document'|'graph'>('document');
  const [lens,setLens]=createSignal<'Backlinks'|'References'|'Properties'>('Backlinks');
  const [narrowPanel,setNarrowPanel]=createSignal<'library'|'context'|''>('');
  const [menu,setMenu]=createSignal(false),[storage,setStorage]=createSignal(false);
  const [settings,setSettings]=createSignal(false);
  const independent=()=>props.sceneChrome !== false;
  const [destination,setDestination]=createSignal({folder:'.',filename:'Document.mutable.json'});
  const [busy,setBusy]=createSignal(false),[error,setError]=createSignal('');
  let shell!:HTMLDivElement, viewport!:HTMLElement, menuButton!:HTMLButtonElement, storageInvoker:HTMLElement|undefined;
  const vault=()=>app.vault?.state();
  const showLibrary=()=>{setLibrary(true);setNarrowPanel('library');};
  const focusLibrary=()=>{showLibrary();setBrowse('browse');queueMicrotask(()=>shell.querySelector<HTMLInputElement>('[aria-label="Vault directory"]')?.focus());};
  const chooseVault=()=>app.vault?.choose?app.vault.choose():focusLibrary();
  const showSearch=()=>{showLibrary();setBrowse('search');queueMicrotask(()=>shell.querySelector<HTMLInputElement>('[aria-label="Search vault"]')?.focus());};
  const openStorage=(invoker?:HTMLElement)=>{storageInvoker=invoker??menuButton;const bound=app.files?.location();if(bound)setDestination(bound);setMenu(false);setStorage(true);};
  const closeStorage=()=>{setStorage(false);queueMicrotask(()=>{const target=storageInvoker?.isConnected?storageInvoker:menuButton;if(target?.isConnected)target.focus();});};
  const save=async()=>{if(!app.files||busy())return;if(!app.files.location()){openStorage();return;}setBusy(true);setError('');try{await app.files.save(destination());}catch(e){setError(String(e));}finally{setBusy(false);}};
  const toggle=(rail:'library'|'context')=>{const open=rail==='library'?library():context(),set=rail==='library'?setLibrary:setContext;
    if(shell.clientWidth<940){set(true);setNarrowPanel(narrowPanel()===rail?'':rail);}else set(!open);
  };
  return <div ref={shell} class="flint-application" data-scene-chrome={independent()} data-material-chrome={props.materialChrome !== false} data-view={view()} data-library={library()} data-context={context()} data-narrow-panel={narrowPanel()} onKeyDown={event=>{
    if(independent()&&!event.defaultPrevented&&event.key==='Escape'&&(menu()||settings())){event.preventDefault();event.stopPropagation();setMenu(false);setSettings(false);menuButton.focus({preventScroll:true});}
  }}>
    <div class="flint-surfaces" inert={storage()}>
    <Show when={independent()}>
      <div class="flint-scene-settings flint-html-content" data-flint-content="settings" hidden={!settings()}>
        <Show when={props.materialChrome !== false}><MaterialChrome independent root={()=>shell} viewport={()=>viewport} layout={()=>null}/></Show>
      </div>
      <SceneChrome root={()=>shell} enabled={props.materialChrome} brand title={`FLINT · ${cavern?.current()?.name ?? vault()?.root ?? 'A space for ideas'}`} controls={[
        {id:'menu',label:'Flint menu',ariaLabel:'Flint application menu',expanded:menu(),ref:button=>menuButton=button,action:()=>setMenu(!menu())},
        {id:'library',label:'Library',ariaLabel:'Toggle Library',active:library(),action:()=>toggle('library')},
        {id:'document',label:'Document',active:view()==='document',action:()=>setView('document')},
        ...(props.spatialGraph !== false ? [{id:'graph',label:'Graph',active:view()==='graph',disabled:!app.properties(),action:()=>setView('graph' as const)}] : []),
        {id:'search',label:'Search',action:showSearch},
        {id:'context',label:'Context',ariaLabel:'Toggle Context',active:context(),action:()=>toggle('context')},
        {id:'save',label:busy()?'Saving…':'Save Document',disabled:!app.files||!app.properties()||busy()||vault()?.readOnly||vault()?.busy,action:()=>void save()},
        ...(props.materialChrome !== false ? [{id:'settings',label:'Light & material',expanded:settings(),action:()=>setSettings(!settings())}] : []),
        ...(menu() ? [
          {id:'open',label:'Open Another Cavern…',disabled:!app.vault,action:()=>{setMenu(false);chooseVault();}},
          {id:'files',label:'Files',action:()=>openStorage()},
          {id:'close',label:'Close tab',disabled:!app.properties(),action:()=>{app.closeActiveTab();setMenu(false);menuButton.focus({preventScroll:true});}},
          {id:'dismiss',label:'Dismiss menu',action:()=>{setMenu(false);menuButton.focus({preventScroll:true});}},
        ] : []),
      ]}/>
    </Show>
    <Show when={!independent()}>
    <header class="flint-application__header">
      <div class="flint-menu-anchor" onKeyDown={e=>{if(menu()&&e.key==='Escape'){e.preventDefault();e.stopPropagation();setMenu(false);menuButton.focus();}}}><button ref={menuButton} class="flint-brand" aria-label="Flint application menu" aria-expanded={menu()} onClick={()=>setMenu(!menu())}><span class="flint-mark" data-probe-eikon><img src={identity} alt=""/></span><strong>FLINT</strong><span aria-hidden="true">⌄</span></button>
        <Show when={menu()}><div class="flint-menu" role="group" aria-label="Flint actions" onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();setMenu(false);menuButton.focus();}}}>
          <button disabled={!app.vault} onClick={()=>{setMenu(false);chooseVault();}}>Open Another Cavern…</button>
          <button onClick={()=>openStorage()}>Files</button>
          <button disabled={!app.properties()} onClick={()=>{app.closeActiveTab();setMenu(false);menuButton.focus();}}>Close tab</button>
          <button onClick={()=>{setMenu(false);menuButton.focus();}}>Dismiss menu</button>
        </div></Show>
      </div>
      <div class="flint-vault-name"><small>{cavern ? 'CAVERN' : 'WORKSPACE'}</small><span>{cavern?.current()?.name ?? vault()?.root??'A space for ideas'}</span></div>
      <button data-flint-relief="key" class="flint-search-launch" onClick={showSearch}>Search</button>
      <Show when={props.materialChrome !== false}><MaterialChrome root={()=>shell} viewport={()=>viewport} layout={()=>[library(),context(),narrowPanel(),view()]} /></Show>
      <button data-flint-relief="key" disabled={!app.files||!app.properties()||busy()||vault()?.readOnly||vault()?.busy} onPointerDown={e=>e.preventDefault()} onClick={()=>void save()}>Save Document</button>
    </header>
    <div class="flint-workspace-tools">
      <button data-flint-relief="key" aria-label="Toggle Library" aria-pressed={library()} onPointerDown={e=>e.preventDefault()} onClick={()=>toggle('library')}>☰ Library</button>
      <Show when={props.spatialGraph !== false}><button data-flint-relief="key" aria-label="Toggle Document and Graph" aria-pressed={view()==='graph'} disabled={!app.properties()} onClick={()=>setView(view()==='graph'?'document':'graph')}>{view()==='graph'?'▤ Document':'♧ Graph'}</button></Show>
      <div class="flint-current"><span>{cavern?.current()?.name ?? vault()?.root??'Open Documents'}</span><span aria-hidden="true"> / </span><strong>{app.properties()?.title??'Choose a Document'}</strong></div>
      <button data-flint-relief="key" aria-label="Toggle Context" aria-pressed={context()} onPointerDown={e=>e.preventDefault()} onClick={()=>toggle('context')}>Context ☷</button>
    </div>
    </Show>
    <Show when={props.probe !== false}><FlintProbe root={()=>shell} lighting={()=>materialChromePresentation(shell)?.lighting}/></Show>
    <div class="flint-application__body">
      <nav data-flint-relief="panel" class="flint-application__vault flint-rail" aria-label="Flint Documents" onClick={event=>{if((event.target as Element).closest('.flint-search-hit,.flint-tree-document button,.flint-open-document'))setView('document');}} onKeyDown={e=>{if(e.key==='Escape'&&shell.clientWidth<940){e.preventDefault();e.stopPropagation();setNarrowPanel('');shell.querySelector<HTMLButtonElement>('[aria-label="Toggle Library"]')?.focus();}}}>
        <Show when={independent()}><SceneChrome root={()=>shell} enabled={props.materialChrome} title="Library" controls={[
          {id:'browse',label:'Browse',active:browse()==='browse',action:()=>setBrowse('browse')},
          {id:'search',label:'Search',active:browse()==='search',action:()=>setBrowse('search')},
        ]}/></Show>
        <div classList={{'flint-html-content':independent()}} data-flint-content="library">
        <Show when={!independent()}><div class="flint-spatial-navigation" role="group" aria-label="Flint views">
          <button data-flint-relief="key" aria-pressed={view()==='document'} onClick={()=>setView('document')}><span aria-hidden="true">▤</span> Documents</button>
          <Show when={props.spatialGraph !== false}><button data-flint-relief="key" aria-pressed={view()==='graph'} disabled={!app.properties()} onClick={()=>setView('graph')}><span aria-hidden="true">♧</span> Graph</button></Show>
          <button data-flint-relief="key" onClick={showSearch}><span aria-hidden="true">⌕</span> Search collection</button>
        </div>
        <div class="flint-rail-heading"><h2>Library</h2><small>YOUR COLLECTION</small></div>
        <div class="flint-segments" role="group" aria-label="Library views"><button aria-pressed={browse()==='browse'} onPointerDown={e=>e.preventDefault()} onClick={()=>setBrowse('browse')}>Browse</button><button aria-pressed={browse()==='search'} onPointerDown={e=>e.preventDefault()} onClick={()=>setBrowse('search')}>Search</button></div>
        </Show>
        <div hidden={browse()!=='browse'}>
          <Show when={app.vault} fallback={<p>Cavern browsing is unavailable in this host.</p>}><VaultView vault={app.vault!}/></Show>
          <Show when={!vault()}><h3>Open Documents</h3><p class="flint-hint">Open a managed directory above, or continue with a Document already in this workspace.</p><For each={app.documents()}>{doc=><button class="flint-open-document" onClick={()=>app.openDocument(doc.id)}><span>{doc.title}</span></button>}</For></Show>
        </div>
        <div hidden={browse()!=='search'}><Show when={vault()&&app.knowledge} fallback={<p>Open a Cavern to search its available native Documents.</p>}><KnowledgeView knowledge={app.knowledge!} mode="search"/></Show></div>
        </div>
      </nav>
      <main ref={viewport} class="flint-application__editor" data-flint-content="document">
        <Show when={!app.properties()}><section class="flint-welcome"><img src={identity} alt="Flint — a space for ideas"/><div><small>A SPACE FOR IDEAS</small><h1>Make room for your next thought.</h1><p>{vault()?'Choose a Document from your Library, or create one in the selected folder.':'Bring your Documents together. Open a Cavern to browse, write and follow connections.'}</p><button onClick={()=>vault()?focusLibrary():chooseVault()}>{vault()?'Browse / New Document':'Open a Cavern'}</button><button onClick={e=>openStorage(e.currentTarget)}>Open native file</button></div></section></Show>
        {/* This slot is unconditional. Shell presentation never reparents or remounts it. */}
        <app.tabs />
        <Show when={props.spatialGraph !== false && view()==='graph' && app.properties()}><DocumentGraph application={app} root={()=>shell} showDocument={()=>setView('document')}/></Show>
      </main>
      <aside data-flint-relief="panel" class="flint-context flint-rail" onClick={event=>{if((event.target as Element).closest('.document-entity-list__focus,.flint-reference button,.flint-knowledge button'))setView('document');}} aria-label="Document Context" onKeyDown={e=>{if(e.key==='Escape'&&!e.defaultPrevented&&shell.clientWidth<940){e.preventDefault();e.stopPropagation();setNarrowPanel('');shell.querySelector<HTMLButtonElement>('[aria-label="Toggle Context"]')?.focus();}}}>
        <Show when={independent()}><SceneChrome root={()=>shell} enabled={props.materialChrome} title="Context" controls={(['Backlinks','References','Properties'] as const).map(name=>({id:name,label:name,active:lens()===name,action:()=>setLens(name)}))}/></Show>
        <div classList={{'flint-html-content':independent()}} data-flint-content="entities">
        <Show when={!independent()}>
        <div class="flint-rail-heading"><h2>Context</h2><small>AROUND THIS DOCUMENT</small></div>
        <div class="flint-segments" role="group" aria-label="Context lenses"><For each={['Backlinks','References','Properties'] as const}>{name=><button aria-pressed={lens()===name} onPointerDown={e=>e.preventDefault()} onClick={()=>setLens(name)}>{name}</button>}</For></div>
        </Show>
        <Show when={!app.properties()}><p>Open a Document to explore its context.</p></Show>
        <Show when={lens()==='Backlinks'&&context()}><Show when={app.entityBacklinks} fallback={<p>Entity backlinks are unavailable in this host.</p>}><Dynamic component={app.entityBacklinks!}/></Show></Show>
        <div hidden={lens()!=='References'}><Show when={vault()&&app.knowledge} fallback={<p>Open a vault to work with native Document references.</p>}><KnowledgeView knowledge={app.knowledge!} mode="references"/></Show></div>
        <div hidden={lens()!=='Properties'}><DocumentProperties application={app}/></div>
        </div>
      </aside>
    </div>
    <footer class="flint-status" aria-label="Flint resource status"><div><span class="flint-status-dot" aria-hidden="true"/><span class="flint-signature">SAME THING. MANY FORMS.</span><span role="status">{busy()?'Saving…':app.properties()?.status??app.files?.status()??'No active Document'}</span></div>
      <Show when={vault()}><small>{vault()!.documents.filter(d=>d.loaded).length}/{vault()!.documents.length} loaded · search coverage is reported per query</small></Show>
      <button onClick={e=>openStorage(e.currentTarget)}>Storage details</button>
    </footer>
    <Show when={error()||vault()?.readOnly||vault()?.busy||vault()?.notice||vault()?.complete===false||vault()?.diagnostics.length||vault()?.operations.some(o=>o.phase==='pending')}><div class="flint-attention" role="status">
      <Show when={error()}><p role="alert">{error()}</p></Show><Show when={vault()?.readOnly}><p>Read-only storage. Local edits cannot be saved.</p></Show>
      <Show when={vault()?.busy}><p>Vault operation in progress…</p></Show><Show when={vault()?.complete===false}><p>Discovery is incomplete. Uninspected resources are unknown.</p></Show>
      <Show when={vault()?.operations.some(o=>o.phase==='pending')}><p>Relocation needs attention. <button onClick={focusLibrary}>Review recovery in Library</button></p></Show>
      <For each={vault()?.diagnostics}>{d=><p>{d}</p>}</For><Show when={vault()?.notice}><p>{vault()!.notice}</p></Show>
    </div></Show>
    </div>
    <Show when={storage()}><StorageSheet application={app} destination={destination()} setDestination={setDestination} close={closeStorage}/></Show>
  </div>;
}
