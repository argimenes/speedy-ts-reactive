import { For, Show, createEffect, createSignal, onCleanup, onMount } from "solid-js";
import type { DocumentMarginEntry } from "./document-margins";
import { useDocumentMargins } from "./document-margins";

type IndicatorRange = {
  key: string;
  side: "left" | "right";
  top: number;
  height: number;
  entries: DocumentMarginEntry[];
};

function mergeRanges(ranges: IndicatorRange[]): IndicatorRange[] {
  const merged: IndicatorRange[] = [];
  for (const range of ranges.sort((a, b) => a.side.localeCompare(b.side) || a.top - b.top)) {
    const previous = merged.at(-1);
    const previousBottom = previous ? previous.top + previous.height : 0;
    if (previous?.side === range.side && range.top <= previousBottom + 3) {
      const bottom = Math.max(previousBottom, range.top + range.height);
      previous.height = bottom - previous.top;
      previous.entries.push(...range.entries);
      previous.key += `:${range.key}`;
      continue;
    }
    merged.push({ ...range, entries: [...range.entries] });
  }
  return merged;
}

export function DocumentMarginIndicators(props: { page: () => HTMLElement; main: () => HTMLElement }) {
  const margins = useDocumentMargins();
  const [ranges, setRanges] = createSignal<IndicatorRange[]>([]);
  let observer: ResizeObserver | undefined;
  let frame = 0;
  const ownerElement = (entry: DocumentMarginEntry) =>
    [...props.page().querySelectorAll<HTMLElement>("[data-runtime-key]")]
      .find(element => element.dataset.runtimeKey === entry.ownerKey);

  const measure = () => {
    frame = 0;
    const page = props.page();
    if (!margins?.collapsed() || !margins.indicators() || !page?.isConnected) {
      setRanges([]);
      return;
    }
    const pageRect = page.getBoundingClientRect();
    const measured = margins.entries().flatMap((entry): IndicatorRange[] => {
      const owner = ownerElement(entry);
      if (!owner) return [];
      const ownerRect = owner.getBoundingClientRect();
      const top = ownerRect.top - pageRect.top + page.scrollTop - page.clientTop;
      return [{ key: `${entry.side}:${entry.relationKey}`, side: entry.side, top: Math.max(0, top), height: Math.max(8, ownerRect.height), entries: [entry] }];
    });
    setRanges(mergeRanges(measured));
  };
  const schedule = () => {
    if (frame) return;
    frame = typeof requestAnimationFrame === "function"
      ? requestAnimationFrame(measure)
      : (setTimeout(measure, 0) as unknown as number);
  };
  const observeOwners = () => {
    if (!observer) return;
    observer.disconnect();
    observer.observe(props.page());
    observer.observe(props.main());
    for (const entry of margins?.entries() ?? []) {
      const owner = ownerElement(entry);
      if (owner) observer.observe(owner);
    }
  };

  onMount(() => {
    if (typeof ResizeObserver !== "undefined") observer = new ResizeObserver(schedule);
    observeOwners();
    schedule();
  });
  createEffect(() => {
    margins?.collapsed();
    margins?.indicators();
    margins?.entries().map(entry => `${entry.ownerKey}:${entry.relationKey}`).join("|");
    queueMicrotask(() => { observeOwners(); schedule(); });
  });
  onCleanup(() => {
    observer?.disconnect();
    if (frame && typeof cancelAnimationFrame === "function") cancelAnimationFrame(frame);
    else if (frame) clearTimeout(frame);
  });

  return <Show when={margins?.collapsed() && margins.indicators()}>
    <div class="document-margin-indicators" aria-label="Collapsed document margins">
      <For each={ranges()}>{range => {
        const count = range.entries.length;
        const label = count === 1 ? `Open ${range.side} margin` : `Open ${count} overlapping ${range.side} margins`;
        return <button
          type="button"
          class="document-margin-indicator"
          classList={{ "document-margin-indicator--overlap": count > 1 }}
          data-margin-side={range.side}
          aria-label={label}
          title={label}
          style={{ top: `${range.top}px`, height: `${range.height}px` }}
          onClick={() => margins?.open(range.entries[0])}
        />;
      }}</For>
    </div>
  </Show>;
}
