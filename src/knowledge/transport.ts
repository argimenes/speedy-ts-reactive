/** The existing authored-value grammar preserves unknown/rich annotation payloads over JSON. */
import {encodeAuthoredValue,decodeAuthoredValue} from '../history/preplan-spike/wire';
import type {Facts} from './facts';
export const MAX_FACTS_TRANSPORT_UNITS=32*1024*1024;
export function encodeFacts(facts:Facts):string {
 const text=JSON.stringify({version:1,facts:{...facts,annotations:facts.annotations.map(a=>({...a,value:encodeAuthoredValue(a.value)}))}});
 if(text.length>MAX_FACTS_TRANSPORT_UNITS)throw Error('Facts transport budget exceeded');return text;
}
const object=(v:any)=>v&&typeof v==='object'&&!Array.isArray(v);
const keys=(v:any,allowed:string[])=>object(v)&&Object.keys(v).every(k=>allowed.includes(k));
const id=(v:any)=>typeof v==='string'&&!!v;
const text=(v:any)=>typeof v==='string';
const strings=(v:any)=>Array.isArray(v)&&v.every(text);
const offset=(v:any)=>Number.isSafeInteger(v)&&v>=0;
const range=(v:any)=>keys(v,['blockId','start','end'])&&id(v.blockId)&&offset(v.start)&&offset(v.end)&&v.end>v.start;
const definition=(v:any)=>v===undefined||keys(v,['resourceId','blockId','annotationId'])&&id(v.resourceId)&&id(v.blockId)&&id(v.annotationId);
export function decodeFacts(serialized:string):Facts {
 if(typeof serialized!=='string'||serialized.length>MAX_FACTS_TRANSPORT_UNITS)throw Error('Facts transport budget exceeded');
 const envelope=JSON.parse(serialized);
 if(!envelope||envelope.version!==1||Object.keys(envelope).sort().join(',')!=='facts,version')throw Error('Invalid Facts transport');
 const f=envelope.facts as Facts;
 if(!keys(f,['id','rootBlockId','title','tags','blocks','annotations','mentions','diagnostics','referenceDiagnostics','hasTitle'])||!id(f.id)||!id(f.rootBlockId)||!text(f.title)||f.hasTitle!==undefined&&typeof f.hasTitle!=='boolean'||f.referenceDiagnostics!==undefined&&!strings(f.referenceDiagnostics)||!strings(f.tags)||!strings(f.diagnostics)||!Array.isArray(f.blocks)||f.blocks.length>10000||!Array.isArray(f.annotations)||f.annotations.length>10000||!Array.isArray(f.mentions)||f.mentions.length>10000)throw Error('Incomplete Facts transport');
 for(const b of f.blocks){
  if(!keys(b,['id','type','text','ordinal','cellCount'])||!id(b.id)||!id(b.type)||b.ordinal!==undefined&&!offset(b.ordinal)||b.cellCount!==undefined&&!offset(b.cellCount))throw Error('Invalid Block Fact');
  if(b.text!==undefined){
   if(!keys(b.text,['coordinate','runs'])||!['cell','utf16'].includes(b.text.coordinate)||!Array.isArray(b.text.runs))throw Error('Invalid text Fact');
   for(const r of b.text.runs)if(!keys(r,['text','boundaries'])||!text(r.text)||b.text.coordinate==='cell'&&(!Array.isArray(r.boundaries)||r.boundaries.length!==r.text.length+1||!r.boundaries.every(n=>Number.isSafeInteger(n)&&n>=-1)))throw Error('Invalid text boundaries');
  }
 }
 for(const a of f.annotations)if(!Object.hasOwn(a,'value')||!keys(a,['id','logicalId','blockId','type','start','end','value','definition','context','contextCells'])||!id(a.id)||!id(a.logicalId)||!id(a.blockId)||!id(a.type)||!offset(a.start)||!offset(a.end)||a.end<=a.start||!definition(a.definition)||a.context!==undefined&&!text(a.context)||a.contextCells!==undefined&&!offset(a.contextCells))throw Error('Invalid annotation Fact');
 for(const m of f.mentions)if(!keys(m,['id','kind','targetId','targetResourceId','ranges','text','annotationIds','definition'])||!id(m.id)||!['document','entity'].includes(m.kind)||!id(m.targetId)||m.targetResourceId!==undefined&&!text(m.targetResourceId)||!Array.isArray(m.ranges)||!m.ranges.every(range)||!text(m.text)||!strings(m.annotationIds)||!definition(m.definition))throw Error('Invalid mention Fact');
 for(const a of f.annotations)a.value=decodeAuthoredValue(a.value);
 return f;
}
