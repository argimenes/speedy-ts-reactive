# Feature modules — Stage 4 implementation report

Stage 4 is complete for review. Stage 5 has not begun.

The accepted Stage 3 baseline is commit `a08eeb8` (`Stage 3 complete`), preserved in history and the detached checkout `/tmp/speedy-stage3-baseline-a08eeb8`. This change extracts existing behavior; `entityReferences` defaults on in application composition and can be disabled. It introduces no new default-on product feature.

## 1. Rendering boundary

[EffectContributions](src/runtime/effect-contributions.ts) is indexed by authored annotation type. Its first and only migrated provider is the existing purple, two-pixel Entity Reference underline in [the entity module](src/features/entity-references/index.tsx).

A definition supplies its type, underline lane height and a synchronous renderer. The renderer receives a key, a detached deeply frozen property, immutable measured fragments and the allocated lane offset. It returns SVG path descriptors. It receives no editor, DOM node, measurement service or observer capability.

[StandoffEditorView](src/rendering/standoff-editor-view.tsx) retains its range-fragment cache, animation-frame scheduling, mount/observer lifetime, coordinate conversion and SVG host. Providers sharing a range receive the same frozen fragment array. Entity underlines and legacy effects share the existing lane allocator. Session decorations now reuse that cache too. Adding or removing a provider schedules the existing measurement path; it does not rebuild editable Cells.

No region-provider abstraction was added. Other effects remain on their existing rendering path. Text Superposition still uses its separate editable projection and was not put through this passive interface.

## 2. Panel and property UI boundaries

[PanelContributions](src/runtime/panel-contributions.ts) provides a type-indexed view over the existing OverlayService. [ContributedPanels](src/rendering/contributed-panels.tsx) renders it in the owner's view. [PanelSession](src/runtime/panel-session.ts) exposes only the panel's own data, close/focus operations, widget mounting and its document-interaction setting.

Core retains overlay coordinates, return-focus keys, native/inline selection capture, external-element selection restoration and the existing microtask ordering. A queued open-focus request now checks that its panel still exists. Features can mount their own widget; they cannot retrieve editor mounts or editable text DOM. Existing panel dragging, resizing and reachability UI moved with the feature. Its window-resize listeners concern its own dialog, not annotation measurement.

[AnnotationContributions](src/runtime/annotation-contributions.ts) covers two existing surfaces: annotation creation actions and the monitor's read-only property-details slot. It is not a property schema, editor replacement or universal panel framework. Generic range editing, metadata/value editing and linked-annotation controls remain in the monitor. The pilot's placeholder overlay layer skips contributed panel types, preventing duplicate mounts.

## 3. Entity extraction and capabilities

[src/features/entity-references](src/features/entity-references) now owns:

- lookup UI, fetch/debounce/abort handling and local/cross-Block application policy;
- candidate searching, nomination, eligibility, exclusions, review UI and binding policy;
- document inventory, entity summaries, listing UI and occurrence-focus policy;
- entity commands, scoped bindings, annotation/document actions, property details and their CSS;
- the purple underline provider and feature-owned transient decorations.

The sole production import of the implementation is [application composition](src/application/features.ts). ReactiveEditor no longer constructs or exposes an entity controller. Feature source imports its own modules, Solid and the [public feature API](src/feature-api/index.ts); test fixtures additionally use application/core wiring.

[AnnotationCapabilities](src/feature-api/annotations.ts), assembled by [the application adapter](src/application/annotation-capabilities.ts), supplies detached annotation/text snapshots, scope/path queries, search, validated annotation writes, owned decorations, reveal operations and bounded registration functions. It exposes neither ReactiveEditor nor repository/DOM lookup. Paragraph snapshots are frozen and reused within a repository revision, avoiding a full paragraph copy for every candidate match.

## 4. Authored storage, identity and asynchronous admission

Generic [LinkedAnnotations](src/runtime/linked-annotations.ts) remains core infrastructure. Its `createBatch` operation validates the repository revision and every occurrence/content/placement/version/bounds snapshot before publishing one operation batch. Local mentions retain independent IDs; a multi-segment mention receives one shared annotation ID. Updates are grouped by canonical content and create one undo entry.

The feature retains entity validity, overlap, grapheme/media eligibility and duplicate-target policy. Lookup requests retain abort/activity checks; candidate search retains generation/disposal checks; listing summaries retain generation/abort/open-state checks. Both direct choice and candidate binding reject stale revisions, and core validates the target snapshots again at write time.

Unknown properties and linked definitions remain authored data when the feature is absent. No codec or History format change was made. Tests cover unknown fields, linked identities, stale-batch rejection, round trips, atomic undo and redo.

## 5. Ownership, input and disposal

FeatureScope owns registrations, subscriptions, controllers and session resources. Panel unmounts abort lookup work and dispose candidate searches/decorations. Module disposal removes its commands, bindings, actions, details, effects and open panels. Tests also cover reactivation, late lookup results, retained capability rejection after disposal, and failed registration without closing another owner's panel.

Entity branches were removed from InputGateway and CrossBlockInput. Their existing binding/command path now invokes the contributed commands. Scoped commands can also target containers, preserving the entity-list chord from a Page. Text-editing branches still require editable text mounts. There is no middleware chain, feature broadcast or asynchronous input pipeline.

The former entity-candidate exception for outside pointer input is now the panel's `allowDocumentInput` setting. Core positions generic exclusion controls; the feature supplies their label, title and action. Core reports keyboard activation so the feature can request restoration to its own panel without inspecting editor DOM.

Find and Entity Listing previously referenced each other when switching occurrence focus. The existing Concertina service now has one neutral presentation-policy owner, including a Find request awaiting results. Replacing that owner cancels the prior policy and decorations. A pending-search regression test verifies this handoff in both directions. This is a narrow adaptation of existing coordination, not a Compact Mode or window-presentation extraction.

Ordinary input still uses the existing native/logical/cross-Block machinery and indexed binding lookup. An unannotated paragraph invokes no effect provider. Effect lookup occurs only in the existing scheduled annotation measurement pass. Passive Find/Entity highlights remain separate from current-operation mutation targets.

## 6. Remaining central branches

| Location | Deliberate remaining legacy path |
| --- | --- |
| `standoff-styles.ts` | Existing CSS schemas, other semantic underlines, rainbow, highlighter, rectangle and spiky effects. |
| `standoff-editor-view.tsx` | Existing region/noise effects; Show/Hide concealment/selection; annotation-monitor preview; explicitly deferred Superposition projection. |
| `reactive-tree-view.tsx` | Existing Find, History, annotation-monitor, context-menu, Sticky Draft and Block-selection layers. |
| `overlays.ts` / `overlay-layer.tsx` | Annotation-monitor fields and the pilot's generic legacy placeholder; contributed types bypass that placeholder. |
| Input / toolbar | Unmigrated features retain their existing paths; this stage removes Entity Reference policy from these central consumers. |

These are named legacy adapters, not alternate Entity implementations. There are no Entity Reference branches/imports in the active central input, standoff, panel-host, property-monitor or toolbar implementations. Grouping's existing rejection of entity application to retained groups remains policy inside Grouping itself. Authored fixture type strings and the existing server lookup/index endpoints remain valid. Historical `src/library` / `src/blocks` implementations were not migrated.

## 7. Qualification

Results and raw browser observations are in [the qualification record](CODEX_FEATURE_MODULE_STAGE_4_QUALIFICATION.json).

- **233 tests passed across 30 focused suites:** Entity References, Grouping, standoff, annotation monitor, cross-Block and Block selection, Find/search, linked/range annotations, ownership, bindings/input and the effects demo.
- **Type checking and client/server builds passed.** Existing bundle-size and browser-mapping warnings remain.
- The existing blur-region test used a fixed 25 ms sleep and reproduced its previously observed timing failure under load. It now waits for the expected measured geometry; no production scheduling change was needed.
- **Chrome 153:** the new [Stage 4 harness](scripts/check-stage4-annotations-browser.mjs) passed 13 assertions on both baseline and candidate. Wrapped underline fragments changed from three to four on narrowing; coordinates matched text before/after scrolling; native selection and Cell identity survived; adding an annotation added zero ResizeObservers. Both runs created two observers for the two fixture paragraphs. Panel Escape restored selected text/focus; native typing and undo preserved authored annotations and unknown fields.
- The existing [entity-list browser check](scripts/check-document-entity-list.mjs) passed at 375 px viewport width, including counts/sorting, previews without history changes, Escape and selection restoration.
- The existing [Find browser check](scripts/check-document-find.mjs) passed on Stage 3 and Stage 4: pointer/keyboard exclusions, independent Find highlights, nomination without writes, 28 distinct bound mentions, atomic undo, worker timeout/recovery, 2,701-match editing with zero repository snapshots, and disposable edits/split/undo on `data/siena.json`.
- That Find harness initially clicked a control obscured by the wide lookup panel on **both** revisions. The fixture now positions the panel below the control and asserts the hit target before the real pointer action. Its mutation/focus assertions were retained.
- The existing [Concertina browser check](scripts/check-concertina.mjs) passed: clipping, navigation, Entity/Find occurrence focusing and exact restoration of original layout/text/revision. The test fixture explicitly owns the extracted entity feature.
- The existing browser selection suite passed all **17** assertions. The known Stage 2/3 CDP empty-composition cancellation observation remains (`mount.composing === true`); this is not a claim of native IME cancellation coverage on every platform.

The Find harness's timing samples are retained as smoke measurements, not a controlled latency regression result. Its stored-document model-edit means were 6.22 ms (Stage 3) and 5.79 ms (Stage 4), with zero snapshots and successful restoration in both. No speedup claim or full typing-benchmark repeatability claim is made.

## 8. Physical removal

A separate checkout, `/tmp/speedy-stage4-without-entities`, contains the candidate source with `src/features/entity-references` physically deleted. Only its import, activation line and now-unused capability-adapter import were removed from application composition. Core services and the default configuration were retained.

That checkout passed type checking, both builds, **127 tests across 15 suites**, and eight real-browser assertions. Entity effects/commands were absent; native selection, text DOM identity, typing, undo, generic linked annotations and unknown authored-property round trips remained functional. The application has no replacement entity stub.

## 9. Review boundary

The useful contract is small: measured passive SVG paths, panels over existing focus ownership, and the existing annotation action/details slots. Other effects need evidence before broadening that contract. Pending asynchronous presentation requests need ownership even before they have renderable results.

Compact Mode, History/persistence, Text Superposition and a universal property/panel framework remain deferred. Stage 5 requires a separate review and instruction.
