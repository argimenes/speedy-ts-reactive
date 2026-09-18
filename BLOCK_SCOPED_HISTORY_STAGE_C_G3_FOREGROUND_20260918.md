# G3 foreground qualification — 2026-09-18

**The uninterrupted sustained trace passes its losslessness, exactness, queue,
outage/reconnect and drain checks. A complete G3 pass is not claimed:** the
existing finite foreground comparison does not establish the ≤4 ms added-work
criterion. Stop for review; **P1–P6 remain gated**. The earlier hidden-page
catch-up failure remains a separate failed stress result.

## Declared and observed reference condition

The user authorized this subsequent run with display and idle system sleep
prevented. Reference host: Apple M1, 8 GiB RAM, Darwin 24.5.0/arm64, Node
v22.12.0, Chrome 153.0.8010.48, using the existing isolated headless browser and
its existing flags. This is the gate's actual-command fixture; rendering and
physical input-device latency are not measured.

```sh
G3_SECONDS=600 G3_MODE=candidate \
G3_OUTPUT=BLOCK_SCOPED_HISTORY_STAGE_C_G3_FOREGROUND_20260918_CANDIDATE.json \
caffeinate -di node scripts/stage-c-gates/cost.mjs
```

Neither diagnostic pause option was set. No browser lifecycle intervention,
throttling override, workload change, validation change, queue-limit change or
production producer/backpressure contract was introduced. All measured source
hashes match the preceding hidden-page failure and remained unchanged during this
run. No tests/builds ran concurrently.

The run occupied **13:05:35–13:16:12 AEST**. Both `caffeinate` assertions appear
in every one of the 63 interior host samples. The power log records no display
off/on or system sleep/wake transitions. All 121 main telemetry samples with page
state report `visible`; lifecycle evidence contains initial installation/page
show only, with no hidden/freeze/resume/page-hide transition. The final state is
visible and focused. There are 605 independent worker telemetry samples.

Maximum sustained schedule lateness is **3.9 ms**, and maximum edit-timer firing
lateness is **3.1 ms**. Earlier finite-matrix Long Tasks and final oracle/replay
work remain reported separately; they are not a sustained scheduling pause.

## Complete sustained result

| Check or measurement | Result |
| --- | --- |
| Fixture / schedule | Unchanged 25,000 characters; 3,000 independent edits at original 200 ms targets |
| Input completion | 599.841 s, retaining all 3,000 undo entries |
| Captures posted / acknowledgements delivered | 3,000 / 3,000 |
| Worker committed / server acknowledged / local acknowledgement committed | 3,000 / 3,000 / 3,000 |
| Main capture errors | None; harness exits 0 |
| Maximum event messages in flight | **1**, against unchanged cap 64 |
| Worker queue | Sampled event queue maximum 1; total recorded maximum 2 includes control messages |
| Scheduled outage | Server goes offline after 900 accepted revisions; reconnect 59.998 s later, before edit index 1,200 |
| Reconnect backlog / drain | 300 records, 799,005 wire bytes / **963 ms** |
| Peak outbox | 301 records, 801,669 bytes; caps remain 4,096 records / 16 MiB |
| Oldest pending packet | 59,988 ms, covering the scheduled outage |
| Final drain | **506 ms** |
| Final outbox / uploading | **0 records, 0 bytes / false** |
| Physical journal | **3,002** frames read from disk, checksum/sequence checked and compared with acknowledged writer frames |
| Revision replay | All **3,000** packets decoded; ancestry, revision IDs and preimages checked |
| Independent replay comparisons | **12** sampled clone/validate replay comparisons, plus final validation |
| Final independent oracle | Worker final state and physical-journal replay both equal the full repository projection |
| Packet wire bytes | 2,634–2,668; unchanged atomic cap 102,400 |
| Maximum append request | 99,193 bytes; existing HTTP/batch limits unchanged |
| Peak sampled main JS heap | 114.55 MiB; not combined process/worker heap |
| Undo sequence storage | 321,000 unique slots, 3,196 unique chunks; all steps retained |

The final worker pipeline snapshot includes its active `finish` control message
(queue depth 1), not an unprocessed revision. A subsequent independent worker
sample has queue depth 0 and an empty outbox. All 3,000 capture and acknowledgement
counters are explicitly asserted before success. The main progress snapshot's
`inFlight: 1` was written immediately after the last edit, before drain; the final
posted/delivered counters are both 3,000.

| Stage | Median | p95 |
| --- | ---: | ---: |
| Sustained capture callback, including transfer | 0.1 ms | **0.2 ms** |
| Whole existing edit command | 40.1 ms | 42.0 ms |
| Worker apply + full validation | 47.9 ms | 53.8 ms |
| Worker encoding | 0.1 ms | 0.2 ms |
| Strict IDB capture | 1.7 ms | 2.3 ms |
| Successful transport/server acknowledgement | 32.8 ms | 54.4 ms |

Maximum capture callback is **0.3 ms**, with zero measured history-added callbacks
over 50 ms. Maximum existing edit is 89.5 ms; it is not reported as added history
cost. Main acknowledgement delivery peaks at 2.8 ms. Worker validation averages
48.69 ms/event (maximum 146 ms), total event processing 50.82 ms, and queue wait
0.006 ms. Full validation keeps up with the original five-edits/second rate.
There is **no steady-state verifier throughput failure** in this run.

The 895 rejected append attempts are expected HTTP failures during the deliberately
offline interval, not rejected captures. Reconnect catches up and the final
verification proves that all revisions were retained and acknowledged.

## Foreground criterion and remaining gate scope

The existing prelude also runs 60 edits per length/mode. Its results must be kept
alongside the favorable sustained callback measurement:

| Paragraph length | Compact edit p95 | Candidate edit p95 | Difference of unpaired p95 values |
| --- | ---: | ---: | ---: |
| 100 | 0.6 ms | 0.6 ms | 0.0 ms |
| 5,600 | 11.1 ms | 19.4 ms | **8.3 ms** |
| 25,000 | 48.0 ms | 60.0 ms | **12.0 ms** |

Those last two differences exceed the existing 4 ms budget. They are unpaired
whole-command percentiles, not a direct measurement of the p95 of added work;
the finite candidate callback p95 itself is 0.1 ms. The data therefore neither
establishes the complete foreground criterion nor proves that 8.3/12.0 ms is
caused by capture. The worker is created **after** these finite matrices, so their
gap cannot be attributed to worker validation backlog. Allocation/GC, warm-up and
scheduling contributions are not isolated by this matrix. No cause is invented
and no threshold is relaxed to call it passing.

The smallest next qualification work is a matched, counterbalanced foreground
comparison with repository preparation/allocation and callback timing separated,
retaining the same commands, undo semantics and 4 ms/50 ms criteria. This is a
proposal for review, not an additional run performed here. This run provides no
reason to weaken or replace worker validation for the steady-state trace.

| Existing §10 gate | Assessment from this run |
| --- | --- |
| Sustained exactness | **Pass for this trace:** final independent oracle, physical frames, all revision replay and sampled independent comparisons complete. |
| Sustained throughput | **Pass under the declared foreground condition:** bounded queues, scheduled outage/reconnect, lossless drain and empty outbox. |
| Foreground added-work budget | Direct callback timing meets the numeric budget; complete comparative criterion remains **unestablished**, as above. |
| Compactness / resource limits | Small packets and bounded observed storage retained; no new complete foreign-load or production capacity-boundary qualification. |
| Broader G3/P6 matrix and query/latency gates | Multi-Document/structural/foreign-load coverage, valid 100k-revision and >1 GiB archives, discovery, query budgets and production capacities are not supplied by this trace. |

**Stop for review before P1.** No production producer contract or validator
optimization was implemented. The supported ordinary editing-path audit from the
previous investigation remains unchanged. The hidden-page catch-up run is still
a failure at committed edit 2,819 with actual worker queue depth 64; the present
foreground success does not qualify that burst or reinterpret its lost capture.

The successful 3,000-edit history-off and compact-only controls remain preserved
in the [undo investigation](BLOCK_SCOPED_HISTORY_STAGE_C_G3_UNDO_20260918.md).
Their full-edit p95 values were 56.1 and 57.0 ms respectively, versus 42.0 ms here.
These separate runs are descriptive controls, not paired proof of negative added
cost. No old control was replaced or silently relabeled.

## Evidence and preservation

- [Raw qualification result](BLOCK_SCOPED_HISTORY_STAGE_C_G3_FOREGROUND_20260918_CANDIDATE.json) and [log](BLOCK_SCOPED_HISTORY_STAGE_C_G3_FOREGROUND_20260918_CANDIDATE.log).
- [Host assertions, power transitions and source/artifact hashes](BLOCK_SCOPED_HISTORY_STAGE_C_G3_FOREGROUND_20260918_HOST.json).
- [Derived assessment](BLOCK_SCOPED_HISTORY_STAGE_C_G3_FOREGROUND_20260918_ASSESSMENT.json) and [checks](BLOCK_SCOPED_HISTORY_STAGE_C_G3_FOREGROUND_20260918_CHECKS.json).
- [Preserved failed hidden-page stress](BLOCK_SCOPED_HISTORY_STAGE_C_G3_SCHEDULING_20260918.md).

All 40 pre-existing G3 JSON/log artifacts present at run start remain byte-for-byte
unchanged. The harness, fixture, repository/undo code, validation and acceptance
criteria are unchanged. The previously passing scheduler/storage/parity checks
apply to the same measured sources; tests were not rerun during qualification.
