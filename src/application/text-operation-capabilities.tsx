import { Show, createComponent } from "solid-js";
import type { FeatureScope, TextCaret, TextOperationCapabilities, TextSelectionSnapshot } from "../feature-api";
import type { ReactiveEditor } from "../reactive-editor/editor";
import { deleteTextRanges } from "../runtime/range-edits";

/** Application wiring only. A feature receives no editor, repository or DOM. */
export function textOperationCapabilities(editor: ReactiveEditor, scope: FeatureScope): TextOperationCapabilities {
  const requireActive = () => { if (!scope.active()) throw new Error(`Feature ${scope.owner} is disposed`); };
  const clearDecorations = () => editor.decorations.clearHighlights(scope.owner);
  scope.own(clearDecorations);
  const restoreCaret = (caret: TextCaret, snapshot?: TextSelectionSnapshot) => {
    requireActive();
    editor.crossText.clear();
    document.getSelection()?.removeAllRanges();
    if (snapshot) for (const range of snapshot.ranges) editor.selections.removeOccurrence(range.nodeKey);
    else editor.selections.clearExcept(caret.nodeKey);
    const node = editor.node(caret.nodeKey);
    if (!node) return;
    const mount = editor.mounts.get(caret.nodeKey);
    mount?.focus(); mount?.restoreInlineSelection?.({ anchor: caret.index, head: caret.index });
    editor.selections.setPrimary(node.key, node.contentKey, node.viewId, caret.index);
  };
  return {
    ranges: { snapshot: (...args) => editor.textRanges.snapshot(...args), validate: (...args) => editor.textRanges.validate(...args) },
    queries: {
      text(key) { const node = editor.node(key); return node?.viewType === "standoff-editor-block" ? { key, viewId: node.viewId, length: node.inlineContent.length } : undefined; },
      view: key => editor.node(key)?.viewId,
      contains: (scope, key) => editor.blockQueries.contains(scope, key),
      documentScope: key => editor.blockQueries.documentScope(key),
    },
    annotations: { apply(...args) { requireActive(); return editor.rangeAnnotations.apply(...args); } },
    edits: { delete(ranges, label) {
      requireActive();
      return deleteTextRanges({ ranges: editor.textRanges, order: key => editor.blockQueries.documentOrder(key),
        transaction: (label, apply) => editor.commands.transaction(label, apply),
        remove: (key, start, end) => editor.commands.replaceInlineRange(key, start, end, ""),
      }, ranges, label);
    } },
    selection: {
      clearLive() { requireActive(); editor.crossText.clear(); },
      finish: snapshot => restoreCaret(snapshot.head, snapshot), restoreCaret,
      cancelGesture: () => editor.selectionGestures.cancelGesture(),
    },
    visibility: editor.showHide.selectionVisibility(),
    decorations: {
      set(ranges, style) { requireActive(); editor.decorations.attachRanges(scope.owner, [...ranges], style); },
      clear: clearDecorations,
    },
    register: {
      gesture(policy) { requireActive(); scope.own(editor.selectionGestures.register({ ...policy, owner: scope.owner })); },
      operation(operation) { requireActive(); scope.own(editor.currentTextOperation.register(scope.owner, operation)); },
      beforeChange(listener) { requireActive(); scope.own(editor.repository.subscribeBeforeChanges(listener)); },
      command(command) { requireActive(); scope.own(editor.commandRegistry.register(command, scope.owner)); },
      toolbar(contribution) {
        requireActive();
        scope.own(editor.featureActions.registerToolbar({ ...contribution,
          notice: () => scope.active() ? contribution.notice() : "",
          selectionDetails: () => <Show when={scope.active()}>{createComponent(contribution.selectionDetails, {})}</Show>,
        }, scope.owner));
      },
    },
  };
}
