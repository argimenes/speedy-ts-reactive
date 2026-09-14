import { describe,expect,it } from "vitest";
import { exclusionPosition } from "./candidate-exclusion-layout";
describe("candidate exclusion geometry",() => {
  it("anchors to the final line rather than spanning the full passage",() => {
    expect(exclusionPosition([{ x: 0,y: 0,width: 300,height: 20 },{ x: 0,y: 24,width: 80,height: 20 }],{ left: 50,top: 50,width: 400 },{ width: 1000,height: 800 })).toEqual({ x: 83,y: 12 });
  });
  it("clamps the control at document and viewport edges",() => {
    const p = exclusionPosition([{ x: 180,y: 790,width: 20,height: 20 }],{ left: 800,top: 0,width: 200 },{ width: 1000,height: 800 })!;
    expect(p.x + 800 + 20).toBeLessThanOrEqual(1000); expect(p.y + 20).toBeLessThanOrEqual(800);
  });
  it("omits controls whose final fragment is offscreen",() => {
    expect(exclusionPosition([{ x: 0,y: 900,width: 20,height: 20 }],{ left: 0,top: 0,width: 400 },{ width: 1000,height: 800 })).toBeUndefined();
  });
});
