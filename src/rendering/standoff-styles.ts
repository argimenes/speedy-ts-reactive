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
  cellEffect?: true;
  regionEffect?: true;
  noiseEffect?: true;
  deferred?: "range-wrapper" | "animation-plugin" | "embedded-document";
}

/** Current TS schemas; appearance only. Reference values are IDs, not colours. */
export const standoffStyleSchemas: Readonly<Record<string, StandoffStyleSchema>> = {
  "text/background-colour": { valueStyle: "background-color" },
  "text/colour": { valueStyle: "color" },
  "cell/micro-document": { deferred: "embedded-document" },
  "animation/clock": { deferred: "animation-plugin" },
  "style/blur": { regionEffect: true },
  "style/glow": { cellEffect: true },
  "style/chromatic-aberration": { cellEffect: true },
  "style/motion-blur": { regionEffect: true },
  "style/ghost": { cellEffect: true },
  "style/grayscale": { regionEffect: true },
  "style/sepia": { regionEffect: true },
  "style/invert": { regionEffect: true },
  "style/contrast-brightness": { regionEffect: true },
  "style/grain": { noiseEffect: true },
  "style/ink-bleed": { cellEffect: true, noiseEffect: true },
  "style/turbulence": { noiseEffect: true },
  "amber-crt": { cellEffect: true, noiseEffect: true },
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

function parameter(annotation: StandoffAnnotation, name: string, fallback: number, minimum: number, maximum: number): number {
  const value = Number(annotation[name]);
  return Number.isFinite(value) ? Math.max(minimum, Math.min(maximum, value)) : fallback;
}

function cellEffectStyle(annotation: StandoffAnnotation): JSX.CSSProperties | undefined {
  const intensity = parameter(annotation, "intensity", .35, 0, 1);
  switch (annotation.type) {
    case "style/glow": {
      const radius = parameter(annotation, "radius", 3, 0, 16);
      return { "text-shadow": `0 0 ${radius}px rgba(65, 220, 255, ${intensity}), 0 0 ${radius * 2}px rgba(80, 150, 255, ${intensity * .55})` };
    }
    case "style/chromatic-aberration": {
      const offset = parameter(annotation, "offset", 1.5, 0, 8);
      return { "text-shadow": `${-offset}px 0 0 rgba(255, 28, 64, ${intensity}), ${offset}px 0 0 rgba(0, 205, 255, ${intensity})` };
    }
    case "style/ghost": {
      const x = parameter(annotation, "offsetX", 3, -20, 20);
      const y = parameter(annotation, "offsetY", 1, -20, 20);
      const blur = parameter(annotation, "blur", 1.5, 0, 16);
      const opacity = parameter(annotation, "opacity", .28, 0, 1);
      return { "text-shadow": `${x}px ${y}px ${blur}px rgba(32, 55, 72, ${opacity})` };
    }
    case "style/ink-bleed": {
      const spread = parameter(annotation, "spread", 1, 0, 5);
      const roughness = parameter(annotation, "roughness", .35, 0, 1);
      const alpha = parameter(annotation, "intensity", .26, 0, .8);
      const diagonal = Math.max(.25, spread * (.45 + roughness * .35));
      return { "text-shadow": [
        `${spread}px 0 ${spread}px rgba(35, 24, 16, ${alpha})`,
        `${-spread}px 0 ${spread}px rgba(35, 24, 16, ${alpha})`,
        `${diagonal}px ${diagonal}px ${spread * 1.35}px rgba(35, 24, 16, ${alpha * .8})`,
        `${-diagonal}px ${diagonal}px ${spread * 1.1}px rgba(35, 24, 16, ${alpha * .65})`,
      ].join(", ") };
    }
    case "amber-crt": {
      const bloom = parameter(annotation, "bloom", 1.5, .5, 6);
      const halo = parameter(annotation, "halo", 4, 1, 12);
      const smear = parameter(annotation, "smear", .65, 0, 2);
      return {
        color: "#ffd45a",
        "background-color": "#17140d",
        "text-shadow": [
          "0 0 .45px rgba(255, 250, 212, .98)",
          `0 0 ${bloom}px rgba(255, 176, 0, .92)`,
          `0 0 ${halo}px rgba(255, 140, 0, .38)`,
          `0 0 ${halo * 1.75}px rgba(255, 140, 0, .13)`,
          `${smear}px 0 1px rgba(255, 176, 0, .55)`,
        ].join(", "),
      };
    }
  }
}

export function standoffCellStyles(index: number, annotations: readonly StandoffAnnotation[]): JSX.CSSProperties {
  const active = annotations.filter((annotation) => hasActiveRange(annotation) && annotation.start <= index && annotation.end >= index);
  const styles: JSX.CSSProperties = {};
  const lines = new Set<string>();
  const shadows: string[] = [];
  for (const annotation of active) {
    const schema = standoffStyleSchema(annotation.type);
    const cell = schema?.cell ?? (schema?.cellEffect ? cellEffectStyle(annotation) : undefined);
    if (!cell) continue;
    if (cell["text-decoration-line"]) lines.add(String(cell["text-decoration-line"]));
    if (cell["text-shadow"]) shadows.push(String(cell["text-shadow"]));
    Object.assign(styles, cell);
  }
  if (lines.size) styles["text-decoration-line"] = [...lines].join(" ");
  if (shadows.length) styles["text-shadow"] = shadows.join(", ");
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
    return (schema?.cell || schema?.cellEffect || schema?.valueStyle) && hasActiveRange(annotation);
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
