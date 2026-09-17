# Stage C G3 qualification rerun — 2026-09-18

**Result: G3 remains unmet. P1–P6 remain gated; Stage C is incomplete.**
Freeing disk space allowed longer control runs, but neither control completed.
Candidate durable capture reached its worker queue cap during the scheduled
outage. No workload, undo behavior or acceptance criterion was changed to obtain
a pass.

## Reproduction and evidence

Source: `f947fb012dca04a4378853a5089956317c43acd4`. Host: Apple M1,
Darwin arm64 / macOS 15.5, 8 GiB physical RAM, Node v22.12.0,
Chrome 153.0.8010.48. Runs occurred sequentially on 18 September, approximately
08:42–08:58 Australia/Brisbane (17 September 22:42–22:58 UTC).

The unchanged `costFixture(25000)` replaces one character at rotating start,
middle and end positions, alternating `Y`/`Z`. Each mode requests 3,000 edits
at 200 ms intervals (600 seconds). Ordinary undo retains each original step.
There is no stack clearing, pruning, grouping, changed command or heap-limit flag.
The durable harness retains its initial 100/5,600/25,000-character comparison
matrix and existing offline/reconnect triggers at zero-based edits 900/1,200.
The run was not substituted with a smaller paragraph or shortened smoke test.

Commands, run one at a time from the repository root:

```sh
G3_SECONDS=600 G3_MODE=off G3_OUTPUT=BLOCK_SCOPED_HISTORY_STAGE_C_G3_RERUN_20260918_OFF.json node scripts/stage-c-gates/cost-control.mjs
G3_SECONDS=600 G3_MODE=compact G3_OUTPUT=BLOCK_SCOPED_HISTORY_STAGE_C_G3_RERUN_20260918_COMPACT.json node scripts/stage-c-gates/cost-control.mjs
G3_SECONDS=600 G3_MODE=candidate G3_OUTPUT=BLOCK_SCOPED_HISTORY_STAGE_C_G3_RERUN_20260918_CANDIDATE.json node scripts/stage-c-gates/cost.mjs
```

Only two harness reporting changes preceded these runs: controls accept
`G3_OUTPUT` to preserve prior artifacts; candidate failure artifacts include
the already measured `hostResources`. The fixture, repository, commands,
capture adapter, worker, browser flags, pacing, deadlines and queue caps were
unchanged. No regression tests/builds ran concurrently with the measured traces.
Each harness closed its own browser/profile and temporary store on exit.

Evidence:

- [History-off result](BLOCK_SCOPED_HISTORY_STAGE_C_G3_RERUN_20260918_OFF.json) and [telemetry log](BLOCK_SCOPED_HISTORY_STAGE_C_G3_RERUN_20260918_OFF.log).
- [Compact-only result](BLOCK_SCOPED_HISTORY_STAGE_C_G3_RERUN_20260918_COMPACT.json) and [telemetry log](BLOCK_SCOPED_HISTORY_STAGE_C_G3_RERUN_20260918_COMPACT.log).
- [Durable candidate result](BLOCK_SCOPED_HISTORY_STAGE_C_G3_RERUN_20260918_CANDIDATE.json) and [progress/error log](BLOCK_SCOPED_HISTORY_STAGE_C_G3_RERUN_20260918_CANDIDATE.log).
- [Host sampling, commands, source hashes and run times](BLOCK_SCOPED_HISTORY_STAGE_C_G3_RERUN_20260918_HOST.json).
- [Post-run verification output](BLOCK_SCOPED_HISTORY_STAGE_C_G3_RERUN_20260918_CHECKS.json).

Previous smoke/control/experiment artifacts remain unchanged. Host samples were
taken outside the browser approximately every ten seconds. Swap includes other
applications; process RSS is not JS retained heap. The controls report total
browser JS heap, including their fixture baseline, editor and undo. They allocate
the same fixture but history-off installs no capture subscription. There was no
heap snapshot, allocation attribution or GC trace in this run.

## Observed results

| Measurement | History off | Compact capture only | Candidate durable capture |
| --- | --- | --- | --- |
| Requested edits / duration | 3,000 / 600 s | 3,000 / 600 s | 3,000 / 600 s |
| Last reported edits | 1,276 | 1,251 | 962 |
| Last reported trace elapsed | 379.707 s | 293.523 s | 197.323 s |
| Capture evidence | Zero callbacks | 1,251 callbacks; no reported capture errors | 64 messages in flight; explicit queue-cap error |
| Server-acknowledged revisions | Not applicable | Not applicable | 895 |
| Last reported undo entries | 1,276 | 1,251 | Not sampled by this harness |
| Last used JS heap | 3.888 GiB | 3.830 GiB | Not published on failure |
| Browser-reported JS heap limit | 4.094 GiB | 4.094 GiB | Same browser configuration; not separately sampled |
| Free disk at preflight | 27.945 GiB | 24.969 GiB | 24.765 GiB |
| Minimum sampled free disk | 21.624 GiB | 22.666 GiB | 23.343 GiB |
| Maximum sampled host swap used | 7,217.75 MiB | 5,941.75 MiB | 5,053.31 MiB |
| Outcome | `CDP timeout: Runtime.evaluate` | `CDP timeout: Runtime.evaluate` | `Gate worker queue cap` |

Control edit counts are **last received telemetry**, not an assertion that no
additional edits occurred before the timeout. Their process exit status is zero
because the existing diagnostic harness records errors and returns normally;
both artifacts say `completed: false` and contain the timeout. The candidate
process exited 1. Its inner `lastStatus.completed: true` means the browser run
terminated through its error handler, not success; the artifact says `passed: false`.

History-off initially kept pace (826 edits at 165.055 s), then slowed. One
sampled edit took 10,593.8 ms. Its last sample represents only about 3.36 edits/s
over the elapsed trace; compact-only's represents about 4.26 edits/s. Neither is
a completed-run throughput statistic. Both controls' sampled undo entries encoded
to 2,452,198–2,452,210 bytes **per entry**. Serialized entry size is not heap size.
The existing repository stores cloned forward/inverse full-content operations;
that is substantial baseline storage independent of added durable packets.

Durable capture reported 265, 565 and 883 edits with one message in flight at
52.832, 112.836 and 176.436 s. It then hit the 64-message cap at 962 edits,
after the outage trigger and before reconnect. The cap check is in the capture
callback before `worker.postMessage`; the event hitting the cap cannot enter the
worker through that callback. The harness reports the failure rather than passing
an incomplete archive. The 895 server acknowledgements do not establish the
IDB status of every remaining edit, and the unacknowledged difference must not
be reported as a measured loss count.

Neither control nor candidate recorded an explicit fatal OOM message or crash
event. Large baseline undo retention and heap growth are observed; a specific OOM
cause is not proved. The worker's stall/cap during the outage is also observed;
this artifact cannot distinguish memory/GC pressure, worker validation, IDB,
transport scheduling or another cause. There is no basis to absolve the durable
pipeline solely because the controls also failed.

## Assessment against Stage C plan §10

| Gate | Assessment |
| --- | --- |
| Exactness | Bounded gate/ownership/incremental tests pass in the regression run. Sustained all-frame/ancestry checks, designated reconstructed states and final oracle equality were not reached; no long-run exactness pass. |
| Compactness | Existing incremental/compact-capture regressions pass, including packet-growth/foreign-only cases. The failed sustained run publishes no completed packet-size summary and does not add sustained compactness qualification. |
| Foreground | No valid completed comparison establishes added p95 ≤4 ms or zero history-added tasks >50 ms. Control edit samples include ordinary editor/undo costs; they cannot be called durable overhead. The earlier smoke is not promoted to a sustained pass. |
| Throughput | **Unmet.** Controls did not sustain/complete the trace; candidate exhausted its declared 64-message queue. Reconnect, drain time, oldest pending age, final empty outbox and lossless completion were not demonstrated. |
| Bounded resources | **Unmet for qualification.** The disk guard passed, but controls showed large rising heap/undo storage and candidate hit its worker cap. No production capacity table, limit-boundary matrix or retained-memory plateau is established. |
| Selective reads | Not exercised by this rerun. Bounded discovery/query/cancel/dispose qualification remains outstanding. |
| Latency policy | Cold/warm state/subtree/location/timeline/comparison/grouping targets and checkpoint distances were not measured here. They remain outstanding. |

The initial finite comparison matrix cannot supply the missing sustained
measurements: on failure, the current durable harness preserves progress/errors
but not the final callback/worker/outbox distributions or heap series. No values
are reconstructed from the old smoke result. The broader semantic/multi-Document,
foreign-load, burst, 100k-revision, >1 GiB archive and directory-discovery matrix
also remains an obligation; this fixed trace alone would not complete G3/P6 even
if it passed.

## Verification after the measured runs

| Command/check | Result |
| --- | --- |
| `npm test` | 417 passed / 2 failed tests (419 total), 59 passed / 2 failed files, 42.03 s. The same two known context-menu test failures, plus a Node-only storage-suite collection failure described below. |
| `node --test scripts/stage-c-gates/storage.test.mjs` | All 23 storage cases passed together, 10.52 s. |
| `npm run typecheck` | Client and server passed. |
| `npm run build` | Client and server passed. |
| Harness syntax, JSON parsing, source preservation and `git diff --check` | Passed. |

The full Vitest command also discovers `scripts/stage-c-gates/storage.test.mjs`,
which imports `node:test`; its transformed `import.meta.url` causes
`fileURLToPath` to fail with “The URL must be of scheme file” before collecting
storage tests. Those files and the Vite configuration are unchanged from the
starting revision. Running the intended Node suite separately passes all 23 cases.
This newly recorded test-runner integration issue remains unresolved; it is not
silently counted as a full green regression run. The two context-menu failures
remain missing Delete Block and undefined tab `ownerKey`.

## Stop decision and next prerequisite

Keep P1–P6 stopped under the existing plan. More free disk removed the original
near-full-volume condition but did not qualify the unchanged workload.

The smallest next investigation is a separately scoped, behavior-preserving
optimization of undo **storage**, together with instrumentation that distinguishes
worker verification, IDB waiting and queue age at failure. A compact representation
would need parity for every forward/inverse edit and intermediate undo/redo state,
commit cause, identity, counter, stack entry and redo-branch rule before remeasuring
all three unchanged modes. This rerun implements no such optimization.

Do not prune/group undo, drop committed capture events, weaken validation, raise
queue limits without measured bounds or replace the trace to obtain a pass. A
different reference host can supply additional evidence, but cannot retroactively
make these runs pass or prove that the candidate's queue failure was baseline-only.
