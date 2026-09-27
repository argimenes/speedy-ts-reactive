import type { Accessor } from "solid-js";
import type { FloatingWindowSize } from "./floating-window-resize";

/** Core host geometry only. Child applications receive no host/editor access.
 * Position and expanded size are unscaled local CSS units. Without a host the
 * existing Window metadata remains authoritative, including viewport limits.
 */
export interface WindowGeometryHost {
  /** A static presentation shows normal content without Desktop or geometry actions. */
  static?: boolean;
  /** Core supplies Compact-aware resize conversion to an outer host handle. */
  bindResize?(port: WindowResizePort): () => void;
  position: Accessor<{ x: number; y: number }>;
  expandedSize: Accessor<FloatingWindowSize>;
  move(position: { x: number; y: number }): void;
  resize(size: FloatingWindowSize): void;
}
export interface WindowResizePort {
  presentedSize: Accessor<FloatingWindowSize>;
  minimum: Accessor<FloatingWindowSize>;
  toExpanded(size: FloatingWindowSize): FloatingWindowSize;
}
