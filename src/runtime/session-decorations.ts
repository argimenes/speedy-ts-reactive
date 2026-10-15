import type { EffectParams, RendererBinding, PropertyTypeDefinition } from "./visual-effect-registry";
import { immutable } from "./effect-contributions";
import { batch } from "solid-js";
import { createStore } from "solid-js/store";
import type { SearchMatchSet } from "./text-search";
import type { TextRangeSnapshot } from "./text-ranges";
export interface TemporaryRange {
  id: string;
  range: TextRangeSnapshot;
  type?: string;
  attributes?: EffectParams;
  renderers?: readonly RendererBinding[];
  states?: PropertyTypeDefinition['states'];
  stateOrder?: readonly string[];
  events?: PropertyTypeDefinition['events'];
}
export interface TemporaryRangeCollection {
  replace(ranges: readonly TemporaryRange[]): void;
  upsert(range: TemporaryRange): void;
  remove(id: string): void;
  dispose(): void;
}
export interface SessionDecoration {
  runtimeKey: string;
  temporary?: TemporaryRange;
  renderers: readonly RendererBinding[]; type: string; owner: string; id: string; range: TextRangeSnapshot; fill: string; active: boolean; priority: number; excludable: boolean; excludeLabel?: string; excludeTitle?: string }
interface DecorationMatch { temporary?: TemporaryRange; id: string; ranges: TextRangeSnapshot[]; capabilities: { highlight: boolean } }
interface Layer { matches: DecorationMatch[]; visible: boolean; hidden: Set<string>; invalid: Set<string>; active?: string; type: string; fill: string; priority: number; excludeLabel?: string; excludeTitle?: string; exclude?: (id: string, context: { keyboard: boolean }) => void }
/** Entirely outside canonical state. Indexed by occurrence so editing one Block does not wake every view. */
export class SessionDecorations {
  readonly nodes: Record<string, SessionDecoration[]>;
  private setNodes;
  private disposed = false;
  private claims = new Set<string>();
  private validate?: (ranges: readonly TextRangeSnapshot[]) => void;
  private validateEffects?: (range:TemporaryRange) => void;
  configureValidation(validate: (ranges: readonly TextRangeSnapshot[]) => void, effects?: (range:TemporaryRange)=>void) { this.validate = validate; this.validateEffects=effects; }
  private assertLive() { if (this.disposed) throw Error("Temporary ranges are disposed"); }
  private owners = new Map<string, Layer>();
  private contentIndex = new Map<string, { nodes: Set<string>; matches: { layer: Layer; owner:string; match: DecorationMatch }[] }>();
  constructor() { [this.nodes, this.setNodes] = createStore<Record<string, SessionDecoration[]>>({}); }
  attachMatches(owner: string, set: SearchMatchSet, style: { type?: string; fill?: string; priority?: number; excludeLabel?: string; excludeTitle?: string; exclude?: (id: string, context: { keyboard: boolean }) => void } = {}) {
    this.assertLive();
    const previous = this.owners.get(owner);
    this.owners.set(owner, { matches: set.matches, visible: previous?.visible ?? true, hidden: new Set(), invalid:new Set(), type: style.type ?? "editor/search-match", fill: style.fill ?? "#ffd34d", priority: style.priority ?? 0, exclude: style.exclude, excludeLabel: style.excludeLabel, excludeTitle: style.excludeTitle });
    this.rebuild();
  }
  attachRanges(owner: string, ranges: TextRangeSnapshot[], style: { type?: string; fill?: string; priority?: number } = {}) {
    this.assertLive();
    this.owners.set(owner, { matches: [{ id: owner, ranges, capabilities: { highlight: true } }], visible: true, hidden: new Set(), invalid:new Set(), type: style.type ?? "editor/range-preview", fill: style.fill ?? "#ffd34d", priority: style.priority ?? 0 });
    this.rebuild();
  }
  /** One collection per feature/interaction. Callers bind dispose to their Solid/feature owner. */
  createCollection(owner: string): TemporaryRangeCollection {
    this.assertLive();
    if (!owner || this.claims.has(owner) || this.owners.has(owner)) throw Error('Temporary range owner already in use');
    this.claims.add(owner);
    let live = true;
    const items = new Map<string, TemporaryRange>();
    const check = () => { this.assertLive(); if (!live) throw Error('Temporary range collection is disposed'); };
    const admit = (ranges: readonly TemporaryRange[]) => {
      const ids = new Set<string>();
      for (const item of ranges) {
        if (!item.id || ids.has(item.id)) throw Error('Temporary range IDs must be unique'); ids.add(item.id);
        const r = item.range;
        if (!r || !Number.isInteger(r.start) || !Number.isInteger(r.end) || r.start < 0 || r.end <= r.start) throw Error('Invalid temporary range');
      }
      this.validate?.(ranges.map(item => item.range));
      for(const item of ranges)this.validateEffects?.(item);
      return ranges.map(item => immutable(structuredClone(item)) as TemporaryRange);
    };
    const publish = () => {
      // Invalidation is terminal for an old snapshot even if a provider updates
      // a different item or toggles visibility later.
      for(const [id,item] of items)try{this.validate?.([item.range]);}catch{items.delete(id);}
      this.owners.set(owner, { matches: [...items.values()].map(temporary => ({ id: temporary.id, ranges: [temporary.range], temporary, capabilities: {highlight:true} })), visible:true, hidden:new Set(), invalid:new Set(), type:'editor/temporary-range', fill:'#ffd34d', priority:0 });
      this.rebuild();
    };
    return {
      replace: ranges => { check(); const next=admit(ranges); items.clear(); for(const r of next) items.set(r.id,r); publish(); },
      upsert: range => { check(); const [next]=admit([range]); items.set(next.id,next); publish(); },
      remove: id => { check(); items.delete(id); publish(); },
      dispose: () => { if(!live)return;live=false;items.clear();this.claims.delete(owner);this.disposeSession(owner); },
    };
  }
  /** Release only this mounted occurrence; other views of shared content survive. */
  removeOccurrence(nodeKey: string) {
    let changed=false;
    for(const layer of this.owners.values()) layer.matches=layer.matches.map(match => {
      const next=match.ranges.filter(range=>range.nodeKey!==nodeKey);
      if(next.length===match.ranges.length)return match;
      changed=true;return {...match,ranges:next};
    });
    if(changed)this.rebuild();
  }
  dispose() { if(this.disposed)return; this.disposed=true; this.clearAll(); this.claims.clear(); }
  setHighlightsVisible(owner: string, visible: boolean) { const layer = this.owners.get(owner); if (layer) { layer.visible = visible; this.rebuild(); } }
  setMatchVisible(owner: string, id: string, visible: boolean) { const layer = this.owners.get(owner); if (layer) { visible ? layer.hidden.delete(id) : layer.hidden.add(id); this.rebuild(); } }
  setActiveMatch(owner: string, id?: string) { const layer = this.owners.get(owner); if (layer) { layer.active = id; this.rebuild(); } }
  clearHighlights(owner: string) { this.owners.delete(owner); this.rebuild(); }
  disposeSession(owner: string) { this.clearHighlights(owner); }
  exclude(owner: string, id: string, keyboard = false) { this.owners.get(owner)?.exclude?.(id, { keyboard }); }
  /** Called only for changed content; does not scan text or measure geometry. */
  invalidateContent(contentKey: string) {
    const affected = this.contentIndex.get(contentKey); if (!affected) return;
    const removals=new Map<string,Set<string>>();
    for(const {layer,owner,match} of affected.matches){
      layer.invalid.add(match.id);
      for(const range of match.ranges){const keys=removals.get(range.nodeKey)??new Set();keys.add(JSON.stringify([owner,match.id]));removals.set(range.nodeKey,keys);}
    }
    batch(()=>{for(const [node,keys] of removals)this.setNodes(node,(current:SessionDecoration[]|undefined)=>(current??[]).filter(d=>!keys.has(JSON.stringify([d.owner,d.id]))));});
    this.contentIndex.delete(contentKey);
  }

  clearAll() { this.owners.clear(); this.rebuild(); }
  private rebuild() {
    const next: Record<string, SessionDecoration[]> = {};
    this.contentIndex.clear();
    for (const [owner, layer] of this.owners) for (const match of layer.matches) {
      for (const range of match.ranges) {
        let entry = this.contentIndex.get(range.contentKey);
        if (!entry) this.contentIndex.set(range.contentKey, entry = { nodes: new Set(), matches: [] });
        entry.nodes.add(range.nodeKey); entry.matches.push({ layer, owner, match });
      }
      if (!layer.visible || layer.hidden.has(match.id) || layer.invalid.has(match.id) || !match.capabilities.highlight) continue;
      for (const [index,range] of match.ranges.entries()) (next[range.nodeKey] ??= []).push({
        runtimeKey: JSON.stringify([owner,match.id,range.nodeKey,index]), temporary: match.temporary,
        renderers: match.temporary ? match.temporary.renderers ?? [] : [{id:'highlight',name:'svg-highlight',params:{color:layer.fill}}, ...(layer.active===match.id?[{id:'active',name:'svg-outline',params:{color:'#8a5100'}}]:[])],
        owner, type: match.temporary?.type ?? layer.type, id: match.id, range, fill: layer.fill, active: layer.active === match.id, priority: layer.priority, excludeLabel: layer.excludeLabel, excludeTitle: layer.excludeTitle, excludable: !!layer.exclude && index === match.ranges.length - 1 });
    }
    batch(() => { for (const key of new Set([...Object.keys(this.nodes), ...Object.keys(next)])) {
      const value = (next[key] ?? []).sort((a,b) => a.priority - b.priority);
      if (JSON.stringify(this.nodes[key] ?? []) !== JSON.stringify(value)) this.setNodes(key, value);
    } });
  }
}
