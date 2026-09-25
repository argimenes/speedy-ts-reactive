# Codex feature-module architecture review

Investigation and migration proposal · 25 September 2026 · baseline `3f70c71`

**Status: for review; no rearchitecture implemented.** This review follows the current reactive editor, its application composition, and the Node.js/local-filesystem persistence path. Findings come from source inspection, including existing tests; they are not claims of new browser or performance qualification. Paths and symbols below identify the implementation being discussed.

Implementation follow-up: [Stage 0 / Stage 1 report](CODEX_FEATURE_MODULE_STAGE_1_REPORT.md), including the distinction between feature registration and hosted Block-instance lifetimes. The assessment below remains the original review baseline. [Stage 2 report](CODEX_FEATURE_MODULE_STAGE_2_REPORT.md) records the subsequent neutral range/annotation and input-ownership implementation; Stage 3 remains a separate review gate.

## Recommendation

Adopt a small, compiled first-party feature contract, backed by the registries and disposable services Codex already has. Move application assembly out of the editor kernel incrementally. Inject specific capabilities into each feature rather than passing `ReactiveEditor` under a different name.

Use **Timer Block as a small registration/lifecycle pilot, then Grouping as the first substantial extraction**. Grouping is a good architectural test precisely because moving its class into a directory is insufficient: input ownership, annotation targeting, and presentation must stop referring to Grouping directly. Keep selection geometry, native editing, transactions, coordinates, and document identity in core.

Do not begin with a universal plugin framework or a new selection engine. Keep feature configuration reload-based initially. Defer the most sensitive extractions—durable history integration and editable Text Superposition—until simpler boundaries have proved useful.

The Vercel/server-hosted button arrangement is outside this proposal. It is not evidence of two permanent application hosts, and does not justify host-routing or UI-parity infrastructure.

## A. Current architecture assessment

### Model, changes, and rendering

| Area | Current authority | Where features enter |
| --- | --- | --- |
| Document and Block model | [types.ts](src/block-tree/types.ts), [repository.ts](src/block-tree/repository.ts), [codecs.ts](src/block-tree/codecs.ts) | Generic payload, Block/standoff properties, children and relations carry authored feature data. Some wire-format knowledge is explicit, including owned `superposition:` relations. |
| Mutation and undo | [commands.ts](src/block-tree/commands.ts), `TreeCommands`; canonical repository undo/redo | Features call validated commands, often through the full editor. `CommandRegistry` is an action dispatcher, distinct from these mutation primitives. |
| Reactive state | Solid repository state and [projection.ts](src/block-tree/projection.ts) | Canonical changes update per-view Block occurrences. Services also own Solid signals/stores; not all state is document state. |
| Block rendering | [block-outlet.tsx](src/rendering/block-outlet.tsx), [register-core-views.ts](src/rendering/register-core-views.ts) | The Block registry selects views, but a central function imports and registers feature views and commands. Views typically obtain the whole editor from context. |
| Text editing | [gateway.ts](src/input/gateway.ts), [multi-selection-editor.ts](src/input/multi-selection-editor.ts), [standoff-editor-view.tsx](src/rendering/standoff-editor-view.tsx) | Core native input, composition, cell/range mapping, clipboard and mutations coexist with feature-specific input cases and rendering branches. |
| Application assembly | [editor.ts](src/reactive-editor/editor.ts), [workspace-demo.tsx](src/demo/workspace-demo.tsx) | `ReactiveEditor` constructs Grouping, Find, History, Show/Hide, and other services, connects input, and disposes them manually. Application chrome also assembles features directly. |

Three identity levels must remain distinct: authored Block IDs survive storage; content keys identify shared runtime content; placement/node keys identify edges and view occurrences. Features must not persist a `NodeKey` as a durable Block identity. Editing one content record can affect several occurrences.

Text coordinates are also a contract: inline cells use code-point coordinates; selection/edit ranges are half-open; standoff property endpoints are inclusive. `applyAnnotationsToRanges` currently performs the `end - 1` conversion. A public API must own these conversions rather than making each module rediscover them.

`TreeCommands.transaction` batches synchronous operations into one canonical change. The repository already has optimized inline edit paths, incremental projection updates, and undo storage. These should remain authoritative; modularity does not justify replacing them with generic event-sourced plugin commands.

### Selection and input

There is no single array containing every kind of visible selection:

* [selections.ts](src/runtime/selections.ts) represents occurrence-specific logical primary/secondary selections and maps them across content edits.
* Mount adapters and browser selection represent local native selections; [mounts.ts](src/runtime/mounts.ts) provides capture/restore, hit testing, focus and input policy.
* [cross-block-selection.ts](src/runtime/cross-block-selection.ts) and [cross-block-input.ts](src/input/cross-block-input.ts) manage a cross-Block text range and its geometry/input.
* [group-selection.ts](src/runtime/group-selection.ts) collects versioned text ranges for a manual operation.
* [block-selection.ts](src/runtime/block-selection.ts) handles structural Block selection.
* [session-decorations.ts](src/runtime/session-decorations.ts) displays owner-specific ranges/matches, including search results. Those highlights are not authorization to edit their text.

In `ReactiveEditor.installGateway`, Find installs input first, then Grouping, then `CrossBlockInput`, then the general gateway. Grouping uses document capture listeners and sometimes `stopImmediatePropagation`; other handlers rely on scopes, DOM exclusions and registration order. Cross-Block input directly reads `groupSelection.pointerSelecting()` and `keyboardSelecting()`.

[bindings.ts](src/input/bindings.ts) already supplies indexed triggers, scoped dispatch, chords, overrides and disposers. Its handled convention is significant: `false` passes; other handler returns count as handled. The gateway still implements several actions itself, with a bridge to `CommandRegistry`. [binding-catalog.ts](src/input/binding-catalog.ts) centrally lists defaults, including `Ctrl+Shift+L/R` for margins.

### UI, annotations, persistence, and configuration

| Area | Current implementation and limitation |
| --- | --- |
| Toolbar | [document-style-bar.tsx](src/rendering/document-style-bar.tsx) constructs tools and actions; [compact-toolbar.tsx](src/rendering/compact-toolbar.tsx) handles presentation/overflow. Toolset names and feature actions remain centrally known. Not every toolbar action goes through the command registry. |
| Menus | [codex-system-bar.tsx](src/demo/codex-system-bar.tsx) has fixed top-level chrome and supplied Workspace content. [block-menu-actions.ts](src/runtime/block-menu-actions.ts) builds context-menu items using feature imports and direct actions. [block-context-menu.tsx](src/rendering/block-context-menu.tsx) already provides reusable menu interaction. |
| Panels/windows | [overlays.ts](src/runtime/overlays.ts) owns useful focus-return and owner lifetime behavior, but its descriptor union contains individual panel fields. [reactive-tree-view.tsx](src/rendering/reactive-tree-view.tsx) mounts a hard-coded list of feature layers. The existing `overlay-layer.tsx` is not the central renderer used by this tree. |
| Standoff/SVG | [standoff-styles.ts](src/rendering/standoff-styles.ts) has a static schema table. `StandoffEditorView` compiles styles, measures ranges, and branches for SVG effects, region effects, Show/Hide and Superposition. Blur and some other effects use HTML/CSS region presentation; they are not all SVG. |
| Block properties | [appearance.ts](src/rendering/appearance.ts) maps known property types to classes/styles through explicit cases. There is no property contribution registry. |
| Entity annotations | [entity-search.ts](src/runtime/entity-search.ts) combines selection validation, panel opening and annotation application. [linked-annotations.ts](src/runtime/linked-annotations.ts) stores shared semantic annotation identity separately from local range segments. |
| Observers | Repository change/before-change subscriptions, immutable commit/history subscriptions, and [model-events.ts](src/runtime/model-events.ts) coexist. The editor avoids full snapshot publication to ModelEventBus unless there are subscribers. Choosing the wrong stream can still make a feature expensive. |
| Block history | [block-history.ts](src/runtime/block-history.ts) manages session/durable sources, panel state and restore admission. [durable-browser.ts](src/history/durable-browser.ts) uses compact history changes and a worker. This is separate from ordinary undo/redo. |
| Persistence | [persistence.ts](src/reactive-editor/persistence.ts) calls Block History directly during saving and location attachment. The editor recognizes workspace/history document envelopes at load. Local Node endpoints include [document-store.ts](server/document-store.ts). |
| Flags | [configuration.ts](src/configuration.ts) resolves immutable flags, but consumers branch inside editor services, rendering and UI. Compact chrome, Compact Document capability and system bar default on; History and Superposition default off. Grouping currently has no feature flag. |

## B. Existing extension points worth retaining

| Existing seam | Useful now | Small gap to close |
| --- | --- | --- |
| `BlockRegistry` | Type/alias lookup and capabilities | Registration returns no disposer; duplicate registrations silently replace entries; alias ownership is not enforced. |
| `CommandRegistry` | IDs, availability checks, sync/async execution, duplicate-ID rejection | Add owner attribution and removal; feature command context must not expose the entire editor. |
| `BindingRegistry` | Disposable registration, indexed triggers, scoped dispatch, chords and overrides | Add owner diagnostics and deliberate conflict policy for defaults; existing override conflict logic is not a complete registration policy. |
| Repository subscriptions | Disposable incremental events and specialized immutable history capture | Expose narrow read/subscribe capabilities, not unrestricted repository mutation. Keep history capture opt-in. |
| `ModelEventBus` | Disposable subscribers; one throwing subscriber is caught/logged | Attribute failures to owners; avoid using whole-state events as the default feature notification API. |
| `MountRegistry` | Generation-safe registration/disposal, focus, input policy, selection adapters | Wrap the subset needed by a feature; avoid unrestricted DOM traversal. |
| `SessionDecorations` | Owner-scoped transient ranges, priority, visibility, active match and invalidation | Inject an owner-bound facade; a feature should clear its own ranges, not all owners. |
| Overlay focus lifecycle | Captured selection, focus return, close on missing owner | Separate core lifecycle from feature-specific panel data/rendering. |
| Compact toolbar/menu renderers | Existing accessibility, overflow, keyboard and focus behavior | Feed contributions into their existing descriptors rather than replace their renderers. |
| History source interfaces | Read-only session/durable readers, factories already injectable | Separate optional controller/UI from required format/identity preservation. |

These seams already justify lightweight modules. They do not yet make features removable: registrations often happen centrally, and features commonly receive a full editor even where a narrower signature exists at registration time.

## C. Coupling and obstacles

### Concrete dependency problems

| Location | Dependency that prevents isolation | Proposed boundary |
| --- | --- | --- |
| `ReactiveEditor` constructor/install/dispose | Imports and constructs individual services; gateway arguments include feature callbacks | Application assembler activates modules against a core instance. Keep a temporary legacy assembler for unmigrated services. |
| `CrossBlockInput` | Reads Grouping's pointer/keyboard state | Generic, explicitly owned selection gesture contribution; core supplies geometry and completion snapshots. |
| `CrossBlockSelection` | Imports `applyAnnotationsToRanges` from the Grouping implementation | Move ordinary range validation/application to a neutral annotation service; remove its Show/Hide-specific side effect from the shared helper. |
| `GroupSelection` | Reads editor projections, repository, mounts, focus, cross-selection, decorations and Show/Hide | Narrow selection, annotation, transaction, decoration and document-scope capabilities; feature-local operation state. |
| `DocumentStyleBar` | Knows Grouping and Show/Hide directly | Generic annotation-target contribution plus module-owned tools/commands. |
| `StandoffEditorView` | Hard-coded property/effect and feature presentation logic | Type-indexed effect providers; a constrained range-presentation seam for concealment. Do not expose its mutable text DOM. |
| `ReactiveTreeView` / overlay descriptors | Imports feature panels and encodes panel-specific fields | Owned panel/view-layer registration with core focus/owner lifecycle. |
| `registerCoreViews` | Registers Timer, feature commands, Superposition and History explicitly | Move registrations to each module; built-in fundamental views remain core. |
| Persistence → `BlockHistory` | Save format/identity depends on an optional service | Core format-preserving save coordination; optional history recording participant. |
| `BlockHistory` → `block-menu-actions` | Imports `blockAncestors` from a UI-oriented module | Move generic tree traversal to a core query helper. |
| Window layout / demo composition | Compact state and layout behavior embedded in larger components | Small per-window presentation port using existing margin/drawer machinery. |

Shared DOM selectors are another implicit API. Grouping excludes dialogs, menu roles, handles and special textareas; cross-Block input recognizes the hidden cross-text input; Compact Mode reads layout classes. Replace only the selectors crossed by an actual extraction with explicit input ownership or a window presentation port. A wholesale DOM abstraction would cost more than it helps.

### Import cycles: observed, not assumed

A static TypeScript import audit of 171 non-test source files under `block-tree`, `reactive-editor`, `runtime`, `input`, `rendering`, `history` and `demo` found one runtime strongly connected component: `block-outlet.tsx` ↔ `unknown-block-view.tsx`. The fallback view calls child/relation render helpers exported by the outlet. This is a rendering recursion, not evidence of a current initialization failure; extracting the shared helpers would remove it if useful.

The audit excluded type-only edges, dynamic imports and directories outside that set. It is not a whole-repository proof of acyclicity. The more pervasive issue is **type/API coupling to `ReactiveEditor`**, even when imports disappear at runtime. Type-only imports do not establish a useful feature boundary by themselves.

Today, deleting the Grouping file breaks editor assembly, cross-Block input, ordinary annotation application and toolbar integration. Deleting Timer also requires central registration/input/menu edits. Those are concrete baselines for the proposed removal test.

## D. Case studies

### 1. Grouping / multi-range selection — first substantial extraction

The current controller already owns much of the right policy: temporary versioned ranges, document/view scope, Ctrl eligibility, removal of a range, cancel behavior, and static decoration ownership. It cancels on unrelated document changes, validates before mutation, and batches deletion into one transaction. It relies on core selection geometry rather than inventing its own layout engine.

Its boundary is nevertheless porous. Input listeners and `CrossBlockInput` cooperate through direct booleans. A helper in the Grouping file is also used by non-grouped annotation application. Show/Hide stores a second form of current membership as annotation IDs, with renderer and toolbar integration elsewhere.

An extracted module should own:

* Ctrl-through-selection accumulation policy and Ctrl-click removal; no Group or Clear button.
* The current manual operation, range snapshots and retained Show/Hide membership.
* Escape cancellation, which reveals its hidden text and removes its highlights/membership without deleting text.
* Delete/Backspace commands for **only that operation's ranges**, including retained ranges after Hide/Show; never arbitrary visible decorations.
* Its Selection toolset contributions, static highlight style and guidance.

Core should own hit testing, native/cross selection extension, IME/native-field exclusions, range validation/normalization, coordinate conversion, annotation mutation, and the transaction that deletes ranges. The module decides **which** ranges; core validates and edits them. Preserve content deduplication, overlap merging and descending edits within each content record; do not turn deletion into a cross-Block structural join.

Split `applyAnnotationsToRanges` into an ordinary annotation operation that returns created/existing annotation references, and a feature response that retains those references for Show/Hide. Keep annotation storage and the meaning of existing `style/show-hide` properties independent of Grouping availability. A small Show/Hide annotation module may supply conceal/reveal presentation; application composition explicitly connects its narrow port to Grouping. Neither module imports the other's implementation. While migrating, adapt the current `ShowHideProjection` behind that port.

**Difficulty: substantial, with high-risk input edges.** The controller is movable; removing direct input/rendering coupling is the real work. This should not also rewrite logical/native/cross selection into one new engine.

### 2. Block-scoped History — strong existing boundary, sensitive integration

The controller, read-only sources, immutable capture and durable worker already separate useful responsibilities. History needs document identity/location, incremental commits, read-only historical queries, restore planning, commands, panel registration and save coordination. It does not need arbitrary mutable repository access.

Restore must continue to validate resource identity, current revision and recorder readiness, then create a **new current document transaction**. Historical bodies are immutable; restoring must not rewrite the archive. Preserve generation/abort checks for asynchronous queries and recording admission.

The difficult coupling is persistence, not the History button. Format recognition, authored identities and save portability cannot disappear when History UI/recording is disabled. `savePersistent` currently returns immediately when disabled; the caller then performs ordinary encoding. Inspection of the ordinary Node save branch found no format-downgrade guard against the existing destination. This identifies a **credible envelope/association preservation gap**, not a demonstrated end-to-end data-loss reproduction. Qualify and resolve it before history extraction; do not simply make the existing save callback optional and assume compatibility follows.

Keep the current worker and source contracts. Separate optional recording/query/UI from core envelope preservation and transport. A single explicit history-save participant is sufficient; a general chain of serializer plugins is not justified.

**Difficulty: moderate for UI registration; high-risk for identity, save and recorder integration.** Migrate this after the basic module contract, in its own reviewable stage.

### 3. Entity references and SVG/standoff effects

Entity lookup, result UI and property-specific actions are feature policy. Range coordinates, standoff storage, shared semantic annotation identity and transactional segment creation are reusable primitives. Keep the generic linked-annotation mechanism from `linked-annotations.ts` available independently of entity lookup.

Entity search currently owns validated range snapshots and its own decoration owner. Preserve its asynchronous result/revision checks and panel focus lifecycle. An entity module should receive range snapshots and an annotation service, plus its search dependency; it should register its panel, commands, toolbar/context actions and property editor.

For visual effects, the static schema table is close to a registry. The rendering boundary is less complete: `StandoffEditorView` owns effect switches and measurements. Introduce a type-indexed schema/effect provider that receives premeasured fragments and immutable property data. Keep range measurement, coordinate mapping, scheduling and SVG layer attachment in core. Pure effect geometry can stay in existing helpers in [decorations.ts](src/rendering/decorations.ts).

SVG overlays and region effects need separate outputs under the same property definition. Do not pretend that a blur/backdrop region, an underline and editable alternate text have identical lifecycles. Property-specific editing UI can register against the same property type, without a new universal property-form framework.

**Difficulty: moderate for entity commands/panels and simple effects; substantial for untangling renderer branches.** Extract one existing effect first to establish the minimum contract.

### 4. Compact Document Mode — small layout policy, not a new layout engine

`WindowView` in [core-block-views.tsx](src/rendering/core-block-views.tsx) maintains explicit compact state, width reduction and width-derived margin collapse. [document-margins.ts](src/rendering/document-margins.ts) already supplies shared margin/drawer context and width calculations. Related application wiring exists in `workspace-demo.tsx`.

The default-on flag makes the capability/UI available; it does **not** mean every window starts compact. Explicit compact state is currently per-window transient state. Stored window geometry is separate, and resize handling accounts for temporary width reduction. Do not accidentally persist collapsed width as the expanded baseline.

The module needs a per-window toggle slot and a narrow presentation port: explicit compact request, expanded geometry, automatic collapse state and existing margin/drawer operations. Core window layout combines `explicitCompact || narrowWindow` while preserving their separate causes. It retains focus transfer, drawer access and handle/minimap allocation.

Keep density tuning in CSS/tokens. The module can own its styles and toggle/controller, but extracting every responsive rule is not worth a new measurement subsystem. Consolidate duplicated wiring only where the actual window seam permits it; do not introduce hosted/local variants.

**Difficulty: moderate extraction, low risk for CSS; focus/width restoration require focused review.** It is lighter than Grouping but is not isolated merely by moving a stylesheet.

### 5. Timer Block — small vertical pilot

[timer-block.ts](src/runtime/timer-block.ts) defines payload interpretation and creation; [timer-block.tsx](src/rendering/timer-block.tsx) owns its component, interval and local presentation. Authored duration/deadline, position and size belong to the document. The local clock signal updates the display without committing a repository edit every second. Cleanup already addresses timers and mounted resources.

Remaining coupling includes central view/command registration, gateway callbacks, menus and full-editor rendering context. A Timer module can register its Block type, command, binding and menu entries, with injected queries/mutations and mount/window helpers. Unknown Timer Blocks should survive load/save when the module is absent.

**Difficulty: moderate overall; registration mechanics straightforward.** This is a better first lifecycle pilot than Grouping because it does not change text selection arbitration.

### 6. Text Superposition — useful limit on the abstraction

[text-superposition.ts](src/runtime/text-superposition.ts) creates a standoff property and owned alternate-reading relation. `StandoffEditorView` renders alternate editable content, conceals source cells and participates in boundary mapping. The codec explicitly recognizes `superposition:` owned relations.

This is not a passive SVG effect. Absolute positioning alone does not solve caret, hit testing, editable identity, source offsets or document relations. A generic overlay callback would conceal rather than resolve those dependencies.

Leave its proven implementation in place initially. Retain its wire compatibility even when the feature is disabled. Only develop an editable projection capability when extracting this actual feature, with explicit coordinate and focus semantics. Do not let optional runtime registration change how existing document ownership is decoded.

**Difficulty: high-risk.** Architectural purity does not justify disturbing this editing path during the initial migration.

## E. Proposed target architecture

```text
Application composition (configuration and explicit imports)
    ├── constructs Codex core
    ├── builds narrow, owner-bound capability adapters
    └── activates configured first-party modules
              │
              ▼
       public core services / contribution contracts
              │
              ▼
Core: canonical model and identity; coordinates and queries;
      transactions/undo; selection geometry and input capture;
      projections/mounts/render scheduling; passive decorations;
      command/binding dispatch; focus/panel lifetime;
      format-preserving persistence and immutable change streams

Feature implementations ──► public core contracts
Core implementations     ──X──► individual feature implementations
```

A prospective layout is `src/features/{timer,grouping,entity-references,...}`, `src/application/` for assembly, and a small public API entry point for core. This does not require moving every existing directory. An import boundary is more valuable than a large file relocation.

### Contract and dependencies

Use a typed factory plus an activation contract, for example `createGroupingFeature(deps): CodexFeature`, where `deps` contains only Grouping's declared capabilities. `activate(scope)` receives lifetime/diagnostics facilities, not a service locator holding all editor internals. Registrations are namespaced and automatically attributed to the activating owner.

Services are ordinary TypeScript objects. Application composition explicitly constructs any feature-to-feature adapter, such as Grouping's Show/Hide port. Missing required dependencies cause a descriptive activation failure. Do not add runtime service discovery, a dependency solver or heavyweight DI.

TypeScript exports and import restrictions enforce the intended internal boundary; trusted JavaScript is not sandboxed. Check new feature imports against the public entry point and allow explicit, reviewed exceptions only during migration.

### Configuration and lifecycle

1. Resolve configuration before constructing feature instances. Preserve current defaults, including the previously requested default-on UI capabilities.
2. Construct core, registries and adapters. Activate configured modules in an explicit application list before mounting their UI.
3. Each activation gets one owned lifetime: a disposer stack, a Solid root, cancellation signal and diagnostic owner ID. Registrations, effects, subscriptions and mounted contributions belong to it.
4. If activation fails, dispose its partial registrations in reverse order and report the feature ID. Startup activation should not mutate authored document content.
5. On editor/window teardown, stop input participation and cancel pending work before clearing decorations and unmounting UI; dispose remaining owned resources and reactive roots. Teardown is idempotent.

Initial configuration changes require reload. Registration disposers still matter for failed activation, editor closure and isolated tests; they do not imply safe arbitrary hot unloading of live authored Block renderers. Separate per-application menus from per-editor services and per-window controllers so opening a second editor does not double-register global items.

Flags determine **activation**, while `canExecute`, window size and temporary operation state determine **availability/behavior**. During migration, existing configuration fields can feed the activation list. Do not add Grouping checks to unrelated core methods.

### State ownership

| State category | Examples | Owner/storage |
| --- | --- | --- |
| Ephemeral operation | Group ranges, Ctrl gesture eligibility, current panel request, Show/Hide membership | Feature-local Solid signals/stores; disposed with owner; not serialized. |
| Authored document | Standoff properties, entity IDs, Timer duration/deadline, alternate-reading relations | Canonical model, changed only through core mutation/transaction APIs. |
| Application preference/configuration | Feature activation, binding overrides, existing cross-text preference | Existing configuration/preferences mechanism with stable namespaced IDs; keep separate from document payload. |
| Window presentation | Explicit compact toggle and temporary width reduction | Per-window state using existing layout lifetime; do not silently add persistence. |
| Derived state | Range fragments, counts, query matches, history panel rows | Memos/indexes based on appropriate incremental events; disposable caches, never another source of truth. |

The authoritative coordinate/selection primitives remain core. Group membership is policy state built from validated core snapshots; it is not a second text selection engine or a global store of all highlighted ranges.

## F. Proposed APIs and contribution points

The following are incremental extensions to existing systems. Names are provisional; each exists to resolve an observed dependency.

### Registration, ownership and ordering

| Contribution | Problem/current code to change | Lifetime and multiple contributors | Ordering and performance |
| --- | --- | --- | --- |
| Commands | Extend `CommandRegistry` and adapt feature cases in `gateway.ts`/`register-core-views.ts` | Owner-bound registration returns disposer. Reject duplicate IDs. Context supplies target/args and declared services, not editor access. | Direct ID lookup; `canExecute` stays synchronous and cheap. Async commands validate again before committing. |
| Keybindings | Extend `BindingRegistry` attribution; move feature defaults out of `binding-catalog.ts` | Preserve disposable bindings and stable override IDs. Diagnose overlapping default triggers; allow intentional scope precedence explicitly. Preserve dormant overrides for disabled modules, including import/export handling. | Retain indexed chord/trigger lookup and ordered scopes. Never resolve conflicts through module activation order. |
| Block types | Extend `BlockRegistry`; move Timer registration from `registerCoreViews` | Own type and aliases; reject collisions, return disposer. Mount components under owner cleanup. Unknown type uses fallback. | Exact type lookup. Configuration is static after startup, so no reactive registry rebuild on each render. |
| Tools and menu items | Consume contributions in `DocumentStyleBar`, system Workspace content and `block-menu-actions` | Stable contribution IDs, existing toolset/menu slots, command/availability/target descriptors; owner removal deletes only its items. | Sort once by slot/group/order then stable ID. Several features can share a slot; duplicates are errors. Keep current focus/overflow/menu renderers. |
| Panels and view layers | Replace individual layer imports in `ReactiveTreeView`; split feature payload from `OverlayService` | Register panel ID, component factory and modal policy; core retains owner/anchor/focus return. Open instances and reactive roots close with owner. | Explicit layer roles and current active-modal stack, not arbitrary z-index priority. Render only mounted/open contributions. |
| Standoff definitions | Replace static schema lookup/effect switches incrementally in `standoff-styles` and `StandoffEditorView` | One owner per property type, including style/effect/editor definitions; dispose registration. Unknown properties remain stored. | Type-indexed lookup; core measures fragments once per pass. Existing property stacking order remains deliberate; no per-cell scan through all features. |
| Block property presentation | Start by factoring `appearance.ts` into type-keyed pure resolvers when needed by a migrated feature | One definition per type; existing authored properties retained without provider. Pure output is classes/styles, not DOM mutation. | Apply properties in the established authored order. Document last-writer style collisions and report ambiguous registration; no arbitrary callback priorities. |
| Selection behavior | Remove Grouping booleans from `CrossBlockInput` through a constrained gesture/mode port | One claimant for a gesture, scoped to target editor. Cancellation releases claim; conflicting eligible behaviors receive a diagnostic, not simultaneous ownership. | Fixed phases described below. Candidate dispatch is indexed by gesture kind/modifiers/scope; ordinary typing bypasses unused behavior hooks. |
| Annotation targets | Replace toolbar's Grouping branches and move generic `applyAnnotationsToRanges` | An active operation may provide validated ranges and receive resulting annotation references. Native/cross selection remains fallback. Registration and operation handle are disposable. | Exactly one current target provider for an editor operation. Passive decoration owners cannot register implicitly or become targets by visibility. |

Do **not** add a parallel `documentObservers` registry: expose owner-tracked subscriptions on the existing incremental streams. Likewise, transient decorations need an owner facade over `SessionDecorations`, not a second overlay store. Window layout needs a narrow per-window adapter over the existing margin context, not a general layout service.

### Selection, annotations and mutations

Extract a neutral versioned text-range snapshot type from the role currently played by `SearchRange`. Expose snapshot/validate, document-scope queries and existing normalized operations. Validation checks occurrence/content/placement identity, coordinate type, inline revision and boundaries.

Provide ordinary annotation application that returns annotation references. Keep linked semantic annotations explicit: applying one style to several ranges does not automatically create one shared semantic entity. A current-operation target contribution lets existing toolbar annotation commands work without importing Grouping.

Expose synchronous transactions and the specific validated edit operations needed by each feature. Grouped deletion takes explicit range snapshots, merges overlaps per content, applies changes in safe order, and restores the intended caret. It never obtains targets from the decoration service. Existing optimized one-range typing should continue to use its fast path.

### Deterministic input participation

Core owns document-level event capture. Replace listener-order dependence with a small fixed protocol as Grouping migrates, not a general `beforeEveryEvent` middleware chain:

1. **Classify target and ownership:** editor/window, mount input policy, modal/panel ownership and composition state. Native fields and IME keep their existing behavior; feature commands cannot steal their Delete/Backspace.
2. **Active gesture/mode handling:** dispatch only to the current owner, or eligible selection-start candidates. A contributor may claim selection policy while asking core to continue its existing geometry/selection mechanics. Claiming a gesture is distinct from consuming a DOM event.
3. **Scoped bindings:** resolve through existing indexed bindings. An active manual-group deletion/cancel command has explicit scope precedence over normal text deletion in that editor, below a modal/native field owner.
4. **Normal editing/selection:** core performs unclaimed selection extension, native editing and existing cross-Block handling.
5. **Completion:** notify the gesture owner with a normalized selection snapshot after core finalizes pointer capture/selection. Track modifier eligibility across the entire gesture; a final `ctrlKey` sample alone is insufficient.

The implemented adapter must preserve current browser ordering. In particular, pointer release completion currently uses a microtask so cross-Block input finishes first. Do not introduce a blanket asynchronous event pipeline. Keyboard selection completion/modifier release also needs an explicit path; Ctrl+Shift+L/R remain margin commands, not selection gestures.

Use named outcomes such as `pass`, `handled`, and a separate gesture claim. Only the core router calls `preventDefault`/propagation controls. Cancellation on blur, pointer cancel, owner disposal or invalid document state releases ownership and clears pending gestures. On a failed claimed destructive action, consume the event and report failure; do not fall through to ordinary Backspace and cause a second unintended edit.

For Grouping, Control held throughout a qualifying mouse/keyboard selection claims accumulation policy. Core supplies the range; Grouping appends it. Ctrl-click removal uses core hit testing. Escape cancels that operation; Delete/Backspace uses its validated targets. Find and Entity panels retain their own input ownership and decoration owners, so their multiple results never enter this path.

### Rendering and layout

Keep measurement centralized in `StandoffEditorView`: existing range caches, animation-frame scheduling, resize/font/image responses and cleanup remain core. Providers consume immutable property data and measured fragments, and return limited SVG shapes or region descriptors. They do not individually observe scroll/resize or wrap/move text cells.

Use separate contribution types for passive decorations, property effects, and interactive panels. A narrow range-presentation provider can express Show/Hide's concealment/revealed highlighting without a `groupSelection` branch in the renderer. Core still owns text-cell rendering and hit-test consistency. Editable alternate content remains outside this initial contract.

For Compact Mode, the window adapter exposes an explicit compact request and existing margin operations. Automatic collapse remains a core responsive decision. Avoid polling, additional observers per module or rebuilding the document tree to change density.

### Persistence and history contracts

The core codec must preserve unknown Block types, payload fields, standoff/Block properties and opaque relations to the extent the existing wire format permits. Today it also intentionally filters client-only properties and normalizes known forms; preservation does not mean byte-for-byte JSON identity.

An absent renderer yields a labeled fallback with accessible children/owned relations. An unknown standoff property remains in storage even if it has no effect. Loading must not strip authored data because a module is disabled. Unsupported semantic editing can be limited; saving must not silently sanitize the unknown data.

Existing wire compatibility rules—such as owned left/right and `superposition:` relations—remain in a small always-available format layer. Removing feature UI must not reinterpret owned relations as opaque data. A legacy type string in that layer is an acceptable compatibility exception to feature independence; importing the feature implementation is not.

Do not introduce general serializer/deserializer registration now. Generic payload preservation covers Timer, Grouping annotations and ordinary property types. Introduce a versioned format adapter only for a demonstrated new document representation; migrations must be explicit and loss-aware. Existing legacy and non-lossy export constraints still apply.

Separate History's optional recorder from core resource/envelope identity and save coordination. Disabling it must preserve a valid portable document without inventing a saved-revision receipt. Retain existing admission/Save As restrictions where archive identity requires them. Qualify this boundary with the Node save endpoint, rather than assuming the browser controller alone guarantees it.

History receives immutable incremental changes, read-only query sources and a validated restore API. Neither History nor another feature gets an independent undo stack for authored edits. Asynchronous work captures intent/revision, then revalidates immediately before a synchronous transaction; it must not hold a transaction open across `await`.

### Failure reporting and inexpensive isolation

All contributions record feature ID, contribution ID, scope/type and registration location where practical. Provide a development listing of active modules, bindings, commands and render providers. An opt-in bounded input trace should show target scope, claim, handled outcome and owner; avoid logging all pointer events or document text by default.

Activation uses rollback of owned registrations. Duplicate command/type/alias IDs fail early. Keybinding conflicts report both owners and applicable scopes. Observer exceptions identify their owner and do not stop unrelated observers. Keep existing history capture errors visible; an observer failure after a committed edit cannot undo that commit.

Catch synchronous and asynchronous command failures at dispatch boundaries. Within a core transaction, preserve existing all-or-nothing behavior on operation failure. A renderer boundary can show an error placeholder for its Block/panel, or omit a failed passive decoration; it must not replace canonical content with fallback data. Dispose failed contribution resources. These protections improve diagnosis; they are not third-party code sandboxing.

## G. Complexity, risk and performance

| Change | Classification | Main concern / limit |
| --- | --- | --- |
| Typed activation contract, owner/disposer stack, composition list | Straightforward | Keep scope small; activation failures must clean partial registrations. |
| Owner-aware command/Block registries and conflicts | Straightforward to moderate | Preserve IDs, aliases and command availability; avoid changing dispatch semantics casually. |
| Timer extraction and existing UI descriptors | Moderate | Remove full-editor component dependencies as well as moving registration. |
| Incremental event facade and neutral query/range helpers | Moderate | Do not accidentally choose full snapshots or scan the projection on every pointer event. |
| Selection gesture ownership and Grouping extraction | Substantial; input edges high-risk | Native selection, IME, cross-Block selection, focus, held modifiers, repeat deletion and scoped Delete behavior. |
| Standoff rendering providers | Substantial | Coordinate/layout caches, style precedence, source DOM stability and cleanup. |
| Entity panels/property UI | Moderate after panel/annotation seams | Async staleness, selection restoration and linked annotation identity. |
| Compact Mode extraction | Moderate | Width restoration, drawer focus, minimap/handle spacing; density itself is CSS tuning. |
| History UI extraction | Moderate | Preserve reader/controller lifetimes and asynchronous cancellation. |
| History save/identity extraction | High-risk | Envelope preservation, writer admission, immutable archive, save receipts and restore guards. |
| Editable projection/Superposition extraction | High-risk; deferred | Alternate coordinate spaces, editable surfaces, owned relations and caret semantics. |

The greatest benefit does not come from registries everywhere. Moving a small style switch is less valuable than preventing selection input from importing a feature controller. A fully extensible codec, universal interceptor chain, new undo implementation or general editable-projection framework is not justified by the initial migration.

Latency policy:

* **Synchronous/hot:** input classification, current-owner dispatch, binding lookup, range validation necessary for an edit, transaction execution and caret restoration. Keep indexed or proportional to the actual affected ranges.
* **Reactive/coalesced:** toolbar availability, panel rows, geometry and decorations. Retain existing invalidation granularity and animation-frame measurement scheduling.
* **Deferred/async:** entity lookup, history queries and nonessential diagnostics. Use cancellation/generation checks and bounded work.
* **Workers:** retain the durable history worker; consider workers only for demonstrated pure heavy processing. DOM selection and measurements cannot move there.

Do not broadcast keystrokes, pointer movement or whole repository snapshots to every module. Keep a no-contribution fast path. Use existing `benchmark:typing` / `benchmark:typing:browser` when input/render subscriptions change, and `benchmark:history` for history integration. Compare the same workload on baseline and migrated code; investigate repeatable regressions rather than claiming a budget without measurements. No benchmarks were run for this document.

## H. Incremental migration plan

Each stage should leave a usable application and be independently reviewable. There is no requirement to migrate every service before accepting the first feature module.

### Stage 0 — record boundaries and behavioral baseline

Approve the split in this review. Record current Grouping behavior, feature defaults and persistence preservation fixtures. Confirm the History-disabled envelope path before changing it. Identify public query/range/transaction exports without moving implementations wholesale.

**Exit:** agreed contracts and focused existing tests identified; no broad framework introduced.

### Stage 1 — minimum module lifecycle and Timer pilot

Add owner/disposable registration to existing command/Block registries and owner tracking to bindings. Add application composition, the smallest tool/menu adapters Timer needs, and scoped rendering dependencies. Extract Timer. Leave other registrations in a legacy assembly function; use the same registries and reject duplicate activation.

**Exit:** remove Timer's import/activation and its directory in a temporary checkout: core compiles, normal documents work, a Timer document loads/saves with unknown data preserved. Repeated editor creation/disposal leaves no Timer interval, binding or mount contribution. Run relevant Timer/registry tests, typecheck and build.

### Stage 2 — core range/annotation seams and input ownership

Move neutral range types, validation, annotation application and shared ancestry queries out of feature files. Add the operation target and selection-gesture ports by adapting existing handlers; remove Grouping booleans from cross-Block input. Preserve native/core selection code and existing event outcomes. Adapt `ShowHideProjection` behind a narrow presentation port.

**Exit:** existing local/cross selection and annotation behavior remains intact. Focused checks cover held/released Control, modifier completion, IME/native fields and dialog ownership. Do not expose a generic event interceptor merely to speed extraction.

### Stage 3 — extract Grouping end to end

Move its controller, state, command/binding definitions, target provider, owned decorations and Selection tool contributions into `features/grouping`. Replace toolbar/renderer imports with the introduced seams. Keep Show/Hide document behavior available independently; current-operation membership belongs to Grouping and its injected adapter.

**Exit:** Grouping passes the removal test with no feature-named branches remaining in input, toolbar or renderer. Escape reveals and clears only the active operation; deletion is one undoable edit only for that operation. A cleared group's ranges cannot affect a later group. Find/Entity result highlights are never deletion targets.

Use [group-selection.test.ts](src/runtime/group-selection.test.ts), relevant cross-Block/toolbar/standoff suites and a short real-browser keyboard/pointer check. Include overlapping/shared-content ranges and Delete repeat protection. Run existing typing benchmarks because input routing changed; avoid a large browser matrix.

### Stage 4 — effect and panel contributions; Entity References

Introduce the type-indexed renderer definition using one existing SVG effect. Add panel definitions over existing focus lifetime. Migrate entity commands/panel/property UI and its effect, preserving generic linked-annotation primitives. Other hard-coded effects/layers may use a legacy adapter until migrated.

**Exit:** measured fragments are shared, no extra observer per effect, native text DOM/caret behavior remains stable; entity annotation and unknown-property round trips pass. Run relevant entity/standoff tests and representative visual scrolling/resizing checks.

### Stage 5 — Compact Document presentation module

Add the small per-window port, move the toggle/controller/contributions, and share actual duplicated window wiring where practical. Keep default-on capability and separate explicit/automatic collapse. Keep CSS tuning proportionate.

**Exit:** width restoration, narrow-window coexistence, margin drawer focus and indicators work at one or two ordinary laptop sizes plus high zoom. Relevant existing focused suites, typecheck and build are sufficient; no density-value tests or exhaustive viewport/theme matrix.

### Stage 6 — optional History controller and safe persistence split

First establish always-available format/identity preservation and the explicit save participant. Then move History commands, panel/controller and optional source startup. Retain durable reader/worker protocol and restore planning.

**Exit:** existing History, restore, persistence and Node document-store suites cover recording off/on, archive unavailable, Save As admission and current-revision restore rejection. History UI removal must not flatten enrolled documents or mutate historical state. This stage merits more scrutiny than UI extractions because it changes storage boundaries.

### Later, only as required

Extract other features when touched. Revisit Superposition only with an approved coordinate/presentation contract based on its actual implementation. Leave format compatibility code in core even when its UI becomes modular.

### Coexistence adapters and stop conditions

During migration, application-owned adapters may wrap `ReactiveEditor` internally while exposing narrow interfaces. Legacy assembly can still construct unmigrated services; core must not begin importing newly extracted modules to preserve the old service locator. Do not publish an `editor` escape hatch on the feature context.

Adapters have named removal conditions: Timer gateway callback disappears in Stage 1; Grouping input/toolbar branches disappear by Stage 3; panel/effect legacy contributions shrink in Stage 4; History save service references disappear in Stage 6. Keep adapters behavioral pass-throughs, not a second command or persistence system.

Stop after each stage for review of the resulting boundary. If an extraction needs a broad new abstraction, demonstrate the concrete problem before expanding the contract.

## I. Illustrative Grouping extraction sketch

This is **pseudocode**, not a proposed patch or a complete API specification. The named helpers encapsulate current Grouping policies; core methods below represent the narrowly extracted existing mechanisms described above.

```ts
// application/features.ts — the only place importing implementations
const configuredFactories = resolveConfiguredFeatures(configuration, {
  timer: () => createTimerFeature(timerPorts(core)),
  grouping: () => createGroupingFeature(groupingPorts(core, showHidePort)),
}); // resolves approved defaults before constructing optional modules
for (const create of configuredFactories) featureHost.activate(create());

// features/grouping/index.ts
export function createGroupingFeature(d: GroupingDependencies): CodexFeature {
  return {
    id: "grouping",
    activate(life) {
      // Local Solid state + current policies moved from GroupSelection.
      // currentTargets includes only this operation's retained annotation IDs.
      const group = createGroupController(d.ranges, d.showHide);
      const paint = d.decorations.forOwner(life.owner);
      const cancel = () => {
        group.revealAndForget(); // no text deletion; no canonical undo action
        paint.clear();
      };

      life.effect(() => paint.setRanges(group.visibleRanges(), {
        fill: "#8bd7c4", priority: 30, // static highlight, no crawling SVG
      }));

      life.own(d.selectionBehaviours.register({
        id: "grouping.ctrl-select",
        scope: "editor/standoff",
        start: event => event.control && event.isTextSelectionGesture
          ? { claim: "selection-policy", requireControlThroughout: true }
          : "pass",
        complete: result => {
          // Core has finished geometry/pointer capture and validated eligibility.
          if (!result.eligible) return;
          if (result.kind === "click") group.removeAt(result.point);
          else group.append(result.ranges);
        },
        cancelGesture: () => group.clearPendingGesture(),
      }));

      life.own(d.annotationTargets.register({
        id: "grouping.targets",
        active: group.hasCurrentOperation,
        ranges: group.currentTargets,
        applied: refs => group.finishAnnotation(refs),
        // Ordinary annotations finish the selection; Show/Hide can retain
        // returned references through the injected presentation port.
      }));

      life.own(d.commands.register({
        id: "grouping.cancel",
        canExecute: ctx => group.ownsOperationIn(ctx.editorTarget),
        execute: cancel,
      }));
      life.own(d.commands.register({
        id: "grouping.delete",
        canExecute: ctx => group.ownsOperationIn(ctx.editorTarget),
        execute: ctx => {
          const ranges = d.ranges.validate(group.currentTargets(ctx));
          group.withOwnMutation(() => d.edits.deleteTextRanges(ranges, {
            label: "Delete grouped text", // one core transaction/undo step
            preserveBlocks: true, // merge/deduplicate by content; safe order
          }));
          cancel();
        },
      }));
      life.own(d.bindings.registerCommand({
        id: "grouping.cancel", keys: ["Escape"], scope: "active-text-operation",
      }));
      life.own(d.bindings.registerCommand({
        id: "grouping.delete", keys: ["Delete", "Backspace"],
        scope: "active-text-operation", suppressHeldRepeatAfterHandling: true,
      }));

      life.own(d.tools.register({
        id: "grouping.visibility", toolset: "Selection",
        ...group.showHideTool(d.annotations), // existing Hide/Show policy
      }));
      life.own(d.changes.beforeChange(() => {
        if (!group.applyingOwnMutation()) cancel();
      }));
      life.onDispose(cancel); // host also owns effects and every registration
    },
  };
}
```

The dependency type would name range/selection, edit, annotation, Show/Hide presentation, decoration, command, binding, tool and incremental-change ports. It would not contain `ReactiveEditor`, a writable repository or a generic DOM root. The full controller still needs current scope, stale-range handling, pending keyboard completion, Ctrl-click fallback and error messages; these are existing behavior to move, not a reason to add more registries.

The input router—not this sketch—excludes modal/native/composition targets before dispatching active-operation bindings and owns repeat consumption after deletion. No API above asks for Find/Entity decorations. Explicit current-operation ownership is the guard against deleting their highlighted results.

## J. Future feature development guidelines and acceptance criteria

### Working rules

1. Put a feature's policy, transient state, registrations, components and styles in one obvious module. Declare its injected dependencies.
2. Import only public core contracts and explicit shared utility code. Do not reach through `ReactiveEditor`, patch another controller or install competing document input listeners.
3. Use existing registries/services before adding new ones. Extend core only for a demonstrated reusable primitive, and document the caller that needs it.
4. Keep authoritative document state in the canonical model and mutate it through validated commands/transactions. Keep operation and presentation state local.
5. Treat coordinates, content/occurrence identity and async revision checks as API contracts. Visible decoration is never implicit mutation authority.
6. Register commands, bindings, UI and renderers with stable owner IDs and cleanup. Use core focus/input and measurement lifecycle.
7. Let configuration decide activation. Preserve approved defaults; new substantial features follow the project's feature-flag convention. Do not scatter feature-specific conditionals through core.
8. Preserve unknown authored data and format identities when disabled. Do not couple decode semantics to optional render registration.
9. Verify the changed boundary proportionately: isolated policy tests, relevant existing suites, targeted integration/browser checks, and benchmarks only where hot paths change.
10. Record temporary adapters and their removal condition. Avoid public escape hatches that make every future feature depend on internals again.

### Concrete success criteria

For a migrated feature, require:

* **Removal:** deleting its directory and application registration in a temporary checkout leaves core compilation and unrelated functionality intact. Compatibility format rules may remain, without imports of the removed implementation.
* **Dependency review:** no runtime or type-only import of private editor internals from that feature; any transition exception is explicit and bounded.
* **Ownership:** commands, bindings, UI, subscriptions, reactive effects and decorations are attributable to its ID and disappear on owner disposal or failed activation.
* **Input correctness:** Grouping does not change normal editing with no operation active; Find/Entity result highlighting cannot enable grouped deletion. Modal/native fields and composition remain authoritative for their input.
* **State correctness:** Escape reveals and forgets the active group; a later operation cannot inherit old membership. Grouped deletion is one undo step and targets only validated ranges.
* **Compatibility:** documents containing an absent feature round-trip unknown authored state; enrolled history and owned relations retain required identities/structure.
* **Performance:** no new all-feature dispatch in ordinary typing, no unconditional full snapshot subscriptions, no duplicate per-feature geometry observers; relevant baseline workloads show no unexplained repeatable regression.
* **Testability:** feature policy can run against small service fakes, with a limited set of real-core integration checks for transactions, selection and lifecycle.

Perfect deletion independence is unrealistic for long-lived document formats: a core reader must continue to understand structural compatibility rules after a UI module is removed. Editable projection features will also require more substantial core contracts than menu-only modules. These are explicit limits, not reasons to keep arbitrary feature dependencies throughout the editor.

**Review stop:** this document proposes the boundaries and migration order. It makes no application-code changes and does not authorize starting the rearchitecture.
