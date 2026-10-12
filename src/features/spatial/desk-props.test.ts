import { describe, expect, it } from 'vitest';
import { DESK_PROPS, arrangedProp, propPlacement, validateDeskProps } from './desk-props';
import { decodeSpatial, starterLayout, STUDY } from './model';

describe('desktop-only prop placement', () => {
  it('constrains every prop footprint at inner, outer and side edges', () => {
    for (const definition of DESK_PROPS) for (const x of [-4, -1, 0, 1, 4]) for (const z of [-5, -1, 0, 3]) {
      const p = arrangedProp(propPlacement(starterLayout([]), definition.id)!, { position: { x, z }, heading: 7 });
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 16) {
        const px = p.position.x + Math.cos(a) * definition.radius, pz = p.position.z + Math.sin(a) * definition.radius;
        expect(Math.hypot(px, pz)).toBeGreaterThanOrEqual(STUDY.innerRadius + .0149);
        expect(Math.hypot(px, pz)).toBeLessThanOrEqual(STUDY.outerRadius - .0149);
        expect(Math.abs(Math.atan2(px, -pz))).toBeLessThanOrEqual(STUDY.arc * Math.PI / 360);
      }
      expect(() => validateDeskProps([{ id: p.objectId, position: p.position, heading: p.heading }])).not.toThrow();
    }
  });
  it('leaves old study presets unchanged and round-trips settled props with future fields', () => {
    const old = starterLayout([]), before = structuredClone(old);
    for (const prop of DESK_PROPS) expect(propPlacement(old, prop.id)?.position).toEqual({ x: prop.x, z: prop.z });
    expect(old).toEqual(before); expect(decodeSpatial(old)).toEqual(before);
    const p = arrangedProp(propPlacement(old, 'study:cup')!, { position: { x: .2, z: -.9 } });
    const value = { ...old, environment: { ...old.environment, future: 'keep', deskProps: [{ id: p.objectId, position: { ...p.position, future: 42 }, heading: p.heading, future: 'prop' }] } };
    expect(decodeSpatial(JSON.parse(JSON.stringify(value)))).toEqual(value);
    expect(propPlacement(value, 'study:cup')?.position).toEqual(value.environment.deskProps[0].position);
  });
  it('rejects airborne, off-desk, duplicate, unknown and nonfinite saved props', () => {
    const p = { id: 'study:cup', position: { x: 0, z: -.9 }, heading: 0 };
    for (const props of [[p, p], [{ ...p, id: 'shelf' }], [{ ...p, heading: NaN }], [{ ...p, position: { x: 0, z: -.9, y: .1 } }], [{ ...p, position: { x: 0, z: 0 } }], [{ ...p, position: { x: Infinity, z: -.9 } }], [{ ...p, position: { x: 0, z: -1.44 } }]]) {
      expect(() => decodeSpatial({ ...starterLayout([]), environment: { preset: 'night-study-v1', deskProps: props } })).toThrow();
    }
  });
});
