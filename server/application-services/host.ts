import {WebResourceService} from '../../src/application-services/web-service';
import {acquireWebMetadata} from '../asset-remote.mjs';
import {DeterministicService} from '../../src/application-services/deterministic-service';
import {acquireAcademicRecord,acquireOcrXml} from '../asset-remote.mjs';
import {object,assetId as validateAssetId} from '../../src/application-services/validation';
import {PdfService} from '../../src/application-services/pdf-service';
import {acquirePdf} from '../asset-remote.mjs';
import {IIIFService} from '../../src/application-services/iiif-service';
import {EncyclopediaService} from '../../src/application-services/encyclopedia-service';
import {AcademicService} from '../../src/application-services/academic-service';
import {acquireScholarlyJson,acquireEncyclopedia,acquireIIIF} from '../asset-remote.mjs';
import {randomUUID,createHash} from 'node:crypto';
import {publicationInventory} from './publication-inventory';
/** Initial Node capability adapter and composition root. Replaceable independently
 * of operation contracts and application workflow implementation. */
import {createNativeDocumentStore} from '../native-document-store.mjs';
import {ApplicationService} from '../../src/application-services/service';
import {CavernJobStorage} from './job-storage';
import {NodePreparationExecutor} from './executor';
import {applicationServiceRouter} from './http';
import type {ServiceCapabilities} from '../../src/application-services/capabilities';
import {PublicationService} from '../../src/application-services/publication-service';
import {CavernPublicationStorage,sha} from './publication-storage';
import {PublicationPreview} from './publication-preview';
import type {ApplicationServices} from '../../src/application-services/contracts';
export function createApplicationServiceHost(options:{root:string;cavernId:string;nativeEnabled:boolean;publicationEnabled?:boolean;academicEnabled?:boolean;iiifEnabled?:boolean;crossResourceEnabled?:boolean;structuredEnabled?:boolean;deterministicEnabled?:boolean;webEnabled?:boolean;everydayEnabled?:boolean;academic?:(request:any,signal?:AbortSignal)=>Promise<any>;assets:()=>any;knowledge:(request:any,signal?:AbortSignal)=>Promise<any>}){
 const documents=createNativeDocumentStore({root:options.root,readOnly:true});
 const jobs=new CavernJobStorage(options.root,options.cavernId),executor=new NodePreparationExecutor();
 const ports:ServiceCapabilities={cavernId:options.cavernId,jobs,executor,
  async readNative(input,signal){
   if(!options.nativeEnabled)throw Error('Native document persistence is disabled');
   const result=await documents.readNative(input.location,signal);
   if(input.expectedHash&&input.expectedHash!==result.baseline.nativeHash)throw Error('Saved document changed; review it again');
   return {native:result.native,resourceId:result.resourceId,sha256:result.baseline.nativeHash,generation:result.baseline.generation};
  },
  async originalAsset(assetId,signal){signal?.throwIfAborted();const store=options.assets();if(!store)throw Error('Managed assets unavailable');const {bytes,manifest}=await store.get(assetId,options.cavernId);if(!['image/png','image/jpeg'].includes(manifest.mediaType))throw Error('This asset type is not available through the image-original operation');signal?.throwIfAborted();return {assetId,cavernId:options.cavernId,mediaType:manifest.mediaType,bytes:new Uint8Array(bytes)};},
  async packageData(request,signal){signal?.throwIfAborted();return options.knowledge(request,signal);},
 };
 if(options.crossResourceEnabled||options.structuredEnabled||options.deterministicEnabled||options.webEnabled)ports.resourceOriginal=async(assetId,signal)=>{signal?.throwIfAborted();const {bytes,manifest}=await options.assets().get(assetId,options.cavernId);if(!['image/png','image/jpeg',...(options.webEnabled?['application/json']:[]),...(options.crossResourceEnabled?['application/json','application/pdf']:[]),...(options.structuredEnabled?['text/plain']:[]),...(options.deterministicEnabled?['application/json','application/xml','application/epub+zip','application/x-bibtex','application/x-research-info-systems']:[])].includes(manifest.mediaType))throw Error('Unsupported original');return {assetId,cavernId:options.cavernId,mediaType:manifest.mediaType,bytes:new Uint8Array(bytes)};};
 const preparation=new ApplicationService(ports),enabled=options.publicationEnabled===true;
 const storage=enabled?new CavernPublicationStorage(options.root,options.cavernId):undefined,preview=storage?new PublicationPreview(storage):undefined;
 const publication=storage?new PublicationService({packageData:ports.packageData,inventory:(scope,signal)=>publicationInventory(options.root,scope,ports.readNative,signal),native:ports.readNative,asset:ports.originalAsset,executor,storage,cavernId:options.cavernId,hash:sha,preview:(site,release)=>preview!.open(site,release),closePreview:async grant=>preview!.revoke(grant),revokeRelease:(site,release)=>preview!.revokeRelease(site,release)}):undefined;
 const academic=options.academicEnabled&&options.academic?new AcademicService({cavernId:options.cavernId,jobs,executor,knowledge:options.academic as any,uuid:randomUUID,now:()=>new Date().toISOString(),
  async acquire(doi,signal){
   const agency=await acquireScholarlyJson('agency',doi,signal),body=JSON.parse(new TextDecoder().decode(agency.bytes)),provider=body.message?.agency?.id;
   if(!['crossref','datacite'].includes(provider))throw Error('DOI registration agency is not supported');
   return {provider,...await acquireScholarlyJson(provider,doi,signal)};
  },
  async retain(bytes,signal){
   signal.throwIfAborted();const store=options.assets();if(!store)throw Error('Managed assets unavailable');const lease=await store.begin();let done=false;
   try{const asset=await store.stage(lease,Buffer.from(bytes),{mediaType:'application/json'});signal.throwIfAborted();await store.publish(lease);await store.finish(lease,'academic-capture');done=true;return {kind:'managed' as const,cavernId:options.cavernId,assetId:asset.assetId};}
   finally{if(!done)await store.abort(lease);}
  },
  async verify(asset,signal){signal.throwIfAborted();if(asset.cavernId!==options.cavernId)throw Error('Capture belongs to another Vault');const store=options.assets();if(!store)throw Error('Managed assets unavailable');const original=await store.get(asset.assetId,asset.cavernId);if(original.manifest.mediaType!=='application/json')throw Error('Invalid scholarly capture type');signal.throwIfAborted();}
 }):undefined;
 const encyclopedia=options.academicEnabled&&options.academic?new EncyclopediaService({cavernId:options.cavernId,jobs,executor,knowledge:options.academic,uuid:randomUUID,now:()=>new Date().toISOString(),acquire:acquireEncyclopedia,
  async retain(bytes,signal){signal.throwIfAborted();const store=options.assets();if(!store)throw Error('Managed assets unavailable');const lease=await store.begin();let done=false;
   try{const asset=await store.stage(lease,Buffer.from(bytes),{mediaType:'application/json'});signal.throwIfAborted();await store.publish(lease);await store.finish(lease,'encyclopedia-capture');done=true;return {kind:'managed' as const,cavernId:options.cavernId,assetId:asset.assetId};}finally{if(!done)await store.abort(lease);}},
  async original(asset,signal){signal.throwIfAborted();if(asset.cavernId!==options.cavernId)throw Error('Wrong Vault capture');const store=options.assets();if(!store)throw Error('Managed assets unavailable');const original=await store.get(asset.assetId,asset.cavernId);if(original.manifest.mediaType!=='application/json')throw Error('Wrong capture type');signal.throwIfAborted();return new Uint8Array(original.bytes);}
 }):undefined;
 const iiif=options.iiifEnabled&&options.academic?new IIIFService({cavernId:options.cavernId,jobs,executor,knowledge:options.academic,uuid:randomUUID,now:()=>new Date().toISOString(),acquire:acquireIIIF,
  async retain(bytes,format,signal){signal.throwIfAborted();const store=options.assets();if(!store)throw Error('Managed assets unavailable');const lease=await store.begin();let done=false;
   try{const mediaType=format==='json'?'application/json':bytes[0]===137?'image/png':'image/jpeg';const asset=await store.stage(lease,Buffer.from(bytes),{mediaType});signal.throwIfAborted();await store.publish(lease);await store.finish(lease,'iiif-capture');done=true;return {kind:'managed' as const,cavernId:options.cavernId,assetId:asset.assetId};}finally{if(!done)await store.abort(lease);}},
  async original(asset,signal){signal.throwIfAborted();if(asset.cavernId!==options.cavernId)throw Error('Wrong Vault capture');const store=options.assets();if(!store)throw Error('Managed assets unavailable');const original=await store.get(asset.assetId,asset.cavernId);if(!['application/json','image/png','image/jpeg'].includes(original.manifest.mediaType))throw Error('Wrong IIIF asset type');signal.throwIfAborted();return new Uint8Array(original.bytes);}
 }):undefined;
 const pdf=options.crossResourceEnabled&&options.academic?new PdfService({cavernId:options.cavernId,jobs,executor,knowledge:options.academic,uuid:randomUUID,now:()=>new Date().toISOString(),acquire:acquirePdf,
  async originalResource(assetId,signal){signal.throwIfAborted();const store=options.assets();if(!store)throw Error('Managed assets unavailable');const original=await store.get(assetId,options.cavernId);if(!['image/png','image/jpeg','application/json','application/pdf',...(options.structuredEnabled?['text/plain']:[]),...(options.deterministicEnabled?['application/json','application/xml','application/epub+zip','application/x-bibtex','application/x-research-info-systems']:[])].includes(original.manifest.mediaType))throw Error('Unsupported original type');signal.throwIfAborted();return {assetId,cavernId:options.cavernId,mediaType:original.manifest.mediaType,bytes:new Uint8Array(original.bytes)};},
  async retain(bytes,signal){signal.throwIfAborted();const store=options.assets();if(!store)throw Error('Managed assets unavailable');const lease=await store.begin();let done=false;
   try{const asset=await store.stage(lease,Buffer.from(bytes),{mediaType:'application/pdf'});signal.throwIfAborted();await store.publish(lease);await store.finish(lease,'pdf-capture');done=true;return {kind:'managed' as const,cavernId:options.cavernId,assetId:asset.assetId};}finally{if(!done)await store.abort(lease);}},
  async original(asset,signal){signal.throwIfAborted();if(asset.cavernId!==options.cavernId)throw Error('Wrong Vault capture');const store=options.assets();if(!store)throw Error('Managed assets unavailable');const original=await store.get(asset.assetId,asset.cavernId);if(original.manifest.mediaType!=='application/pdf')throw Error('Wrong PDF asset type');signal.throwIfAborted();return new Uint8Array(original.bytes);}
 }):undefined;
 const deterministic=options.deterministicEnabled?new DeterministicService({acquireXml:acquireOcrXml,knowledge:options.academic,cavernId:options.cavernId,jobs,executor,acquire:acquireAcademicRecord,uuid:randomUUID,now:()=>new Date().toISOString(),
  async retain(bytes,mediaType,signal){signal.throwIfAborted();const store=options.assets();const id='sha256:'+createHash('sha256').update(bytes).digest('hex');try{await store.get(id,options.cavernId);return {kind:'managed',cavernId:options.cavernId,assetId:id};}catch(e){if((e as any).code!=='ENOENT')throw e;}
   const lease=await store.begin();let done=false;try{const a=await store.stage(lease,Buffer.from(bytes),{mediaType});signal.throwIfAborted();await store.publish(lease);await store.finish(lease,'deterministic-capture');done=true;return {kind:'managed',cavernId:options.cavernId,assetId:a.assetId};}finally{if(!done)await store.abort(lease);}},
  async read(ref,signal){signal.throwIfAborted();if(ref.cavernId!==options.cavernId)throw Error('Wrong source Vault');return new Uint8Array((await options.assets().get(ref.assetId,ref.cavernId)).bytes);}
 }):undefined;
 const web=options.webEnabled?new WebResourceService({everydayEnabled:options.everydayEnabled,jobs,executor,uuid:randomUUID,now:()=>new Date().toISOString(),mapsKey:process.env.MUTABLE_GOOGLE_MAPS_EMBED_KEY,acquire:acquireWebMetadata,
  async retain(bytes,signal){signal.throwIfAborted();const store=options.assets();const lease=await store.begin();let done=false;try{const a=await store.stage(lease,Buffer.from(bytes),{mediaType:'application/json'});signal.throwIfAborted();await store.publish(lease);await store.finish(lease,'web-resource-capture');done=true;return {kind:'managed',cavernId:options.cavernId,assetId:a.assetId};}finally{if(!done)await store.abort(lease);}},
  async read(ref,signal){signal.throwIfAborted();if(ref.cavernId!==options.cavernId)throw Error('Wrong source Vault');return new Uint8Array((await options.assets().get(ref.assetId,ref.cavernId)).bytes);}
 }):undefined;
 const service:ApplicationServices={call:(operation,input,signal)=>operation.startsWith('web.')?(web?web.call(operation as any,input as any,signal) as any:Promise.reject(Error('Web resource viewers disabled'))):operation.startsWith('deterministic.')?(deterministic?deterministic.call(operation as any,input as any,signal) as any:Promise.reject(Error('Deterministic academic handlers disabled'))):operation==='resources.original'&&!pdf&&ports.resourceOriginal?(async()=>{object(input,['assetId']);validateAssetId((input as any).assetId);return ports.resourceOriginal!((input as any).assetId,signal);})() as any:operation.startsWith('pdf.')||operation.startsWith('resource.')||operation.startsWith('resources.')?(pdf?pdf.call(operation as any,input as any,signal) as any:Promise.reject(Error('Cross-resource loaders are disabled'))):operation.startsWith('iiif.')?(iiif?iiif.call(operation as any,input as any,signal) as any:Promise.reject(Error('IIIF loaders are disabled'))):operation.startsWith('encyclopedia.')?(encyclopedia?encyclopedia.call(operation as any,input as any,signal) as any:Promise.reject(Error('Academic resource loaders are disabled'))):operation.startsWith('academic.')?(academic?academic.call(operation as any,input as any,signal) as any:Promise.reject(Error('Academic resource loaders are disabled'))):operation.startsWith('publication.')?(publication?publication.call(operation as any,input as any,signal) as any:Promise.reject(Error('Web publishing is disabled'))):preparation.call(operation,input,signal)};
 return {service,router:applicationServiceRouter(service,options.cavernId,enabled,!!academic,!!iiif,!!pdf,!!options.structuredEnabled,!!options.deterministicEnabled,!!options.webEnabled),executor,async close(){await web?.close();await deterministic?.close();await pdf?.close();await iiif?.close();await encyclopedia?.close();await academic?.close();await preview?.close();await publication?.close();await preparation.close();}};
}
