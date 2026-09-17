/** Isolated proposal spike. No production codec, editor or persistence integration. */
import { clone } from "../clone";
import { decodeDocument } from "../codecs";
import { createBlockId, createContentKey, createPlacementKey } from "../ids";
import { applyBlockIdentityNormalization, BlockIdentityIndex, isAuthoredBlock, planBlockIdentityNormalization, type IdentityIssue, type BlockIdentityNormalizationPlan } from "../identity";
import { validateRepository } from "../repository";
import type { ContentRecord, ExistingBlockDto, JsonObject, RepositoryState } from "../types";

export interface PortablePlacement { placementId: string; blockId: string; kind: "owned" | "reference" }
export type PortableInline = { kind: "text"; text: string } | { kind: "image"; properties: JsonObject };
export interface PortableBlock {
  id: string;
  type: string;
  properties: JsonObject;
  children?: PortablePlacement[] | null;
  relations?: { owned: Record<string, PortablePlacement>; opaque: JsonObject } | null;
  inline?: PortableInline[];
}
export interface PortableDocument {
  format: "codex-portable-document-spike";
  version: 1;
  resourceId: string;
  root: PortablePlacement;
  blocks: PortableBlock[];
}
/** Session adapter only. Never serialized; retain removed entries for undo. */
export interface PortableBindings {
  resourceId: string;
  placementIds: Map<string, string>;
}
export type PortableDecode =
  | { status: "ready"; state: RepositoryState; bindings: PortableBindings }
  | { status: "unresolved"; document: PortableDocument; missingBlockIds: string[] };

function requireValue(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Portable spike: ${message}`);
}
const own = (object: object, key: string) => Object.prototype.hasOwnProperty.call(object, key);
function object(value: unknown): JsonObject {
  requireValue(value && typeof value === "object" && !Array.isArray(value), "expected object");
  return value as JsonObject;
}
function fields(value: JsonObject, allowed: string[]): void {
  requireValue(Object.keys(value).every(key => allowed.includes(key)), "unsupported structural field");
}
function identifier(value: unknown): asserts value is string {
  requireValue(typeof value === "string" && value.trim().length > 0, "expected nonempty identity/type");
}

/** Reject values JSON would silently change, including undefined and sparse arrays. */
export function assertPortableJson(value: unknown, ancestors = new Set<object>()): void {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    requireValue(Number.isFinite(value) && !Object.is(value, -0), "unsupported JSON number"); return;
  }
  requireValue(typeof value === "object" && value !== null, "unsupported JSON value");
  requireValue(!ancestors.has(value), "cyclic payload object");
  requireValue(!Object.getOwnPropertySymbols(value).length, "symbol properties are unsupported");
  const next = new Set(ancestors).add(value);
  if (Array.isArray(value)) {
    requireValue(Object.keys(value).length === value.length && Object.getOwnPropertyNames(value).length === value.length + 1, "sparse/extended array");
    for (let i = 0; i < value.length; i++) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
      requireValue(descriptor && own(descriptor, "value"), "sparse array or accessor");
      assertPortableJson(descriptor.value, next);
    }
  } else {
    requireValue(Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null, "non-JSON object");
    requireValue(Object.getOwnPropertyNames(value).length === Object.keys(value).length, "hidden properties are unsupported");
    for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))) {
      requireValue(own(descriptor, "value"), "accessors are unsupported"); assertPortableJson(descriptor.value, next);
    }
  }
}

/** Validate authored syntax and graph topology before allocating any runtime graph. */
export function validatePortable(input: unknown): { document: PortableDocument; missingBlockIds: string[] } {
  assertPortableJson(input);
  const doc = object(input);
  fields(doc, ["format", "version", "resourceId", "root", "blocks"]);
  requireValue(doc.format === "codex-portable-document-spike" && doc.version === 1, "unsupported format/version");
  identifier(doc.resourceId); requireValue(Array.isArray(doc.blocks), "expected definitions");
  const blocks = new Map<string, PortableBlock>(), placements = new Map<string, PortablePlacement>();
  const placement = (value: unknown): PortablePlacement => {
    const p = object(value); fields(p, ["placementId", "blockId", "kind"]);
    identifier(p.placementId); identifier(p.blockId);
    requireValue(p.kind === "owned" || p.kind === "reference", "invalid placement kind");
    requireValue(!placements.has(p.placementId), "duplicate placement identity");
    placements.set(p.placementId, p as unknown as PortablePlacement);
    return p as unknown as PortablePlacement;
  };
  const root = placement(doc.root); requireValue(root.kind === "owned", "root must be owned");
  for (const raw of doc.blocks) {
    const b = object(raw); fields(b, ["id", "type", "properties", "children", "relations", "inline"]);
    identifier(b.id); identifier(b.type);
    requireValue(!blocks.has(b.id), "duplicate Block definition");
    requireValue(!["text-cell", "image-cell", "workspace-block"].includes(b.type), "not an authored Document Block type");
    const properties = object(b.properties);
    requireValue(!["id", "type", "children", "relation"].some(key => own(properties, key)), "reserved Block property");
    const metadata = properties.metadata;
    if (b.id === root.blockId && metadata && typeof metadata === "object" && own(metadata, "documentId")) {
      requireValue((metadata as JsonObject).documentId === doc.resourceId, "conflicting Document resource identity");
    }
    requireValue(b.id === root.blockId || b.type !== "document-block", "nested Document is outside this spike");
    if (own(b, "children") && b.children !== null) {
      requireValue(Array.isArray(b.children), "invalid children"); b.children.forEach(placement);
    }
    if (own(b, "relations") && b.relations !== null) {
      const relations = object(b.relations); fields(relations, ["owned", "opaque"]);
      const owned = object(relations.owned), opaque = object(relations.opaque);
      requireValue(!Object.keys(owned).some(key => own(opaque, key)), "ambiguous named relation");
      Object.values(owned).forEach(placement);
    }
    if (b.type === "standoff-editor-block") {
      requireValue(Array.isArray(b.inline) && !own(properties, "text"), "Standoff requires inline content as sole text authority");
      for (const item of b.inline) {
        const span = object(item);
        if (span.kind === "text") {
          fields(span, ["kind", "text"]); requireValue(typeof span.text === "string" && span.text.length > 0, "invalid text run");
        } else {
          requireValue(span.kind === "image", "unsupported inline kind"); fields(span, ["kind", "properties"]);
          const image = object(span.properties); identifier(image.assetId);
          requireValue(typeof image.src === "string" && typeof image.alt === "string", "invalid image descriptor");
        }
      }
    } else requireValue(!own(b, "inline"), "inline content on unsupported host");
    blocks.set(b.id, b as unknown as PortableBlock);
  }
  requireValue(blocks.get(root.blockId)?.type === "document-block", "missing Document root definition");
  const missing = new Set<string>();
  for (const p of placements.values()) if (!blocks.has(p.blockId)) {
    requireValue(p.kind === "reference", "missing owned definition"); missing.add(p.blockId);
  }
  const reached = new Set<string>();
  const visit = (p: PortablePlacement, ancestors: Set<string>) => {
    reached.add(p.placementId);
    if (ancestors.has(p.blockId)) { requireValue(p.kind === "reference", "ownership cycle"); return; }
    const b = blocks.get(p.blockId); if (!b) return;
    const next = new Set(ancestors).add(b.id);
    for (const child of [...b.children ?? [], ...Object.values(b.relations?.owned ?? {})]) visit(child, next);
  };
  visit(root, new Set());
  requireValue(reached.size === placements.size, "unreachable structural placements");
  for (const b of blocks.values()) if (b.inline?.length) {
    requireValue([...placements.values()].some(p => reached.has(p.placementId) && p.blockId === b.id), "unplaced inline host is unsupported by runtime validator");
  }
  return { document: input as PortableDocument, missingBlockIds: [...missing].sort() };
}

const baseRecord = (key: string, viewType: string, payload: JsonObject): ContentRecord => ({
  key, viewType, payload, children: [], inlineContent: [], inlineRevision: 0,
  ownedRelations: {}, opaqueRelations: {}, wireChildren: "omitted", wireRelation: "omitted", revision: 0,
});

export function decodePortable(input: unknown): PortableDecode {
  const { document: doc, missingBlockIds } = validatePortable(input);
  if (missingBlockIds.length) return { status: "unresolved", document: clone(doc), missingBlockIds };
  const state: RepositoryState = { rootPlacementKey: "", contents: Object.create(null), placements: Object.create(null), revision: 0 };
  const bindings: PortableBindings = { resourceId: doc.resourceId, placementIds: new Map() };
  const blocks = new Map(doc.blocks.map(b => [b.id, createContentKey()]));
  const edge = (p: PortablePlacement) => {
    const key = createPlacementKey();
    state.placements[key] = { key, contentKey: blocks.get(p.blockId)!, kind: p.kind };
    bindings.placementIds.set(key, p.placementId); return key;
  };
  for (const b of doc.blocks) {
    const key = blocks.get(b.id)!;
    const content = baseRecord(key, b.type, { ...clone(b.properties), id: b.id, type: b.type });
    state.contents[key] = content;
    content.children = (b.children ?? []).map(edge);
    content.wireChildren = !own(b, "children") ? "omitted" : b.children === null ? "null" : "present";
    content.ownedRelations = Object.fromEntries(Object.entries(b.relations?.owned ?? {}).map(([name, p]) => [name, edge(p)]));
    content.opaqueRelations = clone(b.relations?.opaque ?? {});
    content.wireRelation = !own(b, "relations") ? "omitted" : b.relations === null ? "null" : "present";
    if (b.inline) {
      content.inlineKind = "standoff";
      const atom = (type: string, properties: JsonObject) => {
        const atomKey = createContentKey(), placementKey = createPlacementKey();
        state.contents[atomKey] = baseRecord(atomKey, type, properties);
        state.placements[placementKey] = { key: placementKey, contentKey: atomKey, kind: "inline" };
        content.inlineContent.push(placementKey);
      };
      for (const span of b.inline) {
        if (span.kind === "text") for (const text of span.text) atom("text-cell", { text });
        else atom("image-cell", clone(span.properties));
      }
    }
  }
  state.rootPlacementKey = edge(doc.root);
  validateRepository(state); new BlockIdentityIndex(state);
  return { status: "ready", state, bindings };
}

const canonicalFields = ["key", "viewType", "payload", "children", "inlineContent", "inlineRevision", "inlineKind", "ownedRelations", "opaqueRelations", "wireChildren", "wireRelation", "revision"];
export function encodePortable(state: RepositoryState, bindings: PortableBindings, allocateId: () => string = createBlockId): PortableDocument {
  validateRepository(state); new BlockIdentityIndex(state); identifier(bindings.resourceId);
  const ids = new Map(bindings.placementIds), used = new Set<string>();
  for (const id of ids.values()) { identifier(id); requireValue(!used.has(id), "duplicate bound placement identity"); used.add(id); }
  const edge = (key: string): PortablePlacement => {
    const p = state.placements[key], target = state.contents[p.contentKey];
    requireValue(p.kind !== "inline" && isAuthoredBlock(target), "structural edge targets non-authored content");
    let id = ids.get(key);
    if (!id) { id = allocateId(); identifier(id); requireValue(!used.has(id), "placement identity allocator collision"); ids.set(key, id); used.add(id); }
    return { placementId: id, blockId: target.payload.id as string, kind: p.kind };
  };
  for (const p of Object.values(state.placements)) fields(p as unknown as JsonObject, ["key", "contentKey", "kind"]);
  const consumedCells = new Set<string>();
  const blocks: PortableBlock[] = [];
  for (const c of Object.values(state.contents)) {
    fields(c as unknown as JsonObject, canonicalFields);
    if (!isAuthoredBlock(c)) continue;
    const properties = clone(c.payload); delete properties.id; delete properties.type;
    // Aliases are authored type equivalents, but arbitrary type disagreement is not.
    const payloadType = c.payload.type === "main-list-block" || c.payload.type === "membrane-block" ? "document-block" : c.payload.type;
    requireValue(payloadType === undefined || payloadType === c.viewType, "payload/type disagreement");
    const b: PortableBlock = { id: c.payload.id as string, type: c.viewType, properties };
    if (c.children.length || c.wireChildren === "present") b.children = c.children.map(edge);
    else if (c.wireChildren === "null") b.children = null;
    if (Object.keys(c.ownedRelations).length || Object.keys(c.opaqueRelations).length || c.wireRelation === "present") {
      b.relations = { owned: Object.fromEntries(Object.entries(c.ownedRelations).map(([name, key]) => [name, edge(key)])), opaque: clone(c.opaqueRelations) };
    } else if (c.wireRelation === "null") b.relations = null;
    if (c.inlineKind === "standoff") {
      requireValue(c.viewType === "standoff-editor-block", "unsupported inline host"); b.inline = [];
      for (const key of c.inlineContent) {
        const p = state.placements[key], cell = state.contents[p.contentKey];
        requireValue(p.kind === "inline" && !consumedCells.has(cell.key), "shared/structural inline Cell unsupported");
        requireValue(!cell.children.length && !cell.inlineContent.length && !Object.keys(cell.ownedRelations).length && !Object.keys(cell.opaqueRelations).length, "structured inline Cell unsupported");
        consumedCells.add(cell.key);
        if (cell.viewType === "text-cell") {
          fields(cell.payload, ["text"]);
          requireValue(typeof cell.payload.text === "string" && [...cell.payload.text].length === 1, "text Cell must contain one code point");
          const previous = b.inline.at(-1);
          if (previous?.kind === "text") previous.text += cell.payload.text;
          else b.inline.push({ kind: "text", text: cell.payload.text });
        } else { requireValue(cell.viewType === "image-cell", "unsupported inline atom"); b.inline.push({ kind: "image", properties: clone(cell.payload) }); }
      }
    } else requireValue(!c.inlineContent.length && c.inlineKind === undefined, "unsupported inline content");
    blocks.push(b);
  }
  requireValue(Object.values(state.contents).every(c => isAuthoredBlock(c) || consumedCells.has(c.key)), "unrepresented inline Cell");
  const doc: PortableDocument = { format: "codex-portable-document-spike", version: 1, resourceId: bindings.resourceId, root: edge(state.rootPlacementKey), blocks };
  validatePortable(doc);
  // Publish assignments only after a successful export. Never alter the source graph.
  bindings.placementIds = ids;
  return doc;
}

export type LegacySession =
  | { status: "ready"; state: RepositoryState; bindings: PortableBindings; normalization: BlockIdentityNormalizationPlan }
  | { status: "ambiguous"; document: ExistingBlockDto; issues: IdentityIssue[] };

/** Read-old/write-new starts with a private in-memory baseline, never a disk rewrite. */
export function openLegacyInMemory(input: ExistingBlockDto, resourceId: string): LegacySession {
  assertPortableJson(input);
  const decoded = decodeDocument(input).state;
  const plan = planBlockIdentityNormalization(decoded);
  if (plan.status !== "ready") return { status: "ambiguous", document: clone(input), issues: clone(plan.issues) };
  const state = applyBlockIdentityNormalization(decoded, plan);
  const bindings: PortableBindings = { resourceId, placementIds: new Map() };
  encodePortable(state, bindings); // Allocate semantic placements once, before enrollment.
  return { status: "ready", state, bindings, normalization: plan };
}

/** A caller chooses when to serialize this result; opening never saves it. */
export function migrateLegacy(input: ExistingBlockDto, resourceId: string): PortableDocument {
  const session = openLegacyInMemory(input, resourceId);
  requireValue(session.status === "ready", "ambiguous legacy identities; sharing cannot be inferred");
  return encodePortable(session.state, session.bindings);
}
