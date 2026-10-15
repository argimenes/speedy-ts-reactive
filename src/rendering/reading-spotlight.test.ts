// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { createRoot } from 'solid-js';
import { VisualEffectRegistry, type TextPresentationEffect, type EffectParams } from '../runtime/visual-effect-registry';
import { registerReadingSpotlight } from './reading-spotlight';

const cleanups: (() => void)[] = [];
afterEach(() => { cleanups.splice(0).reverse().forEach(f => f()); vi.restoreAllMocks(); document.body.replaceChildren(); });
function fixture() {
  const registry = new VisualEffectRegistry(); registerReadingSpotlight(registry);
  const renderer = registry.renderer('reading-spotlight')!;
  if (renderer.target !== 'text-presentation') throw Error('wrong target');
  let effect!: TextPresentationEffect;
  createRoot(dispose => { cleanups.push(dispose); effect = renderer.create({ document, params: renderer.defaults, owner: { kind: 'session', key: 'test' } }); });
  const scope = document.body.appendChild(document.createElement('div'));
  const a = scope.appendChild(document.createElement('div')), b = scope.appendChild(document.createElement('div'));
  a.innerHTML = '<span style="color:purple">Text</span>'; b.innerHTML = '<span>Other</span>';
  const scopeRead = vi.spyOn(scope, 'getBoundingClientRect').mockReturnValue(new DOMRect(100, 200, 400, 500));
  const aRead = vi.spyOn(a, 'getBoundingClientRect').mockReturnValue(new DOMRect(110, 220, 300, 20));
  const bRead = vi.spyOn(b, 'getBoundingClientRect').mockReturnValue(new DOMRect(110, 270, 300, 20));
  const releaseA = effect.attach(a), releaseB = effect.attach(b);
  const draw = (x = 180, y = 230, scale = 1, layoutRevision = 0) => effect.focus(a, { kind: 'geometry', space: 'viewport', rects: [new DOMRectReadOnly(x, y, 0, 20)] }, { scope, scale, layoutRevision });
  return { effect, renderer, scope, a, b, draw, aRead, bRead, scopeRead, releaseA, releaseB };
}
it('aligns gradients across visible flows and reuses their origins across caret moves and outer scrolling', () => {
  const f = fixture(), cell = f.a.firstChild; f.draw();
  expect(f.a.style.maskImage).toContain('180px 85px at 70px 20px');
  expect(f.b.style.maskImage).toContain('at 70px -30px');
  f.aRead.mockClear(); f.bRead.mockClear();
  for (let i = 0; i < 100; i++) f.draw(180 + i, 230);
  expect(f.aRead).not.toHaveBeenCalled(); expect(f.bRead).not.toHaveBeenCalled();
  f.scopeRead.mockReturnValue(new DOMRect(100, 100, 400, 500)); f.draw(180, 130);
  expect(f.a.style.maskImage).toContain('at 70px 20px'); expect(f.aRead).not.toHaveBeenCalled();
  f.draw(180, 130, 1, 1); expect(f.aRead).toHaveBeenCalledTimes(1); expect(f.bRead).toHaveBeenCalledTimes(1);
  expect(f.a.firstChild).toBe(cell); expect((cell as HTMLElement).style.color).toBe('purple');
});
it('converts viewport radii and offsets under uniform scale and removes only its own contributions', () => {
  const f = fixture(); f.draw(180, 230, 2);
  expect(f.a.style.maskImage).toContain('90px 42.5px at 35px 10px');
  f.releaseB(); expect(f.b.dataset.readingSpotlight).toBeUndefined();
  f.effect.focus(undefined, undefined);
  expect(f.scope.style.cssText).toBe(''); expect(f.a.style.cssText).toBe(''); expect(f.a.dataset.readingSpotlight).toBeUndefined();
  expect((f.a.firstChild as HTMLElement).style.color).toBe('purple');
  f.draw(); cleanups.pop()!(); expect(document.querySelector('style[data-caret-effect]')).toBeNull();
  expect(f.a.dataset.readingSpotlight).toBeUndefined(); expect(f.scope.style.cssText).toBe('');
});
it('validates configurable radii, dimming, feather and unsupported animation/shape', () => {
  const f = fixture();
  const invalid: EffectParams[] = [{ radiusX: 0 }, { radiusY: NaN }, { feather: 2 }, { dimOpacity: -1 }, { shape: 'box' }, { transitionMs: 100 }];
  for (const params of invalid) expect(() => f.renderer.validate({ ...f.renderer.defaults, ...params })).toThrow();
  expect(() => f.renderer.validate({ ...f.renderer.defaults, radiusX: 250, radiusY: 100, feather: .9, dimOpacity: .8 })).not.toThrow();
});
it('leaves far flows unchanged during caret motion and restores existing flow masks on release', () => {
  const f = fixture();
  f.releaseB(); f.b.style.maskImage = 'linear-gradient(black, transparent)';
  const release = f.effect.attach(f.b);
  f.bRead.mockReturnValue(new DOMRect(110, 600, 300, 20));
  f.draw();
  const farStyle = vi.spyOn(f.b.style, 'setProperty'), farAttribute = vi.spyOn(f.b, 'setAttribute');
  for (let i = 0; i < 100; i++) f.draw(180 + i, 230);
  expect(farStyle).not.toHaveBeenCalled(); expect(farAttribute).not.toHaveBeenCalled();
  expect(f.b.hasAttribute('data-reading-spotlight-lit')).toBe(false);
  f.draw(180, 600);
  expect(f.b.style.maskImage).toContain('radial-gradient');
  release();
  expect(f.b.style.maskImage).toBe('linear-gradient(black, transparent)');
  expect(f.b.dataset.readingSpotlight).toBeUndefined();
});
