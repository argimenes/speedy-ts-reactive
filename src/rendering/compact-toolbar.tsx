import { For, Show, createMemo, createSignal, onCleanup, onMount, type JSX } from "solid-js";
import { Portal } from "solid-js/web";

export type Toolset = "Typography" | "Annotations" | "Visual effects";
export const toolsets: readonly Toolset[] = ["Typography", "Annotations", "Visual effects"];
/** Presentation only. Actions remain owned by DocumentStyleBar and existing services. */
export interface CompactTool {
  id: string;
  label: string;
  glyph: string;
  description?: string;
  toolset: Toolset;
  width?: number;
  disabled?: () => boolean;
  pressed?: () => boolean;
  persistent?: boolean;
  run?: () => void;
  panel?: () => JSX.Element;
}

export function CompactToolbar(props: {
  tools: CompactTool[];
  toolset: Toolset;
  onToolset: (value: Toolset) => void;
  capture: () => void;
  restore: () => void;
  retainSelection: (event: PointerEvent) => void;
  more: () => JSX.Element;
}) {
  let root!: HTMLDivElement, strip!: HTMLDivElement, moreButton!: HTMLButtonElement;
  let popup: HTMLDivElement | undefined;
  let opener: HTMLElement | undefined;
  const [width, setWidth] = createSignal(0);
  const [panel, setPanel] = createSignal<"more" | CompactTool>();
  const [position, setPosition] = createSignal({ left: 0, top: 0, maxHeight: 400 });
  const persistent = createMemo(() => props.tools.filter(tool => tool.persistent));
  const current = createMemo(() => props.tools.filter(tool => !tool.persistent && tool.toolset === props.toolset));
  const visibleCount = createMemo(() => {
    let used = 0, count = 0;
    for (const tool of current()) { used += (tool.width ?? 36) + 3; if (used > width()) break; count++; }
    return count;
  });
  const close = (returnFocus = false) => {
    setPanel(undefined);
    if (returnFocus) (opener?.isConnected ? opener : moreButton).focus({ preventScroll: true });
  };
  const locate = () => {
    const rect = root.getBoundingClientRect();
    const top = Math.min(rect.bottom + 4, window.innerHeight - 100);
    setPosition({ left: Math.max(8, Math.min(rect.right - 340, window.innerWidth - 348)), top: Math.max(8, top), maxHeight: Math.max(80, window.innerHeight - top - 12) });
  };
  const open = (value: "more" | CompactTool, event: MouseEvent) => {
    props.capture(); opener = root.contains(event.currentTarget as Node) ? event.currentTarget as HTMLElement : moreButton;
    if (panel() === value) { close(true); return; }
    locate(); setPanel(value);
    // Both pointer and keyboard opening establish predictable dialog navigation.
    queueMicrotask(() => popup?.querySelector<HTMLElement>('button:not(:disabled), input, select, [tabindex="0"]')?.focus({ preventScroll: true }));
  };
  const activate = (tool: CompactTool, event: MouseEvent) => {
    if (tool.panel) open(tool, event);
    else {
      tool.run?.(); close();
      if (event.detail === 0 && (!document.activeElement || document.activeElement === document.body || (document.activeElement as Element).closest(".reactive-standoff-flow"))) {
        (event.currentTarget instanceof HTMLElement && event.currentTarget.isConnected ? event.currentTarget : moreButton).focus({ preventScroll: true });
      }
    }
  };
  const change = (value: Toolset) => { props.capture(); close(); props.onToolset(value); };
  const step = (direction: number) => change(toolsets[(toolsets.indexOf(props.toolset) + direction + toolsets.length) % toolsets.length]);
  let wheelTotal = 0, wheelLatched = false, wheelTimer: ReturnType<typeof setTimeout> | undefined;
  const wheel = (event: WheelEvent) => {
    if (event.ctrlKey || event.metaKey || panel() || Math.abs(event.deltaX) > Math.abs(event.deltaY) || !event.deltaY) return;
    event.preventDefault();
    clearTimeout(wheelTimer);
    wheelTimer = setTimeout(() => { wheelLatched = false; wheelTotal = 0; }, 180);
    if (wheelLatched) return;
    wheelTotal += event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 120 : 1);
    if (Math.abs(wheelTotal) >= 50) { step(Math.sign(wheelTotal)); wheelLatched = true; }
  };
  const keys = (event: KeyboardEvent) => {
    if (!root.contains(event.target as Node)) return;
    if ((event.target as Element).matches('select, input, textarea')) return;
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); props.restore(); return; }
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const controls = [...root.querySelectorAll<HTMLElement>('button:not(:disabled), select')].filter(item => item.getClientRects().length);
    const index = controls.indexOf(document.activeElement as HTMLElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? controls.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + controls.length) % controls.length;
    event.preventDefault(); controls[next]?.focus();
  };
  onMount(() => {
    const measure = () => {
      // Move keyboard focus to More if a resize removes the focused command.
      const active = document.activeElement as HTMLElement | null;
      const wasInside = root.contains(active);
      const id = active?.closest<HTMLElement>('[data-tool-id]')?.dataset.toolId;
      setWidth(strip.getBoundingClientRect().width);
      if (id && !persistent().some(tool => tool.id === id) && !current().slice(0, visibleCount()).some(tool => tool.id === id) && wasInside) moreButton.focus();
    };
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(measure);
    observer?.observe(strip); measure();
    const outside = (event: PointerEvent) => {
      if (panel() && !root.contains(event.target as Node) && !popup?.contains(event.target as Node)) close();
    };
    const reposition = () => { if (panel()) locate(); };
    document.addEventListener("pointerdown", outside, true);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    onCleanup(() => { observer?.disconnect(); document.removeEventListener("pointerdown", outside, true); window.removeEventListener("resize", reposition); window.removeEventListener("scroll", reposition, true); clearTimeout(wheelTimer); });
  });
  const ToolButton = (p: { tool: CompactTool; overflow?: boolean }) => <button type="button" data-tool-id={p.tool.id}
    data-annotation-type={p.tool.id.includes("/") ? p.tool.id : undefined}
    aria-label={p.tool.label} title={p.tool.description ? `${p.tool.label}: ${p.tool.description}` : p.tool.label} disabled={p.tool.disabled?.()}
    aria-pressed={p.tool.pressed?.()}
    aria-haspopup={p.tool.panel ? "dialog" : undefined}
    style={p.overflow ? undefined : { width: `${p.tool.width ?? 36}px` }}
    onClick={event => activate(p.tool, event)}>{p.overflow ? p.tool.label : p.tool.glyph}</button>;
  return <div ref={root} class="compact-toolbar" role="toolbar" aria-label="Editing tools" onKeyDown={keys}>
    <div class="compact-toolbar__picker" onWheel={wheel}>
      <button type="button" class="compact-toolbar__cycle" aria-label="Previous toolset" title="Previous toolset" onClick={() => step(-1)}>‹</button>
      <select aria-label="Toolset" value={props.toolset} onPointerDown={props.capture} onFocus={props.capture} onChange={event => change(event.currentTarget.value as Toolset)}>
        <For each={toolsets}>{name => <option>{name}</option>}</For>
      </select>
      <button type="button" class="compact-toolbar__cycle" aria-label="Next toolset" title="Next toolset" onClick={() => step(1)}>›</button>
    </div>
    <div class="compact-toolbar__persistent"><For each={persistent()}>{tool => <ToolButton tool={tool} />}</For></div>
    <div ref={strip} class="compact-toolbar__tools"><For each={current().slice(0, visibleCount())}>{tool => <ToolButton tool={tool} />}</For></div>
    <button ref={moreButton} type="button" class="compact-toolbar__more" aria-haspopup="dialog" aria-expanded={panel() === "more"} onClick={event => open("more", event)}>More ▾</button>
    <Show when={panel()}>{value => <Portal><div ref={popup} class="document-style-bar compact-toolbar__panel" role="dialog" aria-label={value() === "more" ? "More editor tools" : (value() as CompactTool).label}
      data-native-context-menu data-cross-text-controls
      style={{ left: `${position().left}px`, top: `${position().top}px`, "max-height": `${position().maxHeight}px` }}
      onPointerDown={props.retainSelection}
      onKeyDown={event => {
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(true); }
        // This is a non-modal dialog: Tab may leave it, without a focus trap.
      }} onFocusOut={() => queueMicrotask(() => {
        // Native disclosure/colour controls can briefly leave focus on body.
        // Pointer click-away is handled separately; keep their panel alive mid-click.
        const active = document.activeElement;
        if (panel() && active && active !== document.body && !popup?.contains(active) && !root.contains(active)) close();
      })}>
      <header><strong>{value() === "more" ? props.toolset : (value() as CompactTool).label}</strong><button type="button" aria-label="Close tools" onClick={() => close(true)}>×</button></header>
      <Show when={value() === "more"} fallback={(value() as CompactTool).panel?.()}>
        <div class="compact-toolbar__overflow"><For each={current().slice(visibleCount())}>{tool => <ToolButton tool={tool} overflow />}</For></div>
        {props.more()}
      </Show>
    </div></Portal>}</Show>
  </div>;
}
