import { createSignal, onCleanup } from "solid-js";
import type { CodexFeature, FeatureScope, PresentationCapabilities } from "../../feature-api";
import "./compact-document.css";

export function createCompactDocumentFeature(capabilities: (scope: FeatureScope) => PresentationCapabilities): CodexFeature {
  return {
    id: "compact-document",
    activate(scope) {
      capabilities(scope).register({
        workspaceClass: "compact-document-workspace",
        create(port) {
          const [compact, setCompact] = createSignal(false);
          onCleanup(() => port.requestMarginCollapse(false));
          return {
            className: () => `compact-document-feature${compact() ? " compact-document-active" : ""}`,
            control: () => <button type="button" class="compact-document-toggle" aria-label="Compact document"
              title="Compact document: hide margins and narrow window" aria-pressed={compact()}
              onPointerDown={event => {
                event.stopPropagation();
                // Preserve the margin selection until core can transfer it to the drawer.
                if (!compact() && !port.marginsCollapsed()) event.preventDefault();
              }}
              onClick={() => { const next = !compact(); port.requestMarginCollapse(next); setCompact(next); }}>↔</button>,
          };
        },
      });
    },
  };
}
