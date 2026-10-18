// @vitest-environment node
import {it,expect} from 'vitest';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createApplicationServiceHost} from './host';
it('reads immutable text under explicit Vault authority without enabling PDF or knowledge services',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'structured-service-')),id='sha256:'+'a'.repeat(64);let reads=0;
 const host=createApplicationServiceHost({root,cavernId:'vault',nativeEnabled:true,structuredEnabled:true,assets:()=>({get:async(assetId:string,vault:string)=>{reads++;expect(assetId).toBe(id);expect(vault).toBe('vault');return {bytes:Buffer.from('original'),manifest:{mediaType:'text/plain'}};}}),knowledge:async()=>{throw Error('Knowledge must not be accessed');}});
 try{expect((await host.service.call('resources.original',{assetId:id})).bytes).toEqual(new TextEncoder().encode('original'));await expect(host.service.call('resources.original',{assetId:id,path:'/etc/passwd'} as any)).rejects.toThrow();await expect(host.service.call('pdf.read',{snapshotId:'test'})).rejects.toThrow(/disabled/);expect(reads).toBe(1);}finally{await host.close();await rm(root,{recursive:true,force:true});}
});
