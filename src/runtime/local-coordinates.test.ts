import { describe, expect, it } from "vitest";
import { coordinateScale, localFragment } from "./local-coordinates";
import { MeasurementService } from "./measurements";
import { MountRegistry } from "./mounts";

describe("uniform DOM coordinate frame", () => {
  it.each([0.5, 1, 2])("converts client fragments while keeping scroll offsets local at %s", scale => {
    const origin = { left: 32, top: 48 };
    expect(localFragment({ left: 32 + 20 * scale, top: 48 + 30 * scale, width: 40 * scale, height: 16 * scale }, origin, { scrollLeft: 3, scrollTop: 7 }, scale))
      .toEqual({ x: 23, y: 37, width: 40, height: 16 });
    const layer = document.createElement("div");
    layer.getBoundingClientRect = () => ({ ...origin } as DOMRect);
    expect(new MeasurementService(new MountRegistry()).toLayerPoint({ x: 32 + 20 * scale, y: 48 + 30 * scale }, layer, scale)).toEqual({ x: 20, y: 30 });
  });
  it("rejects unsupported scales at the host boundary", () => {
    for (const scale of [0, -1, Infinity, NaN]) expect(() => coordinateScale(scale)).toThrow("positive finite");
  });
});
