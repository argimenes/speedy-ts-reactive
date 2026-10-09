import * as T from "three";

/** Small, static material data, shared by the bronze surfaces in one view.
 * Long horizontal fibres modulate roughness and microrelief; never the glass. */
export function createBronzeGrain() {
  const width = 256,
    height = 256,
    data = new Uint8Array(width * height * 4);
  const noise = (x: number, y: number) => {
    const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
    return n - Math.floor(n);
  };
  for (let y = 0; y < height; y++) {
    const fibre = noise(0, y);
    for (let x = 0; x < width; x++) {
      const t = (x % 32) / 32,
        a = Math.floor(x / 32);
      const streak = noise(a, y) * (1 - t) + noise((a + 1) % 8, y) * t;
      const value = Math.round(
        146 + fibre * 60 + streak * 36 + noise(x, y) * 12,
      );
      data.set([value, value, value, 255], (y * width + x) * 4);
    }
  }
  const map = new T.DataTexture(data, width, height, T.RGBAFormat);
  map.wrapS = map.wrapT = T.RepeatWrapping;
  // Fine subpixel fibres at the shared world-sized UV scale.
  map.repeat.set(2, 5);
  map.magFilter = T.LinearFilter;
  map.minFilter = T.LinearMipmapLinearFilter;
  map.generateMipmaps = true;
  map.needsUpdate = true;
  return map;
}
