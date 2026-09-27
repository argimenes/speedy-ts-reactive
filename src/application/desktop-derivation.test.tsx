// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "solid-js/web";
import type { ExistingBlockDto } from "../block-tree/types";
import type { WorkspacePresentation } from "../reactive-editor/workspace-presentation";
import { materializeLocalWorkspace, materializeWorkspace, createWorkspaceSaveBundle } from "../reactive-editor/workspace-manifest";
import { WorkspaceSession } from "./workspace-session";
import { WorkspacePresentationView } from "./workspace-presentation-view";
import { WorkspacePresentations } from "../demo/workspace-presentations";
import { deriveDesktop } from "./desktop-derivation";
import { canvasActions } from "./canvas-actions";

const cleanup: Array<() => void> = [];
afterEach(() => { cleanup.splice(0).reverse().forEach(fn => fn()); document.body.replaceChildren(); vi.restoreAllMocks(); });
function reverseFixture(): ExistingBlockDto {
  const doc: ExistingBlockDto = { id: "doc", type: "document-block", metadata: { documentId: "doc", folder: ".", filename: "doc.json" }, children: [{ id: "text", type: "plain-text-block", text: "Shared document" }] };
  const objects = ["window", "image", "counter", "unknown", "missing", "direct"].map(id => ({ id, label: id, target: id === "direct" ? { kind: "document" as const, documentId: "direct" } : { kind: "block" as const, blockId: id } }));
  const presentation: WorkspacePresentation = { version: 1, active: "canvas", objects, future: true, presentations: { spatial: { future: true }, canvas: { version: 1, camera: { x: 700, y: -1200, zoom: .5 }, placements: objects.map((o, i) => ({ id: `p-${o.id}`, objectId: o.id, order: i, bounds: { x: -400 + i * 1700, y: -200 + i * 1400, width: i === 0 ? 950 : 360, height: i === 0 ? 620 : 240 } })) } } };
  return { id: "workspace", type: "workspace-block", metadata: { workspacePresentation: presentation }, children: [{ id: "bank", type: "workspace-object-bank-block", children: [
    { id: "window", type: "document-window-block", metadata: { title: "Window", custom: true, position: { x: -999, y: -999 }, size: { w: 720, h: 440 }, state: "minimized" }, children: [doc] },
    { id: "image", type: "image-block", metadata: { url: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==" } },
    { id: "counter", type: "canvas-counter-block", count: 5 },
    { id: "unknown", type: "future-block", custom: { retain: true } },
    { id: "direct-root", type: "document-block", metadata: { documentId: "direct", folder: ".", filename: "direct.json" }, children: [{ type: "plain-text-block", text: "Direct document" }] },
    { id: "unplaced", type: "image-block", metadata: { title: "Not placed" } },
  ] }] };
}
function setup(dto = reverseFixture(), mount = false) {
  const session = new WorkspaceSession(materializeLocalWorkspace(dto), { features: { canvasWorkspace: true } }); cleanup.push(() => session.dispose());
  const host = document.body.appendChild(document.createElement("main")); host.className = "workspace-demo";
  if (mount) { cleanup.push(render(() => <><WorkspacePresentations session={session} /><WorkspacePresentationView session={session} /></>, host)); session.editor.installGateway(document); }
  return { session, editor: session.editor, host };
}
const tick = async () => { await Promise.resolve(); await Promise.resolve(); };

describe("explicit Desktop derivation", () => {
  it("plans deterministically independently of camera; reuses Windows, wraps bank roots and lists skipped objects", () => {
    const { session, editor } = setup(), state = editor.repository.snapshot(), value = session.presentation.read()!;
    const plan = deriveDesktop(state, value, session.resolveObjects());
    const other = structuredClone(value); other.presentations.canvas!.camera = { x: -8000, y: 9999, zoom: 4 };
    expect(deriveDesktop(state, other, session.resolveObjects())).toEqual(plan);
    expect(plan.entries).toHaveLength(4); expect(plan.entries[0].wrapper).toBeUndefined();
    expect(plan.entries[0].metadata).toMatchObject({ position: { x: 24, y: 56 }, state: "normal", custom: true });
    expect(plan.entries.map(e => e.wrapper?.type)).toEqual([undefined, "window-block", "window-block", "document-window-block"]);
    expect(plan.skipped.map(e => e.objectId)).toEqual(["unknown", "missing"]);
    expect(editor.repository.snapshot()).toEqual(state);
    for (const entry of plan.entries) { const m = entry.metadata as any; expect(m.position.x).toBeGreaterThanOrEqual(24); expect(m.position.y).toBeGreaterThanOrEqual(56); expect(m.size.w).toBeLessThanOrEqual(1152); }
  });
  it("requires the explicit action; never creates wrappers on open, save or ordinary switching", () => {
    const { session, editor, host } = setup(undefined, true), before = editor.repository.snapshot();
    expect(host.textContent).toContain("Create Desktop from Canvas"); expect(session.selectPresentation("desktop")).toBe(false);
    editor.persistence.captureWorkspace(); expect(editor.repository.snapshot()).toEqual(before);
    expect(session.presentation.read()!.presentations.desktop).toBeUndefined();
    expect(session.createDesktop()).toBe(true); expect(host.textContent).not.toContain("Create Desktop from Canvas");
  });
  it("moves existing placements/content, keeps Canvas and document hashes, restores focus and survives both save formats", async () => {
    const { session, editor, host } = setup(undefined, true);
    const before = editor.repository.snapshot(), canvas = session.presentation.read()!.presentations.canvas;
    const bundleBefore = await createWorkspaceSaveBundle(before);
    const native = host.querySelector<HTMLTextAreaElement>('textarea')!; native.focus(); native.setSelectionRange(2, 6);
    expect(session.createDesktop()).toBe(true); await tick();
    expect(session.presentation.revision()).toBe(1); expect(editor.repository.state.revision).toBe(1);
    expect(document.activeElement).toBe(host.querySelector('textarea'));
    expect((document.activeElement as HTMLTextAreaElement).selectionStart).toBe(2);
    expect(session.presentation.read()!.presentations.canvas).toEqual(canvas);
    for (const c of Object.values(before.contents).filter(c => !["workspace-block", "workspace-object-bank-block", "document-window-block"].includes(c.viewType))) expect(editor.repository.state.contents[c.key]).toEqual(c);
    for (const [key, value] of Object.entries(before.placements)) expect(editor.repository.state.placements[key]).toEqual(value);
    expect(session.notice()).toContain("unknown (unsupported"); expect(session.notice()).toContain("missing (missing)");
    const bank = Object.values(editor.repository.state.contents).find(c => c.viewType === 'workspace-object-bank-block')!;
    expect(bank.children.map(p => editor.repository.state.contents[editor.repository.state.placements[p].contentKey].payload.id)).toEqual(['unknown','unplaced']);
    const saved = editor.persistence.captureWorkspace(), bundle = await createWorkspaceSaveBundle(saved.repository, [], 'workspace', saved.presentation);
    expect(bundle.documents.map(d => d.contentHash).sort()).toEqual(bundleBefore.documents.map(d => d.contentHash).sort());
    for (const loaded of [materializeLocalWorkspace(saved.document), materializeWorkspace(bundle.manifest, new Map(bundle.documents.map(d => [d.documentId, d.document])))]) {
      const reopened = new WorkspaceSession(loaded, { features: { canvasWorkspace: true } }); cleanup.push(() => reopened.dispose());
      expect(reopened.presentation.active()).toBe('desktop'); expect(reopened.presentation.read()).toEqual(session.presentation.read());
      expect(reopened.resolveObjects().filter(r => r.status === 'resolved')).toHaveLength(5);
    }
    expect(canvasActions(session).candidates().filter(c => c.id === 'image')).toHaveLength(1);
    expect(canvasActions(session).candidates().some(c => c.id.startsWith('block:desktop'))).toBe(false);
  });
  it("keeps layouts independent through repeated switches and editing in both views", async () => {
    const { session, editor, host } = setup(undefined, true); session.createDesktop(); await tick();
    const window = () => Object.values(session.projection.state.nodes).find(n => n.payload.id === 'window')!;
    const meta = window().payload.metadata as any;
    editor.commands.setPayloadField(window().key, 'metadata', { ...meta, position: { x: 60, y: 95 }, size: { w: 820, h: 530 } });
    const desktop = JSON.parse(JSON.stringify(window().payload.metadata));
    session.selectPresentation('canvas'); session.presentation.setBounds('p-window', { x: -100, y: 20, width: 1100, height: 690 });
    const canvas = session.presentation.read()!.presentations.canvas;
    for (let i = 0; i < 3; i++) {
      session.selectPresentation('desktop'); await tick();
      expect(window().payload.metadata).toEqual(desktop);
      const text = host.querySelector<HTMLTextAreaElement>('textarea')!; text.value = 'Edit '+i; text.dispatchEvent(new Event('input', { bubbles: true }));
      session.selectPresentation('canvas'); await tick(); expect(host.querySelector<HTMLTextAreaElement>('textarea')!.value).toBe('Edit '+i);
    }
    expect(session.presentation.read()!.presentations.canvas).toEqual(canvas); expect(session.createDesktop()).toBe(false);
  });
  it("respects an intentionally empty Desktop marker and retains bank content", () => {
    const dto = reverseFixture(); (dto.metadata as any).workspacePresentation.presentations.desktop = { version: 1, kind: 'legacy-tree' };
    const { session, editor } = setup(dto), before = editor.repository.snapshot();
    expect(session.createDesktop()).toBe(false); expect(session.selectPresentation('desktop')).toBe(true);
    expect(editor.repository.snapshot()).toEqual(before);
  });
  it("keeps the focused shared-document occurrence when both Windows leave the bank", async () => {
    const dto = reverseFixture(), bank = dto.children![0], value = (dto.metadata as any).workspacePresentation;
    const second = structuredClone(bank.children![0]); second.id = 'second'; bank.children!.push(second);
    value.objects.push({ id: 'second', target: { kind: 'block', blockId: 'second' } });
    value.presentations.canvas.placements.push({ id: 'p-second', objectId: 'second', order: 9, bounds: { x: 0, y: 0, width: 900, height: 600 } });
    const { session, editor, host } = setup(dto, true);
    const texts = [...host.querySelectorAll<HTMLTextAreaElement>('textarea')];
    expect(texts).toHaveLength(2); texts[1].focus(); texts[1].setSelectionRange(3, 7);
    const focused = editor.node(editor.focus.state.focusedKey!)!;
    expect(session.createDesktop()).toBe(true); await tick();
    const restored = editor.node(editor.focus.state.focusedKey!)!;
    expect(restored.contentKey).toBe(focused.contentKey); expect(restored.placementKey).toBe(focused.placementKey);
    expect(editor.blockQueries.ancestors(restored.key).some(n => n.payload.id === 'second')).toBe(true);
    expect((document.activeElement as HTMLTextAreaElement).selectionStart).toBe(3);
    const captured = editor.persistence.captureWorkspace(), bundle = await createWorkspaceSaveBundle(captured.repository, [], 'workspace', captured.presentation);
    expect(bundle.documents).toHaveLength(2); // One shared Document, plus the unrelated direct Document.
  });
  it("retains an explicit derivation request until composition commits", async () => {
    const { session, host } = setup(undefined, true), input = host.querySelector<HTMLTextAreaElement>('textarea')!;
    input.focus(); input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    expect(session.createDesktop()).toBe(false); expect(session.canCreateDesktop()).toBe(true);
    input.value = 'Composed'; input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: 'Composed' }));
    await vi.waitFor(() => expect(session.presentation.active()).toBe('desktop'));
    expect(host.querySelector<HTMLTextAreaElement>('textarea')!.value).toBe('Composed');
    expect(session.canCreateDesktop()).toBe(false);
  });
  it("can deliberately initialize an empty Desktop without changing bank membership", () => {
    const dto = reverseFixture(), value = (dto.metadata as any).workspacePresentation;
    value.presentations.canvas.placements = value.presentations.canvas.placements.filter((p: any) => ['unknown', 'missing'].includes(p.objectId));
    const { session, editor } = setup(dto), before = editor.repository.snapshot();
    expect(session.createDesktop()).toBe(true); expect(session.notice()).toContain('0 object(s)');
    expect(editor.repository.snapshot()).toEqual(before); expect(session.canCreateDesktop()).toBe(false);
    session.selectPresentation('canvas'); session.selectPresentation('desktop');
    expect(editor.repository.snapshot()).toEqual(before);
  });
  it("leaves derivation unavailable when Canvas is disabled", () => {
    const session = new WorkspaceSession(materializeLocalWorkspace(reverseFixture())); cleanup.push(() => session.dispose());
    expect(session.canCreateDesktop()).toBe(false); expect(session.createDesktop()).toBe(false);
  });
  it("skips ambiguous or replaced identities without making new content", () => {
    const { session, editor } = setup(), resolutions = session.resolveObjects();
    resolutions.find(r => r.object.id === 'image')!.status = 'ambiguous';
    resolutions.find(r => r.object.id === 'counter')!.status = 'replaced';
    const plan = deriveDesktop(editor.repository.snapshot(), session.presentation.read()!, resolutions);
    expect(plan.entries.map(e => e.objectId)).toEqual(['window', 'direct']);
    expect(plan.skipped.filter(e => ['image', 'counter'].includes(e.objectId)).map(e => e.reason)).toEqual(['ambiguous', 'replaced']);
  });
  it("uses existing structural undo without regenerating Desktop or changing Canvas", () => {
    const { session, editor } = setup(), before = editor.encodeWorkspace();
    session.createDesktop(); const derived = editor.encodeWorkspace(), presentation = session.presentation.read();
    editor.repository.undo();
    expect(editor.encodeWorkspace()).toEqual(before);
    expect(session.presentation.read()).toEqual(presentation); expect(session.createDesktop()).toBe(false);
    editor.repository.redo();
    expect(editor.encodeWorkspace()).toEqual(derived);
    expect(session.presentation.read()).toEqual(presentation);
  });
  it("rolls back every buffered wrapper and move when a later move fails", () => {
    const { session, editor } = setup(), before = editor.repository.snapshot(), layout = session.presentation.capture();
    const move = editor.commands.move.bind(editor.commands); let count = 0;
    vi.spyOn(editor.commands, 'move').mockImplementation((...args) => { if (++count === 3) throw new Error('injected failure'); move(...args); });
    expect(session.createDesktop()).toBe(false); expect(session.notice()).toContain('injected failure');
    expect(editor.repository.snapshot()).toEqual(before); expect(session.presentation.capture()).toEqual(layout);
    expect(editor.repository.canUndo()).toBe(false);
  });
  it("rejects wrapper identity collisions before any mutation", () => {
    const dto = reverseFixture(); dto.children!.push({ id: 'desktop:image', type: 'future-block' });
    const { session, editor } = setup(dto), before = editor.repository.snapshot();
    expect(session.createDesktop()).toBe(false); expect(session.notice()).toContain('identity collision');
    expect(editor.repository.snapshot()).toEqual(before); expect(session.canCreateDesktop()).toBe(true);
  });
  it("does not pull a nested document or repeated document occurrence out of an existing Window", () => {
    const dto = reverseFixture(), value = (dto.metadata as any).workspacePresentation;
    value.objects.push({ id: 'nested', target: { kind: 'document', documentId: 'doc' } });
    value.presentations.canvas.placements.push({ id: 'nested-placement', objectId: 'nested', order: 8, bounds: { x: 0, y: 0, width: 800, height: 600 } });
    const { session } = setup(dto);
    expect(session.createDesktop()).toBe(true); expect(session.notice()).toContain('not a workspace-owned root');
    expect(session.presentation.read()!.objects.find(o => o.id === 'nested')!.desktopHostBlockId).toBeUndefined();
  });
});
