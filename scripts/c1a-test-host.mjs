// Isolated process-death qualification host; not mounted by the application.
import express from 'express';
import { createNativeDocumentStoreRouter } from '../dist/server/native-document-store.mjs';
const app=express();
app.use('/api/native',createNativeDocumentStoreRouter({root:process.env.PROOF_ROOT,readOnly:false,fault:async stage=>{
 if(stage===process.env.PROOF_HOLD){process.stdout.write(JSON.stringify({held:stage})+'\n');await new Promise(()=>{});}
}}));
const server=app.listen(0,'127.0.0.1',()=>process.stdout.write(JSON.stringify({port:server.address().port})+'\n'));
