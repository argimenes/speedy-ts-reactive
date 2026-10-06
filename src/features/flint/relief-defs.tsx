import { ELEVATIONS, LIMESTONE, facetTone, lightVector, resolveMaterialResponse, type Elevation, type Material, type StoneFinish, type Vector } from './material-response';
import type { Lighting } from './lighting';
import { DEFAULT_TEXTURE_LAYERS, installStoneTextures, type TextureLayers } from './material-textures';
import { FORM_NORMALS, RELIEF_ARTWORK, materialForForm, type ReliefForm } from './relief-vocabulary';
import { installReliefShadow } from './relief-shadow';
export type { ReliefForm } from './relief-vocabulary';

const NS = 'http://www.w3.org/2000/svg';
export function svgElement(tag: string, attributes: Record<string, string | number> = {}) {
  const element = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  return element;
}
/** Attribute equality avoids invalidating shared paint servers when their value
 * is unchanged. No inherited dynamic styles cross into <use> instance trees.
 */
function attribute(element: Element, name: string, value: string) { if (element.getAttribute(name) !== value) element.setAttribute(name, value); }
export function installReliefDefinitions(defs: SVGDefsElement, prefix: string, lighting: Lighting) {
  let detail: 'full' | 'simple' | 'flat' = 'full', finish: StoneFinish = 'limestone';
  let textureState = '';
  const stoneTextures = installStoneTextures(defs, prefix); stoneTextures.setLayers(DEFAULT_TEXTURE_LAYERS);
  const owned: Element[] = [];
  const append = <T extends Element>(el: T): T => { defs.append(el); owned.push(el); return el; };
  const paint = (id: string, offsets: number[]) => {
    const gradient = append(svgElement('linearGradient', { id }));
    const stops = offsets.map(offset => svgElement('stop', { offset })); gradient.append(...stops);
    return { gradient, stops };
  };
  // Cache by depicted material/normal, not by node. Hundreds of repeated forms
  // consume the same finite vocabulary and the same definition updates.
  const profiles = new Map<string, { form?: ReliefForm; body: ReturnType<typeof paint>; bevel: ReturnType<typeof paint> }>();
  const profile = (form?: ReliefForm) => {
    const key = form ? materialForForm(form, 'limestone').name : 'surface';
    if (!profiles.has(key)) profiles.set(key, { form, body: paint(form ? `${prefix}-body-${key}` : `${prefix}-body`, [0, .5, 1]), bevel: paint(`${prefix}-bevel-${key}`, [0, .5, 1]) });
    return profiles.get(key)!;
  };
  profile();
  const facets = new Map<string, { form: ReliefForm; normal: Vector; stop: Element; id: string }>();
  const face = (form: ReliefForm, name: string) => {
    const normal = FORM_NORMALS[form][name];
    if (!normal) throw new Error(`Unknown sculptural face ${form}/${name}`);
    const key = `${materialForForm(form, 'limestone').name}-${normal.x}-${normal.y}-${normal.z}`;
    if (!facets.has(key)) {
      const id = `${prefix}-face-${facets.size}`, solid = paint(id, [0]);
      solid.gradient.setAttribute('data-normal', `${normal.x},${normal.y},${normal.z}`);
      facets.set(key, { form, normal, stop: solid.stops[0], id });
    }
    return `url(#${facets.get(key)!.id})`;
  };
  const clip = append(svgElement('clipPath', { id: `${prefix}-clip` })); clip.append(svgElement('rect', { width: 100, height: 100, rx: 4 }));
  const filters = new Map<Elevation, ReturnType<typeof installReliefShadow>>();
  for (const elevation of Object.keys(ELEVATIONS) as Elevation[]) {
    const filter = append(svgElement('filter', { id: `${prefix}-${elevation}`, x: '-100%', y: '-100%', width: '300%', height: '300%', 'color-interpolation-filters': 'sRGB' }));
    const contact = append(svgElement('filter', { id: `${prefix}-${elevation}-contact`, x: '-20%', y: '-20%', width: '140%', height: '140%', 'color-interpolation-filters': 'sRGB' }));
    filters.set(elevation, installReliefShadow(filter, contact));
  }
  const forms: { name: ReliefForm; texture: Element; ao: Element; bevel: Element }[] = [];
  for (const [name, artwork] of Object.entries(RELIEF_ARTWORK) as [ReliefForm, typeof RELIEF_ARTWORK[ReliefForm]][]) {
    const symbol = append(svgElement('symbol', { id: `${prefix}-${name}`, viewBox: '0 0 100 100' }));
    const p = profile(name);
    const drawing = artwork.body.replaceAll('BODY', `url(#${p.body.gradient.id})`).replace(/FACE-([A-Za-z]+)/g, (_, faceName: string) => face(name, faceName));
    const body = svgElement('g', { 'data-form-body': name }); body.innerHTML = drawing; symbol.append(body);
    const ao = svgElement('g', { 'data-relief-ao': name }); ao.innerHTML = artwork.ao; symbol.append(ao);
    const mask = append(svgElement('mask', { id: `${prefix}-mask-${name}`, maskUnits: 'userSpaceOnUse', x: 0, y: 0, width: 100, height: 100, 'mask-type': 'alpha' }));
    const silhouette = svgElement('g'); silhouette.innerHTML = drawing;
    for (const el of silhouette.querySelectorAll('[fill]')) if (el.getAttribute('fill') !== 'none') el.setAttribute('fill', 'white');
    for (const el of silhouette.querySelectorAll('[stroke]')) if (el.getAttribute('stroke') !== 'none') el.setAttribute('stroke', 'white');
    mask.append(silhouette);
    const contact = append(svgElement('symbol', { id: `${prefix}-contact-${name}`, viewBox: '0 0 100 100' }));
    const footprint = silhouette.cloneNode(true) as Element;
    for (const el of footprint.querySelectorAll('[fill], [stroke]')) {
      if (el.getAttribute('fill') && el.getAttribute('fill') !== 'none') el.setAttribute('fill', '#443e33');
      if (el.getAttribute('stroke') && el.getAttribute('stroke') !== 'none') el.setAttribute('stroke', '#443e33');
      el.removeAttribute('opacity');
    }
    contact.append(footprint);
    for (const variant of ['limestone', 'marble']) append(svgElement('pattern', {
      id: `${prefix}-texture-${variant}-${name}`, href: `#${prefix}-texture-${variant}`,
      patternTransform: `translate(${forms.length * 19},${forms.length * 31}) rotate(${forms.length * 37})`,
    }));
    const texture = svgElement('rect', { width: 100, height: 100, mask: `url(#${prefix}-mask-${name})`, class: 'flint-stone-texture', style: 'mix-blend-mode: multiply', 'pointer-events': 'none' }); symbol.append(texture);
    const bevel = svgElement('g', { 'data-relief-bevel': name }); bevel.innerHTML = artwork.bevel.replaceAll('BEVEL', `url(#${p.bevel.gradient.id})`); symbol.append(bevel);
    forms.push({ name, texture, ao, bevel });
  }
  const update = () => {
    const nextTextureState = `${finish}/${detail}/${lighting.effects.reducedEffects}`;
    if (textureState !== nextTextureState) {
      textureState = nextTextureState;
      for (const { name, texture, ao, bevel } of forms) {
        const material = materialForForm(name, finish);
        const textureFinish = material.name === 'marble-pale' ? 'marble' : 'limestone';
        texture.setAttribute('fill', finish === 'untextured' ? 'none' : `url(#${prefix}-texture-${textureFinish}-${name})`);
        texture.setAttribute('opacity', String(material.relief!.texture));
        texture.setAttribute('display', detail === 'full' && !lighting.effects.reducedEffects && finish !== 'untextured' ? 'inline' : 'none');
        ao.setAttribute('opacity', String(material.relief!.ao)); bevel.setAttribute('opacity', '.9');
        for (const edge of bevel.querySelectorAll('[stroke-width]')) {
          const base = edge.getAttribute('data-edge-width') ?? edge.getAttribute('stroke-width')!;
          edge.setAttribute('data-edge-width', base);
          edge.setAttribute('stroke-width', String(Number(base) * material.relief!.bevel / 1.4));
        }
        for (const cue of [ao, bevel]) cue.setAttribute('display', detail === 'full' && !lighting.effects.reducedEffects ? 'inline' : 'none');
      }
    }
    // Even flat retains a cheap directional cue; all texture/shadow/crease cost
    // is removed by its explicit definition attributes and adapter boundary.
    for (const { form, normal, stop } of facets.values()) {
      const material = materialForForm(form, finish);
      attribute(stop, 'stop-color', facetTone(detail === 'flat' ? { x: normal.x * .15, y: normal.y * .15, z: 1 } : normal, lighting.light, material));
    }
    const vector = lightVector(lighting.light), a = lighting.light.azimuth * Math.PI / 180;
    for (const { form, body, bevel } of profiles.values()) {
      const material: Material = form ? materialForForm(form, finish) : LIMESTONE;
      const r = resolveMaterialResponse({ material, elevation: 'relief', geometry: { width: 100, height: 100 }, light: lighting.light, effects: lighting.effects });
      const tones = detail === 'flat' ? [r.body.front, r.body.front, r.body.front] : Object.values(r.body);
      for (const [i, tone] of tones.entries()) attribute(body.stops[i], 'stop-color', tone);
      if (detail === 'full' && !lighting.effects.reducedEffects) {
        const albedo = material.albedo!;
        const edge: Material = { ...material, albedo: { ...albedo, ambient: albedo.ambient - 8, diffuse: albedo.diffuse + 18 } };
        [facetTone({ x: vector.x, y: vector.y, z: .4 }, lighting.light, edge), r.body.front, facetTone({ x: -vector.x, y: -vector.y, z: .25 }, lighting.light, edge)].forEach((tone, i) => attribute(bevel.stops[i], 'stop-color', tone));
      }
      for (const gradient of detail === 'full' ? [body.gradient, bevel.gradient] : [body.gradient]) {
        attribute(gradient, 'x1', `${50 + Math.cos(a) * 50}%`); attribute(gradient, 'y1', `${50 + Math.sin(a) * 50}%`);
        attribute(gradient, 'x2', `${50 - Math.cos(a) * 50}%`); attribute(gradient, 'y2', `${50 - Math.sin(a) * 50}%`);
      }
    }
    for (const [elevation, apply] of detail === 'full' ? filters : []) apply(resolveMaterialResponse({ elevation, geometry: { width: 100, height: 100 }, light: lighting.light, effects: lighting.effects }));
  };
  const stop = lighting.subscribe(update);
  return { setDetail(value: typeof detail) { detail = value; update(); }, setFinish(value: StoneFinish) { finish = value; update(); }, setTextureLayers(layers: TextureLayers) { stoneTextures.setLayers(layers); }, dispose() { stop(); stoneTextures.dispose(); for (const el of owned) el.remove(); } };
}
