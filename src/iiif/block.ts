import {emptyFragment,validateFragment} from '../interchange/fragment';
import {materializeFragment} from '../interchange/materialize';
import {IIIF_MANIFEST,IIIF_IMAGE,type Capture} from './model';
/** Native occurrence refers to an immutable original; no tile bytes or viewport state. */
export function iiifBlock(snapshot:Capture,sourceUrl=snapshot.sourceUrl){
 const type=snapshot.kind==='iiif-manifest'?IIIF_MANIFEST:IIIF_IMAGE;
 const data=JSON.parse(JSON.stringify({iiif:snapshot,sourceUrl}));
 const properties=[{id:crypto.randomUUID(),type:'codex/entity-reference',value:snapshot.entityId,metadata:{entityName:snapshot.label,sourceSnapshotId:snapshot.snapshotId}}];
 const f=emptyFragment();f.blocks.push({localId:'iiif',type,data,blockProperties:[],children:[],relations:{}});
 f.placements.push({localId:'placement',kind:'owned',target:{kind:'local',object:'block',id:'iiif'}});f.roots.push({placement:'placement',openStart:false,openEnd:false,clippedStart:false,clippedEnd:false});
 const fragment=validateFragment(f),native=materializeFragment(fragment),root=native.state.contents[native.state.placements[native.roots[0]].contentKey];root.viewType=type;root.payload={...data,id:root.payload.id,type,blockProperties:properties};return {fragment,native};
}
