# Canonical Resource Boundary — Repository-Semantic Qualification

1 October 2026. Bounded qualification only, following the accepted [feasibility report](CANONICAL_RESOURCE_BOUNDARY_FEASIBILITY_REPORT.md). No production Knowledge Index/provider integration.

## Result

**The repository-locality experiment qualifies within the tested profile.** The primitive establishes a requested Document's boundary from repository-maintained canonical evidence after admission; it does not attempt to make arbitrary structural admission resource-local. The regression suite is **not entirely green**: 361/362 tests pass, with one existing projection-enumeration failure independently reproduced against the accepted baseline. Details are below; this is not a claim of complete end-to-end input locality or production readiness.

## Implemented boundary

The experiment is enabled only by `RepositoryOptions.qualifyResourceBoundary`. Ordinary application construction does not opt in. This is isolation of a proposed semantic primitive for qualification, not rollout of a user-facing feature or Knowledge Index provider.

- [Reference bookkeeping](src/block-tree/reference-bookkeeping.ts) enriches the existing per-content count entry with owning-placement and registration witnesses. Ordinary one-owner Cells use a singleton key, not a `Set` per Cell. There is no parallel all-content adjacency/membership index. Existing count semantics still include all placement roles.
- [Resource-boundary bookkeeping](src/block-tree/resource-boundary.ts) maintains sparse Document identity buckets and explicit-retention buckets. Identity collisions retain all candidates; they cannot overwrite one another. It stores no authored payload, transitive content→resource assignments, Facts, occurrence state or serialized resource.
- [Repository integration](src/block-tree/repository.ts) populates those facets during existing reference/location initialization and general-commit rebuilds. Classified fast paths update only affected entries. Before/final state and actual operations are used internally; no consumer reconstructs a mirror from History or public change notifications.
- General validation reuses the existing `validateResourceRegistrations` / `resourceOwnership` success. When the legacy conditional path would omit that check, qualification evaluates the same check once during admission preparation and retains its outcome without changing legacy admission policy. Queries never perform a hidden global bootstrap.
- `readCanonicalResourceBoundary(id)` reports ready/missing/ambiguous/invalid/unavailable. A ready result contains the root content/placement keys, explicit retained-definition keys, a repository-instance/revision token and visit counts. It audits the requested owned closure and retained components transiently. No membership graph is retained between reads.
- `incomingOwnedPlacements(token, key)` returns detached placement/location evidence; `isBoundaryCurrent(token)` checks freshness. Every admitted revision invalidates prior tokens, including unrelated edits. Repository replacement invalidates tokens even if revision numbers match.

Root precedence is shared with the existing slow `documentRootPlacements` through a pure selector. Resource identity uses existing `resourceSource` semantics. The existing resource-ownership validator remains the authority for global resource claims and cycles; no incremental ownership graph or new cycle model was introduced.

The query separately verifies target-local membership and incoming ownership. Registration remains non-owning; a resolved owned-external edge remains a resource claim rather than local content membership. Locally loaded child Documents stop traversal. Retained content does not acquire a fabricated occurrence. Same-parent duplicate owning placements remain two owners, and an outside owner is not erased by a local traversal.

Readiness is a boundary result, not a native-codec validity, binding, save, adoption or lifetime permission. Existing codec/History/Workspace guards remain separate. The query does not implement vault eligibility, filesystem discovery, semantic Facts extraction or opaque-host UI policy.

## Fast-path validity and deliberate limits

The retained validation result covers global resource ownership, not a cached resource membership proof. The next boundary query always audits A afresh. The classifier examines actual admitted fast-route records in addition to the existing inline/split/empty-paragraph hints. It checks resource identity, roles/provenance, retention and relevant host types; the hint alone is not treated as blanket authority.

Ordinary typing, paragraph split/join and empty-paragraph insertion/removal must continue to yield ready evidence. Potential Cell sharing is not blessed by the fast hint: incoming witnesses expose it and the boundary query rejects it.

An unclassified fast mutation makes the global validation evidence unavailable. It does **not** scan the repository on the input path or preserve a stale success. A subsequent general admitted validation can restore eligibility. The qualification includes an exotic inline host/identity change demonstrating this outcome. Unavailability is not counted as successful locality.

General structural admission still clones, validates and rebuilds existing repository machinery. The experiment reuses that lifecycle; it does not redesign it. Constructor/general-commit results therefore must be read separately from subsequent query results. A current resource-ownership failure in an otherwise admitted legacy state yields unavailable boundary evidence rather than retroactively changing legacy editor admission.

## Correctness gate

[Boundary tests](src/qualification/native-knowledge/boundary.test.ts) compare sparse/root/incoming evidence and reference counts to the existing slow helpers and record enumeration. They cover:

- complete cold reads while proxies forbid enumeration of either repository dictionary;
- normal and strict Block-ID modes; typing, split/join, empty insertion, Undo/Redo and a new Undo branch;
- target and unrelated structural changes, placement-only retarget/role changes, repeated-key batches and root replacement without content changes;
- duplicate resource identities in legacy states, explicit retention/reassignment, outside ownership, same-parent multiple ownership and shared Cells within/across resources;
- nested Documents, external and resolved-owned boundaries, registration precedence, duplicate resource claims, ownership-cycle rejection and legal reference cycles;
- failed commits preserving admitted evidence, ready queries from change callbacks, stale asynchronous tokens and repository-instance replacement;
- conservative unavailability and later recovery for unclassified fast mutations and legacy resource-ownership conflicts.

The existing [live observer differential](src/qualification/native-knowledge/live-observer.test.ts) runs with qualification both disabled and enabled. The qualification-only observer can use the new boundary rather than its old global cold proof. Complete Facts remain compared with `extract(captureNative(...))`, including the existing rich/native/foreign/retained/opaque/Unicode cases. This remains a consumer regression, not the definition of the repository primitive.

Boundary-invalid states are compared on semantic readiness/evidence, not required to reproduce every native wire/value encoding error or identical error text. Global validation can deliberately report unavailable before a target-local error; no such case is counted as ready.

## Measurement method

The baseline bundle reads the accepted repository implementation from Git commit `fc420bd074ae7ba5bf7cb580962b9af7d81d66f9`; it does not compare merely against the new implementation with an option disabled. Each size/mode runs in its own sequential Node process. No test suites overlap the benchmark runs.

The requested A is held constant: the prior native fixture with seven Blocks, 1,245 text Cells, margins and linked annotations. All loaded resources are real independently registered native resources in a `CanonicalRepository`. Initial fixture creation is excluded; **repository construction is measured**. Both target and unrelated structural operations reorder existing children, preserving A's complexity. At size one there is no unrelated B; that row is a second A edit and is labelled accordingly.

The larger completed size is 150. A 300-resource run crossed the user pause/sleep interval and was terminated; its wall-time results are unusable and excluded. The interrupted artifact remains labelled under [interrupted](artifacts/resource-boundary/interrupted/README.txt). The existing baseline admission is already costly at this scale, so 150 is the practical 100+ gate; this is not a claimed 300-resource pass.

[Benchmark runner](scripts/check-resource-boundary.mjs) and [workload](src/qualification/native-knowledge/boundary-benchmark.ts) record construction, reference/location rebuild, mutation, first read, target/unrelated post-structural read, combined cost, ordinary fast operations and retained heap after forced GC. Baseline reads use `captureNative` as the accepted complete slow reference; qualified reads require actual ready evidence.

Instrumentation counts explicit `Object.values` / `keys` / `entries` enumerations of record dictionaries in both implementations, using the returned array length without performing another scan. These counts include validation copies and are **not** a count of every access inside `structuredClone`, Solid reconciliation or graph recursion. The boundary additionally counts direct content/placement/incoming-evidence visits. Dictionary-forbidding correctness tests independently verify locality rather than trusting the query's zero-enumeration field.

Structural rows are single architectural samples per size/mode, not latency distributions. Typing and paragraph operations have repeated samples; a separate warmed input control checks JIT/noise before drawing an overhead conclusion. Constructor memory is post-GC heap growth with the input state retained equally in both processes; RSS is not substituted for bookkeeping memory.

## Measured results

**The post-admission locality gate passes for the qualified mutation classes.** All representative reads returned ready evidence. Maintained facets match the slow canonical evidence in the exercised differential cases; unknown fast mutations remain explicitly unavailable rather than guessed.

### Construction, admission and combined cost

Times below are seconds, except the next query table. B = accepted baseline; Q = qualified enrichment. General mutation timing includes admission and bookkeeping. Rebuild is the existing reference/location rebuilding interval with the extra facets included in Q; it is part of mutation/construction, not an additional cost to add to those totals.

| Resources | Construction B / Q | Target mutation B / Q | Unrelated mutation B / Q | Target mutation + read B / Q |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 0.028 / 0.027 | 0.040 / 0.031 | 0.051 / 0.020 | 0.181 / 0.033 |
| 10 | 0.342 / 0.776 | 0.620 / 0.512 | 1.085 / 0.515 | 0.785 / 0.515 |
| 100 | 19.329 / 21.000 | 18.588 / 22.226 | 19.314 / 18.930 | 20.208 / 22.229 |
| 150 | 41.877 / 39.070 | 43.928 / 45.484 | 43.921 / 44.276 | 45.423 / 45.490 |

At size one, the “unrelated” row is another target edit. The measured structural totals are noisy single samples: enrichment is not claimed to make admission faster, nor are differences between two large totals a precise estimate of facet-maintenance cost.

| Resources | Target reference/location rebuild B / Q (ms) | Admission record-dictionary enumerations B / Q | Enumerated record entries B / Q |
| ---: | ---: | ---: | ---: |
| 1 | 1.27 / 1.48 | 13 / 13 | 16,302 / 16,302 |
| 10 | 22.83 / 18.57 | 31 / 31 | 388,182 / 388,182 |
| 100 | 285.92 / 216.43 | 211 / 211 | 26,417,622 / 26,417,622 |
| 150 | 337.19 / 444.37 | 311 / 311 | 58,406,422 / 58,406,422 |

For these registered native fixtures, Q performs **no additional whole record-dictionary enumeration during admission**: the sparse facets are populated in an existing content pass, and the incoming witnesses in the existing placement pass. The existing resource-ownership check is reused. Additional costs are classification, per-entry maintenance/allocation and GC; it is not a free enrichment. Legacy admission that lacked the ownership check needs the explicitly documented additional preparation pass.

### Cold and post-structural boundary reads

Milliseconds; each row is a first read after the corresponding admitted revision, with no boundary-result cache warmup.

| Resources | First read B / Q | After target structure B / Q | After unrelated structure B / Q |
| ---: | ---: | ---: | ---: |
| 1 | 81.50 / 3.06 | 141.15 / 1.98 | 101.32 / 1.74 |
| 10 | 163.46 / 4.94 | 165.43 / 2.81 | 151.13 / 3.67 |
| 100 | 1025.26 / 5.99 | 1619.14 / 2.68 | 1200.28 / 2.72 |
| 150 | 2217.53 / 3.63 | 1495.05 / 5.47 | 1557.61 / 2.88 |

At **every size**, all three Q reads perform **2,504 content lookups, 2,503 placement lookups and inspect 1,251 incoming owning witnesses**, with **zero record-dictionary enumerations**. These count accesses, including repeats, rather than distinct records. Each first/post-structural read actually returns ready. A and its incident evidence are identical despite total content growing from 1,254 to 187,802 records.

This is the decisive locality evidence: `A + I(A)`, with no unrelated-state scan, regardless of the modest JIT/GC variation in millisecond timings. The old global proof is not simply deferred to the first query. Global validation remains in its separately measured admission lifecycle.

### Retained memory

Post-GC repository heap growth; MiB = 1,048,576 bytes.

| Resources | Baseline MiB | Qualified MiB | Added MiB | Added % |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 1.39 | 1.46 | 0.07 | 5.28% |
| 10 | 12.66 | 13.25 | 0.59 | 4.67% |
| 100 | 120.26 | 126.03 | 5.77 | 4.80% |
| 150 | 189.01 | 197.66 | 8.64 | 4.57% |

At 100/150 resources, the additional retained heap is approximately **48 bytes per canonical content record** in this Cell-heavy fixture. The large majority are Cells. The singleton incoming-witness representation avoids a separate Set for every Cell, but its per-entry object still has measurable cost. This is isolated process heap accounting, not an allocation-by-allocation proof or a browser memory guarantee. Retained-definition-heavy and high incoming-degree workloads can have different proportions.

### Ordinary input

The main 1/10/100/150 runs contain 40 typing samples and repeated split/join/empty operations. Typing and split/join perform **zero record-dictionary enumerations**. Empty insertion enumerates only its two new fragment records, independent of loaded repository size; undo enumerates none. All following qualified boundary reads remain ready.

To control startup/JIT variation, a separate three-round, 10-resource control warms 100 constant-length edits and 30 split/join cycles, then measures 100 edits, 50 split/join cycles and 50 empty insertions per mode/round. Median ranges across those rounds (ms):

| Operation | Baseline median range | Qualified median range | Paired median increase range |
| --- | ---: | ---: | ---: |
| typing | 0.727–0.757 | 0.745–0.767 | 0.003–0.027 |
| split | 0.946–1.011 | 0.987–1.034 | 0.006–0.041 |
| join | 0.657–0.668 | 0.687–0.693 | 0.022–0.030 |
| empty | 0.152–0.154 | 0.158–0.159 | 0.005–0.006 |

The largest paired median increase is about **0.04 ms**. This is a small bounded maintenance cost, not a material input-path increase in the measured workload, and no global validation has moved onto those paths. No universal guarantee is made for arbitrary paste size or exotic hosts. The classifier uses a transient changed-record map so that finding newly inserted Cells is linear in the operation batch rather than repeatedly searching that batch.

Raw results: [1 baseline](artifacts/resource-boundary/baseline-1.json), [1 qualified](artifacts/resource-boundary/qualified-1.json), [10 baseline](artifacts/resource-boundary/baseline-10.json), [10 qualified](artifacts/resource-boundary/qualified-10.json), [100 baseline](artifacts/resource-boundary/baseline-100.json), [100 qualified](artifacts/resource-boundary/qualified-100.json), [150 baseline](artifacts/resource-boundary/baseline-150.json), [150 qualified](artifacts/resource-boundary/qualified-150.json). [Run log](artifacts/resource-boundary/benchmark.log), [input-control log](artifacts/resource-boundary/input-benchmark.log); per-round input JSON files are in the same directory.

## Automated qualification

- **361 passed, 1 failed across 29 files (362 tests).** [Full results](artifacts/resource-boundary/qualification-results.json), [test log](artifacts/resource-boundary/qualification.log).
- All **16 new boundary cases** pass. All **30 live-versus-capture differential cases** pass with qualification off/on. Existing native Facts/overlay, native resource/ownership/compatibility, Markdown, search/backlinks, History resource, Save/Open and vault-session checks in the selected regression suite pass.
- `npx tsc --noEmit --project tsconfig.native-knowledge.json`: passed. `npm run typecheck` (reactive client and server): passed. `git diff --check`: passed.

**Remaining failure:** `src/block-tree/commit-capture.test.ts`, “never snapshots, serializes or enumerates the whole graph for strict captured typing and Enter”. Its whole-dictionary enumeration assertion fails in both the unchanged accepted repository implementation and this implementation. The baseline reproduction uses the original test, not a weakened assertion: [baseline log](artifacts/resource-boundary/baseline-capture-regression.log). Diagnostic instrumentation traced the call to Solid's development `wrap$1` via `BlockTreeProjection`'s first `repository.state.placements` access in its change subscriber. The proposed qualification is disabled in this test. The diagnostic instrumentation was removed; the existing test and projection were left unchanged.

This inherited projection/dev-wrapper enumeration is distinct from the new repository bookkeeping cost, but it is a real limit on claiming that every editor/input route is wholly free of repository enumeration. The measured repository-only ordinary typing paths add no global work. This qualification does not expand into correcting the projection lifecycle.

One new test initially asserted against a borrowed placement record after reconciliation had changed it. The test now retains the pre-edit placement values; it verifies the same reference counts and full slow-oracle equivalence without changing implementation semantics.


## Scope and architectural judgment

No additional record-dictionary scan is needed for a boundary read. Identity and retention are direct sparse lookups; the audit visits A and its relevant incoming ownership witnesses. Duplicate and outside ownership are checked using placement evidence rather than inferred from a count or first match.

This does not make the whole repository fast. Full admission remains global, and legacy states whose existing admission omitted resource-ownership validation require that extra preparation check. Incoming witnesses consume additional memory. Huge individual A or large incident ownership sets still increase query work; this synchronous prototype has no general scheduling/frame-budget guarantee.

The primitive remains repository-semantic and bounded: reference bookkeeping enrichment, two sparse facets, one current validation result and conservative revision tokens. The next decision is review of these corrections and their measured tradeoffs. Production Knowledge Index integration, a new ownership/membership graph, persistent state, arbitrary structural mutation optimization, and a per-resource dependency/invalidation graph are not part of this work.

## Reproduction

```sh
node scripts/check-resource-boundary.mjs 1 10 100 150
BOUNDARY_TYPING_ONLY=1 BOUNDARY_ROUND=1 node scripts/check-resource-boundary.mjs 10
npx tsc --noEmit --project tsconfig.native-knowledge.json
npm run typecheck
```

Regression selection (the same command produced the linked results):

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
  --outputFile=artifacts/resource-boundary/qualification-results.json
```

Stop here for architectural review. No production Knowledge Index integration is enabled.
