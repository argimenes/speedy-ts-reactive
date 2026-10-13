import {createSignal} from 'solid-js';
import {createStore, type SetStoreFunction} from 'solid-js/store';
import type {CanonicalRepository} from '../block-tree/repository';
import type {RepositoryState} from '../block-tree/types';

/** Session layout, separate from authored content and its Undo/Redo history.
 * Closed views retain their canonical data. Only explicit workspace saves persist
 * visibility, alongside the rest of the workspace layout.
 */
export class ViewVisibility {
  private readonly closed: Record<string, boolean | undefined>;
  private readonly setClosed: SetStoreFunction<Record<string, boolean | undefined>>;
  private readonly changed = createSignal(0);
  private saved = 0;
  private readonly savedChanged = createSignal(0);
  private present = false;
  private opaque = false;
  constructor(private readonly repository: CanonicalRepository) {
    const state = repository.readState(), root = state.contents[state.placements[state.rootPlacementKey].contentKey];
    const value = (root.payload.metadata as any)?.workspaceViewVisibility;
    const initial: Record<string, boolean | undefined> = {};
    if (root.viewType === 'workspace-block' && value !== undefined) {
      this.present = true;
      this.opaque = value?.version !== 1 || !Array.isArray(value.closed) || !value.closed.every((id: unknown) => typeof id === 'string');
      if (!this.opaque) for (const id of value.closed) initial[id] = true;
    }
    [this.closed, this.setClosed] = createStore(initial);
  }
  private identity(placementKey: string): string {
    const state = this.repository.readState(), p = state.placements[placementKey], c = p && state.contents[p.contentKey];
    // Stable authored IDs survive workspace decoding; runtime placement keys don't.
    return p?.placementId ? `placement:${p.placementId}` : typeof c?.payload.id === 'string' ? `block:${c.payload.id}` : `runtime:${placementKey}`;
  }
  isClosed(placementKey: string) { return !!this.closed[this.identity(placementKey)]; }
  set(placementKey: string, closed: boolean) {
    const key = this.identity(placementKey);
    if (!!this.closed[key] === closed) return;
    this.setClosed(key, closed || undefined); this.changed[1](n => n + 1);
  }
  revision() { return this.changed[0](); }
  dirty() { this.savedChanged[0](); return this.revision() !== this.saved; }
  markSaved(revision: number) { if (revision === this.revision()) { this.saved = revision; this.savedChanged[1](n => n + 1); } }
  /** Write into a detached capture only, never the live repository. */
  captureInto(snapshot: RepositoryState) {
    if (this.opaque || !this.present && !this.revision()) return;
    const root = snapshot.contents[snapshot.placements[snapshot.rootPlacementKey].contentKey];
    if (root.viewType !== 'workspace-block') return;
    const ids = new Set(Object.keys(snapshot.placements).map(key => this.identity(key)));
    const closed = Object.keys(this.closed).filter(id => this.closed[id] && ids.has(id) && !id.startsWith('runtime:'));
    root.payload.metadata = {...root.payload.metadata as object, workspaceViewVisibility:{...(root.payload.metadata as any)?.workspaceViewVisibility,version:1,closed}};
  }
}
