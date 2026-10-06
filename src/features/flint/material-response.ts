/** Presentation only. Coordinates are x-right, y-down, z-towards the viewer.
 * Azimuth points TOWARDS the source; cast shadows point in the opposite direction.
 * Heights/travel are visual CSS-pixel units, never document or layout geometry.
 */
export type Elevation = 'etched' | 'carved' | 'flush' | 'relief' | 'raised' | 'object';
export type Light = Readonly<{ azimuth: number; elevation: number; intensity: number; softness: number }>;
export type Effects = Readonly<{ reducedMotion: boolean; reducedEffects: boolean }>;
export type Vector = Readonly<{ x: number; y: number; z: number }>;
export type Geometry = Readonly<{ width: number; height: number }>;
export type Position = Readonly<{ x: number; y: number }>;
export type Capability = Readonly<{ kind: 'activate' | 'drag' | 'inspect'; available: boolean; label: string }>;
export type WaveImpulse = Readonly<{ id: number; origin: Position; startedAt: number; amplitude: number; duration: number }>;
export type Material = Readonly<{
  name: string; depression: number; lift: number; minHeight: number; maxHeight: number;
  contactGain: number; proximityGain: number; maxGlow: number; waveDuration: number; maxWaveRadius: number; maxImpulses: number;
  albedo?: Readonly<{ hue: number; saturation: number; ambient: number; diffuse: number }>;
}>;
export type StoneFinish = 'limestone' | 'marble' | 'untextured';
const LIMESTONE_ALBEDO = Object.freeze({ hue: 38, saturation: 19, ambient: 62, diffuse: 25 });
/** All positions are in the target's local, untransformed frame. Time is monotonic ms. */
export type MaterialInteraction = Readonly<{
  position?: Position;
  proximity?: number;
  contact?: number;
  press?: number;
  lift?: number;
  wave?: WaveImpulse;
}>;
export const DEFAULT_LIGHT: Light = Object.freeze({ azimuth: 315, elevation: 42, intensity: .85, softness: .55 });
export const ELEVATIONS: Readonly<Record<Elevation, number>> = Object.freeze({ etched: -1, carved: -3, flush: 0, relief: 4, raised: 8, object: 15 });
export const LIMESTONE: Material = Object.freeze({
  name: 'limestone', depression: 5, lift: 12, minHeight: -8, maxHeight: 30,
  contactGain: .48, proximityGain: .15, maxGlow: .58, waveDuration: 900, maxWaveRadius: 160,
  maxImpulses: 4,
  albedo: LIMESTONE_ALBEDO,
});
export const MARBLE: Material = Object.freeze({ ...LIMESTONE, name: 'marble', albedo: Object.freeze({ hue: 40, saturation: 10, ambient: 73, diffuse: 18 }) });
export function materialForFinish(finish: StoneFinish) { return finish === 'marble' ? MARBLE : LIMESTONE; }
export function bound(value: number, min: number, max: number, fallback = min): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}
export function normaliseLight(value: Light): Light {
  return {
    azimuth: Number.isFinite(value.azimuth) ? ((value.azimuth % 360) + 360) % 360 : DEFAULT_LIGHT.azimuth,
    elevation: bound(value.elevation, 15, 80, DEFAULT_LIGHT.elevation),
    intensity: bound(value.intensity, .15, 1.3, DEFAULT_LIGHT.intensity),
    softness: bound(value.softness, 0, 1, DEFAULT_LIGHT.softness),
  };
}
export function lightVector(input: Light): Vector {
  const light = normaliseLight(input), a = light.azimuth * Math.PI / 180, e = light.elevation * Math.PI / 180;
  return { x: Math.cos(a) * Math.cos(e), y: Math.sin(a) * Math.cos(e), z: Math.sin(e) };
}
/** Facets, including a later Probe, consume this same lighting basis. */
export function facetTone(normal: Vector, input: Light, material: Material = LIMESTONE): string {
  const v = lightVector(input), length = Math.hypot(normal.x, normal.y, normal.z) || 1;
  const diffuse = Math.max(0, (normal.x * v.x + normal.y * v.y + normal.z * v.z) / length);
  const albedo = material.albedo ?? LIMESTONE_ALBEDO;
  const luminosity = bound(albedo.ambient + diffuse * normaliseLight(input).intensity * albedo.diffuse, 0, 96);
  return `hsl(${albedo.hue} ${albedo.saturation}% ${luminosity.toFixed(2)}%)`;
}
export function resolveMaterialResponse(input: {
  material?: Material; elevation: Elevation; geometry: Geometry; light: Light;
  interaction?: MaterialInteraction; effects?: Effects; now?: number;
}) {
  const material = input.material ?? LIMESTONE, local = input.interaction ?? {};
  const light = normaliseLight(input.light), vector = lightVector(light);
  const effects = input.effects ?? { reducedMotion: false, reducedEffects: false };
  const width = bound(input.geometry.width, 1, 10000, 100), height = bound(input.geometry.height, 1, 10000, 100);
  const position = { x: bound(local.position?.x ?? width / 2, 0, width), y: bound(local.position?.y ?? height / 2, 0, height) };
  const travel = effects.reducedMotion || effects.reducedEffects ? 0 : -bound(local.press ?? 0, 0, 1) * material.depression + bound(local.lift ?? 0, 0, 1) * material.lift;
  const effectiveHeight = bound(ELEVATIONS[input.elevation] + travel, material.minHeight, material.maxHeight);
  const reach = Math.abs(effectiveHeight) / Math.tan(light.elevation * Math.PI / 180);
  const horizontal = Math.hypot(vector.x, vector.y) || 1;
  const shadow = {
    x: -vector.x / horizontal * reach, y: -vector.y / horizontal * reach,
    blur: 1 + Math.abs(effectiveHeight) * (.22 + light.softness * .6),
    opacity: effects.reducedEffects ? 0 : bound(.16 + light.intensity * .13, 0, .35), inset: effectiveHeight < 0,
  };
  const glow = effects.reducedEffects ? 0 : bound(bound(local.contact ?? 0, 0, 1) * material.contactGain + bound(local.proximity ?? 0, 0, 1) * material.proximityGain, 0, material.maxGlow);
  const impulse = local.wave;
  const duration = bound(impulse?.duration ?? material.waveDuration, 100, 1500, material.waveDuration);
  // A RAF timestamp can precede an input's performance.now() within the same frame.
  // Start that impulse at age zero rather than mistaking it for an expired effect.
  const age = Math.max(0, (input.now ?? 0) - (impulse?.startedAt ?? 0));
  const progress = bound(age / duration, 0, 1);
  const waveActive = !!impulse && age < duration && !effects.reducedMotion && !effects.reducedEffects;
  return {
    effectiveHeight, travel, shadow, position,
    normalisedPosition: { x: position.x / width, y: position.y / height },
    glow,
    wave: {
      active: waveActive,
      x: bound(impulse?.origin.x ?? position.x, 0, width), y: bound(impulse?.origin.y ?? position.y, 0, height),
      radius: Math.min(material.maxWaveRadius, Math.hypot(width, height)) * progress,
      opacity: waveActive ? bound(impulse?.amplitude ?? 0, 0, 1) * (1 - progress) ** 2 * .7 : 0,
    },
    facets: { left: facetTone({ x: -1, y: 0, z: 1 }, light, material), right: facetTone({ x: 1, y: 0, z: 1 }, light, material), top: facetTone({ x: 0, y: -1, z: 1 }, light, material), front: facetTone({ x: 0, y: 0, z: 1 }, light, material) },
    // A curved body's gradient rotates with the source. Its lit/shaded stops
    // must not swap merely because a fixed world-space facet changes direction.
    body: {
      lit: facetTone({ x: vector.x, y: vector.y, z: .7 }, light, material),
      front: facetTone({ x: 0, y: 0, z: 1 }, light, material),
      shaded: facetTone({ x: -vector.x, y: -vector.y, z: .7 }, light, material),
    },
  };
}
export type MaterialResponse = ReturnType<typeof resolveMaterialResponse>;
