import * as T from "three";
import { STONE_TILE } from "../flint/material/stone-detail";

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
    bevelSegments: 2,
    steps: 1,
    bevelSize: Math.min(lip ? lip * 0.32 : 1.8, depth * 0.45),
    bevelThickness: depth * 0.32,
    curveSegments: 5,
  });
  const uv = geometry.getAttribute("uv");
  for (let i = 0; i < uv.count; i++)
    uv.setXY(i, uv.getX(i) / STONE_TILE, uv.getY(i) / STONE_TILE);
  return geometry;
}
