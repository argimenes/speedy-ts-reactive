import { createEffect, createSignal, onCleanup, onMount } from 'solid-js';
import type { ProbeLighting } from './lighting';
import type { ProbeController, ProbeState } from './controller';
import { PROBE_DEFAULT_HEIGHT, PROBE_MIN_HEIGHT, PROBE_MAX_HEIGHT } from './size';
import './probe.css';

export interface ProbeProps {
  /** The untransformed presentation region, including its editor and controls. */
  root: () => HTMLElement;
  lighting?: () => ProbeLighting | undefined;
  size?: number;
  label?: string;
}

const presentations = new WeakMap<HTMLElement, ProbeController>();
export const probePresentation = (root: HTMLElement) => presentations.get(root);

/** Mount inside any presentation's toolbar. Input and GPU lifetime belong to this component. */
export function Probe(props: ProbeProps) {
  const [size, setSize] = createSignal(props.size ?? PROBE_DEFAULT_HEIGHT);
  const [enabled, setEnabled] = createSignal(true);
  const [state, setState] = createSignal<ProbeState>({ visibility: 'outside', mode: 'default', proximity: 'none' });
  let controller: ProbeController | undefined, disposed = false;
  createEffect(() => { const value = props.size ?? size(); controller?.setSize(value); });
  onMount(() => {
    const root = props.root();
    void import('./controller').then(module => {
      if (disposed) return;
      controller = module.createProbeController(root, () => props.lighting?.(), setState);
      controller.setSize(props.size ?? size());
      controller.setEnabled(enabled());
      presentations.set(root, controller);
    }).catch(() => {
      if (!disposed) setState({ visibility: 'disabled', mode: 'default', proximity: 'none' });
    });
    onCleanup(() => { disposed = true; controller?.dispose(); presentations.delete(root); });
  });
  return <details class="probe-controls"><summary>Probe</summary><div>
    <label><input type="checkbox" aria-label={props.label ?? 'Probe pointer'} checked={enabled()} onChange={event => {
      setEnabled(event.currentTarget.checked); controller?.setEnabled(enabled());
    }} /> Stone pointer</label>
    <label>Probe size <output>{props.size ?? size()} px</output><input type="range" aria-label="Probe size" min={PROBE_MIN_HEIGHT} max={PROBE_MAX_HEIGHT} value={props.size ?? size()} onInput={event => setSize(Number(event.currentTarget.value))} /></label>
    <small>Space turns the Probe over; Alt + wheel rotates it. Space stays normal in text fields and focused controls.</small>
    <small>{state().visibility === 'disabled' ? 'Native pointer active.' : 'Typing hides the Probe; pointer movement restores it.'}</small>
  </div></details>;
}
