import { OrthographicCamera, PerspectiveCamera, Plane, Raycaster, Vector2, Vector3 } from "three";
import { STUDY, type SpatialCamera } from "./model";
export type StudyCamera = OrthographicCamera | PerspectiveCamera;
export function studyCamera(state: SpatialCamera, width: number, height: number): StudyCamera {
  const aspect = width / Math.max(1, height), span = 1.75 - state.approach * .38;
  const camera = state.kind === "perspective" ? new PerspectiveCamera(52, aspect, .025, 60) : new OrthographicCamera(-span * aspect / 2, span * aspect / 2, span / 2, -span / 2, .025, 60);
  const direction = new Vector3(-Math.sin(state.yaw), 0, -Math.cos(state.yaw));
  camera.position.set(0, STUDY.eyeHeight, .35).addScaledVector(direction, state.kind === "perspective" ? state.approach * .16 : 0);
  camera.lookAt(camera.position.clone().add(direction).add(new Vector3(0, -.16, 0)));
  camera.updateProjectionMatrix(); camera.updateMatrixWorld(); return camera;
}
export interface ScreenRect { x: number; y: number; width: number; height: number }
export function editingRectangle(width: number, height: number): ScreenRect {
  const w = Math.max(1, Math.min(900, width - 100)), h = Math.max(1, Math.min(700, height - 160));
  return { x: (width - w) / 2, y: (height - h) / 2, width: w, height: h };
}
/** CSS viewport pixels → camera-facing world plane; never changes desk geometry. */
export function alignmentCorners(camera: StudyCamera, viewport: { width: number; height: number }, rect: ScreenRect, depth = .85) {
  const normal = camera.getWorldDirection(new Vector3()), plane = new Plane().setFromNormalAndCoplanarPoint(normal, camera.position.clone().addScaledVector(normal, depth));
  const ray = new Raycaster();
  return [[rect.x, rect.y], [rect.x + rect.width, rect.y], [rect.x + rect.width, rect.y + rect.height], [rect.x, rect.y + rect.height]].map(([x, y]) => {
    ray.setFromCamera(new Vector2(x / viewport.width * 2 - 1, 1 - y / viewport.height * 2), camera);
    const point = ray.ray.intersectPlane(plane, new Vector3()); if (!point) throw new Error("Cannot align editing plane."); return point;
  });
}
export function projectCss(point: Vector3, camera: StudyCamera, width: number, height: number) {
  const p = point.clone().project(camera); return { x: (p.x + 1) * width / 2, y: (1 - p.y) * height / 2 };
}
