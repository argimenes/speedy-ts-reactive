import { Show } from "solid-js";
import type { CodexFeature, FeatureScope, TextOperationCapabilities } from "../../feature-api";
import { GroupSelection } from "./controller";

export function createGroupingFeature(capabilities: (scope: FeatureScope) => TextOperationCapabilities) {
  let selection: GroupSelection | undefined;
  return {
    id: "grouping",
    // Module-local inspection handle; core never stores or queries this controller.
    get selection() { return selection; },
    activate(scope: FeatureScope) {
      const ports = capabilities(scope);
      const controller = selection = new GroupSelection(ports);
      scope.own(() => controller.dispose());
      controller.attach();
      ports.register.command({ id: "grouping.cancel", label: "Clear grouped selection",
        canExecute: ({ targetKey }) => controller.owns(targetKey), execute: () => controller.cancel() });
      ports.register.command({ id: "grouping.delete", label: "Delete grouped text",
        canExecute: ({ targetKey }) => controller.owns(targetKey), execute: ({ targetKey }) => { controller.deleteSelected(targetKey); } });
      // Escape/Delete/Backspace and Control gestures keep their Stage 2 semantic
      // bindings through the owned operation/policy. Do not add competing key listeners.
      ports.register.toolbar({ id: "grouping.selection", notice: controller.message,
        selectionDetails: () => <Show when={controller.active()}><fieldset><legend>Grouped ranges</legend>
          <span>{controller.ranges().length} retained</span>
          <span>Hold Control to add ranges. Esc cancels. Delete removes grouped text.</span>
        </fieldset></Show>,
        annotationDescriptions: { "style/show-hide": "Hold Control while selecting to group. Control-click removes a range. Esc cancels. Delete removes grouped text." },
      });
    },
  } satisfies CodexFeature & { readonly selection: GroupSelection | undefined };
}
