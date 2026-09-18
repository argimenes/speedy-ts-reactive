import { createStore } from "solid-js/store";
import type { ReactiveEditor } from "../reactive-editor/editor";
import { blockAncestors } from "./block-menu-actions";
import { createSessionHistorySource, type SessionHistoryRecorder, type ReadonlyHistorySession, type HistorySelectionResult, type SessionTimelineEntry } from "../history/ui-session-source";

/** UI state only. Historical readers never receive the editor's command capability. */
export class BlockHistorySession {
  readonly owner = "block-history-panel";
  readonly state;
  private setState;
  private recorder?: { root: string; source: SessionHistoryRecorder };
  private session?: ReadonlyHistorySession;
  private request?: AbortController;
  private generation = 0;
  private origin?: string;
  private inlineSelection?: { anchor: number; head: number };
  private nativeSelection?: { start: number; end: number; direction: "forward" | "backward" | "none" };
  constructor(private editor: ReactiveEditor, private createSource = createSessionHistorySource) {
    [this.state, this.setState] = createStore<{
      open: boolean; viewId?: string; title: string; message: string; error: string;
      loading: boolean; selecting: boolean; incomplete: boolean; entries: readonly SessionTimelineEntry[];
      nextCursor?: string; selectedRevisionId?: string; result?: HistorySelectionResult;
    }>({ open: false, title: "Block history", message: "", error: "", loading: false, selecting: false, incomplete: false, entries: [] });
  }
  canOpen(key: string): boolean {
    const node = this.editor.node(key);
    return !!node && typeof node.payload.id === "string" && blockAncestors(this.editor, key).some(n => n.viewType === "document-block");
  }
  open(key: string): void {
    const node = this.editor.node(key);
    if (!node) return;
    this.close(false);
    const menu = this.editor.overlays.overlays.find(o => o.viewType === "context-menu" && o.ownerKey === key);
    this.origin = menu?.returnFocusKey ?? (this.editor.node(this.editor.focus.state.focusedKey ?? "") ? this.editor.focus.state.focusedKey : key);
    const handle = this.editor.mounts.get(this.origin!);
    this.inlineSelection = menu?.returnInlineSelection ?? handle?.captureInlineSelection?.();
    this.nativeSelection = menu?.returnSelection ?? handle?.captureSelection?.();
    if (menu) this.editor.overlays.close(menu.key, false);
    const metadata = node.payload.metadata as { name?: string; title?: string } | undefined;
    const inlineTitle = node.inlineContent.slice(0, 60).map(key => String(this.editor.node(key)?.payload.text ?? "")).join("");
    const title = metadata?.name ?? metadata?.title ?? (inlineTitle || String(node.payload.text ?? node.payload.id)).slice(0, 60);
    this.setState({ open: true, viewId: node.viewId, title, message: "Session-only history. Preparing the first recorded state…", loading: true, incomplete: false, error: "", entries: [], result: undefined, nextCursor: undefined, selectedRevisionId: undefined });
    this.editor.focus.request(this.owner, { reason: "block-history" });
    const request = this.request = new AbortController(), generation = ++this.generation;
    void (async () => {
      // Let the initial panel paint before taking its bounded enrollment baseline.
      await new Promise(resolve => setTimeout(resolve, 0));
      if (request.signal.aborted) return;
      const root = blockAncestors(this.editor, key).find(n => n.viewType === "document-block");
      if (!root) throw Error("Select a Block inside a Document to view its history.");
      if (this.recorder && this.recorder.root !== root.placementKey) throw Error("This session is recording another Document. Open that Document's history instead.");
      this.recorder ??= { root: root.placementKey, source: this.createSource(this.editor.repository, root.placementKey) };
      const placement = this.editor.repository.readState().placements[node.placementKey];
      const session = await this.recorder.source.open({ blockId: String(node.payload.id), placementId: placement.placementId ?? `session:${placement.key}` }, request.signal);
      const page = await session.timeline({ limit: 25, signal: request.signal });
      if (generation !== this.generation || request.signal.aborted) return;
      this.session = session;
      this.setState({ entries: page.entries, nextCursor: page.nextCursor, loading: false, message: session.message, incomplete: session.status === "incomplete" });
      await this.select(page.entries.at(-1)?.revisionId ?? session.headRevisionId);
    })().catch(error => this.failed(error, generation));
  }
  private failed(error: unknown, generation: number) {
    if (generation !== this.generation || !this.state.open || (error as Error)?.name === "AbortError") return;
    this.setState({ loading: false, selecting: false, error: error instanceof Error ? error.message : String(error) });
  }
  async more(): Promise<void> {
    if (!this.session || !this.state.nextCursor || this.state.loading || this.state.selecting) return;
    const request = this.request = new AbortController(), generation = ++this.generation;
    this.setState({ loading: true, error: "" });
    try {
      const page = await this.session.timeline({ cursor: this.state.nextCursor, limit: 25, signal: request.signal });
      if (generation !== this.generation || request.signal.aborted) return;
      this.setState({ entries: [...this.state.entries, ...page.entries], nextCursor: page.nextCursor, loading: false, message: this.session.message, incomplete: this.session.status === "incomplete" });
    } catch (error) { this.failed(error, generation); }
  }
  async select(revisionId: string): Promise<void> {
    if (!this.session) return;
    this.request?.abort();
    const request = this.request = new AbortController(), generation = ++this.generation;
    this.setState({ selecting: true, loading: false, error: "", selectedRevisionId: revisionId, result: undefined });
    try {
      const result = await this.session.select(revisionId, { signal: request.signal });
      if (generation !== this.generation || request.signal.aborted) return;
      this.setState({ result, selecting: false, message: this.session.message, incomplete: this.session.status === "incomplete" });
    } catch (error) { this.failed(error, generation); }
  }
  close(restore = true): void {
    const wasOpen = this.state.open;
    this.request?.abort(); this.generation++; this.session = undefined;
    this.setState({ open: false, loading: false, selecting: false, result: undefined, entries: [] });
    if (wasOpen) this.editor.focus.clearRemoved(this.owner);
    if (restore && wasOpen && this.origin) {
      const origin = this.origin, inline = this.inlineSelection, native = this.nativeSelection;
      queueMicrotask(() => {
        if (!this.editor.mounts.get(origin) || this.state.open) return;
        this.editor.focus.request(origin, { reason: "closed-history", caret: native });
        if (inline) this.editor.mounts.get(origin)?.restoreInlineSelection?.(inline);
      });
    }
  }
  dispose(): void { this.close(false); this.recorder?.source.dispose(); this.recorder = undefined; }
}
