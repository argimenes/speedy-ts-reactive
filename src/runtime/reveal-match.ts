import type { ReactiveEditor } from "../reactive-editor/editor";
import type { SearchMatch } from "./text-search";

/** Navigation only: no canonical writes and no focus transfer. */
export async function revealMatch(editor: ReactiveEditor, match: SearchMatch, current = () => true): Promise<boolean> {
  if (!current()) return false;
  for (let i = 0; i + 1 < match.path.length; i++) {
    const node = editor.node(match.path[i]);
    if (node && ["tab-row-block", "document-tab-row-block", "sticky-tab-row-block", "surface-block"].includes(node.viewType)) editor.setViewChild(node.key, match.path[i + 1]);
  }
  await new Promise(resolve => setTimeout(resolve, 0));
  if (!current()) return false;
  const range = match.ranges[0], mount = editor.mounts.get(range.nodeKey);
  if (!mount) return false;
  const point = range.coordinate === "cell" ? mount.inlineBoundary?.(range.start) : undefined;
  (point?.node.parentElement ?? mount.root).scrollIntoView?.({ block: "center", inline: "nearest" });
  return true;
}
