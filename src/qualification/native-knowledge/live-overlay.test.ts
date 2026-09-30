import {it,expect} from 'vitest';
import {liveFixture} from './live-fixture';import {LiveFactsObserver} from './live-adapter';import {observedOverlay} from './live-facts-overlay';import {KnowledgeIndex} from './index';
import {OccurrenceIndex} from '../../block-tree/occurrences';import {BlockTreeProjection} from '../../block-tree/projection';import {TreeCommands} from '../../block-tree/commands';
it('suppresses immediately, rejects stale completions and never falls back on disposal',async()=>{
 const f=liveFixture(),index=new KnowledgeIndex(),o=new LiveFactsObserver(f.repository,f.scope);index.putSaved((await o.observe(f.id,'disk-old')).facts);o.dispose();
 const overlay=observedOverlay(index,f.repository,f.scope,f.id,60000),occurrences=new OccurrenceIndex(),projection=new BlockTreeProjection(f.repository,'test',occurrences),commands=new TreeCommands(f.repository,key=>occurrences.resolve(key)),key=Object.values(projection.state.nodes).find(n=>n.viewType==='standoff-editor-block')!.key;
 try{expect(index.effective.has(f.id)).toBe(false);await overlay.flush();const initial=index.effective.get(f.id)!;expect(initial.generation).toContain('live:');
 commands.replaceInlineRange(key,0,0,'Changed');expect(index.effective.has(f.id)).toBe(false);const obsolete=overlay.flush();f.repository.undo();await obsolete;expect(index.effective.has(f.id)).toBe(false);await overlay.flush();expect(index.effective.get(f.id)!.blocks).toEqual(initial.blocks);
 f.repository.redo();await overlay.flush();expect(index.effective.get(f.id)!.blocks).not.toEqual(initial.blocks);
 const stale=overlay.flush();f.changeSignature();overlay.invalidate();await stale;expect(index.effective.has(f.id)).toBe(false);await overlay.flush();
 const root=Object.values(f.repository.readState().contents).find(c=>c.payload.id==='resource-0-root')!;f.repository.commit('Disappear',[{kind:'put-content',record:{...root,payload:{...root.payload,metadata:{documentId:'missing'}}}}]);expect(index.effective.has(f.id)).toBe(false);await overlay.flush();expect(index.effective.has(f.id)).toBe(false);expect(overlay.error).toContain('identity');
 f.repository.undo();await overlay.flush();const disposing=overlay.flush();overlay.dispose();await disposing;expect(index.effective.has(f.id)).toBe(false);expect(index.saved.get(f.id)!.generation).toBe('disk-old');expect(index.overlays.has(f.id)).toBe(true);
 // restoreSaved is deliberately not part of this adapter; only a future externally verified hand-back may call it.
 }finally{overlay.dispose();projection.dispose();}
});
it('supports ten independently registered canonical resources without mounting them',async()=>{
 const f=liveFixture(10),o=new LiveFactsObserver(f.repository,f.scope);try{const r=await o.observe(f.id,'live');expect(r.facts.id).toBe(f.id);expect(r.facts.blocks).toHaveLength(7);}finally{o.dispose();}
});
