import {decodeDocument} from '../../block-tree/codecs';
import {decodeNative} from '../../persistence/native-resource';
import {resourceToRepository} from '../../history/durable-core';
import {CanonicalRepository} from '../../block-tree/repository';import type {RepositoryOptions} from '../../block-tree/commit-capture';
import {fixtureText} from './fixture';import type {LiveScope} from './live-adapter';
export function liveState(count=1,first?:Uint8Array){
 const state=decodeDocument({id:'workspace',type:'workspace-block',children:[{id:'bank',type:'workspace-object-bank-block',children:[]}]}).state;
 const bank=Object.values(state.contents).find(c=>c.payload.id==='bank')!,ids:string[]=[];
 for(let i=0;i<count;i++){
  const resource=decodeNative(i===0&&first?first:new TextEncoder().encode(fixtureText(i,count))),r=resourceToRepository(resource);ids.push(resource.resourceId);
  Object.assign(state.contents,r.contents);Object.assign(state.placements,r.placements);
  const p=state.placements[r.rootPlacementKey];p.kind='reference';p.resourceRegistration=true;bank.children.push(p.key);
 }
 return {state,ids};
}
export function liveFixture(count=1,first?:Uint8Array,options:RepositoryOptions={}){
 const {state,ids}=liveState(count,first);
 const repository=new CanonicalRepository(state,options),documents=ids.map(resourceId=>({resourceId,title:resourceId,state:'paired',location:{folder:'vault',filename:resourceId+'.mutable.json'}}));
 let signature='scope-0',pending=false;
 const scope:LiveScope={root:'vault',snapshot:()=>({vault:'vault',folders:[],documents,markdown:[],other:[],diagnostics:[],operations:[],readOnly:false,complete:true}),signature:()=>signature,binding:id=>documents.find(d=>d.resourceId===id)?.location,pending:()=>pending,opaque:()=>false};
 return {repository,scope,id:ids[0],documents,setPending(v:boolean){pending=v;signature+='p';},changeSignature(){signature+='x';}};
}
