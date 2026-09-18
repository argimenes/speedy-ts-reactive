import { For, Show } from "solid-js";
import type { DeepReadonly } from "../block-tree/commit-capture";
import type { CompactPreview, PreviewNode } from "../history/preview";
const containers = new Set(["document-block", "container-block", "page-block", "fixed-size-page-block", "indented-list-block", "tab-row-block", "tab-block", "document-tab-row-block", "document-tab-block", "grid-block", "grid-row-block", "grid-cell-block", "table-block", "table-row-block", "table-cell-block", "left-margin-block", "right-margin-block"]);
function Node(props: { value: DeepReadonly<PreviewNode> }) {
  const text = () => ["standoff-editor-block", "plain-text-block", "code-mirror-block"].includes(props.value.type);
  return <div class="block-history-node" data-history-block-id={props.value.id}>
    <Show when={text()} fallback={<><div class="block-history-node-label">{props.value.caption}</div><Show when={!containers.has(props.value.type)}><p class="block-history-placeholder">Static preview unavailable for this Block type. Its tools and media are not running.</p></Show></>}>
      <p class="block-history-text"><For each={props.value.runs}>{run => <span class={run.classes}>{run.text}</span>}</For><Show when={props.value.empty}><span class="block-history-muted">Empty text</span></Show></p>
    </Show>
    <Show when={props.value.stop} fallback={<For each={props.value.children}>{child => child === "external" ? <p class="block-history-placeholder">Reference — historical target not included.</p> : <Node value={child} />}</For>}>
      <p class="block-history-placeholder">Reference — traversal stops here.</p>
    </Show>
  </div>;
}
export function CompactPreviewView(props: { value: DeepReadonly<CompactPreview> }) {
  const labels: Record<string, string> = { deleted: "This Block was deleted.", "not-yet-created": "This Block had not been created.", "unknown-block": "This Block is not present in the recorded history.", "absent-occurrence": "This occurrence is not present at this revision.", "ambiguous-occurrence": "More than one historical occurrence matches this Block.", incomplete: "This historical state is incomplete.", unsupported: "This historical state is not supported by the preview.", unplaced: "This Block existed without a placement in the Document." };
  return <div class="block-history-fragment"><Show when={props.value.status !== "available"}><p role="status">{props.value.message ?? labels[props.value.status]}</p></Show>
    <Show when={props.value.root}>{root => <Node value={root()} />}</Show>
    <Show when={props.value.missingDependencies}><p class="block-history-muted">Some referenced material is unavailable in this historical view.</p></Show>
  </div>;
}
