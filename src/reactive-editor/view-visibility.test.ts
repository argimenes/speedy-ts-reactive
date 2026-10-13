// @vitest-environment jsdom
import {afterEach,expect,it} from 'vitest';
import {ReactiveEditor} from './editor';
import {materializeLocalWorkspace} from './workspace-manifest';
const editors: ReactiveEditor[]=[];
afterEach(()=>{editors.splice(0).forEach(e=>e.dispose());});
function setup(metadata: any={}) {
 const editor=new ReactiveEditor(materializeLocalWorkspace({id:'workspace',type:'workspace-block',metadata,children:[{id:'window',type:'window-block',children:[]}]}));
 editors.push(editor);const view=editor.createView('main');
 const window=Object.values(view.state.nodes).find(n=>n.payload.id==='window')!;
 return {editor,window};
}
it('keeps a later visibility change dirty when acknowledging an earlier workspace save',()=>{
 const {editor,window}=setup();editor.closeView(window.key);
 const captured=editor.persistence.captureWorkspace();
 editor.viewVisibility.set(window.placementKey,false);
 editor.persistence.acknowledgeWorkspaceSave(captured);
 expect(editor.viewVisibility.dirty()).toBe(true);
 editor.persistence.acknowledgeWorkspaceSave(editor.persistence.captureWorkspace());
 expect(editor.viewVisibility.dirty()).toBe(false);
});
it('decorates captures without mutating a supplied live repository or dropping future metadata',()=>{
 const {editor,window}=setup({workspaceViewVisibility:{version:1,closed:[],future:{retained:true}}});
 editor.closeView(window.key);const before=editor.repository.snapshot();
 const dto=editor.encodeWorkspace(editor.repository.readState());
 expect(editor.repository.snapshot()).toEqual(before);
 expect((dto.metadata as any).workspaceViewVisibility.future).toEqual({retained:true});
 expect((dto.metadata as any).workspaceViewVisibility.closed).toHaveLength(1);
 expect(editor.repository.canUndo()).toBe(false);
});
it('preserves unknown saved visibility formats without interpreting them as hidden content',()=>{
 const value={version:2,closed:['block:window'],future:true};
 const {editor,window}=setup({workspaceViewVisibility:value});
 expect(editor.viewVisibility.isClosed(window.placementKey)).toBe(false);
 editor.closeView(window.key);
 expect((editor.persistence.captureWorkspace().document.metadata as any).workspaceViewVisibility).toEqual(value);
});
it('does not consume or discard document Undo/Redo when a window closes',()=>{
 const {editor,window}=setup();
 editor.commands.setPayloadField(window.key,'metadata',{title:'Changed'});
 editor.repository.undo();expect(editor.repository.canRedo()).toBe(true);
 editor.closeView(window.key);expect(editor.repository.canRedo()).toBe(true);
 editor.repository.redo();expect(editor.viewVisibility.isClosed(window.placementKey)).toBe(true);
 expect((editor.node(window.key)!.payload.metadata as any).title).toBe('Changed');
});
