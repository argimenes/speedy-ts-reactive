# Block-scoped history — Stage B completion

Completed 17 September 2026 as an explicitly enrolled, finite, in-memory proof.
The [revised Stage B plan](BLOCK_SCOPED_HISTORY_STAGE_B_PLAN.md) and
[architectural specification](BLOCK_SCOPED_HISTORY_SPEC.md) remain the behavioral
contracts. Stage C has not begun. Normal application recording is not enabled.

Compact exact capture, isolated replay/checkpoints, independent fork ancestry,
historical subtree/location/dependency queries, rebuildable timeline indexing,
comparison, and derived sentence grouping are implemented. Existing undo/redo
execution, stack ownership, granularity, redo invalidation, and single-source
causes are unchanged. No word undo, grouped undo, durable storage, history UI,
historical copy, or collaboration protocol was added.

No architectural assumption in the revised plan proved false. Implementation
choices and performance limitations are detailed below; this is not a claim
that production recording or responsive historical UI is ready.

## Implementation

### Exact capture and replay

`CanonicalRepository.subscribeHistoryChanges(listener, onError)` is an opt-in
compact observer alongside the unchanged full-record observer. Compact-only
capture does not prepare a full event. Both formats use the same immutable
commit metadata, including timestamp, identity, cause, counters, and commands;
format preparation, finalization, and callback errors are isolated.

[compact-changes.ts](src/block-tree/compact-changes.ts) compares first preimages
with the validated records about to be installed. It accounts for every supported
canonical field, every direct payload key, field presence, both counters, and
children/inline sequences. Unknown canonical fields use exact full-record
fallback. Inserts/deletes retain full records. Unchanged paragraph sequences
are neither cloned nor retained by compact preparation.

[replay.ts](src/history/replay.ts) applies recorded values to an owned candidate
graph, verifies expected roots/counters/fields/sequence contents and versions,
and validates the resulting graph and authored identities before publication.
It never executes editor commands or undo. Failed application leaves its source
unchanged. Every accepted revision remains independently addressable.

### Store and isolation

[MemoryHistoryStore](src/history/memory-store.ts) creates a fresh strict repository
from an explicitly normalized Document baseline. Workspace roots, multiple
Documents, and a changed Document identity are rejected or reported as a gap.
`forkFrom(revisionId)` creates another isolated producer. Each producer advances
its own state parent; append sequence and `previousJournalRevisionId` are separate.
Tests interleave A→B, fork A→C, original B→D, fork C→E with repeated counters.

The subscriber only enqueues immutable events. A separately scheduled drain
performs replay, encoding-size measurements, indexing, and checkpoints. Queries
flush pending capture before deciding that a revision is missing. Checkpoints
reuse the extended graph codec inside a versioned segment/revision envelope and
are selected only from state ancestry. Original revisions are retained.

Capture, replay, and capacity failures stop the affected verified branch without
disabling current editing. Earlier verified states and independent producers
remain usable. Disposal unsubscribes producers and releases history queues,
mirrors, checkpoints, indexes, and caches; editor repositories/undo stacks remain
owned by their producer handles.

Queries and grouping receive a frozen
[read-capability facade](src/history/source.ts), with no editor or fork methods.
All published graphs, fragments, revision facts, locations, timelines, and groups
are immutable at runtime. Historical reads do not call the editor's snapshot
method, install projections, or resolve content through live registries/network.

Default finite-store budgets are 10,000 events, 64 MiB encoded revision volume,
64 MiB checkpoints, 1,024 pending events, eight producers, 32 MiB state cache,
and 8 MiB derived index volume. Checkpoint triggers initially remain 500 commits
or 8 MiB replay data. These are proof budgets, not production recommendations.
Encoded sizes are accounting estimates, not hard JavaScript heap ceilings;
pending capture is bounded by event count, not a serialized byte limit.

### Queries, indexing, and grouping

[HistoryQueries](src/history/query.ts) implements `getSubtreeAt`, `getLocationAt`,
`getTimeline`, `getGroupedTimeline`, and `compareSubtree`; `getStateAt` is the
store's exact-state query. Occurrence selectors use historical placements and
routes. Shared ancestor paths produce explicit ambiguity. Results distinguish
content deletion, placement deletion, a former route's absence, unplaced content,
unknown identity, branch-specific future creation, and incomplete history.
Comparison reports whether its evidence is sufficient; unknown/ambiguous/gapped
results do not become invented creation/deletion differences.

Subtree fragments preserve canonical identities, selected occurrence trees,
owned relations, reference/cycle edges, linked definitions, known Block-reference
dependencies, and asset descriptors. A dedicated closure validator handles
filtered fragments. Unavailable display dependencies produce diagnostics while
missing exact graph/replay evidence is incomplete. Opaque IDs remain opaque.

[Timeline indexes](src/history/index.ts) conservatively derive affected Block IDs
from both sides of edits, moves (including descendant location changes), reference
edges, and linked-definition dependencies. Queries refine candidates against exact
states and traversal options. Indexes rebuild from exact revisions; index capacity
exhaustion disables the optimization and falls back to scanning, without losing
authoritative history. Pages use branch-specific exact revision cursors.

[Grouping](src/history/grouping.ts) has a policy-neutral interface but implements
only the initial sentence policy. Groups contain ordered exact revision IDs and
an endpoint; they provide no replay patches or undo authority. IDs include policy,
version, segment, selected branch, scope, and relevant options. Grouped pagination
keeps all members and never bridges omitted revisions. Captured time, contextual
sentence segmentation, canonical Cell offsets, edit continuity, explicit actions,
and optional descriptive hints determine boundaries. Every constituent revision
can still be queried. Ordinary undo/redo are separately displayed captured actions.

## Verification

All commands ran with Node **v22.12.0**, macOS **15.5**, arm64.

| Verification | Result |
| --- | --- |
| Planned regression command over block-tree, history, input, clipboard, persistence, and Workspace manifest tests | 16 files / 121 tests passed at that checkpoint. Subsequent focused checks cover the later additions. |
| Final `npm test -- src/history src/block-tree/compact-changes.test.ts src/runtime/block-clipboard.test.ts` | **4 files / 32 tests passed**. |
| Final `npm run typecheck` | Client and server passed. `src/history` is explicitly included in client type checking. |
| Full `npm test` diagnostic run | **50 files passed, one failed; 333 tests passed, two failed** at that checkpoint. Both failures reproduce on the unchanged baseline; see below. |
| `git diff --check` | Passed. |
| Typing benchmark | Completed: 108 result rows / 4,320 measured operations, zero whole-Document snapshots. |
| History benchmark | Completed all six workloads, including dense annotations, large sibling lists, mixed split/undo/redo, and checkpoint spacing. |

The full-suite failures are in `src/rendering/block-context-menu.test.tsx`:
“deletes the clicked Block rather than stale focus and undoes the operation”
cannot find the Delete Block menu item; “adds, activates, renames, reorders and
deletes tabs using their label targets” reads `ownerKey` from an undefined value.
Both reproduce, with the same errors, on baseline commit **f78b309** in an isolated
worktree using the same Node executable (five tests pass, two fail in that file).
The temporary worktree was removed. These unrelated tests and product behavior
were not changed. The repository's full test suite is therefore not clean.

Focused coverage includes every-revision compact/full/live parity through seeded
Unicode edits, annotation offsets, split/join, moves, margins, linked definitions,
shared removal, inline images, pruning, root changes, repeated writes, transient
records, normalized clipboard cut/paste/copy, and ordinary undo/redo. Direct commits
exercise payload/counter changes excluded by inline structural validation, absent,
null, and own-undefined fields, unknown-field fallback, and caller mutation.
Adversarial tests cover malformed versions/fields/splices, stale preconditions,
duplicate/out-of-order events, producer gaps, capacity exhaustion, runtime mutation
attempts, index rebuilding/fallback, cyclic references, branch-specific creation,
group paging, captured idle/max-span time, fork boundaries, and unchanged undo.

## Benchmark results

Raw artifacts:

- [Typing: off/full/compact](BLOCK_SCOPED_HISTORY_STAGE_B_TYPING_BENCHMARK.json)
- [History/query/memory workloads](BLOCK_SCOPED_HISTORY_STAGE_B_HISTORY_BENCHMARK.json)

Reproduce with `npm run benchmark:typing` and `npm run benchmark:history`.
The Stage A completion report and original benchmark artifact are unchanged.

### Typing capture

The typing benchmark retains Stage A's normalized fixtures, five warm-up cycles,
20 measured cycles per mode, and serialization outside timed edits. Each supported
single-character compact event contains **one changed sequence key**, compared
with 11,201 or 50,001 keys in the long-paragraph full events. No tested compact
operation needed an unsupported existing-record fallback; full new/deleted record
deltas are still present where required.

| Paragraph characters | Full event bytes | Compact event bytes | Off median / p95 ms | Full median / p95 ms | Compact median / p95 ms |
| --- | --- | --- | --- | --- | --- |
| 100 (1,000-character Document) | 11,848 | 1,941 | 0.247 / 0.288 | 0.310 / 0.445 | 0.266 / 0.286 |
| 5,600 | 550,852 | 1,947 | 9.747 / 10.723 | 10.784 / 17.242 | 10.166 / 11.783 |
| 25,000 | 2,452,054 | 1,951 | 86.234 / 167.883 | 104.330 / 121.016 | 95.361 / 233.396 |

The long-paragraph event reductions are approximately **99.65%** and **99.92%**.
The structural capture gate passes; total constant-time typing does not follow.
The 25,000-character compact p95 is worse in this run. Fixed mode order, garbage
collection, and system noise prevent interpreting these numbers as a guaranteed
latency improvement.

A separate untimed probe reports total `structuredClone` volume. At 25,000
characters it is 6,128,466 bytes with capture off, 8,580,143 with full capture,
and 6,129,354 with compact capture. Thus capture-specific cloned volume is small,
while existing command/repository/projection/undo copying remains substantial.
Explicit JavaScript array spreads are not included in this probe; counts/bytes
are a measured lower bound, not a complete allocation profile. The unchanged
undo stack retains about **122.6 MB encoded** after this workload in every mode.

Splits remain large: the 25,000-character compact split is 1,228,056 bytes versus
2,453,553 full, because transferred Cells and the new record must be exact.
Dense annotation arrays likewise retain full before/after changed arrays.
The 256 KiB/event and 5,000-character investigation thresholds remain relevant.

### Historical services

The history benchmark uses explicit checkpoint intervals of 20/100 commits for
120-edit short histories, 10 for 5,600-character/dense/sibling workloads, and five
for a 12-edit 25,000-character history. It measures cold/warm state reconstruction,
subtrees, timelines, grouping, index rebuilding, comparison, split/undo/redo, and
retained component sizes. Query timings are individual workload observations,
not warmed browser percentiles; grouping runs after timeline queries and can
benefit from their state cache.

| Workload | Drain median ms | Cold / warm state ms | Subtree ms | Timeline ms | Grouping ms | Temporal index rebuild ms |
| --- | --- | --- | --- | --- | --- | --- |
| 100 chars, 120 edits, checkpoints every 20 | 1.635 | 25.313 / 0.053 | 7.910 | 1,822.675 | 25.281 | 70.461 |
| Same, checkpoints every 100 | 1.840 | 31.145 / 0.011 | 34.790 | 4,704.604 | 8.106 | 59.978 |
| 5,600 chars, 30 edits | 79.662 | 479.773 / 0.019 | 196.247 | 14,915.501 | 9,953.232 | 13,881.649 |
| 25,000 chars, 12 edits | 535.060 | 773.797 / 0.132 | 1,632.221 | 27,519.205 | 12,459.426 | 16,657.489 |
| 5,600 chars, 500 annotations, 20 edits | 87.256 | 526.117 / 0.074 | 205.061 | 10,808.598 | 6,814.163 | 7,508.256 |
| 300 siblings, 30 edits | 43.941 | 552.138 / 0.027 | 143.096 | 6,069.824 | 5,301.050 | 5,918.192 |

Patch application (including private graph copying) and full graph/identity
validation are separately accumulated in the artifact. In the 25,000-character
workload they total about 16.93 and 6.72 seconds across all measured reconstruction
work; encoding, index construction, and other service overhead are additional.
The final retained volumes include 13.38 MB mirror, 26.76 MB cache, 53.52 MB
checkpoints, and 3.72 MB revisions, plus 31.88 MB existing undo data. These are
serialized accounting volumes and do not include every transient/engine allocation.

Full-graph copying/validation per replayed revision and correctness-first
before/after query extraction remain expensive. Scheduling the drain outside
the commit callback does not make that work cheap or move it to another thread.
These results must inform checkpoint, cache, incremental validation/indexing,
and worker decisions before production enablement or durable storage defaults.

## Material implementation choices and deviations

1. **One verified changed span per sequence.** The implementation uses a single
   prefix/suffix-derived splice instead of an array of splices and new validator
   hint plumbing. It reads the validated final records before installation and
   checks all fields. This adds a linear sequence traversal, but no unchanged
   sequence copy. Disjoint edits in one transaction may include unchanged keys
   inside their bounding span; minimal multi-range patches are not claimed.
   The edit-sized capture guarantee is proven for the supported contiguous edits.
2. **Optional hints stop at commit metadata.** A small sanitized `InputIntent`
   carries descriptive action/boundary/occurrence facts. No gateway, composition,
   selection, command transaction, or undo changes were needed. Grouping works
   without hints; production input collection remains optional later integration.
3. **Small module organization.** Query comparison lives with queries; there is
   no separate `compare.ts`. A read-capability facade prevents the query/policy
   interface from exposing editable producers. A conservative per-Block timeline
   index narrows exact before/after scans and can be rebuilt or discarded.
4. **Derived results are recomputed.** There is a bounded full-state cache and
   timeline index, but no retained sentence-group or fragment cache. Grouping
   output is caller-owned immutable data; the benchmark records output bytes.
5. **Measured cache adjustment.** An initial 8 MiB cache could not hold the
   approximately 13 MiB 25,000-character state, eliminating warm-cache benefits.
   The default is now 32 MiB. Other finite proof limits remain explicit; no
   production budget or durable checkpoint interval is inferred from this run.
6. **Comparison evidence is explicit.** `comparable: false` accompanies unresolved
   identities/occurrences or gaps, instead of fabricating a creation/deletion
   comparison from unavailable data.

## Remaining issues and proof required before Stage C

- The two baseline context-menu failures remain unresolved. No new failure was
  found in the implemented Stage B scope or final client/server type checks.
- Large-graph drain, replay, timeline, and grouping latency is unsuitable for
  assuming responsive production use. Queue throughput, scheduling/threading,
  checkpoint placement, cache pressure, and incremental validation/indexing
  require explicit follow-up decisions; unchanged editing/undo allocation is
  still a separate significant cost.
- This proves exact **in-memory** values, not a durable wire codec. Byte metrics
  use JSON encoding; own-undefined values that survive in-memory replay are not
  losslessly represented by ordinary JSON. Stage C must define value admission
  or lossless encoding and prove round trips, schema migration, corruption
  detection, and baseline/event/checkpoint compatibility before writing memoirs.
- Cross-session resource/placement identities, saved versus unsaved heads,
  reload branches, external edits, save receipts, atomic journal recovery,
  browser outbox durability/backpressure, and multi-writer coordination remain
  unimplemented and unproven. Single-Document enrollment is not a Workspace
  resource partitioner.
- Historical UI/rendering, browser playback cancellation, historical copy,
  cross-Document biography, expiry/retention rewriting, media-byte archival,
  and semantic/AI grouping remain later-stage work. Sentence segmentation is
  an initial locale/engine-dependent display policy, not linguistic authority.

Stage B's exact capture, independent replay ancestry, isolation, derived grouping,
query semantics, and structural capture-size gates are verified for the supported
canonical scenarios. Its measured service costs and unresolved baseline tests
are explicit. **Do not treat this completion as authorization to begin Stage C.**
