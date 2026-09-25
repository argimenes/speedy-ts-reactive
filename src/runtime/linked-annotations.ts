import { clone } from "../block-tree/clone";
import { linkedRegistry, resolveLinkedProperty } from "../block-tree/linked-annotations";
import type { TextRangeSnapshot } from "./text-ranges";
import type { JsonObject, RepositoryOperation } from "../block-tree/types";
import type { ReactiveEditor } from "../reactive-editor/editor";
import type { AnnotationAction, AnnotationPatch } from "../block-tree/annotation-commands";

export class LinkedAnnotations {
  constructor(private editor: ReactiveEditor) {}
  resolve(property: JsonObject) { return resolveLinkedProperty(this.editor.repository.state, property); }
  segments(id: string) {
    this.editor.repository.state.revision;
    return Object.values(this.editor.repository.state.contents).flatMap(content => {
      const properties = content.payload.standoffProperties;
      if (!Array.isArray(properties)) return [];
      return properties.flatMap((property, index) => property.annotationId === id && !property.isDeleted ? [{ contentKey: content.key, blockId: content.payload.id, index, property: clone(JSON.parse(JSON.stringify(property))) as JsonObject }] : []);
    });
  }
  create(type: string, value = "") {
    const range = this.editor.crossText.range(); if (!range) throw new Error("Select text across Blocks first");
    if (!type.trim() || type.startsWith("style/") || type.startsWith("text/")) throw new Error("Choose a semantic annotation type; ordinary styles stay independent");
    const segments = this.editor.crossText.resolve(range.anchor, range.head).filter(s => s.end > s.start);
    return this.createForSegments(segments, type, value);
  }
  createForSegments(segments: Array<{ nodeKey: string; start: number; end: number }>, type: string, value = "", metadata: JsonObject = {}) {
    if (!type.trim() || type.trim().startsWith("style/") || type.trim().startsWith("text/")) throw new Error("Choose a semantic annotation type; ordinary styles stay independent");
    if (!segments.length) throw new Error("Select a non-empty text range");
    const id = crypto.randomUUID(), state = this.editor.repository.readState();
    const registry = { ...clone(linkedRegistry(state)), [id]: { id, type: type.trim(), value, metadata: clone(metadata), attributes: {} } };
    const updates = new Map<string, { key: string; properties: JsonObject[] }>();
    for (const segment of segments) {
      const node = this.editor.node(segment.nodeKey)!;
      if (!node || !Number.isInteger(segment.start) || !Number.isInteger(segment.end) || segment.start < 0 || segment.end <= segment.start || segment.end > node.inlineContent.length) throw new Error("The annotation range is no longer valid");
      const properties = updates.get(node.contentKey)?.properties ?? clone(state.contents[node.contentKey].payload.standoffProperties as JsonObject[] ?? []);
      if (!properties.some(p => p.annotationId === id && p.start === segment.start && p.end === segment.end - 1)) properties.push({ id: crypto.randomUUID(), annotationId: id, type: type.trim(), start: segment.start, end: segment.end - 1 });
      updates.set(node.contentKey, { key: node.key, properties });
    }
    this.editor.commands.transaction("Create linked annotation", () => {
      this.editor.commands.setPayloadField(state.rootPlacementKey, "linkedAnnotations", registry);
      for (const update of updates.values()) this.editor.commands.setPayloadField(update.key, "standoffProperties", update.properties);
    });
    return id;
  }
  /** Atomic local or linked mentions; policy/eligibility belongs to the caller. */
  createBatch(groups: readonly (readonly TextRangeSnapshot[])[], type: string, value: string, metadata: JsonObject, revision: number, label: string): string[] {
    if (this.editor.repository.readState().revision !== revision) throw new Error("The document changed. Select the text again.");
    if (type.trim().startsWith("style/") || type.trim().startsWith("text/")) throw new Error("Choose a semantic annotation type; ordinary styles stay independent");
    type = type.trim();
    if (!type.trim() || !groups.length || groups.some(group => !group.length)) throw new Error("Select a non-empty annotation range");
    this.editor.textRanges.validate(groups.flat(), "cell");
    const state = this.editor.repository.readState(), registry = clone(linkedRegistry(state));
    const updates = new Map<string, JsonObject[]>(), ids: string[] = [];
    let linked = false;
    for (const ranges of groups) {
      const id = crypto.randomUUID(); ids.push(id);
      const shared = ranges.length > 1;
      if (shared) { linked = true; registry[id] = { id, type, value, metadata: clone(metadata), attributes: {} }; }
      for (const range of ranges) {
        let properties = updates.get(range.contentKey);
        if (!properties) updates.set(range.contentKey, properties = clone(state.contents[range.contentKey].payload.standoffProperties as JsonObject[] ?? []));
        if (shared && properties.some(p => p.annotationId === id && p.start === range.start && p.end === range.end - 1)) continue;
        properties.push({ id: shared ? crypto.randomUUID() : id, type, start: range.start, end: range.end - 1,
          ...(shared ? { annotationId: id } : { value, metadata: clone(metadata) }) });
      }
    }
    const operations: RepositoryOperation[] = [];
    const root = state.contents[state.placements[state.rootPlacementKey].contentKey];
    if (linked) operations.push({ kind: "put-content", record: { ...root, payload: { ...root.payload, linkedAnnotations: registry } } });
    for (const [key, properties] of updates) {
      const content = state.contents[key];
      operations.push({ kind: "put-content", record: { ...content, payload: { ...content.payload, ...(linked && key === root.key ? { linkedAnnotations: registry } : {}), standoffProperties: properties } } });
    }
    this.editor.repository.commit(label, operations);
    return ids;
  }
  edit(nodeKey: string, index: number, expected: JsonObject, action: AnnotationAction | AnnotationPatch) {
    if (typeof expected.annotationId !== "string") return this.editor.commands.editStandoffProperty(nodeKey, index, expected, action);
    const id = expected.annotationId, state = this.editor.repository.readState(), shared = linkedRegistry(state)[id];
    if (!shared || shared.isDeleted) throw new Error("The linked annotation no longer exists");
    let result = expected;
    this.editor.commands.transaction("Edit linked annotation", () => {
      // Range operations affect this segment only. Shared settings are stored once.
      result = this.editor.commands.editStandoffProperty(nodeKey, index, expected, typeof action === "string" ? action : { start: action.start, end: action.end });
      if (typeof action !== "string") {
        const next = clone(shared);
        for (const field of ["metadata", "attributes", "value"] as const) if (action[field] !== undefined) {
          if (field === "value" ? typeof action[field] !== "string" : !action[field] || typeof action[field] !== "object" || Array.isArray(action[field])) throw new Error("Invalid shared annotation settings");
          next[field] = clone(action[field]);
        }
        this.editor.commands.setPayloadField(state.rootPlacementKey, "linkedAnnotations", { ...clone(linkedRegistry(state)), [id]: next });
      }
    });
    return result;
  }
  deleteAll(id: string) {
    const state = this.editor.repository.readState(), shared = linkedRegistry(state)[id]; if (!shared) throw new Error("The linked annotation no longer exists");
    this.editor.commands.setPayloadField(state.rootPlacementKey, "linkedAnnotations", { ...clone(linkedRegistry(state)), [id]: { ...clone(shared), isDeleted: true } }, "Delete whole linked annotation");
  }
}
