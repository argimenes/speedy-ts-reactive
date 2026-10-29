# Structural Transaction Latency — Correction and Qualification

**Date:** 29 October 2026. **Baseline:** `c1a02a2` (Tables). **Status:** the repository-wide bottleneck is corrected for the qualified local structural path. This report records the correction before Increment 2; subsequent command/UI work is documented in the [Increment 2 qualification](TABLES_AND_COLUMNS_INCREMENT_2_QUALIFICATION.md). Single-frame interaction and uniformly single-digit tail latency are not claimed.

The fix introduces a reusable local canonical transaction, used by table operations and existing Block-menu conversion. It retains the repository's existing commit, indexes, capture, Undo storage and replay. No table-specific persistence/history, document migration, new input hook or new feature flag was introduced. The user's requirement to check for unnecessary broad work on every editor change is now recorded in [AGENTS.md](../../AGENTS.md).

## Root cause and execution path

Previously, wrapping one existing Block meant a full repository snapshot, then full cloned planning and validation for both `insert()` and `move()`, followed by another full validation at commit. Location derivation ran seven times. The final publication rebuilt two complete projections and their occurrence registrations. Flint also rebuilt its Document catalogue despite no change to Document identities, titles or root placements.

The initial instrumented annotated fixture measured 172 clone calls, three full validations, seven location passes and two projection builds per action. Aggregate cloning consumed about 318 ms, full validation about 206 ms of exclusive time, location derivation 81 ms, and projection building/registration about 98 ms. The actual `moveBefore` calls took about 0.16 ms. These are instrumented mean phase costs, not additive median timings; the CPU profiler and timing wrappers add overhead.

The corrected path is:

1. Prepare and validate the table selection as before.
2. Assemble changed canonical records in a private write set over read-only current records. Only changed records are cloned. Insert/move commands use indexed placement locations and incoming ownership evidence.
3. Coalesce the writes and prove the final batch's topology and resource ownership locally. No trust is placed in the command name. Invalid or unclassified batches still go through full canonical admission.
4. Use the existing incremental commit machinery to update affected records, locations, reference counts, identities and resource-boundary evidence, and create the ordinary inverse/history entry.
5. Update changed projection owners, fresh branches and moved routes. Keep existing occurrence keys and retained mounts, including historical route keys needed by Redo. Unrelated Document projections receive no state publication.
6. Preserve existing table caret/media restoration. Skip the Document catalogue refresh only when the validated change cannot affect that catalogue.

## Infrastructure changes and correctness boundaries

- [StructuralDraft](../../src/block-tree/structural-draft.ts) holds changed records, edge locations and reference-count deltas. Unsupported commands materialize a complete draft once and continue with the general planner; the callback is not rerun. Failure discards the draft.
- [TreeCommands](../../src/block-tree/commands.ts) exposes `structuralTransaction()`. Insert, same-resource move, bounded removal, metadata and plain native inline edits can compose inside it. The existing general `transaction()` remains available. Direct ordinary moves also use indexed lookup where proven safe.
- [Structural admission](../../src/block-tree/structural-plan.ts) checks changed edges, unique ownership, ancestry, cycles, retained definitions and final references. It rejects local classification of resource-root lifetime changes, cross-resource or ambiguous ownership, special reference/registration mutations, existing owned-relation changes and stranded legacy subtrees. Full validation remains the fallback; rejection never becomes permission to publish.
- [CanonicalRepository](../../src/block-tree/repository.ts) retains its identity validators, inverse operations, exact/compact capture and Undo/Redo machinery. The new change hint is derived by admission and is not persistent document data. Undo and Redo pass through the same admission rules.
- [BlockTreeProjection](../../src/block-tree/projection.ts) updates only affected owners and moved/new subtrees when unique occurrences can be preserved. Shared occurrence ambiguity retains the general builder. Historical occurrence routes remain available for Undo/Redo. No broad renderer or Window Manager rewrite was required.
- [Flint's catalogue subscription](../../src/application/document-application-capabilities.tsx) no longer responds to proven local structural or task-state changes. Document-root/title/identity changes continue to invalidate it.

Cost now follows changed records, affected parent arrays, ancestry and moved occurrence routes. Reparenting a long paragraph still visits its moved Cell routes; changing an owner with 541 children still processes that owner's ordering. Neither requires reading unrelated paragraph contents or unrelated Documents. Existing whole-snapshot observer APIs remain expensive if a caller explicitly subscribes to them; ordinary Flint does not use them on this path.

## Scaling qualification

All four fixtures move the **same 31-character annotated TextBlock** into a two-cell table. Only unrelated content changes. Counts below are canonical content records, including character Cells. The workspace case contains five Documents but displays the same target Document. Each series uses two warmups and eight measured actions with Undo between actions.

Headless Chrome runs real Flint components with the same viewport, direct-cell renderer and native fixture admission. No user Document is saved. Before measurements have no CPU profiler/timing wrappers active. The final after series uses only lightweight phase timing around Solid's batch boundary, without CPU profiling; structural computation is synchronous elapsed time minus the reactive flush outside the repository publication callback. It **includes** preflight, planning, canonical mutation/indexing, history and projection maintenance. Rendering and subsequent caret microtasks remain reported separately.

All values are **median / p95, milliseconds**. With eight samples, p95 is the maximum observed sample: these are descriptive engineering measurements, not a statistical tail guarantee.

| Fixture | Records | Before synchronous | After synchronous, including UI flush | After structural computation |
| --- | ---: | ---: | ---: | ---: |
| Minimal | 40 | 6.1 / 7.5 | 4.4 / 4.5 | 2.1 / 2.4 |
| Annotated Masque | 15,824 | 915.0 / 1318.1 | 5.5 / 20.2 | 3.1 / 14.9 |
| Masque + 500 paragraphs | 41,324 | 2591.0 / 3069.0 | 18.4 / 25.4 | 7.1 / 9.6 |
| Five unrelated Documents | 79,096 | 4278.4 / 4636.7 | 6.2 / 9.0 | 3.3 / 5.7 |

Structural computation medians meet the single-digit target in all four fixtures. Four additional unrelated Documents change the moderate-case median from **3.1 to 3.3 ms**. The larger active Document's **7.1 ms** median includes its longer affected parent ordering. The annotated case has a **14.9 ms p95 outlier**, so the target is not established for every tail sample.

Frame-settled results are not hidden:

| Fixture | Before two-RAF settled | After microtask settled | After two-RAF settled | After idle two-RAF cadence |
| --- | ---: | ---: | ---: | ---: |
| Minimal | 32.9 / 42.4 | 6.7 / 7.1 | 29.2 / 33.5 | 101.0 / 140.0 |
| Annotated Masque | 948.4 / 1340.9 | 12.8 / 41.4 | 183.3 / 267.6 | 133.1 / 332.7 |
| Masque + 500 paragraphs | 2736.9 / 3301.7 | 64.4 / 83.7 | 167.4 / 416.6 | 33.2 / 202.1 |
| Five unrelated Documents | 4336.5 / 4675.3 | 13.4 / 18.0 | 216.7 / 333.5 | 116.4 / 166.9 |

The after runs show substantial headless frame-scheduling variability even during idle waits. Idle cadence is reported for context and is **not subtracted** from interaction measurements. The large active Document also incurs real caret/layout and derived-UI work after publication. These measurements do not establish single-frame interaction or guaranteed user-visible latency. The original workspace-sized synchronous work has been removed; remaining frame and active-Document UI costs are separate limitations.

Raw results: [before](evidence/structural-latency/before-unprofiled), [after with phase timing](evidence/structural-latency/after-phases), and an additional [unprofiled after series](evidence/structural-latency/after-unprofiled). The additional series measured synchronous medians of 3.9 / 3.4 / 22.2 / 4.8 ms for minimal / moderate / large / workspace. One large-fixture headless run timed out and was rerun; the successful evidence and the explicit frame variability above are not treated as a rendering guarantee.

## Pipeline attribution

A separate instrumented before/after run on the same moderate fixture measures the complete pipeline, including asynchronous caret restoration. The following phase numbers are **mean milliseconds per action**; inclusive rows overlap and must not be added. The CPU profiler is enabled in this series, so use the preceding table for the main latency comparison.

| Stage | Before | After | Interpretation |
| --- | ---: | ---: | --- |
| Target resolution and preflight | 0.25 | 0.44 | Remains local; not the bottleneck |
| Repository snapshot | 72.09 | 0 | One full snapshot removed |
| Structural command publication/planning | 292.47 | 0.33 | Two full intermediate planners replaced by staged record writes |
| Canonical reactive record writes | 0.19 | 0.19 | The small record mutation itself was already cheap |
| Full index rebuild | 13.97 | 0 | Affected reference/location/boundary entries now update during publication |
| Local structural proof | — | 0.11 | Final changed-edge/ownership admission |
| Undo storage | 0.22 | 0.19 | Same storage architecture; never the dominant cost |
| Change subscribers, including projections | 250.58 | 0.84 | Full projection rebuilds and irrelevant catalogue invalidation removed |
| Retained outlet attachment | 0.89 | 1.40 | Existing mount mechanism retained |
| Actual DOM `moveBefore` calls | 0.20 | 0.16 | Two moves, not the source of the original delay |
| Native caret restoration | 2.27 | 3.05 | Measured callback body, including native selection work |
| All measured microtasks | 5.60 | 8.61 | Includes caret restoration and deferred UI work; not canonical computation |

After admission, the complete repository publication callback averages **1.35 ms** including indexes, history and projection notifications, versus 265.01 ms before. Two Block rectangle reads average about 0.04 ms afterward; no Range-rectangle queries were recorded in this action. Browser-internal layout caused by selection restoration is included in the native caret timing, not claimed to be zero. Exact durable capture is opt-in and was qualified by replay tests rather than by pretending the benchmark's inactive capture subscribers did work.

The detailed [before evidence](evidence/structural-latency/before-detailed/moderate/results.json), [after evidence](evidence/structural-latency/after-detailed/moderate/results.json) and adjacent Chrome CPU profiles retain call counts and inclusive/exclusive timings. There are **zero** full snapshots, full planners/validators, full index rebuilds and full projection builds in the qualified after action. Profiling instrumentation exists only in [the benchmark harness](../../scripts/benchmark-structural-browser.mjs), not production code.

## Original Increment 1 browser regression

The original harness was rerun sequentially on unchanged baseline `c1a02a2` and the corrected implementation with the same native Masque fixture and browser flags. This comparison moves a **926-character annotated Block with a nested container**, in a 16,850-character qualification document; it is distinct from the fixed 31-character scaling test. Twelve measured samples follow two warmups.

| Direct-cell renderer | Before median / p95 | After median / p95 |
| --- | ---: | ---: |
| Table creation, synchronous including UI | 779.0 / 1276.7 ms | 11.6 / 13.8 ms |
| Legacy grid menu conversion, including menu/focus work | 810.9 / 908.7 ms | 43.4 / 45.9 ms |
| Table preflight | 0.3 / 0.7 ms | 0.4 / 0.5 ms |
| Snapshots across twelve table conversions | 12 | 0 |
| Snapshots across twelve legacy conversions | 12 | 0 |

These are fresh measurements, not a substitution of the older 496.4/530.2 ms baseline. The legacy harness also constructs the menu and synchronously focuses a descendant; its remaining cost is not represented as pure structural computation or as meeting a single-frame target.

Both direct-cell and Solid-cell renderers pass: original Block/content/placement identity, the same mounted text root, exact caret positions **9 → 6 → 9 → 6**, independent cell contents of **4 versus 2 Blocks**, and unchanged iframe DOM element, `contentWindow`, loaded document and sentinel through cell swap, row movement, transfer, dissolution and Undo/Redo. An injected before-publication failure leaves the repository and live viewer intact and releases temporary parking. Whole list/task content remains intact.

Forty ordinary `beforeinput` edits per group still produce **zero snapshots, projection builds or fetch requests**. Fresh direct-renderer typing medians were 11.5/9.9/8.1 ms on baseline versus 13.6/11.5/11.1 ms after (before table work / afterward / inside a cell). The Solid-renderer after series measured 23.2/22.4/26.3 ms. These timing differences are retained, not presented as a typing speedup; the bounded-work assertions and existing inline tests pass. Absolute timings and frame scheduling vary on this shared headless host.

Browser evidence: [baseline](evidence/structural-latency/before-browser/increment1.json), [direct renderer](evidence/structural-latency/after-browser/increment1.json), [Solid renderer](evidence/structural-latency/after-browser-solid/increment1.json). All three runs report zero browser exceptions.

## Regression checks and remaining limits

- [Broad canonical/history run](evidence/structural-latency/regression.txt): **333 passed, two failed** across 40 suites. Both failures belong to the isolated portable-codec spike and reproduce on unchanged `c1a02a2`: its old structural-field whitelist rejects copied placement data. [Baseline reproduction](evidence/structural-latency/baseline-codec.txt). No codec migration or unrelated fix was made.
- [Editor regression run](evidence/structural-latency/editor-tests.txt): **229 passed** across 12 suites, covering tables, Tab/list/task behaviour, automatic prefixes, Scry/provisional input and entity listings.
- [Final targeted recheck](evidence/structural-latency/final-targeted-tests.txt): **38 passed**, including all 28 table tests and ten structural correctness/performance tests. Counts overlap the earlier runs.
- New checks compare live projections with independently rebuilt projections, fully validate resulting repositories, replay compact durable changes exactly, exercise composed moves/removals/native inline edits, verify atomic failure, historical shell occurrence identity, shared-occurrence fallback, unsupported-command materialization, and reject detached/cyclic/resource-root changes from local admission. Bounded-work checks assert zero snapshots/index/projection rebuilds and no unrelated payload reads; unrelated Document views receive no state publication.
- [Reactive and server TypeScript checks](evidence/structural-latency/typecheck.txt) pass. `git diff --check` passes.

The general transaction path and unclassified operations can still require broad work. Shared occurrence ambiguity, resource transfers, complex relation changes and callers requesting whole snapshots are explicitly outside the bounded proof. Ordinary typing keeps its existing earlier fast paths and does not enter structural admission. No provisional editor input is committed merely to gain access to this mechanism.

The repository-wide performance correction is implemented and qualified for the tested local operations. **Increment 2 was not part of this qualification.** Active-document rendering/layout, derived entity UI refreshes and legacy menu/focus costs remain visible in the report; single-frame and universal tail-latency qualification would require further work or an explicitly accepted limitation, rather than silently treating this milestone as release qualification. The subsequent [Increment 2 report](TABLES_AND_COLUMNS_INCREMENT_2_QUALIFICATION.md) measures actual slash interaction through paint and investigates the remaining menu/focus work.

## Reproduction

From the repository root, run the harness sequentially (avoid concurrent tests while timing):

```sh
STRUCTURAL_CASE=moderate STRUCTURAL_PROFILE=false STRUCTURAL_PHASES=true BENCHMARK_OUTPUT=/tmp/structural-moderate node scripts/benchmark-structural-browser.mjs
STRUCTURAL_CASE=moderate BENCHMARK_OUTPUT=/tmp/structural-profile node scripts/benchmark-structural-browser.mjs
```

Repeat with `minimal`, `large` and `workspace`. `BENCHMARK_DOCUMENT_PATH` can select a native fixture; the recorded series uses the native Masque file. For the before series, run the same harness against baseline `c1a02a2` in an isolated checkout. `scripts/qualify-tables-browser.mjs` supplies the original continuity and typing comparison; set `BENCHMARK_DIRECT_CELLS=false` for the Solid renderer. All harnesses use disposable browser profiles and in-memory editor state.
