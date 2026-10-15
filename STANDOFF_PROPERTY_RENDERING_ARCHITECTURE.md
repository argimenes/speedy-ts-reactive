# Extensible Standoff Property Registry, Events and Renderers

Status: approved architecture; foundational renderer and Temporary Range implementation delivered on 15 October 2026. See §15 for implementation boundaries and verification.

Date: 15 October 2026.

This proposal incorporates the supplied registry and renderer brief and the annotation lifecycle addendum. It covers Mutable OS core mechanisms and application registrations for Flint, Ink and Palimpsest. The user has authorized implementation of this plan. Temporary Ranges and consolidation of existing search/entity highlighting are foundational scope. Caret Modes, new linguistic providers and new rendering targets remain out of scope.

## 1. Recommendation

Extend the existing feature registration, SVG effect and annotation event mechanisms. Introduce stable annotation instance identities and let SolidJS own the lifetime of each mounted annotation and its renderer bindings. Keep the direct DOM character renderer.

Use declarative, JSON-compatible type definitions to select reusable TypeScript renderers and named handlers. Keep transient interaction state separate from persisted annotations. The first implementation should include deletion and overlapping-style cleanup, rather than adding those guarantees after the rendering API is established.

The logical responsibilities are:

- A property type registry for declarative presentation and interaction configuration.
- A renderer library with contracts appropriate to each rendering target.
- The existing range-event service, extended to distinguish events from state.
- Named application handlers registered through the existing feature lifetime.
- A small annotation instance map and a cell-style compositor.

These need not become five independent services or a new plugin framework.

## 2. Baseline implementation and gaps

| Area | Existing implementation | Design consequence |
| --- | --- | --- |
| Annotation UI | [AnnotationContributions](src/runtime/annotation-contributions.ts) registers toolbar actions and property details by type. | Preserve this UI capability; associate presentation definitions by the same type identifier without embedding UI functions in JSON. |
| SVG effects | [EffectContributions](src/runtime/effect-contributions.ts) registers one effect per property type, with `laneHeight`, `render()` and the recent `caretOpacity` option. | Evolve this into type configurations referencing reusable renderer definitions; retain an adapter during migration. |
| Built-in styles | [standoff-styles.ts](src/rendering/standoff-styles.ts) contains CSS and SVG schemas, active-range filtering, underline lane allocation and compiled cell-style runs. | Reuse these algorithms and preserve existing composition order. Migrate types incrementally. |
| Drawing | [decorations.ts](src/rendering/decorations.ts) already supplies reusable underline, highlight and outline shape functions. | Parameterize and reuse these drawing functions; do not duplicate underline geometry. |
| Mounted rendering | [StandoffEditorView](src/rendering/standoff-editor-view.tsx) resolves properties, measures range fragments in an animation frame and renders SVG shape arrays. | Add stable annotation/renderer owners here; separate geometry changes from paint-only changes. |
| Character DOM | [DirectCharacterCells](src/rendering/direct-character-cells.ts) reuses keyed spans and text nodes, batches insertions with a DocumentFragment, and receives aggregate cell presentation. | Keep one authority for character DOM. Annotation renderers must not independently replace cells or overwrite their classes. |
| Interaction | [AnnotationRangeEvents](src/runtime/annotation-range-events.ts) maintains an interval index and occurrence-local active state. [InputGateway](src/input/gateway.ts) supplies caret changes. | Extend this service rather than adding another event bus or listeners per annotation. |
| Annotation identity and deletion | [LinkedAnnotations](src/runtime/linked-annotations.ts) creates segment IDs and shared definition IDs. [annotation-commands.ts](src/block-tree/annotation-commands.ts) supports soft deletion through `isDeleted`. | Distinguish a local segment from its shared semantic definition. Physical removal and effective soft deletion must both retire rendering. |
| Ownership | [FeatureHost](src/runtime/features.ts) already combines Solid roots with scope-owned disposers. [annotation-capabilities.ts](src/application/annotation-capabilities.ts) exposes scoped registration. | Reuse this ownership pattern and extend the existing public capability boundary. |

The recent caret-opacity implementation is a useful proof, but not yet a complete annotation lifecycle system:

1. Render keys currently include the property's array index. Removing or reordering another property can change a surviving annotation's key.
2. Caret ranges are refreshed during SVG measurement. Removal therefore reaches the event index on the next measurement pass, rather than immediately when the annotation is deleted.
3. There is no individual annotation renderer owner. SVG shapes are regenerated as new objects during measurement; their string `key` field does not itself give Solid's `<For>` keyed reconciliation.
4. The event service's current `dispose()` clears collections but does not establish a terminal disposed guard against later calls.
5. The direct cell renderer writes aggregate classes/styles. Independent `classList.add/remove` calls from annotation renderers would conflict with that authority.

Geometry caching also needs precise terminology: the current view reuses identical range measurements within a measurement pass and retains resulting SVG shapes between passes. It does not yet provide the old Codex editor's complete persistent per-cell `x/y/w/h` and `previousOffset` cache.

## 3. Identity and lifetime

Use three separate identities:

| Identity | Meaning |
| --- | --- |
| Annotation instance | One canonical local property/segment within its owning content record. Prefer its existing unique `id`, scoped by canonical content identity. |
| Annotation occurrence | That instance rendered in one mounted view occurrence. The same canonical annotation may appear in several windows or transclusions. |
| Renderer instance | One occurrence plus the renderer binding's local `id`, such as `underline` or `background`. |

Neither annotation type, character range, array position nor shared `annotationId` is a sufficient instance identity. Linked segments share a definition but retain separate rendering lifetimes. Use structured keys or allocated handles, not ambiguous string concatenation.

Maintain a small runtime sidecar mapping canonical instance handles to their mounted occurrences. Retain the handle through ordinary range, value and parameter updates, even when repository records are cloned. New commands already generate annotation IDs; keep doing so.

Legacy properties without unique IDs need runtime handles assigned during admission. Preserve them through known command transformations using explicit old-to-new property mappings. Do not manufacture continuity by matching type and range. If a raw replacement is ambiguous, retire the affected handles and create new ones. Opening a legacy file must not rewrite it or mark it dirty just to supply runtime identities.

Each mounted lifetime also has a generation and an abort signal. Undo can restore the same logical annotation ID, but creates a fresh mounted lifetime after deletion. Work queued by its former lifetime cannot act on the restored annotation.

## 4. Registries and configuration

Registries belong to an editor instance. Applications register definitions through `FeatureScope`; releasing a registration disposes its mounted contributions but does not delete authored annotations. Duplicate type, renderer and handler names are rejected unless an explicit replacement operation is used. There is no process-global mutable registry and no implicit last-registration-wins policy.

Unknown annotation types remain round-trippable and editable as data. Unknown renderer or handler references produce an application diagnostic and do not execute. Do not silently discard the annotation or guess a renderer.

An illustrative schema is:

```typescript
type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type Params = Readonly<Record<string, Json>>;
type CaretEvent = "caret-enter" | "caret-leave";

interface RendererBinding {
  id: string;                 // Unique within this property type
  name: string;               // Registered TypeScript renderer
  params?: Params;
}

interface PropertyTypeDefinition {
  type: string;
  renderers: readonly RendererBinding[];
  states?: Readonly<Record<string, Readonly<Record<string, Params>>>>;
  stateOrder?: readonly string[];
  events?: Partial<Record<CaretEvent, readonly string[]>>;
}
```

Validate renderer names, binding IDs, parameter schemas, state targets and event names at registration. Future event names become supported through typed core event definitions; arbitrary strings in JSON do not create executable behavior.

Renderer defaults are overlaid by the type's binding parameters, then by active state overrides in explicit `stateOrder`; later states win for the same parameter. Use shallow parameter overrides initially. Type definitions describe presentation, while persisted property instances continue to contain their existing IDs, ranges, values, attributes and metadata. Do not copy defaults or interaction states into document data.

### Shared underline example

Preserve real type identifiers and current colours. The existing entity underline is purple; the existing claim underline is red. The brief's alternate colours are illustrative, not a migration instruction.

```json
[
  {
    "type": "codex/entity-reference",
    "renderers": [
      {
        "id": "underline",
        "name": "svg-underline",
        "params": {
          "color": "purple",
          "thickness": 2,
          "lineStyle": "solid",
          "opacity": 0.5,
          "offset": 1.5
        }
      }
    ],
    "stateOrder": ["caret-inside"],
    "states": { "caret-inside": { "underline": { "opacity": 1 } } }
  },
  {
    "type": "codex/claim-reference",
    "renderers": [
      {
        "id": "underline",
        "name": "svg-underline",
        "params": {
          "color": "red",
          "thickness": 2,
          "lineStyle": "solid",
          "opacity": 1,
          "offset": 1.5
        }
      }
    ]
  }
]
```

Both registrations use exactly the same underline implementation and lane allocator. Claim remains fully opaque to preserve its current appearance. Giving it the same fade interaction later would require only configuration, but is a separate appearance decision.

A second renderer can be added to either type independently:

```json
{ "id": "background", "name": "css-class", "params": { "classes": ["entity-reference"] } }
```

This is an example of composition, not a request to add a new entity background during migration.

## 5. Renderer contracts and SolidJS ownership

Use a discriminated contract instead of forcing SVG, CSS and future cell replacements through one imperative `mount/update/dispose` API. The initial contracts can be small:

```typescript
interface VisualEffectOwner {
  kind: "annotation" | "session";
  key: string;
}

interface OverlayProps<P> {
  identity: string;
  owner: VisualEffectOwner;
  params: Accessor<Readonly<P>>;
  geometry: Accessor<Readonly<GeometrySnapshot>>;
}

type RendererDefinition<P> =
  | {
      target: "range-overlay";
      defaults: Readonly<P>;
      layoutParams: readonly (keyof P)[];
      laneHeight(params: Readonly<P>): number;
      View: Component<OverlayProps<P>>;
    }
  | {
      target: "cell-style";
      defaults: Readonly<P>;
      classes(params: Readonly<P>): readonly string[];
    };
```

The referenced geometry types are core interfaces; annotation snapshots belong to the annotation adapter and event context, not the reusable renderer contract. The initial geometry snapshot contains immutable, core-measured fragments and lane offset. Its mounted host owns invalidation and frame scheduling; a future persistent geometry cache must add explicit version/validity metadata. Renderers consume it; they do not measure cells or traverse the document themselves.

The ownership hierarchy should be:

```text
Editor lifetime
  Session effect lifetime (future Caret Modes; no implementation now)
  Mounted document/view occurrence
    Annotation occurrence lifetime
      Renderer binding: underline
      Renderer binding: background
      Interaction lifetime: caret-inside
```

Render stable annotation handles through `<For>` and nest stable renderer-binding handles underneath. Update their data through accessors/signals. Do not feed freshly reconstructed property or shape objects into `<For>` and expect an `id` field to preserve ownership: Solid keys this list by item identity. See the [Solid `<For>` documentation](https://docs.solidjs.com/reference/components/for).

Parameter and range updates keep the annotation owner alive. SVG colour and opacity update attributes on existing paths. Geometry updates change path data; only genuinely added or removed line fragments need new or removed elements. Thickness and lane requirements are classified as layout changes; opacity and colour are paint changes.

Use `onCleanup` at the annotation or renderer owner for subscriptions, contribution leases and external resources. Avoid placing whole-renderer cleanup inside an effect that reruns for every parameter change. Solid cleans up an effect when it reruns as well as when it is disposed. See [Solid `onCleanup`](https://docs.solidjs.com/reference/lifecycle/on-cleanup).

An imperative integration may use a small adapter whose `update()` is called from an effect and whose `dispose()` is registered once with its owner. It is not the mandatory contract for normal renderers. If a detached `createRoot` is necessary, its disposer must be connected explicitly to the containing lifetime; passing an owner is not a substitute for invoking disposal. See [Solid `createRoot`](https://docs.solidjs.com/reference/reactive-utilities/create-root).

Keep Solid ownership per annotation/renderer, not per character cell. The existing direct DOM cell renderer remains responsible for text nodes, selection and IME preservation.

Future targets can include `cell-content` and `block-overlay` for cell replacements and margin marks. SVG highlights and many decorations already fit `range-overlay`. Do not implement unsupported targets or a general content-renderer conflict system in the first phase.

### Caret Modes compatibility

Reusable renderers consume resolved parameters, geometry and an opaque effect-owner identity. They do not require a persisted property, an annotation snapshot, a document write, or an annotation event. The annotation adapter supplies these inputs for standoff properties. A future session adapter can supply them for Block Focus, Sentence Focus or Word Distortion.

Ownership and target are independent: an annotation owner and a session owner can both use `range-overlay` or `cell-style`. Each owns separate renderer instances and contribution tokens, so stopping a Caret Mode cannot remove persisted-annotation effects. Session state is transient and never enters document history or dirty tracking.

Geometry describes the visual region supplied by the host, not necessarily an annotation's own range. A future region provider may supply a word, sentence, block, multiple fragments, or the complement of a region within an explicitly bounded view. Complement calculation and new targets belong to that future host/provider layer, not the underline renderer. Do not implement region providers, complement rendering or Caret Modes in this change.

## 6. Overlap-safe cell contributions

Solid ownership solves lifetime, but it does not decide which annotations still require a shared class or cell override. A compositor must maintain that information.

Give every contribution an owner token derived from its renderer instance. A CSS renderer contributes a range plus class tokens; it does not mutate `className` directly. The compositor produces the aggregate presentation consumed by `DirectCharacterCells` and the existing Solid-cell fallback.

- Classes are a union of active contributors. Removing annotation A releases A's contribution; a class remains wherever annotation B still requires it.
- Preserve core classes for concealment, images and alternative text. A plugin cannot erase them.
- Managed style declarations use a documented deterministic order, initially preserving the existing annotation source-order behavior. Distinct CSS classes still obey the stylesheet cascade; class-token order is not a precedence mechanism.
- Recompute affected runs over the union of the old and new ranges. Do not clear styles across the document or revisit unrelated paragraphs.
- Future cell-content contributions need an explicit winner or rejection policy. If a winner is removed, expose the next eligible contribution or canonical text. Never blindly restore an old DOM snapshot over another annotation's output.

Use range contributions and compiled runs rather than allocating a Solid owner or subscriber for each annotation-cell pair. A small owner-token map is composition bookkeeping, not a second lifecycle framework.

## 7. Event detection, state and handlers

Standardize the public transition names as `caret-enter` and `caret-leave`; keep `caret-inside` as transient state. Adapt the existing `caret-in-range` and `caret-out-of-range` subscriptions during migration. Normalize aliases at subscription time so a handler is not invoked twice.

Retain the current interval-index approach and one input integration. Make event eligibility independent of whether an annotation currently has SVG geometry: a CSS-only or handler-only type must be able to opt into caret events.

Recommended semantics:

- Ordinary ranges retain inclusive persisted character endpoints, but caret boundaries are tested against `[start, end + 1)`.
- For an explicit `isZeroWidth` property, use the single boundary at `start`, including the end-of-text boundary. Being at that boundary activates it; moving away deactivates it. Initial underline/CSS renderers produce no character-span visual for this point annotation. Do not infer zero width from malformed endpoints.
- Every overlapping eligible annotation receives its own enter/leave transition.
- Moving within the same active range emits nothing.
- A non-collapsed selection, blur or occurrence change clears caret-inside state for the former occurrence. Future selection events are separate from caret events.
- Boundary changes re-evaluate membership. They can cause enter/leave without caret movement, with a reason indicating a range update.

Update logical range membership from changed annotation records and edit position maps, separately from SVG measurement. Source validity and deletion cannot wait for a layout frame. Geometry refresh remains frame-batched, with reads before writes and cached fragments reused wherever valid. Ordinary caret movement must perform no document scan, geometry read or range-index rebuild.

Named handlers extend the existing feature capability registration. JSON contains names only; TypeScript supplies executable handlers. Arrays allow multiple handlers in declaration order.

```typescript
interface AnnotationEventContext {
  event: "caret-enter" | "caret-leave";
  reason: "caret" | "ranges" | "dispose"; // Finer input reasons can be added later.
  instance: AnnotationInstanceIdentity;
  occurrence: AnnotationOccurrenceIdentity;
  documentId?: string; // Reserved for a host with an inexpensive Document identity lookup
  source: { kind: "annotation" | "temporary"; data: Readonly<Record<string, unknown>> };
  previousState: Readonly<InteractionState>;
  state: Readonly<InteractionState>;
  caret?: number;
  signal: AbortSignal;
  own(dispose: () => void): () => void; // Async-safe interaction lifetime.
}

type AnnotationHandler = (context: AnnotationEventContext) => void | Promise<void>;
```

Application handlers close over their approved application capabilities, such as requesting graph emphasis; the event context does not expose raw repository mutation or DOM handles. Handlers execute after state is consistent. Isolate handler failures from input and rendering. Expensive application work must be asynchronous, cancellable and coalesced where appropriate; core visual feedback never awaits it.

Interaction resources should belong to the interaction's Solid owner. Leaving the range cleans up temporary graph emphasis even if an application omitted a corresponding leave handler. Synchronous setup can use `onCleanup`; asynchronous continuations must check their signal/generation, since Solid ownership does not automatically follow `await` or cancel promises. Late-acquired resources must be released immediately if their owner has already retired.

Reserve hover, selection, content-change and range-change as future typed event additions. Only caret events and lifecycle reasons are needed initially. Neither event delivery nor visual state changes write annotation payloads, create undo entries, or mark a Document dirty.

## 8. Annotation deletion and renderer teardown

Deletion is a first-phase invariant. Effective deletion includes physical removal, local `isDeleted`, deletion of a linked definition, and explicit instance replacement.

For each affected annotation instance, perform one coordinated retirement:

1. Mark its lifetime retired and invalidate its generation before further event dispatch. Remove it from event eligibility immediately; an index awaiting reconciliation must also reject retired handles.
2. Clear its interaction states. If it was active, expose at most one terminal leave transition with the appropriate reason. Teardown must not depend on an application handler completing successfully.
3. Abort in-flight work and invalidate queued events, geometry results, animation callbacks and handler continuations associated with that generation.
4. Remove its stable handle from every mounted occurrence's annotation list. Solid disposes its renderer and interaction owners, removing their SVG subtrees and invoking cleanup callbacks.
5. Release only its cell-style, cell-content and margin contribution tokens. Recompute aggregate presentation for affected runs so overlapping annotations retain their effects and underlying text remains untouched.
6. Remove instance-specific subscriptions and cache entries. Keep shared renderer definitions, type registrations, application-wide handlers and other instances alive.

Disposal should be idempotent. An exception in one cleanup must not prevent the remaining resources from being released. Shared geometry entries should be released by ownership/reference or invalidated by their actual dependencies, rather than deleted solely because another annotation used the same range.

Pending frame work must verify the annotation generation and editor lifetime before applying results. Never let an old frame recreate a removed SVG path or register a deleted range. A document/editor shutdown closes event ingress before releasing owners; application navigation side effects are suppressed during shutdown, while cleanup still runs.

| Operation | Required behavior |
| --- | --- |
| Range, value or parameter update on the same instance | Preserve the annotation owner and compatible renderer owners. Update signals, event membership and affected geometry/contributions. |
| Remove one renderer binding | Dispose that binding only; retain other renderers on the annotation. |
| Change a binding's renderer implementation | Dispose the old binding lifetime before mounting its replacement. A local binding ID alone cannot reuse an incompatible renderer. |
| Delete or explicitly replace an annotation | Retire the old lifetime and all its renderer/interaction owners. Replacement receives a fresh generation even if external data reuses an ID. |
| Delete one linked segment | Remove that segment's renderers; retain the shared definition and other segments. |
| Delete a linked definition | Retire every affected segment occurrence using the definition's dependency index, without a vault scan. |
| Undo deletion | Restore logical source data and create a fresh mounted lifetime. Old asynchronous work remains invalid. |
| Unmount one view or close a tab | Dispose its visual occurrences only. Shared canonical annotations and other windows remain intact. |
| Unload canonical Document data | Retire all its instance handles and mounted occurrences. |
| Dispose editor | Establish a terminal disposed state, dispose all registered view/annotation owners and release feature registrations. Further registration or callbacks cannot reactivate anything. |

Connect mounted annotation owners to both the existing view lifetime and the editor's terminal state. Calling `editor.dispose()` must retire them even if an external caller has not yet removed the host DOM. This can use reactive lifetime gates and the existing scope-owned disposer mechanism; it does not require a new general cleanup manager.

## 9. Smallest practical implementation sequence

### Phase 1: instance lifetime, registry and reusable renderers

- Introduce stable instance/occurrence handles, explicit replacement semantics and generation guards.
- Extend the existing registration boundary with property definitions and renderer names.
- Extract a parameterized underline renderer from the existing drawing helpers.
- Register entity-reference and claim using that implementation, preserving appearance.
- Add the simple CSS-class contribution path now, so overlap-safe removal is proven alongside the initial lifecycle design.
- Ensure logical deletion immediately disables events and disposes all visual contributions. Keep an adapter for unmigrated effect registrations and built-in schemas.

### Phase 2: declarative states and caret events

- Separate event-range lifetime from measurement and generalize the existing interval index to opted-in types.
- Introduce caret-enter/leave aliases and the caret-inside state.
- Replace the special `caretOpacity` option with renderer parameter overrides.
- Retain SVG elements for paint-only updates and use shared geometry for layout changes.

### Phase 3: named application handlers

- Add scoped named-handler registration, typed context and deterministic handler ordering.
- Tie temporary application effects and asynchronous work to interaction/annotation lifetimes.
- Validate references and isolate handler failures without adding a scripting engine.

Leave cell replacement, animated effects, hover detection and elaborate conflict resolution for later. They should use these lifetime and target boundaries when implemented.

This is a major new capability, so implementation should use a default-on feature flag under project conventions. Retain a compatibility route during incremental migration and do not change unrelated feature defaults.

## 10. Focused acceptance checks

Keep verification close to the architectural change:

- Updating range/parameters retains renderer ownership and, where applicable, existing SVG paths.
- Deleting one of two overlapping annotations preserves text and the surviving SVG, class and style contributions, including identical ranges and identical types.
- Removing or reordering another property does not remount a surviving identified instance.
- Local soft deletion, physical removal and linked-definition deletion all retire affected occurrences.
- A caret event between deletion and the next frame cannot activate the removed instance; queued frames and asynchronous handlers cannot recreate it.
- Undo creates a fresh lifetime; replacement, feature deactivation, tab closure, Document unload and editor disposal release the appropriate owners exactly once.
- Caret-only movement makes zero geometry reads, document snapshots or document scans and does not rebuild the range index. Paint-only state changes do not recreate paths or dirty the Document.
- Check both direct DOM and fallback cell presentation; retain a real Flint typing benchmark to detect input regressions.

## 11. Approved decisions

The approved defaults are: editor-scoped registrations, explicit duplicate rejection, stable segment identity separate from shared definitions, half-open caret boundaries, exact-boundary zero-width events, declaration-ordered state overrides, and full-opacity red claims during migration.

The principal tradeoff is a small runtime identity/contribution map in exchange for correct ownership across cloned data, legacy annotations and overlapping cell styles. SolidJS supplies cleanup and reactive updates; the map supplies semantic identity and shared-resource composition that Solid cannot infer from DOM elements.

No broader renderer migration or new persistence format is proposed. The identity policy, boundary semantics and terminal-event behavior were approved with the Caret Modes adjustment above; the deletion guarantees are foundational rather than optional follow-up work.


## 14. Temporary Ranges: inspected implementation and consolidation

The Temporary Range addendum supersedes the earlier deferral of session effects. It does not authorize Caret Modes or linguistic providers.

| Consumer / sources inspected | Identification, coordinates and rendering | Edit, overlap and lifetime policy | Decision |
| --- | --- | --- | --- |
| [DocumentFind](src/runtime/document-find.ts), [TextSearch](src/runtime/text-search.ts) | Search produces versioned `TextRangeSnapshot` values: occurrence `nodeKey`, canonical `contentKey`, placement, coordinate kind, half-open start/end. `SessionDecorations.attachMatches` produces per-occurrence SVG highlights and an active outline. | Changed text invalidates matches; generation/abort guards reject stale searches. Overlaps draw independently. Query change/close clears owner. | Retain query logic; use consolidated Temporary Range collection and shared renderers. |
| [EntityCandidates](src/features/entity-references/entity-candidates.ts) | Search/classification produces match sets including the original selection. Shared decorations draw green highlights, active outline and exclusion buttons. | Rebuild after reviewed candidate changes; edit invalidation, cancellation and session disposal. | Retain classification/exclusion interaction; consolidate only range rendering. |
| [DocumentEntityList](src/features/entity-references/document-entity-list.ts) | Existing reference occurrence ranges feed separate preview and concertina decoration owners, yellow SVG fill and priority. | Resolve current ranges when navigating. Preview clear, concertina clear and feature disposal release owners. | Same shared Temporary Range path; no entity inventory work during typing. |
| [EntitySearch](src/features/entity-references/search-view.tsx), the Create Entity Reference / LER window | Original target selection is a versioned range collection, rendered amber by `api.decorations`; the optional additional-occurrence UI uses EntityCandidates. | Selection validity gates preview, Solid cleanup disposes it, candidate session owns its own effects. | Migrate through the existing capability adapter; preserve linking/edit authority separately. |
| [SessionDecorations](src/runtime/session-decorations.ts), [TextRanges](src/runtime/text-ranges.ts) | Already shared owner collections, per-occurrence indexes, half-open coordinates, priority and visibility. | Content index invalidates affected highlights without measuring. Existing implementation reconstructs display descriptors and hides stale matches. | Evolve this service into Temporary Ranges, keeping the compatibility API; do not create a parallel store. |
| [StandoffEditorView](src/rendering/standoff-editor-view.tsx), plain-text view | Standoff SVG uses cell coordinates; plain-text search uses UTF-16 snapshots but does not currently consume `SessionDecorations` for in-text painting. | Native selection, cross-block selection and annotation-monitor preview have distinct editing/selection semantics. | Retain these structural/editor selections separately. Grouping’s retained-selection decoration already uses SessionDecorations and follows the shared migration. Do not manufacture annotations or Temporary Ranges for Blocks. Preserve the current plain-text limitation; range-overlay SVG initially applies to standoff cell regions. |
| [DocumentPositionMarkers](src/runtime/document-position-markers.ts), minimap/concertina | Text-range or structural Block anchors for navigation, not character styling. | Independent navigation/display lifetimes. | Retain; derive markers from existing matches rather than replacing Block anchors with ranges. |

The key duplication is the standoff view's separate temporary-highlight SVG drawing, not separate entity search geometry engines. Search, entity candidates and entity listing already share `SessionDecorations`. Formalise that store and route its rendering through the same registered overlay components as persisted properties.

### Runtime interface and ownership

```typescript
interface TemporaryRange {
  id: string;                    // stable within its owner collection
  range: TextRangeSnapshot;      // existing versioned half-open coordinates
  type?: string;
  attributes?: EffectParams;
  renderers?: readonly RendererBinding[];
  states?: PropertyTypeDefinition["states"];
  stateOrder?: readonly string[];
  events?: PropertyTypeDefinition["events"];
}
```

A feature owns a collection; `replace` updates its result set, `upsert` changes one range, `remove` removes one ID, and `dispose` terminally releases the collection. The identity is owner + range ID + mounted occurrence, independent of offset/type. Replacement with the same ID updates its range/parameters without recreating renderer owners; removal and later re-addition starts a new lifetime. Explicit invalidation hides/removes stale ranges; a visibility toggle cannot revive them. Existing search adapters retain match IDs and give cross-block segments distinct IDs. Arbitrary raw `attachRanges` collections use positional slots for replacement, while the explicit API lets providers supply durable IDs.

The store is runtime-only: it has no repository write capability. It cannot dirty Documents, enter undo or the semantic index, or serialize into `.ink`. Its coordinate validation uses the current `TextRanges` source. It retains UTF-16 snapshots for search/navigation, but only cell-coordinate ranges enter the standoff SVG host. Text changes invalidate ranges rather than guessing linguistic rebasing; current producers already rerun search or resolve references as needed.

A source adapter translates persisted properties and Temporary Ranges into common effect instances. The common renderer receives only owner, identity, parameters and measured geometry. The existing frame-local fragment cache serves both; no duplicate DOM measurement for identical regions. CSS class contributions are unioned before the single character DOM authority writes them. Event participation is opt-in for Temporary Ranges; ranges with no states or handlers do not enter the interval index.

Handlers receive a discriminated source snapshot (`annotation` or `temporary`), with common identity, occurrence, state, reason and abortable lifetime. This preserves annotation semantics without pretending that a Temporary Range is persisted. The same caret interval service detects transitions; no per-range DOM listeners.

### Revised implementation sequence

1. Complete this inventory and design; preserve existing range coordinate conventions and edit invalidation.
2. Implement the default-on shared rendering flag, type/renderer/handler registries, instance ownership, overlap-safe CSS classes, shared underline/highlight/outline renderers and Temporary Range store API.
3. Route existing search and entity highlight producers through the evolved store and shared standoff rendering host, retaining exclusion controls, colours, priorities and navigation markers. Retire the duplicate SVG drawing path when the new flag is enabled; flag-off retains rollback.
4. Add standardized caret transitions and declarative states for both eligible sources, named handlers and abortable cleanup. Verify deletion, overlap, undo, feature teardown, view teardown and editor disposal, plus bounded work and the real Flint browser typing benchmark.

There is no architectural conflict with the approved source-neutral contract. Two boundaries must remain explicit: native editing selections are not merely visual effects, and UTF-16 plain-text hosts do not use standoff character-cell geometry. Neither needs to be forced into a new data model.


## 15. Delivered implementation and boundaries

- `standoffPropertyRendering` is enabled by default in [configuration.ts](src/configuration.ts). Disabling it restores the previous SVG drawing path; existing search/entity adapters and their appearance remain available. `annotationRangeEvents` retains its separate default and full-opacity disabled behaviour.
- [VisualEffectRegistry](src/runtime/visual-effect-registry.ts) validates JSON type definitions and scoped renderer/handler registrations. [visual-effect-renderers.tsx](src/rendering/visual-effect-renderers.tsx) supplies shared underline, highlight, outline and CSS-class renderers. Purple entity and red claim underlines use the same implementation. The existing animated active-search outline, padding, stroke and highlight colours are preserved.
- [range-rendering.tsx](src/rendering/range-rendering.tsx) adapts both sources into Solid-owned lifetimes, stable renderer bindings, immutable geometry and aggregate class runs. Generic renderer components receive no annotation snapshot. Reordering and range/parameter updates retain surviving components; removed sources/bindings dispose independently. The existing direct DOM cell authority and Solid fallback consume the same class union.
- [AnnotationIdentities](src/runtime/annotation-identities.ts) tracks only mounted canonical content. Unique persisted IDs retain continuity; explicit operation-local `annotationOrigins` mappings preserve legacy identities through typing, annotation edits and known annotation additions, including undo. These hints are outside content payloads and `.ink` output. Ambiguous idless raw replacements retire the old owners. Source removal and undo create separate mounted lifetimes, with old handler signals permanently aborted.
- [SessionDecorations](src/runtime/session-decorations.ts) is the single Temporary Range store. `editor.temporaryRanges` is an alias, not a second service. `createCollection` exposes replace/upsert/remove/dispose; the feature capability wraps collection disposal in its existing scope. Existing `attachMatches`/`attachRanges` APIs are adapters into the same store and shared renderer bindings, so search, entity candidates, entity-list previews/concertina, LER target selection and grouping immediately consume the consolidated path. There is no parallel temporary-highlight SVG implementation on the enabled path.
- [AnnotationRangeEvents](src/runtime/annotation-range-events.ts) supplies the same cached interval lookup to both eligible sources, with a separate exact-boundary point map. Named handlers and `register.rangeEvent` use `caret-enter`/`caret-leave`; legacy event subscribers retain their original names. Event state and logical deletion update synchronously, independently of layout. Handler resources use abort signals and interaction-owned cleanup, including late asynchronous acquisitions and handler unregistration.
- Temporary matches retain versioned coordinates and are invalidated, not speculatively rebased, after text changes. Invalid matches cannot be restored by highlight/match visibility toggles. Independent owners retain their effects. A hidden tab may retain valid result data for remounting; its mounted renderers are disposed. Closing a view removes its occurrence ranges.
- Legacy style schemas remain supported during incremental migration. Their measured SVG/region decorations are filtered synchronously on deletion; their next geometry update remains frame-batched. Native selections, annotation-monitor previews, superposition editing, structural Block anchors and minimap navigation retain their existing responsibilities.

The initial library has no cell-content override target. It does not implement Caret Modes, word/sentence/regex providers, animated distortion or complement-region calculation. Plain-text UTF-16 search/navigation remains supported at its existing level; that host did not previously paint the SessionDecorations SVG highlights. A new plain-text drawing adapter is not silently introduced here.

Geometry reuse is the shared per-frame range-fragment cache and retained immutable renderer geometry. Caret-only emphasis performs no geometry read or index rebuild. This change does not claim the original Codex editor's persistent per-cell position/delta cache; that remains a separate optimization with explicit invalidation requirements.

### Verification

The focused checks comprise 146 tests across 19 files, plus client/server type-checking. They cover existing Find and entity workflows plus both cell-rendering paths, overlapping class contributions, soft/physical/shared-definition deletion, legacy identity continuity, reorder, undo, point events, handler unregister/late cleanup, feature teardown and terminal editor disposal. Temporary effects are checked against unchanged encoded Documents, repository revision and undo state. A source-neutral session renderer is exercised without an annotation object. Bounded-work checks cover 100 caret movements across 2,048 annotations without aggregate parameter rescanning or interval-index rebuilds, and typing-induced rebasing without reevaluating unchanged paint parameters.

The real Chrome Flint typing benchmark uses the Michelangelo letter and 1,001 vault rows. Initial runs recorded 7.1 ms median synchronous edit time / 10.2 ms settled with the compatibility path, versus 6.2 ms / 8.8 ms with shared rendering. Follow-up runs varied: compatibility measured 6.8 ms / 9.8 ms, and the final shared-renderer run measured 8.7 ms / 12.3 ms (synchronous p95 16.1 ms). This does **not** establish a throughput improvement; the final sample has some overhead relative to the compatibility sample. All runs captured zero repository snapshots, performed 40 status reads across 40 edits, and passed real character input and undo checks. Headless frame timings showed substantial scheduling outliers and are not a promise of user-visible frame latency.

The follow-up investigation removed an unnecessary dependency from range rebasing to SVG paint consumers: source ranges, renderer definitions and active paint state now invalidate separately. The regression test checks that unchanged paint parameters are neither revalidated nor reevaluated during typing. Benchmark artifacts are local `/tmp/flint-rendering-before`, `/tmp/flint-rendering-after`, `/tmp/flint-rendering-final-control` and `/tmp/flint-rendering-narrow`; rerun with `BENCHMARK_STANDOFF_RENDERING=false/true` using [the benchmark script](scripts/benchmark-flint-typing-browser.mjs).
