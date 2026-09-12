export interface VisualFragment {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DecorationShape {
  key: string;
  path: string;
  stroke?: string;
  fill?: string;
  strokeWidth?: number;
  opacity?: number;
  propertyType?: string;
  dashArray?: string;
  animated?: boolean;
}

export function rectanglePath(fragment: VisualFragment): string {
  const x2 = fragment.x + fragment.width;
  const y2 = fragment.y + fragment.height;
  return `M ${fragment.x} ${fragment.y} H ${x2} V ${y2} H ${fragment.x} Z`;
}

export function underlineShapes(
  key: string,
  fragments: VisualFragment[],
  stroke: string,
  offsetY = 0,
): DecorationShape[] {
  return fragments.map((fragment, index) => {
    const y = fragment.y + fragment.height + 1.5 + offsetY;
    return {
      key: `${key}:underline:${index}`,
      path: `M ${fragment.x} ${y} H ${fragment.x + fragment.width}`,
      stroke,
      fill: "none",
      strokeWidth: 2,
    };
  });
}

const rainbowColours = [
  "#ff0000",
  "#ff8000",
  "#ffff00",
  "#00ff00",
  "#00ffff",
  "#0000ff",
  "#8000ff",
] as const;

/** Matches the original renderer's seven stacked two-pixel underline lanes. */
export function rainbowShapes(
  key: string,
  fragments: VisualFragment[],
  offsetY = 0,
): DecorationShape[] {
  return fragments.flatMap((fragment, fragmentIndex) =>
    rainbowColours.map((stroke, colourIndex) => {
      const y = fragment.y + fragment.height + 1.5 + offsetY + colourIndex * 2;
      return {
        key: `${key}:rainbow:${fragmentIndex}:${colourIndex}`,
        path: `M ${fragment.x} ${y} H ${fragment.x + fragment.width}`,
        stroke,
        fill: "none",
        strokeWidth: 2,
      };
    }),
  );
}

export function highlightShapes(
  key: string,
  fragments: VisualFragment[],
  fill: string,
): DecorationShape[] {
  return fragments.map((fragment, index) => ({
    key: `${key}:highlight:${index}`,
    path: rectanglePath(fragment),
    fill,
    stroke: "none",
    opacity: 0.34,
  }));
}

export function outlineShapes(
  key: string,
  fragments: VisualFragment[],
  stroke: string,
): DecorationShape[] {
  return fragments.map((fragment, index) => ({
    key: `${key}:outline:${index}`,
    path: rectanglePath({
      x: fragment.x - 3,
      y: fragment.y - 2,
      width: fragment.width + 6,
      height: fragment.height + 4,
    }),
    stroke,
    fill: "none",
    strokeWidth: 3,
    dashArray: "10 10",
    animated: true,
  }));
}

function spikySegment(x1: number, y1: number, x2: number, y2: number): string {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const distance = Math.hypot(dx, dy);
  const steps = Math.max(2, Math.floor(distance / 12));
  const perpendicularX = distance ? (-dy / distance) * 4 : 0;
  const perpendicularY = distance ? (dx / distance) * 4 : 0;
  const points = [`M ${x1} ${y1}`];
  for (let index = 1; index < steps; index += 1) {
    const ratio = index / steps;
    const direction = index % 2 === 1 ? 1 : -1;
    points.push(
      `L ${x1 + dx * ratio + perpendicularX * direction} ${y1 + dy * ratio + perpendicularY * direction}`,
    );
  }
  points.push(`L ${x2} ${y2}`);
  return points.join(" ");
}

export function spikyOutlineShapes(
  key: string,
  fragments: VisualFragment[],
  stroke: string,
): DecorationShape[] {
  return fragments.map((fragment, index) => {
    const left = fragment.x - 3;
    const top = fragment.y - 2;
    const right = fragment.x + fragment.width + 3;
    const bottom = fragment.y + fragment.height + 4;
    return {
      key: `${key}:spiky:${index}`,
      path: [
        spikySegment(left, top, right, top),
        spikySegment(right, top, right, bottom),
        spikySegment(right, bottom, left, bottom),
        spikySegment(left, bottom, left, top),
      ].join(" "),
      stroke,
      fill: "none",
      strokeWidth: 3,
    };
  });
}
