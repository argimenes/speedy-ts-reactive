import {describe,it,expect} from 'vitest';
import {promises as fs} from 'node:fs';
import {fixtureText} from './fixture';
import {decode,extract} from './extract';
import {lightweightFacts} from './lightweight';
const bytes=(v:unknown)=>new TextEncoder().encode(typeof v==='string'?v:JSON.stringify(v));
const base=()=>JSON.parse(fixtureText(0,3));
async function compare(value:unknown){
 const input=value instanceof Uint8Array?value:bytes(value),before=input.slice();
 let oracle:any,fast:any,oe:unknown,fe:unknown;
 try{oracle=await extract(decode(input),'same.ink','same-hash');}catch(e){oe=e;}
 try{fast=(await lightweightFacts(input,'same.ink','same-hash')).facts;}catch(e){fe=e;}
 expect(input).toEqual(before);expect(!!fe,`Oracle error: ${oe}; lightweight error: ${fe}`).toBe(!!oe);
 if(!oe)expect(fast).toEqual(oracle);
 return {oracle,fast,error:oe};
}
const edit=(fn:(v:any,p:any)=>void)=>{const v=base();fn(v,v.document.blocks.find((b:any)=>b.id==='resource-0-p0'));return v;};
it('matches every fact in 24 seeded native fixtures with distinct resource/root IDs',async()=>{
 for(let i=0;i<24;i++)await compare(fixtureText(i,24));
});
it('matches actual native feature producers and historical value profiles',async()=>{
 for(const file of ['artifacts/flint-b1/rich.mutable.json','artifacts/flint-b1.1/rich.mutable.json','artifacts/flint-b1.2/rich.mutable.json','artifacts/flint-b2/consumed.mutable.json','artifacts/flint-c3/browser/source.mutable.json','artifacts/flint-c3/browser/target.mutable.json'])await compare(await fs.readFile(file));
});
it('matches Unicode/Cell coordinates and inline-image boundaries across split/adjacent spans',async()=>{
 await compare(edit((v,p)=>{p.inline=[{kind:'image',properties:{src:'before.png'}},{kind:'text',text:'A🧭é\r\n漢\ud800'},{kind:'text',text:' more'},{kind:'image',properties:{src:'middle.png'}},{kind:'image',properties:{}},{kind:'text',text:'after'}];p.properties.standoffProperties=[{id:'span',type:'codex/entity-reference',value:'e',start:0,end:14},{id:'bad',type:'style/bold',start:0,end:100}];}));
 await compare(edit((v,p)=>{p.inline=[];p.properties.standoffProperties=[];}));
});
it('matches unsupported values, linked mention provenance, deleted/client-only and duplicate IDs',async()=>{
 for(const change of [
  (v:any,p:any)=>{v.document.blocks.find((b:any)=>b.id==='resource-0-root').properties.metadata.tags=[1,'mixed'];},
  (v:any,p:any)=>{p.properties.standoffProperties.push({id:'future',type:'future/unknown',start:0,end:4,value:{a:[1,null,true]}});},
  (v:any,p:any)=>{p.properties.standoffProperties.push({...p.properties.standoffProperties[2],isDeleted:true,id:'deleted'},{...p.properties.standoffProperties[2],clientOnly:true,id:'client'});},
  (v:any,p:any)=>{p.properties.standoffProperties.push({...p.properties.standoffProperties[2]});},
  (v:any,p:any)=>{p.properties.standoffProperties.push({id:'foreign',annotationId:'elsewhere',start:0,end:4,externalDefinition:{format:'codex-external-definition-gate',version:1,target:{kind:'definition',targetId:'elsewhere',source:{scope:'document',resourceId:'elsewhere'},version:{kind:'unpinned'}}}});},
  (v:any,p:any)=>{p.properties.standoffProperties.push({id:'unresolved',annotationId:'absent',start:0,end:4});},
  (v:any,p:any)=>{p.properties.standoffProperties.push({id:'internal',type:'codex/block-reference',value:'resource-0-p1',start:0,end:4});},
 ])await compare(edit(change));
});
it('retains external ownership/reference and unplaced-definition validation',async()=>{
 const external={kind:'external',reference:{kind:'block',targetId:'other-root',source:{scope:'document',resourceId:'other'},version:{kind:'unpinned'}}};
 await compare(edit(v=>{v.document.version=2;v.document.blocks.find((b:any)=>b.id==='resource-0-root').children.push({placementId:'foreign-owned',kind:'owned',target:external});}));
 await compare(edit(v=>{v.document.blocks.find((b:any)=>b.id==='resource-0-root').children.push({placementId:'foreign-ref',kind:'reference',target:external});}));
 await compare(edit(v=>{v.document.blocks.push({id:'retained',type:'standoff-editor-block',properties:{},inline:[{kind:'text',text:'retained definition'}]});v.definitionOwnerBlockIds.push('retained');}));
 await compare(edit(v=>{v.document.blocks.find((b:any)=>b.id==='resource-0-p0').children=[{placementId:'cycle-ref',kind:'reference',target:{kind:'local',blockId:'resource-0-root'}}];}));
});
const invalid:Array<[string,(v:any,p:any)=>void]>=[
 ['unknown envelope',v=>v.extra=true],['envelope version',v=>v.version=2],['value version',v=>v.valueEncoding='future'],['graph version',v=>v.document.version=9],
 ['identity mismatch',v=>v.resourceId='other'],['root metadata identity',v=>v.document.blocks.find((b:any)=>b.id==='resource-0-root').properties.metadata.documentId='other'],
 ['duplicate Block',v=>v.document.blocks.push(v.document.blocks[0])],['nested Document',(v,p)=>{p.type='document-block';delete p.inline;}],
 ['missing target',v=>v.document.root.target.blockId='absent'],['reference root',v=>v.document.root.kind='reference'],
 ['duplicate placement',v=>v.document.blocks.find((b:any)=>b.id==='resource-0-root').children.push(v.document.blocks.find((b:any)=>b.id==='resource-0-root').children[0])],
 ['multiple owners',v=>v.document.blocks.find((b:any)=>b.id==='resource-0-root').children.push({placementId:'another',kind:'owned',target:{kind:'local',blockId:'resource-0-p0'}})],
 ['owned cycle',(v,p)=>p.children=[{placementId:'cycle',kind:'owned',target:{kind:'local',blockId:'resource-0-root'}}]],
 ['orphan',v=>v.document.blocks.push({id:'orphan',type:'standoff-editor-block',properties:{},inline:[{kind:'text',text:'orphan'}]})],
 ['retention missing',v=>v.definitionOwnerBlockIds.push('missing')],['retention duplicate',v=>v.definitionOwnerBlockIds=['resource-0-root','resource-0-root']],
 ['reserved properties',(v,p)=>p.properties.children=[]],['missing inline',(v,p)=>delete p.inline],['unexpected inline',v=>v.document.blocks.find((b:any)=>b.id==='resource-0-root').inline=[]],
 ['empty text',(v,p)=>p.inline=[{kind:'text',text:''}]],['number text',(v,p)=>p.inline=[{kind:'text',text:3}]],['text reserved field',(v,p)=>p.inline=[{kind:'text',text:'x',hidden:true}]],
 ['unknown atom',(v,p)=>p.inline=[{kind:'alien',properties:{}}]],['image reserved field',(v,p)=>p.inline=[{kind:'image',properties:{},extra:true}]],
 ['image bag',(v,p)=>p.inline=[{kind:'image',properties:[]}]],
 ['invalid external value',(v,p)=>p.inline=[{kind:'image',properties:{externalDefinition:{format:'codex-external-definition-gate',version:99}}}]],
];
describe('invalid native input is rejected by both paths',()=>{
 for(const [label,change] of invalid)it(label,async()=>{const r=await compare(edit(change));expect(r.error).toBeTruthy();});
 it('invalid UTF-8 and JSON',async()=>{for(const v of [new Uint8Array([255]),bytes('{bad'),bytes('null'),bytes(JSON.stringify(base()).replace('"start":0','"start":-0')),bytes(JSON.stringify(base()).replace('"start":0','"start":1e400'))])expect((await compare(v)).error).toBeTruthy();});
});
it('matches explicit annotation-budget failure and cancellation',async()=>{
 const v=edit((v,p)=>{p.inline=[{kind:'text',text:'x'}];p.properties.standoffProperties=Array.from({length:10001},(_,i)=>({id:String(i),type:'style/bold',start:0,end:0}));});
 const result=await compare(v);expect(String(result.error)).toContain('Annotation budget');
 const c=new AbortController();c.abort();await expect(lightweightFacts(bytes(base()),'x','h',c.signal)).rejects.toThrow();
});
it('matches traversal truncation without claiming complete coverage',async()=>{
 const v=base(),root=v.document.blocks.find((b:any)=>b.id==='resource-0-root');root.children=[];v.document.blocks=[root];delete root.properties.linkedAnnotations;
 for(let i=0;i<10001;i++){v.document.blocks.push({id:`plain-${i}`,type:'plain-text-block',properties:{text:'bounded'}});root.children.push({placementId:`p-${i}`,kind:'owned',target:{kind:'local',blockId:`plain-${i}`}});}
 const result=await compare(v);expect(result.error).toBeUndefined();expect(result.fast.diagnostics).toContain('Block budget reached');
},30000);
it('matches deterministic malformed-wire mutations of text, values and graph records',async()=>{
 const changes=[(v:any)=>v.document.root.target.kind='alien',(v:any)=>v.document.blocks[0].properties=null,(v:any)=>v.document.blocks[0].relations={owned:{},opaque:[]},(v:any)=>v.document.blocks[0].id=' ',(v:any)=>v.document.blocks[0].children='bad',(v:any)=>v.document.blocks[0].properties={id:'reserved'},(v:any)=>v.document.root.placementId='',(v:any)=>v.definitionOwnerBlockIds='bad'];
 for(const change of changes){const v=base();change(v);expect((await compare(v)).error).toBeTruthy();}
});
it('preserves duplicate suppression even if the duplicate would exceed facts budgets',async()=>{
 const {rebuild}=await import('./files'),{rebuildLight}=await import('./light-files'),path=await import('node:path'),os=await import('node:os');
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'facts-differential-'));
 try{await fs.writeFile(path.join(root,'a.ink'),fixtureText(0,3));await fs.writeFile(path.join(root,'b.mutable.json'),fixtureText(1,3));
  await fs.writeFile(path.join(root,'z.ink'),JSON.stringify(edit((v,p)=>{p.properties.standoffProperties=Array.from({length:10001},(_,i)=>({id:String(i),type:'style/bold',start:0,end:0}));})));
  await fs.writeFile(path.join(root,'invalid.ink'),'{}');await fs.writeFile(path.join(root,'source.md'),'independent');
  const a=await rebuild(root),b=await rebuildLight(root);expect([...b.index.effective]).toEqual([...a.index.effective]);expect(b.index.ambiguous).toEqual(a.index.ambiguous);expect(b.diagnostics).toEqual(a.diagnostics);expect(b.evidence).toEqual(a.evidence);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
it('preserves tagged unknown annotation values exactly and rejects corrupt value tags',async()=>{
 const {encodeAuthoredValue}=await import('../../history/preplan-spike/wire');
 const v=edit((v,p)=>{p.properties=encodeAuthoredValue({...p.properties,standoffProperties:[{id:'future',type:'future/unknown',start:0,end:3,value:{explicit:undefined,zero:-0,nan:NaN,positive:Infinity,negative:-Infinity,user:{$codexHistoryValue:['undefined']}}}]});});
 const result=await compare(v);expect(result.error).toBeUndefined();const value=result.fast.annotations.find((a:any)=>a.type==='future/unknown').value;
 expect(Object.hasOwn(value,'explicit')).toBe(true);expect(value.explicit).toBeUndefined();expect(Object.is(value.zero,-0)).toBe(true);expect(Number.isNaN(value.nan)).toBe(true);expect(value.user).toEqual({$codexHistoryValue:['undefined']});
 expect((await compare(edit((v,p)=>{p.properties.future={$codexHistoryValue:['not-a-tag']};}))).error).toBeTruthy();
});
it('retains resource ownership/provenance guards on external edges',async()=>{
 const external=(id:string,kind='block')=>({kind:'external',reference:{kind,targetId:id+'-root',source:{scope:'document',resourceId:id},version:{kind:'unpinned'}}});
 for(const kind of ['v1-owned','same-resource','definition-owned','duplicate-owner']){
  const v=base(),root=v.document.blocks.find((b:any)=>b.id==='resource-0-root');v.document.version=kind==='v1-owned'?1:2;
  root.children.push({placementId:'foreign',kind:'owned',target:external(kind==='same-resource'?'resource-0':'other',kind==='definition-owned'?'definition':'block')});
  if(kind==='duplicate-owner')root.children.push({placementId:'foreign-2',kind:'owned',target:external('other')});
  expect((await compare(v)).error).toBeTruthy();
 }
});
