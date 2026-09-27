import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { arrangedPlacement, footprintDepth, surfaceHeight } from "./arrangement";
import { deskPoint, projectCss, studyCamera } from "./camera";
import { decodeSpatial, starterLayout, STUDY, paperSize, paperOrientation } from "./model";
const page = () => starterLayout([{ id: "one", label: "One", kind: "document" }]).placements[0];
describe("restrained desk arrangement", () => {
  it("keeps the complete footprint on the physical desk across posture, rotation and out-of-bounds requests", () => {
    for (const orientation of [undefined, "portrait", "landscape"] as const) for (const posture of ["lying", "propped"] as const) for (let heading = -Math.PI; heading <= Math.PI; heading += Math.PI / 7) for (const x of [-4, -.8, 0, .7, 3]) for (const z of [-5, -1, -.3, 2]) {
      const p = arrangedPlacement(page(), { position: { x, z }, heading, posture, orientation });
      for (const xx of [-paperSize(p).width / 2, paperSize(p).width / 2]) for (const zz of [0, -footprintDepth(p)]) {
        const px = p.position.x + xx * Math.cos(p.heading) + zz * Math.sin(p.heading), pz = p.position.z - xx * Math.sin(p.heading) + zz * Math.cos(p.heading);
        expect(Math.hypot(px, pz)).toBeGreaterThanOrEqual(STUDY.innerRadius + .0149);
        expect(Math.hypot(px, pz)).toBeLessThanOrEqual(STUDY.outerRadius - .0149);
        expect(Math.abs(Math.atan2(px, -pz))).toBeLessThanOrEqual(STUDY.arc * Math.PI / 360);
      }
      expect(p.size).toEqual(page().size);
      expect(() => decodeSpatial({ ...starterLayout([]), placements: [p] })).not.toThrow();
    }
  });
  it("keeps the grabbed point under the pointer on a propped page", () => {
    const camera = studyCamera({ kind: "perspective", yaw: 0, approach: 0 }, 1440, 1000), viewport = { width: 1440, height: 1000 };
    const point = new Vector3(0, .2, -.98), start = projectCss(point, camera, 1440, 1000), end = { x: start.x + 80, y: start.y - 12 };
    const slip = (height: number) => {
      const a = deskPoint(camera, viewport, start.x, start.y, height)!, b = deskPoint(camera, viewport, end.x, end.y, height)!;
      const projected = projectCss(point.clone().add(new Vector3(b.x - a.x, 0, b.z - a.z)), camera, 1440, 1000);
      return Math.hypot(projected.x - end.x, projected.y - end.y);
    };
    expect(slip(0)).toBeGreaterThan(30); expect(slip(point.y)).toBeLessThan(.000001);
  });
  it("orientation is independent of heading/posture and old v1 data keeps its dimensions", () => {
    const original = page(), landscape = arrangedPlacement(original, { orientation: "landscape" });
    expect(paperSize(original)).toEqual(original.size); expect(paperOrientation(original)).toBe("portrait");
    expect(paperSize(landscape)).toEqual({ width: .297, height: .21 }); expect(landscape.size).toEqual(original.size);
    expect(landscape.heading).toBe(original.heading); expect(landscape.posture).toBe(original.posture);
    const layout = { ...starterLayout([]), placements: [landscape] };
    expect(decodeSpatial(JSON.parse(JSON.stringify(layout)))).toEqual(layout);
    expect(() => decodeSpatial({ ...layout, placements: [{ ...landscape, orientation: "free" }] })).toThrow();
    expect(paperSize(arrangedPlacement(landscape, { orientation: "portrait" }))).toEqual(original.size);
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
