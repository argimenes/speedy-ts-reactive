# Canonical Resource Boundary — Architectural Feasibility

1 October 2026. Planning only; follows the accepted [Live Canonical Facts Adapter qualification](LIVE_CANONICAL_FACTS_ADAPTER_QUALIFICATION_REPORT.md).

**Finding: a narrow repository primitive appears feasible, but the required information is not all present in today's maintained indices.** It needs bounded enrichment of existing repository bookkeeping, plus explicit evidence that resource-ownership validation applies to the admitted revision. A new consumer-maintained repository index is neither necessary nor recommended.

The achievable objective is **resource-local boundary reads after admission**, including a first read and a fresh read following a structural edit. This does **not** establish resource-local structural commits: the current general commit already clones and validates the whole repository. Eliminating that separate cost would exceed this proposal.

## 1. Existing machinery and its limits

| Machinery inspected | Reuse | Missing information / caution |
| --- | --- | --- |
| [`CanonicalRepository`](src/block-tree/repository.ts:231) reference counts | Existing per-content placement bookkeeping, updated on fast paths and rebuilt on general commits | Counts include references; they cannot identify incoming placements or distinguish owners from registrations/references |
| `locationOf` / `deriveLocations` | Placement → containing content/slot; enough to locate the parent once an incoming placement is known | No reverse content → incoming placement lookup; unplaced retained definitions have no location |
| [`BlockIdentityIndex`](src/block-tree/identity.ts:89) | Existing identity maintenance lifecycle and before/after validation pattern | Indexes authored Block IDs, not `metadata.documentId`; strict enforcement is optional. The [ordinary editor](src/reactive-editor/editor.ts:112) does not enable it |
| `PlacementIdentityIndex` | Existing placement-ID uniqueness and immutability checks | Placement identity is not semantic ownership or canonical root selection |
| [`resourceSource` / `findResource`](src/block-tree/resource-identity.ts:4) | Exact identity semantics, including metadata/fallback and ambiguity | Lookup currently scans all content records; metadata resource identity can differ from Block identity |
| [`documentRootPlacements` / `resourceOwnership`](src/block-tree/resource-registration.ts:10) | Existing root precedence, registrations, owned-external claims and resource-cycle rules | Scan globally; validation result is discarded rather than retained as admission evidence |
| `resourceOwner` | Existing structural/retained ownership semantics | Its revision-bound weak cache reconstructs a whole-state parent map. It is not already a maintained resource-local index |
| `commit`, `commitInline`, Undo/Redo | Internal operations, previous records and inverse data supply the required changes; Undo/Redo re-enter `commit` | Public `RepositoryChange` contains previous **contents**, not previous placements/root. Placement-only changes cannot be reconstructed reliably from that event alone |
| [`RepositoryCommitResult`](src/block-tree/commit-capture.ts:40) / [`HistoryChanges`](src/block-tree/compact-changes.ts:20) | Demonstrate exact before/after content, placement and root information | Opt-in capture clones/compares authored data and has observer-error semantics. Do not subscribe to History/capture merely to maintain a core invariant |

Thus a wrapper around current public query methods cannot meet the target: it would either keep scanning, guess missing information, or build the prohibited parallel index. The appropriate attachment point is the repository's own admitted-mutation path.

## 2. Smallest proposed query boundary

Provisional semantic surface, not a committed implementation/API:

- `readCanonicalResourceBoundary(resourceId)` returns explicit missing, ambiguous, invalid/unvalidated, or ready evidence for a **Document resource**.
- Ready evidence identifies the unique canonical content/root placement, explicit retained-definition keys, and a repository-instance/revision token.
- A token-bound incoming-owned-placement query exposes placement keys and existing parent/slot evidence for a requested content key. Root registration candidates remain distinguishable from semantic owners.
- `isCurrent(token)` rejects evidence after any admitted commit or repository replacement. No cross-revision lifetime promise is necessary initially.

Before returning ready, the boundary read verifies the requested resource's owned closure and retained components using those lookups: missing content/slots, conflicting retention, multiple/outside owners and resource boundaries retain their conservative behavior. This is transient validation over canonical keys, not a cached membership graph or serialized Document. Return only the requested evidence; do not export another complete resource representation.

“Ready” certifies these boundary conditions, **not** native encodability, storage eligibility, ownership transfer permission or complete authored-value validity. The existing native codec remains authoritative for persistence. Vault discovery, exact binding, pending relocation and opaque-host policy remain separate caller checks; they do not belong in this repository primitive.

Reuse the existing ownership predicates/checks through narrow accessors where factoring is needed. Keep the slow helpers as independent qualification oracles. Do not establish a second interpretation of ownership in a query service.

## 3. Minimum additional maintained state

These are proposed facets of repository bookkeeping, not a second all-content membership/ownership index:

| Facet | Minimum change | Why it cannot be derived cheaply today |
| --- | --- | --- |
| Incoming placement evidence | Enrich the **existing reference-count entry** with owning-placement witnesses and root-registration witnesses. Derive ownership categories from the canonical placement flags. Do not retain a separate parallel reference-count/owner graph | A count loses placement identity and role. Reference occurrences must not become ownership evidence |
| Canonical resource identity | Sparse identity buckets keyed by exact resource source, containing candidate canonical keys; integrate with repository identity maintenance even when strict Block-ID enforcement is disabled | Block ID and resource ID are distinct. Preserve all duplicate candidates rather than overwriting with a first/last match |
| Explicit retention | Sparse owner-content-key → retained-definition-key buckets, updated from `definitionOwnerKey` | A definition may have no placement, so location/reference indices cannot discover it |
| Validation evidence | A small current validity status for the existing resource-ownership check, plus the existing revision and repository instance identity | General admission and resource-boundary qualification are not identical; a successful unrelated validator is insufficient |

No retained content→Document assignment for every Cell/Block, transitive ownership closure, resource dependency graph, per-resource invalidation graph, Facts cache, copied payloads or persistent state is required. Incoming witnesses should extend the existing reference bookkeeping rather than coexist as a second repository-wide adjacency index. A compact singleton representation for ordinary one-owner Cells is worth qualifying to avoid one `Set` allocation per Cell.

The identity and retention buckets **are additional sparse lookup state**; this is not a zero-new-state claim. If the constraint is interpreted as forbidding even those repository-owned facets, effectively resource-local reads are not feasible with the present data structures. The specific information loss is documented above. No larger subsystem is proposed as a workaround.

## 4. Mutation and invalidation semantics

**Update inside the repository, before publication.** At construction, initialize the facets during existing state/index initialization. For commits, prepare first-before/final-after deltas from the actual operations/current/final state, including repeated operations on the same key. Install the bookkeeping with the admitted state before any change/capture subscriber can query it. Rejected mutations must leave both state and query evidence unchanged.

Required cases include content type/identity/retention changes; placement insertion, removal, retargeting and role/provenance changes; parent-slot moves even when a placement record is unchanged; and root replacement even when no content changes. General commits can initially rebuild facets in the existing `rebuildReferences`/full-validation lifecycle. Fast routes update only their affected entries and parent slots. Undo/Redo uses the same path; no History schema or replay model changes are needed.

**Use conservative revision invalidation.** Every admitted mutation expires outstanding boundary tokens, including unrelated changes. A subsequent read validates the requested boundary afresh from maintained evidence. That avoids both a dependency index and retaining a resource proof across an unclassified structural change. Tokens must include repository instance identity to prevent reuse after reopen/replacement with an equal revision number. Reads spanning asynchronous yields must recheck the token.

**Retain validation evidence, not inferred ownership.** There is an important admission gap:

- [`validateRepository`](src/block-tree/repository.ts:136) invokes `validateResourceRegistrations`/`resourceOwnership` conditionally, when registrations or owned external/resolved edges exist. The native shared host normally meets that condition; arbitrary legacy states need not.
- Fast inline/split/empty-paragraph paths bypass that general validator. Their hints prove specific graph transformations, not blanket resource validity. Payload identity and retained membership require explicit attention; an inline hint alone is insufficient.
- Multiple owned placements of ordinary content and conflicting retained membership still require the target-boundary audit; a global resource-ownership success does not settle those questions.

For already checked general admission, reuse the existing check's successful result at that revision instead of repeating its scan on first observation. When admission did not perform that check, run the **same** check once during constructor/admitted-mutation preparation and retain its outcome before publication. Do not defer an undisclosed global bootstrap to the first query. This added work must be reported, not hidden in setup.

A fast mutation may carry forward the global resource-ownership validation result only after its actual delta proves the relevant identity/claim/ancestor relationships unchanged. Qualify ordinary standoff edits and paragraph split/join/empty insertion explicitly. An unclassified change must run the existing check before claiming current validation, or leave the boundary unavailable; it must not silently retain success. No new rule should reject previously admitted legacy editor state merely to make this API appear simpler: invalid/unknown boundary status can coexist with that state, as it can with today's capture refusal.

This preserves the prior observer's conservative global ownership guard, including conflicts outside the requested resource. It does not claim incremental global cycle checking. Building an incremental resource-ownership graph solely to avoid that check would cross the proposed boundary.

## 5. Expected complexity and the honest limit

Let `N` be total repository records, `A` the requested owned closure plus retained components, `I(A)` its relevant incoming ownership/root-candidate evidence, and `Δ` the admitted mutation's affected records/slots. Bounds below are expectations to qualify, not new measurements.

| Operation | 1 / 10 / 100+ otherwise unrelated loaded resources |
| --- | --- |
| Cold boundary query **after current evidence exists** | Expected `O(A + I(A))` at each size; no whole-state enumeration |
| Query after an admitted structural edit | Same bound, recomputing A rather than reusing an old resource proof |
| Resource-ID lookup / token check | Expected hash lookup / constant-time revision comparison; ambiguity remains explicit |
| Incoming-owner / retained-definition reads | Proportional to the requested keys' actual evidence, not all loaded records |
| Classified fast mutation bookkeeping | Affected records/slots (`Δ`, including existing paragraph-sequence work); no unrelated-resource scan |
| Constructor / general structural admission | Still repository-wide; existing clone, validation and reference rebuild remain. Any additional validation pass must be measured separately |
| Unclassified fast mutation | No locality guarantee for validation preparation; full existing check or explicit unavailability |

Dependencies and incoming ownership witnesses actually involving A are not “unrelated.” Many references to A must not be mistaken for many owners. Memory grows with existing placement bookkeeping plus resource/retention buckets, not number of observed resources multiplied by repository size.

The accepted ~447 ms cold read at 100 resources is therefore a **duplicate-query-work removal target**, not a promise to remove 447 ms from every end-to-end structural edit. Measure admission, first read and their sum. If the only improvement is moving an additional full scan onto ordinary typing, qualification fails.

## 6. Ownership risks and required safeguards

Keep `external` (serialization boundary), `owned`/`reference` (semantic role), registration (non-owning retention), and occurrence (presentation) distinct. A resolved external-owned edge remains a resource ownership claim; it must not become ordinary local authored membership. Keep root-selection precedence exactly consistent with `documentRootPlacements` while validating ownership separately.

Do not collapse two owning placements from the same parent into one parent-set entry: multiplicity matters. Do not call missing owner evidence “unowned,” adopt a resource, or normalize conflicting identity. Preserve owned-resource cycle checks while allowing the separately qualified reference cycles. Retained definitions must not obtain fabricated source placements. Unknown or invalid evidence must suppress a ready result.

The greatest implementation risks are incomplete placement-only deltas, stale identity buckets after metadata changes, preserving a certificate through an over-broad fast hint, callback ordering, and per-Cell memory/typing overhead. None requires changing authored ownership, persistence or Workspace formats to investigate.

## 7. Bounded qualification plan and decision gate

1. **Repository bookkeeping proof.** In an isolated qualification, compare maintained facets to slow enumeration after construction, ordinary/general commits, placement-only/root-only operations, retargeting, registration changes, retention changes, split/join, failure, Undo/Redo and branched history. Include duplicate-operation batches and strict/non-strict Block-ID modes. Verify queries are current inside existing callbacks and no rejected mutation advances evidence.
2. **Boundary semantics differential.** Compare readiness and every returned identity/retention/incoming-placement fact to current slow helpers and the boundary checks in `captureNative`. Include duplicate canonical identity, same-parent double ownership, shared Cells, outside owners, unplaced/conflicting retention, nested and owned-external Documents, resolved/unresolved edges, reverse load order, unknown ownership and reference/ownership cycles. Keep wire/value encodability failures separate from boundary failures. Re-run complete live-versus-capture Facts comparisons as one consumer regression, not as the primitive's definition.
3. **Cold and structural cost gate.** Use real repositories at 1/10/100 and a practical 100+ size (e.g. 300). Keep A fixed; vary unrelated resource size independently. Measure first-ever query and first query after edits to A and to B: title/ID, insertion, paragraph split, subtree movement, retention and resource admission. The valid representative cases must actually return ready; unavailability is not a successful locality result. No query-result cache warmup may hide a scan. Instrument whole-state enumerations/records visited as well as medians, tail latency and caller stalls. Ready queries should visit A and its incident evidence only.
4. **Mutation-cost and failure gate.** Report initialization, admission/index maintenance, boundary read and combined latency separately; compare ordinary typing/split performance and retained heap with the accepted baseline. Invalid or unclassified evidence must remain unavailable, with fallback/global work conspicuous rather than counted as a local success. Test stale tokens, repository replacement and queries spanning mutation. Stop if maintaining the facets requires a second membership/ownership graph or materially expands input-path costs.

**Recommendation:** approve, if desired, a separate bounded repository-semantic qualification of this enrichment. Inspection supports feasibility of resource-local post-admission reads; it does not establish it by implementation or measurement. A broader promise of fully incremental arbitrary structural admission is not supported by the current architecture and is outside this proposal.

Only this report was produced. No source, query provider, production integration, persistence format or test implementation was changed; no new performance result or regression pass is claimed. Stop for review.
