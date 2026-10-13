// Read-only HTTP benchmark against an existing vault. Never starts indexing.
// Usage: node scripts/benchmark-entity-lookup.mjs <managed-root> <vault> [query]
import express from 'express';
import path from 'node:path';
import {SqliteKnowledgeHost} from '../dist/server/sqlite-knowledge-host.js';

const [root,vault,query='Rome']=process.argv.slice(2);
if(!root||!vault)throw Error('Supply managed-root and vault');
const host=new SqliteKnowledgeHost({root:path.resolve(root),readOnly:true});
const app=express();app.use('/knowledge',host.router());
const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
try{
 const url=`http://127.0.0.1:${server.address().port}/knowledge/entity-lookup`;
 for(let i=0;i<5;i++){
  const start=performance.now();
  const response=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({vault,request:{op:'search',query,stream:'name',match:'partial'}})});
  const result=await response.json();if(!result.Success)throw Error(result.Error);
  console.log(JSON.stringify({query,run:i+1,milliseconds:+(performance.now()-start).toFixed(2),cached:result.Data.cached,matches:result.Data.matches.length}));
 }
 if(host.metrics.sweeps)throw Error('Selector unexpectedly triggered indexing');
}finally{await new Promise(resolve=>server.close(resolve));await host.close();}
