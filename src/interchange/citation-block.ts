import {emptyFragment,validateFragment} from './fragment';
import {materializeFragment} from './materialize';
import {citationData,type ScholarlyCitation} from './scholarly';
export const CITATION_BLOCK='mutable/citation-block';
export function citationBlock(citation:ScholarlyCitation,sourceUrl:string){
 if(!citationData(citation)||sourceUrl.length>4096)throw Error('Invalid citation');
 const data=JSON.parse(JSON.stringify({citation,sourceUrl}));
 const properties=[{id:crypto.randomUUID(),type:'codex/entity-reference',value:citation.entityId,metadata:{entityName:citation.metadata.title,sourceSnapshotId:citation.snapshotId}}];
 const fragment=emptyFragment();
 fragment.blocks.push({localId:'citation',type:CITATION_BLOCK,data,blockProperties:properties.map(p=>({localId:p.id,type:p.type,attributes:{metadata:p.metadata},target:{kind:'external' as const,object:'entity' as const,id:p.value,source:{cavernId:citation.asset.cavernId}}})),children:[],relations:{}});
 fragment.placements.push({localId:'citation-placement',kind:'owned',target:{kind:'local',object:'block',id:'citation'}});
 fragment.roots.push({placement:'citation-placement',openStart:false,openEnd:false,clippedStart:false,clippedEnd:false});
 const checked=validateFragment(fragment),native=materializeFragment(checked),root=native.state.contents[native.state.placements[native.roots[0]].contentKey];
 // Only trusted host results are activated here; arbitrary pasted carriers remain inert.
 root.viewType=CITATION_BLOCK;root.payload={...data,id:root.payload.id,type:CITATION_BLOCK,blockProperties:properties};
 return {fragment:checked,native};
}
