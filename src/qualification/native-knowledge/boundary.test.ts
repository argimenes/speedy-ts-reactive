import {it,expect,vi,describe} from 'vitest';
import {CanonicalRepository,deriveLocations} from '../../block-tree/repository';
import {decodeDocument} from '../../block-tree/codecs';
import {captureNative} from '../../persistence/native-resource';
import {documentRootPlacements,resourceOwnership} from '../../block-tree/resource-registration';
import {findResource} from '../../block-tree/resource-identity';
import {TreeCommands} from '../../block-tree/commands';
import {liveFixture} from './live-fixture';
const fixture=()=>liveFixture(2,undefined,{resourceBoundaryEvidence:true});
function ready(r:CanonicalRepository,id:string){const b=r.readCanonicalResourceBoundary(id);expect(b.status,JSON.stringify(b)).toBe('ready');if(b.status!=='ready')throw Error('Not ready');return b;}
function exact(r:CanonicalRepository,id:string){
 const s=r.readState(),b=ready(r,id),root=findResource(s,{scope:'document',resourceId:id})!;resourceOwnership(s);
 expect(b.rootContentKey).toBe(root.key);expect(b.rootPlacementKey).toBe(documentRootPlacements(s,root.key)[0].key);
 expect([...b.retainedDefinitionKeys].sort()).toEqual(Object.values(s.contents).filter(c=>c.definitionOwnerKey===root.key).map(c=>c.key).sort());
 const locations=deriveLocations(s),byContent=new Map<string,typeof s.placements[string][]>();for(const p of Object.values(s.placements))byContent.set(p.contentKey,[...byContent.get(p.contentKey)??[],p]);
 for(const c of Object.values(s.contents)){
  const incoming=byContent.get(c.key)??[];
  expect(r.contentReferenceCount(c.key)).toBe(incoming.length);
  expect(r.incomingOwnedPlacements(b.token,c.key).map(p=>p.placementKey).sort()).toEqual(incoming.filter(p=>p.kind!=='reference'&&!p.externalReference&&!p.resolvedReference).map(p=>p.key).sort());
  for(const p of incoming)expect(r.locationOf(p.key)).toEqual(locations.get(p.key));
 }
 return b;
}
function small(children:any[]=[{id:'p',type:'standoff-editor-block',text:'A🧭abc'},{id:'q',type:'standoff-editor-block',text:'other'}],strict=false){return new CanonicalRepository(decodeDocument({id:'root',type:'document-block',metadata:{documentId:'doc'},children}).state,{resourceBoundaryEvidence:true,enforceBlockIdentity:strict});}
function paragraph(r:CanonicalRepository,id='p'){return Object.values(r.readState().contents).find(c=>c.payload.id===id)!;}
function placement(r:CanonicalRepository,key:string){return Object.values(r.readState().placements).find(p=>p.contentKey===key)!;}
it('returns ready cold evidence without enumerating either repository dictionary',()=>{
 const f=fixture(),s=f.repository.readState(),spy=vi.spyOn(f.repository,'readState').mockReturnValue({...s,contents:new Proxy(s.contents,{ownKeys(){throw Error('Global content scan');}}),placements:new Proxy(s.placements,{ownKeys(){throw Error('Global placement scan');}})});
 try{const b=ready(f.repository,f.id);expect(b.rootContentKey).toBeTruthy();}finally{spy.mockRestore();}exact(f.repository,f.id);
});
describe.each([false,true])('admitted fast paths and history strict=%s',strict=>{
 it('matches all facets after typing, split/join, empty insertion, Undo/Redo and a branch',()=>{
  const r=small(undefined,strict),commands=new TreeCommands(r,k=>k),p=placement(r,paragraph(r).key);exact(r,'doc');const old=ready(r,'doc').token;let count=0;const stop=r.subscribeChanges(()=>{ready(r,'doc');count++;});
  commands.replaceInlineRange(p.key,1,1,'😀');expect(r.isBoundaryCurrent(old)).toBe(false);exact(r,'doc');r.undo();exact(r,'doc');r.redo();exact(r,'doc');
  commands.splitStandoff(p.key,2);exact(r,'doc');r.undo();exact(r,'doc');r.redo();exact(r,'doc');r.undo();commands.insertEmptyStandoffSibling(p.key,'after');exact(r,'doc');expect(r.canRedo()).toBe(false);r.undo();exact(r,'doc');stop();expect(count).toBeGreaterThan(8);
 });
});
it('matches general target and unrelated structure and expires every old token',()=>{
 const f=fixture(),r=f.repository;const b=exact(r,f.id);for(const id of ['resource-0-root','resource-1-root']){const c=paragraph(r,id);r.commit('Reorder',[{kind:'put-content',record:{...c,children:[...c.children].reverse()}}]);expect(r.isBoundaryCurrent(b.token)).toBe(false);exact(r,f.id);expect(()=>captureNative(r.readState(),f.id)).not.toThrow();}
});
it('tracks placement-only, repeated-key and root-only changes without depending on content notifications',()=>{
 const r=small(),s=r.readState(),p=placement(r,paragraph(r).key);r.commit('Reference role',[{kind:'put-placement',record:{...p,kind:'reference'}}]);exact(r,'doc');r.undo();exact(r,'doc');
 r.commit('Final role wins',[{kind:'put-placement',record:{...p,kind:'reference'}},{kind:'put-placement',record:p}]);exact(r,'doc');
 const old=r.readState().rootPlacementKey,root=r.readState().placements[old];r.commit('Replace mount root',[{kind:'remove-placement',key:old},{kind:'put-placement',record:{...root,key:'new-root'}},{kind:'set-root',key:'new-root'}]);expect(exact(r,'doc').rootPlacementKey).toBe('new-root');r.undo();exact(r,'doc');
});
it('maintains sparse identity buckets in non-strict legacy repositories and never chooses a duplicate',()=>{
 const state=decodeDocument({id:'w',type:'workspace-block',children:[{id:'a',type:'document-block',metadata:{documentId:'same'}},{id:'b',type:'document-block',metadata:{documentId:'same'}}]}).state,r=new CanonicalRepository(state,{resourceBoundaryEvidence:true});
 expect(r.readCanonicalResourceBoundary('same').status).toBe('ambiguous');const b=paragraph(r,'b');r.commit('Separate identity',[{kind:'put-content',record:{...b,payload:{...b.payload,metadata:{documentId:'other'}}}}]);exact(r,'same');exact(r,'other');r.undo();expect(r.readCanonicalResourceBoundary('same').status).toBe('ambiguous');
});
it('rejects same-parent multiple ownership and sharing Cells despite a valid global resource certificate',()=>{
 for(const cell of [false,true]){const r=small(),s=r.readState(),p=paragraph(r),root=s.contents[s.placements[s.rootPlacementKey].contentKey],parent=cell?paragraph(r,'q'):root,source=cell?s.placements[p.inlineContent[0]]:placement(r,p.key),key='shared';
  r.commit('Second owner',[{kind:'put-placement',record:{...source,key,placementId:undefined}},{kind:'put-content',record:{...parent,...cell?{inlineContent:[...parent.inlineContent,key]}:{children:[...parent.children,key]}}}]);
  expect(()=>captureNative(r.readState(),'doc')).toThrow(/owners/);expect(r.readCanonicalResourceBoundary('doc').status).toBe('invalid');r.undo();exact(r,'doc');
 }
});
it('retains unplaced definitions, rejects outside ownership and tracks retention changes',()=>{
 const f=fixture(),r=f.repository,root=paragraph(r,'resource-0-root'),bank=Object.values(r.readState().contents).find(c=>c.viewType==='workspace-object-bank-block')!,c={...root,key:'retained',viewType:'plain-text-block',payload:{id:'retained',type:'plain-text-block'},children:[],definitionOwnerKey:root.key};
 r.commit('Retain',[{kind:'put-content',record:c}]);expect(exact(r,f.id).retainedDefinitionKeys).toContain(c.key);
 r.commit('Outside owner',[{kind:'put-placement',record:{key:'outside',kind:'owned',contentKey:c.key}},{kind:'put-content',record:{...bank,children:[...bank.children,'outside']}}]);expect(r.readCanonicalResourceBoundary(f.id).status).toBe('invalid');expect(()=>captureNative(r.readState(),f.id)).toThrow(/outside/);r.undo();exact(r,f.id);
 const other=paragraph(r,'resource-1-root');r.commit('Change retention',[{kind:'put-content',record:{...c,definitionOwnerKey:other.key}}]);expect(exact(r,f.id).retainedDefinitionKeys).not.toContain(c.key);expect(exact(r,'resource-1').retainedDefinitionKeys).toContain(c.key);
});
it('preserves nested Document boundaries and registration as non-owning retention',()=>{
 const f=fixture(),r=f.repository,root=paragraph(r,'resource-0-root'),child=paragraph(r,'resource-1-root'),bank=Object.values(r.readState().contents).find(c=>c.viewType==='workspace-object-bank-block')!,p=placement(r,child.key);
 expect(resourceOwnership(r.readState()).size).toBe(0);
 r.commit('Nested owned Document',[{kind:'put-content',record:{...bank,children:bank.children.filter(k=>k!==p.key)}},{kind:'put-content',record:{...root,children:[...root.children,p.key]}},{kind:'put-placement',record:{...p,kind:'owned',resourceRegistration:undefined}}]);exact(r,f.id);exact(r,'resource-1');expect(resourceOwnership(r.readState()).get('resource-1')?.owner).toBe(f.id);
});
it('rejects resource ownership cycles and duplicate claims without expiring admitted tokens; reference cycles remain legal',()=>{
 const f=fixture(),r=f.repository,a=paragraph(r,'resource-0-root'),b=paragraph(r,'resource-1-root');
 const edge=(key:string,target:string,kind:'owned'|'reference')=>({kind:'put-placement' as const,record:{key,kind,contentKey:'missing-'+key,externalReference:{kind:'block' as const,targetId:target+'-root',source:{scope:'document' as const,resourceId:target},version:{kind:'unpinned' as const}}}});
 r.commit('A owns B',[edge('ab','resource-1','owned'),{kind:'put-content',record:{...a,children:[...a.children,'ab']}}]);exact(r,f.id);exact(r,'resource-1');const token=ready(r,f.id).token;
 expect(()=>r.commit('Cycle',[edge('ba','resource-0','owned'),{kind:'put-content',record:{...b,children:[...b.children,'ba']}}])).toThrow(/cycle/);expect(r.isBoundaryCurrent(token)).toBe(true);
 expect(()=>r.commit('Duplicate claim',[edge('ab2','resource-1','owned'),{kind:'put-content',record:{...paragraph(r,'resource-0-root'),children:[...paragraph(r,'resource-0-root').children,'ab2']}}])).toThrow(/multiple/);expect(r.isBoundaryCurrent(token)).toBe(true);
 r.commit('Reference back',[edge('ba','resource-0','reference'),{kind:'put-content',record:{...b,children:[...b.children,'ba']}}]);exact(r,f.id);exact(r,'resource-1');
});
it('rejects stale asynchronous tokens and tokens from another repository instance',async()=>{
 const r=small(),b=ready(r,'doc'),replacement=new CanonicalRepository(r.snapshot(),{resourceBoundaryEvidence:true});expect(replacement.isBoundaryCurrent(b.token)).toBe(false);
 const later=Promise.resolve().then(()=>r.incomingOwnedPlacements(b.token,b.rootContentKey));const c=paragraph(r);r.commit('Edit',[{kind:'put-content',record:{...c,payload:{...c.payload,text:'changed'}}}]);await expect(later).rejects.toThrow(/Stale/);ready(r,'doc');
});
it('does not hide global work in an exotic fast path; unclassified evidence becomes unavailable',()=>{
 const r=small([{id:'exotic',type:'standoff-editor-block',text:'test'}]),c=paragraph(r,'exotic');r.commit('Change host',[{kind:'put-content',record:{...c,viewType:'future-host'}}]);ready(r,'doc');
 const changed=r.readState().contents[c.key];let inline:string|undefined;const stop=r.subscribeChanges(e=>inline=e.inlineOwner);r.commit('Exotic inline payload',[{kind:'put-content',record:{...changed,payload:{...changed.payload,id:'new-id'}}}]);expect(inline).toBe(c.key);expect(r.readCanonicalResourceBoundary('doc').status).toBe('unavailable');stop();
 const root=r.readState().contents[r.readState().placements[r.readState().rootPlacementKey].contentKey];r.commit('General admitted recheck',[{kind:'put-content',record:{...root,payload:{...root.payload,title:'check'}}}]);ready(r,'doc');
});
it('tracks retargeted placement-only evidence, including non-owning aliases',()=>{
 const r=small([{id:'p',type:'plain-text-block',text:'one'},{id:'q',type:'plain-text-block',text:'two'}]),p={...placement(r,paragraph(r).key)},q={...placement(r,paragraph(r,'q').key)};
 r.commit('Retarget',[{kind:'put-placement',record:{...q,kind:'reference'}},{kind:'put-placement',record:{...p,contentKey:q.contentKey}}]);exact(r,'doc');expect(r.contentReferenceCount(p.contentKey)).toBe(0);expect(r.contentReferenceCount(q.contentKey)).toBe(2);r.undo();exact(r,'doc');
});
it('preserves resolved external ownership, registration precedence and token-safe incoming evidence',()=>{
 const f=fixture(),r=f.repository,a=paragraph(r,'resource-0-root'),b=paragraph(r,'resource-1-root');
 r.commit('Resolved owned boundary',[{kind:'put-placement',record:{key:'resolved',kind:'owned',contentKey:b.key,resolvedReference:{kind:'block',targetId:'resource-1-root',source:{scope:'document',resourceId:'resource-1'},version:{kind:'unpinned'}}}},{kind:'put-content',record:{...a,children:[...a.children,'resolved']}}]);
 const boundary=exact(r,'resource-1');expect(r.readState().placements[boundary.rootPlacementKey].resourceRegistration).toBe(true);expect(r.incomingOwnedPlacements(boundary.token,b.key)).toEqual([]);exact(r,f.id);expect(resourceOwnership(r.readState()).get('resource-1')?.owner).toBe(f.id);r.undo();exact(r,'resource-1');
});
it('rejects cross-resource shared Cells after a certified leaf edit, without rescanning globally',()=>{
 const f=fixture(),r=f.repository,s=r.readState(),a=paragraph(r,'resource-0-p0'),b=paragraph(r,'resource-1-p0'),cell=s.placements[a.inlineContent[0]];
 r.commit('Share across boundary',[{kind:'put-placement',record:{...cell,key:'foreign-cell'}},{kind:'put-content',record:{...b,inlineContent:[...b.inlineContent,'foreign-cell']}}]);
 expect(r.readCanonicalResourceBoundary(f.id).status).toBe('invalid');expect(()=>captureNative(r.readState(),f.id)).toThrow(/outside/);r.undo();exact(r,f.id);
});
it('reports boundary invalidity without changing legacy admission and repairs through ordinary commits',()=>{
 const r=small([{id:'nested-a',type:'document-block',metadata:{documentId:'child'}}]),root=r.readState().contents[r.readState().placements[r.readState().rootPlacementKey].contentKey],child=paragraph(r,'nested-a'),p=placement(r,child.key);
 // No registrations/external edges: legacy repository accepts the duplicate local
 // resource owner, while the separately evaluated global boundary check must fail.
 r.commit('Legacy duplicate owner',[{kind:'put-placement',record:{...p,key:'second-owner',placementId:undefined}},{kind:'put-content',record:{...root,children:[...root.children,'second-owner']}}]);
 expect(r.readCanonicalResourceBoundary('doc').status).toBe('unavailable');expect(()=>resourceOwnership(r.readState())).toThrow(/multiple/);r.undo();exact(r,'doc');
});
