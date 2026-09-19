import type { BlockRestorePlan } from "../block-tree/block-restore";
import type { DeepReadonly } from "../block-tree/commit-capture";
import { restoreCaptureProposal } from "../history/restore-preflight";
import type { HistoryDisplayResult } from "../history/preview";
import { createSignal } from "solid-js";
import { createStore } from "solid-js/store";
import { encodeDocument } from "../block-tree/codecs";
import { createDurableHistorySource, type DurableHistorySource, type DurableSegment, type DurableRecorderStatus } from "../history/durable-browser";
import { encodeHistoryDocument, projectWholeDocument } from "../history/durable-core";
import type { DocumentLocation } from "../reactive-editor/persistence";
import type { HistorySelection } from "../history/ui-session-source";
import type { ReactiveEditor } from "../reactive-editor/editor";
import { blockAncestors } from "./block-menu-actions";
import { createSessionHistorySource, type SessionHistoryRecorder, type ReadonlyHistorySession, type SessionTimelineEntry } from "../history/ui-session-source";

type HistoryPanelState = {
  restoring?: boolean; restoreNotice?: string; restoreConfirmation?: { revisionId: string; label: string; currentRevision: number };
  open: boolean; viewId?: string; title: string; message: string; error: string;
  loading: boolean; selecting: boolean; incomplete: boolean; entries: readonly SessionTimelineEntry[];
  nextCursor?: string; selectedRevisionId?: string; result?: HistoryDisplayResult;
  storage: "session-only" | "persistent"; sessions: readonly DurableSegment[]; segmentId?: string;
  recording?: Readonly<DurableRecorderStatus>; recordingError?: string;
  selectionTiming?: import("../history/read-timing").ReadTiming;
};

/** UI state only. Historical readers never receive the editor's command capability. */
export class BlockHistorySession {
  readonly owner = "block-history-panel";
  readonly state: HistoryPanelState;
  private setState;
  private readonly resultSignal = createSignal<HistoryDisplayResult>();
  private recorder?: { root: string; source: SessionHistoryRecorder };
  private session?: ReadonlyHistorySession;
  private location?: DocumentLocation;
  private identity?: { resourceId: string; memoirId?: string };
  private durable?: DurableHistorySource;
  private starting?: Promise<DurableHistorySource>;
  private statusDisposer?: () => void;
  private disposed = false;
  private selection?: HistorySelection;
  private target?: { placementKey: string; contentKey: string; blockId: string };
  private pendingRestore?: { plan: DeepReadonly<BlockRestorePlan>; generation: number; revisionId: string };
  get enabled(): boolean { return this.editor.features.blockHistory; }
  restoreReason(): string | undefined {
    if (!this.enabled) return "Block history is disabled by configuration.";
    if (this.state.storage !== "persistent" || !this.durable?.preflightRestore || !this.session?.readAuthoredBlock) return "Save and enroll this Document in persistent History before restoring.";
    if (!this.state.result?.restore?.supported) return this.state.result?.restore?.reason ?? "Select an available historical Block.";
    const status = this.state.recording;
    if (this.state.incomplete || this.state.recordingError || !status || status.phase !== "recording" || status.pendingCount || status.pendingCapture || status.verified !== status.browserCommitted) return "Wait for healthy, durably verified current History before restoring.";
  }
  cancelRestore(): void {
    if (this.state.restoring) { this.request?.abort(); this.generation++; }
    this.pendingRestore = undefined; this.setState({ restoreConfirmation: undefined, restoring: false });
  }
  async prepareRestore(): Promise<void> {
    if (!this.enabled) return;
    if (this.state.restoring || this.state.selecting || this.state.loading) return;
    this.cancelRestore();
    const revisionId = this.state.selectedRevisionId, session = this.session, target = this.target;
    const reason = this.restoreReason();
    if (reason || !revisionId || !session?.readAuthoredBlock || !target) { this.setState("error", reason ?? "Reopen History for the current Block."); return; }
    const currentRevision = this.editor.repository.state.revision;
    this.request?.abort(); const request = this.request = new AbortController(), generation = ++this.generation;
    this.setState({ restoring: true, error: "", restoreNotice: undefined });
    try {
      const source = await session.readAuthoredBlock(revisionId, { signal: request.signal });
      if (generation !== this.generation || request.signal.aborted) return;
      if (source.blockId !== target.blockId || source.revisionId !== revisionId || source.segmentId !== session.segmentId) throw Error("Historical source identity changed. Select the revision again.");
      const live = this.editor.repository.readState();
      if (live.revision !== currentRevision || live.placements[target.placementKey]?.contentKey !== target.contentKey) throw Error("The Document changed while preparing the restore. Prepare it again.");
      const plan = this.editor.commands.prepareBlockRestore(target.placementKey, target.blockId, source.authored);
      if (!plan.operations.length) { this.setState({ restoring: false, restoreNotice: "The current Block already matches this historical authored state. No change was made." }); return; }
      await this.durable!.preflightRestore!(restoreCaptureProposal(live, plan), request.signal);
      if (generation !== this.generation || request.signal.aborted) return;
      if (this.editor.repository.state.revision !== currentRevision) throw Error("The Document changed while preparing the restore. Prepare it again.");
      this.pendingRestore = { plan, generation, revisionId };
      this.setState({ restoring: false, restoreConfirmation: { revisionId, currentRevision, label: this.state.entries.find(e => e.revisionId === revisionId)?.label ?? "Selected revision" } });
    } catch (error) { if (generation === this.generation && !request.signal.aborted) { this.cancelRestore(); this.setState("error", (error as Error).message); } }
  }
  confirmRestore(): void {
    if (!this.enabled) return;
    const pending = this.pendingRestore;
    try {
      if (!pending || pending.generation !== this.generation || pending.revisionId !== this.state.selectedRevisionId || !this.state.open) throw Error("The selected revision changed. Prepare the restore again.");
      const reason = this.restoreReason(); if (reason) throw Error(reason);
      this.editor.commands.restoreBlock(pending.plan);
      this.cancelRestore();
      this.setState({ error: "", restoreNotice: `Restored revision ${pending.revisionId} as a new current change. The previous version remains in History and ordinary Undo. History itself was not changed.` });
    } catch (error) { this.cancelRestore(); this.setState("error", (error as Error).message); }
  }
  async latest(): Promise<void> { if (this.enabled && this.state.recording?.segmentId && !this.hasPendingCapture()) await this.chooseSession(this.state.recording.segmentId); }

  private request?: AbortController;
  private generation = 0;
  private origin?: string;
  private inlineSelection?: { anchor: number; head: number };
  private nativeSelection?: { start: number; end: number; direction: "forward" | "backward" | "none" };
  constructor(private editor: ReactiveEditor, private createSource = createSessionHistorySource, private createPersistent = createDurableHistorySource) {
    [this.state, this.setState] = createStore<HistoryPanelState>({ open: false, title: "Block history", message: "", error: "", loading: false, selecting: false, incomplete: false, entries: [], storage: "session-only", sessions: [] });
    // Historical bodies are already immutable. A signal preserves their identity
    // instead of asking Solid's deep store to clone/unwrap tens of thousands of Cells.
    this.state = new Proxy(this.state, { get: (target, key, receiver) => key === "result" ? this.resultSignal[0]() : Reflect.get(target, key, receiver) });
  }
  attachIdentity(identity: { resourceId: string; memoirId?: string }): void { this.identity = identity; }
  attachLocation(location: DocumentLocation): void {
    this.location = { ...location };
    // With the feature enabled, a saved portable Document explicitly carries
    // its enrollment. Reopening it starts capture before user edits; legacy
    // files opt in through History.
    if (this.enabled && this.identity && !this.starting) void this.ensureDurable().catch(() => {});
  }
  hasPendingCapture(): boolean {
    if (!this.enabled) return false;
    const status = this.state.recording;
    return !!this.starting && !this.durable && !this.state.recordingError || !!status && (status.pendingCapture > 0 || status.pendingCount > 0);
  }
  private ensureDurable(): Promise<DurableHistorySource> {
    if (!this.enabled) return Promise.reject(new Error("Block history is disabled by configuration."));
    if (this.starting) return this.starting;
    if (!this.location) return Promise.reject(new Error("Save this Document before starting persistent history."));
    const live = this.editor.repository.readState();
    const root = live.contents[live.placements[live.rootPlacementKey]?.contentKey];
    if (root?.viewType !== "document-block" || typeof root.payload.id !== "string") {
      return Promise.reject(new Error("Persistent history currently supports one Document root. Open the Document separately from its Workspace."));
    }
    this.identity ??= { resourceId: root.payload.id };
    this.setState({ storage: "persistent", recordingError: undefined });
    this.starting = this.createPersistent(this.editor.repository, this.location, this.identity).then(source => {
      if (this.disposed) { source.dispose(); throw new Error("Document history is closed."); }
      this.recorder?.source.dispose();
      this.recorder = { root: live.rootPlacementKey, source };
      this.durable = source;
      this.identity = { ...this.identity!, memoirId: source.status().memoirId ?? this.identity?.memoirId };
      this.statusDisposer = source.subscribeStatus(status => this.setState("recording", status));
      return source;
    }).catch(error => {
      if (!this.disposed) this.setState("recordingError", error instanceof Error ? error.message : String(error));
      throw error;
    });
    return this.starting;
  }
  /** A failed archive must not make an independently valid Document unsaveable. */
  savePersistent(filename: string, folder: string, createOnly = false) {
    if (!this.enabled) return undefined;
    if (!this.starting && !this.identity) return undefined;
    if (this.durable) return this.durable.save(filename, folder, createOnly);
    const snapshot = this.editor.repository.snapshot();
    return this.ensureDurable().then(source => source.save(filename, folder, createOnly, snapshot), async error => {
      if (this.identity?.memoirId && this.location && (this.location.filename !== filename || this.location.folder !== folder)) throw new Error("Save As of an enrolled Document requires separate history admission.");
      // Preserve the Save-click snapshot even if enrollment fails after later edits.
      const document = this.identity?.memoirId
        ? encodeHistoryDocument(projectWholeDocument(snapshot, this.identity.resourceId), this.identity.memoirId)
        : encodeDocument(snapshot);
      if (!this.identity?.memoirId) document.metadata = { ...(document.metadata as Record<string, unknown> | undefined), filename, folder };
      const response = await fetch("/api/saveDocumentJson", { method: "POST", headers: { "Content-Type": "application/json", ...(createOnly ? { "If-None-Match": "*" } : {}) }, body: JSON.stringify({ folder, filename, document }) });
      const body = await response.json();
      if (!response.ok || !body.Success) throw new Error(body.Error ?? "The Document could not be saved.");
      return { document, revision: snapshot.revision, warning: body.Warning ?? `Document saved; history is unavailable: ${String(error)}` };
    });
  }
  async chooseSession(segmentId: string): Promise<void> {
    if (!this.enabled) return;
    if (!this.durable || !this.selection) return;
    this.cancelRestore();
    this.request?.abort();
    const request = this.request = new AbortController(), generation = ++this.generation;
    this.resultSignal[1](undefined);
    this.setState({ loading: true, selecting: false, error: "", entries: [], segmentId });
    try {
      const session = await this.durable.open(this.selection, request.signal, segmentId);
      const page = await session.timeline({ limit: 25, signal: request.signal });
      if (generation !== this.generation || request.signal.aborted) return;
      this.session = session;
      this.setState({ entries: page.entries, nextCursor: page.nextCursor, loading: false, message: session.message, incomplete: session.status === "incomplete" });
      await this.select(page.entries.at(-1)?.revisionId ?? session.headRevisionId);
    } catch (error) { this.failed(error, generation); }
  }
  canOpen(key: string): boolean {
    if (!this.enabled) return false;
    const node = this.editor.node(key);
    return !!node && typeof node.payload.id === "string" && blockAncestors(this.editor, key).some(n => n.viewType === "document-block");
  }
  open(key: string): void {
    if (!this.enabled) return;
    const node = this.editor.node(key);
    if (!node) return;
    this.close(false);
    this.target = { placementKey: node.placementKey, contentKey: node.contentKey, blockId: String(node.payload.id) };
    this.setState("restoreNotice", undefined);
    const menu = this.editor.overlays.overlays.find(o => o.viewType === "context-menu" && o.ownerKey === key);
    this.origin = menu?.returnFocusKey ?? (this.editor.node(this.editor.focus.state.focusedKey ?? "") ? this.editor.focus.state.focusedKey : key);
    const handle = this.editor.mounts.get(this.origin!);
    this.inlineSelection = menu?.returnInlineSelection ?? handle?.captureInlineSelection?.();
    this.nativeSelection = menu?.returnSelection ?? handle?.captureSelection?.();
    if (menu) this.editor.overlays.close(menu.key, false);
    const metadata = node.payload.metadata as { name?: string; title?: string } | undefined;
    const inlineTitle = node.inlineContent.slice(0, 60).map(key => String(this.editor.node(key)?.payload.text ?? "")).join("");
    const title = metadata?.name ?? metadata?.title ?? (inlineTitle || String(node.payload.text ?? node.payload.id)).slice(0, 60);
    this.setState({ open: true, viewId: node.viewId, title, message: "Preparing Block history…", loading: true, incomplete: false, error: "", entries: [], nextCursor: undefined, selectedRevisionId: undefined });
    this.editor.focus.request(this.owner, { reason: "block-history" });
    const request = this.request = new AbortController(), generation = ++this.generation;
    void (async () => {
      // Let the initial panel paint before taking its bounded enrollment baseline.
      await new Promise(resolve => setTimeout(resolve, 0));
      if (request.signal.aborted) return;
      const root = blockAncestors(this.editor, key).find(n => n.viewType === "document-block");
      if (!root) throw Error("Select a Block inside a Document to view its history.");
      if (this.recorder && this.recorder.root !== root.placementKey) throw Error("This session is recording another Document. Open that Document's history instead.");
      if (this.location) await this.ensureDurable();
      else this.recorder ??= { root: root.placementKey, source: this.createSource(this.editor.repository, root.placementKey) };
      if (request.signal.aborted) return;
      const placement = this.editor.repository.readState().placements[node.placementKey];
      if (!placement) throw new Error("The selected Block is no longer in this Document.");
      this.selection = { blockId: String(node.payload.id), placementId: placement.placementId ?? `session:${placement.key}` };
      const sessions = this.durable ? await this.durable.sessions() : [];
      const session = await this.recorder!.source.open(this.selection, request.signal);
      const page = await session.timeline({ limit: 25, signal: request.signal });
      if (generation !== this.generation || request.signal.aborted) return;
      this.session = session;
      this.setState({ entries: page.entries, nextCursor: page.nextCursor, loading: false, message: session.message, incomplete: session.status === "incomplete", storage: session.storage, sessions, segmentId: session.segmentId });
      await this.select(page.entries.at(-1)?.revisionId ?? session.headRevisionId);
    })().catch(error => this.failed(error, generation));
  }
  private failed(error: unknown, generation: number) {
    if (generation !== this.generation || !this.state.open || (error as Error)?.name === "AbortError") return;
    this.setState({ loading: false, selecting: false, error: error instanceof Error ? error.message : String(error) });
  }
  async more(): Promise<void> {
    if (!this.enabled) return;
    if (!this.session || !this.state.nextCursor || this.state.loading || this.state.selecting) return;
    this.cancelRestore();
    const request = this.request = new AbortController(), generation = ++this.generation;
    this.setState({ loading: true, error: "" });
    try {
      const page = await this.session.timeline({ cursor: this.state.nextCursor, limit: 25, signal: request.signal });
      if (generation !== this.generation || request.signal.aborted) return;
      this.setState({ entries: [...this.state.entries, ...page.entries], nextCursor: page.nextCursor, loading: false, message: this.session.message, incomplete: this.session.status === "incomplete" });
    } catch (error) { this.failed(error, generation); }
  }
  async select(revisionId: string): Promise<void> {
    if (!this.enabled) return;
    if (!this.session) return;
    this.cancelRestore();
    const start = performance.now();
    this.request?.abort();
    const request = this.request = new AbortController(), generation = ++this.generation;
    this.resultSignal[1](undefined);
    this.setState({ selecting: true, loading: false, error: "", selectedRevisionId: revisionId, selectionTiming: undefined });
    try {
      const result = await this.session.select(revisionId, { signal: request.signal });
      if (generation !== this.generation || request.signal.aborted) return;
      const received = performance.now();
      this.resultSignal[1](() => result);
      this.setState({ selecting: false, message: this.session.message, incomplete: this.session.status === "incomplete" });
      if (result.timing) requestAnimationFrame(() => requestAnimationFrame(() => {
        if (generation !== this.generation || request.signal.aborted) return;
        this.setState("selectionTiming", { ...result.timing!, uiMs: performance.now() - received, totalMs: performance.now() - start });
      }));
    } catch (error) { this.failed(error, generation); }
  }
  close(restore = true): void {
    const wasOpen = this.state.open;
    this.cancelRestore(); this.target = undefined;
    this.request?.abort(); this.generation++; this.session?.dispose?.(); this.session = undefined;
    this.resultSignal[1](undefined);
    this.setState({ open: false, loading: false, selecting: false, entries: [] });
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
  dispose(): void { this.disposed = true; this.close(false); this.statusDisposer?.(); this.recorder?.source.dispose(); this.recorder = undefined; }
}
