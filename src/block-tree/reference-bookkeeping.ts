import type { PlacementRecord } from './types';
// Qualification enrichment of the existing reference map, not a parallel adjacency map.
// Numeric entries retain the ordinary repository path. Single witnesses avoid a Set per Cell.
type Keys = string | Set<string> | undefined;
type Evidence = { count: number; owners: Keys; registrations: Keys };
const add = (keys: Keys, key: string): Keys => keys === undefined ? key : typeof keys === 'string' ? keys === key ? keys : new Set([keys, key]) : (keys.add(key), keys);
const remove = (keys: Keys, key: string): Keys => {
 if(typeof keys === 'string')return keys === key ? undefined : keys;
 if(!keys)return;keys.delete(key);return keys.size === 1 ? keys.values().next().value : keys.size ? keys : undefined;
};
const list = (keys: Keys): string[] => keys === undefined ? [] : typeof keys === 'string' ? [keys] : [...keys];
export class ReferenceBookkeeping {
 private entries = new Map<string, number | Evidence>();
 constructor(readonly enriched = false) {}
 get(key: string): number | undefined { const e=this.entries.get(key);return typeof e==='number'?e:e?.count; }
 clear(){this.entries.clear();}
 add(p: PlacementRecord){
  if(!this.enriched){this.entries.set(p.contentKey,(this.get(p.contentKey)??0)+1);return;}
  const e=this.entries.get(p.contentKey) as Evidence|undefined ?? {count:0,owners:undefined,registrations:undefined};e.count++;
  if(p.kind!=='reference')e.owners=add(e.owners,p.key);
  if(p.resourceRegistration)e.registrations=add(e.registrations,p.key);
  this.entries.set(p.contentKey,e);
 }
 remove(p: PlacementRecord){
  const old=this.entries.get(p.contentKey);if(old===undefined)throw Error('Missing reference bookkeeping');
  if(typeof old==='number'){if(old===1)this.entries.delete(p.contentKey);else this.entries.set(p.contentKey,old-1);return;}
  old.count--;old.owners=remove(old.owners,p.key);old.registrations=remove(old.registrations,p.key);if(!old.count)this.entries.delete(p.contentKey);
 }
 owned(key:string){const e=this.entries.get(key);return typeof e==='object'?list(e.owners):[];}
 registrations(key:string){const e=this.entries.get(key);return typeof e==='object'?list(e.registrations):[];}
}
