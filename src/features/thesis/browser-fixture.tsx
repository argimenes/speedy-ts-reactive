/** Isolated functional harness, imported only by scripts/check-thesis.mjs. */
import {render} from 'solid-js/web';
import {ReactiveEditor} from '../../reactive-editor/editor';
import {registerApplicationViews} from '../../application/features';
import {ReactiveTreeView} from '../../rendering/reactive-tree-view';
import '../../index.css';
import '../../demo/workspace-demo.css';
export function mountThesisFixture(host:HTMLElement){
 host.classList.add('workspace-demo');
 const resource=crypto.randomUUID(),block=crypto.randomUUID(),target=crypto.randomUUID();
 const editor=new ReactiveEditor({id:crypto.randomUUID(),type:'workspace-block',children:[{id:resource,type:'document-block',metadata:{documentId:resource},children:[{id:block,type:'standoff-editor-block',text:'Before 😀é after',standoffProperties:[{id:crypto.randomUUID(),type:'style/bold',start:7,end:9},{id:crypto.randomUUID(),type:'codex/entity-reference',value:target,start:7,end:7}]}]}]});
 registerApplicationViews(editor);const view=editor.createView();const dispose=render(()=><ReactiveTreeView editor={editor} projection={view}/>,host),gateway=editor.installGateway(document);
 const source=Object.values(view.state.nodes).find(n=>n.payload.id===block)!;
 return {editor,view,source,resource,block,target,select(start:number,end:number){const m=editor.mounts.get(source.key)!;m.focus();m.restoreInlineSelection!({anchor:start,head:end});},open(){editor.commandRegistry.execute('thesis.open',{targetKey:view.state.rootKey,args:undefined});},create(){editor.commandRegistry.execute('thesis.createProposition',{targetKey:source.key,args:undefined});},dispose(){gateway();dispose();editor.dispose();}};
}
