import {parentPort} from 'node:worker_threads';
import {convertSource} from '../../src/interchange/document-import';
import {createPackage,nativeInventory} from '../../src/interchange/package/format';
import {decodeNative} from '../../src/persistence/native-resource';
import type {ExecutionTask} from '../../src/application-services/capabilities';
parentPort!.once('message',async(task:ExecutionTask)=>{
 try {
  const value=task.kind==='convert'?{kind:'convert',...convertSource(task.source,task.format)}:
   task.kind==='inventory'?nativeInventory(decodeNative(task.native)):
   {kind:'package',mediaType:'application/zip',bytes:await createPackage(task.native,task.source,task.context.data,task.context.schema,task.assets)};
  parentPort!.postMessage({value});
 }catch(error){parentPort!.postMessage({error:error instanceof Error?error.message:'Preparation failed'});}
});
