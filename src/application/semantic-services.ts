import type {SemanticVaultServices,SemanticRecordType,RecordService,ChildService,IncidenceInput,TimeInput,ClaimInput,DataSetInput,DataPointInput} from '../feature-api/semantics';
import {encodeAuthoredValue,decodeAuthoredValue} from '../history/preplan-spike/wire';
import {featureFlags} from '../configuration';
/** Only declared authored fields use the lossless value wire. No JSON coercion. */
function encode(value:any):any{
 if(Array.isArray(value))return value.map(encode);if(!value||typeof value!=='object')return value;
 return Object.fromEntries(Object.entries(value).map(([key,v])=>[key,key==='attributes'||key==='value'?encodeAuthoredValue(v):encode(v)]));
}
function decode(value:any):any{
 if(Array.isArray(value))return value.map(decode);if(!value||typeof value!=='object')return value;
 return Object.fromEntries(Object.entries(value).map(([key,v])=>[key,key==='attributes'||key==='value'?decodeAuthoredValue(v):decode(v)]));
}
async function httpTransport(action:string,body:unknown,signal?:AbortSignal,baseUrl=''):Promise<any>{
 signal?.throwIfAborted();const response=await fetch(baseUrl+'/api/sqlite/knowledge/'+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal});
 if(!response.body)throw Error('Semantic services unavailable');const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
 try{for(;;){signal?.throwIfAborted();const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>2*1024*1024)throw Error('Semantic response budget exceeded');chunks.push(part.value);}}finally{await reader.cancel();}
 const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
 const result=JSON.parse(new TextDecoder().decode(bytes));if(!response.ok||!result.Success)throw Object.assign(new Error(result.Error??'Semantic operation unavailable'),{mutationOutcome:result.outcome??'unconfirmed'});return result.Data;
}
/** Explicit selected vault; independent of global focus or an invoking editor. */
export async function openSemanticServices(options:{vault:string;enabled?:boolean;signal?:AbortSignal;baseUrl?:string}):Promise<SemanticVaultServices>{
 if(!(options.enabled??featureFlags.sqliteSemanticServices))throw Error('Semantic services are disabled');
 const transport=(action:string,body:unknown,signal?:AbortSignal)=>httpTransport(action,body,signal,options.baseUrl);
 const opened=await transport('semantic-open',{vault:options.vault},options.signal);let alive=true;
 const context=()=>{if(!alive)throw Error('Semantic service disposed');return {lease:opened.lease,vaultGuid:opened.vaultGuid};};
 const call=async(request:Record<string,unknown>,signal?:AbortSignal,source?:unknown)=>decode(await transport('semantics',{...context(),request:encode(request),...(source?{source}:{})},signal));
 const service=<T>(recordType:SemanticRecordType):RecordService<T>=>({
  get:(guid,signal)=>call({recordType,op:'get',guid},signal),create:(input,signal)=>call({...input,recordType,op:'create'},signal),update:(input,signal)=>call({...input,recordType,op:'update'},signal),
  query:(query={},signal)=>call({...query,recordType,op:'query'},signal),count:(query={},signal)=>call({...query,recordType,op:'count'},signal)
 });
 const children=<T>(recordType:SemanticRecordType):ChildService<T>=>({
  get:(guid,signal)=>call({recordType,op:'get',guid},signal),add:(input,signal)=>call({...input,recordType,op:'add'},signal),
  update:(input,signal)=>call({...input,recordType,op:'update'},signal),remove:(input,signal)=>call({...input,recordType,op:'remove'},signal),query:(query={},signal)=>call({...query,recordType,op:'query'},signal)
 });
 return {
  vaultGuid:opened.vaultGuid,times:service<TimeInput>('Time'),claims:service<ClaimInput>('Claim'),dataSets:service<DataSetInput>('DataSet'),dataPoints:service<DataPointInput>('DataPoint'),
  participants:children<IncidenceInput&{claimGuid:string}>('ClaimParticipant'),qualifiers:children<IncidenceInput&{claimGuid:string;role:string}>('ClaimQualifier'),dimensions:children<IncidenceInput&{dataPointGuid:string;role:string}>('DataPointDimension'),
  execute:(command,signal)=>call(command,signal),query:(recordType,query={},signal)=>call({...query,recordType,op:'query'},signal),
  batch:(input,signal)=>call({...input,op:'batch'},signal),
  memberships:{
   add:(input,signal)=>call({...input,recordType:'DataSetMembership',op:'add'},signal),update:(input,signal)=>call({...input,recordType:'DataSetMembership',op:'update'},signal),remove:(input,signal)=>call({...input,recordType:'DataSetMembership',op:'remove'},signal),
   members:(dataSetGuid,query={},signal)=>call({...query,op:'members',dataSetGuid},signal),collections:(dataPointGuid,query={},signal)=>call({...query,op:'collections',dataPointGuid},signal)
  },
  evidence:{attach:(input,signal)=>call({...input,recordType:'ClaimEvidence',op:'add'},signal),list:(claimGuid,query={},signal)=>call({...query,recordType:'ClaimEvidence',op:'query',filters:{...query.filters,claimGuid}},signal),resolve:(guid,source,signal)=>call({op:'resolve-evidence',guid},signal,source)},
  audit:{status:signal=>transport('semantic-audit',{...context(),op:'status'},signal),deliver:(opts={},signal)=>transport('semantic-audit',{...context(),op:'deliver',options:opts},signal),outcome:async(operationId,signal)=>decode(await transport('semantic-audit',{...context(),op:'outcome',operationId},signal))},
  async dispose(){if(!alive)return;alive=false;await transport('release',{lease:opened.lease});}
 };
}
