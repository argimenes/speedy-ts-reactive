/** G1 semantic codec candidate. No ordinary Save/Open routes import this module. */
import { clone } from "../../block-tree/clone";
import { freeze, type DeepReadonly } from "../../block-tree/commit-capture";
import { createContentKey, createPlacementKey } from "../../block-tree/ids";
import { assertPortableJson } from "../../block-tree/portable-spike/codec";
import type { ContentRecord, JsonObject } from "../../block-tree/types";
import { viewTypeFor } from "../../block-tree/codecs";
import { encodeAuthoredValue, decodeAuthoredValue } from "../preplan-spike/wire";
import { validateResource, type ExternalTarget, type ResourcePlacement, type ResourceSnapshot } from "./resource";

interface Edge {
  placementId: string;
  kind: "owned" | "reference";
  target: { kind: "local"; blockId: string } | { kind: "external"; reference: ExternalTarget };
}
interface Block {
  id: string; type: string; properties: JsonObject;
  children?: Edge[] | null;
  relations?: { owned: Record<string, Edge>; opaque: JsonObject } | null;
  inline?: Array<{ kind: "text"; text: string } | { kind: "image"; properties: JsonObject }>;
}
export interface GateDocument {
  format: "codex-portable-resource-gate"; version: 1 | 2;
  resourceId: string; root: Edge; blocks: Block[];
}
const own = (v: object, k: string) => Object.prototype.hasOwnProperty.call(v, k);
function requireValue(ok: unknown, reason: string): asserts ok { if (!ok) throw new Error(`G1 portable: ${reason}`); }
const identifier = (v: unknown) => typeof v === "string" && v.trim().length > 0;
const canonicalFields = new Set(["key", "definitionOwnerKey", "viewType", "payload", "children", "inlineContent", "inlineRevision", "inlineKind", "ownedRelations", "opaqueRelations", "wireChildren", "wireRelation", "revision"]);

/** Native profile preserves authored aliases and uses the declared value grammar.
 * The default retains the existing History/gate JSON writer contract. */
export function encodeGateDocument(state: DeepReadonly<ResourceSnapshot>, profile: "legacy" | "native" = "legacy"): GateDocument {
  validateResource(state as ResourceSnapshot);
  requireValue(profile === "native" || state.version === 1, "owned resources require native profile");
  const value = (data: JsonObject) => (profile === "native" ? encodeAuthoredValue(data) : clone(data)) as JsonObject;
  const cells = new Set<string>();
  const edge = (key: string): Edge => {
    const p = state.placements[key];
    requireValue(p.kind !== "inline", "inline placement in structural slot");
    if (p.target.kind === "external") return { placementId: p.placementId, kind: p.kind, target: clone(p.target) as Edge["target"] };
    const block = state.contents[p.target.contentKey];
    requireValue(identifier(block.payload.id), "structural placement targets non-authored content");
    return { placementId: p.placementId, kind: p.kind, target: { kind: "local", blockId: block.payload.id as string } };
  };
  const blocks: Block[] = [];
  for (const c of Object.values(state.contents)) {
    requireValue(Object.keys(c).every(k => canonicalFields.has(k)), "unrepresented canonical field");
    if (["text-cell", "image-cell"].includes(c.viewType)) continue;
    const properties = clone(c.payload) as JsonObject;
    delete properties.id; delete properties.type;
    requireValue(!["children", "relation"].some(k => own(properties, k)), "ambiguous structural authority");
    const authoredType = profile === "native" ? c.payload.type ?? c.viewType : c.viewType;
    requireValue(typeof authoredType === "string" && viewTypeFor(authoredType) === c.viewType, "authored type and canonical type disagree");
    const block: Block = { id: c.payload.id as string, type: authoredType, properties: value(properties) };
    if (c.children.length || c.wireChildren === "present") block.children = c.children.map(edge);
    else if (c.wireChildren === "null") block.children = null;
    if (Object.keys(c.ownedRelations).length || Object.keys(c.opaqueRelations).length || c.wireRelation === "present") {
      block.relations = { owned: Object.fromEntries(Object.entries(c.ownedRelations).map(([name, key]) => [name, edge(key)])), opaque: value(c.opaqueRelations) };
    } else if (c.wireRelation === "null") block.relations = null;
    if (c.inlineKind === "standoff") {
      requireValue(c.viewType === "standoff-editor-block" && !own(properties, "text"), "unsupported inline host");
      block.inline = [];
      for (const key of c.inlineContent) {
        const p = state.placements[key];
        requireValue(p.kind === "inline" && p.target.kind === "local", "invalid inline target");
        const cell = state.contents[p.target.contentKey];
        requireValue(!cells.has(cell.key) && !cell.children.length && !cell.inlineContent.length && !Object.keys(cell.ownedRelations).length && !Object.keys(cell.opaqueRelations).length, "shared/structured inline Cell");
        cells.add(cell.key);
        if (cell.viewType === "text-cell") {
          requireValue(Object.keys(cell.payload).length === 1 && typeof cell.payload.text === "string" && [...cell.payload.text].length === 1, "invalid text Cell");
          const prior = block.inline.at(-1);
          if (prior?.kind === "text") prior.text += cell.payload.text;
          else block.inline.push({ kind: "text", text: cell.payload.text });
        } else {
          requireValue(cell.viewType === "image-cell", "unsupported atom");
          block.inline.push({ kind: "image", properties: value(cell.payload) });
        }
      }
    } else requireValue(!c.inlineContent.length, "unrepresented inline content");
    blocks.push(block);
  }
  requireValue(Object.values(state.contents).every(c => !["text-cell", "image-cell"].includes(c.viewType) || cells.has(c.key)), "unrepresented Cell");
  const output: GateDocument = { format: "codex-portable-resource-gate", version: state.version,
    resourceId: state.resourceId, root: edge(state.rootPlacementKey), blocks };
  assertPortableJson(output);
  return output;
}

const record = (key: string, viewType: string, payload: JsonObject): ContentRecord => ({ key, viewType, payload,
  children: [], inlineContent: [], inlineRevision: 0, revision: 0, ownedRelations: {}, opaqueRelations: {}, wireChildren: "omitted", wireRelation: "omitted" });

export function decodeGateDocument(document: GateDocument, profile: "legacy" | "native" = "legacy"): DeepReadonly<ResourceSnapshot> {
  assertPortableJson(document);
  const value = (data: JsonObject): JsonObject => {
    const result = profile === "native" ? decodeAuthoredValue(data) : clone(data);
    requireValue(result && typeof result === "object" && !Array.isArray(result), "authored bag must be an object");
    return result as JsonObject;
  };
  requireValue(document.format === "codex-portable-resource-gate" && (document.version === 1 || profile === "native" && document.version === 2) && identifier(document.resourceId), "unsupported envelope");
  const contents: Record<string, ContentRecord> = Object.create(null), placements: Record<string, ResourcePlacement> = Object.create(null);
  const keys = new Map<string, string>();
  for (const b of document.blocks) {
    requireValue(identifier(b.id) && identifier(b.type) && !keys.has(b.id) && !["text-cell", "image-cell", "workspace-block"].includes(b.type), "invalid/duplicate Block definition");
    const properties = value(b.properties);
    requireValue(!["id", "type", "children", "relation"].some(k => own(properties, k)), "reserved Block properties");
    keys.set(b.id, createContentKey());
  }
  const edge = (p: Edge): string => {
    const key = createPlacementKey();
    requireValue(p.kind === "owned" || p.kind === "reference", "invalid edge kind");
    if (p.target.kind === "external") {
      requireValue(p.kind === "reference" || document.version === 2 && profile === "native", "foreign owned edge");
      placements[key] = { key, placementId: p.placementId, kind: p.kind, target: clone(p.target) };
    } else {
      requireValue(p.target.kind === "local" && keys.has(p.target.blockId), "missing owned definition");
      placements[key] = { key, placementId: p.placementId, kind: p.kind, target: { kind: "local", contentKey: keys.get(p.target.blockId)! } };
    }
    return key;
  };
  for (const b of document.blocks) {
    const properties = value(b.properties);
    const key = keys.get(b.id)!, c = record(key, viewTypeFor(b.type), { ...properties, id: b.id, type: b.type }); contents[key] = c;
    c.children = (b.children ?? []).map(edge); c.wireChildren = !own(b, "children") ? "omitted" : b.children === null ? "null" : "present";
    c.ownedRelations = Object.fromEntries(Object.entries(b.relations?.owned ?? {}).map(([name, p]) => [name, edge(p)]));
    c.opaqueRelations = value(b.relations?.opaque ?? {}); c.wireRelation = !own(b, "relations") ? "omitted" : b.relations === null ? "null" : "present";
    if (b.type === "standoff-editor-block") {
      requireValue(Array.isArray(b.inline) && !own(properties, "text"), "missing inline authority"); c.inlineKind = "standoff";
      const atom = (type: string, payload: JsonObject) => {
        const ck = createContentKey(), pk = createPlacementKey(); contents[ck] = record(ck, type, payload);
        placements[pk] = { key: pk, placementId: `private-cell:${pk}`, kind: "inline", target: { kind: "local", contentKey: ck } };
        c.inlineContent.push(pk);
      };
      for (const span of b.inline!) {
        if (span.kind === "text") {
          requireValue(typeof span.text === "string" && span.text.length, "invalid text span");
          for (const text of span.text) atom("text-cell", { text });
        } else { requireValue(span.kind === "image", "unsupported inline span"); atom("image-cell", value(span.properties)); }
      }
    } else requireValue(b.inline === undefined, "unexpected inline content");
  }
  const state: ResourceSnapshot = { format: "codex-resource-gate", version: document.version, resourceId: document.resourceId,
    rootPlacementKey: edge(document.root), revision: 0, contents, placements };
  validateResource(state);
  return freeze(state);
}
