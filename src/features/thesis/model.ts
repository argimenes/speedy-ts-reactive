import { clone } from '../../block-tree/clone';
import type { JsonObject } from '../../block-tree/types';
import { includesPoint, pointAffinity } from '../../interchange/ranges';
import { encodeAuthoredValue, decodeAuthoredValue } from '../../history/preplan-spike/wire';
export interface SourcePassage {
 version:1; vault:string; vaultGuid:string; cavernId?:string; resourceGuid:string; blockGuid:string;
 start:number; end:number; coordinate:'cell'; text:string; blockText?:string; blockHash?:string; capturedUtc:string;
 sourceRevision:number; savedHash?:string; location?:{folder:string;filename:string};
}
export interface Draft {text:string; properties:JsonObject[]; warnings:string[]; source?:SourcePassage}
export interface Proposition {id:string;blockId:string;name:string;text:string;revision:number;modifiedUtc:string;attributes:{thesis:{version:1;archived:boolean;source?:SourcePassage}};annotations:{id:string;start:number;end:number;property:unknown}[]}
const clippable=new Set(['style/bold','style/italics','style/underline','style/strikethrough','style/highlight','style/highlighter','style/superscript','style/subscript']);
/** Only explicit text-cell sequences are accepted. Cell offsets are never UTF-16 offsets. */
export function transferSelection(cells:readonly {type:string;text?:string}[],properties:readonly JsonObject[],start:number,end:number,resolve:(p:JsonObject)=>JsonObject|undefined=p=>p):Draft {
 if(!Number.isInteger(start)||!Number.isInteger(end)||start<0||end<=start||end>cells.length)throw Error('Select a nonempty passage in one text Block.');
 if(cells.some(c=>c.type!=='text-cell'||typeof c.text!=='string'||[...c.text].length!==1))throw Error('This Block contains embedded objects or unsupported cells. Select a text-only Block; no content was copied.');
 const warnings:string[]=[],copied:JsonObject[]=[];
 for(const original of properties){
  const p=original.annotationId!=null||original.externalDefinition!=null?resolve(original):original;
  if(!p){warnings.push(`Omitted unresolved linked annotation ${original.id??original.type??''}.`);continue;}
  if(typeof p.type!=='string'||!p.type){warnings.push(`Omitted annotation ${p.id??''}: no resolved annotation type.`);continue;}
  if(!Number.isInteger(p.start)||!Number.isInteger(p.end)){warnings.push(`Omitted annotation ${p.id??''}: invalid range.`);continue;}
  const a=Number(p.start),b=p.isZeroWidth?a:Number(p.end)+1;
  if(a<0||b<a||b>cells.length||!p.isZeroWidth&&a===b){warnings.push(`Omitted annotation ${p.id??''}: invalid range.`);continue;}
  if(p.isZeroWidth?!includesPoint(p,start,end,cells.length):b<=start||a>=end)continue;
  const crossing=a<start||b>end;
  if(crossing&&!clippable.has(String(p.type))){warnings.push(`Omitted ${p.type??'annotation'} ${p.id??''}: its semantic range extends beyond the selection.`);continue;}
  if(crossing)warnings.push(`Clipped ${p.type} ${p.id??''} to the selected passage.`);
  const next=clone(p);delete next.annotationId;delete next.externalDefinition;
  next.id=crypto.randomUUID();next.start=Math.max(a,start)-start;next.end=p.isZeroWidth?next.start:Math.min(b,end)-start-1;
  if(p.isZeroWidth)next.affinity=pointAffinity(p,cells.length);
  next.thesisOrigin={version:1,annotationId:original.id??null,...(original.annotationId?{definitionId:original.annotationId,materialized:true}:{})};
  copied.push(next);
 }
 return {text:cells.slice(start,end).map(c=>c.text).join(''),properties:copied,warnings};
}
/** Explicit native inclusive-cell -> SQL half-open UTF-16 conversion, including points. */
export function serializeAnnotations(text:string,properties:readonly JsonObject[]) {
 const boundaries=[0];for(const cell of text)boundaries.push(boundaries.at(-1)!+cell.length);
 return properties.map(p=>{
  if(p.annotationId!=null||p.externalDefinition!=null)throw Error('Standalone Propositions support direct annotations only.');
  const start=boundaries[Number(p.start)],end=boundaries[Number(p.isZeroWidth?p.start:Number(p.end)+1)];
  if(typeof p.id!=='string'||!Number.isInteger(p.start)||!Number.isInteger(p.end)||start===undefined||end===undefined||end<start||p.isZeroWidth&&p.end!==p.start||!p.isZeroWidth&&end===start)throw Error('An annotation has an invalid final range.');
  return {id:p.id,start,end,property:encodeAuthoredValue(clone(p))};
 });
}
export function propositionDraft(p:Proposition):Draft {return {text:p.text,properties:p.annotations.map(a=>decodeAuthoredValue(a.property) as JsonObject),warnings:[],source:p.attributes.thesis.source};}

export async function passageHash(text:string){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');}
