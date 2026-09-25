import type { PresentationCapabilities, FeatureScope } from "../feature-api";
import type { ReactiveEditor } from "../reactive-editor/editor";

export function presentationCapabilities(editor: ReactiveEditor, scope: FeatureScope): PresentationCapabilities {
  return { register: contribution => {
    if (scope.active()) scope.own(editor.windowPresentation.register(contribution));
  } };
}
