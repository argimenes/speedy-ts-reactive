# Persistent Block History selection performance

2026-09-18. Focused read-path increment following the accepted persistent UI slice.
**Implementation complete; stopped for review.** Small/medium selections improved,
but the 25,000-character fixture still takes 2.08 s cold and 1.17–1.44 s warm in the
final run. This is not a claim that large-Document interaction is comfortably
responsive. No additional G3/P6 qualification, UI expansion or selective history
architecture has been implemented.

The subsequent accepted selective-reader direction is now integrated; see
[production read integration and measurements](BLOCK_HISTORY_PRODUCTION_INTEGRATION.md).
The results below remain the original full-reader optimization evidence.

## Measurements and method

Apple M1, 8 GiB RAM, Chrome 153.0.8010.48. Isolated browser profiles, native servers,
temporary saved Documents and Vite fixture; actual editor input, Block menu,
HistorySession and panel rendering. Each fixture records five commits: insert,
undo, redo, insert, insert. Its independently observed live text is retained for
each revision. A new session automatically selects head 5, then selects revisions
0, 2, 4, 2, 5. All subsequent previews and fixed comparison-head text match these
observations; current content remains unchanged. All five commits reach verified
native storage with an empty outbox before measurement.

“Cold” means an empty application reader cache; OS filesystem caches were not
flushed. These are focused samples, not p95 estimates or a large-archive latency
qualification. Sizes share the existing large fixture's single paragraph and bold
range; only initial text length varies. Enrollment, timeline opening and edit
recording are outside selection timing. Existing bounds and history semantics
are unchanged.

| Fixture | Encoded baseline | Before cold | Before same-session range | Final cold | Final same-session range |
| --- | ---: | ---: | ---: | ---: | ---: |
| 500 characters | 320,271 B | 111 ms | 139–221 ms | 103 ms | 69–107 ms |
| 5,000 characters | 3,186,772 B | 839 ms | 837–1,464 ms | 413 ms | 241–402 ms |
| 25,000 characters | 15,926,771 B / 15.2 MiB | 4,653 ms | 4,426–7,809 ms | 2,084 ms | 1,166–1,439 ms |

Evidence is preserved separately:

- [Instrumented original reader](BLOCK_HISTORY_SELECTION_BEFORE.json): parent
  implementation at `83b8b08`, with measurement hooks before acceleration.
- [First optimized run](BLOCK_HISTORY_SELECTION_AFTER.json): checkpoint/head
  caches, private replay draft, bounded chunk parallelism and immutable UI signal.
- [Final optimized run](BLOCK_HISTORY_SELECTION_AFTER_FINAL.json): additionally
  avoids copying the parsed wire graph and per-byte iterator allocations.

The first optimized run's large warm range was 615–1,093 ms. The final run is
slower on several unchanged warm CPU stages, despite much faster cold decoding.
Both artifacts remain visible; do not attribute every wall-time difference to a
particular optimization or use the faster run to declare responsiveness solved.

## Attribution

The original reader reconstructed both the selected revision and the session's
fixed comparison head on each older-revision selection. Each reconstruction
fetched/decoded a whole checkpoint, canonically re-encoded it, cloned/froze the
whole state per replay step, and re-encoded each resulting state for size checks.
The UI then passed an immutable Cell graph into Solid's deep store, which copied
it again.

Representative large-fixture selection of revision 4, milliseconds:

| Stage | Before | Final |
| --- | ---: | ---: |
| Selected-state reconstruction, inclusive | 2,961 | 635 |
| Comparison-head reconstruction, inclusive | 3,308 | 0; cached, authority recheck 40 |
| Whole-state cloning | 681 | 115 |
| Wire/size serialization | 2,552 | 133 |
| Verification | 585 | 318 |
| Applying exact changes | 1.3 | 0.7 |
| Subtree extraction, including immutable result construction | 252 | 195 |
| Authored-state comparison | 25 | 38 |
| Worker total | 6,545 | 908 |
| Worker round-trip residual after worker time/queue | 250 | 373 |
| Main-thread result freezing | 67 | 112 |
| Result publication through second animation frame | 916 | 46 |
| Selection total | 7,809 | 1,439 |

This warm selection now fetches **zero checkpoint chunks**, with one checkpoint
hit and one comparison-head hit; replay drops from nine records to four. The
initial cold selection still fetches 16 chunks / 15,926,771 bytes. Cold decode
falls from 784 to 171 ms; canonical/size serialization from 1,397 to 471 ms;
cloning from 365 to 111 ms. Final cold chunk loading takes 238 ms wall time,
including base64 decode, hash checks and bounded concurrent requests.

Whole-Document work remains substantial: in final revision 4, reconstruction
takes 635 ms, of which full verification takes 318 ms. It is not the only remaining
cost. Even revision 0, with no replay and a cached checkpoint, takes 1,166 ms:
subtree extraction 403 ms, worker round-trip residual 423 ms, main freeze 112 ms.
This fixture's selected paragraph itself contains nearly the entire Cell graph.
Skipping unrelated Blocks alone cannot make that case fast.

Instrumentation lives in `read-timing.ts`, the reader/worker/bridge, and
`BlockHistorySession.state.selectionTiming`. It retains only the latest scalar
sample. Stage names distinguish path/checkpoint fetch, decode, verification,
serialization, cloning, exact apply, freezing, selected/head reconstruction,
head-authority recheck, subtree extraction and comparison. Queue, RPC round trip,
main result freezing and UI publication are separate.

Inclusive reconstruction totals overlap their child stages. Concurrent
`checkpointFetch` values are **summed request durations, not wall time**;
`checkpointLoad` is the encompassing wall time. Decode includes base64, UTF-8,
JSON and value-envelope decoding. Canonical re-encoding is serialization.
The RPC residual includes structured-clone/transfer/deserialization and browser
scheduling, not an isolated serialization CPU measurement. UI time ends on the
second animation frame after publication: a paint opportunity proxy, not GPU
timing. Total starts when selection is requested, including clearing the old view.

## Implemented acceleration and invariants

- One verified, decoded, frozen checkpoint per open reader. Keys include resource,
  memoir, segment, checkpoint sequence and the complete hash/length descriptor.
  Native paths are fetched again; a failed path cannot be answered from cache.
  A changed comparison-head path invalidates its cached body and checkpoint.
- One immutable comparison-head **subtree**, rather than another full head state.
  It is tied to the session's fixed Block/occurrence selection and revision.
  Revision IDs, branch identity, ordering and comparison semantics are unchanged.
- Evict the old checkpoint before assembling a replacement. Retention is bounded
  by the existing 20 MiB canonical checkpoint / 100,000 graph-record admission,
  one subtree under the existing 200,000-visit query budget, and bounded path
  proofs. These are encoded-size/work bounds, not a claim of a 20 MiB JavaScript
  heap. There is no unbounded reconstructed-state or revision-result cache.
- At most four independent 1 MiB chunk reads concurrently, plus one bounded
  assembly buffer. All chunk lengths/hashes, aggregate hash, canonical wire,
  graph, resource and counter checks still run before caching. A failed transfer
  cancels and settles its siblings. Session close clears caches.
- Replay clones the checkpoint once into a private draft. Each step still checks
  exact preimages, counters and the **full graph**, with the existing proven exact
  incremental serialized-size accounting and full-serialization fallback for
  escaped map keys. Failed drafts are discarded; no mutable draft is published.
  Existing canonical decode already proves the checkpoint's encoded byte size,
  so an additional whole-state encoding for that same bound is unnecessary.
- Decode changes only the private graph returned by JSON.parse; it retains the
  exact canonical re-encoding check, including malformed/duplicate-key rejection.
  Base64 decode writes directly to a bounded byte array.
- The UI holds immutable historical results in a signal instead of recursively
  unwrapping them into a deep store. Existing `state.result` consumers and UI
  appearance are unchanged. Results are still frozen at the worker/main boundary.
- Abort propagates to reads; replay yields at task boundaries between records,
  checks cancellation before publication, and rejects stale UI generations.
  Synchronous decode/validation is still cancellable at the next boundary rather
  than preemptible in the middle of a JavaScript operation.

Focused validation: 47 tests pass across the new reader, shared durable core,
wire grammar/resource replay, browser bridge, native verifier and UI/enrollment
seams. Reader tests compare with independently captured canonical repository
states through undo/redo, a redo-invalidating branch and checkpoint crossings;
cover byte/base64 parity, corrupt descriptor/bytes/preimage rejection, changed or
unavailable authoritative paths, fixed-head reuse, eviction, four-read concurrency
and cancellation without partial-cache publication. UI tests assert historical
bodies preserve frozen identity and ignore superseded/closed requests. Client and
server builds and both TypeScript projects pass. Prior persistent restart checks,
G3 successes and failed/interrupted artifacts are untouched.

Reproduce after building the native server (the destination must not exist):

```sh
npm run build:server
HISTORY_SELECTION_RESULT=BLOCK_HISTORY_SELECTION_LOCAL.json node scripts/measure-history-selection.mjs
```

## Selective-reader follow-up

The user subsequently authorized a bounded spike implementing the direction below.
That spike is now complete, with the same 200-character Block selecting in about
47–48 ms cold across 500–25,000 surrounding characters. The production panel
remains on the full reader. See [the selective spike report](BLOCK_HISTORY_SELECTIVE_READER_SPIKE.md)
for exact parity, derived-authority boundaries, build/storage costs, large-Block
limitations and the separate compact-transfer measurements. Earlier artifacts and
the measurements in this report are unchanged.

## Architecture proposed at the original read-performance review

The remaining work should be a separately reviewed selective reader, not another
cache-size increase or a second history model:

1. Add a **rebuildable read index** over the exact verified archive. Bind it to
   resource/memoir/segment/revision and checkpoint/record hashes. Map stable Block
   and semantic Placement identities to exact content/edge records, occurrence
   routes and definition dependencies. Index membership/location changes as well
   as directly edited records; moved ancestors can change a descendant's location.
   Keep external references terminal and preserve ambiguity/unplaced statuses.
2. Add record-addressable checkpoint materialization (bounded shards plus a
   manifest) derived from fully verified checkpoints. Current chunks split a JSON
   byte stream arbitrarily, so a lookup table alone cannot selectively decode it.
   Shards must represent the **same exact records**, including inline Cell identity
   and annotation dependencies, not separately authored Block snapshots. Select a
   Block/occurrence closure and its bounded record ancestry, with complete evidence
   of relevant insertions/deletions and structural changes.
3. Retain full global validation at archive publication. Design and prove the read
   manifest's revision binding, membership/absence and dependency-closure checks
   before substituting selective validation for the current whole-graph checks.
   A touched-Block list alone is insufficient. Missing/corrupt/stale indexes must
   fail explicitly or use the existing bounded full reader; indexes never become
   independent history authority. Require exact parity with the current reader
   across moves, shared occurrences, retained definitions, deletion, undo/redo and
   branch boundaries before relying on it.
4. Address the one-large-paragraph output cost separately: retain the exact graph
   behind a bounded read capability, reuse the immutable comparison body across
   worker messages, and derive a compact immutable text/annotation preview model
   in the worker. Preserve provenance and exact comparison there; a display model
   is not a history authority or an approximate replay. Measure this smaller
   transport seam first, because selective Block loading cannot shrink a selection
   that already covers almost the whole Document.

The original review stopped at these options. The subsequent authorization covers
the isolated spike above, not a production format/index rollout or UI expansion.
