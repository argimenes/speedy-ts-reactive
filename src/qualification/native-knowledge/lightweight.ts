/** Qualification only. Text-free validation witness is PRIVATE and must never be saved/admitted. */
import {decodeNative,parseNativeEnvelope} from '../../persistence/native-resource';
import {validateNativeTextSpan} from '../../history/stage-c-gates/portable';
import {extract,type InlineFacts} from './extract';
import type {TextRun} from '../../runtime/search-matching';
type Span = {kind:'text';text:string}|{kind:'image';properties:unknown};

/** Same code-point Cell grammar/boundaries as the decoder + canonicalSearchSource.
 * No per-character ContentRecord, PlacementRecord, UUID or ownership scan. */
async function inlineFacts(spans:readonly Span[],signal?:AbortSignal):Promise<InlineFacts>{
 const runs:TextRun[]=[],cells:string[]=[];let parts:string[]=[],units=0,boundaries=[0],used=0;
 for(const span of spans){
  if(span.kind==='image'){runs.push({text:parts.join(''),boundaries});cells.push('[inline object]');parts=[];units=0;boundaries=[cells.length];continue;}
  for(const part of span.text){
   if(cells.length&&cells.length%2048===0){await new Promise(r=>setTimeout(r,0));signal?.throwIfAborted();}
   used+=part.length;if(used>2000000)throw Error('Native text exceeds the bounded search budget');
   boundaries[units]=cells.length;for(let i=1;i<part.length;i++)boundaries[units+i]=-1;
   cells.push(part);parts.push(part);units+=part.length;boundaries[units]=cells.length;
  }
 }
 runs.push({text:parts.join(''),boundaries});signal?.throwIfAborted();
 return {length:cells.length,text:{coordinate:'cell',runs},snippet:(start,end)=>cells.slice(start,end).join('')};
}

export function prepareLightweightFacts(bytes:Uint8Array,signal?:AbortSignal){
 signal?.throwIfAborted();const start=performance.now();
 // Validate the ORIGINAL reserved shape before dropping anything. Unknown text
 // atom fields, invalid UTF-8, envelope/value versions etc cannot disappear.
 const envelope=parseNativeEnvelope(bytes),spans=new Map<string,readonly Span[]>();
 const document={...envelope.document,blocks:envelope.document.blocks.map(block=>{
  if(block.inline===undefined)return block;
  for(const atom of block.inline)if(atom.kind==='text')validateNativeTextSpan(atom.text);
  spans.set(block.id,block.inline);
  return {...block,inline:block.inline.filter(atom=>atom.kind!=='text')};
 })};
 // Existing decoder is the structural/ownership/provenance oracle. Only text
 // atoms are removed: they contain no authored IDs/edges/definition/asset bags.
 // Image atoms MUST remain; their authored values may carry those semantics.
 // Re-encoding this private witness is intentional in this bounded experiment:
 // it avoids adding an unchecked semantic-decoder entry point to core.
 const witness=decodeNative(new TextEncoder().encode(JSON.stringify({...envelope,document})));
 const validationMs=performance.now()-start;signal?.throwIfAborted();
 // No partial ResourceSnapshot escapes: only validated identity and a facts closure.
 return {resourceId:witness.resourceId,validationMs,async materialize(location:string,generation:string,signal?:AbortSignal){
  const factsStart=performance.now();const facts=await extract(witness,location,generation,signal,(id,s)=>inlineFacts(spans.get(id)??[],s));
  return {facts,timings:{validationMs,factsMs:performance.now()-factsStart}};
 }};
}

export async function lightweightFacts(bytes:Uint8Array,location:string,generation:string,signal?:AbortSignal){
 return prepareLightweightFacts(bytes,signal).materialize(location,generation,signal);
}
