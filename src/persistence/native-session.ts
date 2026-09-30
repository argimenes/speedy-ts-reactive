import { createSignal } from 'solid-js';
import type { ReactiveEditor } from '../reactive-editor/editor';
import type { DocumentLocation } from '../reactive-editor/persistence';
import { admitNative, captureNative, decodeNative, nativeText } from './native-resource';
import { admitMarkdown, type LinkTarget } from './markdown';
import { enrollPair, type PairGeneration, type PairResult, type ResourcePair } from './resource-pair';
import { markNativeBinding, ownNativeSession } from './native-bindings';
type Baseline = { nativeHash: string | null; markdownHash: string | null; generation: string | null };
type Binding = { location: DocumentLocation; baseline: Baseline; pair: ResourcePair; pending?: PairGeneration; message: string; comparedHash?: string; busy: boolean; members: Set<string> };
const sessions = new WeakMap<ReactiveEditor, NativeDocumentSession>();
export function nativeDocumentSession(editor: ReactiveEditor) {
  let service = sessions.get(editor); if (!service) sessions.set(editor, service = new NativeDocumentSession(editor)); return service;
}
async function request(action: string, body?: unknown) {
  const response = await fetch(`/api/native/${action}`, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined);
  const json = await response.json(); if (!response.ok || !json.Success) throw Object.assign(new Error(json.Error ?? 'Native store request failed'), {status:response.status,preflight:json.PublicationStarted===false}); return json.Data;
}
const sameLocation = (a: DocumentLocation, b: DocumentLocation) => a.folder === b.folder && a.filename === b.filename;
export class NativeDocumentSession {
  private bindings = new Map<string, Binding>();
  private changed = createSignal(0);
  private disposed = false;
  private notice = '';
  private candidates = new Set<string>();
  constructor(private editor: ReactiveEditor) {
    const warn = (event: BeforeUnloadEvent) => { if (this.candidates.size || [...this.bindings.values()].some(b => b.pending || b.pair.dirty)) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    const stop = editor.repository.subscribeChanges(change => {
      for (const [id,b] of this.bindings) {
        if (![...change.previousContents.keys(), ...(change.inlineOwner ? [change.inlineOwner] : [])].some(k => b.members.has(k))) continue;
        if (!b.pending && !b.busy) b.message = 'Document changed — Save required';
        if (!change.inlineOwner) { try { b.members = new Set(Object.keys(captureNative(editor.repository.snapshot(), id).contents)); } catch { b.message = 'Canonical source unavailable or ambiguous'; } }
      }
      this.touch();
    });
    ownNativeSession(editor.repository, () => { this.disposed = true; stop(); window.removeEventListener('beforeunload', warn); });
  }
  private touch() { this.changed[1](v => v + 1); }
  status(id?: string) { this.changed[0](); const b = id && this.bindings.get(id); return b ? b.message : this.notice || 'Native Documents save individually; Workspace saving remains guarded.'; }
  location(id?: string) { this.changed[0](); const b = id && this.bindings.get(id); return b ? { ...b.location } : undefined; }
  private targets(): LinkTarget[] {
    return Object.values(this.editor.repository.readState().contents).filter(c => c.viewType === 'document-block').map(c => {
      const m = c.payload.metadata as any; const id = String(m?.documentId ?? c.payload.id), binding = this.bindings.get(id);
      return { documentId: id, blockId: String(c.payload.id), title: String(m?.title ?? ''), path: binding ? `${binding.location.folder}/${binding.location.filename.replace(/\.mutable\.json$/, '')}` : '' };
    });
  }
  private dependencies(id: string) {
    const known = new Map<string, DocumentLocation>();
    for (const c of Object.values(this.editor.repository.readState().contents).filter(c => c.viewType === 'document-block')) {
      const resourceId = String((c.payload.metadata as any)?.documentId ?? c.payload.id), source = this.editor.persistence.workspaceReference(resourceId)?.source;
      if (source?.filename.endsWith('.mutable.json')) known.set(resourceId, { folder: source.folder, filename: source.filename });
    }
    for (const [resourceId,binding] of this.bindings) known.set(resourceId,binding.location);
    return [...known].filter(([resourceId]) => resourceId !== id).map(([resourceId,location]) => ({ resourceId, location }));
  }
  async list(folder: string) { return (await request(`list?${new URLSearchParams({folder})}`)).files as string[]; }
  private bank() {
    const state=this.editor.repository.readState(),root=state.contents[state.placements[state.rootPlacementKey].contentKey];
    const banks=root.children.map(k=>state.contents[state.placements[k].contentKey]).filter(c=>c.viewType==='workspace-object-bank-block');
    if(banks.length!==1)throw new Error('Native Open requires one existing workspace object bank');return banks[0].key;
  }
  async open(location: DocumentLocation, importText = false) {
    const data = await request('open',{location}); if(this.disposed)throw new Error('Document session closed');
    if(data.kind === 'markdown') {
      if(!importText)throw new Error('Choose Import Markdown to create a new native candidate');
      const admitted=admitMarkdown(this.editor.repository,this.bank(),data.text,this.targets()); markNativeBinding(this.editor.repository,admitted.resourceId);this.candidates.add(admitted.resourceId);
      this.notice='Markdown imported into a new native Document; original file unchanged. Choose a native Save destination.';this.touch();return admitted.resourceId;
    }
    if(importText)throw new Error('Select a standalone .md file to import');
    if(data.pending)throw new Error('This file has a pending generation. Use Recover, then Open again.');
    const existing=this.bindings.get(data.resourceId);
    if(existing&&!sameLocation(existing.location,location))throw new Error('This identity is already bound to another location. Relocation requires separate review.');
    if(existing){
      if(JSON.stringify(existing.baseline)!==JSON.stringify(data.baseline))throw new Error('The server file changed since this Document was opened. Current edits and baseline were preserved.');
      return data.resourceId;
    }
    const bytes=new TextEncoder().encode(data.native),resource=decodeNative(bytes);
    const admitted=admitNative(this.editor.repository,bytes,this.bank());
    const binding=this.bind(data.resourceId,location,data.baseline);
    binding.pair.acknowledgeOpen(nativeText(resource));binding.message=data.readOnly?'Opened native Document (server is read-only)':'Opened native Document';
    const contentKey=this.editor.repository.state.placements[admitted.placementKey].contentKey;
    this.editor.persistence.registerWorkspaceDocument(contentKey,data.resourceId,location.folder,location.filename);
    this.touch();return data.resourceId;
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
        binding.pending=generation as PairGeneration;
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
    this.bindings.set(id,binding);markNativeBinding(this.editor.repository,id);return binding;
  }
  private async operate(id: string, recovery: boolean) {
    const b=this.bindings.get(id);if(!b)throw new Error('Choose a native Save destination first');
    if(b.busy)return;b.busy=true;b.message=recovery?'Recovering captured generation…':'Saving native Document and Markdown…';this.touch();
    try {const r=await (recovery?b.pair.recover():b.pair.save(b.comparedHash));
      const labels={saved:'Saved native Document and Markdown',failed:'Save blocked','canonical-saved-markdown-pending':'Canonical saved; Markdown pending','confirmation-pending':'Confirmation pending'};
      b.message=labels[r.phase]+(r.dirty?' — newer/unsaved edits remain':'')+(r.error?`: ${r.error}`:'');
      if(r.phase==='saved')b.comparedHash=undefined;
      return r;
    }finally{b.busy=false;this.touch();}
  }
  async save(id: string, location?: DocumentLocation) {
    if(this.editor.blockHistory.state.storage==='persistent')throw new Error('Native pair integration does not migrate persistent History enrollment');
    let b=this.bindings.get(id);
    if(!b){if(!location?.filename.endsWith('.mutable.json'))throw new Error('Choose a .mutable.json destination');captureNative(this.editor.repository.snapshot(),id);b=this.bind(id,location,{nativeHash:null,markdownHash:null,generation:null});}
    // A rejected first destination has no durable binding to relocate.
    if(location && !sameLocation(b.location,location) && b.baseline.nativeHash===null && !b.pending) {
      if(!location.filename.endsWith('.mutable.json'))throw new Error('Choose a .mutable.json destination');
      b.location={...location};
    }
    return this.operate(id,false);
  }
  async recover(id: string | undefined, location: DocumentLocation) {
    if(id&&this.bindings.get(id)?.pending)return this.operate(id,true);
    const data=await request('open',{location});if(data.kind!=='native'||!data.pending)throw new Error('No pending generation at this location');
    const result=await request('recover',{location,resourceId:data.resourceId,generation:data.pending.generation,dependencies:this.dependencies(data.resourceId)});
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
