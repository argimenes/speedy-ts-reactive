import { createRoot, createSignal, type Accessor } from "solid-js";

export type Disposer = () => void;
export interface FeatureScope {
  readonly owner: string;
  readonly active: Accessor<boolean>;
  /** Own a resource; early release also removes it from the lifetime. */
  own(dispose: Disposer): Disposer;
  defer(work: () => void): void;
}
export interface CodexFeature { id: string; activate(scope: FeatureScope): void }

/** Per-editor lifetime, not a loader or runtime dependency resolver. */
export class FeatureHost {
  private instances = new Map<string, Disposer>();
  private disposed = false;
  list(): string[] { return [...this.instances.keys()]; }

  activate(feature: CodexFeature): Disposer {
    if (this.disposed) throw new Error("Feature host is disposed");
    if (this.instances.has(feature.id)) throw new Error(`Feature ${feature.id} is already active`);
    const [active, setActive] = createSignal(true);
    const resources = new Set<Disposer>();
    const scope: FeatureScope = {
      owner: feature.id, active,
      own(dispose) {
        let live = true;
        const release = () => { if (!live) return; live = false; resources.delete(release); dispose(); };
        if (active()) resources.add(release); else release();
        return release;
      },
      defer(work) { queueMicrotask(() => { if (active()) work(); }); },
    };
    const dispose = () => {
      if (!active()) return;
      setActive(false); // unmount contributed views before removing services
      this.instances.delete(feature.id);
      for (const release of [...resources].reverse()) {
        try { release(); } catch (error) { console.error(`Feature ${feature.id} cleanup failed`, error); }
      }
    };
    this.instances.set(feature.id, dispose);
    try {
      createRoot(disposeRoot => { scope.own(disposeRoot); feature.activate(scope); });
    } catch (error) {
      dispose();
      throw new Error(`Feature ${feature.id} activation failed`, { cause: error });
    }
    return dispose;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const dispose of [...this.instances.values()].reverse()) dispose();
  }
}

export interface FeatureAction {
  id: string;
  slot: "document-actions" | "add-block-menu";
  label: string;
  command: string;
  title?: string;
  binding?: string;
  order?: number;
}

/** Only the two existing presentation slots needed by the pilot. */
export class FeatureActions {
  private entries = new Map<string, FeatureAction & { owner: string }>();
  private revision = createSignal(0);
  register(action: FeatureAction, owner: string): Disposer {
    if (this.entries.has(action.id)) throw new Error(`UI contribution ${action.id} already belongs to ${this.entries.get(action.id)!.owner}`);
    this.entries.set(action.id, { ...action, owner }); this.revision[1](n => n + 1);
    let live = true;
    return () => { if (!live) return; live = false; this.entries.delete(action.id); this.revision[1](n => n + 1); };
  }
  list(slot: FeatureAction["slot"]): readonly (FeatureAction & { owner: string })[] {
    this.revision[0]();
    return [...this.entries.values()].filter(item => item.slot === slot).sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.id.localeCompare(b.id));
  }
}
