import { GLYPH_ENCODING, glyphRepertoire as repertoire } from "./glyphs";
import type { ExistingBlockDto } from "../../block-tree/types";

export type ScreenSettings = {
  version: 1;
  columns: 40 | 80;
  rows: 24;
  scroll: boolean;
  layout: "spatial" | "prose";
  tab: 4 | 8;
  glyphEncoding: typeof GLYPH_ENCODING;
};
export type Mark = {
  id: string;
  type: string;
  start: number;
  end: number;
  value?: unknown;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
};
export type ScreenData = {
  text: string;
  marks: Mark[];
  settings: ScreenSettings;
};
export type Cell = { column: number; row: number };
export type Rectangle = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};
export type Pattern = { version: 1; rows: string[]; marks: Mark[] };
export const DEFAULT_SCREEN: ScreenSettings = {
  version: 1,
  columns: 40,
  rows: 24,
  scroll: false,
  layout: "spatial",
  tab: 8,
  glyphEncoding: GLYPH_ENCODING,
};
export const ATTRIBUTES = [
  "phosphor/inverse",
  "phosphor/blink",
  "phosphor/underline",
] as const;
export const TAG = "codex/tag",
  ENTITY = "codex/entity-reference";
export { ASCII, APPLE } from "./glyphs";
export const chars = (text: string) => Array.from(text);
export function cleanInput(text: string, tab = 8, column = 0) {
  let result = "",
    replaced = 0,
    col = column;
  const segments = new Intl.Segmenter("en", {
    granularity: "grapheme",
  }).segment(text.replace(/\r\n?/g, "\n"));
  for (const { segment } of segments) {
    if (segment === "\t") {
      const n = tab - (col % tab);
      result += " ".repeat(n);
      col += n;
    } else {
      const glyph = repertoire.has(segment) ? segment : "?";
      if (glyph !== segment) replaced++;
      result += glyph;
      col = glyph === "\n" ? 0 : col + 1;
    }
  }
  return { text: result, replaced };
}
export function readSettings(value: unknown): ScreenSettings {
  const s = value as Partial<ScreenSettings> | undefined;
  if (s?.version !== undefined && s.version !== 1)
    throw Error("Unsupported Screen version; content has been preserved.");
  if (s?.glyphEncoding && s.glyphEncoding !== GLYPH_ENCODING)
    throw Error("Unsupported glyph encoding; content has been preserved.");
  return {
    version: 1,
    columns: s?.columns === 80 ? 80 : 40,
    rows: 24,
    scroll: s?.scroll === true,
    layout: s?.layout === "prose" ? "prose" : "spatial",
    tab: s?.tab === 4 ? 4 : 8,
    glyphEncoding: GLYPH_ENCODING,
  };
}
export function validate(data: ScreenData) {
  if (chars(data.text).length > 100000)
    throw Error(
      "Screen limit: 100,000 characters. Split this work into another Document.",
    );
  if (chars(data.text).some((c) => !repertoire.has(c)))
    throw Error(
      "This Screen contains unsupported characters. Its original content has been preserved.",
    );
  const lines = data.text.split("\n");
  if (
    data.settings.layout === "spatial" &&
    lines.some((l) => chars(l).length !== data.settings.columns)
  )
    throw Error(
      "Spatial rows must match the screen width. Original content has been preserved.",
    );
  if (!data.settings.scroll && project(data).length > data.settings.rows)
    throw Error(
      "This edit exceeds the fixed screen. Enable vertical scrolling first.",
    );
  for (const p of data.marks)
    if (
      !p.isDeleted &&
      (!Number.isInteger(p.start) ||
        !Number.isInteger(p.end) ||
        p.start < 0 ||
        p.end < p.start ||
        p.end >= chars(data.text).length)
    )
      throw Error("Invalid standoff anchor; content was not changed.");
}
export type Row = { start: number; length: number; text: string };
export function project(data: Pick<ScreenData, "text" | "settings">): Row[] {
  const result: Row[] = [];
  let start = 0;
  for (const line of data.text.split("\n")) {
    const letters = chars(line);
    if (data.settings.layout === "spatial" || !letters.length)
      result.push({ start, length: letters.length, text: line });
    else
      for (let i = 0; i < letters.length; i += data.settings.columns)
        result.push({
          start: start + i,
          length: Math.min(data.settings.columns, letters.length - i),
          text: letters.slice(i, i + data.settings.columns).join(""),
        });
    start += letters.length + 1;
  }
  return result;
}
export function offsetAt(data: ScreenData, cell: Cell) {
  const rows = project(data),
    row = rows[Math.max(0, Math.min(rows.length - 1, cell.row))];
  return row.start + Math.min(row.length, Math.max(0, cell.column));
}
export function cellAt(data: ScreenData, offset: number): Cell {
  const rows = project(data);
  let row = rows.findIndex(
    (r, i) =>
      offset >= r.start &&
      (i === rows.length - 1 || offset < rows[i + 1].start),
  );
  if (row < 0) row = 0;
  return {
    row,
    column: Math.min(
      data.settings.columns - 1,
      Math.max(0, offset - rows[row].start),
    ),
  };
}
export const rectangle = (a: Cell, b: Cell): Rectangle => ({
  left: Math.min(a.column, b.column),
  right: Math.max(a.column, b.column),
  top: Math.min(a.row, b.row),
  bottom: Math.max(a.row, b.row),
});
export function line(a: Cell, b: Cell): Cell[] {
  const result: Cell[] = [];
  let x = a.column,
    y = a.row,
    dx = Math.abs(b.column - x),
    dy = -Math.abs(b.row - y),
    sx = x < b.column ? 1 : -1,
    sy = y < b.row ? 1 : -1,
    error = dx + dy;
  for (;;) {
    result.push({ column: x, row: y });
    if (x === b.column && y === b.row) break;
    const e = 2 * error;
    if (e >= dy) {
      error += dy;
      x += sx;
    }
    if (e <= dx) {
      error += dx;
      y += sy;
    }
  }
  return result;
}
export function box(a: Cell, b: Cell, filled = false) {
  const r = rectangle(a, b),
    cells: Cell[] = [];
  for (let y = r.top; y <= r.bottom; y++)
    for (let x = r.left; x <= r.right; x++)
      if (
        filled ||
        x === r.left ||
        x === r.right ||
        y === r.top ||
        y === r.bottom
      )
        cells.push({ column: x, row: y });
  return cells;
}
export function newDocument(
  example: "blank" | "rain" | "letter" | "poem" = "blank",
): ExistingBlockDto {
  const id = crypto.randomUUID(),
    settings: ScreenSettings = {
      ...DEFAULT_SCREEN,
      ...(example === "letter"
        ? ({ columns: 80, layout: "prose", scroll: true } as const)
        : {}),
    };
  const rain = [
    "",
    "       .          *           .",
    "   *       .              *",
    "          .----.",
    "     .---(      ).----.",
    "    (                 )",
    "     `---.-------.---'",
    "        |  | |  |  |",
    "        |  | |  |  |",
    "",
    "      it is raining",
    "      on the remembered city",
    "      and the lights",
    "      still burn",
    "      in untranslated windows.",
    "",
    "    +----+           +---+",
    "    | :: |   +----+  | : |",
    "    | :: |   | :: |  | : |",
    " ___|____|___|____|__|___|___",
  ];
  const poem = [
    "",
    "       SAME THING.",
    "",
    "             MANY FORMS.",
    "",
    "   a word",
    "          a window",
    "                   a light",
  ];
  let text =
    example === "letter"
      ? "Dear friend,\n\nThis is a place for words, with room to keep going. The screen wraps at eighty columns; only the returns you type belong to the Document.\n\nWith warm wishes,\n"
      : Array.from(
          { length: 24 },
          (_, i) =>
            (example === "rain"
              ? rain[i]
              : example === "poem"
                ? poem[i]
                : ""
            )?.padEnd(40) ?? " ".repeat(40),
        ).join("\n");
  const marks: Mark[] =
    example === "poem"
      ? [
          { id: crypto.randomUUID(), type: ATTRIBUTES[0], start: 48, end: 58 },
          {
            id: crypto.randomUUID(),
            type: ATTRIBUTES[1],
            start: 3 * 41 + 13,
            end: 3 * 41 + 23,
          },
          {
            id: crypto.randomUUID(),
            type: TAG,
            value: "light",
            start: 7 * 41 + 19,
            end: 7 * 41 + 25,
          },
        ]
      : [];
  return {
    id,
    type: "document-block",
    metadata: {
      documentId: id,
      title:
        example === "rain"
          ? "rain"
          : example === "letter"
            ? "Letter"
            : example === "poem"
              ? "Concrete poem"
              : "Untitled",
      tags: example === "poem" ? ["light"] : [],
      phosphorIndexedTags: example === "poem" ? ["light"] : [],
    },
    children: [
      {
        id: crypto.randomUUID(),
        type: "phosphor-screen-block",
        phosphor: settings,
        children: [
          {
            id: crypto.randomUUID(),
            type: "standoff-editor-block",
            text,
            standoffProperties: marks,
          },
        ],
      },
    ],
  };
}
// Transform native inclusive standoff ranges for a text splice (half-open edit).
export function splice(
  data: ScreenData,
  start: number,
  end: number,
  value: string,
): ScreenData {
  const letters = chars(data.text),
    insert = chars(value),
    delta = insert.length - (end - start);
  const marks = data.marks
    .flatMap((p) => {
      if (p.end < start) return [p];
      if (p.start >= end)
        return [{ ...p, start: p.start + delta, end: p.end + delta }];
      if (start === end) return [{ ...p, end: p.end + delta }];
      const left = p.start < start,
        right = p.end >= end;
      if (!left && !right) return [];
      return [
        {
          ...p,
          start: left ? p.start : start + insert.length,
          end: right ? p.end + delta : start - 1,
        },
      ];
    })
    .filter((p) => p.end >= p.start);
  letters.splice(start, end - start, ...insert);
  return { ...data, text: letters.join(""), marks };
}
export function write(
  data: ScreenData,
  start: number,
  end: number,
  value: string,
  insert: boolean,
): { data: ScreenData; caret: number; positions: number[] } {
  const clean = cleanInput(
    value,
    data.settings.tab,
    cellAt(data, start).column,
  ).text;
  if (data.settings.layout === "prose") {
    const next = splice(
      data,
      start,
      end > start
        ? end
        : insert
          ? start
          : Math.min(chars(data.text).length, start + chars(clean).length),
      clean,
    );
    validate(next);
    return {
      data: next,
      caret: start + chars(clean).length,
      positions: chars(clean).map((_, i) => start + i),
    };
  }
  let next = data,
    cursor = start;
  const positions: number[] = [];
  if (end > start)
    next = paint(
      next,
      Array.from({ length: end - start }, (_, i) =>
        cellAt(next, start + i),
      ).filter((c, i) => chars(next.text)[start + i] !== "\n"),
      " ",
      [],
    );
  const glyphs = chars(clean);
  for (const [glyphIndex, glyph] of glyphs.entries()) {
    let cell = cellAt(next, cursor),
      row = project(next)[cell.row];
    positions.push(glyph === "\n" ? row.start + next.settings.columns : cursor);
    if (glyph === "\n") {
      cursor = (cell.row + 1) * (next.settings.columns + 1);
    } else {
      if (insert) {
        const tail = row.start + next.settings.columns - 1;
        if (
          chars(next.text)[tail] !== " " ||
          next.marks.some((p) => p.start <= tail && p.end >= tail)
        )
          throw Error(
            "Insert would displace authored content beyond this row. Use Overwrite or a wider screen.",
          );
        next = splice(next, tail, tail + 1, "");
        next = splice(next, cursor, cursor, glyph);
      } else next = paint(next, [cell], glyph, []);
      cursor++;
      if (cursor === row.start + next.settings.columns) cursor++;
    }
    if (cursor >= chars(next.text).length) {
      if (next.settings.scroll)
        next = {
          ...next,
          text: next.text + "\n" + " ".repeat(next.settings.columns),
        };
      else if (glyphIndex < glyphs.length - 1)
        throw Error("The fixed screen is full. Enable vertical scrolling.");
      else cursor = chars(next.text).length - 1;
    }
  }
  validate(next);
  return { data: next, caret: cursor, positions };
}
export function paint(
  data: ScreenData,
  cells: Cell[],
  glyph: string | ((cell: Cell) => string),
  attributes: readonly string[],
): ScreenData {
  if (data.settings.layout !== "spatial")
    throw Error(
      "Drawing needs Spatial layout. Convert the prose screen first.",
    );
  const letters = chars(data.text),
    indices = new Set<number>(),
    rowCount = project(data).length;
  for (const c of cells) {
    if (
      c.column < 0 ||
      c.column >= data.settings.columns ||
      c.row < 0 ||
      c.row >= rowCount
    )
      continue;
    const i = c.row * (data.settings.columns + 1) + c.column;
    letters[i] = typeof glyph === "string" ? glyph : glyph(c);
    indices.add(i);
  }
  // Replacing a cell replaces its authored marks; unaffected segments keep anchors.
  const marks: Mark[] = [];
  for (const p of data.marks) {
    let start = p.start,
      part = 0;
    for (let i = p.start; i <= p.end + 1; i++) {
      if (i === p.end + 1 || indices.has(i)) {
        if (i > start)
          marks.push({
            ...p,
            id: part++ ? crypto.randomUUID() : p.id,
            start,
            end: i - 1,
          });
        start = i + 1;
      }
    }
  }
  for (const i of indices)
    for (const type of attributes)
      marks.push({ id: crypto.randomUUID(), type, start: i, end: i });
  return { ...data, text: letters.join(""), marks };
}
export function resize(data: ScreenData, settings: ScreenSettings): ScreenData {
  if (data.settings.layout === "prose" && settings.layout === "prose") {
    const next = { ...data, settings };
    validate(next);
    return next;
  }
  // Map every surviving authored character to its new cell; never trim artwork.
  const rows =
    data.settings.layout === "prose"
      ? project(data)
      : data.text
          .split("\n")
          .map((text, i) => ({
            text,
            start: i * (data.settings.columns + 1),
            length: chars(text).length,
          }));
  const map = new Map<number, number>();
  const lines: string[] = [];
  for (const row of rows) {
    const letters = chars(row.text);
    if (
      letters.slice(settings.columns).some((c) => c !== " ") ||
      data.marks.some(
        (p) =>
          p.end >= row.start + settings.columns &&
          p.start < row.start + row.length,
      )
    )
      throw Error(
        "Narrowing would remove artwork or annotations. Keep 80 columns or clear those cells first.",
      );
    for (let i = 0; i < Math.min(letters.length, settings.columns); i++)
      map.set(row.start + i, lines.length * (settings.columns + 1) + i);
    lines.push(
      letters.slice(0, settings.columns).join("").padEnd(settings.columns),
    );
  }
  if (!settings.scroll && lines.length > 24)
    throw Error("Content exceeds 24 rows. Keep vertical scrolling enabled.");
  while (lines.length < 24) lines.push(" ".repeat(settings.columns));
  const marks = data.marks.map((p) => ({
    ...p,
    start: map.get(p.start) ?? p.start,
    end: map.get(p.end) ?? p.end,
  }));
  const next = { text: lines.join("\n"), settings, marks };
  validate(next);
  return next;
}
export function copyRectangle(data: ScreenData, r: Rectangle): Pattern {
  const width = r.right - r.left + 1,
    rows: string[] = [],
    marks: Mark[] = [];
  for (let y = r.top; y <= r.bottom; y++) {
    const start = y * (data.settings.columns + 1) + r.left,
      end = start + width;
    rows.push(chars(data.text).slice(start, end).join(""));
    for (const p of data.marks) {
      const a = Math.max(start, p.start),
        b = Math.min(end - 1, p.end);
      if (a <= b)
        marks.push({
          ...p,
          id: crypto.randomUUID(),
          start: (y - r.top) * (width + 1) + a - start,
          end: (y - r.top) * (width + 1) + b - start,
        });
    }
  }
  return { version: 1, rows, marks };
}
export function stamp(
  data: ScreenData,
  pattern: Pattern,
  at: Cell,
): ScreenData {
  if (
    pattern?.version !== 1 ||
    !Array.isArray(pattern.rows) ||
    !pattern.rows.length ||
    pattern.rows.some((r) => typeof r !== "string") ||
    !Array.isArray(pattern.marks)
  )
    throw Error("Invalid rectangular clipboard");
  const width = chars(pattern.rows[0]).length;
  if (
    !width ||
    width > 80 ||
    pattern.rows.length > 2500 ||
    pattern.rows.some(
      (r) =>
        chars(r).length !== width ||
        r.includes("\n") ||
        chars(r).some((c) => !repertoire.has(c)),
    ) ||
    pattern.marks.some(
      (m) =>
        !m ||
        typeof m.type !== "string" ||
        !Number.isInteger(m.start) ||
        !Number.isInteger(m.end) ||
        m.start < 0 ||
        m.end < m.start ||
        m.end >= pattern.rows.length * (width + 1) - 1,
    )
  )
    throw Error("Invalid rectangular clipboard");
  if (
    at.column < 0 ||
    at.row < 0 ||
    at.column + width > data.settings.columns ||
    at.row + pattern.rows.length > project(data).length
  )
    throw Error("The entire selection must fit on the screen.");
  const glyphs = pattern.rows.map(chars),
    cells = glyphs.flatMap((row, y) =>
      row.map((_, x) => ({ column: at.column + x, row: at.row + y })),
    );
  let next = paint(
    data,
    cells,
    (c) => glyphs[c.row - at.row][c.column - at.column],
    [],
  );
  const marks = pattern.marks.map((p) => {
    const position = (i: number) => {
      const y = Math.floor(i / (width + 1)),
        x = i % (width + 1);
      return (at.row + y) * (data.settings.columns + 1) + at.column + x;
    };
    return {
      ...p,
      id: crypto.randomUUID(),
      start: position(p.start),
      end: position(p.end),
    };
  });
  next = { ...next, marks: [...next.marks, ...marks] };
  validate(next);
  return next;
}
