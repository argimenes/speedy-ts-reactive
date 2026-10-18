import {emptyFragment,validateFragment} from '../interchange/fragment';
import {materializeFragment} from '../interchange/materialize';
import {PDF_BLOCK,type PdfCapture} from './model';
export function pdfBlock(snapshot:PdfCapture,sourceUrl=snapshot.sourceUrl){
 const f=emptyFragment(),data=JSON.parse(JSON.stringify({pdf:snapshot,sourceUrl}));f.blocks.push({localId:'pdf',type:PDF_BLOCK,data,children:[],relations:{},blockProperties:[]});f.placements.push({localId:'placement',kind:'owned',target:{kind:'local',object:'block',id:'pdf'}});f.roots.push({placement:'placement',openStart:false,openEnd:false,clippedStart:false,clippedEnd:false});
 const fragment=validateFragment(f),native=materializeFragment(fragment),root=native.state.contents[native.state.placements[native.roots[0]].contentKey];root.viewType=PDF_BLOCK;root.payload={...data,id:root.payload.id,type:PDF_BLOCK,blockProperties:[{id:crypto.randomUUID(),type:'codex/entity-reference',value:snapshot.entityId,metadata:{entityName:snapshot.inspection.label,sourceSnapshotId:snapshot.snapshotId}}]};return {fragment,native};
}
