import { createSignal, type Component } from "solid-js";
import type { Disposer } from "./features";
export interface PanelSession {
  readonly key: string;
  readonly ownerKey: string;
  readonly data: unknown;
  close(restore?: boolean): void;
  allowDocumentInput(allow: boolean): void;
  mountWidget(root: HTMLElement, focus: () => void): Disposer;
  focus(): void;
}
export interface PanelDefinition { type: string; view: Component<{ panel: PanelSession }> }
export class PanelContributions {
  private entries = new Map<string, PanelDefinition>();
  private revision = createSignal(0);
  register(definition: PanelDefinition): Disposer {
    if (this.entries.has(definition.type)) throw new Error(`Panel ${definition.type} already registered`);
    const entry = { ...definition }; this.entries.set(entry.type, entry); this.revision[1](n => n + 1);
    return () => { if (this.entries.get(entry.type) !== entry) return; this.entries.delete(entry.type); this.revision[1](n => n + 1); };
  }
  get(type: string) { this.revision[0](); return this.entries.get(type); }
}
