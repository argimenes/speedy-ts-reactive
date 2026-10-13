/** Local canvas coordinates only. No DOM control rectangles participate in layout. */
export interface ChromeRect { x: number; y: number; width: number; height: number }
export function chromeLayout(width: number, count: number) {
  const padding = 10, gap = 8, titleHeight = 48, controlHeight = 36;
  const usable = Math.max(1, width - padding * 2);
  const columns = Math.max(1, Math.min(count || 1, Math.floor((usable + gap) / 132)));
  const cellWidth = (usable - gap * (columns - 1)) / columns;
  const controls: ChromeRect[] = Array.from({ length: count }, (_, index) => ({
    x: padding + (index % columns) * (cellWidth + gap),
    y: titleHeight + Math.floor(index / columns) * (controlHeight + gap),
    width: cellWidth, height: controlHeight,
  }));
  return { width: Math.max(1, width), height: titleHeight + Math.ceil(count / columns) * (controlHeight + gap) + padding, controls };
}
export function chromeHit(rects: readonly ChromeRect[], x: number, y: number) {
  return rects.findIndex(r => x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height);
}
