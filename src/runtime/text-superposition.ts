import { unwrap } from "solid-js/store";
import type { BlockNode, NodeKey } from "../block-tree/types";
import type { ReactiveEditor } from "../reactive-editor/editor";

export const SUPERPOSITION_TYPE = "text/superposition";
export const superpositionRelationName = (id: string) => `superposition:${id}`;

export type TextSuperposition = Record<string, unknown> & {
  id: string;
  type: typeof SUPERPOSITION_TYPE;
  start: number;
  end: number;
  alternatives: string[];
  active: "source" | string;
  visible: boolean;
  isDeleted?: boolean;
};

export function isTextSuperposition(value: unknown): value is TextSuperposition {
  if (!value || typeof value !== "object") return false;
  const property = value as Partial<TextSuperposition>;
  return property.type === SUPERPOSITION_TYPE && !property.isDeleted && typeof property.id === "string" &&
    Number.isInteger(property.start) && Number.isInteger(property.end) && Number(property.start) >= 0 &&
    Number(property.end) >= Number(property.start) && Array.isArray(property.alternatives) &&
    property.alternatives.every(name => typeof name === "string" && name.startsWith("superposition:"));
}

export function textSuperpositions(node?: BlockNode): TextSuperposition[] {
  const properties = node?.payload.standoffProperties;
  return Array.isArray(properties) ? properties.filter(isTextSuperposition) : [];
}

function replaceProperty(editor: ReactiveEditor, owner: BlockNode, id: string, update: (property: TextSuperposition) => TextSuperposition, label: string) {
  const properties = (owner.payload.standoffProperties as Record<string, unknown>[] | undefined) ?? [];
  const index = properties.findIndex(property => isTextSuperposition(property) && property.id === id);
  if (index < 0) return;
  const next = [...unwrap(properties)];
  next[index] = update(next[index] as TextSuperposition);
  editor.commands.setPayloadField(owner.key, "standoffProperties", next, label);
}

export function createTextSuperposition(editor: ReactiveEditor, owner: BlockNode, start: number, end: number): TextSuperposition {
  if (!editor.features.textSuperposition) throw Error("Text superposition is disabled.");
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end >= owner.inlineContent.length) throw Error("Select a non-empty range in one text Block.");
  if (textSuperpositions(owner).some(property => property.start <= end && property.end >= start)) throw Error("The selected text already overlaps an alternative reading.");
  const id = globalThis.crypto.randomUUID();
  const relation = superpositionRelationName(id);
  const property: TextSuperposition = { id, type: SUPERPOSITION_TYPE, start, end, alternatives: [relation], active: "source", visible: true };
  const current = (owner.payload.standoffProperties as Record<string, unknown>[] | undefined) ?? [];
  editor.commands.transaction("Add alternative reading", () => {
    editor.commands.setRelation(owner.key, relation, {
      id: globalThis.crypto.randomUUID(), type: "standoff-editor-block", text: "", children: [],
      standoffProperties: [], blockProperties: [],
    });
    editor.commands.setPayloadField(owner.key, "standoffProperties", [...unwrap(current), property], "Add alternative reading");
  });
  return property;
}

export function setSuperpositionReading(editor: ReactiveEditor, owner: BlockNode, id: string, active: "source" | string) {
  replaceProperty(editor, owner, id, property => property.active === active ? property : { ...property, active }, "Switch alternative reading");
}

export function toggleSuperpositionReading(editor: ReactiveEditor, owner: BlockNode, id: string) {
  const property = textSuperpositions(owner).find(candidate => candidate.id === id);
  if (!property) return;
  setSuperpositionReading(editor, owner, id, property.active === "source" ? property.alternatives[0] : "source");
}

export function toggleSuperpositionVisibility(editor: ReactiveEditor, owner: BlockNode, id: string) {
  replaceProperty(editor, owner, id, property => ({ ...property, visible: property.visible === false }), "Toggle alternative editor");
}

export function removeTextSuperposition(editor: ReactiveEditor, owner: BlockNode, id: string) {
  const property = textSuperpositions(owner).find(candidate => candidate.id === id);
  if (!property) return;
  editor.commands.transaction("Remove alternative reading", () => {
    for (const relation of property.alternatives) editor.commands.removeRelation(owner.key, relation);
    const properties = (owner.payload.standoffProperties as Record<string, unknown>[] | undefined) ?? [];
    editor.commands.setPayloadField(owner.key, "standoffProperties", unwrap(properties).filter(candidate => !(isTextSuperposition(candidate) && candidate.id === id)), "Remove alternative reading");
  });
}

type SuperpositionContext = { owner: BlockNode; property: TextSuperposition; relationNode?: BlockNode };

export function superpositionContext(editor: ReactiveEditor, targetKey: NodeKey): SuperpositionContext | undefined {
  for (const projection of editor.projections.values()) {
    const target = projection.state.nodes[targetKey];
    if (!target) continue;
    for (const owner of Object.values(projection.state.nodes)) {
      for (const property of textSuperpositions(owner)) for (const relation of property.alternatives) {
        if (owner.ownedRelations[relation] === targetKey) return { owner, property, relationNode: target };
      }
    }
    const selection = editor.mounts.get(targetKey)?.captureInlineSelection?.();
    if (!selection || !target.inlineContent.length) return undefined;
    const start = Math.min(selection.anchor, selection.head), end = Math.max(selection.anchor, selection.head);
    const property = textSuperpositions(target).find(candidate => start === end
      ? candidate.start <= start && start <= candidate.end + 1
      : candidate.start < end && candidate.end >= start);
    if (property) return { owner: target, property, relationNode: projection.state.nodes[target.ownedRelations[property.alternatives[0]]] };
  }
}

function focusCurrentReading(editor: ReactiveEditor, context: SuperpositionContext) {
  const property = textSuperpositions(context.owner).find(candidate => candidate.id === context.property.id);
  if (!property) return;
  if (property.active === "source") {
    editor.focus.request(context.owner.key, { caret: { start: property.end + 1, end: property.end + 1, direction: "none" }, reason: "superposition-source" });
  } else {
    const relationKey = context.owner.ownedRelations[property.active];
    if (relationKey) editor.focus.request(relationKey, { caret: "end", reason: "superposition-alternative" });
  }
}

export function registerTextSuperpositionCommands(editor: ReactiveEditor) {
  editor.commandRegistry.register({
    id: "superposition.toggleReading", label: "Switch alternative reading",
    canExecute: ({ targetKey }) => editor.features.textSuperposition && !!superpositionContext(editor, targetKey),
    execute: ({ targetKey }) => {
      const context = superpositionContext(editor, targetKey); if (!context) return;
      toggleSuperpositionReading(editor, context.owner, context.property.id);
      queueMicrotask(() => focusCurrentReading(editor, context));
    },
  });
  editor.commandRegistry.register({
    id: "superposition.toggleVisibility", label: "Show or hide alternative editor",
    canExecute: ({ targetKey }) => editor.features.textSuperposition && !!superpositionContext(editor, targetKey),
    execute: ({ targetKey }) => {
      const context = superpositionContext(editor, targetKey); if (!context) return;
      toggleSuperpositionVisibility(editor, context.owner, context.property.id);
      if (context.property.active === "source") queueMicrotask(() => focusCurrentReading(editor, context));
    },
  });
}
