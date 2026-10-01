import { For, Show, createEffect, createMemo, createSignal, on } from 'solid-js';
import type { ApplicationVault, DocumentApplicationInstance } from '../../feature-api/document-application';
const path = (l: {folder:string;filename:string}) => l.folder === '.' ? l.filename : `${l.folder}/${l.filename}`;
const location = (p:string) => { const parts=p.split('/'), filename=parts.pop()!; return {folder:parts.join('/')||'.',filename}; };
const join = (folder:string,name:string) => folder==='.'?name:`${folder}/${name}`;

export function VaultView(props:{vault:ApplicationVault}) {
  const [root,setRoot]=createSignal('.'), [folder,setFolder]=createSignal('.'), [selected,setSelected]=createSignal('');
  const [name,setName]=createSignal('Document.mutable.json'), [title,setTitle]=createSignal('Untitled'), [directory,setDirectory]=createSignal('New folder');
  const [destination,setDestination]=createSignal('.'), [moveName,setMoveName]=createSignal(''), [importSource,setImportSource]=createSignal(''), [tag,setTag]=createSignal('');
  const [working,setWorking]=createSignal(false), [error,setError]=createSignal('');
  const state=createMemo(()=>props.vault.state()), busy=()=>working()||state()?.busy, readOnly=()=>state()?.readOnly;
  const run=async(action:()=>Promise<unknown>)=>{if(busy())return;setWorking(true);setError('');try{await action();}catch(e){setError(String(e));}finally{setWorking(false);}};
  createEffect(on(createMemo(()=>state()?.root),r=>{if(r){setRoot(r);setFolder(r);setDestination(r);setSelected('');}}));
  createEffect(()=>{const s=state();if(s && folder()!==s.root&&!s.folders.includes(folder()))setFolder(s.root);});
  const folders=createMemo(()=>state()?[state()!.root,...state()!.folders]:[]);
  const tags=createMemo(()=>[...new Set(state()?.documents.flatMap(d=>d.tags)??[])].sort());
  const pickFolder=(p:string)=>{setFolder(p);setSelected('');setMoveName(p.split('/').pop()!);setDestination(state()!.root);};
  const Folder=(p:{path:string})=> <details open class="flint-tree-folder"><summary><button aria-pressed={folder()===p.path&&!selected()} onClick={()=>pickFolder(p.path)}>{p.path===state()?.root?p.path:p.path.split('/').pop()}</button></summary>
    <For each={state()?.documents.filter(d=>d.location.folder===p.path&&(!tag()||d.loaded&&d.tags.includes(tag())))}>{d=><div class="flint-tree-document"><button aria-label={`Open ${path(d.location)}`} disabled={busy()||!state()!.complete||d.state==='ambiguous'||d.state==='pending'} onClick={()=>{setSelected(path(d.location));setFolder(d.location.folder);setDestination(d.location.folder);setMoveName(d.location.filename);void run(()=>props.vault.openFile(d.location));}}>{d.title}<small>{d.location.filename} · {d.state}</small></button><Show when={d.state==='pending'}><button disabled={busy()||readOnly()} onClick={()=>void run(()=>props.vault.recoverNative(d.location))}>Recover {d.location.filename}</button></Show></div>}</For>
    <For each={state()?.folders.filter(f=>location(f).folder===p.path)}>{f=><Folder path={f}/>}</For>
  </details>;
  return <section class="flint-vault-controls" aria-label="Filesystem vault">
    <label>Managed directory<input aria-label="Vault directory" value={root()} onInput={e=>setRoot(e.currentTarget.value)}/></label>
    <button disabled={busy()} onClick={()=>void run(()=>props.vault.open(root()))}>Open Vault</button>
    <Show when={state()}><button disabled={busy()} onClick={()=>void run(()=>props.vault.refresh())}>Refresh</button><button disabled={busy()} onClick={()=>props.vault.close()}>Close Vault</button>
      <p>Vault: {state()!.root} <Show when={readOnly()}><strong>Read-only storage. Local edits cannot be saved.</strong></Show></p>
      <label>Tag filter<select aria-label="Tag filter" value={tag()} onChange={e=>setTag(e.currentTarget.value)}><option value="">All tags</option><For each={tags()}>{t=><option value={t}>{t}</option>}</For></select></label>
      <Show when={state()!.documents.some(d=>!d.loaded)}><p>Tag filtering covers opened Documents only.</p></Show>
      <Folder path={state()!.root}/>
      <p>Selected folder: <output aria-label="Selected folder">{folder()}</output></p>
      <details><summary>New Document / import</summary>
        <label>Authored title<input aria-label="New Document title" value={title()} onInput={e=>setTitle(e.currentTarget.value)}/></label>
        <label>Native filename<input aria-label="New Document filename" value={name()} onInput={e=>setName(e.currentTarget.value)}/></label>
        <button disabled={busy()||readOnly()} onClick={()=>void run(()=>props.vault.createDocument(folder(),name(),title()))}>New Document</button>
        <label>Standalone Markdown<select aria-label="Markdown source" value={importSource()} onChange={e=>setImportSource(e.currentTarget.value)}><option value="">Choose source</option><For each={state()!.markdown}>{p=><option value={p}>{p}</option>}</For></select></label>
        <button disabled={busy()||readOnly()||!importSource()} onClick={()=>void run(()=>props.vault.importMarkdown(location(importSource()),{folder:folder(),filename:name()}))}>Import into new native Document</button>
        <p>Import preserves the source. Choose a fresh destination filename in the selected folder.</p>
      </details>
      <details><summary>Create directory</summary><label>Directory name<input aria-label="New directory name" value={directory()} onInput={e=>setDirectory(e.currentTarget.value)}/></label><button disabled={busy()||readOnly()} onClick={()=>void run(()=>props.vault.createDirectory(folder(),directory()))}>Create directory</button></details>
      <details><summary>Rename / move</summary><p>{selected()||folder()}</p>
        <label>Destination folder<select aria-label="Move destination folder" value={destination()} onChange={e=>setDestination(e.currentTarget.value)}><For each={folders()}>{f=><option value={f}>{f}</option>}</For></select></label>
        <label>{selected()?'Native filename':'Directory name'}<input aria-label="Move destination name" value={moveName()} onInput={e=>setMoveName(e.currentTarget.value)}/></label>
        <button disabled={busy()||readOnly()||!moveName()||(!selected()&&folder()===state()!.root)} onClick={()=>void run(async()=>{
          if(selected()){await props.vault.relocateDocument(location(selected()),{folder:destination(),filename:moveName()});if(state()!.documents.some(d=>path(d.location)===join(destination(),moveName()))){setSelected(join(destination(),moveName()));setFolder(destination());}}
          else {await props.vault.relocateDirectory(folder(),join(destination(),moveName()));if(state()!.folders.includes(join(destination(),moveName())))setFolder(join(destination(),moveName()));}
        })}>Apply rename / move</button><p>This changes physical location only. Authored titles and native reference IDs stay unchanged; existing Markdown links are not rewritten.</p>
      </details>
      <For each={state()!.operations.filter(o=>o.phase==='pending')}>{o=><p>Pending relocation: {o.operationId}<button disabled={busy()||readOnly()} onClick={()=>void run(()=>props.vault.recoverOperation(o.operationId))}>Recover relocation</button></p>}</For>
      <For each={state()!.diagnostics}>{d=><p role="alert">{d}</p>}</For>
      <p role="status">{busy()?'Vault operation in progress…':state()!.notice}</p>
    </Show><Show when={error()}><p role="alert">{error()}</p></Show>
  </section>;
}

export function DocumentProperties(props:{application:DocumentApplicationInstance}) {
  const app=props.application, [title,setTitle]=createSignal(''),[tags,setTags]=createSignal(''),[error,setError]=createSignal('');
  createEffect(on(createMemo(()=>JSON.stringify([app.properties()?.id,app.properties()?.title,app.properties()?.tags])),()=>{setTitle(app.properties()?.title??'');setTags(app.properties()?.tags.join('\n')??'');setError('');}));
  return <Show when={app.properties()}><aside class="flint-properties" aria-label="Document properties"><h2>Properties</h2>
    <label>Authored title<input aria-label="Document title" value={title()} onInput={e=>setTitle(e.currentTarget.value)}/></label>
    <label>Tags (one per line)<textarea aria-label="Document tags" disabled={!app.properties()!.tagsValid} value={tags()} onInput={e=>setTags(e.currentTarget.value)}/></label>
    <Show when={!app.properties()!.tagsValid}><p>Existing tag data is incompatible and has been preserved.</p></Show>
    <button disabled={!app.properties()!.tagsValid} onClick={()=>{try{app.setProperties(app.properties()!.id,{title:title(),tags:tags().split('\n')});setError('');}catch(e){setError(String(e));}}}>Apply properties</button>
    <p>Title edits do not rename files.</p><Show when={error()}><p role="alert">{error()}</p></Show>
    <dl><dt>Canonical ID</dt><dd data-flint-property="id">{app.properties()!.id}</dd><dt>Format</dt><dd>{app.properties()!.format}</dd><dt>Physical location</dt><dd data-flint-property="location">{app.properties()!.location?path(app.properties()!.location!):'No native file binding'}</dd><dt>Save status</dt><dd>{app.properties()!.status}</dd></dl>
    <Show when={app.properties()!.unsaved}><p>Unsaved native candidate. Use Storage details to choose a fresh native filename, then Save to selected destination. It is not yet a vault file.</p></Show>
  </aside></Show>;
}
