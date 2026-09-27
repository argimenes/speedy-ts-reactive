import { For, Show, createEffect, createSignal, onCleanup, onMount, type JSX } from "solid-js";
import { clampCamera, type SpatialCamera, type SpatialLayout, type SpatialObject } from "./model";
import { createStudyScene, type SceneStatus } from "./scene";
import { editingRectangle } from "./camera";
import "./spatial.css";
export interface SpatialDocumentPort {
  active(): { objectId: string; label: string } | undefined; eligible(id: string): boolean; activate(id: string): boolean;
  requestReturn(complete: () => void): boolean; release(): void; notice(): string;
  resize(size: { width: number; height: number }): void;
}
export interface SpatialPort {
  document: SpatialDocumentPort; renderDocument(): JSX.Element; displayedSize(): { width: number; height: number } | undefined;
  layout(): SpatialLayout | undefined; objects(): readonly SpatialObject[]; selected(): string | undefined; select(id: string | undefined): void;
  camera(value: SpatialCamera): void; available(): boolean; ownInteraction(value: { cancel(): void; finish(): void }): () => void; returnDesktop(): unknown;
}
/** The application supplies exactly one authorized live slot; the scene never owns editable DOM. */
export default function SpatialView(props: { port: SpatialPort }) {
  let canvas!: HTMLCanvasElement, host!: HTMLDivElement;
  let scene: ReturnType<typeof createStudyScene> | undefined, resize: ResizeObserver | undefined;
  const [surfaceGeneration, setSurfaceGeneration] = createSignal(1);
  const [error, setError] = createSignal("");
  const [status, setStatus] = createSignal<SceneStatus>();
  const [preview, setPreview] = createSignal<SpatialCamera>();
  const [rehearsal, setRehearsal] = createSignal(false);
  let gesture: { id: number; x: number; camera: SpatialCamera; moved: boolean } | undefined;
  const active = () => props.port.document.active();
  const [phase, setPhase] = createSignal<"desk" | "approaching" | "editing" | "returning">("desk");
  const [opacity, setOpacity] = createSignal(1);
  const [progress, setProgress] = createSignal(0);
  let animation = 0, generation = 0;
  const browsing = () => !active() && phase() === "desk";
  const stopMotion = () => {
    generation++; cancelAnimationFrame(animation); animation = 0;
    if (phase() === "returning") props.port.document.release();
    setPhase(active() ? "editing" : "desk"); setOpacity(1); setProgress(0);
    const id = active()?.objectId; scene?.handoff(id, id ? rect() : undefined, 1, 0);
  };
  const motion = (duration: number, step: (t: number) => void, done: () => void) => {
    const token = ++generation, start = performance.now();
    const tick = (now: number) => { if (token !== generation) return; const t = Math.min(1, (now - start) / duration); step(t); if (token !== generation) return; if (t < 1) animation = requestAnimationFrame(tick); else { animation = 0; done(); } };
    animation = requestAnimationFrame(tick);
  };
  const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const activate = (id?: string) => {
    if (!id || !browsing() || !props.port.available() || !props.port.document.eligible(id) || error()) return;
    cancel(); setRehearsal(false); props.port.select(id);
    if (reduced()) { props.port.document.activate(id); setPhase(active() ? "editing" : "desk"); scene?.handoff(id, rect(), 1, 0); return; }
    setPhase("approaching"); setOpacity(0);
    motion(480, t => {
      const p = Math.min(1, t / .82); setProgress(p);
      if (t >= .82 && !active() && !props.port.document.activate(id)) { stopMotion(); return; }
      const fade = Math.max(0, (t - .82) / .18); setOpacity(fade);
      scene?.handoff(id, rect(), p, 1 - fade);
    }, () => { setPhase(active() ? "editing" : "desk"); setOpacity(1); });
  };
  const returnToDesk = () => {
    if (phase() === "returning" || phase() === "approaching") return;
    props.port.document.requestReturn(() => {
      const id = active()?.objectId; if (!id) return;
      const target = rect();
      if (reduced() || error()) { props.port.document.release(); setPhase("desk"); scene?.handoff(); canvas.focus({ preventScroll: true }); return; }
      setPhase("returning");
      motion(400, t => {
        const fade = Math.min(1, t / .2), p = 1 - Math.max(0, (t - .2) / .8); setOpacity(1 - fade); setProgress(p);
        const base = editingRectangle(status()?.width ?? 1000, status()?.height ?? 800);
        const w = Math.min(target.width, base.width), h = Math.min(target.height, base.height);
        scene?.handoff(id, { x: base.x + (base.width - w) / 2, y: base.y, width: w, height: h }, p, fade);
        if (t >= .2 && active()) props.port.document.release();
      }, () => { setPhase("desk"); setOpacity(1); scene?.handoff(); canvas.focus({ preventScroll: true }); });
    });
  };
  const camera = () => preview() ?? props.port.layout()!.camera;
  const clearCapture = () => { const g = gesture; gesture = undefined; if (g && canvas.hasPointerCapture(g.id)) canvas.releasePointerCapture(g.id); };
  const cancel = () => { clearCapture(); setPreview(undefined); };
  const finish = () => { const next = preview(); clearCapture(); if (next) props.port.camera(next); setPreview(undefined); };
  const change = (patch: Partial<SpatialCamera>) => { if (!props.port.available() || error() || !browsing()) return; cancel(); props.port.camera(clampCamera({ ...camera(), ...patch })); };
  const startScene = () => {
    cancel(); scene?.dispose(); scene = undefined; setError("");
    try {
      scene = createStudyScene(canvas, setStatus, message => { cancel(); stopMotion(); setError(message); });
      const bounds = host.getBoundingClientRect(); scene.resize(bounds.width, bounds.height);
      const layout = props.port.layout(); if (layout) scene.update({ ...layout, camera: camera() }, props.port.objects(), props.port.selected(), rehearsal()); if (active()) scene.handoff(active()!.objectId, rect(), 1, 0);
    } catch (e) { setError(`The study needs WebGL 2. ${e instanceof Error ? e.message : String(e)} Your workspace is preserved.`); }
  };
  onMount(() => {
    const release = props.port.ownInteraction({ cancel: () => { cancel(); stopMotion(); props.port.document.release(); }, finish });
    resize = new ResizeObserver(entries => { const size = entries[0]?.contentRect; if (size) { scene?.resize(size.width, size.height); const r = editingRectangle(size.width, size.height); props.port.document.resize({ width: r.width, height: r.height }); } }); resize.observe(host);
    const blur = () => { cancel(); if (animation) stopMotion(); }; const visibility = () => { if (document.hidden && animation) stopMotion(); }; window.addEventListener("blur", blur); document.addEventListener("visibilitychange", visibility);
    onCleanup(() => { stopMotion(); props.port.document.release(); release(); resize?.disconnect(); window.removeEventListener("blur", blur); document.removeEventListener("visibilitychange", visibility); scene?.dispose(); scene = undefined; });

  });
  createEffect(() => { const layout = props.port.layout(); if (layout) scene?.update({ ...layout, camera: camera() }, props.port.objects(), props.port.selected(), rehearsal()); });
  createEffect(() => { if (!active() && phase() === "editing") { scene?.handoff(); setPhase("desk"); } });
  const key = (event: KeyboardEvent) => {
    if (phase() === "approaching" && event.target === canvas && event.key === "Escape") { event.preventDefault(); stopMotion(); return; }
    if (!browsing() || event.target !== canvas || event.ctrlKey || event.metaKey || event.altKey || !props.port.available()) return;
    if (event.key === "Enter") { event.preventDefault(); activate(props.port.selected()); return; }
    if (event.key === "Escape") { cancel(); setRehearsal(false); event.preventDefault(); return; }
    const actions: Record<string, () => void> = {
      ArrowLeft: () => change({ yaw: camera().yaw + .12 }), ArrowRight: () => change({ yaw: camera().yaw - .12 }),
      ArrowUp: () => change({ approach: camera().approach + .1 }), ArrowDown: () => change({ approach: camera().approach - .1 }), Home: () => change({ yaw: 0, approach: 0 }),
    };
    if (actions[event.key]) { event.preventDefault(); actions[event.key](); }
  };
  const rect = () => {
    const rect = editingRectangle(status()?.width ?? 1000, status()?.height ?? 800);
    const size = props.port.displayedSize();
    return size && active() ? { ...rect, x: rect.x + (rect.width - size.width) / 2, width: size.width, height: size.height } : rect;
  };
  // Retrying graphics replaces only this owned surface, never the WorkspaceSession.
  const Surface = () => {
    onMount(() => { startScene(); if (browsing()) canvas.focus({ preventScroll: true }); });
    onCleanup(() => { cancel(); scene?.dispose(); scene = undefined; });
    return (
    <canvas ref={canvas} class="workspace-spatial__scene" tabIndex={0} aria-label="Study desk. Drag to swivel; arrow keys to swivel and approach; Home to recentre." onKeyDown={key} onDblClick={event => activate(scene?.hit(event.clientX, event.clientY))}
      onPointerDown={event => { if (!browsing() || gesture || event.button !== 0 || !props.port.available() || error()) return; canvas.focus(); gesture = { id: event.pointerId, x: event.clientX, camera: { ...camera() }, moved: false }; canvas.setPointerCapture(event.pointerId); }}
      onPointerMove={event => { if (!gesture || gesture.id !== event.pointerId) return; if (!props.port.available()) { cancel(); return; } const dx = event.clientX - gesture.x; if (Math.abs(dx) > 4) gesture.moved = true; if (gesture.moved) setPreview(clampCamera({ ...gesture.camera, yaw: gesture.camera.yaw + dx / canvas.clientWidth * 1.6 })); }}
      onPointerUp={event => { if (!gesture || gesture.id !== event.pointerId) return; if (!gesture.moved && props.port.available()) props.port.select(scene?.hit(event.clientX, event.clientY)); finish(); }}
      onPointerCancel={cancel} onLostPointerCapture={cancel} />
    );
  };
  return <div class="workspace-spatial" ref={host} data-phase={phase()} data-handoff-progress={progress()} data-editing={active()?.objectId} data-camera={camera().kind} data-frames={status()?.frames} data-geometries={status()?.geometries} data-textures={status()?.textures} data-calls={status()?.calls} data-alignment-error={status()?.alignmentError}>
    <Show when={surfaceGeneration()} keyed>{_generation => <Surface />}</Show>
    <div class="workspace-spatial__bar" aria-label="Spatial controls">
      <div class="workspace-spatial__title"><strong>The night study</strong><span>{active()?.label ?? "Spatial workspace"}</span></div>
      <div class="workspace-spatial__controls">
        <button aria-label="Swivel left" disabled={!browsing() || !props.port.available() || !!error()} onClick={() => change({ yaw: camera().yaw + .18 })}>←</button>
        <button onClick={() => change({ yaw: 0, approach: 0 })} disabled={!browsing() || !props.port.available() || !!error()}>Recentre</button>
        <button aria-label="Swivel right" disabled={!browsing() || !props.port.available() || !!error()} onClick={() => change({ yaw: camera().yaw - .18 })}>→</button>
        <label>Approach <input type="range" min="0" max="1" step=".05" value={camera().approach} disabled={!browsing() || !props.port.available() || !!error()} onInput={e => { if (browsing() && props.port.available() && !error()) setPreview(clampCamera({ ...camera(), approach: Number(e.currentTarget.value) })); }} onChange={finish} onPointerCancel={cancel} /></label>
        <label>Camera <select value={camera().kind} disabled={!browsing() || !props.port.available() || !!error()} onChange={e => change({ kind: e.currentTarget.value as SpatialCamera["kind"] })}><option value="perspective">Perspective</option><option value="orthographic">Orthographic</option></select></label>
        <button aria-pressed={rehearsal()} disabled={!browsing() || !props.port.available() || !!error()} onClick={() => setRehearsal(!rehearsal())}>Rehearse alignment</button>
        <Show when={active()}><button disabled={phase() === "approaching" || phase() === "returning"} onPointerDown={event => event.preventDefault()} onClick={returnToDesk}>Return to desk</button></Show>
        <button disabled={!props.port.available()} onClick={() => props.port.returnDesktop()}>Return to Desktop</button>
      </div>
    </div>
    <Show when={active()}><div class="workspace-spatial__document" inert={phase() === "returning"} style={{ opacity: opacity(), left: `${rect().x}px`, top: `${rect().y}px`, width: `${rect().width}px`, height: `${rect().height}px` }}>{props.port.renderDocument()}</div></Show>
    <Show when={browsing() && rehearsal() && !error()}><div class="workspace-spatial__alignment" style={{ left: `${rect().x}px`, top: `${rect().y}px`, width: `${rect().width}px`, height: `${rect().height}px` }}><span>Future editing area · non-editable alignment rehearsal</span></div></Show>
    <div class="workspace-spatial__footer" hidden={!browsing()}>
      <details><summary>Workspace objects · {props.port.objects().length}</summary><ul><For each={props.port.objects()}>{object => <li><button aria-pressed={props.port.selected() === object.id} disabled={!props.port.available()} onClick={() => props.port.select(object.id)}>{object.label}<small>{object.reason ?? (props.port.layout()?.placements.some(p => p.objectId === object.id) ? object.kind : "Unplaced")}</small></button></li>}</For></ul><Show when={!props.port.objects().length}><p>Your desk is empty. Use Workspace → Open Document from Server, New Document or Open Image.</p></Show></details>
      <p role="status"><Show when={props.port.selected()} fallback="Drag the desk view to swivel. Documents remain physical page previews.">{props.port.objects().find(o => o.id === props.port.selected())?.label} · Double-click its page or choose Read Document.</Show></p>
      <Show when={props.port.selected() && props.port.document.eligible(props.port.selected()!)}><button onClick={() => activate(props.port.selected())}>Read Document</button></Show>
    </div>
    <Show when={props.port.document.notice()}><p class="workspace-spatial__notice" role="status">{props.port.document.notice()}</p></Show>
    <Show when={error()}><div class="workspace-spatial__error" role="alert"><p>{error()}</p><button onPointerDown={event => event.preventDefault()} onClick={() => setSurfaceGeneration(n => n + 1)}>Retry study</button><button onClick={() => props.port.returnDesktop()}>Return to Desktop</button></div></Show>
  </div>;
}
