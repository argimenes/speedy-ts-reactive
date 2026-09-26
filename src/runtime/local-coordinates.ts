/** Core DOM frame: positive uniform scale plus translation, in CSS pixels.
 * Client hit tests and portal anchors stay in viewport coordinates. Only local
 * drawing/geometry divides by scale. Scroll offsets are already local units.
 * A host supplies the cumulative scale; rotation/skew/perspective are unsupported.
 */
export interface LocalCoordinates { scale(): number }
export const identityCoordinates: LocalCoordinates = Object.freeze({ scale: () => 1 });

export function coordinateScale(value: number): number {
  if (!Number.isFinite(value) || value <= 0) throw new Error("A DOM coordinate frame requires a positive finite scale.");
  return value;
}

export function localFragment(
  rect: { left: number; top: number; width: number; height: number },
  origin: { left: number; top: number },
  scroll: { scrollLeft: number; scrollTop: number },
  scale = 1,
) {
  return {
    x: (rect.left - origin.left) / scale + scroll.scrollLeft,
    y: (rect.top - origin.top) / scale + scroll.scrollTop,
    width: rect.width / scale,
    height: rect.height / scale,
  };
}
