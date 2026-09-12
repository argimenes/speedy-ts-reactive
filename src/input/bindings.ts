import { createSignal } from "solid-js";

export type Modifier = "Ctrl" | "Meta" | "Alt" | "Shift";
export type Trigger =
  | { kind: "keyboard"; key: string; modifiers: Modifier[] }
  | { kind: "mouse"; button: number; gesture: "click" | "dblclick" | "contextmenu"; modifiers: Modifier[] }
  | { kind: "custom"; name: string };
export interface BindingContext { event?: Event; payload?: unknown; run(id: string): boolean | void }
export interface BindingAction {
  id: string; name: string; description: string; category: string; tags: string[];
  scope: string; defaults: Trigger[]; handler(context: BindingContext): boolean | void;
}
export const CUSTOM_INPUTS = ["inspect-annotation", "save-document", "toggle-bindings"] as const;
export const STORAGE_KEY = "speedy.input-bindings.v1";
const modifiers: Modifier[] = ["Ctrl", "Meta", "Alt", "Shift"];
export const keyboard = (key: string, ...mods: Modifier[]): Trigger => ({ kind: "keyboard", key, modifiers: mods });
export const mouse = (button: number, gesture: "click" | "dblclick" | "contextmenu", ...mods: Modifier[]): Trigger => ({ kind: "mouse", button, gesture, modifiers: mods });
export function captureTrigger(event: KeyboardEvent | MouseEvent): Trigger {
  const mods = modifiers.filter((_, i) => [event.ctrlKey, event.metaKey, event.altKey, event.shiftKey][i]);
  return event instanceof KeyboardEvent ? keyboard(event.key, ...mods) : mouse(event.button, event.type === "contextmenu" ? "contextmenu" : event.type === "dblclick" ? "dblclick" : "click", ...mods);
}
const normalKey = (key: string) => key.length === 1 ? key.toLowerCase() : key;
export function triggerKey(trigger: Trigger): string {
  if (trigger.kind === "custom") return `custom:${trigger.name}`;
  const mods = modifiers.filter(mod => trigger.modifiers.includes(mod)).join("+");
  return trigger.kind === "keyboard" ? `key:${mods}:${normalKey(trigger.key)}` : `mouse:${mods}:${trigger.gesture}:${trigger.button}`;
}
export function triggerLabel(trigger: Trigger): string {
  if (trigger.kind === "custom") return `Event: ${trigger.name}`;
  const mods = modifiers.filter(mod => trigger.modifiers.includes(mod));
  const keys: Record<string, string> = { ArrowLeft: "←", ArrowRight: "→", ArrowUp: "↑", ArrowDown: "↓", " ": "Space", Meta: "Cmd" };
  const label = trigger.kind === "keyboard" ? keys[trigger.key] ?? trigger.key : `${["Primary", "Middle", "Secondary"][trigger.button] ?? `Button ${trigger.button}`} ${trigger.gesture}`;
  return [...mods.map(mod => mod === "Meta" ? "Cmd" : mod === "Alt" ? "Alt/Option" : mod), label].join("+");
}
export function scopesOverlap(a: string, b: string): boolean {
  return a === b || a.startsWith(b + "/") || b.startsWith(a + "/") || a === "workspace" || b === "workspace";
}
function validateTrigger(input: unknown): Trigger {
  if (!input || typeof input !== "object") throw new Error("Invalid trigger");
  const t = input as Record<string, unknown>;
  if (t.kind === "custom") {
    if (!CUSTOM_INPUTS.includes(t.name as any)) throw new Error("Unknown custom input event");
    return { kind: "custom", name: String(t.name) };
  }
  if (!Array.isArray(t.modifiers) || t.modifiers.some(m => !modifiers.includes(m)) || new Set(t.modifiers).size !== t.modifiers.length) throw new Error("Invalid modifiers");
  const mods = t.modifiers as Modifier[];
  if (t.kind === "keyboard" && typeof t.key === "string" && t.key.length > 0 && t.key.length <= 40 && !["Control", "Meta", "Alt", "Shift", "Dead", "Unidentified", "Process"].includes(t.key)) return keyboard(t.key, ...mods);
  if (t.kind === "mouse" && Number.isInteger(t.button) && Number(t.button) >= 0 && Number(t.button) <= 4 && ["click", "dblclick", "contextmenu"].includes(String(t.gesture))) return mouse(Number(t.button), t.gesture as any, ...mods);
  throw new Error("Invalid key or mouse trigger");
}

/** Data-only preferences; handlers always come from application registration. */
export class BindingRegistry {
  private actions = new Map<string, BindingAction>();
  private overrides: Record<string, Trigger[]> = Object.create(null);
  private index = new Map<string, BindingAction[]>();
  private revision = createSignal(0);
  private problem = createSignal("");
  private paused = 0;
  private storage?: Storage;
  private sync = () => this.restoreStorage();
  constructor(storage?: Storage) {
    try { this.storage = storage ?? (typeof localStorage !== "undefined" ? localStorage : undefined); this.restoreStorage(); }
    catch { this.problem[1]("Binding preferences are session-only: browser storage is unavailable."); }
    if (typeof window !== "undefined") { window.addEventListener("speedy-bindings-changed", this.sync); window.addEventListener("storage", this.sync); }
  }
  dispose() { if (typeof window !== "undefined") { window.removeEventListener("speedy-bindings-changed", this.sync); window.removeEventListener("storage", this.sync); } }
  warning = () => this.problem[0]();
  list = () => { this.revision[0](); return [...this.actions.values()]; };
  get(id: string) { return this.actions.get(id); }
  register(action: BindingAction) {
    if (this.actions.has(action.id)) throw new Error(`Duplicate binding action ${action.id}`);
    this.actions.set(action.id, action); this.rebuild();
    return () => { this.actions.delete(action.id); this.rebuild(); };
  }
  effective(id: string): Trigger[] { this.revision[0](); return this.overrides[id] ?? this.actions.get(id)?.defaults ?? []; }
  label(id: string) { return this.effective(id).map(triggerLabel).join(" / ") || "Unassigned"; }
  modified(id: string) { this.revision[0](); return Object.hasOwn(this.overrides, id); }
  suspend() { this.paused++; return () => { this.paused = Math.max(0, this.paused - 1); }; }
  matches(id: string, event: KeyboardEvent | MouseEvent) { return !this.paused && this.effective(id).some(t => triggerKey(t) === triggerKey(captureTrigger(event))); }
  dispatch(event: KeyboardEvent | MouseEvent, scopes: string[], run: BindingContext["run"]): boolean {
    if (event.defaultPrevented || (event instanceof KeyboardEvent && event.isComposing)) return false;
    return this.invoke(captureTrigger(event), scopes, { event, run });
  }
  dispatchCustom(name: string, scopes: string[], run: BindingContext["run"], payload?: unknown) {
    return this.invoke({ kind: "custom", name }, scopes, { payload, run });
  }
  private invoke(trigger: Trigger, scopes: string[], context: BindingContext) {
    if (this.paused) return false;
    const candidates = this.index.get(triggerKey(trigger)) ?? [];
    for (const scope of scopes) for (const action of candidates) {
      if (action.scope !== scope) continue;
      if (action.handler(context) === false) continue;
      context.event?.preventDefault(); context.event?.stopPropagation(); return true;
    }
    return false;
  }
  conflicts(id: string, triggers: Trigger[]) {
    const action = this.actions.get(id); if (!action) throw new Error("Unknown action");
    const keys = new Set(triggers.map(triggerKey));
    return this.list().filter(other => other.id !== id && scopesOverlap(action.scope, other.scope) && this.effective(other.id).some(t => keys.has(triggerKey(t))));
  }
  assign(id: string, triggers: Trigger[], reassign = false) {
    const validated = triggers.map(validateTrigger);
    if (new Set(validated.map(triggerKey)).size !== validated.length) throw new Error("Duplicate combination");
    const conflicts = this.conflicts(id, validated);
    if (conflicts.length && !reassign) throw new Error(`Already assigned to: ${conflicts.map(a => a.name).join(", ")}`);
    const next = { ...this.overrides, [id]: validated };
    const keys = new Set(validated.map(triggerKey));
    for (const conflict of conflicts) next[conflict.id] = this.effective(conflict.id).filter(t => !keys.has(triggerKey(t)));
    this.commit(next);
  }
  reset(id?: string) {
    if (!id) { this.commit(Object.create(null)); return; }
    const action = this.get(id); if (!action) throw new Error("Unknown action");
    if (this.conflicts(id, action.defaults).length) throw new Error("Default combination is in use. Remove the conflicting assignment first.");
    const next = { ...this.overrides }; delete next[id]; this.commit(next);
  }
  export() { return JSON.stringify({ version: 1, overrides: this.overrides }, null, 2); }
  import(text: string) {
    const next = this.parse(text);
    for (const id of Object.keys(next)) if (!this.actions.has(id)) throw new Error(`Unknown action: ${id}`);
    const actions = this.list();
    for (let i = 0; i < actions.length; i++) for (let j = i + 1; j < actions.length; j++) {
      const a = actions[i], b = actions[j];
      if (scopesOverlap(a.scope, b.scope) && (next[a.id] ?? a.defaults).some(t => (next[b.id] ?? b.defaults).some(u => triggerKey(t) === triggerKey(u)))) throw new Error(`Conflicting imported bindings: ${a.name} / ${b.name}`);
    }
    this.commit(next);
  }
  private parse(text: string): Record<string, Trigger[]> {
    if (text.length > 250000) throw new Error("Binding settings are too large");
    const data = JSON.parse(text);
    if (data?.version !== 1 || !data.overrides || typeof data.overrides !== "object" || Array.isArray(data.overrides)) throw new Error("Expected version 1 binding settings");
    const next: Record<string, Trigger[]> = Object.create(null);
    for (const [id, value] of Object.entries(data.overrides)) {
      if (!/^[a-zA-Z][\w.-]{0,100}$/.test(id) || !Array.isArray(value) || value.length > 20) throw new Error("Invalid binding override");
      next[id] = value.map(validateTrigger);
      if (new Set(next[id].map(triggerKey)).size !== next[id].length) throw new Error("Duplicate combination");
    }
    return next;
  }
  private restoreStorage() {
    try { const text = this.storage?.getItem(STORAGE_KEY); if (text) { this.overrides = this.parse(text); this.rebuild(); } }
    catch { this.problem[1]("Saved binding preferences could not be read; defaults/current settings are retained."); }
  }
  private commit(next: Record<string, Trigger[]>) {
    this.overrides = next; this.rebuild();
    try {
      if (!this.storage) throw new Error();
      this.storage.setItem(STORAGE_KEY, this.export()); this.problem[1]("");
      if (typeof window !== "undefined") window.dispatchEvent(new Event("speedy-bindings-changed"));
    } catch { this.problem[1]("Changes work for this session but could not be saved to browser storage. Export JSON to keep them."); }
  }
  private rebuild() {
    this.index.clear();
    for (const action of this.actions.values()) for (const trigger of this.overrides[action.id] ?? action.defaults) {
      const key = triggerKey(trigger); this.index.set(key, [...(this.index.get(key) ?? []), action]);
    }
    this.revision[1](n => n + 1);
  }
}
