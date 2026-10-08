import { createPhosphorFeature } from "./phosphor";
import { FormattedDocumentView } from "../features/document-formats/view";
import { createFlintFeature } from "../features/flint";
import { documentApplicationCapabilities } from "./document-application-capabilities";
import { createThreeDObjectFeature } from "../features/three-d-object";
import { createCanvasCounterFeature } from "../features/canvas-counter";
import { createAnchorRelationshipsFeature } from "../features/anchor-relationships";
import { anchorCapabilities } from "./anchor-capabilities";
import { createCompactDocumentFeature } from "../features/compact-document";
import { presentationCapabilities } from "./presentation-capabilities";
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
  registerCoreViews(editor, editor.features.documentFormats ? FormattedDocumentView : undefined);
  if (editor.features.phosphor) editor.featureHost.activate(createPhosphorFeature(editor));
  if (editor.features.flint) editor.featureHost.activate(createFlintFeature(scope => documentApplicationCapabilities(editor, scope), editor.features.flintMaterialChrome, editor.features.flintProbe));
  if (editor.features.threeDObjects) editor.featureHost.activate(createThreeDObjectFeature(scope => blockFeatureCapabilities(editor, scope)));
  if (editor.features.anchorRelationships) editor.featureHost.activate(createAnchorRelationshipsFeature(scope => anchorCapabilities(editor, scope)));
  if (editor.features.canvasWorkspace) editor.featureHost.activate(createCanvasCounterFeature(scope => blockFeatureCapabilities(editor, scope)));
  if (editor.features.compactDocumentMode) editor.featureHost.activate(createCompactDocumentFeature(scope => presentationCapabilities(editor, scope)));
  if (editor.features.entityReferences) editor.featureHost.activate(createEntityReferencesFeature(scope => annotationCapabilities(editor, scope)));
  if (editor.features.grouping) editor.featureHost.activate(createGroupingFeature(scope => textOperationCapabilities(editor, scope)));
  if (editor.features.timer) editor.featureHost.activate(createTimerFeature(scope => blockFeatureCapabilities(editor, scope)));
}
