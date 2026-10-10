/** Adapted from the user-supplied PhosphorScreenHousing.ts.
 * Open-centre contour loft, in Flint's x-right/y-up/z-forward coordinates.
 * Materials belong to the existing scene; only geometry is owned here. */
import * as T from "three";
import { STONE_TILE } from "../flint/material/stone-detail";
import { GLASS_DEPTH } from "./geometry";
import { screenHousingOutset } from "./screen-housing-metrics";

type Ring = { inset: number; z: number; radius: number };

function outline(width: number, height: number, radius: number, segments: number) {
  const w = width / 2, h = height / 2;
  const r = Math.min(Math.max(radius, 0.0001), w, h);
  const corners = [
    [w - r, h - r, 0], [w - r, -h + r, -Math.PI / 2],
    [-w + r, -h + r, -Math.PI], [-w + r, h - r, -3 * Math.PI / 2],
  ];
  const points: T.Vector2[] = [];
  for (const [x, y, start] of corners)
    for (let i = 0; i <= segments; i++) {
      const angle = start + Math.PI / 2 - Math.PI / 2 * i / segments;
      points.push(new T.Vector2(x + r * Math.cos(angle), y + r * Math.sin(angle)));
    }
  return points;
}

function loft(width: number, height: number, rings: Ring[], segments = 18) {
  const vertices: number[] = [], uv: number[] = [], indices: number[] = [];
  const count = 4 * (segments + 1);
  for (const ring of rings)
    for (const point of outline(width - 2 * ring.inset, height - 2 * ring.inset, ring.radius, segments)) {
      vertices.push(point.x, point.y, ring.z);
      // The sample's perimeter UVs stretch and turn the brush at each corner.
      // Use the same physical grain scale/direction as Phosphor's other metal.
      uv.push(point.x / STONE_TILE, point.y / STONE_TILE);
    }
  for (let j = 0; j < rings.length - 1; j++)
    for (let i = 0; i < count; i++) {
      const n = (i + 1) % count;
      const a = j * count + i, b = j * count + n;
      const c = (j + 1) * count + i, d = (j + 1) * count + n;
      // Clockwise contours need this winding for outward/front-facing normals.
      indices.push(a, c, b, b, c, d);
    }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute("position", new T.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  // Area-weighted triangle normals let the long straight sides overwhelm the
  // small corner faces. Profile/perimeter tangents keep the roll smooth there.
  const normals: number[] = [];
  const at = (ring: number, point: number) => {
    const index = 3 * (ring * count + (point + count) % count);
    return new T.Vector3(vertices[index], vertices[index + 1], vertices[index + 2]);
  };
  for (let j = 0; j < rings.length; j++)
    for (let i = 0; i < count; i++) {
      const p = at(j, i);
      const tangent = p.clone().sub(at(j, i - 1)).normalize()
        .add(at(j, i + 1).sub(p).normalize()).normalize();
      const along = j === 0 ? at(1, i).sub(p).normalize()
        : j === rings.length - 1 ? p.clone().sub(at(j - 1, i)).normalize()
        : p.clone().sub(at(j - 1, i)).normalize()
          .add(at(j + 1, i).sub(p).normalize()).normalize();
      const normal = along.cross(tangent).normalize();
      normals.push(normal.x, normal.y, normal.z);
    }
  geometry.setAttribute("normal", new T.Float32BufferAttribute(normals, 3));
  geometry.computeBoundingBox();
  return geometry;
}

export function createPhosphorScreenHousing(materials: {
  shoulder: T.Material; channel: T.Material; lip: T.Material;
}) {
  const group = new T.Group();
  group.name = "PhosphorScreenHousing";
  const parts = ([
    ["Sculpted metal shoulder", materials.shoulder],
    ["Deep shadow channel", materials.channel],
    ["Polished bronze inner lip", materials.lip],
  ] as const).map(([name, material]) => {
    const mesh = new T.Mesh(new T.BufferGeometry(), material);
    mesh.name = name;
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  });
  let width = 0, height = 0, depth = 0;
  return {
    group,
    get depth() { return depth; },
    setSize(w: number, h: number) {
      // Zoom uses the group's scale. Rebuild only for a changed base aperture
      // (including DOM border rounding), never for light changes or scrolling.
      if (Math.abs(width - w) < 0.1 && Math.abs(height - h) < 0.1) return;
      width = w; height = h;
      const unit = Math.min(w, h), t = unit * 0.01;
      depth = unit * 0.065;
      const outsideW = w + 2 * screenHousingOutset(w, h);
      const outsideH = h + 2 * screenHousingOutset(w, h);
      const back = -depth * 0.6 - GLASS_DEPTH;
      const profiles: Ring[][] = [
        [
          { inset: 0, z: back, radius: 8.2 * t },
          { inset: 0, z: depth * 0.30, radius: 8.2 * t },
          { inset: 0.5 * t, z: depth * 0.77, radius: 7.7 * t },
          { inset: 1.2 * t, z: depth, radius: 7.0 * t },
          { inset: 2.2 * t, z: depth * 0.97, radius: 6.0 * t },
          { inset: 3.0 * t, z: depth * 0.79, radius: 5.2 * t },
          { inset: 4.2 * t, z: depth * 0.38, radius: 4.4 * t },
          { inset: 5.3 * t, z: depth * 0.05, radius: 3.6 * t },
          { inset: 6.0 * t, z: -depth * 0.15, radius: 2.8 * t },
        ],
        [
          { inset: 6.0 * t, z: -depth * 0.15, radius: 2.8 * t },
          { inset: 6.7 * t, z: -depth * 0.43, radius: 2.3 * t },
          { inset: 7.2 * t, z: -depth * 0.46, radius: 2.0 * t },
        ],
        [
          { inset: 7.2 * t, z: -depth * 0.46, radius: 2.0 * t },
          { inset: 7.55 * t, z: -depth * 0.36, radius: 1.8 * t },
          { inset: 7.95 * t, z: -depth * 0.48, radius: 1.6 * t },
          { inset: 8.2 * t, z: -depth * 0.60, radius: 1.5 * t },
          // Inner wall and underside close the shell for coherent shadowing.
          { inset: 8.2 * t, z: back, radius: 1.5 * t },
          { inset: 0, z: back, radius: 8.2 * t },
        ],
      ];
      parts.forEach((mesh, i) => {
        mesh.geometry.dispose();
        mesh.geometry = loft(outsideW, outsideH, profiles[i]);
      });
      group.userData.aperture = { width: w, height: h, z: -depth * 0.6 };
    },
    dispose() { parts.forEach(mesh => mesh.geometry.dispose()); },
  };
}
