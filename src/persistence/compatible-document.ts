/** Content recognition and format-specific round-trip proof. No implicit conversion. */
import type { RepositoryState } from '../block-tree/types';
import { decodeBlockTree, encodeDocument } from '../block-tree/codecs';
import { validateRepository } from '../block-tree/repository';
import { decodeHistoryDocument, resourceToRepository } from '../history/durable-core';
import { captureNative, decodeNative, nativeText } from './native-resource';

export function recognizeCompatibleDocument(bytes: Uint8Array) {
  if(bytes.byteLength>20*1024*1024)throw Error('Document exceeds the compatibility read budget');
  const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  if(value?.format==='mutable-document')return {format:'mutable-document',resource:decodeNative(bytes)};
  let state:RepositoryState,format:string;
  if(value?.format==='codex-history-document'){
    state=decodeHistoryDocument(value).state;format='codex-history-document';
  }else{
    if(value?.format||value?.kind)throw Error('Unsupported resource format/version; this resource needs its own Open handler');
    let count=0;const ids=new Set<string>();
    const check=(node:any,depth=0)=>{
      if(++count>100000||depth>256)throw Error('Document structure exceeds the compatibility read budget');
      if(!node||typeof node!=='object'||Array.isArray(node)||typeof node.type!=='string'||typeof node.id!=='string'||!node.id.trim()||ids.has(node.id))throw Error('Missing or duplicate authored Block identity in compatible Document');
      ids.add(node.id);
      if(node.children!=null){if(!Array.isArray(node.children))throw Error('Invalid Document children');for(const child of node.children)check(child,depth+1);}
      if(node.relation!=null){if(typeof node.relation!=='object'||Array.isArray(node.relation))throw Error('Invalid Document relations');for(const [name,child] of Object.entries(node.relation))if((name==='leftMargin'||name==='rightMargin'||name.startsWith('superposition:'))&&child!=null)check(child,depth+1);}
    };
    check(value);state=decodeBlockTree(value).state;format='legacy-block-tree';
  }
  validateRepository(state);
  const root=state.contents[state.placements[state.rootPlacementKey].contentKey];
  if(root.viewType!=='document-block')throw Error('This file is not a Document; open it with its resource-specific handler');
  if(Object.values(state.contents).some(c=>c!==root&&c.viewType==='document-block'))throw Error('Nested Document resources require a qualified compatibility admission handler');
  const id=(root.payload.metadata as any)?.documentId??root.payload.id;
  if(typeof id!=='string'||!id.trim())throw Error('Document has no stable canonical identity');
  return {format,resource:captureNative(state,id)};
}

/** Format capability, independent of filename. Re-check each captured generation. */
export function encodeRecognizedDocument(resource:ReturnType<typeof decodeNative>,format:string):string {
 if(format==='mutable-document')return nativeText(resource);
 if(format==='codex-history-document')throw Error('History Document Save requires its enrolled History archive; current-resource encoding would discard history');
 if(format!=='legacy-block-tree')throw Error('No writer for the recognized Document format');
 const text=JSON.stringify(encodeDocument(resourceToRepository(resource)),null,2);
 const again=recognizeCompatibleDocument(new TextEncoder().encode(text)).resource;
 if(semanticNative(resource)!==semanticNative(again))throw Error('Legacy codec cannot preserve this authored generation; source unchanged');
 return text;
}
function semanticNative(resource:ReturnType<typeof decodeNative>){
 const value=JSON.parse(nativeText(resource));
 // Legacy trees do not serialize placement identities. Never remove authored property fields.
 delete value.document.root.placementId;
 for(const block of value.document.blocks){for(const edge of block.children??[])delete edge.placementId;for(const edge of Object.values(block.relations?.owned??{}) as any[])delete edge.placementId;}
 return JSON.stringify(value);
}
/** Identity assertions for uniqueness verification; this grants no admission/Save capability. */
export function documentIdentities(bytes:Uint8Array):string[]{
 let text:string;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{return [];}// Supported Document codecs require UTF-8 JSON; binary media is not a candidate.
 // Prose/export wrappers containing quoted JSON are not a supported whole-file Document.
 if(!/^[\s]*[\[{]/.test(text))return [];
 let value:any;
 try{value=JSON.parse(text);}catch{if(/"(?:type|format)"\s*:\s*"(?:document-block|main-list-block|mutable-document|codex-history-document)"/.test(text))throw Error('Uninspectable Document candidate');return [];}
 if(value?.format==='mutable-document')return [decodeNative(bytes).resourceId];
 let state:RepositoryState;
 if(value?.format==='codex-history-document')state=decodeHistoryDocument(value).state;
 else {if(!['main-list-block','document-block'].includes(value?.type))return [];state=decodeBlockTree(value).state;}
 validateRepository(state);
 return Object.values(state.contents).filter(c=>c.viewType==='document-block').map(c=>{const id=(c.payload.metadata as any)?.documentId??c.payload.id;if(id===undefined||id===null)return undefined;if(typeof id!=='string'||!id.trim())throw Error('Invalid authored Document identity');return id;}).filter((id):id is string=>id!==undefined);
}
