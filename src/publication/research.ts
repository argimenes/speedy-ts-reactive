/** Private review DTOs and an explicitly allowlisted public semantic read model. */
import {PackageDataReader,validatePackageData,type PackageData} from '../interchange/package/data';
import type {ResearchSource,SemanticSelection} from './reader';
export interface SemanticTarget {kind:'entity'|'time'|'claim';id:string;sourceVault?:string;anchor?:string}
export interface ResearchCandidate {key:string;kind:SemanticTarget['kind'];name:string;kindLabel:string;description?:string;aliases?:string[];statement?:string;expression?:string}
export interface ResearchSources {documents:Array<{resourceId:string;contexts:Array<{blockId:string}>}>}
export interface ResearchPlan {source:ResearchSource;fingerprint:string;candidates:ResearchCandidate[];diagnostics:string[]}
export interface ResearchBinding {resourceId:string;kind:SemanticTarget['kind'];id:string;key:string}
export interface ResearchBundle {fingerprint:string;entries:ResearchCandidate[];bindings:ResearchBinding[]}
export interface ResearchInspection {targets:SemanticTarget[];contexts:Array<{blockId:string}>;data?:PackageData}
export interface SemanticOccurrence {key:string;anchor?:string}
const string=(v:unknown,max:number)=>{if(v==null||v==='')return undefined;if(typeof v!=='string'||v.length>max)throw Error('Semantic field exceeds publication limit; narrow disclosure or use Reading');return v;};
export function candidate(reader:PackageDataReader,target:SemanticTarget,key:string):ResearchCandidate|undefined {
 const row=target.kind==='claim'?reader.tables.get('Claim')?.find(r=>r.guid===target.id):reader.tables.get('Entity')?.find(r=>r.guid===target.id);if(!row)return;
 const c:ResearchCandidate={key,kind:target.kind,name:target.kind==='claim'?'Claim':string(row.name,200)??'Unnamed entity',kindLabel:string(row.typename,200)??(target.kind==='time'?'Time':target.kind==='claim'?'Claim':'Entity')};
 if(target.kind==='claim'){const statement=string(row.expression,4000);if(statement)c.statement=statement;}
 else {const description=string(row.description,4000);if(description)c.description=description;const aliases=[...new Set((reader.tables.get('EntityAlias')??[]).filter(r=>r.entityGuid===target.id&&['curated','imported'].includes(r.origin??'')).map(r=>string(r.alias,200)).filter((v):v is string=>!!v))].sort();if(aliases.length>20)throw Error('Semantic alias limit; narrow context');if(aliases.length)c.aliases=aliases;
  if(target.kind==='time'){const expression=string(reader.tables.get('Time')?.find(r=>r.entityGuid===target.id)?.expression,4000);if(expression)c.expression=expression;}
 }
 return c;
}
export function publicSemantics(plan:ResearchPlan,bindings:ResearchBinding[],selected:SemanticSelection[]):ResearchBundle {
 const entries=selected.map(s=>{const c=plan.candidates.find(c=>c.key===s.key);if(!c)throw Error('Semantic candidate changed; review required');const e:ResearchCandidate={key:c.key,kind:c.kind,name:c.name,kindLabel:c.kindLabel};for(const field of s.fields){if(c[field]===undefined)throw Error('Requested semantic field is unavailable');(e as any)[field]=c[field];}return e;}).sort((a,b)=>(a.key<b.key?-1:a.key>b.key?1:0));
 const bundle={fingerprint:plan.fingerprint,entries,bindings:bindings.filter(b=>entries.some(e=>e.key===b.key))};if(new TextEncoder().encode(JSON.stringify(bundle)).length>512*1024)throw Error('Reviewed semantics exceed 512 KiB; narrow disclosure');return bundle;
}
/** Ignore extraction timestamps/metrics, retain all selected table values in the private consistency hash. */
export function contextValues(data:PackageData){validatePackageData(data);if(new TextEncoder().encode(JSON.stringify(data)).length>8*1024*1024)throw Error('Context exceeds 8 MiB');return data.tables.map(t=>({...t,rows:[...t.rows].sort((a,b)=>(JSON.stringify(a)<JSON.stringify(b)?-1:JSON.stringify(a)>JSON.stringify(b)?1:0))})).sort((a,b)=>(a.name<b.name?-1:a.name>b.name?1:0));}
