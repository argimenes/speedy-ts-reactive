import { createStore } from "solid-js/store";
import type { ReactiveEditor } from "../reactive-editor/editor";
import type { NativeTextSelection } from "./mounts";
import type { SearchRange, SearchScope } from "./text-search";
import { collectDocumentEntities } from "./document-entities";
import { loadEntitySummaries, type EntitySummary, type EntitySummaryLoader } from "./entity-summary";
import { entityRangesToPositionMarkers } from "./document-position-markers";
import { revealPositionMarker } from "./reveal-match";
import { currentPageForScope, nodeKeysForPage } from "./minimap";
import { resolveSearchScope } from "./text-search";

export type EntityListSort = "name" | "graph" | "document";
export interface EntityListRow {
  id: string;
  name: string;
  graphMentions?: number;
  documentMentions: number;
  ranges: SearchRange[];
}

let sessionCounter = 0;

export class DocumentEntityList {
  readonly state;
  private setState;
  readonly owner = `document-entity-list:${++sessionCounter}`;
  private summaries = new Map<string, EntitySummary>();
  private controller?: AbortController;
  private generation = 0;
  private origin?: string;
  private inlineSelection?: { anchor: number; head: number };
  private nativeSelection?: NativeTextSelection;
  private unsubscribe: () => void;
  private refreshQueued = false;
  private collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });

  constructor(private editor: ReactiveEditor, private loader: EntitySummaryLoader = loadEntitySummaries) {
    [this.state, this.setState] = createStore<{
      open: boolean;
      scope?: SearchScope;
      pageKey?: string;
      rows: EntityListRow[];
      sort: EntityListSort;
      direction: "ascending" | "descending";
      pending: boolean;
      error: string;
      active?: string;
      concertinaEntityId?: string;
      concertinaIndex: number;
      focusRequest: number;
    }>({ open: false, rows: [], sort: "document", direction: "descending", pending: false, error: "", concertinaIndex: 0, focusRequest: 0 });
    this.unsubscribe = editor.repository.subscribeChanges(() => {
      if (!this.state.open || this.refreshQueued) return;
      this.refreshQueued = true;
      // Projections receive the same repository notification. Refresh after they
      // have materialised the latest canonical payload into occurrence nodes.
      queueMicrotask(() => {
        this.refreshQueued = false;
        if (!this.state.open) return;
        try { this.refresh(); }
        catch { this.close(false); }
      });
    });
  }

  open(key: string) {
    try {
      const inventory = collectDocumentEntities(this.editor, key);
      if (this.state.open && this.state.scope?.rootKey === inventory.scope.rootKey) {
        const pageKey = currentPageForScope(this.editor, inventory.scope, [this.editor.focus.state.focusedKey, this.editor.focus.state.lastFocusedKey, key]);
        if (pageKey && pageKey !== this.state.pageKey) { this.clearConcertina(); this.setState("pageKey", pageKey); }
        this.setState("focusRequest", value => value + 1);
        this.refresh(inventory);
        return;
      }
      this.controller?.abort(); this.generation++; this.summaries.clear(); this.clearPreview();
      this.origin = key;
      const pageKey = currentPageForScope(this.editor, inventory.scope, [this.editor.focus.state.focusedKey, this.editor.focus.state.lastFocusedKey, key]);
      const mount = this.editor.mounts.get(key);
      this.inlineSelection = mount?.captureInlineSelection?.();
      this.nativeSelection = mount?.captureSelection?.();
      this.setState({ open: true, scope: inventory.scope, pageKey, rows: [], pending: false, error: "", active: undefined, concertinaEntityId: undefined, concertinaIndex: 0, focusRequest: this.state.focusRequest + 1 });
      this.refresh(inventory);
    } catch (error) {
      if (this.state.open) this.close(false);
      this.setState("error", error instanceof Error ? error.message : String(error));
    }
  }

  private refresh(prepared = collectDocumentEntities(this.editor, this.origin!)) {
    const generation = ++this.generation;
    this.controller?.abort();
    const rows = prepared.rows.map(row => {
      const summary = this.summaries.get(row.id);
      return { id: row.id, name: summary?.name || row.fallbackName || row.id, graphMentions: summary?.mentions, documentMentions: row.documentMentions, ranges: row.ranges };
    });
    const active = rows.some(row => row.id === this.state.active) ? this.state.active : undefined;
    this.setState({ scope: prepared.scope, rows, active, error: "" });
    if (this.state.concertinaEntityId) {
      const focused = rows.find(row => row.id === this.state.concertinaEntityId);
      if (focused?.ranges.length) this.applyConcertina(focused);
      else this.clearConcertina();
    }
    if (active) this.preview(active); else this.clearPreview();
    const missing = rows.map(row => row.id).filter(id => !this.summaries.has(id));
    if (!missing.length) { this.setState("pending", false); return; }
    const controller = this.controller = new AbortController();
    this.setState("pending", true);
    void this.loader(missing, controller.signal).then(summaries => {
      if (generation !== this.generation || !this.state.open || controller.signal.aborted) return;
      summaries.forEach(summary => this.summaries.set(summary.id, summary));
      this.setState("rows", rows => rows.map(row => {
        const summary = this.summaries.get(row.id);
        return summary ? { ...row, name: summary.name || row.name, graphMentions: summary.mentions } : row;
      }));
      this.setState({ pending: false, error: "" });
    }).catch(error => {
      if (generation !== this.generation || controller.signal.aborted || !this.state.open) return;
      this.setState({ pending: false, error: error instanceof Error ? error.message : "Graph entity summaries are unavailable." });
    });
  }

  sortedRows(): EntityListRow[] {
    const sign = this.state.direction === "ascending" ? 1 : -1;
    return [...this.state.rows].sort((left, right) => {
      let compared = 0;
      if (this.state.sort === "name") compared = this.collator.compare(left.name, right.name);
      else if (this.state.sort === "graph") compared = (left.graphMentions ?? -1) - (right.graphMentions ?? -1);
      else compared = left.documentMentions - right.documentMentions;
      if (compared) return compared * sign;
      return this.collator.compare(left.name, right.name) || left.id.localeCompare(right.id);
    });
  }

  sortBy(column: EntityListSort) {
    this.clearPreview();
    if (this.state.sort === column) this.setState("direction", value => value === "ascending" ? "descending" : "ascending");
    else this.setState({ sort: column, direction: column === "name" ? "ascending" : "descending" });
  }

  preview(id?: string) {
    if (!id) { this.clearPreview(); return; }
    const row = this.state.rows.find(row => row.id === id);
    if (!row) { this.clearPreview(); return; }
    this.setState("active", id);
    this.editor.decorations.attachRanges(this.owner, row.ranges, { type: "editor/entity-list-preview", fill: "#ffe34d", priority: 20 });
  }

  pageRanges(row: EntityListRow): SearchRange[] {
    const rootKey = this.state.pageKey ?? this.state.scope?.rootKey;
    if (!rootKey) return [];
    const keys = nodeKeysForPage(this.editor, rootKey);
    return row.ranges.filter(range => keys.has(range.nodeKey));
  }

  pageOccurrenceCount(id: string): number {
    const row = this.state.rows.find(item => item.id === id);
    return row ? this.pageRanges(row).length : 0;
  }

  clearPreview() {
    this.editor.decorations.clearHighlights(this.owner);
    if (this.state.active !== undefined) this.setState("active", undefined);
  }

  private applyConcertina(row: EntityListRow) {
    const rootKey = this.state.pageKey ?? this.state.scope?.rootKey;
    if (!rootKey || !row.ranges.length) return;
    // Legacy flowing Documents have no Page wrapper. Use the same Document
    // fallback as Find's Page scope; never widen a real Page to its Document.
    const scope = resolveSearchScope(this.editor, rootKey, "page");
    const ranges = this.pageRanges(row);
    const markers = entityRangesToPositionMarkers(row.id, ranges);
    if (!markers.length) { this.clearConcertina(); return; }
    const index = Math.min(this.state.concertinaIndex, markers.length - 1);
    this.setState("concertinaIndex", index);
    this.editor.concertina.activate({ owner: this.owner, viewId: scope.viewId, scope, markers, activeMarkerOrGroup: markers[index]?.id });
    this.editor.decorations.attachRanges(`${this.owner}:concertina`, ranges, { type: "editor/entity-concertina", fill: "#ffe34d", priority: 19 });
  }

  focusOccurrences(id: string) {
    if (this.state.concertinaEntityId === id) { this.clearConcertina(); return; }
    const row = this.state.rows.find(row => row.id === id);
    if (!row || !this.pageRanges(row).length) return;
    if (this.editor.find.state.concertinaRequested) this.editor.find.toggleConcertina();
    this.setState({ concertinaEntityId: id, concertinaIndex: 0 });
    this.applyConcertina(row);
    void revealPositionMarker(this.editor, entityRangesToPositionMarkers(row.id, this.pageRanges(row))[0], () => this.state.concertinaEntityId === id);
  }

  navigateConcertina(direction: -1 | 1) {
    const row = this.state.rows.find(row => row.id === this.state.concertinaEntityId);
    if (!row) return;
    const ranges = this.pageRanges(row);
    if (!ranges.length) { this.clearConcertina(); return; }
    const index = (this.state.concertinaIndex + direction + ranges.length) % ranges.length;
    this.setState("concertinaIndex", index);
    this.editor.concertina.setActiveMarker(`${row.id}:${index}`);
    void revealPositionMarker(this.editor, entityRangesToPositionMarkers(row.id, ranges)[index], () => this.state.concertinaEntityId === row.id && this.state.concertinaIndex === index);
  }

  clearConcertina() {
    this.editor.concertina.deactivate(this.owner);
    this.editor.decorations.clearHighlights(`${this.owner}:concertina`);
    this.setState({ concertinaEntityId: undefined, concertinaIndex: 0 });
  }

  close(restore = true) {
    this.controller?.abort(); this.controller = undefined; this.generation++; this.clearConcertina(); this.clearPreview();
    this.setState({ open: false, rows: [], pending: false, error: "", active: undefined });
    if (!restore || !this.origin) return;
    const mount = this.editor.mounts.get(this.origin);
    if (!mount) return;
    mount.focus();
    if (this.inlineSelection) mount.restoreInlineSelection?.(this.inlineSelection);
    else if (this.nativeSelection) mount.restoreSelection?.(this.nativeSelection);
  }

  dispose() { this.close(false); this.unsubscribe(); }
}
