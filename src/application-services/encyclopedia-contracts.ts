import type {ArticleCapture,EnrichmentCapture,WikiSnapshot,WikiInput} from '../interchange/encyclopedia';
import type {JobSummary} from './contracts';
export interface EncyclopediaOperations {
 'encyclopedia.import':{input:{id:string;source:string};output:ArticleCapture};
 'encyclopedia.enrich':{input:{id:string;snapshotId:string};output:EnrichmentCapture};
 'encyclopedia.resume':{input:{id:string};output:ArticleCapture|EnrichmentCapture};
 'encyclopedia.inspect':{input:{id:string};output:{job:JobSummary;source:string}};
 'encyclopedia.review':{input:{operationId:string;snapshotId:string;statementId:string;decision:'accepted'|'rejected'};output:{statementId:string;decision:string;claimGuid?:string}};
}
export const encyclopediaOperations=['encyclopedia.import','encyclopedia.enrich','encyclopedia.resume','encyclopedia.inspect','encyclopedia.review'] as const;
export type EncyclopediaTask={kind:'encyclopedia-normalize';source:WikiInput|string;responses:Uint8Array[]};
export type EncyclopediaProjection=import('../interchange/encyclopedia').ArticleProjection|import('../interchange/encyclopedia').WikidataProjection;
export interface EncyclopediaCapture {endpoint:string;responses:Uint8Array[]}
export interface EncyclopediaCapabilities {
 cavernId:string;jobs:import('./capabilities').JobStorage;executor:import('./capabilities').Executor;
 knowledge(request:any,signal?:AbortSignal):Promise<any>;
 acquire(source:WikiInput|string,signal:AbortSignal):Promise<EncyclopediaCapture>;
 retain(bytes:Uint8Array,signal:AbortSignal):Promise<WikiSnapshot['assets'][number]>;
 original(asset:WikiSnapshot['assets'][number],signal:AbortSignal):Promise<Uint8Array>;
 uuid():string;now():string;
}
