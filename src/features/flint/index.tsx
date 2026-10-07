import type { CodexFeature, FeatureScope } from "../../feature-api";
import type { DocumentApplicationCapabilities } from "../../feature-api/document-application";
import { FlintView } from "./shell";
import "./flint.css";

export function createFlintFeature(capabilities: (scope: FeatureScope) => DocumentApplicationCapabilities, materialChrome = true, probe = true): CodexFeature {
  return { id: "flint", activate(scope) {
    capabilities(scope).register({ type: "flint-application-block", view: props => <FlintView {...props} materialChrome={materialChrome} probe={probe} />,
      create(documents) {
        return { id: crypto.randomUUID(), type: "flint-application-block", metadata: {}, children: [{ id: crypto.randomUUID(), type: "tab-row-block", children: documents.map(doc => ({ id: crypto.randomUUID(), type: "tab-block", metadata: { name: doc.title, documentTarget: { version: 1, documentId: doc.id } } })) }] };
      },
    });
  } };
}
