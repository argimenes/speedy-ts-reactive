import { DocumentBrowser } from "../demo/document-browser";
import {SavedResultActivation} from './saved-result-activation';
import {observeLive} from '../knowledge/live-observer';
import {runSearchWorker} from '../runtime/search-worker';
import { createNativeKnowledgeHost } from './native-knowledge-scope';
import { FactsQueryProvider } from './facts-query-provider';
import { FactsBacklinks } from './facts-backlinks';
import { CanonicalBacklinks } from "./canonical-backlinks";
import type { ApplicationBacklinks } from "../feature-api/backlinks";
import { VaultKnowledge, type KnowledgeHost } from "./vault-knowledge";
import { revealMatch } from "../runtime/reveal-match";
import type { BlockTreeProjection } from "../block-tree/projection";
import { createDocumentVaults, vaultPath, vaultLeaf, vaultContains, type DocumentVaultLease, type VaultLocation } from "./document-vault";
import { createFormattedDocument, readDocumentFormat } from "../features/document-formats/model";
import type { ApplicationVault } from "../feature-api/document-application";
import { nativeDocumentSession } from "../persistence/native-session";
import { documentRootPlacements } from "../block-tree/resource-registration";
import { Show, For, createMemo, createSignal, createEffect, untrack, onCleanup, onMount } from "solid-js";
import { Dynamic } from "solid-js/web";
import type { ReactiveEditor } from "../reactive-editor/editor";
import type { FeatureScope } from "../feature-api";
import type { DocumentApplicationCapabilities } from "../feature-api/document-application";
import type { ExistingBlockDto } from "../block-tree/types";
import { tabDocumentTarget } from "../rendering/document-tab-context";
import { TransientDocumentView, type DocumentViewBookmark } from "../rendering/transient-document-view";

/** Private host adapter. No repository/editor access crosses into the application. */
export function documentApplicationCapabilities(editor: ReactiveEditor, scope: FeatureScope): DocumentApplicationCapabilities {
  const requireActive = () => { if (!scope.active()) throw new Error("Document application is disposed"); };
  const catalog = () => {
    const state = editor.repository.readState();
    return Object.values(state.contents).filter(c => c.viewType === "document-block").map(content => {
      const meta = content.payload.metadata as Record<string, unknown> | undefined;
      const id = String(meta?.documentId ?? content.payload.id ?? "");
      const owners = documentRootPlacements(state, content.key).map(p => p.key);
      return { id, title: String(meta?.title ?? "Untitled"), contentKey: content.key, placement: owners.length === 1 ? owners[0] : undefined };
    }).filter(d => d.id);
  };
  return { register(definition) {
    requireActive();
    const native = editor.features.nativeDocumentPersistence ? nativeDocumentSession(editor) : undefined;
    const factsHost = native && editor.features.nativeKnowledge ? createNativeKnowledgeHost(editor.repository, native, {
      read: () => ({version: 1, opaqueTypes: editor.registry.typesWithCapability('opaque-widget')}),
      subscribe: listener => editor.registry.subscribe(listener),
    }, {loadedOnly: !editor.features.nativeKnowledgeSaved, progressiveSaved: editor.features.nativeKnowledgeSaved}) : undefined;
    scope.own(() => { void factsHost?.dispose(); });
    const vaults = native ? createDocumentVaults(native) : undefined;
    scope.own(() => vaults?.dispose());
    const vaultRoots = new Map<string, string>();
    scope.own(() => vaultRoots.clear());
    // Search/reference navigation is presentation state: no authored tab insert or History event.
    const navigationTabs = new Map<string, { tabs: Map<string, string>; active?: string }>();
    scope.own(() => navigationTabs.clear());
    const viewBookmarks = new Map<string, { placement: string; tabs: Map<string, DocumentViewBookmark> }>();
    scope.own(() => viewBookmarks.clear());
    scope.own(editor.repository.subscribeChanges(change => {
      if (change.inlineOwner || change.split || change.childrenOwner) return;
      for (const [key, value] of viewBookmarks) if (!editor.repository.state.placements[value.placement]) { viewBookmarks.delete(key); vaultRoots.delete(key); navigationTabs.delete(key); }
      scope.defer(() => { for (const [owner, value] of viewBookmarks) for (const key of value.tabs.keys()) if (!editor.node(key) && !navigationTabs.get(owner)?.tabs.has(key)) value.tabs.delete(key); });
    }));
    const Instance = (props: { nodeKey: string }) => {
      // Stage A hosts a Window application, never an application recursively inside a Document.
      if (editor.blockQueries.ancestors(props.nodeKey).some(n => n.viewType === "document-block")) return <p role="status">This application requires a Window outside a Document.</p>;
      const [revision, setRevision] = createSignal(0);
      // Text fast paths cannot change identity or titles.
      onCleanup(editor.repository.subscribeChanges(change => { if (!change.inlineOwner && !change.split && !change.childrenOwner) setRevision(n => n + 1); }));
      const all = createMemo(() => { revision(); return catalog(); });
      const documents = all;
      const resolve = (id: string) => {
        const matches = all().filter(d => d.id === id);
        return matches.length === 1 ? matches[0] : undefined;
      };
      const row = () => editor.node(props.nodeKey)?.children.map(key => editor.node(key)).find(n => n?.viewType === "tab-row-block");
      const bookmarks = viewBookmarks.get(props.nodeKey)?.tabs ?? new Map<string, DocumentViewBookmark>();
      viewBookmarks.set(props.nodeKey, { placement: editor.node(props.nodeKey)!.placementKey, tabs: bookmarks });
      const navigation = navigationTabs.get(props.nodeKey) ?? {tabs: new Map<string, string>()};
      navigationTabs.set(props.nodeKey, navigation);
      const [navigationRevision, setNavigationRevision] = createSignal(0);
      const liveViews = new Map<string, BlockTreeProjection>();
      const activeTab = () => { navigationRevision(); if(navigation.active && navigation.tabs.has(navigation.active)) return navigation.active; const r = row(); return r && (editor.viewChildren[r.key] ?? r.children.find(k => (editor.node(k)?.payload.metadata as any)?.active) ?? r.children[0]); };
      let root!: HTMLDivElement, mounted = true;
      const guard = () => { requireActive(); if (!mounted || !editor.node(props.nodeKey)) throw new Error("Document application instance is disposed"); };
      onMount(() => {
        const release = editor.mounts.register(props.nodeKey, { root, focusElement: root, inputPolicy: "container", focus: () => root.focus({ preventScroll: true }) });
        onCleanup(release);
      });
      onCleanup(() => { mounted = false; if (!editor.node(props.nodeKey)) { viewBookmarks.delete(props.nodeKey); navigationTabs.delete(props.nodeKey); } });
      const Target = (target: { documentId: string; tabKey: string }) => {
        const placement = () => resolve(target.documentId)?.placement;
        return <Show when={placement()} keyed fallback={<p role="status">Document unavailable: {target.documentId}. Its canonical source is missing or ambiguous.</p>}>{source =>
          <TransientDocumentView editor={editor} placement={source} onProjection={view => { liveViews.set(target.tabKey, view); return () => { if(liveViews.get(target.tabKey)===view) liveViews.delete(target.tabKey); }; }} bookmark={() => bookmarks.get(target.tabKey)} remember={value => bookmarks.set(target.tabKey, value)} />
        }</Show>;
      };
      const tabId = (key: string) => navigation.tabs.get(key) ?? tabDocumentTarget(editor.node(key)?.payload.metadata);
      const chooseTab = (key: string) => { navigation.active = navigation.tabs.has(key) ? key : undefined; setNavigationRevision(n => n+1); const r = row(); if(r && !navigation.active) editor.setViewChild(r.key,key); };
      const tabKeys = createMemo(() => { navigationRevision(); return [...(row()?.children ?? []),...navigation.tabs.keys()]; });
      const tabs = () => <div class="reactive-tabs"><div class="reactive-tabs__labels" role="tablist"><For each={tabKeys()}>{key => <button type="button" role="tab" aria-selected={activeTab()===key} onClick={()=>chooseTab(key)}>{resolve(tabId(key)??'')?.title ?? String((editor.node(key)?.payload.metadata as any)?.name ?? 'Unavailable Document')}</button>}</For></div><For each={tabKeys()}>{key=><Show when={activeTab()===key}><div class="reactive-tabs__panel" role="tabpanel"><Show when={tabId(key)} keyed>{id=><Target documentId={id} tabKey={key}/>}</Show></div></Show>}</For></div>;
      const activeId = () => { const key = activeTab(); return key && tabId(key); };
      const requireId = () => { const id = activeId(); if (!id || !resolve(id)) throw new Error("Select an available Document tab"); return id; };
      const openDocument = (id: string, transient = false) => {
            guard(); const doc = resolve(id), r = row(); if (!doc?.placement || !r) return;
            let target = tabKeys().find(k => tabId(k) === id);
            if(!target && transient) { target = 'navigation:'+crypto.randomUUID(); navigation.tabs.set(target,id); setNavigationRevision(n=>n+1); }
            if (!target) {
              const placement = editor.commands.insert({ id: crypto.randomUUID(), type: "tab-block", metadata: { name: doc.title, documentTarget: { version: 1, documentId: id } } }, { kind: "at", parentKey: r.key, index: r.children.length });
              target = editor.nodeForPlacementInView(placement, r.viewId)?.key;
            }
            if (target) chooseTab(target);
          };
      const [selectedVault, setSelectedVault] = createSignal<DocumentVaultLease>();
      let opening = 0, openQuery: AbortController | undefined;
      onCleanup(() => { opening++; openQuery?.abort(); selectedVault()?.release(); if (!editor.node(props.nodeKey)) vaultRoots.delete(props.nodeKey); });
      onMount(() => {
        const refresh = () => { void selectedVault()?.refresh().catch(() => {}); };
        const refocus = (event: FocusEvent) => { if (!(event.relatedTarget instanceof Node) || !root.contains(event.relatedTarget)) refresh(); };
        window.addEventListener('focus', refresh); root.addEventListener('focusin', refocus);
        onCleanup(() => { window.removeEventListener('focus', refresh); root.removeEventListener('focusin', refocus); });
      });
      const lease = () => { guard(); const value = selectedVault(); if (!value) throw new Error('Open a vault first'); return value; };
      const tagsOf = (id: string) => {
        const doc = resolve(id), meta = doc && editor.repository.state.contents[doc.contentKey].payload.metadata as any;
        const value = meta?.tags;
        return value === undefined ? [] : Array.isArray(value) && value.every(t => typeof t === 'string') ? value as string[] : undefined;
      };
      const properties = () => {
        revision(); const id = activeId(), doc = id && resolve(id); if (!doc || !id) return;
        const meta = editor.repository.state.contents[doc.contentKey].payload.metadata;
        const bound = native?.location(id), v = selectedVault(), scan = v?.snapshot();
        const missing = !!bound && !!v && vaultContains(v.root, vaultPath(bound)) && !scan!.documents.some(d => d.resourceId === id && vaultPath(d.location) === vaultPath(bound));
        return { id, title: doc.title, tags: tagsOf(id) ?? [], tagsValid: tagsOf(id) !== undefined,
          format: readDocumentFormat(meta)?.format ?? 'Native', location: native?.location(id),
          status: (missing ? scan!.complete ? 'Location missing or moved; explicit reconciliation required. ' : 'Location unverified; vault discovery is incomplete. ' : '') + (native?.status(id) ?? 'Native persistence unavailable'), unsaved: native?.isCandidate(id) ?? false };
      };
      const destinationIn = (v: DocumentVaultLease, destination: VaultLocation) => {
        v.requireDirectory(destination.folder); vaultLeaf(destination.filename);
        if (!destination.filename.endsWith('.mutable.json')) throw new Error('Choose a .mutable.json filename');
      };
      const vaultState = createMemo<ReturnType<ApplicationVault['state']>>(function deriveVaultState(previous) {
        revision(); const v = selectedVault(); if (!v || !native) return;
        const scan = v.snapshot();
        // Presentation identity only: retain equal rows across equivalent discovery,
        // binding/status and repository publications. Never reuse storage evidence.
        const previousRows = new Map(previous?.documents.map(d => [vaultPath(d.location), d]));
        return { root: v.root, folders: scan.folders, markdown: scan.markdown.filter(p => !scan.documents.some(d => vaultPath(d.location).replace(/\.mutable\.json$/, '.md') === p)), readOnly: scan.readOnly, complete: scan.complete,
          busy: v.busy(), notice: v.notice(), operations: v.operations(),
          diagnostics: scan.diagnostics.map(d => `${d.path ?? d.resourceId ?? ''}: ${d.message}`),
          documents: scan.documents.map(d => {
            const bound = native.location(d.resourceId), loaded = !!resolve(d.resourceId) && !!bound && vaultPath(bound) === vaultPath(d.location) && d.state !== 'ambiguous';
            const row = { id: d.resourceId, location: d.location, state: d.state, loaded, title: loaded ? resolve(d.resourceId)!.title : d.title || d.location.filename,
              tags: loaded ? tagsOf(d.resourceId) ?? [] : [] };
            const old = previousRows.get(vaultPath(row.location));
            return old && old.id === row.id && old.state === row.state && old.loaded === row.loaded && old.title === row.title && old.tags.length === row.tags.length && old.tags.every((tag, i) => tag === row.tags[i]) ? old : row;
          }) };
      });
      const [choosingVault,setChoosingVault]=createSignal(false),[chooserBusy,setChooserBusy]=createSignal(false),[chooserError,setChooserError]=createSignal('');
      const vault: ApplicationVault | undefined = native && vaults ? {
        state: vaultState,
        choose() { guard(); setChooserError(''); setChoosingVault(true); },
        async open(root) {
          guard(); openQuery?.abort(); openQuery = new AbortController();
          const request = ++opening, next = await vaults.acquire(root, openQuery.signal);
          if (!mounted || request !== opening) { next.release(); return; }
          vaultRoots.set(props.nodeKey, next.root);
          const previous = selectedVault(); setSelectedVault(next); previous?.release(); await next.refresh();
        },
        close() { guard(); opening++; openQuery?.abort(); const previous = selectedVault(); setSelectedVault(undefined); vaultRoots.delete(props.nodeKey); previous?.release(); },
        async refresh() { await lease().refresh(true); },
        async openFile(location) { const v = lease(); await v.refresh(); v.requireFile(location); const id = await native.open(location); if (mounted) openDocument(id); await v.refresh(); },
        async createDocument(folder, filename, title) {
          const v = lease(), destination = {folder, filename}; destinationIn(v, destination);
          await v.mutate(async () => {
            guard();
            const {document} = createFormattedDocument('page');
            const {folder: _folder, filename: _filename, ...metadata} = document.metadata as Record<string, unknown>;
            document.metadata = {...metadata, title: title.trim() || 'Untitled', tags: []};
            const state = editor.repository.readState(), root = state.rootPlacementKey;
            const banks = state.contents[state.placements[root].contentKey].children.filter(k => state.contents[state.placements[k].contentKey].viewType === 'workspace-object-bank-block');
            if (banks.length !== 1) throw new Error('Canonical object bank missing or ambiguous');
            editor.commands.insert(document, {kind: 'at', parentKey: banks[0], index: editor.commands.childrenOf(banks[0]).length});
            const id = String(metadata.documentId); native.trackCandidate(id); openDocument(id);
            await native.save(id, destination);
          });
        },
        async importMarkdown(source, destination) {
          const v = lease(); destinationIn(v, destination);
          if (!v.snapshot().markdown.includes(vaultPath(source))) throw new Error('Choose a discovered standalone Markdown file');
          if (vaultPath(destination).replace(/\.mutable\.json$/, '.md') === vaultPath(source)) throw new Error('Choose a new destination to preserve the imported Markdown source');
          await v.mutate(async () => { const id = await native.open(source, true); if (mounted) openDocument(id); await native.save(id, destination); });
        },
        async createDirectory(parent, name) { const v = lease(); v.requireDirectory(parent); vaultLeaf(name); await v.mutate(() => native.createVaultDirectory(v.root, parent === '.' ? name : `${parent}/${name}`)); },
        async relocateDocument(source, destination) { const v = lease(); v.requireFile(source); destinationIn(v, destination); await v.relocate('pair', vaultPath(source), vaultPath(destination)); },
        async relocateDirectory(source, destination) {
          const v = lease(); v.requireDirectory(source);
          const parts = destination.split('/'), name = parts.pop()!; vaultLeaf(name); v.requireDirectory(parts.join('/') || '.');
          if (source === v.root || vaultContains(source, destination)) throw new Error('Cannot move the vault root or a directory inside itself');
          await v.relocate('directory', source, destination);
        },
        async recoverOperation(id) { const v = lease(); if (!v.operations().some(o => o.operationId === id && o.phase === 'pending')) throw new Error('Refresh to find a pending operation'); await v.recover(id); },
        async recoverNative(location) { const v = lease(), row = v.requireFile(location); await v.mutate(() => native.recover(row.resourceId, location)); },
      } : undefined;
      const activation = native ? new SavedResultActivation(editor,native,lease,guard) : undefined;
      onCleanup(()=>activation?.dispose());
      const knowledgeHost: KnowledgeHost = {
        vault: lease, guard,
        active: () => { const key = activeTab(), documentId = activeId(), projection = key && liveViews.get(key); return documentId && projection ? {documentId, projection} : undefined; },
        async activateSaved(target,passage,evidence,current,query) {
          const ticket=await activation!.prepare(evidence,current);
          const live=await observeLive(editor.repository,target.documentId,{version:1,opaqueTypes:editor.registry.typesWithCapability('opaque-widget')},{check:()=>{if(!ticket.current())throw Error('Selected activation expired');}});
          if(live.facts.id!==target.documentId||live.facts.rootBlockId!==evidence.rootBlockId||target.blockId!==evidence.rootBlockId)throw Error('Selected root identity changed');
          const block=passage&&live.facts.blocks.filter(b=>b.id===passage.blockId);
          const source=passage?block?.length===1&&block[0].text:{coordinate:'utf16' as const,runs:[{text:live.facts.title}]};
          if(!source||passage&&source.coordinate!==passage.coordinate)throw Error('Selected passage missing or unsupported');
          const matches=await runSearchWorker([{...source,contentKey:'selected',version:0}],query,{});
          if(!matches[0]?.matches.some(m=>m.actionable&&(!passage||m.start===passage.start&&m.end===passage.end))||!ticket.current())throw Error('Selected passage changed');
          await knowledgeHost.navigate(target,passage,ticket.current,ticket.verify);
        },
        async navigate(target, passage, current, verify) {
          guard(); if(!current()) throw new Error('Navigation is stale');
          // Resolve only this application instance's occurrence, never a global first match.
          openDocument(target.documentId, true);
          await new Promise(resolve=>setTimeout(resolve,0));
          await verify?.();
          guard(); if(!current()||activeId()!==target.documentId) throw new Error('Navigation was superseded');
          const view=liveViews.get(activeTab()!); if(!view) throw new Error('Document occurrence is unavailable');
          const nodes=Object.values(view.state.nodes);
          const candidates=passage?nodes.filter(n=>(passage.contentKey===undefined||n.contentKey===passage.contentKey)&&n.payload.id===passage.blockId&&editor.blockQueries.ancestorPath(n.key).filter(a=>a.viewType==='document-block').at(-1)?.key===view.state.rootKey):nodes.filter(n=>n.payload.id===target.blockId);
          if(candidates.length!==1)throw new Error('Block identity is missing or ambiguous in this occurrence');
          const node=passage?candidates[0]:nodes.find(n=>['standoff-editor-block','text-block','plain-text-block'].includes(n.viewType)&&editor.blockQueries.ancestorPath(n.key).filter(a=>a.viewType==='document-block').at(-1)?.key===view.state.rootKey)??candidates[0];
          const range={nodeKey:node.key,contentKey:node.contentKey,placementKey:node.placementKey,version:editor.repository.state.contents[node.contentKey].inlineRevision,start:passage?.start??0,end:passage?.end??0,coordinate:passage?.coordinate??'cell' as const};
          const stillCurrent=()=>mounted&&current()&&liveViews.get(activeTab()!)===view&&activeId()===target.documentId;
          const revealed=await revealMatch(editor,{id:'flint-navigation',text:'',context:'',captures:[],ranges:[range],path:editor.blockQueries.ancestorPath(node.key).map(n=>n.key),breadcrumb:'',capabilities:{highlight:false,reveal:true,annotate:false,replace:false}},stillCurrent);
          await verify?.();
          if(!revealed||!stillCurrent())throw new Error('Passage is stale or cannot currently be revealed');
          editor.focus.request(node.key,{reason:'flint-navigation'});
          const mount=editor.mounts.get(node.key);
          if(range.coordinate==='cell'&&mount?.restoreInlineSelection){mount.restoreInlineSelection({anchor:range.start,head:range.end});editor.selections.setPrimary(node.key,node.contentKey,node.viewId,range.start,range.end);}
          else if(mount?.restoreSelection)mount.restoreSelection({start:range.start,end:range.end,direction:'forward'});
        },
      };
      const facts = factsHost ? new FactsQueryProvider(factsHost) : undefined;
      createEffect(() => { const vault=selectedVault(); untrack(() => facts?.use(vault)); });
      const knowledge = native ? new VaultKnowledge(editor, native, knowledgeHost, undefined, facts) : undefined;
      // In Facts mode the legacy reader is used only for host-side activation validation.
      // It has no subscriptions, cached query scans or parallel background query path.
      const canonical = native ? new CanonicalBacklinks(editor.repository, native, lease, type => editor.registry.hasCapability(type, 'opaque-widget')) : undefined;
      const backlinkService = facts ? new FactsBacklinks(facts, lease) : canonical;
      const backlinks: ApplicationBacklinks | undefined = backlinkService ? {
        service: backlinkService,
        target() { const v = selectedVault(), id = activeId(), doc = id && resolve(id); if (!v || !doc || !id) return; return {vault: v.root, target: {documentId: id, blockId: String(editor.repository.state.contents[doc.contentKey].payload.id)}}; },
        async follow(result, mention, signal) {
          guard();
          const saved=backlinkService instanceof FactsBacklinks ? backlinkService.savedSource(result,mention.source.documentId) : undefined;
          if(saved){
            if(!result.mentions.includes(mention))throw Error('Backlink is not a member of this result');
            const ticket=await activation!.prepare(saved,()=>backlinkService.current(result),signal);
            const resolved=await canonical!.resolveDerived(result,mention,ticket.current,signal);guard();
            await knowledgeHost.navigate(resolved.target,resolved.passage,ticket.current,ticket.verify);return;
          }
          const resolved = await (facts ? canonical!.resolveDerived(result, mention, () => backlinkService.current(result), signal) : canonical!.resolve(result, mention, signal)); guard();
          await knowledgeHost.navigate(resolved.target, resolved.passage, () => !signal?.aborted && backlinkService.current(result));
        },
      } : undefined;
      onCleanup(()=>{ knowledge?.dispose(); backlinkService?.dispose(); canonical?.dispose(); facts?.dispose(); });
      onMount(() => { const root = vaultRoots.get(props.nodeKey); if (root && vault) void vault.open(root).catch(() => { vaultRoots.delete(props.nodeKey); }); });
      const files = native ? {
        list: (folder: string) => { selectedVault()?.requireDirectory(folder); return native.list(folder); },
        async open(location: {folder: string; filename: string}, importMarkdown = false) {
          guard(); const v = selectedVault();
          if (v) { await v.refresh(); if (importMarkdown) throw new Error('Use the vault import controls to choose a fresh destination'); v.requireFile(location); }
          const id = await native.open(location, importMarkdown); guard();
          openDocument(id);
        },
        async save(location: VaultLocation) {
          guard(); const id = requireId(), lease = selectedVault(), destination = native.isCandidate(id) ? location : native.location(id) ?? location;
          if (lease) { lease.requireDirectory(destination.folder); await lease.mutate(() => native.save(id, destination)); }
          else await native.save(id, location);
        },
        async recover(location: {folder: string; filename: string}) { guard(); if (selectedVault()) await vault!.recoverNative(location); else await native.recover(activeId(), location); },
        compare() { guard(); return native.compare(requireId()); },
        async keepMutable() { guard(); await native.keepMutable(requireId()); },
        status: () => native.status(activeId()), location: () => native.location(activeId()),
      } : undefined;
      return <><Show when={choosingVault()}><DocumentBrowser mode="directory" initialLocation={{folder:selectedVault()?.root??'.',filename:''}} busy={chooserBusy()} error={chooserError()} onClose={()=>setChoosingVault(false)} onChoose={async location=>{setChooserBusy(true);setChooserError('');try{await vault!.open(location.folder);if(mounted)setChoosingVault(false);return true;}catch(e){if(mounted)setChooserError(String(e));return false;}finally{if(mounted)setChooserBusy(false);}}}/></Show><div ref={root} tabIndex={-1} data-block-type={definition.type} data-runtime-key={props.nodeKey}>
        <Dynamic component={definition.view} application={{
          documents: () => documents().map(({ id, title }) => ({ id, title })), tabs, files, vault, properties, knowledge, backlinks,
          setProperties(id, value) {
            guard(); const doc = resolve(id); if (!doc?.placement) throw new Error('Document unavailable');
            if (tagsOf(id) === undefined) throw new Error('Existing tags payload is incompatible; it has been preserved');
            const tags = [...new Set(value.tags.map(t => t.trim()).filter(Boolean))];
            if (tags.length > 32 || tags.some(t => t.length > 64 || /[\r\n]/.test(t))) throw new Error('Use at most 32 tags, each at most 64 characters on one line');
            if (!value.title.trim()) throw new Error('Title must not be empty');
            const metadata = editor.repository.readState().contents[doc.contentKey].payload.metadata as object;
            editor.commands.setPayloadField(doc.placement, 'metadata', {...metadata, title: value.title.trim(), tags}, 'Edit Document properties');
          },
          openDocument,
          renameDocument(id: string, title: string) {
            guard(); const doc = resolve(id); if (!doc?.placement || !title.trim()) return;
            const content = editor.repository.readState().contents[doc.contentKey];
            editor.commands.setPayloadField(doc.placement, "metadata", { ...(content.payload.metadata as object), title: title.trim() }, "Rename Document");
          },
          closeActiveTab() { guard(); const key = activeTab(); if (key) { if(navigation.tabs.has(key)){navigation.tabs.delete(key);navigation.active=undefined;setNavigationRevision(n=>n+1);}else editor.commands.remove(key); bookmarks.delete(key); const r = row(); if (r) editor.setViewChild(r.key, r.children[0]); } },
        }} />
      </div></>;
    };
    scope.own(editor.registry.register({ type: definition.type, capabilities: ["container"], view: props => <Show when={scope.active()}><Instance nodeKey={props.nodeKey} /></Show> }, scope.owner));
    scope.own(editor.commandRegistry.register({ id: "flint.open", label: "Open Flint", canExecute: () => editor.repository.state.contents[editor.repository.state.placements[editor.repository.state.rootPlacementKey].contentKey].viewType === "workspace-block", execute() {
      requireActive();
      const root = editor.repository.state.rootPlacementKey;
      const existing = catalog();
      const examples: ExistingBlockDto[] = existing.length ? [] : ["Notes", "Ideas"].map(title => { const id = crypto.randomUUID(); return { id, type: "document-block", metadata: { documentId: id, title, folder: ".", filename: `${id}.json` }, children: [{ id: crypto.randomUUID(), type: "standoff-editor-block", text: `${title} — write here.` }, { id: crypto.randomUUID(), type: "standoff-editor-block", text: "An ordinary Codex Document, shared across its views." }] }; });
      const initialTabs = existing.length ? existing.map(d => ({ id: d.id, title: d.title })) : examples.map(d => ({ id: (d.metadata as any).documentId as string, title: (d.metadata as any).title as string }));
      const state = editor.repository.readState(), rootContent = state.contents[state.placements[root].contentKey];
      const banks = rootContent.children.filter(key => state.contents[state.placements[key].contentKey].viewType === "workspace-object-bank-block");
      if (banks.length > 1) throw new Error("Ambiguous workspace object bank.");
      const desktopParent = rootContent.children.find(key => ["image-background-block", "video-background-block", "youtube-video-background-block", "canvas-background-block"].includes(state.contents[state.placements[key].contentKey].viewType)) ?? root;
      const zIndex = Math.max(0, ...Object.values(state.contents).filter(c => ["window-block", "document-window-block"].includes(c.viewType)).map(c => Number((c.payload.metadata as any)?.zIndex) || 0)) + 1;
      editor.commands.transaction("Open Flint", () => {
        const bank = banks[0] ?? editor.commands.insert({ id: crypto.randomUUID(), type: "workspace-object-bank-block", children: [] }, { kind: "at", parentKey: root, index: editor.commands.childrenOf(root).length });
        for (const document of examples) editor.commands.insert(document, { kind: "at", parentKey: bank, index: editor.commands.childrenOf(bank).length });
        editor.commands.insert({ id: crypto.randomUUID(), type: "window-block", metadata: { title: "Flint", position: { x: 35 + (zIndex - 1) * 24, y: 35 + (zIndex - 1) * 24 }, size: { w: 1040, h: 720 }, zIndex }, children: [definition.create(initialTabs.slice(0, 2))] }, { kind: "at", parentKey: desktopParent, index: 0 });
      });
    } }, scope.owner));
  } };
}
