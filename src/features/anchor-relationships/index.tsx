import { For, Show, createEffect, createMemo, createSignal, onCleanup } from "solid-js";
import { Dynamic } from "solid-js/web";
import type { CodexFeature, FeatureScope } from "../../runtime/features";
import type { BlockPresentationProps } from "../../runtime/block-presentation";
import type { AnchorCapabilities, AnchorFrame, AnchorRecord } from "../../feature-api/anchors";
import { allowedTarget, anchorRecord, documentNodes, metadataAnchor, resolveAnchor } from "./model";
import "./anchors.css";

export function createAnchorRelationshipsFeature(capabilities: (scope: FeatureScope) => AnchorCapabilities): CodexFeature {
  return { id: "anchor-relationships", activate(scope) {
    const port = capabilities(scope);
    const commit = (key: string, target: string | undefined, offset: { x: number; y: number }) => {
      if (!Number.isFinite(offset.x) || !Number.isFinite(offset.y)) throw new Error("Offsets must be finite numbers.");
      if (target && !allowedTarget(port, key, target)) throw new Error("Choose an unanchored Block in this Document, or the Document itself.");
      port.commit(key, target, offset);
    };
    const Controls = (props: { nodeKey: string }) => {
      const [message, setMessage] = createSignal("");
      const record = () => anchorRecord(metadataAnchor(port.node(props.nodeKey)));
      const resolution = () => { port.revision(); const r = record(); return r && resolveAnchor(port, props.nodeKey, r); };
      const candidates = () => {
        port.revision(); const { nodes } = documentNodes(port, props.nodeKey);
        return nodes.filter(node => allowedTarget(port, props.nodeKey, node.key) &&
          (!node.payload.id || nodes.filter(other => other.payload.id === node.payload.id).length === 1));
      };
      const apply = (target: string | undefined, offset = record()?.offset ?? { x: 24, y: 12 }) => {
        try { commit(props.nodeKey, target, offset); setMessage(""); } catch (error) { setMessage(String(error instanceof Error ? error.message : error)); }
      };
      return <fieldset class="anchor-controls" data-anchor-controls>
        <legend>Anchor position</legend>
        <label>Relative to <select aria-label="Anchor Block" value={resolution()?.target ?? ""} onChange={event => apply(event.currentTarget.value || undefined)}>
          <option value="">Ordinary document flow</option>
          <For each={candidates()}>{node => <option value={node.key}>{node.viewType === "document-block" ? "Document" : `${node.viewType.replace(/-block$/, "")} — ${String(node.payload.text ?? (node.payload.metadata as any)?.title ?? node.payload.id ?? "Block").slice(0, 50)}`}</option>}</For>
        </select></label>
        <Show when={record()}>{value => <>
          <For each={["x", "y"] as const}>{axis => <label>{axis.toUpperCase()} <input type="number" aria-label={`Anchor offset ${axis}`} value={value().offset[axis]}
            disabled={!resolution()} onChange={event => apply(resolution()?.target, { ...value().offset, [axis]: event.currentTarget.valueAsNumber })} /></label>}</For>
          <button type="button" onClick={() => apply(undefined)}>Detach anchor</button>
          <Show when={!resolution()}><small role="status">Anchor unresolved. This Block is shown in document flow.</small></Show>
        </>}</Show>
        <Show when={message()}><small role="status">{message()}</small></Show>
      </fieldset>;
    };
    const View = (props: BlockPresentationProps) => {
      const record = createMemo(() => anchorRecord(metadataAnchor(port.node(props.nodeKey))));
      const resolution = createMemo(() => {
        const r = record(); if (!r) return;
        port.revision(); return resolveAnchor(port, props.nodeKey, r);
      }, undefined, { equals: (a, b) => a?.target === b?.target && a?.document === b?.document });
      return <Show when={resolution()} fallback={props.render()}>{resolved =>
        <Anchored {...props} port={port} record={() => record()!} target={() => resolved().target} document={() => resolved().document} commit={offset => commit(props.nodeKey, resolved().target, offset)} />
      }</Show>;
    };
    port.register({ view: View, controls: Controls });
  } };
}

function Anchored(props: BlockPresentationProps & { port: AnchorCapabilities; record(): AnchorRecord; target(): string; document(): string; commit(offset: { x: number; y: number }): void }) {
  const [frame, setFrame] = createSignal<AnchorFrame>();
  const [preview, setPreview] = createSignal<{ x: number; y: number }>();
  const [dragging, setDragging] = createSignal(false);
  let watcher: ReturnType<AnchorCapabilities["watch"]> | undefined;
  let drag: { id: number; button: HTMLButtonElement; x: number; y: number; grabX: number; grabY: number; signature: string } | undefined;
  const signature = () => JSON.stringify(props.record());
  const cancel = () => {
    const previous = drag; drag = undefined; setDragging(false); setPreview(undefined);
    if (previous?.button.hasPointerCapture?.(previous.id)) previous.button.releasePointerCapture(previous.id);
  };
  const update = (value: AnchorFrame) => {
    // Hidden B needs no position/style updates; only its anchor is checked.
    setFrame(previous => !value.visible && !drag && previous ? { ...previous, valid: value.valid, visible: false } : value);
    if (drag && !value.valid) { cancel(); return; }
    if (drag) setPreview({ x: (drag.x - drag.grabX - value.x) / value.scale, y: (drag.y - drag.grabY - value.y) / value.scale });
  };
  createEffect(() => {
    const target = props.target(), document = props.document(); props.scale();
    watcher = props.port.watch(props.nodeKey, target, document, props.scale, update);
    onCleanup(() => { watcher?.dispose(); cancel(); });
  });
  createEffect(() => { const current = signature(); if (drag && current !== drag.signature) cancel(); });
  const down = (event: PointerEvent & { currentTarget: HTMLButtonElement }) => {
    const value = watcher?.current() ?? frame(); if (event.button !== 0 || !value?.valid) return;
    event.preventDefault(); event.stopPropagation();
    const offset = props.record().offset;
    drag = { id: event.pointerId, button: event.currentTarget, x: event.clientX, y: event.clientY,
      grabX: event.clientX - value.x - offset.x * value.scale, grabY: event.clientY - value.y - offset.y * value.scale, signature: signature() };
    setDragging(true); event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId);
  };
  const move = (event: PointerEvent) => {
    if (!drag || drag.id !== event.pointerId) return;
    drag.x = event.clientX; drag.y = event.clientY; watcher?.refresh();
  };
  const finish = (event: PointerEvent) => {
    if (!drag || drag.id !== event.pointerId) return;
    // The last delivered frame may precede pointerup; include its final delta.
    const active = drag, value = watcher?.current() ?? frame();
    const offset = value?.valid ? { x: (event.clientX - active.grabX - value.x) / value.scale, y: (event.clientY - active.grabY - value.y) / value.scale } : undefined;
    cancel();
    if (offset && (offset.x !== props.record().offset.x || offset.y !== props.record().offset.y)) props.commit(offset);
  };
  const controls = <button type="button" class="anchor-drag-handle" aria-label="Move anchored Block" title="Drag to position; Escape cancels. Use Anchor position controls for numeric offsets."
      onPointerDown={down} onPointerMove={move} onPointerUp={finish} onPointerCancel={cancel} onLostPointerCapture={cancel}
      onKeyDown={event => { if (event.key === "Escape" && dragging()) { event.preventDefault(); event.stopPropagation(); cancel(); } }}>↔</button>;
  return <Show when={frame()}>{value => <Dynamic component={props.port.surface} nodeKey={props.nodeKey} frame={value()}
    visible={value().valid && (value().visible || dragging())} offset={preview() ?? props.record().offset} render={props.render} controls={controls} />}</Show>;
}
