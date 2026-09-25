import { immutable } from "../runtime/effect-contributions";
import type { AnnotationCapabilities, AnnotationText } from "../feature-api/annotations";
import type { FeatureScope } from "../runtime/features";
import type { ReactiveEditor } from "../reactive-editor/editor";
import { ancestorPath, nodeLabel, resolveSearchScope, scopeNodes, TextSearch } from "../runtime/text-search";
import { revealMatch, revealPositionMarker } from "../runtime/reveal-match";
import { currentPageForScope, nodeKeysForPage } from "../runtime/minimap";
import { panelSession } from "../runtime/panel-session";

export function annotationCapabilities(editor: ReactiveEditor, scope: FeatureScope): AnnotationCapabilities {
  const check = () => { if (!scope.active()) throw new Error(`Feature ${scope.owner} is disposed`); };
  const panelTypes = new Set<string>();
  scope.own(() => { for (const overlay of [...editor.overlays.overlays]) if (panelTypes.has(overlay.viewType)) editor.overlays.close(overlay.key, false); });
  // Candidate classification repeatedly reads the same paragraph. Detach once
  // per repository revision, never once per match or typed query character.
  const texts = new Map<string, AnnotationText>();
  let textRevision = -1;
  scope.own(() => texts.clear());
  const text = (key: string): AnnotationText | undefined => {
    const revision = editor.repository.state.revision;
    if (textRevision !== revision) { texts.clear(); textRevision = revision; }
    const cached = texts.get(key); if (cached) return cached;
    const node = editor.node(key); if (!node) return;
    const snapshot = immutable({ key, contentKey: node.contentKey, placementKey: node.placementKey,
      version: editor.repository.state.contents[node.contentKey]?.inlineRevision ?? 0,
      cells: node.inlineContent.map(key => { const cell = editor.node(key); return { plain: cell?.viewType === "text-cell", text: String(cell?.payload.text ?? " ") }; }),
      properties: ((Array.isArray(node.payload.standoffProperties) ? node.payload.standoffProperties : []) as Record<string, unknown>[]).filter(p => p && typeof p === "object" && !Array.isArray(p)).map(p => JSON.parse(JSON.stringify(editor.linkedAnnotations.resolve(p)))),
    });
    texts.set(key, snapshot); return snapshot;
  };
  return {
    revision: () => editor.repository.state.revision, text,
    path: key => ancestorPath(editor, key).map(node => ({ key: node.key, label: nodeLabel(node) })),
    scope: (key, kind) => resolveSearchScope(editor, key, kind),
    documentTexts(key) {
      const node = editor.node(key);
      const origin = node?.viewType === "document-window-block" ? node.children.find(child => editor.node(child)?.viewType === "document-block") ?? key : key;
      const scope = resolveSearchScope(editor, origin, "document");
      return { scope, texts: scopeNodes(editor, scope).found.filter(({ node }) => node.viewType === "standoff-editor-block").map(({ node }) => text(node.key)!) };
    },
    selection(key) {
      const cross = editor.crossText.range(); if (cross) return editor.crossText.resolve(cross.anchor, cross.head);
      const range = editor.mounts.get(key)?.captureInlineSelection?.();
      return range ? [{ nodeKey: key, start: Math.min(range.anchor, range.head), end: Math.max(range.anchor, range.head) }] : [];
    },
    beforeChange: listener => scope.own(editor.repository.subscribeBeforeChanges(listener)),
    afterChange: listener => scope.own(editor.repository.subscribeChanges(listener)),
    search(runner) { check(); const search = new TextSearch(editor, runner); const dispose = scope.own(() => search.dispose()); return { searchText: request => search.searchText(request), dispose }; },
    annotate(...args) { check(); return editor.linkedAnnotations.createBatch(...args); },
    openPanel(type, owner, data, selection = []) {
      check(); if (!panelTypes.has(type) || !editor.node(owner)) throw new Error("Open the panel from a document first.");
      for (const overlay of [...editor.overlays.overlays]) if (overlay.viewType === type) editor.overlays.close(overlay.key, false);
      const mount = editor.mounts.get(owner), rect = mount?.root.getBoundingClientRect();
      editor.crossText.clear();
      const first = selection.find(range => range.end > range.start);
      if (first) { mount?.focus(); mount?.restoreInlineSelection?.({ anchor: first.start, head: first.end }); }
      const key = editor.overlays.open({ ownerKey: owner, viewType: type, anchor: { x: rect?.left ?? 20, y: (rect?.bottom ?? 20) + 8 }, data });
      return panelSession(editor, editor.overlays.overlays.find(overlay => overlay.key === key)!);
    },
    decorations(owner) {
      check(); const id = `${scope.owner}:${owner}`;
      let live = true;
      const requireLive = () => { check(); if (!live) throw new Error("Decoration session is disposed"); };
      const dispose = scope.own(() => { live = false; editor.decorations.disposeSession(id); });
      return {
        ranges(ranges, style) { requireLive(); editor.decorations.attachRanges(id, ranges, style); },
        matches(set, style) { requireLive(); editor.decorations.attachMatches(id, set, style); },
        visible(visible) { requireLive(); editor.decorations.setHighlightsVisible(id, visible); },
        active(match) { requireLive(); editor.decorations.setActiveMatch(id, match); },
        clear: () => editor.decorations.clearHighlights(id), dispose,
      };
    },
    reveal: (match, valid) => revealMatch(editor, match, () => scope.active() && valid()),
    revealMarker: (marker, valid) => revealPositionMarker(editor, marker, () => scope.active() && valid()),
    currentPage: (scope, key) => currentPageForScope(editor, scope, [editor.focus.state.focusedKey, editor.focus.state.lastFocusedKey, key]),
    pageKeys: key => nodeKeysForPage(editor, key),
    concertina: {
      activate(owner, searchScope, markers, activeMarkerOrGroup, replaced) { check(); editor.concertina.activate({ owner: `${scope.owner}:${owner}`, viewId: searchScope.viewId, scope: searchScope, markers, activeMarkerOrGroup }, {}, replaced); },
      clear: owner => editor.concertina.deactivate(`${scope.owner}:${owner}`),
      active: id => editor.concertina.setActiveMarker(id),
    },
    bindings: { dispatch: (...args) => editor.bindings.dispatch(...args), label: (...args) => editor.bindings.label(...args) },
    register: {
      panel(definition) { check(); const dispose = editor.panels.register(definition); panelTypes.add(definition.type); scope.own(dispose); },
      effect(definition) { check(); scope.own(editor.effects.register(definition)); },
      annotation(definition) { check(); scope.own(editor.annotationUI.register(definition)); },
      command(definition) { check(); scope.own(editor.commandRegistry.register(definition, scope.owner)); },
      binding(definition) { check(); scope.own(editor.bindings.register(definition, scope.owner)); },
      action(definition) { check(); scope.own(editor.featureActions.register(definition, scope.owner)); },
    },
  };
}
