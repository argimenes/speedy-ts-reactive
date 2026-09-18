# Stage C G3 scheduling investigation — 2026-09-18

**G3 remains unmet. Stop for review; P1–P6 remain gated.** The new candidate fails
at committed edit 2,819: 2,818 events posted, worker queue depth reaches 64, and
the final independent oracle/all-frame replay/empty-outbox proof is not reached.
This investigation changes only the gate harness and its
diagnostics. The 25,000-character fixture, edit order, original 200 ms target
spacing, 3,000 edits, ordinary undo representation/semantics, full worker
validation, outage/reconnect indices and 64-message cap remain intact. Earlier
successful controls and failed/interrupted runs retain their original verdicts.

## Attribution and the scheduler correction

The [previous repeat](BLOCK_SCOPED_HISTORY_STAGE_C_G3_UNDO_20260918_AWAKE_CANDIDATE.json)
proved the consequence of the pause, but did not record enough information to
identify its initiating cause. For approximately 72 seconds the worker continued
to report 1,616 acknowledged revisions with no event or outbox backlog. On
resumption, the old loop issued overdue edits synchronously. Its negative wait
branch had no task boundary, so main-side acknowledgement handlers could not
decrement the outstanding count. The 65th attempted capture failed the unchanged
64-message cap, after the repository had already committed that edit. This was
real event loss in that run; it is not retroactively a pass.

The new [scheduler](scripts/stage-c-gates/cost-scheduler.ts) enters each edit
through a timer task, including overdue edits. It computes every target from the
original origin and index. It never resets that origin, skips/coalesces edits,
waits for recorder credit, changes a command, or introduces an undo transaction.
An overdue edit requests a zero-delay timer; this is an event-loop task boundary,
not merely a resolved Promise. The original target remains overdue until execution.
This bounds synchronous catch-up to one command per timer task; it does not bound
the duration of an individual existing command or promise capacity for arbitrary
input rates.

The synchronous catch-up loop is principally a fixed-rate harness property.
Source audit found ordinary text input and reconciliation each invoke one replace
command (`src/input/gateway.ts:248,640,678`), and undo/redo invoke one repository
operation. Existing rich paste, selected-range Enter, multi-selection editing,
cross-Block formatting, selected-Block deletion/movement and tab conversions
already use explicit transactions. Their internal loops produce the existing
single commit/undo step; this investigation does not add grouping. Inline-image
load/error callbacks and timer-block interactions are separate event callbacks.
Direct repository call sites also batch entity binding and Workspace identity
assignment into one commit. Resolving a Workspace Document can issue two commits
after its asynchronous load/hash; it does not loop over independent edit commits.
No current ordinary UI path was found that emits the equivalent 65 independent
commits in one synchronous catch-up loop.

The public command API can nevertheless be called in arbitrary user-written
synchronous loops. That is not qualified by this experiment. A post-commit
observer cannot provide asynchronous backpressure before an already completed
commit; the current cap continues to expose that limitation. Production recorder
integration and a supported producer/admission contract remain gated. If such a
bulk producer is introduced, the smallest lossless option is admission before
each independent command at that producer boundary, retaining all commands and
undo steps. Raising the cap, buffering without a bound, or throwing only after
commit would not prove lossless intake. No production intake mechanism was
silently added to conceal this boundary.

## New observations and calibration

[Page observations](scripts/stage-c-gates/cost-observation.ts) record visibility,
focus, discard state, page show/hide, freeze/resume; requested timer delay,
deadline and actual firing time; instrumented timer-task sequence; synchronous
edit/oracle spans; and Long Tasks observations, with explicit support reporting.
Every statistic keeps a count, cumulative time and maximum with its location.
The recent-event ring has 32 entries; five-second HTTP telemetry preserves earlier
observations. Pending timers retain their original requests while waiting. The
task sequence counts instrumented timer callbacks, not every browser task.

Worker capture acknowledgements now carry a committed capture sequence and
posting timestamp. The main page records posted/delivered counts, commit IDs,
receipt time and timer-task sequence. Independent worker HTTP heartbeats retain
the last acknowledgement sent even if the main page cannot receive messages.
Existing worker apply/validate, queue, IDB, transport, server, outage and reconnect
measurements remain. Node adds its own timer-lateness observations and CDP
TaskDuration/ScriptDuration samples, lifecycle events, server receipt timestamps,
and final-verification milestones. Probes/telemetry have one request in flight;
CDP samples are bounded to 256 and lifecycle events to 128. Cross-context clocks
can differ slightly; sub-millisecond negative delivery intervals are not negative
work. Elapsed spans can include suspension, so they must be read with lifecycle
and task evidence rather than called CPU time.

| Calibration | Observation | Verdict |
| --- | --- | --- |
| Explicit 15-second synchronous task, 150 scheduled edits | 15,000.1 ms named task span and 15,064 ms Long Task; main heartbeat 14,195.9 ms late; all 150 edits/capture acknowledgements/undo entries retained; maximum 32 in flight. | All physical frame, replay, final oracle and empty-outbox checks passed. Diagnostic only. |
| Explicit five-second CDP freeze/resume | `visible` → `hidden` → `freeze` → `resume`, still `hidden`; edit timer requested for 158.6 ms fires 5,347.9 ms late. Subsequent zero-delay timers reach 27,267.8 ms late; heartbeat reaches 43,612.9 ms late, without a comparable Long Task. | Interrupted calibration, not a qualification pass or throughput failure. |

The freeze diagnostic continued receiving worker acknowledgements while hidden.
A separate read-only CDP observation confirmed the main page was hidden with an
empty worker/outbox backlog. A diagnostic-only `Page.bringToFront` attempt restored
focus but not visibility. The run was explicitly stopped at 44 committed edits
and its failure report retained. No edits were skipped to complete it. Neither
that intervention nor an injected freeze/busy task is part of the clean run.
The calibration distinguishes a known running task from known lifecycle/timer
suppression. It does not prove that the historical 73-second pause had the same
cause, or that every possible OS/browser/application stall can be uniquely
identified without a trace/profile of the incident.

Artifacts:

- [Busy-task calibration](BLOCK_SCOPED_HISTORY_STAGE_C_G3_SCHEDULING_20260918_BUSY.json), [log](BLOCK_SCOPED_HISTORY_STAGE_C_G3_SCHEDULING_20260918_BUSY.log).
- [Interrupted freeze calibration](BLOCK_SCOPED_HISTORY_STAGE_C_G3_SCHEDULING_20260918_FREEZE.json), [log](BLOCK_SCOPED_HISTORY_STAGE_C_G3_SCHEDULING_20260918_FREEZE.log), [read-only observation](BLOCK_SCOPED_HISTORY_STAGE_C_G3_SCHEDULING_20260918_FREEZE_PEEK.json), [attempted visibility restoration](BLOCK_SCOPED_HISTORY_STAGE_C_G3_SCHEDULING_20260918_FREEZE_RESTORE.json).

Reproduction uses `node scripts/stage-c-gates/cost.mjs` with `G3_SECONDS=30` and
either `G3_DIAGNOSTIC_BUSY_MS=15000` or `G3_DIAGNOSTIC_FREEZE_MS=5000`, writing a
fresh `G3_OUTPUT` path. A freeze can leave the page hidden; the recorded interrupted
run includes the explicit external stop reason. These options label the artifact
`qualificationTrace: false`. Clean qualification sets `G3_SECONDS=600` and leaves
both diagnostic options unset. A temporary `caffeinate -i` assertion inhibits idle
sleep only; it does not prevent clamshell sleep.

## Qualification and checks

The fresh-browser candidate requested the same 600-second/3,000-edit trace, with
neither diagnostic option enabled and no external CDP intervention. It failed
after 568.839 seconds of input, at edit 2,819. The successful history-off and
compact-only 3,000-edit controls remain in
the [previous report](BLOCK_SCOPED_HISTORY_STAGE_C_G3_UNDO_20260918.md); neither
their source workload nor their evidence has been replaced.

### The initiating pause is now attributed to display/visibility scheduling

| Local time (AEST) | Evidence |
| --- | --- |
| 12:46:41 | macOS power log: `Display is turned off`. The temporary assertion prevents idle **system** sleep, not display sleep. |
| 12:46:42.950 | Page records `visibilitychange` to `hidden`; focus remains true. No injected freeze or visibility change. |
| Hidden interval | Main zero-delay edit timer fires up to 19,966.4 ms late; heartbeat up to 27,595.7 ms late. Worker continues and drains each received edit; immediately before visibility returns, all 2,485 received revisions are captured/acknowledged, queue and outbox empty. |
| 12:47:39 | macOS power log: `Display is turned on`. |
| 12:47:39.814 | Page records `visible`, ending 56.864 seconds hidden. Original edit deadlines are now up to 53,112.7 ms overdue. |
| 12:47:58.539 | Catch-up reaches the unchanged 64-message cap; edit 2,819 is already committed when its capture is rejected. |

This run's evidence supports display-off/hidden-page timer suppression, rather
than a long-running editor task or system sleep. The largest measured edit was
229.1 ms; the largest Long Task was 1,359 ms during the earlier finite matrix.
Across a 57.197-second CDP window covering the hidden interval, accumulated page
TaskDuration increased by 6.330 seconds. Node heartbeat lateness peaked at 57.5 ms,
host sampling gaps at 10.034 seconds, and there are no actual system Sleep/Wake
event categories in the power log. The independent worker remained responsive.
These are elapsed observations, not a precise attribution of every CPU cycle.

The newly extracted [prior power evidence](BLOCK_SCOPED_HISTORY_STAGE_C_G3_SCHEDULING_20260918_PRIOR_POWER.json)
also records display-off at **11:17:39**, before the previous repeat's
11:17:50.062–11:19:09.344 main telemetry gap. This supports the same explanation
for that historical pause. Its missing page lifecycle/task data prevents the same
direct attribution available for the new run; it remains failed evidence.

### Yielding removes acknowledgement starvation but exposes worker throughput

Main acknowledgement delivery now averages approximately 2.90 ms, maximum
80.7 ms, while worker queue depth itself reaches 64. This differs from the old
run's approximately 2.63-second maximum main acknowledgement delay and received
worker queue peak of 16. The new failure cannot be explained solely by pending
acknowledgements starved behind one synchronous main task.

In the 18.031-second worker telemetry window spanning visibility restoration and
catch-up, 317 events arrive (17.58/s), but only 256 complete capture (14.20/s).
Worker queue depth grows from 0 to 61 by the last pre-failure sample, then reaches
64. Full validation averages **65.84 ms/event** in this window, versus 0.22 ms
apply, 0.12 ms encode and 2.97 ms IDB capture. Total worker event processing
averages 69.26 ms. Outbox depth at that pre-failure sample is only six records;
transport still acknowledges batches. IDB read/ack first-request elapsed times
also include time before the busy worker can run their callbacks, so they are
not isolated storage-device waits. The dominant measured event stage is full
verification; this is a separate catch-up throughput limit, not proof that the
steady five-edits/second workload exceeds capacity.

| Measurement | New candidate, partial failed trace |
| --- | --- |
| Scheduled / committed / posted | 3,000 / 2,819 / 2,818 |
| Server accepted at exit | 2,795; worker/main snapshots occur at different instants during shutdown and are not final drain counters. |
| Main callback p50 / p95 / maximum | 0.1 / 0.2 / 1.8 ms across 2,818 successful callbacks |
| Existing full edit p50 / p95 / maximum | 39.2 / 49.6 / 229.1 ms across 2,819 edits |
| Queue cap / actual maximum worker queue | 64 / 64 |
| Oldest outstanding main capture at failure | 3,401.9 ms |
| Outage peak | 301 records, 801,669 wire bytes |
| Reconnect backlog / drain | 300 records, 799,005 bytes / 969 ms |
| Oldest pending packet | 60,048 ms, covering the scheduled server outage |
| Peak sampled main heap | 144.09 MiB; not a combined worker/process heap measurement |
| Final independent oracle / physical all-frame replay / final empty outbox | **Not reached. No sustained exactness pass.** |

The failing committed event is named in `queueFailure.rejectedCommitId`. Keeping
the scheduled workload and observer semantics exposes the loss; we did not raise
the cap, buffer indefinitely, discard/reorder overdue edits, lower history depth,
weaken validation or rerun with a more favorable workload after this failure.

### Gate assessment and smallest corrective options

| Existing §10 criterion | Assessment |
| --- | --- |
| Exactness | Scheduler/legacy undo parity and the 150-edit busy calibration pass. The required sustained candidate fails before final oracle/replay proof. **Unmet.** |
| Compactness | Capture format and fixture unchanged; no new full-sequence storage added to capture. Existing packet-growth/foreign-only evidence remains; no completed sustained summary is claimed. |
| Foreground | Partial callback p95 0.2 ms, none over 50 ms. Finite 25k compact/candidate edit p95 43.2/43.8 ms, a 0.6 ms difference between unpaired percentiles. Favorable local evidence does not independently prove the complete supported-workload ≤4 ms gate. |
| Throughput | The scheduled outage drains in 0.969 s, but resumed catch-up exceeds worker verification capacity and loses one committed capture at the cap. **Unmet.** |
| Bounded resources | Existing caps stay enforced and undo growth remains reduced. Production capacity/limit-boundary qualification remains outstanding. |
| Selective reads / latency / broader matrix | Not established by this investigation; existing multi-Document/foreign/structural, valid-100k-revision, >1 GiB archive and discovery/query obligations remain. |

**Stop here.** Task yielding is necessary but insufficient; it is retained as an
explicit, tested harness correction, not described as a lossless general recorder
solution. The smallest next options for review are:

1. Establish the declared foreground host condition for a future unchanged trace:
   a temporary display-and-idle-sleep assertion (for example `caffeinate -di`) plus
   recorded visibility. This addresses the observed display transition, not the
   burst throughput defect, and cannot turn either failed run into a pass. Do not
   disable browser throttling or erase the hidden-page evidence.
2. Optimize the worker's exact validation work with differential parity proof of
   all existing invariants, then separately retest the recorded catch-up burst.
   Skipping validation or declaring unverified queued history complete is not an
   option. The measured stage breakdown makes this the first throughput target.
3. If arbitrary bulk/replay producers must be supported, define bounded credit
   admission **before** their independent commands commit, preserving all command
   identities, order, target deadlines and undo steps. This needs an explicit
   producer contract and tests; an after-commit observer error cannot supply
   lossless backpressure. Do not silently pace this benchmark to worker credit
   and call it the original unbounded catch-up stress.

No further optimization, queue-policy change, qualification attempt or P1 work
was performed after the new throughput failure.

Evidence: [failed candidate](BLOCK_SCOPED_HISTORY_STAGE_C_G3_SCHEDULING_20260918_CANDIDATE.json),
[log](BLOCK_SCOPED_HISTORY_STAGE_C_G3_SCHEDULING_20260918_CANDIDATE.log),
[derived assessment](BLOCK_SCOPED_HISTORY_STAGE_C_G3_SCHEDULING_20260918_ASSESSMENT.json),
[host/source hashes](BLOCK_SCOPED_HISTORY_STAGE_C_G3_SCHEDULING_20260918_HOST.json),
[power log](BLOCK_SCOPED_HISTORY_STAGE_C_G3_SCHEDULING_20260918_POWER.json).
All 33 pre-existing G3 JSON/log artifacts present at qualification start, including
both successful controls and all older failures plus the calibrations, remained
byte-for-byte unchanged. The raw host file's broadly matched power field includes
assertion lines; the derived assessment explicitly filters actual Sleep/Wake
categories instead of mistaking assertions for system sleep.

### Verification

Five new scheduler tests cover three seeded 3,000-edit schedules with repeated
73-second clock gaps, unchanged indices/target deadlines, acknowledgement task
servicing versus the old no-yield cap failure, and every intermediate real
command/undo/redo state against the full-operation history representation,
including revision counters. The twelve existing undo storage/parity tests also
pass. The counter comparison intentionally uses a live legacy representation:
undo increments existing revision counters instead of restoring an old counter.

Final checks now additionally read the physical journal, verify every frame's
checksum/sequence, compare it to the writer's acknowledged frames, and replay all
revision packets. They explicitly assert all capture acknowledgements delivered,
all worker/server/local counts equal to the scheduled count, all undo entries
present, reconnect drain completed and zero outbox bytes/count. Existing full
worker validation, independent repository oracle and sampled independent replay
checks remain.

Client/server typecheck, direct browser/worker TypeScript compilation, harness
syntax checks and `git diff --check` pass. The full application suite was not
rerun for this harness-only change; its previously documented two context-menu
failures and Node-suite/Vitest collection issue are not claimed fixed. See the
[check evidence](BLOCK_SCOPED_HISTORY_STAGE_C_G3_SCHEDULING_20260918_CHECKS.json).
