# Live Canonical Facts Adapter Qualification Report

Date: 1 October 2026. Qualification prototype only; architectural review required before further work.

## 1. Result and gate decision

**Conditional success: canonical observation can replace persistence capture for ordinary live text refreshes without changing the qualified Facts contribution. The existing APIs do not provide repository-size-independent validation after arbitrary structural changes.**

At 100 loaded Documents, the final run measured **8.65 ms median** to observe and replace one resource after a certified inline edit, versus **1,087 ms** for capture plus reference extraction. At 10 Documents the equivalent live refresh was **8.45 ms**. No persistence capture, native encoding, decoder, admission, snapshot, editor mount or projection is invoked by the live observation path.

However, **first observation and refresh after an uncertified/structural change still cost 447 ms median at 100 Documents**, predominantly synchronous repository-wide identity/ownership validation. This is a material remaining limitation, not a fully eliminated scaling curve. The prototype retains those checks rather than weakening eligibility or ownership. The minimum missing query boundary is described in §8; no repository redesign was implemented.

The saved and live paths are sufficiently qualified to inform a bounded production-integration **plan**. They are not an unconditional production-readiness claim. No production provider, persistence path, database, cache, migration or `.ink` compatibility was enabled.

## 2. Observation architecture and reuse

[LiveFactsObserver](src/qualification/native-knowledge/live-adapter.ts) receives a `CanonicalRepository` and a narrow read-only scope: selected vault, discovery snapshot/signature, canonical persistence binding, pending-operation status and opaque-host predicate. Its only result is Facts, transient member keys, freshness evidence and timings.

The observation has three parts:

1. Check the selected resource's availability; establish or reuse a private structural proof.
2. Traverse the target's canonical owned/inline edges and explicitly retained definitions into a temporary map of **borrowed canonical records**. This is a scoped view using existing `RepositoryState` record types, not a second content model or `ResourceSnapshot`. Canonical records are never mutated. Only the observation root placement and nested-resource boundary descriptors are adapted in the private map.
3. Run the existing Facts collector against that scope, checking cancellation, repository revision, discovery signature, binding and disposal before publication.

Reused boundaries:

| Existing machinery | Purpose |
| --- | --- |
| `CanonicalRepository.readState`, `subscribeChanges`, `contentReferenceCount` | Borrow authoritative records, reject stale work, certify narrow inline changes, detect possible shared Cells |
| `findResource`, `resourceSource` | Canonical resource identity, independently of path and root Block ID |
| `documentRootPlacements`, `resourceOwnership` | Unique root/registration; semantic ownership, external-owned edges and cycles; registration remains non-owning |
| C2/C3 vault eligibility predicates and `vaultContains` / `vaultPath` | Complete discovery, one matching row, exact binding, selected-vault confinement, paired/unenrolled state, no pending relocation |
| Canonical `children`, `inlineContent`, `ownedRelations`, `definitionOwnerKey` | Membership, margins, retained definitions and separate resource boundaries |
| `canonicalSearchSource` | Native Cell text, Unicode boundaries and inline-object run breaks, without a mounted editor |
| `linkedDefinitionOwner`, `resolveLinkedProperty` | Local linked definition resolution and provenance rules |
| Existing qualification `extract` collector and `KnowledgeIndex` | Identical facts/mention grouping, diagnostics and disposable Maps/Sets |

The C2/C3 eligibility conditions are mirrored in the prototype; their production service was not replaced or called as a hidden whole-vault scan. Existing helpers perform the canonical checks. A small additional ownership audit supplies information not exposed by a resource-local repository API: incoming owned placements, including owners outside the selected resource.

The [collector](src/qualification/native-knowledge/extract.ts) now exposes a qualification-only borrowed-state entry point, optional freshness/opaque policy and phase instrumentation. Its original capture-based entry point remains the differential reference. The saved [lightweight reader](src/qualification/native-knowledge/lightweight.ts) accepts the same optional opaque policy; its decoder-backed witness validation is unchanged. Opaque filtering must be identical on both routes. The tests do not compare a filtered live route to an unfiltered saved route and call them equivalent.

## 3. Eligibility, ownership and membership proof

On first use, the observer checks unique canonical identity/root and existing resource-ownership rules, finds retained definitions, and audits incoming non-Cell ownership. After successful membership validation it retains only the selected resource's proof entries. It does not retain a second repository-wide index.

That proof survives only commits certified by the repository's existing `inlineOwner` hint **for a StandoffEditorBlock**. Every other change clears proofs. This deliberately includes unrelated structural changes: they can introduce conflicting identity, external ownership or retention evidence. Scope/binding eligibility is rechecked on every observation independently of the structural proof.

The hint proves structural fields, not arbitrary payload semantics. Therefore every refresh still reads current text/annotations/metadata and checks current authored Block identities. Cell ownership is also checked each time: a sole placement is cheap through `contentReferenceCount`; potential sharing triggers an actual incoming-owned-placement scan. Tests demonstrate rejection of shared Cells even when an inline hint is present, and duplicate Block IDs introduced through a payload-only inline change. No stale proof is used to bless those states.

Owned traversal stops at external/resolved references and reference occurrences. A locally loaded owned child Document becomes a private boundary descriptor rather than part of the parent's facts. Existing semantic owned-resource claims remain authoritative. Explicitly retained definitions participate in membership validation but do not acquire fabricated visible occurrences. Retained content with an outside structural owner is rejected.

Linked definitions resolve in the proven canonical resource scope. Foreign/Workspace provenance is never adopted as local. An unresolved or foreign linked mention is omitted with a diagnostic. A live unresolved local definition can therefore produce explicitly incomplete facts where persistence capture refuses to save; this case is reported separately, not counted as a successful differential comparison.

The adapter trusts repository-mediated mutation and repository graph validation. It is not a validator for arbitrary unadmitted object graphs, malformed native bytes or silent out-of-band mutation. Saved-file validation continues to use the accepted decoder authority.

## 4. Differential correctness and coverage

[Observer tests](src/qualification/native-knowledge/live-observer.test.ts) compare **complete Facts** using value-aware deep equality, not selected query results. The oracle is `extract(captureNative(state, id), location, generation)` with the same explicit host policy. Saved lightweight extraction is also compared directly for the historical/rich fixtures and opaque profile. Benchmarks independently use Node's `isDeepStrictEqual` for each reference trial and both heavy-resource observations.

| Profile / edge | Qualification result |
| --- | --- |
| Resource ID, root Block ID, metadata and tags | Full equality; title/tag edits invalidate structural proof; tag deduplication preserved |
| Native text and coordinates | Unicode, surrogate-pair/combining-mark Cell coordinates, inline images and run boundaries equal |
| Annotations and typed relationships | Full annotation/mention structures equal; Entity versus Document distinction, linked multi-segment grouping and definition provenance preserved |
| Unknown authored values | Rich/tagged native fixtures and unknown annotation values compare with value-aware equality; native payloads are not rewritten |
| Margins and retained definitions | Margin facts included; unplaced retained content validates without becoming a visible Block fact |
| External and owned-resource boundaries | Graph-2 owned-external edge, local reference occurrence, and actually loaded nested owned Document do not expand into source facts |
| Foreign/legacy definitions | Explicit foreign provenance and legacy Workspace definitions compare with capture's normalized result; unresolved local definition reports incomplete coverage where capture is unavailable |
| Opaque/application hosts | Shared predicate and application suffix stop facts traversal; reference and saved routes use the same profile |
| Ambiguous/invalid ownership | Shared Cells and retained content with an outside owner rejected; duplicate Block identities rejected even after inline hints |
| Freshness/availability | Pending operation, ambiguous discovery, changed file state, cancellation, changed binding/signature, vanished canonical identity and disposal reject observation |
| Incomplete / bounded output | Heavy traversal returns 10,000 Block facts with `Block budget reached`; annotation count over 10,000 rejects the entire contribution |
| Read-only behavior | Canonical snapshot and revision unchanged by repeated observations; no History-producing command in observer |

Fixtures include the actual B1.2 rich native artifact, B2 consumed-Markdown artifact and C3 browser source artifact, alongside the seeded native fixture. Previous saved-reader regression fixtures continue to cover earlier native versions, malformed wire input and authored-value encoding. This is the previously qualified knowledge profile, not exhaustive extraction of every native feature or arbitrary application internals.

The collector's current limits remain explicit: 10,000 traversal entries, 10,000 inspected annotations, and two million text units per standoff source. They are qualification-profile limits, not changes to C2/C3 production request budgets. Membership verification itself currently traverses the full selected resource before the facts budget applies.

## 5. Live overlay and lifecycle

The separate [observed overlay](src/qualification/native-knowledge/live-facts-overlay.ts) is owned by the canonical resource observation, with no tab or occurrence dependency. Initial loading and invalidation immediately install a null live overlay, suppressing both old live and saved facts. Expensive work is deferred (30 ms debounce by default).

Each request carries a serial, cancellation signal, repository revision and scope signature. The observer additionally verifies current binding and disposal. Completion publishes only while those checks still hold. Undo/Redo is ordinary revision invalidation; obsolete completions cannot republish. Structural changes conservatively invalidate; an unrelated certified standoff edit can preserve an already published source contribution. An in-flight request still rejects any changed repository revision.

[Lifecycle tests](src/qualification/native-knowledge/live-overlay.test.ts) cover immediate suppression, overlapping extraction with edits/Undo, Redo, scope changes, canonical identity disappearance and disposal during work. Two fixture resources and ten independently registered resources are observed without mounting tabs. Existing C2/C3 regressions retain the multiple-Window/navigation coverage.

Disposal leaves suppression in place. The adapter has **no automatic hand-back path** and never calls `restoreSaved`. The existing index's explicit hand-back primitive remains available only to a future caller that verifies both current disk evidence and absence of canonical live authority. Implementing that production verifier was not part of this gate. Neither facts nor structural proof grants save, overwrite, ownership, binding or relocation authority.

Scope discovery/binding changes require the caller to invoke `invalidate`; the narrow signature contract must advance for discovery/policy changes. This qualification demonstrates explicit notifications, not a production subscription bridge or filesystem watcher.

## 6. Benchmarks

Apple M1, 8 GiB RAM, macOS arm64, Node 22.12.0. Real `CanonicalRepository` instances containing 1/10/100 independently registered resources; no hidden editors or mounted views. One target has seven Blocks, 1,245 text Cells before edits, 17 annotation segments and seven logical mentions. Setup and commit costs are excluded from refresh timing. Three sequential samples per mode, after three untimed reference warmups per size. Benchmarks ran without overlapping tests.

Cold means first proof or proof cleared by a metadata commit. Warm means unchanged structural proof. After-inline means a real committed leaf-Cell insertion, preserving the repository's inline hint. Reference means capture plus extraction for that same canonical state. Medians below are milliseconds; separate phase medians need not sum to the median total.

| Loaded Documents | Capture only | Capture + reference facts | Cold live + replacement | Warm live + replacement | After-inline live + replacement |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 68.29 | 81.00 | 14.25 | 9.82 | 11.27 |
| 10 | 98.68 | 107.21 | 34.59 | 8.79 | 8.45 |
| 100 | 1,079.40 | 1,087.02 | 447.49 | 8.64 | 8.65 |

After an unrelated resource's certified inline edit, target refresh measured 8.05 ms at 10 resources and 8.95 ms at 100. The final run confirms the initial run's main finding (8.44/8.65 ms after-inline at 10/100 resources). Absolute reference times differ from the earlier ~31.5/69.6/781.9 ms capture measurements; these are fresh controls in a real repository after commits, not a claim of exact reproduction of the earlier static-state benchmark.

After-inline breakdown:

| Phase | 1 Document | 10 Documents | 100 Documents |
| --- | ---: | ---: | ---: |
| Source/discovery/binding selection | 0.017 | 0.010 | 0.027 |
| Cached identity/ownership eligibility | 0.001 | 0.001 | 0.001 |
| Owned traversal / borrowing, including scheduled yields | 7.028 | 6.003 | 5.762 |
| Membership audit | 0.418 | 0.565 | 0.772 |
| Native text/range extraction | 0.228 | 0.165 | 0.211 |
| Annotation/reference extraction | 3.340 | 1.833 | 1.786 |
| Remaining facts construction | 0.054 | 0.031 | 0.038 |
| Index contribution replacement | 0.029 | 0.015 | 0.017 |

Cold eligibility alone grows **3.13 → 25.75 → 436.73 ms**. It includes global identity/root lookup, resource ownership, retained membership and incoming non-Cell ownership scanning. In warm observations, no unrelated content/Cell scan is required for ordinary uniquely owned Cells. Selection still linearly checks discovery rows, and an unusually shared Cell can trigger a global incoming-placement scan. Thus the measured common path is substantially independent of unrelated loaded content; the general path is not.

[Final raw measurements](artifacts/live-facts/benchmark.json), [log](artifacts/live-facts/benchmark.log), [initial exploratory run](artifacts/live-facts/benchmark-initial.json). The initial run exposed JIT/startup noise; the final runner adds explicit reference warmups and uses complete existing Cell record shapes for committed typing fixtures. Three samples are a local architectural probe, not a latency distribution or browser typing benchmark.

## 7. Scheduling and typing implications

Synchronous invalidation performs request cancellation, suppression, timer replacement and proof invalidation when needed. It never captures or walks the Document. Measured repeated invalidation while already suppressed averaged **0.013–0.026 ms**; the single populated-contribution suppression samples were **0.12–0.98 ms**. The repeated measurement does not disguise the first removal: it is reported separately. Existing Map removal scales with that resource's indexed facts, so these ordinary-fixture numbers are not a constant-time guarantee for large contributions.

Live traversal yields every 256 membership visits; collection yields every 64 Blocks / 128 annotations; native text extraction retains its existing 2,048-Cell yielding. Freshness checks reject mixed-revision work rather than publishing it. The work remains on the caller thread, and a deferred timer alone does not make a subsequent synchronous scan cheap.

For a root with **10,001 child Blocks**, complete differential comparison passed with explicit truncation:

| Observation | Total | Maximum observed 1-ms heartbeat gap | Heartbeat ticks during work |
| --- | ---: | ---: | ---: |
| Cold | 318.31 ms | 35.83 ms | 195 |
| Warm | 340.23 ms | 13.73 ms | 195 |

The warm total is not uniformly lower because cooperative timer scheduling contributes wall time. This is a scheduling demonstration, not a frame-budget guarantee. Cold validation on the 100-Document fixture has a much larger synchronous phase (~437 ms). It must not be presented as safe for interactive production merely because ordinary warm extraction is fast.

The accepted worker-backed saved-reader direction remains appropriate. Moving a live observer to a worker by serializing the entire repository would reintroduce the problem and is not proposed. Live observation needs resource-local canonical evidence and bounded cooperative work; production planning must address cold proof and large membership/index-removal bursts explicitly.

## 8. Smallest missing canonical query boundary

No new public core API was added. The experiment identifies a specific gap: existing public helpers cannot provide a uniquely identified resource's root, retained membership and incoming ownership evidence without scanning unrelated repository state. `contentReferenceCount` is fast but cannot distinguish semantic owners from references or locate their resource context. The existing location index maps a placement to its containing slot, not a resource ID to a validated resource membership boundary.

The smallest proposed addition is a **read-only canonical resource-boundary query**, backed by existing repository identity/location/reference maintenance, exposing only:

- unique canonical resource/root evidence (or explicit missing/ambiguous result);
- that resource's explicit retained-definition keys;
- incoming owned-placement evidence sufficient to detect outside/multiple owners for a requested content key;
- a validity token/invalidation signal for changes affecting that evidence, including resource-ownership claims and canonical identity changes.

It would not return a serialized resource, authored DTO, occurrence, storage binding, graph database or save authority. Ownership is still derived from authored edges and explicit definition retention. Unknown ownership remains unknown. This is a proposed semantic boundary, not a finalized API or authorization to construct another global subsystem.

First evaluate whether the repository's current maintained indices and change records can expose that evidence incrementally. If doing so requires substantial reconstruction, retain the conservative prototype result and return that concrete limitation for review. Do not hide the cost by trusting first-match identity, treating registrations as owners, caching across unclassified structural changes, or weakening outside-owner checks.

## 9. Qualification results and remaining limits

**178 tests passed in 14 files**, including 17 new live-observer/overlay tests and the complete 161-test saved-reader/native/C2/C3 regression selection from the accepted prior gate. [Machine results](artifacts/live-facts/qualification-results.json), [test log](artifacts/live-facts/qualification.log). The [qualification TypeScript check](artifacts/live-facts/typecheck.log) and [application/server TypeScript checks](artifacts/live-facts/production-typecheck.log) passed. Existing production C2/C3, native persistence and ownership behavior remains untouched. No production browser/server route changed, so no new UI/browser acceptance claim is made.

Remaining boundaries are explicit:

- Repository-size-dependent cold/structural validation is unresolved; ordinary inline success does not qualify arbitrary edits.
- Shared-Cell fallback, full membership audit, large annotation values, large root arrays and index removal can still have synchronous costs. Huge opaque subtrees are validated for ownership even though their facts are omitted.
- Scope signatures and invalidation notifications are an explicit caller contract; production binding/discovery subscriptions are not wired.
- A live source with unresolved definitions can be incomplete even when it cannot be durably captured. Incomplete is not complete coverage and grants no persistence permission.
- No production saved hand-back verifier, worker messaging protocol, resource scheduler, whole-vault provider integration or memory-pressure policy was implemented.
- Existing full-text candidate limits, `.ink` / `.ink.md` compatibility, persistent caching and native SurrealDB ingestion remain separate work.

## 10. Recommendation and stop point

Proceed, subject to review, to **production-integration planning only** for worker-backed lightweight saved extraction, canonical live observation, conservative overlay and ephemeral TypeScript indexes behind existing C2/C3 contracts.

That plan should first resolve the cold/structural query-boundary decision and its qualification gate; specify matching opaque/profile policy, resource-owned scheduling, discovery/binding notifications, cancellation, incomplete coverage and verified saved hand-back. Reuse existing C2/C3 navigation revalidation rather than giving the index navigation or persistence authority. If the missing canonical evidence cannot be exposed narrowly, report that separately before implementation.

The semantic separation is demonstrated: serialization is not required for live knowledge observation. The remaining global validation cost is now isolated and measured. **Stop here for architectural review; no production integration or next compatibility stage is started.**

## Reproduction

```sh
node scripts/check-live-canonical-facts.mjs
npx tsc --noEmit --project tsconfig.native-knowledge.json
npm run typecheck
npx vitest run src/qualification/native-knowledge \
  src/qualification/native-b1/resource.test.tsx \
  src/qualification/native-b1/compatibility.test.ts \
  src/qualification/native-b1/owned-resources.test.ts \
  src/qualification/native-b2/markdown.test.tsx \
  src/application/canonical-backlinks.test.ts \
  src/application/flint-knowledge.test.tsx \
  src/history/stage-c-gates/portable.test.ts \
  src/history/stage-c-gates/resource.test.ts \
  src/persistence/native-session.test.ts \
  src/persistence/native-vault-session.test.ts
```
