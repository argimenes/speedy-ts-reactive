import { For, createEffect, createSignal } from "solid-js";
import { unwrap } from "solid-js/store";
import type { ReactiveEditor } from "../reactive-editor/editor";
import type { NodeKey } from "../block-tree/types";
import "./document-style-bar.css";

/** Canonical style types, including the three preserved range-wrapper styles. */
export const annotationTools = [
  ["style/bold", "Bold selection", "B"], ["style/italics", "Italicise selection", "I"],
  ["style/underline", "Underline", "U"], ["style/strikethrough", "Strikethrough", "S̶"],
  ["style/superscript", "Superscript", "x²"], ["style/subscript", "Subscript", "x₂"],
  ["style/uppercase", "Uppercase", "AA"], ["style/highlight", "Highlight", "Highlight"],
  ["style/highlighter", "Highlighter", "Marker"], ["style/rainbow", "Rainbow underline", "Rainbow"],
  ["style/rectangle", "Rectangle", "□"], ["style/spiky", "Spiky outline", "Spiky"],
  ["style/blur", "Blur", "Blur"], ["style/flip", "Flip", "Flip"], ["style/mirror", "Mirror", "Mirror"],
] as const;

export function DocumentStyleBar(props: { editor: ReactiveEditor; scopeKey?: NodeKey }) {
  const editor = props.editor;
  const [targetKey, setTargetKey] = createSignal<NodeKey>();
  const [notice, setNotice] = createSignal("");
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
    const node = target(); if (!node) return;
    editor.mounts.get(node.key)?.focusElement?.focus({ preventScroll: true });
    if (savedRange) editor.mounts.get(node.key)?.restoreInlineSelection?.(savedRange);
  };
  const annotate = (type: string, value?: string) => {
    capture(); const node = target();
    if (!node || !savedRange) { setNotice("Select text in this document first."); return; }
    const start = Math.min(savedRange.anchor, savedRange.head), end = Math.max(savedRange.anchor, savedRange.head) - 1;
    if (start < 0 || end < start || end >= node.inlineContent.length) { setNotice("Select a non-empty text range first."); return; }
    const current = (node.payload.standoffProperties as Record<string, unknown>[] | undefined) ?? [];
    // Applying a toolbar style never deletes an existing annotation or its metadata.
    if (!current.some(p => !p.isDeleted && p.type === type && p.start === start && p.end === end && p.value === value)) {
      editor.commands.setPayloadField(node.key, "standoffProperties", [...unwrap(current), { id: crypto.randomUUID(), type, start, end, ...(value !== undefined ? { value } : {}) }], "Annotate Selection");
    }
    setNotice(""); restore();
  };
  const blockStyle = (type: string, value: string) => {
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
    const node = target(); if (!node) return;
    editor.commands.transaction("Clear Formatting", () => {
      const annotations = (node.payload.standoffProperties as Record<string, unknown>[] | undefined) ?? [];
      editor.commands.setPayloadField(node.key, "standoffProperties", unwrap(annotations).filter(p => !String(p.type).startsWith("style/") && !["text/colour", "text/background-colour"].includes(String(p.type))), "Clear Formatting");
      editor.commands.setPayloadField(node.key, "blockProperties", [], "Clear Formatting");
    }); restore();
  };
  return <nav class="workspace-demo__stylebar document-style-bar" aria-label="Document formatting" onPointerDown={retainSelection}>
    <For each={annotationTools}>{([type, label, glyph]) => <button type="button" title={label} aria-label={label} data-annotation-type={type} onClick={() => annotate(type)}>{glyph}</button>}</For>
    <label title="Text colour">Text <input type="color" aria-label="Text colour" value={colour()} onInput={e => setColour(e.currentTarget.value)} /></label>
    <button type="button" title="Apply text colour" data-annotation-type="text/colour" onClick={() => annotate("text/colour", colour())}>Apply colour</button>
    <label title="Text background colour">Fill <input type="color" aria-label="Text background colour" value={background()} onInput={e => setBackground(e.currentTarget.value)} /></label>
    <button type="button" title="Apply background colour" data-annotation-type="text/background-colour" onClick={() => annotate("text/background-colour", background())}>Apply fill</button>
    <i />
    <For each={[["left", "Align left", "≡"], ["center", "Align centre", "≣"], ["right", "Align right", "≡"], ["justify", "Justify", "☰"]]}>{([value, label, glyph]) => <button type="button" title={label} onClick={() => blockStyle("block/alignment", value)}>{glyph}</button>}</For>
    <For each={["h1", "h2", "h3", "h4"]}>{size => <button type="button" title={`Apply ${size.toUpperCase()}`} onClick={() => blockStyle("block/font/size", size)}>{size.toUpperCase()}</button>}</For>
    <button type="button" title="Increase indent" onClick={() => indent(1)}>⇥</button>
    <button type="button" title="Decrease indent" onClick={() => indent(-1)}>⇤</button>
    <button type="button" title="Clear formatting" onClick={clear}>T×</button>
    <span role="status">{notice()}</span>
  </nav>;
}
