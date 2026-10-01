import {describe,it,expect,vi} from 'vitest';
import {readFile} from 'node:fs/promises';
import {observeLive} from './live-observer';import {DEFAULT_POLICY} from './policy';
import {liveFixture} from '../qualification/native-knowledge/live-fixture';
import {fixtureText} from '../qualification/native-knowledge/fixture';
import {lightweightFacts} from './saved-reader';import {collectFacts} from './collect-facts';
import * as native from '../persistence/native-resource';import {resourceToRepository} from '../history/durable-core';
const pause=async()=>{};
async function parity(f:ReturnType<typeof liveFixture>,policy=DEFAULT_POLICY){
 const revision=f.repository.readState().revision;
 const actual=await observeLive(f.repository,f.id,policy,{yieldControl:pause});
 const expected=await collectFacts(resourceToRepository(native.captureNative(f.repository.readState(),f.id)),f.id,undefined,undefined,{extraction:policy});
 expect(actual.facts).toEqual(expected);expect(f.repository.readState().revision).toBe(revision);return actual.facts;
}
it.each([undefined,'artifacts/flint-b1.2/rich.mutable.json','artifacts/flint-b2/consumed.mutable.json','artifacts/flint-c3/browser/source.mutable.json'])('production live/capture/lightweight differential: %s',async file=>{
 const bytes=file?await readFile(file):new TextEncoder().encode(fixtureText(0,1)),f=liveFixture(1,bytes);
 expect(await parity(f)).toEqual((await lightweightFacts(bytes)).facts);
});
it('does not capture, serialize, mount or mutate during observation; Undo/Redo remain canonical',async()=>{
 const f=liveFixture(),snapshot=vi.spyOn(f.repository,'snapshot'),capture=vi.spyOn(native,'captureNative'),encoding=vi.spyOn(native,'nativeText');
 const p=Object.values(f.repository.readState().contents).find(c=>c.viewType==='text-cell')!;
 f.repository.commit('Edit',[{kind:'put-content',record:{...p,payload:{...p.payload,text:'🧭'}}}]);const revision=f.repository.readState().revision;snapshot.mockClear();capture.mockClear();encoding.mockClear();
 try{await observeLive(f.repository,f.id,DEFAULT_POLICY,{yieldControl:pause});expect(snapshot).not.toHaveBeenCalled();expect(capture).not.toHaveBeenCalled();expect(encoding).not.toHaveBeenCalled();expect(f.repository.readState().revision).toBe(revision);}finally{vi.restoreAllMocks();}
 await parity(f);f.repository.undo();await parity(f);f.repository.redo();await parity(f);
});
it('preserves Unicode, inline images, rich unknown values and Document/Entity distinction',async()=>{
 const v=JSON.parse(fixtureText(0,1)),p=v.document.blocks.find((b:any)=>b.id==='resource-0-p0');
 p.inline=[{kind:'text',text:'A🧭é'},{kind:'image',properties:{src:'test'}},{kind:'text',text:'tail'}];
 p.properties.standoffProperties=[{id:'e',type:'codex/entity-reference',value:'entity',start:0,end:5},{id:'b',type:'codex/block-reference',value:'resource-0-root',metadata:{documentId:'resource-0'},start:1,end:3},{id:'u',type:'future/unknown',value:{$codexHistoryValue:['number','NaN']},start:1,end:3}];
 const bytes=new TextEncoder().encode(JSON.stringify(v)),f=liveFixture(1,bytes);expect(await parity(f)).toEqual((await lightweightFacts(bytes)).facts);
});
it('uses the same opaque policy and reports unresolved linked definitions without invented mentions',async()=>{
 const f=liveFixture();await parity(f,{version:1,opaqueTypes:['standoff-editor-block']});
 const p=Object.values(f.repository.readState().contents).find(c=>c.payload.id==='resource-0-p0')!;
 f.repository.commit('Unresolved',[{kind:'put-content',record:{...p,payload:{...p.payload,standoffProperties:[{id:'missing',annotationId:'absent',start:0,end:1}]}}}]);
 const result=await observeLive(f.repository,f.id,DEFAULT_POLICY,{yieldControl:pause});expect(result.facts.diagnostics).toContain('Foreign/unresolved linked definition');expect(result.facts.mentions.some(m=>m.annotationIds.some(id=>id.includes('missing')))).toBe(false);
});
it('matches retained definitions, margins, reference cycles and owned-external boundaries',async()=>{
 const v=JSON.parse(fixtureText(0,3)),root=v.document.blocks.find((b:any)=>b.id==='resource-0-root');v.document.version=2;
 v.document.blocks.push({id:'retained',type:'standoff-editor-block',properties:{},inline:[{kind:'text',text:'invisible'}]});v.definitionOwnerBlockIds.push('retained');
 root.children.push({placementId:'external-owned',kind:'owned',target:{kind:'external',reference:{kind:'block',targetId:'other-root',source:{scope:'document',resourceId:'other'},version:{kind:'unpinned'}}}},{placementId:'local-reference',kind:'reference',target:{kind:'local',blockId:'resource-0-p0'}});
 const result=await parity(liveFixture(1,new TextEncoder().encode(JSON.stringify(v))));expect(result.blocks.some(b=>b.id==='retained')).toBe(false);expect(result.diagnostics).toContain('External resource body not expanded');
});
it('does not include a loaded nested owned Document body',async()=>{
 const f=liveFixture(2),s=f.repository.readState(),root=Object.values(s.contents).find(c=>c.payload.id==='resource-0-root')!,child=Object.values(s.contents).find(c=>c.payload.id==='resource-1-root')!,bank=Object.values(s.contents).find(c=>c.viewType==='workspace-object-bank-block')!,p=Object.values(s.placements).find(p=>p.contentKey===child.key)!;
 f.repository.commit('Nested resource',[{kind:'put-content',record:{...bank,children:bank.children.filter(k=>k!==p.key)}},{kind:'put-content',record:{...root,children:[...root.children,p.key]}},{kind:'put-placement',record:{...p,kind:'owned',resourceRegistration:undefined}}]);
 const result=await parity(f);expect(result.blocks.some(b=>b.id==='resource-1-root')).toBe(false);
});
it.each(['abort','mutation','stale token'])('rejects partial work: %s',async mode=>{
 const f=liveFixture(),controller=new AbortController();let once=false;const boundary=await f.repository.readCanonicalResourceBoundaryCooperative(f.id,{yieldControl:pause});
 const edit=()=>{const p=Object.values(f.repository.readState().contents).find(c=>c.viewType==='text-cell')!;f.repository.commit('Edit',[{kind:'put-content',record:{...p,payload:{...p.payload,text:'x'}}}]);};
 if(mode==='stale token')edit();
 await expect(observeLive(f.repository,f.id,DEFAULT_POLICY,{boundary,signal:controller.signal,yieldControl:async()=>{if(!once){once=true;mode==='abort'?controller.abort():edit();}}})).rejects.toThrow();
});
it.each(['duplicate','shared cell','outside retention'])('rejects invalid ownership/identity instead of capture fallback: %s',async mode=>{
 const f=liveFixture(),s=f.repository.readState(),p=Object.values(s.contents).filter(c=>c.viewType==='standoff-editor-block');
 if(mode==='duplicate')f.repository.commit('Duplicate',[{kind:'put-content',record:{...p[0],payload:{...p[0].payload,id:p[1].payload.id}}}]);
 if(mode==='shared cell')f.repository.commit('Shared',[{kind:'put-placement',record:{key:'shared',kind:'inline',contentKey:s.placements[p[0].inlineContent[0]].contentKey}},{kind:'put-content',record:{...p[1],inlineContent:[...p[1].inlineContent,'shared']}}]);
 if(mode==='outside retention'){const root=Object.values(s.contents).find(c=>c.payload.id==='resource-0-root')!,bank=Object.values(s.contents).find(c=>c.viewType==='workspace-object-bank-block')!;f.repository.commit('Outside',[{kind:'put-content',record:{...p[0],key:'outside',inlineContent:[],definitionOwnerKey:root.key,payload:{id:'outside'}}},{kind:'put-placement',record:{key:'outside-p',kind:'owned',contentKey:'outside'}},{kind:'put-content',record:{...bank,children:[...bank.children,'outside-p']}}]);}
 await expect(observeLive(f.repository,f.id,DEFAULT_POLICY,{yieldControl:pause})).rejects.toThrow(/boundary/);
});
it('keeps plain/text block parity and rejects indivisible large authored values explicitly',async()=>{
 const f=liveFixture(),p=Object.values(f.repository.readState().contents).find(c=>c.payload.id==='resource-0-p0')!;
 for(const type of ['text-block','plain-text-block']){const v=JSON.parse(fixtureText(0,1)),block=v.document.blocks.find((b:any)=>b.id==='resource-0-p0');block.type=type;delete block.inline;block.properties={text:'🧭 plain'};await parity(liveFixture(1,new TextEncoder().encode(JSON.stringify(v))));}
 f.repository.commit('Huge value',[{kind:'put-content',record:{...p,payload:{...p.payload,standoffProperties:[{id:'u',type:'unknown',start:0,end:0,value:'x'.repeat(300000)}]}}}]);
 await expect(observeLive(f.repository,f.id,DEFAULT_POLICY,{yieldControl:pause})).rejects.toThrow(/budget/);
});
it('rejects a current boundary issued for a different canonical resource',async()=>{
 const f=liveFixture(2),boundary=await f.repository.readCanonicalResourceBoundaryCooperative('resource-1',{yieldControl:pause});await expect(observeLive(f.repository,f.id,DEFAULT_POLICY,{boundary,yieldControl:pause})).rejects.toThrow(/identity mismatch/);
});
it('never clones hidden object storage or an enormous sparse array under a small memory charge',async()=>{
 const {WorkSlice,estimateBytes}=await import('./scheduler');for(const value of [new Map([['large','x'.repeat(500000)]]),new Array(100000000)])await expect(estimateBytes(value,new WorkSlice(()=>{},pause),256*1024)).rejects.toThrow(/Unsupported|budget/);
});
