import { Box3, MathUtils, PerspectiveCamera, Vector3 } from "three";
import type { ViewAngles } from "./model";
/** Stable sphere fit contains the handle and full steam envelope at every angle. */
export function fitCamera(camera: PerspectiveCamera, bounds: Box3, view: ViewAngles) {
  const center = bounds.getCenter(new Vector3()), radius = bounds.getSize(new Vector3()).length() / 2;
  const vertical = MathUtils.degToRad(camera.fov) / 2;
  const half = Math.min(vertical, Math.atan(Math.tan(vertical) * camera.aspect));
  const distance = radius / Math.sin(half) * 1.015;
  const a = MathUtils.degToRad(view.azimuth), e = MathUtils.degToRad(view.elevation);
  camera.position.set(center.x + distance * Math.cos(e) * Math.sin(a), center.y + distance * Math.sin(e), center.z + distance * Math.cos(e) * Math.cos(a));
  camera.near = .05; camera.far = distance + radius * 4;
  camera.lookAt(center); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
}
