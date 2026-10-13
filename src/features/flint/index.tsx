import type { CodexFeature, FeatureScope } from "../../feature-api";
import type { DocumentApplicationCapabilities } from "../../feature-api/document-application";
import { FlintView } from "./shell";
import { createFlintDocumentTabs } from "./document-tabs";
import "./flint.css";
import "./spatial-shell.css";

export function createFlintFeature(capabilities: (scope: FeatureScope) => DocumentApplicationCapabilities, materialChrome = true, probe = true, spatialGraph = true, sceneChrome = true): CodexFeature {
  return { id: "flint", activate(scope) {
    capabilities(scope).register({ type: "flint-application-block", view: props => <FlintView {...props} materialChrome={materialChrome} probe={probe} spatialGraph={spatialGraph} sceneChrome={sceneChrome} />,
      create: createFlintDocumentTabs,
    });
  } };
}
