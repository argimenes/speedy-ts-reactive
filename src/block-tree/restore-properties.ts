/** Explicit local authored-property schema for Restore this Block.
 * Keep wire values verbatim (including absence and tombstones); only local IDs
 * are remapped by the command. Never infer safety from a `style/` prefix. */
import { clone } from "./clone";
import type { JsonObject } from "./types";

const inlineTypes = new Set([
  "style/bold", "style/italics", "style/underline", "style/strikethrough", "style/strike",
  "style/superscript", "style/subscript", "style/uppercase", "style/highlight", "style/highlighter",
  "style/rainbow", "style/rectangle", "style/spiky", "style/blur", "style/flip", "style/mirror",
  "text/colour", "text/background-colour", "style/color",
]);
const blockTypes = new Set([
  "block/alignment", "block/indent", "block/rotate", "block/font/size", "block/font-size",
  "block/alignment/left", "block/alignment/center", "block/alignment/right", "block/alignment/justify",
  // Exact typo emitted by Template.EmptyPage. The renderer ignores this marker;
  // preserve its authored bytes, rather than trimming it into an active style.
  "block/alignment/left ",
  "block/font/size/half", "block/font/size/three-quarters",
  "block/font/size/h1", "block/font/size/h2", "block/font/size/h3", "block/font/size/h4",
  "block/margin/top/20px", "block/margin/top/40px", "block/margin", "block/size", "block/position",
]);
const layoutFields: Record<string, string[]> = {
  "block/margin": ["top", "right", "bottom", "left"],
  "block/size": ["width", "height", "min-width"],
  "block/position": ["x", "y", "position"],
};
const object = (v: unknown): v is JsonObject => !!v && typeof v === "object" && !Array.isArray(v);

export function restoreProperties(value: unknown, kind: "Block property" | "Annotation", textLength = 0): JsonObject[] {
  if (!Array.isArray(value)) throw Error(`${kind} list has an unsupported representation.`);
  return value.map((p: unknown, index) => {
    const typeLabel = object(p) && typeof p.type === "string" ? (p.type.trim() === p.type ? p.type : JSON.stringify(p.type)) : undefined;
    const prefix = `${kind} #${index + 1}${typeLabel !== undefined ? ` (${typeLabel})` : ""}`;
    const fail = (reason: string): never => { throw Error(`${prefix}: ${reason}`); };
    if (!object(p)) return fail("expected a property object.");
    const inline = kind === "Annotation";
    for (const key of ["annotationId", "externalDefinitionLink", "reference", "blockId", "documentId", "entityId"]) {
      if (Object.hasOwn(p, key)) fail(`Linked annotations / references (${key}) require explicit identity and lifetime semantics.`);
    }
    if (typeof p.type !== "string" || !(inline ? inlineTypes : blockTypes).has(p.type)) {
      fail("this property type has no local authored-value restore semantics; references, plugins and structural properties remain unsupported.");
    }
    const allowed = inline
      ? ["id", "type", "start", "end", "value", "isDeleted", "metadata", "attributes", "text", "plugin"]
      : ["id", "type", "value", "metadata", "isDeleted"];
    for (const key of Object.keys(p)) if (!allowed.includes(key)) fail(`field ${key} needs explicit restoration semantics.`);
    if (p.id !== undefined && typeof p.id !== "string") fail("id must be a local string identity.");
    if (p.isDeleted !== undefined && typeof p.isDeleted !== "boolean") fail("isDeleted must be boolean.");
    if (p.value !== undefined && !(typeof p.value === "string" || (!inline && typeof p.value === "number" && Number.isFinite(p.value)))) {
      fail("value must be a local formatting scalar.");
    }
    if (!inline && typeof p.value === "string" && p.value.length > 64) fail("value exceeds the 64-character Block formatting bound.");
    for (const field of ["metadata", "attributes"]) {
      const metadata = p[field];
      if (metadata === undefined) continue;
      if (!object(metadata)) return fail(`${field} must be an object.`);
      // Standard serializers emit empty metadata. Only known authored geometry
      // has non-empty local metadata semantics; do not silently drop extensions.
      const fields = !inline && field === "metadata" ? layoutFields[p.type as string] ?? [] : [];
      for (const [key, v] of Object.entries(metadata)) {
        if (!fields.includes(key)) fail(`${field}.${key} needs explicit restoration semantics.`);
        if (!(typeof v === "string" || typeof v === "number" && Number.isFinite(v))) fail(`${field}.${key} must be a local layout scalar.`);
      }
    }
    if (inline) {
      if (p.plugin !== undefined && p.plugin !== null) fail("non-null plugin state needs explicit restoration semantics.");
      if (p.text !== undefined && typeof p.text !== "string") fail("serialized annotation text must be a string.");
      // `text` is a legacy serialized excerpt, not the text/range authority.
      // Preserve it verbatim; active ranges use inclusive canonical Cell offsets.
      if (!Number.isSafeInteger(p.start) || !Number.isSafeInteger(p.end) || Number(p.start) < 0 || Number(p.end) < Number(p.start)
        || (!p.isDeleted && Number(p.end) >= textLength)) fail("active ranges must use inclusive Cell endpoints within the restored text; deleted ranges must remain ordered non-negative integers.");
    }
    const copy = clone(p); delete copy.id; return copy;
  });
}
