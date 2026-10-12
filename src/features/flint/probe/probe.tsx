import { onCleanup, onMount } from 'solid-js';
import { Probe, type ProbeProps } from '../../probe/probe';
import { probeTargets } from '../../probe/targets';

export { probePresentation } from '../../probe/probe';

/** Flint supplies its emblem target and lighting to the shared presentation Probe. */
export function FlintProbe(props: ProbeProps) {
  onMount(() => {
    const root = props.root();
    const eikon = root.querySelector<HTMLElement>('[data-probe-eikon]');
    if (eikon) onCleanup(probeTargets(root).register({
      id: 'flint-eikon', kind: 'flint-eikon',
      bounds: () => eikon.isConnected ? eikon.getBoundingClientRect() : undefined,
    }));
  });
  return <Probe {...props} label="Flint Probe" />;
}
