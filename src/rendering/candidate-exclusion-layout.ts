import type { VisualFragment } from "./decorations";

/** Last line only; coordinates stay relative to the existing SVG/text surface. */
export function exclusionPosition(fragments: VisualFragment[], origin: { left: number; top: number; width: number }, viewport: { width: number; height: number }) {
  const last = fragments.at(-1);
  if (!last || last.y + origin.top < 0 || last.y + origin.top >= viewport.height || last.x + origin.left >= viewport.width || last.x + last.width + origin.left < 0) return undefined;
  const minX = Math.max(0,4 - origin.left), maxX = Math.min(origin.width - 20,viewport.width - origin.left - 24);
  return {
    x: Math.max(minX,Math.min(last.x + last.width + 3,maxX)),
    y: Math.max(4 - origin.top,Math.min(last.y - 12,viewport.height - origin.top - 24)),
  };
}
