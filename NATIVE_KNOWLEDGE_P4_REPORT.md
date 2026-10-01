# Native Knowledge P4 — Loaded C2/C3 Provider Replacement

P4 implements the explicitly selected Facts-backed provider. **`nativeKnowledge` remains false by default.** The accepted legacy provider remains the production path and rollback option. P5, saved-only vault coverage and default-on rollout are not authorized by this implementation.

Implementation is complete for review. Semantic and lifecycle qualification passes; the tracked projection assertion remains failing, and a first-use large-result UI long task remains a measured responsiveness limitation. Neither is presented as a passing assertion or a guarantee of uninterrupted rendering.

## Production integration

| Component | Change |
| --- | --- |
| `src/application/facts-query-provider.ts` | Window-specific query handle over the shared P3 host; loaded eligibility, existing C2 budgets, native coordinate matching through the existing search worker, and freshness evidence. |
| `src/application/facts-backlinks.ts` | Existing `BacklinksService` contract over shared Facts; Document targets, linked mention grouping, bounded native context, coverage, cancellation and disposable subscriptions. |
| `src/application/document-application-capabilities.tsx` | Explicit provider selection. All Flint Windows in this application scope share one P3 host and resource contributions. Each Window has independent query/result/navigation handles. |
| `src/application/vault-knowledge.ts` | Delegates only search production when selected. Existing reference selection, picker, writing/removal, Undo/Redo and host activation remain authoritative. |
| `src/application/canonical-backlinks.ts` | Reuses the existing activation validator for derived results. In Facts mode this validator does not subscribe, run background queries or populate the legacy query cache. |
| `src/knowledge/{facts,collect-facts,transport}.ts` | Adds derived traversal ordinals, Cell counts and bounded reference context needed to preserve C2/C3 limits and snippets. Separates Document-reference incompleteness from unrelated Entity/style/tag diagnostics. Preserves an explicitly empty native title. |
| `src/knowledge/session.ts` | Loaded-only composition option, revision/scope generation checks and coalesced deferred consumer notification. Query cancellation does not cancel resource observation. Freshness callbacks do not retain their returned Facts arrays. |
| `src/application/document-vault.ts` | Identical successful discovery does not invalidate observers again. Changed/failed discovery and closure still notify; failure preserves uncertainty. |
| `src/application/native-knowledge-scope.ts`, `src/persistence/native-session.ts` | Read-only access to the existing binding map diagnoses missing bound resources even on a cold scope. This does not capture content, enroll resources, rebind or alter persistence. |
| `src/block-tree/registry.ts` | Read-only capability enumeration, including aliases, and registration/disposal notification keep the extraction policy current. No Facts dependency was introduced into `block-tree`. |
| `src/features/flint/query-results.tsx` | Cancellable DOM publication in groups of 40 for the existing bounded search/backlinks lists; no change to completed query evidence or navigation authority. |

There is no new membership/ownership index, persisted semantic cache, global catalog, repository serialization path or dependency graph. Native identity, binding, pair generation, persistence, relocation and ownership remain outside the provider. Arbitrary structural admission remains global; resource-local post-admission observation does not make repository construction or commits generally local.

The P4 backlinks adapter builds bounded query-local groups from the shared Facts annotations. This preserves the legacy traversal/mention/snippet limits and diagnoses unsupported targets throughout the inspected scope. It does not create a second retained Facts store or use an unrestricted incoming lookup to silently expand the public coverage contract.

## Lifecycle, authority and compatibility

* `features: {nativeKnowledge: true}` explicitly selects the replacement at editor/session construction. False selects the legacy search and `CanonicalBacklinks`. Both are not run continuously in production.
* The production Facts host is configured `loadedOnly: true`. Missing canonical resources remain unavailable; P3 saved hand-back and explicit saved enrollment are disabled in this composition. No worker Facts request or native Open is used to fill missing loaded coverage.
* Every repository or scope generation change expires old evidence immediately. Notification to panels is deferred/coalesced, keeping synchronous repository callbacks free of content traversal, hit removal and UI fan-out. A query spanning an edit, Undo branch, binding/scope change or disposal cannot publish a current result.
* Queries wait for the resource-owned observation cohort. Abandoning one query/Window does not cancel another Window's refresh. Last scope release/disposal retires contributions and cooperatively reclaims them.
* A search activation refreshes/revalidates through the existing application host. A backlink activation additionally uses the existing native mention/range validator. Only the invoking Window opens/reuses an occurrence, resolves its own Block and performs reveal/focus/selection restoration.
* Invalid, ambiguous or unavailable P1 evidence is not absence and cannot trigger a legacy fallback. Incomplete discovery, duplicate identity, pending operations and conflicting locations remain explicit omissions/errors.
* Reference writing/removal remains in the original native command paths. Entity mentions, Find/client-only annotations and Document backlinks remain distinct. Unresolved definitions are omitted with incomplete reference coverage; unrelated malformed tag/Entity/style payloads do not falsely claim that Document backlinks are missing.
* The existing limits remain: 200 available Documents, 5,000 traversal/text Blocks, 250,000 search Cells, 2,000,000 native text units, 256 query characters, 1,000 result passages/mentions, and bounded backlink snippet inspection. Facts' own resource/work/memory limits can make a resource unavailable earlier; that is explicit incomplete coverage, not permission to query an invalid boundary through the legacy reader.
* Native root/resource/Block identities, Cell versus UTF-16 coordinates, grapheme actionability, margins, inline-object boundaries, logical linked mention IDs, segment deduplication and traversal order remain authoritative. Titles and physical locations label targets; neither establishes identity.

The added Facts fields are ephemeral derived transport data. They are not authored fields, a native file-format change or persistent syntax/source associations. Saved lightweight, live observation and capture/full-decoder differential paths use the same semantic collector. The full decoder/capture paths remain test oracles, not production live fallbacks.

## Qualification

The final broad Stage A/native/B1/B1.1/B1.2/B2/C1/C2/C3/repository selection ran **623 tests: 621 passed, two failed**. One is the pre-existing `src/block-tree/commit-capture.test.ts:249` Solid development projection enumeration assertion. The other was a timeout in the existing server SIGKILL/recovery test at `relocation-receipt-displaced`. An immediate isolated rerun of the complete restart suite passed **10/10**, including that case in 647 ms, without code or timeout changes. The broad run is not represented as wholly passing, and the timeout's cause was not established. The earlier broad selection passed 605 with only the tracked projection assertion failing. Assertions were retained; no evidence requires changing repository mutation/ownership or persistence to implement P4. See the [final regression log](artifacts/native-knowledge-p4/regressions-final.log) and [restart rerun](artifacts/native-knowledge-p4/restart-rerun.log).

After the final shared-semantics and cold-binding corrections, the explicitly enabled focused selection passed **208 tests**. It includes actual Flint UI/server flows, Stage A transient hosting, P3 lifecycle, production live/capture parity, lightweight/full-reader parity and the worker/HTTP suite. An earlier run used a stale compiled worker after source edits; rebuilding through `npm test`'s existing pretest resolved that mismatch. One 10,001-annotation full-oracle test exceeded the default five-second harness timeout in a combined run; its isolated rerun passed in 0.72 seconds. The final selection used a 15-second test harness timeout with unchanged semantic assertions.

Differential fixtures compare canonical resource/root/Block IDs, native ranges, mention IDs, snippet text, ordering, available/discovered counts and completeness, rather than only result counts. They cover plain/text/standoff text, Unicode/combining characters, inline images, margins, linked segments, self/reference cycles, Entity distinction, unresolved/foreign definitions, opaque/nested omissions, target/title/location changes, cancellation, Undo branches, source disappearance, independent handles and result budgets. P1-invalid/ambiguous/unavailable resources are conservatively suppressed rather than made to imitate an unsafe legacy result.

The actual UI/server C3 gate passes **15 checks** with Facts enabled: real pointer/keyboard activation, unmounted source search, two-Window navigation, unchanged canonical state/History during queries, pair/directory relocation, rename, reference removal and Undo/Redo, restart/reopen, explicit unopened coverage, Grouping occurrence scope and browser IME commitment. See [browser evidence](artifacts/native-knowledge-p4/browser/browser-results.json) and the captured views in that directory.

The final actual UI/server **C2 gate passes 16 checks** with Facts enabled, including Unicode search from an unmounted resource, picker Escape/selection restoration, two-Window occurrence navigation, stale actions after editing/Undo, native Save/Open after server restart and external target removal. See [C2 evidence](artifacts/native-knowledge-p4/c2-browser/browser-results.json). The final result-list/backlinks UI and adapter selection passes **37 tests**, including replacement/disposal while publication is suspended. These selections overlap; their counts must not be summed as unique tests.

## Performance and memory

Evidence separates fixture generation/repository construction, post-admission observation, query matching/publication, synchronous native input and deferred refresh. The scale control mounts the real Flint search/backlinks panels with the production adapters over a deterministic read-only vault port. It uses real canonical repositories and `TreeCommands`. Actual server routes, native browser input and occurrence navigation are qualified separately above; these synthetic scale controls are not server startup measurements.

| Loaded resources | Repository construction | Initial boundary/observation/index work | Deferred refresh after input | Search + result publication | Facts/index charge |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 54 ms | 15.5 ms | 7.3 ms | 34.5 ms | 106,808 B |
| 10 | 264 ms | 66.6 ms | 47.7 ms | 32.4 ms | 1,068,080 B |
| 100 | 12,323 ms | 523 ms | 450 ms | 121 ms | 10,717,480 B |
| 150 | 29,012 ms | 757 ms | 631 ms | 152 ms | 16,097,880 B |

These initial adapter measurements are in [the final scale control](artifacts/native-knowledge-p4/browser-panels-final.json). Search returns 12/120/1,000/1,000 passages respectively; the latter two explicitly report the existing result cap. The table's query column predates the bounded DOM-publication correction described below. Panel-settling timings in the raw artifact include a deliberate 350 ms test wait; the table uses measured coordinator work instead of calling that wait startup latency.

Scope-wide reobservation remains visible: all eligible live resources are revisited after a revision. No dependency graph was added to hide this cost. The second Window caused **zero additional observations and zero extra retained-Facts charge** at every size. All Facts-backed backlinks controls returned four valid native mentions in both Windows.

Three fresh 10-resource input pairs with actual panels showed median per-edit times of **0.8/0.8, 0.8/0.7 and 0.7/0.8 ms** (legacy/Facts). There was no repeatable addition beyond the 0.1 ms review threshold. Across the scale controls, the mean synchronous invalidation callback was approximately 0.003–0.017 ms; occasional maxima reached 1.8 ms. Input-loop long tasks in the artifact include the intentionally synchronous batch of 100 edits and must not be attributed to a single keystroke or deferred provider slice.

The legacy large controls were not successful ready-backlinks measurements: at 100/150 resources the old scan hit its request deadline in the synthetic development host. Legacy search took approximately 5.3/13.9 seconds. These are reported as limitations of that baseline, not silently compared as equivalent successful backlinks results. A diagnostic stack sample was inside existing `resourceOwner`/`linkedDefinitionOwner` resolution in the legacy scan. That cache and repository admission were not redesigned.

The large-list check exposed repeatable 50–89 ms UI tasks when publishing 1,000 results at once. The bounded correction publishes 40 rows per task and cancels further publication when results are replaced or the panel closes. In the [final 150-resource control](artifacts/native-knowledge-p4/browser-150-batched.json), all three repeated searches finished displaying all 1,000 rows in 203–306 ms with **no >=50 ms long tasks**. The first search still recorded a **105 ms long task** and 295 ms completion time. Its exact attribution was not established; batching is therefore not claimed to eliminate every first-use rendering stall. Maximum warm heartbeat gaps were 35–54 ms. This is a remaining review limitation, not a reason to expand P4 into another scheduler or repository redesign.

That final control also returned four valid backlinks, added zero observations/retained charge for the second Window, measured a 1.3 ms median native edit, completed deferred refresh in 634 ms, cancelled a query in 0.2 ms and released its accounting charge to zero in 7.4 ms. The first-use observation cohort had no recorded >=50 ms long task. Cooperative slice targets remain scheduling targets, not frame-deadline guarantees.

Expired public results can remain held by the caller without retaining old Facts: WeakRef + explicit browser GC controls confirmed collection at 1/10/100/150 resources, while the old result stayed non-current. Last-consumer cleanup returned the accounting charge to **zero**, taking approximately 0.9–6.5 ms. The charge is a conservative accounting estimate, not measured V8 heap. Raw heap samples include JIT, repository, UI and collection timing; negative deltas after collection are not claimed as negative Facts memory. The accepted P1 legacy-constructor owner-cache lifetime caveat remains unchanged.

## Reproduction

Run `npm test` before worker-dependent unit/browser checks after editing shared Facts semantics; its pretest rebuilds the existing worker artifacts. Do not run `npm run build` concurrently with browser gates: the client build replaces `dist`, briefly removing the compiled worker used by their server. One final C3 attempt overlapped that replacement and correctly reported incomplete discovery; its subsequent isolated run passed all 15 checks.

```sh
P4_FACTS=1 npm test -- src/application/facts-query-provider.test.ts src/application/flint-knowledge.test.tsx src/application/flint-transient-proof.test.ts src/application/document-vault.test.ts src/application/native-knowledge-scope.test.ts src/knowledge src/qualification/native-knowledge/lightweight.test.ts src/qualification/native-knowledge/live-observer.test.ts server/native-knowledge.test.ts --maxWorkers=1 --minWorkers=1 --testTimeout=15000
P4_FACTS=1 PROOF_ARTIFACTS=artifacts/native-knowledge-p4/c2-browser node scripts/check-flint-c2-browser.mjs
P4_FACTS=1 PROOF_ARTIFACTS=artifacts/native-knowledge-p4/browser node scripts/check-flint-c3-browser.mjs
P4_COUNTS=1,10,100,150 node scripts/check-native-knowledge-p4-browser.mjs
P4_COUNTS=10 P4_ROUNDS=3 P4_WARM=1 P4_OUTPUT=browser-input-pairs.json node scripts/check-native-knowledge-p4-browser.mjs
P4_COUNTS=150 P4_MODES=true P4_WARM=1 P4_OUTPUT=browser-150-batched.json node scripts/check-native-knowledge-p4-browser.mjs
```

`npm run typecheck`, `npm run build` and `git diff --check` pass. Build output retains the existing bundle-size/data-age warnings. The benchmark's explicit enablement changes only its isolated qualification editor, not the application's default configuration.

## Review boundary

Production remains on the accepted legacy provider. Explicit opt-in is available for qualification and review. Default-on rollout requires separate authorization, even if this technical gate is accepted. P5 saved-only progressive coverage, SurrealDB, `.ink` compatibility, persistence changes and generalized repository admission work remain outside P4.
