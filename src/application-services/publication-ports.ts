import type {PublicationSite,PublicationJob,PublicFile} from './publication-contracts';
import type {ServiceCapabilities,JobLease} from './capabilities';
export interface PublicationRecord {job:PublicationJob;site:PublicationSite;approved?:string;files:PublicFile[]}
export interface PublicationStorage {
 sites():Promise<PublicationSite[]>;
 site(id:string):Promise<PublicationSite>;
 writeSite(site:PublicationSite,expected:number):Promise<PublicationSite>;
 create(record:PublicationRecord):Promise<PublicationRecord>;
 load(id:string):Promise<PublicationRecord>;
 list(siteId:string,after?:string):Promise<{records:PublicationRecord[];next?:string}>;
 checkpoint(record:PublicationRecord,expected:number):Promise<PublicationRecord>;
 acquire(id:string):Promise<JobLease>;
 put(id:string,bytes:Uint8Array):Promise<string>;
 read(id:string,hash:string):Promise<Uint8Array>;
 commit(record:PublicationRecord):Promise<string>;
 release(siteId:string,release:string):Promise<PublicFile[]>;
 file(siteId:string,release:string,file:PublicFile):Promise<Uint8Array>;
 close():Promise<void>;
}
export interface PublicationPorts {
 native:ServiceCapabilities['readNative'];asset:ServiceCapabilities['originalAsset'];executor:ServiceCapabilities['executor'];
 storage:PublicationStorage;cavernId:string;hash(bytes:Uint8Array):string;
 preview(siteId:string,release:string):Promise<{url:string;grant:string}>;
 closePreview(grant:string):Promise<void>;
}
