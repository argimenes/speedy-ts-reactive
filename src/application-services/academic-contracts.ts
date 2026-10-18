import type {ScholarlyCitation,ScholarlyMetadata,ScholarlyProvider} from '../interchange/scholarly';
import type {JobSummary} from './contracts';
export interface ScholarlyBacklink {documentId:string;blockId:string;title:string|null;path:string}
export interface AcademicOperations {
 'academic.import':{input:{id:string;source:string};output:{citation:ScholarlyCitation;jobId:string}};
 'academic.inspect':{input:{id:string};output:{job:JobSummary;source:string}};
 'academic.resume':{input:{id:string};output:{citation:ScholarlyCitation;jobId:string}};
 'academic.backlinks':{input:{entityId:string};output:{rows:ScholarlyBacklink[]}};
}
export const academicOperations=['academic.import','academic.inspect','academic.resume','academic.backlinks'] as const;
export interface AcademicCapture {provider:ScholarlyProvider;endpoint:string;bytes:Uint8Array}
export interface AcademicCommit {op:'scholarly-commit';doi:string;operationId:string;identityId:string;citation:ScholarlyCitation}
export interface AcademicKnowledge {
 (request:{op:'scholarly-lookup';doi:string},signal?:AbortSignal):Promise<{citation:ScholarlyCitation|null}>;
 (request:AcademicCommit,signal?:AbortSignal):Promise<{citation:ScholarlyCitation;reused:boolean}>;
 (request:{op:'scholarly-backlinks';entityId:string},signal?:AbortSignal):Promise<{rows:ScholarlyBacklink[]}>;
}
export type AcademicNormalized = {kind:'academic-normalize';metadata:ScholarlyMetadata};
