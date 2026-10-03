import {afterEach,expect,it,vi} from 'vitest';
import {sqliteIndexLifecycle} from './sqlite-index-lifecycle';
import {createDocumentVaults} from './document-vault';
afterEach(()=>vi.unstubAllGlobals());
it('shares one index lifecycle between vault Windows; last release disposes it',async()=>{
 const refresh=vi.fn(async()=>{}),dispose=vi.fn(),factory=vi.fn(()=>({refresh,dispose}));
 const native:any={establishVault:async()=>({}),discoverVault:async(vault:string)=>({vault,folders:[],documents:[],markdown:[],operations:[],diagnostics:[],readOnly:false,complete:true})};
 const vaults=createDocumentVaults(native,factory),a=await vaults.acquire('.'),b=await vaults.acquire('.');expect(factory).toHaveBeenCalledTimes(1);await a.refresh(true);expect(refresh).toHaveBeenLastCalledWith(true);a.release();expect(dispose).not.toHaveBeenCalled();b.release();expect(dispose).toHaveBeenCalledTimes(1);
});
it('late open completion releases its lease; SQL failure never blocks ordinary vault discovery',async()=>{
 let done!:(value:Response)=>void;const fetch=vi.fn((_url:any,_options?:any)=>new Promise<Response>(r=>done=r));vi.stubGlobal('fetch',fetch);
 const scope=sqliteIndexLifecycle('.',{version:1,opaqueTypes:[]}),open=scope.refresh();scope.dispose();
 fetch.mockResolvedValue(new Response(JSON.stringify({Success:true,Data:{released:true}})));done(new Response(JSON.stringify({Success:true,Data:{lease:'old',readOnly:false}})));await open;expect(fetch.mock.calls[1][0]).toContain('release');
 fetch.mockRejectedValue(Error('SQLite unavailable'));const other=sqliteIndexLifecycle('.',{version:1,opaqueTypes:[]});await other.refresh();expect((other.status() as any).coverage.complete).toBe(false);other.dispose();
});
it('ordinary vault reads do not wait for background SQL; explicit Refresh waits and notifies after it settles',async()=>{
 let finish!:()=>void;const held=new Promise<void>(r=>finish=r),refresh=vi.fn(()=>held);
 const native:any={establishVault:async()=>({}),discoverVault:async(vault:string)=>({vault,folders:[],documents:[],markdown:[],operations:[],diagnostics:[],readOnly:false,complete:true})};
 const vaults=createDocumentVaults(native,()=>({refresh,dispose(){}})),vault=await vaults.acquire('.'),changed=vi.fn();vault.subscribe(changed);
 await vault.refresh();expect(changed).not.toHaveBeenCalled();let done=false;const explicit=vault.refresh(true).then(()=>done=true);await new Promise(r=>setTimeout(r,0));expect(done).toBe(false);
 finish();await explicit;expect(changed).toHaveBeenCalled();vaults.dispose();
});
