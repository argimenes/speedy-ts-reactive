# Adding a Block type

For a new hosted widget Block, start with the extracted [Timer module](../../src/features/timer/index.tsx), the [public feature API](../../src/feature-api/index.ts), and the [Stage 1 report](../../CODEX_FEATURE_MODULE_STAGE_1_REPORT.md). Register through application composition, not by importing the feature into core. No `AbstractBlock` subclass is involved.

A feature module registers a Block Type once per editor. Each mounted occurrence then receives a separate `BlockRuntime`: reactive reads and edits of its own authored state, widget mounting, removal/focus, and Solid-owned cleanup. Timers, audio, drafts and other running resources belong to that occurrence; authored JSON belongs to the document. Removing one occurrence must not dispose the module or another occurrence. The type's default factory and payload reader supply its authored interpretation; clock/display updates must not create document edits.

The examples below describe the **legacy/core registration path**, retained for unmigrated views. New feature code should not copy their unrestricted editor access. The initial public runtime supports the opaque widget needs demonstrated by Timer; child rendering or richer input capabilities require a separately justified extension, not an editor escape hatch.

## 1. Define payload conventions and a DTO factory

Payload types are not globally discriminated today. Keep a narrow reader/factory near the feature, as Timer does in [`features/timer/model.ts`](../../src/features/timer/model.ts):

```ts
// src/runtime/callout-block.ts
import type { ExistingBlockDto } from "../block-tree/types";

export type CalloutTone = "info" | "warning";

export function calloutBlockDto(text = "", tone: CalloutTone = "info"): ExistingBlockDto {
  return {
    id: crypto.randomUUID(),
    type: "callout-block",
    text,
    tone,
    children: [],
  };
}
```

Use JSON values only. A stable authored `id` is required for reliable references and Block history. `TreeCommands.insert` will prepare missing IDs, but an explicit factory is clearer.

## 2. Implement the view

```tsx
// src/rendering/callout-block.tsx
import { onCleanup, onMount } from "solid-js";
import type { BlockViewProps } from "../block-tree/types";
import { useReactiveView } from "../reactive-editor/context";
import { ChildBlocks } from "./block-outlet";

export function CalloutBlockView(props: BlockViewProps) {
  const { editor, projection } = useReactiveView();
  const node = () => projection.state.nodes[props.nodeKey];
  let root!: HTMLDivElement;
  let dispose: (() => void) | undefined;

  onMount(() => dispose = editor.mounts.register(props.nodeKey, {
    root, focusElement: root, inputPolicy: "container",
    focus: () => root.focus({ preventScroll: true }),
  }));
  onCleanup(() => dispose?.());

  return <aside
    ref={root}
    tabIndex={-1}
    class={`callout callout--${String(node()?.payload.tone ?? "info")}`}
    data-block-id={String(node()?.payload.id ?? "")}
    data-runtime-key={props.nodeKey}
  >
    <strong>{String(node()?.payload.text ?? "")}</strong>
    <ChildBlocks parentKey={props.nodeKey} />
  </aside>;
}
```

Read `node()` inside reactive expressions. Do not copy its payload to a nonreactive instance field. Register a mount only when the Block needs focus/event resolution/measurement, and always dispose it.

Use `ChildBlocks` for ordinary nested Blocks and `RelationBlocks` for owned relations. Do not manually append another Block's DOM.

## 3. Register the type

Add this to [`registerCoreViews`](../../src/rendering/register-core-views.ts), or to an application-specific registration function called for every new editor:

```ts
editor.registry.register({
  type: "callout-block",
  view: CalloutBlockView,
  capabilities: ["container", "selectable"],
});
```

Capabilities are queried by input/navigation/UI code. They are descriptive strings, not automatic behaviour. Add aliases only for real persisted legacy type names.

## 4. Create and edit it through commands

```ts
const placementKey = editor.commands.insert(
  calloutBlockDto("Remember this", "warning"),
  { kind: "after", anchorKey: currentNodeKey },
);

const occurrence = editor.nodeForPlacementInView(placementKey, viewId);
if (occurrence) {
  editor.commands.setPayloadField(
    occurrence.key,
    "tone",
    "info",
    "Change Callout Tone",
  );
}
```

If a menu and keybinding should share creation, register a semantic `CommandDefinition` and have both invoke it. If the Block contains a native input, register `inputPolicy: "native-text"` or keep the widget opaque and commit changes explicitly, following `PlainTextBlockView` or `TimerBlockView`.

## Serialization, undo, and history

Generic codecs already preserve `id`, `type`, payload, and children. No codec change is needed for the example. Save/reopen must preserve authored data even when the module is absent; registration supplies the executable interpretation, and an absent type uses the unknown-Block fallback.

`insert` and `setPayloadField` automatically create ordinary undo entries and commit metadata. When Block history is enabled/enrolled, the same commits are captured and attributed to the authored ID. A custom low-level repository mutation can lose this attribution.

If the type introduces a new owned slot, inline representation, external resource boundary, non-JSON value, or special legacy wire format, it is no longer the minimal case. Extend codecs, validation, clone/capture, and history resource projection deliberately.

## Minimum files and registrations

For the example:

1. DTO factory/payload reader (optional but recommended).
2. Solid view and any CSS.
3. One `BlockRegistry` registration called for every editor.
4. A creation action/menu only if users need to create it.
5. Focused renderer/command round-trip test.

You do **not** need a legacy Block class, a serializer, a new repository record type, or a new history adapter.

## Focused verification

- Render a document containing the type and assert visible payload/children.
- Invoke its editing control and assert repository payload plus undo/redo.
- `encodeDocument`, create a new editor from that DTO, register the view, and assert it renders.
- Add an input/binding test only if the type adds input semantics.
- Add history-specific tests only if it adds identity/structure semantics beyond generic payload/children.

Use [`features/timer/timer.test.tsx`](../../src/features/timer/timer.test.tsx), including independent-instance cleanup and disabled-module preservation, and [`plain-text-block-view.test.tsx`](../../src/rendering/plain-text-block-view.test.tsx) as current examples.
