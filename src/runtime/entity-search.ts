import type { ReactiveEditor } from "../reactive-editor/editor";
import type { OverlayDescriptor } from "./overlays";
import { clone } from "../block-tree/clone";
import type { JsonObject } from "../block-tree/types";

export function openEntitySearch(editor: ReactiveEditor, ranges: NonNullable<OverlayDescriptor["entityRanges"]>, contextKey?: string) {
  const selected = ranges.filter(range => range.end > range.start);
  const owner = selected[0]?.nodeKey ?? contextKey ?? ranges[0]?.nodeKey;
  if (!owner || !editor.node(owner)) throw new Error("Open entity search from a document first.");
  const query = selected.map(range => {
    const node = editor.node(range.nodeKey);
    if (!node || range.start < 0 || range.end > node.inlineContent.length) throw new Error("The selected range is no longer valid.");
    return node.inlineContent.slice(range.start, range.end).map(key => String(editor.node(key)?.payload.text ?? " ")).join("");
  }).join(" ");
  const mount = editor.mounts.get(owner), rect = mount?.root.getBoundingClientRect();
  for (const overlay of [...editor.overlays.overlays]) if (overlay.viewType === "entity-search") editor.overlays.close(overlay.key, false);
  editor.crossText.clear();
  if (selected.length) { mount?.focus(); mount?.restoreInlineSelection?.({ anchor: selected[0].start, head: selected[0].end }); }
  editor.overlays.open({ ownerKey: owner, viewType: "entity-search", anchor: { x: rect?.left ?? 20, y: (rect?.bottom ?? 20) + 8 }, entityRanges: clone(selected), entityRevision: editor.repository.readState().revision, entityQuery: query });
}

export function chooseEntity(editor: ReactiveEditor, overlay: OverlayDescriptor, entity: { id: string; name: string }) {
  if (editor.repository.readState().revision !== overlay.entityRevision) throw new Error("The document changed. Select the text again.");
  if (!entity.id || !entity.name || !overlay.entityRanges?.length) throw new Error("Select a valid entity.");
  const ranges = overlay.entityRanges, metadata = { entityId: entity.id, entityName: entity.name };
  if (ranges.length > 1) return editor.linkedAnnotations.createForSegments(ranges, "codex/entity-reference", entity.id, metadata);
  const range = ranges[0], node = editor.node(range.nodeKey);
  if (!node || range.start < 0 || range.end > node.inlineContent.length) throw new Error("The selected range is no longer valid.");
  const properties = clone((editor.repository.readState().contents[node.contentKey].payload.standoffProperties ?? []) as JsonObject[]);
  const id = crypto.randomUUID();
  properties.push({ id, type: "codex/entity-reference", start: range.start, end: range.end - 1, value: entity.id, metadata });
  editor.commands.setPayloadField(node.key, "standoffProperties", properties, "Annotate entity reference");
  return id;
}
