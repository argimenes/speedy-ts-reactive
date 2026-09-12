import { createStore } from "solid-js/store";
import type { NodeKey } from "../block-tree/types";
import type { MountRegistry, NativeTextSelection } from "./mounts";

export interface FocusRequest {
  caret?: "start" | "end" | NativeTextSelection;
  reveal?: boolean;
  raiseWindow?: boolean;
  reason?: string;
}

interface FocusState {
  focusedKey?: NodeKey;
  lastFocusedKey?: NodeKey;
  requestToken: number;
}

export class FocusService {
  readonly state: FocusState;
  private readonly setState: (...args: any[]) => void;
  private pending?: { nodeKey: NodeKey; request: FocusRequest; token: number };
  private readonly unsubscribe: () => void;

  constructor(private readonly mounts: MountRegistry) {
    const [state, setState] = createStore<FocusState>({ requestToken: 0 });
    this.state = state;
    this.setState = setState;
    this.unsubscribe = mounts.subscribe((nodeKey) => {
      if (this.pending?.nodeKey === nodeKey) this.applyPending();
    });
  }

  request(nodeKey: NodeKey, request: FocusRequest = {}): void {
    const token = this.state.requestToken + 1;
    this.setState({
      lastFocusedKey: this.state.focusedKey,
      focusedKey: nodeKey,
      requestToken: token,
    });
    this.pending = { nodeKey, request, token };
    this.applyPending();
  }

  adopt(nodeKey: NodeKey): void {
    if (this.state.focusedKey === nodeKey) return;
    this.pending = undefined;
    this.setState({
      lastFocusedKey: this.state.focusedKey,
      focusedKey: nodeKey,
      requestToken: this.state.requestToken + 1,
    });
  }

  clearRemoved(nodeKey: NodeKey): void {
    if (this.pending?.nodeKey === nodeKey) this.pending = undefined;
    if (this.state.focusedKey === nodeKey) this.setState("focusedKey", undefined);
  }

  private applyPending(): void {
    const pending = this.pending;
    if (!pending || pending.token !== this.state.requestToken) return;
    const handle = this.mounts.get(pending.nodeKey);
    if (!handle) return;
    handle.focus();
    const caret = pending.request.caret;
    if (handle.restoreSelection && caret) {
      const length =
        handle.focusElement instanceof HTMLTextAreaElement
          ? handle.focusElement.value.length
          : 0;
      const selection =
        caret === "start"
          ? { start: 0, end: 0, direction: "none" as const }
          : caret === "end"
            ? { start: length, end: length, direction: "none" as const }
            : caret;
      handle.restoreSelection(selection);
      this.mounts.rememberSelection(pending.nodeKey, selection);
    } else if (handle.restoreInlineSelection && caret) {
      const length = [...(handle.captureText?.() ?? "")].length;
      const position = caret === "start" ? 0 : caret === "end" ? length : caret.end;
      handle.restoreInlineSelection({ anchor: position, head: position });
    }
    this.pending = undefined;
  }

  dispose(): void {
    this.unsubscribe();
    this.pending = undefined;
  }
}
