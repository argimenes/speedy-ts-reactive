/** Normalised x/y around the viewport, with height/thickness in viewport units.
 * These are architectural masses, never DOM-derived controls. */
export type Occluder = Readonly<{
  type: 'slab' | 'beam'; position: readonly [number, number];
  scale: readonly [number, number]; height: number; depth: number; rotation: number;
  castsShadow?: boolean;
}>;
export type LightEnvironment = Readonly<{ name: string; enabled: boolean; occluders: readonly Occluder[] }>;
export const OPEN_ENVIRONMENT: LightEnvironment = { name: 'Open', enabled: false, occluders: [] };
export const CYCLADIC_APERTURE: LightEnvironment = {
  name: 'Cycladic Aperture', enabled: true,
  occluders: [
    { type: 'slab', position: [-.22, .2], scale: [.8, .28], height: .28, depth: .055, rotation: 38 },
    { type: 'slab', position: [.65, -.09], scale: [1.4, .2], height: .24, depth: .065, rotation: 45 },
    { type: 'beam', position: [1.12, .35], scale: [.95, .075], height: .46, depth: .035, rotation: 48 },
    { type: 'slab', position: [1.12, .93], scale: [1.3, .32], height: .35, depth: .075, rotation: 41 },
    { type: 'beam', position: [.45, 1.15], scale: [.74, .09], height: .3, depth: .04, rotation: 29 },
    { type: 'slab', position: [-.13, .96], scale: [.85, .19], height: .21, depth: .07, rotation: 52 },
  ],
};

