import type { NodeKey } from "../block-tree/types";
import type { MountRegistry } from "./mounts";

export interface Point {
  x: number;
  y: number;
}

export class MeasurementService {
  constructor(private readonly mounts: MountRegistry) {}

  blockRect(nodeKey: NodeKey): DOMRect | undefined {
    return this.mounts.get(nodeKey)?.root.getBoundingClientRect();
  }

  selectionRects(nodeKey: NodeKey): DOMRect[] {
    const handle = this.mounts.get(nodeKey);
    if (!handle) return [];
    if (handle.focusElement instanceof HTMLTextAreaElement) {
      return [handle.focusElement.getBoundingClientRect()];
    }
    const selection = handle.focusElement.ownerDocument.getSelection();
    if (!selection?.rangeCount || !handle.root.contains(selection.anchorNode)) return [];
    const range = selection.getRangeAt(0);
    return typeof range.getClientRects === "function" ? [...range.getClientRects()] : [];
  }

  toLayerPoint(viewportPoint: Point, layer: Element): Point | undefined {
    if (layer instanceof SVGGraphicsElement) {
      const matrix = layer.getScreenCTM();
      if (!matrix) return undefined;
      try {
        const point = new DOMPoint(viewportPoint.x, viewportPoint.y).matrixTransform(matrix.inverse());
        return Number.isFinite(point.x) && Number.isFinite(point.y)
          ? { x: point.x, y: point.y }
          : undefined;
      } catch {
        return undefined;
      }
    }
    const rect = layer.getBoundingClientRect();
    return { x: viewportPoint.x - rect.left, y: viewportPoint.y - rect.top };
  }
}
