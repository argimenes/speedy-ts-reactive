import type { ReactiveEditor } from '../reactive-editor/editor';
import { findResource } from '../block-tree/resource-identity';
import { captureNative, nativeText } from '../persistence/native-resource';
import { safeFilename } from '../interchange/formats';
import { nativeDocumentStem } from '../persistence/document-file-names.mjs';

/** Explicit download of current canonical content; never acknowledges Save or changes its binding. */
export function exportDocument(editor: ReactiveEditor, resourceId: string) {
  if (editor.completionInput?.beforeSave?.() === false) throw new Error('Finish or cancel Scry, then export the Document again.');
  const state = editor.repository.readState();
  const document = findResource(state, { scope: 'document', resourceId });
  if (!document) throw new Error('The Document is no longer available.');
  const metadata = document.payload.metadata as { title?: string; name?: string } | undefined;
  const title = String(metadata?.title || metadata?.name || 'Document');
  // Native capture preserves owned hidden content, references, annotations and
  // unknown authored fields; the legacy tree codec can lose graph semantics.
  const json = nativeText(captureNative(state, resourceId));
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json;charset=utf-8' }));
  const revoke = URL.revokeObjectURL.bind(URL);
  const link = window.document.createElement('a');
  try {
    link.href = url;
    link.download = `${safeFilename(nativeDocumentStem(title))}.mutable.json`;
    window.document.body.append(link);
    link.click();
  } finally {
    link.remove();
    setTimeout(() => revoke(url), 1000);
  }
}
