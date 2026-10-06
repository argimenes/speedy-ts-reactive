import { describe, expect, it } from 'vitest';
import { DEFAULT_LIGHT, ELEVATIONS, LIMESTONE, MARBLE, lightVector, normaliseLight, resolveMaterialResponse } from './material-response';

const response = (patch: Partial<Parameters<typeof resolveMaterialResponse>[0]> = {}) => resolveMaterialResponse({ elevation: 'relief', geometry: { width: 200, height: 100 }, light: DEFAULT_LIGHT, ...patch });
describe('shared material response', () => {
  it('lights distinct stone albedos without changing elevation or interaction travel', () => {
    const limestone = response({ material: LIMESTONE, interaction: { lift: .5 } });
    const marble = response({ material: MARBLE, interaction: { lift: .5 } });
    expect(marble.facets.front).not.toEqual(limestone.facets.front);
    expect(marble.effectiveHeight).toEqual(limestone.effectiveHeight);
    expect(marble.shadow).toEqual(limestone.shadow);
    expect(response({ material: MARBLE, light: { ...DEFAULT_LIGHT, azimuth: 135 } }).facets.left).not.toEqual(marble.facets.left);
  });
  it('uses one screen-space light basis for facets and opposing cast shadows', () => {
    const east = { ...DEFAULT_LIGHT, azimuth: 0 }, west = { ...DEFAULT_LIGHT, azimuth: 180 };
    expect(lightVector(east).x).toBeGreaterThan(0);
    expect(response({ light: east }).shadow.x).toBeLessThan(0);
    expect(response({ light: west }).shadow.x).toBeGreaterThan(0);
    expect(response({ light: east }).facets.left).toEqual(response({ light: west }).facets.right);
    expect(response({ light: east }).shadow.y).toBeCloseTo(0);
    expect(response({ light: east }).body).toEqual(response({ light: west }).body);
    expect(response({ light: east }).body.lit).not.toEqual(response({ light: east }).body.shaded);
  });
  it('retains baseline identity while bounding local travel, contact and positions', () => {
    const baseline = response(), local = response({ interaction: { press: 1, lift: 1, contact: 5, proximity: 5, position: { x: -40, y: 1000 } } });
    expect(baseline.effectiveHeight).toBe(ELEVATIONS.relief);
    expect(local.effectiveHeight).toBe(11);
    expect(local.position).toEqual({ x: 0, y: 100 });
    expect(local.normalisedPosition).toEqual({ x: 0, y: 1 });
    expect(local.glow).toBeLessThanOrEqual(.58);
    expect(response()).toEqual(baseline);
    expect(normaliseLight({ azimuth: NaN, elevation: 0, intensity: Infinity, softness: -10 })).toEqual({ ...DEFAULT_LIGHT, elevation: 15, softness: 0 });
  });
  it('expires finite waves and applies motion/effect preferences in the common resolver', () => {
    const interaction = { press: 1, contact: 1, wave: { id: 1, origin: { x: 40, y: 20 }, startedAt: 100, duration: 900, amplitude: 1 } };
    expect(response({ interaction, now: 99 }).wave.active).toBe(true);
    expect(response({ interaction, now: 200 }).wave.active).toBe(true);
    expect(response({ interaction, now: 1000 }).wave.active).toBe(false);
    const reducedMotion = response({ interaction, now: 200, effects: { reducedMotion: true, reducedEffects: false } });
    expect(reducedMotion.effectiveHeight).toBe(ELEVATIONS.relief);
    expect(reducedMotion.glow).toBeGreaterThan(0);
    expect(reducedMotion.wave.active).toBe(false);
    const reducedEffects = response({ interaction, now: 200, effects: { reducedMotion: false, reducedEffects: true } });
    expect(reducedEffects.glow).toBe(0); expect(reducedEffects.shadow.opacity).toBe(0);
  });
});
