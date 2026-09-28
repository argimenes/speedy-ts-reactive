import type { BlockFeatureCapabilities, CodexFeature, FeatureScope } from "../../feature-api";
import { objectDto } from "./model";
import { ThreeDObjectView } from "./view";

export function createThreeDObjectFeature(capabilities: (scope: FeatureScope) => BlockFeatureCapabilities): CodexFeature {
  return { id: "three-d-object", activate(scope) {
    const { blocks, register } = capabilities(scope);
    register.block({ type: "3d-object-block", create: objectDto, view: ThreeDObjectView,
      capabilities: ["control", "opaque-widget", "selectable", "spatial-document-compatible"] });
    register.command({ id: "object3d.insert", label: "3D Object — Coffee Cup", canExecute: ({ targetKey }) => !!blocks.get(targetKey), execute({ targetKey }) {
      const target = blocks.get(targetKey)!;
      const placement = blocks.insert(objectDto(), target.isRoot || target.type === "document-block"
        ? { kind: "at", parentKey: targetKey, index: target.children.length } : { kind: "after", anchorKey: targetKey });
      blocks.focusPlacement(placement, target.viewId);
    } });
    register.action({ id: "object3d.menu", slot: "add-block-menu", label: "3D Object — Coffee Cup", command: "object3d.insert" });
  } };
}
