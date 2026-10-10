import {isNativeDocumentName,nativeDocumentStem,isDerivedMarkdownName} from './document-file-names.mjs';
import { createSignal } from 'solid-js';
import type { ReactiveEditor } from '../reactive-editor/editor';
import type { DocumentLocation } from '../reactive-editor/persistence';
import { admitNative, captureNative, decodeNative, nativeText } from './native-resource';
import { admitMarkdown, type LinkTarget } from './markdown';
import { enrollPair, type PairGeneration, type PairResult, type ResourcePair } from './resource-pair';
import { markNativeBinding, ownNativeSession } from './native-bindings';
import { recognizeCompatibleDocument } from './compatible-document';
type Baseline = { nativeHash: string | null; markdownHash: string | null; generation: string | null; locationRevision?: string };
type Binding = { location: DocumentLocation; baseline: Baseline; pair: ResourcePair; pending?: PairGeneration; message: string; comparedHash?: string; busy: boolean; relocation?: string; relocationWork?: Promise<unknown>; members: Set<string> };
const sessions = new WeakMap<ReactiveEditor, NativeDocumentSession>();
export function nativeDocumentSession(editor: ReactiveEditor) {
  let service = sessions.get(editor); if (!service) sessions.set(editor, service = new NativeDocumentSession(editor)); return service;
}
async function request(action: string, body?: unknown, signal?: AbortSignal) {
  const response = await fetch(`/api/native/${action}`, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal } : { signal });
  const json = await response.json(); if (!response.ok || !json.Success) throw Object.assign(new Error(json.Error ?? 'Native store request failed'), {status:response.status,preflight:json.PublicationStarted===false}); return json.Data;
}
const sameLocation = (a: DocumentLocation, b: DocumentLocation) => a.folder === b.folder && a.filename === b.filename;
/** C1a storage capability; no Flint UI or authored vault membership. */
export interface VaultRelocation {
  operationId: string; vault: string; kind: 'pair' | 'directory'; source: string; destination: string;
  baselines: Array<{resourceId: string; baseline: Baseline}>;
  dependencies?: Array<{resourceId: string; location: DocumentLocation}>;
}
export class NativeDocumentSession {
  private bindings = new Map<string, Binding>();
  private compatibleSources = new Map<string,{location:DocumentLocation;byteHash:string;format:string;vault:string;canSave:boolean;message:string;dirty:boolean;busy:boolean;members:Set<string>;pending?:any}>();
  private changed = createSignal(0);
  // Tree observers must not rebuild for ordinary content/status changes.
  private storageChanged = createSignal(0);
  private disposed = false;private knowledgeEpoch=0;private opening=0;private knowledgeListeners=new Set<()=>void>();
  subscribeKnowledge(listener:()=>void){this.knowledgeListeners.add(listener);return ()=>{this.knowledgeListeners.delete(listener);};}
  private notifyKnowledge(){this.knowledgeEpoch++;for(const listener of this.knowledgeListeners)listener();}
  /** Read-only existing bindings, for scope coverage diagnostics. No capture or enrollment. */
  knowledgeBindings(){return Object.freeze([...this.bindings].map(([resourceId,b])=>Object.freeze({resourceId,location:Object.freeze({...b.location})})));}
  knowledgeEvidence(id:string){const b=this.bindings.get(id),s=this.compatibleSources.get(id);return Object.freeze({epoch:this.knowledgeEpoch,closed:this.disposed,admitting:this.opening>0,pending:!!(b?.busy||b?.pending||s?.busy||s?.pending||b?.relocation||this.relocations.size),location:b||s?Object.freeze({...((b??s)!.location)}):undefined,byteHash:b?.baseline.nativeHash??s?.byteHash});}
  private notice = '';
  private candidates = new Set<string>();
  private relocations = new Map<string, { request: VaultRelocation; work?: Promise<unknown>; bindings: Array<{ id: string; baseline: Baseline; location: DocumentLocation }> }>();
  constructor(private editor: ReactiveEditor) {
    const warn = (event: BeforeUnloadEvent) => { if (this.candidates.size || this.relocations.size || [...this.compatibleSources.values()].some(s=>s.dirty||s.pending) || [...this.bindings.values()].some(b => b.pending || b.relocation || b.pair.dirty)) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    const stop = editor.repository.subscribeChanges(change => {
      for (const [id,b] of this.bindings) {
        if (![...change.previousContents.keys(), ...(change.inlineOwner ? [change.inlineOwner] : [])].some(k => b.members.has(k))) continue;
        if (!b.pending && !b.busy) b.message = 'Document changed — Save required';
        if (!change.inlineOwner) { try { b.members = new Set(Object.keys(captureNative(editor.repository.snapshot(), id).contents)); } catch { b.message = 'Canonical source unavailable or ambiguous'; } }
      }
      for(const [id,s] of this.compatibleSources){if(![...change.previousContents.keys(),...(change.inlineOwner?[change.inlineOwner]:[])].some(k=>s.members.has(k)))continue;s.dirty=true;if(!change.inlineOwner){try{s.members=new Set(Object.keys(captureNative(editor.repository.snapshot(),id).contents));}catch{s.message="Canonical source unavailable or ambiguous";}}if(!s.busy&&!s.pending)s.message="Document changed — Save required";}
      this.touch();
    });
    ownNativeSession(editor.repository, () => { this.disposed = true;this.notifyKnowledge();this.knowledgeListeners.clear(); stop(); window.removeEventListener('beforeunload', warn); });
  }
  private touch() { this.changed[1](v => v + 1); }
  private touchStorage() { this.storageChanged[1](v => v + 1);this.notifyKnowledge(); }
  status(id?: string) { this.changed[0](); const b = id && this.bindings.get(id); return b ? b.message : id&&this.compatibleSources.has(id) ? this.compatibleSources.get(id)!.message : this.notice || 'Save this Document to a native file before using canonical Entities.'; }
  location(id?: string) { this.storageChanged[0](); const b = id && (this.bindings.get(id)??this.compatibleSources.get(id)); return b ? { ...b.location } : undefined; }
  compatibleSource(id:string){const source=this.compatibleSources.get(id);return source?Object.freeze({...source,location:Object.freeze({...source.location})}):undefined;}
  trackCandidate(id: string) {
    captureNative(this.editor.repository.snapshot(),id);
    markNativeBinding(this.editor.repository,id);this.candidates.add(id);this.touch();
  }
  isCandidate(id: string) { this.changed[0]();return this.candidates.has(id); }
  private targets(): LinkTarget[] {
    return Object.values(this.editor.repository.readState().contents).filter(c => c.viewType === 'document-block').map(c => {
      const m = c.payload.metadata as any; const id = String(m?.documentId ?? c.payload.id), binding = this.bindings.get(id);
      return { documentId: id, blockId: String(c.payload.id), title: String(m?.title ?? ''), path: binding ? `${binding.location.folder}/${nativeDocumentStem(binding.location.filename)}` : '' };
    });
  }
  private dependencies(id: string) {
    const known = new Map<string, DocumentLocation>();
    for (const c of Object.values(this.editor.repository.readState().contents).filter(c => c.viewType === 'document-block')) {
      const resourceId = String((c.payload.metadata as any)?.documentId ?? c.payload.id), source = this.editor.persistence.workspaceReference(resourceId)?.source;
      if (source && isNativeDocumentName(source.filename)) known.set(resourceId, { folder: source.folder, filename: source.filename });
    }
    for (const [resourceId,binding] of this.bindings) known.set(resourceId,binding.location);
    return [...known].filter(([resourceId]) => resourceId !== id).map(([resourceId,location]) => ({ resourceId, location }));
  }
  async list(folder: string) { return (await request(`list?${new URLSearchParams({folder})}`)).files as string[]; }
  async defaultVault(){return (await request('vault/default')).vault as string|undefined;}
  async establishVault(vault:string,signal?:AbortSignal){return request('vault/establish',{vault},signal);}
  async discoverVault(vault: string, signal?: AbortSignal) { return request('vault/discover', {vault}, signal); }
  async createVaultDirectory(vault: string, directory: string) { return request('vault/mkdir', {vault, directory}); }
  async relocateVault(input: VaultRelocation) {
    if (this.relocations.has(input.operationId)) {
      if(JSON.stringify(this.relocations.get(input.operationId)!.request)!==JSON.stringify(input))throw new Error('Relocation retry differs from original request');
      return this.recoverRelocation(input.operationId);
    }
    const bindings: Array<{id: string; baseline: Baseline; location: DocumentLocation}> = [];
    for (const item of input.baselines) {
      const b = this.bindings.get(item.resourceId); if (!b) continue;
      if (b.busy || b.pending || b.relocation) throw new Error('Finish or recover the resource operation before relocation');
      const boundPath=b.location.folder && b.location.folder!=='.'?`${b.location.folder}/${b.location.filename}`:b.location.filename;
      if(input.kind==='pair'?boundPath!==input.source:!boundPath.startsWith(input.source+'/'))throw new Error('Relocation source differs from the live binding; explicit reconciliation required');
      if (JSON.stringify(b.baseline) !== JSON.stringify(item.baseline)) throw new Error('Vault scan cannot refresh a stale editor baseline');
      bindings.push({id: item.resourceId, baseline: {...b.baseline}, location: {...b.location}});
    }
    const captured = structuredClone(input);
    this.relocations.set(input.operationId, {request: captured, bindings});
    return this.runRelocation(input.operationId, false);
  }
  pendingVaultRelocations(vault: string) {
    this.storageChanged[0]();
    return [...this.relocations].filter(([,value]) => value.request.vault === vault).map(([operationId]) => operationId);
  }
  async recoverRelocation(operationId: string) {
    this.opening++;this.notifyKnowledge();try{return await this.recoverRelocationWork(operationId);}finally{this.opening--;this.notifyKnowledge();}
  }
  private async recoverRelocationWork(operationId:string){
    if (!this.relocations.has(operationId)) {
      const result=await request('vault/recover',{operationId});
      this.notice=result.phase==='relocated'?'Relocation recovered. Explicitly Open the destination; existing bindings were not adopted.':`Relocation pending: ${result.error??'Review required'}`;
      this.touch();return result;
    }
    return this.runRelocation(operationId, true);
  }
  private async runRelocation(operationId: string, recovery: boolean) {
    const record = this.relocations.get(operationId)!;
    if(record.work)return record.work;
    for (const x of record.bindings) {
      const b=this.bindings.get(x.id)!;
      if(b.relocationWork) return b.relocationWork;
      b.relocation=operationId; b.busy=true; b.message='Relocation pending';
    }
    this.touchStorage(); this.touch();
    const work=(async()=>{
      try {
        const result=await request(recovery?'vault/recover':'vault/relocate',recovery?{operationId}:record.request);
        if(this.disposed)return result;
        if(result.phase==='relocated') {
          for(const x of record.bindings) {
            const b=this.bindings.get(x.id)!;
            const moved=result.bindings.find((v:any)=>v.resourceId===x.id);
            if(!moved || JSON.stringify(b.baseline)!==JSON.stringify(x.baseline) || !sameLocation(b.location,x.location)) throw new Error('Relocation completion does not match the caller binding');
            if(moved.baseline.nativeHash!==x.baseline.nativeHash || moved.baseline.markdownHash!==x.baseline.markdownHash || moved.baseline.generation!==x.baseline.generation) throw new Error('Relocation changed the captured content baseline');
          }
          for(const x of record.bindings) {
            const b=this.bindings.get(x.id)!, moved=result.bindings.find((v:any)=>v.resourceId===x.id);
            b.location={...moved.location}; b.baseline={...moved.baseline}; b.relocation=undefined;
            b.message=b.pair.dirty?'Relocated — newer/unsaved edits remain':'Relocated native Document and Markdown';
            const sources=Object.values(this.editor.repository.readState().contents).filter(c=>c.viewType==='document-block' && String((c.payload.metadata as any)?.documentId??c.payload.id)===x.id);
            if(sources.length===1)this.editor.persistence.registerWorkspaceDocument(sources[0].key,x.id,b.location.folder,b.location.filename);
          }
          this.relocations.delete(operationId);
        } else for(const x of record.bindings)this.bindings.get(x.id)!.message=`Relocation pending: ${result.error??'Recovery required'}`;
        return result;
      } catch(error) {
        if((error as any).preflight && !recovery) {
          // The route explicitly rejected preparation; no server relocation was started.
          for(const x of record.bindings)this.bindings.get(x.id)!.relocation=undefined;
          this.relocations.delete(operationId);
        }
        for(const x of record.bindings)this.bindings.get(x.id)!.message=`Relocation blocked or outcome unknown: ${String(error)}`;
        throw error;
      } finally {
        for(const x of record.bindings){const b=this.bindings.get(x.id)!;b.busy=false;b.relocationWork=undefined;}
        record.work=undefined;this.touchStorage();this.touch();
      }
    })();
    record.work=work;
    for(const x of record.bindings)this.bindings.get(x.id)!.relocationWork=work;
    return work;
  }
  private bank() {
    const state=this.editor.repository.readState(),root=state.contents[state.placements[state.rootPlacementKey].contentKey];
    const banks=root.children.map(k=>state.contents[state.placements[k].contentKey]).filter(c=>c.viewType==='workspace-object-bank-block');
    if(banks.length!==1)throw new Error('Native Open requires one existing workspace object bank');return banks[0].key;
  }
  async open(location: DocumentLocation, importText = false, signal?: AbortSignal) {
    signal?.throwIfAborted();
    this.opening++;this.notifyKnowledge();try{return await this.openResource(location,importText,undefined,signal);}finally{this.opening--;this.notifyKnowledge();}
  }
  async openCompatible(location:DocumentLocation,vault:string,signal?:AbortSignal) {
    signal?.throwIfAborted();
    this.opening++;this.notifyKnowledge();
    try {
      const data=await request('recognize',{location},signal);signal?.throwIfAborted();if(this.disposed)throw Error('Document session closed');
      const bytes=new TextEncoder().encode(data.text),recognized=recognizeCompatibleDocument(bytes),id=recognized.resource.resourceId;
      if(id!==data.resourceId)throw Error('Recognition identity changed');
      const digest=await crypto.subtle.digest('SHA-256',bytes);
      if([...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('')!==data.byteHash)throw Error('Recognition bytes changed');
      signal?.throwIfAborted();if(this.disposed)throw Error('Document session closed');
      const old=this.compatibleSources.get(id);
      if(this.bindings.has(id)||old&&!sameLocation(old.location,location))throw Error('Identity already opened from another source; no automatic rebinding');
      if(old&&old.byteHash!==data.byteHash)throw Error('Source changed since Open; live edits were preserved');
      const boundary=this.editor.repository.readCanonicalResourceBoundary(id);
      if(!old&&boundary.status!=='missing')throw Error('Canonical identity is already loaded without this source proof; no implicit adoption');
      if(!old||boundary.status!=='ready')admitNative(this.editor.repository,new TextEncoder().encode(nativeText(recognized.resource)),this.bank());
      if(!old)this.compatibleSources.set(id,{location:{...location},byteHash:data.byteHash,format:recognized.format,vault,canSave:data.saveCapability==='in-place',message:data.saveCapability==='in-place'?'Opened Document — in-place Save available':data.saveReason,dirty:false,busy:false,members:new Set(Object.keys(captureNative(this.editor.repository.snapshot(),id).contents))});
      markNativeBinding(this.editor.repository,id);this.touchStorage();this.touch();return id;
    }finally{this.opening--;this.notifyKnowledge();}
  }
  /** Selected result only. The caller owns navigation; admission retains all native guards. */
  async openVerified(location: DocumentLocation, expected: {resourceId:string;byteHash:string}, guard:()=>void, signal?:AbortSignal, verify?:()=>Promise<void>) {
    guard(); signal?.throwIfAborted(); this.opening++;this.notifyKnowledge();const epoch=this.knowledgeEpoch;
    const check=()=>{guard();signal?.throwIfAborted();if(this.knowledgeEpoch!==epoch)throw Error('Native operation changed during selected Open');};
    let revision=this.editor.repository.state.revision;
    try{const id=await this.openResource(location,false,{...expected,check,signal,verify,completed:()=>{revision=this.editor.repository.state.revision;}});return {id,revision};}finally{this.opening--;this.notifyKnowledge();}
  }
  async verifySelected(location:DocumentLocation, expected:{resourceId:string;byteHash:string}, signal?:AbortSignal) {
    const data=await request('open',{location},signal);await this.checkSelected(data,expected);signal?.throwIfAborted();
  }
  private async checkSelected(data:any, expected:{resourceId:string;byteHash:string}) {
    if(this.disposed||data.kind!=='native'||data.pending||data.resourceId!==expected.resourceId||data.baseline?.nativeHash!==expected.byteHash)throw Error('Selected native evidence changed');
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(data.native));
    if([...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('')!==expected.byteHash)throw Error('Selected native bytes changed');
  }
  private async openResource(location: DocumentLocation, importText: boolean, expected?:{resourceId:string;byteHash:string;check:()=>void;signal?:AbortSignal;verify?:()=>Promise<void>;completed:()=>void}, signal = expected?.signal) {
    if(isDerivedMarkdownName(location.filename))throw new Error('Open the .ink Document; .ink.md is a derived projection');
    const data = await request('open',{location},signal); signal?.throwIfAborted(); if(expected){expected.check();await this.checkSelected(data,expected);expected.check();await expected.verify?.();expected.check();} if(this.disposed)throw new Error('Document session closed');
    if(data.kind === 'markdown') {
      if(!importText)throw new Error('Choose Import Markdown to create a new native candidate');
      const admitted=admitMarkdown(this.editor.repository,this.bank(),data.text,this.targets()); markNativeBinding(this.editor.repository,admitted.resourceId);this.candidates.add(admitted.resourceId);
      this.notice='Markdown imported into a new native Document; original file unchanged. Choose a native Save destination.';this.touch();return admitted.resourceId;
    }
    if(importText)throw new Error('Select a standalone .md file to import');
    if(data.pending)throw new Error('This file has a pending generation. Use Recover, then Open again.');
    const existing=this.bindings.get(data.resourceId);
    if(this.compatibleSources.has(data.resourceId))throw Error('Identity already opened from a compatibility source; no automatic rebinding');
    if(existing&&!sameLocation(existing.location,location))throw new Error('This identity is already bound to another location. Relocation requires separate review.');
    if(existing){
      if(JSON.stringify(existing.baseline)!==JSON.stringify(data.baseline))throw new Error('The server file changed since this Document was opened. Current edits and baseline were preserved.');
      const boundary=this.editor.repository.readCanonicalResourceBoundary(data.resourceId);
      if(boundary.status==='ready'){expected?.completed();return data.resourceId;}
      if(boundary.status!=='missing')throw Error('Bound canonical resource is '+boundary.status);
      // Explicit Open after disappearance may re-admit the verified native resource.
      // A retained binding alone is never evidence of a live canonical Document.

    }
    const bytes=new TextEncoder().encode(data.native),resource=decodeNative(bytes);
    expected?.check();
    const admitted=admitNative(this.editor.repository,bytes,this.bank());
    const binding=existing??this.bind(data.resourceId,location,data.baseline);
    if(existing)binding.members=new Set(Object.keys(captureNative(this.editor.repository.snapshot(),data.resourceId).contents));
    binding.pair.acknowledgeOpen(nativeText(resource));binding.message=data.readOnly?'Opened native Document (server is read-only)':'Opened native Document';
    const contentKey=this.editor.repository.state.placements[admitted.placementKey].contentKey;
    this.editor.persistence.registerWorkspaceDocument(contentKey,data.resourceId,location.folder,location.filename);
    this.touch();expected?.completed();return data.resourceId;
  }
  private bind(id: string, location: DocumentLocation, baseline: Baseline): Binding {
    const binding = { location: {...location}, baseline, message:'Native destination selected', busy:false, members:new Set(Object.keys(captureNative(this.editor.repository.snapshot(),id).contents)) } as Binding;
    const complete = (data: any) => {
      const r: PairResult=data.result;
      if(r.phase==='saved'&&r.generation===binding.pending?.generation){binding.baseline=data.baseline;binding.pending=undefined;this.candidates.delete(id);}
      if(r.phase==='failed'&&!r.generation)binding.pending=undefined;
      return r;
    };
    binding.pair=enrollPair(this.editor.repository,id,{
      save: async generation => {
        binding.pending=generation as PairGeneration;this.notifyKnowledge();
        try { const data=await request('save',{location:binding.location,generation,baseline:binding.baseline,dependencies:this.dependencies(id),acceptMarkdownHash:binding.comparedHash});
          const r=complete(data);if(r.phase==='failed'&&!r.generation)binding.pending=undefined;return r;
        }catch(error){if((error as any).preflight){binding.pending=undefined;return {phase:'failed',error:String(error)};}return {phase:'failed',generation:generation.generation,error:`Save outcome unknown or rejected: ${String(error)}. Use Retry / Recover.`};}
      },
      recover: async () => {
        if(!binding.pending)return {phase:'failed',error:'No pending generation'};
        // Resend exactly the captured request. The server verifies retry bytes
        // and recovers its intent/receipt, or starts it if it never arrived.
        const data=await request('save',{location:binding.location,generation:binding.pending,baseline:binding.baseline,dependencies:this.dependencies(id),acceptMarkdownHash:binding.comparedHash});return complete(data);
      }
    },()=>this.targets());
    this.bindings.set(id,binding);markNativeBinding(this.editor.repository,id);this.touchStorage();return binding;
  }
  private async operate(id: string, recovery: boolean) {
    const b=this.bindings.get(id);if(!b)throw new Error('Choose a native Save destination first');
    if(b.relocationWork)await b.relocationWork;
    if(b.relocation)throw new Error('Recover pending relocation before Save');
    if(b.busy)return;b.busy=true;b.message=recovery?'Recovering captured generation…':'Saving native Document and Markdown…';this.notifyKnowledge();this.touch();
    try {const r=await (recovery?b.pair.recover():b.pair.save(b.comparedHash));
      const labels={saved:'Saved native Document and Markdown',failed:'Save blocked','canonical-saved-markdown-pending':'Canonical saved; Markdown pending','confirmation-pending':'Confirmation pending'};
      b.message=labels[r.phase]+(r.dirty?' — newer/unsaved edits remain':'')+(r.error?`: ${r.error}`:'');
      if(r.phase==='saved')b.comparedHash=undefined;
      return r;
    }finally{b.busy=false;this.notifyKnowledge();this.touch();}
  }
  async save(id: string, location?: DocumentLocation) {
    if(this.compatibleSources.has(id)){if(location&&!sameLocation(location,this.compatibleSources.get(id)!.location))throw Error('Changing source format/location requires explicit Save As; no conversion was performed');return this.saveRecognized(id);}
    if(this.editor.blockHistory.state.storage==='persistent')throw new Error('Native pair integration does not migrate persistent History enrollment');
    let b=this.bindings.get(id);
    if(!b){if(!location||!isNativeDocumentName(location.filename))throw new Error('Choose a .ink or .mutable.json destination');captureNative(this.editor.repository.snapshot(),id);b=this.bind(id,location,{nativeHash:null,markdownHash:null,generation:null});}
    // A rejected first destination has no durable binding to relocate.
    if(location && !sameLocation(b.location,location) && b.baseline.nativeHash===null && !b.pending) {
      if(!isNativeDocumentName(location.filename))throw new Error('Choose a .ink or .mutable.json destination');
      b.location={...location};this.touchStorage();
    }
    return this.operate(id,false);
  }
  async recoverRecognized(vault:string,resourceId:string,generation:string){const result=await request('recover-recognized',{vault,resourceId,generation});if(result.phase!=='saved')throw Error(result.error??'Document recovery remains pending');this.notice='Recovery complete. Explicitly reopen the Document; live source baselines were not replaced.';this.touch();return result;}
  async verifySource(vault:string,id:string){const proof=this.knowledgeEvidence(id);if(proof.pending||!proof.location||!proof.byteHash)throw Error('Source unavailable or pending');return request('verify-source',{vault,source:{resourceId:id,location:proof.location,byteHash:proof.byteHash}});}
  private async saveRecognized(id:string){
    const s=this.compatibleSources.get(id)!;if(s.busy)throw Error('Document Save is already active');
    if(!s.canSave)throw Error(s.message);
    s.busy=true;s.message='Saving Document';this.notifyKnowledge();this.touch();
    try{
      s.pending??={vault:s.vault,source:{resourceId:id,location:s.location,byteHash:s.byteHash},format:s.format,dependencies:this.dependencies(id),generation:crypto.randomUUID(),native:nativeText(captureNative(this.editor.repository.snapshot(),id))};
      const result=await request('save-recognized',s.pending);
      if(result.phase!=='saved'){s.message='Document Save pending: '+result.error;return result;}
      s.byteHash=result.byteHash;const captured=s.pending.native;s.pending=undefined;
      s.dirty=nativeText(captureNative(this.editor.repository.snapshot(),id))!==captured;
      s.message='Saved Document in place'+(s.dirty?' — newer edits remain':'');this.touchStorage();return result;
    }catch(e){if((e as any).preflight)s.pending=undefined;s.message='Document Save blocked: '+String(e);throw e;}
    finally{s.busy=false;this.notifyKnowledge();this.touch();}
  }
  async recover(id: string | undefined, location: DocumentLocation) {
    this.opening++;this.notifyKnowledge();try{return await this.recoverWork(id,location);}finally{this.opening--;this.notifyKnowledge();}
  }
  private async recoverWork(id:string|undefined,location:DocumentLocation){
    if(id&&this.compatibleSources.has(id))return this.saveRecognized(id);
    if(id&&this.bindings.get(id)?.pending)return this.operate(id,true);
    const data=await request('open',{location});if(data.kind!=='native'||!data.pending)throw new Error('No pending generation at this location');
    const result=await request('recover',{location,resourceId:data.resourceId,generation:data.pending.generation,dependencies:this.dependencies(data.resourceId),baseline:data.baseline});
    this.notice=result.result.phase==='saved'?'Recovery complete. Open the native file again.':`Recovery blocked: ${result.result.error}`;this.touch();
  }
  async compare(id: string) {
    const b=this.bindings.get(id);if(!b)throw new Error('Open or save the native Document first');
    const data=await request('compare',{location:b.location,resourceId:id});b.comparedHash=data.externalHash??undefined;
    return {external:data.external??'',generated:(await import('./markdown')).exportMarkdown(captureNative(this.editor.repository.snapshot(),id),this.targets()).text};
  }
  async keepMutable(id: string) {
    const b=this.bindings.get(id);if(!b?.comparedHash)throw new Error('Compare the current Markdown before choosing Keep Mutable');if(b.pending)throw new Error('A partial generation is blocked. Its files remain preserved; in-place conflict resolution is not supported.');
    return this.operate(id,false);
  }
}
