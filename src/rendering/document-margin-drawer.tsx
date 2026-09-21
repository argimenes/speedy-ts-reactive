import { For } from "solid-js";
import type { NodeKey } from "../block-tree/types";
import { BlockOutlet } from "./block-outlet";
import type { DocumentMarginEntry } from "./document-margins";

export function DocumentMarginDrawer(props: { id: string; entries: DocumentMarginEntry[]; onClose: () => void; onSource: (key: NodeKey) => void }) {
  return <aside id={props.id} class="reactive-window__margin-drawer" role="region" aria-label="Document margins" tabIndex={-1}
    onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); props.onClose(); } }}>
    <header><strong>Margins</strong><button type="button" aria-label="Close margins" onClick={props.onClose}>×</button></header>
    <div class="reactive-window__margin-list">
      <For each={props.entries}>{entry => <section class="reactive-window__margin-item" data-margin-side={entry.side} data-margin-relation-key={entry.relationKey}>
        <header><span>{entry.side === "left" ? "Left margin" : "Right margin"}</span><button type="button" onClick={() => props.onSource(entry.ownerKey)}>Go to text</button></header>
        <aside class={`reactive-relation reactive-relation--${entry.name}`} data-relation-name={entry.name} data-margin-drawer-item><BlockOutlet nodeKey={entry.relationKey} /></aside>
      </section>}</For>
    </div>
  </aside>;
}
