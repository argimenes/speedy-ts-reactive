import { createSignal } from "solid-js";
import type { DecorationShape, VisualFragment } from "../rendering/decorations";
import type { StandoffAnnotation } from "../rendering/standoff-styles";

export type Immutable<T> = T extends object ? { readonly [K in keyof T]: Immutable<T[K]> } : T;
export interface MeasuredEffect {
  readonly key: string;
  readonly property: Immutable<StandoffAnnotation>;
  readonly fragments: readonly Readonly<VisualFragment>[];
  readonly offset: number;
}
/** Passive SVG only. Core owns measuring, lane allocation and the SVG host. */
export interface EffectDefinition {
  readonly type: string;
  readonly laneHeight: number;
  render(measured: MeasuredEffect): readonly DecorationShape[];
}
export class EffectContributions {
  private entries = new Map<string, EffectDefinition>();
  private revision = createSignal(0);
  register(definition: EffectDefinition): () => void {
    if (this.entries.has(definition.type)) throw new Error(`Effect ${definition.type} already registered`);
    if (!Number.isFinite(definition.laneHeight) || definition.laneHeight < 0) throw new Error("Invalid effect lane height");
    const entry = Object.freeze({ ...definition });
    this.entries.set(entry.type, entry); this.revision[1](n => n + 1);
    return () => { if (this.entries.get(entry.type) !== entry) return; this.entries.delete(entry.type); this.revision[1](n => n + 1); };
  }
  get(type?: string) { this.revision[0](); return type ? this.entries.get(type) : undefined; }
  track() { this.revision[0](); }
}

/** Called only at the effect boundary on detached property data. */
export function immutable<T>(value: T): Immutable<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(immutable); Object.freeze(value);
  }
  return value as Immutable<T>;
}
