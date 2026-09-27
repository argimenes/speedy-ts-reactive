import type { ExistingBlockDto } from "../block-tree/types";
import { validateWorkspacePresentation, type CanvasLayout, type WorkspaceObject } from "../reactive-editor/workspace-presentation";
import type { WorkspaceSession } from "./workspace-session";
import { deriveCanvas } from "./canvas-derivation";

/** Application adapter: Canvas sees semantic operations, never the editor/tree. */
export function canvasActions(session: WorkspaceSession) {
  const { editor, presentation } = session;
  const layout = () => presentation.read()!.presentations.canvas!;
  const update = (canvas: CanvasLayout, objects?: WorkspaceObject[]) => presentation.updateCanvas(canvas, objects);
  let enumeration: ReturnType<typeof deriveCanvas> | undefined, enumerationKey = "";
  const enumerate = () => {
    const key = `${editor.repository.state.revision}:${JSON.stringify(presentation.read()?.objects)}`;
    if (enumeration && key === enumerationKey) return enumeration;
    const previous = presentation.read()!;
    const { canvas: _, ...presentations } = previous.presentations;
    enumeration = deriveCanvas(editor.repository.snapshot(), { ...previous, presentations });
    enumerationKey = key; return enumeration;
  };
  const add = (id: string) => {
    const current = layout(), found = current.placements.find(p => p.objectId === id); if (found) return found.id;
    const candidate = enumerate(), placement = candidate.canvas.placements.find(p => p.objectId === id);
    if (!placement) throw new Error("This workspace object is no longer available.");
    const next = { ...current, placements: [...current.placements, { ...placement, order: current.placements.length, bounds: { ...placement.bounds, x: current.camera.x + 60 / current.camera.zoom, y: current.camera.y + 100 / current.camera.zoom } }] };
    validateWorkspacePresentation({ ...presentation.read()!, objects: candidate.objects, presentations: { ...presentation.read()!.presentations, canvas: next } });
    if (candidate.identities.length) editor.repository.commit("Identify workspace objects", candidate.identities.map(record => ({ kind: "put-content", record })));
    update(next, candidate.objects); return placement.id;
  };
  const create = (kind: "document" | "image" | "counter", value: string) => {
    const id = crypto.randomUUID(), objectId = `block:${id}`, placementId = `canvas:${objectId}`;
    let dto: ExistingBlockDto;
    if (kind === "image") {
      const url = value.trim();
      if (!/^(https?:\/\/|data:image\/)/i.test(url)) throw new Error("Use a portable HTTP(S) or image data URL; blob URLs are session-only.");
      dto = { id, type: "image-block", metadata: { url, title: "Image" } };
    } else if (kind === "counter") dto = { id, type: "window-block", metadata: { title: value || "Counter", size: { w: 360, h: 240 } }, children: [{ id: crypto.randomUUID(), type: "canvas-counter-block", count: 0 }] };
    else dto = { id, type: "document-window-block", metadata: { title: value || "Untitled document", size: { w: 840, h: 620 } }, children: [{ id: crypto.randomUUID(), type: "document-block", metadata: { documentId: crypto.randomUUID(), folder: ".", filename: `${id}.json` }, children: [{ type: "standoff-editor-block", text: "" }] }] };
    const current = layout(), objects = [...presentation.read()!.objects, { id: objectId, target: { kind: "block" as const, blockId: id }, label: String((dto.metadata as any)?.title) }];
    const next: CanvasLayout = { ...current, placements: [...current.placements, { id: placementId, objectId, bounds: { x: current.camera.x + 60 / current.camera.zoom, y: current.camera.y + 100 / current.camera.zoom, width: kind === "document" ? 840 : 360, height: kind === "document" ? 620 : 240 }, order: current.placements.length }] };
    validateWorkspacePresentation({ ...presentation.read()!, objects, presentations: { ...presentation.read()!.presentations, canvas: next } });
    const root = session.projection.state.rootKey;
    const banks = session.projection.state.nodes[root].children.filter(key => session.projection.state.nodes[key].viewType === "workspace-object-bank-block");
    if (banks.length > 1) throw new Error("Ambiguous workspace object bank.");
    editor.commands.transaction("Create workspace object", () => {
      if (banks.length) editor.commands.insert(dto, { kind: "at", parentKey: banks[0], index: session.projection.state.nodes[banks[0]].children.length });
      else editor.commands.insert({ id: crypto.randomUUID(), type: "workspace-object-bank-block", children: [dto] }, { kind: "at", parentKey: root, index: session.projection.state.nodes[root].children.length });
    });
    update(next, objects); return placementId;
  };
  return {
    candidates: () => enumerate().objects.map(o => ({ id: o.id, label: o.label ?? o.id })), add, create,
    remove: (id: string) => {
      const root = session.canvasRoots().find(r => r.placement.id === id);
      if (root?.embedded && root.nodeKey) throw new Error("Close embedded media before removing its placement; embedded form drafts cannot be saved by Codex.");
      update({ ...layout(), placements: layout().placements.filter(p => p.id !== id) });
    },
    media: (id: string, closed: boolean) => session.setCanvasMediaClosed(id, closed),
    nudge: (id: string, dx: number, dy: number) => { const b = layout().placements.find(p => p.id === id)?.bounds; if (b) presentation.setBounds(id, { ...b, x: b.x + dx, y: b.y + dy }); },
    order: (id: string, direction: number) => {
      const sorted = [...layout().placements].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
      const from = sorted.findIndex(p => p.id === id), to = Math.max(0, Math.min(sorted.length - 1, from + direction));
      if (from < 0 || from === to) return;
      const [moved] = sorted.splice(from, 1); sorted.splice(to, 0, moved);
      update({ ...layout(), placements: sorted.map((p, order) => ({ ...p, order })) });
    },
    activate: (id: string) => {
      const root = session.canvasRoots().find(r => r.placement.id === id)?.nodeKey; if (!root) return;
      const visit = (key: string): string | undefined => {
        const mount = editor.mounts.get(key); if (mount && ["standoff", "native-text", "opaque-widget"].includes(mount.inputPolicy)) return key;
        for (const child of session.projection.state.nodes[key]?.children ?? []) { const found = visit(child); if (found) return found; }
      };
      editor.focus.request(visit(root) ?? root, { reason: "canvas-activate" });
    },
  };
}
