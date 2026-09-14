import { For, Show, createEffect, createSignal } from "solid-js";
import { unwrap } from "solid-js/store";
import type { ReactiveEditor } from "../reactive-editor/editor";
import type { NodeKey } from "../block-tree/types";
import { createTextTab } from "../runtime/text-tabs";
import { openEntitySearch } from "../runtime/entity-search";
import "./document-style-bar.css";
import { DocumentCountBar } from "./document-count-bar";

/** Canonical style types, including the three preserved range-wrapper styles. */
export const annotationTools = [
  ["style/bold", "Bold selection", "B"], ["style/italics", "Italicise selection", "I"],
  ["style/underline", "Underline", "U"], ["style/strikethrough", "Strikethrough", "S̶"],
  ["style/superscript", "Superscript", "x²"], ["style/subscript", "Subscript", "x₂"],
  ["style/uppercase", "Uppercase", "AA"], ["style/highlight", "Highlight", "Highlight"],
  ["style/highlighter", "Highlighter", "Marker"], ["style/rainbow", "Rainbow underline", "Rainbow"],
  ["style/rectangle", "Rectangle", "□ Rectangle"], ["style/spiky", "Spiky outline", "Spiky"],
  ["style/blur", "Blur", "Blur"], ["style/flip", "Flip", "Flip"], ["style/mirror", "Mirror", "Mirror"],
] as const;

export function DocumentStyleBar(props: { editor: ReactiveEditor; scopeKey?: NodeKey }) {
  const editor = props.editor;
  const [targetKey, setTargetKey] = createSignal<NodeKey>();
  const [notice, setNotice] = createSignal("");
  const [linkedType, setLinkedType] = createSignal("codex/entity-reference"), [linkedValue, setLinkedValue] = createSignal("");
  const [colour, setColour] = createSignal("#ff0000"), [background, setBackground] = createSignal("#ffff00");
  let savedRange: { anchor: number; head: number } | undefined;
  const inScope = (key: NodeKey): boolean => {
    if (!props.scopeKey) return true;
    const visit = (key: NodeKey): boolean => key === target || !!editor.node(key)?.children.some(visit) || !!Object.values(editor.node(key)?.ownedRelations ?? {}).some(visit);
    const target = key;
    return visit(props.scopeKey);
  };
  createEffect(() => {
    const key = editor.focus.state.focusedKey, node = key && editor.node(key);
    if (node && node.viewType === "standoff-editor-block" && inScope(node.key)) {
      if (targetKey() !== node.key) savedRange = undefined;
      setTargetKey(node.key);
    }
  });
  const target = () => { const key = targetKey(); return key && inScope(key) ? editor.node(key) : undefined; };
  const capture = () => {
    if (editor.crossText.range()) return;
    const node = target(); if (!node) return;
    const mount = editor.mounts.get(node.key), anchor = document.getSelection()?.anchorNode;
    if (anchor && mount?.root.contains(anchor)) savedRange = mount.captureInlineSelection?.();
    else if (!savedRange) {
      const set = editor.selections.sets[node.key], primary = set?.items.find(item => item.id === set.primaryId);
      if (primary) savedRange = { anchor: primary.anchor.boundary.index, head: primary.head.boundary.index };
    }
  };
  const retainSelection = (event: PointerEvent) => { capture(); if ((event.target as Element).closest("button")) event.preventDefault(); };
  const restore = () => {
    if (editor.crossText.range()) return;
    const node = target(); if (!node) return;
    editor.mounts.get(node.key)?.focusElement?.focus({ preventScroll: true });
    if (savedRange) editor.mounts.get(node.key)?.restoreInlineSelection?.(savedRange);
  };
  const annotate = (type: string, value?: string) => {
    const cross = editor.crossText.range();
    if (cross) {
      if (!inScope(cross.anchor.occurrenceKey)) { setNotice("The text selection belongs to another document."); return; }
      try { if (type === "codex/entity-reference") openEntitySearch(editor, editor.crossText.resolve(cross.anchor, cross.head)); else editor.crossText.annotate(type, value); setNotice(""); }
      catch (error) { setNotice(error instanceof Error ? error.message : String(error)); }
      return;
    }
    capture(); const node = target();
    if (type === "codex/entity-reference" && (!node || !savedRange || savedRange.anchor === savedRange.head)) {
      try { openEntitySearch(editor, [], node?.key ?? props.scopeKey); setNotice(""); }
      catch (error) { setNotice(error instanceof Error ? error.message : String(error)); }
      return;
    }
    if (!node || !savedRange) { setNotice("Select text in this document first."); return; }
    const start = Math.min(savedRange.anchor, savedRange.head), end = Math.max(savedRange.anchor, savedRange.head) - 1;
    if (start < 0 || end < start || end >= node.inlineContent.length) { setNotice("Select a non-empty text range first."); return; }
    if (type === "codex/entity-reference") { openEntitySearch(editor, [{ nodeKey: node.key, start, end: end + 1 }]); return; }
    const current = (node.payload.standoffProperties as Record<string, unknown>[] | undefined) ?? [];
    // Applying a toolbar style never deletes an existing annotation or its metadata.
    if (!current.some(p => !p.isDeleted && p.type === type && p.start === start && p.end === end && p.value === value)) {
      editor.commands.setPayloadField(node.key, "standoffProperties", [...unwrap(current), { id: crypto.randomUUID(), type, start, end, ...(value !== undefined ? { value } : {}) }], "Annotate Selection");
    }
    setNotice(""); restore();
  };
  const blockStyle = (type: string, value: string) => {
    if (editor.crossText.range()) { editor.crossText.notice("Collapse the text selection before changing paragraph layout."); return; }
    capture(); const node = target(); if (!node) { setNotice("Focus a text Block first."); return; }
    const current = (node.payload.blockProperties as Record<string, unknown>[] | undefined) ?? [];
    const existing = current.find(p => p.type === type && !p.isDeleted);
    if (existing?.value === value) return;
    editor.commands.setPayloadField(node.key, "blockProperties", [...unwrap(current).filter(p => p !== unwrap(existing)), { ...unwrap(existing), type, value }], "Format Block");
    setNotice(""); restore();
  };
  const indent = (delta: number) => {
    const properties = target()?.payload.blockProperties as Record<string, unknown>[] | undefined;
    const value = Number(properties?.find(p => p.type === "block/indent" && !p.isDeleted)?.value ?? 0);
    blockStyle("block/indent", String(Math.max(0, (Number.isFinite(value) ? Math.trunc(value) : 0) + delta)));
  };
  const clear = () => {
    if (editor.crossText.range()) { editor.crossText.notice("Range-aware Clear Formatting is not enabled yet. Existing formatting outside the selection is protected."); return; }
    const node = target(); if (!node) return;
    editor.commands.transaction("Clear Formatting", () => {
      const annotations = (node.payload.standoffProperties as Record<string, unknown>[] | undefined) ?? [];
      editor.commands.setPayloadField(node.key, "standoffProperties", unwrap(annotations).filter(p => !String(p.type).startsWith("style/") && !["text/colour", "text/background-colour"].includes(String(p.type))), "Clear Formatting");
      editor.commands.setPayloadField(node.key, "blockProperties", [], "Clear Formatting");
    }); restore();
  };
  return <nav class="workspace-demo__stylebar document-style-bar" aria-label="Document formatting" onPointerDown={retainSelection}>
    <button type="button" title={editor.bindings.label("find.open")} onClick={() => { const key = targetKey() ?? props.scopeKey ?? editor.focus.state.focusedKey ?? editor.focus.state.lastFocusedKey; if (key) { editor.find.open(key); if (!editor.find.state.open) setNotice(editor.find.state.message); } else setNotice("Focus text in a document first."); }}>Find</button>
    <button type="button" title={`Entities in Document (${editor.bindings.label("entity.list.open")})`} onClick={() => { const key = targetKey() ?? props.scopeKey ?? editor.focus.state.focusedKey ?? editor.focus.state.lastFocusedKey; if (key) { editor.entityList.open(key); if (!editor.entityList.state.open) setNotice(editor.entityList.state.error); } else setNotice("Focus a document first."); }}>Entities</button>
    <label title="Select, edit and annotate text across adjacent Blocks. This preference is remembered in this browser."><input type="checkbox" aria-label="Experimental cross-Block text selection" checked={editor.crossText.enabled()} onChange={event => editor.crossText.enable(event.currentTarget.checked)} />Cross-Block selection (experimental)</label>
    <Show when={editor.crossText.enabled()}><button type="button" disabled={!editor.crossText.range()} onClick={() => editor.crossText.collapseToHead()}>Resume text editing</button></Show>
    <Show when={editor.crossText.enabled()}><label>Linked annotation type<input aria-label="Linked annotation type" value={linkedType()} onInput={event => setLinkedType(event.currentTarget.value)} /></label>
      <label>Reference/value<input aria-label="Linked annotation value" value={linkedValue()} onInput={event => setLinkedValue(event.currentTarget.value)} /></label>
      <button type="button" onClick={() => {
        const range = editor.crossText.range(); if (!range || !inScope(range.anchor.occurrenceKey)) { setNotice("Select text in this document first."); return; }
        const head = range.head;
        try {
          if (linkedType().trim() === "codex/entity-reference") { openEntitySearch(editor, editor.crossText.resolve(range.anchor, range.head)); return; }
          const id = editor.linkedAnnotations.create(linkedType(), linkedValue());
          setNotice(`Created linked annotation ${id}`);
          const mount = editor.mounts.get(head.occurrenceKey); mount?.focus(); mount?.restoreInlineSelection?.({ anchor: head.boundary.index, head: head.boundary.index });
        } catch (error) { setNotice(error instanceof Error ? error.message : String(error)); }
      }}>Create linked annotation</button>
    </Show>
    <For each={annotationTools}>{([type, label, glyph]) => <button type="button" title={label} aria-label={label} data-annotation-type={type} onClick={() => annotate(type)}>{glyph}</button>}</For>
    <button type="button" aria-label="Entity reference" title="Link selected text to an entity" onClick={() => annotate("codex/entity-reference")}>Entity reference</button>
    <label title="Text colour">Text <input type="color" aria-label="Text colour" value={colour()} onInput={e => setColour(e.currentTarget.value)} /></label>
    <button type="button" title="Apply text colour" data-annotation-type="text/colour" onClick={() => annotate("text/colour", colour())}>Apply colour</button>
    <label title="Text background colour">Fill <input type="color" aria-label="Text background colour" value={background()} onInput={e => setBackground(e.currentTarget.value)} /></label>
    <button type="button" title="Apply background colour" data-annotation-type="text/background-colour" onClick={() => annotate("text/background-colour", background())}>Apply fill</button>
    <i />
    <For each={[["left", "Align left", "≡"], ["center", "Align centre", "≣"], ["right", "Align right", "≡"], ["justify", "Justify", "☰"]]}>{([value, label, glyph]) => <button type="button" title={label} onClick={() => blockStyle("block/alignment", value)}>{glyph}</button>}</For>
    <For each={["h1", "h2", "h3", "h4"]}>{size => <button type="button" title={`Apply ${size.toUpperCase()}`} onClick={() => blockStyle("block/font/size", size)}>{size.toUpperCase()}</button>}</For>
    <button type="button" title="Increase indent" onClick={() => indent(1)}>⇥</button>
    <button type="button" title="Decrease indent" onClick={() => indent(-1)}>⇤</button>
    <button type="button" aria-label="To tab / add tab" title={`To tab / add tab (${editor.bindings.label("tabs.create")})`} onClick={() => {
      if (editor.crossText.range()) { editor.crossText.notice("Collapse the text selection before creating a tab."); return; }
      capture(); const node = target();
      if (!node || !createTextTab(editor, node.key, savedRange)) setNotice("Focus a text Block in this document first.");
      else { savedRange = undefined; setNotice(""); }
    }}>To tab / + Tab</button>
    <button type="button" title="Clear formatting" onClick={clear}>T×</button>
    <span role="status">{notice() || editor.crossText.message()}</span>
    <DocumentCountBar editor={editor} scopeKey={props.scopeKey} />
  </nav>;
}
