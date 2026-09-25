import { createStore } from "solid-js/store";
import type { AnnotationCapabilities, PanelSession, SearchMatch, SearchMatchSet, SearchScope, ScopeKind, SearchOptions, SearchRunner } from "../../feature-api";
import { graphemeBoundaries } from "../../feature-api";
import type { EntitySearchData } from "./entity-search";

export interface NominatedEntity { id: string; name: string }
export interface EntityCandidate { key: string; match: SearchMatch; occurrences: SearchMatch[]; original: boolean; checked: boolean; reason: string }
export const candidateKey = (match: SearchMatch) => JSON.stringify(match.ranges.map(r => [r.contentKey,r.start,r.end]).sort((a,b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));
const overlaps = (a: SearchMatch, b: SearchMatch) => a.ranges.some(x => b.ranges.some(y => x.contentKey === y.contentKey && x.start < y.end && y.start < x.end));
function textAt(editor: AnnotationCapabilities, match: SearchMatch) {
  return match.ranges.map(r => {
    const node = editor.text(r.nodeKey);
    if (!node || node.contentKey !== r.contentKey || node.placementKey !== r.placementKey || r.coordinate !== "cell" || !Number.isInteger(r.start) || !Number.isInteger(r.end) || r.start < 0 || r.end <= r.start || r.end > node.cells.length) throw new Error("A mention range is no longer valid.");
    return node.cells.slice(r.start,r.end).map(cell => { if (!cell.plain) throw new Error("Mentions cannot include inline media."); return cell.text; }).join("");
  }).join(" ");
}
/** Resolve both local properties and shared definitions before deciding eligibility. */
export function candidateReason(editor: AnnotationCapabilities, match: SearchMatch, entity?: NominatedEntity): string {
  if (!match.capabilities.annotate) return match.capabilities.reason ?? "This range cannot receive an entity annotation.";
  const states = match.ranges.map(range => {
    const node = editor.text(range.nodeKey); if (!node) return "conflict";
    const properties = node.properties;
    const refs = properties.filter(p => !p.isDeleted && p.type === "codex/entity-reference" && Number(p.start) < range.end && Number(p.end) + 1 > range.start);
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
export function bindEntityCandidates(editor: AnnotationCapabilities, set: SearchMatchSet, matches: SearchMatch[], entity: NominatedEntity): number {
  if (!entity.id || !entity.name) throw new Error("Nominate an entity first.");
  if (set.status !== "complete" && set.status !== "partial") throw new Error("Wait for a successful search before binding mentions.");
  if (set.revision !== editor.revision()) throw new Error("The document changed. Select the text again.");
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
  editor.annotate(eligible.map(match => match.ranges), "codex/entity-reference", entity.id,
    { entityId: entity.id, entityName: entity.name }, set.revision, `Bind ${eligible.length} entity mentions`);
  return eligible.length;
}

export class EntityCandidates {
  readonly state;
  private setState;
  readonly owner: string;
  readonly search: ReturnType<AnnotationCapabilities["search"]>;
  private decorations: ReturnType<AnnotationCapabilities["decorations"]>;
  private original?: SearchMatch;
  private controller?: AbortController;
  private timer?: ReturnType<typeof setTimeout>;
  private generation = 0;
  private disposed = false;
  private undo: string[] = [];
  private sourceSet?: SearchMatchSet;
  constructor(private editor: AnnotationCapabilities, private panel: PanelSession, runner?: SearchRunner) {
    const overlay = panel.data as EntitySearchData;
    this.owner = `entity-candidates:${panel.key}`; this.search = editor.search(runner);
    this.decorations = editor.decorations(this.owner);
    const ranges = (overlay.entityRanges ?? []).map(r => { const node = editor.text(r.nodeKey)!; return { ...r, contentKey: node.contentKey, placementKey: node.placementKey, version: node.version, coordinate: "cell" as const }; });
    const path = editor.path(panel.ownerKey);
    let actionable = true;
    for (const r of ranges) {
      const node = editor.text(r.nodeKey)!;
      const cells = node.cells;
      const boundaries = graphemeBoundaries(cells.map(c => c.plain ? c.text : "\uFFFC").join(""));
      actionable &&= boundaries.includes(r.start) && boundaries.includes(r.end) && cells.slice(r.start,r.end).every(c => c.plain);
    }
    this.original = { id: `${this.owner}:original`, text: overlay.entityQuery ?? "", context: overlay.entityQuery ?? "", captures: [], ranges, path: path.map(n => n.key), breadcrumb: path.map(n => n.label).join(" / "), capabilities: { annotate: actionable, highlight: true, reveal: true, replace: false, reason: actionable ? undefined : "The selected passage splits a grapheme or includes inline media." } };
    if (!ranges.length) this.original = undefined;
    const scope = editor.scope(panel.ownerKey);
[this.state,this.setState] = createStore<{ enabled: boolean; query: string; options: SearchOptions; scope: SearchScope; result?: SearchMatchSet; rows: EntityCandidate[]; entity?: NominatedEntity; pending: boolean; visible: boolean; active?: string; activeMatch?: string; message: string; page: number; undoCount: number }>({ enabled: false, query: ranges.length === 1 ? (this.original?.text ?? "") : "", options: { wholeWords: true }, scope, rows: [], pending: false, visible: true, message: "", page: 0, undoCount: 0 });
  }
  enable() {
    if (this.state.enabled) {
      if (this.state.result?.status === "error" || this.state.result?.status === "cancelled") this.schedule(true);
      else this.selectAll();
      return;
    }
    this.setState("enabled",true); this.panel.allowDocumentInput(true); this.schedule(true);
  }
  configure(change: { query?: string; options?: SearchOptions; scope?: ScopeKind }) {
    if (change.query !== undefined) this.setState("query",change.query);
    if (change.options) this.setState("options",change.options);
    if (change.scope) this.setState("scope",this.editor.scope(this.panel.ownerKey,change.scope));
    if (this.state.enabled) this.schedule(false);
  }
  disable() {
    this.controller?.abort(); clearTimeout(this.timer); this.generation++; this.undo = [];
    this.sourceSet = undefined;
    this.setState({ enabled: false, pending: false, result: undefined, rows: [], undoCount: 0, active: undefined, activeMatch: undefined, message: "" });
    this.decorations.clear();
    this.panel.allowDocumentInput(false);
  }
  private schedule(selectAll: boolean) {
    this.controller?.abort(); clearTimeout(this.timer); this.generation++; this.undo = [];
    this.setState({ pending: true, result: undefined, page: 0, undoCount: 0, message: "", active: undefined, activeMatch: undefined });
    this.decorations.clear();
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
    if (this.state.result.revision !== this.editor.revision()) return "The document changed. Search again.";
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
  toggleHighlights() { this.setState("visible",v => !v); this.decorations.visible(this.state.visible); }
  setPage(page: number) { this.setState("page",Math.max(0,page)); }
  async reveal(row: EntityCandidate, occurrence = 0) {
    const match = row.occurrences[occurrence] ?? row.match;
    this.setState({ active: row.key,activeMatch: match.id }); this.paint();
    if (!await this.editor.reveal(match,() => !this.disposed && this.state.activeMatch === match.id)) this.setState("message","This mention cannot be revealed by the current view adapter.");
  }
  bind() {
    if (this.state.result && this.state.result.revision !== this.editor.revision()) throw new Error("The document changed. Select the text again.");
    if (!this.canBind()) throw new Error("Choose an entity and checked mentions from a complete search first.");
    return bindEntityCandidates(this.editor,this.state.result!,this.selected().map(r => r.match),this.state.entity!);
  }
  private paint() {
    if (!this.sourceSet || this.disposed || this.state.pending) return;
    const rows = this.selected(), matches = rows.flatMap(row => row.occurrences);
    this.decorations.matches({ ...this.sourceSet,matches },{ type: "editor/entity-candidate",fill: "#75d9b0", excludeLabel: "Exclude this mention", excludeTitle: "Exclude this mention from entity binding", exclude: (id, { keyboard }) => {
      const row = this.state.rows.find(r => r.occurrences.some(m => m.id === id)); if (row) this.toggle(row.key,false);
      if (keyboard) queueMicrotask(() => this.panel.focus());
    } });
    this.decorations.visible(this.state.visible);
    const active = rows.find(row => row.key === this.state.active);
    if (active) this.decorations.active(this.state.activeMatch ?? active.match.id);
  }
  dispose() { this.disposed = true; this.generation++; clearTimeout(this.timer); this.controller?.abort(); this.search.dispose(); this.decorations.dispose(); }
}
