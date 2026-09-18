# G3 final bounded matched foreground comparison — 2026-09-18

**Decision: the predeclared comparison did not pass; G3's foreground qualification
remains unestablished.** The 5,600-character paired p95 difference is 6.4 ms against
the unchanged 4 ms limit. A strong execution-order effect prevents attributing
that difference to genuine history-added work. Do not label this a proven
production regression, silently substitute a different statistic, or claim G3
passed. No further G3 runs, optimizations or architectural investigation are
scheduled. P1–P6 implementation remains stopped for review.

The user's latest scope makes this the final bounded G3 task: a passing matched
comparison would close G3 without adding the broad P6 matrix as another G3
prerequisite. That matrix is release/expanded-support qualification, not additional
work commissioned here. The existing successful uninterrupted sustained result
and failed hidden-page stress result retain their original classifications.

## Fixed method and host

```sh
caffeinate -di node scripts/stage-c-gates/matched.mjs \
  > BLOCK_SCOPED_HISTORY_STAGE_C_G3_MATCHED_20260918.log 2>&1
```

Run: 03:44:39–03:45:47 UTC, Apple M1, Node 22.12, Chrome 153.0.8010.48,
the same isolated headless browser configuration used by the preceding gates.
Both display-idle and system-idle sleep assertions were present in all nine
recorded power samples. Every edit arm checked visible page state; page/CDP
lifecycle and requested-versus-fired timer evidence are retained. No browser
throttling flag, production path, validation, undo policy or queue limit changed.

The planned cases were 100, 5,600 and 25,000 characters. Each uses identical initial
repository snapshots, the unchanged start/middle/end replacement command, a
200 ms pair target, 30 fixed warm-up pairs and 120 measured pairs. Both arms retain
one ordinary undo step per edit. The first arm alternates, balanced at each edit
position; each arm starts in a separate timer task. Generated Cell identities are
not mocked. Starting exact state, every revision/undo depth and final authored
Document equality are checked.

The candidate uses the unchanged actual worker, full validation, strict IDB and
native fenced server append. The compact arm has the existing compact history
subscription. Transparent timing wrappers on both repositories measure capture
preparation and delivery; callback/capture/transfer and remaining command work
are also recorded. No forced GC or outlier removal is used. Warm-up samples remain
in the artifact but are excluded by the fixed rule.

The statistic was fixed before execution: nearest-rank p95 of the 120 signed
**per-pair candidate-minus-compact whole-command durations**, plus the existing
50 ms added-work/callback ceiling. It is not the difference of independently
computed percentiles. The runner stops on the first failing case without retry;
therefore the 25,000-character matched case was **not run**. The earlier 3,000-edit
sustained trace was not rerun or replaced by this shorter comparison.

## Results and attribution

| Paragraph | Paired difference median / p95 / maximum | Candidate callback p95 / maximum | Result |
| --- | --- | --- | --- |
| 100 characters | 0.1 / 0.7 / 1.0 ms | 0.2 / 0.3 ms | Pass |
| 5,600 characters | −0.1 / **6.4** / 9.9 ms | 0.2 / 0.3 ms | Fails predeclared statistic |
| 25,000 characters | Not executed after stop | — | Not established |

At 5,600 characters, 40/120 measured pairs exceed 4 ms. This is not one discarded
outlier. However, splitting by order produces opposite signs:

| First arm | Candidate-minus-compact median | p95 | Pairs |
| --- | --- | --- | --- |
| Compact | −3.2 ms | −0.3 ms | 60 |
| Candidate | +4.6 ms | +7.7 ms | 60 |

Both modes are slower when they run first. Median compact command time is
15.95 ms first versus 11.15 ms second; candidate is 16.10 ms first versus 12.80 ms
second. The first arm follows the pair's idle interval, whereas the second
follows the first command and a short timer. Alternating order balances means,
but does not cancel an order penalty in the upper tail of signed pair differences.
The recorded samples establish this asymmetry; they do **not** identify whether
CPU/cache state, JIT/GC, worker contention or another host effect causes it.

Capture preparation plus delivery has a paired p95 difference of **0.4 ms** and
maximum **0.6 ms** at 5,600 characters. Remaining command work has a paired p95
difference of 6.2 ms. The small directly measured capture cost does not by itself
prove that all indirect allocation/worker effects meet the foreground gate.
Equally, the order-confounded whole-command statistic does not prove that the
candidate adds 6.4 ms to normal editing. No validator optimization is justified
by these measurements. No threshold or passing statistic is changed after the
result.

Both executed cases finish all 150 candidate edits with 150 main, server and local
acknowledgements, maximum event in-flight and worker queue depth one, empty
outboxes and final independent oracle equality. Each physical journal has 152
frames and matches the writer's framed/checksummed sequence; its stored baseline
matches the original. No page crash or hidden-page edit is observed. Pair-timer
maximum lateness is 2.1/2.0 ms. The full sustained all-frame/replay and reconnect
proof remains the preceding foreground run's evidence; this finite comparison
does not replace it.

## Stop and next-development scope

No second attempt or 25,000-character retry follows this stop. If the measurement
question is later reopened, the smallest methodological correction would give
both arms equivalent preceding idle/task conditions and predeclare an
order-controlled analysis. That is an option for review, **not another scheduled
G3 requirement**. No production change follows from an unisolated timing effect.

The [minimum UI slice](BLOCK_SCOPED_HISTORY_INITIAL_UI_SLICE.md) distinguishes the
small persistent-path integration that remains essential, later production
hardening, and UI work that can start now through an explicit read-only adapter.
The temporary UI path does not require pretending that this comparison passed
or enabling an unqualified production recorder.

## Evidence and focused checks

- [Raw samples, timing stages, lifecycle, power assertions and source hashes](BLOCK_SCOPED_HISTORY_STAGE_C_G3_MATCHED_20260918.json).
- [Unedited execution log](BLOCK_SCOPED_HISTORY_STAGE_C_G3_MATCHED_20260918.log).
- [Derived assessment, checks and preservation hashes](BLOCK_SCOPED_HISTORY_STAGE_C_G3_MATCHED_20260918_ASSESSMENT.json).
- [Comparison runner](scripts/stage-c-gates/matched.mjs), [browser instrumentation](scripts/stage-c-gates/matched-browser.ts), [statistics](scripts/stage-c-gates/matched-statistics.mjs).

Three focused Node tests pass for paired statistics/order strata, retained
outliers/thresholds, and missing/reordered pairs. The new browser harness passes
TypeScript compilation and the runner passes syntax checking. No production
source changed, so no new broad regression campaign was run. All **49** pre-existing
G3 JSON/log/report artifacts remain byte-for-byte unchanged. The comparison's
source hashes are identical before and after execution.
