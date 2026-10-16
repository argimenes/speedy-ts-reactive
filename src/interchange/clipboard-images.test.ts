import {describe,it,expect,vi} from 'vitest';
import {imagesFragment,resolveClipboardImages} from './clipboard-images';
import {importClipboard} from './transport';import {materializeFragment} from './materialize';import {assetKey} from './managed-asset';
import {ReactiveEditor} from '../reactive-editor/editor';import {captureNative,decodeNative,nativeEnvelope} from '../persistence/native-resource';
const ref={kind:'managed' as const,cavernId:'c',assetId:'sha256:'+'a'.repeat(64)};
const manifest={...ref,width:3,height:2,byteLength:10,mediaType:'image/png'};
const file=(name='map.png')=>({blob:new Blob(['original']),name});
function host(){const calls:string[]=[];const assets={begin:vi.fn(async()=>({id:'op',token:'token',cavernId:'c'})),stage:vi.fn(async()=>{calls.push('stage');return manifest;}),remote:vi.fn(async()=>{calls.push('remote');return manifest;}),verify:vi.fn(async()=>manifest),action:vi.fn(async(_l,a)=>{calls.push(a);})};return {assets:assets as any,calls};}
const run=(fragment:any,files:any[],h=host(),choose=vi.fn(async()=>[] as string[]),valid=()=>true)=>resolveClipboardImages({fragment,files,assets:h.assets,cavernId:'c',signal:new AbortController().signal,valid,choose,lease:()=>{}});
describe('managed clipboard image preparation',()=>{
 it('preserves file order and publishes before allocating fresh image objects',async()=>{
  const files=[file('one'),file('two')],h=host(),result=await run(imagesFragment(files),files,h);
  expect(h.calls).toEqual(['stage','renew','stage','publish']);expect(result.fragment.embeds.map(e=>e.data.alt)).toEqual(['one','two']);
  const a=materializeFragment(result.fragment,{cavernId:'c'},new Map(result.admitted)),b=materializeFragment(result.fragment,{cavernId:'c'},new Map(result.admitted));
  const image=(m:any)=>Object.values(m.state.contents).filter((c:any)=>c.viewType==='image-cell') as any[];
  expect(image(a)[0].payload.asset).toEqual(ref);expect(image(a)[0].key).not.toBe(image(b)[0].key);expect(image(a)[0].payload.id).not.toBe(image(b)[0].payload.id);
 });
 it('matches explicit content IDs without duplicating HTML image positions',async()=>{
  const f=importClipboard({'text/html':'<p>A<img src="cid:map.png" alt="map">B</p>'}).fragment!,h=host(),r=await run(f,[file()],h);
  expect(h.assets.stage).toHaveBeenCalledTimes(1);expect(r.fragment.blocks[0].inline!.atoms.map(a=>a.kind==='text'?a.text:'IMAGE').join('')).toBe('AIMAGEB');expect(r.fragment.embeds).toHaveLength(1);
 });
 it('does not guess the placement of unmatched or ambiguous files',async()=>{
  const f=importClipboard({'text/html':'<p>A<img src="cid:map.png">B</p>'}).fragment!,h=host();const r=await run(f,[file(),file()],h);
  expect(h.assets.stage).not.toHaveBeenCalled();expect(r.notice).toContain('Unmatched');
 });
 it('keeps remote placeholders without consent and fetches only explicitly selected URLs',async()=>{
  const f=importClipboard({'text/html':'<img src="https://example.com/a"><img src="https://example.com/b">'}).fragment!,h=host();await run(f,[],h);expect(h.assets.begin).not.toHaveBeenCalled();
  await run(f,[],h,vi.fn(async()=>['https://example.com/b']));expect(h.assets.begin).toHaveBeenCalledWith(['https://example.com/b'],expect.any(AbortSignal));expect(h.assets.remote).toHaveBeenCalledTimes(1);
 });
 it('cancels a changed destination before any acquisition',async()=>{
  const f=imagesFragment([file()]),h=host();await expect(run(f,[file()],h,undefined,()=>false)).rejects.toThrow('Destination changed');expect(h.assets.stage).not.toHaveBeenCalled();
 });
 it('verifies same-Cavern references and never probes another Cavern',async()=>{
  const f=imagesFragment([file()]);f.embeds[0].data.asset=ref;const h=host();const r=await run(f,[],h);expect(h.assets.verify).toHaveBeenCalledWith(ref,expect.any(AbortSignal));expect(r.admitted).toEqual([[assetKey(ref),ref.assetId]]);
  f.embeds[0].data.asset={...ref,cavernId:'foreign'};h.assets.verify.mockClear();const foreign=await run(f,[],h);expect(h.assets.verify).not.toHaveBeenCalled();expect(foreign.admitted).toEqual([]);
 });
 it('verifies shared originals once per import and bounds native image batches before network work',async()=>{
  const f=imagesFragment([file(),file()]);f.embeds.forEach(e=>{e.data.asset=ref;});const h=host();
  await run(f,[],h);expect(h.assets.verify).toHaveBeenCalledTimes(1);
  const oversized=imagesFragment(Array.from({length:21},()=>file()));h.assets.verify.mockClear();
  await expect(run(oversized,[],h)).rejects.toThrow('Too many');expect(h.assets.begin).not.toHaveBeenCalled();expect(h.assets.verify).not.toHaveBeenCalled();
 });
 it('does not trust a managed descriptor without server admission',()=>{
  const f=imagesFragment([file()]);f.embeds[0].data.asset=ref;const m=materializeFragment(f,{cavernId:'c'});expect(Object.values(m.state.contents).find(c=>c.viewType==='image-cell')!.payload.status).toBe('failed');
 });
 it('never reactivates opaque authored images even when another image admits the same asset',async()=>{
  const f=imagesFragment([file(),file()]);f.embeds.forEach(e=>{e.data.asset=ref;});f.embeds[1].data.original={type:'future/image',data:{asset:ref}};
  const h=host(),r=await run(f,[],h);expect(h.assets.verify).toHaveBeenCalledTimes(1);
  const m=materializeFragment(r.fragment,{cavernId:'c'},new Map(r.admitted));
  const images=Object.values(m.state.contents).filter(c=>c.viewType==='image-cell');
  expect(images.map(i=>i.payload.status)).toEqual(['ready','failed']);expect(images[1].payload.original).toEqual(f.embeds[1].data.original);
 });
 it('round-trips portable image references through native save bytes without runtime URLs',async()=>{
  const r=await run(imagesFragment([file()]),[file()]),m=materializeFragment(r.fragment,{cavernId:'c'},new Map(r.admitted));
  const editor=new ReactiveEditor({id:'doc',type:'document-block',children:[]});try{
   const view=editor.createView('image-save');editor.commands.insertFragment(m,{kind:'at',parentKey:view.state.rootKey,index:0});
   const resource=captureNative(editor.repository.readState(),'doc'),bytes=new TextEncoder().encode(JSON.stringify(nativeEnvelope(resource))),reopened=decodeNative(bytes);
   expect(JSON.stringify(reopened)).toContain(ref.assetId);expect(JSON.stringify(reopened)).not.toContain('blob:');
   editor.repository.undo();expect(Object.values(editor.repository.readState().contents).some(c=>c.viewType==='image-cell')).toBe(false);
   editor.repository.redo();expect(Object.values(editor.repository.readState().contents).find(c=>c.viewType==='image-cell')!.payload.asset).toEqual(ref);
  }finally{editor.dispose();}
 });
});
