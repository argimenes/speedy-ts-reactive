/** Normalised x/y around the viewport, with height/thickness in viewport units.
 * These are architectural masses, never DOM-derived controls. */
export type Occluder = Readonly<{
  type: 'slab' | 'beam' | 'aperture'; position: readonly [number, number];
  scale: readonly [number, number]; height: number; depth: number; rotation: number;
  castsShadow?: boolean;
}>;
export type LightEnvironment = Readonly<{ name: string; enabled: boolean; occluders: readonly Occluder[] }>;
export const OPEN_ENVIRONMENT: LightEnvironment = { name: 'Open', enabled: false, occluders: [] };
export const CYCLADIC_APERTURE: LightEnvironment = {
  name: 'Cycladic Aperture', enabled: true,
  occluders: [
    // Distant lintel: a little broad shade at the perimeter, not a cloud over Graph.
    { type: 'slab', position: [1.15, -.2], scale: [.86, .105], height: .38, depth: .045, rotation: 44 },
    { type: 'beam', position: [1.17, .41], scale: [.68, .052], height: .16, depth: .027, rotation: 44 },
    { type: 'aperture', position: [1.12, .93], scale: [.71, .23], height: .25, depth: .035, rotation: 40 },
    { type: 'slab', position: [.46, -.12], scale: [.72, .065], height: .12, depth: .03, rotation: 38 },
    { type: 'beam', position: [.36, 1.11], scale: [.65, .07], height: .14, depth: .03, rotation: 34 },
    { type: 'slab', position: [-.19, .93], scale: [.7, .13], height: .32, depth: .035, rotation: 52 },
  ],
};
