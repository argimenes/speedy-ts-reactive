import { For, Show, createSignal, onCleanup, type JSX } from "solid-js";
import type { CanvasLayout } from "../../reactive-editor/workspace-presentation";
import { createCanvasInteractions, type CanvasResize } from "./interactions";

export interface CanvasViewPort {
  layout(): CanvasLayout | undefined;
  roots(): Array<{ placement: CanvasLayout["placements"][number]; label: string; nodeKey?: string; reason?: string; embedded?: boolean }>;
  available(): boolean;
  interactions: ReturnType<typeof createCanvasInteractions>;
  resize(id: string): CanvasResize | undefined;
  displayedSize(id: string): { width: number; height: number } | undefined;
  remove(id: string): void;
  order(id: string, direction: number): void;
  nudge(id: string, dx: number, dy: number): void;
  media(id: string, closed: boolean): void;
  candidates(): Array<{ id: string; label: string }>;
  add(id: string): string;
  create(kind: "document" | "image" | "counter", value: string): string;
  activate(id: string): void;
  render(key: string): JSX.Element;
  background(): JSX.Element;
  setCamera(camera: CanvasLayout["camera"]): void;
}
export function CanvasView(props: { port: CanvasViewPort }) {
  const p = props.port, input = p.interactions;
  const [selected, select] = createSignal<string>();
  const [adding, setAdding] = createSignal(false), [message, setMessage] = createSignal("");
  let viewport!: HTMLElement;
  const attempt = (fn: () => void) => { if (!p.available()) return; try { input.finish(); fn(); setMessage(""); } catch (e) { setMessage(String(e instanceof Error ? e.message : e)); } };
  const center = () => ({ x: viewport.clientWidth / 2, y: viewport.clientHeight / 2 });
  const isBackground = (target: EventTarget | null) => target instanceof Element && !target.closest("[data-canvas-placement], .workspace-canvas__toolbar, .workspace-canvas__add");
  const wheel = (e: WheelEvent) => { if (isBackground(e.target)) { const rect = viewport.getBoundingClientRect(); input.wheel(e, { x: e.clientX - rect.left, y: e.clientY - rect.top }); } };
  const fit = () => {
    const placements = p.layout()?.placements ?? []; if (!placements.length) { p.setCamera({ x: 0, y: 0, zoom: 1 }); return; }
    const left = Math.min(...placements.map(p => p.bounds.x)), top = Math.min(...placements.map(p => p.bounds.y));
    const right = Math.max(...placements.map(p => p.bounds.x + p.bounds.width)), bottom = Math.max(...placements.map(p => p.bounds.y + p.bounds.height));
    const zoom = Math.max(.1, Math.min(2, (viewport.clientWidth - 80) / (right - left), (viewport.clientHeight - 120) / (bottom - top)));
    p.setCamera({ ...input.camera(), x: left - 40 / zoom, y: top - 80 / zoom, zoom });
  };
  const reveal = (id: string) => { select(id); const b = input.bounds(id); if (b) p.setCamera({ ...input.camera(), x: b.x - 40 / input.camera().zoom, y: b.y - 80 / input.camera().zoom }); };
  const remove = (id: string) => { p.remove(id); select(undefined); viewport.focus({ preventScroll: true }); };
  const chromeKey = (e: KeyboardEvent, id: string) => {
    if (e.target !== e.currentTarget || e.isComposing || !p.available()) return;
    if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); e.stopPropagation(); attempt(() => remove(id)); }
    else if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) { e.preventDefault(); e.stopPropagation(); const step = e.shiftKey ? 1 : 10; attempt(() => p.nudge(id, e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0, e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0)); }
    else if (e.key === "Enter") { e.preventDefault(); p.activate(id); }
    else if (e.key === "Escape") { select(undefined); e.preventDefault(); }
  };
  onCleanup(input.cancel);
  return <section ref={el => { viewport = el; el.addEventListener("wheel", wheel, { passive: false }); onCleanup(() => el.removeEventListener("wheel", wheel)); }} class="workspace-canvas" aria-label="Canvas presentation" tabIndex={-1}
    onPointerDown={e => { if (isBackground(e.target)) { select(undefined); input.start(e, "pan"); } }}>
    {p.background()}
    <div class="workspace-canvas__world" style={{ transform: `scale(${input.camera().zoom}) translate(${-input.camera().x}px, ${-input.camera().y}px)` }}>
      <For each={p.roots().map(r => r.placement.id)}>{id => {
        const item = () => p.roots().find(r => r.placement.id === id)!;
        const b = () => input.bounds(id)!;
        const size = () => p.displayedSize(id) ?? b();
        return <section class="workspace-canvas__object" classList={{ "workspace-canvas__object--selected": selected() === id }} aria-label={item().label} data-canvas-placement={id}
          style={{ left: `${b().x}px`, top: `${b().y}px`, width: `${size().width}px`, height: `${size().height}px`, "z-index": item().placement.order }}>
          <Show when={item().nodeKey} keyed fallback={<div class="workspace-canvas__placeholder" role="status"><strong>{item().label}</strong><p>{item().reason}. The object and its saved placement are retained.</p></div>}>{key => p.render(key)}</Show>
          <div class="workspace-canvas__handle" role="button" tabIndex={0} aria-label={`Move ${item().label}`} aria-pressed={selected() === id}
            onFocus={() => select(id)} onKeyDown={e => chromeKey(e, id)} onDblClick={() => p.activate(id)}
            onPointerDown={e => { select(id); input.start(e, e.button === 1 ? "pan" : "move", id); }}>{item().label}</div>
          <Show when={selected() === id}><button class="workspace-canvas__resize" aria-label={`Resize ${item().label}`} onPointerDown={e => input.start(e, "resize", id, p.resize(id))}>↘</button></Show>
        </section>;
      }}</For>
    </div>
    <Show when={input.owned()}><div class="workspace-canvas__shield" data-canvas-shield /></Show>
    <nav class="workspace-canvas__toolbar" aria-label="Canvas controls">
      <button onClick={() => input.zoom(1 / 1.25, center())} aria-label="Zoom out">−</button><output>{Math.round(input.camera().zoom * 100)}%</output><button onClick={() => input.zoom(1.25, center())} aria-label="Zoom in">+</button>
      <button onClick={() => attempt(() => p.setCamera({ ...input.camera(), x: 0, y: 0, zoom: 1 }))}>Reset view</button><button onClick={() => attempt(fit)}>Fit objects</button>
      <button onClick={() => setAdding(!adding())} aria-expanded={adding()}>Add object</button>
      <Show when={selected()}>{id => <><button onClick={() => p.activate(id())}>Edit object</button><button onClick={() => attempt(() => p.order(id(), 1))}>Bring forward</button><button onClick={() => attempt(() => p.order(id(), -1))}>Send backward</button><button onClick={() => attempt(() => p.order(id(), Infinity))}>Bring to front</button><button onClick={() => attempt(() => p.order(id(), -Infinity))}>Send to back</button><button aria-label="Move left" onClick={() => attempt(() => p.nudge(id(), -10, 0))}>←</button><button aria-label="Move right" onClick={() => attempt(() => p.nudge(id(), 10, 0))}>→</button><button aria-label="Move up" onClick={() => attempt(() => p.nudge(id(), 0, -10))}>↑</button><button aria-label="Move down" onClick={() => attempt(() => p.nudge(id(), 0, 10))}>↓</button><button onClick={() => attempt(() => remove(id()))}>Remove from Canvas</button><Show when={p.roots().find(r => r.placement.id === id())?.embedded}><button onClick={() => attempt(() => p.media(id(), !!p.roots().find(r => r.placement.id === id())?.nodeKey))}>{p.roots().find(r => r.placement.id === id())?.nodeKey ? "Close embedded media (discard form drafts)" : "Open embedded media"}</button></Show></>}</Show>
      <small>Drag background to pan · Alt + wheel to zoom</small>
    </nav>
    <Show when={adding()}><aside class="workspace-canvas__add" aria-label="Add Canvas object">
      <strong>Existing workspace objects</strong><For each={p.candidates()}>{item => <button onClick={() => attempt(() => reveal(p.add(item.id)))}>{item.label}</button>}</For>
      <form onSubmit={e => { e.preventDefault(); const data = new FormData(e.currentTarget); attempt(() => { reveal(p.create(data.get("kind") as "document" | "image" | "counter", String(data.get("value") ?? ""))); setAdding(false); }); }}>
        <label>New object <select name="kind"><option value="document">Document Window</option><option value="image">Image</option><option value="counter">Counter application</option></select></label>
        <label>Title or image URL <input name="value" /></label><button type="submit">Create object</button>
      </form><p>Images require a portable HTTP(S) or data URL. Removing a placement keeps its content.</p>
    </aside></Show>
    <Show when={message()}><p class="workspace-canvas__message" role="alert">{message()}</p></Show>
    <Show when={!p.roots().length}><p class="workspace-canvas__empty">This Canvas has no placements.</p></Show>
  </section>;
}
