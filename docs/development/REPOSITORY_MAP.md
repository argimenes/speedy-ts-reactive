# Where do I go to change X?

## Daily map

| I want to change… | Start here | Important symbols/tests |
| --- | --- | --- |
| Canonical Block/model shape | [`src/block-tree/types.ts`](../../src/block-tree/types.ts) | `ContentRecord`, `PlacementRecord`, `RepositoryState`, `BlockNode` |
| Repository validation/reactivity | [`src/block-tree/repository.ts`](../../src/block-tree/repository.ts) | `CanonicalRepository`, `validateRepository`, `deriveLocations`; `block-tree.test.ts` |
| A document edit/structural operation | [`src/block-tree/commands.ts`](../../src/block-tree/commands.ts) | `TreeCommands`; Block-tree and history tests |
| Content/placement/occurrence identity | [`src/block-tree/identity.ts`](../../src/block-tree/identity.ts), [`ids.ts`](../../src/block-tree/ids.ts), [`occurrences.ts`](../../src/block-tree/occurrences.ts) | identity and definition-ownership tests |
| Block projection | [`src/block-tree/projection.ts`](../../src/block-tree/projection.ts) | `BlockTreeProjection` |
| Application feature activation | [`src/application/features.ts`](../../src/application/features.ts) | `registerApplicationViews`; configuration gates activation |
| Public module/Block runtime contracts | [`src/feature-api/index.ts`](../../src/feature-api/index.ts) | `CodexFeature`, `FeatureScope`, `BlockApplicationDefinition`, `BlockRuntime` |
| Module lifetime and UI contributions | [`src/runtime/features.ts`](../../src/runtime/features.ts) | `FeatureHost`, `FeatureActions`; `features.test.ts` |
| Hosted-instance adapters | [`src/application/feature-capabilities.tsx`](../../src/application/feature-capabilities.tsx) | self-bound reads/edits/mounts; adapter tests |
| Timer application | [`src/features/timer`](../../src/features/timer) | defaults/reader, view, commands, bindings, CSS and `timer.test.tsx` |
| Block type registry / legacy assembly | [`src/block-tree/registry.ts`](../../src/block-tree/registry.ts), [`register-core-views.ts`](../../src/rendering/register-core-views.ts) | owner/disposable registration; legacy/core types |
| Generic Block rendering | [`src/rendering/core-block-views.tsx`](../../src/rendering/core-block-views.tsx) | `GenericContainerView`, `PageView`, `WindowView` |
| Renderer dispatch/children/relations | [`src/rendering/block-outlet.tsx`](../../src/rendering/block-outlet.tsx) | `BlockOutlet`, `ChildBlocks`, `RelationBlocks` |
| Reactive render root | [`src/rendering/reactive-tree-view.tsx`](../../src/rendering/reactive-tree-view.tsx) | `ReactiveTreeView` |
| Standoff text rendering/edit host | [`src/rendering/standoff-editor-view.tsx`](../../src/rendering/standoff-editor-view.tsx) | `StandoffEditorView`, `rangeFragments` |
| Standoff CSS/SVG type mapping | [`src/rendering/standoff-styles.ts`](../../src/rendering/standoff-styles.ts) | `standoffStyleSchemas`, `compileCellStyleRuns`, `standoffSvgStyles` |
| SVG path geometry | [`src/rendering/decorations.ts`](../../src/rendering/decorations.ts) | pure shape functions; `decorations.test.ts` |
| Block property appearance | [`src/rendering/appearance.ts`](../../src/rendering/appearance.ts) | `blockAppearance` |
| Formatting toolbar/property writes | [`src/rendering/document-style-bar.tsx`](../../src/rendering/document-style-bar.tsx) | `DocumentStyleBar` |
| Browser input | [`src/input/gateway.ts`](../../src/input/gateway.ts) | `InputGateway` |
| Shortcut/action metadata | Feature module for migrated actions; [`binding-catalog.ts`](../../src/input/binding-catalog.ts) for legacy actions | `register.binding`, `registerInputActions`; existing dispatch |
| Binding matching/customization | [`src/input/bindings.ts`](../../src/input/bindings.ts) | `BindingRegistry` |
| Cross-Block text input | [`src/input/cross-block-input.ts`](../../src/input/cross-block-input.ts) | `CrossBlockInput` |
| Focus/mounted DOM bridge | [`src/runtime/focus.ts`](../../src/runtime/focus.ts), [`mounts.ts`](../../src/runtime/mounts.ts) | `FocusService`, `MountRegistry` |
| Text selection | [`src/runtime/selections.ts`](../../src/runtime/selections.ts) | `SelectionService` |
| Whole-Block selection/clipboard | [`src/runtime/block-selection.ts`](../../src/runtime/block-selection.ts), [`block-clipboard.ts`](../../src/runtime/block-clipboard.ts) | rendering tests and runtime tests |
| Commands exposed to menus/keyboard | [`src/block-tree/registry.ts`](../../src/block-tree/registry.ts), [`register-core-views.ts`](../../src/rendering/register-core-views.ts) | `CommandRegistry` |
| Floating panels/menus | [`src/runtime/overlays.ts`](../../src/runtime/overlays.ts), [`reactive-tree-view.tsx`](../../src/rendering/reactive-tree-view.tsx) | `OverlayService`; specific feature layers, no public panel registry yet |
| DOM/SVG coordinate conversion | [`src/runtime/measurements.ts`](../../src/runtime/measurements.ts) | `MeasurementService` |
| Page minimap | [`src/rendering/page-minimap.tsx`](../../src/rendering/page-minimap.tsx), [`src/runtime/minimap.ts`](../../src/runtime/minimap.ts) | `page-minimap.test.tsx` |
| Portable serialization | [`src/block-tree/codecs.ts`](../../src/block-tree/codecs.ts) | `decodeBlockTree`, `encodeDocument`; compatibility tests |
| Workspace manifests/resources | [`src/reactive-editor/workspace-manifest.ts`](../../src/reactive-editor/workspace-manifest.ts) | `WorkspaceManifest`; manifest tests |
| Save/load HTTP orchestration | [`src/reactive-editor/persistence.ts`](../../src/reactive-editor/persistence.ts) | `PersistenceService`; persistence tests |
| Ordinary undo/redo | [`src/block-tree/repository.ts`](../../src/block-tree/repository.ts) | `HistoryEntry`, `undo`, `redo`; undo-storage tests |
| Commit metadata/capture | [`src/block-tree/commit-capture.ts`](../../src/block-tree/commit-capture.ts) | `RepositoryCommitResult`, `CommandDescriptor` |
| Durable history engine | [`src/history`](../../src/history) | `durable-core.ts`, `durable-browser.ts`, worker/store tests |
| Block-history UI/restore | [`src/runtime/block-history.ts`](../../src/runtime/block-history.ts), [`src/rendering/block-history.tsx`](../../src/rendering/block-history.tsx) | `BlockHistorySession`, `BlockHistoryLayer`; Block-history tests |
| DocumentWindow/workspace shell | [`src/rendering/core-block-views.tsx`](../../src/rendering/core-block-views.tsx), [`src/demo/workspace-demo.tsx`](../../src/demo/workspace-demo.tsx) | `WindowView`, workspace demo tests |
| Feature flags | [`src/configuration.ts`](../../src/configuration.ts) | `FeatureFlags`, `resolveFeatureFlags` |
| Legacy implementation reference | [`src/blocks`](../../src/blocks), [`src/universe-block.ts`](../../src/universe-block.ts) | not the reactive mutation/rendering path |

## Composition roots

- [`src/reactive-editor/editor.ts`](../../src/reactive-editor/editor.ts): creates repository, commands, registries, runtime services, projections, and input gateway.
- [`src/rendering/register-core-views.ts`](../../src/rendering/register-core-views.ts): temporary legacy/core Block-view and command assembly; excludes Timer.
- [`src/App.tsx`](../../src/App.tsx): small multi-view pilot.
- [`src/demo/workspace-demo.tsx`](../../src/demo/workspace-demo.tsx): current Workspace/Document application shell.

## Registration and discovery checklist

There is no source scan or decorator discovery.

| Extension | How Codex discovers it today |
| --- | --- |
| Hosted Block type/defaults/view/capabilities/aliases | module `register.block(...)`, adapted into `BlockRegistry` |
| Legacy/core Block view | `editor.registry.register(...)` in legacy assembly |
| Commands | module `register.command(...)`; legacy `editor.commandRegistry.register(...)` |
| Keybindings/actions | module `register.binding(...)`; legacy `registerInputActions`; use the existing command bridge |
| Feature toolbar/menu items | `register.action(...)` in `document-actions` / `add-block-menu` |
| CSS standoff property | entry in `standoffStyleSchemas` |
| SVG standoff property | schema entry, `SvgStyle` kind, `StandoffEditorView.measure` switch, and geometry function if new |
| Block property | `blockAppearance` switch, plus the UI/action that writes it |
| Graphical Block property | owning Block view/component integration; no common registry exists |
| Serialization | generic by default; codec branch only for special normalized forms |

## Developer friction observed during documentation

These remaining limitations coexist with Stage 1; see [feature modules](../architecture/FEATURE_MODULES_AND_BLOCK_APPLICATIONS.md) for what is implemented.

1. **Action implementation is distributed.** `binding-catalog.ts` makes actions look uniform, but execution may live in `InputGateway.runBinding`, `CrossBlockInput`, `CommandRegistry`, a toolbar, or a runtime service. Tracing an action often requires searching by ID.
2. **Standoff rendering is only partly registered.** CSS types are table entries, while a new SVG geometry kind requires changing a union, schema, view switch, geometry module, and usually CSS/tests. A small renderer registry could eventually make this one extension point.
3. **Block properties have no property contract/registry in the reactive path.** `appearance.ts` handles common CSS with a switch; complex properties are bespoke view code. The legacy `src/properties/block-properties.ts` can mislead a returning developer because it is not the active reactive registration path.
4. **Graphical Block properties lack a shared layer lifecycle.** Extension authors must repeat local SVG ownership, measurement, observer, scheduling, and cleanup decisions.
5. **Legacy assembly still mixes Block views and commands.** New modules use application composition and owned registrations; unmigrated features still use `registerCoreViews` and direct editor services.
6. **Several identities are essential but easy to confuse.** The types are aliases of `string`, so TypeScript does not prevent persisting a `NodeKey` where an authored Block ID was intended.
7. **Normal, extended, Workspace, and history-enrolled persistence formats coexist.** Their boundaries are deliberate, but discovering which one a feature touches requires reading several codecs/services.
8. **Legacy and reactive source live side by side.** Familiar class names under `src/blocks` remain useful history but can send new work down the inactive imperative path.

Extend only the boundary an actual feature needs. Property/effect registries, gesture ownership and broader panel/menu contributions remain later-stage work; the Timer pilot does not authorize building them speculatively.
