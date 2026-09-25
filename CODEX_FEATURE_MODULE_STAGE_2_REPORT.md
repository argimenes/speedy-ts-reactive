# Feature modules: Stage 2 implementation report

**Status: implemented and stopped for Stage 2 review.**

25 September 2026. Stage 1 code baseline: `6c5db67`; documentation-only follow-up: `fba62b2`. Stage 1 is preserved in Git and was checked out separately for qualification. This stage adapts existing behavior; feature defaults and the Stage 1 Block Application architecture are unchanged. No Stage 3 extraction is included.

## 1. Neutral range and annotation APIs

`runtime/text-ranges.ts` defines half-open `TextRangeSnapshot` coordinates with occurrence, content, placement, version and coordinate-system identity. `TextRanges.snapshot/validate` checks live identity, revision, integer/nonempty bounds and cell versus UTF-16 coordinates. `mergeTextRanges` merges overlapping/adjacent ranges once per shared content; callers validate first and choose document/caret order.

`runtime/range-annotations.ts` supplies `RangeAnnotations.apply`. It validates the entire batch before mutation, deduplicates identical shared-content ranges, converts half-open cell endpoints to inclusive standoff endpoints, and writes independent annotations in one existing core transaction. It returns added-count and created/existing references. Attribute defaults cannot override annotation identity or validated coordinates. Shared semantic annotation identity remains with the existing linked-annotation service.

The service receives validation, property-read/write and transaction capabilities, not `ReactiveEditor`. A narrow result callback connects existing Show/Hide behavior at editor assembly; ordinary annotation code contains no Show/Hide type branch. `SearchRange` remains a compatibility type alias; Grouping, Show/Hide and session decorations now import neutral coordinates directly.

`runtime/block-queries.ts` owns structural ancestry, containment and document-scope queries. History no longer imports ancestry from the context-menu implementation; menu, search, Grouping and toolbar scope checks use the neutral queries. Traversal excludes per-character parent scans.

## 2. Selection ownership actually implemented

`input/selection-gestures.ts` is a core-owned, synchronous adapter for the one demonstrated Control-modified selection policy. Registration has an explicit owner and idempotent disposer; conflicting registrations fail with the current owner's identity. There is one current gesture, not a list of middleware or a broadcast to features.

Claiming selection policy does not consume pointerdown or selection-extension events. Existing `CrossBlockInput` and native selection retain geometry, hit testing, logical ranges, pointer capture, cross-Block proxy input and caret behavior. They consult neutral `selecting("pointer" | "keyboard")` state. Completion uses `runtime/selection-snapshot.ts` to read those existing selections into versioned ranges plus a directed head; the policy receives that snapshot.

Pointer completion retains the existing microtask ordering so core can release capture first. A generation check invalidates queued completion on cancellation, new gestures, document changes, composition, blur, excluded focus and disposal. Live cancellation explicitly releases core pointer capture. Pointer IDs are matched. Control release at any point invalidates that pointer gesture; re-pressing it cannot rehabilitate the gesture. Keyboard completion occurs once on Shift/Control release, or immediately before an owned deletion. Ctrl+Shift+L/R are not selection-start keys.

## 3. Dependencies removed from core

* `src/input` has no Grouping-named references, imports or booleans.
* `CrossBlockSelection` and ordinary toolbar annotation commands no longer import annotation mutation from Grouping.
* Toolbar annotation targeting uses `CurrentTextOperations.annotationOperation()`.
* Neutral range validation, range deduplication/merging and structural queries no longer belong to a feature implementation.
* Grouping consumes the narrow retained-visibility port instead of directly calling ShowHideProjection.

## 4. Dependencies intentionally remaining

The editor still constructs and disposes `GroupSelection`; its controller remains in `runtime/group-selection.ts` and still receives the existing editor internally. It registers its policy and current-operation provider against the new boundaries. Its collection state, decoration ownership, deletion ordering and caret restoration have not been moved into a feature module.

The toolbar still displays Grouping-specific notices and retained-range counts. These are Stage 3 tool/presentation contributions. Show/Hide's existing renderer, toolbar and authored-property interpretation remain intact. No feature registration or hosted `BlockRuntime` has been imposed on Grouping.

These transitional dependencies are explicit. The new core range, annotation, operation and input services receive narrow ports; completing the controller's capability injection and application-composition move belongs to Stage 3.

## 5. Priority, ownership and cancellation

Installation is explicitly ordered by core: existing Find handling, selection-operation capture, cross-Block handling, then the ordinary input gateway/bindings. Native fields, modal/menu targets, composition and foreign-editor surfaces are excluded before operation execution. Standalone formatting toolbars carry explicit disposable editor ownership; cross-selection proxy input is matched by element identity to its owning `CrossBlockInput`.

An owned operation gets Escape/Delete/Backspace precedence over ordinary editing. Deletion asks the provider whether it owns the target scope. An active Grouping provider uses its explicit ranges; retained Show/Hide membership uses its narrow adapter. Neither targets painted Find/entity highlights. A failed deletion, or failed pending-selection capture preceding deletion, consumes the event and reports the failure. Held-key repeats remain consumed until release, avoiding a second ordinary edit after completion or failure.

Core alone prevents default/stops propagation; feature policy receives snapshots and semantic calls, not authority to intercept arbitrary events. Completion reports `pass`, `handled` or `failed`. The fixed adapter's installation order is deliberate; this stage does not replace all existing input listeners with a new event router.

## 6. Ordinary typing fast path

The selection adapter immediately returns for ordinary character keys, before target classification, snapshots, operation lookup or feature callbacks. It does not intercept `beforeinput` or `input`. Pointer movement only checks the current claim. There is no feature enumeration, new full-document snapshot subscription or asynchronous typing pipeline. Only pointer completion uses a microtask, as before.

## 7. Show/Hide adaptation

Ordinary annotation application returns references. `ShowHideProjection.annotationApplied` recognizes its own property type and retains those references. The injected `SelectionVisibility` port exposes active membership, validated-range sources, removal and reveal/clear behavior. Escape reveals and forgets retained membership; a subsequent group does not inherit it. Concealment and authored Show/Hide properties remain available when the Grouping provider is disposed. Find/entity decorations never become current-operation deletion authority.

## 8. Qualification

* **183 tests passed across 16 focused suites**, covering Grouping, selection/input ownership and target classification, cross-Block input/editing, annotations, toolbar (both chrome modes), standoff rendering, Block selection, bindings, text search, Superposition, Timer, feature lifetimes and History persistence. The full run passed 182 tests; the final affected-suite rerun covers 76 tests, including the additional click/menu target-ownership regression.
* Both reactive/client and server **typechecks passed**; client/server builds including the history worker passed. Vite retains its existing bundle-size advisory. `git diff --check` passed.
* **Three pre-existing context-menu failures** reproduce on untouched Stage 1 (`block-context-menu.test.tsx`, four other tests pass). One blur-region remeasurement test failed during a heavily concurrent run, then passed both in isolation and in the final two-worker focused run. No renderer implementation changed.
* The new [`check-stage2-selection-browser.mjs`](scripts/check-stage2-selection-browser.mjs) ran the same **17 assertions on Stage 1 and Stage 2** in Chrome 153 on macOS. It checks ordinary native selection, local Control selection with cross mode off, early Control release, cross-Block pointer/keyboard completion, Escape, Show/Hide, Ctrl-click, native form deletion, modal Escape ownership, grouped Delete repeat/undo, and IME deletion exclusion. It uses real CDP keyboard/mouse/composition input and an in-memory document; it does not save user documents.
* **Inherited IME qualification limit:** after CDP composition, Backspace and empty-composition cancellation, the mounted text handle remains `composing: true` on **both Stage 1 and Stage 2**. The probe verifies that IME cannot delete grouped text, but does not establish successful native IME cancellation/recovery. Existing simulated cross-Block composition commit/cancel tests pass. This is explicitly not a claim to have qualified all OS IMEs; investigate this shared browser behavior separately before claiming complete IME recovery.
* New isolated tests verify conflicting ownership, stale disposers, deferred completion invalidation, pointer-ID matching, explicit capture release, modifier continuity, margin-shortcut exclusion, no typing dispatch, failed destructive-action consumption, native/modal/foreign-editor exclusion, and multi-editor toolbar routing. Range tests verify all-batch validation, shared-content deduplication, inclusive storage endpoints and atomic undo.

Raw measurements and browser observations are in [`CODEX_FEATURE_MODULE_STAGE_2_QUALIFICATION.json`](CODEX_FEATURE_MODULE_STAGE_2_QUALIFICATION.json).

## 9. Typing benchmark comparison

The existing in-memory and browser workloads run against Stage 1 and Stage 2 with the same Node version and machine. Browser runs use independent temporary Chrome profiles and Vite dependency caches. A temporary copy of the existing browser runner only generalizes its Solid-module URL lookup for the isolated cache path; the workload and assertions are unchanged.

Browser workload: 25,000 characters in 250 annotated paragraphs; 40 timed insert/delete edits per run. Times are milliseconds.

| Metric | Stage 1 runs 1 / 2 / 3 | Stage 2 runs 1 / 2 / 3 |
| --- | --- | --- |
| Typing median | 2.5 / 2.3 / 2.6 | 1.9 / 2.8 / 1.9 |
| Typing mean | 4.090 / 3.892 / 3.728 | 2.628 / 3.627 / 2.622 |
| Typing p95 | 25.6 / 3.7 / 4.5 | 3.3 / 4.8 / 3.3 |

All six runs passed the existing real Chrome insertText/Backspace/Enter, undo/redo, split/focus and boundary assertions. Text was restored, unrelated DOM cells stayed stable, and typing/split measurements recorded zero whole-document snapshots. Run-to-run variation, including the first baseline's tail outlier, does not justify claiming a speedup. There is **no repeatable browser typing regression** in this workload.

The full existing in-memory benchmark completed on both revisions: six fixture shapes × three capture modes × six reported operation categories, with five warmup and twenty measured cycles. All 216 result rows across the two revisions report zero snapshots. History-off typing medians:

| Document characters / paragraph characters | Stage 1 ms | Stage 2 ms |
| --- | ---: | ---: |
| 1,000 / 100 | 0.513 | 0.479 |
| 5,000 / 100 | 0.605 | 0.473 |
| 10,000 / 100 | 0.470 | 0.468 |
| 25,000 / 100 | 0.505 | 0.491 |
| 5,600 / 5,600 | 16.705 | 16.608 |
| 25,000 / 25,000 | 95.200 | 94.179 |

Two capture-enabled typing outliers received a targeted matched repeat using the same benchmark cycles and assertions, restricted to those fixture/capture combinations:

| Workload | Initial Stage 1 → Stage 2 ms | Repeat Stage 1 → Stage 2 ms |
| --- | --- | --- |
| 25,000 / 100, full capture | 0.590 → 0.744 | 0.622 → 0.611 |
| 25,000 / 25,000, compact capture | 94.809 → 106.597 | 87.429 → 88.039 |

The initial increases did not repeat at comparable magnitude. These lower-level workloads exercise unchanged repository/command/projection code, not the new gesture adapter. The browser workload is the evidence for the changed input path. No unexplained repeatable typing regression was found; these measurements are not a general latency guarantee.

## 10. Lessons for Stage 3

Keep the current-operation provider separate from gesture ownership and passive decorations. Preserve the normalized completion snapshot, generation cancellation, editor-scoped toolbar/proxy ownership and repeat-deletion guard when moving the controller. Registration ownership is editor/module lifetime; there is no Block application lifetime for Grouping.

Use the established narrow range/annotation/query/visibility capabilities when replacing the controller's remaining editor access. Move its notices/counts/tools and assembly into the final module only after review. The single-provider constraint is intentional: reject a conflict until a second real selection policy demonstrates a need for more arbitration. Do not generalize this into middleware, an all-feature input bus or a replacement selection engine.

**Review stop: Stage 2 only. Stage 3 has not begun.**
