import { For, Show, createMemo, onCleanup, onMount } from "solid-js";
import { ReactiveViewProvider } from "../reactive-editor/context";
import { BlockOutlet } from "../rendering/block-outlet";
import { ReactiveViewLayers } from "../rendering/reactive-tree-view";
import { BackgroundMedia } from "../rendering/background-media";
import type { WindowGeometryHost } from "../rendering/window-geometry";
import type { WorkspaceSession } from "./workspace-session";
import "./workspace-presentation.css";

/** One provider and one overlay set survive presentation changes. Only roots remount. */
export function WorkspacePresentationView(props: { session: WorkspaceSession }) {
  const { editor, projection, presentation } = props.session;
  const canvas = createMemo(() => presentation.read()?.presentations.canvas);
  const roots = createMemo(() => presentation.active() === "canvas" ? props.session.canvasRoots() : []);
  const byId = createMemo(() => new Map(roots().map(root => [root.placement.id, root])));
  const geometry = (key: string): WindowGeometryHost | undefined => {
    const root = roots().find(item => item.nodeKey === key);
    if (!root) return;
    return { static: true, position: () => ({ x: 0, y: 0 }),
      expandedSize: () => { const b = byId().get(root.placement.id)!.placement.bounds; return { width: b.width, height: b.height }; },
      move: () => {}, resize: () => {},
    };
  };
  onMount(() => onCleanup(props.session.installPresentationInput(window)));
  return <ReactiveViewProvider editor={editor} projection={projection}
    coordinates={{ scale: () => presentation.active() === "canvas" ? canvas()?.camera.zoom ?? 1 : 1 }}
    windowGeometry={key => presentation.active() === "canvas" ? geometry(key) : undefined}>
    <Show when={presentation.active() === "canvas"} fallback={<BlockOutlet nodeKey={projection.state.rootKey} />}>
      <section class="workspace-canvas" aria-label="Canvas presentation" tabIndex={-1}>
        <Show when={canvas()?.background}>{background => <BackgroundMedia type={background().type} metadata={background().metadata} />}</Show>
        <div class="workspace-canvas__world" style={{ transform: `scale(${canvas()?.camera.zoom ?? 1}) translate(${- (canvas()?.camera.x ?? 0)}px, ${- (canvas()?.camera.y ?? 0)}px)` }}>
          <For each={roots().map(item => item.placement.id)}>{id => {
            const item = () => byId().get(id)!;
            const bounds = () => item().placement.bounds;
            return <section class="workspace-canvas__object" aria-label={item().label} data-canvas-placement={id}
              style={{ left: `${bounds().x}px`, top: `${bounds().y}px`, width: `${bounds().width}px`, height: `${bounds().height}px`, "z-index": item().placement.order }}>
              <Show when={item().nodeKey} keyed fallback={<div class="workspace-canvas__placeholder" role="status"><strong>{item().label}</strong><p>{item().reason}. The object and its saved placement are retained.</p></div>}>
                {key => <BlockOutlet nodeKey={key} />}
              </Show>
            </section>;
          }}</For>
        </div>
        <Show when={!roots().length}><p class="workspace-canvas__empty">This Canvas has no placements.</p></Show>
      </section>
    </Show>
    <ReactiveViewLayers editor={editor} projection={projection} />
  </ReactiveViewProvider>;
}
