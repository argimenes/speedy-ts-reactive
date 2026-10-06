import * as T from 'three';

// Material coordinates are world units (CSS pixels at 1×), not a tile per mesh.
// The supplied kit guides pore size/density and finish, not baked illumination.
export const STONE_TILE = 768;
export const DETAIL_TILE = 128;
export type StoneFamily = 'limestone-fine' | 'limestone-weathered' | 'limestone-coarse' | 'marble-pale' | 'chalk-stone';
export const STONE_FINISHES: Record<StoneFamily, { color: number; roughness: number; bump: number; albedo: number }> = {
  'limestone-fine': { color: 0xe4dfd3, roughness: .92, bump: .45, albedo: .48 },
  'limestone-weathered': { color: 0xded7c8, roughness: .98, bump: .42, albedo: .5 },
  'limestone-coarse': { color: 0xdfd7c6, roughness: .97, bump: .42, albedo: .48 },
  'marble-pale': { color: 0xeee8dd, roughness: .67, bump: .12, albedo: .38 },
  'chalk-stone': { color: 0xe8e3d9, roughness: 1, bump: .48, albedo: .33 },
};

/** Separate linear height and roughness data, with no directional light baked in.
 * Pores are wrapped depressions; low-frequency mineral variation lives in albedo.
 * One shared tile per family, with deterministic UV variation per carved object. */
export function createStoneDetail() {
  const maps = new Map<StoneFamily, { height: T.DataTexture; roughness: T.DataTexture }>();
  function get(family: StoneFamily) {
    if (maps.has(family)) return maps.get(family)!;
    const size = 512, heights = new Float32Array(size * size);
    let seed = 8917 + Object.keys(STONE_FINISHES).indexOf(family) * 173;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    const porous = family === 'limestone-coarse' || family === 'chalk-stone', marble = family === 'marble-pale';
    for (let i = 0; i < heights.length; i++) heights[i] = .7 + (random() - .5) * (marble ? .018 : .13);
    const count = marble ? 280 : porous ? 3000 : family === 'limestone-weathered' ? 1800 : 1100;
    for (let n = 0; n < count; n++) {
      const x = random() * size, y = random() * size, radius = (porous ? 1.2 : .7) + random() ** 3 * (porous ? 7 : 4), depth = .12 + random() * .48;
      const stretch = .65 + random() * .7;
      for (let dy = -Math.ceil(radius * 2); dy <= radius * 2; dy++) for (let dx = -Math.ceil(radius * 2); dx <= radius * 2; dx++) {
        const r = (dx * dx + dy * dy / stretch) / (radius * radius);
        if (r > 3) continue;
        const i = ((Math.floor(y) + dy + size) % size) * size + (Math.floor(x) + dx + size) % size;
        heights[i] -= depth * Math.exp(-r * 1.6);
      }
    }
    const height = new Uint8Array(size * size * 4), roughness = new Uint8Array(height.length);
    for (let i = 0; i < heights.length; i++) {
      const h = Math.max(0, Math.min(1, heights[i]));
      const grain = random(), rough = marble ? .63 + h * .22 + grain * .07 : .77 + (1 - h) * .19 + grain * .04;
      height.set([h * 255, h * 255, h * 255, 255], i * 4);
      roughness.set([rough * 255, rough * 255, rough * 255, 255], i * 4);
    }
    const texture = (data: Uint8Array) => {
      const map = new T.DataTexture(data, size, size, T.RGBAFormat);
      map.colorSpace = T.NoColorSpace; map.wrapS = map.wrapT = T.RepeatWrapping;
      map.repeat.setScalar(STONE_TILE / DETAIL_TILE);
      map.magFilter = T.LinearFilter; map.minFilter = T.LinearMipmapLinearFilter; map.generateMipmaps = true; map.needsUpdate = true;
      return map;
    };
    const result = { height: texture(height), roughness: texture(roughness) }; maps.set(family, result); return result;
  }
  return { get, dispose() { for (const map of maps.values()) { map.height.dispose(); map.roughness.dispose(); } maps.clear(); } };
}
