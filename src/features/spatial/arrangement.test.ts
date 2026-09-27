import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { arrangedPlacement, footprintDepth, surfaceHeight } from "./arrangement";
import { deskPoint, projectCss, studyCamera } from "./camera";
import { decodeSpatial, starterLayout, STUDY } from "./model";
const page = () => starterLayout([{ id: "one", label: "One", kind: "document" }]).placements[0];
describe("restrained desk arrangement", () => {
  it("keeps the complete footprint on the physical desk across posture, rotation and out-of-bounds requests", () => {
    for (const posture of ["lying", "propped"] as const) for (let heading = -Math.PI; heading <= Math.PI; heading += Math.PI / 7) for (const x of [-4, -.8, 0, .7, 3]) for (const z of [-5, -1, -.3, 2]) {
      const p = arrangedPlacement(page(), { position: { x, z }, heading, posture });
      for (const xx of [-p.size.width / 2, p.size.width / 2]) for (const zz of [0, -footprintDepth(p)]) {
        const px = p.position.x + xx * Math.cos(p.heading) + zz * Math.sin(p.heading), pz = p.position.z - xx * Math.sin(p.heading) + zz * Math.cos(p.heading);
        expect(Math.hypot(px, pz)).toBeGreaterThanOrEqual(STUDY.innerRadius + .0149);
        expect(Math.hypot(px, pz)).toBeLessThanOrEqual(STUDY.outerRadius - .0149);
        expect(Math.abs(Math.atan2(px, -pz))).toBeLessThanOrEqual(STUDY.arc * Math.PI / 360);
      }
      expect(p.size).toEqual(page().size);
      expect(() => decodeSpatial({ ...starterLayout([]), placements: [p] })).not.toThrow();
    }
  });
  it("preserves unknown fields, rejects nonfinite edits and leaves old presets untouched", () => {
    const original = page(); original.future = { keep: true }; original.position.future = "position"; original.size.future = "size";
    const before = structuredClone(original), next = arrangedPlacement(original, { heading: 20, posture: "lying" });
    expect(original).toEqual(before); expect(next.future).toEqual(before.future); expect(next.position.future).toBe("position"); expect(next.size).toEqual(before.size);
    for (const bad of [NaN, Infinity, -Infinity]) expect(() => arrangedPlacement(original, { position: { x: bad, z: -1 } })).toThrow();
    expect(surfaceHeight(1) - surfaceHeight(0)).toBeCloseTo(.002);
  });
  it.each(["perspective", "orthographic"] as const)("round-trips desk intersections at camera limits (%s)", kind => {
    for (const yaw of [-Math.PI / 4, 0, Math.PI / 4]) {
      const camera = studyCamera({ kind, yaw, approach: .4 }, 1440, 1000), point = new Vector3(.24, 0, -.95);
      const css = projectCss(point, camera, 1440, 1000), hit = deskPoint(camera, { width: 1440, height: 1000 }, css.x, css.y)!;
      expect(hit.x).toBeCloseTo(point.x, 8); expect(hit.z).toBeCloseTo(point.z, 8);
    }
  });
});
