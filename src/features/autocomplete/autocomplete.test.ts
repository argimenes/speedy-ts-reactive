import {createRoot} from 'solid-js';
import {retainSourceHighlight} from './source-highlight';
import {afterEach,expect,it,vi} from 'vitest';
import {invocation,parseInput,rank,TOKEN_LIMIT} from './model';
import {CompletionSession,type CompletionHost,type CompletionSource} from './session';
import {clearUsage,recordUsage,usage} from './history';
import type {EntityService} from '../../feature-api/entities';
const source:CompletionSource={nodeKey:'occurrence',viewId:'view',contentKey:'canonical',placementKey:'placement',version:1,start:0,end:4,literal:'@Leo',inline:true};
const entity={id:'leonardo',name:'Leonardo da Vinci',revision:0,aliases:[]};
const disposers:(()=>void)[]=[];
afterEach(()=>{disposers.splice(0).forEach(fn=>fn());vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();});
function setup(service:Partial<EntityService>={}) {
 const host:CompletionHost={service:{search:vi.fn(async()=>({candidates:[{...entity,evidence:[{kind:'name',text:entity.name}]}],complete:true,diagnostics:[],current(){}})),get:vi.fn(async()=>entity),dispose:vi.fn(),...service} as EntityService,historyScope:async()=>'test',documentEntities:vi.fn(()=>[{...entity,reason:'Document',frequency:3}]),documents:async()=>[],commands:()=>[],valid:()=>true,commit:vi.fn(),reference:async()=>{},command:()=>{},dismiss:vi.fn()};
 const session=new CompletionSession(host,{...source},'entity','Leo');disposers.push(()=>session.dispose());return {host,session};
}
it.each([['@Leo','entity','Leo'],['text [[Letter','entity','Letter'],['((Block','entity','Block'],['/date','command','date'],['@master : @','entity','master : @'],['@master : #','entity','master : #']])('recognises %s',(text,kind,input)=>{const cells=[...text];expect(invocation(cells.length,i=>cells[i])).toMatchObject({kind,input});});
it.each(['mail@example.org','\\@literal','\\[[literal','path/file','https://host/path','ordinary text'])('does not execute literal %s',text=>{const cells=[...text];expect(invocation(cells.length,i=>cells[i])).toBeUndefined();});
it('bounds recognition independently of Document length and uses codepoint coordinates',()=>{let reads=0;const value='x'.repeat(1_000_000)+' @😀';const cells=[...value];expect(invocation(cells.length,i=>{reads++;return cells[i];})).toMatchObject({start:1_000_001,input:'😀'});expect(reads).toBeLessThanOrEqual(TOKEN_LIMIT+1);});
it('keeps mention and query separate; literal punctuation and escaped controls stay literal',()=>{expect(parseInput('master : Leonardo')).toMatchObject({mention:'master',query:'Leonardo'});expect(parseInput('12:30')).toMatchObject({mention:'12:30',query:'12:30'});expect(parseInput('master : @')).toMatchObject({mention:'master',query:'',scope:'session'});expect(parseInput('master : \\@')).toMatchObject({query:'@',scope:undefined});expect(parseInput('master : +New')).toMatchObject({createName:'New'});});
it('deduplicates by GUID and favours exact alias over frequent contextual matches',()=>{expect(rank([{id:'a',name:'Other',reason:'mention',frequency:10},{id:'b',name:'Canonical',reason:'alias',exact:true},{id:'b',name:'Canonical',reason:'session',recent:3}],'Alias','blend').map(r=>r.id)).toEqual(['b','a']);});
it('uses local frequency for empty queries and does no canonical query',async()=>{vi.useFakeTimers();const {host,session}=setup();session.input('');await vi.advanceTimersByTimeAsync(151);expect(session.state.rows[0].id).toBe(entity.id);expect(host.service!.search).not.toHaveBeenCalled();});
it('keeps candidate identity through late results, ignores superseded generations',async()=>{vi.useFakeTimers();const pending:((r:any)=>void)[]=[];const {session}=setup({search:vi.fn(()=>new Promise<any>(r=>pending.push(r)))});await vi.advanceTimersByTimeAsync(151);session.select(entity.id);session.input('da Vinci');await vi.advanceTimersByTimeAsync(151);pending[1]({candidates:[{id:'b',name:'B',evidence:[]}],diagnostics:[],current(){}});await Promise.resolve();expect(session.state.selected).toBe(entity.id);pending[0]({candidates:[{id:'old',name:'Old',evidence:[]}],diagnostics:[],current(){}});await Promise.resolve();expect(session.state.rows.some(r=>r.id==='old')).toBe(false);});
it('revalidates the exact occurrence after async get and never commits on cancellation',async()=>{vi.useFakeTimers();let release!:(e:any)=>void;const {session,host}=setup({get:()=>new Promise(r=>release=r)});await vi.advanceTimersByTimeAsync(151);const choose=session.choose();session.close();release(entity);await choose;expect(host.commit).not.toHaveBeenCalled();});
it('links once, preserves authored phrase, and records only successful links',async()=>{vi.useFakeTimers();clearUsage('test');const {session,host}=setup();session.input('the master : Leonardo');await vi.advanceTimersByTimeAsync(151);session.select(entity.id);await session.choose();expect(host.commit).toHaveBeenCalledWith(expect.objectContaining({contentKey:'canonical'}),entity,'Leo');expect(usage('test')).toEqual([{id:entity.id,name:entity.name,at:expect.any(Number)}]);});
it('history windows are timestamped, bounded, clearable and omit canonical attributes',()=>{const storage=new Map();vi.stubGlobal('localStorage',{getItem:(k:string)=>storage.get(k),setItem:(k:string,v:string)=>storage.set(k,v),removeItem:(k:string)=>storage.delete(k)});clearUsage('history');const now=Date.now();recordUsage('history',{...entity,attributes:'private'} as any,now-2*86400000);expect(usage('history',1,now)).toEqual([]);expect(usage('history',7,now)).toHaveLength(1);expect([...storage.values()][0]).not.toContain('private');clearUsage('history');expect(usage('history',7,now)).toEqual([]);});
it('ordinary completed input reads at most the affected Block and one cell, with no snapshots or discovery',async()=>{
 const {ReactiveEditor}=await import('../../reactive-editor/editor');const {createAutocompleteFeature}=await import('./index');
 const editor=new ReactiveEditor({type:'document-block',children:[{id:'typing',type:'standoff-editor-block',text:'ordinary '.repeat(64)},...Array.from({length:30},(_,i)=>({id:'other'+i,type:'standoff-editor-block',text:'Unrelated paragraph'}))]});
 const view=editor.createView(),node=Object.values(view.state.nodes).find(n=>n.payload.id==='typing')!;
 editor.featureHost.activate(createAutocompleteFeature(editor));
 const read=vi.spyOn(editor,'node'),snapshot=vi.spyOn(editor.repository,'snapshot'),fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
 try{editor.completionInput!.edited(node.key,node.inlineContent.length,'insertText');expect(read.mock.calls.length).toBeLessThanOrEqual(2);expect(snapshot).not.toHaveBeenCalled();expect(fetcher).not.toHaveBeenCalled();expect(editor.overlays.overlays).toHaveLength(0);}finally{editor.dispose();}
},15000);
it.each(['mention','autocomplete'] as const)('bracket %s keeps independent query separate and uses its explicit text policy',async mode=>{
 vi.useFakeTimers();const {host}=setup();const s={...source,brackets:mode,literal:'  the master  ',end:14};
 const session=new CompletionSession(host,s,'entity','  the master  ');disposers.push(()=>session.dispose());
 session.input('Leonardo');session.update({...s,version:2,literal:'  the master!  '},'  the master!  ');
 expect(session.state.searchQuery).toBe('Leonardo');expect(session.state.queryMode).toBe('independent');expect(session.state.sourceText).toBe('  the master!  ');
 await vi.advanceTimersByTimeAsync(151);session.select(entity.id);await session.choose(true);
 expect(host.commit).toHaveBeenCalledWith(expect.anything(),entity,mode==='mention'?'  the master!  ':entity.name);
});
it('an empty mention cannot create an invisible reference and can resume following source',async()=>{
 vi.useFakeTimers();const {host}=setup();const session=new CompletionSession(host,{...source,brackets:'mention',literal:''},'entity','');disposers.push(()=>session.dispose());
 session.input('Leonardo');await vi.advanceTimersByTimeAsync(151);session.select(entity.id);await session.choose();expect(host.commit).not.toHaveBeenCalled();expect(session.alive).toBe(true);expect(session.state.error).toContain('mention text');session.follow();expect(session.state.searchQuery).toBe('');expect(session.state.queryMode).toBe('following-source');
});
it('word and character boundaries are grapheme-aware and bounded',async()=>{
 const {moveBoundary,nextWordLength}=await import('./brackets');
 expect(nextWordLength('Florentine master')).toBe(10);expect(nextWordLength(' master')).toBe(0);
 expect(moveBoundary('Florentine master',10,1,true)).toBe(17);expect(moveBoundary('Florentine master',17,-1,true)).toBe(11);
 const value='e\u0301👩‍👩‍👧‍👧界';expect(moveBoundary(value,0,1,false)).toBe(2);expect(moveBoundary(value,2,1,false)).toBe(9);expect(moveBoundary(value,9,-1,false)).toBe(2);expect(moveBoundary(value,0,-1,false)).toBe(0);
});
it('active bracket edits do bounded affected-range work, retain transient boundaries and release bindings on cancel',async()=>{
 const {ReactiveEditor}=await import('../../reactive-editor/editor');const {createAutocompleteFeature}=await import('./index');
 const editor=new ReactiveEditor({type:'document-block',children:[{id:'target',type:'standoff-editor-block',text:'tail'},...Array.from({length:50},(_,i)=>({id:'other'+i,type:'standoff-editor-block',text:'Unrelated'}))]});
 const view=editor.createView(),node=Object.values(view.state.nodes).find(n=>n.payload.id==='target')!;
 const root=document.createElement('div');document.body.append(root);let selection={anchor:0,head:0};
 const release=editor.mounts.register(node.key,{root,focusElement:root,inputPolicy:'standoff',focus:()=>{},captureInlineSelection:()=>selection,restoreInlineSelection:s=>selection=s});editor.featureHost.activate(createAutocompleteFeature(editor));
 const read=()=>node.inlineContent.map(k=>editor.node(k)?.payload.text).join('');
 try{
  expect(editor.completionInput!.intercept!(node.key,0,0,'((','insertText')).toBe(true);expect(read()).toBe('tail');
  const snapshot=vi.spyOn(editor.repository,'snapshot'),nodes=vi.spyOn(editor,'node');
  editor.completionInput!.intercept!(node.key,4,4,'!','insertText');expect(nodes.mock.calls.length).toBeLessThan(100);expect(snapshot).not.toHaveBeenCalled();expect(read()).toBe('tail!');
  editor.completionInput!.intercept!(node.key,0,0,'','deleteContentBackward');expect(read()).toBe('tail!');
  editor.completionInput!.cancel();expect(read()).toBe('tail!');expect(editor.bindings.get('autocomplete.end.word.1')).toBeUndefined();
  // First-delimiter ownership cannot depend on InputGateway.edited: cross-selection
  // replacement also enters this interceptor, and does not emit that notification.
  expect(editor.completionInput!.intercept!(node.key,5,5,'[','insertText')).toBe(true);
  expect(editor.completionInput!.intercept!(node.key,6,6,'[','insertText')).toBe(true);
  expect(read()).toBe('tail!');editor.completionInput!.cancel();expect(read()).toBe('tail!');
  editor.completionInput!.intercept!(node.key,4,4,'[','insertText');
  editor.completionInput!.intercept!(node.key,5,5,'[','insertText');
  expect(read()).toBe('tail!');editor.completionInput!.cancel();expect(read()).toBe('tail!');
  editor.completionInput!.intercept!(node.key,1,3,'((','insertText');expect(read()).toBe('tail!');editor.completionInput!.cancel();expect(read()).toBe('tail!');
 }finally{release();editor.dispose();root.remove();}
});
it('reviewed native annotations and bracket removal commit and roll back as one unit',async()=>{
 const {ReactiveEditor}=await import('../../reactive-editor/editor');
 const editor=new ReactiveEditor({type:'document-block',children:[{id:'target',type:'standoff-editor-block',text:'((he)) he'}]});
 const view=editor.createView(),node=Object.values(view.state.nodes).find(n=>n.payload.id==='target')!;
 const annotate=()=>editor.linkedAnnotations.createBatch([[editor.textRanges.snapshot(node.key,2,4)],[editor.textRanges.snapshot(node.key,7,9)]],'codex/entity-reference',entity.id,{entityId:entity.id},editor.repository.state.revision,'Reviewed mentions');
 const edit=()=>{annotate();editor.commands.replaceInlineRange(node.key,4,6,'');editor.commands.replaceInlineRange(node.key,0,2,'');};
 const read=()=>node.inlineContent.map(k=>editor.node(k)?.payload.text).join('');
 try{
  expect(()=>editor.commands.transaction('Fail safely',()=>{edit();throw Error('cancel');})).toThrow('cancel');
  expect(read()).toBe('((he)) he');expect(node.payload.standoffProperties??[]).toHaveLength(0);
  const commits=vi.spyOn(editor.repository,'commit');editor.commands.transaction('Scry review',edit);expect(commits).toHaveBeenCalledTimes(1);
  expect(read()).toBe('he he');expect(node.payload.standoffProperties).toEqual([expect.objectContaining({start:0,end:1,value:entity.id}),expect.objectContaining({start:3,end:4,value:entity.id})]);
  editor.repository.undo();expect(read()).toBe('((he)) he');expect(node.payload.standoffProperties??[]).toHaveLength(0);
 }finally{editor.dispose();}
});

it('all boundary controls are session-only, with no snapshots, commits, graph scans or Undo entries',async()=>{
 const {ReactiveEditor}=await import('../../reactive-editor/editor');const {createAutocompleteFeature}=await import('./index');
 const editor=new ReactiveEditor({type:'document-block',children:[{id:'target',type:'standoff-editor-block',text:'one two three four'},...Array.from({length:50},(_,i)=>({id:'other'+i,type:'standoff-editor-block',text:'Unrelated'}))]});
 const view=editor.createView(),node=Object.values(view.state.nodes).find(n=>n.payload.id==='target')!;
 const root=document.body.appendChild(document.createElement('div'));
 const release=editor.mounts.register(node.key,{root,focusElement:root,inputPolicy:'standoff',focus:()=>{},restoreInlineSelection:()=>{}});editor.featureHost.activate(createAutocompleteFeature(editor));
 try{
  editor.completionInput!.intercept!(node.key,4,7,'((','insertText');
  const data=editor.overlays.overlays.find(o=>o.viewType==='autocomplete')!.data as any,revision=editor.repository.state.revision;
  expect(editor.repository.canUndo()).toBe(false);
  const snapshot=vi.spyOn(editor.repository,'snapshot'),commit=vi.spyOn(editor.repository,'commit'),prune=vi.spyOn(editor.commands as any,'pruneUnreachable'),diff=vi.spyOn(editor.commands as any,'diff');
  for(const edge of ['start','end'])for(const word of [true,false])for(const direction of [-1,1])data.adjust(edge,direction,word);
  const reads=vi.spyOn(editor,'node');data.adjust('end',1,false);expect(reads.mock.calls.length).toBeLessThan(100);
  expect(snapshot).not.toHaveBeenCalled();expect(commit).not.toHaveBeenCalled();expect(prune).not.toHaveBeenCalled();expect(diff).not.toHaveBeenCalled();
  expect(editor.repository.state.revision).toBe(revision);expect(editor.repository.canUndo()).toBe(false);
  expect(node.inlineContent.map(k=>editor.node(k)!.payload.text).join('')).toBe('one two three four');
  editor.completionInput!.cancel();expect(commit).not.toHaveBeenCalled();
 }finally{release();editor.dispose();root.remove();}
});

it('source highlighting resolves only two endpoints without changing cells, text, selection or layout',()=>{
 const highlights=new Map<string,Set<Range>>();
 vi.stubGlobal('CSS',{highlights});vi.stubGlobal('Highlight',Set);
 const root=document.body.appendChild(document.createElement('div'));
 for(const char of 'one two'){const cell=root.appendChild(document.createElement('span'));cell.textContent=char;}
 const cells=[...root.children],geometry=vi.spyOn(root,'getBoundingClientRect');
 const selection=document.getSelection()!;selection.collapse(cells[1].firstChild,0);
 const {host}=setup();const session=new CompletionSession(host,{...source,start:0,end:3,literal:'one',brackets:'mention'},'entity','one');
 const boundary=vi.fn((at:number)=>{const cell=cells[Math.min(at,cells.length-1)];return{node:cell.firstChild!,offset:at<cells.length?0:1};});
 const editor={mounts:{get:()=>({root,inlineBoundary:boundary})}} as any;
 const ranges=()=>[...(highlights.get('mutable-scry-source')??[])];
 let dispose!:()=>void;createRoot(stop=>{dispose=stop;retainSourceHighlight(editor,session);});
 try{
  expect(ranges().map(r=>r.toString())).toEqual(['one']);expect(boundary).toHaveBeenCalledTimes(2);
  const oldRange=ranges()[0];boundary.mockClear();
  session.update({...session.source,start:4,end:7,literal:'two'},'two');
  expect(ranges().map(r=>r.toString())).toEqual(['two']);expect(ranges()).not.toContain(oldRange);expect(boundary).toHaveBeenCalledTimes(2);
  expect(root.textContent).toBe('one two');expect([...root.children]).toEqual(cells);expect(geometry).not.toHaveBeenCalled();
  expect(selection.anchorNode).toBe(cells[1].firstChild);expect(selection.anchorOffset).toBe(0);
  // A second retained owner must survive cleanup of the first.
  let disposeOther!:()=>void;createRoot(stop=>{disposeOther=stop;retainSourceHighlight(editor,session);});
  expect(ranges()).toHaveLength(2);dispose();expect(ranges()).toHaveLength(1);
  session.update({...session.source,start:7,end:7,literal:''},'');expect(ranges()[0].collapsed).toBe(true);
  disposeOther();expect(highlights.has('mutable-scry-source')).toBe(false);expect(root.textContent).toBe('one two');
 }finally{dispose();session.dispose();root.remove();selection.removeAllRanges();}
});
