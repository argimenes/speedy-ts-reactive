import { createStore } from "solid-js/store";
import type { AnnotationCapabilities, PanelSession, SearchRange, SearchScope } from "../../feature-api";
import { rangesToPositionMarkers as entityRangesToPositionMarkers } from "../../feature-api";
import { collectDocumentEntities, type DocumentEntityInventory } from "./document-entities";
import { loadEntitySummaries, type EntitySummary, type EntitySummaryLoader } from "./entity-summary";

export type EntityListSort = "name" | "graph" | "document";
export interface EntityListRow {
  id: string;
  name: string;
  graphMentions?: number;
  documentMentions: number;
  ranges: SearchRange[];
}

interface CachedEntityResults {
  signature: string;
  summaries: Map<string, EntitySummary>;
  loaded: boolean;
  error: string;
  dbError: string;
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
  panel?: PanelSession;
  private previewDecorations: ReturnType<AnnotationCapabilities["decorations"]>;
  private concertinaDecorations: ReturnType<AnnotationCapabilities["decorations"]>;
  private watch?: ReturnType<AnnotationCapabilities["watchDocumentEntities"]>;
  private cache = new Map<string, CachedEntityResults>();
  private cached?: CachedEntityResults;
  private collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });

  constructor(private editor: AnnotationCapabilities, private loader: EntitySummaryLoader = loadEntitySummaries) {
    this.previewDecorations = editor.decorations(this.owner);
    this.concertinaDecorations = editor.decorations(`${this.owner}:concertina`);
    [this.state, this.setState] = createStore<{
      open: boolean;
      scope?: SearchScope;
      pageKey?: string;
      rows: EntityListRow[];
      sort: EntityListSort;
      direction: "ascending" | "descending";
      pending: boolean;
      dbPending: boolean;
      dbError: string;
      error: string;
      active?: string;
      concertinaEntityId?: string;
      concertinaIndex: number;
      focusRequest: number;
    }>({ open: false, rows: [], sort: "document", direction: "descending", pending: false, dbPending: false, dbError: "", error: "", concertinaIndex: 0, focusRequest: 0 });
  }

  private useCache(signature: string) {
    const key = this.watch!.key;
    let cached = this.cache.get(key);
    if (!cached || cached.signature !== signature) {
      cached = {signature, summaries:new Map(), loaded:false, error:"", dbError:""};
      this.cache.set(key, cached);
    }
    this.cached = cached;
    this.summaries = cached.summaries;
  }

  open(key: string, embedded = false) {
    try {
      const inventory = collectDocumentEntities(this.editor, key);
      if (this.state.open && this.state.scope?.rootKey === inventory.scope.rootKey) {
        const pageKey = this.editor.currentPage(inventory.scope, key);
        if (pageKey && pageKey !== this.state.pageKey) { this.clearConcertina(); this.setState("pageKey", pageKey); }
        this.setState("focusRequest", value => value + 1);
        return;
      }
      this.close(false);
      this.origin = inventory.scope.rootKey;
      this.watch = this.editor.watchDocumentEntities(this.origin, change => {
        if (!this.state.open) return;
        if (change.removed) { this.cache.delete(this.watch!.key); this.close(false); return; }
        try {
          const inventory = collectDocumentEntities(this.editor, this.origin!);
          if (change.signature === this.cached?.signature) this.updateInventory(inventory, true);
          else { this.useCache(change.signature); this.refresh(inventory); }
        } catch { this.close(false); }
      });
      this.useCache(this.watch.signature);
      const pageKey = this.editor.currentPage(inventory.scope, key);
      if (!embedded) {
        this.panel = this.editor.openPanel("entity-list", key, {});
        this.panel.allowDocumentInput(true);
      }
      this.setState({ open: true, scope: inventory.scope, pageKey, rows: [], pending: false, error: "", active: undefined, concertinaEntityId: undefined, concertinaIndex: 0, focusRequest: this.state.focusRequest + 1 });
      if (this.cached!.loaded) {
        this.updateInventory(inventory);
        this.setState({error:this.cached!.error, dbError:this.cached!.dbError});
      }
      else this.refresh(inventory);
    } catch (error) {
      this.close(false);
      this.setState("error", error instanceof Error ? error.message : String(error));
    }
  }

  refreshSummaries() {
    if (!this.state.open) return;
    this.summaries.clear();
    this.cached!.loaded = false;
    this.refresh();
  }

  private updateInventory(prepared: DocumentEntityInventory, rangesOnly = false) {
    const rows = prepared.rows.map(row => {
      const summary = this.summaries.get(row.id);
      return { id: row.id, name: summary?.name || row.fallbackName || row.id, graphMentions: summary?.mentions, documentMentions: row.documentMentions, ranges: row.ranges };
    });
    const active = rows.some(row => row.id === this.state.active) ? this.state.active : undefined;
    if (rangesOnly) {
      // Keep row identities, names and totals stable while caret/preview
      // coordinates follow ordinary text edits. Do not cancel any lookup.
      const byId = new Map(rows.map(row => [row.id, row.ranges]));
      this.state.rows.forEach((row, index) => this.setState('rows', index, 'ranges', byId.get(row.id) ?? []));
    } else this.setState({ scope: prepared.scope, rows, active });
    if (this.state.concertinaEntityId) {
      const focused = rows.find(row => row.id === this.state.concertinaEntityId);
      if (focused?.ranges.length) this.applyConcertina(focused);
      else this.clearConcertina();
    }
    if (active) this.preview(active); else this.clearPreview();
  }

  private refresh(prepared = collectDocumentEntities(this.editor, this.origin!)) {
    const generation = ++this.generation;
    this.controller?.abort();
    this.updateInventory(prepared);
    this.setState({error:"", dbPending:false, dbError:""});
    const rows = this.state.rows;
    const missing = rows.map(row => row.id).filter(id => !this.summaries.has(id));
    if (!rows.length) { this.cached!.loaded = true; this.setState("pending", false); return; }
    const controller = this.controller = new AbortController();
    this.setState("pending", true);
    const current = () => generation === this.generation && this.state.open && !controller.signal.aborted;
    const apply = (summaries: EntitySummary[]) => {
      if (!current()) return;
      summaries.forEach(summary => this.summaries.set(summary.id, summary));
      this.setState("rows", rows => rows.map(row => {
        const summary = this.summaries.get(row.id);
        return summary ? { ...row, name: summary.name || row.name, graphMentions: summary.mentions } : row;
      }));
    };
    void (async () => {
      // Injected loaders remain useful for offline hosts and focused UI tests.
      if (this.loader !== loadEntitySummaries || !this.editor.entities) {
        apply(await this.loader(missing, controller.signal));
        if (current()) this.setState("pending", false);
        return;
      }
      const service = this.editor.entities(this.origin!);
      try {
        for (let i = 0; i < missing.length; i += 500) {
          apply(await service.names(missing.slice(i, i + 500), controller.signal));
          if (!current()) return;
        }
        this.setState({ pending: false, error: missing.some(id => !this.summaries.has(id)) ? "Some Entity names are unavailable in this DB." : "" });
        const ids = rows.map(row => row.id).filter(id => this.summaries.has(id));
        if (!ids.length) return;
        // A separate, bounded optional read. Names and local counts are already
        // visible; a slow DB must never hold up or erase those results.
        const counts = new AbortController();
        const abort = () => counts.abort();
        controller.signal.addEventListener("abort", abort, { once: true });
        let timer: ReturnType<typeof setTimeout> | undefined;
        this.setState("dbPending", true);
        const deadline = performance.now() + 1000;
        try {
          const work = async () => {
            const totals: Array<{id: string; mentions: number}> = [];
            for (let i = 0; i < ids.length; i += 500) {
              counts.signal.throwIfAborted();
              if (performance.now() >= deadline) throw Error('DB mentions timed out');
              totals.push(...await service.dbMentions(ids.slice(i, i + 500), counts.signal));
            }
            return totals;
          };
          const timeout = new Promise<never>((_, reject) => {
            timer = setTimeout(() => { counts.abort(); reject(Error("DB mentions exceeded the one-second budget.")); }, 1000);
          });
          const totals = await Promise.race([work(), timeout]);
          if (performance.now() >= deadline) throw Error('DB mentions timed out');
          if (current()) apply(totals.map(total => ({ ...this.summaries.get(total.id)!, mentions: total.mentions })));
        } catch {
          if (current()) this.setState("dbError", "DB mentions unavailable or exceeded the one-second budget.");
        } finally {
          clearTimeout(timer); counts.abort(); controller.signal.removeEventListener("abort", abort);
          if (current()) this.setState("dbPending", false);
        }
      } finally { service.dispose(); }
    })().catch(error => {
      if (!current()) return;
      this.setState({ pending: false, error: error instanceof Error ? error.message : "Entity names are unavailable." });
    }).finally(() => {
      if (!current()) return;
      Object.assign(this.cached!, {loaded:true, error:this.state.error, dbError:this.state.dbError});
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
    this.previewDecorations.ranges( row.ranges, { type: "editor/entity-list-preview", fill: "#ffe34d", priority: 20 });
  }

  pageRanges(row: EntityListRow): SearchRange[] {
    const rootKey = this.state.pageKey ?? this.state.scope?.rootKey;
    if (!rootKey) return [];
    const keys = this.editor.pageKeys(rootKey);
    return row.ranges.filter(range => keys.has(range.nodeKey));
  }

  pageOccurrenceCount(id: string): number {
    const row = this.state.rows.find(item => item.id === id);
    return row ? this.pageRanges(row).length : 0;
  }

  clearPreview() {
    this.previewDecorations.clear();
    if (this.state.active !== undefined) this.setState("active", undefined);
  }

  private applyConcertina(row: EntityListRow) {
    const rootKey = this.state.pageKey ?? this.state.scope?.rootKey;
    if (!rootKey || !row.ranges.length) return;
    // Legacy flowing Documents have no Page wrapper. Use the same Document
    // fallback as Find's Page scope; never widen a real Page to its Document.
    const scope = this.editor.scope(rootKey, "page");
    const ranges = this.pageRanges(row);
    const markers = entityRangesToPositionMarkers(row.id, ranges);
    if (!markers.length) { this.clearConcertina(); return; }
    const index = Math.min(this.state.concertinaIndex, markers.length - 1);
    this.setState("concertinaIndex", index);
    this.editor.concertina.activate(this.owner, scope, markers, markers[index]?.id, () => this.clearConcertina());
    this.concertinaDecorations.ranges( ranges, { type: "editor/entity-concertina", fill: "#ffe34d", priority: 19 });
  }

  focusOccurrences(id: string) {
    if (this.state.concertinaEntityId === id) { this.clearConcertina(); return; }
    const row = this.state.rows.find(row => row.id === id);
    if (!row || !this.pageRanges(row).length) return;
    this.setState({ concertinaEntityId: id, concertinaIndex: 0 });
    this.applyConcertina(row);
    void this.editor.revealMarker(entityRangesToPositionMarkers(row.id, this.pageRanges(row))[0], () => this.state.concertinaEntityId === id);
  }

  navigateConcertina(direction: -1 | 1) {
    const row = this.state.rows.find(row => row.id === this.state.concertinaEntityId);
    if (!row) return;
    const ranges = this.pageRanges(row);
    if (!ranges.length) { this.clearConcertina(); return; }
    const index = (this.state.concertinaIndex + direction + ranges.length) % ranges.length;
    this.setState("concertinaIndex", index);
    this.editor.concertina.active(`${row.id}:${index}`);
    void this.editor.revealMarker(entityRangesToPositionMarkers(row.id, ranges)[index], () => this.state.concertinaEntityId === row.id && this.state.concertinaIndex === index);
  }

  clearConcertina() {
    this.editor.concertina.clear(this.owner);
    this.concertinaDecorations.clear();
    this.setState({ concertinaEntityId: undefined, concertinaIndex: 0 });
  }

  close(restore = true) {
    this.watch?.dispose(); this.watch = undefined;
    this.controller?.abort(); this.controller = undefined; this.generation++; this.clearConcertina(); this.clearPreview();
    this.setState({ open: false, rows: [], pending: false, dbPending: false, dbError: "", error: "", active: undefined });
    const panel = this.panel; this.panel = undefined;
    panel?.close(restore);
  }

  dispose() { this.close(false); this.cache.clear(); this.previewDecorations.dispose(); this.concertinaDecorations.dispose(); }
}
