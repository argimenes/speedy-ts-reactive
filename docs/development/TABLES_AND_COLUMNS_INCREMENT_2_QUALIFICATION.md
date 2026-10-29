# Tables and columns — Increment 2 qualification

**Date:** 29 October 2026. **Status:** Increment 2 implementation and its command/UI qualification are complete, with the performance limits below. Increment 3 has not started. This is not a claim of single-frame responsiveness at every document size or completed release/accessibility qualification.

**30 October follow-up:** the requested nesting restriction has been removed. `/c`, `/c2`, `/c3` and `/c4` now create a new table around content inside an existing cell. The explicit menu remains available. The unavailable-`/c` browser result below records the earlier policy; permission-denied exact aliases still remain literal. Ownership, local structural admission and history are unchanged. Follow-up validation: 103 targeted tests, reactive/server type checks, and the minimal real-Flint browser run pass. Nested creation preserves the source mount/caret and exact Undo/Redo without snapshots or full index/projection rebuilds; the large-document matrix was not repeated.

## Delivered

The existing default-enabled `tableLayouts` flag covers the commands and controls. Turning it off hides them while existing tables remain readable. No keyboard navigation shortcuts, background document saving, Markdown sidecars, new Block types or persistence/history formats were introduced.

- A shared catalogue registers `/c`, `/c2`, `/c3`, `/c4`, `/row`, `/col`, `/mc l|r|u|d`, `/mr u|d`, `/unc`, and the long movement aliases. Exact aliases outrank suggestions. Unknown arguments remain literal; Entity query punctuation does not reinterpret table arguments. Local command suggestions are immediate and do not initialize an Entity service.
- Inline acceptance removes only the invocation through native inline editing in the same canonical transaction. Mid-paragraph surrounding text, annotations and original placements survive. Escape, stale sources, code/literal annotations, IME, paste, partial text selections and multiple carets retain their established input ownership.
- “Tables and columns” in the Block menu includes an out-of-document command field for captured whole-Block selections. Five selected siblings through `/c3` become two rows, retaining the original five placements and adding one empty editable Block. Selection changes invalidate an open action rather than retargeting it.
- Distinct Table, Row and Cell controls expose insertion, adjacent cell swaps, row movement, destination-cell navigation, **Move selected Blocks to cell…**, extraction/removal review, and dissolution. Content transfer appends; it never silently swaps or overwrites destination content. Nested creation is also available through ordinary creation commands (30 October follow-up). Removal offers the extraction count and row-major destination after the table, or Cancel.
- Each table has one horizontal overflow viewport with a minimum of 14 em per column, equal widths and normal independent vertical cell contents. Guides are per-view session state. Shell control targets stay occurrence-local and do not become generic delete/cut/drag selections. Native focusable controls, coordinate labels, expanded state, table row/column counts and operation status are present.
- Focus reveal changes only the table's horizontal scroll. It coalesces one focus-only geometry read/write batch per viewport, measures only the target cell and viewport, accounts for scale, and cancels when the viewport unmounts. It does not install a typing observer, replace annotation geometry, or scan cells on each keystroke.

Main implementation: [commands](../../src/runtime/table-commands.ts), [context menus](../../src/runtime/table-menu.ts), [controls](../../src/rendering/table-controls.tsx), [focus presentation](../../src/runtime/table-presentation.ts), and [canonical table service](../../src/runtime/tables.ts).

## Canonical correctness and bounded work

Eligible table publications use the approved reusable `structuralTransaction()` mechanism and incremental projections. The general transaction/admission fallback is unchanged. Unsupported ownership, sharing, resource-root, cyclic and ambiguous operations retain their existing rejection or general-admission behavior; UI integration does not weaken admission to obtain faster timings.

The measured slash-creation and contextual insertion paths record **zero repository snapshots, full planners/validators, full index rebuilds, full projection builds and fetch requests**. Each accepted creation records one structural transaction and one local admission. Suggestion entry records none of those operations and no table preflight. Across the 15,766-character single-Document and five-open-Document cases, the creation counters stay at 62 clone calls and one local admission; unrelated Documents do not add cloned records. The existing structural suite also asserts no publication to an unrelated Document projection.

New regression coverage checks all eligible contextual mutations and their Undo for zero snapshots/index/projection rebuilds. Creation, movement, insertion and transfer also avoid unrelated payload reads. Typing with controls mounted adds no structural transaction, table preflight, unrelated payload read, cell/viewport geometry measurement, or control DOM mutation.

**Removal preflight is a deliberate exception:** removal and dissolution retain Increment 1's conservative scan of loaded standoff references before deleting shell identities. Placement reference counts alone cannot prove that an annotation does not refer to a shell. This explicit safety check is outside typing and does not discover the Vault, but it is workspace-sized preparation. Bounded publication does not make this preflight bounded. A reference index and broader reference semantics are not silently added in this increment.

Identity, annotations (including overlapping and zero-width ranges), owned/opaque relationships, ownership, empty-cell behavior, list/task context, row-major dissolution, nested tables, single-step Undo/Redo and exact durable replay remain covered by the canonical tests. The native codecs and manual saving path are unchanged.

## Browser interaction responsiveness

[The browser harness](../../scripts/qualify-table-controls-browser.mjs) uses real Flint components and Chromium input dispatch: text entry into the editor followed by a native Enter event. It verifies a visible table with nonzero dimensions, the same mounted source root, the exact restored caret, active editing focus, a compositor screenshot, and successful subsequent text input at that caret. It also exercises keyboard activation of native menu buttons, real clipboard paste and IME composition.

Final runs used **Chrome 156.0.8078.48**, headless Chromium with **ANGLE Metal / Apple M1**, a 1500 × 990 viewport, disposable profiles and in-memory Documents. No fixture was saved. Ten creation samples include two warmups, leaving eight reported samples. Values below are **median / p95 milliseconds**; with eight samples p95 is the maximum observation, not a population tail guarantee.

| Fixture | Synchronous table execution, including reactive publication | Through command/caret microtasks | Enter through next paint (Event Timing) |
| --- | ---: | ---: | ---: |
| Minimal, 32 characters | 3.9 / 4.4 | 8.9 / 9.4 | 16 / 16† |
| Annotated, 15,766 characters | 4.3 / 4.9 | 13.1 / 13.4 | 24 / 32 |
| Annotated, 25,766 characters, 200 extra sibling paragraphs | 8.7 / 9.4 | 32.8 / 35.6 | 80 / 80 |
| Annotated, 40,766 characters, 500 extra sibling paragraphs | 15.2 / 15.6 | 65.6 / 71.9 | 144 / 160 |
| Five open Documents, 79,100 repository records; same 15,766-character active Document | 4.9 / 5.3 | 16.7 / 17.9 | 24 / 32 |
| Solid text renderer, 15,766 characters | 4.7 / 5.2 | 13.4 / 14.5 | 24 / 24 |
| Solid text renderer, five open Documents | 5.2 / 6.5 | 16.9 / 20.4 | 24 / 32 |

† Event Timing has a minimum reporting threshold of 16 ms and quantizes durations. It reported two of the eight minimal-case Enter events, and all eight in every other row. Missing entries are not assigned zero duration. These are observed browser interaction timings, not arbitrary two-animation-frame settling measurements.

The microtask marker is **not paint or full interaction completion**. Separate DOM/focus confirmation medians were 20.5 ms for the moderate case, 73.1 ms at 25.8k characters, 142.6 ms at 40.8k, and 24.1 ms with five open Documents. Those are browser round-trip upper bounds on usability confirmation. Screenshots confirm the rendered result, and subsequent input confirms editability; their timing includes capture/transport and the Event Timing observer wait, so it is not reported as paint latency. The minimal case sometimes waits the observer's 2.5-second timeout for an unreported event; that timeout is not an editor delay.

The final five-Document result preserves approximately the single-Document structural cost and paint timing. Larger **active** Documents still have real reflow, native selection, rendering and presentation work: the 40.8k case is not single-frame responsive. Its parent ordering also contains more affected siblings. The synchronous column above includes reactive rendering and must not be equated with the earlier report's narrower structural-computation measure.

Evidence: [minimal](evidence/tables-and-columns/increment2/qualified/minimal/results.json), [15.8k](evidence/tables-and-columns/increment2/qualified/moderate/results.json), [25.8k](evidence/tables-and-columns/increment2/qualified/annotated25/results.json), [40.8k](evidence/tables-and-columns/increment2/qualified/large/results.json), [five Documents](evidence/tables-and-columns/increment2/qualified/workspace/results.json), [Solid](evidence/tables-and-columns/increment2/qualified/moderate-solid/results.json), [Solid/five Documents](evidence/tables-and-columns/increment2/qualified/workspace-solid/results.json). Each directory includes wide/narrow screenshots. All seven runs passed their assertions with zero browser exceptions.

## Menu/focus investigation and corrections

Browser and unit checks exposed and corrected two integration issues: overlay caret bookmarks were reactive proxies that could not be cloned into session history, and shell controls needed an explicit boundary from editor input/focus dispatch. Bookmarks now contain plain coordinates. Native controls retain browser activation and preserve the source caret. New table actions suppress the generic menu's second focus restoration; the canonical table bookmark supplies the final focus once. The harness also supplies Enter's native character event when testing default button activation.

Profiling found an additional avoidable fan-out: completion binding registration/removal invalidated shortcut labels on unrelated Block handles. [Binding labels](../../src/input/bindings.ts) now share an action-specific signal and update only when that action's visible binding changes. Assignment, reset, import, temporary registration/removal and existing dispatch semantics remain intact. No shortcut was added or remapped. Unit tests verify the narrow notifications; final browser samples verify **zero unrelated handle title/pressed-state writes** during slash entry and acceptance.

Before this label correction, the 25.8k/40.8k paint medians were 112/224 ms; afterward they were 80/144 ms. The first five-Document direct-renderer run was variable (17.2 ms synchronous median); a diagnostic rerun measured 5.9 ms, and the final run 4.9 ms. These earlier observations remain available, rather than being replaced by the best run: [initial series](evidence/tables-and-columns/increment2/workspace/results.json), [profiled rerun](evidence/tables-and-columns/increment2/workspace-profile/results.json), [CPU profile](evidence/tables-and-columns/increment2/workspace-profile/slash.cpuprofile).

For the fixed 31-character moved Block, contextual menu construction itself takes about **0.1–0.15 ms**, independent of active-document size. Opening the visible menu, including layout/focus, has medians of **2.6 / 9.3 / 20.0 ms** at 15.8k / 25.8k / 40.8k. Inserting a column through the menu, including dismissal and caret restoration, takes **9.8 / 31.3 / 64.6 ms**. These menu measurements invoke the actual browser menu programmatically to isolate its synchronous/microtask cost; they are not Event Timing paint measurements. Native keyboard/mouse menu operation is separately exercised by the functional gates.

In the same moderate/large fixtures, the legacy menu builder takes about 0.6/4.0 ms and its forced start-caret restoration about 2.65/17.3 ms. New menu insertion has about 2.1/8.4 ms inside `structuralTransaction()` and 0.95/8.1 ms in focus requests; it does not run the legacy forced-start helper. Native focus/layout and remaining active-view presentation work still matter. This is a targeted correction, not a claim that all legacy menu or renderer costs have disappeared.

A preliminary [forced-software-rendering probe](evidence/tables-and-columns/increment2/software-rendering-probe.json) recorded 728 ms median through paint on the moderate fixture. Hardware-rendered runs were substantially faster. Rendering configuration and frame scheduling therefore remain material to reproduction; software and Metal measurements are not silently combined.

## Continuity and regression evidence

- Actual typed commands cover creation, row/column insertion, cell/row movement and `/unc`, mid-paragraph caret mapping, exact literal Undo/Redo, invalid arguments, cancellation and stale sessions. The out-of-document field covers five selected siblings without inserting command text into them.
- A live local iframe retains its DOM element, `contentWindow`, loaded document and sentinel through typed movement/dissolution commands. The original API harness additionally checks transfer, repeated history and failed-publication recovery. These tests do not claim coverage of every external/native viewer.
- Surface front/back state and both mounted faces survive table movement. Navigation at 150% zoom reveals the destination cell horizontally without changing document/window scroll or canonical revision. Guide toggling does not mutate the Document. Both text-renderer paths pass.
- [Broad regression](evidence/tables-and-columns/increment2/tests.txt): **254 passed across 15 suites**. It covers tables, lists/tasks, Enter/Tab behavior, reversible surfaces, Scry/provisional input, native persistence and bounded inline/split work. The [final targeted recheck](evidence/tables-and-columns/increment2/final-targeted.txt) passes **144 tests across nine suites**, including the additional binding/parser/bounded-work tests; counts overlap the broad run. A final [minimal browser check](evidence/tables-and-columns/increment2/final-alias-browser/results.json) additionally verifies that unavailable `/c` remains literal rather than falling through to `/col`; the large-document matrix was not repeated for that parser refinement.
- [Reactive and server type checks](evidence/tables-and-columns/increment2/typecheck.txt) pass. `git diff --check` passes. The binding catalogue has no new navigation mappings.

The real Flint typing/continuity harness was compared with an isolated baseline consisting of `c1a02a2` plus the approved structural correction, without Increment 2 controls. The exact [baseline patch](evidence/tables-and-columns/increment2/baseline-structural-correction.patch) is retained. Forty edits in each before/after/inside-cell group record **zero snapshots, projection rebuilds and fetch requests**. Raw paired observations: [before/direct](evidence/tables-and-columns/increment2/before-direct/increment1.json), [after/direct](evidence/tables-and-columns/increment2/after-direct/increment1.json), [before/Solid](evidence/tables-and-columns/increment2/before-solid/increment1.json), [after/Solid](evidence/tables-and-columns/increment2/after-solid/increment1.json). Timing variation is not presented as a guaranteed typing speedup.

| Typing synchronous median, ms | Before table work | After table work, outside | Inside a table cell |
| --- | ---: | ---: | ---: |
| Approved correction baseline, direct cells | 9.1 | 6.9 | 7.2 |
| Increment 2, direct cells | 7.4 | 7.1 | 7.7 |
| Approved correction baseline, Solid cells | 24.8 | 20.5 | 19.9 |
| Increment 2, Solid cells | 16.9 | 16.5 | 17.7 |

In this original harness, moving the 926-character annotated Block takes 9.7 ms median synchronously before and after Increment 2 with direct cells; the legacy conversion takes 32.6/33.1 ms. These measurements include the existing UI work, are distinct from the fixed 31-character slash target, and do not establish a typing or structural regression.

## Remaining scope and reproduction

Increment 3 retains package/clipboard and broader interchange qualification, assistive-technology/VoiceOver qualification, broader viewer and nested zoom/pointer coverage, and release-scale evaluation. Existing roles and native button tests are not a substitute for that accessibility work. Large-active-document presentation latency and conservative shell-reference preflight remain explicit performance limits.

Run sequentially from the repository root, without concurrent tests:

```sh
STRUCTURAL_CASE=moderate BENCHMARK_NATIVE_GPU=1 BENCHMARK_OUTPUT=/tmp/table-controls-moderate node scripts/qualify-table-controls-browser.mjs
```

Other cases are `minimal`, `annotated25`, `large` and `workspace`. Set `BENCHMARK_DIRECT_CELLS=false` for Solid cells or `TABLE_PROFILE=1` for a CPU profile. Omit `BENCHMARK_NATIVE_GPU=1` to exercise forced software rendering. `scripts/qualify-tables-browser.mjs` supplies the existing typing and detailed live-viewer/history comparison; set its `BENCHMARK_DOCUMENT_PATH` to the native Masque fixture for the reported comparison. All harnesses use disposable browser profiles and leave source Documents unsaved.
