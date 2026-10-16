/** Initial Node capability adapter and composition root. Replaceable independently
 * of operation contracts and application workflow implementation. */
import {createNativeDocumentStore} from '../native-document-store.mjs';
import {ApplicationService} from '../../src/application-services/service';
import {CavernJobStorage} from './job-storage';
import {NodePreparationExecutor} from './executor';
import {applicationServiceRouter} from './http';
import type {ServiceCapabilities} from '../../src/application-services/capabilities';
export function createApplicationServiceHost(options:{root:string;cavernId:string;nativeEnabled:boolean;assets:()=>{get(id:string,cavernId:string):Promise<any>}|undefined;knowledge:(request:any,signal?:AbortSignal)=>Promise<any>}){
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
 const service=new ApplicationService(ports);
 return {service,router:applicationServiceRouter(service,options.cavernId),executor,close:()=>service.close()};
}
