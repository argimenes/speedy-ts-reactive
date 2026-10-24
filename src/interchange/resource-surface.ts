import { prepareNewBlockIdentities } from '../block-tree/identity';
import { decodeBlockTree } from '../block-tree/codecs';
import { clone } from '../block-tree/clone';
import type { BlockFragment } from '../block-tree/clipboard';
export const resourceTypes = new Set(['mutable/markdown-source-block','mutable/html-source-block','mutable/video-block','youtube-player-block','vimeo-player-block','youtube-video-block','image-block','iframe-block','pdf-block','mutable/pdf-document-block','mutable/iiif-manifest-block','mutable/iiif-image-block','mutable/web-article-block','mutable/citation-block','mutable/web-resource-block','mutable/academic-resource-block','mutable/structured-resource-block']);
/** Wrap newly acquired roots before their single insertion commit. No live-tree scan. */
export function resourceSurface(input:BlockFragment):BlockFragment {
 const native=clone(input);
 native.roots=native.roots.map(root=>{
  const resource=native.state.contents[native.state.placements[root].contentKey];
  if(!resourceTypes.has(resource.viewType))return root;
  const wrapper=decodeBlockTree({type:'surface-block',metadata:{reversible:true},children:[{type:'side-block',metadata:{surfaceRole:'front'},children:[]},{type:'side-block',metadata:{surfaceRole:'back'},children:[{type:'container-block',metadata:{structuralContainer:true},children:[resourceInformation(resource.payload),...resourceNotes(resource.payload,resource.viewType),{type:'standoff-editor-block',text:''}]}]}]});
  prepareNewBlockIdentities(Object.values(wrapper.state.contents));
  const key=wrapper.state.rootPlacementKey,s=wrapper.state.contents[wrapper.state.placements[key].contentKey],front=wrapper.state.contents[wrapper.state.placements[s.children[0]].contentKey];front.children=[root];
  Object.assign(native.state.contents,wrapper.state.contents);Object.assign(native.state.placements,wrapper.state.placements);return key;
 });
 native.state.rootPlacementKey=native.roots[0];return native;
}

/** Editable initial text is a one-time derivative, never a second canonical record. */
export function resourceNotes(payload:Record<string,any>,type:string) {
 const record=payload.pdf??payload.article??payload.web??payload.academic??payload.citation??{};
 const metadata=record.metadata??record.projection??payload.video??payload.metadata??{};
 const fields:[string,unknown][]=[['Source',payload.sourceUrl??record.sourceUrl??record.source??payload.metadata?.url],['Type',type],['Title',metadata.title??payload.title],['Author / channel',metadata.author??metadata.channel],['Published',metadata.publicationDate??metadata.published],['Description',metadata.description],['Resource ID',payload.video?.id],['Duration',metadata.duration]];
 return fields.filter(([,v])=>typeof v==='string'||typeof v==='number').map(([label,value])=>({type:'standoff-editor-block',text:`${label}: ${value}`}));
}

export function resourceInformation(payload:Record<string,any>) {
 return {type:'resource-information-block',blockProperties:typeof payload.id==='string'?[{id:crypto.randomUUID(),type:'codex/block-reference',value:payload.id}]:[]};
}
