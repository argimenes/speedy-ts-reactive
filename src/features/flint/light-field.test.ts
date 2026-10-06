import { describe, expect, it } from 'vitest';
import { DEFAULT_LIGHT, resolveMaterialResponse } from './material-response';
import { resolveLightField } from './light-field';

const effects = { reducedEffects: false, reducedMotion: false };
describe('workspace light projection', () => {
  it('uses the relief light basis and responds to all four light inputs', () => {
    const defaultField = resolveLightField(DEFAULT_LIGHT, effects);
    expect(defaultField.background).toContain('linear-gradient(135deg');
    const opposite = { ...DEFAULT_LIGHT, azimuth: 135 };
    expect(resolveLightField(opposite, effects).background).toContain('linear-gradient(315deg');
    expect(resolveMaterialResponse({ light: opposite, elevation: 'object', geometry: { width: 100, height: 100 } }).shadow.x).toBeGreaterThan(0);
    expect(resolveLightField({ ...DEFAULT_LIGHT, elevation: 80 }, effects).background).not.toEqual(defaultField.background);
    expect(resolveLightField({ ...DEFAULT_LIGHT, softness: 1 }, effects).background).not.toEqual(defaultField.background);
    expect(resolveLightField({ ...DEFAULT_LIGHT, intensity: .15 }, effects).background).not.toEqual(defaultField.background);
  });
  it('removes the decorative field with reduced effects and introduces no motion loop', () => {
    expect(resolveLightField(DEFAULT_LIGHT, { ...effects, reducedEffects: true }).hidden).toBe(true);
    expect(resolveLightField(DEFAULT_LIGHT, { ...effects, reducedMotion: true })).toEqual(resolveLightField(DEFAULT_LIGHT, effects));
  });
});
