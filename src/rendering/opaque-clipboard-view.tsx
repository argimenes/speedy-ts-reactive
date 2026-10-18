import {restoreArchivedResource} from '../runtime/archived-resources';
import {RESOURCE_TYPES} from '../interchange/package/resources';
import { onCleanup, onMount,createSignal,Show } from 'solid-js';
import type { BlockViewProps } from '../block-tree/types';
import { useReactiveView } from '../reactive-editor/context';

/** Deliberately does not render children, arbitrary HTML or an original-type component. */
export function OpaqueClipboardView(props: BlockViewProps) {
  const { editor, projection } = useReactiveView();
  const [status,setStatus]=createSignal('');
  const node = () => projection.state.nodes[props.nodeKey];
  let root!: HTMLDivElement, release: (() => void) | undefined;
  onMount(() => { release = editor.mounts.register(props.nodeKey, { root, focusElement: root, inputPolicy: 'container', focus: () => root.focus({ preventScroll: true }) }); });
  onCleanup(() => release?.());
  return <div ref={root} tabIndex={-1} class="abstract-block" data-block-type="mutable/opaque-block" style={{ padding: '8px', border: '1px dashed #999' }}>
    <strong>Inactive imported content: {String((node()?.payload.original as any)?.type ?? 'unknown')}</strong>
    <p>{String(node()?.payload.preview ?? '')}</p>
    <Show when={editor.features.crossResourceLoaders&&RESOURCE_TYPES.includes(String((node()?.payload.original as any)?.type))}><button onClick={()=>{try{restoreArchivedResource(editor,props.nodeKey);}catch(e){setStatus(String(e));}}}>Restore retained resource locally</button><p role="status">{status()}</p><small>Uses package originals only. No network permissions or canonical claims are activated. Undo restores the inactive Block.</small></Show>
    <small>Original type and data retained for deliberate reinterpretation.</small>
  </div>;
}
