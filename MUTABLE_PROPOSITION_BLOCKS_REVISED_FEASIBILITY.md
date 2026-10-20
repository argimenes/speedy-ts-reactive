# Proposition Blocks Revised Feasibility

20 October 2026. Research and planning only. This report covers canonical SQLite storage of standalone Proposition Blocks and **direct** StandoffProperties. No load testing was performed. Production code, registered migrations and live databases were not changed.

## Executive recommendation

**Go for the narrowed persistence feature.** A modest extension of the existing SQLite schema and transaction services can support it safely. The principal work is a controlled **two-table migration**, a small aggregate CRUD service with archive support, and compatibility tests.

The findings differ materially from the broader study:

- Rebuild **Block and StandoffProperty only**. AnnotationDefinition can retain its current schema, foreign keys and contents.
- **`resourceGuid IS NULL` is a sufficient ownership discriminator** for this scope. No storage-kind column is needed to protect rows from the current reconciler.
- Existing SQLite opening, closing, transactions, audit delivery and database backup provide the persistence infrastructure. No document session, file format, editor or new persistence subsystem is required.
- Direct annotation writes do not need the saved-document projector. Text and a complete validated annotation set can be committed together.
- The zero-width discrepancy affects future interchange with editor DTOs; it does not prevent storing explicit SQL ranges now.

Estimated implementation effort: **6–10 working days for one developer familiar with this repository**, including migration qualification, backend operations, archive support and targeted regression tests. This is a fresh estimate for the limited scope. It includes none of the excluded UI, graph, LLM, linked-definition, general Document or full import/export work.

## Minimal schema changes

The current migration registry targets v7 ([schema.mjs:9](src/knowledge-sqlite/schema.mjs#L9)). The installed SQLite runtime used for the small correctness probes is 3.50.4. Propose v8 with these changes:

| Table | Required change | Retained behavior |
| --- | --- | --- |
| Block | Make resourceGuid nullable; add nullable entityGuid referencing Entity(guid), with ON DELETE RESTRICT. | Keep globally unique guid, UNIQUE(resourceGuid,guid), all existing fields, STRICT mode and the Resource deletion cascade for non-NULL resource owners. |
| StandoffProperty | Make resourceGuid nullable; add a simple sourceBlockGuid FK; retain the composite FK; enforce NULL-safe source ownership. | Keep mandatory sourceBlockGuid, existing ranges, values, targets, indexes and deletion cascade. File-owned linked properties remain valid. |
| Entity | No column changes. | Keep required name, optional description, existing revision, attribution and FTS. Block.text is authoritative proposition text. |
| Resource | None. | Continue representing saved files only. |
| AnnotationDefinition | None. | Continue supporting definitions owned by file-backed Blocks only. |

The core declaration changes are:

```sql
-- Within the replacement Block table:
resourceGuid TEXT REFERENCES Resource(guid) ON DELETE CASCADE,
entityGuid TEXT REFERENCES Entity(guid) ON DELETE RESTRICT,
-- Retain UNIQUE(guid) and UNIQUE(resourceGuid,guid).

-- Within the replacement StandoffProperty table:
resourceGuid TEXT,
sourceBlockGuid TEXT NOT NULL,
FOREIGN KEY(sourceBlockGuid)
  REFERENCES Block(guid) ON DELETE CASCADE,
FOREIGN KEY(resourceGuid,sourceBlockGuid)
  REFERENCES Block(resourceGuid,guid) ON DELETE CASCADE
```

These are replacement-table excerpts, not standalone runnable migrations. The real migration must preserve every unmodified v7 declaration.

### Ownership validation

SQLite considers a composite child foreign key satisfied when any referencing column is NULL. Therefore the existing composite FK cannot enforce source existence for standalone annotations. The new simple FK fixes that, but does **not** prevent an annotation with NULL resourceGuid from referencing a file-owned Block. Both cases were demonstrated in the small probes. [SQLite foreign-key rules](https://www.sqlite.org/foreignkeys.html).

Add INSERT and UPDATE guards using NULL-safe equality:

```sql
CREATE TRIGGER StandoffProperty_owner_insert
BEFORE INSERT ON StandoffProperty
WHEN NOT EXISTS (
  SELECT 1 FROM Block b
  WHERE b.guid=NEW.sourceBlockGuid
    AND b.resourceGuid IS NEW.resourceGuid
)
BEGIN SELECT RAISE(ABORT,'Block resource mismatch'); END;

CREATE TRIGGER StandoffProperty_owner_update
BEFORE UPDATE ON StandoffProperty
WHEN NOT EXISTS (
  SELECT 1 FROM Block b
  WHERE b.guid=NEW.sourceBlockGuid
    AND b.resourceGuid IS NEW.resourceGuid
)
BEGIN SELECT RAISE(ABORT,'Block resource mismatch'); END;

-- Prevent reclassifying a parent while bypassing its children's guards.
CREATE TRIGGER Block_ownership_boundary
BEFORE UPDATE OF resourceGuid ON Block
WHEN NEW.resourceGuid IS NOT OLD.resourceGuid
  AND (NEW.resourceGuid IS NULL OR OLD.resourceGuid IS NULL)
BEGIN SELECT RAISE(ABORT,'Block ownership change requires explicit copy'); END;
```

These guards preserve file-owned equality and make NULL ownership a deliberate boundary. Existing reconciliation deletes/reinserts file projections; it does not need to change a Block between NULL and non-NULL resource ownership.

For the narrow feature, enforce through the service that standalone Blocks have `typename` and `authoredType` equal to `mutable/proposition-block`, non-NULL text, a declared coordinate system and an existing Proposition Entity. Standalone properties must have `resolution='direct'`, all definition fields NULL, and no linked/shared annotation identifiers hidden in decoded attributes. Existing non-NULL-resource rows remain governed by their current linked-definition semantics.

A CHECK restricting newly permitted NULL Blocks to that shape, and a conditional CHECK restricting NULL-resource properties to direct definition-free rows, are advisable database-level defenses. They are not additional tables or a requirement to support generic canonical Documents.

Use independent UUIDs for Block and Entity. For this feature's one-Block-per-Proposition-Entity contract, add:

```sql
CREATE UNIQUE INDEX UX_Block_StandalonePropositionEntity
ON Block(entityGuid)
WHERE resourceGuid IS NULL
  AND typename='mutable/proposition-block'
  AND entityGuid IS NOT NULL;
```

This avoids imposing uniqueness on unrelated future Block types. Entity type validation is required both when creating the pair and when changing a bound Entity through the existing Entity update service. It can follow the current Time/Concept validation pattern in [entities.mjs:86](src/knowledge-sqlite/entities.mjs#L86). Additional type-enforcement triggers are optional defense in depth. The Entity FK itself remains essential: deleting an Entity must not cascade into authored Block content.

No Block revision column is essential. With one canonical Block per Proposition Entity, the minimal service can use the existing **Entity.revision as the aggregate concurrency token**, incrementing it for every proposition text, annotation or archive change. Renaming that Entity also changes its revision and causes a conservative conflict. This small coupling is acceptable for the backend-only scope; a separate Block revision can be added later if independently concurrent metadata and text edits become necessary.

## Persistence and reconciliation findings

No current ordinary maintenance path was found that indiscriminately deletes all Blocks or StandoffProperties. Their ownership and cascade structure matters more than their historical description as derived tables.

| Operation | Exact path | Consequence for NULL-resource rows |
| --- | --- | --- |
| Open/reopen | [foundation.mjs:35](src/knowledge-sqlite/foundation.mjs#L35), `openValidatedFoundation` | Opens the existing mutable.db and validates it. It does not reconstruct Blocks from files on each open. A correctly registered v8 retains standalone rows. |
| Close/shutdown | [foundation.mjs:117](src/knowledge-sqlite/foundation.mjs#L117); [server/cavern-lifecycle.ts:122](server/cavern-lifecycle.ts#L122); [server/sqlite-knowledge-host.ts:276](server/sqlite-knowledge-host.ts#L276) | Closes database handles and service workers; does not delete their contents. |
| Ordinary document typing | Existing editor and manual document persistence | Does not use a proposed proposition mutation service. No new typing hook is needed. |
| Document save and subsequent indexing | [server/sqlite-saved-indexer.ts:11](server/sqlite-saved-indexer.ts#L11), `createSavedIndexer`; [saved-projection.ts:41](src/knowledge-sqlite/saved-projection.ts#L41), `projectSaved` | Produces Resource-scoped projections from saved bytes. It has no standalone row inventory to replace. |
| Read prior resource projection | [reconcile.mjs:8](src/knowledge-sqlite/reconcile.mjs#L8), `readProjection` | Selects Blocks with `resourceGuid=?`. NULL-resource Blocks are absent. |
| Incremental reconciliation | [reconcile.mjs:22](src/knowledge-sqlite/reconcile.mjs#L22), `prepareReconciliation` | Computes removed/changed IDs only within that resource. Existing ownership checks reject a saved-file GUID that is already owned by a standalone Block. |
| Full reconciliation | [reconcile.mjs:36](src/knowledge-sqlite/reconcile.mjs#L36), [reconcile.mjs:53](src/knowledge-sqlite/reconcile.mjs#L53) | Full means replace all projected Blocks for the resource. Deletion still requires both guid and resourceGuid. It is not a global Block reset. |
| Clear derived data | [schema.mjs:89](src/knowledge-sqlite/schema.mjs#L89), `clearDerived` | Deletes observed/recovered aliases, Resource rows and IndexIssues, then rebuilds FTS. Resource cascades cannot reach a Block with NULL resourceGuid. |
| Rebuild derived data | [scripts/sqlite-foundation.mjs:48](scripts/sqlite-foundation.mjs#L48) | Runs file reconciliation. Clearing first also preserves standalone rows. |
| Delete unrelated Resource | [reconcile.mjs:68](src/knowledge-sqlite/reconcile.mjs#L68), `removeConfirmed` | Deletes that Resource; only its owned Block projections cascade. |
| Backup/restore | [foundation.mjs:95](src/knowledge-sqlite/foundation.mjs#L95), [foundation.mjs:145](src/knowledge-sqlite/foundation.mjs#L145) | Existing database backup includes the rows. Restore marks Resource rows stale; it need not stale or recreate standalone content. |

**Conclusion: NULL ownership is enough for this scope.** An extra discriminator would duplicate a distinction already enforced by the source foreign keys, resource-scoped queries and ownership guards. Every proposed canonical write must require `resourceGuid IS NULL`; file projection operations retain non-NULL resource ownership. Keep identity immutable in the service.

The standalone GUID collision guard is already present: `owner && owner.resourceGuid !== projection.resourceId` in [reconcile.mjs:39](src/knowledge-sqlite/reconcile.mjs#L39). Because NULL differs from the saved resource ID, the transaction fails rather than overwriting the canonical Block. Improve the error wording if desired, but no ownership subsystem is needed.

### A necessary projector compatibility adjustment

Adding entityGuid changes the Block shape returned by `SELECT *` in `readProjection`. The saved projector currently omits that field ([saved-projection.ts:81](src/knowledge-sqlite/saved-projection.ts#L81)). Reconciliation compares entire projected row objects. An absent field differs from an explicit SQL NULL, causing unnecessary replacement on every incremental pass.

The minimal fix is to emit **`entityGuid: null` for ordinary saved-file Blocks**. The probe reproduced the needless replacement and verified that including NULL restores the incremental no-op. Do not change the derived annotation identity scheme or expand saved-file entity association semantics.

### Durability limits

Derived-index rebuilding is different from deleting mutable.db. File discovery cannot recover canonical propositions after loss of the database; existing database backup/restore is the recovery mechanism for this scope. [vault-scope.mjs:8](src/knowledge-sqlite/vault-scope.mjs#L8) already refuses to manufacture a replacement database inside damaged existing Mutable infrastructure. Keep that refusal. No full import/export or new recovery subsystem is required for this limited implementation.

## AnnotationDefinition compatibility

**AnnotationDefinition does not block the proposed model and does not need rebuilding.** Its FK is a child reference to Block(resourceGuid,guid), not a requirement that every Block own a definition. Its own resourceGuid and ownerBlockGuid remain NOT NULL ([0001-foundation.sql:117](src/knowledge-sqlite/migrations/mutable/0001-foundation.sql#L117)).

Retaining Block's UNIQUE(resourceGuid,guid) preserves a valid parent key. Existing file-owned Blocks still have non-NULL resource IDs, so existing definition rows remain valid. A standalone Block simply has zero definition rows. The same reasoning applies to existing resource-scoped BlockRelation rows.

There is a **migration execution dependency**, not a feature dependency: dropping the old Block table with foreign keys enabled can cascade into AnnotationDefinition, BlockRelation, BlockProperty and BlockTextRun. The smallest safe solution is to preserve those tables while replacing the parent under a controlled FK-disabled migration connection, then validate all foreign keys before committing. Do not loosen AnnotationDefinition's constraints or introduce standalone linked definitions to work around migration mechanics.

The revised probe rebuilt only Block and StandoffProperty and verified that AnnotationDefinition's exact CREATE TABLE SQL and rows remained unchanged. It also preserved BlockProperty, BlockRelation, BlockTextRun and an existing FTS hit. Subsequent full reconciliation preserved the fixture's file-owned linked definition and resolved segment. This establishes the SQL mechanism; the eventual regression suite must still exercise actual saved-document codecs and linked-definition fixtures.

## Minimal service requirements

Add one small typed proposition service under the existing vault-owned SQLite worker. Reuse the writer lease, immediate transactions, cancellation, read-only checks, operation receipts and audit outbox. A proposed API needs only these operations:

| Operation | Minimal contract |
| --- | --- |
| `create` | Allocate or accept stable independent Entity/Block UUIDs and an operationId. Create the Proposition Entity, Block and optional direct annotations in one transaction. Roll back all of them on failure. |
| `get` | Retrieve by Block GUID or Proposition Entity GUID in one read transaction, returning Entity, Block, direct annotations and aggregate revision. Reject a file-owned Block. No Resource, path or saved-byte evidence is required. |
| `update` | Require expected Entity revision and operationId. Accept the resulting text plus complete direct annotation set; validate and replace/upsert the set atomically, preserving supplied stable identities. Increment the aggregate revision once. Annotation-only creation/edit/removal uses the same operation. |
| `archive` | Mark a reserved, versioned archive field in Block.attributes, update attribution and aggregate revision, and audit the change. Retain text, references and Entity identity. This meets the requested “delete or archive” lifecycle with the smallest safe behavior. |

Text updates do not perform automatic reanchoring. The caller supplies annotations for the resulting text; the service rejects out-of-bounds or inconsistent data. If text changes without a replacement set, reject the request rather than silently retaining incorrect offsets. No editor, diff algorithm or annotation-system refactor is required.

Hard deletion can be deferred when archive is provided. If subsequently exposed, it must check incoming StandoffProperty references, other Block associations, entity-reference BlockProperties and other canonical dependencies before removing the aggregate. The existing Entity trigger already protects nondeleted standoff references regardless of resource ownership ([0001-foundation.sql:153](src/knowledge-sqlite/migrations/mutable/0001-foundation.sql#L153)); its “saved references” message is imprecise but its predicate remains effective. Relationships use Entity deletion cascades, so deleting a Proposition Entity blindly could erase unrelated relationships. Do not make a general Entity-delete API part of this small feature.

### Transaction and audit reuse

[canonicalLedger.mutate](src/knowledge-sqlite/canonical-ledger.mjs#L26) already supplies atomic writes and the PendingAuditMutation outbox. Its state reader only admits `canonicalTables` ([canonical-ledger.mjs:5](src/knowledge-sqlite/canonical-ledger.mjs#L5)). Add scoped snapshot support for standalone Block and its direct StandoffProperties, rather than declaring every row of these mixed tables canonical. Keep collision checks and allowed mutation shapes explicit.

Create Entity and Block within one ledger callback; calling the existing public Entity-create operation followed by a separate Block operation would leave a partial aggregate on failure. Small internal SQL helpers can be reused or extracted without replacing the transaction infrastructure. Audit annotation removals explicitly before deleting parent rows: foreign-key cascades do not automatically produce per-record ledger events.

Keep the existing 32-KiB request and 256-event limits initially ([canonical-ledger.mjs:27](src/knowledge-sqlite/canonical-ledger.mjs#L27)). Validate the number of affected old and new annotations before committing. Reject oversized aggregates clearly; do not split one save into partially committed batches. Capacity tuning and bulk import are outside this scope.

A backend `propositionPersistence` feature flag should default to enabled under the project's convention. It gates new operations, not existing document behavior or stored-data preservation. Schema support and database backups must remain valid when the feature is disabled.

## Direct annotation semantics

Direct rows can be created and retrieved with parameterized SQL and the existing authored-value codec. `projectSaved` is a file decoder/projector, not a prerequisite for StandoffProperty storage. A small direct-record validator should apply the following existing meanings:

| Field | Persistence rule |
| --- | --- |
| `startIndex`, `endIndex` | Zero-based half-open range `[startIndex,endIndex)` within the declared coordinate space. Validate upper bounds against the submitted text/boundaries; current SQL CHECKs only enforce nonnegative ordered endpoints. |
| `coordinate` | `utf16` means JavaScript UTF-16 code units; `cell` means editor cell positions. Do not relabel one as the other. The smallest initial write API can accept explicit UTF-16 ranges and defer authoring cell-coordinate rows until a caller supplies an exact cell-boundary map. Existing file-owned cell rows are unchanged. |
| `text` | Covered surface extracted from the submitted text in that coordinate space; an empty range has an empty surface. |
| `targetEntityGuid` | The target for a `codex/entity-reference`, consistent with its value. No FK: missing target Entities remain representable. |
| `value`, `valueJson` | Keep the scalar query form and lossless `encodeAuthoredValue` JSON form consistent. JSON SQL validity alone is insufficient to validate the authored-value grammar. |
| `attributes` | Preserve the complete authored property object and unknown data in authored-value encoding. For a newly accepted normalized request, construct its authored record consistently; do not replace it with `{}` or a new incompatible meaning. Retain ordinary inclusive authored offsets separately from half-open SQL columns. |
| `guid`, `authoredId`, `identityKind` | Stable canonical UUIDs, supplied/generated once and preserved on update. A new direct record can use its guid as authoredId and `identityKind='authored'`. Do not derive canonical identities from text hashes or array order. |
| `logicalGuid` | Stable direct-annotation identity; using the segment guid is sufficient for a direct-only record. No multi-segment/shared-definition grouping is introduced. |
| `resolution`, definition fields | `direct`; every definition field NULL. Reject annotationId/externalDefinition links in decoded authored attributes. Missing Entity targets do not make a direct annotation definition unresolved. |
| `isDeleted`, attribution | Preserve tombstone semantics and supplied/managed attribution. Do not interpret deletion as merely an empty range. |

The existing mapping is visible in [saved-projection.ts:130](src/knowledge-sqlite/saved-projection.ts#L130), and the encoding implementation is [authored-values.mjs](src/history/preplan-spike/authored-values.mjs).

For zero-width properties, SQL already permits equal start/end. The editor/interchange utilities use `isZeroWidth=true` with authored start=end, while the saved SQL projector currently expects authored end=start−1 ([interchange/ranges.ts:23](src/interchange/ranges.ts#L23), [saved-projection.ts:123](src/knowledge-sqlite/saved-projection.ts#L123)). Specify the normalized service input explicitly and do not round-trip it through that projector. Preserve any supplied raw convention and validate the conversion at the API boundary. A general editor correction is deferred and is not a blocker for direct SQL persistence.

## Exact implementation paths and compatibility changes

| Path | Essential change or explicit non-change |
| --- | --- |
| [schema.mjs:9](src/knowledge-sqlite/schema.mjs#L9), [schema.mjs:41](src/knowledge-sqlite/schema.mjs#L41) | Register approved v8 later; support the controlled parent-table rebuild and exact shape/checksum verification. Historical migrations remain immutable. |
| `src/knowledge-sqlite/migrations/mutable/0008-….sql` | Future two-table rebuild and approved guards/index. No migration was created or registered in this study. |
| [saved-projection.ts:81](src/knowledge-sqlite/saved-projection.ts#L81) | Emit entityGuid:null in ordinary Block rows to preserve incremental comparisons. No linked-definition changes. |
| [reconcile.mjs:8](src/knowledge-sqlite/reconcile.mjs#L8), [schema.mjs:89](src/knowledge-sqlite/schema.mjs#L89) | No ownership algorithm rewrite required; protect current scoped behavior with tests. |
| [canonical-ledger.mjs:8](src/knowledge-sqlite/canonical-ledger.mjs#L8) and a small new proposition service module | Scoped canonical state snapshots and create/get/update/archive aggregate operations. |
| [entities.mjs:86](src/knowledge-sqlite/entities.mjs#L86) | Prevent changing a bound Proposition Entity to an incompatible type. Keep name/description behavior otherwise intact. |
| [foundation.mjs:69](src/knowledge-sqlite/foundation.mjs#L69), [client.mjs:63](src/knowledge-sqlite/client.mjs#L63), [worker-entry.mjs:33](src/knowledge-sqlite/worker-entry.mjs#L33) | Add the typed operation dispatch using existing worker serialization, read-only checks and cancellation. |
| [server/sqlite-knowledge-host.ts:145](server/sqlite-knowledge-host.ts#L145) | Reuse the vault-scoped mutation pattern for a small backend route/service entry. Do not use the older `entities` path at line 125, which requires a verified document source. No new UI client is required. |
| [scripts/build-sqlite-foundation.mjs:8](scripts/build-sqlite-foundation.mjs#L8) | Include the new migration and module where required by the copy/bundle pipeline. |
| [entities.mjs:46](src/knowledge-sqlite/entities.mjs#L46) | `db-mentions` currently counts segments without a Resource join. To retain its documented saved-segment scope, filter StandoffProperty counts to non-NULL resourceGuid. Canonical mention search/count integration is deferred. |
| [entity-lookup.mjs:29](src/knowledge-sqlite/entity-lookup.mjs#L29), [saved-facts.ts:12](src/knowledge-sqlite/saved-facts.ts#L12) | Leave saved-source lookup and evidence semantics intact. They will continue excluding standalone rows; `get` is the required retrieval path for this scope. |
| [package-data.mjs:2](src/knowledge-sqlite/package-data.mjs#L2) | No full export changes. Existing selected-Entity packages do not include canonical Block text; use database backup for preservation in this phase. |

New Proposition Entities may naturally appear in existing Entity-name searches because they are ordinary canonical Entities. That requires no Explorer development and should not be represented as completed standalone text/mention integration.

## Migration risks and required tests

The two affected STRICT tables require recreation on the installed runtime. Use the standard create-copy-drop-rename procedure, retaining local row IDs, existing indexes and constraints. [SQLite ALTER TABLE guidance](https://www.sqlite.org/lang_altertable.html).

The current migration runner sets foreign keys ON and wraps migration SQL in a transaction. Disabling foreign keys inside that transaction is ineffective; the probe verified it. Introduce a narrowly scoped maintenance migration path that validates the old schema, obtains the writer lease and backup, disables FK enforcement **before** the transaction, recreates the two tables, checks row preservation and foreign keys, updates version/checksum metadata, commits, and restores FK enforcement in a finally path. Keep the application's schema validation fail-closed. [SQLite foreign-key transaction rules](https://www.sqlite.org/foreignkeys.html).

Temporarily drop/recreate triggers that reference the replaced tables, notably Entity_referenced, as needed for schema validity during rename. Preserve AnnotationDefinition, BlockRelation, BlockProperty and BlockTextRun. Ensure fresh installation and upgrade produce the same exact schema signature in `expectedShape` ([schema.mjs:19](src/knowledge-sqlite/schema.mjs#L19)). A failed migration must roll back both DDL and metadata. After canonical writes, restoring a pre-feature backup loses those writes, so do not offer an automatic destructive downgrade.

### Research checks completed

Fifteen small correctness checks ran against one disposable database with one file-owned Block and one standalone Block, not a load fixture. They covered:

- FK pragma transaction behavior and rollback of an injected migration failure.
- Two-table migration with unchanged AnnotationDefinition SQL and rows, surviving other child rows and FTS content.
- Rejection of a missing annotation source; demonstration of the NULL-resource/file-owner hole before adding guards; rejection after adding guards.
- Restricted Entity deletion and prevention of ownership reclassification.
- The omitted-entityGuid comparison bug and the explicit-NULL no-op fix.
- Actual `reconcile`, `clearDerived`, and resource deletion functions preserving canonical rows; collision rejection; full reconciliation retaining a file-linked definition.
- Exact standalone row preservation across SQLite close/reopen, and annotation cascade on standalone Block deletion without deleting its Entity.

All passed. The probe used the installed SQLite library and current migration/reconciliation functions, but did not implement a v8 application service, use a live Cavern or claim end-to-end UI qualification. Its database and temporary directory were removed immediately. No probe scripts or result artifacts were retained.

### Required implementation acceptance suite

1. Upgrade a populated v7 fixture and create a fresh v8 fixture; compare schema shape/checksums and all retained old columns. Confirm AnnotationDefinition DDL and saved linked annotation behavior remain unchanged.
2. Create Entity, Block and zero/several direct properties without Resource rows or document files. Close/reopen through the actual worker/foundation and retrieve exact text, identities, encoded values and attributes.
3. Reject wrong Entity type, missing Entity, duplicate proposition association, missing source Block, resource mismatch and linked-definition input to the standalone service. Keep unresolved targetEntityGuid valid.
4. Replace text/annotation sets atomically; test repeated mentions, overlapping ranges, UTF-16 surrogate pairs, combining characters and explicit zero-width positions. Reject stale revisions and out-of-bounds ranges without partial writes.
5. Inject failure at each aggregate write stage. Check operation-ID retries, cancellation and audit receipt delivery; preserve the existing outbox budget behavior.
6. Perform ordinary file saves/indexing, incremental reconciliation, full reconciliation, derived clearing/rebuilding and unrelated Resource deletion. Canonical rows must remain byte-for-byte equivalent. A second unchanged incremental pass must report zero changed file Blocks.
7. Reconcile a file claiming the canonical Block GUID and verify a safe failure with no data loss. Check that saved-only counts/lookups retain their agreed scope.
8. Archive the aggregate and reopen it; retain its text, references and Entity. Verify existing database backup/restore carries these rows and disabling the feature does not remove them.

These are bounded functional and regression tests. No load benchmarks or large-scale performance qualification are proposed for this study.

## Essential work and deferred work

**Essential:** two-table migration and runner support; direct source FK and ownership enforcement; nullable Entity association; one-to-one association validation; scoped canonical create/get/update/archive operations; concurrency and audit integration; projector NULL normalization; protection of Entity type and existing saved-query semantics; targeted compatibility and backup/restore tests.

**Advisable but not essential to persistence:** extra CHECKs/type triggers beyond service validation, a general non-NULL Block.entityGuid lookup index for future associations, clearer deletion-error wording and a dedicated Block revision. These are small defensive choices, not evidence that a new persistence subsystem is needed.

**Deferred and excluded from the estimate:** standalone linked/shared definitions or AnnotationDefinition changes; graph construction/indexing/traversal; LLM/AI processing; Authority Explorer or other UI; proposition editors and sessions; generic database-native Documents; semantic extraction; full import/export; native editor reanchoring and general zero-width refactoring; hard-delete workflows when archive is sufficient.

## Implementation plan and revised estimate

| Phase | Scoped output | Estimate |
| --- | --- | --- |
| 1 Schema and compatibility | Two-table migration, safe migration execution, guards/association index, immutable historical migrations, projector entityGuid:null, rollback and linked-document fixtures. | 2–3 working days |
| 2 Canonical operations | Typed create/get/update/archive service, Entity revision concurrency, validation, scoped ledger snapshots and operation receipts. | 2–3 working days |
| 3 Backend access | Foundation/client/worker and a vault-scoped host entry, read-only/cancellation/feature gating, build packaging. | 1 working day |
| 4 Qualification | Reopen, file reconciliation, archive, atomicity, backward compatibility and existing backup/restore tests; persistence documentation. | 1–3 working days |
| **Total** | **Backend persistence only; no excluded features or load testing.** | **6–10 working days** |

The migration is the highest-risk part because Block has existing dependent tables. The new operations are ordinary bounded transactional writes on infrastructure already present. No unresolved architectural dependency justifies carrying forward the earlier 23–37-day estimate under this narrower scope.
