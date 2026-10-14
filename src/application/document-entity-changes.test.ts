import {afterEach, expect, it, vi} from 'vitest';
import {ReactiveEditor} from '../reactive-editor/editor';
import {watchDocumentEntities} from './document-entity-changes';
import * as linked from '../block-tree/linked-annotations';

const cleanup: (()=>void)[] = [];
afterEach(()=>{ cleanup.splice(0).reverse().forEach(stop=>stop()); vi.restoreAllMocks(); });
const tick = async () => { await Promise.resolve(); await Promise.resolve(); };
function fixture() {
  const editor = new ReactiveEditor({type:'workspace-block', children:[
    {id:'source', type:'document-block', linkedAnnotations:{shared:{id:'shared',type:'codex/entity-reference',value:'alpha',metadata:{entityName:'Alpha'}}}, children:[
      {id:'text', type:'standoff-editor-block', text:'Alpha text', standoffProperties:[{id:'segment',annotationId:'shared',type:'codex/entity-reference',start:0,end:4}]},
      {id:'nested',type:'document-block',children:[{id:'nested-text',type:'standoff-editor-block',text:'Nested'}]},
    ]},
    {id:'other',type:'document-block',children:[{id:'other-text',type:'standoff-editor-block',text:'Other'}]},
  ]});
  cleanup.push(()=>editor.dispose());
  const projection = editor.createView('source-test');
  const node = (id:string)=>Object.values(projection.state.nodes).find(n=>n.payload.id===id)!;
  const a = vi.fn(), b = vi.fn();
  const first = watchDocumentEntities(editor, node('text').key, a), second = watchDocumentEntities(editor, node('text').key, b);
  cleanup.push(first.dispose, second.dispose);
  return {editor, node, first, second, a, b};
}

it('publishes one document event to both subscribers for shared link changes, including undo/redo', async()=>{
  const f=fixture(), before=f.first.signature;
  f.editor.commands.setPayloadField(f.node('source').key,'linkedAnnotations',{shared:{id:'shared',type:'codex/entity-reference',value:'beta',metadata:{entityName:'Beta'}}});
  await tick();
  expect(f.a).toHaveBeenCalledOnce(); expect(f.b).toHaveBeenCalledOnce();
  expect(f.first.signature).not.toBe(before);
  expect(f.a.mock.calls[0]).toEqual(f.b.mock.calls[0]);
  f.editor.repository.undo(); await tick();
  expect(f.a).toHaveBeenCalledTimes(2); expect(f.first.signature).toBe(before);
  f.editor.repository.redo(); await tick();
  expect(f.a).toHaveBeenCalledTimes(3); expect(f.first.signature).not.toBe(before);
});

it('ignores other Documents and non-link metadata, and distinguishes shifted ranges from changed links', async()=>{
  const f=fixture(), before=f.first.signature;
  for (const id of ['other-text','nested-text']) f.editor.commands.setPayloadField(f.node(id).key,'standoffProperties',[{id:'new',type:'codex/entity-reference',value:'other',start:0,end:2}]);
  f.editor.commands.setPayloadField(f.node('source').key,'metadata',{title:'New title'});
  await tick(); expect(f.a).not.toHaveBeenCalled();
  f.editor.commands.replaceInlineRange(f.node('text').key,0,0,'Before ');
  await tick(); expect(f.a).not.toHaveBeenCalled(); expect(f.first.signature).toBe(before);
  f.editor.commands.setPayloadField(f.node('text').key,'standoffProperties',[]);
  await tick(); expect(f.a).toHaveBeenCalledOnce(); expect(f.first.signature).not.toBe(before);
});

it('coalesces a burst of link edits and unsubscribes without delivering queued events', async()=>{
  const f=fixture();
  for (const value of ['beta','gamma']) f.editor.commands.setPayloadField(f.node('source').key,'linkedAnnotations',{shared:{id:'shared',type:'codex/entity-reference',value}});
  f.first.dispose();
  await tick(); expect(f.a).not.toHaveBeenCalled(); expect(f.b).toHaveBeenCalledOnce();
  f.editor.commands.setPayloadField(f.node('text').key,'standoffProperties',[]);
  f.second.dispose();
  await tick(); expect(f.b).toHaveBeenCalledOnce();
});

it('publishes explicit link boundary edits without invalidating names and counts', async()=>{
  const f=fixture(), before=f.first.signature;
  const property = JSON.parse(JSON.stringify(f.node('text').payload.standoffProperties))[0];
  f.editor.linkedAnnotations.edit(f.node('text').key, 0, property, 'expand');
  await tick();
  expect(f.a).toHaveBeenCalledOnce();
  expect(f.first.signature).toBe(before);
});

it('does not rescan document references or notify for typing, text undo/redo or unrelated styles', async()=>{
  const f = fixture();
  const resolve = vi.spyOn(linked, 'resolveLinkedProperty');
  // Separate tasks, so this cannot pass merely by coalescing a typing burst.
  for (const index of [0, 9, 12]) {
    f.editor.commands.replaceInlineRange(f.node('text').key, index, index, 'x');
    await tick();
  }
  f.editor.repository.undo(); await tick();
  f.editor.repository.redo(); await tick();
  const properties = JSON.parse(JSON.stringify(f.node('text').payload.standoffProperties));
  f.editor.commands.setPayloadField(f.node('text').key, 'standoffProperties', [...properties, { id:'bold', type:'style/bold', start:0, end:2 }]);
  await tick();
  expect(resolve).not.toHaveBeenCalled();
  expect(f.a).not.toHaveBeenCalled();
  expect(f.b).not.toHaveBeenCalled();
});

it('publishes reference removal caused by deleting annotated text and restores it on undo', async()=>{
  const f = fixture(), before = f.first.signature;
  f.editor.commands.replaceInlineRange(f.node('text').key, 0, 5, '');
  await tick();
  expect(f.a).toHaveBeenCalledOnce();
  expect(f.first.signature).not.toBe(before);
  f.editor.repository.undo(); await tick();
  expect(f.a).toHaveBeenCalledTimes(2);
  expect(f.first.signature).toBe(before);
});
