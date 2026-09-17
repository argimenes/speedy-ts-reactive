# Block-scoped history — Stage A completion report

Status: **Stage A complete**, 17 September 2026. Verified against
[the amended plan](BLOCK_SCOPED_HISTORY_STAGE_A_PLAN.md). Stages B–E remain
unimplemented. This report supersedes the earlier stopped-work report.

## Delivered behavior

Authored Blocks have UUID factories, explicit identity normalization, and an
opt-in current-state identity index (`enforceBlockIdentity: true`). Normalization
preserves valid legacy IDs, rejects ambiguous imports without partial changes,
and leaves text/image Cells as internal records. Default legacy decoding remains
lossless; no document files are migrated and strict mode is not enabled halfway
through a live undo stack.

Creation commands assign IDs to new authored content, including id-less inputs.
Move/transclusion preserve identity; split preserves the left Block and creates
a new right identity; join preserves its survivor. Copy/detach allocate new IDs.
Replacement can retain a placement while installing a different Block identity.
Background descriptor changes retain the existing surface ID and reject an
incoming conflicting ID. Known Block references are remapped without rewriting
opaque relation data or entity IDs.

`CanonicalRepository.subscribeCommits(listener, onError)` optionally delivers
owned, deeply frozen commit facts across the general, inline, split, and empty
paragraph routes. Events include final content and placement deltas, preimages,
root/revision changes, UUID commit identity, structured command provenance, and
undo/redo causes. Nested commands produce one outer event. Undo entries retain
the original commit ID even when capture was not subscribed during the edit.
Capture does not depend on undo recording.

Capture callbacks and their error handlers are isolated; synchronous mutation
from a capture callback is rejected. Invalid/aborted edits emit nothing, and
undo/redo preserve their stack entries on failure before mutation. Capture
preparation errors are reported with the commit ID without rolling back an
otherwise valid edit. There is no repository-owned event stream or retry queue;
with no subscribers, event copying/freezing is skipped.

The existing in-memory clipboard carries a correlation token from cut to paste.
An eligible paste preserves public IDs with fresh runtime keys; repeated paste,
restored-source collisions, and id-less legacy sources use fresh copy identities.
The event reports the actual outcome.

## Approved copy-policy correction

The original plan assumed legacy encode/decode could provide an unambiguous
source-to-copy identity map. A valid canonical graph disproved that assumption:
one shared ContentRecord with two placements expands into two independent DTO
records carrying the same public ID. A Block reference to that ID then has two
possible copied targets.

The approved amendment to section 4.4 uses the existing
`captureBlocks()` / `cloneBlocks()` / `insertFragment()` helpers. Copy preserves
sharing inside the copied graph, assigns one fresh ID per copied authored
ContentRecord, and remaps supported Block references and linked annotations to
the unique copy. `encodeDocument()` remains a compatibility check: ordinary copy
still explicitly rejects inline-image export loss and cyclic legacy export.
Tests cover both failures without repository mutation or capture emission.

## Identity and replay evidence

The normalization fixture contains a missing Document ID, a null paragraph ID,
a blank owned-margin ID, an existing `" legacy "` ID, inline Cells, and opaque
relation data. Its report contains exactly three assignments. The existing ID,
graph keys, Cells, null/omitted collections, and opaque data survive unchanged;
a second normalization proposes no assignments. A separate ambiguous fixture
reports both a duplicate ID and an invalid numeric ID before allocating anything.

Strict-mode tests cover collisions, direct ID rewrites, insertion, fragments,
owned relations, replacement with preserved children, split/join, multiline
creation, removal/undo, and shared content. Ordinary encode/decode preserves
normalized public IDs; the extended codec preserves shared canonical identity.
Existing unnormalized compatibility fixtures still round-trip unchanged.

The test-only replay helper applies raw event deltas to a plain graph, checks
preimages/revisions/root, and validates the result. It never executes repository
commands to reconstruct state. Every intermediate revision is compared with the
live canonical graph, including undo/redo and an edit that discards redo state.
The fixed structural and seeded Unicode sequences replay a second time from
the same baseline. Coverage includes moved children, shared-content removal,
annotations, linked definitions, margins, opaque/null data, inline image atoms,
root replacement, repeated record writes, and transient create/delete pairs.
Clipboard sequences also replay exactly.

## Verification

The initial resumed verification passed **13 files / 106 tests**:

```sh
npm test -- src/block-tree src/runtime/block-clipboard.test.ts src/reactive-editor/persistence.test.ts src/reactive-editor/workspace-manifest.test.ts src/rendering/block-selection.test.tsx src/rendering/stable-background.test.tsx
npm run typecheck
```

After adding late-subscription undo/redo coverage, cyclic-copy coverage, and
specific descriptors for inline-image/background commands, the affected
commit-capture and stable-background suites passed (11 tests), and the identity
suite passed (10 tests). This brings the verified scope to **107 distinct tests**.
The cyclic-copy test initially matched `cycle` against the existing error text
`cyclic`; correcting that assertion required no production behavior change.
Final client/server type checks and `git diff --check` passed.

The two rendering test changes reflect intended behavior: new inserts receive
IDs while loaded legacy Blocks still use placement fallback; background changes
preserve surface identity and reject conflicting IDs without remounting content.
No legacy data fixtures were rewritten.

## Performance evidence

The updated [benchmark](scripts/benchmark-typing.mjs) ran separately from tests
on macOS 15.5 arm64, Node v22.12.0. Full results, including median/p95 latency,
mean clone time, record counts, and encoded byte sizes for every operation, are
in [the recorded JSON](BLOCK_SCOPED_HISTORY_STAGE_A_BENCHMARK.json).

Reproduce with `npm run benchmark:typing`. Each capture-off/on case uses the
same normalized fixture with strict identity enabled, five warm-up cycles and
20 measured cycles. Each mode/fixture measures typing, deletion, empty insertion,
and split 20 times each, undo 100 times, and redo 60 times: **2,880 measured
operations** across six fixtures and both modes. Undo/redo samples mix text,
empty insertion, and split routes. All fixtures include an annotation.

Serialization occurs after each cycle's timed edits. The benchmark retains at
most one cycle of events before reducing them to scalar metrics, so large
paragraph captures do not accumulate across all samples. No benchmark changes
user documents. Every measured operation took **zero whole-Document snapshots**;
no event included an unchanged paragraph record. Existing capture-on/off guards
also verify indexes, shared projections, fast-route rejection, and undo/redo.

Typing measurements (milliseconds; bytes are the largest encoded typing event):

| Document / paragraph characters | Off median / p95 | On median / p95 | Off / on mean clone ms | Capture records | Capture bytes |
| --- | --- | --- | --- | --- | --- |
| 1,000 / 100 | 0.412 / 0.566 | 0.542 / 0.692 | 0.137 / 0.200 | 3 | 11,848 |
| 5,000 / 100 | 0.634 / 1.021 | 0.494 / 0.701 | 0.220 / 0.191 | 3 | 11,848 |
| 10,000 / 100 | 0.397 / 0.456 | 0.502 / 0.567 | 0.135 / 0.191 | 3 | 11,848 |
| 25,000 / 100 | 0.465 / 0.831 | 0.515 / 0.722 | 0.156 / 0.193 | 3 | 11,848 |
| 5,600 / 5,600 | 15.533 / 20.873 | 21.050 / 27.039 | 4.230 / 7.470 | 3 | 550,852 |
| 25,000 / 25,000 | 90.703 / 117.622 | 106.038 / 119.622 | 24.276 / 32.322 | 3 | 2,452,054 |

Long-paragraph splits illustrate the additional cost:

| Paragraph characters | Off median / p95 ms | On median / p95 ms | Maximum encoded event bytes |
| --- | --- | --- | --- |
| 5,600 | 56.523 / 81.269 | 62.424 / 77.609 | 552,349 |
| 25,000 | 292.263 / 326.712 | 310.818 / 437.768 | 2,453,553 |

These are warmed local measurements, not a browser latency guarantee. Capture
off runs before capture on; runtime/GC and system noise can make individual
capture-on rows faster. Structural gates, rather than an invented time budget,
are the Stage A acceptance criteria. Enter captures the changed parent's child
list, so its byte size can grow with sibling count even though unchanged
paragraph records are excluded.

Full before/after arrays are expensive for long paragraphs. As a **follow-up
investigation threshold**, flag events above **256 KiB** and paragraphs above
**5,000 characters** before enabling sustained history recording in the app.
Both long fixtures cross that threshold, and the 25,000-character fixture is
already slow with capture disabled. Measure compact text/sequence patches and
projection costs before selecting a product latency budget or durable outbox
limits. No patch format, size cap, or new hot-path serializer is added in Stage A.

## Approved follow-up after completion

The user accepted the proposal to make individual captures compact, group undo
by words/typing bursts, and present historical playback by sentences or editing
sessions. These are approved design policies, not additional completed Stage A
features. The [Stage B technical plan](BLOCK_SCOPED_HISTORY_STAGE_B_PLAN.md)
defines their implementation alongside isolated historical queries.

The priority is exact sequence/field changes at the repository boundary, with
full-record fallback for unsupported operations. Word/sentence grouping follows
that optimization; grouping after full paragraph copying would leave the original
capture cost in place. Every original revision remains addressable, and grouped
undo retains all source commit identities. Playback grouping, disk batching,
and retention remain separate decisions. No intermediate states are deleted by
this amendment, and the original benchmark above remains unchanged evidence.

## Exit gates and scope limits

| Gate | Evidence / outcome |
| --- | --- |
| 1. Explicit identity normalization | Assignment/ambiguity reports, unchanged input, idempotence, and codec tests pass. |
| 2. Identity across command paths | Creation, sharing, copy, split/join, replacement, background, clipboard, and strict direct-call tests pass. |
| 3. Exact commit capture | All four routes, generic commits, roots, deletion, no-op, failure, and transaction tests pass. |
| 4. Undo/redo identity and behavior | Source UUIDs, late subscription, independent capture, and stack-failure tests pass. |
| 5. Every-revision replay | Fixed structural, seeded Unicode, and clipboard proofs pass; fixed/Unicode replay repeats deterministically. |
| 6. Observer isolation and lifecycle | Owned frozen data, throwing callbacks/reporters, reentrancy, unsubscribe, and no repository event retention. |
| 7. Regressions and types | 107 distinct targeted tests verified; final client/server type checks pass. |
| 8. Capture-on/off performance | 72 result rows / 2,880 operations, zero snapshots, bounded capture records, and documented long-paragraph costs. |
| 9. Completion record | This report and the raw benchmark artifact record evidence and limitations. |

Stage A proves identity and exact in-memory capture/replay within one canonical
Document session. Historical subtree queries, temporal indexes, durable memoirs,
reload/archive mapping, cross-Document continuity, historical rendering, and
historical copy remain unimplemented and unproven. Application-level history
enablement remains a later integration decision. No work on Stages B–E was added.
