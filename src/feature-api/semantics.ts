/** Vault-scoped canonical semantic DTOs. Values/attributes are decoded at this boundary. */
export type SemanticRecordType = 'Time'|'Claim'|'ClaimParticipant'|'ClaimQualifier'|'ClaimEvidence'|'DataSet'|'DataPoint'|'DataPointDimension'|'DataSetMembership';
export interface CanonicalSemanticRecord { guid?:string; entityGuid?:string; revision:number; attributes:unknown; createdByActorGuid:string|null; createdUtc:string|null; lastUpdatedByActorGuid:string|null; modifiedUtc:string|null; [field:string]:unknown }
export interface IncidenceInput {guid:string;entityGuid:string;role:string|null;ordinal:number;attributes?:unknown}
export interface ClaimInput {guid:string;expression?:string|null;kind?:string|null;attributes?:unknown;participants?:IncidenceInput[];qualifiers?:Array<IncidenceInput&{role:string}>}
export interface DataPointInput {guid:string;name?:string|null;value:unknown;valueType?:string;attributes?:unknown;dimensions?:Array<IncidenceInput&{role:string}>}
export interface DataSetInput {guid:string;name?:string|null;attributes?:unknown}
export interface TimeInput {guid:string;entity?:{name:string;attributes?:unknown};expectedEntityRevision?:number;expression?:string|null;attributes?:unknown;startYear?:number|null;startMonth?:number|null;startDay?:number|null;startHour?:number|null;startMinute?:number|null;startSecond?:number|null;endYear?:number|null;endMonth?:number|null;endDay?:number|null;endHour?:number|null;endMinute?:number|null;endSecond?:number|null;precision?:string|null;approximation?:string|null;certainty?:string|null;extentKind?:string|null;qualifier?:string|null;normalizationProfile?:string|null;lowerBoundDay?:number|null;upperBoundDayExclusive?:number|null}
export interface EvidenceInput {guid:string;claimGuid:string;expectedParentRevision:number;resourceGuid:string;blockGuid:string;authoredPropertyId?:string|null;sourceContentHash:string;startIndex:number;endIndex:number;coordinate:'cell'|'utf16';evidenceKind:string;excerpt?:string|null;attributes?:unknown}
export interface MembershipInput {guid:string;dataSetGuid:string;dataPointGuid:string;expectedDataSetRevision:number;attributes?:unknown}
export interface SemanticCommand {recordType:SemanticRecordType|'Entity'|'Relationship';op:string;[field:string]:unknown}
export interface SemanticQuery {filters?:Record<string,string|number|null>;limit?:number;after?:string;revision?:string;participants?:Array<{entityGuid?:string;role?:string|null}>;qualifiers?:Array<{entityGuid?:string;role?:string}>;dimensions?:Array<{entityGuid?:string;role?:string}>;dataSetGuids?:string[];membershipMode?:'union'|'intersection'}
export interface SemanticPage {items:CanonicalSemanticRecord[];complete:boolean;nextAfter?:string;diagnostics:string[];revision:string}
export interface SemanticResult {record?:CanonicalSemanticRecord;results?:SemanticResult[];removed?:boolean;guid?:string;outcome?:'already-equivalent';revision:string;[field:string]:unknown}
export type MutationInput<T> = T & {operationId:string;actorGuid?:string|null};
export interface RecordService<T> {get(guid:string,signal?:AbortSignal):Promise<SemanticResult>;create(input:MutationInput<T>,signal?:AbortSignal):Promise<SemanticResult>;update(input:MutationInput<Partial<T>&{guid:string;expectedRevision:number}>,signal?:AbortSignal):Promise<SemanticResult>;query(query?:SemanticQuery,signal?:AbortSignal):Promise<SemanticPage>;count(query?:SemanticQuery,signal?:AbortSignal):Promise<{count:number;revision:string}>}
export interface ChildService<T> {
 get(guid:string,signal?:AbortSignal):Promise<SemanticResult>;
 add(input:MutationInput<T&{expectedParentRevision:number}>,signal?:AbortSignal):Promise<SemanticResult>;
 update(input:MutationInput<Partial<T>&{guid:string;expectedRevision:number;expectedParentRevision:number}>,signal?:AbortSignal):Promise<SemanticResult>;
 remove(input:MutationInput<{guid:string;expectedRevision:number;expectedParentRevision:number}>,signal?:AbortSignal):Promise<SemanticResult>;
 query(query?:SemanticQuery,signal?:AbortSignal):Promise<SemanticPage>;
}
export interface EvidenceResolution {status:'resolved'|'stale'|'missing'|'unresolved'|'not-verified';record?:CanonicalSemanticRecord;excerpt?:string;diagnostics:string[];revision:string}
export interface SemanticVaultServices {
 readonly vaultGuid:string;
 times:RecordService<TimeInput>;claims:RecordService<ClaimInput>;dataSets:RecordService<DataSetInput>;dataPoints:RecordService<DataPointInput>;
 participants:ChildService<IncidenceInput&{claimGuid:string}>;
 qualifiers:ChildService<IncidenceInput&{claimGuid:string;role:string}>;
 dimensions:ChildService<IncidenceInput&{dataPointGuid:string;role:string}>;
 /** Child commands require their canonical parent and expectedParentRevision (membership uses expectedDataSetRevision). */
 execute(command:MutationInput<SemanticCommand>,signal?:AbortSignal):Promise<SemanticResult>;
 query(recordType:SemanticRecordType,query?:SemanticQuery,signal?:AbortSignal):Promise<SemanticPage>;
 batch(input:MutationInput<{commands:SemanticCommand[]}>,signal?:AbortSignal):Promise<SemanticResult>;
 memberships:{add(input:MutationInput<MembershipInput>,signal?:AbortSignal):Promise<SemanticResult>;update(input:MutationInput<MembershipInput&{expectedRevision:number}>,signal?:AbortSignal):Promise<SemanticResult>;remove(input:MutationInput<{guid:string;expectedRevision:number;expectedDataSetRevision:number}>,signal?:AbortSignal):Promise<SemanticResult>;members(dataSetGuid:string,query?:SemanticQuery,signal?:AbortSignal):Promise<SemanticPage>;collections(dataPointGuid:string,query?:Pick<SemanticQuery,'after'|'limit'|'revision'>,signal?:AbortSignal):Promise<SemanticPage>};
 evidence:{attach(input:MutationInput<EvidenceInput>,signal?:AbortSignal):Promise<SemanticResult>;list(claimGuid:string,query?:SemanticQuery,signal?:AbortSignal):Promise<SemanticPage>;resolve(guid:string,source?:{location:{folder:string;filename:string};byteHash:string},signal?:AbortSignal):Promise<EvidenceResolution>};
 audit:{status(signal?:AbortSignal):Promise<{pending:number;bytes:number;auditAvailable:boolean}>;deliver(options?:{limit?:number;maxBytes?:number},signal?:AbortSignal):Promise<{delivered:number;pending:number}>;outcome(operationId:string,signal?:AbortSignal):Promise<{status:'committed'|'not-committed'|'unavailable';result?:unknown;delivery?:string;diagnostics?:string[]}>};
 dispose():Promise<void>;
}
