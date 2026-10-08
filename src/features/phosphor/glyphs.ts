/** Apple IIe Enhanced (1985) identities, independent of screen-byte video flags.
 * Glyph outlines are supplied by the bundled, unmodified Apple II bitmap fonts.
 * Sources and the three private-use assignments are recorded in PHOSPHOR_MVP.md.
 */
export const GLYPH_ENCODING = "apple2-unicode-v1" as const;
export const ASCII = Array.from({ length: 95 }, (_, i) =>
  String.fromCodePoint(i + 32),
);
const mouseCodes = [
  0xf813, 0xf812, 0x1fbb0, 0x231b, 0x2713, 0x1fbb1, 0x1fbb2, 0x1fbb3, 0x2190,
  0x2026, 0x2193, 0x2191, 0x2594, 0x21b2, 0x2589, 0x1fbb5, 0x1fbb6, 0x1fbb7,
  0x1fbb8, 0x2500, 0x1fb7c, 0x2192, 0x2592, 0x1fb90, 0x1fbb9, 0x1fbba, 0x2595,
  0x25c6, 0x1fb80, 0x1fbbb, 0x1fbbc, 0x258f,
];
const mouseNames = [
  "Solid Apple",
  "Open Apple",
  "Pointer",
  "Hourglass",
  "Check mark",
  "Inverse check mark",
  "Running man, left",
  "Running man, right",
  "Left arrow",
  "Ellipsis",
  "Down arrow",
  "Up arrow",
  "Top edge",
  "Return arrow",
  "Solid block",
  "Left arrow with edges",
  "Right arrow with edges",
  "Down arrow with edge",
  "Up arrow with edge",
  "Horizontal line",
  "Lower left corner",
  "Right arrow",
  "Checkerboard",
  "Inverse checkerboard",
  "Folder, left",
  "Folder, right",
  "Right edge",
  "Diamond",
  "Top and bottom edges",
  "Cross",
  "Right open square dot",
  "Left edge",
];
export const MOUSETEXT = mouseCodes.map((cp, i) => ({
  glyph: String.fromCodePoint(cp),
  code: 0x40 + i,
  name: mouseNames[i],
}));
export const CHECKER = "\ue07f";
export const APPLE = [...MOUSETEXT.map((m) => m.glyph), CHECKER];
export const glyphInfo = (glyph: string) =>
  MOUSETEXT.find((m) => m.glyph === glyph) ??
  (glyph === CHECKER
    ? { glyph, code: 0xff, name: "Checkerboard cursor" }
    : undefined);
export const glyphLabel = (glyph: string) => {
  const info = glyphInfo(glyph);
  return info
    ? `${info.name} · $${info.code.toString(16).toUpperCase()}`
    : glyph === " "
      ? "Space"
      : `Glyph ${glyph}`;
};
export const glyphRepertoire = new Set([...ASCII, ...APPLE, "\n"]);
/** Decode a VIDEO MEMORY byte, not a stream of firmware/ASCII control codes.
 * Callers must explicitly supply ALTCHARSET. No heuristic decoding on paste.
 */
export function decodeScreenByte(byte: number, alternate: boolean) {
  if (!Number.isInteger(byte) || byte < 0 || byte > 255)
    throw Error("A screen byte must be 0–255.");
  if (alternate && byte >= 0x40 && byte < 0x60)
    return {
      glyph: MOUSETEXT[byte - 0x40].glyph,
      inverse: false,
      blink: false,
    };
  const inverse = byte < 0x40 || (alternate && byte >= 0x60 && byte < 0x80);
  const blink = !alternate && byte >= 0x40 && byte < 0x80;
  let cp = byte & 0x7f;
  if (byte < 0x80 && !alternate)
    cp = (byte & 0x3f) < 0x20 ? (byte & 0x3f) + 0x40 : byte & 0x3f;
  else if (cp < 0x20) cp += 0x40;
  return {
    glyph: cp === 0x7f ? CHECKER : String.fromCodePoint(cp),
    inverse,
    blink,
  };
}
