import {it,expect,vi,describe} from 'vitest';import {promises as fs} from 'node:fs';
import {LiveFactsObserver} from './live-adapter';import {liveFixture as fixture} from './live-fixture';
import {captureNative} from '../../persistence/native-resource';import * as native from '../../persistence/native-resource';
import {extract} from './extract';import {lightweightFacts} from './lightweight';import {fixtureText} from './fixture';
import {OccurrenceIndex} from '../../block-tree/occurrences';import {BlockTreeProjection} from '../../block-tree/projection';import {TreeCommands} from '../../block-tree/commands';
describe.each([false,true])('repository boundary qualification=%s',qualified=>{
const liveFixture=(count=1,first?:Uint8Array)=>fixture(count,first,{resourceBoundaryEvidence:qualified});
function editing(f:ReturnType<typeof liveFixture>){const occurrences=new OccurrenceIndex(),projection=new BlockTreeProjection(f.repository,'live-proof',occurrences),commands=new TreeCommands(f.repository,key=>occurrences.resolve(key));const key=Object.values(projection.state.nodes).find(n=>n.viewType==='standoff-editor-block')!.key;return{projection,commands,key};}
async function equivalent(f:ReturnType<typeof liveFixture>,observer:LiveFactsObserver){const actual=await observer.observe(f.id,'same');const expected=await extract(captureNative(f.repository.readState(),f.id),actual.facts.location,'same',undefined,undefined,{opaque:f.scope.opaque});expect(actual.facts).toEqual(expected);return actual;}
it('matches complete Facts for canonical fixtures and actual rich native producers',async()=>{
 for(const file of [undefined,'artifacts/flint-b1.2/rich.mutable.json','artifacts/flint-b2/consumed.mutable.json','artifacts/flint-c3/browser/source.mutable.json']){
  const input=file?await fs.readFile(file):new TextEncoder().encode(fixtureText(0,1)),f=liveFixture(1,input),o=new LiveFactsObserver(f.repository,f.scope);try{const r=await equivalent(f,o);expect((await lightweightFacts(input,r.facts.location,'same',undefined,{opaque:f.scope.opaque})).facts).toEqual(r.facts);}finally{o.dispose();}
 }
});
it('observes changed native text/annotations and Undo/Redo without capture or snapshots',async()=>{
 const f=liveFixture(),o=new LiveFactsObserver(f.repository,f.scope),e=editing(f);await equivalent(f,o);
 const snapshot=vi.spyOn(f.repository,'snapshot'),capture=vi.spyOn(native,'captureNative');
 try{e.commands.replaceInlineRange(e.key,0,0,'🧭é');expect(snapshot).not.toHaveBeenCalled();expect(capture).not.toHaveBeenCalled();const result=await o.observe(f.id,'same');expect(result.proofReused).toBe(true);expect(capture).not.toHaveBeenCalled();expect(snapshot).not.toHaveBeenCalled();capture.mockRestore();snapshot.mockRestore();await equivalent(f,o);
  f.repository.undo();await equivalent(f,o);f.repository.redo();await equivalent(f,o);
 }finally{capture.mockRestore();snapshot.mockRestore();e.projection.dispose();o.dispose();}
});
it('revalidates metadata/structural changes instead of reusing an inline proof',async()=>{
 const f=liveFixture(),o=new LiveFactsObserver(f.repository,f.scope);await equivalent(f,o);const root=Object.values(f.repository.readState().contents).find(c=>c.payload.id==='resource-0-root')!;
 try{f.repository.commit('Metadata',[{kind:'put-content',record:{...root,payload:{...root.payload,metadata:{documentId:f.id,title:'Changed',tags:['new','new']}}}}]);const r=await equivalent(f,o);expect(r.proofReused).toBe(false);expect(r.facts.tags).toEqual(['new']);}finally{o.dispose();}
});
it('rejects cancellation, stale completion, disappearing identity and disposed observation',async()=>{
 const f=liveFixture(),o=new LiveFactsObserver(f.repository,f.scope);const pending=o.observe(f.id,'old');f.changeSignature();await expect(pending).rejects.toThrow(/stale/);await equivalent(f,o);
 const root=Object.values(f.repository.readState().contents).find(c=>c.payload.id==='resource-0-root')!;f.repository.commit('Remove identity',[{kind:'put-content',record:{...root,payload:{...root.payload,metadata:{documentId:'elsewhere'}}}}]);await expect(o.observe(f.id,'new')).rejects.toThrow();f.repository.undo();await equivalent(f,o);
 const c=new AbortController();c.abort();await expect(o.observe(f.id,'aborted',c.signal)).rejects.toThrow();o.dispose();await expect(o.observe(f.id,'disposed')).rejects.toThrow();
});
it('retains binding/discovery/pending and ambiguity eligibility guards',async()=>{
 const f=liveFixture(),o=new LiveFactsObserver(f.repository,f.scope);try{await equivalent(f,o);f.setPending(true);await expect(o.observe(f.id,'x')).rejects.toThrow();f.setPending(false);f.documents.push({...f.documents[0]});await expect(o.observe(f.id,'x')).rejects.toThrow(/ambiguous/);f.documents.pop();f.documents[0].state='changed';await expect(o.observe(f.id,'x')).rejects.toThrow();}finally{o.dispose();}
});
it('matches Entity/Document separation, tagged unknown values, inline images and foreign definitions',async()=>{
 const v=JSON.parse(fixtureText(0,1)),p=v.document.blocks.find((b:any)=>b.id==='resource-0-p0');p.inline=[{kind:'text',text:'A🧭é'},{kind:'image',properties:{src:'test'}},{kind:'text',text:'tail'}];p.properties.standoffProperties=[{id:'e',type:'codex/entity-reference',value:'entity',start:0,end:5},{id:'b',type:'codex/block-reference',value:'resource-0-root',metadata:{documentId:'resource-0'},start:1,end:3},{id:'u',type:'future/unknown',value:{$codexHistoryValue:['number','NaN']},start:1,end:3},{id:'foreign',annotationId:'other',start:0,end:1,externalDefinition:{format:'codex-external-definition-gate',version:1,target:{kind:'definition',targetId:'other',source:{scope:'document',resourceId:'other'},version:{kind:'unpinned'}}}}];
 const f=liveFixture(1,new TextEncoder().encode(JSON.stringify(v))),o=new LiveFactsObserver(f.repository,f.scope);try{await equivalent(f,o);}finally{o.dispose();}
});
it('applies the same explicit opaque-host profile to reference and live observation',async()=>{
 const f=liveFixture(),o=new LiveFactsObserver(f.repository,f.scope);f.scope.opaque=type=>type==='standoff-editor-block';try{const r=await equivalent(f,o);expect(r.facts.mentions).toHaveLength(0);expect(r.facts.diagnostics.join(' ')).toContain('Unsupported hosted');expect((await lightweightFacts(new TextEncoder().encode(fixtureText(0,1)),r.facts.location,'same',undefined,{opaque:f.scope.opaque})).facts).toEqual(r.facts);}finally{o.dispose();}
});
it('matches retained definitions, margins, reference cycles and graph-2 owned-external boundaries',async()=>{
 const v=JSON.parse(fixtureText(0,3)),root=v.document.blocks.find((b:any)=>b.id==='resource-0-root');v.document.version=2;
 v.document.blocks.push({id:'retained',type:'standoff-editor-block',properties:{},inline:[{kind:'text',text:'not visible definition'}]});v.definitionOwnerBlockIds.push('retained');
 root.children.push({placementId:'external-owned',kind:'owned',target:{kind:'external',reference:{kind:'block',targetId:'other-root',source:{scope:'document',resourceId:'other'},version:{kind:'unpinned'}}}},{placementId:'local-reference',kind:'reference',target:{kind:'local',blockId:'resource-0-p0'}});
 const f=liveFixture(1,new TextEncoder().encode(JSON.stringify(v))),o=new LiveFactsObserver(f.repository,f.scope);try{const result=await equivalent(f,o);expect(result.members.size).toBeGreaterThan(1200);expect(result.facts.blocks.some(b=>b.id==='retained')).toBe(false);expect(result.facts.blocks.some(b=>b.id==='resource-0-margin-text')).toBe(true);expect(result.facts.diagnostics).toContain('External resource body not expanded');}finally{o.dispose();}
});
it('rejects shared Cells even when the inline-edit hint preserves the structural proof',async()=>{
 const f=liveFixture(),o=new LiveFactsObserver(f.repository,f.scope);await equivalent(f,o);const state=f.repository.readState(),paragraphs=Object.values(state.contents).filter(c=>c.viewType==='standoff-editor-block'),source=state.placements[paragraphs[0].inlineContent[0]],target=paragraphs[1];let hint:string|undefined;const stop=f.repository.subscribeChanges(c=>hint=c.inlineOwner);
 try{f.repository.commit('Share Cell',[{kind:'put-placement',record:{key:'shared-cell',kind:'inline',contentKey:source.contentKey}},{kind:'put-content',record:{...target,inlineContent:[...target.inlineContent,'shared-cell']}}]);expect(hint).toBe(target.key);expect(()=>captureNative(f.repository.readState(),f.id)).toThrow(/owners/);await expect(o.observe(f.id,'invalid')).rejects.toThrow(/owners/);}finally{stop();o.dispose();}
});
it('rechecks authored Block identities even on payload-only inline hints',async()=>{
 const f=liveFixture(),o=new LiveFactsObserver(f.repository,f.scope);await equivalent(f,o);const p=Object.values(f.repository.readState().contents).filter(c=>c.viewType==='standoff-editor-block');
 try{f.repository.commit('Duplicate ID',[{kind:'put-content',record:{...p[0],payload:{...p[0].payload,id:p[1].payload.id}}}]);expect(()=>captureNative(f.repository.readState(),f.id)).toThrow(/identity/);await expect(o.observe(f.id,'invalid')).rejects.toThrow(/identity/);}finally{o.dispose();}
});
it('does not mutate canonical content, revision or history and checks binding changes at completion',async()=>{
 const f=liveFixture(),o=new LiveFactsObserver(f.repository,f.scope),before=f.repository.snapshot(),revision=f.repository.state.revision;
 try{await equivalent(f,o);await equivalent(f,o);expect(f.repository.snapshot()).toEqual(before);expect(f.repository.state.revision).toBe(revision);
 const pending=o.observe(f.id,'old');f.documents[0].location.filename='renamed.mutable.json';await expect(pending).rejects.toThrow(/stale/);const current=await equivalent(f,o);expect(current.facts.location).toContain('renamed');}finally{o.dispose();}
});
it('reports missing definitions and rejects annotation-budget excess without publishing partial facts',async()=>{
 const f=liveFixture(),o=new LiveFactsObserver(f.repository,f.scope),p=Object.values(f.repository.readState().contents).find(c=>c.payload.id==='resource-0-p0')!;
 f.repository.commit('Missing definition',[{kind:'put-content',record:{...p,payload:{...p.payload,standoffProperties:[{id:'missing',annotationId:'absent',start:0,end:1}]}}}]);
 try{const r=await o.observe(f.id,'x');expect(r.facts.diagnostics).toContain('Foreign/unresolved linked definition');expect(()=>captureNative(f.repository.readState(),f.id)).toThrow(/lacks Document ownership/);
 const c=Object.values(f.repository.readState().contents).find(c=>c.payload.id==='resource-0-p0')!;f.repository.commit('Many annotations',[{kind:'put-content',record:{...c,payload:{...c.payload,standoffProperties:Array.from({length:10001},(_,i)=>({id:String(i),type:'style/bold',start:0,end:0}))}}}]);await expect(o.observe(f.id,'excess')).rejects.toThrow(/budget/);
 }finally{o.dispose();}
});
it('does not absorb a locally loaded owned child Document into its owner contribution',async()=>{
 const f=liveFixture(2),o=new LiveFactsObserver(f.repository,f.scope),s=f.repository.readState(),root=Object.values(s.contents).find(c=>c.payload.id==='resource-0-root')!,child=Object.values(s.contents).find(c=>c.payload.id==='resource-1-root')!,bank=Object.values(s.contents).find(c=>c.viewType==='workspace-object-bank-block')!,p=Object.values(s.placements).find(p=>p.contentKey===child.key)!;
 try{f.repository.commit('Authored nested resource',[{kind:'put-content',record:{...bank,children:bank.children.filter(k=>k!==p.key)}},{kind:'put-content',record:{...root,children:[...root.children,p.key]}},{kind:'put-placement',record:{...p,kind:'owned',resourceRegistration:undefined}}]);const result=await equivalent(f,o);expect(result.members.has(child.key)).toBe(false);expect(result.facts.diagnostics).toContain('External resource body not expanded');}finally{o.dispose();}
});
it('rejects retained content that also has a structural owner outside the Document',async()=>{
 const f=liveFixture(),o=new LiveFactsObserver(f.repository,f.scope),s=f.repository.readState(),root=Object.values(s.contents).find(c=>c.payload.id==='resource-0-root')!,bank=Object.values(s.contents).find(c=>c.viewType==='workspace-object-bank-block')!;
 try{f.repository.commit('Conflicting retention',[{kind:'put-content',record:{...root,key:'retained-outside',viewType:'plain-text-block',payload:{id:'retained-outside',type:'plain-text-block',text:'outside'},children:[],inlineContent:[],ownedRelations:{},opaqueRelations:{},definitionOwnerKey:root.key}},{kind:'put-placement',record:{key:'outside-placement',contentKey:'retained-outside',kind:'owned'}},{kind:'put-content',record:{...bank,children:[...bank.children,'outside-placement']}}]);expect(()=>captureNative(f.repository.readState(),f.id)).toThrow(/outside/);await expect(o.observe(f.id,'invalid')).rejects.toThrow(/outside/);}finally{o.dispose();}
});
it('matches legacy Workspace definition provenance without adopting it as Document-owned',async()=>{
 const f=liveFixture(),o=new LiveFactsObserver(f.repository,f.scope),s=f.repository.readState(),workspace=s.contents[s.placements[s.rootPlacementKey].contentKey],p=Object.values(s.contents).find(c=>c.payload.id==='resource-0-p0')!;
 try{f.repository.commit('Workspace definition',[{kind:'put-content',record:{...workspace,payload:{...workspace.payload,linkedAnnotations:{legacy:{id:'legacy',type:'codex/entity-reference',value:'foreign'}}}}},{kind:'put-content',record:{...p,payload:{...p.payload,standoffProperties:[{id:'legacy-segment',annotationId:'legacy',start:0,end:4}]}}}]);const r=await equivalent(f,o);expect(r.facts.diagnostics).toContain('Foreign/unresolved linked definition');expect(r.facts.mentions.some(m=>m.targetId==='foreign')).toBe(false);}finally{o.dispose();}
});

});
