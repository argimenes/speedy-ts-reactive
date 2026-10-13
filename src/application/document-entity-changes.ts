import type { ReactiveEditor } from '../reactive-editor/editor';
import { linkedDefinitionOwner, resolveLinkedProperty } from '../block-tree/linked-annotations';
import { resolveSearchScope } from '../runtime/text-search';
import type { AnnotationCapabilities } from '../feature-api/annotations';

type Listener = Parameters<AnnotationCapabilities['watchDocumentEntities']>[1];

/** Canonical identity excludes occurrence IDs, text versions and shifted offsets.
 * Those affect highlighting, but must not invalidate Entity summary queries. */
function snapshot(editor: ReactiveEditor, root: string) {
  const state = editor.repository.readState(), dependencies = new Set<string>();
  const links: string[] = [], ranges: unknown[] = [];
  const visit = (key: string) => {
    const content = state.contents[key];
    if (!content || dependencies.has(key) || (key !== root && content.viewType === 'document-block')) return;
    dependencies.add(key);
    ranges.push([key, content.children, content.ownedRelations]);
    if (content.viewType === 'standoff-editor-block') {
      const properties = content.payload.standoffProperties;
      if (Array.isArray(properties)) properties.forEach((property, index) => {
        if (!property || typeof property !== 'object' || Array.isArray(property)) return;
        // A definition can live on the Document or, for cross-resource links,
        // the Workspace. Watch that owner as well as the local segment.
        if (property.annotationId) {
          try {
            const owner = linkedDefinitionOwner(state, property, key);
            definitionOwners.add(owner?.key ?? state.placements[state.rootPlacementKey].contentKey);
          } catch { /* Unresolved definitions are not guessed. */ }
        }
        const resolved = resolveLinkedProperty(state, property, key);
        if (resolved.isDeleted || resolved.type !== 'codex/entity-reference' || typeof resolved.value !== 'string' || !resolved.value.trim()) return;
        // Cell identities stay stable when text is inserted before a link, but
        // change when its actual endpoints are moved/expanded/contracted.
        const start = content.inlineContent[Number(property.start)], end = content.inlineContent[Number(property.end)];
        links.push(JSON.stringify([key, property.id ?? index, resolved.annotationId, resolved.value, resolved.metadata, resolved.attributes, start, end]));
        ranges.push([key, property.id ?? index, property.start, property.end, content.inlineRevision]);
      });
    }
    for (const placement of [...content.children, ...Object.values(content.ownedRelations)]) {
      const child = state.placements[placement];
      if (child) visit(child.contentKey);
    }
  };
  const definitionOwners = new Set<string>();
  visit(root);
  definitionOwners.forEach(key => dependencies.add(key));
  return {dependencies, signature:JSON.stringify(links.sort()), ranges:JSON.stringify(ranges), removed:!state.contents[root]};
}

function source(editor: ReactiveEditor, key: string, release: () => void) {
  let current = snapshot(editor, key), queued = false, disposed = false;
  const listeners = new Set<Listener>();
  const stop = editor.repository.subscribeChanges(change => {
    if (queued || ![...change.previousContents.keys()].some(key => current.dependencies.has(key))) return;
    queued = true;
    // Wait for every projection to receive the repository publication.
    queueMicrotask(() => {
      queued = false;
      if (disposed) return;
      const next = snapshot(editor, key), changed = next.signature !== current.signature || next.ranges !== current.ranges || next.removed !== current.removed;
      current = next;
      if (changed) for (const listener of listeners) listener({signature:current.signature, removed:current.removed});
    });
  });
  return {
    get signature() { return current.signature; },
    subscribe(listener: Listener) {
      let active = true;
      const relay: Listener = change => listener(change);
      listeners.add(relay);
      return () => {
        if (!active) return;
        active = false;
        listeners.delete(relay);
        if (!listeners.size) { disposed = true; stop(); release(); }
      };
    },
  };
}

// All listings of a source share one document event subscription. Nothing is
// polled, persisted, or subscribed once the last listing closes.
const sources = new WeakMap<ReactiveEditor, Map<string, ReturnType<typeof source>>>();
export function watchDocumentEntities(editor: ReactiveEditor, origin: string, listener: Listener) {
  const scope = resolveSearchScope(editor, origin, 'document');
  const key = editor.node(scope.rootKey)!.contentKey;
  let documents = sources.get(editor);
  if (!documents) sources.set(editor, documents = new Map());
  let entry = documents.get(key);
  if (!entry) documents.set(key, entry = source(editor, key, () => documents!.delete(key)));
  const dispose = entry.subscribe(listener);
  return {key, get signature() { return entry!.signature; }, dispose};
}
