import type { ReactiveEditor } from "../../reactive-editor/editor";
import type { AnnotationCapabilities } from "../../feature-api";
import { annotationCapabilities } from "../../application/annotation-capabilities";
import { registerCoreViews } from "../../rendering/register-core-views";
import { createEntityReferencesFeature } from ".";
const sessions = new WeakMap<ReactiveEditor, { api: AnnotationCapabilities; feature: ReturnType<typeof createEntityReferencesFeature> }>();
export function entityTestApi(editor: ReactiveEditor) {
  let session = sessions.get(editor);
  if (!session) {
    let api!: AnnotationCapabilities;
    const feature = createEntityReferencesFeature(scope => api = annotationCapabilities(editor, scope));
    editor.featureHost.activate(feature); sessions.set(editor, session = { api, feature });
  }
  return session.api;
}
export function entityTestList(editor: ReactiveEditor) { entityTestApi(editor); return sessions.get(editor)!.feature.list!; }
export function registerEntityTestViews(editor: ReactiveEditor) { registerCoreViews(editor); entityTestApi(editor); }
