# Creating a Feature Module

A feature module is optional editor behavior with an owned lifetime. It can register Block Types, but it need not represent authored content itself. Grouping is an operation across existing text; Entity References owns annotation workflows/UI. Neither is a Block application, and neither uses `BlockRuntime`.

## Factory, capabilities and activation

[`CodexFeature`](../../src/runtime/features.ts) is `{ id: string; activate(scope: FeatureScope): void }`. Use a factory accepting `(scope) => capabilities`, so the application constructs ownership-bound ports for that activation. Features depend on [`src/feature-api`](../../src/feature-api/index.ts); application adapters privately capture the editor.

| Scope member | Use |
| --- | --- |
| `owner` | Stable module ID for attribution |
| `active()` | Signal indicating the activation is live; useful when validating asynchronous results |
| `own(disposer)` | Module resource cleanup; returns an idempotent early release; immediately releases if scope is already inactive |
| `defer(work)` | Guarded microtask; skips work after disposal |

`FeatureHost.activate` rejects duplicate IDs, creates a Solid root, and returns a disposer. It marks the scope inactive before releasing owned resources in reverse acquisition order. Activation failure rolls back registered resources. `editor.dispose()` disposes the host. Solid computations created in activation belong to that root; external requests, subscriptions and timers need appropriate cancellation/guards and cleanup. `defer` is not cancellation for an arbitrary network Promise.

## Available capability families

| Family | Public type and private application adapter | Appropriate use |
| --- | --- | --- |
| Hosted Block | `BlockFeatureCapabilities`; [`feature-capabilities.tsx`](../../src/application/feature-capabilities.tsx) | Type registration, owned insertion, commands/bindings/actions; per-occurrence `BlockRuntime` |
| Text operation | [`TextOperationCapabilities`](../../src/feature-api/text-operation.ts); [`text-operation-capabilities.tsx`](../../src/application/text-operation-capabilities.tsx) | Versioned ranges, generic queries, annotations, range deletion, logical selection, Show/Hide visibility, operation/gesture/toolbar ownership |
| Annotation workflow | [`AnnotationCapabilities`](../../src/feature-api/annotations.ts); [`annotation-capabilities.ts`](../../src/application/annotation-capabilities.ts) | Detached text/property snapshots, search, atomic annotations, panels, passive effects, annotation UI, decorations and reveal |
| Document presentation | `PresentationCapabilities`; [`presentation-capabilities.ts`](../../src/application/presentation-capabilities.ts) | The single per-window presentation contribution demonstrated by Compact |

These are concrete ports, not interchangeable service bundles. Narrow an existing interface with `Pick` when the feature needs less. Combining existing adapters in application composition is possible, as the [effect example](CREATING_STANDOFF_EFFECTS.md) shows. Do not pass the editor through a renamed `context` parameter.

## A small cross-cutting panel feature

This complete example belongs at `src/features/selection-help/index.tsx`. It uses existing panel, command, binding and action APIs. It authors no hidden Block and makes no text edits.

```tsx
import { onCleanup, onMount } from "solid-js";
import {
  keyboard, type AnnotationCapabilities, type CodexFeature,
  type FeatureScope, type PanelSession,
} from "../../feature-api";

type HelpCapabilities = Pick<AnnotationCapabilities, "openPanel" | "text" | "selection"> & {
  register: Pick<AnnotationCapabilities["register"], "panel" | "command" | "binding" | "action">;
};
function HelpPanel(props: { panel: PanelSession }) {
  let root!: HTMLDivElement;
  let close!: HTMLButtonElement;
  onMount(() => {
    const release = props.panel.mountWidget(root, () => close.focus());
    onCleanup(release); // Panel mounts, unlike BlockRuntime mounts, need explicit cleanup.
    props.panel.focus();
  });
  return <div ref={root} role="dialog" aria-modal="false"
    aria-label="Selection help" tabIndex={-1}
    style={{ position: "fixed", top: "80px", left: "40px", "z-index": 1000,
      padding: "16px", background: "white", color: "black", border: "1px solid" }}
    onKeyDown={event => {
      if (event.key === "Escape") {
        event.preventDefault(); event.stopPropagation(); props.panel.close();
      }
    }}>
    <p>Select text before applying an annotation.</p>
    <button ref={close} type="button" onClick={() => props.panel.close()}>Close</button>
  </div>;
}
export function createSelectionHelpFeature(
  capabilities: (scope: FeatureScope) => HelpCapabilities,
): CodexFeature {
  return { id: "example-selection-help", activate(scope) {
    const api = capabilities(scope);
    api.register.panel({ type: "example/selection-help", view: HelpPanel });
    api.register.command({ id: "example.help.open", label: "Selection help",
      canExecute: ({ targetKey }) => !!api.text(targetKey),
      execute: ({ targetKey }) => {
        api.openPanel("example/selection-help", targetKey, undefined, api.selection(targetKey));
      },
    });
    api.register.action({ id: "example.help.toolbar", slot: "document-actions",
      label: "Selection help", command: "example.help.open" });
    api.register.binding({ id: "example.help.open", name: "Selection help",
      description: "Open selection help", category: "Help", scope: "editor/standoff", tags: ["help"],
      defaults: [keyboard("F8", "Alt")], handler: context => context.run("example.help.open") });
  } };
}
```

The example shortcut is illustrative, not a reserved product binding. Add a `selectionHelp` feature flag defaulting false in [`configuration.ts`](../../src/configuration.ts). Import the factory in [`application/features.ts`](../../src/application/features.ts) and activate with `createSelectionHelpFeature(scope => annotationCapabilities(editor, scope))` when enabled. Do not import it from `ReactiveEditor`, the gateway or `registerCoreViews`.

`PanelSession` exposes `key`, `ownerKey`, `data`, `close(restore?)`, `allowDocumentInput(allow)`, `mountWidget(root, focus)` and `focus()`. Its root is the panel's own UI, not arbitrary editor DOM. Core owns overlay identity and return-focus/selection bookkeeping. The default close restores focus; `close(false)` suppresses restoration. The annotation adapter permits opening only panel types registered by that feature, closes previous sessions of the same type, and closes owned panels at teardown.

[`ContributedPanels`](../../src/rendering/contributed-panels.tsx) provides the portal/render boundary. It does not supply universal window chrome, positioning, modal policy or a focus trap. The example places its own small panel; Entity's [search view](../../src/features/entity-references/search-view.tsx) and [list view](../../src/features/entity-references/list-view.tsx) demonstrate fuller UI. Preserve snapshots before opening when later actions need the selection; do not reread it from a now-focused input and assume it still represents the target.

## Grouping: operation ownership

[`createGroupingFeature`](../../src/features/grouping/index.tsx) creates and owns `GroupSelection`, which attaches a selection-gesture policy and a current text operation. It registers cancel/delete commands and a bounded toolbar contribution. `TextOperationCapabilities.register` has command/toolbar/operation/gesture hooks; it does not have the annotation adapter's general `binding`, `panel` or `effect` registrations.

Core [`SelectionGestures`](../../src/input/selection-gestures.ts) and [`CurrentTextOperation`](../../src/runtime/current-text-operation.ts) are the implemented seams for gesture ownership and semantic operation targets. Follow [Grouping's controller](../../src/features/grouping/controller.ts) and [policy tests](../../src/features/grouping/policy.test.ts), including stale-range cleanup. Do not add global key listeners to compete for Escape/Delete/Backspace or broadcast ordinary typing to every feature. Core retains native/logical/cross-Block selection and pointer completion ordering. Highlight decoration alone is never a deletion target.

## Entity References: asynchronous annotation workflow

[`createEntityReferencesFeature`](../../src/features/entity-references/index.tsx) registers its purple `EffectDefinition`, search/list panels, an `AnnotationContribution`, commands, bindings and a document action. It owns the list/controller lifetime. The annotation contribution is the existing apply-button plus read-only property-details surface, not a universal property editor framework.

Use [`entity-search.ts`](../../src/features/entity-references/entity-search.ts), [`entity-candidates.ts`](../../src/features/entity-references/entity-candidates.ts) and [`document-entity-list.ts`](../../src/features/entity-references/document-entity-list.ts) for actual async policy: retain the originating revision/ranges, reject stale results, validate again before mutation and avoid applying results after cancellation/disposal. The adapter's `annotate` delegates to shared `LinkedAnnotations.createBatch`, which validates the revision and all versioned ranges before a single atomic local/linked annotation commit. Linked identity remains core/shared; copying only an underline or a visible highlight does not reproduce that identity.

Session decorations and reveal helpers are separate from authored annotations. Their visibility is not mutation authority. A panel input taking focus must not silently replace the saved document targets. Feature/UI policy decides which candidates are eligible; core validates and applies the supplied ranges.

## UI, configuration and cleanup

`FeatureActions` currently offers `document-actions` and `add-block-menu`; these are not arbitrary named slots. Grouping's `FeatureToolbarContribution` supplies a notice, selection-details component and optional annotation descriptions. Panels, passive effects and annotation buttons/details use their specific registries. Window presentation has one optional slot. There is no universal property/panel/window plugin framework.

Configuration is resolved at editor construction. Timer, Grouping, Entity References and Compact retain their accepted default-on capability flags; explicit compact state starts off. New substantial features should be disabled by default unless requested otherwise. A runtime disposer exists for ownership and qualification, not as a promise that changing a configuration object hot-reloads everything.

Before merging, verify activation/disposal, relevant commands/bindings, panel focus/cancellation, stale async results and unknown authored data. Delete the module directory and its application import/activation in an isolated checkout; keep default core behavior and representative authored feature data. Typecheck/build and run proportionate unrelated editing/removal checks. Core should not require feature-name branches or dummy replacement implementations.

For a missing port, write down the concrete semantic operation and propose its public type plus application adapter. History/persistence extraction remains deferred; this guide does not authorize adding a generic transaction/editor service to features.
