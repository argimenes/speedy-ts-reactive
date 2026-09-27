// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkspaceSession } from "./workspace-session";
import { workspaceOpen } from "./workspace-open";
import { createInitialWorkspace } from "./initial-workspace";
import { createWorkspaceSaveBundle, materializeLocalWorkspace, materializeWorkspace } from "../reactive-editor/workspace-manifest";
import { featureFlags } from "../configuration";
import { decodeSpatial, starterLayout } from "../features/spatial/model";
import type { ExistingBlockDto } from "../block-tree/types";
const sessions: WorkspaceSession[] = [];
afterEach(() => { sessions.splice(0).forEach(s => s.dispose()); vi.unstubAllGlobals(); });
const doc = (): ExistingBlockDto => ({ id: "doc", type: "document-block", metadata: { documentId: "doc", folder: ".", filename: "Shared.json" }, children: [{ id: "text", type: "plain-text-block", text: "Shared original" }] });
const fixture = (): ExistingBlockDto => ({ id: "work", type: "workspace-block", children: [0, 1].map(i => ({ id: `window-${i}`, type: "document-window-block", metadata: { title: `Document ${i}`, position: { x: i * 900, y: 17 }, size: { w: 840, h: 620 } }, children: [doc()] })) });
function open(dto = fixture(), canvas = false, spatial = true) {
  const s = new WorkspaceSession(materializeLocalWorkspace(dto), { features: { canvasWorkspace: canvas, spatialWorkspace: spatial } }); sessions.push(s); return s;
}
describe("Spatial application boundary", () => {
  it("defaults off; exposes independent availability across all four flag combinations", () => {
    expect(featureFlags.spatialWorkspace).toBe(false);
    for (const canvas of [false, true]) for (const spatial of [false, true]) {
      const s = open(fixture(), canvas, spatial);
      expect(s.presentation.enabled).toBe(canvas || spatial);
      expect(s.selectPresentation("spatial")).toBe(spatial);
      if (spatial) expect(s.spatial!.layout()!.placements).toHaveLength(2);
      expect(s.selectPresentation("canvas")).toBe(canvas);
    }
  });
  it("creates physical starter placements deterministically without consulting existing geometry", () => {
    const a = open(), dto = fixture(); (dto.children![0].metadata as any).position.x = 99999;
    const b = open(dto), before = a.editor.repository.snapshot();
    expect(a.selectPresentation("spatial")).toBe(true); expect(b.selectPresentation("spatial")).toBe(true);
    expect(a.spatial!.layout()).toEqual(b.spatial!.layout());
    expect(a.spatial!.layout()!.placements[0].size).toEqual({ width: .21, height: .297 });
    expect(a.editor.repository.snapshot()).toEqual(before);
    expect(a.presentation.read()!.presentations.canvas).toBeUndefined();
    expect(() => a.spatial!.create()).toThrow("already exists");
  });
  it("starts empty, opens into the bank and never reconstructs the session", () => {
    const s = open(createInitialWorkspace()), projection = s.projection; s.selectPresentation("spatial");
    expect(s.spatial!.objects()).toEqual([]); const desktop = s.editor.persistence.captureWorkspace().document.children![0];
    workspaceOpen(s).newDocument(); workspaceOpen(s).image("/image.png");
    expect(s.projection).toBe(projection); expect(s.spatial!.objects().map(o => o.kind)).toEqual(["document", "image"]);
    const saved = s.editor.persistence.captureWorkspace().document;
    expect(saved.children![0]).toEqual(desktop); expect(saved.children![1].type).toBe("workspace-object-bank-block");
    expect(s.spatial!.layout()!.placements).toHaveLength(2);
  });
  it("keeps content, all three layouts and unknown fields independent through local and manifest round-trip", async () => {
    const s = open(fixture(), true); s.selectPresentation("canvas"); const canvas = s.presentation.read()!.presentations.canvas;
    s.selectPresentation("spatial");
    const raw = s.spatial!.layout()!; raw.future = { retained: [7] }; raw.camera.future = "camera"; raw.placements[0].future = "placement";
    s.presentation.updateSpatial(raw); const before = s.editor.repository.snapshot();
    s.spatial!.camera({ kind: "orthographic", yaw: .3, approach: .4 });
    expect(s.editor.repository.snapshot()).toEqual(before); expect(s.presentation.read()!.presentations.canvas).toEqual(canvas);
    const captured = s.editor.persistence.captureWorkspace(), bundle = await createWorkspaceSaveBundle(captured.repository, [], "workspace", captured.presentation);
    expect(bundle.documents).toHaveLength(1);
    const local = open(JSON.parse(JSON.stringify(captured.document)), true);
    const server = new WorkspaceSession(materializeWorkspace(bundle.manifest, new Map(bundle.documents.map(d => [d.documentId, d.document]))), { features: { spatialWorkspace: true } }); sessions.push(server);
    for (const next of [local, server]) {
      expect(next.presentation.active()).toBe("spatial"); expect(next.spatial!.layout()).toEqual(s.spatial!.layout());
      const docs = Object.values(next.editor.repository.state.contents).filter(c => c.viewType === "document-block"); expect(docs).toHaveLength(1);
    }
    s.presentation.markSaved(captured.presentation!); expect(s.presentation.dirty()).toBe(false);
    s.spatial!.camera({ ...s.spatial!.layout()!.camera, yaw: .4 }); s.presentation.markSaved(captured.presentation!); expect(s.presentation.dirty()).toBe(true);
  });
  it.each([false, true])("preserves unavailable or future Spatial data while editing Desktop (enabled=%s)", enabled => {
    const dto = fixture(), spatial = { version: 99, environment: "future", payload: [1, { a: true }] };
    dto.metadata = { workspacePresentation: { version: 1, active: "spatial", objects: [], presentations: { desktop: { version: 1, kind: "legacy-tree" }, spatial } } };
    const s = open(dto, true, enabled); expect(s.presentation.active()).toBe("desktop"); expect(s.presentation.issue()).toContain("preserved");
    const node = Object.values(s.projection.state.nodes).find(n => n.payload.id === "text")!; s.editor.commands.setPayloadField(node.key, "text", "Changed");
    expect((s.editor.persistence.captureWorkspace().document.metadata as any).workspacePresentation).toEqual((dto.metadata as any).workspacePresentation);
    expect(s.selectPresentation("spatial")).toBe(false);
    s.selectPresentation("canvas"); expect(s.presentation.read()!.presentations.spatial).toEqual(spatial);
  });
  it("retains missing/ambiguous identity placeholders and rejects conflicting local document identity", () => {
    const s = open(); s.selectPresentation("spatial"); const first = s.resolveObjects()[0];
    const node = s.projection.nodeForPlacement(first.placementKeys[0])!; s.editor.commands.remove(node.key);
    expect(s.spatial!.objects()[0].reason).toBe("missing");
    const dto = fixture(); dto.children![1].children![0].children![0].text = "Conflicting";
    expect(() => open(dto)).toThrow();
  });
  it("reuses a live server Document, its source and unsaved edits without changing Desktop or Canvas geometry", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ Success: true, Data: { document: doc() } })) ); vi.stubGlobal("fetch", fetch);
    const s = open(createInitialWorkspace(), true); const actions = workspaceOpen(s), signal = new AbortController().signal, location = { folder: ".", filename: "Study.json" };
    const placement = await actions.serverDocument(location, signal); s.selectPresentation("canvas"); s.selectPresentation("spatial");
    const node = Object.values(s.projection.state.nodes).find(n => n.payload.id === "text")!; s.editor.commands.setPayloadField(node.key, "text", "Unsaved");
    const before = s.editor.repository.snapshot(), canvas = s.presentation.read()!.presentations.canvas;
    expect(await actions.serverDocument(location, signal)).toBe(placement); expect(fetch).toHaveBeenCalledTimes(1);
    expect(s.editor.repository.snapshot()).toEqual(before); expect(s.presentation.read()!.presentations.canvas).toEqual(canvas);
    expect(s.editor.persistence.workspaceReference("doc")?.source.filename).toBe("Study.json");
    await expect(actions.serverDocument({ ...location, filename: "Conflict.json" }, signal)).rejects.toThrow("different server file");
  });
  it("reopening reuses the directory entry mapped to an explicitly derived Desktop host", async () => {
    const s = open(createInitialWorkspace(), true), actions = workspaceOpen(s), location = { folder: ".", filename: "Shared.json" }, signal = new AbortController().signal;
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ Success: true, Data: { document: doc() } }))));
    const placement = await actions.serverDocument(location, signal); s.selectPresentation("spatial");
    const value = s.presentation.read()!, hostId = s.editor.repository.state.contents[s.editor.repository.state.placements[placement].contentKey].payload.id as string;
    const object = { ...value.objects[0], target: { kind: "document" as const, documentId: "doc" }, desktopHostBlockId: hostId };
    s.presentation.updateSpatial(s.spatial!.layout(), [object]);
    expect(await actions.serverDocument(location, signal)).toBe(placement);
    expect(s.presentation.read()!.objects).toEqual([object]); expect(s.spatial!.layout()!.placements).toHaveLength(1);
  });
  it("leaves excess objects unplaced and does not replace an existing empty layout", () => {
    const s = open(createInitialWorkspace()); s.selectPresentation("spatial"); const empty = s.spatial!.layout()!;
    s.selectPresentation("desktop"); s.selectPresentation("spatial"); expect(s.spatial!.layout()).toEqual(empty);
    for (let i = 0; i < 11; i++) workspaceOpen(s).newDocument();
    expect(s.spatial!.objects()).toHaveLength(11); expect(s.spatial!.layout()!.placements).toHaveLength(8);
  });
  it("validates before adding content if retained Spatial data cannot be edited", () => {
    const s = open(); s.selectPresentation("spatial"); const before = s.editor.repository.snapshot();
    expect(() => s.presentation.updateSpatial({ ...s.spatial!.layout(), version: 20 })).toThrow();
    expect(s.editor.repository.snapshot()).toEqual(before);
  });
});


describe("Spatial live Document authorization", () => {
  it("authorizes one existing Window, retains shared content and never stores activation geometry", () => {
    const s = open(); s.selectPresentation("spatial"); const a = s.spatial!, before = s.editor.repository.snapshot(), layout = a.layout();
    expect(a.document.activate("block:window-0")).toBe(true);
    const root = a.activeRoot()!;
    expect(a.document.activate("block:window-1")).toBe(false);
    a.document.resize({ width: 750, height: 520 });
    expect(a.activeRoot()).toBe(root); expect(a.layout()).toEqual(layout); expect(s.editor.repository.snapshot()).toEqual(before);
    expect(Object.values(s.editor.repository.state.contents).filter(c => c.viewType === "document-block")).toHaveLength(1);
    expect(a.document.requestReturn(a.document.release)).toBe(true); expect(a.activeRoot()).toBeUndefined();
    expect(a.document.activate("block:window-1")).toBe(true);
  });
  it("rejects unsafe shapes and revokes a removed root without rebinding", () => {
    const dto = fixture(); dto.children![1].children![0].children!.push({ type: "portal-block", id: "portal" });
    // Both shared copies must describe identical content.
    dto.children![0].children = structuredClone(dto.children![1].children);
    const unsafe = open(dto); unsafe.selectPresentation("spatial"); expect(unsafe.spatial!.document.activate("block:window-0")).toBe(false);
    const s = open(); s.selectPresentation("spatial"); const a = s.spatial!;
    expect(a.document.activate("block:window-0")).toBe(true); s.editor.commands.remove(a.activeRoot()!.nodeKey);
    expect(a.activeRoot()).toBeUndefined(); expect(a.document.activate("block:window-0")).toBe(false);
    expect(a.document.activate("block:window-1")).toBe(true);
  });
  it("revalidates structural changes without replacing the editor or retaining an unsafe root", () => {
    const s = open(); s.selectPresentation("spatial"); const a = s.spatial!, editor = s.editor;
    a.document.activate("block:window-0"); const root = a.activeRoot()!;
    const child = editor.node(root.nodeKey)!.children[0];
    editor.commands.insert({ type: "portal-block", id: "later-portal" }, { kind: "at", parentKey: child, index: 1 });
    expect(a.activeRoot()).toBeUndefined(); expect(s.editor).toBe(editor);
    editor.repository.undo(); expect(a.activeRoot()).toBeUndefined();
    expect(a.document.activate("block:window-0")).toBe(true);
    a.document.release(); expect(a.activeRoot()).toBeUndefined();
  });
  it("defers return until composition reconciliation and cancels stale callbacks on disposal", async () => {
    const s = open(); s.selectPresentation("spatial"); s.installPresentationInput(window); vi.spyOn(s.editor.mounts, "resolveEvent").mockReturnValue({} as any); const a = s.spatial!;
    a.document.activate("block:window-0"); window.dispatchEvent(new CompositionEvent("compositionstart"));
    expect(a.document.requestReturn(a.document.release)).toBe(false); expect(a.activeRoot()).toBeDefined();
    window.dispatchEvent(new CompositionEvent("compositionend")); expect(a.activeRoot()).toBeDefined();
    await new Promise(resolve => setTimeout(resolve, 5)); expect(a.activeRoot()).toBeUndefined();
    a.document.activate("block:window-0"); window.dispatchEvent(new CompositionEvent("compositionstart"));
    const complete = vi.fn(); a.document.requestReturn(complete); window.dispatchEvent(new CompositionEvent("compositionend")); s.dispose();
    await new Promise(resolve => setTimeout(resolve, 5)); expect(complete).not.toHaveBeenCalled();
  });
});
