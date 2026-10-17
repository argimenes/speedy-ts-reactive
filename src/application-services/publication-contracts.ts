import type {NativeLocation} from './contracts';
/** Publication DTOs are independent of transport, host implementation and editor state. */
export interface PublicationProfile {title:string;route:string;images:boolean;outboundLinks:boolean;includeMargins:boolean}
export interface PublicationSite {version:1;id:string;revision:number;resourceId:string;location:NativeLocation;profile:PublicationProfile;active?:string;releases:string[];committedJobs?:Record<string,string>}
export type PublicationState='reviewing'|'awaiting-approval'|'running'|'interrupted'|'review-required'|'completed'|'cancelled'|'failed';
export interface PublicFile {path:string;hash:string;size:number;mediaType:string}
export interface PublicationReview {digest:string;nativeHash:string;profile:PublicationProfile;text:string;diagnostics:string[];files:PublicFile[];omittedAnnotations:number;omittedBlocks:number}
export interface PublicationJob {version:2;id:string;siteId:string;revision:number;state:PublicationState;phase:string;review?:PublicationReview;release?:string;error?:string}
export interface PublicationOperations {
 'publication.sites.list':{input:{};output:{sites:PublicationSite[]}};
 'publication.sites.write':{input:{id:string;expectedRevision:number;location:NativeLocation;profile:PublicationProfile;reviewedRoute:string};output:PublicationSite};
 'publication.review.create':{input:{id:string;siteId:string;expectedRevision:number};output:PublicationJob};
 'publication.jobs.list':{input:{siteId:string;after?:string};output:{jobs:PublicationJob[];next?:string}};
 'publication.jobs.inspect':{input:{id:string};output:PublicationJob};
 'publication.jobs.resume':{input:{id:string;expectedRevision:number};output:PublicationJob};
 'publication.jobs.cancel':{input:{id:string};output:PublicationJob};
 'publication.build.start':{input:{id:string;expectedRevision:number;reviewDigest:string};output:PublicationJob};
 'publication.releases.preview':{input:{siteId:string;release:string};output:{url:string;grant:string}};
 'publication.preview.close':{input:{grant:string};output:{closed:true}};
 'publication.releases.export':{input:{siteId:string;release:string};output:{bytes:Uint8Array;mediaType:string;filename:string}};
}
export const publicationOperations: readonly (keyof PublicationOperations)[]=['publication.sites.list','publication.sites.write','publication.review.create','publication.jobs.list','publication.jobs.inspect','publication.jobs.resume','publication.jobs.cancel','publication.build.start','publication.releases.preview','publication.preview.close','publication.releases.export'];
