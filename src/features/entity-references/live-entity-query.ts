import { createSignal, type Accessor, type Setter } from 'solid-js';
import type { LiveDocumentEntities, LiveEntitySnapshot, LiveEntityRow } from '../../feature-api/live-entities';
import type { CanonicalEntity, EntityService, EntityResolutionQuery, EntityCandidate } from '../../feature-api/entities';

/** Metadata is separate from live link counts. Typing never triggers canonical reads. */
export class LiveEntityQuery {
  private snapshot: Accessor<LiveEntitySnapshot>;
  private setSnapshot: Setter<LiveEntitySnapshot>;
  private metadata: Accessor<Map<string,CanonicalEntity>>;
  private setMetadata: Setter<Map<string,CanonicalEntity>>;
  private pending: Accessor<number>;
  private setPending: Setter<number>;
  private stop:()=>void;
  private controller=new AbortController();
  private attempted=new Set<string>();
  private loading=new Set<string>();
  private epoch=0;
  private presentations=new Map<string,{source:LiveEntityRow;entity?:CanonicalEntity;row:LiveEntityRow & EntityCandidate & {unresolved:boolean}}>();
  constructor(readonly inventory:LiveDocumentEntities, private service?:EntityService) {
    [this.snapshot,this.setSnapshot]=createSignal(inventory.read());
    [this.metadata,this.setMetadata]=createSignal(new Map<string,CanonicalEntity>());
    [this.pending,this.setPending]=createSignal(0);
    const update=()=>{
      const snapshot=inventory.read(), ids=new Set(snapshot.rows.map(row=>row.id));
      for(const id of this.presentations.keys())if(!ids.has(id))this.presentations.delete(id);
      this.setSnapshot(snapshot);this.hydrate();
    };
    this.stop=inventory.subscribe(update);this.hydrate();
  }
  private hydrate() {
    if(this.controller.signal.aborted||!this.service)return;
    const next=this.snapshot().rows.filter(r=>!this.attempted.has(r.id)).slice(0,Math.max(0,4-this.loading.size));
    for(const row of next){
      this.attempted.add(row.id);this.loading.add(row.id);this.setPending(this.loading.size);
      const epoch=this.epoch;
      void this.service.get(row.id,this.controller.signal).then(entity=>{
        if(epoch!==this.epoch||this.controller.signal.aborted||!entity)return;
        this.setMetadata(old=>new Map(old).set(entity.id,entity));
      }).catch(()=>{/* Local identities and counts remain available. */}).finally(()=>{
        if(epoch!==this.epoch||this.controller.signal.aborted)return;
        this.loading.delete(row.id);this.setPending(this.loading.size);this.hydrate();
      });
    }
  }
  refresh(entity?:CanonicalEntity) {
    if(entity){this.setMetadata(old=>new Map(old).set(entity.id,entity));return;}
    this.epoch++;this.controller.abort();this.controller=new AbortController();this.attempted.clear();this.loading.clear();this.setPending(0);this.setMetadata(new Map());this.hydrate();
  }
  snapshotValue() { return this.snapshot(); }
  busy() { return this.pending()>0; }
  incomplete() { return this.snapshot().rows.some(row=>!this.metadata().has(row.id)); }
  rows(query:string,field:EntityResolutionQuery['stream'],match:EntityResolutionQuery['match']) {
    const q=query.toLocaleLowerCase(), metadata=this.metadata();
    const matches=(s:string)=>match==='exact'?s.toLocaleLowerCase()===q:s.toLocaleLowerCase().includes(q);
    return this.snapshot().rows.flatMap(row=>{
      const entity=metadata.get(row.id), name=entity?.name??row.fallbackName??row.id;
      const fields=[...(field==='all'||field==='name'?[name]:[]),...(field==='all'||field==='alias'?entity?.aliases.map(a=>a.name)??[]:[]),...(field==='all'||field==='mention'?row.forms:[])];
      if(query&&!fields.some(matches))return [];
      let cached=this.presentations.get(row.id);
      if(cached?.source!==row||cached.entity!==entity){
        cached={source:row,entity,row:{...row,name,unresolved:!entity,evidence:[{kind:'local',text:row.forms.slice(0,3).join(' · ')}],localMentions:row.occurrences}};
        this.presentations.set(row.id,cached);
      }
      return [cached.row];
    }).sort((a,b)=>b.occurrences-a.occurrences||a.name.localeCompare(b.name)||a.id.localeCompare(b.id));
  }
  dispose() { this.epoch++;this.controller.abort();this.stop();this.inventory.dispose(); }
}
