/** Finite A0 browser qualification. Imported only by the qualification runner.
 * All domain data and Entity responses are in memory; no backend is used. */
import { render } from "solid-js/web";
import { WorkspaceSession } from "./workspace-session";
import { WorkspacePresentationView } from "./workspace-presentation-view";
import { materializeLocalWorkspace } from "../reactive-editor/workspace-manifest";
import { createEntityReferencesFeature } from "../features/entity-references";
import { annotationCapabilities } from "./annotation-capabilities";
import { openEntitySearch } from "../features/entity-references/entity-search";
import { DocumentDialog } from "../demo/document-dialog";
import { CodexSystemBar } from "../demo/codex-system-bar";
import { createSignal, Show } from "solid-js";
import { unwrap } from "solid-js/store";
import type { AnnotationCapabilities } from "../feature-api";
import type { CanonicalEntity, EntityService } from "../feature-api/entities";
import "../index.css";
import "../demo/workspace-demo.css";

const settle = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
function assert(value: unknown, label: string): asserts value { if (!value) throw Error(label); }

export async function qualifyWindowManager() {
  const checks: string[] = [];
  const check = (value: unknown, label: string) => { assert(value, label); checks.push(label); };
  const blockedRequests: string[] = [], originalFetch = window.fetch;
  // No request can reach a running application backend, including background reads.
  window.fetch = (async (input: RequestInfo | URL) => {
    blockedRequests.push(String(input)); return new Response(JSON.stringify({ Success: false, Error: "A0 fixture: no backend" }), { status: 503, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  const host = document.body.appendChild(document.createElement("main"));
  host.className = "workspace-demo workspace-demo--canonical workspace-demo--system-bar";
  host.dataset.windowWorkArea = "";
  const session = new WorkspaceSession(materializeLocalWorkspace({ id: "workspace", type: "workspace-block", children: [
    { id: "background", type: "canvas-background-block", children: [] },
  ] }), { features: { entityReferences: false, flintMaterialChrome: false, flintProbe: false } });
  const { editor, projection, windowManager: manager } = session;
  assert(manager, "manager available");
  let api!: AnnotationCapabilities, finishCreate: ((entity: CanonicalEntity) => void) | undefined;
  const entity: CanonicalEntity = { id: "fixture-entity", name: "Fixture Entity", revision: 1, aliases: [] };
  const service: EntityService = {
    names: async () => [], dbMentions: async () => [], summaries: async () => ({ rows: [], complete: true, diagnostics: [] }),
    search: async () => ({ candidates: [], complete: true, diagnostics: [], current() {} }),
    get: async () => entity, create: () => new Promise(resolve => { finishCreate = resolve; }),
    rename: async () => entity, alias: async () => entity, dispose() {},
  };
  editor.featureHost.activate(createEntityReferencesFeature(scope => {
    api = annotationCapabilities(editor, scope); api.entities = () => service; return api;
  }));
  const [modal, setModal] = createSignal(false);
  const stop = render(() => <><CodexSystemBar><button role="menuitem">A0 fixture</button></CodexSystemBar><WorkspacePresentationView session={session} /><Show when={modal()}>
    <DocumentDialog title="A0 workspace modal" onClose={() => setModal(false)}><input aria-label="Modal input" /></DocumentDialog>
  </Show></>, host);
  const stopInput = editor.installGateway(document);
  try {
    await editor.commandRegistry.execute("flint.open", { targetKey: projection.state.rootKey, args: undefined });
    await settle();
    const app = Object.values(projection.state.nodes).find(n => n.viewType === "flint-application-block")!;
    const win = editor.blockQueries.ancestors(app.key).find(n => n.viewType === "window-block")!;
    editor.commands.setPayloadField(win.key, "metadata", { ...unwrap(win.payload.metadata as object), state: "maximized", zIndex: 999999999 });
    await settle();
    const flint = document.querySelector<HTMLElement>(".flint-application")!.closest<HTMLElement>(".reactive-window")!;
    check(flint.classList.contains("reactive-window--maximized"), "Flint is maximized");
    const text = [...editor.projections.values()].flatMap(v => Object.values(v.state.nodes))
      .find(n => n.viewType === "standoff-editor-block" && editor.mounts.get(n.key)?.root.closest(".flint-application"))!;
    assert(text, "Flint editor occurrence is mounted");
    editor.mounts.get(text.key)!.focus();
    editor.mounts.get(text.key)!.restoreInlineSelection?.({ anchor: 2, head: 2 });
    const orderBeforeTyping = manager.registry.revision();
    const beforeTyping = editor.repository.state.revision;
    let snapshots = 0, registrations = 0, ownerLookups = 0;
    const snapshot = editor.repository.snapshot, register = manager.registry.registerWindow, ownerLookup = manager.ownerForNode;
    editor.repository.snapshot = function (...args) { snapshots++; return snapshot.apply(this, args); };
    manager.registry.registerWindow = function (...args) { registrations++; return register.apply(this, args); };
    manager.ownerForNode = function (...args) { ownerLookups++; return ownerLookup.apply(this, args); };
    try {
      editor.mounts.get(text.key)!.focusElement.dispatchEvent(new InputEvent("beforeinput", { inputType: "insertText", data: "x", bubbles: true, cancelable: true }));
      await settle();
      check(editor.repository.state.revision > beforeTyping, "one real Flint beforeinput edit commits");
      check(manager.registry.revision() === orderBeforeTyping && snapshots === 0 && registrations === 0 && ownerLookups === 0, "Flint typing does no window registry, snapshot or owner-lookup work");
    } finally {
      editor.repository.snapshot = snapshot; manager.registry.registerWindow = register; manager.ownerForNode = ownerLookup;
    }
    openEntitySearch(api, [{ nodeKey: text.key, start: 0, end: 5 }]);
    await settle();
    const tool = document.querySelector<HTMLElement>('[aria-label="Link Entity Reference"]')!;
    assert(tool, "real Entity tool is mounted");
    check(tool.closest<HTMLElement>("[data-mwm-window]")?.dataset.mwmWindow === win.key, "Entity portal belongs to Flint's window group");
    const choose = (label: string) => {
      const button = [...tool.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === label);
      assert(button, `button ${label}`); button.click();
    };
    choose("+ Create Entity"); choose("Create and link");
    assert(finishCreate, "in-memory creation was dispatched");
    // Existing recovery branch retains the actual tool during unrelated changes.
    editor.commands.setPayloadField(text.key, "metadata", { qualification: true });
    finishCreate(entity); await settle();
    check(tool.isConnected && tool.textContent?.includes("Created but not linked"), "Entity recovery tool remains mounted");
    const openThesis = () => editor.commandRegistry.execute("thesis.open", { targetKey: projection.state.rootKey, args: undefined });
    await openThesis(); await settle();
    const thesis = document.querySelector<HTMLElement>(".thesis-host")!.closest<HTMLElement>(".reactive-window")!;
    assert(thesis, "real Thesis window mounted");
    check(tool.isConnected, "stacking proof retains the Entity tool");
    const ownerAt = (x: number, y: number) => document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-mwm-window]")?.dataset.mwmWindow;
    const thesisOwner = thesis.closest<HTMLElement>("[data-mwm-window]")!.dataset.mwmWindow;
    const t = thesis.getBoundingClientRect(), e = tool.getBoundingClientRect();
    check(t.left === 55 && t.top === 98, "normal window retains the canonical desktop coordinate origin");
    const x = Math.max(t.left, e.left) + 35, y = Math.max(t.top, e.top) + 100;
    const ancestors = (element: HTMLElement) => { const rows = []; for (let n: HTMLElement | null = element; n; n = n.parentElement) { const css = getComputedStyle(n); rows.push({ tag: n.tagName, class: n.className, y: n.getBoundingClientRect().y, position: css.position, top: css.top, transform: css.transform }); } return rows; };
    assert(x < Math.min(t.right, e.right) && y < Math.min(t.bottom, e.bottom), `Thesis/Entity overlap: ${JSON.stringify({ thesis: t.toJSON(), entity: e.toJSON(), ancestry: ancestors(thesis) })}`);
    checks.push("Thesis and Entity tool actually overlap");
    check(ownerAt(x, y) === thesisOwner, "hit-testing selects Thesis above maximized Flint and Entity tool");
    check(flint.classList.contains("reactive-window--maximized"), "opening Thesis does not de-maximize Flint");
    const sourceRevision = editor.repository.state.revision, saved = JSON.stringify(editor.encodeWorkspace());
    manager.raisePlacement(win.placementKey); await settle();
    check(ownerAt(x, y) === win.key, "raising Flint brings its tool group above Thesis");
    check(editor.repository.state.revision === sourceRevision && JSON.stringify(editor.encodeWorkspace()) === saved, "raising writes neither content nor workspace JSON");
    flint.querySelector<HTMLButtonElement>('[aria-label="Open files"]')!.click(); await settle();
    const sheet = flint.querySelector<HTMLElement>('[aria-label="Storage and recovery"]')!;
    assert(sheet, "Flint storage dialog is mounted");
    check(manager.registry.windows[win.key].ownerModalCount === 1, "inline storage dialog registers its application owner");
    const s = sheet.getBoundingClientRect();
    check(sheet.contains(document.elementFromPoint(s.left + 30, s.top + 30)), "Flint storage dialog appears above its existing Entity tool");
    [...sheet.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === "Close storage")!.click(); await settle();
    check(manager.registry.windows[win.key].ownerModalCount === 0 && tool.isConnected, "closing storage releases only its surface lease");
    await openThesis(); await settle();
    const theses = [...document.querySelectorAll<HTMLElement>(".thesis-host")];
    const latest = theses.at(-1)!.closest<HTMLElement>("[data-mwm-window]")!;
    check(manager.registry.windows[latest.dataset.mwmWindow!].rank === manager.count(), "consecutive launches use central order");
    setModal(true); await settle();
    const dialog = document.querySelector<HTMLElement>('[aria-labelledby][role="dialog"]')!;
    assert(dialog, "workspace dialog mounted");
    const d = dialog.getBoundingClientRect();
    check(dialog.contains(document.elementFromPoint(d.left + 30, d.top + 30)), "workspace modal is above every window group");
    setModal(false); await settle();
    const pinnedPlacement = editor.commands.insert({ id: "pin", type: "window-block", metadata: { title: "Pinned", pinned: true, position: { x: 0, y: -48 }, size: { w: 1400, h: 900 } }, children: [{ type: "plain-text-block", text: "Pinned fixture" }] }, { kind: "at", parentKey: projection.state.rootKey, index: 0 });
    await settle(); await openThesis(); await settle();
    const pin = projection.nodeForPlacement(pinnedPlacement)!;
    check(ownerAt(140, 180) === pin.key, "pinned group remains above newly launched normal windows");
    check(!!document.elementFromPoint(140, 14)?.closest(".codex-system-bar"), "system chrome stays above an overlapping pinned window");
    setModal(true); await settle();
    const pinnedDialog = document.querySelector<HTMLElement>('[aria-labelledby][role="dialog"]')!, pd = pinnedDialog.getBoundingClientRect();
    check(pinnedDialog.contains(document.elementFromPoint(pd.left + 30, pd.top + 30)), "workspace modal stays above an overlapping pinned window");
    setModal(false); await settle();
    editor.closeView(pin.key); editor.closeView(win.key); await settle();
    check(!tool.isConnected && !manager.registry.windows[win.key], "owner close removes group and its Entity portal");
    check(!Object.values(manager.registry.surfaces).some(s => s.ownerWindowId === win.key), "owner close releases surface ownership");
    return { checks, blockedBackendRequests: blockedRequests.length, userAgent: navigator.userAgent };
  } finally {
    stopInput(); stop(); session.dispose(); host.remove(); window.fetch = originalFetch;
  }
}
