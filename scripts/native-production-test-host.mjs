// Isolated qualification host; never mounted by the application server.
import express from 'express';
import { createDocumentStoreRouter } from '../dist/server/document-store.js';
import { createNativeDocumentStoreRouter } from '../dist/server/native-document-store.mjs';
import {SqliteKnowledgeHost} from '../dist/server/sqlite-knowledge-host.js';
const sqlite=process.env.PROOF_SQLITE==='1'?new SqliteKnowledgeHost({root:process.env.PROOF_ROOT,readOnly:process.env.PROOF_READONLY==='1'}):undefined;
const app=express();if(sqlite)app.use('/api/sqlite/knowledge',sqlite.router());let release, held=false, entered=false, holdStage='before-markdown';
app.get('/__proof/status',(_,res)=>res.json({held,entered}));
app.post('/__proof/hold',(req,res)=>{held=true;entered=false;holdStage=String(req.query.stage??'before-markdown');res.json({ok:true});});
app.post('/__proof/release',(_,res)=>{held=false;release?.();res.json({ok:true});});
app.use('/api/native',createNativeDocumentStoreRouter({root:process.env.PROOF_ROOT,readOnly:process.env.PROOF_READONLY==='1',coordinate:sqlite?a=>sqlite.foreground(a):undefined,fault:async stage=>{if(held&&stage===holdStage){entered=true;await new Promise(r=>release=r);}}}));
app.use('/api',createDocumentStoreRouter({root:process.env.PROOF_ROOT,readOnly:process.env.PROOF_READONLY==='1',coordinate:sqlite?a=>sqlite.foreground(a):undefined}));
const server=app.listen(Number(process.env.PROOF_PORT||0),'127.0.0.1',()=>console.log(JSON.stringify({port:server.address().port})));
