import { describe, expect, it } from "vitest";
import { Box3, PerspectiveCamera, Vector3 } from "three";
import { defaults, objectSize, patchObject, readObject, sizeProperties, presets } from "./model";
import { fitCamera } from "./camera";

describe("3D object authored boundary", () => {
  it("normalizes invalid known values without accepting future versions or scenes", () => {
    expect(readObject({ view: { azimuth: -450, elevation: Infinity }, lighting: "unknown" })).toMatchObject({ view: { azimuth: 270, elevation: 25 }, lighting: "neutral" });
    expect(readObject({ scene: "future" })).toBeUndefined(); expect(readObject({ version: 2 })).toBeUndefined();
    expect(objectSize([{ type: "block/size", metadata: { width: Infinity } }])).toEqual({ width: 280, height: 280 });
  });
  it("preserves unknown nested data on reset and unrelated sizing properties", () => {
    expect(patchObject({ ...defaults(), future: 7, view: { ...presets.Side, lens: "future" }, settings: { future: 8 } }, defaults())).toMatchObject({ future: 7, view: { lens: "future" }, settings: { steam: true, coffeeStain: false, future: 8 } });
    const properties = [{ type: "custom", future: 1 }, { type: "block/size", id: "size", metadata: { width: 280, future: 2 } }];
    expect(sizeProperties(properties, 360)).toEqual([properties[0], { type: "block/size", id: "size", metadata: { width: 360, height: 360, future: 2 } }]);
    expect(properties[1].metadata?.width).toBe(280);
  });
  it("keeps the full stable envelope in frame for all presets and aspect ratios", () => {
    const bounds = new Box3(new Vector3(-.67, 0, -.67), new Vector3(1.23, 2.18, .67));
    for (const aspect of [.5, 1, 2]) for (const view of Object.values(presets)) {
      const camera = new PerspectiveCamera(32, aspect); fitCamera(camera, bounds, view);
      for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
        const p = new Vector3(x,y,z).project(camera); expect(Math.abs(p.x)).toBeLessThan(1); expect(Math.abs(p.y)).toBeLessThan(1); expect(p.z).toBeLessThan(1);
      }
    }
  });
});
