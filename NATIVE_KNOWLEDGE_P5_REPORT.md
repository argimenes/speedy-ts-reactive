# Native Knowledge P5 — Saved coverage and explicit result Open

P5 implementation is complete for integrated review. `nativeKnowledge` now defaults to **true**, as authorized for the accepted loaded-resource provider. `nativeKnowledge=false` retains the legacy composition. Progressive saved coverage is separately selected by **`nativeKnowledgeSaved:true`** and remains off in normal composition pending this review. Neither switch changes native files, bindings, authored state or Workspace data.

The functional result is progressive search/backlinks from native files without background admission, followed by an explicit, verified Open of only the selected result source. The provider remains read-only. Large-vault UI and explicit Open costs remain material review limitations; this report does not claim the P4 first-use stall or general admission cost is fixed.

## Components and authority

| Component | Responsibility |
| --- | --- |
| `server/native-saved-scope.mjs` | Bounded, ephemeral verified discovery leases and worker extraction batches. It delegates filesystem/identity/pair/operation semantics to `NativeVaultStore`. |
| `server/native-vault-store.mjs` | Adds a read-only filesystem evidence fence covering directory entries, native/projection files, pair metadata and store-wide relocation records. |
| `server/native-knowledge-routes.mjs` | Adds `/vault/facts/begin`, `/batch` and `/release`; preserves the P2 single-resource endpoint for its existing independent use. |
| `src/application/saved-facts-client.ts` | One shared read scope and bounded response buffer per active vault; bounded transport decode, cancellation and explicit failure/retry. |
| `src/knowledge/session.ts`, `index.ts` | Progressive publication under existing epochs; live suppression, conservative reobservation, independent scope verification deadline and resource deadlines. |
| `src/application/facts-query-provider.ts`, `facts-backlinks.ts` | Include eligible saved contributions, retain source evidence privately, and report incomplete coverage using existing C2/C3 contracts. |
| `src/application/saved-result-activation.ts` | Host-owned selected-result validation and expected-admission navigation ticket. No Open capability enters the provider. |
| `src/application/document-application-capabilities.tsx`, `vault-knowledge.ts` | Invoking-Window Open, live passage/mention validation and existing reveal/focus path. |
| `src/persistence/native-session.ts` | Verified selected Open and read-only selected-file verification, retaining existing native admission/baseline/dependency guards. |
| Flint views / configuration | Truthful loaded versus saved/live coverage labels and the separately gated composition. |

The implementation introduces no persistent semantic cache, database, ownership/membership graph, filesystem watcher, enrollment catalog, Workspace schema or automatic file repair. `.mutable.json` stays authoritative. Markdown is neither an input to search nor an identity/binding oracle. `.ink` compatibility remains outside this stage.

## Verified progressive read protocol

1. Existing managed discovery supplies the complete vault snapshot. The client supplies its SHA-256 signature and explicit extraction policy when beginning a read scope.
2. The store captures a filesystem evidence fence, performs **one** authoritative discovery for that scope, compares its result with the caller snapshot and verifies the fence again. Incomplete discovery, duplicates, unknown candidates or pending operations cannot establish a scope.
3. The resulting opaque lease retains only bounded discovery rows and read evidence. It is not a storage catalog or an ownership authority. Leases are process-local, expire automatically, and cannot survive server restart.
4. Each batch requests at most **32** identities from that verified snapshot. The store checks the scope fence before and after the batch and checks each requested native file's stamp/hash around worker extraction. No per-resource full discovery or P2 `/vault/facts` request is used for progressive population.
5. The worker returns the existing Facts wire grammar. The client validates/decode-publishes individual candidates cooperatively through the P3 index and its unchanged **256 MiB** retained-Facts accounting budget.

The fence includes device/inode, size, modification/change timestamps and directory metadata. An added duplicate, replacement, same-ID external move, symlink, projection edit, receipt/intent change or relocation-record change expires the epoch. Restoring an mtime does not restore ctime/inode evidence. This is verified observation, **not** an atomic filesystem snapshot or a promise to detect external changes without Refresh/action reads.

The scope fence deliberately revisits filesystem metadata between batches. Its cost is proportional to the inspected tree per batch; it is not resource-local filesystem discovery. Increasing the initial eight-row batch to 32 amortizes that evidence work without reducing the before/after checks or raising the response/Facts limits. The earlier eight-row measurements are retained as comparison evidence.

Limits remain explicit: eight pending/completed server read scopes, a ten-minute lease, the store's existing scan limit, a 100,000-entry fence limit, 32 requested resources per batch, 3 MiB aggregate wire response payload, 2 MiB per wire candidate and 4 MiB browser response work. The existing worker has one active job, its bounded queue/input budgets and its own deadline. The coordinator gives scope verification a separate 90-second deadline and retains the 10-second per-resource deadline. Scope verification no longer consumes the first resource's extraction allowance. All budget failures yield incomplete/unavailable coverage.

Worker/resource extraction failure omits that resource with a diagnostic; failure of the verified scope withdraws uncertain saved contributions and expires old results. Eligible live contributions can be re-established independently. Explicit vault Refresh retries a failed scope even when the resulting tree is unchanged. Cancellation and server restart never convert unknown evidence into an empty/complete vault.

## Live authority, lifecycle and query semantics

Canonical presence immediately suppresses saved results through the existing repository/scope epoch before observation finishes. Dirty, incomplete, ambiguous or invalid live resources cannot expose an older saved generation. Live resources are processed before saved candidates. Missing canonical presence allows hand-back only after current storage/binding/hash/policy verification and a second absence check.

Multiple Windows share the host, contribution store, scope and saved extraction. Their query/activation handles remain independent. Query cancellation does not cancel another Window's resource work. Last-scope release aborts staged work and releases derived state; re-acquisition creates fresh evidence. Repository/session replacement invalidates old tokens. There is no per-resource dependency graph: conservative aggregate reobservation remains visible.

Progressive additions may enlarge an otherwise unchanged scope without invalidating the already inspected portion of a partial query. Repository, binding, discovery or policy changes still expire that query. No partially validated resource is published. An incomplete query explicitly says that zero results do not establish absence.

Existing query limits remain in place, including 200 available Documents per query and 1,000 result passages/mentions. Thus an index can retain 1,000 resources while a particular C2/C3 request remains capped and incomplete. This is not presented as complete whole-vault search. Background resource coverage and per-query coverage are distinct. Reference creation/removal, the loaded Document picker, Entity semantics, linked grouping and native Undo/Redo remain in their existing paths.

## Explicit saved-result activation

The host checks the result's freshness, vault signature, policy, source identity, current location/hash, binding and operation state. It refreshes discovery before acting. It reuses an eligible canonical resource or invokes native Open for that one source; it does not admit other candidates.

Verified Open checks the returned native identity/hash and refreshes discovery again **before admission**, detecting a duplicate introduced while the Open response was in flight. An intervening repository edit or unrelated native operation rejects the activation. Only the selected synchronous admission supplies the new revision for its private navigation ticket. Other old results remain stale.

After admission, search activation observes current live semantics, resolves the exact root/Block and rematches the selected native passage. Backlinks use the existing canonical logical-mention validator. Discovery/selected bytes are checked again around asynchronous mounting/reveal, and the ticket is checked before focus/selection restoration. Failure is explicit; it does not pick a nearby range, use another Window or refresh unrelated result permissions.

A bounded native Open correction was necessary for verified hand-back: a retained binding after admission Undo is not proof that the canonical resource still exists. Explicit Open now re-admits a missing resource using the existing atomic native admission path; ready canonical resources are reused, and invalid/ambiguous boundaries are rejected. It neither reassigns ownership nor introduces unloading/deletion policy. The original pair baseline and admission/dependency guards remain authoritative.

## Qualification results

**Broad integrated regression: 655 passed, one known pre-existing failure (656 tests, 50 files).** The retained failure is `src/block-tree/commit-capture.test.ts:249`, the accepted Solid projection enumeration issue. The unchanged SIGKILL/restart/recovery suite passed **10/10** in this run. The selection includes Stage A/transient occurrences, native B1/B1.1/B1.2/B2, managed C1 discovery/relocation/restart, C2/C3, repository P1, worker/shared Facts P2, lifecycle P3 and P4 differential tests, plus the new P5 cases.

Explicit legacy rollback checks passed **22/22** ([log](artifacts/native-knowledge-p5/rollback-regressions.log)). Final focused checks passed **38/38**, including the server scope bounds/expiry, shared saved lifecycle, actual host activation/admission and native-session regressions. **Build, both TypeScript projects and `git diff --check` pass.**

Real Chrome/UI/server gates:

- **C2 default-on loaded: 16/16**; [results](artifacts/native-knowledge-p5/c2-browser/browser-results.json).
- **C2 explicitly saved-enabled: 16/16**; [results](artifacts/native-knowledge-p5/c2-saved-browser/browser-results.json).
- **C3 explicitly saved-enabled: 16/16**; [results](artifacts/native-knowledge-p5/c3-browser/browser-results.json), including keyboard activation of a previously unopened source after server/repository restart, two-Window navigation, Grouping and IME.
- All three runs recorded no uncaught browser exceptions. Screenshots and representative native files accompany their result JSON.

[Broad regression log](artifacts/native-knowledge-p5/regressions.log), [focused log](artifacts/native-knowledge-p5/focused-regressions.log), [build](artifacts/native-knowledge-p5/build.log), [typecheck](artifacts/native-knowledge-p5/typecheck.log). Browser correctness reruns ran concurrently with final functional checks; the latency runs above and the separate extraction control ran independently.

New coverage includes read-only stores, shared batches without Open/History/binding changes, rich worker semantics, resource and response budgets, failed scope suppression/retry, duplicate identity, external move/removal/replacement, mtime restoration, symlinks, pair/operation changes, server restart, cancellation and lease expiration. The UI gate covers saved search/backlink activation, native range restoration, two Windows, edits during Open, changed bytes/duplicate creation during Open, dirty live precedence, admission Undo/hand-back/reopen and owned-external ownership admission failure.

The accepted Solid projection enumeration assertion remains retained as a failing pre-existing regression. The P4 SIGKILL/recovery timeout is also retained in the historical report; an unchanged rerun passed then. No assertion is removed to make this release appear green.

## Browser performance and memory

Measurements use real managed server routes, the actual Flint UI and default-on loaded Facts with saved coverage explicitly enabled. Fixtures are real native files with text, Unicode, standoff properties and references. Discovery, scope verification, worker work, transport/decode, index publication, explicit Open, input and cleanup are reported separately. Synthetic extraction controls are separate from product startup.

The final unprofiled run used Chrome 154 on this Apple M1 host, 32-resource batches, two Flint Windows, and the independent scope-verification deadline. Values below are observations from this run, not latency guarantees. [Full measurements](artifacts/native-knowledge-p5/browser-final.json) include heartbeat/frame gaps, all phases and cumulative metrics.

| Real Flint measurement | 100 resources | 1,000 resources |
| --- | ---: | ---: |
| Initial vault discovery | 609 ms | 3,441 ms |
| First useful saved coverage, after discovery | 583 ms; 14 ready | 4,218 ms; 16 ready |
| Query during progressive coverage | 103 ms; 168 hits | 51 ms; 192 hits |
| Remaining wait for full indexed coverage after partial-query phase | 251 ms | 11,521 ms |
| Cold 1,000-hit query/publication | 115 ms | 178 ms |
| Three warm queries | 96 / 116 / 97 ms | 130 / 135 / 137 ms |
| Explicit selected-result Open and reveal | 2,216 ms | **20,920 ms** |
| Longest task during explicit Open | 321 ms | **4,315 ms** |
| Input command median; during rebuild | 18.6; 18.4 ms | 18.8; 19.7 ms |
| Remaining live/saved reobservation after input | 506 ms | 8,889 ms |
| Explicit Refresh; subsequent rebuild after input | 321; 774 ms | 3,354; 13,378 ms |
| Retained Facts/index accounting charge | 10,591,020 B | 106,306,200 B |
| Browser JS heap with UI/repository/index retained | 37,910,692 B | 321,665,724 B |
| Browser JS heap after disposal/GC | 21,563,204 B | 21,937,016 B |
| Scope cleanup; final Facts charge | 29 ms; 0 B | 469 ms; 0 B |

The useful-coverage and remaining-completion phases bracket a query and include harness polling; their sums are not an isolated extraction benchmark. Both fixtures reached complete **index resource coverage**, without background bindings or admission. The query retained its existing 200-source/1,000-result limits and truthfully reported incomplete result coverage. Acquiring the second Window left saved-read counts and retained charge unchanged (100→100 and 1,000→1,000). Selecting a hit admitted exactly one resource, restored range 24–33, and left the other Window's occurrence unchanged. Cancelled queries published zero results.

No >=50 ms task occurred during completed cold/warm search publication, the measured input phases, or remaining background extraction/rebuild phases. The 1,000-resource discovery and partial-coverage phases did produce 215 ms and 474 ms tasks respectively. The large explicit Open task is a **material integrated-release limitation**, not a passing responsiveness claim.

Initial saved-cohort phase accounting is separately available:

| Component (nested timings must not be added) | 100 | 1,000 |
| --- | ---: | ---: |
| Verified scope discovery/fences | 371 ms | 3,765 ms |
| Coordinator scope preparation | 381 ms | 3,859 ms |
| Extraction requests, excluding scope begin | 4 | 32 |
| Batch metadata fences | 68 ms | 6,122 ms |
| Batch native reads/hashes | 61 ms | 1,035 ms |
| Worker execution / queue | 199 / 1.6 ms | 2,436 / 14 ms |
| Worker validation / Facts collection | 147 / 41 ms | 1,973 / 323 ms |
| HTTP round-trip incl server work and scope begin | 768 ms | 14,348 ms |
| Browser Facts decoding | 12.5 ms | 119.6 ms |
| Index publication | 110 ms | 1,141 ms |
| Response bytes incl scope/batch envelopes | 1,623,573 B | 16,432,442 B |
| Sampled worker / server heap peaks | 13,531,024 / 14,876,560 B | 27,588,480 / 30,690,448 B |

Heap peaks above are sampled at extraction boundaries, not exhaustive process high-water marks. The 256 MiB budget accounts for retained Facts/index representation; it does **not** cap total browser/DOM/repository heap. Disposal measurements leave the application/runtime loaded and therefore do not approach an empty-process heap.

The earlier [eight-row run](artifacts/native-knowledge-p5/browser-integrated.json) is preserved. At 1,000 resources it spent 27.1 seconds in saved HTTP work and 88.1 seconds awaiting post-input coverage, exposing scope verification consuming a resource deadline. The bounded correction separates that deadline and amortizes unchanged evidence checks over 32 resources; the final corresponding observations were 14.3 and 8.9 seconds. These are repeated engineering runs, not a controlled statistical speedup claim. Metadata fencing remains a substantial cost, and conservative invalidation can require another cohort after editing.

### Separate raised-budget extraction control

The unchanged P2 harness was rerun with matched direct encode/decode publication, one worker, fresh processes, and warm files. Its sink is a qualification `Map`, **not** the production index or vault-startup path. Production Facts, directory, response and resource limits were not raised.

| Synthetic resources | Worker end-to-end | Direct matched control | Read/hash | Validation | Facts | Wire encode | Decode/Map publish | Retained sink heap delta |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 100 | 427 ms | 240 ms | 27 ms | 202 ms | 44 ms | 7 ms | 20 ms | 2,923,960 B |
| 1,000 | 4,438 ms | 3,134 ms | 454 ms | 2,607 ms | 541 ms | 81 ms | 233 ms | 26,381,848 B |
| 10,000 | 20,754 ms | 20,486 ms | 3,475 ms | 12,304 ms | 1,926 ms | 500 ms | 1,105 ms | 261,385,712 B |

The 10,000-resource run produced 144,709,000 wire bytes. Sampled worker/server heap peaks were 28,608,400 / 271,817,560 B; released server heap was 4,870,184 B. Its Node heartbeat p95/max was 0.8/73.8 ms; the 1,000-resource control also had a 113.5 ms maximum. These are Node scheduling observations, not browser input measurements. No managed 10,000-resource startup or production-budget completion claim follows from this control.

The same harness measured managed discovery independently: full-decoder versus worker inspection was 10,201/407 ms for 100 and 88,131/2,848 ms for 1,000, with equal complete resource counts. Worker discovery read/hash/inspection totals were 76/7/260 ms and 686/46/1,607 ms respectively. The full decoder remains an independent oracle; it is not the production saved-reader fallback.

Raw controls: [100](artifacts/native-knowledge-p5/extraction-control/benchmark-100.json), [1,000](artifacts/native-knowledge-p5/extraction-control/benchmark-1000.json), [10,000](artifacts/native-knowledge-p5/extraction-control/benchmark-10000.json). These separate fixtures and phases should not be compared directly with Flint's retained index charge or summed with its browser timings.

### Remaining performance watchpoints

The original P4 unexplained first-use 105 ms task remains tracked. Initial integrated P5 runs did not reproduce a >=50 ms task during the completed 1,000-hit search publications, but this does not establish that the original task is fixed.

Other large-vault stalls did reproduce. The 1,000-resource CPU profiles identify repeated existing `ApplicationVault.state`/vault-tree calculation and Solid row cleanup during discovery and native binding changes. Explicit Open also includes existing full native decoding, global admission and binding work. In one profiled activation, approximately 2.48 seconds of inclusive sampled work was under `NativeDocumentSession.openResource`, including approximately 1.26 seconds under `admitNative` and 1.12 seconds under binding. These nested values are not additive. Profiles also show layout and GC; no single number is attributed wholly to Facts extraction.

Evidence: [profile summary](artifacts/native-knowledge-p5/profile-summary.json), [discovery profile](artifacts/native-knowledge-p5/discovery-1000.cpuprofile), [partial-coverage profile](artifacts/native-knowledge-p5/partial-1000.cpuprofile), [activation profile](artifacts/native-knowledge-p5/activation-1000.cpuprofile). The profiled run is diagnostic, not the latency baseline.

The smallest proposed follow-up is to memoize the existing vault-state derivation and preserve stable keyed row presentation, then remeasure its remaining initial list/layout cost. It belongs to Flint's existing vault UI, not a new Knowledge cache or repository subsystem. This correction is **not implemented here**. General native admission remains global. The existing projection development-wrapper enumeration issue, very-large-Block editing cost and legacy-constructor owner-cache caveat remain separately tracked.

## Reproduction

The browser scripts use isolated temporary stores and server processes, clean them up, and retain only qualification artifacts. The normal application composition uses `nativeKnowledge:true, nativeKnowledgeSaved:false`; the saved browser gates set only the latter flag explicitly. `P4_FACTS=0` selects the legacy test composition.

```sh
npm run typecheck
npm run build
P4_FACTS=1 npx vitest run src/block-tree src/qualification/native-knowledge src/qualification/native-b1 src/qualification/native-b2 src/knowledge src/application/jet-stage-a-proof.test.ts src/application/flint-transient-proof.test.ts src/application/canonical-backlinks.test.ts src/application/facts-query-provider.test.ts src/application/flint-knowledge.test.tsx src/application/flint-saved-knowledge.test.tsx src/application/document-vault.test.ts src/application/flint-vault.test.tsx src/application/native-knowledge-scope.test.ts src/application/native-saved-scope.test.ts src/features/flint/backlinks-view.test.tsx src/features/flint/query-results.test.tsx src/history/stage-c-gates/portable.test.ts src/history/stage-c-gates/resource.test.ts src/persistence/native-session.test.ts src/persistence/native-vault-session.test.ts server/native-document-store.test.mjs server/native-vault-store.test.mjs server/native-vault-restart.test.mjs server/native-knowledge.test.ts server/native-saved-scope.test.ts --maxWorkers=1 --minWorkers=1 --testTimeout=30000
P4_FACTS=0 npx vitest run src/application/flint-knowledge.test.tsx src/application/canonical-backlinks.test.ts --maxWorkers=1 --minWorkers=1 --testTimeout=30000
PROOF_ARTIFACTS=artifacts/native-knowledge-p5/c2-browser node scripts/check-flint-c2-browser.mjs
P5_SAVED=1 PROOF_ARTIFACTS=artifacts/native-knowledge-p5/c2-saved-browser node scripts/check-flint-c2-browser.mjs
P5_SAVED=1 PROOF_ARTIFACTS=artifacts/native-knowledge-p5/c3-browser node scripts/check-flint-c3-browser.mjs
P5_COUNTS=100,1000 P5_OUTPUT=browser-final.json node scripts/check-native-knowledge-p5-browser.mjs
P2_ARTIFACTS=artifacts/native-knowledge-p5/extraction-control P2_MATCHED_CONTROL=1 node scripts/check-native-knowledge-p2.mjs 100 1000 10000
```

Use `P5_COUNTS=1000 P5_PROFILE=1 P5_OUTPUT=browser-profile.json` with the P5 browser script to capture the three diagnostic CPU profiles. Run latency/control commands separately from other CPU-intensive qualification.

## Review boundary and rollback

Loaded Facts are now the authorized default. Saved coverage remains explicitly enabled only for qualification/review. `nativeKnowledge=false` returns to the legacy loaded-only composition on host construction; disposing the Facts host removes derived state only. No native file, binding, authored data or Workspace migration is needed. The legacy provider and switch remain present.

This report stops at integrated P5 review. It does not authorize saved-coverage default rollout, removal of the legacy provider, a broader UI/admission rewrite, SurrealDB ingestion, persistent caching or further feature stages.
