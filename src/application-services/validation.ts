import {academicIdentifier} from '../academic/identifiers';
import {httpsUrl} from '../iiif/model';
import {wikipediaInput,validQid} from '../interchange/encyclopedia';
import {doiInput} from '../interchange/scholarly';
import type {NativeRead,PackageDataRequest,Preparation,Operation,JobSummary} from './contracts';
export const SERVICE_LIMITS=Object.freeze({source:200000,inputBytes:16*1024*1024,resultBytes:64*1024*1024,jobs:1000,revisions:256,active:1,queue:2,deadlineMs:30000});
export const operations:readonly Operation[]=['native.read','assets.original','knowledge.packageData','jobs.create','jobs.list','jobs.inspect','jobs.run','jobs.cancel','jobs.result'];
export function object(value:unknown,keys:string[]):asserts value is Record<string,any> {
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!keys.includes(k)))throw Error('Invalid operation fields');
}
export function jobId(value:unknown):asserts value is string {if(typeof value!=='string'||!/^[a-f0-9-]{36}$/.test(value))throw Error('Invalid job identity');}
export function assetId(value:unknown):asserts value is string {if(typeof value!=='string'||!/^sha256:[a-f0-9]{64}$/.test(value))throw Error('Invalid asset identity');}
export function nativeRead(value:unknown):asserts value is NativeRead {
 object(value,['location','expectedHash']);object(value.location,['folder','filename']);
 const {folder,filename}=value.location;
 if(typeof folder!=='string'||folder.length>240||!(folder==='.'||folder.split('/').every((p:string)=>!!p&&!p.startsWith('.')&&!/[\\\0:]/.test(p)))||typeof filename!=='string'||filename.length>240||!(/^[^./\\\0:][^/\\\0:]*\.(ink|phosphor|mutable\.json)$/).test(filename))throw Error('Invalid native location');
 if(value.expectedHash!==undefined&&(typeof value.expectedHash!=='string'||!/^[a-f0-9]{64}$/.test(value.expectedHash)))throw Error('Invalid native hash');
}
export function knowledgeOptions(value:unknown) {object(value,['relationships','claims','evidence','actors','observedAliases']);if(Object.values(value).some(v=>typeof v!=='boolean'))throw Error('Invalid knowledge options');}
export function packageRequest(value:unknown):asserts value is PackageDataRequest {
 object(value,['entities','claimsById','documentHash','relationships','claims','evidence','actors','observedAliases']);
 const {entities,claimsById=[],documentHash,...options}=value;knowledgeOptions(options);
 if(!Array.isArray(entities)||!Array.isArray(claimsById)||entities.length+claimsById.length>500||[...entities,...claimsById].some(x=>typeof x!=='string'||!x||x.length>1024))throw Error('Invalid package seeds');
 if(documentHash!==undefined&&(typeof documentHash!=='string'||!/^[a-f0-9]{64}$/.test(documentHash)))throw Error('Invalid document hash');
}
export function preparation(value:unknown):asserts value is Preparation {
 if((value as Preparation)?.kind==='deterministic'){object(value,['kind','source','format']);if(value.format==='xml')httpsUrl(value.source);else if(value.format!==undefined||!academicIdentifier(value.source))throw Error('Invalid academic identifier');}
 else if((value as Preparation)?.kind==='pdf'||(value as Preparation)?.kind==='iiif'){object(value,['kind','source']);httpsUrl(value.source);}
 else if((value as Preparation)?.kind==='encyclopedia'){object(value,['kind','source']);if(!wikipediaInput(value.source)&&!validQid(value.source))throw Error('Invalid encyclopedia source');}
 else if((value as Preparation)?.kind==='academic'){object(value,['kind','source']);if(!doiInput(value.source))throw Error('Invalid scholarly DOI');}
 else if((value as Preparation)?.kind==='convert'){
  object(value,['kind','format','source']);if(!['markdown','html','text'].includes(value.format)||typeof value.source!=='string'||value.source.length>SERVICE_LIMITS.source)throw Error('Conversion source exceeds supported limits');
 }else{
  object(value,['kind','document','knowledge']);if(value.kind!=='package')throw Error('Unsupported preparation');nativeRead(value.document);if(!value.document.expectedHash)throw Error('Package preparation requires reviewed native hash');knowledgeOptions(value.knowledge);
 }
}
export function jobSummary(value:unknown,id:string,cavernId:string):asserts value is JobSummary {
 object(value,['version','id','cavernId','revision','state','kind','created','updated','error','resultBytes']);
 if(value.version!==1||value.id!==id||value.cavernId!==cavernId||!Number.isSafeInteger(value.revision)||value.revision<0||value.revision>=SERVICE_LIMITS.revisions||!['ready','running','interrupted','completed','cancelled','failed'].includes(value.state)||!['convert','package','deterministic','academic','encyclopedia','iiif','pdf'].includes(value.kind))throw Error('Invalid job recovery evidence');
 for(const key of ['created','updated'])if(typeof value[key]!=='string'||value[key].length>40||!Number.isFinite(Date.parse(value[key])))throw Error('Invalid job timestamp');
 if(value.error!==undefined&&(typeof value.error!=='string'||value.error.length>500))throw Error('Invalid job error');
 if(value.resultBytes!==undefined&&(!Number.isSafeInteger(value.resultBytes)||value.resultBytes<0||value.resultBytes>SERVICE_LIMITS.resultBytes))throw Error('Invalid job result size');
}
