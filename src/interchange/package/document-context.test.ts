// @vitest-environment jsdom
import {expect,it} from 'vitest';
import {decodeBlockTree} from '../../block-tree/codecs';
import {captureNative,nativeBytes,decodeNative} from '../../persistence/native-resource';
import {documentContextInventory,unavailableDocumentContext,withDocumentContext} from './document-context';
import {PackageDataReader} from './data';
it('retains the exact authored graph and reading order with independently readable frozen context',()=>{
 const state=decodeBlockTree({id:'doc',type:'document-block',children:[{id:'text',type:'standoff-editor-block',text:'-dino\r',standoffProperties:[{id:'mention',type:'codex/entity-reference',start:1,end:4,text:'dino',value:'dino'},{id:'reference',type:'codex/block-reference',start:1,end:4,value:'proposition'}]},{id:'hidden',type:'tab-block',metadata:{active:false},children:[{id:'notes',type:'standoff-editor-block',text:'hidden'}]}]}).state;
 const snapshot=captureNative(state,'doc'),before=nativeBytes(snapshot);
 const context=unavailableDocumentContext(snapshot,'offline');context.data.tables=[{name:'Entity',classification:'canonical',columns:['guid','name'],rows:[[['text','dino'],['text','Dino Buzzetti']]]}];
 const packed=withDocumentContext(snapshot,context,{resourceId:'doc'});
 expect(packed.placements).toEqual(snapshot.placements);
 for(const [key,value] of Object.entries(snapshot.contents))expect(packed.contents[key]).toEqual(value);
 expect(nativeBytes(snapshot)).toEqual(before);
 const reopened=decodeNative(nativeBytes(packed));
 const retained=Object.values(reopened.contents).find(c=>c.viewType==='mutable/package-data-block')!;
 expect(retained.definitionOwnerKey).toBeDefined();expect(Object.values(reopened.placements).some(p=>p.target.kind==='local'&&p.target.contentKey===retained.key)).toBe(false);
 expect(new PackageDataReader((retained.payload.packageContext as any).data).entity('dino').entity?.name).toBe('Dino Buzzetti');
 expect(documentContextInventory(snapshot).blockReferences).toEqual(['proposition']);
 expect(Object.values(reopened.contents).find(c=>c.payload.id==='text')?.payload.standoffProperties[0].text).toBe('dino');
});
it('lists new dependencies absent from frozen context rather than pretending they were resolved',async()=>{
 const {withFrozenDocumentContext}=await import('./document-context');
 const snapshot=captureNative(decodeBlockTree({id:'doc',type:'document-block',children:[{id:'text',type:'standoff-editor-block',text:'New',standoffProperties:[{id:'a',type:'codex/entity-reference',value:'new-entity',start:0,end:2}]}]}).state,'doc');
 const context=unavailableDocumentContext(snapshot,'offline');context.data.unresolved=[];
 const packed=withDocumentContext(snapshot,context,{resourceId:'origin'}),frozen=withFrozenDocumentContext(packed);
 const data=(Object.values(frozen.contents).find(c=>c.viewType==='mutable/package-data-block')!.payload.packageContext as any).data;
 expect(data.unresolved).toContainEqual(expect.objectContaining({table:'Entity',value:'new-entity'}));
 expect((Object.values(packed.contents).find(c=>c.viewType==='mutable/package-data-block')!.payload.packageContext as any).data.unresolved).toEqual([]);
});
