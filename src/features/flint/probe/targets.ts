export type ProbeKind = 'graph-node' | 'flint-eikon';
export type ProbeBounds = { left: number; top: number; right: number; bottom: number };
export type ProbeTarget = {
  id: string;
  kind: ProbeKind;
  /** Client coordinates, projected by the target's own scene or DOM owner. */
  bounds: () => ProbeBounds | undefined;
  radius?: number;
  capabilities?: readonly string[];
};
export function createProbeTargets() {
  const targets = new Set<ProbeTarget>(), listeners = new Set<() => void>();
  const invalidate = () => listeners.forEach(fn => fn());
  return {
    register(target: ProbeTarget) { targets.add(target); invalidate(); return () => { targets.delete(target); invalidate(); }; },
    subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    invalidate,
    resolve(x: number, y: number) {
      let result: { kind: ProbeKind | 'none'; intensity: number; id?: string } = { kind: 'none', intensity: 0 };
      for (const target of targets) {
        const b = target.bounds(); if (!b) continue;
        const distance = Math.hypot(Math.max(b.left - x, 0, x - b.right), Math.max(b.top - y, 0, y - b.bottom));
        const t = Math.max(0, 1 - distance / (target.radius ?? 65)), intensity = t * t * (3 - 2 * t);
        if (intensity > result.intensity) result = { kind: target.kind, intensity, id: target.id };
      }
      return result;
    },
    get size() { return targets.size; },
  };
}
const registries = new WeakMap<HTMLElement, ReturnType<typeof createProbeTargets>>();
export function probeTargets(root: HTMLElement) {
  let registry = registries.get(root);
  if (!registry) { registry = createProbeTargets(); registries.set(root, registry); }
  return registry;
}
