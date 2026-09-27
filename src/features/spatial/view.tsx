import { For, Show, createEffect, createSignal, onCleanup, onMount } from "solid-js";
import { clampCamera, type SpatialCamera, type SpatialLayout, type SpatialObject } from "./model";
import { createStudyScene, type SceneStatus } from "./scene";
import { editingRectangle } from "./camera";
import "./spatial.css";
export interface SpatialPort {
  layout(): SpatialLayout | undefined; objects(): readonly SpatialObject[]; selected(): string | undefined; select(id: string | undefined): void;
  camera(value: SpatialCamera): void; available(): boolean; ownInteraction(value: { cancel(): void; finish(): void }): () => void; returnDesktop(): unknown;
}
/** A browses proxies only. It never mounts or requests focus in a live Document. */
export default function SpatialView(props: { port: SpatialPort }) {
  let canvas!: HTMLCanvasElement, host!: HTMLDivElement;
  let scene: ReturnType<typeof createStudyScene> | undefined, resize: ResizeObserver | undefined;
  const [surfaceGeneration, setSurfaceGeneration] = createSignal(1);
  const [error, setError] = createSignal("");
  const [status, setStatus] = createSignal<SceneStatus>();
  const [preview, setPreview] = createSignal<SpatialCamera>();
  const [rehearsal, setRehearsal] = createSignal(false);
  let gesture: { id: number; x: number; camera: SpatialCamera; moved: boolean } | undefined;
  const camera = () => preview() ?? props.port.layout()!.camera;
  const clearCapture = () => { const g = gesture; gesture = undefined; if (g && canvas.hasPointerCapture(g.id)) canvas.releasePointerCapture(g.id); };
  const cancel = () => { clearCapture(); setPreview(undefined); };
  const finish = () => { const next = preview(); clearCapture(); if (next) props.port.camera(next); setPreview(undefined); };
  const change = (patch: Partial<SpatialCamera>) => { if (!props.port.available() || error()) return; cancel(); props.port.camera(clampCamera({ ...camera(), ...patch })); };
  const startScene = () => {
    cancel(); scene?.dispose(); scene = undefined; setError("");
    try {
      scene = createStudyScene(canvas, setStatus, message => { cancel(); setError(message); });
      const rect = host.getBoundingClientRect(); scene.resize(rect.width, rect.height);
      const layout = props.port.layout(); if (layout) scene.update({ ...layout, camera: camera() }, props.port.objects(), props.port.selected(), rehearsal());
    } catch (e) { setError(`The study needs WebGL 2. ${e instanceof Error ? e.message : String(e)} Your workspace is preserved.`); }
  };
  onMount(() => {
    const release = props.port.ownInteraction({ cancel, finish });
    resize = new ResizeObserver(entries => { const size = entries[0]?.contentRect; if (size) scene?.resize(size.width, size.height); }); resize.observe(host);
    const blur = () => cancel(); window.addEventListener("blur", blur);
    onCleanup(() => { release(); resize?.disconnect(); window.removeEventListener("blur", blur); scene?.dispose(); scene = undefined; });

  });
  createEffect(() => { const layout = props.port.layout(); if (layout) scene?.update({ ...layout, camera: camera() }, props.port.objects(), props.port.selected(), rehearsal()); });
  const key = (event: KeyboardEvent) => {
    if (event.target !== canvas || event.ctrlKey || event.metaKey || event.altKey || !props.port.available()) return;
    if (event.key === "Escape") { cancel(); setRehearsal(false); event.preventDefault(); return; }
    const actions: Record<string, () => void> = {
      ArrowLeft: () => change({ yaw: camera().yaw + .12 }), ArrowRight: () => change({ yaw: camera().yaw - .12 }),
      ArrowUp: () => change({ approach: camera().approach + .1 }), ArrowDown: () => change({ approach: camera().approach - .1 }), Home: () => change({ yaw: 0, approach: 0 }),
    };
    if (actions[event.key]) { event.preventDefault(); actions[event.key](); }
  };
  const rect = () => editingRectangle(status()?.width ?? 1000, status()?.height ?? 800);
  // Retrying graphics replaces only this owned surface, never the WorkspaceSession.
  const Surface = () => {
    onMount(() => { startScene(); canvas.focus({ preventScroll: true }); });
    onCleanup(() => { cancel(); scene?.dispose(); scene = undefined; });
    return (
    <canvas ref={canvas} class="workspace-spatial__scene" tabIndex={0} aria-label="Study desk. Drag to swivel; arrow keys to swivel and approach; Home to recentre." onKeyDown={key}
      onPointerDown={event => { if (gesture || event.button !== 0 || !props.port.available() || error()) return; canvas.focus(); gesture = { id: event.pointerId, x: event.clientX, camera: { ...camera() }, moved: false }; canvas.setPointerCapture(event.pointerId); }}
      onPointerMove={event => { if (!gesture || gesture.id !== event.pointerId) return; if (!props.port.available()) { cancel(); return; } const dx = event.clientX - gesture.x; if (Math.abs(dx) > 4) gesture.moved = true; if (gesture.moved) setPreview(clampCamera({ ...gesture.camera, yaw: gesture.camera.yaw + dx / canvas.clientWidth * 1.6 })); }}
      onPointerUp={event => { if (!gesture || gesture.id !== event.pointerId) return; if (!gesture.moved && props.port.available()) props.port.select(scene?.hit(event.clientX, event.clientY)); finish(); }}
      onPointerCancel={cancel} onLostPointerCapture={cancel} />
    );
  };
  return <div class="workspace-spatial" ref={host} data-camera={camera().kind} data-frames={status()?.frames} data-geometries={status()?.geometries} data-textures={status()?.textures} data-calls={status()?.calls} data-alignment-error={status()?.alignmentError}>
    <Show when={surfaceGeneration()} keyed>{_generation => <Surface />}</Show>
    <div class="workspace-spatial__bar" aria-label="Spatial controls">
      <div class="workspace-spatial__title"><strong>The night study</strong><span>Spatial · study preview</span></div>
      <div class="workspace-spatial__controls">
        <button aria-label="Swivel left" disabled={!props.port.available() || !!error()} onClick={() => change({ yaw: camera().yaw + .18 })}>←</button>
        <button onClick={() => change({ yaw: 0, approach: 0 })} disabled={!props.port.available() || !!error()}>Recentre</button>
        <button aria-label="Swivel right" disabled={!props.port.available() || !!error()} onClick={() => change({ yaw: camera().yaw - .18 })}>→</button>
        <label>Approach <input type="range" min="0" max="1" step=".05" value={camera().approach} disabled={!props.port.available() || !!error()} onInput={e => { if (props.port.available() && !error()) setPreview(clampCamera({ ...camera(), approach: Number(e.currentTarget.value) })); }} onChange={finish} onPointerCancel={cancel} /></label>
        <label>Camera <select value={camera().kind} disabled={!props.port.available() || !!error()} onChange={e => change({ kind: e.currentTarget.value as SpatialCamera["kind"] })}><option value="perspective">Perspective</option><option value="orthographic">Orthographic</option></select></label>
        <button aria-pressed={rehearsal()} disabled={!props.port.available() || !!error()} onClick={() => setRehearsal(!rehearsal())}>Rehearse alignment</button>
        <button disabled={!props.port.available()} onClick={() => props.port.returnDesktop()}>Return to Desktop</button>
      </div>
    </div>
    <Show when={rehearsal() && !error()}><div class="workspace-spatial__alignment" style={{ left: `${rect().x}px`, top: `${rect().y}px`, width: `${rect().width}px`, height: `${rect().height}px` }}><span>Future editing area · non-editable alignment rehearsal</span></div></Show>
    <div class="workspace-spatial__footer">
      <details><summary>Workspace objects · {props.port.objects().length}</summary><ul><For each={props.port.objects()}>{object => <li><button aria-pressed={props.port.selected() === object.id} disabled={!props.port.available()} onClick={() => props.port.select(object.id)}>{object.label}<small>{object.reason ?? (props.port.layout()?.placements.some(p => p.objectId === object.id) ? object.kind : "Unplaced")}</small></button></li>}</For></ul><Show when={!props.port.objects().length}><p>Your desk is empty. Use Workspace → Open Document from Server, New Document or Open Image.</p></Show></details>
      <p role="status"><Show when={props.port.selected()} fallback="Drag the desk view to swivel. Documents remain physical page previews.">{props.port.objects().find(o => o.id === props.port.selected())?.label} · Full editing is available on Desktop; Spatial activation follows in Milestone B.</Show></p>
    </div>
    <Show when={error()}><div class="workspace-spatial__error" role="alert"><p>{error()}</p><button onClick={() => setSurfaceGeneration(n => n + 1)}>Retry study</button><button onClick={() => props.port.returnDesktop()}>Return to Desktop</button></div></Show>
  </div>;
}
