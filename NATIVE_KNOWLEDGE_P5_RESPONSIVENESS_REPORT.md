# Native Knowledge — bounded integrated responsiveness correction

This correction retains the accepted P1–P5 semantics and rollout boundary: `nativeKnowledge:true`, `nativeKnowledgeSaved:false`, with `nativeKnowledge:false` as the legacy rollback. Saved coverage was explicitly enabled in qualification only.

## Production change

Only the existing Flint vault derivation/presentation is corrected:

- The application host derives `ApplicationVault.state` through one Solid memo per Window. Individual controls no longer reconstruct the complete Document list on every reactive read.
- Equal presentation rows retain their object identity across discovery, repository and binding publications. Solid's keyed `For` consequently retains unchanged Document rows. Equality includes canonical ID, physical path, availability/state, title, loaded status and tags. Changed rows still update; removed rows disappear.
- The view memoizes the state accessor and folder selector. The memo is owned by the existing Window lifetime and is disposed with it.

This is an ephemeral presentation value, not a new identity/ownership index or storage cache. The authoritative vault snapshot, signature, baseline, discovery completeness, pending operations, native bindings and action revalidation remain untouched. No receipt or worker evidence is copied into the retained UI rows. Busy/read-only/diagnostic changes remain reactive even when Document rows are equal.

The host and view changes are in `src/application/document-application-capabilities.tsx` and `src/features/flint/vault-view.tsx`. A real UI/server regression extends `src/application/flint-vault.test.tsx` to bound repeated location reads and check row/Folder DOM retention across admission, native title changes and filesystem discovery updates.

The verified scope, metadata fence, 32-resource batches and 256 MiB Facts/index budget are unchanged. General native admission remains global. No persistence, ownership, repository, Knowledge or worker redesign is part of this correction.

## Measurement method

The existing P5 real Flint/Chrome/managed-server harness runs 100 and 1,000 native resources with two Windows. Unprofiled latency runs are separate from diagnostic CPU/timing runs and other intensive tests. The accepted P5 `browser-final.json` remains the comparison baseline; it is not overwritten.

The diagnostic run uses qualification-only Vite source instrumentation (`scripts/native-activation-measurement.mjs`) to time discovery refresh, vault derivation, native request/decode/Open/admission/binding, repository commit/publication, occurrence construction, live passage matching and reveal/focus. These measurements are inclusive and nested; they cannot be added to obtain wall time. Async instrumentation introduces scheduling overhead, so diagnostic elapsed times are not substituted for the uninstrumented latency results. CPU profiles preserve reconciliation/layout/GC work not enclosed by a single application function.

The main harness also counts existing tree buttons still connected after activation. It does not modify data, scope evidence or control flow. There are no production measurement hooks.

## Integrated responsiveness results

The identified multi-second vault/UI stall is removed in both corrected runs, but **selected-result Open is still materially delayed**. The 1,000-resource runs took **20.10 and 16.60 seconds** with longest Open tasks of **445 and 622 ms**, compared with the accepted P5 observation of 20.92 seconds and 4,315 ms. This is not an assertion that saved activation is ready for default rollout.

[Corrected run](artifacts/native-knowledge-p5-correction/browser-corrected.json), [independent repeat](artifacts/native-knowledge-p5-correction/browser-repeat.json), [accepted comparison](artifacts/native-knowledge-p5/browser-final.json). Same Chrome 154/M1 host and fixtures; these are two engineering observations, not controlled statistical performance claims. All table values are milliseconds, rounded; corrected values show **first / repeat**. Zero in a task row means no recorded task >=50 ms, not zero work.

| Phase | P5 100 | Corrected 100 | P5 1,000 | Corrected 1,000 |
| --- | ---: | ---: | ---: | ---: |
| Initial discovery | 609 | 1083 / 553 | 3441 | 4264 / 3123 |
| First useful saved coverage after discovery | 583 | 582 / 562 | 4218 | 7861 / 3846 |
| Remaining completion wait after partial-query phase | 251 | 346 / 251 | 11521 | 8809 / 8341 |
| Cold 1,000-result query/publication | 115 | 113 / 117 | 178 | 140 / 132 |
| Explicit selected-result Open/reveal | 2216 | 2022 / 2639 | 20920 | 20103 / 16600 |
| Longest discovery task | 0 | 0 / 0 | 215 | 0 / 0 |
| Longest partial-coverage task | 0 | 0 / 0 | 474 | 0 / 0 |
| Longest Open task | 321 | 298 / 359 | 4315 | 445 / 622 |
| Native input median | 19 | 20 / 18 | 19 | 18 / 23 |
| Native input median during rebuild | 18 | 19 / 19 | 20 | 19 / 19 |
| Remaining post-edit live/saved rebuild | 506 | 559 / 480 | 8889 | 11888 / 15553 |
| Explicit Refresh | 320 | 300 / 300 | 3354 | 6264 / 2934 |
| Subsequent rebuild after Refresh + input | 774 | 842 / 789 | 13378 | 14401 / 16413 |
| Scope disposal | 29 | 25 / 22 | 469 | 62 / 42 |

Both sizes reached complete indexed resource coverage, with **zero bindings before explicit activation** and exactly one selected binding after it. This is distinct from per-query coverage: the existing 200-source/1,000-hit budgets still report incomplete results where appropriate. The partial-query phase is interposed before the remaining completion wait; the separate phases are not an isolated extraction timer.

Warm 1,000-result query times at 100 resources were 97/99/94 ms (repeat 100/111/101); at 1,000 they were 135/141/193 ms (repeat 140/138/129). No >=50 ms task occurred during these completed cold/warm publications or progressive remaining coverage. The first useful partial query during rebuild took 44–94 ms across the two sizes/runs. Discovery and partial-coverage UI stalls of 215/474 ms from P5 did not recur. The second 1,000-resource ordinary-input phase recorded one 52 ms task; neither corrected run recorded >=50 ms tasks during input **after explicit Refresh/rebuild began**. Cooperative scheduling is not a hard frame deadline.

Reduced UI work does **not** establish a consistent wall-time reduction for initial discovery, first coverage, Refresh or post-edit rebuild. The remaining completion wait was shorter in both runs, while post-edit reobservation was longer than the single P5 baseline. Metadata fencing and conservative cohort revalidation are unchanged, and server/worker/I/O scheduling remains material. No additional optimization was pursued to cross an arbitrary latency target.

## Retention and shared lifetime

| Measurement | 100 resources, first / repeat | 1,000 resources, first / repeat |
| --- | ---: | ---: |
| Retained Facts/index accounting charge | 10,591,020 / 10,591,020 B | 106,306,200 / 106,306,200 B |
| Browser JS heap after GC, UI/repository/index retained | 35,220,960 / 35,184,500 B | 69,505,556 / 69,495,680 B |
| Browser JS heap after disposal/GC | 20,837,192 / 20,822,920 B | 21,189,980 / 21,297,268 B |
| Existing buttons retained after selected activation | 99/100 in both | 999/1,000 in both |
| Saved reads before → after second Window acquisition | 100 → 100 in both | 1,000 → 1,000 in both |
| Final Facts accounting charge | 0 B in both | 0 B in both |

The accepted P5 1,000-resource browser heap was 321,665,724 B. The much smaller corrected heap accompanies eliminating repeated reactive row construction; it is not a changed Facts budget. Accounting charge is conservative representation accounting, not measured heap, and does not bound all DOM/repository/browser memory. Both Windows retain independent navigation handles while sharing the same extraction/charge. Cancellation again published zero results; closing the scope released the derived charge. Original legacy-constructor owner-map and projection enumeration limitations are unchanged.

## Explicit Open attribution

[Instrumented phase results](artifacts/native-knowledge-p5-correction/activation-phases.json) and [full event timelines](artifacts/native-knowledge-p5-correction/browser-profile.json) separate the requested costs. This diagnostic run completed activation in 3.89 seconds at 100 and 17.09 seconds at 1,000 resources. Its overhead and run-to-run variation preclude treating those values as the latency baseline.

| Inclusive phase | 100 resources | 1,000 resources |
| --- | ---: | ---: |
| Discovery refresh waits (overlap/coalescing included) | 3097.9 ms / 5 calls | 20394.4 ms / 5 calls |
| Discovery HTTP begun during activation | 2059.5 ms / 3 calls | 12792.6 ms / 3 calls |
| Selected native read HTTP (Open + two verification reads) | 553.5 ms / 3 calls | 317.3 ms / 3 calls |
| Vault-state derivation | 5.5 ms / 4 calls | 11.3 ms / 4 calls |
| Selected decode (two existing decodes) | 164.0 ms / 2 calls | 197.5 ms / 2 calls |
| NativeDocumentSession.openResource (inclusive) | 1127.0 ms / 1 calls | 4261.4 ms / 1 calls |
| Native admission (includes decode and commit) | 202.9 ms / 1 calls | 234.8 ms / 1 calls |
| Binding establishment | 45.3 ms / 1 calls | 91.0 ms / 1 calls |
| Repository commit | 117.8 ms / 1 calls | 136.2 ms / 1 calls |
| Repository publication/reactions inside commit | 96.1 ms / 1 calls | 117.0 ms / 1 calls |
| Occurrence open/mount (inclusive) | 288.4 ms / 1 calls | 79.5 ms / 1 calls |
| Transient occurrence construction | 207.8 ms / 1 calls | 69.4 ms / 1 calls |
| Post-admission live Facts validation | 91.7 ms / 1 calls | 153.7 ms / 1 calls |
| Exact passage rematch | 67.8 ms / 1 calls | 18.2 ms / 1 calls |
| Reveal | 1.8 ms / 1 calls | 3.2 ms / 1 calls |
| Final focus | 3.1 ms / 1 calls | 1.4 ms / 1 calls |
| Native range restoration | 1.2 ms / 1 calls | 1.2 ms / 1 calls |

At 1,000 resources, four vault derivations totaled **11.3 ms**; 999 unchanged buttons remained connected. The old repeated whole-tree derivation/cleanup is no longer a multi-second operation. Folder DOM retention is also checked by the real UI regression.

The remaining dominant wait is **conservative discovery revalidation**, not general repository admission. There were five refresh invocations, but some shared an in-flight refresh; summing their 20.39 seconds double-counts waiting. The three new discovery requests totaled 12.79 seconds, and the activation initially awaited approximately 3.24 seconds of already-in-flight discovery. Their non-overlapping refresh wait intervals cover approximately **16.0 of the 17.1 seconds**. Background verified-scope extraction can also contend for worker/server time; request durations include that scheduling and do not identify all delay as filesystem I/O.

Admission itself was approximately **235 ms**, including its own decode and a **136 ms** commit; the publication/reaction portion of that commit was **117 ms**. This remains synchronous global admission and is not claimed to be resource-local. The selected resource's content was held constant between vault sizes. No general admission optimization is justified by the remaining *wall-time* attribution in this fixture.

The existing native path decodes the selected resource twice (about 198 ms combined here); one decode is nested in admission. This is visible, bounded existing work, not the dominant large-vault delay. It was not changed by this pass. `openResource`'s 4.26-second inclusive time includes a full discovery checkpoint, so it must not be reported as 4.26 seconds of native decode/admission CPU.

The refreshes before acting, before admission, after asynchronous mount and after reveal protect different externally mutable boundaries. One focus-triggered refresh is already coalesced with a navigation refresh. No checkpoint was dropped or declared redundant merely because the selected file was unchanged. Replacing repeated full semantic discovery with an unchanged-evidence verification would require a separately reviewed, bounded store-proof change preserving duplicate/operation/confinement uncertainty. It is a possible next investigation, **not implemented or approved by this report**, and must not weaken the existing fence or introduce a cache/watcher.

[CPU profile summary](artifacts/native-knowledge-p5-correction/profile-summary.json) and the [discovery](artifacts/native-knowledge-p5-correction/discovery-1000.cpuprofile), [partial coverage](artifacts/native-knowledge-p5-correction/partial-1000.cpuprofile) and [activation](artifacts/native-knowledge-p5-correction/activation-1000.cpuprofile) profiles (corresponding 100-resource profiles also retained) preserve reconciliation, GC and scheduler evidence. The activation profile is mostly idle/waiting; residual native clone/validation, publication, layout and GC remain. Browser tasks are not all represented by the explicitly timed application functions.

## First-use publication watchpoint

The original P4 150-loaded-resource / 1,000-result case was rerun unchanged. First search/publication completed in **238 ms** and recorded a **60 ms** long task; three warm searches completed in **119 / 142 / 68 ms** with no >=50 ms tasks. Thus the original 105 ms first-use watchpoint remains **open**, even though the exact duration did not recur. This correction does not claim to fix it or redesign the query scheduler. [Raw P4 repeat](artifacts/native-knowledge-p5-correction/p4-first-use.json).

The P4 fixture separately spent 16.7 seconds constructing test data and 28.6 seconds constructing its loaded repository. Those are not query latency or saved-vault startup. Two consumers added zero observations or retained charge, and disposal returned the Facts accounting charge to zero.

## Correctness and compatibility

- Full relevant native/C1/C2/C3/P1–P5 regression: **656 passed, one retained known failure**, 657 tests across 50 files. The failure remains `src/block-tree/commit-capture.test.ts:249`, the pre-existing Solid projection enumeration assertion. It was not removed or weakened. The SIGKILL/restart/recovery suite passed **10/10**. [Full log](artifacts/native-knowledge-p5-correction/regressions.log).
- Focused actual vault UI/server suite: **14/14**, including the new bounded derivation/row-retention assertion. Existing title/tag Undo, pair/directory relocation, read-only, duplicate identity, unknown payload and owned-dependency cases pass. [Log](artifacts/native-knowledge-p5-correction/vault-regressions.log).
- Actual saved-enabled Chrome/server [C2](artifacts/native-knowledge-p5-correction/c2-browser/browser-results.json) and [C3](artifacts/native-knowledge-p5-correction/c3-browser/browser-results.json): **16/16 each**, no uncaught browser exceptions. These preserve invoking-Window navigation, native selection, changed-file rejection, reference Undo/Redo, restart, saved-source keyboard activation, Grouping and IME.
- Explicit legacy rollback: unchanged rerun **22/22**. An initial run overlapped `npm run build` and failed five waits for discovered rows (17 passed). The client build empties `dist`, and the subsequent server build recreates the discovery worker there; the timing is consistent with build-artifact interference. No test or production change was made before the passing rerun after the build. Both [initial](artifacts/native-knowledge-p5-correction/rollback-initial-concurrent-build.log) and [rerun](artifacts/native-knowledge-p5-correction/rollback-rerun.log) are retained; the initial run is not described as green.
- [Client/server build](artifacts/native-knowledge-p5-correction/build.log), [both TypeScript projects](artifacts/native-knowledge-p5-correction/typecheck.log), and `git diff --check` pass. Build output retains existing chunk-size warnings.

Performance runs were isolated from build/regression workloads. Browser correctness suites ran concurrently with functional regressions, not latency measurement. Future test execution should keep a build that replaces `dist` separate from server tests using the built worker.

## Reproduction and review boundary

The full regression command is the unchanged gate documented in [the accepted P5 report](NATIVE_KNOWLEDGE_P5_REPORT.md#reproduction), with the additional vault assertion in the same test file. Reproduce the correction evidence with:

```sh
npm run typecheck
npm run build
# Run tests after build completes; do not replace dist while workers use it.
npx vitest run src/application/flint-vault.test.tsx --maxWorkers=1 --minWorkers=1
P4_FACTS=0 npx vitest run src/application/flint-knowledge.test.tsx src/application/canonical-backlinks.test.ts --maxWorkers=1 --minWorkers=1 --testTimeout=30000
P5_SAVED=1 PROOF_ARTIFACTS=artifacts/native-knowledge-p5-correction/c2-browser node scripts/check-flint-c2-browser.mjs
P5_SAVED=1 PROOF_ARTIFACTS=artifacts/native-knowledge-p5-correction/c3-browser node scripts/check-flint-c3-browser.mjs
# Run each measurement separately from other intensive work.
P5_ARTIFACTS=artifacts/native-knowledge-p5-correction P5_COUNTS=100,1000 P5_OUTPUT=browser-corrected.json node scripts/check-native-knowledge-p5-browser.mjs
P5_ARTIFACTS=artifacts/native-knowledge-p5-correction P5_COUNTS=100,1000 P5_OUTPUT=browser-repeat.json node scripts/check-native-knowledge-p5-browser.mjs
P5_ARTIFACTS=artifacts/native-knowledge-p5-correction P5_COUNTS=100,1000 P5_PHASES=1 P5_PROFILE=1 node scripts/check-native-knowledge-p5-browser.mjs
P4_COUNTS=150 P4_MODES=true P4_WARM=1 P4_OUTPUT=browser-p5-correction-watchpoint.json node scripts/check-native-knowledge-p4-browser.mjs
```

The bounded correction is complete: redundant vault derivation and unchanged-row reconstruction are removed and qualified. Saved activation still has long synchronous tasks and a substantial discovery wait. The evidence does not support describing general native admission as the dominant remaining wall-time blocker, nor declaring the first-use publication watchpoint fixed.

**Stop for rollout review.** `nativeKnowledgeSaved` remains **false**, loaded `nativeKnowledge` remains **true**, and the legacy rollback remains available. No validation checkpoints, fence semantics, batch size, authority rules or persistence formats have changed. No further performance subsystem or architectural stage has been begun.
