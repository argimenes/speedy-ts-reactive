// @vitest-environment jsdom
import {it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {ReactiveEditor} from '../reactive-editor/editor';
import {projectSaved} from '../knowledge-sqlite/saved-projection';
import {captureNative,nativeEnvelope,decodeNative} from '../persistence/native-resource';
it('retains spatial identity, ownership, coordinates and provenance in native JSON and saved BlockProperty index',async()=>{
 const owner=randomUUID(),doc=randomUUID(),snapshotId=randomUUID();const first={id:randomUUID(),type:'mutable/resource-annotation',value:'first',metadata:{origin:'authored',createdAt:'2026-10-18T00:00:00Z'},anchor:{version:1,kind:'iiif-canvas',coordinateVersion:1,manifestId:'https://a/manifest',canvasId:'https://a/canvas',snapshotId,canvasWidth:1000,canvasHeight:2000,region:{x:100,y:100,width:500,height:300}}},second={...first,id:randomUUID(),value:'second'};
 const editor=new ReactiveEditor({id:doc,type:'document-block',children:[{id:owner,type:'mutable/iiif-manifest-block',blockProperties:[first,second]}]});try{const encode=()=>new TextEncoder().encode(JSON.stringify(nativeEnvelope(captureNative(editor.repository.readState(),doc))));const original=encode(),saved=await projectSaved(original,randomUUID());const block=saved.blocks.find(b=>b.block.guid===owner);expect(block.block.coordinate).toBeNull();expect(block.properties).toHaveLength(2);expect(block.properties[0]).toMatchObject({authoredId:first.id,blockGuid:owner,typename:first.type});expect(JSON.parse(block.properties[0].attributes).anchor).toEqual(first.anchor);expect(block.segments).toHaveLength(0);expect(decodeNative(original)).toBeTruthy();
 const projection=editor.createView('test'),node=Object.values(projection.state.nodes).find(n=>n.payload.id===owner)!;editor.commands.setPayloadField(node.key,'blockProperties',[second]);expect((await projectSaved(encode(),randomUUID())).blocks.find(b=>b.block.guid===owner).properties[0].authoredId).toBe(second.id);editor.repository.undo();expect(encode()).toEqual(original);editor.repository.redo();expect(editor.encodeDocument().children![0].blockProperties).toHaveLength(1);
 }finally{editor.dispose();}
});
