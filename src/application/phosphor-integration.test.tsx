// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkspaceSession } from "./workspace-session";
import { createInitialWorkspace } from "./initial-workspace";
import { workspaceOpen } from "./workspace-open";
import { materializeLocalWorkspace } from "../reactive-editor/workspace-manifest";
import { newDocument } from "../features/phosphor/model";
import { captureNative, nativeText } from "../persistence/native-resource";
import { nativeDocumentSession } from "../persistence/native-session";
import { createFlintDocumentTabs } from "../features/flint/document-tabs";

const sessions: WorkspaceSession[] = [];
afterEach(() => { sessions.splice(0).forEach(s => s.dispose()); vi.unstubAllGlobals(); });
function setup(phosphor = true) {
  const session = new WorkspaceSession(materializeLocalWorkspace(createInitialWorkspace()), {
    features: { phosphor, canvasWorkspace: true, threeDObjects: false },
  });
  sessions.push(session);
  return session;
}
function file() {
  const source = setup();
  const document = newDocument("poem");
  source.editor.commands.insert({ type: "workspace-object-bank-block", children: [document] }, {
    kind: "at", parentKey: source.editor.repository.state.rootPlacementKey, index: 0,
  });
  const resource = captureNative(source.editor.repository.snapshot(), document.id!);
  const native = nativeText(resource);
  const fetch = vi.fn(async () => new Response(JSON.stringify({ Success: true, Data: {
    kind: "native", resourceId: resource.resourceId, native,
    baseline: { nativeHash: "saved", markdownHash: null, generation: null },
  } })));
  vi.stubGlobal("fetch", fetch);
  return { resource, native, fetch };
}

describe("Phosphor workspace integration", () => {
  it("launches a blank native Screen through the main workspace command", () => {
    const { editor, projection } = setup();
    editor.commandRegistry.execute("phosphor.open", { targetKey: projection.state.rootKey, args: undefined });
    const state = editor.repository.readState();
    const doc = Object.values(state.contents).find(c => c.viewType === "document-block")!;
    const screen = state.contents[state.placements[doc.children[0]].contentKey];
    expect(screen.viewType).toBe("phosphor-screen-block");
    const text = state.contents[state.placements[screen.children[0]].contentKey];
    expect(text.inlineContent.map(k => state.contents[state.placements[k].contentKey].payload.text).join("").trim()).toBe("");
    expect(nativeDocumentSession(editor).isCandidate(String(doc.payload.id))).toBe(true);
    expect(Object.values(state.contents).filter(c => c.viewType === "window-block")).toHaveLength(1);
  });

  it.each([[false, "poem.phosphor"], [true, "poem.phosphor"], [true, "legacy.ink"]] as const)("opens saved Screens in Phosphor and reveals the same window without losing edits (Flint open: %s, file: %s)", async (flint, filename) => {
    const { resource, native, fetch } = file();
    const session = setup(), { editor, projection } = session;
    if (flint) editor.commands.insert({ type: "window-block", children: [createFlintDocumentTabs([])] }, { kind: "at", parentKey: projection.state.rootKey, index: 0 });
    const open = workspaceOpen(session), location = { folder: ".", filename }, signal = new AbortController().signal;
    const window = await open.serverDocument(location, signal);
    const state = editor.repository.readState();
    const host = state.contents[state.placements[window].contentKey];
    expect(host.viewType).toBe("window-block");
    expect(host.payload.metadata).toMatchObject({ title: `Phosphor — ${filename}`, size: { w: 1260, h: 820 } });
    expect(nativeText(captureNative(state, resource.resourceId))).toBe(native);
    expect(nativeDocumentSession(editor).location(resource.resourceId)).toEqual(location);
    const screen = Object.values(projection.state.nodes).find(n => n.viewType === "phosphor-screen-block")!;
    editor.commands.replaceInlineRange(screen.children[0], 0, 1, "X");
    const edited = nativeText(captureNative(editor.repository.snapshot(), resource.resourceId));
    expect(await open.serverDocument(location, signal)).toBe(window);
    expect(nativeText(captureNative(editor.repository.snapshot(), resource.resourceId))).toBe(edited);
    editor.commands.remove(window);
    expect(await open.serverDocument(location, signal)).not.toBe(window);
    expect(nativeText(captureNative(editor.repository.snapshot(), resource.resourceId))).toBe(edited);
    expect(fetch).toHaveBeenCalledTimes(1);
    if (flint) expect(Object.values(editor.repository.state.contents).find(c => c.viewType === "tab-row-block")!.children).toHaveLength(0);
  });

  it("respects the Phosphor feature flag while preserving saved Screen content", async () => {
    const { resource, native } = file();
    const session = setup(false);
    expect(session.editor.commandRegistry.list().some(c => c.id === "phosphor.open")).toBe(false);
    const window = await workspaceOpen(session).serverDocument({ folder: ".", filename: "poem.phosphor" }, new AbortController().signal);
    const state = session.editor.repository.readState();
    expect(state.contents[state.placements[window].contentKey].viewType).toBe("document-window-block");
    expect(nativeText(captureNative(state, resource.resourceId))).toBe(native);
  });
});
