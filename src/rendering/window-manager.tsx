import { createContext, createEffect, onCleanup, useContext, type JSX, untrack } from "solid-js";
import { Portal } from "solid-js/web";
import type { ReactiveEditor } from "../reactive-editor/editor";
import type { WorkspaceWindowManager } from "../application/window-manager";
import type { SurfaceKind } from "../runtime/window-manager";
import "./window-manager.css";

interface OwnerContext { manager: WorkspaceWindowManager; windowId: string; surfaceId?: string; modal?: boolean }
const WindowOwner = createContext<OwnerContext>();
export const useManagedWindowOwner = () => useContext(WindowOwner);

/** Own an existing inline app dialog without moving its DOM or changing its
 * focus/dismissal contract. Central focus containment remains A1 work. */
export function ApplicationSurfaceBoundary(props: { children: JSX.Element }) {
  const owner = useContext(WindowOwner);
  if (!owner) return props.children;
  const id = owner.manager.nextSurfaceId();
  const release = owner.manager.registry.registerSurface({ id, ownerWindowId: owner.windowId,
    sourceViewId: owner.manager.registry.windows[owner.windowId].sourceViewId,
    parentSurfaceId: owner.surfaceId, kind: "dialog", modality: "window" });
  onCleanup(release);
  return <WindowOwner.Provider value={{ ...owner, surfaceId: id, modal: true }}>{props.children}</WindowOwner.Provider>;
}

export function WindowManagerPlane(props: { manager?: WorkspaceWindowManager; children: JSX.Element }) {
  if (!props.manager) return props.children;
  const plane = document.createElement("div");
  plane.className = "mwm-window-plane";
  props.manager.plane = plane;
  onCleanup(() => { if (props.manager?.plane === plane) props.manager.plane = undefined; });
  return <>{plane}{props.children}</>;
}

/** Stable parent for a frame and all its portalled children. No transform here:
 * fixed-position tools retain viewport coordinates while sharing the owner rank.
 */
export function ManagedWindowFrame(props: {
  manager: WorkspaceWindowManager; nodeKey: string;
  mounted: boolean; visible: boolean; viewport?: boolean; children: JSX.Element;
}) {
  const manager = props.manager, group = document.createElement("div");
  group.className = `mwm-window-group${props.viewport ? " mwm-window-group--viewport" : ""}`; group.dataset.mwmWindow = props.nodeKey;
  const lease = manager.register(props.nodeKey, group);
  const raise = () => manager.raiseWindow(props.nodeKey);
  const focus = () => { raise(); manager.registry.observeFocus(props.nodeKey); };
  const blur = () => queueMicrotask(() => {
    if (!group.contains(document.activeElement) && manager.registry.windows[props.nodeKey]?.active) manager.registry.observeFocus();
  });
  group.addEventListener("pointerdown", raise, true);
  group.addEventListener("focusin", focus, true);
  group.addEventListener("focusout", blur, true);
  createEffect(() => { group.style.zIndex = String(manager.registry.windows[props.nodeKey]?.rank ?? 0); });
  createEffect(() => lease.activity(props.mounted, props.visible));
  onCleanup(() => {
    group.removeEventListener("pointerdown", raise, true); group.removeEventListener("focusin", focus, true); group.removeEventListener("focusout", blur, true);
    lease.release(); group.remove();
  });
  manager.plane!.append(group);
  return <WindowOwner.Provider value={{ manager, windowId: props.nodeKey }}><Portal mount={group}>{props.children}</Portal></WindowOwner.Provider>;
}

/** Shared ownership/layer adapter only. The existing overlay/component remains
 * responsible for content, placement, focus, dismissal and request cancellation.
 */
export function ApplicationSurfacePortal(props: {
  editor?: ReactiveEditor; ownerKey?: string; sourceViewId?: string;
  id?: string; kind?: SurfaceKind; legacyInline?: boolean; children: JSX.Element;
}) {
  const inherited = useContext(WindowOwner);
  const manager = props.editor?.windowManager ?? inherited?.manager;
  const windowId = untrack(() => props.ownerKey ? manager?.ownerForNode(props.ownerKey) ?? inherited?.windowId : inherited?.windowId);
  const group = windowId ? manager?.groups.get(windowId) : manager?.plane;
  if (!manager || !group) return props.legacyInline ? props.children : <Portal>{props.children}</Portal>;
  const id = props.id ?? manager.nextSurfaceId(), kind = props.kind ?? "overlay";
  const host = document.createElement("div");
  host.className = `mwm-surface mwm-surface--${kind}`;
  if (inherited?.modal) host.style.zIndex = "5";
  host.dataset.mwmSurface = id;
  const release = manager.registry.registerSurface({ id, ownerWindowId: windowId,
    sourceViewId: props.sourceViewId ?? (windowId ? manager.registry.windows[windowId].sourceViewId : "workspace-shell"),
    parentSurfaceId: inherited?.windowId === windowId ? inherited?.surfaceId : undefined, kind, modality: "none" });
  group.append(host);
  createEffect(() => {
    const visible = windowId ? manager.registry.windows[windowId]?.visible ?? false : true;
    if (!windowId) { manager.registry.revision(); host.style.zIndex = String(manager.count() + 1); }
    host.hidden = !visible;
    host.inert = !visible;
  });
  onCleanup(() => { release(); host.remove(); });
  return windowId ? <WindowOwner.Provider value={{ manager, windowId, surfaceId: id, modal: inherited?.modal }}><Portal mount={host}>{props.children}</Portal></WindowOwner.Provider>
    : <Portal mount={host}>{props.children}</Portal>;
}
