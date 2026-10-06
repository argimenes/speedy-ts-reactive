import { ELEVATIONS, LIMESTONE, materialForFinish, resolveMaterialResponse, type Elevation, type StoneFinish } from './material-response';
import type { Lighting } from './lighting';
import { DEFAULT_TEXTURE_LAYERS, installStoneTextures, type TextureLayers } from './material-textures';

const NS = 'http://www.w3.org/2000/svg';
export function svgElement(tag: string, attributes: Record<string, string | number> = {}) {
  const element = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  return element;
}
export type ReliefForm = 'mask' | 'disc' | 'pyramids' | 'waves' | 'leaf' | 'spiral' | 'star' | 'beads' | 'moon' | 'diamond' | 'stone';
const body = 'fill="url(#PREFIX-body)" stroke="#9d927b" stroke-width=".65"';
/** Hand-authored vector artwork; no baked lighting. All IDs are local to one graph instance. */
const forms: Record<ReliefForm, string> = {
  mask: `<path ${body} d="M49 4C20 2 13 23 17 50c3 25 17 44 33 47 17-7 30-30 32-52C85 17 69 4 49 4Z"/><path fill="var(--flint-facet-left)" opacity=".55" d="M49 5C19 5 14 25 18 51c3 25 18 41 31 46Z"/><path fill="var(--flint-facet-top)" d="m49 22-4 38 13-1-5-37Z"/><path fill="var(--flint-facet-left)" d="m45 60 4-38 1 41-5-3Z"/><path d="m40 70 16 0-7 4Z" fill="#84775e"/><path d="M31 30h8m22 0h8" stroke="#a59a84" stroke-width="1.2"/><path d="m46 83 8-1" stroke="#fdf9ee" stroke-width="1"/>`,
  disc: `<circle ${body} cx="50" cy="50" r="32"/><path d="M50 18v64M18 50h64M27 27l46 46m0-46L27 73M38 20l24 60M20 38l60 24m-60 0 60-24m-42 42 24-60" stroke="#9c917b" stroke-width=".7"/><circle cx="50" cy="50" r="4" fill="var(--flint-facet-top)"/>`,
  pyramids: `<path d="m47 10-24 49h49Z" fill="var(--flint-facet-top)" stroke="#9d927b"/><path d="m47 10 0 49h25Z" fill="var(--flint-facet-left)"/><path d="m25 34-23 49h47Z" fill="var(--flint-facet-right)" stroke="#9d927b"/><path d="m25 34 0 49h24Z" fill="var(--flint-facet-left)"/><path d="m74 31-23 52h47Z" fill="var(--flint-facet-top)" stroke="#9d927b"/><path d="m74 31 0 52h24Z" fill="var(--flint-facet-left)"/><path d="m3 83 22-47 0 47m27 0 22-50" fill="none" stroke="#fffbec"/>`,
  waves: `<g fill="none" stroke-linecap="round"><path d="M8 39c9-18 17 18 28 0s19 18 29 0 19 18 28 0M8 64c9-18 17 18 28 0s19 18 29 0 19 18 28 0" stroke="var(--flint-facet-left)" stroke-width="8"/><path d="M8 36c9-18 17 18 28 0s19 18 29 0 19 18 28 0M8 61c9-18 17 18 28 0s19 18 29 0 19 18 28 0" stroke="var(--flint-facet-top)" stroke-width="5"/></g>`,
  leaf: `<path ${body} d="M50 5C7 36 15 69 50 91c35-22 43-55 0-86Z"/><path d="M50 22v76M50 49 35 36m15 27L31 48m19 1 15-13M50 63l19-15m-19 30 13-12m-13 12-13-12" stroke="#7f735c" stroke-width="1.8" fill="none"/><path d="M51 22v73" stroke="#fffaec" stroke-width="1"/>`,
  spiral: `<path d="M49 91C7 82 11 24 52 17c43-7 48 57 13 58-27 1-31-37-9-38 17-1 18 20 4 21" fill="none" stroke="var(--flint-facet-left)" stroke-width="10" stroke-linecap="round"/><path d="M49 87C9 78 14 21 53 16c40-6 45 55 12 55-25 1-28-34-8-35 14-1 15 18 3 20" fill="none" stroke="url(#PREFIX-body)" stroke-width="7" stroke-linecap="round"/>`,
  star: `<g stroke-linecap="round"><path d="M50 12v78M12 50h78M22 22l56 56m0-56L22 78" stroke="var(--flint-facet-left)" stroke-width="9"/><path d="M49 10v78M11 48h78M21 20l56 56m0-56L21 76" stroke="url(#PREFIX-body)" stroke-width="6"/></g>`,
  beads: `<circle ${body} cx="50" cy="28" r="9"/><circle ${body} cx="31" cy="49" r="9"/><circle ${body} cx="70" cy="49" r="9"/><circle ${body} cx="50" cy="70" r="9"/>`,
  moon: `<path ${body} d="M63 8C-2 28 19 94 66 88c19-3 28-13 30-24-44 20-65-18-33-56Z"/><path d="M63 8C28 32 39 79 81 75" stroke="#fffaeb" stroke-width="2" fill="none"/>`,
  diamond: `<path d="m50 5 38 45-38 45L12 50Z" fill="var(--flint-facet-left)" stroke="#998c74"/><path d="m50 5 0 24L30 50H12Z" fill="var(--flint-facet-top)"/><path d="m50 5 38 45H70L50 29Z" fill="var(--flint-facet-right)"/><path d="m50 95 0-24 20-21h18Z" fill="var(--flint-facet-front)"/><path d="m50 29 20 21-20 21-20-21Z" fill="var(--flint-ivory)"/><path d="m50 5-38 45 38 45" stroke="#fff9e7" fill="none"/>`,
  stone: `<circle ${body} cx="50" cy="50" r="28"/><path d="m36 32 8 4m12 8 4 8m-30 8 10 1m12 8 9-3" stroke="#9f957f" stroke-width=".6"/>`,
};

export function installReliefDefinitions(defs: SVGDefsElement, prefix: string, lighting: Lighting) {
  let detail: 'full' | 'simple' | 'flat' = 'full';
  let material = LIMESTONE;
  let finish: StoneFinish = 'limestone';
  let textureState = '';
  const textures: Element[] = [];
  const stoneTextures = installStoneTextures(defs, prefix);
  stoneTextures.setLayers(DEFAULT_TEXTURE_LAYERS);
  const owned: Element[] = [];
  const append = <T extends Element>(el: T): T => { defs.append(el); owned.push(el); return el; };
  const gradient = append(svgElement('linearGradient', { id: `${prefix}-body`, x1: '90%', y1: '0%', x2: '10%', y2: '100%' }));
  const bodyStops = [svgElement('stop', { offset: 0 }), svgElement('stop', { offset: .5 }), svgElement('stop', { offset: 1 })];
  gradient.append(...bodyStops);
  const facets = new Map<string, Element[]>();
  for (const name of ['left', 'right', 'top', 'front']) {
    const facet = append(svgElement('linearGradient', { id: `${prefix}-facet-${name}` }));
    const stops = [svgElement('stop', { offset: 0 }), svgElement('stop', { offset: 1 })]; facet.append(...stops); facets.set(name, stops);
  }
  const clip = append(svgElement('clipPath', { id: `${prefix}-clip` })); clip.append(svgElement('rect', { width: 100, height: 100, rx: 4 }));
  const filters = new Map<Elevation, Element>();
  for (const elevation of Object.keys(ELEVATIONS) as Elevation[]) {
    const filter = append(svgElement('filter', { id: `${prefix}-${elevation}`, x: '-100%', y: '-100%', width: '300%', height: '300%', 'color-interpolation-filters': 'sRGB' }));
    const shadow = svgElement('feDropShadow', { 'flood-color': '#504735' }); filter.append(shadow); filters.set(elevation, shadow);
  }
  for (const [name, markup] of Object.entries(forms)) {
    const symbol = append(svgElement('symbol', { id: `${prefix}-${name}`, viewBox: '0 0 100 100' }));
    let drawing = markup.replaceAll('url(#PREFIX-body)', 'var(--flint-body-fill, url(#PREFIX-body))').replaceAll('PREFIX', prefix);
    for (const name of facets.keys()) drawing = drawing.replaceAll(`var(--flint-facet-${name})`, `url(#${prefix}-facet-${name})`);
    symbol.innerHTML = drawing;
    // A static alpha silhouette keeps neutral texture inside both filled and stroked forms.
    const mask = append(svgElement('mask', { id: `${prefix}-mask-${name}`, maskUnits: 'userSpaceOnUse', x: 0, y: 0, width: 100, height: 100, 'mask-type': 'alpha' }));
    const silhouette = svgElement('g'); silhouette.innerHTML = drawing;
    for (const el of silhouette.querySelectorAll('[fill]')) if (el.getAttribute('fill') !== 'none') el.setAttribute('fill', 'white');
    for (const el of silhouette.querySelectorAll('[stroke]')) if (el.getAttribute('stroke') !== 'none') el.setAttribute('stroke', 'white');
    mask.append(silhouette);
    for (const finish of ['limestone', 'marble']) append(svgElement('pattern', {
      id: `${prefix}-texture-${finish}-${name}`, href: `#${prefix}-texture-${finish}`,
      patternTransform: `translate(${textures.length * 19},${textures.length * 31}) rotate(${textures.length * 37})`,
    }));
    // Albedo multiplies the already illuminated body rather than hiding its
    // directional gradient beneath an opaque photographic fill.
    const texture = svgElement('rect', { width: 100, height: 100, mask: `url(#${prefix}-mask-${name})`, class: 'flint-stone-texture', opacity: .85, style: 'mix-blend-mode: multiply', 'pointer-events': 'none' });
    textures.push(texture); symbol.append(texture);
  }
  const update = (force = false) => {
    // Explicit attributes also reach SVG <use> instance trees, where ancestor CSS
    // selectors are not a reliable way to style cloned symbol descendants.
    const nextTextureState = `${finish}/${detail}/${lighting.effects.reducedEffects}`;
    if (textureState !== nextTextureState) {
      textureState = nextTextureState;
      for (const [i, texture] of textures.entries()) {
        texture.setAttribute('fill', finish === 'untextured' ? 'none' : `url(#${prefix}-texture-${finish}-${Object.keys(forms)[i]})`);
        texture.setAttribute('display', detail === 'full' && !lighting.effects.reducedEffects && finish !== 'untextured' ? 'inline' : 'none');
      }
    }
    if (detail === 'flat' && !force) return;
    const response = resolveMaterialResponse({ material, elevation: 'relief', geometry: { width: 100, height: 100 }, light: lighting.light, effects: lighting.effects });
    for (const [name, stops] of facets) for (const stop of stops) stop.setAttribute('stop-color', detail === 'flat' ? '#e5dfd2' : response.facets[name as keyof typeof response.facets]);
    for (const [i, tone] of Object.values(response.body).entries()) bodyStops[i].setAttribute('stop-color', detail === 'flat' ? '#e5dfd2' : tone);
    if (detail === 'flat') return;
    const a = lighting.light.azimuth * Math.PI / 180;
    gradient.setAttribute('x1', `${50 + Math.cos(a) * 50}%`); gradient.setAttribute('y1', `${50 + Math.sin(a) * 50}%`);
    gradient.setAttribute('x2', `${50 - Math.cos(a) * 50}%`); gradient.setAttribute('y2', `${50 - Math.sin(a) * 50}%`);
    for (const [elevation, shadow] of detail === 'full' ? filters : []) {
      const r = resolveMaterialResponse({ material, elevation, geometry: { width: 100, height: 100 }, light: lighting.light, effects: lighting.effects });
      shadow.setAttribute('dx', String(r.shadow.x)); shadow.setAttribute('dy', String(r.shadow.y));
      shadow.setAttribute('stdDeviation', String(r.shadow.blur / 2)); shadow.setAttribute('flood-opacity', String(r.shadow.opacity));
    }
  };
  const stop = lighting.subscribe(() => update());
  return { setDetail(value: typeof detail) { detail = value; update(true); }, setFinish(value: StoneFinish) { finish = value; material = materialForFinish(finish); update(true); }, setTextureLayers(layers: TextureLayers) { stoneTextures.setLayers(layers); }, dispose() { stop(); stoneTextures.dispose(); for (const el of owned) el.remove(); } };
}
