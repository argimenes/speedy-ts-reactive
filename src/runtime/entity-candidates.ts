import { createStore } from "solid-js/store";
import { clone } from "../block-tree/clone";
import { linkedRegistry } from "../block-tree/linked-annotations";
import type { JsonObject, RepositoryOperation } from "../block-tree/types";
import type { ReactiveEditor } from "../reactive-editor/editor";
import type { OverlayDescriptor } from "./overlays";
import { ancestorPath, nodeLabel, resolveSearchScope, TextSearch, type SearchMatch, type SearchMatchSet, type SearchScope, type ScopeKind } from "./text-search";
import type { SearchOptions } from "./search-matching";
import type { SearchRunner } from "./search-worker";
import { revealMatch } from "./reveal-match";
import { graphemeBoundaries } from "../input/graphemes";

export interface NominatedEntity { id: string; name: string }
export interface EntityCandidate { key: string; match: SearchMatch; occurrences: SearchMatch[]; original: boolean; checked: boolean; reason: string }
export const candidateKey = (match: SearchMatch) => JSON.stringify(match.ranges.map(r => [r.contentKey,r.start,r.end]).sort((a,b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));
const overlaps = (a: SearchMatch, b: SearchMatch) => a.ranges.some(x => b.ranges.some(y => x.contentKey === y.contentKey && x.start < y.end && y.start < x.end));
function textAt(editor: ReactiveEditor, match: SearchMatch) {
  return match.ranges.map(r => {
    const node = editor.node(r.nodeKey);
    if (!node || node.contentKey !== r.contentKey || node.placementKey !== r.placementKey || r.coordinate !== "cell" || !Number.isInteger(r.start) || !Number.isInteger(r.end) || r.start < 0 || r.end <= r.start || r.end > node.inlineContent.length) throw new Error("A mention range is no longer valid.");
    return node.inlineContent.slice(r.start,r.end).map(k => { const cell = editor.node(k); if (cell?.viewType !== "text-cell") throw new Error("Mentions cannot include inline media."); return String(cell.payload.text ?? ""); }).join("");
  }).join(" ");
}
/** Resolve both local properties and shared definitions before deciding eligibility. */
export function candidateReason(editor: ReactiveEditor, match: SearchMatch, entity?: NominatedEntity): string {
  if (!match.capabilities.annotate) return match.capabilities.reason ?? "This range cannot receive an entity annotation.";
  const states = match.ranges.map(range => {
    const node = editor.node(range.nodeKey); if (!node) return "conflict";
    const properties = (node.payload.standoffProperties ?? []) as JsonObject[];
    const refs = properties.map(p => editor.linkedAnnotations.resolve(p)).filter(p => !p.isDeleted && p.type === "codex/entity-reference" && Number(p.start) < range.end && Number(p.end) + 1 > range.start);
    if (!refs.length) return "clear";
    if (entity && refs.every(p => p.start === range.start && Number(p.end) + 1 === range.end && p.value === entity.id)) return "linked";
    if (entity && refs.some(p => p.value === entity.id)) return "linked-overlap";
    return "conflict";
  });
  if (states.every(s => s === "linked")) return "Already linked to this entity.";
  if (states.some(s => s === "linked" || s === "linked-overlap")) return "Overlaps an existing reference to this entity; excluded.";
  if (states.some(s => s !== "clear")) return "Overlaps an existing entity reference; excluded.";
  return "";
}

/** Prevalidate all targets, then one payload update per content and one history entry. */
export function bindEntityCandidates(editor: ReactiveEditor, set: SearchMatchSet, matches: SearchMatch[], entity: NominatedEntity): number {
  if (!entity.id || !entity.name) throw new Error("Nominate an entity first.");
  if (set.status !== "complete" && set.status !== "partial") throw new Error("Wait for a successful search before binding mentions.");
  if (set.revision !== editor.repository.readState().revision) throw new Error("The document changed. Select the text again.");
  const unique = [...new Map(matches.map(match => [candidateKey(match),match])).values()];
  const eligible: SearchMatch[] = [];
  for (const match of unique) {
    if (textAt(editor,match) !== match.text) throw new Error("A mention's text changed. Search again.");
    const reason = candidateReason(editor,match,entity);
    if (reason === "Already linked to this entity.") continue;
    if (reason) throw new Error(reason);
    if (eligible.some(other => overlaps(match,other))) throw new Error("Selected mentions overlap. Choose one of the overlapping ranges.");
    eligible.push(match);
  }
  if (!eligible.length) return 0;
  const state = editor.repository.readState(), updates = new Map<string,{ key: string; properties: JsonObject[] }>();
  const registry = clone(linkedRegistry(state)); let linked = false;
  for (const match of eligible) {
    const annotationId = match.ranges.length > 1 ? crypto.randomUUID() : undefined;
    const metadata = { entityId: entity.id, entityName: entity.name };
    if (annotationId) { linked = true; registry[annotationId] = { id: annotationId, type: "codex/entity-reference", value: entity.id, metadata, attributes: {} }; }
    for (const range of match.ranges) {
      let update = updates.get(range.contentKey);
      if (!update) updates.set(range.contentKey, update = { key: range.nodeKey, properties: clone(state.contents[range.contentKey].payload.standoffProperties as JsonObject[] ?? []) });
      update.properties.push({ id: crypto.randomUUID(), type: "codex/entity-reference", start: range.start, end: range.end - 1, ...(annotationId ? { annotationId } : { value: entity.id, metadata }) });
    }
  }
  // Publish a single validated operation batch. Repeated setPayloadField calls
  // inside TreeCommands.transaction would clone/validate the entire draft once
  // per Block; that is unnecessarily expensive for a document-wide action.
  const operations: RepositoryOperation[] = [];
  if (linked) {
    const root = state.contents[state.placements[state.rootPlacementKey].contentKey];
    operations.push({ kind: "put-content",record: { ...root,payload: { ...root.payload,linkedAnnotations: registry } } });
  }
  for (const [key,update] of updates) {
    const content = state.contents[key];
    operations.push({ kind: "put-content",record: { ...content,payload: { ...content.payload,standoffProperties: update.properties } } });
  }
  editor.repository.commit(`Bind ${eligible.length} entity mentions`,operations);
  return eligible.length;
}

export class EntityCandidates {
  readonly state;
  private setState;
  readonly owner: string;
  readonly search: TextSearch;
  private original?: SearchMatch;
  private controller?: AbortController;
  private timer?: ReturnType<typeof setTimeout>;
  private generation = 0;
  private disposed = false;
  private undo: string[] = [];
  private sourceSet?: SearchMatchSet;
  constructor(private editor: ReactiveEditor, private overlay: OverlayDescriptor, runner?: SearchRunner) {
    this.owner = `entity-candidates:${overlay.key}`; this.search = new TextSearch(editor,runner);
    const ranges = (overlay.entityRanges ?? []).map(r => { const node = editor.node(r.nodeKey)!; return { ...r, contentKey: node.contentKey, placementKey: node.placementKey, version: 0, coordinate: "cell" as const }; });
    const path = ancestorPath(editor,overlay.ownerKey);
    let actionable = true;
    for (const r of ranges) {
      const node = editor.node(r.nodeKey)!;
      const cells = node.inlineContent.map(k => editor.node(k)!);
      const boundaries = graphemeBoundaries(cells.map(c => c.viewType === "text-cell" ? String(c.payload.text ?? "") : "\uFFFC").join(""));
      actionable &&= boundaries.includes(r.start) && boundaries.includes(r.end) && cells.slice(r.start,r.end).every(c => c.viewType === "text-cell");
    }
    this.original = { id: `${this.owner}:original`, text: overlay.entityQuery ?? "", context: overlay.entityQuery ?? "", captures: [], ranges, path: path.map(n => n.key), breadcrumb: path.map(nodeLabel).join(" / "), capabilities: { annotate: actionable, highlight: true, reveal: true, replace: false, reason: actionable ? undefined : "The selected passage splits a grapheme or includes inline media." } };
    if (!ranges.length) this.original = undefined;
    const scope = resolveSearchScope(editor,overlay.ownerKey);
[this.state,this.setState] = createStore<{ enabled: boolean; query: string; options: SearchOptions; scope: SearchScope; result?: SearchMatchSet; rows: EntityCandidate[]; entity?: NominatedEntity; pending: boolean; visible: boolean; active?: string; activeMatch?: string; message: string; page: number; undoCount: number }>({ enabled: false, query: ranges.length === 1 ? (this.original?.text ?? "") : "", options: { wholeWords: true }, scope, rows: [], pending: false, visible: true, message: "", page: 0, undoCount: 0 });
  }
  enable() {
    if (this.state.enabled) {
      if (this.state.result?.status === "error" || this.state.result?.status === "cancelled") this.schedule(true);
      else this.selectAll();
      return;
    }
    this.setState("enabled",true); this.editor.overlays.enableEntityCandidates(this.overlay.key); this.schedule(true);
  }
  configure(change: { query?: string; options?: SearchOptions; scope?: ScopeKind }) {
    if (change.query !== undefined) this.setState("query",change.query);
    if (change.options) this.setState("options",change.options);
    if (change.scope) this.setState("scope",resolveSearchScope(this.editor,this.overlay.ownerKey,change.scope));
    if (this.state.enabled) this.schedule(false);
  }
  disable() {
    this.controller?.abort(); clearTimeout(this.timer); this.generation++; this.undo = [];
    this.sourceSet = undefined;
    this.setState({ enabled: false, pending: false, result: undefined, rows: [], undoCount: 0, active: undefined, activeMatch: undefined, message: "" });
    this.editor.decorations.clearHighlights(this.owner);
    this.editor.overlays.enableEntityCandidates(this.overlay.key, false);
  }
  private schedule(selectAll: boolean) {
    this.controller?.abort(); clearTimeout(this.timer); this.generation++; this.undo = [];
    this.setState({ pending: true, result: undefined, page: 0, undoCount: 0, message: "", active: undefined, activeMatch: undefined });
    this.editor.decorations.clearHighlights(this.owner);
    this.timer = setTimeout(() => void this.flush(selectAll),200);
  }
  async flush(selectAll = false) {
    clearTimeout(this.timer); this.controller?.abort();
    const token = ++this.generation, controller = this.controller = new AbortController();
    const result = await this.search.searchText({ query: this.state.query, options: { ...this.state.options }, scope: { ...this.state.scope }, signal: controller.signal });
    if (this.disposed || token !== this.generation) return;
    const originalChecked = this.state.rows.find(r => r.original)?.checked ?? true;
    const rows = new Map<string,EntityCandidate>();
    for (const match of [...(this.original ? [this.original] : []),...result.matches]) {
      const key = candidateKey(match), existing = rows.get(key);
      if (existing) { if (!existing.occurrences.some(m => m.ranges[0].nodeKey === match.ranges[0].nodeKey)) existing.occurrences.push(match); continue; }
      const original = match === this.original, reason = candidateReason(this.editor,match,this.state.entity);
      rows.set(key,{ key, match, occurrences: [match], original, reason, checked: !reason && (original ? originalChecked : selectAll && result.status === "complete" && result.exact) });
    }
    // Keep the explicit original if substring/regex candidates overlap it.
    const checked: SearchMatch[] = [];
    for (const row of rows.values()) if (row.checked) { if (checked.some(m => overlaps(m,row.match))) row.checked = false; else checked.push(row.match); }
    this.sourceSet = { ...result, matches: [...rows.values()].flatMap(row => row.occurrences) };
    this.setState({ result, rows: [...rows.values()], pending: false, message: result.diagnostics.join(" ") });
    this.paint();
  }
  nominate(entity?: NominatedEntity) {
    // Typing subsequent entity-query characters must not repeatedly reclassify
    // and repaint thousands of candidates after the nomination is already clear.
    if (!entity && !this.state.entity) return;
    this.setState("entity",entity);
    this.setState("rows",rows => rows.map(row => { const reason = candidateReason(this.editor,row.match,entity); return { ...row, reason, checked: row.checked && !reason }; }));
    this.paint();
  }
  selected() { return this.state.rows.filter(r => r.checked && !r.reason); }
  bindingDisabledReason() {
    if (!this.state.enabled) return "Enable search to bind matching mentions.";
    if (this.state.pending) return "Wait for the mention search to finish.";
    if (!this.state.entity) return "Choose an entity from the results on the left.";
    if (!this.selected().length) return "Check at least one eligible mention.";
    if (!this.state.result || !["complete", "partial"].includes(this.state.result.status)) return "Run a successful mention search first.";
    if (this.state.result.revision !== this.editor.repository.state.revision) return "The document changed. Search again.";
    return "";
  }
  canBind() { return !this.bindingDisabledReason(); }
  toggle(key: string, checked: boolean) {
    const index = this.state.rows.findIndex(r => r.key === key), row = this.state.rows[index];
    if (!row || row.reason || this.state.pending) return;
    if (checked && this.selected().some(other => other.key !== key && overlaps(other.match,row.match))) { this.setState("message","This mention overlaps a checked target. Uncheck that target first."); return; }
    if (!checked && row.checked) { this.undo.push(key); this.setState("undoCount",this.undo.length); }
    this.setState("rows",index,"checked",checked); this.paint();
  }
  selectAll() {
    if (this.state.pending || this.state.result?.status !== "complete" || !this.state.result.exact) return;
    const selected: SearchMatch[] = [];
    this.setState("rows",rows => rows.map(row => { const checked = !row.reason && !selected.some(m => overlaps(m,row.match)); if (checked) selected.push(row.match); return { ...row,checked }; })); this.paint();
  }
  selectNone() { this.setState("rows",rows => rows.map(row => ({ ...row,checked: false }))); this.paint(); }
  undoExclusion() { const key = this.undo.pop(); this.setState("undoCount",this.undo.length); if (key) this.toggle(key,true); }
  toggleHighlights() { this.setState("visible",v => !v); this.editor.decorations.setHighlightsVisible(this.owner,this.state.visible); }
  setPage(page: number) { this.setState("page",Math.max(0,page)); }
  async reveal(row: EntityCandidate, occurrence = 0) {
    const match = row.occurrences[occurrence] ?? row.match;
    this.setState({ active: row.key,activeMatch: match.id }); this.paint();
    if (!await revealMatch(this.editor,match,() => !this.disposed && this.state.activeMatch === match.id)) this.setState("message","This mention cannot be revealed by the current view adapter.");
  }
  bind() {
    if (this.state.result && this.state.result.revision !== this.editor.repository.state.revision) throw new Error("The document changed. Select the text again.");
    if (!this.canBind()) throw new Error("Choose an entity and checked mentions from a complete search first.");
    return bindEntityCandidates(this.editor,this.state.result!,this.selected().map(r => r.match),this.state.entity!);
  }
  private paint() {
    if (!this.sourceSet || this.disposed || this.state.pending) return;
    const rows = this.selected(), matches = rows.flatMap(row => row.occurrences);
    this.editor.decorations.attachMatches(this.owner,{ ...this.sourceSet,matches },{ type: "editor/entity-candidate",fill: "#75d9b0", exclude: id => {
      const keyboardFocus = typeof document !== "undefined" && document.activeElement?.hasAttribute("data-candidate-exclusion");
      const row = this.state.rows.find(r => r.occurrences.some(m => m.id === id)); if (row) this.toggle(row.key,false);
      if (keyboardFocus) queueMicrotask(() => this.editor.mounts.get(this.overlay.key)?.focus());
    } });
    this.editor.decorations.setHighlightsVisible(this.owner,this.state.visible);
    const active = rows.find(row => row.key === this.state.active);
    if (active) this.editor.decorations.setActiveMatch(this.owner,this.state.activeMatch ?? active.match.id);
  }
  dispose() { this.disposed = true; this.generation++; clearTimeout(this.timer); this.controller?.abort(); this.search.dispose(); this.editor.decorations.disposeSession(this.owner); }
}
