import { createSignal } from 'solid-js';
import type { ReactiveEditor } from '../reactive-editor/editor';
import type { Destination } from '../block-tree/types';
import { resourceOwner, resourceSource } from '../block-tree/resource-identity';
import { serializeSelection, plainFragment, type Slice } from '../interchange/serializer';
import { materializeFragment } from '../interchange/materialize';
import { inlineMergePredicate } from '../interchange/insertion';
import { fragmentGroup, validateFragment, type InterchangeScope, type MutableFragment } from '../interchange/fragment';
import { canWriteAsync, captureClipboard, exportClipboard, importClipboard, readAsyncClipboard, writeAsyncClipboard, writeEventClipboard } from '../interchange/transport';
import { preparePaste, type PastePreparation, type PreparedPaste } from '../interchange/prepare';
import type { BlockFragment } from '../block-tree/clipboard';

interface Bookmark {
  kind: 'text' | 'blocks'; viewId: string; slices: Slice[]; disjoint: boolean;
  signature: string; revision: number; scope: InterchangeScope; session?: string;
  nodeKey?: string; destination?: Destination;
  primaryIndex?: number;
}

/** An explicit-action service: no repository subscription or per-keystroke work. */
export class MutableClipboard {
  private readonly status = createSignal('');
  readonly message = this.status[0];
  private readonly recoverySignal = createSignal<MutableFragment>();
  readonly recovery = this.recoverySignal[0];
  private context: () => { cavernId?: string; session?: string } = () => ({});
  private alive = true;
  private pending = false;
  private cancelPreparation?: () => void;
  private plainUntil = 0;
  private plainTarget?: EventTarget | null;
  constructor(private editor: ReactiveEditor) {}
  enabled() { return this.editor.features.mutableClipboard; }
  setContext(read: () => { cavernId?: string; session?: string }) { this.context = read; }
  notify(message: string) { if (this.alive) this.status[1](message); }
  dismiss() { this.status[1](''); }
  cancel() { this.cancelPreparation?.(); }
  key(event: KeyboardEvent) {
    if (!this.enabled()) return;
    if (event.isComposing) { this.clearIntent(); return; }
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'v') { this.plainUntil = Date.now() + 1500; this.plainTarget = event.target; }
  }
  clearIntent() { this.plainUntil = 0; this.plainTarget = undefined; }
  private scope(contentKey?: string): InterchangeScope {
    const state = this.editor.repository.readState();
    const resource = contentKey && resourceOwner(state, contentKey);
    let resourceId: string | undefined;
    try { if (resource) resourceId = resourceSource(resource)?.resourceId; } catch { /* Legacy untitled documents have no portable identity. */ }
    return { ...(this.context().cavernId ? { cavernId: this.context().cavernId } : {}), ...(resourceId ? { resourceId } : {}) };
  }
  private textBookmark(event: Event, cross = false): Bookmark | undefined {
    const active = cross && this.editor.crossText.range();
    if (active) {
      const slices = this.editor.crossText.resolve(active.anchor, active.head).map(s => ({ placementKey: this.editor.node(s.nodeKey)!.placementKey, start: s.start, end: s.end }));
      return { kind: 'text', viewId: active.viewId, slices, disjoint: false, signature: JSON.stringify(active), revision: this.editor.repository.state.revision, scope: this.scope(this.editor.node(active.head.occurrenceKey)?.contentKey), session: this.context().session };
    }
    const target = event.target instanceof Element ? event.target : undefined;
    if (target?.closest('[data-block-selection-handle], [data-block-selection-inspector], input, textarea, select, [role="dialog"]')) return;
    const resolved = this.editor.mounts.resolveEvent(event);
    if (!resolved || resolved.handle.inputPolicy !== 'standoff' || resolved.handle.composing) return;
    const node = this.editor.node(resolved.nodeKey); if (!node) return;
    const set = this.editor.selections.sets[node.key];
    const native = resolved.handle.captureInlineSelection?.();
    let ranges = set?.items.length > 1 ? set.items.map(i => ({ start: Math.min(i.anchor.boundary.index, i.head.boundary.index), end: Math.max(i.anchor.boundary.index, i.head.boundary.index) }))
      : native ? [{ start: Math.min(native.anchor, native.head), end: Math.max(native.anchor, native.head) }]
        : set?.items.map(i => ({ start: Math.min(i.anchor.boundary.index, i.head.boundary.index), end: Math.max(i.anchor.boundary.index, i.head.boundary.index) }));
    if (!ranges?.length) return;
    ranges.sort((a, b) => a.start - b.start);
    ranges = ranges.filter((r, i) => !i || r.start !== ranges![i - 1].start || r.end !== ranges![i - 1].end);
    if (ranges.some((r, i) => i && r.start < ranges[i - 1].end)) throw Error('Clipboard selections cannot overlap.');
    const slices = ranges.map(r => ({ ...r, placementKey: node.placementKey, ...(ranges.length > 1 ? { gap: true } : {}) }));
    const primary = set?.items.find(i => i.id === set.primaryId);
    const primaryStart = primary ? Math.min(primary.anchor.boundary.index, primary.head.boundary.index) : ranges[0].start;
    return { kind: 'text', nodeKey: node.key, viewId: node.viewId, slices, disjoint: ranges.length > 1, primaryIndex: Math.max(0, ranges.findIndex(r => r.start === primaryStart)), signature: JSON.stringify(ranges), revision: this.editor.repository.state.revision, scope: this.scope(node.contentKey), session: this.context().session };
  }
  private blockBookmark(): Bookmark {
    const items = this.editor.blockSelection.actionTargets();
    const target = this.editor.blockClipboard.destination();
    return { kind: 'blocks', viewId: target.viewId, destination: target.destination, slices: items.map(i => ({ placementKey: i.placementKey })), disjoint: false, signature: JSON.stringify(items.map(i => i.nodeKey)), revision: this.editor.repository.state.revision, scope: this.scope(items[0]?.contentKey ?? this.editor.repository.readState().placements[this.editor.blockClipboard.gapParent() ?? '']?.contentKey), session: this.context().session };
  }
  private valid(bookmark: Bookmark, event?: Event, cross = false): boolean {
    if (!this.alive || bookmark.revision !== this.editor.repository.state.revision || bookmark.session !== this.context().session || bookmark.scope.cavernId !== this.context().cavernId || !this.editor.projections.has(bookmark.viewId)) return false;
    if (bookmark.kind === 'blocks') return bookmark.signature === JSON.stringify(this.editor.blockSelection.actionTargets().map(i => i.nodeKey));
    if (!cross && bookmark.nodeKey && this.editor.mounts.get(bookmark.nodeKey)?.root.contains(document.activeElement) !== true) return false;
    return !!event && this.textBookmark(event, cross)?.signature === bookmark.signature;
  }
  handleText(event: ClipboardEvent, cross = false): boolean {
    if (!this.enabled()) return false;
    try {
      const bookmark = this.textBookmark(event, cross); if (!bookmark) return true;
      this.consume(event, bookmark, cross);
    } catch (error) { this.stop(event); this.error(error); }
    return true;
  }
  handleBlocks(id: string, event?: Event): boolean {
    if (event instanceof KeyboardEvent) { this.key(event); return false; } // Let the browser issue the trusted clipboard event.
    try {
      const bookmark = this.blockBookmark();
      if (event && ['copy', 'cut', 'paste'].includes(event.type)) this.consume(event as ClipboardEvent, bookmark);
      else {
        if (this.pending) throw Error('A clipboard operation is already in progress.');
        if (id === 'selection.paste') this.asyncTask(async () => {
          const data = await readAsyncClipboard(); if (!this.valid(bookmark)) throw Error('Destination changed; paste cancelled.');
          this.notify('Preparing paste…');
          const imported = await this.prepare({ data, plain: false, scope: bookmark.scope, assets: [...this.availableAssets()], blocks: [...this.availableBlocks(bookmark.scope)], selections: 1 });
          if (!this.valid(bookmark)) throw Error('Destination changed; paste cancelled.');
          const notice = imported.fragment ? this.insert(bookmark, imported.fragment, false, imported.natives) : undefined; this.notify(imported.notice ?? notice ?? 'Pasted Blocks.');
        });
        else {
          if (!canWriteAsync()) throw Error('Use Command/Control-C or X with a selected Block in this browser.');
          this.write(bookmark, id === 'selection.cut');
        }
      }
    } catch (error) { this.error(error); }
    return true;
  }
  private stop(event: Event) { if (event.cancelable) event.preventDefault(); event.stopImmediatePropagation(); }
  private consume(event: ClipboardEvent, b: Bookmark, cross = false) {
    this.stop(event);
    if (this.pending) throw Error('A clipboard operation is already in progress.');
    if (event.type === 'paste') {
      const plain = this.plainUntil >= Date.now() && this.plainTarget === event.target; this.clearIntent();
      const data = captureClipboard(event.clipboardData);
      if (Object.values(data).reduce((n, value) => n + value.length, 0) > 10000) {
        this.notify('Preparing paste…');
        this.asyncTask(async () => {
          const prepared = await this.prepare({ data, plain, scope: b.scope, assets: [...this.availableAssets()], blocks: [...this.availableBlocks(b.scope)], selections: b.disjoint ? b.slices.length : 1 });
          if (!this.valid(b, event, cross)) throw Error('Destination changed; paste cancelled.');
          const notice = prepared.fragment ? this.insert(b, prepared.fragment, false, prepared.natives) : undefined;
          this.notify(prepared.notice ?? notice ?? 'Pasted Mutable content.');
        });
        return;
      }
      const imported = importClipboard(data, plain);
      const notice = imported.fragment ? this.insert(b, imported.fragment) : undefined;
      this.notify(imported.notice ?? notice ?? 'Pasted Mutable content.'); return;
    }
    if (!b.slices.length || b.kind === 'text' && b.slices.every(s => s.start === s.end)) return;
    if (b.kind === 'text' && b.disjoint) b = { ...b, slices: b.slices.filter(s => s.start !== s.end) };
    this.write(b, event.type === 'cut', event, cross);
  }
  private write(b: Bookmark, cut: boolean, event?: ClipboardEvent, cross = false) {
    const fragment = serializeSelection(this.editor.repository.readState(), b.slices, b.scope);
    const representations = exportClipboard(fragment);
    if (canWriteAsync() && (!event || event.isTrusted)) {
      // Start the write within the activation callback; don't await a resolver first.
      this.asyncTask(async () => {
        await writeAsyncClipboard(representations);
        if (cut) {
          if (!this.valid(b, event, cross)) throw Error('Copied, but the source changed; nothing was cut.');
          this.recoverySignal[1](fragment); this.remove(b);
        }
        this.notify(cut ? 'Cut content. Undo restores it; a recovery copy is retained.' : 'Copied Mutable content.');
      });
    } else {
      if (!event?.cancelable) throw Error('Clipboard event cannot safely replace the browser action; nothing was removed.');
      writeEventClipboard(event.clipboardData, representations);
      if (cut) { this.recoverySignal[1](fragment); this.remove(b); }
      this.notify(cut ? 'Cut content. Undo or Recover cut copy restores access if the clipboard fails.' : 'Copied Mutable content.');
    }
  }
  private asyncTask(task: () => Promise<void>) {
    this.pending = true;
    void task().catch(e => { if (this.alive) this.error(e); }).finally(() => { this.pending = false; });
  }
  private prepare(input: PastePreparation): Promise<PreparedPaste> {
    if (typeof Worker === 'undefined') return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.cancelPreparation = undefined; try { resolve(preparePaste(input)); } catch (e) { reject(e); } }, 0);
      this.cancelPreparation = () => { clearTimeout(timer); this.cancelPreparation = undefined; reject(Error('Paste cancelled.')); };
    });
    return new Promise((resolve, reject) => {
      const worker = new Worker(new URL('../interchange/prepare.worker.ts', import.meta.url), { type: 'module' });
      const finish = () => { worker.terminate(); this.cancelPreparation = undefined; };
      worker.onmessage = event => { finish(); if (event.data.error) reject(Error(event.data.error)); else resolve(event.data.result); };
      worker.onerror = () => { finish(); reject(Error('Paste preparation failed; nothing was changed.')); };
      this.cancelPreparation = () => { finish(); reject(Error('Paste cancelled.')); };
      try { worker.postMessage(input); } catch (error) { finish(); reject(error); }
    });
  }
  private availableAssets() {
    const assets = new Map<string, string>();
    for (const c of Object.values(this.editor.repository.readState().contents)) if (c.viewType === 'image-cell' && typeof c.payload.assetId === 'string' && typeof c.payload.src === 'string') assets.set(c.payload.assetId, c.payload.src);
    return assets;
  }
  private availableBlocks(scope: InterchangeScope) {
    const result = new Map<string, boolean>(); if (!scope.resourceId) return result;
    const state = this.editor.repository.readState();
    const root = Object.values(state.contents).find(c => c.viewType === 'document-block' && ((c.payload.metadata as any)?.documentId ?? c.payload.id) === scope.resourceId);
    if (!root) return result;
    const seen = new Set<string>();
    const visit = (key: string) => {
      if (seen.has(key)) return; seen.add(key); const c = state.contents[key];
      if (!c || c !== root && c.viewType === 'document-block') return;
      if (typeof c.payload.id === 'string') result.set(c.payload.id, !!(c.payload.metadata as any)?.anchor);
      for (const edge of [...c.children, ...Object.values(c.ownedRelations)]) { const p = state.placements[edge]; if (p && !p.externalReference) visit(p.contentKey); }
    };
    visit(root.key); return result;
  }
  private remove(b: Bookmark) {
    if (b.kind === 'blocks') { this.editor.blockClipboard.remove(true, true); return; }
    this.insert(b, plainFragment(''), true);
  }
  private insert(b: Bookmark, fragment: MutableFragment, cut = false, prepared?: BlockFragment[]): string | undefined {
    validateFragment(fragment);
    let assets = new Map<string, string>();
    // Only imports containing embeds need an availability check. No typing or
    // plain-paste subscription maintains this inventory.
    if (!prepared && fragment.embeds.length && b.scope.cavernId === fragment.provenance?.cavernId) assets = this.availableAssets();
    const hasExternalBlocks = fragment.links.some(l => l.to.kind === 'external' && l.to.object === 'block') || fragment.blocks.some(b => [...b.blockProperties, ...b.inline?.properties ?? []].some(p => p.target?.kind === 'external' && p.target.object === 'block'));
    const blocks = !prepared && hasExternalBlocks ? this.availableBlocks(b.scope) : new Map<string, boolean>();
    const materialize = (f: MutableFragment) => materializeFragment(f, b.scope, assets, blocks);
    const diagnostic = (native: ReturnType<typeof materialize>) => Object.values(native.state.contents).some(c => c.viewType === 'mutable/opaque-block' || c.payload.original || c.payload.mutableUnresolvedLinks || (c.payload.standoffProperties as any[])?.some(p => p.type === 'mutable/opaque-property'))
      ? 'Pasted content. Unsupported types, unavailable images or foreign references were retained as inactive data.' : undefined;
    if (b.kind === 'blocks') {
      const native = prepared?.[0] ?? materialize(fragment);
      const keys = this.editor.commands.insertFragment(native, b.destination!, { commandId: 'selection.paste', subjects: [], clipboard: { token: crypto.randomUUID(), action: 'paste', preservedIds: false } });
      this.editor.blockSelection.replaceKeys(keys.map(k => this.editor.nodeForPlacementInView(k, b.viewId)!.key)); this.editor.blockClipboard.dismiss(); return diagnostic(native);
    }
    // Multiple disjoint source groups preserve their dependencies before allocation.
    const groups: MutableFragment['roots'][] = [[]];
    for (const root of fragment.roots) { groups.at(-1)!.push(root); if (root.separatorAfter === 'selection-gap') groups.push([]); }
    if (!groups.at(-1)!.length) groups.pop();
    if (b.disjoint && groups.length !== 1 && groups.length !== b.slices.length) throw Error('Selection group counts differ. Paste into one range or matching ranges.');
    const edits = b.disjoint ? [...b.slices].reverse().map((slice, index) => {
      const i = b.slices.length - 1 - index;
      const selected = groups.length > 1 ? fragmentGroup(fragment, groups[i]) : fragment;
      if (selected.roots.length !== 1 || !selected.roots[0].openStart || !selected.roots[0].openEnd) throw Error('Paste structured Blocks into a single text selection. Multiple selections accept inline slices.');
      return { segments: [{ placementKey: slice.placementKey, start: slice.start!, end: slice.end! }], fragment: prepared?.[index] ?? materialize(selected), slices: selected.roots };
    }) : [{ segments: b.slices.map(s => ({ placementKey: s.placementKey, start: s.start!, end: s.end! })), fragment: prepared?.[0] ?? materialize(fragment), slices: fragment.roots }];
    // Multi-caret edits must stay inline so every caret can be mapped exactly.
    if (b.disjoint && edits.some(e => {
      const root = e.fragment.state.contents[e.fragment.state.placements[e.fragment.roots[0]].contentKey];
      return !inlineMergePredicate(e.fragment, 'standoff-editor-block')(root);
    })) throw Error('Paste structured content into a single text selection.');
    const results = this.editor.commands.insertMutableText(edits, cut);
    const positions = results.map((r, i) => ({ ...r, caret: r.caret + edits.slice(i + 1).reduce((delta, e) => {
      const root = e.fragment.state.contents[e.fragment.state.placements[e.fragment.roots[0]].contentKey];
      return delta + root.inlineContent.length - (e.segments[0].end - e.segments[0].start);
    }, 0) })).reverse();
    const result = b.disjoint ? positions[Math.min(b.primaryIndex ?? 0, positions.length - 1)] : results.at(-1)!;
    this.editor.crossText.clear();
    const restore = () => {
      if (!this.alive) return;
      const node = this.editor.nodeForPlacementInView(result.placementKey, b.viewId); if (!node) return;
      this.editor.selections.clearSecondary(node.key);
      this.editor.selections.setPrimary(node.key, node.contentKey, node.viewId, result.caret);
      if (b.disjoint) for (const position of positions) if (position !== result) this.editor.selections.addCaret(node.key, node.contentKey, node.viewId, position.caret);
      const mount = this.editor.mounts.get(node.key); mount?.focus(); mount?.restoreInlineSelection?.({ anchor: result.caret, head: result.caret });
    };
    restore(); queueMicrotask(restore);
    return edits.map(e => diagnostic(e.fragment)).find(Boolean);
  }
  recoverCopy() {
    if (this.pending || !this.alive) return;
    const fragment = this.recovery(); if (!fragment) return;
    if (!canWriteAsync()) { this.notify('Use Undo to restore the cut in this browser.'); return; }
    this.asyncTask(async () => { await writeAsyncClipboard(exportClipboard(fragment)); this.notify('Recovered the cut content to the clipboard.'); });
  }
  private error(error: unknown) { this.notify(error instanceof Error ? error.message : String(error)); }
  dispose() { this.alive = false; this.cancel(); this.clearIntent(); this.recoverySignal[1](undefined); this.dismiss(); }
}
