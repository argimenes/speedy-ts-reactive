// @vitest-environment node
import {it,expect,vi} from 'vitest';
import {promises as fs} from 'node:fs';import os from 'node:os';import path from 'node:path';import express from 'express';
vi.mock('../../src/configuration',async original=>{const actual:any=await original();return {...actual,featureFlags:{...actual.featureFlags,applicationServices:false}};});
import {createCavernLifecycle} from '../cavern-lifecycle';
import {closeFilesystemWorkers} from '../../scripts/stage-c-gates/filesystem.mjs';
it('feature-off exposes no service operations and creates no job storage',async()=>{
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'services-off-'))),cavern=path.join(root,'cavern'),lifecycle=createCavernLifecycle({stateFile:path.join(root,'preferences.json')});
 const app=express();app.use(express.json());app.use('/api/cavern',lifecycle.router);app.use('/api',lifecycle.middleware);const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const base=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
 try{
  const opened=await fetch(base+'/api/cavern/establish',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({path:cavern,intent:'create'})}).then(r=>r.json());expect(opened.Success,opened.Error).toBe(true);
  const r=await fetch(base+'/api/services/jobs.create',{method:'POST',headers:{'Content-Type':'application/json','X-Mutable-Cavern':opened.Data.current.session},body:JSON.stringify({id:crypto.randomUUID(),preparation:{kind:'convert',format:'text',source:'x'}})});expect(r.status).toBe(404);expect(await fs.stat(path.join(cavern,'.mutable/jobs')).catch(()=>null)).toBeNull();
 }finally{await new Promise<void>(r=>server.close(()=>r()));await lifecycle.close();await closeFilesystemWorkers();await fs.rm(root,{recursive:true,force:true});}
});
