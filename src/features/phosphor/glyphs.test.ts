import { it, expect } from "vitest";
import {
  ASCII,
  MOUSETEXT,
  CHECKER,
  decodeScreenByte,
  GLYPH_ENCODING,
} from "./glyphs";
import {
  DEFAULT_SCREEN,
  chars,
  cleanInput,
  paint,
  copyRectangle,
  stamp,
  write,
  validate,
} from "./model";
it("maps all enhanced IIe MouseText slots once, retaining the reference running man pair", () => {
  expect(MOUSETEXT).toHaveLength(32);
  expect(new Set(MOUSETEXT.map((m) => m.glyph)).size).toBe(32);
  for (const m of MOUSETEXT)
    expect(decodeScreenByte(m.code, true)).toEqual({
      glyph: m.glyph,
      inverse: false,
      blink: false,
    });
  expect(MOUSETEXT[6].glyph).toBe(String.fromCodePoint(0x1fbb2));
  expect(MOUSETEXT[7].glyph).toBe(String.fromCodePoint(0x1fbb3));
  expect(MOUSETEXT[0].glyph).toBe("\uf813");
  expect(MOUSETEXT[1].glyph).toBe("\uf812");
});
it("separates historical inverse/flash/duplicate code ranges from printable identity", () => {
  expect(decodeScreenByte(0x01, false)).toEqual({
    glyph: "A",
    inverse: true,
    blink: false,
  });
  expect(decodeScreenByte(0x41, false)).toEqual({
    glyph: "A",
    inverse: false,
    blink: true,
  });
  expect(decodeScreenByte(0x81, false)).toEqual(decodeScreenByte(0xc1, false));
  expect(decodeScreenByte(0x61, true)).toEqual({
    glyph: "a",
    inverse: true,
    blink: false,
  });
  expect(decodeScreenByte(0xe1, true)).toEqual({
    glyph: "a",
    inverse: false,
    blink: false,
  });
  expect(decodeScreenByte(0xff, true).glyph).toBe(CHECKER);
  expect(cleanInput("@ABC").text).toBe("@ABC");
  expect(cleanInput("\u0001").text).toBe("?");
});
it("keeps bitmap identities as single native cells and attributes out of the string", () => {
  const text =
    ASCII.join("") + MOUSETEXT.map((m) => m.glyph).join("") + CHECKER;
  expect(cleanInput(text).text).toBe(text);
  expect(chars(text)).toHaveLength(128);
  let data = {
    text: Array(24).fill(" ".repeat(40)).join("\n"),
    marks: [],
    settings: { ...DEFAULT_SCREEN },
  };
  const next = paint(data, [{ column: 3, row: 4 }], MOUSETEXT[6].glyph, [
    "phosphor/inverse",
    "phosphor/blink",
  ]);
  const result = stamp(
    next,
    copyRectangle(next, { left: 3, right: 3, top: 4, bottom: 4 }),
    { column: 9, row: 5 },
  );
  validate(result);
  expect(chars(result.text)[5 * 41 + 9]).toBe(MOUSETEXT[6].glyph);
  expect(result.marks.filter((m) => m.start === 5 * 41 + 9)).toHaveLength(2);
  expect(result.settings.glyphEncoding).toBe(GLYPH_ENCODING);
  const prose = {
    ...data,
    text: "AB",
    settings: { ...data.settings, layout: "prose" as const },
  };
  expect(write(prose, 1, 1, MOUSETEXT[6].glyph, true).caret).toBe(2);
});
