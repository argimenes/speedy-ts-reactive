/** Legacy qualification harness adapter; production does not use location as identity. */
import {prepareLightweightFacts as prepare} from '../../knowledge/saved-reader';
import {parseNativeEnvelope} from '../../persistence/native-resource';
import type {ObservationPolicy} from './extract';
export function prepareLightweightFacts(bytes:Uint8Array,signal?:AbortSignal){
 const p=prepare(bytes,signal);
 return {resourceId:p.inspection.resourceId,validationMs:p.validationMs,async materialize(location:string,generation:string,signal?:AbortSignal,policy?:ObservationPolicy){
  const extraction=policy?.opaque?{version:1 as const,opaqueTypes:[...new Set(parseNativeEnvelope(bytes).document.blocks.map(b=>b.type).filter(t=>policy.opaque!(t)))]}:policy?.extraction;
  const r=await p.materialize(signal,{...policy,extraction});return {...r,facts:{...r.facts,location,generation}};
 }};
}
export async function lightweightFacts(bytes:Uint8Array,location:string,generation:string,signal?:AbortSignal,policy?:ObservationPolicy){
 return prepareLightweightFacts(bytes,signal).materialize(location,generation,signal,policy);
}
