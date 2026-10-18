/** Versioned operation data. No HTTP, Node, DOM, editor or platform handles.
 * Binary values use Uint8Array in TypeScript; transports choose their encoding. */
import type {MutableFragment} from '../interchange/fragment';
import type {InterchangeDiagnostic} from '../interchange/diagnostics';
import type {PackageData} from '../interchange/package/data';
import type {AcademicOperations} from './academic-contracts';
import type {PublicationOperations} from './publication-contracts';

export interface NativeLocation {folder:string;filename:string}
export interface NativeRead {location:NativeLocation;expectedHash?:string}
export interface NativeDocument {resourceId:string;native:string;sha256:string;generation:string|null}
export interface OriginalAsset {assetId:string;cavernId:string;mediaType:'image/png'|'image/jpeg';bytes:Uint8Array}
export interface KnowledgeOptions {relationships?:boolean;claims?:boolean;evidence?:boolean;actors?:boolean;observedAliases?:boolean}
export interface PackageDataRequest extends KnowledgeOptions {entities:string[];claimsById?:string[];documentHash?:string}
export interface PackageDataResult {data:PackageData;schema:unknown}
export type Preparation =
 | {kind:'academic';source:string}
 | {kind:'convert';format:'markdown'|'html'|'text';source:string}
 | {kind:'package';document:NativeRead & {expectedHash:string};knowledge:KnowledgeOptions};
export type PreparationResult =
 | {kind:'convert';fragment:MutableFragment;diagnostics:InterchangeDiagnostic[];title?:string}
 | {kind:'package';bytes:Uint8Array;mediaType:'application/zip'};
export type JobState='ready'|'running'|'interrupted'|'completed'|'cancelled'|'failed';
export interface JobSummary {version:1;id:string;cavernId:string;revision:number;state:JobState;kind:Preparation['kind'];created:string;updated:string;error?:string;resultBytes?:number}
export interface JobPage {jobs:JobSummary[];diagnostics:Array<{id:string;message:string}>;next?:string}
export interface OperationMap extends PublicationOperations,AcademicOperations {
 'native.read':{input:NativeRead;output:NativeDocument};
 'assets.original':{input:{assetId:string};output:OriginalAsset};
 'knowledge.packageData':{input:PackageDataRequest;output:PackageDataResult};
 'jobs.create':{input:{id:string;preparation:Preparation};output:JobSummary};
 'jobs.inspect':{input:{id:string};output:JobSummary};
 'jobs.list':{input:{after?:string};output:JobPage};
 'jobs.run':{input:{id:string;expectedRevision:number};output:JobSummary};
 'jobs.cancel':{input:{id:string};output:JobSummary};
 'jobs.result':{input:{id:string};output:PreparationResult};
}
export type Operation=keyof OperationMap;
export interface ApplicationServices {
 call<K extends Operation>(operation:K,input:OperationMap[K]['input'],signal?:AbortSignal):Promise<OperationMap[K]['output']>;
}
