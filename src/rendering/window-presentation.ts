import { batch, createComputed, createSignal, onCleanup, untrack, type Accessor } from "solid-js";
import type { WindowPresentation, WindowPresentationInstance } from "../runtime/window-presentation";
import { collapsedMarginWindowWidth } from "./document-margins";
import type { FloatingWindowSize } from "./floating-window-resize";

interface WindowPresentationOptions {
  element: Accessor<HTMLElement | undefined>;
  enabled: Accessor<boolean>;
  expandedSize: Accessor<FloatingWindowSize>;
  minimumWidth: Accessor<number>;
  marginsCollapsed: Accessor<boolean>;
  automaticCollapsed: Accessor<boolean>;
  collapseWithFocus(activate: () => void): void;
  closeDrawer(): void;
  /** CSS-sized legacy windows pin their normal dimensions before narrowing. */
  captureExpandedSize?(size: FloatingWindowSize): void;
}

/** Shared geometry adapter for canonical windows and the legacy document shell.
 * No observer, authored write or document-tree reconstruction on presentation changes. */
export function createWindowPresentation(slot: WindowPresentation, options: WindowPresentationOptions) {
  const [requested, setRequested] = createSignal(false);
  const [reduction, setReduction] = createSignal(0);
  const [instance, setInstance] = createSignal<WindowPresentationInstance>();
  const requestMarginCollapse = (next: boolean) => {
    if (next === requested()) return;
    if (next) options.collapseWithFocus(() => {
      const size = options.expandedSize(), root = options.element();
      const rect = root?.getBoundingClientRect();
      const width = rect?.width || size.width;
      options.captureExpandedSize?.({ width, height: rect?.height || size.height });
      const narrowed = root ? collapsedMarginWindowWidth(root, width, options.minimumWidth()) : width;
      batch(() => { setReduction(width - narrowed); setRequested(true); });
    });
    else batch(() => {
      setRequested(false); setReduction(0);
      if (!options.automaticCollapsed()) options.closeDrawer();
    });
  };
  createComputed(() => {
    const contribution = slot.contribution(), enabled = options.enabled();
    untrack(() => {
      if (!enabled || !contribution) { setInstance(undefined); return; }
      let live = true;
      onCleanup(() => { live = false; requestMarginCollapse(false); });
      setInstance(contribution.create({
        marginsCollapsed: options.marginsCollapsed,
        requestMarginCollapse: next => { if (live) requestMarginCollapse(next); },
      }));
    });
  });
  return {
    requested,
    classes: () => Object.fromEntries((instance()?.className() ?? "").split(/\s+/).filter(Boolean).map(name => [name, true])),
    control: () => instance()?.control,
    presentedSize: (): FloatingWindowSize => {
      const size = options.expandedSize();
      return { width: requested() ? Math.max(Math.min(size.width, options.minimumWidth()), size.width - reduction()) : size.width, height: size.height };
    },
    expandedFromPresented: (size: FloatingWindowSize): FloatingWindowSize => ({ width: size.width + (requested() ? reduction() : 0), height: size.height }),
  };
}
