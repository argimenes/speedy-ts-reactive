import { Quaternion, Vector3 } from "three";
import { alignmentCorners, type ScreenRect, type StudyCamera } from "./camera";
export interface PagePose { center: Vector3; rotation: Quaternion; width: number; height: number }
const smooth = (t: number) => { const x = Math.max(0, Math.min(1, t)); return x * x * (3 - 2 * x); };
/** Transient physical pickup: lift first, turn toward the reader, then approach
 * and broaden into the live Window. No authored placement is mutated. */
export function handoffPose(home: PagePose, camera: StudyCamera, viewport: { width: number; height: number }, rect: ScreenRect, progress: number): PagePose {
  const corners = alignmentCorners(camera, viewport, rect);
  const target = corners[0].clone().add(corners[2]).multiplyScalar(.5);
  const approach = smooth((progress - .16) / .84), turn = smooth((progress - .06) / .72);
  const expand = smooth((progress - .35) / .65);
  const center = home.center.clone().lerp(target, approach);
  center.y += .065 * smooth(progress / .2) * (1 - approach);
  return { center, rotation: home.rotation.clone().slerp(camera.quaternion, turn),
    width: home.width + (corners[0].distanceTo(corners[1]) - home.width) * expand,
    height: home.height + (corners[0].distanceTo(corners[3]) - home.height) * expand };
}
