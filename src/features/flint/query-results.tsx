import {For, createEffect, createSignal, onCleanup, untrack, type JSX} from 'solid-js';
const yieldRender = (): Promise<void> => {
  const scheduler = (globalThis as any).scheduler;
  return scheduler?.postTask ? scheduler.postTask(() => {}, {priority: 'user-visible'}) : new Promise(resolve => setTimeout(resolve, 0));
};

/** Bound DOM publication of the existing 1,000-result lists. Query evidence is
 * already complete; this owns only presentation, and stops when replaced/closed. */
export function QueryResults<T>(props: {each: readonly T[]; children: (item: T) => JSX.Element}) {
  const [visible, setVisible] = createSignal<readonly T[]>([]);
  let generation = 0, alive = true;
  createEffect(() => {
    const items = props.each, version = ++generation;
    untrack(() => setVisible(items.slice(0, 40)));
    void (async () => {
      for (let count = 80; count < items.length + 40; count += 40) {
        await yieldRender();
        if (!alive || version !== generation) return;
        setVisible(items.slice(0, count));
      }
    })();
  });
  onCleanup(() => { alive = false; generation++; });
  return <For each={visible()}>{item => props.children(item)}</For>;
}
