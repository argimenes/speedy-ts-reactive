# Stage C implementation gate results

Status: **final bounded matched comparison did not pass; G3 foreground-budget qualification remains unestablished**. P1–P6 remain gated for review. Stage C is not
complete. No production format dispatch, ordinary Save/Open integration, outbox,
`.memory` server store or Stage D–E work has been enabled.
Plan: [Stage C implementation plan](BLOCK_SCOPED_HISTORY_STAGE_C_PLAN.md).

## G3 final bounded matched comparison — latest, 2026-09-18

The fixed comparison ran under `caffeinate -di`, with unchanged worker validation,
strict IDB/native append, 64-message cap and ordinary undo. Identical starting
states and alternating arm order were used with 30 warm-up and 120 measured
pairs per case. All samples, including outliers, are retained.

The 100-character case passes (paired added-time p95 **0.7 ms**). The 5,600-character
case fails the predeclared statistic (**6.4 ms** against **4 ms**), so the runner
stopped before 25,000 characters. It was not retried. Both completed cases capture
and acknowledge all 150 revisions, reach independent oracle equality and empty
outboxes, and have maximum worker/event queue depth one.

The measurement has a strong order effect: at 5,600 characters the paired median
is **−3.2 ms compact-first** versus **+4.6 ms candidate-first**. Both modes are
slower first; capture preparation plus delivery has a paired p95 difference of
only **0.4 ms**. Thus this is a failed qualification statistic, **not an isolated
genuine history-path regression**. The data justify neither a G3 pass nor a new
production optimization programme. No alternative passing statistic is substituted.

Per the latest user direction, **no further G3 qualification work is scheduled**.
A passing matched comparison would have closed G3; the broader production matrix
is not added as another G3 prerequisite. Existing successful sustained/control
evidence and failed/interrupted/stress classifications are preserved. All 49 prior
G3 JSON/log/report files are unchanged; three focused statistics tests and harness
TypeScript/syntax checks pass. See the [matched report and raw evidence](BLOCK_SCOPED_HISTORY_STAGE_C_G3_MATCHED_20260918.md).

The [minimum path to an initial Block-history UI](BLOCK_SCOPED_HISTORY_INITIAL_UI_SLICE.md)
separates essential persistent integration from later hardening and immediate UI
work through a read-only adapter. No P1–P6 or UI implementation was started here.

## G3 declared foreground qualification — preceding, 2026-09-18

The user authorized an unchanged qualification run with both display and idle
system sleep prevented. `caffeinate -di` assertions were recorded throughout;
the page stayed visible and there were no display/sleep transitions. Source
hashes match the preceding failed hidden-page run. Browser flags, 3,000 edits at
200 ms targets, full validation, undo semantics, caps and criteria are unchanged.

**The uninterrupted sustained trace passes:** all 3,000 edits are captured and
acknowledged, with all undo entries retained. Final independent oracle equality,
3,002 physical frame checksum/sequence checks, replay/preimage/ancestry checks
for every revision and 12 independent replay comparisons pass. Maximum event
messages in flight is one; reconnect drains 300 records in 963 ms, final drain
takes 506 ms, and the final outbox has zero records/bytes. Maximum schedule
lateness is 3.9 ms. Full validation keeps up with the original five-edits/second
rate; no steady-state validator throughput failure is observed.

**Do not declare an unrestricted G3 pass.** Sustained capture callback p95 is
0.2 ms (maximum 0.3 ms, none over 50 ms), but the finite 60-edit comparisons have
compact/candidate whole-edit p95 of 11.1/19.4 ms at 5,600 characters and 48.0/60.0 ms
at 25,000. Their unpaired differences exceed 4 ms and do not establish the added
work criterion. The worker does not run during those finite matrices, so the gap
cannot be attributed to worker validation. The smallest next qualification work
is a matched foreground comparison with preparation/allocation/callback costs
separated, retaining the thresholds. No additional run or code optimization was
performed after this result.

The hidden-page catch-up failure remains failed stress evidence. All 40 prior
JSON/log artifacts, including successful controls, remain unchanged. No production
producer/backpressure contract was introduced. **Stop for review; P1–P6 remain
gated.** Full results, measurements, scope and evidence are in the
[foreground qualification report](BLOCK_SCOPED_HISTORY_STAGE_C_G3_FOREGROUND_20260918.md).

## G3 scheduling attribution and catch-up rerun — earlier, 2026-09-18

**G3 still fails; stop for review, keeping P1–P6 gated.** The new harness preserves
all edit indices, original deadlines, order and undo steps while yielding a timer
task between overdue commands. Five scheduler tests and the twelve existing
storage/legacy-undo parity tests pass. A 150-edit calibration with an explicit
15-second busy task completes physical frame/replay, independent oracle and
empty-outbox checks. A separate freeze calibration is retained as interrupted.

The unchanged 600-second/3,000-edit qualification then fails at **committed edit
2,819**, with 2,818 events posted and 2,795 server-accepted at exit. The new
observations identify a 56.864-second hidden-page interval: macOS display-off/on
notifications align with the page visibility changes, main timers are delayed,
and worker/Node observations continue without system sleep or a matching long
editor task. The earlier repeat also occurred after display-off, supporting the
same explanation without inventing missing historical lifecycle evidence.

After visibility returns, acknowledgement delivery is prompt (maximum 80.7 ms),
but the **actual worker queue reaches 64**. During the measured catch-up window,
arrival is 17.58 events/s versus 14.20 captures/s; full validation averages
65.84 ms/event. Task yielding resolves acknowledgement starvation but exposes a
separate verifier throughput limit. The scheduled outage had already drained in
969 ms; the failure is not an undrained outage or recurrence of undo retention.
Final sustained oracle/all-frame replay/empty-outbox checks are not reached.

No cap, workload, undo policy or validation was weakened. Both successful controls
and all earlier failed/interrupted artifacts remain unchanged. No current
ordinary input path was found emitting the equivalent 65 independent synchronous
commits; arbitrary programmatic producers are not qualified by this harness.
Further options are a declared display-awake condition for foreground measurement,
parity-proven exact-verifier optimization for catch-up, or explicit bounded
admission before bulk-producer commits. No further implementation or rerun follows
this failure. See the [full investigation and artifacts](BLOCK_SCOPED_HISTORY_STAGE_C_G3_SCHEDULING_20260918.md).

## G3 undo-storage optimization and instrumented runs — earlier, 2026-09-18

The user authorized a storage-only undo optimization, parallel pipeline
instrumentation and unchanged sustained reruns, with P1–P6 explicitly gated.
[Private shared sequence chunks](src/block-tree/undo-storage.ts) replace duplicated
`children`/`inlineContent` arrays in stored operations. Undo/redo materialize the
same complete operations and use the existing commit/validation path. Seven
legacy-representation parity tests and five storage/property tests pass; no stack
depth, step, cause, identity, counter or redo policy changed.

| Latest run | Evidence | Qualification result |
| --- | --- | --- |
| History off | All 3,000 edits in 599.845 s; all 3,000 undo entries retained; peak sampled JS heap 137.46 MiB. | Fixed sustained control completed. |
| Compact capture only | All 3,000 edits/callbacks in 599.856 s; all undo entries retained; peak sampled JS heap 146.48 MiB. | Fixed sustained control completed without capture errors. |
| Durable first attempt | All 3,000 revisions captured, server acknowledged and locally acknowledged; empty queue/outbox; maximum 7 event messages in flight; reconnect drain 1.210 s. | Host entered confirmed 243-second clamshell sleep during final verification/report collection. No final oracle/all-frame replay result; interrupted run is not a pass. |
| Durable identical-code repeat | Outage backlog drained in 1.029 s, then main-page scheduling pause and synchronous catch-up; cap hit at edit 1,681, 1,680 server-accepted revisions at exit. | Explicit 64-message cap failure. G3 remains unmet. |

Both controls retain 321,000 unique sequence slots instead of roughly 150 million
duplicated paragraph slots across forward/inverse entries (about 467× fewer slots,
not a total-heap ratio). Prior control heaps reached approximately 3.8 GiB at fewer
than 1,300 edits. Original failed artifacts remain unchanged.

The repeat's new telemetry distinguishes the failure: 73 worker samples over
71.999 seconds show 1,616 acknowledged revisions with an empty event queue and
outbox while the main page stopped advancing. On resumption, overdue edits execute
without yielding, preventing main-side worker acknowledgement handlers from
reducing the in-flight count before it reaches 64. Worker received-queue depth
peaked at 16; IDB/server work continued. The cause of the initial main-page pause
is unproved; host sampling has no sleep gap and peak sampled main heap was only
115 MiB. This is not evidence of sustained verifier/server saturation or recurrence
of the old undo-retention problem, but it is a concrete failure to capture every
committed event under the unchanged trace.

**Stop decision:** retain the parity-proven undo representation, keep P1–P6 gated,
and do not raise caps or alter the workload to obtain a pass. The smallest next
work is to identify the main scheduling pause and prove bounded acknowledgement
servicing/lossless capture during catch-up, preserving all edits and undo semantics.
No scheduler/recorder correction was implemented after this failure.

Final checks: 429 tests passed, the same two context-menu tests failed, and the
already recorded Node storage-suite collection issue under Vitest remains.
Client/server typecheck and build passed. Full details, raw/derived artifacts,
source hashes, timing limits and §10 gate assessment are in the
[undo/instrumented report](BLOCK_SCOPED_HISTORY_STAGE_C_G3_UNDO_20260918.md).

## Earlier G3 qualification rerun — before undo optimization, 2026-09-18

The user freed disk space and authorized rerunning the unchanged sustained trace.
All three modes were requested sequentially for 600 seconds / 3,000 ordinary edits
on the existing 25,000-character fixture, with fresh isolated browser profiles.
Workload, undo, browser flags, queue caps and gate criteria were unchanged. Only
artifact-path selection and failure-report host metadata were added to the harness.
The original artifacts below remain unchanged.

| Mode | Last observed progress | Result |
| --- | --- | --- |
| History off | 1,276 edits / 379.707 s; zero callbacks; 1,276 undo entries; 3.89 GiB used JS heap | CDP timeout; incomplete. |
| Compact capture only | 1,251 edits / 293.523 s; 1,251 callbacks and undo entries; 3.83 GiB used JS heap | CDP timeout; incomplete. |
| Candidate durable capture | 962 edits / 197.323 s; 64 messages in flight; 895 server-acknowledged revisions | Explicit `Gate worker queue cap` failure during the outage; reconnect/drain and final exactness not reached. |

The host has 8 GiB physical RAM. All launches passed the unchanged 8 GiB free-disk
guard; sampled free space stayed above 21.6 GiB across the runs. The controls show
substantial existing undo/heap growth without durable capture, but neither emitted
an explicit OOM diagnostic. The candidate's queue failure is an additional concrete
failure; it cannot be dismissed as proven baseline-only overhead. No completed
latency comparison, lossless drain, long-run exactness or resource plateau is claimed.

**Decision:** G3 remains unmet and P1–P6 remain stopped. The next prerequisite is
investigation of existing undo retention and the worker stall/cap, preserving every
undo entry, operation, cause and replay guarantee. A behavior-preserving storage
optimization is proposed separately, not implemented or used to alter this result.
Do not simply raise caps, shorten the trace, prune/group undo or waive exactness.

See the [full assessment, commands, artifacts and regression results](BLOCK_SCOPED_HISTORY_STAGE_C_G3_RERUN_20260918.md).

## Resumed implementation — current evidence

The user's instruction to continue authorized the recommended ownership-aware
retention correction. The original stop and its evidence are retained below as
historical findings; they no longer describe the current candidate's behavior.

Canonical `ContentRecord.definitionOwnerKey` records membership in a Document's
definition table. It is captured by the existing field/record patch machinery and
restored by existing inverse operations. The Document's self-membership marks a
normalized table; Cells remain owned through their host. This is private canonical
metadata: portable Documents express membership by their definition table, without
runtime keys. Normalization precedes enrollment and is an explicit load projection
boundary, not an undo edit or an exact continuation of pre-normalization state.

The validator admits retained unplaced components; pruning retains their authored
definitions and reachable slots/Cells. Placement removal does not delete a retained
definition. Explicit unplaced-definition deletion, joins, unwrap and consuming
replacements retire definitions within one ordinary commit. Copies/insertions/splits
assign ownership in that same commit; whole-Document copies include unplaced
definitions. Optimized editing validators also check the added metadata. Legacy
repositories retain their previous pruning behavior until normalization.

The actual Workspace gate bridge converts known cross-resource pointers into
terminal descriptors during normalization. Removing a foreign target or evicting
its complete Document scope then leaves the referencing Document's exact projection
unchanged. No consumer scan, external snapshot or dependency-only revision is used.
Scope-eviction undo is tested; production enrollment end/reopen boundaries remain P4.

| Current functional verification | Result |
| --- | --- |
| G1 plus core membership tests | **36 passed**: 27 gate cases and 9 core lifecycle cases (9.20 s in the resumed run). Covers original counterexamples, rich unplaced content, margins, copy/insert/split/join/replace, existing undo/redo, Workspace scope removal, descriptor retarget/pin preimages, isolated queries, internal cycles and branch-aware existence. |
| Full regression run after the membership changes | **407 passed / 2 failed**, 409 total, 57 files passed / 1 failed, 51.40 s. Only the two pre-existing context-menu failures. This run preceded the later additional query/Workspace cases. |
| Current typecheck | Client and server passed after the incremental adapter and native-ID bridge changes. |
| Existing Stage B history regression | **20 passed**, 2 files, 1.96 s, one worker. Exact replay and edge-case regressions pass with the new Placement identity check. |
| Full current regression/build | Not rerun during the resource-pressure stop. The earlier full run above is historical evidence, not current full qualification. |

G1's finite query oracle takes only immutable resource snapshots and explicit
selected-state-ancestry evidence. Foreign definition/asset markers travel with
their authored values; opaque extensions are not guessed into dependencies.
The oracle distinguishes an unplaced owned Block from an unavailable external
reference, avoids local-registry shadowing, and reconstructs historical internal
definitions after live access has been replaced by a throwing sentinel. It is
not the bounded production query service: P5 still needs paged readers/indexes.

## G2 — current storage candidate and limits

The isolated [storage harness](scripts/stage-c-gates/storage.test.mjs) uses real
temporary directories and the actual lossless wire codec/captured revisions.
It is not imported by production Document/server routes. All created infrastructure
stays inside the immediate parent's `.memory`; no ancestor fallback or global
history directory is introduced.

The candidate uses [fs-ext's OS flock binding](https://github.com/baudehlo/node-fs-ext)
(`fs-ext@2.1.1`, optional dependency) on this macOS/Node host, rather than the
pre-plan's Python probe. A confined child filesystem process checks its working
directory's device/inode before each operation, uses single-component names and
`O_NOFOLLOW`, and holds an inherited writer-lock descriptor during writes. This
avoids an absolute-path validation followed by an unguarded mutation after directory
substitution. Child requests serialize changes of working directory. Worker reuse
removed per-packet process-start costs. This process organization is a candidate
implementation choice, not a new persistence contract.

Physical directory/lock/file identity is private writable-association evidence,
separate from semantic resource/memoir IDs. Copying a Document or directory cannot
grant a writer merely by copying IDs/hashes. Exact-prefix handoff can authorize new
location evidence; journal activation records allow a verified return to an older
location. Normal directory rename preserves association without absolute-path IDs.
An explicitly supplied enrollment grant is required. Discovery never selects an
archive through the optional index, whose corrupt bytes are preserved in the test.

| G2 evidence so far | Result |
| --- | --- |
| Initial storage/association/locking/blob/journal cases | 6 passed, including real process `SIGKILL`, stale epochs, overlapping immutable retries, missing state parents, branches independent of append order, and torn/corrupt journals. |
| Combined suite before within-record fault extensions | **13 passed**, 10.03 s with worker reuse. Includes all five handoff publication boundaries, folder copy/rename and verified return handoff. |
| Latest complete storage suite | **21 passed**, 16.69 s while the browser lifecycle test ran concurrently. Includes initialization races/partial stores, missing acknowledged checkpoints, replaced lock inode, conflicting suffixes, pending-packet retry and all nine handoff fault boundaries. |
| Additional G2 cases | **2 passed**, 0.85 s: read-only history fails without redirecting writes or preventing an ordinary Document save; independent Save As preserves sharing/foreign descriptors, uses fresh authored/placement/resource/memoir identities and leaves the source writer/archive untouched. These plus the latest 21-case suite cover 23 cases; no claim of a single complete 23-case rerun. |
| Browser legacy/outbox/first-save | **7 checks passed**, Chrome 153.0.8010.48 / Node v22.12.0. Real browser process kill/restart preserves normalization identities and strict-IDB baseline packets; first deliberate Save fsyncs modern file/parent and creates infrastructure only in the chosen parent. Both exact baselines and the actual save hash verify; acknowledgement and packet deletion share an IDB transaction. |
| Real largest paragraph checkpoint | 25,000 characters; **13,376,402 wire bytes**; transfer chunks at most **262,144 bytes**. Interrupted uploads remain unreferenced; final bytes hash-verify and decode to the exact baseline. |

Source fencing precedes destination activation. Source bytes are retained. Handoff
intents bind the prior journal hash/offset and exact planned frame bytes; recovery
can finish those bytes without guessing from a coincidentally matching torn prefix.
Ordinary unproved torn tails still reject writes. Competing lock acquisition is
nonblocking, so handoff cannot deadlock waiting while holding the other lock.
Document-file publication and memoir relocation remain separate operations.

These are finite gate bounds, **not release capacities**: 32 MiB journal/blob,
256 KiB transfer packets, 128-record/128 KiB input batches, bounded directory pages
and a finite administration scan. The candidate still scans whole bounded journals
and retains checkpoint staging duplicates; production P1/P3/P5 must supply bounded
archive indexes/consolidation and verified cleanup. No old history is expired.
Unsupported native locking/sync semantics have no fallback. This host's fsync and
process-death tests are not a universal power-loss, network-filesystem or cloud-lock
guarantee; disconnected copies cannot be globally fenced.

**G2 is not yet declared fully qualified.** The formerly listed initialization,
checkpoint, conflicting-suffix, pending-retry and legacy lifecycle cases now pass.
The broader platform/copy/read-only/discovery matrix, production recovery and
bounded-reader integration remain explicit obligations. The native gate prototype
must not be promoted unchanged as the production archive service.

## G3 — incremental candidate and current experiment

`PlacementRecord.placementId` now carries normalized structural semantic identity.
The gate editor seeds it before enrollment. New edges/copies receive fresh IDs in
the original command; moves/detach retain the existing edge ID. Ordinary inverse
records restore deleted IDs. Gate binding maps delete removed entries and recover
IDs from inverse records, rather than retaining tombstones indefinitely. Cells keep
private history symbols, never authored portable IDs. Replay rejects an attempted
change of an existing semantic edge ID. This simpler internal representation is
recorded in the plan; it does not change undo steps or execution.

The [incremental adapter](src/history/stage-c-gates/incremental.ts) retains only
current owned content/placement key sets. It accepts immutable compact commit events,
uses explicit definition membership and exact host-slot changes for new Cells, and
never holds a repository or a paragraph sequence. Foreign-only events advance only
the source counter. Ownership transfers, lost source events and unproved incoming
slots end this candidate projection with an explicit boundary; they are not guessed.
Every accepted local event preserves source UUID/cause and uses a separate local
counter. Existing full-state extraction remains an independent test oracle.

Tests cover mixed structural/rich edits and all intermediate undo/redo states,
200 seeded randomized edits/branches, current-key retention counts, foreign-only
edits and 100/5,600/25,000-character packet growth. The tests replay after lossless
wire round trips; unsupported transfer/missing-event cases cannot resume silently.

The [Chromium cost harness](scripts/stage-c-gates/cost.mjs) exercises actual editor
commands, an isolated worker's checked private mirror, strict transactional IDB
outbox, native-fenced/fsynced server append and acknowledgement-driven deletion.
It includes an actual server outage and reconnect/drain interval. Ordinary editor
undo allocations stay enabled in all modes. Full oracle extraction happens only
at the end. This is a feasibility harness without rendering/device-input timing;
it does not enable any production route or freeze a schema.

The initial 10-second smoke passed 50 revisions and final exact oracle equality.
Its normalized resource baseline was **15,926,745 wire bytes** (the earlier
13,376,402-byte measurement is the raw repository baseline, a different envelope).
Smoke packet size was 2,634–2,648 bytes; capture/transfer callback p95 0.2 ms,
worker apply/full-validation p95 56.7 ms, strict-IDB p95 7.1 ms. These small-sample
numbers are not the sustained gate result. The attempted full ten-minute, five-edits/second run did **not** pass: Chromium
stopped responding to CDP during the run, after the last reported 566 completed
edits at 113 seconds. This is not being treated as a passing throughput result.
The history-off control also stopped responding, after its last telemetry at
626 edits / 135.6 seconds, with **zero history callbacks**. Its existing undo stack
contained 626 entries; each sampled one-character entry encoded approximately
**2,452,206 bytes**. This is the same full forward/inverse paragraph retention
already identified in the Stage B completion report, not added durable packets.

The compact-only diagnostic was deliberately stopped after its last sample at
126 edits, once host resource pressure was identified. It had 126 exact callbacks,
no reported capture errors, and approximately 476 MB used JS heap at that sample.
It did **not** independently fail: its subsequent CDP timeout resulted from stopping
its isolated browser. The host had 8 GiB physical memory, approximately 6,400 MiB
swap in use and only about 220 MiB free on the data/temp volume (later readings
were lower). The temporary profiles were cleaned up; no user files were removed.

**Interpretation and stop:** the ten-minute gate is unmet. Existing undo retention
is a concrete large allocation, but a CDP timeout on this resource-starved host does
not prove a specific OOM cause, a history-pipeline regression, or a false ownership/
replay architecture. Dependent P1–P6 work stops here pending a valid qualification
run. No undo granularity, stack policy, benchmark workload or exit target was
changed to manufacture a pass. The harness now refuses to launch sustained runs
with less than 8 GiB free on the temp volume; that is a laboratory protection,
not a production resource limit or a promise that 8 GiB is sufficient.

Evidence artifacts:

- [Short end-to-end smoke](BLOCK_SCOPED_HISTORY_STAGE_C_G3_SMOKE.json).
- [Uncompleted ten-minute attempt](BLOCK_SCOPED_HISTORY_STAGE_C_G3_COST_EXPERIMENT.json).
- [History-off control](BLOCK_SCOPED_HISTORY_STAGE_C_G3_OFF_CONTROL.json).
- [Deliberately stopped compact-only diagnostic](BLOCK_SCOPED_HISTORY_STAGE_C_G3_COMPACT_CONTROL.json).

At the earlier resource-pressure stop, the required next step was to provide adequate disk/memory headroom (or another reference
host), rerun the unchanged sustained trace in all modes, and separate original
undo growth from added worker/outbox state. If original undo storage still makes
the required trace infeasible, report that prerequisite explicitly and propose a
behavior-preserving undo-storage optimization separately; do not introduce word
undo, grouping, pruning or a changed stack policy. The larger G3 matrix and P6's
100k-revision / >1 GiB archive / discovery measurements remain unproved.

That rerun is now recorded above and in the [2026-09-18 assessment](BLOCK_SCOPED_HISTORY_STAGE_C_G3_RERUN_20260918.md).
No Stage C completion or production readiness is claimed. P1–P6 remain gated.

## P0 — baseline

Baseline commit: `6431645a6994e0ed98158ae060be8a1fc51a7e0e`.
Environment: Node v22.12.0, macOS Darwin arm64.

| Check | Result before implementation |
| --- | --- |
| `npm test` | 52 files passed, 1 failed; 381 tests passed, 2 failed (383 total), 44.27 s. |
| `npm run typecheck` | Client and server passed. |

The failures reproduce Stage B's documented baseline in
`src/rendering/block-context-menu.test.tsx`: missing Delete Block menu item, and
undefined tab `ownerKey`. No production change was present during this run.

## G1 — owned resource candidate

The isolated candidate in [resource.ts](src/history/stage-c-gates/resource.ts) distinguishes
local placements from external reference descriptors. Authoritative ownership,
semantic placement bindings and source provenance are supplied as explicit
enrollment evidence. The projection oracle stops at foreign targets and is not
suitable for the input path. It is not a frozen schema or a production recorder.

Fourteen positive gate tests cover owned projection with foreign edits, removal
of a foreign owned occurrence, captured source pins, absence of foreign state,
local occurrence queries, exact wire/transition replay, portable structural and
rich-inline round trips, source-scoped definition provenance through annotation
reorder/replacement/copy, and ordinary command/undo behavior for the tested adapter.
Two additional passing counterexample tests demonstrate **failed G1 obligations**;
they do not mean G1 passed.

The current-Document bridge in [editor.ts](src/history/stage-c-gates/editor.ts)
uses the real repository/commands/projection. Small core changes allow an explicit
terminal external-reference placement, without a fabricated target ContentRecord.
The placeholder is a projected view, not an authored Block with the target's ID.
The bridge is only invoked by gate fixtures; normal file decoding remains unchanged.

## Original architectural stop: definition lifetime depended on global reachability

Executable reproduction:
[ownership-lifetime.test.ts](src/history/stage-c-gates/ownership-lifetime.test.ts).

```text
Workspace
  Document A
    reference to B-owned P
  Document B
    owned placement of P
    owned placement of unrelated Q

Remove B's owned placement of P.
P remains in the live repository because A's reference reaches it.
P's authoritative resource remains B; only its local placement was removed.
```

Ownership in this fixture is established before transclusion from the independently
created B definitions. This is not ambiguous attribution, a cross-resource move,
an explicit deletion of P's definition, or a foreign-only edit requiring an A
revision. B's projection correctly retains P as an unplaced owned definition.
A's external reference need not copy P or merge memoirs.

The semantic codec round-trip preserves that B-owned state, but ordinary editor
use then has two failures:

| Variant | Reproduction and observed result |
| --- | --- |
| P is a Standoff paragraph with inline Cells | B's versioned definition table encodes/decodes exactly at the authored level. Opening the decoded owned state in the actual repository fails with `Placement … is unreachable from the root`. P's inline placements belong to its retained definition but have no route from B's structural root. |
| P is a plain leaf | The actual repository accepts the unplaced content initially. Removing unrelated Q after standalone reopen silently prunes P. Running the same Q removal in the original Workspace retains P because A's placement is still present there. Undo restores P, proving that pruning was part of the unrelated structural command. |

Relevant existing mechanics:

- [Repository validation](src/block-tree/repository.ts#L160) requires every
  placement to be reachable from the single structural root. An unplaced rich
  definition/component cannot satisfy it even though it is valid owned semantic
  state. The candidate resource validator can represent that state; the current
  editor cannot.
- [TreeCommands.pruneUnreachable](src/block-tree/commands.ts#L196) removes
  unreachable placements, then deletes every content record not targeted by a
  retained placement. It has no authoritative per-resource definition-retention
  concept. These reachability/pruning rules have not been changed by the gate work.
- The [earlier portable spike](PORTABLE_CODEX_DOCUMENT_FORMAT_SPIKE.md) proved
  representative internal sharing and unplaced leaf definitions, not this
  externally referenced, locally unplaced rich-definition lifecycle.

The false assumption is that a resource-owned definition table plus terminal
external-reference/read adapters is sufficient for ordinary editor use while
retaining the current **structural-root-based lifetime/validation model**. Semantic
codec equality alone does not preserve definition lifetime under ordinary commands.
This is more than a serialization or historical-query implementation detail.

The two settled decisions remain intact: owned history stops at the Document
boundary, and memoir infrastructure belongs in immediate-parent `.memory`.
Neither capturing foreign snapshots nor introducing a global memoir fixes this
local resource-lifetime problem.

## Corrective direction recorded at the original stop

Represent a Document's authoritative retained definition set independently of
its visible structural root. Validate retained unplaced components and make
pruning respect their resource ownership/lifetime. Removing a placement must
have a defined effect on definition retention; ordinary edits to Q cannot
accidentally decide P's lifetime because another Document is absent.

This requires a precise retention/release rule, including explicit definition
deletion, internal reference removal, detached components, resource opening/closing,
and undo/redo. Such metadata must participate in the same committed operation and
existing undo step where it changes authored semantics; do not maintain a hidden
second state that undo cannot restore. Preserve current undo stack structure,
single-source causes and step granularity. No synthetic authored placements,
runtime-only target Blocks, external consumer scan, or memoir dependency should
be introduced to fake reachability.

An alternative is to define last-local-placement removal as deletion of the
resource-owned definition even if foreign references survive. That would require
an explicit product/semantic change and consistent behavior in both live Workspace
and standalone use, with external references remaining unresolved thereafter.
It is not assumed here, and it differs from the currently observed shared-content
lifetime. Do not silently obtain that behavior by changing pointer representation.

The recommended direction was ownership-aware retained definitions. At the original
stop it had not been implemented, and G2/G3/P1–P6 had not been attempted. The resumed
implementation and current evidence above supersede that status.

## Changes made before the stop and remaining limits

- Gate-only owned resource/projection, transition, semantic codec and editor bridge
  modules, plus sixteen tests (fourteen positive cases and two counterexamples).
- Shared exact record/field/splice application factored into
  [apply-records.ts](src/history/apply-records.ts), retaining the existing raw
  replay wrapper, preconditions and full closed-graph validation.
- Candidate external target/definition-provenance types and explicit terminal
  placement handling in repository validation and projection. Move/unlink,
  transclusion and canonical fragment copying preserve the descriptor. No target
  definition is synthesized and no undo-stack execution/structure is changed.
- A typed external definition cannot resolve against a conflicting local registry;
  live unpinned resolution can use a matching explicitly identified owner root.
  No historical resolver/network lookup is introduced. Annotation provenance travels
  with its value rather than an independently mutable array-index cache.
- The finite Stage B memory store explicitly rejects native external-boundary
  graphs instead of passing them to its closed-graph query/index implementation.

These remain candidate changes for review, not production-ready APIs. The wire
codec used by gates is the existing lab codec; parser hardening, complete schema
admission, full query/status/branch coverage, all ownership/identity lifetimes,
runtime binding-cache bounds, incremental capture performance and actual durable
storage remain unproved. Ordinary format dispatch/server save routes are unchanged.
Native terminal-placement support does not prove that every editor command or UI
can operate on every new candidate graph shape.

Implementation notes: null-prototype dictionary identity is outside the accepted
wire value algebra, so exact wire checks use the existing own-property/value
equality contract. Existing undo advances canonical content counters; tests must
check the actual fresh transitions, not claim canonical equality with an earlier
snapshot merely because authored effects were undone.

At the original stop no new storage/throughput benchmark or production capacity
claim was made. The earlier Stage C experiment artifacts remain unchanged.

## Verification at the architectural stop

| Check | Result |
| --- | --- |
| Full `npm test` | 56 files passed, 1 failed; **397 passed / 2 failed**, 399 total, 39.14 s. The same two P0 context-menu failures remain. No additional failure. |
| New gate tests within that run | **16 passed**: fourteen positive candidate tests plus two counterexamples that demonstrate the failed architectural obligations. |
| `npm run typecheck` | Client and server passed after the candidate changes. |
| `git diff --check` | Passed. |
| Production persistence/storage/performance exit gates | Not attempted; no completion or new benchmark claim. |

To run the regression cases for the original architectural finding:

```sh
npm test -- src/history/stage-c-gates/ownership-lifetime.test.ts
```

At the original stop those tests asserted the observed rejection/pruning. They now
assert successful retained-definition lifecycle behavior after the correction.
