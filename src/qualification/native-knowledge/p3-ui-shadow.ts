/** Explicit qualification adapter; current Flint panels still use C2/C3. */
import type {ReactiveEditor} from '../../reactive-editor/editor';import {createDocumentVaults} from '../../application/document-vault';import {nativeDocumentSession} from '../../persistence/native-session';import {createNativeKnowledgeHost} from '../../application/native-knowledge-scope';import {DEFAULT_POLICY} from '../../knowledge/policy';
export async function start(editor:ReactiveEditor){
 const native=nativeDocumentSession(editor),vaults=createDocumentVaults(native),vault=await vaults.acquire('vault');
 const create=()=>createNativeKnowledgeHost(editor.repository,native,{read:()=>DEFAULT_POLICY,subscribe:()=>()=>{}},{debounceMs:100});
 let factory=create(),one=factory.acquire(vault),two=factory.acquire(vault);await factory.host.flush();
 const initial={facts:(await one.prepare()).facts.length,observations:factory.host.metrics.observations,bytes:factory.host.index.retainedBytes};
 return {initial,async check(target:string){await vault.refresh();await factory.host.flush();const oneResult=await one.backlinks(target),twoResult=await two.backlinks(target);return {one:oneResult.hits.length,two:twoResult.hits.length,coverage:one.coverage(),metrics:{...factory.host.metrics}};},
  async closeOne(){one.release();return {facts:(await two.prepare()).facts.length,bytes:factory.host.index.retainedBytes};},
  async typing(source:string){
   const projection=[...editor.projections.values()].find(p=>(p.state.nodes[p.state.rootKey].payload.metadata as any)?.documentId===source)!,node=Object.values(projection.state.nodes).find(n=>n.viewType==='standoff-editor-block')!;
   const rows=[];for(let round=0;round<3;round++)for(const enabled of (round%2?[true,false]:[false,true])){
    await factory.dispose();if(enabled){factory=create();one=factory.acquire(vault);two=factory.acquire(vault);await factory.host.flush();}
    for(let i=0;i<25;i++)editor.commands.replaceInlineRange(node.key,0,1,i%2?'S':'s');const times=[];for(let i=0;i<70;i++){const t=performance.now();editor.commands.replaceInlineRange(node.key,0,1,i%2?'S':'s');times.push(performance.now()-t);}
    const sync=enabled?{...factory.host.metrics}:undefined,t=performance.now();if(enabled)await factory.host.flush();rows.push({round,enabled,medianMs:times.sort((a,b)=>a-b)[35],maxMs:Math.max(...times),deferredMs:performance.now()-t,sync,after:enabled?{...factory.host.metrics}:undefined});
   }return rows;
  },
  async dispose(){await factory.dispose();vault.release();vaults.dispose();return factory.host.index.retainedBytes;},
 };
}
