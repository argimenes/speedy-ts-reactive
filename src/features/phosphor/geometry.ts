import * as T from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { STONE_TILE } from "../flint/material/stone-detail";

// Visual construction units, not CSS millimetres: a 25 mm slab expressed as
// 25 scene units at 100% zoom, within the existing pixel-aligned camera.
export const GLASS_DEPTH = 25;
export const PANEL_BASE = 2;
export const PANEL_FACE = PANEL_BASE + GLASS_DEPTH;

/** Closed, rounded solid. Local z=0 is its back, z=depth its front.
 * Two draw groups keep the dark face separate from the polished edge. */
export function slab(w: number, h: number, depth: number, radius: number) {
  const geometry = new RoundedBoxGeometry(w, h, depth, 3, radius);
  geometry.translate(0, 0, depth / 2);
  const position = geometry.getAttribute("position"),
    normal = geometry.getAttribute("normal"),
    uv = geometry.getAttribute("uv");
  const indices: number[][] = [[], []];
  for (let i = 0; i < position.count; i += 3) {
    const face = [i, i + 1, i + 2].every(
      (j) => Math.abs(normal.getZ(j)) > 0.999,
    );
    indices[face ? 0 : 1].push(i, i + 1, i + 2);
  }
  // Project each face at the same physical grain scale, without stretching
  // the directional brush across differently sized keycaps and housings.
  for (let i = 0; i < uv.count; i++) {
    const x =
        Math.abs(normal.getX(i)) > 0.9 ? position.getZ(i) : position.getX(i),
      y = Math.abs(normal.getY(i)) > 0.9 ? position.getZ(i) : position.getY(i);
    uv.setXY(i, x / STONE_TILE, y / STONE_TILE);
  }
  geometry.clearGroups();
  geometry.setIndex([...indices[0], ...indices[1]]);
  geometry.addGroup(0, indices[0].length, 0);
  geometry.addGroup(indices[0].length, indices[1].length, 1);
  return geometry;
}

function contour(w: number, h: number, radius: number) {
  const r = Math.min(radius, w / 2, h / 2),
    p = new T.Shape(),
    x = -w / 2,
    y = -h / 2;
  p.moveTo(x + r, y);
  p.lineTo(x + w - r, y);
  p.quadraticCurveTo(x + w, y, x + w, y + r);
  p.lineTo(x + w, y + h - r);
  p.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  p.lineTo(x + r, y + h);
  p.quadraticCurveTo(x, y + h, x, y + h - r);
  p.lineTo(x, y + r);
  p.quadraticCurveTo(x, y, x + r, y);
  return p;
}

/** Bevels face the actual scene lights. Units and texture grain match Flint. */
export function relief(
  w: number,
  h: number,
  depth: number,
  radius: number,
  lip = 0,
) {
  const shape = contour(w, h, radius);
  if (lip)
    shape.holes.push(
      contour(w - lip * 2, h - lip * 2, Math.max(0.5, radius - lip)),
    );
  const geometry = new T.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelSegments: 4,
    steps: 1,
    bevelSize: Math.min(lip ? lip * 0.36 : 2.4, depth * 0.45),
    bevelThickness: Math.min(2.5, depth * 0.32),
    curveSegments: 5,
  });
  const uv = geometry.getAttribute("uv");
  for (let i = 0; i < uv.count; i++)
    uv.setXY(i, uv.getX(i) / STONE_TILE, uv.getY(i) / STONE_TILE);
  return geometry;
}
