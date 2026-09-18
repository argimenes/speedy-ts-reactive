/** Original full-graph renderer retained only as a parity/transport oracle. */
import { For, Show } from "solid-js";
import type { DeepReadonly } from "../../block-tree/commit-capture";
import { textRuns } from "../preview-text";
import type { HistoricalFragment, OccurrenceTree, SubtreeResult } from "../types";
const containers = new Set(["document-block", "container-block", "page-block", "fixed-size-page-block", "indented-list-block", "tab-row-block", "tab-block", "document-tab-row-block", "document-tab-block", "grid-block", "grid-row-block", "grid-cell-block", "table-block", "table-row-block", "table-cell-block", "left-margin-block", "right-margin-block"]);
const textTypes = new Set(["standoff-editor-block", "plain-text-block", "code-mirror-block"]);
const typeLabel = (type: string) => type.replace(/-block$/, "").replaceAll("-", " ");


function HistoricalBlock(props: { fragment: DeepReadonly<HistoricalFragment>; contentKey: string; tree?: DeepReadonly<OccurrenceTree> }) {
  const content = () => props.fragment.contents[props.contentKey];
  const childTrees = () => props.tree?.children.filter(child => child.slot?.kind !== "inline-content") ?? [];
  const caption = () => {
    const metadata = content()?.payload.metadata as { name?: string; title?: string } | undefined;
    return metadata?.name ?? metadata?.title ?? typeLabel(content()?.viewType ?? "Block");
  };
  return <Show when={content()} fallback={<p class="block-history-muted">Historical content is unavailable.</p>}>
    <div class="block-history-node" data-history-block-id={String(content().payload.id ?? "")}>
      <Show when={textTypes.has(content().viewType)} fallback={<>
        <div class="block-history-node-label">{caption()}</div>
        <Show when={!containers.has(content().viewType)}><p class="block-history-placeholder">Static preview unavailable for this Block type. Its tools and media are not running.</p></Show>
      </>}>
        <p class="block-history-text"><For each={textRuns(content(), props.fragment)}>{run => <span class={run.classes}>{run.text}</span>}</For><Show when={!content().inlineContent.length && !content().payload.text}><span class="block-history-muted">Empty text</span></Show></p>
      </Show>
      <Show when={props.tree?.cycle || props.tree?.excludedReference} fallback={<For each={childTrees()}>{child => child.excludedReference ? <p class="block-history-placeholder">Reference — historical target not included.</p> : <HistoricalBlock fragment={props.fragment} contentKey={child.contentKey} tree={child} />}</For>}>
        <p class="block-history-placeholder">Reference — traversal stops here.</p>
      </Show>
    </div>
  </Show>;
}

export function HistoricalPreview(props: { result: DeepReadonly<SubtreeResult> }) {
  const root = () => props.result.fragment?.tree?.contentKey ?? Object.values(props.result.fragment?.contents ?? {}).find(c => c.payload.id === props.result.blockId)?.key;
  const statusLabels: Record<string, string> = { deleted: "This Block was deleted.", "not-yet-created": "This Block had not been created.", "unknown-block": "This Block is not present in the recorded history.", "absent-occurrence": "This occurrence is not present at this revision.", "ambiguous-occurrence": "More than one historical occurrence matches this Block.", incomplete: "This historical state is incomplete.", unsupported: "This historical state is not supported by the preview.", unplaced: "This Block existed without a placement in the Document." };
  return <div class="block-history-fragment">
    <Show when={props.result.status !== "available"}><p role="status">{props.result.message ?? statusLabels[props.result.status]}</p></Show>
    <Show when={root() && props.result.fragment}><HistoricalBlock fragment={props.result.fragment!} contentKey={root()!} tree={props.result.fragment?.tree} /></Show>
    <Show when={props.result.fragment?.diagnostics.some(d => !d.available)}><p class="block-history-muted">Some referenced material is unavailable in this historical view.</p></Show>
  </div>;
}

