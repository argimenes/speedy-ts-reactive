import {emptyFragment,validateFragment} from './fragment';
import {materializeFragment} from './materialize';
import {WEB_ARTICLE,type ArticleCapture} from './encyclopedia';
export function webArticleBlock(capture:ArticleCapture,sourceUrl:string){
 const {snapshot,projection}=capture;
 if(snapshot.kind!=='article'||typeof projection.html!=='string'||sourceUrl.length>4096)throw Error('Invalid article capture');
 const properties=[snapshot.entityId,snapshot.subjectId].filter(Boolean).map(id=>({id:crypto.randomUUID(),type:'codex/entity-reference',value:id!,metadata:{entityName:id===snapshot.entityId?projection.title:snapshot.qid,sourceSnapshotId:snapshot.snapshotId}}));
 const data=JSON.parse(JSON.stringify({article:snapshot,text:projection.html,sourceUrl,metadata:{provenance:{kind:'wikipedia',snapshotId:snapshot.snapshotId,resourceId:snapshot.resourceId,entityId:snapshot.entityId,subjectId:snapshot.subjectId,revision:snapshot.revision,sourceUrl,permalink:projection.permalink,attribution:'Wikipedia contributors',license:'https://creativecommons.org/licenses/by-sa/4.0/'}},diagnostics:projection.diagnostics,links:projection.links}));
 const f=emptyFragment();f.blocks.push({localId:'article',type:WEB_ARTICLE,data,blockProperties:properties.map(p=>({localId:p.id,type:p.type,attributes:{metadata:p.metadata},target:{kind:'external',object:'entity',id:p.value,source:{cavernId:snapshot.assets[0].cavernId}}})),children:[],relations:{}});
 f.placements.push({localId:'placement',kind:'owned',target:{kind:'local',object:'block',id:'article'}});f.roots.push({placement:'placement',openStart:false,openEnd:false,clippedStart:false,clippedEnd:false});
 const fragment=validateFragment(f),native=materializeFragment(fragment),root=native.state.contents[native.state.placements[native.roots[0]].contentKey];root.viewType=WEB_ARTICLE;root.payload={...data,id:root.payload.id,type:WEB_ARTICLE,blockProperties:properties};return {fragment,native};
}
