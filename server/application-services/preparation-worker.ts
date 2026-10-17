import {parentPort} from 'node:worker_threads';
import {convertSource} from '../../src/interchange/document-import';
import {createPackage,nativeInventory} from '../../src/interchange/package/format';
import {decodeNative} from '../../src/persistence/native-resource';
import type {ExecutionTask} from '../../src/application-services/capabilities';
import {publicProjection} from '../../src/publication/projection';
import {zipSync} from 'fflate';
parentPort!.once('message',async(task:ExecutionTask)=>{
 try {
  const value=task.kind==='publication-project'?publicProjection(task.native,task.profile,task.cavernId):
   task.kind==='publication-zip'?{bytes:publicationZip(task.members)}:
   task.kind==='convert'?{kind:'convert',...convertSource(task.source,task.format)}:
   task.kind==='inventory'?nativeInventory(decodeNative(task.native)):
   {kind:'package',mediaType:'application/zip',bytes:await createPackage(task.native,task.source,task.context.data,task.context.schema,task.assets)};
  parentPort!.postMessage({value});
 }catch(error){parentPort!.postMessage({error:error instanceof Error?error.message:'Preparation failed'});}
});
function publicationZip(members:Record<string,Uint8Array>){
 if(Object.keys(members).length>100||Object.values(members).reduce((n,b)=>n+b.length,0)>60*1024*1024)throw Error('Publication ZIP limit');
 const normalized:any={};for(const name of Object.keys(members).sort()){
  if(!/^(?:[a-z0-9][a-z0-9_-]{0,79}\.html|reader\.css|assets\/[a-f0-9]{64}\.(?:png|jpg))$/.test(name))throw Error('Invalid ZIP member');
  normalized[name]=[members[name],{mtime:new Date(1980,0,1,0,0,0),level:0}];
 }
 const output=zipSync(normalized,{level:0});if(output.length>64*1024*1024)throw Error('Publication ZIP limit');return output;
}
