import type { ReactiveEditor } from "../reactive-editor/editor";
import { registerCoreViews } from "../rendering/register-core-views";
import { createTimerFeature } from "../features/timer";
import { blockFeatureCapabilities } from "./feature-capabilities";

export function registerApplicationViews(editor: ReactiveEditor): void {
  // Temporary legacy assembly: unmigrated views/commands retain their existing path.
  registerCoreViews(editor);
  if (editor.features.timer) editor.featureHost.activate(createTimerFeature(scope => blockFeatureCapabilities(editor, scope)));
}
