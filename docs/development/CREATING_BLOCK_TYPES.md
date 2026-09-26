# Creating a New Block Type / Block Application

Use a Block Application for authored content with its own interactive behavior. A feature module registers the type; every mounted occurrence receives a self-bound runtime. Read [the extension overview](EXTENSION_ARCHITECTURE.md) first if those lifetimes are unfamiliar.

The primary real example is Timer:

| Source | Responsibility |
| --- | --- |
| [`features/timer/model.ts`](../../src/features/timer/model.ts) | Stable `timer-block` identifier, DTO defaults, payload reader, creation policy |
| [`features/timer/index.tsx`](../../src/features/timer/index.tsx) | Type, commands, bindings, toolbar and add-menu registrations |
| [`features/timer/view.tsx`](../../src/features/timer/view.tsx) | Authored reads/writes, per-occurrence clock/audio/drafts, widget mount and disposal |
| [`application/feature-capabilities.tsx`](../../src/application/feature-capabilities.tsx) | Core adapter constructing each `BlockRuntime` |

Timer renders its own floating Portal and uses the shared resize primitive. It is not an example of a child filling a core Window Block; use the inline Counter below for that case.

## Exact BlockRuntime contract

These members are exported from [`src/feature-api/index.ts`](../../src/feature-api/index.ts):

| Member | Available behavior |
| --- | --- |
| `readonly nodeKey: NodeKey` | This mounted occurrence's identity. Do not serialize it as an authored reference. |
| `field(name: string): unknown` | Detached reactive read of this Block's authored field. Read inside a memo/accessor/JSX expression. |
| `setField(name: string, value: unknown, label: string): void` | Replace one authored payload field through core commands; mutation checks that the instance is live and its type belongs to the feature. |
| `removeAndFocusFallback(): void` | Delete the occurrence through core commands and request fallback focus in a guarded microtask. This is an authored deletion, unlike unmount. |
| `mountWidget(element: HTMLElement): Disposer` | Register this occurrence's own root/focus surface with `opaque-widget` input policy. Cleanup is automatically instance-owned. |
| `own(dispose: Disposer): Disposer` | Register external cleanup with this mounted Solid owner; returns an idempotent early-release function. Can be used for resources acquired later in an event handler. |

A detached field value is not a mutable handle to the repository. Holding the result once outside reactive code gives a snapshot. Read again reactively and call `setField` with a replacement. Solid component effects have component lifetime automatically; interval handles, subscriptions and browser resources still need cleanup.

`BlockApplicationDefinition` has `type`, optional `aliases`, `capabilities: string[]`, `create(): ExistingBlockDto` and `view: Component<{ runtime: BlockRuntime }>`. There is no public payload validator/migration/serializer registry. Validate and normalize your known fields when reading, without rewriting unknown data just because a view mounted.

## A complete inline Counter module

Place this example at `src/features/counter/index.tsx`. This is example code using existing APIs, not a built-in Counter feature.

```tsx
import { createSignal, onMount } from "solid-js";
import {
  keyboard,
  type BlockApplicationDefinition, type BlockFeatureCapabilities,
  type BlockRuntime, type CodexFeature, type FeatureScope,
} from "../../feature-api";

const COUNTER = "example/counter-block";
const readCount = (raw: unknown) =>
  typeof raw === "number" && Number.isFinite(raw) ? raw : 0;

function CounterView(props: { runtime: BlockRuntime }) {
  const runtime = props.runtime;
  const count = () => readCount(runtime.field("count"));
  const [elapsed, setElapsed] = createSignal(0); // runtime-only demonstration
  let root!: HTMLDivElement;
  onMount(() => {
    runtime.mountWidget(root);
    const timer = setInterval(() => setElapsed(n => n + 1), 1000);
    runtime.own(() => clearInterval(timer));
  });
  return <div ref={root} class="abstract-block counter-block" tabIndex={-1}
    data-runtime-key={runtime.nodeKey} data-client-id={runtime.nodeKey}
    data-block-id={String(runtime.field("id") ?? "")} data-block-type={COUNTER}>
    <output aria-label="Count">{count()}</output>
    <button type="button" onClick={() =>
      runtime.setField("count", count() + 1, "Increment Counter")}>Add one</button>
    <small>Mounted for {elapsed()} seconds</small>
    <button type="button" onClick={() => runtime.removeAndFocusFallback()}>
      Remove counter
    </button>
  </div>;
}

export function createCounterFeature(
  capabilities: (scope: FeatureScope) => BlockFeatureCapabilities,
): CodexFeature {
  return { id: "example-counter", activate(scope) {
    const { blocks, register } = capabilities(scope);
    const definition: BlockApplicationDefinition = {
      type: COUNTER,
      capabilities: ["control", "opaque-widget", "selectable"],
      create: () => ({ id: crypto.randomUUID(), type: COUNTER, count: 0 }),
      view: CounterView,
    };
    register.block(definition);
    register.command({
      id: "example.counter.create", label: "Add counter",
      canExecute: ({ targetKey }) => !!blocks.get(targetKey),
      execute: ({ targetKey }) => {
        const origin = blocks.get(targetKey);
        if (!origin) return;
        const placement = blocks.insert(definition.create(),
          origin.isRoot || origin.type === "document-block"
            ? { kind: "at", parentKey: origin.key, index: origin.children.length }
            : { kind: "after", anchorKey: origin.key });
        blocks.focusPlacement(placement, origin.viewId);
      },
    });
    register.action({ id: "example.counter.menu", slot: "add-block-menu",
      label: "Counter", command: "example.counter.create" });
    register.action({ id: "example.counter.toolbar", slot: "document-actions",
      label: "Counter", command: "example.counter.create" });
    register.binding({ id: "example.counter.create", name: "Add counter",
      description: "Insert a Counter Block", category: "Blocks & Margins",
      scope: "editor", tags: ["counter"], defaults: [keyboard("F9", "Alt")],
      handler: context => context.run("example.counter.create") });
  } };
}
```

The stable type identifies the executable interpretation; each `create()` supplies a new authored `id`. The command's destination rule is deliberately small. A richer insertion policy belongs in the module, as Timer's `createTimerBlock` demonstrates. The example shortcut is illustrative: check the binding catalog for conflicts and product conventions before adopting it.

## Wire it into the application

In [`configuration.ts`](../../src/configuration.ts), add `counter: boolean` to `FeatureFlags` and `counter: false` to the default `featureFlags`. New substantial features default off unless explicitly requested otherwise. Existing accepted feature defaults do not change.

In [`application/features.ts`](../../src/application/features.ts), import `createCounterFeature` from `../features/counter` and use the existing `blockFeatureCapabilities` adapter:

```ts
// Inside registerApplicationViews, after registerCoreViews(editor):
if (editor.features.counter) {
  editor.featureHost.activate(createCounterFeature(
    scope => blockFeatureCapabilities(editor, scope),
  ));
}
```

Enable with `{ features: { counter: true } }` when constructing the editor. Register application views once per editor. The adapter owns type/alias, command, binding and action disposers; the module should not independently register into editor internals. `FeatureBlocks.insert` accepts only types owned by the active feature. `get` returns summaries, `bounds` returns an optional `{left, top}`, and `focusPlacement` resolves a placement in the supplied view after the commit. This is not permission to insert arbitrary core container types.

## State, deletion and multiple occurrences

The Counter's `count` is authored; `elapsed` and its interval are occurrence-local; formatted/displayed values are derived. Timer similarly authors its duration, running deadline or paused remainder, while its once-per-second tick merely derives display state. Persisting a deadline lets a timer reopen consistently without saving every tick.

The module's scope owns shared registrations, not each Counter's timer. Two independent authored counters have independent counts; two occurrences sharing the same authored content share `count` but still own separate mounted resources. Minimize, inactive tabs or other unmounts can destroy local UI state without deleting the Block. `removeAndFocusFallback` is the explicit deletion path; do not substitute a DOM removal.

Never import `ReactiveEditor` into the feature, mutate repository/projection state, recover editor context from a hosted component, persist input drafts unnecessarily, or use a module-global interval for every occurrence. When replacing an object/array field, preserve unrelated authored keys/items; `setField` replaces that whole field.

## Save, reopen and remove the implementation

Use the existing host's save/open flows. For a focused in-memory check in host/test code, call `editor.encodeDocument()`, construct a fresh `ReactiveEditor(dto, configuration)`, register application views, and render a new projection. No feature serializer is needed. The established codec/persistence limits still apply; see [Persistence and history](../architecture/PERSISTENCE_AND_HISTORY.md), including the pre-existing History-disabled envelope caveat.

Repeat with Counter activation disabled and with its source directory physically removed plus the application import/activation removed. Keep an authored Counter DTO in the fixture. `UnknownBlockView` shows its type and available child/relation content; it does not implement Counter UI or promise to show every custom payload field. Generic encoding must retain `count`, unknown fields, authored IDs and structure. Re-enable the module in a fresh editor to recover the behavior.

Registration removal is not a promise of arbitrary live type hot-swapping: `BlockRegistry` itself is not a reactive plugin loader. Use fresh-editor physical-removal tests for the absent-type fallback. The feature-scope guard disposes contributed live views when the module is released.

Check increment/undo/reopen, two instances, unmount cleanup, fallback preservation and removal focus. Useful references are [Timer tests](../../src/features/timer/timer.test.tsx), [capability tests](../../src/application/feature-capabilities.test.tsx) and [unknown-feature tests](../../src/rendering/unknown-feature.test.tsx). Run focused tests and `npm run typecheck`; use browser checks when interaction or layout warrants them.

## When the current BlockRuntime is insufficient

Today it has no public child/relation renderer, text-editor mount adapter, arbitrary selection API, parent-window access or panel-opening method. A composite application cannot obtain those by treating `nodeKey` as an editor lookup key.

Describe one concrete operation and its ownership, authored effect, focus behavior and disposal requirements. Check whether an existing module capability already supplies it outside the Block runtime. If a new per-occurrence capability is necessary, propose the smallest semantic method in [`feature-api/index.ts`](../../src/feature-api/index.ts) and implement its core adapter in [`application/feature-capabilities.tsx`](../../src/application/feature-capabilities.tsx), with ownership validation and a focused test. Cross-cutting needs may instead belong in a separate capability interface/application adapter. Do not add `getEditor()`, a service map or arbitrary DOM access. No such extension is implemented by this documentation.
