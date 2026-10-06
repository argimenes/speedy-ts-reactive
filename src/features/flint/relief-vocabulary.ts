import { SCULPTURAL_STONE, type Material, type StoneFinish, type Vector } from './material-response';

export type ReliefForm = 'mask' | 'disc' | 'pyramids' | 'waves' | 'leaf' | 'spiral' | 'star' | 'beads' | 'moon' | 'diamond' | 'stone';
const variants: Record<ReliefForm, keyof typeof SCULPTURAL_STONE> = { mask: 'porous', disc: 'weathered', pyramids: 'fine', waves: 'chalk', leaf: 'fine', spiral: 'marble', star: 'chalk', beads: 'fine', moon: 'marble', diamond: 'fine', stone: 'weathered' };
export function materialForForm(form: ReliefForm, finish: StoneFinish): Material { return SCULPTURAL_STONE[finish === 'marble' ? 'marble' : variants[form]]; }
const curved = { left: { x: -.8, y: 0, z: .65 }, right: { x: .8, y: 0, z: .65 }, top: { x: 0, y: -.8, z: .65 }, front: { x: 0, y: 0, z: 1 } };
/** Conceptual planes in the same screen-space basis as DOM surfaces and a later Probe.
 * These describe the depicted geometry, not a baked lighting direction.
 */
export const FORM_NORMALS: Record<ReliefForm, Record<string, Vector>> = {
  mask: { ...curved, noseLeft: { x: -.95, y: .1, z: .35 }, noseRight: { x: .95, y: .1, z: .35 }, nose: { x: 0, y: -.25, z: 1 } },
  pyramids: { left: { x: -.85, y: .35, z: .55 }, right: { x: .85, y: .35, z: .55 }, top: { x: 0, y: -.85, z: .5 } },
  diamond: { left: { x: -.8, y: 0, z: .5 }, right: { x: .8, y: 0, z: .5 }, top: { x: 0, y: -.8, z: .5 }, bottom: { x: 0, y: .8, z: .5 }, front: { x: 0, y: 0, z: 1 } },
  leaf: { left: { x: -.55, y: .12, z: .8 }, right: { x: .55, y: .12, z: .8 }, top: curved.top, front: curved.front },
  disc: curved, spiral: curved, moon: curved, waves: curved, star: curved, beads: curved, stone: curved,
};
const body = 'fill="BODY"';
const face = (name: string) => `fill="FACE-${name}"`;
const bevel = (d: string, width = 1.6) => `<path d="${d}" fill="none" stroke="BEVEL" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round"/>`;
const ao = (d: string, width = 1.8) => `<path d="${d}" fill="none" stroke="#443d30" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round"/>`;
export type ReliefArtwork = { body: string; ao: string; bevel: string };
const maskOutline = 'M49 4C20 2 13 23 17 50c3 25 17 44 33 47 17-7 30-30 32-52C85 17 69 4 49 4Z';
const leafOutline = 'M50 5C7 36 15 69 50 91c35-22 43-55 0-86Z';
const incisions = 'M50 22v76M50 49 35 36m15 27L31 48m19 1 15-13M50 63l19-15m-19 30 13-12m-13 12-13-12';
const spiral = 'M49 87C9 78 14 21 53 16c40-6 45 55 12 55-25 1-28-34-8-35 14-1 15 18 3 20';
const crescent = 'M63 8C-2 28 19 94 66 88c19-3 28-13 30-24-44 20-65-18-33-56Z';
const discCuts = 'M50 18v64M18 50h64M27 27l46 46m0-46L27 73M38 20l24 60M20 38l60 24m-60 0 60-24m-42 42 24-60';
const star = 'M50 12v78M12 50h78M22 22l56 56m0-56L22 78';
const waves = 'M8 39c9-18 17 18 28 0s19 18 29 0 19 18 28 0M8 64c9-18 17 18 28 0s19 18 29 0 19 18 28 0';
const pyramid = (x: number, y: number, w: number, h: number) => {
  const left = x - w / 2, right = x + w / 2, bottom = y + h, centre = bottom - 4;
  return {
    body: `<path d="M${x} ${y} ${left} ${bottom} ${x} ${centre}Z" ${face('left')}/><path d="M${x} ${y} ${x} ${centre} ${right} ${bottom}Z" ${face('right')}/><path d="M${left} ${bottom} ${x} ${centre} ${right} ${bottom}Z" ${face('top')}/>`,
    ao: ao(`M${x} ${y + 2}V${centre}L${left} ${bottom}M${x} ${centre} ${right} ${bottom}`, .9),
    bevel: bevel(`M${x} ${y} ${left} ${bottom} ${right} ${bottom}Z M${x} ${y}V${centre}`, 1.5),
  };
};
const pyramids = [pyramid(48, 9, 47, 48), pyramid(25, 34, 45, 49), pyramid(75, 31, 45, 52)];
export const RELIEF_ARTWORK: Record<ReliefForm, ReliefArtwork> = {
  mask: {
    body: `<path ${body} d="${maskOutline}"/><path ${face('left')} opacity=".35" d="M49 6C20 7 16 25 19 51c4 25 17 39 29 44L43 59Z"/><path ${face('right')} opacity=".3" d="M53 6c26 2 30 28 25 47-5 20-13 35-24 41l4-35Z"/><path ${face('noseLeft')} d="m49 24-7 37 8 4Z"/><path ${face('noseRight')} d="m52 24 8 37-10 4Z"/><path ${face('nose')} d="m49 24 3 0 2 35-4 6-3-6Z"/>`,
    ao: ao('M42 60q3 5 8 5t10-5M30 31q5-3 10 0m21 0q5-3 10 0M40 73q9-5 17 0m-15 0q7 4 13 0', 1.8) + ao('M45 28 42 60m13-32 5 32', 1.1),
    bevel: bevel(maskOutline) + bevel('M49 25 47 59l3 3m-9 11q8-3 15 0', 1.1),
  },
  pyramids: { body: pyramids.map(p => p.body).join(''), ao: pyramids.map(p => p.ao).join(''), bevel: pyramids.map(p => p.bevel).join('') },
  disc: {
    body: `<circle ${body} cx="50" cy="50" r="32"/><path ${face('left')} opacity=".32" d="M50 18a32 32 0 0 0 0 64Z"/><path ${face('top')} opacity=".28" d="M18 50a32 32 0 0 1 64 0L50 50Z"/><circle ${face('front')} cx="50" cy="50" r="4"/>`,
    ao: ao(discCuts, .85), bevel: '<circle cx="50" cy="50" r="31" fill="none" stroke="BEVEL" stroke-width="1.8"/>' + bevel('M50.8 20v60', .65),
  },
  leaf: {
    body: `<path ${body} d="${leafOutline}"/><path ${face('left')} opacity=".6" d="M50 5C7 36 15 69 50 91Z"/><path ${face('right')} opacity=".6" d="M50 5c43 31 35 64 0 86Z"/>`,
    ao: ao(incisions, 2.2), bevel: bevel(leafOutline, 1.7) + bevel('M51.3 23v72M51.3 50l14-13m-14 27 18-15', 1.1),
  },
  spiral: {
    body: `<path d="${spiral}" fill="none" stroke="FACE-left" stroke-width="11" stroke-linecap="round"/><path d="${spiral}" fill="none" stroke="BODY" stroke-width="8.5" stroke-linecap="round"/>`,
    ao: ao('M51 82C15 72 21 27 53 23c31-4 35 44 11 44-17 0-20-24-7-25', 1.5),
    bevel: `<path d="${spiral}" fill="none" stroke="BEVEL" stroke-width="5.5" stroke-linecap="round" opacity=".75"/>`,
  },
  waves: {
    body: `<path d="${waves}" fill="none" stroke="FACE-left" stroke-width="9" stroke-linecap="round"/><path d="${waves}" fill="none" stroke="BODY" stroke-width="6.5" stroke-linecap="round"/>`,
    ao: ao('M8 42c9-18 17 18 28 0s19 18 29 0 19 18 28 0M8 67c9-18 17 18 28 0s19 18 29 0 19 18 28 0', 1),
    bevel: `<path d="${waves}" fill="none" stroke="BEVEL" stroke-width="3.2" stroke-linecap="round"/>`,
  },
  star: {
    body: `<path d="${star}" fill="none" stroke="FACE-left" stroke-width="8.5" stroke-linecap="round"/><path d="${star}" fill="none" stroke="BODY" stroke-width="6.5" stroke-linecap="round"/>`,
    ao: ao('M46 44l8 12m-10-7h12', 1.3), bevel: `<path d="${star}" fill="none" stroke="BEVEL" stroke-width="3" stroke-linecap="round"/>`,
  },
  beads: {
    body: [[50,28],[31,49],[70,49],[50,70]].map(([x,y]) => `<circle ${body} cx="${x}" cy="${y}" r="9"/>`).join(''),
    ao: '', bevel: [[50,28],[31,49],[70,49],[50,70]].map(([x,y]) => `<circle cx="${x}" cy="${y}" r="8.5" fill="none" stroke="BEVEL" stroke-width="1"/>`).join(''),
  },
  moon: {
    body: `<path ${body} d="${crescent}"/><path ${face('left')} opacity=".3" d="M63 8C-2 28 19 94 66 88l-13-8C17 68 24 35 63 8Z"/>`,
    ao: ao('M58 17C31 43 47 78 80 75', 1.7), bevel: bevel(crescent, 1.6),
  },
  diamond: {
    body: `<path d="m50 5-38 45 18 0 20-21Z" ${face('left')}/><path d="m50 5 38 45-18 0-20-21Z" ${face('top')}/><path d="m88 50-38 45v-24l20-21Z" ${face('right')}/><path d="m50 95-38-45h18l20 21Z" ${face('bottom')}/><path d="m50 29 20 21-20 21-20-21Z" ${face('front')}/>`,
    ao: ao('m50 29 20 21-20 21-20-21Z M50 5v24M12 50h18M88 50H70M50 95V71', 1.4),
    bevel: bevel('m50 5 38 45-38 45L12 50Z', 1.6) + bevel('m50 30 19 20-19 20-19-20Z', 1),
  },
  stone: { body: `<circle ${body} cx="50" cy="50" r="28"/><path ${face('left')} opacity=".28" d="M50 22a28 28 0 0 0 0 56Z"/>`, ao: ao('m36 32 8 4m12 8 4 8m-30 8 10 1m12 8 9-3', .7), bevel: '<circle cx="50" cy="50" r="27.5" fill="none" stroke="BEVEL" stroke-width="1.4"/>' },
};
