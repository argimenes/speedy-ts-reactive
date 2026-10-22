/** Explicit, bounded public-authority reads. No requests are triggered by editor typing. */
export type Authority = 'wikidata'|'gnd';
import type { AuthorityRecord } from '../../feature-api/entities';
export type { AuthorityRecord } from '../../feature-api/entities';
const cache=new Map<string,unknown>();
async function json(url:string,signal:AbortSignal):Promise<any> {
 signal.throwIfAborted();if(cache.has(url))return cache.get(url);
 const response=await fetch(url,{signal,credentials:'omit',referrerPolicy:'no-referrer'});
 if(!response.ok)throw Error(`Authority returned HTTP ${response.status}. Retry later; no automatic retries.`);
 if(!response.body)throw Error('Authority returned no data');
 const reader=response.body.getReader(),chunks:Uint8Array[]=[];let total=0;
 try {while(true){signal.throwIfAborted();const {done,value}=await reader.read();if(done)break;if((total+=value.length)>1_000_000)throw Error('Authority response exceeded the 1 MB budget');chunks.push(value);}}finally{await reader.cancel();}
 const data=new Uint8Array(total);let offset=0;for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.length;}
 const result=JSON.parse(new TextDecoder().decode(data));if(result.error)throw Error(result.error.info??'Authority rejected the request');
 if(cache.size>=32)cache.delete(cache.keys().next().value!);cache.set(url,result);return result;
}
const wiki=(params:Record<string,string>)=>'https://www.wikidata.org/w/api.php?'+new URLSearchParams({format:'json',origin:'*',...params});
const strings=(items:any[])=>items.filter(v=>typeof v==='string').map(v=>v.slice(0,1000)).slice(0,20);
function gnd(row:any):AuthorityRecord {
 const id=String(row.gndIdentifier??'');if(!/^[0-9X-]{3,30}$/u.test(id))throw Error('Invalid GND identifier');
 const linked=(row.sameAs??[]).map((r:any)=>r.id).find((id:any)=>typeof id==='string'&&/^https?:\/\/www.wikidata.org\/entity\/Q[1-9]\d*$/u.test(id));
 return {provider:'gnd',id,name:String(row.preferredName??id).slice(0,1000),description:strings(row.biographicalOrHistoricalInformation??[]).join(' '),aliases:strings(row.variantName??[]),url:'https://d-nb.info/gnd/'+id,retrievedAt:new Date().toISOString(),wikidata:linked?.split('/').at(-1)};
}
export async function searchAuthority(provider:Authority,query:string,signal:AbortSignal):Promise<AuthorityRecord[]> {
 if(!query.trim()||query.length>256)throw Error('Enter an authority query of 1–256 characters');
 if(provider==='gnd') {const escaped=query.replace(/[+\-=!(){}\[\]^"~*?:\\/|&<>]/gu,'\\$&');const data=await json('https://lobid.org/gnd/search?'+new URLSearchParams({q:`preferredName:"${escaped}"`,format:'json',size:'10'}),signal);return (data.member??[]).slice(0,10).map(gnd);}
 const data=await json(wiki({action:'wbsearchentities',language:'en',type:'item',limit:'10',search:query}),signal);
 return (data.search??[]).filter((r:any)=>/^Q[1-9]\d{0,14}$/u.test(r.id)).slice(0,10).map((r:any)=>({provider,id:r.id,name:String(r.label??r.id).slice(0,1000),description:String(r.description??'').slice(0,2000),aliases:[],url:'https://www.wikidata.org/wiki/'+r.id,retrievedAt:new Date().toISOString()}));
}
export async function authorityDetails(record:AuthorityRecord,signal:AbortSignal):Promise<AuthorityRecord> {
 if(record.provider==='gnd')return record;
 const data=await json(wiki({action:'wbgetentities',ids:record.id,props:'labels|descriptions|aliases|info',languages:'en'}),signal),row=data.entities?.[record.id];
 if(!row||row.missing!==undefined)throw Error('Authority record is missing');
 return {...record,name:row.labels?.en?.value??record.name,description:row.descriptions?.en?.value??record.description,aliases:strings((row.aliases?.en??[]).map((a:any)=>a.value)),revision:row.lastrevid};
}
