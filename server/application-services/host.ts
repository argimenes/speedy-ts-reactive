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
export function createApplicationServiceHost(options:{root:string;cavernId:string;nativeEnabled:boolean;publicationEnabled?:boolean;assets:()=>{get(id:string,cavernId:string):Promise<any>}|undefined;knowledge:(request:any,signal?:AbortSignal)=>Promise<any>}){
 const documents=createNativeDocumentStore({root:options.root,readOnly:true});
 const jobs=new CavernJobStorage(options.root,options.cavernId),executor=new NodePreparationExecutor();
 const ports:ServiceCapabilities={cavernId:options.cavernId,jobs,executor,
  async readNative(input,signal){
   if(!options.nativeEnabled)throw Error('Native document persistence is disabled');
   const result=await documents.readNative(input.location,signal);
   if(input.expectedHash&&input.expectedHash!==result.baseline.nativeHash)throw Error('Saved document changed; review it again');
   return {native:result.native,resourceId:result.resourceId,sha256:result.baseline.nativeHash,generation:result.baseline.generation};
  },
  async originalAsset(assetId,signal){signal?.throwIfAborted();const store=options.assets();if(!store)throw Error('Managed assets unavailable');const {bytes,manifest}=await store.get(assetId,options.cavernId);signal?.throwIfAborted();return {assetId,cavernId:options.cavernId,mediaType:manifest.mediaType,bytes:new Uint8Array(bytes)};},
  async packageData(request,signal){signal?.throwIfAborted();return options.knowledge(request,signal);},
 };
 const preparation=new ApplicationService(ports),enabled=options.publicationEnabled===true;
 const storage=enabled?new CavernPublicationStorage(options.root,options.cavernId):undefined,preview=storage?new PublicationPreview(storage):undefined;
 const publication=storage?new PublicationService({inventory:(scope,signal)=>publicationInventory(options.root,scope,ports.readNative,signal),native:ports.readNative,asset:ports.originalAsset,executor,storage,cavernId:options.cavernId,hash:sha,preview:(site,release)=>preview!.open(site,release),closePreview:async grant=>preview!.revoke(grant)}):undefined;
 const service:ApplicationServices={call:(operation,input,signal)=>operation.startsWith('publication.')?(publication?publication.call(operation as any,input as any,signal) as any:Promise.reject(Error('Web publishing is disabled'))):preparation.call(operation,input,signal)};
 return {service,router:applicationServiceRouter(service,options.cavernId,enabled),executor,async close(){await preview?.close();await publication?.close();await preparation.close();}};
}
