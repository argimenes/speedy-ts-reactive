import { clone } from "./clone";
import { createContentKey, createPlacementKey } from "./ids";
import { deriveLocations } from "./repository";
import type { ContentRecord, JsonObject, RepositoryState } from "./types";

export interface CrossTextSegment { placementKey: string; start: number; end: number }
export interface CrossTextEditResult { placementKey: string; caret: number; state: RepositoryState }

function fragment(content: ContentRecord, from: number, to: number, offset: number): JsonObject[] {
  const properties = content.payload.standoffProperties;
  if (!Array.isArray(properties)) return [];
  return properties.flatMap(property => {
    if (!property || typeof property !== "object") return [];
    if (!Number.isInteger(property.start) || !Number.isInteger(property.end)) return from === 0 ? [clone(property)] : [];
    const start = Math.max(from, property.start), end = Math.min(to - 1, property.end);
    return end < start ? [] : [{ ...clone(property), start: start + offset, end: end + offset }];
  });
}

/** Pure structural plan: untouched Cells are moved, never round-tripped as text. */
export function planCrossTextEdit(source: RepositoryState, segments: CrossTextSegment[], text: string): CrossTextEditResult {
  if (!segments.length) throw new Error("Select a text range first");
  const locations = deriveLocations(source);
  const records = segments.map(segment => {
    const placement = source.placements[segment.placementKey], content = placement && source.contents[placement.contentKey];
    if (!content || content.inlineKind !== "standoff" || !Number.isInteger(segment.start) || !Number.isInteger(segment.end) || segment.start < 0 || segment.end < segment.start || segment.end > content.inlineContent.length) throw new Error("The text selection is stale or invalid");
    return content;
  });
  const location = locations.get(segments[0].placementKey);
  if (!location || location.slot.kind !== "children") throw new Error("Replacement requires an ordinary paragraph list");
  const parent = source.contents[location.ownerContentKey];
  const firstIndex = parent.children.indexOf(segments[0].placementKey);
  const counts = new Map<string, number>();
  for (const p of Object.values(source.placements)) counts.set(p.contentKey, (counts.get(p.contentKey) ?? 0) + 1);
  const relations = { ...records[0].ownedRelations };
  records.forEach((content, index) => {
    const segment = segments[index];
    if (parent.children[firstIndex + index] !== segment.placementKey || (index > 0 && segment.start !== 0) || (index < records.length - 1 && segment.end !== content.inlineContent.length)) throw new Error("Replacement cannot skip paragraphs or cross structural boundaries");
    if (counts.get(content.key) !== 1) throw new Error("Detach shared/transcluded paragraphs before replacing across Blocks");
    if (!index) return;
    if (content.children.length || Object.keys(content.opaqueRelations).length) throw new Error("Replacement would remove attached content; move those attachments first");
    for (const [side, key] of Object.entries(content.ownedRelations)) {
      if (!["leftMargin", "rightMargin"].includes(side) || relations[side]) throw new Error("Replacement has conflicting margins or other attachments; move them first");
      relations[side] = key;
    }
  });
  const first = records[0], last = records.at(-1)!, start = segments[0].start, end = segments.at(-1)!.end;
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const state = clone(source);
  const cells = (value: string) => [...value].map(character => {
    const key = createContentKey(), placementKey = createPlacementKey();
    state.contents[key] = { key, viewType: "text-cell", payload: { text: character }, children: [], inlineContent: [], inlineRevision: 0, ownedRelations: {}, opaqueRelations: {}, wireChildren: "omitted", wireRelation: "omitted", revision: 0 };
    state.placements[placementKey] = { key: placementKey, contentKey: key, kind: "inline" };
    return placementKey;
  });
  const prefix = first.inlineContent.slice(0, start), suffix = last.inlineContent.slice(end);
  const output: string[] = [];
  const annotationIds = new Set<string>();
  for (let i = 0; i < lines.length; i++) {
    const content = clone(first), key = i === 0 ? first.key : createContentKey();
    const placementKey = i === 0 ? segments[0].placementKey : createPlacementKey();
    const lastLine = i === lines.length - 1;
    const inserted = cells(lines[i]);
    content.key = key;
    content.inlineContent = [...(i === 0 ? prefix : []), ...inserted, ...(lastLine ? suffix : [])];
    const annotations = [
      ...(i === 0 ? fragment(first, 0, start, 0) : []),
      ...(lastLine ? fragment(last, end, last.inlineContent.length, (i === 0 ? prefix.length : 0) + inserted.length - end) : []),
    ];
    for (const property of annotations) if (typeof property.id === "string") {
      if (annotationIds.has(property.id)) property.id = crypto.randomUUID();
      annotationIds.add(property.id as string);
    }
    content.payload.standoffProperties = annotations;
    content.inlineRevision++; content.revision++;
    if (i === 0) { content.ownedRelations = relations; if (Object.keys(relations).length) content.wireRelation = "present"; }
    else {
      content.payload.id = crypto.randomUUID(); content.children = []; content.ownedRelations = {}; content.opaqueRelations = {};
      content.wireChildren = "omitted"; content.wireRelation = "omitted";
    }
    state.contents[key] = content;
    state.placements[placementKey] = { key: placementKey, contentKey: key, kind: "owned" };
    output.push(placementKey);
  }
  const updatedParent = clone(parent);
  updatedParent.children.splice(firstIndex, segments.length, ...output); updatedParent.revision++;
  state.contents[parent.key] = updatedParent;
  return { state, placementKey: output.at(-1)!, caret: (lines.length === 1 ? prefix.length : 0) + [...lines.at(-1)!].length };
}
