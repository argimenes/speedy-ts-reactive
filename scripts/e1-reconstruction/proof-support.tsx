/** Investigation only. No production caller. Deliberately NOT a handover API. */
import { createEffect, onCleanup, untrack } from 'solid-js';
import { insert, render } from 'solid-js/web';
import { WorkspaceSession } from '../../src/application/workspace-session';
import { WorkspacePresentationView } from '../../src/application/workspace-presentation-view';
import { materializeLocalWorkspace } from '../../src/reactive-editor/workspace-manifest';
import { ReactiveViewProvider } from '../../src/reactive-editor/context';
import { DocumentSessionContext } from '../../src/rendering/document-session-context';
import { DocumentSessionWindowOwner } from '../../src/rendering/window-manager';
import { TransientDocumentView } from '../../src/rendering/transient-document-view';
import { WindowView } from '../../src/rendering/core-block-views';
import { identityCoordinates } from '../../src/runtime/local-coordinates';
import type { RetainedDocumentSession } from '../../src/application/document-sessions';
import type { PdfCapture } from '../../src/pdf/model';

export const pdf: PdfCapture = {version:1,kind:'pdf',snapshotId:'proof-pdf',identityId:'proof-identity',entityId:'proof-entity',resourceId:'proof-pdf-resource',sourceUrl:'https://example.invalid/proof.pdf',endpoint:'local-fixture',retrievedAt:'2026-10-21T00:00:00Z',asset:{kind:'managed',cavernId:'proof',assetId:'sha256:'+'a'.repeat(64)},inspection:{kind:'pdf-inspection',pages:2,label:'Reconstruction boundary PDF',version:'1.7'}};
export const settle = () => new Promise<void>(resolve => setTimeout(resolve, 25));
export async function setup() {
  const workspace=new WorkspaceSession(materializeLocalWorkspace({id:'proof-workspace',type:'workspace-block',children:[{id:'proof-bank',type:'workspace-object-bank-block',children:[{id:'proof-document',type:'document-block',metadata:{documentId:'proof-resource',title:'Reconstruction proof'},children:[{id:'proof-text',type:'standoff-editor-block',text:'Canonical text before edits.'},{id:'proof-pdf-block',type:'mutable/pdf-document-block',pdf}]}]}]}),{features:{entityReferences:false,nativeKnowledge:false,flintLogo:false,flintMaterialChrome:false,flintSpatialGraph:false}});
  const {editor}=workspace;editor.setAssetContext(()=>({cavernId:'proof',session:'proof-token'}));
  const root=document.body.appendChild(document.createElement('main'));root.className='workspace-demo workspace-demo--canonical';root.dataset.windowWorkArea='';
  const stop=render(()=><WorkspacePresentationView session={workspace}/>,root),input=editor.installGateway(document);
  await editor.commandRegistry.execute('flint.open',{targetKey:workspace.projection.state.rootKey,args:undefined});await settle();
  const source=workspace.documentSessions!.sessions()[0];
  const text=(s:RetainedDocumentSession)=>Object.values(s.projection.state.nodes).find(n=>n.payload.id==='proof-text')!;
  return {workspace,editor,root,source,text,dispose(){input();stop();workspace.dispose();root.remove();}};
}

/** Exercise existing mount/attach primitives in a real runtime WindowView.
 * Keeps the source intact. No automatic commit, source retirement or fallback.
 */
export function candidate(f:Awaited<ReturnType<typeof setup>>) {
  const store=f.workspace.documentSessions!,manager=f.workspace.windowManager!,id='proof-host:'+crypto.randomUUID();
  const node={key:id,viewId:f.workspace.projection.viewId,contentKey:id,placementKey:id,viewType:'document-window-block',children:[],ownedRelations:{},payload:{id,type:'document-window-block',metadata:{title:'Candidate proof only',position:{x:360,y:60},size:{w:850,h:800}}}} as any;
  const root=document.body.appendChild(document.createElement('div'));
  let replacement!:RetainedDocumentSession;
  manager.runtime.set(id,{node:()=>node,patch:()=>{},close:()=>dispose()});
  function Contents() {
    const slot=document.createElement('div');
    const lease=store.transfers.register({kind:'managed-document',ownerKey:id,slotKey:id,windowId:id,container:slot,coordinates:identityCoordinates,selected:()=>true});
    onCleanup(()=>lease.release());
    replacement=store.mount({ownerKey:id,slotKey:id,windowId:id,placement:f.source.projection.node(f.source.rootKey)!.placementKey,coordinates:identityCoordinates},session=>{
      createEffect(()=>{const w=manager.registry.windows[id];untrack(()=>session.host.update(!!w?.visible,!!w?.active));});
      insert(session.element,()=><DocumentSessionContext.Provider value={session}><DocumentSessionWindowOwner session={session} manager={manager}><ReactiveViewProvider editor={f.editor} projection={session.projection} coordinates={session.host.coordinates} activity={session.host.activity}><TransientDocumentView editor={f.editor} placement={session.projection.node(session.rootKey)!.placementKey} bookmark={()=>undefined} remember={()=>{}} selected={true}/></ReactiveViewProvider></DocumentSessionWindowOwner></DocumentSessionContext.Provider>);
    });
    store.transfers.attachInitial(replacement,lease);return slot;
  }
  const stop=render(()=><ReactiveViewProvider editor={f.editor} projection={f.workspace.projection} coordinates={identityCoordinates}><WindowView nodeKey={id} content={Contents}/></ReactiveViewProvider>,root);
  let disposed=false;
  function dispose(){if(disposed)return;disposed=true;stop();manager.runtime.delete(id);root.remove();}
  return {id,session:replacement,dispose};
}
