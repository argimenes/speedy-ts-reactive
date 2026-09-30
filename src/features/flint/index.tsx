import { For, Show, createSignal } from "solid-js";
import type { CodexFeature, FeatureScope } from "../../feature-api";
import type { DocumentApplicationCapabilities, DocumentApplicationInstance } from "../../feature-api/document-application";
import "./flint.css";
import { BacklinksView } from "./backlinks-view";
import { KnowledgeView } from "./knowledge-view";
import { VaultView, DocumentProperties } from "./vault-view";

function FlintView(props: { application: DocumentApplicationInstance }) {
  const app = props.application;
  const [filesOpen,setFilesOpen] = createSignal(false), [folder,setFolder] = createSignal('.'), [filename,setFilename] = createSignal('Document.mutable.json');
  const [names,setNames] = createSignal<string[]>([]), [error,setError] = createSignal(''), [busy,setBusy] = createSignal(false);
  const [comparison,setComparison] = createSignal<{external:string;generated:string;binding:string}>();
  const location = () => ({folder:folder(),filename:filename()});
  const run = async (action: () => Promise<unknown>) => { if(busy())return;setBusy(true);setError('');try{await action();}catch(e){setError(String(e));}finally{setBusy(false);} };

  return <div class="flint-application">
    <header class="flint-application__header"><strong>Flint</strong><span>A space for ideas</span><Show when={app.files}><button type="button" onClick={() => { const bound=app.files!.location(); if(bound){setFolder(bound.folder);setFilename(bound.filename);}setFilesOpen(!filesOpen()); }}>Files</button><button type="button" disabled={busy()||app.vault?.state()?.readOnly||app.vault?.state()?.busy} onClick={() => void run(() => app.files!.save(location()))}>Save Document</button></Show><button type="button" onClick={() => app.closeActiveTab()}>Close tab</button></header>
    <Show when={app.files}>
      <div class="flint-files" aria-label="Flint native Document files">
        <p role="status">{app.files!.status()}</p><Show when={error()}><p role="alert">{error()}</p></Show>
        <Show when={filesOpen()}>
          <label>Server folder <input aria-label="Server folder" value={folder()} onInput={e=>setFolder(e.currentTarget.value)} /></label>
          <label>Filename <input aria-label="Native filename" value={filename()} onInput={e=>setFilename(e.currentTarget.value)} /></label>
          <button disabled={busy()} onClick={()=>void run(async()=>setNames(await app.files!.list(folder())))}>List files</button>
          <select aria-label="Server files" value={filename()} onChange={e=>setFilename(e.currentTarget.value)}><option value="">Choose a file</option><For each={names()}>{name=><option value={name}>{name}</option>}</For></select>
          <button disabled={busy()} onClick={()=>void run(()=>app.files!.open(location()))}>Open native</button>
          <button disabled={busy()} onClick={()=>void run(()=>app.files!.open(location(),true))}>Import Markdown</button>
          <button disabled={busy()} onClick={()=>void run(()=>app.files!.recover(location()))}>Retry / Recover</button>
          <button disabled={busy()} onClick={()=>void run(async()=>setComparison({...await app.files!.compare(),binding:JSON.stringify(app.files!.location())}))}>Compare Markdown</button>
          <p>Native Documents save individually. Workspace saving remains unavailable when native resource semantics cannot be preserved. Changing the fields selects a file to open or a first-save destination; it does not relocate an already bound Document.</p>
          <Show when={comparison()?.binding===JSON.stringify(app.files!.location()) && comparison()}>{value=><div class="flint-files__compare"><label>External Markdown<textarea readOnly value={value().external}/></label><label>Mutable projection<textarea readOnly value={value().generated}/></label><button disabled={busy()} onClick={()=>void run(()=>app.files!.keepMutable())}>Keep Mutable (preserve external copy)</button></div>}</Show>
        </Show>
      </div>
    </Show>
    <div class="flint-application__body">
      <nav class="flint-application__vault" aria-label="Flint Documents"><Show when={app.vault}><VaultView vault={app.vault!}/></Show><Show when={!app.vault?.state()}><h2>Open Documents</h2>
        <For each={app.documents()}>{doc => <div><button type="button" onClick={() => app.openDocument(doc.id)}>{doc.title}</button><input aria-label={`Rename ${doc.title}`} value={doc.title} onChange={e => { const title = e.currentTarget.value.trim(); if (title) app.renameDocument(doc.id, title); }} /></div>}</For>
      </Show><Show when={app.vault?.state()&&app.knowledge}><KnowledgeView knowledge={app.knowledge!}/></Show><Show when={app.vault?.state()&&app.backlinks}><BacklinksView backlinks={app.backlinks!}/></Show></nav>
      <main class="flint-application__editor"><app.tabs /></main><DocumentProperties application={app}/>
    </div>
  </div>;
}
export function createFlintFeature(capabilities: (scope: FeatureScope) => DocumentApplicationCapabilities): CodexFeature {
  return { id: "flint", activate(scope) {
    capabilities(scope).register({ type: "flint-application-block", view: FlintView,
      create(documents) {
        return { id: crypto.randomUUID(), type: "flint-application-block", metadata: {}, children: [{ id: crypto.randomUUID(), type: "tab-row-block", children: documents.map(doc => ({ id: crypto.randomUUID(), type: "tab-block", metadata: { name: doc.title, documentTarget: { version: 1, documentId: doc.id } } })) }] };
      },
    });
  } };
}
