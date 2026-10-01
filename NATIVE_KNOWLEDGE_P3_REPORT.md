# Native Knowledge P3 Implementation and Qualification Report

**P3 is complete for review within its bounded qualification scope.** Stage P3 implements live canonical observation and a disposable, resource-owned Knowledge lifecycle. The accepted C2/C3 providers remain the product search/backlinks path. P3 is available through an explicit host factory and qualification/shadow composition; P4 has not begun and no production rollout flag has changed.

This report distinguishes repository admission, post-admission observation, derived index work and product interaction. Arbitrary structural repository admission remains global. No repository mutation, ownership, persistence or navigation architecture was changed to make this gate pass.

## Production components

| Component | Responsibility |
| --- | --- |
| `src/knowledge/live-observer.ts` | Stateless cooperative P1 boundary audit and canonical Facts collection. |
| `src/knowledge/session.ts` | One repository subscription, shared scope/resource jobs, contribution eligibility, cancellation, debounce, deadlines and disposal. |
| `src/knowledge/contribution-state.ts` | Narrow read-only discovery, native-session, extraction-policy and verified-saved capabilities; hand-back guards. |
| `src/knowledge/index.ts` | Ephemeral Facts, tag and incoming-mention indexes; epoch-filtered queries; cooperative staged publication and reclamation. |
| `src/knowledge/scheduler.ts` | Cooperative work accounting, task scheduling and conservative retained-memory accounting. |
| `src/application/native-knowledge-scope.ts` | Explicit host factory connecting existing vault/native-session notifications and the P2 verified single-resource saved route. |
| `src/application/document-vault.ts` | Discovery replacement/closure subscription. Failed Refresh preserves known rows and publishes incomplete discovery. |
| `src/persistence/native-session.ts` | Immutable binding/pending/admission/closure evidence and notifications. Evidence access does not call the pair's capturing `dirty` getter. |
| `src/knowledge/collect-facts.ts` | Shared collector now accepts cooperative steps, bounded authored-value cloning and asynchronous snippets. Saved and live semantics remain shared. |

Qualification-only observers, capture/full-decoder adapters, performance controls and fake ports remain outside production. No qualification proof cache or whole-repository scan was promoted. Existing `block-tree` code has no Facts/Knowledge dependency and was not modified in P3.

The observer borrows canonical records under revision/token checks. P1 audits the actual Cells and ownership. A temporary Block-only helper context lets existing linked-definition helpers resolve Block ancestry without building another Cell-owner cache. Standoff text reads the original canonical Cells through an inline adapter; helper shells never escape into persistence or admission. Nested owned Documents retain their separate resource boundary. Temporary traversal sets are discarded after observation, not maintained as a second membership graph.

## Lifecycle and authority

A host shares one scope contribution between Window/query leases. Acquiring a second lease does not create another repository subscription or observation. Releasing a query or one Window lease does not cancel another consumer's resource job. Last-lease release immediately makes the scope ineligible and schedules cooperative reclamation. Disposal is awaitable and idempotent, including disposal initiated by native-session shutdown. Repository replacement requires a new factory; tokens and contributions are not transferred.

Every repository revision expires query eligibility immediately. The synchronous callback changes scalar epochs, aborts at most the active job and coalesces a timer. It does not read canonical contents, capture, enumerate a resource, remove hits or fan out extraction through UI subscriptions. Structural/scope changes conservatively invalidate all relevant contributions. No proof survives a repository revision merely because a different resource was edited.

There is one traversal at a time, a 100 ms trailing debounce and a one-second maximum-wait attempt. Continuous editing may keep coverage pending; the provider does not publish an unstable revision. Initial scheduling is conservative: a settled refresh reaudits/reobserves the active live slots, including unrelated resources. The aggregate cost is reported below. It is not advertised as an O(1) whole-vault refresh.

Canonical presence suppresses saved Facts even while live work is pending, incomplete, invalid, ambiguous, cancelled or failed. Failed live work never exposes an older saved generation. Unresolved linked definitions produce searchable partial live Facts with an explicit diagnostic and omitted untrustworthy mentions. Eligibility does not confer serialization permission.

Hand-back requires all of these checks:

1. Current cooperative boundary evidence says **missing**, not invalid, ambiguous or unavailable.
2. No native Open/admission, pending pair operation, relocation/recovery or closed session prevents eligibility.
3. Discovery is complete, unique, native and eligible within this scope.
4. Any retained binding agrees with the discovered location and native hash. An external same-ID move is not adopted.
5. The store verifies current native bytes, identity, hash, uniqueness and pair/operation evidence through the existing P2 route.
6. Resource, location, hash and extraction-policy evidence still match; a second boundary read confirms absence; repository/scope/job epochs are unchanged through publication.

A saved-only contribution may be requalified after a classified unrelated inline edit and a fresh absence audit, when scope and structural evidence have not changed. This does not hand a formerly live resource back to disk. There is no unload operation and no saved fallback on uncertainty.

The P2 single-resource route is used only for an explicitly requested saved contribution or verified hand-back. P3 does not call it once per discovered file to build progressive vault coverage. Discovered saved-only resources without that explicit enrollment remain visibly unavailable; P5 retains responsibility for progressive saved coverage.

## Work and memory bounds

Defaults are **256 MiB charged retained Facts/index memory per host**, eight scopes, 10,000 resource slots, one active resource job and a ten-second resource deadline. WorkSlice has finite visit limits, a 256-step/4 ms scheduling target, and cancellation checks. Other explicit bounds include two million text units per Block, the existing 10,000 Block/annotation collection limits, a 256 KiB charge limit before an indivisible annotation-value clone, a 4 MiB saved-response byte limit and a two-million-unit inner browser Facts wire limit. P2's worker limits are unchanged.

These are derived-work limits. Exceeding one reports incomplete/unavailable coverage; it neither changes native state nor weakens canonical presence. Unsupported/oversized annotation observation cannot silently simplify the authored value. Rich values within the bound still use structured cloning and the existing authored-value transport grammar. Non-plain objects with hidden storage (such as Map/Set) and enormous sparse arrays are rejected before an unaccounted clone; this does not mutate their canonical source. A supplied boundary must also belong to the requested resource, not merely the current repository revision.

Accounting charges Facts, strings, object/array slots and index handles conservatively. Retired/staged entries remain charged until their actual cooperative removal. Publication becomes query-eligible only after the entire staged contribution is ready. A query spanning a repository/scope/publication change rejects. Cancellation of a query does not cancel the resource's observation.

At the unchanged default budget, the 10,000-contribution pressure control admitted **2,563**, charged **268,341,660 bytes**, then reported the memory-budget limit. Cleanup returned the charge to zero. This deliberately conservative accounting is not a claim that measured V8 heap equals the charge, nor a production 10,000-note startup result. The canonical repository, worker heap, transport scratch and references retained by query callers are separate from host-owned retained Facts. P4 adapters must discard expired query sources rather than accumulate their own snapshots.

## Correctness and product regression

The broad selection passed **575 tests**, with **one failure**: the independently documented `commit-capture.test.ts` assertion that the Solid development projection does not enumerate the whole graph. Its assertion remains intact. The failure was not introduced or reclassified as passing by P3.

After scheduling/deadline/disposal refinements and the final boundary/value-budget guards, the focused production observer, state-machine and real host/HTTP tests passed **58/58**. Build and TypeScript checks passed. The final verification record is in `artifacts/native-knowledge-p3`.

Coverage includes live versus capture/full-decoder/lightweight parity on the real rich native producer fixtures; Unicode and inline images; plain-text/text/standoff parity; linked and unresolved definitions; retained definitions and margins; owned-external/nested Documents; ownership/identity rejection; opaque/application policy; edits/Undo/Redo; cancellation and stale tokens; every hand-back precondition; worker failure; policy/discovery/binding/admission changes across asynchronous work; timed-out reads; staged index cancellation; resource and memory budgets; repeated generations; repository replacement; and independent lease closure.

Assertions cover no live capture/encoding/snapshot, no hidden projection, no query History mutation, no callback-time boundary traversal/hit deletion, no saved fallback after failure, and zero charged memory after awaited disposal.

The **actual Flint UI/server shadow run passed 18 checks**. Existing C2/C3 panels remained active while P3 observed their canonical resources. Two Flint Windows shared the two live contributions, P3 backlinks agreed in both query leases, independent closure preserved the other consumer, native reference Undo/Redo and pair/directory relocation remained correct, and restart/reopen/focus/navigation behavior passed. No uncaught browser exception was recorded. The fixture native files and two captured views are included under `artifacts/native-knowledge-p3/ui`.

## Browser responsiveness and input

Chrome 154 on this Mac was used with isolated servers/profiles and no user vault. The 1/10/100/150 controls use actual canonical repositories and TreeCommands; “search” means preparation of the existing matching engine's Facts inputs, not a new product search adapter. The actual mounted two-Window/panel run is separate. This avoids claiming that P3 has already performed P4's replacement-provider UI gate.

### Cold observation after admission

All ordinary contributions were ready, with complete coverage.

| Loaded resources | Fixture decode plus repository construction ms | Full deferred refresh ms | Boundary audits ms | Facts observation ms | Index insertion ms | Charged Facts MiB |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 75.1 | 7.3 | 2.7 | 2.1 | 1.2 | 0.10 |
| 10 | 706.1 | 44.3 | 27.9 | 8.3 | 7.1 | 1.00 |
| 100 | 14327.6 | 399.6 | 268.5 | 67.0 | 60.2 | 10.02 |
| 150 | 30356.9 | 535.1 | 348.0 | 83.8 | 95.7 | 15.05 |

The large construction figures include the deliberately rich fixture's native decode/materialization and global repository initialization; they are neither provider refresh nor vault startup measurements. P1's resource-local post-admission contract is unchanged. Refreshing N live contributions still performs N resource-local audits and collections.

There were **no >=50 ms provider long tasks** in ordinary cold refresh or the prolonged-edit controls. Final cold-refresh heartbeat gaps were 5.7–5.9 ms and frame gaps approximately 16.7–16.8 ms. Query preparation/backlinks lookup was at most 0.2 ms in these controls, separate from deferred rebuilding. Settled 150-resource rebuilds took roughly 401–448 ms. Fifteen further editing/refresh cycles kept one charged generation rather than accumulating one per edit.

The synchronous invalidation callback averaged at most approximately **0.0067 ms per invalidation** across the initial controls; maximum recorded samples were approximately 0.1 ms at the browser clock's resolution. No repository traversal or index deletion occurs there.

The mounted two-Window three-pair input differences were approximately **0.0, -0.1, +0.1 ms**, below the repeatable-increase review threshold. The long synthetic 150-resource series showed upward timing drift in both modes as the same repository accumulated thousands of edits; its raw search/backlink median differences crossed 0.1 ms. A matched fresh-repository follow-up is recorded separately rather than dismissing those measurements or presenting callback timing as the whole input cost.

The matched follow-up reconstructs each repository from the same fixture, warms 100 edits and measures the next 200. Three enabled-minus-disabled median differences were **−0.1/0/0 ms** for no query, **+0.1/0/0 ms** for search preparation and **0/0/0 ms** for backlinks. Thus the initial >0.1 ms increase did not reproduce at matched repository ages. This supports input-path qualification without claiming to diagnose or repair the underlying long-run journal/History timing drift. Repository construction alone was approximately 19–20 seconds per comparison and remains outside these typing numbers.

### Large resources and scheduling

| Control | Cold refresh ms | Provider-only replacement long tasks | Max cold heartbeat gap ms | Facts completeness |
| --- | ---: | --- | ---: | --- |
| Approximately 49,600-Cell paragraph plus normal rich Blocks | 266.1 | None in four replacements | 5.9 | Complete |
| 10,001-Block resource | 104.2 | None in four replacements | 10.7 | Explicit Block-budget diagnostic; partial Facts |

The Block-heavy observer recorded an 8 ms slice. Four milliseconds remains a target rather than a hard deadline; P1 semantics were not changed to fit it. Provider-only replacement maintained approximately 16.7–16.8 ms frame gaps. The separate 49,600-Cell **editing baseline with P3 disabled** took 75.8–82.6 ms and produced long tasks. That underlying large-Block edit cost is not concealed inside a provider success claim and was not redesigned here.

An initial `scheduler.yield()` experiment kept continuations runnable but delayed timers. P3 now schedules background `postTask` continuations where available, with a timer fallback. The final measurements above demonstrate the resulting timer/frame service. This changes scheduling only, not audit semantics. The original trace remains available for comparison.

The pressure control initially recorded a 67 ms task when the measurement also included fixture construction. A follow-up installed the observer after fixture construction: filling the unchanged budget took about **1.64 seconds**, cleanup about **9.5 ms spread cooperatively**, and recorded **no provider long tasks**. The original inclusive trace is retained; construction is not silently attributed to index work.

## Worker lifecycle and memory

The real managed-store/worker control completed six cancellation/recreation cycles through the P3 coordinator. Each cancellation left zero effective saved Facts; each retry obtained fresh verified saved evidence. Cancellation plus verified recovery took approximately **58–64 ms**. The worker, not the coordinator, performed saved semantic validation/extraction. End-to-end saved time includes the conservative store discovery before/after verification, not just extraction CPU.

Representative recovered worker phases were approximately 2.28 ms validation, 1.37 ms Facts collection, 0.085 ms encoding and 4.03 ms round trip; restart/startup and separate inspection costs are recorded independently in `worker-lifecycle.json`. Worker heap samples were roughly 6–8 MiB. Server post-GC heap rose from about 5.57 MiB to 5.80 MiB and levelled at the final samples. Closing the facility and host left zero charged Facts. No persistence operation was performed by Knowledge.

Eight acquire/dispose cycles over a stable ten-resource repository returned the charge to zero every time. Post-GC browser heap settled around **11.63 MB decimal**; the last five samples varied by about 5 KB rather than retaining a contribution per cycle. These figures include the repository/runtime; the charge tracks only host-owned Facts/index entries.

The realistic `ReactiveEditor` constructor test did **not** retain its supplied legacy `RepositoryState` after the caller released it (verified with a WeakRef and explicit browser GC). Keeping that input deliberately alive retained about 49 MB extra at 100 resources; dropping it released the extra graph/cache retention while the editor stayed alive. This confirms the conditional P1 caveat, not a need to flush or redesign `resourceOwner`. Editor disposal returned heap close to its warmed baseline. It does not prove that every future application host will release its constructor inputs; that remains a host-lifecycle concern.

Heap deltas immediately around cold observation are not a clean Facts-only measurement: some constructor/cache scratch becomes collectible at the same time. The artifacts therefore retain total heap, charge, post-release and post-GC figures separately rather than reporting negative heap deltas as a memory saving.

## Remaining boundaries and review decision

- Current C2/C3 still owns product queries and navigation/revalidation. P4 remains separately gated; no provider replacement or default-on authorization is implied by this report.
- P5 must supply progressive saved coverage without N calls to the conservative single-resource route.
- Conservative revision invalidation can reobserve all live scoped resources after an edit. The measured aggregate refresh cost is explicit; no per-resource dependency graph or incremental structural admission was introduced to hide it.
- Oversized values, response/work limits, unresolved definitions, discovery uncertainty and budget exhaustion remain visible incomplete/unavailable states.
- The known Solid development-wrapper enumeration failure, the conditional legacy constructor retention and the existing very-large-Block edit cost remain separate issues. No speculative core repair was made.
- Index/query data is derived and disposable. It cannot save, bind, relocate, adopt ownership, unload canonical resources or navigate an occurrence.

P3 can be rolled back by omitting/disposing the explicit factory. That removes subscriptions, work and derived state while leaving canonical resources, native saves and accepted C2/C3 providers intact. Stop here for P3 review; do not proceed automatically to P4.

## Reproduction and evidence

- `npm run typecheck`
- `npm run build`
- `npx vitest run src/knowledge src/application/native-knowledge-scope.test.ts src/application/document-vault.test.ts --maxWorkers=1 --minWorkers=1`
- Broad Stage A/B/native, block-tree, Facts and C2/C3 selection: exact command/results in `artifacts/native-knowledge-p3/regression.txt`.
- `node scripts/check-native-knowledge-p3-browser.mjs`
- `P3_FOLLOWUP=1 node scripts/check-native-knowledge-p3-browser.mjs`
- `node scripts/check-native-knowledge-p3-worker.mjs`
- `P3_SHADOW=1 PROOF_ARTIFACTS=artifacts/native-knowledge-p3/ui node scripts/check-flint-c3-browser.mjs`

Primary artifacts: [browser phases and memory](artifacts/native-knowledge-p3/browser.json), [matched input follow-up](artifacts/native-knowledge-p3/browser-followup.json), [worker lifecycle](artifacts/native-knowledge-p3/worker-lifecycle.json), [Flint UI checks](artifacts/native-knowledge-p3/ui/browser-results.json), [two-Window view](artifacts/native-knowledge-p3/ui/two-window-backlinks.png), [reopened view](artifacts/native-knowledge-p3/ui/reopened-backlinks.png).
