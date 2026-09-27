import { onMount } from "solid-js";
import type { BlockRuntime, BlockFeatureCapabilities, CodexFeature, FeatureScope } from "../../feature-api";
function Counter(props: { runtime: BlockRuntime }) {
  const runtime = props.runtime;
  const count = () => Number(runtime.field("count")) || 0;
  let root!: HTMLDivElement;
  onMount(() => runtime.mountWidget(root));
  return <div ref={root} class="canvas-counter" tabIndex={-1} data-runtime-key={runtime.nodeKey} data-block-type="canvas-counter-block">
    <strong>Counter</strong><output aria-label="Count">{count()}</output>
    <button type="button" aria-label="Decrease counter" onClick={() => runtime.setField("count", count() - 1, "Decrease counter")}>−</button>
    <button type="button" aria-label="Increase counter" onClick={() => runtime.setField("count", count() + 1, "Increase counter")}>+</button>
  </div>;
}
/** Small inline qualification pilot. Every update is authored; there are no drafts. */
export function createCanvasCounterFeature(capabilities: (scope: FeatureScope) => BlockFeatureCapabilities): CodexFeature {
  return { id: "canvas-counter", activate(scope) { capabilities(scope).register.block({ type: "canvas-counter-block", create: () => ({ type: "canvas-counter-block", count: 0 }), view: Counter, capabilities: ["control", "opaque-widget", "selectable"] }); } };
}
