import {afterEach,expect,it,vi} from 'vitest';
import {ReactiveEditor} from '../../reactive-editor/editor';
import {createAutocompleteFeature} from './index';
import {nativeDocumentSession} from '../../persistence/native-session';
const clean:(()=>void)[]=[];
afterEach(()=>{clean.splice(0).reverse().forEach(f=>f());vi.restoreAllMocks();});
function setup(text='one two three',properties:any[]=[],enabled=true){
 const editor=new ReactiveEditor({type:'document-block',children:[{id:'a',type:'standoff-editor-block',text,standoffProperties:properties},{id:'b',type:'standoff-editor-block',text:'other mention'}]},{features:{scryProvisionalCells:enabled}});
 const view=editor.createView(),node=Object.values(view.state.nodes).find(n=>n.payload.id==='a')!,other=Object.values(view.state.nodes).find(n=>n.payload.id==='b')!;
 const root=document.body.appendChild(document.createElement('div'));let range={anchor:0,head:0};
 const release=editor.mounts.register(node.key,{root,focusElement:root,inputPolicy:'standoff',focus(){},captureInlineSelection:()=>range,restoreInlineSelection:r=>range=r});
 editor.featureHost.activate(createAutocompleteFeature(editor));clean.push(()=>{release();editor.dispose();root.remove();});
 const read=()=>node.inlineContent.map(k=>editor.node(k)!.payload.text).join('');
 return {editor,node,other,read,input:editor.completionInput!};
}
it('preserves canonical state through both trigger keystrokes and typing; Escape publishes once',()=>{
 const {editor,node,read,input}=setup('');const snapshot=vi.spyOn(editor.repository,'snapshot'),commit=vi.spyOn(editor.repository,'commit');
 input.intercept!(node.key,0,0,'[','insertText');input.intercept!(node.key,0,0,'[','insertText');input.intercept!(node.key,0,0,'Flo','insertText');
 expect(read()).toBe('');expect(snapshot).not.toHaveBeenCalled();expect(commit).not.toHaveBeenCalled();expect(editor.repository.canUndo()).toBe(false);
 input.cancel();expect(read()).toBe('Flo');expect(commit).toHaveBeenCalledTimes(1);expect(snapshot).not.toHaveBeenCalled();editor.repository.undo();expect(read()).toBe('');editor.repository.redo();expect(read()).toBe('Flo');
});
it('boundary-only cancellation leaves the pre-existing redo stack intact',()=>{
 const {editor,node,input,read}=setup();editor.commands.replaceInlineRange(node.key,0,0,'x');editor.repository.undo();expect(editor.repository.canRedo()).toBe(true);
 input.intercept!(node.key,0,0,'((','insertText');expect(editor.repository.canRedo()).toBe(false);editor.repository.redo();expect(read()).toBe('one two three');input.cancel();expect(editor.repository.canRedo()).toBe(true);
});
it('unmatched initial punctuation falls back to normal ordered typing',()=>{
 const {node,input,read}=setup('');input.intercept!(node.key,0,0,'[','insertText');input.intercept!(node.key,0,0,'a','insertText');expect(read()).toBe('[a');
});
it('atomic completion retains untouched cells and overlapping references, with exact Undo',()=>{
 const props=[{id:'old',type:'codex/entity-reference',value:'old',start:0,end:12}],{editor,node,read}=setup('one two three',props),keys=[...node.inlineContent],version=editor.repository.state.contents[node.contentKey].inlineRevision;
 const snapshot=vi.spyOn(editor.repository,'snapshot'),commit=vi.spyOn(editor.repository,'commit');
 editor.commands.completeProvisionalText(node.key,version,[{start:4,end:4,text:'new '}],{start:4,end:11,value:'new',name:'New'});
 expect(read()).toBe('one new two three');expect(node.inlineContent.slice(0,4)).toEqual(keys.slice(0,4));expect(node.inlineContent.slice(8)).toEqual(keys.slice(4));
 expect(node.payload.standoffProperties).toEqual([expect.objectContaining({id:'old',end:16}),expect.objectContaining({value:'new',start:4,end:10})]);
 expect(snapshot).not.toHaveBeenCalled();expect(commit).toHaveBeenCalledTimes(1);editor.repository.undo();expect(read()).toBe('one two three');expect(node.inlineContent).toEqual(keys);expect(node.payload.standoffProperties).toEqual(props);
});
it('invalid and stale final operations do not partially publish',()=>{
 const {editor,node,read}=setup();const version=editor.repository.state.contents[node.contentKey].inlineRevision,commit=vi.spyOn(editor.repository,'commit');
 expect(()=>editor.commands.completeProvisionalText(node.key,version,[{start:0,end:0,text:'new'}],{start:0,end:999,value:'x',name:'x'})).toThrow();expect(commit).not.toHaveBeenCalled();expect(read()).toBe('one two three');
 editor.commands.replaceInlineRange(node.key,0,0,'new ');commit.mockClear();expect(()=>editor.commands.completeProvisionalText(node.key,version,[])).toThrow('source changed');expect(commit).not.toHaveBeenCalled();expect(read()).toBe('new one two three');
});
it('reviewed annotations join provisional phrase edits without a repository snapshot',()=>{
 const {editor,node,other}=setup();const version=editor.repository.state.contents[node.contentKey].inlineRevision,snapshot=vi.spyOn(editor.repository,'snapshot'),commit=vi.spyOn(editor.repository,'commit');
 const reviewed=editor.commands.captureAnnotationBatch(()=>{editor.linkedAnnotations.createBatch([[editor.textRanges.snapshot(other.key,0,5)]],'codex/entity-reference','entity',{},editor.repository.state.revision,'Reviewed');});
 expect(commit).not.toHaveBeenCalled();editor.commands.completeProvisionalText(node.key,version,[{start:3,end:3,text:'!'}],{start:0,end:4,value:'entity',name:'Entity'},reviewed);
 expect(commit).toHaveBeenCalledTimes(1);expect(snapshot).not.toHaveBeenCalled();expect(other.payload.standoffProperties).toHaveLength(1);editor.repository.undo();expect(other.payload.standoffProperties??[]).toHaveLength(0);
});
it('Document and Workspace Save are gated before capture and do not queue a save',async()=>{
 const {editor,node,input,read}=setup('');input.intercept!(node.key,0,0,'((','insertText');input.intercept!(node.key,0,0,'Flo','insertText');
 vi.spyOn(window,'confirm').mockReturnValue(false);const snapshot=vi.spyOn(editor.repository,'snapshot');
 expect(()=>editor.persistence.captureWorkspace()).toThrow('Finish or cancel Scry');await expect(nativeDocumentSession(editor).save('unused')).rejects.toThrow('Finish or cancel Scry');
 expect(snapshot).not.toHaveBeenCalled();expect(read()).toBe('');input.cancel();expect(read()).toBe('Flo');
});
it('stale source recovery never overwrites a newer edit and can remain open for copying',()=>{
 const {editor,node,input,read}=setup('');input.intercept!(node.key,0,0,'((','insertText');input.intercept!(node.key,0,0,'draft','insertText');
 editor.commands.replaceInlineRange(node.key,0,0,'newer');const commit=vi.spyOn(editor.repository,'commit'),confirm=vi.spyOn(window,'confirm').mockReturnValue(false);
 input.cancel();expect(read()).toBe('newer');expect(editor.repository.canUndo()).toBe(false);expect(commit).not.toHaveBeenCalled();
 confirm.mockReturnValue(true);input.cancel();expect(read()).toBe('newer');expect(editor.repository.canUndo()).toBe(true);expect(commit).not.toHaveBeenCalled();
});
it('feature disposal releases a stale draft history guard even if recovery cancellation was declined',()=>{
 const {editor,node,input}=setup('');input.intercept!(node.key,0,0,'((','insertText');input.intercept!(node.key,0,0,'draft','insertText');editor.commands.replaceInlineRange(node.key,0,0,'newer');
 vi.spyOn(window,'confirm').mockReturnValue(false);editor.dispose();expect(editor.repository.canUndo()).toBe(true);
});
it('the disabled feature retains the legacy bracket input path',()=>{
 const {editor,node,input,read}=setup('',[],false),commit=vi.spyOn(editor.repository,'commit');
 input.intercept!(node.key,0,0,'[','insertText');expect(read()).toBe('[');input.intercept!(node.key,1,1,'[','insertText');expect(read()).toBe('');
 input.intercept!(node.key,0,0,'Flo','insertText');expect(read()).toBe('Flo');expect(commit).toHaveBeenCalled();input.cancel();expect(editor.repository.canUndo()).toBe(true);
});

it('Save shortcut from a menu does not silently cancel and publish the draft',()=>{
 const {editor,node,input,read}=setup('');input.intercept!(node.key,0,0,'((','insertText');input.intercept!(node.key,0,0,'draft','insertText');
 const confirm=vi.spyOn(window,'confirm').mockReturnValue(false),commit=vi.spyOn(editor.repository,'commit');
 const event=new KeyboardEvent('keydown',{key:'s',metaKey:true,cancelable:true});Object.defineProperty(event,'target',{value:document.body});
 expect(input.key(event)).toBe(true);expect(event.defaultPrevented).toBe(true);expect(confirm).toHaveBeenCalledTimes(1);expect(read()).toBe('');expect(commit).not.toHaveBeenCalled();
 input.cancel();
});
