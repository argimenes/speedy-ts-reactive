// Measures the deliberately whole-state correctness oracle, not a proposed input callback.
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const source=`
import {decodeDocument} from './src/block-tree/codecs';
import {applyBlockIdentityNormalization,planBlockIdentityNormalization} from './src/block-tree/identity';
import {CanonicalRepository} from './src/block-tree/repository';
import {TreeCommands} from './src/block-tree/commands';
import {context,projectTransition} from './src/history/preplan-spike/projection';
const report=[];
for(const characters of [100,5600,25000]) {
 const raw=decodeDocument({id:'workspace',type:'workspace-block',children:['A','B','C'].map(id=>({id,type:'document-block',metadata:{documentId:id},children:[{id:'p-'+id,type:'standoff-editor-block',text:'x'.repeat(characters)}]}))}).state;
 const state=applyBlockIdentityNormalization(raw,planBlockIdentityNormalization(raw));
 const repository=new CanonicalRepository(state,{enforceBlockIdentity:true}),commands=new TreeCommands(repository,k=>k),ctx=context(),local=new Map();
 const key=Object.values(state.placements).find(p=>state.contents[p.contentKey].payload.id==='p-A').key;
 let event;repository.subscribeHistoryChanges(e=>{event=e;},e=>{throw e;});const before=repository.snapshot();commands.replaceInlineRange(key,1,1,'a');const after=repository.snapshot();
 const samples=[];
 for(let i=0;i<3;i++){local.clear();const start=performance.now();const result=projectTransition(before,after,event,ctx,local);samples.push(performance.now()-start);if(result.revisions.length!==1)throw Error('unexpected projection');}
 samples.sort((a,b)=>a-b);report.push({charactersPerDocument:characters,documents:3,sourceContents:Object.keys(state.contents).length,samples:3,medianMs:+samples[1].toFixed(3),maxMs:+samples[2].toFixed(3)});
}
console.log(JSON.stringify({node:process.version,report,limitation:'Whole-state structural projection oracle; no incremental ownership index or Workspace-root dependency capture'},null,2));`;
const compiled=await build({stdin:{contents:source,resolveDir:fileURLToPath(new URL('../../',import.meta.url)),loader:'ts'},bundle:true,platform:'node',format:'cjs',conditions:['browser'],write:false,logLevel:'silent'});
new Function('require',compiled.outputFiles[0].text)(createRequire(import.meta.url));
