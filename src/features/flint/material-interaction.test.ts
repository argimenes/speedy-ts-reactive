// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { createLighting } from './lighting';
import { createMaterialInteraction } from './material-interaction';
import type { MaterialResponse } from './material-response';

afterEach(() => vi.unstubAllGlobals());
function fixture() {
  const frames = new Map<number, FrameRequestCallback>(); let next = 0;
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => { frames.set(++next, fn); return next; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  const root = document.createElement('div'), lighting = createLighting(root), interactions = createMaterialInteraction(lighting);
  const flush = (now = performance.now()) => { const queued = [...frames]; frames.clear(); for (const [, fn] of queued) fn(now); };
  return { root, lighting, interactions, flush, frames };
}
it('coalesces global updates and confines local effects to registered targets without an idle loop', () => {
  const f = fixture(), values: Record<string, MaterialResponse[]> = { a: [], b: [] };
  for (const id of ['a', 'b']) f.interactions.register({ id, elevation: 'relief', geometry: () => ({ width: 100, height: 100 }), capabilities: [], apply: value => values[id].push(value) });
  f.flush(); values.a.length = values.b.length = 0;
  for (let i = 0; i < 40; i++) { f.lighting.setLight({ azimuth: i }); f.interactions.set('a', { contact: i / 40, lift: .5 }); }
  expect(f.frames.size).toBe(1); f.flush();
  expect(values.a).toHaveLength(1); expect(values.b).toHaveLength(0);
  expect(values.a[0].effectiveHeight).toBe(10); expect(f.frames.size).toBe(0);
  f.interactions.clear('a'); f.flush(); expect(values.a.at(-1)?.effectiveHeight).toBe(4);
  f.interactions.dispose(); f.lighting.dispose(); expect(f.frames.size).toBe(0);
});
it('expires impulses, clears their state and cancels queued work on disposal', () => {
  const f = fixture(); const applied: MaterialResponse[] = [];
  const stop = f.interactions.register({ id: 'a', elevation: 'object', geometry: () => ({ width: 100, height: 100 }), capabilities: [], apply: value => applied.push(value) });
  f.interactions.wave('a'); const start = f.interactions.state('a')!.wave!.startedAt;
  f.flush(start + 100); expect(f.frames.size).toBe(1);
  f.flush(start + 1000); expect(applied.at(-1)?.wave.active).toBe(false); expect(f.frames.size).toBe(0);
  expect(f.interactions.state('a')?.wave).toBeUndefined();
  f.interactions.wave('a'); f.flush(); stop(); f.flush(start + 1500);
  expect(f.interactions.activeCount).toBe(0); expect(f.frames.size).toBe(0);
  f.lighting.setLight({ azimuth: 20 }); f.interactions.dispose(); f.lighting.dispose();
  expect(f.frames.size).toBe(0);
});
