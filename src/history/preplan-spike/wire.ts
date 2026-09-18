import type { ReadMeasure } from "../read-timing";
/** Experimental lossless value envelope. Not a released history format. */
const tag = "$codexHistoryValue";
const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);
function check(ok: unknown, message: string): asserts ok { if (!ok) throw new Error(`History wire spike: ${message}`); }
function pack(value: unknown, ancestors: Set<object>): unknown {
  if (value === undefined) return { [tag]: ["undefined"] };
  if (typeof value === "number") {
    if (Object.is(value, -0)) return { [tag]: ["number", "-0"] };
    if (!Number.isFinite(value)) return { [tag]: ["number", String(value)] };
    return value;
  }
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  check(typeof value === "object" && value !== null, "unsupported value");
  check(!ancestors.has(value), "cyclic value");
  check(!Object.getOwnPropertySymbols(value).length, "symbol property");
  const next = new Set(ancestors).add(value), descriptors = Object.getOwnPropertyDescriptors(value);
  if (Array.isArray(value)) {
    check(Object.keys(descriptors).length === value.length + 1, "sparse or extended array");
    return Array.from({ length: value.length }, (_, i) => {
      const d = descriptors[String(i)]; check(d && own(d, "value") && d.enumerable, "sparse array/accessor");
      return pack(d.value, next);
    });
  }
  check(Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null, "unsupported object");
  const entries = Object.entries(descriptors).map(([key, d]) => {
    check(own(d, "value") && d.enumerable, "accessor/hidden field"); return [key, pack(d.value, next)];
  });
  // Escape user objects containing the tag, so no payload can impersonate a value tag.
  return own(value, tag) ? { [tag]: ["object", entries] } : Object.fromEntries(entries);
}
function unpack(value: any): unknown {
  if (value === null || typeof value !== "object") return value;
  // JSON.parse owns this private graph. Decode into it instead of allocating a
  // second whole checkpoint. The canonical re-encoding check below is unchanged.
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) value[i] = unpack(value[i]);
    return value;
  }
  if (!own(value, tag)) {
    for (const key of Object.keys(value)) value[key] = unpack(value[key]);
    return value;
  }
  check(Object.keys(value).length === 1 && Array.isArray(value[tag]), "malformed value tag");
  const item = value[tag];
  if (item[0] === "undefined") { check(item.length === 1, "malformed undefined"); return undefined; }
  if (item[0] === "number") {
    check(item.length === 2 && ["-0", "NaN", "Infinity", "-Infinity"].includes(item[1]), "malformed number");
    return item[1] === "-0" ? -0 : Number(item[1]);
  }
  check(item[0] === "object" && item.length === 2 && Array.isArray(item[1]), "unknown value tag");
  const keys = new Set();
  return Object.fromEntries(item[1].map((pair: any) => {
    check(Array.isArray(pair) && pair.length === 2 && typeof pair[0] === "string" && !keys.has(pair[0]), "invalid escaped object");
    keys.add(pair[0]); return [pair[0], unpack(pair[1])];
  }));
}
export function encodeWire(value: unknown): string {
  return JSON.stringify({ format: "codex-history-value-spike", version: 1, value: pack(value, new Set()) });
}
export function decodeWire(text: string, measure: ReadMeasure = (_name, action) => action()): unknown {
  const envelope = measure("decode", () => JSON.parse(text));
  check(envelope?.format === "codex-history-value-spike" && envelope.version === 1 && Object.keys(envelope).length === 3 && own(envelope, "value"), "unsupported envelope");
  const result = measure("decode", () => unpack(envelope.value));
  // Enforces this spike's canonical byte grammar, including duplicate-key rejection.
  check(measure("serialization", () => encodeWire(result)) === text, "noncanonical or corrupt encoding");
  return result;
}
