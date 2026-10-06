import type { Lighting } from './lighting';
import { LIMESTONE, resolveMaterialResponse, type Capability, type Elevation, type Geometry, type Material, type MaterialInteraction, type MaterialResponse, type Position } from './material-response';

export type MaterialTarget = {
  id: string; elevation: Elevation; geometry: () => Geometry;
  material?: Material;
  capabilities: readonly Capability[];
  apply: (response: MaterialResponse, active: boolean) => void;
  /** Coordinate adapters return the same local frame as geometry(). */
  clientToLocal?: (position: Position) => Position;
};
/** Optional presentation inputs only: never dispatches an action or updates canonical records. */
export function createMaterialInteraction(lighting: Lighting) {
  const targets = new Map<string, MaterialTarget>(), states = new Map<string, MaterialInteraction>(), dirty = new Set<string>();
  let impulseId = 0;
  const apply = (target: MaterialTarget, state: MaterialInteraction | undefined, now: number) => {
    const response = resolveMaterialResponse({ material: target.material, elevation: target.elevation, geometry: target.geometry(), light: lighting.light, interaction: state, effects: lighting.effects, now });
    target.apply(response, !!state);
    return response.wave.active;
  };
  const stop = lighting.addTask(now => {
    const updates = new Set([...dirty, ...states.keys()]);
    dirty.clear();
    // Neutral graph nodes use shared SVG definitions; DOM primitives opt into direct updates.
    let continuing = false;
    for (const id of updates) {
      const target = targets.get(id), state = states.get(id);
      if (!target) continue;
      const activeWave = apply(target, state, now);
      continuing ||= activeWave;
      if (state?.wave && !activeWave) {
        const { wave: _, ...rest } = state;
        states.set(id, rest);
      }
    }
    return continuing;
  });
  return {
    register(target: MaterialTarget) {
      if (targets.has(target.id)) throw new Error(`Duplicate material target: ${target.id}`);
      targets.set(target.id, target); dirty.add(target.id); lighting.request();
      return () => { targets.delete(target.id); states.delete(target.id); dirty.delete(target.id); };
    },
    target(id: string) { return targets.get(id); },
    state(id: string) { return states.get(id); },
    set(id: string, patch: MaterialInteraction) {
      if (!targets.has(id)) return;
      states.set(id, { ...states.get(id), ...patch }); dirty.add(id); lighting.request();
    },
    wave(id: string) {
      const target = targets.get(id); if (!target) return;
      const geometry = target.geometry(), origin = states.get(id)?.position ?? { x: geometry.width / 2, y: geometry.height / 2 };
      // Keep at most one finite impulse per target and a bounded number across the root.
      if ([...states.values()].filter(s => s.wave).length >= LIMESTONE.maxImpulses && !states.get(id)?.wave) return;
      this.set(id, { wave: { id: ++impulseId, origin, startedAt: performance.now(), amplitude: 1, duration: LIMESTONE.waveDuration } });
    },
    clear(id: string) { states.delete(id); dirty.add(id); lighting.request(); },
    reset() { for (const id of states.keys()) dirty.add(id); states.clear(); lighting.request(); },
    refresh(id: string) { if (targets.has(id)) { dirty.add(id); lighting.request(); } },
    dispose() { stop(); targets.clear(); states.clear(); dirty.clear(); },
    get activeCount() { return states.size; },
  };
}
export type MaterialInteractions = ReturnType<typeof createMaterialInteraction>;
