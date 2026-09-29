import { documentRootPlacements } from "../block-tree/resource-registration";
import { Show, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { Dynamic } from "solid-js/web";
import type { ReactiveEditor } from "../reactive-editor/editor";
import type { FeatureScope } from "../feature-api";
import type { DocumentApplicationCapabilities } from "../feature-api/document-application";
import type { ExistingBlockDto } from "../block-tree/types";
import { ChildBlocks } from "../rendering/block-outlet";
import { DocumentTabContext, tabDocumentTarget } from "../rendering/document-tab-context";
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
    const viewBookmarks = new Map<string, { placement: string; tabs: Map<string, DocumentViewBookmark> }>();
    scope.own(() => viewBookmarks.clear());
    scope.own(editor.repository.subscribeChanges(change => {
      if (change.inlineOwner || change.split || change.childrenOwner) return;
      for (const [key, value] of viewBookmarks) if (!editor.repository.state.placements[value.placement]) viewBookmarks.delete(key);
      scope.defer(() => { for (const value of viewBookmarks.values()) for (const key of value.tabs.keys()) if (!editor.node(key)) value.tabs.delete(key); });
    }));
    const Instance = (props: { nodeKey: string }) => {
      // Stage A hosts a Window application, never an application recursively inside a Document.
      if (editor.blockQueries.ancestors(props.nodeKey).some(n => n.viewType === "document-block")) return <p role="status">This application requires a Window outside a Document.</p>;
      const [revision, setRevision] = createSignal(0);
      // Text fast paths cannot change identity, membership or titles.
      onCleanup(editor.repository.subscribeChanges(change => { if (!change.inlineOwner && !change.split && !change.childrenOwner) setRevision(n => n + 1); }));
      const all = createMemo(() => { revision(); return catalog(); });
      const vault = () => {
        revision();
        const id = (editor.node(props.nodeKey)?.payload.metadata as any)?.vaultId;
        return Object.values(editor.repository.readState().contents).find(c => c.payload.id === id);
      };
      const documents = createMemo(() => {
        const members = (vault()?.payload.metadata as any)?.members;
        return all().filter(d => Array.isArray(members) && members.includes(d.id));
      });
      const resolve = (id: string) => {
        const matches = all().filter(d => d.id === id);
        return matches.length === 1 && documents().some(d => d.id === id) ? matches[0] : undefined;
      };
      const row = () => editor.node(props.nodeKey)?.children.map(key => editor.node(key)).find(n => n?.viewType === "tab-row-block");
      const bookmarks = viewBookmarks.get(props.nodeKey)?.tabs ?? new Map<string, DocumentViewBookmark>();
      viewBookmarks.set(props.nodeKey, { placement: editor.node(props.nodeKey)!.placementKey, tabs: bookmarks });
      const activeTab = () => { const r = row(); return r && (editor.viewChildren[r.key] ?? r.children.find(k => (editor.node(k)?.payload.metadata as any)?.active) ?? r.children[0]); };
      let root!: HTMLDivElement, mounted = true;
      const guard = () => { requireActive(); if (!mounted || !editor.node(props.nodeKey)) throw new Error("Document application instance is disposed"); };
      onMount(() => {
        const release = editor.mounts.register(props.nodeKey, { root, focusElement: root, inputPolicy: "container", focus: () => root.focus({ preventScroll: true }) });
        onCleanup(release);
      });
      onCleanup(() => { mounted = false; if (!editor.node(props.nodeKey)) viewBookmarks.delete(props.nodeKey); });
      const Target = (target: { documentId: string; tabKey: string }) => {
        const placement = () => resolve(target.documentId)?.placement;
        return <Show when={placement()} keyed fallback={<p role="status">Document unavailable: {target.documentId}. Its canonical source is missing or ambiguous.</p>}>{source =>
          <TransientDocumentView editor={editor} placement={source} bookmark={() => bookmarks.get(target.tabKey)} remember={value => bookmarks.set(target.tabKey, value)} />
        }</Show>;
      };
      const tabs = () => <DocumentTabContext.Provider value={{ title: id => resolve(id)?.title, view: Target }}><ChildBlocks parentKey={props.nodeKey} /></DocumentTabContext.Provider>;
      return <div ref={root} tabIndex={-1} data-block-type={definition.type} data-runtime-key={props.nodeKey}>
        <Dynamic component={definition.view} application={{
          documents: () => documents().map(({ id, title }) => ({ id, title })), tabs,
          openDocument(id: string) {
            guard(); const doc = resolve(id), r = row(); if (!doc?.placement || !r) return;
            let target = r.children.find(k => tabDocumentTarget(editor.node(k)?.payload.metadata) === id);
            if (!target) {
              const placement = editor.commands.insert({ id: crypto.randomUUID(), type: "tab-block", metadata: { name: doc.title, documentTarget: { version: 1, documentId: id } } }, { kind: "at", parentKey: r.key, index: r.children.length });
              target = editor.nodeForPlacementInView(placement, r.viewId)?.key;
            }
            if (target) editor.setViewChild(r.key, target);
          },
          renameDocument(id: string, title: string) {
            guard(); const doc = resolve(id); if (!doc?.placement || !title.trim()) return;
            const content = editor.repository.state.contents[doc.contentKey];
            editor.commands.setPayloadField(doc.placement, "metadata", { ...(content.payload.metadata as object), title: title.trim() }, "Rename Document");
          },
          closeActiveTab() { guard(); const key = activeTab(); if (key) { editor.commands.remove(key); bookmarks.delete(key); const r = row(); if (r) editor.setViewChild(r.key, r.children[0]); } },
        }} />
      </div>;
    };
    scope.own(editor.registry.register({ type: definition.type, capabilities: ["container"], view: props => <Show when={scope.active()}><Instance nodeKey={props.nodeKey} /></Show> }, scope.owner));
    scope.own(editor.commandRegistry.register({ id: "flint.open", label: "Open Flint", canExecute: () => editor.repository.state.contents[editor.repository.state.placements[editor.repository.state.rootPlacementKey].contentKey].viewType === "workspace-block", execute() {
      requireActive();
      const root = editor.repository.state.rootPlacementKey;
      const existing = catalog();
      const vaultId = crypto.randomUUID();
      const examples: ExistingBlockDto[] = existing.length ? [] : ["Notes", "Ideas"].map(title => { const id = crypto.randomUUID(); return { id, type: "document-block", metadata: { documentId: id, title, folder: ".", filename: `${id}.json` }, children: [{ id: crypto.randomUUID(), type: "standoff-editor-block", text: `${title} — write here.` }, { id: crypto.randomUUID(), type: "standoff-editor-block", text: "An ordinary Codex Document, shared across its views." }] }; });
      const members = existing.length ? existing.map(d => ({ id: d.id, title: d.title })) : examples.map(d => ({ id: (d.metadata as any).documentId as string, title: (d.metadata as any).title as string }));
      const state = editor.repository.readState(), rootContent = state.contents[state.placements[root].contentKey];
      const banks = rootContent.children.filter(key => state.contents[state.placements[key].contentKey].viewType === "workspace-object-bank-block");
      if (banks.length > 1) throw new Error("Ambiguous workspace object bank.");
      const desktopParent = rootContent.children.find(key => ["image-background-block", "video-background-block", "youtube-video-background-block", "canvas-background-block"].includes(state.contents[state.placements[key].contentKey].viewType)) ?? root;
      const zIndex = Math.max(0, ...Object.values(state.contents).filter(c => ["window-block", "document-window-block"].includes(c.viewType)).map(c => Number((c.payload.metadata as any)?.zIndex) || 0)) + 1;
      editor.commands.transaction("Open Flint", () => {
        const bank = banks[0] ?? editor.commands.insert({ id: crypto.randomUUID(), type: "workspace-object-bank-block", children: [] }, { kind: "at", parentKey: root, index: editor.commands.childrenOf(root).length });
        editor.commands.insert({ id: vaultId, type: "container-block", metadata: { title: "Flint vault", members: members.map(d => d.id) }, children: examples }, { kind: "at", parentKey: bank, index: editor.commands.childrenOf(bank).length });
        editor.commands.insert({ id: crypto.randomUUID(), type: "window-block", metadata: { title: "Flint", position: { x: 35 + (zIndex - 1) * 24, y: 35 + (zIndex - 1) * 24 }, size: { w: 1040, h: 720 }, zIndex }, children: [definition.create(vaultId, members.slice(0, 2))] }, { kind: "at", parentKey: desktopParent, index: 0 });
      });
    } }, scope.owner));
  } };
}
