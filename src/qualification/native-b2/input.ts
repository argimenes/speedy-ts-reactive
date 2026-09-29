/** B2 experiment only; installed explicitly by the qualification host, not Flint UI. */
import type { ReactiveEditor } from "../../reactive-editor/editor";
import { resolveWiki, type LinkTarget } from "./markdown";
import { resourceOwner, resourceSource } from "../../block-tree/resource-identity";

export function convertCompletion(editor: ReactiveEditor, key: string, caret: number, targets: readonly LinkTarget[]) {
  const node = editor.node(key); if (node?.viewType !== "standoff-editor-block" || editor.mounts.get(key)?.composing) return false;
  if (editor.blockQueries.ancestors(key).some(n => /code/.test(n.viewType)) || (node.payload.metadata as any)?.code) return false;
  if (node.inlineContent.length > 2048 || !Number.isInteger(caret) || caret < 0 || caret > node.inlineContent.length) return false;
  const cells = node.inlineContent.map(k => editor.node(k));
  if (cells.some(c => c?.viewType !== "text-cell")) return false;
  const prefix = cells.slice(0, caret).map(c => c!.payload.text).join("");
  const match = /(?:^|[^\\*])\*\*([^*\n\[\]`]+)\*\*$/.exec(prefix);
  const wiki = /(?:^|[^\\\[])\[\[([^\[\]|\n]+)\]\]$/.exec(prefix);
  const target = wiki && resolveWiki(wiki[1], targets);
  const heading = prefix === "# ";
  if (!match && !target && !heading) return false;
  const body = match?.[1] ?? (target ? wiki![1] : ""), length = [...body].length;
  const start = heading ? 0 : caret - length - 4, end = heading ? 2 : caret;
  editor.commands.transaction("Consume Markdown", () => {
    if (heading) {
      const properties = (editor.repository.readState().contents[node.contentKey].payload.blockProperties as Record<string, unknown>[] ?? []).filter(p => p.type !== "block/font/size" && p.type !== "block/font/size/h1");
      editor.commands.setPayloadField(key, "blockProperties", [...properties, { id: crypto.randomUUID(), type: "block/font/size", value: "h1" }]);
    } else {
      const properties = editor.repository.readState().contents[node.contentKey].payload.standoffProperties as Record<string, unknown>[] ?? [];
      editor.commands.setPayloadField(key, "standoffProperties", [...properties, { id: crypto.randomUUID(), type: match ? "style/bold" : "codex/block-reference", start: start + 2, end: start + length + 1,
        ...(target && !match ? { value: target.blockId, metadata: { documentId: target.documentId } } : {}) }]);
    }
    if (heading) editor.commands.replaceInlineRange(key, 0, 2, "");
    else {
      // Add semantics on the literal body first. Existing command remapping then
      // adjusts both old and new annotations in the same transaction draft.
      editor.commands.replaceInlineRange(key, end - 2, end, "");
      editor.commands.replaceInlineRange(key, start, start + 2, "");
    }
  });
  const next = heading ? 0 : caret - 4;
  editor.selections.setPrimary(key, node.contentKey, node.viewId, next);
  queueMicrotask(() => editor.mounts.get(key)?.restoreInlineSelection?.({ anchor: next, head: next }));
  return true;
}

/** Core host adapter. One listener after the native gateway on the same capture
 * target, not middleware. Most typing returns before a node/graph/selection read.
 * Only completion triggers schedule work after native caret restoration. */
export function installMarkdownExperiment(editor: ReactiveEditor, document: Document, enrolled: (resourceId: string) => boolean, targets: () => readonly LinkTarget[]) {
  let active = true;
  const complete = (event: Event) => {
    const input = event as InputEvent;
    if (!active || input.inputType !== "insertText" || !["*", "]", " "].includes(input.data ?? "") || input.isComposing || !event.defaultPrevented) return;
    const element = event.target instanceof Element ? event.target : undefined;
    if (element?.closest('input, textarea, select, [role="dialog"], [role="menu"]')) return;
    const resolved = editor.mounts.resolveEvent(event), key = resolved?.nodeKey;
    if (!key || resolved.handle.inputPolicy !== "standoff" || resolved.handle.composing || editor.selections.sets[key]?.items.length > 1 || editor.crossText.range()) return;
    const node = editor.node(key); if (!node) return;
    // Ordinary word spaces cannot complete our sole heading gesture. Avoid
    // resource ancestry lookup and scheduling on that common typing path.
    if (input.data === " " && (node.inlineContent.length !== 2 || editor.node(node.inlineContent[0])?.payload.text !== "#")) return;
    const owner = resourceOwner(editor.repository.readState(), node.contentKey), source = owner && resourceSource(owner);
    if (source?.scope !== "document" || !enrolled(source.resourceId)) return;
    const revision = editor.repository.state.revision;
    queueMicrotask(() => {
      if (!active || editor.repository.state.revision !== revision || !editor.node(key) || resolved.handle.composing) return;
      const selection = resolved.handle.captureInlineSelection?.();
      if (selection && selection.anchor === selection.head) convertCompletion(editor, key, selection.head, targets());
    });
  };
  document.addEventListener("beforeinput", complete, true);
  return () => { active = false; document.removeEventListener("beforeinput", complete, true); };
}
