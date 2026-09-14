import { batch } from "solid-js";
import { createStore } from "solid-js/store";
import type { SearchMatchSet, SearchRange } from "./text-search";
export interface SessionDecoration { type: string; owner: string; id: string; range: SearchRange; fill: string; active: boolean; priority: number; excludable: boolean }
interface Layer { set: SearchMatchSet; visible: boolean; hidden: Set<string>; active?: string; type: string; fill: string; priority: number; exclude?: (id: string) => void }
/** Entirely outside canonical state. Indexed by occurrence so editing one Block does not wake every view. */
export class SessionDecorations {
  readonly nodes: Record<string, SessionDecoration[]>;
  private setNodes;
  private owners = new Map<string, Layer>();
  private contentIndex = new Map<string, { nodes: Set<string>; matches: { layer: Layer; id: string }[] }>();
  constructor() { [this.nodes, this.setNodes] = createStore<Record<string, SessionDecoration[]>>({}); }
  attachMatches(owner: string, set: SearchMatchSet, style: { type?: string; fill?: string; priority?: number; exclude?: (id: string) => void } = {}) {
    const previous = this.owners.get(owner);
    this.owners.set(owner, { set, visible: previous?.visible ?? true, hidden: new Set(), type: style.type ?? "editor/search-match", fill: style.fill ?? "#ffd34d", priority: style.priority ?? 0, exclude: style.exclude });
    this.rebuild();
  }
  setHighlightsVisible(owner: string, visible: boolean) { const layer = this.owners.get(owner); if (layer) { layer.visible = visible; this.rebuild(); } }
  setMatchVisible(owner: string, id: string, visible: boolean) { const layer = this.owners.get(owner); if (layer) { visible ? layer.hidden.delete(id) : layer.hidden.add(id); this.rebuild(); } }
  setActiveMatch(owner: string, id?: string) { const layer = this.owners.get(owner); if (layer) { layer.active = id; this.rebuild(); } }
  clearHighlights(owner: string) { this.owners.delete(owner); this.rebuild(); }
  disposeSession(owner: string) { this.clearHighlights(owner); }
  exclude(owner: string, id: string) { this.owners.get(owner)?.exclude?.(id); }
  /** Called only for changed content; does not scan text or measure geometry. */
  invalidateContent(contentKey: string) {
    const affected = this.contentIndex.get(contentKey); if (!affected) return;
    batch(() => { for (const key of affected.nodes) this.setNodes(key, []); });
    // Prevent a later visibility toggle resurrecting stale ranges.
    for (const { layer, id } of affected.matches) layer.hidden.add(id);
    this.contentIndex.delete(contentKey);
  }
  clearAll() { this.owners.clear(); this.rebuild(); }
  private rebuild() {
    const next: Record<string, SessionDecoration[]> = {};
    this.contentIndex.clear();
    for (const [owner, layer] of this.owners) for (const match of layer.set.matches) {
      for (const range of match.ranges) {
        let entry = this.contentIndex.get(range.contentKey);
        if (!entry) this.contentIndex.set(range.contentKey, entry = { nodes: new Set(), matches: [] });
        entry.nodes.add(range.nodeKey); entry.matches.push({ layer, id: match.id });
      }
      if (!layer.visible || layer.hidden.has(match.id) || !match.capabilities.highlight) continue;
      for (const [index,range] of match.ranges.entries()) (next[range.nodeKey] ??= []).push({ owner, type: layer.type, id: match.id, range, fill: layer.fill, active: layer.active === match.id, priority: layer.priority, excludable: !!layer.exclude && index === match.ranges.length - 1 });
    }
    batch(() => { for (const key of new Set([...Object.keys(this.nodes), ...Object.keys(next)])) {
      const value = (next[key] ?? []).sort((a,b) => a.priority - b.priority);
      if (JSON.stringify(this.nodes[key] ?? []) !== JSON.stringify(value)) this.setNodes(key, value);
    } });
  }
}
