import { splitProps, type JSX } from 'solid-js';
import type { Lighting } from './lighting';
import type { MaterialInteractions } from './material-interaction';
import type { Elevation, MaterialResponse } from './material-response';

type SurfaceProps = JSX.HTMLAttributes<HTMLDivElement> & { elevation?: Elevation };
export function FlintSurface(props: SurfaceProps) {
  const [local, rest] = splitProps(props, ['elevation', 'class', 'children']);
  return <div {...rest} class={`flint-material ${local.class ?? ''}`} data-elevation={local.elevation ?? 'flush'}>{local.children}</div>;
}
export function FlintPanel(props: SurfaceProps) { return <FlintSurface {...props} elevation={props.elevation ?? 'relief'} />; }
export function FlintButton(props: JSX.ButtonHTMLAttributes<HTMLButtonElement> & { elevation?: Elevation }) {
  const [local, rest] = splitProps(props, ['elevation', 'class', 'children']);
  return <button type="button" {...rest} class={`flint-material flint-material-button ${local.class ?? ''}`} data-elevation={local.elevation ?? 'relief'}>{local.children}</button>;
}
/** Explicit DOM adapter. Geometry is cached by ResizeObserver, never polled each frame. */
export function registerDomMaterial(root: HTMLElement, id: string, elevation: Elevation, lighting: Lighting, interactions: MaterialInteractions) {
  let geometry = { width: root.offsetWidth || 100, height: root.offsetHeight || 100 };
  const field = document.createElement('span'); field.className = 'flint-local-field'; field.setAttribute('aria-hidden', 'true');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.classList.add('flint-dom-wave'); svg.setAttribute('aria-hidden', 'true');
  const ring = document.createElementNS(svg.namespaceURI, 'circle'); svg.append(ring); root.append(field, svg);
  const apply = (r: MaterialResponse, active: boolean) => {
    root.style.setProperty('--flint-height', String(Math.abs(r.effectiveHeight)));
    root.style.setProperty('--flint-travel', `${-r.travel}px`);
    root.style.setProperty('--flint-contact-x', `${r.normalisedPosition.x * 100}%`);
    root.style.setProperty('--flint-contact-y', `${r.normalisedPosition.y * 100}%`);
    root.style.setProperty('--flint-contact', String(r.glow));
    root.style.boxShadow = `${r.shadow.inset ? 'inset ' : ''}${r.shadow.x}px ${r.shadow.y}px ${r.shadow.blur}px rgb(74 64 47 / ${r.shadow.opacity})`;
    root.dataset.localActive = String(active);
    ring.setAttribute('cx', String(r.wave.x)); ring.setAttribute('cy', String(r.wave.y));
    ring.setAttribute('r', String(r.wave.radius)); ring.setAttribute('opacity', String(r.wave.opacity));
  };
  const stop = interactions.register({ id, elevation, geometry: () => geometry, capabilities: [{ kind: 'inspect', label: 'Inspect material response', available: true }], apply,
    clientToLocal: p => { const bounds = root.getBoundingClientRect(); return { x: p.x - bounds.left, y: p.y - bounds.top }; },
  });
  const resize = new ResizeObserver(entries => {
    const box = entries[0].borderBoxSize[0];
    geometry = { width: box?.inlineSize ?? root.offsetWidth, height: box?.blockSize ?? root.offsetHeight };
    interactions.refresh(id);
  });
  resize.observe(root);
  const global = lighting.subscribe(() => interactions.refresh(id));
  return () => { stop(); global(); resize.disconnect(); field.remove(); svg.remove(); };
}
