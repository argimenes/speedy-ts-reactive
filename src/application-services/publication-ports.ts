import type {DirectoryInventory,DirectoryScope} from '../publication/directory';
import type {PublicationSite,PublicationJob,PublicFile} from './publication-contracts';
import type {ServiceCapabilities,JobLease} from './capabilities';
export interface PublicationRecord {job:PublicationJob;site:PublicationSite;approved?:string;files:PublicFile[];directory?:DirectoryInventory;research?:import('../publication/research').ResearchBundle}
export interface PublicationStorage {
 maintenanceList(siteId:string,offset?:number):Promise<import('./publication-maintenance').MaintenanceList>;
 maintenanceInspect(siteId:string,target:import('./publication-maintenance').MaintenanceTarget):Promise<import('./publication-maintenance').MaintenanceReview>;
 maintenanceDelete(review:import('./publication-maintenance').MaintenanceReview,signal?:AbortSignal):Promise<void>;
 leaseRelease(siteId:string,release:string):Promise<JobLease>;
 sites():Promise<PublicationSite[]>;
 site(id:string):Promise<PublicationSite>;
 writeSite(site:PublicationSite,expected:number):Promise<PublicationSite>;
 create(record:PublicationRecord):Promise<PublicationRecord>;
 load(id:string):Promise<PublicationRecord>;
 list(siteId:string,after?:string):Promise<{records:PublicationRecord[];next?:string}>;
 checkpoint(record:PublicationRecord,expected:number):Promise<PublicationRecord>;
 acquire(id:string):Promise<JobLease>;
 unit<T>(id:string,key:string,value?:T):Promise<T|undefined>;
 folder(siteId:string,release:string):Promise<{relativePath:string;files:number}>;
 put(id:string,bytes:Uint8Array,unit?:string):Promise<string>;
 read(id:string,hash:string,unit?:string):Promise<Uint8Array>;
 reuseProjection(sourceId:string,sourceUnit:string,id:string,unit:string,fingerprint:string):Promise<{bytes:Uint8Array;hash:string}|undefined>;
 commit(record:PublicationRecord,signal?:AbortSignal):Promise<string>;
 release(siteId:string,release:string):Promise<PublicFile[]>;
 file(siteId:string,release:string,file:PublicFile):Promise<Uint8Array>;
 close():Promise<void>;
}
export interface PublicationPorts {
 packageData?:ServiceCapabilities['packageData'];
 inventory?:(scope:DirectoryScope,signal?:AbortSignal)=>Promise<DirectoryInventory>;
 native:ServiceCapabilities['readNative'];asset:ServiceCapabilities['originalAsset'];executor:ServiceCapabilities['executor'];
 storage:PublicationStorage;cavernId:string;hash(bytes:Uint8Array):string;
 preview(siteId:string,release:string):Promise<{url:string;grant:string}>;
 closePreview(grant:string):Promise<void>;
 revokeRelease?:(siteId:string,release:string)=>Promise<void>;
}
