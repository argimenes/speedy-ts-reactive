import { describe, expect, it } from "vitest";
import { rainbowShapes, spikyOutlineShapes } from "./decorations";

describe("rainbow decoration", () => {
  it("draws the original seven stacked colours for every visual fragment", () => {
    const shapes = rainbowShapes("rainbow", [
      { x: 10, y: 4, width: 30, height: 12 },
      { x: 3, y: 22, width: 18, height: 12 },
    ]);
    expect(shapes).toHaveLength(14);
    expect(shapes.slice(0, 7).map((shape) => shape.stroke)).toEqual([
      "#ff0000",
      "#ff8000",
      "#ffff00",
      "#00ff00",
      "#00ffff",
      "#0000ff",
      "#8000ff",
    ]);
    expect(shapes.slice(0, 7).map((shape) => shape.strokeWidth)).toEqual(Array(7).fill(2));
  });

  it("builds a jagged outline instead of a plain rectangle for spiky ranges", () => {
    const [shape] = spikyOutlineShapes("spiky", [{ x: 10, y: 4, width: 60, height: 18 }], "red");
    expect(shape.path.match(/ L /g)?.length).toBeGreaterThan(12);
    expect(shape.stroke).toBe("red");
    expect(shape.fill).toBe("none");
  });
});
