/** Display-only projection. Exact graphs/comparison remain in the read worker. */
import { freeze, type DeepReadonly } from "../../block-tree/commit-capture";
import type { OccurrenceTree, SubtreeResult } from "../types";
import { textRuns } from "../preview-text";
export interface PreviewNode { id: string; type: string; caption: string; runs: { text: string; classes: string }[]; empty: boolean; stop: boolean; children: Array<PreviewNode | "external"> }
export interface CompactPreview { blockId: string; revisionId: string; status: SubtreeResult["status"]; message?: string; missingDependencies: boolean; root?: PreviewNode }
export function compactPreview(result: DeepReadonly<SubtreeResult>): DeepReadonly<CompactPreview> {
  const fragment = result.fragment;
  const root = fragment?.tree?.contentKey ?? Object.values(fragment?.contents ?? {}).find(c => c.payload.id === result.blockId)?.key;
  const visit = (key: string, tree?: DeepReadonly<OccurrenceTree>): PreviewNode => {
    const content = fragment!.contents[key], metadata = content.payload.metadata as { name?: string; title?: string } | undefined;
    return { id: String(content.payload.id ?? ""), type: content.viewType, caption: metadata?.name ?? metadata?.title ?? content.viewType.replace(/-block$/, "").replaceAll("-", " "),
      runs: ["standoff-editor-block", "plain-text-block", "code-mirror-block"].includes(content.viewType) ? textRuns(content, fragment!) : [],
      empty: !content.inlineContent.length && !content.payload.text, stop: !!(tree?.cycle || tree?.excludedReference),
      children: tree?.cycle || tree?.excludedReference ? [] : (tree?.children ?? []).filter(c => c.slot?.kind !== "inline-content").map(c => c.excludedReference ? "external" : visit(c.contentKey, c)) };
  };
  return freeze({ blockId: result.blockId, revisionId: result.revisionId, status: result.status, ...(result.message ? { message: result.message } : {}),
    missingDependencies: !!fragment?.diagnostics.some(d => !d.available), ...(root && fragment ? { root: visit(root, fragment.tree) } : {}) });
}
