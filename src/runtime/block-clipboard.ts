import { createSignal } from "solid-js";
import { captureBlocks, cloneBlocks, type BlockFragment } from "../block-tree/clipboard";
import { deriveLocations } from "../block-tree/repository";
import type { Destination } from "../block-tree/types";
import type { ReactiveEditor } from "../reactive-editor/editor";

const [clipboard, setClipboard] = createSignal<{ fragment: BlockFragment; cut: boolean }>();

export class BlockClipboardService {
  readonly owner = crypto.randomUUID();
  private gap?: { parentKey: string; index: number; viewId: string };
  private readonly open = createSignal<string>();
  readonly viewId = this.open[0];
  constructor(private editor: ReactiveEditor) {}
  available() { return !!clipboard(); }
  dismiss() { this.gap = undefined; this.open[1](undefined); }
  run(id: string, event?: Event): boolean {
    if (!["selection.copy", "selection.cut", "selection.paste", "selection.delete"].includes(id)) return false;
    if (event instanceof KeyboardEvent && event.repeat) return true;
    try {
      if (id === "selection.paste") this.paste();
      else if (id === "selection.copy") this.copy();
      else this.remove(id === "selection.cut");
    } catch (error) { this.editor.blockSelection.setMessage(error instanceof Error ? error.message : String(error)); }
    return true;
  }
  copy() {
    const items = this.editor.blockSelection.actionTargets(); if (!items.length) return;
    setClipboard({ fragment: captureBlocks(this.editor.repository.readState(), items.map(item => item.placementKey)), cut: false });
    this.editor.blockSelection.setMessage(`Copied ${items.length} Block(s). Select a destination Block and paste after it.`);
  }
  remove(cut: boolean) {
    const selection = this.editor.blockSelection, items = selection.actionTargets(); if (!items.length) return;
    const state = this.editor.repository.readState(), location = deriveLocations(state).get(items[0].placementKey);
    if (!location || location.slot.kind !== "children") throw new Error("Select Blocks in a child list.");
    const parent = Object.values(state.placements).find(p => p.contentKey === location.ownerContentKey)!;
    const fragment = cut ? captureBlocks(state, items.map(item => item.placementKey)) : undefined;
    this.editor.commands.transaction(cut ? "Cut selected Blocks" : "Delete selected Blocks", () => {
      for (const item of items) this.editor.commands.remove(item.placementKey);
    });
    if (fragment) setClipboard({ fragment, cut: true });
    this.gap = { parentKey: parent.key, index: location.index ?? 0, viewId: items[0].viewId };
    this.open[1](items[0].viewId);
    selection.clear(); selection.setMessage(`${cut ? "Cut" : "Deleted"} ${items.length} Block(s). Undo restores them.`);
    this.focus();
  }
  paste() {
    const saved = clipboard(); if (!saved) throw new Error("Copy or cut Blocks first. External clipboard data is not imported here.");
    const items = this.editor.blockSelection.actionTargets(), last = items.at(-1);
    let destination: Destination, viewId: string;
    if (last) { destination = { kind: "after", anchorKey: last.placementKey }; viewId = last.viewId; }
    else if (this.gap) {
      destination = { kind: "at", parentKey: this.gap.parentKey, index: Math.min(this.gap.index, this.editor.commands.childrenOf(this.gap.parentKey).length) };
      viewId = this.gap.viewId;
    } else throw new Error("Select a destination Block first.");
    const existingIds = new Set(Object.values(this.editor.repository.readState().contents).map(c => c.payload.id).filter(Boolean));
    const preserve = saved.cut && !Object.values(saved.fragment.state.contents).some(c => existingIds.has(c.payload.id));
    const fragment = cloneBlocks(saved.fragment, preserve);
    const keys = this.editor.commands.insertFragment(fragment, destination);
    setClipboard({ ...saved, cut: false });
    this.editor.blockSelection.replaceKeys(keys.map(key => this.editor.nodeForPlacementInView(key, viewId)!.key));
    this.dismiss();
    this.editor.blockSelection.setMessage(`Pasted ${keys.length} Block(s).`);
    this.focus();
  }
  private focus() {
    queueMicrotask(() => {
      const key = this.editor.blockSelection.state.leadKey;
      const handle = key && this.editor.mounts.get(key)?.root.querySelector<HTMLButtonElement>(":scope > [data-block-selection-handle]");
      if (handle) handle.focus({ preventScroll: true });
      else document.querySelector<HTMLElement>(`[data-block-selection-inspector="${this.owner}"]`)?.focus({ preventScroll: true });
    });
  }
}
