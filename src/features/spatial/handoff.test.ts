import { describe, expect, it } from "vitest";
import { Quaternion, Vector3 } from "three";
import { editingRectangle, projectCss, studyCamera } from "./camera";
import { handoffPose } from "./handoff";
describe("physical pickup geometry", () => {
  const home = { center: new Vector3(-.3, .16, -.85), rotation: new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -.28), width: .21, height: .297 };
  it.each(["perspective", "orthographic"] as const)("aligns all four corners in %s without changing physical placement", kind => {
    for (const yaw of [-Math.PI / 4, 0, Math.PI / 4]) for (const [width, height] of [[1440, 1000], [850, 700]]) {
      const camera = studyCamera({ kind, yaw, approach: .4 }, width, height), rect = editingRectangle(width, height);
      const before = JSON.stringify(home), pose = handoffPose(home, camera, { width, height }, rect, 1);
      for (const [x, y] of [[-1, 1], [1, 1], [1, -1], [-1, -1]]) {
        const corner = new Vector3(x * pose.width / 2, y * pose.height / 2, 0).applyQuaternion(pose.rotation).add(pose.center);
        const p = projectCss(corner, camera, width, height);
        expect(p.x).toBeCloseTo(rect.x + (x + 1) / 2 * rect.width, 8);
        expect(p.y).toBeCloseTo(rect.y + (1 - y) / 2 * rect.height, 8);
      }
      expect(JSON.stringify(home)).toBe(before);
      expect(JSON.stringify(handoffPose(home, camera, { width, height }, rect, 0))).toBe(before);
      const lift = handoffPose(home, camera, { width, height }, rect, .15);
      expect(lift.center.y).toBeGreaterThan(home.center.y); expect(lift.center.x).toBe(home.center.x); expect(lift.width).toBe(.21);
    }
  });
});
