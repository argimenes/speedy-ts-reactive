import { DEFAULT_LIGHT, normaliseLight, resolveMaterialResponse, type Effects, type Light } from './material-response';

export type FrameTask = (now: number, globalChanged: boolean) => boolean | void;
/** One scheduler per presentation root. A task returns true only while a finite effect is live. */
export function createLighting(root: HTMLElement) {
  let light: Light = DEFAULT_LIGHT;
  let effects: Effects = { reducedMotion: false, reducedEffects: false };
  let frame: number | undefined, dirty = true, disposed = false, flushing = false;
  const globals = new Set<() => void>(), tasks = new Set<FrameTask>();
  const metrics = { frames: 0, workMs: 0, lastWorkMs: 0 };
  const request = () => { if (!disposed && !flushing && frame === undefined) frame = requestAnimationFrame(flush); };
  function flush(now: number) {
    frame = undefined;
    if (disposed) return;
    flushing = true;
    const started = performance.now(), changed = dirty;
    dirty = false;
    if (changed) {
      const response = resolveMaterialResponse({ elevation: 'etched', geometry: { width: 100, height: 100 }, light, effects });
      const style = root.style;
      style.setProperty('--flint-shadow-x', `${response.shadow.x.toFixed(3)}px`);
      style.setProperty('--flint-shadow-y', `${response.shadow.y.toFixed(3)}px`);
      style.setProperty('--flint-softness', String(light.softness));
      style.setProperty('--flint-shadow-opacity', String(response.shadow.opacity));
      style.setProperty('--flint-light-angle', `${light.azimuth + 90}deg`);
      style.setProperty('--flint-light-intensity', String(light.intensity));
      for (const [name, colour] of Object.entries(response.facets)) style.setProperty(`--flint-facet-${name}`, colour);
      root.dataset.reducedEffects = String(effects.reducedEffects);
      root.dataset.reducedMotion = String(effects.reducedMotion);
      for (const listener of globals) listener();
    }
    let continuing = false;
    for (const task of tasks) continuing = task(now, changed) === true || continuing;
    metrics.frames++;
    metrics.lastWorkMs = performance.now() - started;
    metrics.workMs += metrics.lastWorkMs;
    flushing = false;
    if (continuing || dirty) request();
  }
  request();
  return {
    get light() { return light; }, get effects() { return effects; },
    get pending() { return frame !== undefined; }, get disposed() { return disposed; }, metrics,
    request,
    setLight(patch: Partial<Light>) { light = normaliseLight({ ...light, ...patch }); dirty = true; request(); },
    setEffects(patch: Partial<Effects>) { effects = { ...effects, ...patch }; dirty = true; request(); },
    reset() { light = DEFAULT_LIGHT; dirty = true; request(); },
    subscribe(fn: () => void) { globals.add(fn); fn(); return () => globals.delete(fn); },
    addTask(fn: FrameTask) { tasks.add(fn); return () => tasks.delete(fn); },
    dispose() { disposed = true; if (frame !== undefined) cancelAnimationFrame(frame); frame = undefined; globals.clear(); tasks.clear(); },
  };
}
export type Lighting = ReturnType<typeof createLighting>;
