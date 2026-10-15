import { batch } from 'solid-js';
import { createStore } from 'solid-js/store';

export interface AnnotationRange {
  key: string;
  index: number;
  id?: string;
  type: string;
  start: number;
  /** Inclusive character index; caret boundaries use [start, end + 1). */
  end: number;
  isZeroWidth?: boolean;
}
export interface AnnotationRangeEvent {
  type: 'caret-in-range' | 'caret-out-of-range';
  nodeKey: string;
  annotation: Readonly<AnnotationRange>;
  caret?: number;
  reason?: 'caret' | 'ranges' | 'dispose';
}
export type RangeTransitionEvent = Omit<AnnotationRangeEvent,'type'> & {type:'caret-enter'|'caret-leave'};
interface IntervalNode {
  center: number;
  starts: AnnotationRange[];
  ends: AnnotationRange[];
  left?: IntervalNode;
  right?: IntervalNode;
}
/** Built on range changes, never on caret movement. Centered intervals make
 * overlapping-range queries O(log n + matches), without DOM/geometry reads. */
function build(ranges: AnnotationRange[]): IntervalNode | undefined {
  if (!ranges.length) return;
  const middle = ranges[ranges.length >> 1];
  const center = (middle.start + middle.end + 1) / 2, left: AnnotationRange[] = [], right: AnnotationRange[] = [], crossing: AnnotationRange[] = [];
  for (const range of ranges) {
    if (range.end + 1 <= center) left.push(range);
    else if (range.start > center) right.push(range);
    else crossing.push(range);
  }
  return { center, starts: crossing.sort((a,b) => a.start-b.start), ends: [...crossing].sort((a,b) => b.end-a.end), left: build(left), right: build(right) };
}
function query(node: IntervalNode | undefined, caret: number, found: Map<string, AnnotationRange>) {
  if (!node) return;
  if (caret < node.center) {
    for (const r of node.starts) { if (r.start > caret) break; found.set(r.key,r); }
    query(node.left,caret,found);
  } else {
    for (const r of node.ends) { if (r.end + 1 <= caret) break; found.set(r.key,r); }
    query(node.right,caret,found);
  }
}

/** Transient, occurrence-local events. Never stored in the Document or history. */
export class AnnotationRangeEvents {
  private disposed = false;
  private keyed = new Map<string, Map<string, Set<(event: AnnotationRangeEvent) => void>>>();
  private points = new Map<string, Map<number,AnnotationRange[]>>();
  private ranges = new Map<string, IntervalNode | undefined>();
  private active = new Map<string, AnnotationRange>();
  private nodeKey?: string;
  private caret?: number;
  private listeners = new Set<(event: AnnotationRangeEvent) => void>();
  private state = createStore<Record<string, Record<string, boolean>>>({});
  isActive(nodeKey: string, annotationKey: string) { return this.state[0][nodeKey]?.[annotationKey] ?? false; }
  subscribe(listener: (event: AnnotationRangeEvent) => void) {
    if(this.disposed)return () => {};
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }
  subscribeTransitions(listener:(event:RangeTransitionEvent)=>void) {
    return this.subscribe(event=>listener({...event,type:event.type==='caret-in-range'?'caret-enter':'caret-leave'}));
  }
  watch(nodeKey:string,key:string,listener:(event:AnnotationRangeEvent)=>void) {
    if(this.disposed)return ()=>{};
    let node=this.keyed.get(nodeKey);if(!node)this.keyed.set(nodeKey,node=new Map());
    let listeners=node.get(key);if(!listeners)node.set(key,listeners=new Set());listeners.add(listener);
    return ()=>{listeners!.delete(listener);if(!listeners!.size)node!.delete(key);if(!node!.size)this.keyed.delete(nodeKey);};
  }
  setRanges(nodeKey: string, ranges: AnnotationRange[]) {
    if(this.disposed)return;
    if (!this.state[0][nodeKey]) this.state[1](nodeKey,{});
    const points=new Map<number,AnnotationRange[]>();
    for(const range of ranges)if(range.isZeroWidth&&Number.isInteger(range.start)&&range.start>=0){const list=points.get(range.start)??[];list.push(Object.freeze({...range}));points.set(range.start,list);}
    this.points.set(nodeKey,points);
    this.ranges.set(nodeKey,build(ranges.filter(r => !r.isZeroWidth && Number.isInteger(r.start) && Number.isInteger(r.end) && r.start >= 0 && r.end >= r.start).map(r => Object.freeze({...r})).sort((a,b) => (a.start+a.end)-(b.start+b.end))));
    if (this.nodeKey === nodeKey) this.transition(nodeKey,this.caret,'ranges');
  }
  setCaret(nodeKey?: string, caret?: number) {
    if (this.disposed)return;
    if (nodeKey === this.nodeKey && caret === this.caret) return;
    this.transition(nodeKey,caret);
  }
  private transition(nodeKey?: string, caret?: number, reason: AnnotationRangeEvent['reason'] = 'caret') {
    const next = new Map<string, AnnotationRange>();
    if (nodeKey && caret !== undefined) {
      query(this.ranges.get(nodeKey),caret,next);
      for(const range of this.points.get(nodeKey)?.get(caret)??[])next.set(range.key,range);
    }
    const events: AnnotationRangeEvent[] = [];
    const previousKey = this.nodeKey;
    batch(() => {
      for (const [key, annotation] of this.active) if (nodeKey !== previousKey || !next.has(key)) {
        this.state[1](previousKey!,key,undefined!);
        events.push({type:'caret-out-of-range',nodeKey:previousKey!,annotation,reason,caret:nodeKey===previousKey?caret:undefined});
      }
      for (const [key, annotation] of next) if (nodeKey !== previousKey || !this.active.has(key)) {
        if (!this.state[0][nodeKey!]) this.state[1](nodeKey!,{});
        this.state[1](nodeKey!,key,true);
        events.push({type:'caret-in-range',nodeKey:nodeKey!,annotation,caret,reason});
      }
      this.active=next; this.nodeKey=nodeKey; this.caret=caret;
    });
    for (const event of events) {
      // An earlier handler can remove another range before this batch finishes.
      if(event.type==='caret-in-range'&&!this.isActive(event.nodeKey,event.annotation.key))continue;
      for(const listener of [...(this.keyed.get(event.nodeKey)?.get(event.annotation.key) ?? []), ...this.listeners]) {
        try { listener(event); } catch(error) { console.error('Range event listener failed',error); }
      }
    }
  }
  remove(nodeKey: string) {
    if (this.nodeKey === nodeKey) this.setCaret();
    this.points.delete(nodeKey);
    this.ranges.delete(nodeKey); this.state[1](nodeKey,undefined!);
  }
  dispose() { if(this.disposed)return;this.transition(undefined,undefined,'dispose');this.disposed=true;this.ranges.clear();this.points.clear();this.listeners.clear();this.keyed.clear(); }
}
