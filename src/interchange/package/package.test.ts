// @vitest-environment jsdom
import {expect,it} from 'vitest';
import {zipSync} from 'fflate';
import {decodeBlockTree} from '../../block-tree/codecs';
import {captureNative,nativeBytes,nativeText,decodeNative} from '../../persistence/native-resource';
import {createPackage,openPackage} from './format';
import {packageFragment,materializePackage} from './native';
import {bytes,packZip,unpackZip,hash} from './archive';
import {PackageDataReader,type PackageData} from './data';
import {contentRecord} from '../materialize';
import {resourceToRepository} from '../../history/durable-core';
import {exportFragment} from '../export-plan';
import {portableProjection} from './projection';
const context=()=>({data:{kind:'mutable-package-data',version:1,readOnly:true,encoding:'sqlite-storage-class-v1',tables:[{name:'Entity',classification:'canonical',columns:['id','guid','name','attributes'],rows:[[['integer','9007199254740993'],['text','entity'],['text','Abbey'],['text',' { "raw": true } ']]]}],provenance:{},selection:{},unresolved:[{reason:'missing'}],excluded:[{reason:'evidence excluded'}]} as PackageData,schema:{kind:'mutable-knowledge-schema',version:1,tables:[{name:'Entity',columns:['id','guid','name','attributes'].map(name=>({name}))}]}});
function fixture(){const state=decodeBlockTree({id:'doc',type:'document-block',metadata:{documentId:'doc'},linkedAnnotations:{shared:{id:'shared',type:'style/bold'},unused:{id:'unused',type:'style/italics'}},children:[{id:'text',type:'standoff-editor-block',text:'Abbey',standoffProperties:[{id:'entity-prop',type:'codex/entity-reference',value:'entity',start:0,end:4},{id:'shared-prop',type:'style/bold',annotationId:'shared',start:0,end:1},{id:'point',type:'style/bold',isZeroWidth:true,affinity:'before',start:3,end:3},{id:'internal',type:'codex/block-reference',value:'retained',start:2,end:3}]}]}).state;
 const root=state.placements[state.rootPlacementKey].contentKey;state.contents['retained-key']={...contentRecord('retained-key','plain-text-block',{id:'retained',type:'plain-text-block',text:'Unplaced retained text'}),definitionOwnerKey:root};return captureNative(state,'doc');}
it('archives exact native data, retained definitions, original identities and lossless contextual rows',async()=>{
 const snapshot=fixture(),before=nativeText(snapshot),c=context(),zip=await createPackage(nativeBytes(snapshot),{resourceId:'doc',cavernId:'origin'},c.data,c.schema,[]),loaded=await openPackage(zip);
 expect(nativeText(loaded.snapshot)).toBe(before);expect(nativeText(snapshot)).toBe(before);expect(loaded.inventory.entities).toEqual(['entity']);expect(loaded.inventory.points).toBe(1);
 expect(new PackageDataReader(loaded.data).entity('entity').entity?.attributes).toBe(' { "raw": true } ');expect(new PackageDataReader(loaded.data).entity('absent').entity).toBeUndefined();
 const fragment=packageFragment(loaded.snapshot,'origin');expect(fragment.blocks).toHaveLength(3);expect(fragment.definitions).toHaveLength(2);
 const one=materializePackage(fragment,'destination',[],{...c,source:loaded.manifest.source}),two=materializePackage(fragment,'destination',[],{...c,source:loaded.manifest.source});
 const root=one.state.contents[one.state.placements[one.roots[0]].contentKey],root2=two.state.contents[two.state.placements[two.roots[0]].contentKey];expect(root.payload.id).not.toBe('doc');expect(root.payload.id).not.toBe(root2.payload.id);
 expect(one.roots).toHaveLength(1);expect(root.children).toHaveLength(1);expect(Object.values(one.state.contents).filter(c=>c.definitionOwnerKey===root.key&&c.key!==root.key)).toHaveLength(2);
 const text=Object.values(one.state.contents).find(c=>c.viewType==='standoff-editor-block')!,props=text.payload.standoffProperties as any[];
 expect(props.find(p=>p.original?.type==='codex/entity-reference')?.type).toBe('mutable/opaque-property');expect(props.find(p=>p.original?.type==='codex/entity-reference')?.original.target.source.cavernId).toBe('origin');expect(props.find(p=>p.isZeroWidth)?.affinity).toBe('before');
 const retained=Object.values(one.state.contents).find(c=>c.payload.text==='Unplaced retained text')!;expect(props.find(p=>p.type==='codex/block-reference')?.value).toBe(retained.payload.id);
 expect(Object.keys(root.payload.linkedAnnotations as object)).toHaveLength(2);expect(props.every(p=>!['entity-prop','shared-prop','point','internal'].includes(p.id))).toBe(true);
 const reopened=decodeNative(nativeBytes(captureNative(one.state,String(root.payload.id))));expect(Object.values(reopened.contents).some(c=>c.viewType==='mutable/package-data-block')).toBe(true);
 const html=exportFragment(fragment,'html','Document',false,{entities:true,rootOnly:true}).text;expect(html).toContain('data-ink-entity="entity"');expect(html).toContain('data-ink-point');expect(html).not.toContain('Unplaced retained text');
});
it('preserves reference cycles and reference-only retained ownership without activating external content',()=>{
 const snapshot=structuredClone(fixture()),root=snapshot.placements[snapshot.rootPlacementKey];if(root.target.kind!=='local')throw Error();const doc=snapshot.contents[root.target.contentKey],text=snapshot.placements[doc.children[0]];if(text.target.kind!=='local')throw Error();snapshot.contents[text.target.contentKey].definitionOwnerKey=doc.key;text.kind='reference';const c=snapshot.contents[text.target.contentKey];c.children.push('cycle');snapshot.placements.cycle={key:'cycle',placementId:'cycle-edge',kind:'reference',target:{kind:'local',contentKey:c.key}};
 const f=packageFragment(snapshot),n=materializePackage(f,'target',[],{...context(),source:{}}),r=n.state.contents[n.state.placements[n.roots[0]].contentKey];expect(()=>captureNative(n.state,String(r.payload.id))).not.toThrow();
});
it('rejects malformed containers, member mismatches, hash substitutions, bombs and unknown versions',async()=>{
 for(const name of ['../bad','/bad','C:/bad','a\\b','a/%2e%2e/b'])expect(()=>unpackZip(zipSync({[name]:bytes('x')}))).toThrow();
 expect(()=>unpackZip(zipSync({'A.txt':bytes('a'),'a.txt':bytes('b')}))).toThrow(/Duplicate/);
 expect(()=>unpackZip(zipSync({'bomb':new Uint8Array(1024*1024)},{level:9}))).toThrow(/expansion/);
 const archive=await createPackage(nativeBytes(fixture()),{resourceId:'doc'},context().data,context().schema,[]),m=unpackZip(archive),manifest=JSON.parse(new TextDecoder().decode(m.get('manifest.json')));manifest.version=9;m.set('manifest.json',bytes(JSON.stringify(manifest)));await expect(openPackage(packZip(Object.fromEntries(m)))).rejects.toThrow(/Unsupported/);
 manifest.version=1;manifest.members[0].sha256='0'.repeat(64);m.set('manifest.json',bytes(JSON.stringify(manifest)));await expect(openPackage(packZip(Object.fromEntries(m)))).rejects.toThrow(/hash/);
 const bad=archive.slice();bad[6]|=1;expect(()=>unpackZip(bad)).toThrow(/mismatch/);
});
it('exports verified original images in portable paths and standalone data URLs',async()=>{
 const f=packageFragment(fixture()),png=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2tV8AAAAASUVORK5CYII='),c=>c.charCodeAt(0)),ref={kind:'managed' as const,cavernId:'source',assetId:'sha256:'+await hash(png)};
 const text=f.blocks.find(b=>b.inline)!;text.inline!.atoms.push({kind:'embed',embed:'img'});f.embeds.push({localId:'img',type:'image-cell',data:{asset:ref,alt:'Original'}});
 const assets=[{reference:ref,mediaType:'image/png' as const,bytes:png}],result=await portableProjection(f,assets,'html'),members=unpackZip(result.bytes);expect([...members.keys()]).toContain(`assets/${ref.assetId.slice(7)}.png`);expect(new TextDecoder().decode(members.get('document.html'))).toContain(`<img src="assets/${ref.assetId.slice(7)}.png"`);
 expect(new TextDecoder().decode((await portableProjection(f,assets,'html',true)).bytes)).toContain('data:image/png;base64,');await expect(portableProjection(f,[],'html')).rejects.toThrow(/every inline image/);
});
it('keeps disconnected retained reference components and inactive authored presentation',()=>{
 const snapshot=structuredClone(fixture()),root=snapshot.placements[snapshot.rootPlacementKey];if(root.target.kind!=='local')throw Error();
 const c=snapshot.contents['retained-key'];c.payload.style={position:'fixed',color:'purple'};c.children=['self-ref'];snapshot.placements['self-ref']={key:'self-ref',placementId:'retained-self',kind:'reference',target:{kind:'local',contentKey:c.key}};
 const native=materializePackage(packageFragment(snapshot),'destination',[],{...context(),source:{}}),retained=Object.values(native.state.contents).find(c=>c.payload.text==='Unplaced retained text')!;
 expect(retained).toBeTruthy();expect(retained.payload.style).toBeUndefined();expect(retained.payload.packageInactivePresentation).toMatchObject({fields:{style:{position:'fixed',color:'purple'}}});expect(retained.children).toHaveLength(1);
});
it('rejects ambiguous roles, unlisted members, symlinks, actual-length mismatches and invalid SQL values',async()=>{
 const source=await createPackage(nativeBytes(fixture()),{resourceId:'doc'},context().data,context().schema,[]),members=unpackZip(source);
 const extra=new Map(members);extra.set('unexpected.js',bytes('alert(1)'));await expect(openPackage(packZip(Object.fromEntries(extra)))).rejects.toThrow(/manifest/);
 const manifest=JSON.parse(new TextDecoder().decode(members.get('manifest.json')));manifest.members[1].role='document';members.set('manifest.json',bytes(JSON.stringify(manifest)));await expect(openPackage(packZip(Object.fromEntries(members)))).rejects.toThrow(/role/);
 const symlink=packZip({'entry':bytes('x')}),view=new DataView(symlink.buffer),central=view.getUint32(symlink.length-6,true);view.setUint32(central+38,0xa0000000,true);expect(()=>unpackZip(symlink)).toThrow(/type/);
 const lengths=packZip({'entry':bytes('x')}),lv=new DataView(lengths.buffer),cd=lv.getUint32(lengths.length-6,true);lv.setUint32(22,0,true);lv.setUint32(cd+24,0,true);expect(()=>unpackZip(lengths)).toThrow(/Actual expanded/);
 const broken=context().data;broken.tables[0].rows[0][0]=['integer','9223372036854775808'];expect(()=>new PackageDataReader(broken)).toThrow(/SQL storage/);
});
it('rejects excessive raster dimensions and trailing or animated image bytes',async()=>{
 const {imageType}=await import('./format');const png=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2tV8AAAAASUVORK5CYII='),c=>c.charCodeAt(0));
 expect(imageType(png)).toBe('image/png');const {default:sharp}=await import('sharp');const realJpeg=await sharp({create:{width:3,height:2,channels:3,background:'#678'}}).jpeg().toBuffer();expect(imageType(new Uint8Array(realJpeg))).toBe('image/jpeg');const giant=png.slice();new DataView(giant.buffer).setUint32(16,20000);expect(()=>imageType(giant)).toThrow(/dimensions/);expect(()=>imageType(new Uint8Array([...png,0]))).toThrow(/trailing/);
 const jpeg=new Uint8Array([255,216,255,192,0,11,8,0xff,0xff,0xff,0xff,1,1,0x11,0,255,217]);expect(()=>imageType(jpeg)).toThrow(/dimensions/);
});
it('preserves rich native authored values as inert codec data through the JSON-only fragment boundary',()=>{
 const snapshot=structuredClone(fixture()),retained=snapshot.contents['retained-key'];retained.payload.custom={undefinedValue:undefined,number:NaN,negativeZero:-0};
 const source=nativeText(snapshot),f=packageFragment(snapshot),copy=materializePackage(f,'destination',[],{...context(),source:{}}),r=Object.values(copy.state.contents).find(c=>c.payload.text==='Unplaced retained text')!;
 expect(r.payload.custom).toEqual({undefinedValue:null,number:null,negativeZero:null});expect(r.payload.packageAuthoredSource).toMatchObject({version:1,valueEncoding:'codex-authored-value-v1'});expect(nativeText(snapshot)).toBe(source);
});
it('includes directly authored Time and Claim reference seeds and safe offline controls',async()=>{
 const snapshot=structuredClone(fixture()),c=Object.values(snapshot.contents).find(c=>c.viewType==='standoff-editor-block')!;(c.payload.standoffProperties as any[]).push({id:'time-ref',type:'codex/time-reference',value:'time-entity',start:0,end:1},{id:'claim-ref',type:'codex/claim-reference',value:'claim-guid',start:3,end:4});
 const {nativeInventory}=await import('./format');expect(nativeInventory(snapshot).entities).toContain('time-entity');expect(nativeInventory(snapshot).claims).toEqual(['claim-guid']);
 const html=exportFragment(packageFragment(snapshot),'html','',false,{entities:true}).text;expect(html).toContain('data-ink-claim="claim-guid"');expect(html).toContain('data-ink-entity="time-entity"');
});
