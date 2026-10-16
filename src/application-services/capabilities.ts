/** Host-internal capability ports. Not an API granting frontend filesystem access. */
import type {NativeRead,NativeDocument,OriginalAsset,PackageDataRequest,PackageDataResult,Preparation,PreparationResult,JobSummary,JobPage} from './contracts';
import type {PackageAsset,PackageManifest} from '../interchange/package/format';
import type {ManagedAssetReference} from '../interchange/managed-asset';
export type ExecutionTask =
 | Extract<Preparation,{kind:'convert'}>
 | {kind:'inventory';native:Uint8Array}
 | {kind:'package';native:Uint8Array;source:PackageManifest['source'];context:PackageDataResult;assets:PackageAsset[]};
export interface Inventory {entities:string[];claims:string[];assets:ManagedAssetReference[]}
export interface Executor {
 run(task:ExecutionTask,signal?:AbortSignal):Promise<PreparationResult|Inventory>;
 close():Promise<void>;
}
export interface JobRecord {summary:JobSummary;preparation:Preparation;result?:{file:string;sha256:string;bytes:number}}
export interface JobLease {close():Promise<void>}
export interface JobStorage {
 list(after?:string):Promise<JobPage>;
 create(id:string,preparation:Preparation):Promise<JobRecord>;
 load(id:string):Promise<JobRecord>;
 checkpoint(record:JobRecord,expectedRevision:number):Promise<JobRecord>;
 acquire(id:string):Promise<JobLease>;
 putResult(id:string,bytes:Uint8Array):Promise<NonNullable<JobRecord['result']>>;
 readResult(id:string,result:NonNullable<JobRecord['result']>):Promise<Uint8Array>;
 close():Promise<void>;
}
export interface ServiceCapabilities {
 cavernId:string;
 readNative(input:NativeRead,signal?:AbortSignal):Promise<NativeDocument>;
 originalAsset(assetId:string,signal?:AbortSignal):Promise<OriginalAsset>;
 packageData(input:PackageDataRequest,signal?:AbortSignal):Promise<PackageDataResult>;
 executor:Executor;
 jobs:JobStorage;
}
