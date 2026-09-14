import { createStore } from "solid-js/store";
import type { NodeKey } from "../block-tree/types";
import type { FocusService } from "./focus";
import type { MountRegistry } from "./mounts";

export interface OverlayDescriptor {
  key: NodeKey;
  ownerKey: NodeKey;
  viewType: "entity-search" | "find-replace" | "annotation-panel" | "context-menu";
  anchor: { x: number; y: number };
  title?: string;
  returnFocusKey?: NodeKey;
  returnSelection?: { start: number; end: number; direction: "forward" | "backward" | "none" };
  returnInlineSelection?: { anchor: number; head: number };
  returnElement?: HTMLElement;
  returnDomRange?: Range;
  annotationIndexes?: number[];
  annotationPreview?: { start: number; end: number };
  entityRanges?: Array<{ nodeKey: string; start: number; end: number }>;
  entityRevision?: number;
  entityQuery?: string;
  entityCandidates?: boolean;
}

let overlayCounter = 0;

export class OverlayService {
  readonly overlays: OverlayDescriptor[];
  private readonly setOverlays: (...args: any[]) => void;

  constructor(
    private readonly mounts: MountRegistry,
    private readonly focus: FocusService,
  ) {
    const [overlays, setOverlays] = createStore<OverlayDescriptor[]>([]);
    this.overlays = overlays;
    this.setOverlays = setOverlays;
  }

  open(input: Omit<OverlayDescriptor, "key" | "returnFocusKey">): NodeKey {
    const key = `session-overlay:${++overlayCounter}`;
    const returnFocusKey = this.focus.state.focusedKey ?? input.ownerKey;
    const handle = this.mounts.get(returnFocusKey);
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    const external = active && active !== document.body && !handle?.root.contains(active) ? active : undefined;
    const selection = document.getSelection();
    this.setOverlays(this.overlays.length, {
      ...input,
      key,
      returnFocusKey,
      returnSelection: handle?.captureSelection?.(),
      returnInlineSelection: handle?.captureInlineSelection?.(),
      returnElement: external,
      returnDomRange: external && selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : undefined,
    });
    queueMicrotask(() => this.focus.request(key, { reason: "opened-panel" }));
    return key;
  }

  close(key: NodeKey, restoreFocus = true): void {
    const index = this.overlays.findIndex((overlay) => overlay.key === key);
    if (index < 0) return;
    const overlay = this.overlays[index];
    this.setOverlays((items: OverlayDescriptor[]) =>
      items.filter((item: OverlayDescriptor) => item.key !== key),
    );
    this.focus.clearRemoved(key);
    if (restoreFocus && overlay.returnElement?.isConnected) {
      queueMicrotask(() => {
        if (!overlay.returnElement?.isConnected) return;
        overlay.returnElement.focus({ preventScroll: true });
        if (overlay.returnDomRange?.startContainer.isConnected && overlay.returnDomRange.endContainer.isConnected) {
          const selection = document.getSelection(); selection?.removeAllRanges(); selection?.addRange(overlay.returnDomRange);
        }
      });
    } else if (restoreFocus && overlay.returnFocusKey && this.mounts.get(overlay.returnFocusKey)) {
      queueMicrotask(() => {
        this.focus.request(overlay.returnFocusKey!, { reason: "closed-panel", caret: overlay.returnSelection });
        if (overlay.returnInlineSelection) this.mounts.get(overlay.returnFocusKey!)?.restoreInlineSelection?.(overlay.returnInlineSelection);
      });
    }
  }

  previewAnnotation(key: NodeKey, range?: { start: number; end: number }): void {
    const index = this.overlays.findIndex(overlay => overlay.key === key);
    if (index >= 0) this.setOverlays(index, "annotationPreview", range);
  }
  enableEntityCandidates(key: NodeKey, enabled = true) {
    const index = this.overlays.findIndex(overlay => overlay.key === key);
    if (index >= 0) this.setOverlays(index,"entityCandidates",enabled);
  }

  dismissTopWithoutRestoring(): void {
    const top = this.overlays.at(-1);
    if (top) this.close(top.key, false);
  }

  isOverlayKey(key: NodeKey): boolean {
    return this.overlays.some((overlay) => overlay.key === key);
  }

  closeMissingOwners(exists: (key: NodeKey) => boolean): void {
    for (const overlay of [...this.overlays]) {
      if (!exists(overlay.ownerKey)) this.close(overlay.key, false);
    }
  }
}
