// Real publication workload in a disposable Cavern; never touches user documents.
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {randomUUID} from 'node:crypto';
import {createApplicationServiceHost} from '../dist/server/application-services/host.js';
import {closeFilesystemWorkers} from './stage-c-gates/filesystem.mjs';
export async function startPublicationTypingLoad(){
 const root=await mkdtemp(path.join(os.tmpdir(),'publication-typing-'));await writeFile(path.join(root,'letter.ink'),await readFile('vaults/imported/documents/michelangelo-letters/1507-02-13-[a7a41cd3].ink'));
 const host=createApplicationServiceHost({root,cavernId:'publication-typing',nativeEnabled:true,publicationEnabled:true,assets:()=>undefined,knowledge:async()=>{throw Error('Reading must not query knowledge');}}),api=host.service;
 const profile={title:'Typing workload',route:'index.html',images:false,outboundLinks:false,includeMargins:false};let site=await api.call('publication.sites.write',{id:randomUUID(),expectedRevision:-1,location:{folder:'.',filename:'letter.ink'},profile,reviewedRoute:profile.route});
 let stopping=false,completed=0,error,phase='starting',peakRss=process.memoryUsage().rss;const memory=setInterval(()=>{peakRss=Math.max(peakRss,process.memoryUsage().rss);},100);
 const poll=async job=>{while(!stopping&&['reviewing','running'].includes(job.state)){await new Promise(r=>setTimeout(r,30));job=await api.call('publication.jobs.inspect',{id:job.id});phase=job.phase;}return job;};
 const loop=(async()=>{try{while(!stopping){const review=await poll(await api.call('publication.review.create',{id:randomUUID(),siteId:site.id,expectedRevision:site.revision}));if(stopping)break;if(review.state!=='awaiting-approval')throw Error(review.error??review.state);const build=await poll(await api.call('publication.build.start',{id:review.id,expectedRevision:review.revision,reviewDigest:review.review.digest}));if(stopping)break;if(build.state!=='completed')throw Error(build.error??build.state);completed++;site=(await api.call('publication.sites.list',{})).sites[0];}}catch(e){if(!stopping)error=e;}})();
 for(let i=0;i<500&&!host.executor.status.active&&!error;i++)await new Promise(r=>setTimeout(r,10));
 if(error||!host.executor.status.active){stopping=true;clearInterval(memory);await host.close();await loop;await rm(root,{recursive:true,force:true});throw error??Error('Publication worker did not start');}
 return {status:()=>({completed,phase,executor:host.executor.status,peakHostRssMiB:Math.round(peakRss/1024/1024)}),async stop(){stopping=true;clearInterval(memory);await host.close();await loop;await closeFilesystemWorkers();await rm(root,{recursive:true,force:true});if(error)throw error;}};
}
