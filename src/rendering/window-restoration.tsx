import { openJsonFile } from "../demo/browser-json-file";
import { documentIdentity } from "../reactive-editor/workspace-manifest";
import { decodeDocument } from "../block-tree/codecs";
import { Show, createSignal, createMemo, untrack, onCleanup, type JSX } from 'solid-js';
import { useReactiveView } from '../reactive-editor/context';
import { appForAnchor } from '../persistence/managed-desktop';

/** Unsupported descriptors remain byte-for-byte data in the workspace. Never
 * instantiate a guessed application or reinterpret a newer descriptor version. */
export function WindowRestorationBoundary(props:{nodeKey:string;children:JSX.Element}) {
  const {editor,projection}=useReactiveView();
  const [retry,setRetry]=createSignal(0),[error,setError]=createSignal(''),[busy,setBusy]=createSignal(false);
  let alive=true;onCleanup(()=>{alive=false;});
  const missingLocal=()=>{
    const d=editor.windowManager?.named.descriptor(props.nodeKey),node=projection.state.nodes[props.nodeKey];
    return d?.appId==='ink'&&d.descriptorVersion===1&&node?.viewType==='document-window-block'&&!node.children.length&&d.resources.length===1&&d.resources[0].kind==='document'?d.resources[0]:undefined;
  };
  const locate=async()=>{const resource=missingLocal();if(!resource||busy())return;setBusy(true);setError('');try{
    const file=await openJsonFile();if(!file||!alive)return;
    const dto=file.value as any;decodeDocument(dto);
    if(!['document-block','main-list-block','membrane-block'].includes(dto.type)||documentIdentity(dto)!==resource.documentId)throw Error('The selected file does not contain the expected Document identity.');
    if(!missingLocal())throw Error('The restore target changed while the picker was open.');
    const state=editor.repository.readState(),matches=Object.values(state.contents).filter(c=>c.viewType==='document-block'&&((c.payload.metadata as any)?.documentId??c.payload.id)===resource.documentId);
    if(matches.length>1)throw Error('The Document identity is ambiguous in this workspace.');
    const destination={kind:'at' as const,parentKey:projection.state.nodes[props.nodeKey].placementKey,index:0};
    if(matches.length){const placement=Object.values(state.placements).find(p=>p.contentKey===matches[0].key)!;editor.commands.transclude(placement.key,destination);}
    else editor.commands.insert(dto,destination);setRetry(n=>n+1);
  }catch(e){if(alive)setError(String(e));}finally{if(alive)setBusy(false);}};
  const reason=createMemo(()=>{
    retry();return untrack(()=>{const d=editor.windowManager?.named.descriptor(props.nodeKey);if(!d)return '';
    const node=projection.state.nodes[props.nodeKey];
    if(d.descriptorVersion!==1)return `Unsupported ${d.appId} descriptor version ${d.descriptorVersion}.`;
    const anchor={type:node.viewType,children:node.children.map(k=>({type:projection.state.nodes[k]?.viewType}))};
    if(d.appId!==appForAnchor(anchor)||!['ink','flint','thesis','phosphor','viewer'].includes(d.appId))return `Application ${d.appId} is unavailable or does not match its saved anchor.`;
    if(d.resources.some(r=>!['document','proposition'].includes(String(r.kind))))return 'This resource descriptor is unsupported.';
    if(d.resources.filter(r=>r.kind==='proposition').length>1)return 'The saved Proposition identity is ambiguous.';
    if(d.resources.some(r=>r.kind==='proposition')&&d.appId!=='thesis')return 'This application cannot restore a Proposition resource.';
    if(d.appId==='thesis'&&!editor.features.thesis||d.appId==='flint'&&!editor.features.flint||d.appId==='phosphor'&&!editor.features.phosphor)return 'The saved application is disabled.';
    if(d.appId==='ink'&&d.resources.some(r=>r.kind==='document')){
      const expected=d.resources.filter(r=>r.kind==='document'),children=node.children.map(k=>projection.state.nodes[k]);
      if(expected.length!==1||!children.some(c=>['document-block','document-reference-block'].includes(c?.viewType)&&((c.payload.metadata as any)?.documentId??c.payload.id)===expected[0].documentId))return 'The saved Document identity is unavailable in this window anchor.';
    }
    for(const r of d.resources.filter(r=>r.kind==='document')){
      const state=editor.repository.state;
      const available=Object.values(state.contents).some(c=>['document-block','document-reference-block'].includes(c.viewType)&&((c.payload.metadata as any)?.documentId??c.payload.id)===r.documentId);
      if(!available)return `Document ${String(r.documentId)} is unavailable in this workspace.`;
    }
    return '';
    });
  });
  return <Show when={!reason()} fallback={<section role="alert" aria-label="Unavailable window"><strong>Window unavailable</strong><p>{reason()}</p><Show when={error()}><p role="alert">{error()}</p></Show><Show when={missingLocal()}><button disabled={busy()} onClick={()=>void locate()}>Locate / Relink Document…</button></Show><p>The original descriptor is preserved. Retry after enabling or updating the application. Unsupported descriptor formats cannot be relinked until the application can validate their identities.</p><button onClick={()=>setRetry(n=>n+1)}>Retry</button><button onClick={()=>editor.windowManager?.named.remove(props.nodeKey)}>Remove unavailable window</button></section>}>{props.children}</Show>;
}
