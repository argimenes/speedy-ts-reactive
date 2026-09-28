import type { Box3, Group, Vector3 } from "three";
/** Internal scene content only. Providers never receive Codex or editable DOM. */
export interface ObjectContent {
  root: Group;
  bounds: Box3;
  contact: Vector3;
  apply(settings: Readonly<Record<string, unknown>>): void;
  animated(): boolean;
  update(seconds: number, azimuth: number): void;
  dispose(): void;
}
