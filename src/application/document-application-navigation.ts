import type { ReactiveEditor } from '../reactive-editor/editor';

// Mounted application selection also clears transient search/navigation tabs.
const instances = new WeakMap<ReactiveEditor, Map<string, (id: string) => void>>();
export function registerDocumentApplicationNavigation(editor: ReactiveEditor, key: string, select: (id: string) => void) {
  let entries = instances.get(editor);
  if (!entries) instances.set(editor, entries = new Map());
  entries.set(key, select);
  return () => { if (entries.get(key) === select) entries.delete(key); };
}
export function selectApplicationDocument(editor: ReactiveEditor, key: string, id: string) {
  const select = instances.get(editor)?.get(key);
  if (!select) return false;
  select(id); return true;
}
