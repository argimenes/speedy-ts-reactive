/** Semantic resolver contract. No persistence rows, SQL or editor access. */
export interface CanonicalEntity { id:string; name:string; revision:number; typename?:string|null; description?:string|null; attributes?:unknown; aliases:Array<{id:string;name:string;origin:string;revision:number}> }
export type EntityStream = 'all'|'name'|'alias'|'mention';
export interface EntityResolutionQuery {query:string;stream:EntityStream;match:'exact'|'partial';scope:'document'|'vault'}
export interface EntityEvidence {kind:string;text:string;resourceId?:string;mentionId?:string;ranges?:readonly {blockId:string;start:number;end:number}[]}
export interface EntityCandidate {id:string;name:string;evidence:EntityEvidence[];localMentions:number}
export interface EntityResolution {candidates:EntityCandidate[];complete:boolean;diagnostics:string[];current():void}
export interface EntityService {
 search(query:EntityResolutionQuery,signal:AbortSignal):Promise<EntityResolution>;
 summaries(ids:string[],signal?:AbortSignal):Promise<{rows:Array<{id:string;name:string;mentions?:number}>;complete:boolean;diagnostics:string[]}>;
 get(id:string,signal?:AbortSignal):Promise<CanonicalEntity|undefined>;
 /** A confirmed rejection before canonical worker dispatch carries entityCreationOutcome: 'not-created'. Other failures remain unconfirmed. */
 create(input:{id:string;operationId:string;name:string;typename?:string|null;description?:string|null;attributes?:unknown},signal?:AbortSignal):Promise<CanonicalEntity>;
 update?(input:{id:string;operationId:string;expected:number;name?:string;typename?:string|null;description?:string|null;attributes?:unknown},signal?:AbortSignal):Promise<CanonicalEntity>;
 rename(input:{id:string;name:string;expected:number;operationId:string}):Promise<CanonicalEntity>;
 alias(input:{op:'alias-add'|'alias-update'|'alias-remove';id:string;entityId:string;name?:string;expected?:number;operationId:string}):Promise<CanonicalEntity>;
 dispose():void;
}
