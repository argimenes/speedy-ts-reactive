# Phase 1 implementation brief: Mutable semantic persistence and services

**Status:** implemented after the user's subsequent authorization; see the [implementation handoff](MUTABLE_SEMANTIC_PERSISTENCE_PHASE_1_IMPLEMENTATION.md) for delivered capabilities, validation and limits. This document remains the governing implementation specification. **Legacy corpus import is excluded from Phase 1.**

The governing architecture is [CODEX_LEGACY_IMPORT_PLAN.md](CODEX_LEGACY_IMPORT_PLAN.md), particularly sections 12.2–12.10, including the user's many-to-many DataSet membership correction and general ClaimQualifier definition. This brief narrows that architecture to a persistence/service increment that can be verified with synthetic fixtures before any corpus publication.

## 1. Outcome and scope

Deliver Mutable-native canonical SQLite structures and typed, vault-scoped services for temporal entities, attributed assertions and structured observations. Complete revision handling, bounded atomic mutations, durable audit delivery, queries and recovery through the existing foundation/worker/host boundaries.

Phase 1 includes:

- Enriched Entity/Relationship metadata writes and reads, preserving existing call shapes and Entity Reference behavior.
- Time as a one-to-one Entity extension.
- Claim, ClaimParticipant and general ClaimQualifier persistence and services.
- Minimal ClaimEvidence storage, attachment, listing and source-resolution diagnostics.
- DataSet, DataPoint, DataPointDimension and many-to-many DataSetMembership persistence and services.
- Typed query contracts, membership-aware counting, bounded canonical batches and durable operation outcomes.
- Feature gating, fresh/upgrade migrations, worker packaging, disposable-vault tests and operational documentation.

Phase 1 excludes reading or importing the legacy `/data` or `/graph` corpus, corpus-specific identity allocation, MetaRelation collapse, Property reconstruction, quarantine manifests and creation of imported `.ink` files. It also excludes new annotation renderers, full AI extraction, an evidence reanchoring engine, charts/table UI, comprehensive date parsing and inferred numeric conversion. Equivalent `.ink` publication/discovery support remains a later document-lifecycle task. Use synthetic native documents where evidence-resolution tests need saved files.

## 2. Semantic invariants

| Construct | Required meaning |
|---|---|
| Entity | Common identity for named semantic things. Person, Place, Concept and similar types share Entity.guid; ordinary Relationship endpoints use it. Actor remains write attribution machinery. |
| Time | Entity(Time) plus a structured temporal extension using the same GUID. Missing components remain unknown; expression, precision, approximation, certainty and extent remain distinct. |
| Claim | One identified n-ary assertion with nullable expression and extensible kind. Trait/Event/Opinion/Intention are kinds, not separate tables. Attributed statements are not promoted to endorsed facts or objective Properties. |
| ClaimParticipant | An Entity participating in a Claim under an exact, possibly nullable role and ordered incidence identity. AccordingTo attribution is distinct from the Actor who wrote the record. |
| ClaimQualifier | A **typed Entity-valued qualification of a Claim**. Role defines the qualification semantics; Entity GUID defines its value. Type-of and at-time are initial uses, not a permanent two-role limit. |
| ClaimEvidence | A retained source-generation locator linking a Claim to Document/Block/span evidence, independent of the rebuildable saved index. Evidence attachment does not certify the Claim as true. |
| DataPoint | One identified observation with raw authored value, nullable name and Entity-valued dimensions. Equal values/dimensions do not merge independently sourced observations. |
| DataSet | An analytical collection/series containing observations; it does not own their identity. |
| DataSetMembership | A unique collection/observation pair. A DataPoint can belong to zero, one or multiple DataSets without duplication. Removing a membership leaves the observation and other memberships intact. |

Preserve exact authored strings, whitespace, nulls, array order and attributes through the existing authored-value codec. Numeric-looking strings stay strings. Names and value/dimension tuples are not identity keys. Claim/DataPoint/DataSet do not get duplicate Entity records to fit Entity-only Relationship foreign keys.

## 3. Schema and migration work

Add an additive mutable schema migration, proposed name `0002-semantic-knowledge.sql`, and register the ordered step in [schema.mjs](src/knowledge-sqlite/schema.mjs). Keep the validated version-1 SQL unchanged. All new canonical tables follow Mutable's INTEGER internal key, unique public GUID, STRICT storage, revision, authored attributes and Actor/timestamp conventions.

Use the full column specifications in the approved plan; implement these essential constraints and indexes:

| Structure | Required constraints and indexes |
|---|---|
| Time | Unique entityGuid FK to Entity.guid; service enforces Time type. Nullable start/end components, distinct temporal descriptors and profile-qualified normalized bounds. Component and profile/bounds indexes. |
| Claim | Unique GUID; nullable expression and kind (`typename` in storage). Extensible kinds, indexed by kind/GUID. |
| ClaimParticipant | Claim FK and Entity FK; stable GUID; nonnegative ordinal unique within Claim; nullable exact role. Index parent/order and inverse Entity/role lookup. Permit repeated Entity/role tuples. |
| ClaimQualifier | Claim FK and Entity FK; stable GUID; nonblank role; ordinal unique within Claim. Index parent/role/order and inverse Entity/role lookup. No SQL enum restricting roles to the imported cases. |
| ClaimEvidence | Claim FK; resource/Block/property locator, source content hash, half-open range/coordinate, evidence kind and optional excerpt. No FK to derived Resource, Block or StandoffProperty tables. Index Claim and source locators. |
| DataSet | Unique GUID, nullable exact name, revision and attributes. |
| DataPoint | Unique GUID; nullable name; raw valueJson and decoded valueType; optional explicit normalized numeric projection/profile. **No DataSet ownership column or FK.** No uniqueness over values/dimensions. |
| DataPointDimension | DataPoint FK and Entity FK; stable GUID; nonblank role; nonnegative ordinal unique within DataPoint. Index parent/role/order and inverse role/Entity lookup; repeated roles/targets remain legal. |
| DataSetMembership | Stable public GUID plus `dataSetGuid` and `dataPointGuid` FKs; `UNIQUE(dataSetGuid,dataPointGuid)` and reverse index `(dataPointGuid,dataSetGuid)`. Both endpoints may occur in multiple pairs. Common revision/attributes/Actor/timestamp fields. |

Deleting Claim or DataPoint subordinate incidences follows the approved parent/child policy. Entity participant/qualifier/dimension targets and DataSet/DataPoint membership endpoints use NO ACTION protection. General parent deletes are not exposed in Phase 1: active saved references and canonical dependencies must not disappear through cascades. Membership and incidence removal are explicit audited service operations.

Validate authored-value grammar at the service boundary; SQL json_valid is necessary but insufficient. Validate public GUIDs consistently with existing canonical service rules and reject reuse across unrelated canonical storage kinds. Entity+Time intentionally share one GUID. Do not add a legacy ontology table or a new universal identity registry merely for this increment.

Use nullable normalization fields initially. Store supported temporal components and exact expression without requiring a completed parser or assigning calendar/timezone/circa policies. Reject normalized bounds lacking a supported, versioned profile; otherwise retain raw data and report unsupported normalization. The same rule applies to normalized numeric values: no arbitrary caller label can legitimize coercing a string or losing decimal precision. Unsupported normalization remains absent and does not prevent raw-value authoring.

The existing audit schema has generic AuditMutation/AuditEvent storage; it does not require parallel semantic audit tables. Use versioned payload metadata for new event/receipt contracts. Introduce an audit migration only if a concrete storage requirement cannot be represented by the existing validated schema, with a documented reason.

Update [build-sqlite-foundation.mjs](scripts/build-sqlite-foundation.mjs): it currently copies an explicit list containing only version-1 migrations and existing modules. The packaged worker must include all registered migration files and new unbundled dependencies.

## 4. Mutation and revision contracts

Define public DTOs/services in the existing [feature-api](src/feature-api) boundary and application adapters. Keep SQL/internal INTEGER IDs inside knowledge-sqlite. Every mutation carries a stable operationId; updates/removals carry expected revisions. Typed validation precedes canonical publication; a failed operation rolls back records, parent revisions and its pending audit receipt together.

| Capability | Required operations and behavior |
|---|---|
| Entity/Relationship | Add optional typename, description and authored attributes to Entity writes/reads; attributes to Relationship writes/reads. Preserve existing create/rename/alias shapes, nameKey policy, self-loops and parallel edges. Provide imported alias origin as a validated general capability without importing records. |
| Time | Get/create/update/query. Creating a new Time writes Entity+extension atomically. Adding an extension to an existing Entity requires matching type and expected Entity revision. Entity and extension have separate revisions; expression changes and display-name changes have explicit semantics. |
| Claim | Get/create/update/query aggregate expression/kind, participants and qualifiers. Child edits require expected child and Claim revisions; increment Claim revision and audit all changed records. Preserve null/omission distinctions in explicit patch versus replacement contracts. |
| Claim qualifications | Add/update/remove/list ordered qualified Entity targets. Validate nonblank roles and existing targets. Known role contracts enforce, for example, at-time→Time and type-of→Concept. Other valid Entity-valued roles remain supported; no permanent two-role whitelist. |
| Claim evidence | Attach/list/resolve minimal evidence locators with Claim revision checks and complete audit. Return resolved/stale/missing/unresolved source status. Do not rewrite an old locator on document edit. |
| DataSet | Get/create/update/query exact nullable name and attributes; list members through membership rows. |
| DataPoint | Get/create/update/query raw value/type/name and dimensions. Child dimension edits require expected child and DataPoint revisions and increment DataPoint revision. No single-collection parameter; no equality-based observation merge. |
| Membership | Add/update/remove/list using GUID, dataSetGuid/dataPointGuid, operationId and expected DataSet revision; update/remove also require expected membership revision. A successful change increments DataSet revision, leaving DataPoint revision/value/dimensions intact. Endpoints are immutable: move by explicit removal/addition. |
| Canonical batch | Bounded list of typed commands, one mutable transaction, one mutation receipt with record-specific events. Support dependent creation and multiple memberships without exposing raw SQL. Define sequential expected-revision behavior within the batch so repeated edits to a parent do not use ambiguous revisions. |

Example request contracts, with field names finalized consistently at the typed boundary:

```ts
ClaimService.create({
  operationId, guid, expression, kind, attributes,
  participants: [{ guid: participantGuid, entityGuid, role, ordinal, attributes }],
  qualifiers: [{ guid: qualifierGuid, entityGuid, role, ordinal, attributes }]
});

DataPointService.create({
  operationId, guid, name, value, valueType, attributes,
  dimensions: [{ guid: dimensionGuid, entityGuid, role, ordinal, attributes }]
});

DataSetMembershipService.add({
  operationId, guid: membershipGuid, dataSetGuid, dataPointGuid,
  expectedDataSetRevision, attributes
});
```

Return public identities, record revisions, transaction/query revision and structured diagnostics. Preserve existing legacy API return shapes where callers depend on them. Return an explicit already-equivalent/conflict outcome for an existing GUID or membership pair; do not overwrite authored data on create. Pair uniqueness merges only the same membership relation, while retaining explicitly supplied provenance through a revision-checked update; it never merges observations.

Exact operation retry comparison includes kind, endpoints, roles, order, attributes and null/omission. Maintain compatibility with pre-existing receipts' request serialization; document any new canonical request fingerprint format. A stale revision causes no new mutation; a verified identical operation retry returns its original outcome even if current revisions subsequently advanced.

## 5. Queries and source evidence

Queries run through the vault worker and return bounded, stable pagination with revision evidence, complete/continuation status and diagnostics. Extend [query-services.ts](src/knowledge-sqlite/query-services.ts) or equivalent typed dispatch rather than add a direct SQL route.

Required query coverage:

- Claim kind/expression retrieval; intersection of participant-role/Entity filters and arbitrary supported qualifier-role/Entity filters; inverse Entity→Claims lookup; ordered participants/qualifiers/evidence.
- Time component/descriptor filters and stable ordering. Profile-specific interval comparisons are supported only when a normalization profile is implemented; no inferred ranges presented as source facts.
- DataPoint retrieval, ordered dimensions and intersected dimension filters, with optional membership filters.
- DataSet→member observations and DataPoint→all containing DataSets. Use the reverse membership index for the latter.
- Collection union/intersection and counts by observation GUID. One shared observation appears once in each containing collection and once in a deduplicated union. Independently sourced equal-valued observations each contribute separately.
- Prevent membership/dimension join fan-out with EXISTS/intersection or equivalent query construction. Do not use DISTINCT on value/dimension tuples to remove observations.

Advanced statistics and charts are deferred. Any numeric aggregate exposed in Phase 1 includes only supported native/explicitly normalized values and reports excluded coverage; strings and unsupported values are not converted to zero or silently coerced.

Evidence resolution validates the source generation/hash and exact Block/span through the existing saved-file/source mechanisms. Use authoritative bytes when needed; an index match alone is not authority. Include an explicit not-verified status when no current source proof exists. A canonical locator may be retained while unresolved, with its status reported; fabricated existence or quotation is forbidden. Do not FK evidence to rebuildable standoff GUIDs, and do not claim an old hash itself retains source bytes. Full historical source-generation retention/reanchoring remains a later capability.

## 6. Audit delivery and durable outcomes

Current [entities.mjs](src/knowledge-sqlite/entities.mjs) stores bounded PendingAuditMutation request/result receipts, but no complete before/after events or delivery operation. Phase 1 must close that gap for all new semantic writes and enriched/existing Entity/Relationship mutations that use the shared canonical path.

1. In the same mutable transaction as canonical changes, persist a versioned pending payload containing the operation fingerprint/request, original result, stable event IDs, record kinds/GUIDs and complete before/after authored states. Removal events retain the deleted record's prior state. Record all parent revision changes.
2. Under the existing vault writer ownership, deliver a bounded number/byte volume of pending payloads into audit.db. Copy AuditMutation, record-specific AuditEvents and durable request/result metadata atomically in the audit database; enforce idempotent identity and full-payload equality.
3. Acknowledge/remove a pending receipt only after durable matching audit commit. A crash between copy and acknowledgement must safely redeliver without duplicate events. Check payload identity before acknowledging.
4. Resolve retries/outcome queries from both pending mutable receipts and delivered durable audit receipts. Retain original result/fingerprint after delivery; an acknowledged receipt must not make the same operation eligible for a second write.
5. Missing/unavailable audit receipt lookup must not be treated as proof of a new operation. Fail new dispatch explicitly when its prior outcome cannot be resolved; known pending retries may return their stored result without changing state. Canonical reads remain available where the vault is otherwise valid.

Preserve bounded outbox backpressure and existing request/queue/cancellation limits. A batch must count bytes and events, not conceal unbounded work in a single receipt. A cancellation confirmed before commit rolls back; loss of acknowledgement after dispatch reports outcome unknown and requires operation-outcome lookup. Never replay automatically with a new operation ID.

Handle existing version-1 receipts explicitly. They can retain original request/result as historical operation receipts, with diagnostics that before/after events were not recorded. Do not fabricate missing historical states, discard old receipts or promise retroactive complete audit coverage. Verify old retry results survive delivery, restart and backup/restore.

Expose typed audit status, bounded delivery and operation-outcome capabilities through foundation/worker/host. Delivery is not a global transaction with native files, and database backup continues to report its existing cross-database atomicity limits. Recovery must reconcile pending/delivered receipts idempotently.

## 7. Integration and feature gate

Use one proposed substantial-feature switch, `sqliteSemanticServices`, enabled by default per [AGENTS.md](AGENTS.md). Wire it through [configuration.ts](src/configuration.ts), application composition and host/worker capability checks. Preserve all existing feature defaults. When disabled, new semantic service/batch routes are unavailable; existing Entity Reference behavior remains. Disabling never drops canonical data, downgrades a schema or resumes legacy persistence. Migration validation/inspection and preservation of already stored records remain foundation responsibilities.

Extend these boundaries together:

| Boundary | Implementation responsibility |
|---|---|
| feature-api / application services | Typed contracts, encoding, structured outcomes, cancellation and disposal; no editor/DOM-dependent persistence model. |
| [sqlite-knowledge-host.ts](server/sqlite-knowledge-host.ts) | Explicit vault context, leases, feature/read-only checks, mutation classification, query evidence/invalidation and maintenance capabilities. Retain source-verified Document UI paths. |
| [client.mjs](src/knowledge-sqlite/client.mjs) / [worker-entry.mjs](src/knowledge-sqlite/worker-entry.mjs) | Typed operations, budgets, cancellation, outcome handling and dispatch; one vault-owned worker with no raw SQL transport. |
| [foundation.mjs](src/knowledge-sqlite/foundation.mjs) | Validated mutable/audit ownership, canonical transactions, audit delivery, operational status and backup/restore. |
| schema / mutation / query modules | Constraints, authored-value validation, GUID collision checks, prepared statements, revisions, events and bounded queries. |
| build packaging / existing SQLite tests | Registered migrations and modules available in both source-test and built-server paths; fresh/upgrade and recovery coverage. |

Provide an explicit host-owned vault maintenance/service context for canonical authoring independent of a Document UI. It must use the selected vault identity, valid lease, root confinement and read-only/feature policy. Do not fabricate a Document source or weaken the existing Entity UI's verified-source requirement. It exposes general semantic authoring, not a corpus importer or globally unscoped write capability.

Keep derived saved indexing separate. clearDerived, reconciliation, FTS rebuild and index coverage failures must not erase or reconstruct canonical Claims/Time/observations/memberships/evidence. Indexed specialized annotations do not become Entity references simply because their values look like GUIDs. Full specialized annotation UI/resolution integration is deferred; typed canonical retrieval remains available.

## 8. Implementation order and acceptance

Implement schema/contracts first, then shared canonical transaction/audit infrastructure, enriched Entity/Relationship services, Time, Claims/evidence, observations/membership, queries and complete host/worker composition. Finish with packaged-worker and recovery verification. This is a dependency order; each increment should include meaningful behavioral tests before expanding scope.

Use generated synthetic UUIDs, authored attributes and disposable temporary vaults. Do not use the legacy corpus as a fixture, mutate a selected live vault or populate an import destination during Phase 1 verification.

| Acceptance area | Required evidence |
|---|---|
| Migration | Fresh current schema and version-1→current upgrade; unchanged legacy data/GUIDs; transaction rollback of failed DDL; checksum/shape/vault validation; repeat migration no-op; packaged worker can find every SQL file. |
| Entity compatibility | Existing create/rename/alias/reference flows work; enriched metadata round-trips; full-payload conflicts do not overwrite rows; parallel/self-loop relationships retained. |
| Claim semantics | One Trait Claim with Subject/AccordingTo and a qualifier role beyond type-of/at-time; nullable expression/kind; exact role/wording; wrong target-kind/missing FK rejection; child/parent revision conflict rollback. |
| Time | Entity+extension atomicity; same GUID; missing hour/minute/component preserved; distinct temporal descriptors; unsupported normalization stays absent; invalid profile/bounds rejected. |
| Observation identity | Raw numeric-looking string and categorical value round-trip; two separate equal-valued/equal-dimension observations remain distinct; repeated dimension roles supported. |
| Many-to-many membership | One observation in two DataSets, two observations in one DataSet, duplicate pair rejection/equivalence, forward/reverse lookup, union/intersection counts without join fan-out. |
| Membership isolation | Removal from one collection leaves DataPoint/value/dimensions/revision and another membership intact; expected membership/DataSet revisions enforced; parent deletion blocked while links remain. |
| Audit / retry | Complete per-record before/after states; same-operation replay before and after delivery; conflicting retry rejection; old receipt compatibility; outbox limits; rollback on receipt failure; crash after audit commit before acknowledgement; audit unavailable outcome handling. |
| Worker/host | Invalid vault/expired lease/read-only/feature-disabled rejection; bounded requests and queries; cancellation before commit; unknown outcome recovery; no raw SQL or fake Document source. |
| Evidence | Exact synthetic source locator/excerpt; missing/stale/unverified statuses; changed generation never silently reanchors; index invalidation preserves canonical evidence. |
| Lifecycle | Reopen, database backup/restore, delivery recovery and clearDerived/rebuild preserve all canonical kinds; queries invalidate consistently after canonical changes. |

Run the repository's relevant SQLite and host/application suites, followed by type checking and the server/client build where integration changed. Existing commands include `npm run test:sqlite`, `npm run typecheck` and `npm run build`; use targeted Vitest suites for the TypeScript host/application paths. Once appropriate checks pass, repeat only when subsequent changes or failures require it.

Phase 1 is complete when the capabilities above run through the real service/worker boundary, acceptance checks pass, and limitations are documented. Persisted schema alone or direct-SQL tests alone are insufficient. The handoff lists migrations, public service contracts, audit recovery behavior, feature controls and test results, and explicitly confirms that no legacy corpus import occurred. Corpus mapping/publication and document lifecycle qualification belong to the next phase.
