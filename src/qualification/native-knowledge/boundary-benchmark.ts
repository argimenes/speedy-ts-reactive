/** Isolated sequential benchmark. Baseline bundle uses the accepted Git HEAD repository. */
import {promises as fs} from 'node:fs';
import {CanonicalRepository} from '../../block-tree/repository';
import {liveState} from './live-fixture';
import {captureNative} from '../../persistence/native-resource';
import {TreeCommands} from '../../block-tree/commands';
const count=Number(process.argv[2]),qualified=process.argv[3]==='qualified',mode=qualified?'qualified':'baseline',rows:any[]=[];
const artifactDir=(process.env.BOUNDARY_ARTIFACT_DIR??'artifacts/resource-boundary')+(process.env.BOUNDARY_LEGACY==='1'?'/legacy':'');
await fs.mkdir(artifactDir,{recursive:true});
const {state}=liveState(count);
if(process.env.BOUNDARY_LEGACY==='1')for(const p of Object.values(state.placements))if(p.resourceRegistration){delete p.resourceRegistration;p.kind='owned';}
const contents=Object.keys(state.contents).length,placements=Object.keys(state.placements).length;
let measured={enumerations:0,enumeratedRecords:0,rebuildMs:0};
// Count record-dictionary enumerations in both modes, including snapshot/validation
// copies. Detection examines just the first returned entry, not another scan.
const original={values:Object.values,keys:Object.keys,entries:Object.entries};
const track=(values:any[])=>{const first=values[0];if(first&&typeof first==='object'&&typeof first.key==='string'&&(typeof first.viewType==='string'||typeof first.contentKey==='string')){measured.enumerations++;measured.enumeratedRecords+=values.length;}};
Object.values=((o:any)=>{const a=original.values(o);track(a);return a;}) as any;
Object.keys=((o:any)=>{const a=original.keys(o);if(a.length){const first=o[a[0]];if(first&&typeof first==='object'&&typeof first.key==='string'&&(typeof first.viewType==='string'||typeof first.contentKey==='string')){measured.enumerations++;measured.enumeratedRecords+=a.length;}}return a;}) as any;
Object.entries=((o:any)=>{const a=original.entries(o);if(a.length){const first=a[0][1] as any;if(first&&typeof first==='object'&&typeof first.key==='string'&&(typeof first.viewType==='string'||typeof first.contentKey==='string')){measured.enumerations++;measured.enumeratedRecords+=a.length;}}return a;}) as any;
const prototype=CanonicalRepository.prototype as any,rebuild=prototype.rebuildReferences;prototype.rebuildReferences=function(){const t=performance.now();try{return rebuild.call(this);}finally{measured.rebuildMs+=performance.now()-t;}};
const save=()=>fs.writeFile(`${artifactDir}/${mode}-${count}.json`,JSON.stringify({mode,count,contents,placements,rows},null,2)+'\n');
function run<T>(phase:string,fn:()=>T){measured={enumerations:0,enumeratedRecords:0,rebuildMs:0};const start=performance.now(),value=fn(),elapsedMs=performance.now()-start;const row={phase,elapsedMs,...measured};rows.push(row);return {value,row};}
global.gc?.();const before=process.memoryUsage().heapUsed;const {value:repository,row:construction}=run('construction',()=>new CanonicalRepository(state,{resourceBoundaryEvidence:qualified}));global.gc?.();Object.assign(construction,{retainedRepositoryBytes:process.memoryUsage().heapUsed-before});console.log(`${mode} ${count}: constructed`);await save();
const commands=new TreeCommands(repository,k=>k),s=repository.readState(),roots=[...original.values(s.contents)].filter(c=>c.viewType==='document-block'),root=roots.find(c=>c.payload.id==='resource-0-root')!,other=roots.find(c=>c.payload.id===`resource-${count>1?1:0}-root`)!,p=original.values(s.contents).find(c=>c.payload.id==='resource-0-p0')!,pk=original.values(s.placements).find(p1=>p1.contentKey===p.key)!.key;
const read=()=>{if(!qualified){const c=captureNative(repository.readState(),'resource-0');return {status:'ready',members:Object.keys(c.contents).length};}const b=repository.readCanonicalResourceBoundary('resource-0');if(b.status!=='ready')throw Error(JSON.stringify(b));return b;};
function probe(){
 const source=repository.readState(),originalRead=repository.readState,visits={contents:0,placements:0,enumerations:0};
 const wrap=(records:any,kind:'contents'|'placements')=>new Proxy(records,{get(target,key,receiver){if(typeof key==='string')visits[kind]++;return Reflect.get(target,key,receiver);},ownKeys(target){visits.enumerations++;return Reflect.ownKeys(target);}});
 repository.readState=()=>({...source,contents:wrap(source.contents,'contents'),placements:wrap(source.placements,'placements')});
 return {visits,restore(){repository.readState=originalRead;}};
}
const query=(phase:string)=>{const p=qualified?probe():undefined;try{const r=run(phase,read);Object.assign(r.row,{result:r.value,...p?{visits:p.visits}:{}});return r.row;}finally{p?.restore();}};
const cooperative=async(phase:string)=>{
 if(!qualified||!process.env.BOUNDARY_COOPERATIVE)return;
 const p=probe();measured={enumerations:0,enumeratedRecords:0,rebuildMs:0};const start=performance.now();
 try{const result=await repository.readCanonicalResourceBoundaryCooperative('resource-0');if(result.status!=='ready')throw Error(JSON.stringify(result));rows.push({phase,elapsedMs:performance.now()-start,...measured,visits:p.visits,result});}finally{p.restore();}
};
query('first-read');await cooperative('first-cooperative-read');await save();
for(const [label,key] of [['target-structure',root.key],['unrelated-structure',other.key]]){
 const change=run(label,()=>{const c=repository.readState().contents[key];repository.commit('Reorder children',[{kind:'put-content',record:{...c,children:[...c.children].reverse()}}],false);});
 const q=query(label+'-read');await cooperative(label+'-cooperative-read');rows.push({phase:label+'-combined',elapsedMs:change.row.elapsedMs+q.elapsedMs});console.log(`${mode} ${count}: ${label} complete`);await save();
}
// Warm both implementations' ordinary command path. Query/facts work excluded from typing.
for(let i=0;i<5;i++)commands.replaceInlineRange(pk,0,0,'x');
for(let i=0;i<40;i++)run('typing',()=>commands.replaceInlineRange(pk,0,0,'x'));
query('after-typing-read');
for(let i=0;i<5;i++){run('split',()=>commands.splitStandoff(pk,2));query('after-split-read');run('join-undo',()=>repository.undo());query('after-join-read');}
for(let i=0;i<5;i++){run('empty-paragraph',()=>commands.insertEmptyStandoffSibling(pk,'after'));query('after-empty-read');run('empty-undo',()=>repository.undo());}
await save();console.log(`${mode} ${count}: finished`);
