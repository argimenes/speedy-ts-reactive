// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExistingBlockDto } from "../block-tree/types";
import { featureFlags } from "../configuration";
import { createWorkspaceSaveBundle, materializeLocalWorkspace, materializeWorkspace } from "../reactive-editor/workspace-manifest";
import type { WorkspacePresentation } from "../reactive-editor/workspace-presentation";
import { WorkspaceSession } from "./workspace-session";

const sessions: WorkspaceSession[] = [];
afterEach(() => { sessions.splice(0).forEach(session => session.dispose()); vi.unstubAllGlobals(); });
const envelope = (): WorkspacePresentation => ({ version: 1, active: "canvas", future: { keep: true }, objects: [
  { id: "object-window", target: { kind: "block", blockId: "window" } },
  { id: "object-document", target: { kind: "document", documentId: "doc" } },
  { id: "object-missing", target: { kind: "block", blockId: "gone" } },
], presentations: { desktop: { version: 1, kind: "legacy-tree" }, canvas: { version: 1, camera: { x: 0, y: 0, zoom: 1 }, placements: [
  { id: "placement", objectId: "object-window", bounds: { x: 20, y: 30, width: 800, height: 600 }, order: 0 },
  { id: "missing-placement", objectId: "object-missing", bounds: { x: -400, y: 30, width: 300, height: 200 }, order: 1 },
] } } });
const documentDto = (): ExistingBlockDto => ({ id: "document", type: "document-block", metadata: { documentId: "doc", folder: "notes", filename: "One.json" }, children: [{ id: "text", type: "plain-text-block", text: "Before" }] });
const workspace = (presentation: unknown = envelope()): ExistingBlockDto => ({ id: "workspace", type: "workspace-block", metadata: { unrelated: 5, ...(presentation === undefined ? {} : { workspacePresentation: presentation }) }, children: [
  { id: "window", type: "document-window-block", metadata: { position: { x: 4, y: 8 }, size: { w: 700, h: 500 } }, children: [documentDto()] },
  { id: "window-two", type: "document-window-block", children: [documentDto()] },
] });
const open = (dto = workspace(), enabled = true) => { const session = new WorkspaceSession(materializeLocalWorkspace(dto), { features: { canvasWorkspace: enabled } }); sessions.push(session); return session; };
const edit = (session: WorkspaceSession) => { const node = Object.values(session.projection.state.nodes).find(node => node.payload.id === "text")!; session.editor.commands.setPayloadField(node.key, "text", "After"); };
const response = (success = true) => new Response(JSON.stringify({ Success: success, ...(success ? {} : { Error: "Write failed" }) }), { status: success ? 200 : 500 });

describe("canonical workspace session", () => {
  it("defaults off, preserves legacy layout and retains unavailable presentation preferences", async () => {
    expect(featureFlags.canvasWorkspace).toBe(false);
    const dto = workspace(); delete (dto.metadata as any).workspacePresentation;
    const legacy = open(dto, false);
    expect(legacy.editor.persistence.captureWorkspace().document).toEqual(dto);
    expect(legacy.dirty()).toBe(false);
    const disabled = open(workspace(), false);
    expect(disabled.presentation.issue()).toContain("Desktop is shown");
    expect(() => disabled.presentation.setCamera({ x: 1, y: 2, zoom: 1 })).toThrow("disabled");
    expect(disabled.editor.persistence.captureWorkspace().document).toEqual(workspace());
    const captured = disabled.editor.persistence.captureWorkspace();
    const bundle = await createWorkspaceSaveBundle(captured.repository, [], "workspace", captured.presentation);
    expect(bundle.manifest.root.metadata).toEqual(workspace().metadata);
  });

  it.each([null, { version: 99, future: [1, 2] }, { version: 1, active: "canvas", objects: [] }])("round-trips opaque metadata through local and server snapshots (%j)", async raw => {
    const session = open(workspace(raw));
    expect(session.presentation.issue()).toContain("Desktop is shown");
    const captured = session.editor.persistence.captureWorkspace();
    expect(captured.document.metadata).toEqual(workspace(raw).metadata);
    const bundle = await createWorkspaceSaveBundle(captured.repository, [], "workspace", captured.presentation);
    expect(bundle.manifest.root.metadata).toEqual(workspace(raw).metadata);
    expect(open(JSON.parse(JSON.stringify(captured.document))).presentation.capture().value).toEqual(raw);
  });

  it("keeps layout outside content undo/hashes and round-trips shared document identity in both formats", async () => {
    const session = open(), editor = session.editor;
    const before = editor.repository.snapshot();
    const initial = await createWorkspaceSaveBundle(before);
    session.presentation.setCamera({ x: -300, y: 400, zoom: .5 });
    session.presentation.setBounds("placement", { x: 80, y: 90, width: 400, height: 300 });
    expect(session.dirty()).toBe(true);
    expect(editor.repository.snapshot()).toEqual(before);
    expect(editor.repository.canUndo()).toBe(false);
    const captured = editor.persistence.captureWorkspace();
    const bundle = await createWorkspaceSaveBundle(captured.repository, [], "workspace", captured.presentation);
    expect(bundle.documents).toHaveLength(1);
    expect(bundle.documents[0].contentHash).toBe(initial.documents[0].contentHash);
    expect(captured.document.children![0].metadata).toEqual(workspace().children![0].metadata);
    const local = open(JSON.parse(JSON.stringify(captured.document)));
    const server = new WorkspaceSession(materializeWorkspace(bundle.manifest, new Map(bundle.documents.map(d => [d.documentId, d.document])))); sessions.push(server);
    for (const reloaded of [local, server]) {
      expect(reloaded.presentation.read()).toEqual(session.presentation.read());
      const resolved = reloaded.resolveObjects();
      expect(resolved.map(r => r.status)).toEqual(["resolved", "resolved", "missing"]);
      expect(resolved[1].placementKeys).toHaveLength(2);
      expect(new Set(resolved[1].placementKeys.map(key => reloaded.editor.repository.state.placements[key].contentKey)).size).toBe(1);
    }
    edit(session); editor.repository.undo();
    expect(session.presentation.read()?.presentations.canvas?.camera.x).toBe(-300);
  });

  it("reports ambiguous anchors, excludes document internals and refuses silently rebound IDs", () => {
    const dto = workspace(), raw = (dto.metadata as any).workspacePresentation;
    raw.objects.push({ id: "internal", target: { kind: "block", blockId: "text" } });
    dto.children!.push({ id: "window", type: "image-block" });
    const ambiguous = open(dto);
    expect(ambiguous.resolveObjects().map(r => r.status)).toEqual(["ambiguous", "resolved", "missing", "missing"]);
    const session = open(), key = session.resolveObjects()[0].placementKeys[0];
    session.editor.commands.remove(key);
    expect(session.resolveObjects()[0].status).toBe("missing");
    session.editor.repository.undo();
    expect(session.resolveObjects()[0].status).toBe("resolved");
    session.editor.commands.remove(key);
    session.editor.commands.insert({ id: "window", type: "image-block" }, { kind: "at", parentKey: session.projection.state.rootKey, index: 0 });
    expect(session.resolveObjects()[0].status).toBe("replaced");
    expect(session.presentation.read()?.presentations.canvas?.placements).toHaveLength(2);
  });

  it("acknowledges only captured revisions and ignores foreign or disposed local completions", () => {
    const session = open(), persistence = session.editor.persistence;
    session.presentation.setCamera({ x: 1, y: 2, zoom: 1 });
    const old = persistence.captureWorkspace();
    edit(session); session.presentation.setCamera({ x: 2, y: 2, zoom: 1 });
    persistence.acknowledgeWorkspaceSave(old);
    expect(session.dirty()).toBe(true); expect(session.presentation.dirty()).toBe(true);
    expect(persistence.state.lastSavedRevision).not.toBe(session.editor.repository.state.revision);
    const current = persistence.captureWorkspace();
    const other = open(); other.editor.persistence.acknowledgeWorkspaceSave(current);
    expect(other.editor.persistence.state.lastSavedRevision).toBeUndefined();
    persistence.acknowledgeWorkspaceSave(current); expect(session.dirty()).toBe(false);
    session.presentation.setCamera({ x: 3, y: 2, zoom: 1 });
    const late = persistence.captureWorkspace(); session.dispose();
    persistence.acknowledgeWorkspaceSave(late); expect(session.presentation.dirty()).toBe(true);
    expect(() => persistence.captureWorkspace()).toThrow("disposed");
  });

  it.each(["layout", "content"] as const)("keeps a newer %s revision dirty independently", kind => {
    const session = open(), persistence = session.editor.persistence;
    const captured = persistence.captureWorkspace();
    if (kind === "layout") session.presentation.setCamera({ x: 1, y: 1, zoom: 1 });
    else edit(session);
    persistence.acknowledgeWorkspaceSave(captured);
    expect(session.dirty()).toBe(true);
    expect(session.presentation.dirty()).toBe(kind === "layout");
    expect(persistence.state.lastSavedRevision === session.editor.repository.state.revision).toBe(kind === "layout");
  });

  it("exports focus without changing either dirty clock", () => {
    const session = open(), editor = session.editor;
    const text = Object.values(session.projection.state.nodes).find(node => node.payload.id === "text")!;
    editor.focus.adopt(text.key);
    const captured = editor.persistence.captureWorkspace();
    expect(captured.document.children![0].children![0].metadata).toMatchObject({ focus: { blockId: "text" } });
    expect(editor.repository.state.revision).toBe(0);
    expect(session.presentation.revision()).toBe(0);
    expect(session.dirty()).toBe(false);
    expect(editor.repository.canUndo()).toBe(false);
  });

  it("saves a consistent server snapshot and leaves newer layout/content edits dirty", async () => {
    const session = open(); session.presentation.setCamera({ x: 10, y: 20, zoom: 2 });
    let complete!: (value: Response) => void;
    const fetch = vi.fn(() => new Promise<Response>(resolve => { complete = resolve; })); vi.stubGlobal("fetch", fetch);
    const pending = session.editor.persistence.saveWorkspace("Canvas.json");
    // Mutate before bundle hashing/HTTP has finished: both clocks were already captured.
    edit(session); session.presentation.setCamera({ x: 30, y: 40, zoom: .5 });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const body = JSON.parse((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.workspace.root.metadata.workspacePresentation.presentations.canvas.camera).toEqual({ x: 10, y: 20, zoom: 2 });
    expect(body.documents[0].document.children[0].text).toBe("Before");
    expect(await session.editor.persistence.saveWorkspace("Duplicate.json")).toBe(false);
    complete(response()); expect(await pending).toBe(true);
    expect(session.dirty()).toBe(true); expect(session.presentation.dirty()).toBe(true);
    fetch.mockImplementation(() => Promise.resolve(response()));
    expect(await session.editor.persistence.saveWorkspace("Canvas.json")).toBe(true);
    expect(session.dirty()).toBe(false);
  });

  it("does not acknowledge failed writes or a response arriving after disposal", async () => {
    const session = open(); session.presentation.setCamera({ x: 1, y: 1, zoom: 1 });
    const fetch = vi.fn(() => Promise.resolve(response(false))); vi.stubGlobal("fetch", fetch);
    expect(await session.editor.persistence.saveWorkspace("Canvas.json")).toBe(false);
    expect(session.presentation.dirty()).toBe(true);
    expect(session.editor.persistence.state.error).toBe("Write failed");
    let complete!: (value: Response) => void;
    fetch.mockImplementation(() => new Promise(resolve => { complete = resolve; }));
    const pending = session.editor.persistence.saveWorkspace("Canvas.json");
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    session.dispose(); complete(response());
    expect(await pending).toBe(false);
    expect(session.presentation.dirty()).toBe(true);
  });

  it("does not start a storage request when disposed during bundle creation", async () => {
    const session = open(), fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const pending = session.editor.persistence.saveWorkspace("Canvas.json");
    session.dispose();
    expect(await pending).toBe(false); expect(fetch).not.toHaveBeenCalled();
  });
});
