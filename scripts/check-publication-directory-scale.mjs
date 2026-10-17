// Real host, filesystem receipts and per-document workers; disposable Vault only.
import {mkdtemp,rm,mkdir,readFile,writeFile} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {createApplicationServiceHost} from '../dist/server/application-services/host.js';
import {closeFilesystemWorkers} from './stage-c-gates/filesystem.mjs';
const count=Number(process.env.PUBLICATION_DOCUMENTS??1000),root=await mkdtemp(path.join(os.tmpdir(),'publication-scale-'));
assert.ok(count>=1&&count<=1000);
const source=await readFile('artifacts/flint-b1.2/rich.mutable.json','utf8');
for(let i=0;i<count;i++){const folder=path.join(root,`group-${Math.floor(i/25)}`);await mkdir(folder,{recursive:true});await writeFile(path.join(folder,`document-${i%25}.ink`),source.replaceAll('"resource"',JSON.stringify(`document-${i}`)));}
const host=createApplicationServiceHost({root,cavernId:randomUUID(),nativeEnabled:true,publicationEnabled:true,assets:()=>undefined,knowledge:async()=>{throw Error('Unexpected knowledge query');}}),api=host.service;
let peak=process.memoryUsage().rss;const memory=setInterval(()=>peak=Math.max(peak,process.memoryUsage().rss),50),start=performance.now();
try{
 const id=randomUUID(),scope={folder:'.',recursive:true,excluded:[]},profile={title:'Scale qualification',route:'index.html',images:false,outboundLinks:false,includeMargins:false};
 const inventory=await api.call('publication.directories.plan',{id,scope,home:profile.route});assert.equal(inventory.documents.length,count);
 const pages=inventory.documents.map(({resourceId,route,title})=>({resourceId,route,title}));const site=await api.call('publication.directories.save',{id,expectedRevision:-1,scope,profile,pages,reviewedRoutes:pages});
 const inventoryMs=performance.now()-start;console.log(JSON.stringify({phase:'inventory',count,ms:Math.round(inventoryMs)}));
 const poll=async job=>{let last='';while(['running','reviewing'].includes(job.state)){await new Promise(r=>setTimeout(r,1000));job=await api.call('publication.jobs.inspect',{id:job.id});if(job.phase!==last){last=job.phase;console.log(JSON.stringify({phase:last,state:job.state,elapsedSeconds:Math.round((performance.now()-start)/1000)}));}}return job;};
 const review=await poll(await api.call('publication.review.create',{id:randomUUID(),siteId:id,expectedRevision:site.revision}));assert.equal(review.state,'awaiting-approval',review.error);
 const reviewMs=performance.now()-start-inventoryMs;
 const buildStart=performance.now(),build=await poll(await api.call('publication.build.start',{id:review.id,expectedRevision:review.revision,reviewDigest:review.review.digest}));assert.equal(build.state,'completed',build.error);
 const buildMs=performance.now()-buildStart,folder=await api.call('publication.releases.folder',{siteId:id,release:build.release});assert.equal(folder.files,count+2);
 assert.ok((await readFile(path.join(root,folder.relativePath,'index.html'),'utf8')).includes('Contents'));
 console.log(JSON.stringify({qualified:true,count,inventoryMs,reviewMs,buildMs,totalMs:performance.now()-start,peakHostRssMiB:peak/1024/1024,outputBytes:review.review.files.reduce((n,f)=>n+f.size,0),phaseRevisions:build.revision,files:folder.files,executor:host.executor.status},null,2));
}finally{clearInterval(memory);await host.close();await closeFilesystemWorkers();await rm(root,{recursive:true,force:true});}
