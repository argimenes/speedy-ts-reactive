import {afterEach,expect,it,vi} from 'vitest';
import {ReactiveEditor} from '../reactive-editor/editor';
import {liveDocumentEntities} from './live-document-entities';
const cleanup:Array<()=>void>=[];
afterEach(()=>{cleanup.splice(0).reverse().forEach(f=>f());vi.restoreAllMocks();});
function fixture() {
 const editor=new ReactiveEditor({type:'workspace-block',children:[
  {id:'doc',type:'document-block',children:[
   {id:'a',type:'standoff-editor-block',text:'Liszt and Liszt',standoffProperties:[{id:'l1',type:'codex/entity-reference',value:'liszt',start:0,end:4},{id:'l2',type:'codex/entity-reference',value:'liszt',start:10,end:14}]},
   {id:'unrelated',type:'standoff-editor-block',text:'untouched '.repeat(1000),standoffProperties:[{id:'u',type:'codex/entity-reference',value:'other',start:0,end:8}]},
   {id:'citation',type:'mutable/citation-block',blockProperties:[{id:'c',type:'codex/entity-reference',value:'liszt'}]},
  ]},
  {id:'foreign',type:'document-block',children:[{id:'foreign-text',type:'standoff-editor-block',text:'foreign',standoffProperties:[{id:'f',type:'codex/entity-reference',value:'foreign',start:0,end:6}]}]},
 ]});
 const view=editor.createView('live-inventory'),node=(id:string)=>Object.values(view.state.nodes).find(n=>n.payload.id===id)!;
 cleanup.push(()=>editor.dispose());return {editor,node};
}
it('counts unsaved owned links once, retains block references and excludes foreign transclusions',()=>{
 const {editor,node}=fixture();
 editor.commands.transclude(node('foreign-text').key,{kind:'at',parentKey:node('doc').key,index:0});
 editor.commands.transclude(node('a').key,{kind:'at',parentKey:node('doc').key,index:0});
 const inventory=liveDocumentEntities(editor,node('doc').contentKey);cleanup.push(()=>inventory.dispose());
 expect(inventory.read().rows.find(r=>r.id==='liszt')).toMatchObject({occurrences:3,blockReferences:1,forms:['Liszt']});
 expect(inventory.read().rows.map(r=>r.id)).not.toContain('foreign');
 expect(inventory.owns(node('foreign-text').contentKey)).toBe(false);
});
it('updates edited surfaces, retargeting, deletion and undo without saving',async()=>{
 const {editor,node}=fixture(),inventory=liveDocumentEntities(editor,node('doc').contentKey);cleanup.push(()=>inventory.dispose());
 editor.commands.replaceInlineRange(node('a').key,1,2,'I');await Promise.resolve();
 expect(inventory.read().rows.find(r=>r.id==='liszt')?.forms).toEqual(expect.arrayContaining(['LIszt','Liszt']));
 editor.commands.setPayloadField(node('a').key,'standoffProperties',[{id:'l1',type:'codex/entity-reference',value:'new',start:0,end:4}]);await Promise.resolve();
 expect(inventory.read().rows.find(r=>r.id==='new')?.occurrences).toBe(1);
 expect(inventory.read().rows.find(r=>r.id==='liszt')?.occurrences).toBe(1);
 editor.repository.undo();await Promise.resolve();expect(inventory.read().rows.find(r=>r.id==='liszt')?.occurrences).toBe(3);
});
it('does no inventory publication or unrelated content reads on offset-only typing',async()=>{
 const {editor,node}=fixture(),inventory=liveDocumentEntities(editor,node('doc').contentKey);cleanup.push(()=>inventory.dispose());
 const notify=vi.fn();inventory.subscribe(notify);
 const read=editor.repository.readState.bind(editor.repository),reads:string[]=[];
 vi.spyOn(editor.repository,'readState').mockImplementation(()=>{const state=read();return {...state,contents:new Proxy(state.contents,{get(target,key,receiver){reads.push(String(key));return Reflect.get(target,key,receiver);}})};});
 const snapshot=vi.spyOn(editor.repository,'snapshot');
 editor.commands.replaceInlineRange(node('a').key,0,0,'A ');reads.length=0;await Promise.resolve();
 expect(notify).not.toHaveBeenCalled();expect(snapshot).not.toHaveBeenCalled();
 expect(reads).not.toContain(node('unrelated').contentKey);
 expect(inventory.read().rows.find(r=>r.id==='liszt')?.forms).toEqual(['Liszt']);
});
it('shares the source lease and publishes only changed entity objects',async()=>{
 const {editor,node}=fixture(),subscribe=vi.spyOn(editor.repository,'subscribeChanges');
 const a=liveDocumentEntities(editor,node('doc').contentKey),b=liveDocumentEntities(editor,node('doc').contentKey);
 cleanup.push(()=>a.dispose(),()=>b.dispose());expect(subscribe).toHaveBeenCalledTimes(1);
 const unchanged=a.read().rows.find(r=>r.id==='other');
 editor.commands.replaceInlineRange(node('a').key,1,2,'I');await Promise.resolve();
 expect(b.read().rows.find(r=>r.id==='other')).toBe(unchanged);
 a.dispose();const listener=vi.fn();b.subscribe(listener);
 editor.commands.setPayloadField(node('citation').key,'blockProperties',[]);await Promise.resolve();expect(listener).toHaveBeenCalledTimes(1);
});
it('counts a shared multi-Block annotation once and resolves definition edits',async()=>{
 const {editor,node}=fixture();editor.commands.setPayloadField(node('doc').key,'linkedAnnotations',{shared:{id:'shared',type:'codex/entity-reference',value:'shared'}});
 for(const id of ['a','unrelated'])editor.commands.setPayloadField(node(id).key,'standoffProperties',[{id,annotationId:'shared',type:'codex/entity-reference',start:0,end:4}]);
 const inventory=liveDocumentEntities(editor,node('doc').contentKey);cleanup.push(()=>inventory.dispose());
 expect(inventory.read().rows.find(r=>r.id==='shared')).toMatchObject({occurrences:1,forms:['Liszt untou']});
 editor.commands.setPayloadField(node('doc').key,'linkedAnnotations',{shared:{id:'shared',type:'codex/entity-reference',value:'retargeted'}});await Promise.resolve();
 expect(inventory.read().rows.find(r=>r.id==='shared')).toBeUndefined();expect(inventory.read().rows.find(r=>r.id==='retargeted')?.occurrences).toBe(1);
});
it('updates owned membership after moving and removing annotated Blocks, including undo',async()=>{
 const {editor,node}=fixture(),inventory=liveDocumentEntities(editor,node('doc').contentKey);cleanup.push(()=>inventory.dispose());
 const key=node('a').key, contentKey=node('a').contentKey;
 editor.commands.move(key,{kind:'at',parentKey:node('foreign').key,index:0});await Promise.resolve();
 expect(inventory.owns(contentKey)).toBe(false);
 expect(inventory.read().rows.find(r=>r.id==='liszt')?.occurrences).toBe(1);
 editor.repository.undo();await Promise.resolve();expect(inventory.read().rows.find(r=>r.id==='liszt')?.occurrences).toBe(3);
 editor.commands.remove(node('a').key);await Promise.resolve();expect(inventory.read().rows.find(r=>r.id==='liszt')?.occurrences).toBe(1);
 editor.repository.undo();await Promise.resolve();expect(inventory.read().rows.find(r=>r.id==='liszt')?.occurrences).toBe(3);
});
it('tracks in-place Cell payload changes and a new edit after Undo without stale cached surfaces',async()=>{
 const {editor,node}=fixture(),inventory=liveDocumentEntities(editor,node('doc').contentKey);cleanup.push(()=>inventory.dispose());
 const cell=node('a').inlineContent[1],unchanged=inventory.read().rows.find(r=>r.id==='other');
 editor.commands.setPayloadField(cell,'text','I');await Promise.resolve();
 expect(inventory.read().rows.find(r=>r.id==='liszt')?.forms).toContain('LIszt');
 editor.repository.undo();await Promise.resolve();
 editor.commands.setPayloadField(cell,'text','X');await Promise.resolve();
 expect(inventory.read().rows.find(r=>r.id==='liszt')?.forms).toContain('LXszt');
 expect(inventory.read().rows.find(r=>r.id==='liszt')?.forms).not.toContain('LIszt');
 expect(inventory.read().rows.find(r=>r.id==='other')).toBe(unchanged);
});
