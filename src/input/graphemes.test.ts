import { describe, expect, it, vi } from "vitest";
import { graphemeBoundaries } from "./graphemes";

describe("linear grapheme boundary mapping", () => {
  it("retains code-point coordinates for combining marks, emoji joins, flags and CRLF", () => {
    expect(graphemeBoundaries("")).toEqual([0]);
    expect(graphemeBoundaries("Aé😀👨‍👩‍👧‍👦🇦🇺\r\nZ")).toEqual([0, 1, 3, 4, 11, 13, 15, 16]);
  });

  it("never slices paragraph prefixes when mapping a long paragraph", () => {
    const slice = vi.spyOn(String.prototype, "slice");
    let boundaries: number[];
    let calls: number;
    try {
      boundaries = graphemeBoundaries("xé😀".repeat(1500));
      calls = slice.mock.calls.length;
    } finally { slice.mockRestore(); }
    expect(calls!).toBe(0);
    expect(boundaries!).toHaveLength(4501);
    expect(boundaries!.at(-1)).toBe(6000);
  });

  it("preserves the code-point fallback without Intl.Segmenter", () => {
    const segmenter = Intl.Segmenter;
    try {
      Object.defineProperty(Intl, "Segmenter", { configurable: true, writable: true, value: undefined });
      expect(graphemeBoundaries("😀é")).toEqual([0, 1, 2, 3]);
    } finally { Object.defineProperty(Intl, "Segmenter", { configurable: true, writable: true, value: segmenter }); }
  });
});
