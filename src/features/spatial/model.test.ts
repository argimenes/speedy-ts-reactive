import { describe, expect, it } from "vitest";
import { alignmentCorners, editingRectangle, projectCss, studyCamera } from "./camera";
import { decodeSpatial, starterLayout, STUDY, supportsSpatial } from "./model";
describe("Spatial scene contract", () => {
  it.each(["perspective", "orthographic"] as const)("aligns CSS viewport corners at yaw/approach/aspect extremes (%s)", kind => {
    for (const yaw of [-STUDY.yawLimit, 0, STUDY.yawLimit]) for (const approach of [0, 1]) for (const [width, height] of [[1440, 1000], [1280, 800], [1920, 1080]]) {
      const camera = studyCamera({ kind, yaw, approach }, width, height), rect = editingRectangle(width, height);
      const corners = alignmentCorners(camera, { width, height }, rect);
      const expected = [[rect.x, rect.y], [rect.x + rect.width, rect.y], [rect.x + rect.width, rect.y + rect.height], [rect.x, rect.y + rect.height]];
      corners.forEach((p, i) => { const css = projectCss(p, camera, width, height); expect(css.x).toBeCloseTo(expected[i][0], 7); expect(css.y).toBeCloseTo(expected[i][1], 7); });
    }
  });
  it("rejects unsupported versions, nonfinite geometry, collisions and off-desk anchors", () => {
    const initial = starterLayout([{ id: "one", label: "One", kind: "document" }]);
    expect(supportsSpatial({ ...initial, version: 2 })).toBe(false);
    expect(() => decodeSpatial({ ...initial, placements: [...initial.placements, initial.placements[0]] })).toThrow("Duplicate");
    for (const value of [NaN, Infinity, 9]) expect(() => decodeSpatial({ ...initial, camera: { ...initial.camera, yaw: value } })).toThrow();
    for (const position of [{ x: 0, z: 0 }, { x: 1.5, z: -1.5 }]) expect(() => decodeSpatial({ ...initial, placements: [{ ...initial.placements[0], position }] })).toThrow();
  });
  it("keeps physical size independent of camera and retains future fields", () => {
    const initial = starterLayout([{ id: "one", label: "One", kind: "document" }, { id: "two", label: "Two", kind: "image" }]);
    initial.placements[0].future = { a: true }; const next = decodeSpatial({ ...initial, camera: { ...initial.camera, approach: 1 } });
    expect(next.placements).toEqual(initial.placements); expect(next.placements[1].size.width).toBe(.18);
  });
});
