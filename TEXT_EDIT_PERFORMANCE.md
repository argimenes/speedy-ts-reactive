# Incremental text editing

## Follow-up: creating empty paragraphs with Enter (completed, 12 September 2026)

The remaining collapsed-caret boundary cases still create a full transaction
draft and use general insertion. Plan: add an explicit empty sibling paragraph
command, validate its three-record insert/remove batch, update only the parent's
children in each view, and route start/end/empty Enter through it. Keep the
existing focus rule (start/empty: remain in original block; end: focus new block),
formatting inheritance, atomic undo/redo and selected-range transaction fallback.
Extend the read-only chapter benchmark to all three boundary cases; add tests
for no snapshots, shared views, focus, annotation preservation and invalid batches.

Implemented `insertEmptyStandoffSibling`, a narrowly validated empty paragraph
insert/remove path and parent-only projection updates. Collapsed-caret Enter no
longer creates a transaction draft at any position. Selected-range Enter remains
atomic through the existing full planner. Undo/redo of empty creation is local.

Same read-only Vernon Blake chapter, Chrome development build:

| Enter position | Before handler | After handler | After through two frames | After undo |
| --- | ---: | ---: | ---: | ---: |
| Paragraph start | 1,296.1 ms | 2.1 ms | 63.4 ms | 0.7 ms |
| Paragraph end | 1,321.1 ms | 4.4 ms | 123.1 ms | 0.8 ms |
| Empty paragraph | 1,182.8 ms | 0.6 ms | 162.0 ms | 0.8 ms |

Snapshots: 3 → 0 for each case. Two-frame measurements include large-document
layout and scheduling and are not precise presentation timestamps. Existing
mid-paragraph splitting remains approximately 140 ms. The benchmark verifies
one added block, correct focus, restored text and unchanged unrelated DOM; it
never saves documents. Five added regression cases cover keyboard start/end/
empty Enter, multiple views, stable paragraphs, history, location indexes and
rejection of nonempty/detached batches. Qualification: 102 tests / 18 suites,
typecheck and client/server build. The existing chapter benchmark command below
now includes these boundary cases automatically.

## Follow-up: long paragraphs and Enter (12 September 2026, completed)

Reproduced against a read-only, in-memory copy of
`vernon-blake_the-art-and-craft-of-drawing/i-introduction-[9aa11f65].json`:
40,255 characters, 56 paragraphs; longest paragraph 5,632 characters / 33
annotations. Chrome baseline: 289.11 ms mean synchronous insert/delete handling;
Enter 1,752.40 ms, undo 1,197.70 ms, three split-time repository snapshots.

Specific plan before implementation:

1. Compile character style intervals once per annotation change instead of every
   Cell scanning every annotation; SVG-only changes must not invalidate Cell CSS.
   Use direct Cell children for caret restoration and annotation measurement.
2. Add a narrowly validated split/unsplit batch for a paragraph within a children
   slot. Transfer existing leaf Cells, preserve annotation splitting and history,
   update parent/paragraph occurrences only. Maintain location indexes alongside
   reference counts. Keep unsupported shapes on the full validator.
3. Avoid a transaction draft for a single collapsed-caret Enter split. Selected
   ranges and unsupported boundary cases may retain the existing atomic path.
4. Test overlap/cascade styling, annotation split boundaries, shared views,
   undo/redo, invalid split batches and unrelated DOM identities. Extend the
   repeatable browser benchmark to load a document URL read-only and measure
   Enter as well as typing; rerun this exact chapter and the full suite.

Implementation also found quadratic prefix counting in `graphemeBoundaries`:
Backspace counted all code points from the start of the paragraph for every
grapheme endpoint. `src/input/graphemes.ts` now accumulates segment lengths once,
retaining combining-mark, emoji/ZWJ, flag and CRLF boundaries.

Results on the same chapter and longest paragraph, Chrome development build:

| Operation | Before | After |
| --- | ---: | ---: |
| Insert/delete handling, mean of 40 events | 289.11 ms | 22.06 ms |
| Enter split, synchronous handling | 1,752.40 ms | 139.10 ms |
| Enter through two animation frames | 1,836.10 ms | 180.80 ms |
| Undo split, synchronous handling | 1,197.70 ms | 68.50 ms |
| Whole-document snapshots during split | 3 | 0 |

An earlier after-run measured 23.84 ms typing / 156.80 ms split. These are local
measurements, not universal timing guarantees. Input timing excludes deferred
geometry/paint; the two-frame split number includes scheduled layout work and
frame waits, not a precise presentation timestamp. The browser test verifies
restored text, right-paragraph focus, unchanged unrelated DOM, real insertion,
Backspace, Enter and undo/redo. No saves are issued to the document store.

Nine added regressions cover compiled CSS cascade/intervals, Unicode mapping and
absence of prefix slicing, direct keyboard Enter without snapshots, split/undo/
redo and location indexes, shared views, invalid batches and inline-atom fallback.
Full qualification: 97 tests / 18 suites, typecheck and client/server build.
One run experienced a roughly 270-second stall across unrelated workers and a
document-browser timeout; an unchanged full rerun passed all 97 tests in 5.71s.

Repeat the read-only chapter benchmark while `npm run dev` is running:

```sh
BENCHMARK_DOCUMENT_URL='/api/loadDocumentJson?folder=vernon-blake_the-art-and-craft-of-drawing&filename=i-introduction-%5B9aa11f65%5D.json' npm run benchmark:typing:browser
```

Remaining scope: splitting at a collapsed caret *inside* a text-only paragraph
uses the incremental path. Enter at the start/end, selected-range replacement,
joins, inline atoms and other structural operations can still use full planning.
Long paragraph Cell arrays/history and DOM index updates remain paragraph-local,
and dense decorations still require geometry work. No history grouping or
virtualization was introduced. The historical first-pass limits below should be
read with this follow-up in mind.

Implementation plan and results, 12 September 2026. Status: scoped pass complete.

The diagnostic measured 43 / 241 / 491 / 1,409 ms per character insert/delete
at 1k / 5k / 10k / 25k total characters, editing a fixed 100-character paragraph.
These were instrumented model-only measurements with one projection, excluding
browser layout. Each edit requested six repository snapshots and further clones.

## Scope and safeguards

1. Produce explicit operations for ordinary text insertion/replacement/deletion,
   touching only the paragraph and inserted/deleted text Cells. Avoid repository
   snapshot, diff and reachability scans for this path.
2. Add a narrowly validated incremental repository commit path, with content
   reference counts maintained across structural changes. Reject duplicate or
   foreign placements, preserve shared content, and retain atomic publication
   and reversible history. Undo/redo should use the same fast path when eligible.
   Structural transactions, inline atoms and unsupported cases may retain the
   existing fully validated path; do not weaken general validation.
3. Notify internal consumers with change sets instead of independent snapshots.
   Preserve snapshot subscriptions for compatibility, generating them only when
   actually subscribed. Model before/after events retain snapshot semantics on
   demand. Text-changed events inspect touched records only.
4. Patch affected paragraph occurrences in each projection; create/remove only
   changed leaf Cells. Keep unrelated records, DOM mounts, occurrence keys, shared
   views and ancestor routes intact. Structural operations retain full rebuilds.
5. Preserve annotation endpoint mapping, undo semantics, Unicode/composition,
   clipboard and serialization behavior. This pass does not introduce a new
   text representation, alter typing-history grouping, or complete the remaining
   original input-parity audit.
6. Keep a repeatable model benchmark and regression checks for no whole-document
   snapshots/rebuilds on the hot path, linked views, undo/redo, invalid updates,
   and structural fallback. Run the full suite and browser editing checks.

The performance target is that editing a fixed-size paragraph no longer scales
with unrelated document content. Large single paragraphs and dense annotations
may still require paragraph-local styling/layout optimizations. Record measured
results and remaining limits after implementation.

## Implementation and measured results

`TreeCommands.replaceInlineRange` now emits explicit Cell/owner operations.
`inline-plan.ts` verifies the narrow leaf-edit shape; the repository maintains
reference counts and applies validated batches by store path, including undo and
redo. Delta subscriptions replace internal snapshot subscriptions. Projections
index content occurrences and patch only affected owners and changed Cells.
Structural operations still rebuild/validate the graph and refresh the indexes.

Same-machine model benchmark before/after (one projection, fixed 100-character
paragraph, three insert/delete pairs, no warmup; browser layout excluded):

| Total document characters | Before, mean ms/edit | After, mean ms/edit |
| --- | ---: | ---: |
| 1,000 | 53.15 | 0.85 |
| 5,000 | 258.63 | 0.92 |
| 10,000 | 496.42 | 0.88 |
| 25,000 | 1,452.65 | 3.84 |

Whole-document snapshots per edit: **6 → 0**. The 25k case is about **378× faster**
in this run. These short runs include first-edit initialization and GC noise:
another concurrent test run measured 13.05 ms at 25k. This is not an end-to-end
keystroke-to-paint or universal latency guarantee.

Chrome development-page check: 250 rendered paragraphs / 25,000 characters,
one bold annotation per paragraph, 40 input events. Synchronous input handling
averaged **1.54 ms**, median **1.0 ms**, p95 **7.7 ms**; no snapshots. This includes
gateway, model and synchronous DOM updates but excludes deferred paint/layout.
Separate real Chrome `Input.insertText` / Backspace checks and undo/redo passed.
The original text and unrelated paragraph DOM identity were preserved. Fixtures
live only in memory; no document-store files are written.

Verification: **88 tests in 16 suites**, typecheck, client/server build passed.
Seven new regression tests cover zero snapshots/rebuilds at 25k, shared Cells
and views, structural fallback/index refresh, opt-in snapshot event compatibility,
atomic invalid operations, and a deterministic 40-edit Unicode/annotation
sequence compared with the fully planned path through undo and redo.

Repeat with:

```sh
npm run benchmark:typing
# With npm run dev already running, Node 22+ and Chrome installed:
npm run benchmark:typing:browser
```

The browser command defaults to localhost:3000 and macOS Chrome. Override
`BENCHMARK_URL` / `CHROME_BIN` as needed. Its isolated temporary profile is
removed on completion.

Remaining limits: very long individual paragraphs still copy their inline arrays
and remap annotations; dense decorations still require local geometry work.
Structural edits, multi-paragraph transactions, and deletion of inline atoms use
the full planner. Explicit legacy snapshot listeners and the optional live JSON
preview intentionally request whole-document serialization. Per-edit history is
still retained (no grouping or bounded-history policy was introduced).
