import { batch, createSignal } from "solid-js";
import { createStore } from "solid-js/store";

export type WindowId = string;
export type SurfaceKind = "content" | "tool" | "overlay" | "dialog";
export interface ViewActivity {
  /** Editing session exists, including a retained minimized desktop body. */
  mounted: boolean;
  /** Editing view is exposed in the current presentation. */
  visible: boolean;
  /** Observed native focus belongs to this owner; not an activation request. */
  active: boolean;
}
export interface ManagedWindow extends ViewActivity {
  id: WindowId;
  placementKey: string;
  ownerAppInstanceId: string;
  sourceViewId: string;
  pinned: boolean;
  rank: number;
  generation: number;
  ownerModalCount: number;
}
export interface ManagedSurface {
  id: string;
  ownerWindowId?: WindowId;
  ownerAppInstanceId: string;
  sourceViewId: string;
  parentSurfaceId?: string;
  kind: SurfaceKind;
  modality: "none" | "window" | "application" | "workspace";
  generation: number;
}

/** Runtime policy only: never writes resource content, history or persistence.
 * No repository subscription, DOM scan, focus restoration or text-input handler.
 * Tool chrome/placement/docking can later consume these same ownership leases.
 */
export class WindowRegistry {
  readonly windows: Record<string, ManagedWindow>;
  readonly surfaces: Record<string, ManagedSurface>;
  private readonly setWindows;
  private readonly setSurfaces;
  private normal: string[] = [];
  private pinned: string[] = [];
  private generation = 0;
  private focused?: string;
  private recent: string[] = [];
  get activeWindowId() { return this.focused; }
  get mru(): readonly string[] { return this.recent; }
  successor(exclude?: string) { return [...this.recent, ...this.normal.slice().reverse(), ...this.pinned.slice().reverse()].find(id => id !== exclude && this.windows[id]?.visible); }
  private readonly changed = createSignal(0);
  readonly revision = this.changed[0];

  constructor() {
    [this.windows, this.setWindows] = createStore<Record<string, ManagedWindow>>({});
    [this.surfaces, this.setSurfaces] = createStore<Record<string, ManagedSurface>>({});
  }

  registerWindow(input: Omit<ManagedWindow, keyof ViewActivity | "rank" | "generation" | "ownerModalCount">, before?: string) {
    if (this.windows[input.id]) throw new Error(`Window already registered: ${input.id}`);
    const generation = ++this.generation;
    const order = input.pinned ? this.pinned : this.normal;
    const index = before ? order.indexOf(before) : -1;
    order.splice(index < 0 ? order.length : index, 0, input.id);
    batch(() => {
      this.setWindows(input.id, { ...input, rank: 0, generation, mounted: false, visible: false, active: false, ownerModalCount: 0 });
      this.reindex();
    });
    return {
      generation,
      activity: (mounted: boolean, visible: boolean) => {
        if (this.windows[input.id]?.generation !== generation) return;
        batch(() => {
          this.setWindows(input.id, { mounted, visible: mounted && visible });
          if (!mounted || !visible) this.clearFocus(input.id);
        });
      },
      release: () => {
        if (this.windows[input.id]?.generation !== generation) return;
        batch(() => {
          this.clearFocus(input.id);
          for (const surface of Object.values(this.surfaces)) if (surface.ownerWindowId === input.id) this.setSurfaces(surface.id, undefined!);
          this.recent = this.recent.filter(id => id !== input.id);
          this.normal = this.normal.filter(id => id !== input.id);
          this.pinned = this.pinned.filter(id => id !== input.id);
          this.setWindows(input.id, undefined!);
          this.reindex();
        });
      },
    };
  }

  registerSurface(input: Omit<ManagedSurface, "generation" | "ownerAppInstanceId">) {
    const owner = input.ownerWindowId ? this.windows[input.ownerWindowId] : undefined;
    if (input.ownerWindowId && !owner) throw new Error("A surface requires a registered owner window.");
    if (this.surfaces[input.id]) throw new Error(`Surface already registered: ${input.id}`);
    const parent = input.parentSurfaceId && this.surfaces[input.parentSurfaceId];
    if (input.parentSurfaceId && (!parent || parent.ownerWindowId !== input.ownerWindowId)) throw new Error("Surface parent belongs to a different owner.");
    const generation = ++this.generation;
    this.setSurfaces(input.id, { ...input, ownerAppInstanceId: owner?.ownerAppInstanceId ?? "workspace-shell", generation });
    if (owner && input.modality !== "none") this.setWindows(owner.id, "ownerModalCount", n => n + 1);
    return () => {
      if (this.surfaces[input.id]?.generation !== generation) return;
      // Child leases cannot outlive the parent. Stale releases remain harmless.
      const releaseChildren = (id: string) => {
        for (const child of Object.values(this.surfaces)) if (child.parentSurfaceId === id) releaseChildren(child.id);
        const current = this.surfaces[id];
        if (current?.ownerWindowId && current.modality !== "none" && this.windows[current.ownerWindowId]) this.setWindows(current.ownerWindowId, "ownerModalCount", n => n - 1);
        this.setSurfaces(id, undefined!);
      };
      releaseChildren(input.id);
    };
  }

  raise(id: string) {
    const item = this.windows[id];
    if (!item) return;
    const order = item.pinned ? this.pinned : this.normal;
    if (order.at(-1) === id) return;
    order.splice(order.indexOf(id), 1); order.push(id);
    this.reindex();
  }

  /** Native focus observation also updates MRU; raising alone does not activate. */
  observeFocus(id?: string) {
    if (id === this.focused) return;
    if (id && !this.windows[id]?.visible) return;
    batch(() => {
      if (this.focused && this.windows[this.focused]) this.setWindows(this.focused, "active", false);
      this.focused = id;
      if (id) { this.setWindows(id, "active", true); this.recent = [id, ...this.recent.filter(key => key !== id)]; }
    });
  }

  private clearFocus(id: string) { if (this.focused === id) this.observeFocus(); }
  private reindex() {
    batch(() => {
      [...this.normal, ...this.pinned].forEach((id, index) => this.setWindows(id, "rank", index + 1));
      this.changed[1](n => n + 1);
    });
  }
  dispose() {
    batch(() => {
      for (const id of Object.keys(this.surfaces)) this.setSurfaces(id, undefined!);
      for (const id of Object.keys(this.windows)) this.setWindows(id, undefined!);
      this.normal = []; this.pinned = []; this.recent = []; this.focused = undefined;
      this.changed[1](n => n + 1);
    });
  }
}
