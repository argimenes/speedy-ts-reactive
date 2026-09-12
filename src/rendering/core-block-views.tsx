import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount, untrack } from "solid-js";
import type { BlockViewProps, NodeKey } from "../block-tree/types";
import { useReactiveView } from "../reactive-editor/context";
import { blockAppearance } from "./appearance";
import { BlockOutlet, ChildBlocks, RelationBlocks } from "./block-outlet";
import { BackgroundMedia } from "./background-media";
import { youtubeId } from "./backgrounds";
import { DocumentStyleBar } from "./document-style-bar";

function useContainerMount(nodeKey: NodeKey, root: () => HTMLElement) {
  const { editor } = useReactiveView();
  let dispose: (() => void) | undefined;
  onMount(() => {
    const element = root();
    dispose = editor.mounts.register(nodeKey, {
      root: element,
      focusElement: element,
      inputPolicy: "container",
      focus: () => element.focus({ preventScroll: true }),
    });
  });
  onCleanup(() => dispose?.());
}

function data(nodeKey: NodeKey, node: () => any) {
  return {
    "data-block-id": (node()?.payload.id as string | undefined) ?? "",
    "data-client-id": nodeKey,
    "data-runtime-key": nodeKey,
    "data-block-type": (node()?.payload.type as string | undefined) ?? node()?.viewType,
  };
}

export function GenericContainerView(props: BlockViewProps) {
  const { projection } = useReactiveView();
  const node = () => projection.state.nodes[props.nodeKey];
  const appearance = createMemo(() => blockAppearance(node()));
  let root!: HTMLDivElement;
  useContainerMount(props.nodeKey, () => root);
  return (
    <div
      ref={root}
      class={`abstract-block reactive-generic-block ${appearance().classes.join(" ")}`}
      style={{ ...appearance().style, ...(node()?.viewType === "container-block" && (node()?.payload.metadata as any)?.height ? { height: `${Number((node()?.payload.metadata as any).height)}px`, "overflow-y": "auto" } : {}) }}
      tabIndex={-1}
      {...data(props.nodeKey, node)}
    >
      <RelationBlocks parentKey={props.nodeKey} />
      <ChildBlocks parentKey={props.nodeKey} />
    </div>
  );
}

export function PageView(props: BlockViewProps) {
  const { projection } = useReactiveView();
  const node = () => projection.state.nodes[props.nodeKey];
  const appearance = createMemo(() => blockAppearance(node()));
  let root!: HTMLElement;
  useContainerMount(props.nodeKey, () => root);
  return (
    <article ref={root} class={`abstract-block reactive-page ${appearance().classes.join(" ")}`} style={appearance().style} tabIndex={-1} {...data(props.nodeKey, node)}>
      <RelationBlocks parentKey={props.nodeKey} />
      <ChildBlocks parentKey={props.nodeKey} />
    </article>
  );
}

export function ListView(props: BlockViewProps) {
  const { projection } = useReactiveView();
  const node = () => projection.state.nodes[props.nodeKey];
  let root!: HTMLDivElement;
  useContainerMount(props.nodeKey, () => root);
  return <div ref={root} class="abstract-block reactive-list" role="list" tabIndex={-1} {...data(props.nodeKey, node)}><ChildBlocks parentKey={props.nodeKey} /></div>;
}

export function TableView(props: BlockViewProps) {
  const { projection } = useReactiveView();
  const node = () => projection.state.nodes[props.nodeKey];
  let root!: HTMLDivElement;
  useContainerMount(props.nodeKey, () => root);
  return <div ref={root} class="abstract-block reactive-table" role="table" tabIndex={-1} {...data(props.nodeKey, node)}><ChildBlocks parentKey={props.nodeKey} /></div>;
}

export function TableRowView(props: BlockViewProps) {
  const { projection } = useReactiveView();
  const node = () => projection.state.nodes[props.nodeKey];
  let root!: HTMLDivElement;
  useContainerMount(props.nodeKey, () => root);
  return <div ref={root} class="abstract-block reactive-table-row" role="row" tabIndex={-1} {...data(props.nodeKey, node)}><ChildBlocks parentKey={props.nodeKey} /></div>;
}

export function TableCellView(props: BlockViewProps) {
  const { projection } = useReactiveView();
  const node = () => projection.state.nodes[props.nodeKey];
  let root!: HTMLDivElement;
  useContainerMount(props.nodeKey, () => root);
  return <div ref={root} class="abstract-block reactive-table-cell" role="cell" tabIndex={-1} {...data(props.nodeKey, node)}><ChildBlocks parentKey={props.nodeKey} /></div>;
}

export function CheckboxView(props: BlockViewProps) {
  const { editor, projection } = useReactiveView();
  const node = () => projection.state.nodes[props.nodeKey];
  let root!: HTMLLabelElement;
  let checkbox!: HTMLInputElement;
  let dispose: (() => void) | undefined;
  onMount(() => {
    dispose = editor.mounts.register(props.nodeKey, {
      root,
      focusElement: checkbox,
      inputPolicy: "control",
      focus: () => checkbox.focus({ preventScroll: true }),
    });
  });
  onCleanup(() => dispose?.());
  return (
    <label ref={root} class="abstract-block reactive-checkbox" {...data(props.nodeKey, node)}>
      <input
        ref={checkbox}
        type="checkbox"
        checked={Boolean(node()?.payload.checked)}
        onChange={(event) => editor.commands.setPayloadField(props.nodeKey, "checked", event.currentTarget.checked, "Toggle Checkbox")}
      />
      <span class="reactive-checkbox__content"><ChildBlocks parentKey={props.nodeKey} /></span>
    </label>
  );
}

export function TabRowView(props: BlockViewProps) {
  const { editor, projection } = useReactiveView();
  const node = () => projection.state.nodes[props.nodeKey];
  const initial = node()?.children.find((key) => Boolean(projection.state.nodes[key]?.payload.metadata && (projection.state.nodes[key].payload.metadata as any).active)) ?? node()?.children[0];
  const [active, setActive] = createSignal<NodeKey | undefined>(initial);
  let previousFlags = "";
  let root!: HTMLDivElement;
  useContainerMount(props.nodeKey, () => root);
  createEffect(() => {
    const children = node()?.children ?? [];
    const flags = JSON.stringify(children.map(key => [key, (projection.state.nodes[key]?.payload.metadata as any)?.active]));
    if (flags !== previousFlags) {
      previousFlags = flags;
      const marked = children.find(key => (projection.state.nodes[key]?.payload.metadata as any)?.active);
      setActive(marked ?? (children.includes(untrack(active)!) ? untrack(active) : children[0]));
    }
  });
  return (
    <div ref={root} class="abstract-block reactive-tabs" tabIndex={-1} {...data(props.nodeKey, node)}>
      <div class="reactive-tabs__labels" role="tablist">
        <For each={node()?.children ?? []}>
          {(key, index) => {
            const child = () => projection.state.nodes[key];
            const metadata = () => child()?.payload.metadata as Record<string, unknown> | undefined;
            return <button type="button" role="tab" data-context-target={key} aria-selected={active() === key} onClick={() => { setActive(key); const target = child()?.children[0] ?? key; editor.focus.request(target, { reason: "activate-tab" }); }}>{String(metadata()?.name ?? metadata()?.text ?? `Tab ${index() + 1}`)}</button>;
          }}
        </For>
      </div>
      <For each={node()?.children ?? []}>{(key) => <Show when={active() === key}><div class="reactive-tabs__panel" role="tabpanel"><BlockOutlet nodeKey={key} /></div></Show>}</For>
    </div>
  );
}

export function StickyTabRowView(props: BlockViewProps) {
  const { editor, projection } = useReactiveView();
  const node = () => projection.state.nodes[props.nodeKey];
  const [active, setActive] = createSignal<NodeKey>();
  let previousFlags = "";
  let root!: HTMLElement;
  useContainerMount(props.nodeKey, () => root);
  createEffect(() => {
    const children = node()?.children ?? [];
    const flags = JSON.stringify(children.map(key => [key, (projection.state.nodes[key]?.payload.metadata as any)?.active]));
    if (flags !== previousFlags) {
      previousFlags = flags;
      const marked = children.find(key => (projection.state.nodes[key]?.payload.metadata as any)?.active);
      setActive(marked ?? (children.includes(untrack(active)!) ? untrack(active) : undefined));
    }
  });
  return (
    <aside ref={root} class="abstract-block reactive-sticky-tabs" {...data(props.nodeKey, node)}>
      <div class="reactive-sticky-tabs__labels" role="tablist" aria-label="Sticky tabs">
        <For each={node()?.children ?? []}>{(key, index) => {
          const child = () => projection.state.nodes[key];
          const metadata = () => child()?.payload.metadata as Record<string, unknown> | undefined;
          return (
            <button
              type="button"
              role="tab"
              data-context-target={key}
              aria-selected={active() === key}
              style={{
                color: String(metadata()?.color ?? "#23322e"),
                "background-color": String(metadata()?.backgroundColor ?? "gold"),
              }}
              onClick={() => {
                const next = active() === key ? undefined : key;
                setActive(next);
                if (next) {
                  const target = child()?.children[0] ?? key;
                  queueMicrotask(() => editor.focus.request(target, { reason: "activate-sticky-tab", caret: "start" }));
                }
              }}
            >
              {String(metadata()?.text ?? metadata()?.name ?? `Sticky tab ${index() + 1}`)}
            </button>
          );
        }}</For>
      </div>
      <For each={node()?.children ?? []}>{(key, index) => (
        <Show when={active() === key}>
          <div class="reactive-sticky-tabs__panel" role="tabpanel" style={{ top: `${index() * 38}px` }}>
            <BlockOutlet nodeKey={key} />
          </div>
        </Show>
      )}</For>
    </aside>
  );
}

export function FlippableSurfaceView(props: BlockViewProps) {
  const { editor, projection } = useReactiveView();
  const node = () => projection.state.nodes[props.nodeKey];
  const children = () => node()?.children ?? [];
  const active = () => children().find((key) => {
    const metadata = projection.state.nodes[key]?.payload.metadata as Record<string, unknown> | undefined;
    return metadata?.active === true;
  }) ?? children()[0];
  let root!: HTMLDivElement;
  useContainerMount(props.nodeKey, () => root);
  const label = (key: NodeKey, index: number) => {
    const child = projection.state.nodes[key];
    const metadata = child?.payload.metadata as Record<string, unknown> | undefined;
    if (typeof metadata?.name === "string") return metadata.name;
    if (typeof metadata?.text === "string") return metadata.text;
    if (child?.children.some((childKey) => projection.state.nodes[childKey]?.viewType === "image-block")) return "Image side";
    if (child?.children.some((childKey) => {
      const type = projection.state.nodes[childKey]?.viewType ?? "";
      return type.includes("text") || type === "standoff-editor-block" || type === "code-mirror-block";
    })) return "Text side";
    return `Side ${index + 1}`;
  };
  const flip = () => {
    const available = children();
    if (available.length < 2) return;
    const current = Math.max(0, available.indexOf(active()!));
    const next = available[(current + 1) % available.length];
    editor.commands.transaction("Flip Surface", () => {
      available.forEach((key) => {
        const child = projection.state.nodes[key];
        const metadata = (child?.payload.metadata as Record<string, unknown> | undefined) ?? {};
        editor.commands.setPayloadField(key, "metadata", { ...metadata, active: key === next }, "Flip Surface");
      });
    });
    const target = projection.state.nodes[next]?.children[0] ?? next;
    queueMicrotask(() => editor.focus.request(target, { reason: "flip-surface" }));
  };
  const nextLabel = () => {
    const available = children();
    const current = Math.max(0, available.indexOf(active()!));
    const next = available[(current + 1) % Math.max(1, available.length)];
    return next ? label(next, available.indexOf(next)) : "other side";
  };
  return (
    <section ref={root} class="abstract-block reactive-flippable" tabIndex={-1} aria-label="Two-sided Block" onDblClick={(event) => { event.preventDefault(); flip(); }} {...data(props.nodeKey, node)}>
      <button type="button" class="reactive-flippable__flip" onClick={flip}>
        Flip to {nextLabel().toLowerCase()}
      </button>
      <div class="reactive-flippable__card">
        <For each={children()}>{(key, index) => (
          <div
            class="reactive-flippable__side"
            classList={{
              "reactive-flippable__side--front": index() === 0,
              "reactive-flippable__side--back": index() !== 0,
              "reactive-flippable__side--active": active() === key,
            }}
            aria-hidden={active() !== key}
            data-side-label={label(key, index())}
          >
            <BlockOutlet nodeKey={key} />
          </div>
        )}</For>
      </div>
      <p class="reactive-flippable__hint">Double-click the card to turn it over.</p>
    </section>
  );
}

type CanvasBox = { id: string; x: number; y: number };

export function CanvasPreviewView(props: BlockViewProps) {
  const { projection } = useReactiveView();
  const node = () => projection.state.nodes[props.nodeKey];
  const [boxes, setBoxes] = createSignal<CanvasBox[]>([
    { id: "canvas-box-1", x: 145, y: 26 },
    { id: "canvas-box-2", x: 520, y: 176 },
  ]);
  let root!: HTMLDivElement;
  let drag: { id: string; pointerId: number; x: number; y: number; originX: number; originY: number } | undefined;
  useContainerMount(props.nodeKey, () => root);
  const move = (event: PointerEvent) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const x = Math.max(0, drag.originX + event.clientX - drag.x);
    const y = Math.max(0, drag.originY + event.clientY - drag.y);
    setBoxes((items) => items.map((item) => item.id === drag!.id ? { ...item, x, y } : item));
  };
  const end = (event: PointerEvent) => {
    if (drag?.pointerId === event.pointerId) drag = undefined;
  };
  return (
    <div ref={root} class="abstract-block reactive-canvas-preview" tabIndex={-1} onPointerMove={move} onPointerUp={end} onPointerCancel={end} {...data(props.nodeKey, node)}>
      <div class="reactive-canvas-preview__world">
        <For each={boxes()}>{(box) => (
          <button
            type="button"
            class="reactive-canvas-preview__box"
            style={{ left: `${box.x}px`, top: `${box.y}px` }}
            onPointerDown={(event) => {
              drag = { id: box.id, pointerId: event.pointerId, x: event.clientX, y: event.clientY, originX: box.x, originY: box.y };
              event.currentTarget.setPointerCapture?.(event.pointerId);
              event.stopPropagation();
            }}
          >Drag Me!</button>
        )}</For>
      </div>
      <div class="reactive-canvas-preview__minimap" aria-label="Canvas minimap">
        <For each={boxes()}>{(box) => <i style={{ left: `${box.x * .18}px`, top: `${box.y * .18}px` }} />}</For>
      </div>
      <ChildBlocks parentKey={props.nodeKey} />
    </div>
  );
}

export function TabPanelView(props: BlockViewProps) {
  const { projection } = useReactiveView();
  const node = () => projection.state.nodes[props.nodeKey];
  let root!: HTMLDivElement;
  useContainerMount(props.nodeKey, () => root);
  return <div ref={root} class="abstract-block reactive-tab-panel" tabIndex={-1} {...data(props.nodeKey, node)}><ChildBlocks parentKey={props.nodeKey} /></div>;
}

export function ImageView(props: BlockViewProps) {
  const { projection } = useReactiveView();
  const node = () => projection.state.nodes[props.nodeKey];
  const metadata = () => node()?.payload.metadata as Record<string, unknown> | undefined;
  const appearance = createMemo(() => blockAppearance(node()));
  let root!: HTMLElement;
  useContainerMount(props.nodeKey, () => root);
  return (
    <figure ref={root} class={`abstract-block reactive-image ${appearance().classes.join(" ")}`} style={appearance().style} tabIndex={-1} {...data(props.nodeKey, node)}>
      <img src={String(metadata()?.url ?? node()?.payload.filename ?? "")} alt={String(metadata()?.alt ?? "")} />
      <ChildBlocks parentKey={props.nodeKey} />
    </figure>
  );
}

export function IframeView(props: BlockViewProps) {
  const { projection } = useReactiveView();
  const node = () => projection.state.nodes[props.nodeKey];
  const metadata = () => node()?.payload.metadata as Record<string, unknown> | undefined;
  let root!: HTMLDivElement;
  useContainerMount(props.nodeKey, () => root);
  return <div ref={root} class="abstract-block reactive-iframe" tabIndex={-1} {...data(props.nodeKey, node)}><iframe src={String(metadata()?.url ?? node()?.payload.url ?? "about:blank")} title={String(metadata()?.title ?? "Embedded content")} /><ChildBlocks parentKey={props.nodeKey} /></div>;
}

export function YouTubeView(props: BlockViewProps) {
  const { projection } = useReactiveView();
  const node = () => projection.state.nodes[props.nodeKey];
  const metadata = () => node()?.payload.metadata as Record<string, unknown> | undefined;
  const source = createMemo(() => {
    const url = String(metadata()?.url ?? "");
    const id = youtubeId(url);
    return id ? `https://www.youtube-nocookie.com/embed/${id}?autoplay=0&playsinline=1&rel=0` : "about:blank";
  });
  let root!: HTMLDivElement;
  useContainerMount(props.nodeKey, () => root);
  return (
    <div ref={root} class="abstract-block reactive-video" tabIndex={-1} {...data(props.nodeKey, node)}>
      <iframe src={source()} title="YouTube video" loading="lazy" allow="accelerometer; encrypted-media; picture-in-picture" allowfullscreen />
      <ChildBlocks parentKey={props.nodeKey} />
    </div>
  );
}

export function CodeBlockView(props: BlockViewProps) {
  const { editor, projection } = useReactiveView();
  const node = () => projection.state.nodes[props.nodeKey];
  let root!: HTMLDivElement;
  let textarea!: HTMLTextAreaElement;
  let dispose: (() => void) | undefined;
  onMount(() => {
    dispose = editor.mounts.register(props.nodeKey, {
      root,
      focusElement: textarea,
      inputPolicy: "native-text",
      focus: () => textarea.focus({ preventScroll: true }),
      captureSelection: () => ({ start: textarea.selectionStart, end: textarea.selectionEnd, direction: textarea.selectionDirection }),
      restoreSelection: (selection) => textarea.setSelectionRange(selection.start, selection.end, selection.direction),
    });
  });
  onCleanup(() => dispose?.());
  return <div ref={root} class="abstract-block reactive-code" {...data(props.nodeKey, node)}><textarea ref={textarea} value={String(node()?.payload.text ?? "")} aria-label="Code editor" /><p class="reactive-code__notice">Plain text preview while CodeMirror integration is migrated.</p><ChildBlocks parentKey={props.nodeKey} /></div>;
}

export function StableBackgroundView(props: BlockViewProps) {
  const { projection } = useReactiveView();
  const node = () => projection.state.nodes[props.nodeKey];
  const metadata = () => node()?.payload.metadata as Record<string, unknown> | undefined;
  const type = () => String(node()?.payload.type ?? node()?.viewType);
  let root!: HTMLDivElement;
  useContainerMount(props.nodeKey, () => root);
  return (
    <div ref={root} class="abstract-block reactive-surface" tabIndex={-1} {...data(props.nodeKey, node)} data-block-type={type()}>
      <div class="reactive-surface__background">
        <BackgroundMedia type={type()} metadata={metadata()} />
      </div>
      <div class="reactive-surface__content"><ChildBlocks parentKey={props.nodeKey} /></div>
      <div class="reactive-surface__overlays" />
    </div>
  );
}

export function WindowView(props: BlockViewProps) {
  const { editor, projection } = useReactiveView();
  const node = () => projection.state.nodes[props.nodeKey];
  const metadata = () => (node()?.payload.metadata as Record<string, any> | undefined) ?? {};
  const appearance = createMemo(() => blockAppearance(node()));
  const [preview, setPreview] = createSignal<{ x: number; y: number }>();
  const [minimized, setMinimized] = createSignal(metadata().state === "minimized");
  let root!: HTMLDivElement;
  let dispose: (() => void) | undefined;
  let drag: { pointerId: number; x: number; y: number; originX: number; originY: number } | undefined;
  onMount(() => {
    dispose = editor.mounts.register(props.nodeKey, {
      root,
      focusElement: root,
      inputPolicy: "container",
      focus: () => root.focus({ preventScroll: true }),
    });
  });
  onCleanup(() => dispose?.());
  const position = () => preview() ?? { x: Number(metadata().position?.x ?? 20), y: Number(metadata().position?.y ?? 20) };
  const commitMetadata = (patch: Record<string, unknown>, label: string) => editor.commands.setPayloadField(props.nodeKey, "metadata", { ...metadata(), ...patch }, label);
  return (
    <div ref={root} class={`abstract-block reactive-window ${appearance().classes.join(" ")}`} classList={{ "reactive-window--minimized": minimized() }} tabIndex={-1} style={{ ...appearance().style, transform: `translate(${position().x}px, ${position().y}px)`, width: `${Number(metadata().size?.w ?? 840)}px`, height: minimized() ? "auto" : `${Number(metadata().size?.h ?? 620)}px`, "z-index": Number(metadata().zIndex ?? 1) }} {...data(props.nodeKey, node)}>
      <header class="reactive-window__header" onPointerDown={(event) => { if (event.ctrlKey || event.button !== 0) return; drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, originX: position().x, originY: position().y }; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={(event) => { if (!drag || drag.pointerId !== event.pointerId) return; setPreview({ x: drag.originX + event.clientX - drag.x, y: drag.originY + event.clientY - drag.y }); }} onPointerUp={(event) => { if (!drag || drag.pointerId !== event.pointerId) return; const final = position(); drag = undefined; setPreview(undefined); commitMetadata({ position: final }, "Move Window"); }}>
        <span>{String(metadata().title ?? "Untitled")}</span>
        <span class="reactive-window__controls">
          <button type="button" aria-label="Minimize window" onPointerDown={(e) => e.stopPropagation()} onClick={() => { const next = !minimized(); setMinimized(next); commitMetadata({ state: next ? "minimized" : "normal" }, "Minimize Window"); }}>−</button>
          <button type="button" aria-label="Close window" onPointerDown={(e) => e.stopPropagation()} onClick={() => editor.commands.remove(props.nodeKey)}>×</button>
        </span>
      </header>
      <Show when={!minimized()}>
        <Show when={node()?.viewType === "document-window-block"}><DocumentStyleBar editor={editor} scopeKey={props.nodeKey} /></Show>
        <div class="reactive-window__content"><ChildBlocks parentKey={props.nodeKey} /></div>
      </Show>
    </div>
  );
}
