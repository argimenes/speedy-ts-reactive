import { clone } from "./clone";
import type { ContentRecord, JsonObject } from "./types";

export type AnnotationAction = "left" | "right" | "previous-word" | "next-word" | "expand" | "contract" | "delete";
export type AnnotationPatch = { start: number; end: number; value?: string; metadata?: JsonObject; attributes?: JsonObject };

export function editAnnotation(record: JsonObject, action: AnnotationAction | AnnotationPatch, content: ContentRecord, text: () => string): JsonObject {
  const next = clone(record);
  let start = Number(next.start), end = Number(next.end);
  if (next.isDeleted || !Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end >= content.inlineContent.length) throw new Error("Annotation range is invalid or deleted");
  if (typeof action !== "string") {
    for (const field of ["metadata", "attributes"] as const) {
      const value = action[field];
      if (value !== undefined && (!value || typeof value !== "object" || Array.isArray(value))) throw new Error(`${field} must be a JSON object`);
    }
    if (action.value !== undefined && typeof action.value !== "string") throw new Error("Value must be text");
    start = action.start; end = action.end;
    for (const field of ["value", "metadata", "attributes"] as const) if (action[field] !== undefined) next[field] = clone(action[field]);
  } else if (action === "delete") next.isDeleted = true;
  else if (action === "left") { if (start === 0) return next; start--; end--; }
  else if (action === "right") { if (end === content.inlineContent.length - 1) return next; start++; end++; }
  else if (action === "expand") { if (end === content.inlineContent.length - 1) return next; end++; }
  else if (action === "contract") { if (end === start) return next; end--; }
  else {
    const source = text();
    const offsets = new Map<number, number>();
    let utf16 = 0, cells = 0;
    for (const character of source) { offsets.set(utf16, cells++); utf16 += character.length; }
    const words = [...source.matchAll(/\b[^\s]+\b/g)].map(match => {
      const start = offsets.get(match.index!)!;
      return { start, end: start + [...match[0]].length - 1 };
    });
    const index = words.findIndex(word => word.start <= start && start <= word.end);
    const word = index < 0 ? undefined : words[index + (action === "previous-word" ? -1 : 1)];
    if (!word) return next;
    start = word.start; end = word.end;
  }
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end >= content.inlineContent.length) throw new Error("Use inclusive Cell endpoints within the paragraph (start ≤ end)");
  return { ...next, start, end };
}
