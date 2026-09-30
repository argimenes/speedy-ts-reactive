// Isolated qualification host; never mounted by the application server.
import express from 'express';
import { createNativeDocumentStoreRouter } from '../dist/server/native-document-store.mjs';
const app=express();let release, held=false, entered=false;
app.get('/__proof/status',(_,res)=>res.json({held,entered}));
app.post('/__proof/hold',(_,res)=>{held=true;entered=false;res.json({ok:true});});
app.post('/__proof/release',(_,res)=>{held=false;release?.();res.json({ok:true});});
app.use('/api/native',createNativeDocumentStoreRouter({root:process.env.PROOF_ROOT,readOnly:false,fault:async stage=>{if(held&&stage==='before-markdown'){entered=true;await new Promise(r=>release=r);}}}));
const server=app.listen(Number(process.env.PROOF_PORT||0),'127.0.0.1',()=>console.log(JSON.stringify({port:server.address().port})));
