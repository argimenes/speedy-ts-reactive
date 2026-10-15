import { createEffect, createRoot, createSignal, onCleanup, untrack } from 'solid-js';
import { coordinateScale } from './local-coordinates';
import type { VisualEffectRegistry, ViewportPresentationFrame } from './visual-effect-registry';

/** Session presentation only. No caret, repository, text or annotation access. */
export class PointerSpotlight {
  private state = createSignal(false);
  private mounts = new Set<() => void>();
  private disposed = false;
  private disposeRoot: () => void;
  active = () => this.state[0]();
  constructor(private registry: VisualEffectRegistry, readonly available: boolean,
    private selectNormal: () => void, caretMode: () => string) {
    this.disposeRoot = createRoot(dispose => {
      createEffect(() => { if (caretMode() !== 'normal' || registry.renderer('pointer-spotlight')?.target !== 'viewport-presentation') this.state[1](false); });
      return dispose;
    });
  }
  setActive(active: boolean) {
    if (this.disposed || !this.available) return;
    if (active && this.registry.renderer('pointer-spotlight')?.target !== 'viewport-presentation') return;
    if (active) this.selectNormal();
    this.state[1](active);
  }
  toggle() { this.setActive(!this.active()); }

  mount(host: HTMLElement, scale: () => number = () => 1) {
    if (!this.available || this.disposed) return () => {};
    const disposeRoot = createRoot(dispose => {
      createEffect(() => {
        const renderer = this.registry.renderer('pointer-spotlight');
        if (!this.active() || renderer?.target !== 'viewport-presentation') return;
        const document = host.ownerDocument, win = document.defaultView!;
        const effect = renderer.create({ host, document, params: renderer.defaults, owner: { kind: 'session', key: 'pointer-spotlight' } });
        host.setAttribute('data-pointer-spotlight-host', '');
        let frame: number | undefined, point: { x: number; y: number } | undefined;
        let geometry: { origin: { x: number; y: number }; bounds: ViewportPresentationFrame['bounds']; scale: number } | undefined;
        let dirty = true;
        // Inspect ancestors once per enabled host, never Blocks or cells. Native
        // overflow clipping remains authoritative, including nested Page scrollers.
        const clips: { element: HTMLElement; x: boolean; y: boolean }[] = [];
        for (let element: HTMLElement | null = host; element; element = element.parentElement) {
          const css = win.getComputedStyle(element);
          const x = /auto|scroll|hidden|clip|overlay/.test(css.overflowX), y = /auto|scroll|hidden|clip|overlay/.test(css.overflowY);
          if (x || y) clips.push({ element, x, y });
        }
        const measure = () => {
          const factor = coordinateScale(scale()), rect = host.getBoundingClientRect();
          let left = Math.max(0, rect.left), top = Math.max(0, rect.top);
          let right = Math.min(win.innerWidth, rect.right), bottom = Math.min(win.innerHeight, rect.bottom);
          for (const clip of clips) {
            const box = clip.element === host ? rect : clip.element.getBoundingClientRect();
            // Client dimensions exclude borders and native scrollbar gutters.
            const clipScale = clip.element.offsetWidth ? box.width / clip.element.offsetWidth : factor;
            const x = box.left + clip.element.clientLeft * clipScale, y = box.top + clip.element.clientTop * clipScale;
            if (clip.x) { left = Math.max(left, x); right = Math.min(right, x + clip.element.clientWidth * clipScale); }
            if (clip.y) { top = Math.max(top, y); bottom = Math.min(bottom, y + clip.element.clientHeight * clipScale); }
          }
          const origin = { x: rect.left + host.clientLeft * factor - host.scrollLeft * factor, y: rect.top + host.clientTop * factor - host.scrollTop * factor };
          geometry = { origin, scale: factor, bounds: { x: (left - origin.x) / factor, y: (top - origin.y) / factor, width: Math.max(0, right - left) / factor, height: Math.max(0, bottom - top) / factor } };
          dirty = false;
        };
        const hide = () => { point = undefined; if (frame !== undefined) win.cancelAnimationFrame(frame); frame = undefined; effect.update(); };
        const flush = () => {
          frame = undefined;
          if (!point) return;
          if (dirty || !geometry || geometry.scale !== scale()) measure();
          const { origin, bounds, scale: factor } = geometry!;
          const local = { x: (point.x - origin.x) / factor, y: (point.y - origin.y) / factor };
          if (local.x < bounds.x || local.x >= bounds.x + bounds.width || local.y < bounds.y || local.y >= bounds.y + bounds.height) { effect.update(); return; }
          effect.update({ point: local, bounds, scale: factor });
        };
        const schedule = () => { if (point && frame === undefined) frame = win.requestAnimationFrame(flush); };
        const invalidate = () => { dirty = true; schedule(); };
        const move = (event: PointerEvent) => {
          if (event.pointerType === 'touch') { hide(); return; }
          const target = event.target;
          if (!(target instanceof Element) || !host.contains(target) || target.closest('button, select, input, [role="button"], [role="menu"], [role="dialog"]')) { hide(); return; }
          if (!point) dirty = true;
          point = { x: event.clientX, y: event.clientY }; schedule();
        };
        const visibility = () => { if (document.hidden) hide(); };
        host.addEventListener('pointermove', move, { passive: true, capture: true });
        host.addEventListener('pointerleave', hide); host.addEventListener('pointercancel', hide);
        document.addEventListener('scroll', invalidate, true);
        document.addEventListener('visibilitychange', visibility);
        win.addEventListener('resize', invalidate); win.addEventListener('blur', hide);
        win.visualViewport?.addEventListener('resize', invalidate); win.visualViewport?.addEventListener('scroll', invalidate);
        const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(invalidate) : undefined;
        observer?.observe(host); if (host.parentElement) observer?.observe(host.parentElement); for (const { element } of clips) if (element !== host) observer?.observe(element);
        onCleanup(() => {
          hide(); observer?.disconnect(); host.removeAttribute('data-pointer-spotlight-host');
          host.removeEventListener('pointermove', move, true); host.removeEventListener('pointerleave', hide); host.removeEventListener('pointercancel', hide);
          document.removeEventListener('scroll', invalidate, true); document.removeEventListener('visibilitychange', visibility);
          win.removeEventListener('resize', invalidate); win.removeEventListener('blur', hide);
          win.visualViewport?.removeEventListener('resize', invalidate); win.visualViewport?.removeEventListener('scroll', invalidate);
        });
        // Scale is an existing reactive coordinate source, not a DOM sweep.
        createEffect(() => { scale(); untrack(invalidate); });
      });
      return dispose;
    });
    const release = () => { if (this.mounts.delete(release)) disposeRoot(); };
    this.mounts.add(release); return release;
  }
  dispose() { if (this.disposed) return; this.disposed = true; this.disposeRoot(); for (const release of this.mounts) release(); this.state[1](false); }
}
