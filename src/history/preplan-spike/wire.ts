import type { ReadMeasure } from "../read-timing";
/** Experimental lossless value envelope. Not a released history format. */
import {pack,unpack,check,own} from "./authored-values.mjs";
export {encodeAuthoredValue,decodeAuthoredValue} from "./authored-values.mjs";
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
