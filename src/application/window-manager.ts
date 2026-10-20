import { WindowLifecycle } from "./window-lifecycle";
import { untrack } from "solid-js";
import type { ReactiveEditor } from "../reactive-editor/editor";
import { WindowRegistry } from "../runtime/window-manager";

/** One coordinator per canonical WorkspaceSession. Existing wrappers are anchors,
 * not new resources. Non-desktop hosts and isolated demos keep their own geometry.
 */
export class WorkspaceWindowManager {
  readonly registry = new WindowRegistry();
  readonly lifecycle: WindowLifecycle;
  plane?: HTMLElement;
  readonly groups = new Map<string, HTMLElement>();
  private readonly initialOrder = new Map<string, number>();
  private readonly requested = new Map<string, number>();
  private serial = 0;
  private surfaceSerial = 0;
  private backgroundLaunch = 0;
  withoutActivation<T>(action:()=>T):T { this.backgroundLaunch++;try{return action();}finally{this.backgroundLaunch--;} }

  constructor(private readonly editor: ReactiveEditor) {
    this.lifecycle = new WindowLifecycle(this, editor);
    // Once at session creation. Historical z values seed order, never CSS layers.
    const windows = Object.values(editor.repository.readState().contents)
      .filter(c => ["window-block", "document-window-block"].includes(c.viewType))
      .sort((a, b) => (Number((a.payload.metadata as any)?.zIndex) || 0) - (Number((b.payload.metadata as any)?.zIndex) || 0) || a.key.localeCompare(b.key));
    windows.forEach((content, index) => this.initialOrder.set(content.key, index));
    this.serial = windows.length;
  }
  nextSurfaceId() { return `surface:${++this.surfaceSerial}`; }
  count() { return Object.keys(this.registry.windows).length; }
  /** A0 uses existing metadata fields; no serializer or file-format changes. */
  launchMetadata() { return { zIndex: this.count() + 1 }; }
  activatePlacement(placement: string) {
    this.raisePlacement(placement);
    if(this.backgroundLaunch)return;
    const valid=this.lifecycle.ticket();
    queueMicrotask(()=>{if(!valid())return;const record=Object.values(this.registry.windows).find(w=>w.placementKey===placement);if(record)this.lifecycle.activate(record.id);});
  }
  raisePlacement(placement: string) {
    this.requested.set(placement, ++this.serial);
    for (const window of Object.values(this.registry.windows)) if (window.placementKey === placement) this.registry.raise(window.id);
  }
  raiseWindow(id: string) {
    const window = this.registry.windows[id];
    if (!window) return;
    const previous = this.registry.revision();
    this.registry.raise(id);
    // Preserve runtime order if the existing presentation later remounts a view.
    if (this.registry.revision() !== previous) this.requested.set(window.placementKey, ++this.serial);
  }
  rankForNode(key: string) {
    const owner = this.ownerForNode(key);
    return owner ? this.registry.windows[owner]?.rank ?? 0 : 0;
  }
  ownerForNode(key: string): string | undefined {
    if (this.registry.windows[key]) return key;
    const physical = this.editor.mounts.get(key)?.root.closest<HTMLElement>("[data-mwm-window]");
    if (physical && this.registry.windows[physical.dataset.mwmWindow!]) return physical.dataset.mwmWindow;
    return this.editor.blockQueries.ancestors(key).find(node => !!this.registry.windows[node.key])?.key;
  }
  register(key: string, group: HTMLElement) {
    return untrack(() => {
      const node = this.editor.node(key);
      if (!node) throw new Error("Cannot register a missing Window.");
      const seed = this.requested.get(node.placementKey) ?? this.initialOrder.get(node.contentKey) ?? ++this.serial;
      this.requested.set(node.placementKey, seed);
      const pinned = (node.payload.metadata as any)?.pinned === true;
      const before = Object.values(this.registry.windows).filter(w => w.pinned === pinned)
        .sort((a, b) => a.rank - b.rank)
        .find(w => (this.requested.get(w.placementKey) ?? 0) > seed)?.id;
      const lease = this.registry.registerWindow({ id: key, placementKey: node.placementKey,
        ownerAppInstanceId: `app:${key}`, sourceViewId: node.viewId, pinned }, before);
      this.groups.set(key, group);
      return { ...lease, release: () => {
        if (this.registry.windows[key]?.generation !== lease.generation) return;
        const active=this.registry.activeWindowId===key;
        this.lifecycle.release(key); this.groups.delete(key); lease.release();
        const valid=this.lifecycle.ticket();
        if(active)queueMicrotask(()=>{if(valid())this.lifecycle.successor(key);});
      } };
    });
  }
  dispose() { this.lifecycle.dispose(); this.groups.clear(); this.requested.clear(); this.initialOrder.clear(); this.registry.dispose(); this.plane = undefined; }
}
