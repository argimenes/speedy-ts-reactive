import { Show, createComponent, getOwner, onCleanup, runWithOwner } from "solid-js";
import type { ReactiveEditor } from "../reactive-editor/editor";
import type { BlockFeatureCapabilities, BlockRuntime, FeatureScope } from "../feature-api";

// Traverse the requested field through Solid proxies so nested payload updates
// remain reactive. Never return the mutable canonical object to a feature.
function detached(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(detached);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, detached(item)]));
  return value;
}

/** Transitional application adapter. Features never receive the captured editor. */
export function blockFeatureCapabilities(editor: ReactiveEditor, scope: FeatureScope): BlockFeatureCapabilities {
  const requireActive = () => { if (!scope.active()) throw new Error(`Feature ${scope.owner} is disposed`); };
  const requireOwned = (key: string) => {
    requireActive();
    const node = editor.node(key);
    if (!node || editor.registry.owner(node.viewType) !== scope.owner) throw new Error(`Feature ${scope.owner} cannot mutate an unowned Block`);
  };
  // Called inside each mounted view's Solid owner, never at type registration.
  const instanceRuntime = (key: string): BlockRuntime => {
    const owner = getOwner();
    if (!owner) throw new Error("Block applications require a mounted Solid owner");
    let mounted = true;
    onCleanup(() => { mounted = false; });
    const requireInstance = () => {
      if (!mounted) throw new Error(`Block instance ${key} is disposed`);
      requireOwned(key);
    };
    const runtime: BlockRuntime = {
      nodeKey: key,
      field(name) { return detached(editor.node(key)?.payload[name]); },
      setField(name, value, label) { requireInstance(); editor.commands.setPayloadField(key, name, value, label); },
      removeAndFocusFallback() {
        requireInstance();
        const fallback = editor.focusFallback(key);
        editor.focus.clearRemoved(key); editor.commands.remove(key);
        if (fallback) scope.defer(() => editor.focus.request(fallback, { reason: "feature-remove", caret: "start" }));
      },
      own(dispose) {
        requireInstance();
        let live = true;
        const release = () => { if (!live) return; live = false; dispose(); };
        runWithOwner(owner, () => onCleanup(release));
        return release;
      },
      mountWidget(element) {
        requireInstance();
        return runtime.own(editor.mounts.register(key, { root: element, focusElement: element, inputPolicy: "opaque-widget", focus: () => element.focus({ preventScroll: true }) }));
      },
    };
    return runtime;
  };
  return {
    register: {
      block(definition) {
        requireActive();
        const Instance = (props: { nodeKey: string }) => createComponent(definition.view, { runtime: instanceRuntime(props.nodeKey) });
        scope.own(editor.registry.register({ ...definition, view: props => <Show when={scope.active()}><Instance nodeKey={props.nodeKey} /></Show> }, scope.owner));
      },
      command(definition) { requireActive(); scope.own(editor.commandRegistry.register(definition, scope.owner)); },
      binding(definition) { requireActive(); scope.own(editor.bindings.register(definition, scope.owner)); },
      action(definition) { requireActive(); scope.own(editor.featureActions.register(definition, scope.owner)); },
    },
    blocks: {
      get(key) {
        const node = editor.node(key);
        return node && { key: node.key, viewId: node.viewId, type: node.viewType, children: [...node.children], isRoot: editor.projections.get(node.viewId)?.state.rootKey === key };
      },
      insert(dto, destination) {
        requireActive();
        if (!dto.type || editor.registry.owner(dto.type) !== scope.owner) throw new Error(`Feature ${scope.owner} cannot insert an unowned Block type`);
        return editor.commands.insert(dto, destination);
      },
      focusPlacement(placement, view) { scope.defer(() => { const node = editor.nodeForPlacementInView(placement, view); if (node) editor.focus.request(node.key, { reason: "feature-create" }); }); },
      bounds(key) { const rect = editor.mounts.get(key)?.root.getBoundingClientRect(); return rect && { left: rect.left, top: rect.top }; },
    },
  };
}
