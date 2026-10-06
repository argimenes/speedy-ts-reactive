/** Neutral surface variation, separate from directional shading. Embedded SVG images
 * rasterise a reusable grain tile; no live turbulence filter is attached to a node.
 * Textures stay within the existing SVG/material adapter, including a future Probe.
 */
const grain = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><filter id="grain"><feTurbulence type="fractalNoise" baseFrequency=".16" numOctaves="3" seed="7" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter><path d="M0 0h160v160H0z" filter="url(#grain)" opacity=".42"/></svg>`;
export const STONE_GRAIN = `data:image/svg+xml,${encodeURIComponent(grain)}`;
const NS = 'http://www.w3.org/2000/svg';
function element(tag: string, attrs: Record<string, string | number>) {
  const el = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value));
  return el;
}
export function installStoneTextures(defs: SVGDefsElement, prefix: string) {
  const limestone = element('pattern', { id: `${prefix}-texture-limestone`, patternUnits: 'userSpaceOnUse', width: 100, height: 100 });
  limestone.append(element('image', { href: STONE_GRAIN, width: 100, height: 100 }));
  // Quiet pores, with no baked light direction. Their illumination comes from the relief underneath.
  for (const [cx, cy, r] of [[12, 21, .55], [43, 17, .45], [68, 42, .6], [31, 62, .35], [77, 78, .5], [18, 86, .45], [50, 47, .4], [92, 17, .35]]) {
    limestone.append(element('circle', { cx, cy, r, fill: '#786e59', opacity: .3 }));
  }
  const marble = element('pattern', { id: `${prefix}-texture-marble`, patternUnits: 'userSpaceOnUse', width: 150, height: 150 });
  marble.append(element('image', { href: STONE_GRAIN, width: 150, height: 150, opacity: .38 }));
  const veins = [
    'M-12 8C20 30 23 13 41 31s-7 17 21 23 13 8 37 22 24 9 63 39',
    'M29-12c10 24 8 31 27 45s8 33 31 35 17 26 31 44 17 28 23 52',
    'M-10 106c33-8 23-22 48-15s23-4 44 7 17 13 47 17 25 16 37 23',
  ];
  for (const d of veins) {
    marble.append(element('path', { d, fill: 'none', stroke: '#b1a58d', 'stroke-width': 2.2, opacity: .1 }));
    marble.append(element('path', { d, fill: 'none', stroke: '#958772', 'stroke-width': .45, opacity: .32 }));
  }
  defs.append(limestone, marble);
  return () => { limestone.remove(); marble.remove(); };
}
