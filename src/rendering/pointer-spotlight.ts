import { onCleanup } from 'solid-js';
import type { VisualEffectRegistry } from '../runtime/visual-effect-registry';

/** One non-interactive gradient above the document, below its control layers. */
export function registerPointerSpotlight(registry: VisualEffectRegistry) {
  return registry.registerRenderer({
    name: 'pointer-spotlight', target: 'viewport-presentation',
    defaults: { radiusX: 180, radiusY: 85, dimOpacity: .65, feather: .7 },
    validate(params) {
      for (const [key, min, max] of [['radiusX', 1, 4000], ['radiusY', 1, 4000], ['dimOpacity', 0, 1], ['feather', 0, 1]] as const) {
        const value = params[key];
        if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw Error(`Invalid spotlight ${key}`);
      }
    },
    create({ host, document, params }) {
      const overlay = document.createElement('div');
      overlay.className = 'pointer-spotlight'; overlay.setAttribute('aria-hidden', 'true');
      overlay.hidden = true; host.append(overlay);
      onCleanup(() => overlay.remove());
      const write = (name: string, value: string) => { if (overlay.style.getPropertyValue(name) !== value) overlay.style.setProperty(name, value); };
      return { update(frame) {
        if (!frame) { overlay.hidden = true; return; }
        const { bounds, point, scale } = frame;
        write('left', `${bounds.x}px`); write('top', `${bounds.y}px`);
        write('width', `${bounds.width}px`); write('height', `${bounds.height}px`);
        // Non-inherited property on a single empty element. No style invalidation
        // in text descendants, masks, filters or per-character contributions.
        write('background-image', `radial-gradient(ellipse ${Number(params.radiusX) / scale}px ${Number(params.radiusY) / scale}px at ${point.x - bounds.x}px ${point.y - bounds.y}px, transparent ${(1 - Number(params.feather)) * 100}%, rgba(0,0,0,${params.dimOpacity}) 100%)`);
        overlay.hidden = false;
      } };
    },
  });
}
