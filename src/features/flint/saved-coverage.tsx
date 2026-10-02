import {Show} from 'solid-js';
import type {SavedProviderCoverage} from '../../feature-api/backlinks';
/** Saved substrate status is separate from composed live/query completeness. */
export function SavedCoverage(props:{value?:SavedProviderCoverage}){
 return <Show when={props.value}>{value=><p class="flint-saved-coverage" data-saved-provider={value().provider} data-saved-state={value().state}>
  {value().provider==='sqlite' ? (value().state==='verified'?'Saved knowledge: verified SQLite index.':value().state==='incomplete'?'Saved knowledge: incomplete SQLite coverage.':'Saved knowledge: SQLite coverage unknown. Refresh to retry.') : (value().state==='verified'?'Saved knowledge: verified file fallback; SQLite unavailable. Refresh to retry SQLite.':'Saved knowledge unavailable; file verification failed. Refresh to retry.')}
 </p>}</Show>;
}
