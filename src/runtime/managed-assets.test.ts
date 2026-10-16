// @vitest-environment jsdom
import {afterEach,it,expect,vi} from 'vitest';import {webcrypto} from 'node:crypto';import {ManagedAssets} from './managed-assets';
import {DirectCharacterCells} from '../rendering/direct-character-cells';
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();document.body.replaceChildren();});
it('shares verified runtime URLs across mounted consumers, releases them independently, and never mutates authored data',async()=>{
 vi.stubGlobal('crypto',webcrypto);const bytes=new TextEncoder().encode('original'),digest=[...new Uint8Array(await webcrypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
 const reference={kind:'managed' as const,cavernId:'c',assetId:`sha256:${digest}`};
 const fetch=vi.fn(async()=>({ok:true,blob:async()=>({type:'image/png',size:bytes.length,arrayBuffer:async()=>bytes.buffer})}));vi.stubGlobal('fetch',fetch);
 const create=vi.fn(()=> 'blob:verified'),revoke=vi.fn();vi.stubGlobal('URL',class extends URL {static createObjectURL=create;static revokeObjectURL=revoke;});
 const service=new ManagedAssets(()=>({cavernId:'c',session:'s'}),()=>true),a=document.createElement('img'),b=document.createElement('img');
 const releaseA=service.bind(a,reference),releaseB=service.bind(b,reference);await vi.waitFor(()=>expect(a.getAttribute('src')).toBe('blob:verified'));expect(b.getAttribute('src')).toBe('blob:verified');expect(fetch).toHaveBeenCalledTimes(1);
 releaseA();expect(revoke).not.toHaveBeenCalled();releaseB();expect(revoke).toHaveBeenCalledWith('blob:verified');service.dispose();expect(reference.assetId).toBe(`sha256:${digest}`);
});
it('never resolves foreign references and refuses stale responses after disposal',async()=>{
 const fetch=vi.fn();vi.stubGlobal('fetch',fetch);const service=new ManagedAssets(()=>({cavernId:'c',session:'s'}),()=>true),image=document.createElement('img');service.bind(image,{kind:'managed',cavernId:'foreign',assetId:'sha256:'+'a'.repeat(64)});expect(fetch).not.toHaveBeenCalled();service.dispose();service.bind(image,{kind:'managed',cavernId:'c',assetId:'sha256:'+'a'.repeat(64)});expect(fetch).not.toHaveBeenCalled();
});
it('does not rebind assets or overwrite runtime URLs when neighbouring characters change',()=>{
 const flow=document.createElement('div');document.body.append(flow);const release=vi.fn(),bind=vi.fn((image:HTMLImageElement)=>{image.src='blob:cached';return release;});
 const renderer=new DirectCharacterCells(flow,undefined,bind),asset={kind:'managed' as const,cavernId:'c',assetId:'sha256:'+'a'.repeat(64)},cell={key:'image',text:'',image:{asset,src:'',alt:'map',label:'map'}};
 renderer.update([cell]);renderer.update([cell,{key:'letter',text:'X'}]);expect(bind).toHaveBeenCalledTimes(1);expect(flow.querySelector('img')!.getAttribute('src')).toBe('blob:cached');renderer.update([{key:'letter',text:'X'}]);expect(release).toHaveBeenCalledTimes(1);renderer.dispose();expect(release).toHaveBeenCalledTimes(1);
});
