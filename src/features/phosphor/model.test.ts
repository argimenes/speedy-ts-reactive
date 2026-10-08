import { describe, it, expect } from "vitest";
import {
  DEFAULT_SCREEN,
  newDocument,
  project,
  write,
  resize,
  paint,
  line,
  box,
  copyRectangle,
  stamp,
  cleanInput,
  ATTRIBUTES,
  TAG,
  ENTITY,
  type ScreenData,
} from "./model";
const screen = (): ScreenData => ({
  text: Array(24).fill(" ".repeat(40)).join("\n"),
  marks: [],
  settings: { ...DEFAULT_SCREEN },
});
describe("Phosphor authored geometry", () => {
  it("keeps soft wraps out of authored text and hard breaks distinct", () => {
    const data = {
      ...screen(),
      text: "a".repeat(83) + "\n  end  ",
      settings: {
        ...DEFAULT_SCREEN,
        columns: 80 as const,
        layout: "prose" as const,
        scroll: true,
      },
    };
    expect(project(data).map((r) => r.length)).toEqual([80, 3, 7]);
    expect(resize(data, { ...data.settings, columns: 40 }).text).toBe(
      data.text,
    );
  });
  it("preserves explicit spaces and annotation anchors through width changes; refuses loss", () => {
    let s = paint(screen(), [{ column: 4, row: 3 }], "*", []);
    s.marks = [{ id: "tag", type: TAG, value: "star", start: 127, end: 127 }];
    const wide = resize(s, { ...s.settings, columns: 80 });
    expect(wide.marks[0].start).toBe(247);
    expect(resize(wide, s.settings)).toEqual(s);
    const edge = paint(wide, [{ column: 60, row: 0 }], "!", []);
    expect(() => resize(edge, s.settings)).toThrow("remove artwork");
  });
  it("makes insertion deterministic without losing a row end", () => {
    let s = screen();
    s = write(s, 0, 0, "ABC", false).data;
    const result = write(s, 1, 1, "-", true);
    expect(result.data.text.slice(0, 5)).toBe("A-BC ");
    s = paint(s, [{ column: 39, row: 0 }], "!", []);
    expect(() => write(s, 0, 0, "X", true)).toThrow("displace");
  });
  it("draws quantised strokes and copies/moves semantic rectangular patterns", () => {
    let s = paint(
      screen(),
      line({ column: 2, row: 2 }, { column: 6, row: 4 }),
      "#",
      [ATTRIBUTES[0]],
    );
    s.marks.push({
      id: "entity",
      type: ENTITY,
      value: "canonical-id",
      start: 84,
      end: 85,
    });
    const pattern = copyRectangle(s, { left: 2, right: 6, top: 2, bottom: 4 });
    const pasted = stamp(s, pattern, { column: 20, row: 10 });
    expect(
      copyRectangle(pasted, { left: 20, right: 24, top: 10, bottom: 12 }).rows,
    ).toEqual(pattern.rows);
    expect(
      pasted.marks.find((m) => m.type === ENTITY && m.start === 430)?.value,
    ).toBe("canonical-id");
    expect(() => stamp(s, pattern, { column: 39, row: 23 })).toThrow("entire");
    expect(box({ column: 0, row: 0 }, { column: 2, row: 2 }).length).toBe(8);
  });
  it("refuses repeated-character paste beyond the final fixed cell", () => {
    const s = screen();
    expect(() =>
      write(s, s.text.length - 1, s.text.length - 1, "XX", false),
    ).toThrow("full");
    expect(
      stamp.bind(
        null,
        s,
        { version: 1, rows: ["ok", "bad"], marks: [] },
        { column: 0, row: 0 },
      ),
    ).toThrow("Invalid");
  });
  it("normalises unsupported graphemes to one predictable cell", () => {
    expect(cleanInput("A👨‍👩‍👧‍👦B\r\nC\tD", 4).text).toBe("A?B\nC   D");
    expect(cleanInput("é").replaced).toBe(1);
  });
  it("ships all three small authored works without malformed anchors", () => {
    for (const kind of ["rain", "letter", "poem"] as const) {
      const d = newDocument(kind),
        s = d.children![0];
      expect(s.type).toBe("phosphor-screen-block");
      expect(s.children![0].type).toBe("standoff-editor-block");
    }
  });
});
