import {decodeAuthoredValue} from '../../history/preplan-spike/wire';
import type {EntityService} from '../../feature-api/entities';
export async function thesisRequest(vault:string,request:unknown,signal?:AbortSignal):Promise<any> {
 const input=request as {op?:string;annotations?:unknown[]};
 const reject=(message:string):never=>{throw Object.assign(new Error(message),{notDispatched:true});};
 if(['create','update'].includes(input.op??'')&&input.annotations&&input.annotations.length>100)reject('A Proposition supports at most 100 annotations. Remove some annotations before saving.');
 const body=JSON.stringify({vault,request});if(new TextEncoder().encode(body).length>32768)reject('This Proposition exceeds the 32 KiB save budget. Shorten the statement or reduce its annotations.');
 const response=await fetch('/api/sqlite/knowledge/propositions',{method:'POST',headers:{'Content-Type':'application/json'},body,signal});
 const result=await response.json();if(!response.ok||!result.Success)throw Error(result.Error??'Thesis unavailable');return result.Data;
}
/** Uses existing Entity annotation tools with an explicitly selected Vault, never a fake source. */
export function thesisEntityService(vault:string,localTargets:()=>Set<string>=()=>new Set()):EntityService {
 let alive=true;const check=()=>{if(!alive)throw Error('Thesis Entity resolver closed');};
 const read=async(request:unknown,signal?:AbortSignal)=>{check();const r=await thesisRequest(vault,{op:'entities',request},signal);check();return r;};
 const unavailable=async():Promise<never>=>{throw Object.assign(new Error('Create or edit Entity records in the Entity manager. Thesis can annotate with existing Entities.'),{entityCreationOutcome:'not-created'});};
 return {
  names:async(ids,signal)=>(await read({op:'names',ids},signal)).rows,
  dbMentions:async(ids,signal)=>(await read({op:'db-mentions',ids},signal)).rows,
  get:async(id,signal)=>{const entity=(await read({op:'get',id},signal)).entity;return entity?{...entity,attributes:decodeAuthoredValue(entity.attributes)}:undefined;},
  summaries:async(ids,signal)=>({rows:(await read({op:'names',ids},signal)).rows,complete:true,diagnostics:[]}),
  search:async(query,signal)=>{
   if(query.stream==='mention')return {candidates:[],complete:false,diagnostics:['Thesis searches canonical Entity names and aliases.'],current:check};
   const r=await read({op:'search',query:query.query,match:query.match,stream:query.stream},signal),candidates=new Map<string,any>();
   for(const m of r.matches){const row=candidates.get(m.id)??{id:m.id,name:m.name,evidence:[]};row.evidence.push({kind:m.kind,text:m.text});candidates.set(m.id,row);}
   return {candidates:[...candidates.values()].filter(c=>query.scope!=='document'||localTargets().has(c.id)),complete:r.complete,diagnostics:[],current:check};
  },create:unavailable,rename:unavailable,alias:unavailable,dispose(){alive=false;},
 };
}
