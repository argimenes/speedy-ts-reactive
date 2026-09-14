import type { ReactiveEditor } from "../reactive-editor/editor";
import type { SearchRange, SearchScope } from "./text-search";
import { resolveSearchScope, scopeNodes } from "./text-search";

export interface DocumentEntityRow {
  id: string;
  fallbackName?: string;
  documentMentions: number;
  ranges: SearchRange[];
}

export interface DocumentEntityInventory {
  scope: SearchScope;
  rows: DocumentEntityRow[];
}

function metadataName(value: unknown): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const metadata = value as Record<string, unknown>;
  for (const candidate of [metadata.entityName, metadata.name, metadata.Name]) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
}

function documentOrigin(editor: ReactiveEditor, key: string): string {
  const node = editor.node(key);
  if (node?.viewType !== "document-window-block") return key;
  return node.children.find(child => editor.node(child)?.viewType === "document-block") ?? key;
}

/** Model-only inventory. Counts canonical logical mentions while retaining every occurrence range for previews. */
export function collectDocumentEntities(editor: ReactiveEditor, originKey: string): DocumentEntityInventory {
  const scope = resolveSearchScope(editor, documentOrigin(editor, originKey), "document");
  const state = editor.repository.readState();
  const grouped = new Map<string, { name?: string; mentions: Set<string>; ranges: SearchRange[]; rangeKeys: Set<string> }>();

  for (const { node } of scopeNodes(editor, scope).found) {
    if (node.viewType !== "standoff-editor-block") continue;
    const properties = node.payload.standoffProperties;
    if (!Array.isArray(properties)) continue;
    properties.forEach((property, index) => {
      if (!property || typeof property !== "object" || Array.isArray(property)) return;
      const local = property as Record<string, unknown>;
      const resolved = editor.linkedAnnotations.resolve(local);
      if (resolved.isDeleted || resolved.type !== "codex/entity-reference" || typeof resolved.value !== "string" || !resolved.value.trim()) return;
      const id = resolved.value;
      let row = grouped.get(id);
      if (!row) grouped.set(id, row = { name: metadataName(resolved.metadata), mentions: new Set(), ranges: [], rangeKeys: new Set() });
      row.name ??= metadataName(resolved.metadata);
      const annotationId = typeof resolved.annotationId === "string" && resolved.annotationId ? resolved.annotationId : undefined;
      const propertyId = typeof local.id === "string" && local.id ? local.id : `index:${index}`;
      row.mentions.add(annotationId ? `linked:${annotationId}` : `${node.contentKey}:${propertyId}`);

      const start = Number(local.start), end = Number(local.end);
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end >= node.inlineContent.length) return;
      const rangeKey = `${node.key}:${propertyId}:${start}:${end}`;
      if (row.rangeKeys.has(rangeKey)) return;
      row.rangeKeys.add(rangeKey);
      row.ranges.push({
        nodeKey: node.key,
        contentKey: node.contentKey,
        placementKey: node.placementKey,
        version: state.contents[node.contentKey]?.inlineRevision ?? 0,
        start,
        end: end + 1,
        coordinate: "cell",
      });
    });
  }

  return {
    scope,
    rows: [...grouped].map(([id, row]) => ({ id, fallbackName: row.name, documentMentions: row.mentions.size, ranges: row.ranges })),
  };
}
