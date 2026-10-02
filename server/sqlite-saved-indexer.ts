/** Explicit P2 host operation. No application consumer, save authority, watcher or admission. */
import path from 'node:path';
import { createHash } from 'node:crypto';
import { NativeVaultStore } from './native-vault-store.mjs';
export { NativeVaultStore };
export { ManagedPair } from '../src/persistence/managed-pair.mjs';
const hash=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const filename=(l:any)=>path.posix.join(l.folder,l.filename);

export function createSavedIndexer(client:any,{root,vault='.',store=new NativeVaultStore({root}),policy,checkpoint=async()=>{}}:{root:string;vault?:string;store?:any;policy?:any;checkpoint?:(phase:string,details?:any)=>Promise<void>}) {
  let running=false;
  return {
    /** An explicit Refresh/reconciliation; SQL does not enroll resources or alter their binding. */
    async refresh({mode='incremental',signal}:{mode?:'full'|'incremental';signal?:AbortSignal}={}) {
      if(running)throw Error('Saved indexing refresh already active');running=true;
      const started=performance.now(),timings={discoveryMs:0,inspectionMs:0,stageMs:0,publicationMs:0,totalMs:0};
      try {return await store.lock(async()=>{
        signal?.throwIfAborted();
        const identity=await client.inspect();
        if(identity.readOnly||store.readOnly)throw Error('SQLite saved indexing is read-only');
        if(identity.root!==await store.resolve(vault))throw Error('SQLite vault and managed scope differ');
        const vaultGuid=identity.mutable.vaultGuid;let initialFence:string;
        try{initialFence=await store.readScopeFence(vault,signal);}catch(e:any){signal?.throwIfAborted();await client.indexIssue(vault,e.message);return {complete:false,issues:[{path:vault,message:e.message}],reconciled:[],removed:[]};}
        const discoveryStart=performance.now(),discovery=await store.discover(vault,{signal}),issues:any[]=[...discovery.diagnostics],candidates:any[]=[];
        timings.discoveryMs=performance.now()-discoveryStart;
        if(discovery.operations.some((r:any)=>r.phase==='pending'))issues.push({path:vault,message:'Relocation pending'});
        const native=new Map<string,any>(discovery.documents.map((d:any)=>[filename(d.location),d]));
        const paths=[...native.keys(),...discovery.other.filter((p:string)=>p.endsWith('.json'))].sort();
        for(const file of paths) {
          signal?.throwIfAborted();
          try {
            const n=native.get(file);
            if(n?.state==='pending'||n?.state==='ambiguous'||n&&!n.baseline)throw Error('Native pair evidence pending, ambiguous or unavailable');
            const inspectStart=performance.now(),stamp=await store.stamp(file),bytes=await store.read(file),inspection=await client.inspectSaved({bytes,vaultGuid,policy});
            timings.inspectionMs+=performance.now()-inspectStart;
            if(n&&inspection.format!=='mutable-document'||!n&&inspection.format==='mutable-document')throw Error('Native resource requires its supported native location');
            if(n&&(inspection.resourceId!==n.resourceId||inspection.contentHash!==n.baseline.nativeHash))throw Error('Native discovery evidence changed');
            if(await store.stamp(file)!==stamp||hash(await store.read(file))!==inspection.contentHash)throw Error('Resource changed during inspection');
            candidates.push({file,stamp,...inspection,native:n});
          }catch(e:any){issues.push({path:file,message:e.message});}
        }
        const resources=new Map<string,string>(),blocks=new Map<string,string>();
        for(const c of candidates){
          if(resources.has(c.resourceId))issues.push({path:c.file,message:`Duplicate Resource identity also at ${resources.get(c.resourceId)}`});
          resources.set(c.resourceId,c.file);
          for(const id of c.blockIds){if(blocks.has(id))issues.push({path:c.file,message:`Duplicate Block identity also at ${blocks.get(id)}`});blocks.set(id,c.file);}
        }
        if(await store.readScopeFence(vault,signal)!==initialFence)issues.push({path:vault,message:'Vault changed during discovery'});
        await checkpoint('discovered',{candidates});signal?.throwIfAborted();
        const old=await client.inventory();
        // An unreadable/unknown candidate could claim an existing identity. Fail closed globally.
        if(issues.length){for(const issue of issues)await client.indexIssue(issue.path??vault,issue.message);return {complete:false,issues,reconciled:[],removed:[]};}
        const reconciled:any[]=[],removed:string[]=[];
        const revalidate=async(c:any,fence:string)=>{
          signal?.throwIfAborted();
          if(await store.readScopeFence(vault,signal)!==fence||await store.stamp(c.file)!==c.stamp||hash(await store.read(c.file))!==c.contentHash)throw Error('Stale saved-resource evidence');
          if(c.native){const b=await store.baseline(c.file,c.resourceId);if(b.pending||JSON.stringify(b.baseline)!==JSON.stringify(c.native.baseline))throw Error('Pair or location evidence changed');}
        };
        for(const c of candidates){
          let staged:any;
          try {
            const previous=old.find((r:any)=>r.guid===c.resourceId);
            if(previous&&previous.path!==c.file&&c.native&&!c.native.baseline.locationRevision)throw Error('External native move needs explicit storage binding reconciliation');
            // A prior SQL write changes only reserved .mutable data, excluded from source fencing.
            await revalidate(c,initialFence);
            const bytes=await store.read(c.file);
            const evidence={path:c.file,contentHash:c.contentHash,fileSize:bytes.byteLength,
              saveGeneration:c.native&&c.native.state==='paired'?c.native.baseline.generation:null};
            const stageStart=performance.now();staged=await client.stageSaved({bytes,vaultGuid,policy,evidence,mode});timings.stageMs+=performance.now()-stageStart;
            await checkpoint('staged',{candidate:c,token:staged.token});
            await revalidate(c,initialFence);
            const publishStart=performance.now();reconciled.push({...await client.commitSaved(staged.token),extractionTimings:staged.timings});timings.publicationMs+=performance.now()-publishStart;
          }catch(e:any){if(staged)await client.discardSaved(staged.token);if(signal?.aborted)throw e;await client.indexIssue(c.file,e.message);return {complete:false,issues:[{path:c.file,message:e.message}],reconciled,removed};}
        }
        for(const prior of old)if(!resources.has(prior.guid)){
          try {
            signal?.throwIfAborted();const expected=await client.deletionBaseline(prior.guid);
            await checkpoint('deleting',{resourceId:prior.guid});
            if(await store.readScopeFence(vault,signal)!==initialFence||await store.read(prior.path,true)!==undefined)throw Error('Deletion lacks current positive absence evidence');
            signal?.throwIfAborted();await client.removeConfirmed(prior.guid,expected);removed.push(prior.guid);
          }catch(e:any){if(signal?.aborted)throw e;await client.indexIssue(prior.path,e.message);return {complete:false,issues:[{path:prior.path,message:e.message}],reconciled,removed};}
        }
        signal?.throwIfAborted();
        if(await store.readScopeFence(vault,signal)!==initialFence){const message='Vault changed before reconciliation completion';await client.indexIssue(vault,message);return {complete:false,issues:[{path:vault,message}],reconciled,removed};}
        await client.finishReconciliation();
        timings.totalMs=performance.now()-started;
        return {complete:true,issues:[],reconciled,removed,scopeFence:initialFence,timings};
      });}finally{running=false;}
    },
  };
}
