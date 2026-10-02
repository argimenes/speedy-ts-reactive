/** P3a host lifecycle only. No Facts, query, repository, save or Entity capability. */
export function sqliteIndexLifecycle(vault:string,policy:unknown) {
  let closed=false,lease:string|undefined,readOnly=false,work:Promise<void>|undefined;
  let status:unknown={coverage:{state:'unknown',complete:false}};
  const request=async(action:string,body:unknown)=>{
    const response=await fetch('/api/sqlite/knowledge/'+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    if(!response.body)throw Error('SQLite status unavailable');
    const reader=response.body.getReader(),parts:Uint8Array[]=[];let bytes=0;
    try{for(;;){const r=await reader.read();if(r.done)break;bytes+=r.value.byteLength;if(bytes>65536)throw Error('SQLite status response exceeds budget');parts.push(r.value);}}finally{await reader.cancel();}
    const all=new Uint8Array(bytes);let offset=0;for(const p of parts){all.set(p,offset);offset+=p.byteLength;}
    const json=JSON.parse(new TextDecoder().decode(all));if(!response.ok||!json.Success)throw Error(json.Error??'SQLite status unavailable');return json.Data;
  };
  const refresh=(force=false)=>{
    if(closed)return Promise.resolve();if(work)return work;
    return work=(async()=>{try{
      if(!lease){const opened=await request('open',{vault,policy});lease=opened.lease;readOnly=opened.readOnly;status=opened;
        if(closed){await request('release',{lease});lease=undefined;return;}}
      status=await request(force&&!readOnly?'refresh':'status',{lease});
    }catch(error){if(String(error).includes('lease expired'))lease=undefined;status={coverage:{state:'unknown',complete:false,diagnostics:[String(error)]}};}
    finally{work=undefined;}})();
  };
  return {refresh,status:()=>status,dispose(){closed=true;if(lease){void request('release',{lease}).catch(()=>{});lease=undefined;}}};
}
