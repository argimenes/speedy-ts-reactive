import {afterEach,expect,it,vi} from 'vitest';
import {webcrypto} from 'node:crypto';
import {SqliteSavedFactsClient} from './sqlite-saved-facts-client';
import {encodeFacts} from '../knowledge/transport';
import {normalizePolicy,policyKey} from '../knowledge/policy';
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
function fixture(){
 vi.stubGlobal('crypto',webcrypto);const policy=normalizePolicy(undefined),rows=['a','b'].map(resourceId=>({resourceId,state:'unenrolled',location:{folder:'.',filename:resourceId+'.mutable.json'},baseline:{nativeHash:resourceId+'hash'}}));
 let alive=true,expired=false,batches=0,wrongIdentity=false;const calls:any[]=[];
 const proof={session:'server',indexEpoch:1,revision:'1:2',scope:'scope'},coverage={state:'complete',complete:true};
 vi.spyOn(globalThis,'fetch').mockImplementation(async(url,options)=>{
  const body=JSON.parse(options!.body as string),action=String(url).split('/').at(-1);calls.push({url,body});let data:any;
  if(action==='open')data={lease:'lease'};
  else if(action==='begin')data={scope:'scope',signature:body.signature,policy:policyKey(policy),discoveryMs:1,evidence:proof,coverage};
  else if(action==='batch'){batches++;data={scope:'scope',evidence:proof,coverage,items:body.ids.map((id:string)=>({resourceId:id,evidence:{resourceId:wrongIdentity?'wrong':id,location:rows.find(r=>r.resourceId===id)!.location,byteHash:id+'hash',policy:policyKey(policy)},wire:encodeFacts({id,rootBlockId:id+'root',title:id,tags:[],blocks:[],annotations:[],mentions:[],diagnostics:[]})}))};}
  else if(action==='current'){if(expired)return new Response(JSON.stringify({Success:false,Error:'expired'}),{status:409});data={evidence:proof,coverage};}
  else data={released:true};
  return new Response(JSON.stringify({Success:true,Data:data}));
 });
 const vault={root:'.',signature:()=>JSON.stringify(rows),isAlive:()=>alive,snapshot:()=>({documents:rows})} as any;
 const client=new SqliteSavedFactsClient(vault,()=>false),signal=new AbortController().signal;
 return {client,rows,policy,signal,calls,batches:()=>batches,expire:()=>expired=true,wrong:()=>wrongIdentity=true,close:()=>alive=false};
}
it('uses existing VerifiedSaved seam, validates buffered reads, and releases independent scope/lease',async()=>{
 const f=fixture();try{const one=await f.client.read(f.rows[0] as any,f.policy,f.signal);expect(one.facts.id).toBe('a');expect(f.client.status().complete).toBe(true);await f.client.read(f.rows[1] as any,f.policy,f.signal);expect(f.batches()).toBe(1);expect(f.calls.filter(c=>String(c.url).endsWith('/current'))).toHaveLength(2);}finally{f.client.reset();}
 expect(f.calls.filter(c=>String(c.url).endsWith('/release')).map(c=>c.body)).toEqual([{scope:'scope'},{lease:'lease'}]);
});
it('buffered rows cannot survive a remote SQL epoch change',async()=>{const f=fixture();try{await f.client.read(f.rows[0] as any,f.policy,f.signal);f.expire();await expect(f.client.read(f.rows[1] as any,f.policy,f.signal)).rejects.toThrow('expired');expect(f.client.status().complete).toBe(false);expect(f.batches()).toBe(1);}finally{f.client.reset();}});
it('identity mismatch and disposed scope never publish a contribution',async()=>{const f=fixture();try{f.wrong();await expect(f.client.read(f.rows[0] as any,f.policy,f.signal)).rejects.toThrow('evidence mismatch');f.close();await expect(f.client.read(f.rows[1] as any,f.policy,f.signal)).rejects.toThrow('superseded');}finally{f.client.reset();}});
it('aborted requests reset scopes without cancelling the resource-owned host',async()=>{const f=fixture();try{await f.client.prepare(f.policy,f.signal);const c=new AbortController();c.abort(Error('cancelled'));await expect(f.client.read(f.rows[0] as any,f.policy,c.signal)).rejects.toThrow('cancelled');expect(f.client.status().complete).toBe(false);expect(f.calls.some(c=>String(c.url).endsWith('/refresh'))).toBe(false);}finally{f.client.reset();}});
