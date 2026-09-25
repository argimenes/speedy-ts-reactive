import { createEntityReferencesFeature } from "../features/entity-references";
import { annotationCapabilities } from "./annotation-capabilities";
import type { ReactiveEditor } from "../reactive-editor/editor";
import { registerCoreViews } from "../rendering/register-core-views";
import { createGroupingFeature } from "../features/grouping";
import { textOperationCapabilities } from "./text-operation-capabilities";
import { createTimerFeature } from "../features/timer";
import { blockFeatureCapabilities } from "./feature-capabilities";

export function registerApplicationViews(editor: ReactiveEditor): void {
  // Temporary legacy assembly: unmigrated views/commands retain their existing path.
  registerCoreViews(editor);
  if (editor.features.entityReferences) editor.featureHost.activate(createEntityReferencesFeature(scope => annotationCapabilities(editor, scope)));
  if (editor.features.grouping) editor.featureHost.activate(createGroupingFeature(scope => textOperationCapabilities(editor, scope)));
  if (editor.features.timer) editor.featureHost.activate(createTimerFeature(scope => blockFeatureCapabilities(editor, scope)));
}
