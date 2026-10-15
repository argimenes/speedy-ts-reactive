import { onCleanup } from 'solid-js';
import type { VisualEffectRegistry } from '../runtime/visual-effect-registry';

let nextSpotlight = 0;
/** One stylesheet and geometry cache per mode. Masks target text flows only;
 * native viewport clipping and all existing SVG/control layers stay untouched. */
export function registerReadingSpotlight(registry: VisualEffectRegistry) {
  return registry.registerRenderer({
    name: 'reading-spotlight', target: 'text-presentation', focusKinds: ['geometry'],
    defaults: { shape: 'ellipse', radiusX: 180, radiusY: 85, dimOpacity: .65, feather: .7, scope: 'viewport', transitionMs: 0 },
    validate(params) {
      for (const [key, min, max] of [['radiusX', 1, 4000], ['radiusY', 1, 4000], ['dimOpacity', 0, 1], ['feather', 0, 1]] as const) {
        const value = params[key];
        if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw Error(`Invalid spotlight ${key}`);
      }
      if (params.shape !== 'ellipse' || params.scope !== 'viewport' || params.transitionMs !== 0) throw Error('Spotlight supports viewport ellipses with immediate tracking (transitionMs: 0)');
    },
    create({ document, params }) {
      const id = `spotlight-${++nextSpotlight}`;
      const style = document.createElement('style'); style.dataset.caretEffect = id;
      const selector = `[data-reading-spotlight="${id}"]`;
      // Repeat the same gradient coordinate field across flow boxes. No overlay
      // background colour assumptions, filters, DOM children or pointer targets.
      const gradient = (x: number, y: number, rx: number, ry: number) => `radial-gradient(ellipse ${rx}px ${ry}px at ${x}px ${y}px, #000 ${(1 - Number(params.feather)) * 100}%, rgba(0,0,0,${1 - Number(params.dimOpacity)}) 100%)`;
      style.textContent = `${selector}:not([data-reading-spotlight-lit]) { opacity: ${1 - Number(params.dimOpacity)}; } ${selector}[data-reading-spotlight-lit] { mask-mode: alpha; mask-repeat: no-repeat; mask-origin: border-box; mask-clip: no-clip; }`;
      document.head.append(style);
      const origins = new Map<HTMLElement, { x: number; y: number; width: number; height: number }>();
      const flows = new Set<HTMLElement>(), pending = new Set<HTMLElement>();
      let host: HTMLElement | undefined, revision = -1, scale = 0;
      const masks = new Map<HTMLElement, { value: string; priority: string }>();
      const published = new Map<HTMLElement, string>();
      const restoreMask = (flow: HTMLElement) => {
        if (!published.has(flow)) return;
        const previous = masks.get(flow);
        if (previous?.value) flow.style.setProperty('mask-image', previous.value, previous.priority);
        else flow.style.removeProperty('mask-image');
        published.delete(flow);
      };
      const clearHost = () => { host = undefined; };
      const remove = (flow: HTMLElement) => {
        if (flow.dataset.readingSpotlight === id) flow.removeAttribute('data-reading-spotlight');
        flow.removeAttribute('data-reading-spotlight-lit');
        restoreMask(flow);
      };
      onCleanup(() => { for (const flow of flows) remove(flow); clearHost(); flows.clear(); pending.clear(); origins.clear(); masks.clear(); published.clear(); style.remove(); });
      return {
        attach(flow) {
          flows.add(flow); pending.add(flow);
          masks.set(flow, { value: flow.style.getPropertyValue('mask-image'), priority: flow.style.getPropertyPriority('mask-image') });
          return () => { remove(flow); flows.delete(flow); pending.delete(flow); origins.delete(flow); masks.delete(flow); };
        },
        focus(_flow, region, frame) {
          if (region?.kind !== 'geometry' || region.space !== 'viewport' || !region.rects.length || !frame) {
            for (const flow of flows) { remove(flow); pending.add(flow); }
            clearHost(); revision = -1; return;
          }
          const changedHost = host !== frame.scope;
          const origin = frame.scope.getBoundingClientRect(), caret = region.rects[0];
          const x = (caret.left + caret.width / 2 - origin.left) / frame.scale + frame.scope.scrollLeft;
          const y = (caret.top + caret.height / 2 - origin.top) / frame.scale + frame.scope.scrollTop;
          const reflow = changedHost || revision !== frame.layoutRevision || scale !== frame.scale;
          // Only layout invalidation measures visible flow origins. Caret moves
          // and outer scrolls reuse them; no text or character geometry is read.
          const measured = [...(reflow ? flows : pending)].map(flow => {
            const box = flow.getBoundingClientRect();
            return { flow, x: (box.left - origin.left) / frame.scale + frame.scope.scrollLeft,
              y: (box.top - origin.top) / frame.scale + frame.scope.scrollTop, width: box.width / frame.scale, height: box.height / frame.scale };
          });
          // All layout reads above, all presentation writes below.
          if (changedHost) { clearHost(); host = frame.scope; }
          revision = frame.layoutRevision; scale = frame.scale;
          for (const entry of measured) origins.set(entry.flow, entry);
          const rx = Number(params.radiusX) / frame.scale, ry = Number(params.radiusY) / frame.scale;
          // Compare cached visible bounds; never traverse Blocks or read layout
          // here. Far flows retain a constant fade without a mask/compositing layer.
          for (const flow of flows) {
            const box = origins.get(flow); if (!box) continue;
            const cx = x - box.x, cy = y - box.y;
            const dx = Math.max(0, -cx, cx - box.width), dy = Math.max(0, -cy, cy - box.height);
            const lit = (dx / rx) ** 2 + (dy / ry) ** 2 < 1;
            if (flow.dataset.readingSpotlight !== id) flow.dataset.readingSpotlight = id;
            if (lit) {
              // mask-image is non-inherited. Custom properties would invalidate
              // styles on every character descendant each time the caret moves.
              const mask = gradient(cx, cy, rx, ry);
              if (published.get(flow) !== mask) { flow.style.setProperty('mask-image', mask); published.set(flow, mask); }
              if (!flow.hasAttribute('data-reading-spotlight-lit')) flow.setAttribute('data-reading-spotlight-lit', '');
            } else if (flow.hasAttribute('data-reading-spotlight-lit')) {
              flow.removeAttribute('data-reading-spotlight-lit');
              restoreMask(flow);
            }
          }
          pending.clear();
        },
      };
    },
  });
}
