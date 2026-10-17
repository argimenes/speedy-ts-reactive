// @vitest-environment jsdom
import {it,expect} from 'vitest';
import {decodeBlockTree} from '../block-tree/codecs';
import {captureNative,nativeText} from '../persistence/native-resource';
import {sourcePayload} from '../interchange/source-block';
import {publicProjection} from './projection';
const profile={title:'Directory',route:'index.html',images:false,outboundLinks:false,includeMargins:false};
function native(id:string,text='Reading',properties:any[]=[],extra:any[]=[]){const state=decodeBlockTree({id,type:'document-block',metadata:{documentId:id,private:'PRIVATE_METADATA_CANARY'},children:[{id:id+'-text',type:'standoff-editor-block',text,standoffProperties:properties},...extra]}).state;return nativeText(captureNative(state,id));}
it('retains local Block anchors and exact source bindings, never activates unresolved wiki spelling',()=>{
 const doc=native('a','Local',[{id:'p',type:'codex/block-reference',value:'a-text',start:0,end:4}],[]),context={namespace:'site',route:'pages/a.html',home:'index.html',pages:[{resourceId:'a',title:'A',route:'pages/a.html'}]};
 const p=publicProjection(new TextEncoder().encode(doc),{...profile,route:context.route},'vault',context,id=>'b-'+Buffer.from(id).toString('hex'));expect(p.html).toMatch(/href="#b-/);expect(p.html).not.toContain('PRIVATE_METADATA_CANARY');
 const state=decodeBlockTree({id:'a',type:'document-block',metadata:{documentId:'a',collection:{bindings:[{id:'b',path:'b.md',image:false,url:'b',wiki:true}]}},children:[{id:'source',type:'mutable/markdown-source-block',...sourcePayload('markdown','[[b|Known]] [[missing]]')}]}).state;
 const source=nativeText(captureNative(state,'a')),q=publicProjection(new TextEncoder().encode(source),profile,'vault',{...context,pages:[...context.pages,{resourceId:'b',title:'B',route:'pages/b.html'}]},()=> 'anchor');
 expect(q.html).toContain('href="b.html"');expect(q.html).toContain('[[missing]]');expect(q.html).not.toContain('publication.invalid');
});
it('reports ambiguous source bindings and unresolved identities without fallback links',()=>{
 const state=decodeBlockTree({id:'a',type:'document-block',metadata:{documentId:'a',collection:{bindings:[{id:'b',path:'b.md',image:false,url:'target',wiki:true},{id:'c',path:'c.md',image:false,url:'target',wiki:true}]}},children:[{id:'source',type:'mutable/markdown-source-block',...sourcePayload('markdown','[[target|Ambiguous]]')},{id:'text',type:'standoff-editor-block',text:'Unknown',standoffProperties:[{id:'p',type:'codex/block-reference',value:'constructor',metadata:{documentId:'constructor'},start:0,end:6}]}]}).state;
 const p=publicProjection(new TextEncoder().encode(nativeText(captureNative(state,'a'))),profile,'vault',{namespace:'site',route:'pages/a.html',home:'index.html',pages:[{resourceId:'a',title:'A',route:'pages/a.html'},{resourceId:'b',title:'B',route:'pages/b.html'}]},id=>'b-'+Buffer.from(id).toString('hex'));
 expect(p.html).toContain('[[target|Ambiguous]]');expect(p.html).not.toContain('>Ambiguous</a>');expect(p.diagnostics.join(' ')).toMatch(/Ambiguous/);expect(p.diagnostics.join(' ')).toMatch(/existence is not checked/);
});
