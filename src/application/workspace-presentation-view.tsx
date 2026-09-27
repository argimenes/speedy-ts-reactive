import { ErrorBoundary, Suspense, lazy, Show, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { ReactiveViewProvider } from "../reactive-editor/context";
import { BlockOutlet } from "../rendering/block-outlet";
import { ReactiveViewLayers } from "../rendering/reactive-tree-view";
import { BackgroundMedia } from "../rendering/background-media";
import type { WindowGeometryHost, WindowResizePort } from "../rendering/window-geometry";
import type { WorkspaceSession } from "./workspace-session";
import { CanvasView } from "../features/canvas/view";
import { createCanvasInteractions } from "../features/canvas/interactions";
import { canvasActions } from "./canvas-actions";
import "./workspace-presentation.css";

const SpatialView = lazy(() => import("../features/spatial/view"));

/** One provider and one overlay set survive switches; only active roots mount. */
export function WorkspacePresentationView(props: { session: WorkspaceSession }) {
  const { editor, projection, presentation } = props.session;
  const canvas = createMemo(() => presentation.read()?.presentations.canvas);
  const roots = createMemo(() => presentation.active() === "canvas" ? props.session.canvasRoots() : []);
  const input = createCanvasInteractions({ layout: canvas, available: () => props.session.inputAvailable(), camera: value => presentation.setCamera(value), bounds: (id, value) => presentation.setBounds(id, value) });
  const resizePorts = new Map<string, WindowResizePort>();
  const [resizeRevision, setResizeRevision] = createSignal(0);
  const resizePort = (id: string) => { resizeRevision(); return resizePorts.get(id); };
  const geometry = (key: string): WindowGeometryHost | undefined => {
    const root = roots().find(item => item.nodeKey === key);
    if (!root) return;
    const id = root.placement.id;
    return { static: true, position: () => ({ x: 0, y: 0 }),
      expandedSize: () => { const b = input.bounds(id) ?? root.placement.bounds; return { width: b.width, height: b.height }; },
      move: () => {}, resize: () => {},
      bindResize: port => { resizePorts.set(id, port); setResizeRevision(n => n + 1); return () => { resizePorts.delete(id); setResizeRevision(n => n + 1); }; },
    };
  };
  const actions = canvasActions(props.session);
  onMount(() => onCleanup(props.session.installPresentationInput(window)));
  const CanvasLifetime = () => {
    onMount(() => onCleanup(props.session.ownPresentationInteraction(input)));
    return null;
  };
  const [spatialResize, setSpatialResize] = createSignal<WindowResizePort>();
  const spatialGeometry = (key: string): WindowGeometryHost | undefined => {
    const actions = props.session.spatial;
    if (!actions || actions.activeRoot()?.nodeKey !== key) return;
    return { static: true, position: () => ({ x: 0, y: 0 }), expandedSize: actions.document.size,
      move: () => {}, resize: () => {}, bindResize: port => { setSpatialResize(port); return () => setSpatialResize(undefined); } };
  };
  const SpatialHost = () => {
    const actions = props.session.spatial!;
    const DocumentSlot = () => {
      onMount(actions.documentReady);
      return <Show when={actions.activeRoot()} keyed>{root => <BlockOutlet nodeKey={root.nodeKey} />}</Show>;
    };
    return <SpatialView port={{ layout: actions.layout, objects: actions.objects, selected: actions.selected, select: actions.select,
      camera: actions.camera, available: actions.available, ownInteraction: actions.ownInteraction, returnDesktop: actions.returnDesktop,
      document: actions.document, renderDocument: () => <DocumentSlot />, displayedSize: () => spatialResize()?.presentedSize() }} />;
  };
  return <ReactiveViewProvider editor={editor} projection={projection}
    coordinates={{ scale: () => presentation.active() === "canvas" ? input.camera().zoom : 1 }}
    windowGeometry={key => presentation.active() === "canvas" ? geometry(key) : presentation.active() === "spatial" ? spatialGeometry(key) : undefined}>
    <Show when={presentation.active() === "canvas"} fallback={<Show when={presentation.active() === "spatial" && props.session.spatial} fallback={<BlockOutlet nodeKey={projection.state.rootKey} />}>
      <ErrorBoundary fallback={(error, reset) => <div role="alert">Spatial could not load: {String(error)} <button onClick={reset}>Retry</button><button onClick={() => props.session.selectPresentation("desktop")}>Return to Desktop</button></div>}>
        <Suspense fallback={<p role="status">Opening the study…</p>}><SpatialHost /></Suspense>
      </ErrorBoundary>
    </Show>}>
      <CanvasLifetime />
      <CanvasView port={{ layout: canvas, roots, interactions: input, available: () => props.session.inputAvailable(), ...actions,
        setCamera: value => presentation.setCamera(value),
        displayedSize: id => resizePort(id)?.presentedSize(),
        resize: id => { const p = resizePort(id); return p && { size: p.presentedSize(), minimum: p.minimum(), expanded: p.toExpanded }; },
        render: key => roots().some(root => root.nodeKey === key) ? <BlockOutlet nodeKey={key} /> : null,
        background: () => <Show when={canvas()?.background}>{background => <BackgroundMedia type={background().type} metadata={background().metadata} />}</Show>,
      }} />
    </Show>
    <ReactiveViewLayers editor={editor} projection={projection} />
  </ReactiveViewProvider>;
}
