import type { JSX } from "solid-js";

export type StandoffAnnotation = Record<string, unknown> & {
  id?: string;
  type?: string;
  start?: number;
  end?: number;
  value?: string;
  isDeleted?: boolean;
};

type SvgStyle = { kind: "underline"; colour: string } | { kind: "rainbow" | "highlighter" | "rectangle" | "spiky" };
export interface StandoffStyleSchema {
  cell?: JSX.CSSProperties;
  valueStyle?: "color" | "background-color";
  svg?: SvgStyle;
  blur?: true;
  deferred?: "range-wrapper" | "animation-plugin" | "embedded-document";
}

/** Current TS schemas; appearance only. Reference values are IDs, not colours. */
export const standoffStyleSchemas: Readonly<Record<string, StandoffStyleSchema>> = {
  "text/background-colour": { valueStyle: "background-color" },
  "text/colour": { valueStyle: "color" },
  "cell/micro-document": { deferred: "embedded-document" },
  "animation/clock": { deferred: "animation-plugin" },
  "style/blur": { blur: true },
  "style/flip": { deferred: "range-wrapper" },
  "style/mirror": { deferred: "range-wrapper" },
  "style/superscript": { cell: { "vertical-align": "super", "font-size": "0.8rem" } },
  "style/subscript": { cell: { "vertical-align": "sub", "font-size": "0.8rem" } },
  "style/uppercase": { cell: { "text-transform": "uppercase" } },
  "style/italics": { cell: { "font-style": "italic" } },
  "style/strikethrough": { cell: { "text-decoration-line": "line-through" } },
  "style/highlight": { cell: { "background-color": "pink" } },
  "style/bold": { cell: { "font-weight": "600" } },
  "style/underline": { cell: { "text-decoration-line": "underline" } },
  "reference/url": { cell: { "text-decoration-line": "underline", "text-decoration-color": "blue" } },
  "codex/search/highlight": { cell: { "background-color": "pink" } },
  "codex/block-reference": { svg: { kind: "underline", colour: "green" } },
  "codex/trait-reference": { svg: { kind: "underline", colour: "blue" } },
  "codex/claim-reference": { svg: { kind: "underline", colour: "red" } },
  "codex/meta-relation-reference": { svg: { kind: "underline", colour: "orange" } },
  "codex/time-reference": { svg: { kind: "underline", colour: "cyan" } },
  "codex/entity-reference": { svg: { kind: "underline", colour: "purple" } },
  "style/highlighter": { svg: { kind: "highlighter" } },
  "style/rainbow": { svg: { kind: "rainbow" } },
  "style/rectangle": { svg: { kind: "rectangle" } },
  "style/spiky": { svg: { kind: "spiky" } },
};

const aliases: Record<string, string> = { "style/strike": "style/strikethrough", "style/color": "text/colour" };
export function standoffStyleSchema(type?: string): StandoffStyleSchema | undefined {
  if (!type) return undefined;
  const name = Object.hasOwn(aliases, type) ? aliases[type] : type;
  return Object.hasOwn(standoffStyleSchemas, name) ? standoffStyleSchemas[name] : undefined;
}

export function hasActiveRange(annotation: StandoffAnnotation): annotation is StandoffAnnotation & { start: number; end: number } {
  return !annotation.isDeleted && Number.isInteger(annotation.start) && Number.isInteger(annotation.end)
    && annotation.start! >= 0 && annotation.end! >= annotation.start!;
}

export function standoffCellStyles(index: number, annotations: readonly StandoffAnnotation[]): JSX.CSSProperties {
  const active = annotations.filter((annotation) => hasActiveRange(annotation) && annotation.start <= index && annotation.end >= index);
  const styles: JSX.CSSProperties = {};
  const lines = new Set<string>();
  for (const annotation of active) {
    const cell = standoffStyleSchema(annotation.type)?.cell;
    if (!cell) continue;
    if (cell["text-decoration-line"]) lines.add(String(cell["text-decoration-line"]));
    Object.assign(styles, cell);
  }
  if (lines.size) styles["text-decoration-line"] = [...lines].join(" ");
  // Original explicit per-Cell colours override class-based highlight colours.
  for (const annotation of active) {
    const field = standoffStyleSchema(annotation.type)?.valueStyle;
    if (field && typeof annotation.value === "string" && annotation.value.trim()) styles[field] = annotation.value;
  }
  return styles;
}

export interface CellStyleRun { start: number; style: JSX.CSSProperties }
const emptyCellStyle: JSX.CSSProperties = {};

/** CSS changes only at annotation endpoints. SVG-only references do not belong
 * in the per-character reactive dependency graph. Preserve source-order cascade.
 */
export function compileCellStyleRuns(annotations: readonly StandoffAnnotation[]): CellStyleRun[] {
  const css = annotations.filter(annotation => {
    const schema = standoffStyleSchema(annotation.type);
    return (schema?.cell || schema?.valueStyle) && hasActiveRange(annotation);
  });
  const boundaries = new Set<number>([0]);
  for (const annotation of css) { boundaries.add(annotation.start!); boundaries.add(annotation.end! + 1); }
  const runs: CellStyleRun[] = [];
  let previous = "";
  for (const start of [...boundaries].sort((a, b) => a - b)) {
    const style = standoffCellStyles(start, css);
    const signature = JSON.stringify(style);
    if (signature !== previous) runs.push({ start, style });
    previous = signature;
  }
  return runs;
}

export function cellStyleAt(runs: readonly CellStyleRun[], index: number): JSX.CSSProperties {
  let low = 0, high = runs.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (runs[middle].start <= index) low = middle + 1; else high = middle;
  }
  return runs[low - 1]?.style ?? emptyCellStyle;
}

/** Allocate pixels only to overlapping SVG underlines; rainbows occupy 14px. */
export function standoffSvgStyles(annotations: readonly StandoffAnnotation[], cellCount: number) {
  const occupied: Array<{ start: number; end: number; offset: number; height: number }> = [];
  return annotations.flatMap((annotation, index) => {
    if (!hasActiveRange(annotation) || annotation.start >= cellCount) return [];
    const svg = standoffStyleSchema(annotation.type)?.svg;
    if (!svg) return [];
    let offset = 0;
    const height = svg.kind === "rainbow" ? 14 : svg.kind === "underline" ? 2 : 0;
    if (height) {
      const overlaps = occupied.filter((range) => range.start <= annotation.end && annotation.start <= range.end);
      let conflict;
      while ((conflict = overlaps.find((range) => offset < range.offset + range.height + 1 && offset + height + 1 > range.offset))) {
        offset = conflict.offset + conflict.height + 1;
      }
      occupied.push({ start: annotation.start, end: annotation.end, offset, height });
    }
    return [{ annotation, svg, offset, index }];
  });
}
