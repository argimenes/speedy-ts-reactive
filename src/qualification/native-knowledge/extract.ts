/** Qualification compatibility adapter. Full decoder/capture remains the independent reconstruction oracle. */
import {decodeNative} from '../../persistence/native-resource';
import {resourceToRepository} from '../../history/durable-core';
import {collectFacts as collect} from '../../knowledge/collect-facts';
import type {Facts as SemanticFacts} from '../../knowledge/facts';
import type {ResourceSnapshot} from '../../history/stage-c-gates/resource';
import type {RepositoryState} from '../../block-tree/types';
import type {DeepReadonly} from '../../block-tree/commit-capture';
import type {InlineReader,ObservationPolicy as ProductionObservationPolicy} from '../../knowledge/collect-facts';
export type {AnnotationFact,Mention,BlockFact} from '../../knowledge/facts';
export type {InlineFacts,InlineReader} from '../../knowledge/collect-facts';
export {PROFILE} from '../../knowledge/facts';
export interface ObservationPolicy extends ProductionObservationPolicy {opaque?:(type:string)=>boolean}
export interface Facts extends SemanticFacts {location:string;generation:string}
export const decode=decodeNative;
export async function collectFacts(state:RepositoryState,resourceId:string,location:string,generation:string,signal?:AbortSignal,inlineReader?:InlineReader,policy?:ObservationPolicy):Promise<Facts>{
 const extraction=policy?.opaque?{version:1 as const,opaqueTypes:[...new Set(Object.values(state.contents).filter(c=>policy.opaque!(c.viewType)).map(c=>c.viewType))]}:policy?.extraction;
 return {...await collect(state,resourceId,signal,inlineReader,{...policy,extraction}),location,generation};
}
export async function extract(resource:DeepReadonly<ResourceSnapshot>,location:string,generation:string,signal?:AbortSignal,inlineReader?:InlineReader,policy?:ObservationPolicy):Promise<Facts>{
 return collectFacts(resourceToRepository(resource),resource.resourceId,location,generation,signal,inlineReader,policy);
}
