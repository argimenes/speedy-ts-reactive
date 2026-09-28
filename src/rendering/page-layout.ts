/** Shared, demand-driven page chrome invalidation, extracted from PageMinimap.
 * A subscriber may return a write phase so geometry reads precede DOM writes.
 */
type ReadLayout = () => void | (() => void);
const pages = new WeakMap<HTMLElement, ReturnType<typeof createLayout>>();

function createLayout(page: HTMLElement) {
  const consumers = new Set<ReadLayout>();
  let frame = 0;
  let rects = new Map<Element, DOMRect>();
  const schedule = () => {
    if (frame || !consumers.size) return;
    frame = requestAnimationFrame(() => {
      frame = 0; rects = new Map();
      const writes = [...consumers].map(read => read());
      for (const write of writes) write?.();
    });
  };
  const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(schedule);
  const mutation = typeof MutationObserver === "undefined" ? undefined : new MutationObserver(schedule);
  const observed = new WeakSet<Element>();
  const observe = (element?: Element) => {
    if (!element || observed.has(element)) return;
    observed.add(element); observer?.observe(element);
  };
  observe(page); observe(page.querySelector(".reactive-page__main") ?? undefined);
  mutation?.observe(page, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["style", "class", "hidden", "aria-hidden"] });
  // Host translation/scale and visibility do not trigger ResizeObserver.
  for (let parent = page.parentElement; parent; parent = parent.parentElement) {
    observe(parent);
    mutation?.observe(parent, { attributes: true, attributeFilter: ["style", "class", "hidden", "aria-hidden"] });
  }
  document.addEventListener("scroll", schedule, true);
  window.addEventListener("resize", schedule);
  window.visualViewport?.addEventListener("resize", schedule);
  window.visualViewport?.addEventListener("scroll", schedule);
  page.addEventListener("load", schedule, true);
  document.fonts?.addEventListener?.("loadingdone", schedule);
  const dispose = () => {
    if (frame) cancelAnimationFrame(frame);
    observer?.disconnect(); mutation?.disconnect();
    document.removeEventListener("scroll", schedule, true);
    window.removeEventListener("resize", schedule);
    window.visualViewport?.removeEventListener("resize", schedule);
    window.visualViewport?.removeEventListener("scroll", schedule);
    page.removeEventListener("load", schedule, true);
    document.fonts?.removeEventListener?.("loadingdone", schedule);
    pages.delete(page);
  };
  return {
    schedule, observe,
    rect(element: Element, measure = () => element.getBoundingClientRect()) {
      let rect = rects.get(element);
      if (!rect) { rect = measure(); rects.set(element, rect); }
      return rect;
    },
    subscribe(read: ReadLayout) {
      consumers.add(read); schedule();
      return () => { consumers.delete(read); if (!consumers.size) dispose(); };
    },
  };
}

export function pageLayout(page: HTMLElement) {
  let layout = pages.get(page);
  if (!layout) { layout = createLayout(page); pages.set(page, layout); }
  return layout;
}
