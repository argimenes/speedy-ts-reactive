# Stage C G3 — undo storage and instrumented qualification, 2026-09-18

**Result: undo-storage parity and both sustained controls pass; G3 remains unmet.**
The durable repeat hit its unchanged 64-message cap after a main-page scheduling
pause and synchronous catch-up. No P1 work proceeds. P1–P6 remain gated by explicit
user instruction. This work changes private undo
storage and qualification instrumentation; it does not enable production history.
The [earlier failed runs](BLOCK_SCOPED_HISTORY_STAGE_C_G3_RERUN_20260918.md)
and their artifacts are preserved.

## Storage representation and semantic proof

The previous representation cloned complete forward/inverse `put-content`
operations into every undo entry. In the failed controls a sampled entry encoded
to about 2.45 MB, mostly unchanged paragraph sequence keys. Retaining those arrays
across edits grew the browser heap toward its 4.09 GiB limit. Serialized bytes are
not heap bytes, and the earlier timeouts did not prove a particular OOM cause.

[UndoStorage](src/block-tree/undo-storage.ts) keeps each operation independently
materializable while sharing immutable chunks of `children` and `inlineContent`
between snapshots. It compares exact prefix/suffix values, shares full unchanged
chunks and copies changed/boundary chunks of at most 128 keys. Adjacent small
fragments coalesce so repeated insertions do not accumulate tiny chunk chains.
Each snapshot owns its chunk references; it has no link to an earlier snapshot.
A 32-entry **weak** cache is only a lookup hint. Cache eviction or GC does not
remove history or affect reconstruction, and discarded redo branches have no
strong cache owner. Empty sequences share an immutable descriptor but unpack to
independent arrays.

Only the private stack representation changes. Every undo/redo materializes the
original complete operations and invokes the existing commit/validation path.
Applying a patch to the current document would be incorrect after unrecorded
writes; this implementation never does that. The same entry IDs, labels, causes,
stack transitions, redo invalidation and exception recovery remain in place.
Command planning, inverse generation, identity checks, counters and capture
validation are unchanged. No undo entries are grouped, pruned or expired.

Other fields remain exact cloned values, including field presence and property
order. Aliased/cyclic/special object graphs and nonstandard operation arrays use
the original cloned representation. Neither private stored values nor cached
chunks refer to live repository arrays. Unpacking returns fresh mutable operation
values, so subsequent commands cannot mutate stored history.

This is a retained-storage optimization, not a claim of O(edit-size) editor work.
Original planning/cloning and sequence scans remain; chunk-reference arrays also
scale with sequence length. Generic payloads and unusual graphs can still retain
full values. Undo depth remains unrestricted as before, so necessary per-entry
storage still grows with edit count.

The [paired legacy oracle](src/block-tree/undo-storage-parity.test.ts) runs the
same operations through two repositories, replacing only the reference's storage
with the former full-operation snapshots. Seven tests include three deterministic
random traces, complete undo/redo cycles and branches, Unicode text changes,
unrecorded divergent writes, caller mutation, repeated writes, absent/undefined
fields, explicit counters, root changes, split/join, moves/copies, shared content,
annotations, inline images, transactions, invalid edits and pre/post-commit
subscriber exceptions. Every intermediate snapshot, materialized stack,
full/compact capture event, cause/source identity, counter and index is compared;
only wall-clock timestamps are excluded.

Five [storage tests](src/block-tree/undo-storage.test.ts) additionally check
every version in 250 seeded sequence edits, independent materialization, alias/
cycle/special-value fallback, property order, cache eviction and fragmentation.
For 300 small edits on a 25,000-key sequence, unique retained slots must be less
than one-fiftieth of the legacy forward/inverse slot count. This structural count
is not a heap-byte estimate. All 12 tests passed before sustained qualification.

## Instrumentation and measurement limits

The existing fixed trace, pacing, browser flags, 64-message cap, 16 MiB outbox,
4,096-record outbox limit, atomic packet cap, validation and replay checks are
unchanged. New bounded telemetry records:

- Main-thread edit/scheduling cost, capture callback, ownership capture,
  `postMessage` cost, and dispatch/acknowledgement delivery.
- Worker queue depth/age, active message/stage age, queue waiting, exact apply,
  full validation and encoding.
- IDB transaction creation/handoff, time through first request, remaining request
  work through transaction completion, and capture versus acknowledgement work.
- Transport body encoding, response/acknowledgement time, server append timing,
  rejected offline requests and both server and locally committed acknowledgements.
- Outage/reconnect transitions, committed backlog bytes/count/age, reconnect drain
  and final input-stop drain. Allocated sequence numbers are distinct from
  transaction-committed captures.

Worker telemetry posts directly to the harness once per second, so it can survive
a main-thread stall. Main telemetry posts every five seconds. Each sender allows
one fetch in flight; the server retains at most 2,000 samples. Failure artifacts
include this evidence and a partial browser report when responsive. This is
gate-only instrumentation and does not add production endpoints.

IDB does not expose a lock-acquired or physical-fsync event: the reported first
request interval includes waiting and request execution; the final interval
includes remaining requests and commit. Worker queue depth includes an active
message and diagnostic initialization/finish messages; main `maxInFlight` remains
the authoritative unchanged event cap. `JSON.stringify` expands shared chunks,
so serialized entry bytes no longer measure the retained representation.

## Qualification evidence

The 10-second [instrumentation smoke](BLOCK_SCOPED_HISTORY_STAGE_C_G3_UNDO_20260918_SMOKE.json)
passed 50 revisions, all parent/preimage checks, final oracle equality and empty
outbox. It retained 29,992 unique sequence slots across 50 entries (versus roughly
2.5 million legacy forward/inverse paragraph slots). Maximum event messages in
flight was 1. The five-record outage backlog drained after reconnect. This smoke
does not pass the required sustained gate.

Source baseline: `c181f35d4e7d6f7ef5fddf9ab0018bdb211218f3`, plus the measured
working-tree undo/instrumentation changes. Both [initial run metadata](BLOCK_SCOPED_HISTORY_STAGE_C_G3_UNDO_20260918_HOST.json)
and [repeat metadata](BLOCK_SCOPED_HISTORY_STAGE_C_G3_UNDO_20260918_AWAKE_HOST.json)
record exact source hashes. They match: no code, workload or cap changed between
the interrupted durable run and its repeat. Host: Apple M1 / macOS 15.5 arm64,
8 GiB RAM, Node v22.12.0, Chrome 153.0.8010.48. No tests or builds ran concurrently
with the measured traces.

The commands below requested the same 3,000 ordinary edits at 200 ms intervals
on the same 25,000-character fixture, sequentially with fresh browser profiles:

```sh
G3_SECONDS=600 G3_MODE=off G3_OUTPUT=BLOCK_SCOPED_HISTORY_STAGE_C_G3_UNDO_20260918_OFF.json node scripts/stage-c-gates/cost-control.mjs
G3_SECONDS=600 G3_MODE=compact G3_OUTPUT=BLOCK_SCOPED_HISTORY_STAGE_C_G3_UNDO_20260918_COMPACT.json node scripts/stage-c-gates/cost-control.mjs
G3_SECONDS=600 G3_MODE=candidate G3_OUTPUT=BLOCK_SCOPED_HISTORY_STAGE_C_G3_UNDO_20260918_CANDIDATE.json node scripts/stage-c-gates/cost.mjs
G3_SECONDS=600 G3_MODE=candidate G3_OUTPUT=BLOCK_SCOPED_HISTORY_STAGE_C_G3_UNDO_20260918_AWAKE_CANDIDATE.json caffeinate -i node scripts/stage-c-gates/cost.mjs
```

The repeat adds only a temporary OS assertion against idle sleep. It cannot prevent
clamshell sleep and does not change Chrome flags, validation, timeouts or pacing.

| Run | Edits / elapsed input time | Result |
| --- | --- | --- |
| [History off](BLOCK_SCOPED_HISTORY_STAGE_C_G3_UNDO_20260918_OFF.json) | 3,000 / 599.845 s | Completed; zero capture callbacks; 3,000 undo entries. |
| [Compact only](BLOCK_SCOPED_HISTORY_STAGE_C_G3_UNDO_20260918_COMPACT.json) | 3,000 / 599.856 s | Completed; 3,000 callbacks, no capture errors; 3,000 undo entries. |
| [Durable, first attempt](BLOCK_SCOPED_HISTORY_STAGE_C_G3_UNDO_20260918_CANDIDATE.json) | 3,000 / 599.839 s | All 3,000 server acknowledgements and local acknowledgement commits observed, queue/outbox empty; CDP timeout after host sleep during final verification/report collection. Not a completed exactness qualification. |
| [Durable, repeat](BLOCK_SCOPED_HISTORY_STAGE_C_G3_UNDO_20260918_AWAKE_CANDIDATE.json) | 1,681 / 399.401 s | Explicit `Gate worker queue cap`; 1,680 revisions accepted by the server before harness exit. Final drain and oracle/replay qualification not reached. |

The [derived assessment](BLOCK_SCOPED_HISTORY_STAGE_C_G3_UNDO_20260918_ASSESSMENT.json)
contains extracted counts, stage timing summaries, host ranges and measurement
limits; source artifacts and corresponding `.log` files are preserved verbatim.
Control exit status zero is accompanied by `completed: true` and no reported
errors. The repeat's inner `completed: true` means its error handler terminated;
its top-level `passed: false` and exit status 1 govern.

### Undo retention comparison

| Measurement | History off | Compact only |
| --- | --- | --- |
| Before optimization: last observed edits | 1,276 | 1,251 |
| Before optimization: last used JS heap | 3.888 GiB | 3.830 GiB |
| After optimization: completed edits / retained undo entries | 3,000 / 3,000 | 3,000 / 3,000 |
| After optimization: peak sampled used JS heap | 137.46 MiB | 146.48 MiB |
| After optimization: final used JS heap | 118.22 MiB | 86.90 MiB |
| After optimization: edit p50 / p95 | 52.4 / 56.1 ms | 53.2 / 57.0 ms |
| After optimization: maximum schedule lateness | 4.2 ms | 7.8 ms |
| Unique retained sequence slots | 321,000 | 321,000 |

Both controls retain 3,196 unique chunks and 588,196 chunk references across
3,002 sequence versions. The legacy paragraph arrays alone would retain
`3,000 × 2 × 25,000 = 150,000,000` slots. Unique stored slots are reduced by about
467×; this is a structural-count comparison, not a 467× claim about total heap.
Serialized individual entries still expand to about 2.45 MB because JSON does not
preserve sharing. Every undo entry remains present.

### Interrupted durable attempt: positive pipeline evidence, incomplete final proof

The first instrumented candidate completed input on schedule and emitted 3,000
worker apply/validation operations. Its maximum main event count in flight was 7.
The committed outbox peaked at 301 records / 801,669 wire bytes during the
one-minute outage. At reconnect it held 300 records / 799,005 bytes, then drained
in 1,210 ms while input continued. Oldest pending age was 60,056 ms, consistent
with the deliberate outage. Last worker telemetry showed 3,000 committed captures,
3,000 server acknowledgements, 3,000 local acknowledgement commits, zero queued
messages and zero outbox bytes/records.

The [power-log evidence](BLOCK_SCOPED_HISTORY_STAGE_C_G3_UNDO_20260918_SLEEP_EVIDENCE.json)
records clamshell sleep at 09:47:36 Australia/Brisbane for 243 seconds, followed by
DarkWake at 09:51:39. This matches the host sampling gap and the CDP timeout artifact
at 09:51:40. The run's final `report`, independent oracle equality and all-frame
replay were not collected. Acknowledgement counts cannot substitute for those
checks, and the interrupted artifact remains marked failed.

### Repeat: main-page pause, then acknowledgement starvation during catch-up

The repeat used exactly the same measured code. It again drained the 300-record
outage backlog after reconnect (1,029 ms); peak outbox was 301 records / 801,669
bytes. It then exposes the following distinct failure:

1. After 1,616 edits, 73 consecutive worker samples over 71.999 seconds show all
   1,616 revisions captured and acknowledged, an empty outbox, no queued message
   and no active event. The worker continued posting approximately once per second.
2. Main telemetry has a 79.282-second gap. Maximum input schedule lateness becomes
   73,021.2 ms. No individual measured edit is longer than 309.1 ms, so this gap
   cannot be attributed to a measured synchronous capture/command invocation.
3. On resumption, the existing loop's `wait` is negative. It executes successive
   commands without an `await` or another task boundary until caught up or failed.
   Incoming worker acknowledgement handlers cannot run during this synchronous
   burst. At edit 1,681, the main-side count reaches 64 and the callback rejects the
   next event. The oldest main-side in-flight event is 3,041.4 ms old at that point.
4. Worker telemetry's received-message queue peaks at 16, not 64. Its last sample
   still shows progress (1,669 captures, 1,665 acknowledgements and four outbox
   records). After the error handler yields, all 1,680 posted events receive their
   worker acknowledgement and all 1,680 are accepted by the server before shutdown.
   The rejected 1,681st committed event was never posted. This is not lossless
   completion, and no final reconstruction is claimed.

The worker and main counters have different meanings and asynchronous sampling
times; their difference is not a count of lost events. Source control flow and
returning acknowledgements support acknowledgement-handler starvation during the
catch-up burst. The cause of the initial main-page pause is **not established**:
visibility/lifecycle scheduling, timer throttling, OS scheduling or another stall
need separate evidence. No sleep transition occurred in the inspected run interval;
host sampling's maximum gap was 10.045 s. Browser diagnostics report no crash/fatal
OOM, and peak sampled main JS heap was only 115.0 MiB. Neither ordinary undo growth
nor a sustained IDB/server backlog explains the 72-second worker-idle interval.

Selected timings from the last repeat worker sample (partial run, before final
remaining acknowledgements):

| Stage | Mean | Maximum | Scope |
| --- | --- | --- | --- |
| Main callback, including capture/dispatch | p50 0.1 ms; p95 0.2 ms | 1.9 ms | 1,680 successful callbacks; rejected final callback excluded from this array. |
| Worker exact apply | 0.145 ms | 7.3 ms | 1,670 events. |
| Worker full validation | 38.47 ms | 396.9 ms | 1,670 events; dominant measured worker CPU stage. |
| Worker serialized queue wait | 10.60 ms | 618.9 ms | 1,671 received messages, including initialization. |
| Capture IDB handoff | 0.044 ms | 1.0 ms | 1,670 transactions started. |
| Capture IDB wait plus first request | 0.302 ms | 4.9 ms | 1,669 completed first requests. |
| Capture IDB remaining work through commit | 1.489 ms | 71.9 ms | 1,669 committed captures. |
| Capture IDB total | 1.790 ms | 72.0 ms | 1,669 committed captures. |
| Transport acknowledgement | 15.219 ms | 113.0 ms | 1,313 acknowledged batches. |
| Server append (full harness result) | 13.017 ms | 63.001 ms | 1,318 accepted batches through shutdown. |

Cross-realm `performance.timeOrigin` clocks show sub-millisecond offset artifacts
(including negative delivery samples). Those samples are not precise transport
latency claims; within-realm stage timings and separately recorded queue counts
support the attribution above. Main heap is not an isolated worker heap reading.

## Gate assessment and stop decision

| Stage C §10 gate | Result of this work |
| --- | --- |
| Exactness | Undo parity and bounded history regressions pass, as does the 50-revision smoke. Neither sustained durable attempt completes final independent oracle/all-frame replay checks. **Unmet for sustained qualification.** |
| Compactness | Existing packet-growth/foreign-only regressions pass; unchanged capture format. Retained undo sequence storage is substantially reduced. No completed durable sustained packet summary is promoted from the smoke. |
| Foreground | Repeat partial callback p95 is 0.2 ms, maximum 1.9 ms. End-to-end edit p95 is 43.3 ms for the partial trace; controls are reported separately. The finite 60-edit, 25k comparison has compact/candidate end-to-end p95 30.0/36.4 ms; unpaired percentiles and callback timing alone do not prove the complete ≤4 ms added-work gate. The long scheduling pause also prevents a successful sustained claim. |
| Throughput | Both controls pass. One durable attempt completed input/capture/acknowledgement but lost final qualification to host sleep. The repeat explicitly hits the 64-message cap during catch-up. **No reliable, lossless sustained pass; G3 remains unmet.** |
| Bounded resources | Undo retention is improved without depth changes. Existing laboratory queue/outbox caps remain enforced; none were raised. No production capacity table or complete limit-boundary/resource matrix is qualified. |
| Selective reads / latency policy | Not exercised by these traces; bounded query/discovery and cold/warm query targets remain outstanding. |

**Stop here, with P1–P6 gated.** The smallest corrective work is to isolate the
main-page scheduling pause and acknowledgement delivery, then address the proven
catch-up failure without dropping a committed event:

- Add visibility/lifecycle and requested-versus-fired timer evidence plus task/
  acknowledgement delivery milestones. Distinguish timer/lifecycle suspension
  from a long task or stalled application. Keep the fixed trace and this failed
  burst as comparison evidence; do not silently discard overdue edits.
- If the harness catch-up scheduling is the cause, define and test bounded task
  yielding that services acknowledgements while preserving every edit, target
  schedule, order and undo step. Any timing change must be explicit and compared
  with the original stress behavior; it cannot be used to relabel this run passed.
- If real editing can produce the same committed burst, give the recorder a
  proved bounded, lossless intake/acknowledgement path under that burst. Merely
  increasing the 64-message cap, dropping records, weakening validation or
  reducing undo depth is not a correction.

No such scheduler/recorder correction was implemented after the failed repeat.
The broader G3/P6 matrix (multi-Document/foreign-load/structural stress, valid
100k-revision and >1 GiB archives, discovery, reader budgets and production
capacities) also remains outstanding. Stage C is not complete.

## Final verification

The [checks artifact](BLOCK_SCOPED_HISTORY_STAGE_C_G3_UNDO_20260918_CHECKS.json)
preserves command output, source hashes and prior-artifact preservation checks.

- New storage/legacy-parity tests: **12 passed** before qualification; they also
  pass in the final full regression.
- Final `npm test`: **429 passed / 2 failed tests**, 431 total; 61 passed / 2 failed
  files, 22.00 s. Failures are the same missing Delete Block / undefined tab
  `ownerKey` cases and the already recorded Node-only storage-suite collection
  failure under Vitest. No new test failure.
- Final `npm run typecheck` and `npm run build`: client and server passed.
- Harness syntax, direct browser/worker TypeScript checks, JSON parsing and
  `git diff --check`: passed. The intended Node storage suite's earlier 23-case
  pass remains preserved; it is not claimed as a new run here.
