import { bound, lightVector, normaliseLight, type Effects, type Light } from './material-response';
import type { Lighting } from './lighting';

/** Projection of unseen architecture in the reliefs' light basis. No graph
 * geometry, per-object occlusion or independent animation clock.
 */
export function resolveLightField(input: Light, effects: Effects) {
  const light = normaliseLight(input), vector = lightVector(light);
  const penumbra = 1.2 + light.softness * 5.5;
  const projection = bound(42 / light.elevation, .55, 1.8);
  const shadow = effects.reducedEffects ? 0 : bound(.055 + light.intensity * .15, 0, .23);
  const stops = [[24, 9], [52, 7], [82, 9]].flatMap(([centre, width]) => [
    `transparent ${centre - width * projection - penumbra}%`,
    `rgb(83 72 53 / ${shadow}) ${centre - width * projection}%`,
    `rgb(83 72 53 / ${shadow}) ${centre + width * projection}%`,
    `transparent ${centre + width * projection + penumbra}%`,
  ]);
  // CSS gradient angles use zero upwards, unlike our x-right screen basis.
  // This normal is perpendicular to the source axis, so bands follow its rays.
  const angle = (light.azimuth + 180) % 360;
  return {
    transform: `translate(${-vector.x}%, ${-vector.y}%)`,
    background: `linear-gradient(${angle}deg, ${stops.join(', ')}), linear-gradient(${angle}deg, transparent 17%, rgb(255 253 237 / ${effects.reducedEffects ? 0 : light.intensity * .14}) 37%, transparent 57%, rgb(255 253 237 / ${effects.reducedEffects ? 0 : light.intensity * .1}) 69%, transparent 88%)`,
    hidden: effects.reducedEffects,
  };
}
/** Callback work and DOM count are independent of graph size. */
export function registerLightField(plane: HTMLElement, lighting: Lighting) {
  return lighting.subscribe(() => {
    const field = resolveLightField(lighting.light, lighting.effects);
    plane.style.transform = field.transform;
    plane.style.backgroundImage = field.background;
    plane.hidden = field.hidden;
  });
}
