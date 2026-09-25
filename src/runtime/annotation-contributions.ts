import { createSignal, type Accessor, type Component } from "solid-js";
import type { JsonObject } from "../block-tree/types";
import type { Immutable } from "./effect-contributions";
export interface AnnotationTarget { nodeKey: string; start: number; end: number }
/** The existing annotation button/action and read-only property details slot. */
export interface AnnotationContribution {
  id: string;
  type: string;
  label: string;
  title: string;
  apply(ranges: readonly AnnotationTarget[], contextKey?: string): void;
  details: Component<{ property: Accessor<Immutable<JsonObject> | undefined> }>;
}
export class AnnotationContributions {
  private entries = new Map<string, AnnotationContribution>();
  private revision = createSignal(0);
  register(definition: AnnotationContribution) {
    if (this.entries.has(definition.type)) throw new Error(`Annotation UI ${definition.type} already registered`);
    const entry = { ...definition }; this.entries.set(entry.type, entry); this.revision[1](n => n + 1);
    return () => { if (this.entries.get(entry.type) !== entry) return; this.entries.delete(entry.type); this.revision[1](n => n + 1); };
  }
  get(type: string) { this.revision[0](); return this.entries.get(type); }
  list() { this.revision[0](); return [...this.entries.values()]; }
}
