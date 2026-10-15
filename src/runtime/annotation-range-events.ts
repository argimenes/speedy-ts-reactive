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
}
export interface AnnotationRangeEvent {
  type: 'caret-in-range' | 'caret-out-of-range';
  nodeKey: string;
  annotation: Readonly<AnnotationRange>;
  caret?: number;
}
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
  private ranges = new Map<string, IntervalNode | undefined>();
  private active = new Map<string, AnnotationRange>();
  private nodeKey?: string;
  private caret?: number;
  private listeners = new Set<(event: AnnotationRangeEvent) => void>();
  private state = createStore<Record<string, Record<string, boolean>>>({});
  isActive(nodeKey: string, annotationKey: string) { return this.state[0][nodeKey]?.[annotationKey] ?? false; }
  subscribe(listener: (event: AnnotationRangeEvent) => void) {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }
  setRanges(nodeKey: string, ranges: AnnotationRange[]) {
    if (!this.state[0][nodeKey]) this.state[1](nodeKey,{});
    this.ranges.set(nodeKey,build(ranges.filter(r => Number.isInteger(r.start) && Number.isInteger(r.end) && r.start >= 0 && r.end >= r.start).map(r => Object.freeze({...r})).sort((a,b) => (a.start+a.end)-(b.start+b.end))));
    if (this.nodeKey === nodeKey) this.transition(nodeKey,this.caret);
  }
  setCaret(nodeKey?: string, caret?: number) {
    if (nodeKey === this.nodeKey && caret === this.caret) return;
    this.transition(nodeKey,caret);
  }
  private transition(nodeKey?: string, caret?: number) {
    const next = new Map<string, AnnotationRange>();
    if (nodeKey && caret !== undefined) query(this.ranges.get(nodeKey),caret,next);
    const events: AnnotationRangeEvent[] = [];
    const previousKey = this.nodeKey;
    batch(() => {
      for (const [key, annotation] of this.active) if (nodeKey !== previousKey || !next.has(key)) {
        this.state[1](previousKey!,key,undefined!);
        events.push({type:'caret-out-of-range',nodeKey:previousKey!,annotation,caret:nodeKey===previousKey?caret:undefined});
      }
      for (const [key, annotation] of next) if (nodeKey !== previousKey || !this.active.has(key)) {
        if (!this.state[0][nodeKey!]) this.state[1](nodeKey!,{});
        this.state[1](nodeKey!,key,true);
        events.push({type:'caret-in-range',nodeKey:nodeKey!,annotation,caret});
      }
      this.active=next; this.nodeKey=nodeKey; this.caret=caret;
    });
    for (const event of events) for (const listener of this.listeners) listener(event);
  }
  remove(nodeKey: string) {
    if (this.nodeKey === nodeKey) this.setCaret();
    this.ranges.delete(nodeKey); this.state[1](nodeKey,undefined!);
  }
  dispose() { this.setCaret(); this.ranges.clear(); this.listeners.clear(); }
}
