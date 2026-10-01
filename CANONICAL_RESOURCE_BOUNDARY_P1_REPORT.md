# Canonical Resource Boundary P1 Implementation and Qualification

1 October 2026. Stage P1 of the accepted [production integration plan](NATIVE_KNOWLEDGE_PRODUCTION_INTEGRATION_PLAN.md) only. P2 has not begun; the accepted C2/C3 providers remain in place.

## Result

**P1 is implemented, with a legacy-memory exception for review.** Synchronous and cooperative reads share one audit, return equivalent evidence, and pass the ready/locality and ordinary-input gates. The registered-native memory profile remains approximately 48 bytes per content record. An additional control found higher retention when a caller keeps a legacy constructor input alive; that conditional threshold crossing is documented below and has not been optimized away.

The final regression selection has **374 passes and one accepted pre-existing failure**. All new P1 tests and typechecks pass. This is not an unconditional all-green regression or universal memory-overhead claim.

Resource-local post-admission reads are the result being qualified. **Arbitrary structural admission remains global.** The constructor/general-commit validation and rebuilding costs below are separate from subsequent reads; no work has been moved onto ordinary typing to disguise a global query.

## Production contract and implementation

[CanonicalRepository](src/block-tree/repository.ts) now exposes:

```ts
readCanonicalResourceBoundary(id): CanonicalResourceBoundaryResult
readCanonicalResourceBoundaryCooperative(id, options?): Promise<CanonicalResourceBoundaryResult>
isBoundaryCurrent(token): boolean
incomingOwnedPlacements(token, contentKey): readonly IncomingEvidence[]
```

`IncomingEvidence` above describes the inferred detached result shape (`placementKey` and optional containing `location`), not a second authored record type. The [public boundary types](src/block-tree/resource-boundary.ts) define ready/missing/ambiguous/invalid/unavailable results. Ready evidence contains root content/placement keys, frozen retained-definition keys and an opaque revision token. It contains no serialized content, membership graph, Facts, storage location, ownership-transfer permission or save authority.

The token is issued only on successful completion. Its runtime identity is recorded in a repository-owned WeakSet; copying its revision cannot forge a token. Another repository instance rejects it even at the same revision. Every admitted revision, including Undo/Redo and unrelated changes, expires previous tokens. Results, tokens, retained-key arrays and detached incoming evidence are immutable. Incoming location/slot objects are copied and frozen rather than exposing maintained repository locations.

The constructor option is now `resourceBoundaryEvidence`, enabled by default. `false` retains the count-only compatibility/rollback path for that repository instance. Queries then report unavailable; they do not lazily bootstrap global evidence. Changing the option requires constructing a repository, not disabling bookkeeping underneath current tokens. The old qualification option/getter names have been removed from current code. Qualification consumers were updated for the API rename; no production Facts observer or provider was introduced.

The incoming count/evidence representation is unchanged: numeric entries in compatibility mode; count plus singleton-or-Set owning/registration witnesses when enabled. Sparse resource identity and explicit-retention buckets remain repository-owned facets. Ordinary references do not become semantic owners; resource registration remains non-owning retention. The existing resource ownership validator and its admission lifecycle remain authoritative.

Root candidate selection now shares `documentRootRole` with the existing slow selector. The production audit accumulates registration/owned counts incrementally, preserving registration precedence without copying a potentially large incoming set. Witness iterators replace per-query witness-array copying. These are query traversal changes, not per-record representation compaction or an ownership-model change.

Production results no longer contain qualification visit counters. Dictionary access/enumeration measurements are performed by test/benchmark proxies and instrumentation outside the primitive.

## One audit with two execution modes

A private generator implements the complete audit. Synchronous reads drain it immediately; cooperative reads drain the same generator in bounded slices. Membership sets, queues and visited witnesses exist only for that invocation and are discarded on completion/cancellation. They are not retained as a resource membership index.

Both modes perform the same identity, root, retention, native Block identity, nested-resource boundary, outside ownership and multiple-owner checks. The audit still validates the target resource's canonical evidence, even when a later consumer might omit opaque content. It has no knowledge of such consumers.

The default cooperative budgets are **256 steps or 4 ms per slice**, with a next-task yield. Callers may supply a cancellation signal, positive slice budgets and a narrow scheduling callback. Work is sliced within long child/inline arrays, retained-definition traversal, root-witness selection and incoming ownership auditing—not only between Blocks. Huge child/inline arrays are not spread/copied before yielding.

No partial iteration value is exposed. Revision is checked before each slice and before returning the final result; a mutation produces unavailable evidence with no token. Aborting rejects with the signal's reason; scheduler failure rejects. Generator cleanup runs on every exit. A rejected repository commit does not advance the revision and does not invalidate previously admitted evidence.

As before, an unclassified fast mutation conservatively makes global validation evidence unavailable. It does not run a global validation from the query or input callback. A later normal admitted validation can restore availability. Legacy states whose old admission skipped resource ownership receive the same additional admission-time check established by the accepted qualification; a failure marks boundary evidence unavailable without changing legacy editing admission.

Slice targets are scheduling budgets, not hard real-time guarantees. JavaScript/GC and an indivisible record operation can overrun a target. The measured maxima and limitations are reported below; no arbitrary authored semantics were rejected or weakened to achieve a timing number.

## Correctness and compatibility

The accepted 16 boundary tests continue to exercise the slow canonical oracles. The new [production contract/cooperative suite](src/block-tree/resource-boundary.test.ts) adds 13 tests covering:

- default-on construction and usable count-only rollback;
- sync/cooperative evidence equality through typing, splits, empty paragraphs, Undo/Redo branches and placement/root-only changes;
- retained definitions, shared/outside ownership, duplicate identity, missing and unavailable results;
- opaque token issuance, copying, replacement repositories, revision expiry and detached incoming evidence;
- no early Promise completion/ready publication while suspended;
- mutation at the first, middle and final suspension, unrelated edits, and mutation followed by Undo;
- abort before work/between slices, scheduler failure and invalid budgets;
- inner-loop slicing for Cell-heavy, child-heavy, retention-heavy and high-reference-degree resources, with repository dictionary enumeration forbidden;
- registration precedence with owned-external and resolved-owned roots, rejection of duplicate resource claims/ownership cycles, and legal reference cycles.

Tests compare complete readiness/evidence, normalizing only each freshly issued token's object identity. They check repository snapshots unchanged by reads. The accepted Facts live-versus-capture suite remains a consumer regression, not the definition of the primitive; all its qualification-off/on cases remain present.

Final automated results:

- **374 passed / 1 failed across 30 files (375 tests)**: [machine-readable results](artifacts/resource-boundary-p1/qualification-results.json), [log](artifacts/resource-boundary-p1/qualification.log).
- All **13 new P1 tests**, the **16 accepted boundary cases** and **30 live-versus-capture cases** pass. The remaining selected native, ownership, codec, C2/C3 and persistence/session regressions pass.
- Qualification TypeScript and client/server TypeScript checks pass: [qualification log](artifacts/resource-boundary-p1/qualification-typecheck.log), [application/server log](artifacts/resource-boundary-p1/typecheck.log).
- `git diff --check` passes. No test assertion was weakened to hide the known regression.

The pre-existing `BlockTreeProjection` / Solid development-wrapper whole-dictionary enumeration assertion remains failing and unchanged. It was independently reproduced on the accepted baseline in the [prior report](CANONICAL_RESOURCE_BOUNDARY_QUALIFICATION_REPORT.md#automated-qualification). The failure is a projection subscriber's first development-wrapper access; these boundary APIs do not construct or call projections. No P1 evidence ties that failure to boundary correctness or cooperative lifecycle. It remains reported, not marked passed or repaired in this stage.

No browser product flow changed. P1 qualification targets the repository and its existing consumer regressions; it does not claim browser Knowledge provider qualification or authorization to replace C2/C3.

## Performance method

The [P1 runner](scripts/check-resource-boundary-p1.mjs) runs sequential isolated Node processes at **1, 10, 100 and 150 resources**, holding A constant at seven Blocks and 1,245 text Cells. The count-only repository baseline is pinned to accepted commit `fc420bd074ae7ba5bf7cb580962b9af7d81d66f9`; the production mode uses the current enriched implementation. The workload and other semantically equivalent helpers are shared. Baseline query timings use full native capture as the old complete slow reference, not the previous qualification query.

Fixture creation is excluded; repository construction is included. Each run separately records construction, target structural admission, unrelated structural admission, first/post-structural reads, combined mutation/read, bookkeeping rebuilding, input operations and retained post-GC heap. Both synchronous and cooperative representative reads must actually return ready. At size one the “unrelated” operation is a second change to A because no other resource exists.

Explicit `Object.values`/`keys`/`entries` dictionary enumeration counts include validation/copy passes, but not internal accesses inside structuredClone/Solid. Query proxies independently count direct content/placement reads and dictionary enumeration. Tests independently throw on forbidden enumeration; no production zero-count field is trusted. Full admission measurements are single architectural samples and can be noisy; repeated warmed input controls are reported separately.

Apple M1, 8 GiB RAM, macOS arm64, Node 22.12.0. The benchmarks run without concurrent tests/builds. Lightweight source inspection/report editing is permitted during the sequential runs. These are local-machine measurements, not browser latency or a hard real-time guarantee. The same practical larger size (150) as the accepted qualification is used; no 300-resource claim is made.

### Construction and structural admission

Times in seconds; B = accepted count-only repository, P = production boundary bookkeeping. These are single structural samples, not latency distributions.

| Resources | Construction B / P | Target admission B / P | Unrelated admission B / P | Target admission + sync read B / P |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 0.025 / 0.026 | 0.033 / 0.032 | 0.020 / 0.021 | 0.074 / 0.035 |
| 10 | 0.258 / 0.312 | 0.348 / 0.489 | 0.336 / 0.483 | 0.466 / 0.493 |
| 100 | 17.368 / 24.505 | 18.255 / 17.850 | 18.544 / 18.055 | 19.402 / 17.854 |
| 150 | 49.695 / 43.181 | 46.263 / 50.095 | 44.274 / 47.668 | 48.042 / 50.099 |

At one resource, the unrelated column is a second target change. Differences in these large totals are not a precise attribution of bookkeeping overhead.

| Resources | Target rebuild B / P (ms) | Admission dictionary enumerations B / P | Enumerated records B / P |
| ---: | ---: | ---: | ---: |
| 1 | 1.15 / 2.16 | 13 / 13 | 16,302 / 16,302 |
| 10 | 13.74 / 15.54 | 31 / 31 | 388,182 / 388,182 |
| 100 | 226.71 / 221.80 | 211 / 211 | 26,417,622 / 26,417,622 |
| 150 | 448.31 / 354.42 | 311 / 311 | 58,406,422 / 58,406,422 |

The registered native fixtures add no whole-dictionary admission enumeration. Facet maintenance is included in existing reference/location rebuilds. The legacy path is a separate exception discussed under memory: it needs the accepted additional ownership-validation pass.

### First and post-structural boundary reads

Milliseconds. P sync / P cooperative are first reads after the same admitted revision, with no boundary-result cache. The baseline column is native capture, included as the former slow reference.

| Resources | Baseline first capture | First P sync / cooperative | After target P sync / cooperative | After unrelated P sync / cooperative |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 47.59 | 4.51 / 26.00 | 2.46 / 23.47 | 2.71 / 24.04 |
| 10 | 108.34 | 7.50 / 29.73 | 4.05 / 24.08 | 3.80 / 27.68 |
| 100 | 1186.94 | 6.70 / 29.62 | 3.86 / 25.44 | 4.33 / 26.11 |
| 150 | 1641.53 | 5.37 / 29.39 | 3.73 / 24.23 | 6.19 / 27.81 |

**All six representative production reads at every size returned ready, with exactly 2,504 content lookups, 2,503 placement lookups and zero repository-dictionary enumerations.** This remains `A + I(A)` work; larger unrelated repository state did not enter either audit execution mode. Sync/cooperative parity is independently asserted by correctness tests and the large-resource probe.

Cooperative elapsed time includes deliberate next-task yields. Its purpose is to allow other work to run, not to reduce total wall time. The synchronous result and direct lookup counts remain the semantic/locality comparison.

### Retained bookkeeping memory

Post-GC heap growth attributable to construction while retaining the input equally in both modes; MiB = 1,048,576 bytes.

| Resources | Baseline MiB | Production MiB | Added % | Added bytes/content record |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 1.39 | 1.46 | 5.20% | 60.48 |
| 10 | 12.66 | 13.25 | 4.70% | 49.84 |
| 100 | 120.26 | 126.03 | 4.80% | 48.32 |
| 150 | 189.01 | 197.66 | 4.57% | 48.26 |

The accepted registered-resource profile remains below the 64-byte/content-record review threshold. At 100/150 resources it remains approximately 48.3 bytes/record.

**Additional legacy-input retention exception for review:** a 10-resource legacy workspace, with registration placements changed to ordinary owned containment, measured **238 added bytes/record (22.5% construction heap increase)** while the caller retained its original `RepositoryState`. Legacy validation now invokes the previously qualified ownership helper, whose existing weakly keyed `resourceOwner` cache retains an owner map against that input. This is additional admission-helper retention, not a change to the incoming-evidence representation. It cannot be described as a universal 4–5% memory result.

A separate 30-resource lifecycle control confirmed that the input is collectible (WeakRef verification), then measured both conditions:

| Constructor input lifetime | Added retained heap | Added bytes/content record |
| --- | ---: | ---: |
| Input retained | 8.91 MiB | 248.81 |
| Input released and collected | 1.75 MiB | 48.80 |

The released-input control returns to approximately **49 bytes/record**, consistent with the accepted representation. The retained-input control crosses the review threshold and remains a limitation for callers retaining legacy construction graphs. No speculative cache flushing, representation compaction, ownership-validation weakening or default special-casing was added to conceal it. The report leaves acceptance of that conditional cost to P1 review.

The legacy 10-resource constructor also increased from 174 ms to 258 ms and from 9 to 21 explicit dictionary enumerations. This is the additional admission validation already described in qualification; it is not a post-admission query cost. Subsequent legacy boundary reads still return ready with zero dictionary enumeration. [Legacy run](artifacts/resource-boundary-p1/legacy-benchmark.log), [input-lifetime control](artifacts/resource-boundary-p1/legacy-memory.log).

No per-record representation redesign was attempted. Issued token retention is weak and invocation traversal state is temporary. This is forced-GC process accounting with the fixture retained equally in both modes, not a browser allocation-by-allocation guarantee.

### Ordinary input

Three fresh-process, warmed pairs at 10 resources. Each mode warms 100 constant-length edits and 30 split/join cycles, then measures 100 edits, 50 split/join cycles and 50 empty insertions. Median milliseconds per round:

| Round | Typing B / P | Split B / P | Join B / P | Empty insertion B / P |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 0.746 / 0.745 | 0.979 / 0.989 | 0.660 / 0.674 | 0.151 / 0.161 |
| 2 | 0.744 / 0.752 | 0.992 / 0.994 | 0.673 / 0.690 | 0.159 / 0.160 |
| 3 | 0.770 / 0.760 | 1.117 / 1.069 | 0.750 / 0.741 | 0.166 / 0.160 |

The largest paired median increase is **0.017 ms**, below the plan’s 0.1 ms investigation threshold. Typing shows no repeatable median increase. These short local controls are not a universal latency guarantee or evidence of a speedup.

The 1/10/100/150 runs also retain direct enumeration instrumentation: typing and split/join perform zero whole record-dictionary enumerations; empty insertion enumerates only its two new fragment records, independently of repository size. All following production boundary reads are ready. [Input log](artifacts/resource-boundary-p1/input-benchmark.log).

### Large-resource cooperative scheduling

The [scheduling probe](src/qualification/native-knowledge/boundary-scheduling-benchmark.ts) exercises a 25,000-Cell paragraph and a 10,001-Block Document. Each observation must be ready and sync/cooperative evidence must match. It records synchronous read time, cooperative total time, slice duration, a 1 ms heartbeat, construction and post-GC released traversal memory separately. Construction is excluded from read/scheduling timing.

| Profile | Sync range (ms) | Cooperative total range (ms) | Maximum measured slice (ms) | Maximum heartbeat gap (ms) |
| --- | ---: | ---: | ---: | ---: |
| 25000-cells | 46.13–74.19 | 518.07–642.01 | 8.48 | 30.71 |
| 10001-blocks | 11.94–34.50 | 201.15–202.48 | 0.72 | 1.89 |

All six observations were ready and matched synchronous evidence. There were 390–393 yields for the Cell-heavy profile and 156 for the Block-heavy profile. Both post-GC traversal-memory deltas were negative; no retained audit-growth signal was observed in this bounded probe. That is not an allocation-by-allocation leak proof.

**The 4 ms target is not a hard maximum:** one measured slice reached 8.48 ms and the largest heartbeat gap was 30.71 ms. These observations remain explicit. Cooperative execution permits progress between slices; it does not make large-A reads instantaneous. The synchronous 25,000-Cell audit reached 74.19 ms, so future interactive consumers must use the cooperative form for such resources. [Raw scheduling results](artifacts/resource-boundary-p1/scheduling.json).

## Scope, rollback and later stages

P1 changes repository semantic bookkeeping/query execution and qualification consumers only. There are no Facts/Knowledge imports in the production block-tree primitive, no consumer-maintained ownership graph, no per-resource invalidation graph, no worker/discovery implementation, no native persistence/schema change and no arbitrary structural-admission optimization.

The [production plan](NATIVE_KNOWLEDGE_PRODUCTION_INTEGRATION_PLAN.md) now carries both user clarifications:

- P4 may qualify the new provider explicitly enabled; production default-on rollout needs separate authorization after review.
- P2 worker inspection failure/cancellation/timeout/incomplete or stale evidence means unknown/incomplete discovery, never absence. Identity, duplicate, pair, operation, relocation and confinement semantics must remain intact.

No `nativeKnowledge` switch or provider replacement has been introduced during P1. The repository primitive's default-on construction is the P1 behavior specified by the accepted plan; it is distinct from future provider rollout.

Stop here for P1 review. P2 is not started.

## Reproduction

```sh
node scripts/check-resource-boundary-p1.mjs 1 10 100 150
BOUNDARY_TYPING_ONLY=1 BOUNDARY_ROUND=1 node scripts/check-resource-boundary-p1.mjs 10
BOUNDARY_TYPING_ONLY=1 BOUNDARY_ROUND=2 node scripts/check-resource-boundary-p1.mjs 10
BOUNDARY_TYPING_ONLY=1 BOUNDARY_ROUND=3 node scripts/check-resource-boundary-p1.mjs 10
node scripts/check-resource-boundary-p1-scheduling.mjs
BOUNDARY_LEGACY=1 node scripts/check-resource-boundary-p1.mjs 10
node scripts/check-resource-boundary-p1-legacy-memory.mjs
npx tsc --noEmit --project tsconfig.native-knowledge.json
npm run typecheck
```

Raw results and logs are under [artifacts/resource-boundary-p1](artifacts/resource-boundary-p1/). Exact regression selection:

```sh
npx vitest run src/block-tree src/qualification/native-knowledge \
  src/qualification/native-b1/resource.test.tsx \
  src/qualification/native-b1/compatibility.test.ts \
  src/qualification/native-b1/owned-resources.test.ts \
  src/qualification/native-b2/markdown.test.tsx \
  src/application/canonical-backlinks.test.ts src/application/flint-knowledge.test.tsx \
  src/history/stage-c-gates/portable.test.ts src/history/stage-c-gates/resource.test.ts \
  src/persistence/native-session.test.ts src/persistence/native-vault-session.test.ts \
  --reporter=default --reporter=json \
  --outputFile=artifacts/resource-boundary-p1/qualification-results.json
```
