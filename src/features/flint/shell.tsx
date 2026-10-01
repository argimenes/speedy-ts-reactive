import { For, Show, createSignal } from 'solid-js';
import type { DocumentApplicationInstance } from '../../feature-api/document-application';
import { BacklinksPanel } from './backlinks-view';
import { KnowledgeView } from './knowledge-view';
import { VaultView, DocumentProperties } from './vault-view';
import { StorageSheet } from './storage-sheet';

// A runtime crop of the supplied, unmodified master: no generated substitute artwork.
const identity = new URL('../../../docs/assets/flint/flint-app-icon-master.png', import.meta.url).href;
export function FlintView(props:{application:DocumentApplicationInstance}) {
  const app=props.application;
  const [library,setLibrary]=createSignal(true),[context,setContext]=createSignal(true);
  const [browse,setBrowse]=createSignal<'browse'|'search'>('browse');
  const [lens,setLens]=createSignal<'Backlinks'|'References'|'Properties'>('Backlinks');
  const [narrowPanel,setNarrowPanel]=createSignal<'library'|'context'|''>('');
  const [menu,setMenu]=createSignal(false),[storage,setStorage]=createSignal(false);
  const [destination,setDestination]=createSignal({folder:'.',filename:'Document.mutable.json'});
  const [busy,setBusy]=createSignal(false),[error,setError]=createSignal('');
  let shell!:HTMLDivElement, menuButton!:HTMLButtonElement, storageInvoker:HTMLElement|undefined;
  const vault=()=>app.vault?.state();
  const showLibrary=()=>{setLibrary(true);setNarrowPanel('library');};
  const focusLibrary=()=>{showLibrary();setBrowse('browse');queueMicrotask(()=>shell.querySelector<HTMLInputElement>('[aria-label="Vault directory"]')?.focus());};
  const showSearch=()=>{showLibrary();setBrowse('search');queueMicrotask(()=>shell.querySelector<HTMLInputElement>('[aria-label="Search vault"]')?.focus());};
  const openStorage=(invoker?:HTMLElement)=>{storageInvoker=invoker??menuButton;const bound=app.files?.location();if(bound)setDestination(bound);setMenu(false);setStorage(true);};
  const closeStorage=()=>{setStorage(false);queueMicrotask(()=>{const target=storageInvoker?.isConnected?storageInvoker:menuButton;if(target?.isConnected)target.focus();});};
  const save=async()=>{if(!app.files||busy())return;if(!app.files.location()){openStorage();return;}setBusy(true);setError('');try{await app.files.save(destination());}catch(e){setError(String(e));}finally{setBusy(false);}};
  const toggle=(rail:'library'|'context')=>{const open=rail==='library'?library():context(),set=rail==='library'?setLibrary:setContext;
    if(shell.clientWidth<940){set(true);setNarrowPanel(narrowPanel()===rail?'':rail);}else set(!open);
  };
  return <div ref={shell} class="flint-application" data-library={library()} data-context={context()} data-narrow-panel={narrowPanel()}>
    <div class="flint-surfaces" inert={storage()}>
    <header class="flint-application__header">
      <div class="flint-menu-anchor" onKeyDown={e=>{if(menu()&&e.key==='Escape'){e.preventDefault();e.stopPropagation();setMenu(false);menuButton.focus();}}}><button ref={menuButton} class="flint-brand" aria-label="Flint application menu" aria-expanded={menu()} onClick={()=>setMenu(!menu())}><span class="flint-mark"><img src={identity} alt=""/></span><strong>Flint</strong><span aria-hidden="true">⌄</span></button>
        <Show when={menu()}><div class="flint-menu" role="group" aria-label="Flint actions" onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();setMenu(false);menuButton.focus();}}}>
          <button disabled={!app.vault} onClick={()=>{setMenu(false);focusLibrary();}}>Open Vault</button>
          <button onClick={()=>openStorage()}>Files</button>
          <button disabled={!app.properties()} onClick={()=>{app.closeActiveTab();setMenu(false);menuButton.focus();}}>Close tab</button>
          <button onClick={()=>{setMenu(false);menuButton.focus();}}>Dismiss menu</button>
        </div></Show>
      </div>
      <div class="flint-vault-name"><small>WORKSPACE</small><span>{vault()?.root??'A space for ideas'}</span></div>
      <button class="flint-search-launch" onClick={showSearch}>Search</button>
      <button disabled={!app.files||!app.properties()||busy()||vault()?.readOnly||vault()?.busy} onPointerDown={e=>e.preventDefault()} onClick={()=>void save()}>Save Document</button>
    </header>
    <div class="flint-workspace-tools">
      <button aria-label="Toggle Library" aria-pressed={library()} onPointerDown={e=>e.preventDefault()} onClick={()=>toggle('library')}>☰ Library</button>
      <div class="flint-current"><span>{vault()?.root??'Open Documents'}</span><span aria-hidden="true"> / </span><strong>{app.properties()?.title??'Choose a Document'}</strong></div>
      <button aria-label="Toggle Context" aria-pressed={context()} onPointerDown={e=>e.preventDefault()} onClick={()=>toggle('context')}>Context ☷</button>
    </div>
    <div class="flint-application__body">
      <nav class="flint-application__vault flint-rail" aria-label="Flint Documents" onKeyDown={e=>{if(e.key==='Escape'&&shell.clientWidth<940){e.preventDefault();e.stopPropagation();setNarrowPanel('');shell.querySelector<HTMLButtonElement>('[aria-label="Toggle Library"]')?.focus();}}}>
        <div class="flint-rail-heading"><h2>Library</h2><small>YOUR COLLECTION</small></div>
        <div class="flint-segments" role="group" aria-label="Library views"><button aria-pressed={browse()==='browse'} onPointerDown={e=>e.preventDefault()} onClick={()=>setBrowse('browse')}>Browse</button><button aria-pressed={browse()==='search'} onPointerDown={e=>e.preventDefault()} onClick={()=>setBrowse('search')}>Search</button></div>
        <div hidden={browse()!=='browse'}>
          <Show when={app.vault} fallback={<p>Vault browsing is unavailable in this host.</p>}><VaultView vault={app.vault!}/></Show>
          <Show when={!vault()}><h3>Open Documents</h3><p class="flint-hint">Open a managed directory above, or continue with a Document already in this workspace.</p><For each={app.documents()}>{doc=><button class="flint-open-document" onClick={()=>app.openDocument(doc.id)}><span>{doc.title}</span></button>}</For></Show>
        </div>
        <div hidden={browse()!=='search'}><Show when={vault()&&app.knowledge} fallback={<p>Open a vault in Browse to search its available native Documents.</p>}><KnowledgeView knowledge={app.knowledge!} mode="search"/></Show></div>
      </nav>
      <main class="flint-application__editor">
        <Show when={!app.properties()}><section class="flint-welcome"><img src={identity} alt="Flint — a space for ideas"/><div><small>A SPACE FOR IDEAS</small><h1>Make room for your next thought.</h1><p>{vault()?'Choose a Document from your Library, or create one in the selected folder.':'Bring your Documents together. Open a vault to browse, write and follow connections.'}</p><button onClick={focusLibrary}>{vault()?'Browse / New Document':'Open a vault'}</button><button onClick={e=>openStorage(e.currentTarget)}>Open native file</button></div></section></Show>
        {/* This slot is unconditional. Shell presentation never reparents or remounts it. */}
        <app.tabs />
      </main>
      <aside class="flint-context flint-rail" aria-label="Document Context" onKeyDown={e=>{if(e.key==='Escape'&&!e.defaultPrevented&&shell.clientWidth<940){e.preventDefault();e.stopPropagation();setNarrowPanel('');shell.querySelector<HTMLButtonElement>('[aria-label="Toggle Context"]')?.focus();}}}>
        <div class="flint-rail-heading"><h2>Context</h2><small>AROUND THIS DOCUMENT</small></div>
        <div class="flint-segments" role="group" aria-label="Context lenses"><For each={['Backlinks','References','Properties'] as const}>{name=><button aria-pressed={lens()===name} onPointerDown={e=>e.preventDefault()} onClick={()=>setLens(name)}>{name}</button>}</For></div>
        <Show when={!app.properties()}><p>Open a Document to explore its context.</p></Show>
        <Show when={lens()==='Backlinks'&&context()}><Show when={vault()&&app.backlinks} fallback={<p>Backlinks become available when a Document is open in a vault.</p>}><BacklinksPanel backlinks={app.backlinks!}/></Show></Show>
        <div hidden={lens()!=='References'}><Show when={vault()&&app.knowledge} fallback={<p>Open a vault to work with native Document references.</p>}><KnowledgeView knowledge={app.knowledge!} mode="references"/></Show></div>
        <div hidden={lens()!=='Properties'}><DocumentProperties application={app}/></div>
      </aside>
    </div>
    <footer class="flint-status" aria-label="Flint resource status"><div><span class="flint-status-dot" aria-hidden="true"/><span role="status">{busy()?'Saving…':app.properties()?.status??app.files?.status()??'No active Document'}</span></div>
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
