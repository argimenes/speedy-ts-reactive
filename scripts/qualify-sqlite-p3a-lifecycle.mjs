/** Disposable process-level lifecycle observation; run with --expose-gc after building SQLite. */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {SqliteKnowledgeHost} from '../dist/server/sqlite-knowledge-host.js';
import {openSqliteFoundation} from '../dist/server/knowledge-sqlite/client.mjs';
const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'p3a-lifecycle-')));
let active=0,peak=0,opens=0;
const sample=()=>{global.gc?.();return {...process.memoryUsage(),activeWorkers:active};};
const host=new SqliteKnowledgeHost({root,debounceMs:60000,open:async options=>{
 const client=await openSqliteFoundation(options);active++;opens++;peak=Math.max(peak,active);let closed=false;
 return {...client,close:async()=>{await client.close();if(!closed){closed=true;active--;}}};
}});
try{
 await fs.writeFile(path.join(root,'doc.json'),JSON.stringify({id:'document',type:'main-list-block',children:[{id:'paragraph',type:'plain-text-block',text:'Lifecycle fixture'}]}));
 const before=sample(),cycles=[];
 for(let i=0;i<10;i++){
  const one=await host.acquire('.'),two=await host.acquire('.');await host.flush();
  if(!(await host.status(two.lease)).coverage.complete)throw Error('Incomplete lifecycle fixture');
  const open=sample();await host.release(one.lease);await host.release(two.lease);
  cycles.push({cycle:i+1,open,closed:sample()});
 }
 await host.close();
 console.log(JSON.stringify({node:process.version,cpu:os.cpus()[0].model,before,cycles,after:sample(),opens,peakWorkers:peak,notes:['RSS includes worker heaps and native SQLite allocation; parent heap does not.','Ten small-fixture cycles are a bounded lifecycle smoke measurement, not a retained-heap leak proof or browser-memory qualification.']},null,2));
}finally{await host.close();await fs.rm(root,{recursive:true,force:true});}
