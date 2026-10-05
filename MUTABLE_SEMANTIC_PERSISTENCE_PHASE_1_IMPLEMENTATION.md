# Phase 1: Mutable semantic persistence and services

Phase 1 implements the approved [architecture](CODEX_LEGACY_IMPORT_PLAN.md) and [implementation brief](MUTABLE_SEMANTIC_PERSISTENCE_PHASE_1_BRIEF.md). The semantic model is unchanged. No legacy corpus was imported and no live destination vault was populated. Phase 1 authoring and evidence tests use synthetic disposable vaults. An existing compatibility regression test also read the repository's `data/` samples for in-memory codec round-trips; it performed no corpus writes or publication. That corpus-reading test is excluded from the synthetic-only commands below.

## Persistence and ownership

Mutable migration 2 adds Time, Claim, ClaimParticipant, ClaimQualifier, ClaimEvidence, DataSet, DataPoint, DataPointDimension and DataSetMembership. Version-1 migration bytes/checksums remain unchanged. The registered migrations are included in the packaged server worker. Read-only version-1 vaults remain readable by existing paths and require a writable migration before semantic services can be used.

Time shares Entity identity. Claim, DataSet and DataPoint have their own canonical identities. Participants, general Entity-valued qualifiers and dimensions target Entity.guid. Membership has a public record GUID plus unique `(dataSetGuid,dataPointGuid)` endpoints and the reverse index. Neither endpoint is singly unique. DataPoint has no collection ownership column or value/dimension uniqueness rule.

Source-expression/null/role/value distinctions are retained. Claim kinds are open-ended and Trait attribution is distinct from objective Property data or write Actor attribution. Type-of/at-time are initial qualification contracts; other Entity-valued roles work. Removing one membership preserves the observation, its dimensions/revision and other memberships. Parent deletion is unavailable through Phase 1 services; incidence/membership removal is explicitly audited.

## Public services

[openSemanticServices](src/application/semantic-services.ts) opens an explicit selected-vault capability. [DTOs](src/feature-api/semantics.ts) describe the contract. It provides times, claims, dataSets, dataPoints, participants, qualifiers, dimensions, memberships, evidence and audit capabilities, plus bounded typed batch execution. Generic Entity/Relationship commands use the existing canonical service with enriched metadata; Document UI Entity operations retain verified source requirements.

Mutation commands carry operationId. Updates/removals carry expected record revisions. Claim incidence/evidence edits also carry expectedParentRevision; DataPoint dimension edits carry expectedParentRevision. Membership mutations carry expectedDataSetRevision and increment that DataSet revision, leaving DataPoint revision unchanged. Membership endpoints are immutable; move by remove/add. Batch commands use revisions sequentially against the state produced by preceding commands, with one outer operationId/Actor and receipt. One bad command rolls back the entire batch.

Aggregate creation accepts participants/qualifiers/dimensions. Edit existing child records through their revision-checked operations or a batch; parent update does not implicitly replace child arrays. Time and Entity revisions are independent; Time-expression changes do not rename the Entity display label.

Values/attributes are decoded at the application boundary and use the existing authored-value encoding on HTTP/worker wires. Direct Node worker clients supply encoded authored fields, using the shared authored-value codec. This retains undefined, negative zero, special numbers and escaped objects as supported by that existing codec; no numeric-string coercion occurs. Existing Entity reads are enriched without removing original fields/call shapes.

Queries provide exact scalar filters, participant/qualifier/dimension intersections, inverse lookups, collection union/intersection and identity-based counts. Membership/dimension EXISTS filters avoid join fan-out. Query limits are 1–100. Continuation cursors are opaque: parent-scoped ordinal incidences retain ordinal order; other pages use stable public identity order. Carry a page's revision into continuation requests to reject changed snapshots. Counts do not accept pagination cursors. Large aggregate children report incomplete coverage and can be paged separately.

## Audit and recovery

Each shared canonical mutation records before/after authored states and changed parent revisions in the same mutable transaction as its durable pending receipt. A receipt includes stable event IDs, the exact request and original result. Delivery commits the mutation/events and durable receipt metadata in audit.db before acknowledging the mutable outbox entry. It validates payload/event equality on redelivery.

Use `services.audit.status()`, `services.audit.deliver({limit,maxBytes})` and `services.audit.outcome(operationId)`. Delivery is explicit and bounded. Retry the identical operationId/payload after an unknown outcome; never automatically issue a new ID. Original record outcomes remain available after delivery, later edits, reopen and backup/restore. A differing request under an existing operation ID is rejected.

Old version-1 receipts retain original request/results with explicit `legacy-before-after-unavailable` coverage, not fabricated historical events. Audit unavailability permits canonical reads and known pending receipt lookup, but blocks new mutation dispatch when prior outcomes cannot be checked. The outbox retains the existing 10,000 receipts/16 MiB bound. Requests remain bounded at 32 KiB; batches at 100 commands and 256 changed canonical records, plus the outbox byte bound. A delivery operation accepts at most 1,000 receipts/16 MiB, defaults to 100/1 MiB, and never acknowledges a receipt outside its budget.

Cancellation checked before commit rolls back; worker loss or response loss may leave outcome unconfirmed. Operation-outcome lookup resolves pending and delivered receipts. Delivery and database backup retain their separate cross-database atomicity boundaries. Canonical records, memberships and evidence survive derived-index invalidation/reconciliation; these are not reconstructed from saved Documents.

## Evidence and deliberate limits

Evidence attachment retains Claim, resource, Block, optional authored-property ID, source hash, coordinate/range, kind and optional excerpt. It has no FK to the rebuildable Resource/Block/standoff index. Resolution requires current Document location/hash proof, verifies authoritative file identity/scope, projects the exact source units, checks any supplied authored-property identity and span scope, compares generation and span, and revalidates the source. Missing/ambiguous property identities are explicit diagnostics. Transient proof units do not participate in persisted index comparisons. Resolution reports resolved/stale/missing/unresolved/not-verified without reanchoring or claiming a proposition is true. Hashes do not retain old source bytes.

Phase 1 stores raw temporal components/descriptors and exact expressions. No calendar/circa normalization policy has been adopted, so non-null normalized temporal ranges/profiles are rejected as unsupported. Numeric normalization is likewise absent; values retain their original authored type. Charts, advanced aggregation, normalization engines, AI extraction, relationship-reference redesign and specialized annotation UI remain outside this phase. No such subsystem is required for identity/raw-value authoring.

`sqliteSemanticServices` defaults to true. Application adapters, host and worker honor disabling new semantic routes/batches; disabling does not drop data or downgrade storage. Existing feature defaults and Entity Reference behavior are preserved. Selected-vault semantic capabilities are distinct from ordinary Document leases, validate vault identity, and enforce read-only policy. No raw SQL or corpus-import transport exists.

## Verification

The SQLite suite runs serially because its files share a process-wide vault-establishment lock; parallel execution produced pre-existing EAGAIN failures. Existing host tests now reflect the already implemented rejection of missing read-only infrastructure and persistent ancestor ownership after lease expiry; production policies were not weakened.

Verification covers fresh/upgrade/rollback schema paths, canonical compatibility, n-ary Claims and general qualifiers, Time revisions, identical-but-distinct observations, membership uniqueness/isolation/inverse queries/counts, ordered pagination/stale snapshots, cancellation/atomic rollback, outbox limits, audit copy-before-ack crashes, old receipts, feature/read-only/capability checks, synthetic exact evidence, clearDerived and database backup/reopen/restore.

Completed checks: **91/91 SQLite tests**, **49/49 targeted Vitest tests across eight files** (including the existing compatibility sampling test noted above), type checking and the client/server build. The build reports its existing large-chunk warning. No architecture/schema contradiction was identified. Unsupported temporal/numeric normalization and deferred corpus/UI work remain the explicit limits specified for this phase.

Run:

```sh
npm run test:sqlite
npm test -- src/application/entity-service.test.ts src/history/preplan-spike/preplan.test.ts server/sqlite-semantic-services.test.ts server/sqlite-knowledge-host.test.ts src/knowledge-sqlite/saved-projection.test.tsx src/knowledge-sqlite/saved-facts.test.tsx src/knowledge-sqlite/live-input.test.tsx
npm run typecheck
npm run build
```

Legacy corpus import and equivalent `.ink` publication/discovery work remain separate follow-on tasks. Phase 1 adds semantic storage/services without performing either.
