import {vi} from 'vitest';
import type {EntityService,CanonicalEntity,EntityResolution} from '../../feature-api/entities';
export function mockResolver(name='Vernon Blake',id='blake') {
 const entities=new Map<string,CanonicalEntity>([[id,{id,name,revision:0,aliases:[]}]]);
 const service:EntityService={
  search:vi.fn(async(q,signal)=>({candidates:[...entities.values()].filter(e=>!q.query||e.name.toLowerCase().includes(q.query.toLowerCase())).map(e=>({id:e.id,name:e.name,evidence:[{kind:'name',text:e.name}],localMentions:0})),complete:true,diagnostics:[],current(){signal.throwIfAborted();}})),
  summaries:vi.fn(async(ids:string[])=>({rows:ids.map(id=>entities.get(id)).filter((e):e is CanonicalEntity=>!!e),complete:false,diagnostics:["Unqualified test counts"]})),
  get:vi.fn(async id=>entities.get(id)),
  create:vi.fn(async input=>{const e={id:input.id,name:input.name,revision:0,aliases:[]};entities.set(e.id,e);return e;}),
  rename:vi.fn(async input=>{const e=entities.get(input.id)!;Object.assign(e,{name:input.name,revision:e.revision+1});return {...e};}),
  alias:vi.fn(async input=>{const e=entities.get(input.entityId)!;if(input.op==='alias-add')e.aliases.push({id:input.id,name:input.name!,origin:'curated',revision:0});else if(input.op==='alias-remove')e.aliases=e.aliases.filter(a=>a.id!==input.id);else Object.assign(e.aliases.find(a=>a.id===input.id)!,{name:input.name,revision:(input.expected??0)+1});return {...e,aliases:[...e.aliases]};}),
  dispose:vi.fn(),
 };
 return {service,entities};
}
