// Optional matched typing workload, using a disposable Cavern and the real host.
import {mkdtemp,rm} from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
import {randomUUID} from 'node:crypto';
import {createApplicationServiceHost} from '../dist/server/application-services/host.js';
import {closeFilesystemWorkers} from './stage-c-gates/filesystem.mjs';
export async function startServiceTypingLoad(){
 const root=await mkdtemp(path.join(os.tmpdir(),'services-typing-')),host=createApplicationServiceHost({root,cavernId:'typing-fixture',nativeEnabled:true,assets:()=>undefined,knowledge:async()=>{throw Error('No knowledge acquisition in typing workload');}});
 let stopping=false,completed=0,error;const loop=(async()=>{
  try{while(!stopping){const job=await host.service.call('jobs.create',{id:randomUUID(),preparation:{kind:'convert',format:'markdown',source:'Paragraph **focus** words.\n\n'.repeat(200)}});if(stopping)break;const result=await host.service.call('jobs.run',{id:job.id,expectedRevision:job.revision});if(result.state==='completed')completed++;else if(!stopping)throw Error(result.error??result.state);}}
  catch(e){if(!stopping)error=e;}
 })();
 for(let i=0;i<300&&!host.executor.status.active&&!error;i++)await new Promise(r=>setTimeout(r,10));
 if(error||!host.executor.status.active){stopping=true;await host.close();await loop;await rm(root,{recursive:true,force:true});throw error??Error('Typing workload did not start');}
 return {status:()=>({completed,executor:host.executor.status}),async stop(){stopping=true;await host.close();await loop;await closeFilesystemWorkers();await rm(root,{recursive:true,force:true});if(error)throw error;}};
}
