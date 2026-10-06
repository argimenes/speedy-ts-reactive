import limestoneAlbedo from './assets/limestone-albedo.png';
import marbleAlbedo from './assets/marble-albedo.png';

/** Cached albedo only: minerals and pores, without directional shading.
 * The kit guides spatial scales; its illustrative AO/height maps are not albedo.
 * Embedded SVG images rasterise once. No live per-node noise filters.
 */
export type TextureLayers = Readonly<{ macro: number; mineral: number; grain: number }>;
export const DEFAULT_TEXTURE_LAYERS: TextureLayers = Object.freeze({ macro: .65, mineral: .4, grain: .55 });
const encode = (body: string, size: number) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${body}</svg>`)}`;
export const STONE_MACRO = encode(`<filter id="cloud" x="0" y="0" width="1024" height="1024" filterUnits="userSpaceOnUse"><feTurbulence type="fractalNoise" baseFrequency=".007 .011" numOctaves="5" seed="23" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 .46 0 0 0 0 .41 0 0 0 0 .33 .75 .75 .75 0 -1"/></filter><path d="M0 0h1024v1024H0z" filter="url(#cloud)"/>`, 1024);
let seed = 83491;
const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const pores = Array.from({ length: 180 }, () => `<ellipse cx="${(random() * 256).toFixed(2)}" cy="${(random() * 256).toFixed(2)}" rx="${(.18 + random() * .9).toFixed(2)}" ry="${(.18 + random() * .65).toFixed(2)}" fill="#786c57" opacity="${(.12 + random() * .24).toFixed(2)}"/>`).join('');
export const STONE_GRAIN = encode(`<filter id="grain" x="0" y="0" width="256" height="256" filterUnits="userSpaceOnUse"><feTurbulence type="fractalNoise" baseFrequency=".45" numOctaves="3" seed="7" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 .48 0 0 0 0 .43 0 0 0 0 .36 .5 .5 .5 0 -.55"/></filter><path d="M0 0h256v256H0z" filter="url(#grain)"/>${pores}`, 256);
const mineralPaths = [
  'M-8 170c67-11 83 28 129 7s25-37 82-24 41-15 90-12 29-21 80-9 61-7 97-29 54 17 90-8 74-3 88-14 47-16 140-5',
  'M223 157c19 33 1 59 24 80s-17 21-2 57 37 6 39 48',
  'M488 108c-29-16-28-45-51-51s-35-34-27-66',
  'M-9 680c70-41 101-8 128-48s36-16 73-31 46-41 68-33 41-37 99-32 38-39 93-31 60-47 102-34 37-36 76-47 42-48 72-41 18-42 80-38',
];
const veins = (paths: string[], width: number, opacity: number) => paths.map(d => `<path d="${d}" fill="none" stroke="#9a886b" stroke-width="${width}" opacity="${opacity}" stroke-linecap="round"/>`).join('');
export const STONE_MINERAL = encode(`<filter id="deposits" x="0" y="0" width="768" height="768" filterUnits="userSpaceOnUse"><feTurbulence type="fractalNoise" baseFrequency=".032" numOctaves="3" seed="19" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 .55 0 0 0 0 .48 0 0 0 0 .35 1 1 1 0 -1.2"/></filter><path d="M0 0h768v768H0z" filter="url(#deposits)"/>${veins(mineralPaths, 2.7, .1)}${veins(mineralPaths, .6, .38)}`, 768);
const marblePaths = [
  'M-14 26c54 22 51 48 91 60s11 38 51 58 28 33 64 46 21 33 63 61 27 49 70 70',
  'M63 68c20-21 42-7 56-24s53-14 72-49',
  'M135 149c-18 24 5 48-15 68s-6 46-26 61',
  'M-15 223c32-14 34-40 58-32s23-26 57-10 18-15 48-9',
];
export const MARBLE_VEINS = encode(veins(marblePaths, 4.2, .11) + veins(marblePaths, .65, .45), 320);
const NS = 'http://www.w3.org/2000/svg';
function element(tag: string, attrs: Record<string, string | number>) {
  const el = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value));
  return el;
}
export function installStoneTextures(defs: SVGDefsElement, prefix: string) {
  const patterns: Element[] = [], groups: { element: Element; layer: keyof TextureLayers; gain: number }[] = [];
  for (const [name, href, size] of [['macro', STONE_MACRO, 256], ['grain', STONE_GRAIN, 128], ['mineral', STONE_MINERAL, 512], ['marble', MARBLE_VEINS, 256], ['albedo-limestone', limestoneAlbedo, 256], ['albedo-marble', marbleAlbedo, 256]] as const) {
    const tile = element('pattern', { id: `${prefix}-tile-${name}`, patternUnits: 'userSpaceOnUse', width: size, height: size });
    tile.append(element('image', { href, width: size, height: size })); defs.append(tile); patterns.push(tile);
  }
  for (const finish of ['limestone', 'marble']) {
    const pattern = element('pattern', { id: `${prefix}-texture-${finish}`, patternUnits: 'userSpaceOnUse', width: 512, height: 512 });
    const albedo = element('g', { 'data-albedo': finish });
    albedo.append(element('rect', { width: 512, height: 512, fill: `url(#${prefix}-tile-albedo-${finish})` }));
    pattern.append(albedo); groups.push({ element: albedo, layer: 'grain', gain: 1.15 });
    for (const [layer, tile, gain] of [
      ['macro', 'macro', finish === 'marble' ? .4 : 1.3],
      ['mineral', finish === 'marble' ? 'marble' : 'mineral', finish === 'marble' ? 1 : 1.3],
      ['grain', 'grain', finish === 'marble' ? .35 : 1.2],
    ] as const) {
      const group = element('g', {});
      group.append(element('rect', { width: 512, height: 512, fill: `url(#${prefix}-tile-${tile})` }));
      pattern.append(group); groups.push({ element: group, layer, gain });
    }
    patterns.push(pattern); defs.append(pattern);
  }
  return {
    setLayers(layers: TextureLayers) { for (const group of groups) group.element.setAttribute('opacity', String(Math.max(0, Math.min(1, layers[group.layer])) * group.gain)); },
    dispose() { for (const pattern of patterns) pattern.remove(); },
  };
}
