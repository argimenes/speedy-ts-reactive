import { createStore } from 'solid-js/store';
import type { CanonicalEntity, EntityResolutionQuery } from '../../feature-api/entities';
import type { EntitySearchData } from './entity-search';

export type LerSource = EntityResolutionQuery['scope'] | 'live' | 'blend' | 'session' | 'day' | 'week';
/** Feature-owned interaction state. No persistence or composition infrastructure. */
export class LerSession {
  readonly id = crypto.randomUUID();
  readonly origin: Readonly<Pick<EntitySearchData, 'entityRanges' | 'entityQuery' | 'entityRevision'>>;
  readonly state;
  private set;
  constructor(data: EntitySearchData, readonly ownerKey: string, completion = false) {
    this.origin = Object.freeze({entityRanges: Object.freeze(data.entityRanges.map(r => Object.freeze({...r}))) as unknown as EntitySearchData['entityRanges'], entityQuery:data.entityQuery, entityRevision:data.entityRevision});
    [this.state, this.set] = createStore<{
      source: LerSource; graphQuery: string; documentFilter: string;
      field: EntityResolutionQuery['stream']; match: EntityResolutionQuery['match'];
      mode: 'command' | 'edit'; view: 'results' | 'review' | 'details' | 'create' | 'commands' | 'source' | 'authority';
      prepared?: Pick<CanonicalEntity,'id'|'name'|'revision'>;
    }>({source:completion?'blend':'vault',graphQuery:data.workstation?.query??data.entityQuery,documentFilter:'',field:'all',match:'partial',mode:'command',view:'results'});
  }
  query() { return this.state.source === 'live' ? this.state.documentFilter : this.state.graphQuery; }
  input(value: string) { this.set(this.state.source === 'live' ? 'documentFilter' : 'graphQuery', value); }
  source(value: LerSource) { this.set('source', value); }
  field(value: EntityResolutionQuery['stream']) { this.set('field',value); }
  match(value: EntityResolutionQuery['match']) { this.set('match',value); }
  mode(value: 'command'|'edit') { this.set('mode',value); }
  view(value: typeof this.state.view) { this.set('view',value); }
  prepare(entity?: CanonicalEntity) { this.set('prepared', entity ? {id:entity.id,name:entity.name,revision:entity.revision} : undefined); }
}
