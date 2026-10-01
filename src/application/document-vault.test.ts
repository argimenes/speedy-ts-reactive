import { expect, it, vi } from 'vitest';
import { createDocumentVaults, vaultRoot } from './document-vault';
import type { NativeDocumentSession } from '../persistence/native-session';
const scan=(vault:string)=>({vault,folders:[],documents:[],markdown:[],diagnostics:[],operations:[],readOnly:false,complete:true});
it('shares a disposable root read model without permitting overlapping vaults; closing releases query work',async()=>{
 let resolve!:(v:any)=>void,signal:AbortSignal|undefined;
 const native={discoverVault:vi.fn(async(root:string,s?:AbortSignal)=>{signal=s;return scan(root);}),pendingVaultRelocations:()=>[]};
 const vaults=createDocumentVaults(native as unknown as NativeDocumentSession),one=await vaults.acquire('./vault/'),two=await vaults.acquire('vault');expect(two).toBe(one);expect(native.discoverVault).toHaveBeenCalledTimes(1);
 await expect(vaults.acquire('vault/nested')).rejects.toThrow('overlapping');one.release();
 native.discoverVault.mockImplementation((_root,s)=>{signal=s;return new Promise(r=>resolve=r);});const pending=two.refresh();two.release();expect(signal?.aborted).toBe(true);resolve(scan('vault'));await pending;
 native.discoverVault.mockImplementation(async r=>scan(r));const next=await vaults.acquire('vault/nested');expect(next.root).toBe('vault/nested');next.release();vaults.dispose();await expect(vaults.acquire('.')).rejects.toThrow('disposed');
});
it('does not admit an aborted discovery and confines client paths before any request',async()=>{
 const native={discoverVault:vi.fn(async(root:string)=>scan(root))};const vaults=createDocumentVaults(native as unknown as NativeDocumentSession),c=new AbortController();c.abort();await expect(vaults.acquire('vault',c.signal)).rejects.toMatchObject({name:'AbortError'});expect(native.discoverVault).not.toHaveBeenCalled();
 for(const value of ['/tmp','../vault','vault/../x','vault\\x'])expect(()=>vaultRoot(value)).toThrow();vaults.dispose();
});
it('publishes uncertainty on failed refresh and notifies closure without replacing known rows with absence',async()=>{
 const initial={...scan('vault'),documents:[{resourceId:'a',location:{folder:'vault',filename:'a.mutable.json'},state:'paired'}]};
 const native={discoverVault:vi.fn(async()=>initial)};const vaults=createDocumentVaults(native as unknown as NativeDocumentSession),lease=await vaults.acquire('vault'),listener=vi.fn();lease.subscribe(listener);
 native.discoverVault.mockRejectedValue(Error('worker cancelled'));await expect(lease.refresh()).rejects.toThrow();expect(lease.snapshot().complete).toBe(false);expect(lease.snapshot().documents).toEqual(initial.documents);expect(listener).toHaveBeenCalledTimes(1);lease.release();expect(listener).toHaveBeenCalledTimes(2);expect(lease.isAlive()).toBe(false);vaults.dispose();
});
