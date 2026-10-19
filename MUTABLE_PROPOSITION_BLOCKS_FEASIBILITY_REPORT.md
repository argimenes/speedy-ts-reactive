# Mutable Proposition Blocks Feasibility and Architecture Report

Date: 20 October 2026. Scope: research and proposed architecture only. Repository baseline: `e89c4b7`, including the existing working-tree changes inspected during this review. No production code, registered migrations, or live databases were changed.

## Recommendation

**Conditional go.** SQLite-canonical, resource-independent Proposition Blocks fit Mutable's existing Block, Entity and standoff concepts. Use independent Block and Entity GUIDs, a nullable `Block.entityGuid` foreign key, and nullable resource ownership for canonical content. Keep `Resource` unchanged. Do not create a file, fake path, or Resource row for each proposition.

The change needs an explicit persistence boundary, an editor-session adapter, and durable export. Making two columns nullable alone would leave important application paths incomplete. In particular, existing linked annotations require a Document or Workspace owner, saved mention lookup joins Resource, package export excludes Blocks, and the canonical mutation ledger does not admit Blocks or annotations.

Three conditions should gate release:

1. Canonical content survives reconciliation, derived-index clearing, backup/restore and vault relocation, with a supported portable export/import path.
2. Native annotation editing and SQL round-tripping agree on coordinates and zero-width annotations. A focused probe confirmed an existing inconsistency described below.
3. All reads and mutations distinguish canonical Blocks from file projections; reference navigation does not require a synthetic document identity.

Use `mutable/proposition-block` as the proposed persistent Block type and `Proposition` as the Entity type. The new UI and mutation capability should have a `propositionBlocks` feature flag, enabled by default when released, as required by AGENTS.md. Disabling the feature must preserve data and leave backup/export available. Migration safety must not depend on the UI flag.

## Existing persistence and application boundaries

### Schema and writers

The registered Mutable schema is **v7**. The installed `better-sqlite3` runtime used for the probes reports **SQLite 3.50.4**. The foundation migration still defines the relevant tables. Entity is canonical; Resource, Block, StandoffProperty and AnnotationDefinition are currently file-derived. The following map identifies the principal current paths and their implications.

| Source and function | Current behavior and required adaptation |
| --- | --- |
| [schema.mjs:9](src/knowledge-sqlite/schema.mjs#L9), `migrations`, `validateSchema`, `migrate` | Seven migrations; exact SQL structure and migration checksums are validated. Migration executes in one transaction with foreign keys enabled. A parent-table rebuild requires migration-runner work, not just an eighth SQL file. |
| [0001-foundation.sql:51](src/knowledge-sqlite/migrations/mutable/0001-foundation.sql#L51) | Resource requires file path, hash, extraction profile and indexing metadata. Leave these invariants intact. |
| [0001-foundation.sql:73](src/knowledge-sqlite/migrations/mutable/0001-foundation.sql#L73) | Block has mandatory Resource ownership and globally unique GUID. BlockProperty and BlockTextRun already reference Block directly. |
| [0001-foundation.sql:97](src/knowledge-sqlite/migrations/mutable/0001-foundation.sql#L97) | BlockRelation and AnnotationDefinition use composite resource/block ownership. Standalone definitions require a third table rebuild. Standalone structural BlockRelation ownership is outside the initial proposition scope. |
| [saved-projection.ts:41](src/knowledge-sqlite/saved-projection.ts#L41), `projectSaved` | Decodes saved envelopes, validates their repository, requires a resource identity, derives UUIDs scoped by vault/resource, and projects Blocks and annotation segments. It must never become the canonical proposition writer. |
| [reconcile.mjs:22](src/knowledge-sqlite/reconcile.mjs#L22), `prepareReconciliation`, `commitReconciliation` | Reads a resource projection, checks ownership and freshness, deletes/reinserts changed file-owned Blocks. The current ownership collision test already rejects an existing Block whose resource is NULL. Keep that protection explicit. |
| [server/sqlite-saved-indexer.ts:11](server/sqlite-saved-indexer.ts#L11), `createSavedIndexer` | Discovers files, checks source fences, stages projections, and removes positively absent Resources. Canonical propositions should never enter this inventory. |
| [schema.mjs:89](src/knowledge-sqlite/schema.mjs#L89), `clearDerived` | Deletes observed/recovered aliases, Resource rows and IndexIssue rows, then rebuilds FTS. It does not issue an unconditional Block delete. Resource-independent content can survive through the proposed ownership rules. |
| [foundation.mjs:35](src/knowledge-sqlite/foundation.mjs#L35), `openFoundation` | Owns canonical database access, WAL configuration, audit integration and read-only checks. Add typed proposition operations here and through the worker/host boundary. |
| [canonical-ledger.mjs:5](src/knowledge-sqlite/canonical-ledger.mjs#L5), `canonicalTables`, `canonicalLedger` | Canonical writes have operation receipts, before/after events and a transactional audit outbox. Blocks and annotations are absent from the allowlist. Requests are limited to 32 KiB and mutations to 256 changed records; bulk imports must be bounded. |
| [entities.mjs:25](src/knowledge-sqlite/entities.mjs#L25), `canonicalEntities` | Entity creation, rename and update already support arbitrary types, UUID identity, revisions and names independent of descriptions. Entity deletion is not an exposed operation. Add a coordinated proposition lifecycle service rather than pretending an Entity-delete API exists. |
| [semantics.mjs:13](src/knowledge-sqlite/semantics.mjs#L13), semantic columns and `write` | Claim, ClaimParticipant, ClaimQualifier and ClaimEvidence provide useful existing structured semantics. They do not provide native standoff editing. Parent deletion is currently unavailable. ClaimEvidence requires a file resource and hash, so do not invent a Resource to force standalone provenance into it. |
| [package-data.mjs:2](src/knowledge-sqlite/package-data.mjs#L2), `PACKAGE_TABLES`, `extractPackageData` | Archival selection excludes Block, StandoffProperty and AnnotationDefinition. Exporting a Proposition Entity alone would omit its text. Its bounded, read-only package format is not an existing canonical restoration API. |
| [server/legacy-codex-import.ts:50](server/legacy-codex-import.ts#L50) | Import commits canonical service operations, publishes documents separately, then indexes their saved bytes. Standalone proposition import needs its own canonical operation path and identity mapping. |

New Block columns also affect reconciliation comparisons: `readProjection` reads `SELECT *`, while `projectSaved` constructs an explicit object. If the new defaults are absent from projector output, unchanged file Blocks compare differently on every refresh. Populate explicit `storageKind: 'file-derived'`, `entityGuid: null` and the chosen derived revision value, or normalize these fields before comparison. Test that a second unchanged refresh reports zero changed Blocks.

### Readers and presentation

| Source | Current restriction |
| --- | --- |
| [entity-lookup.mjs:29](src/knowledge-sqlite/entity-lookup.mjs#L29) | Saved mentions require a joined Resource with complete/incomplete status. Canonical rows with NULL resource would disappear from this search. |
| [entities.mjs:46](src/knowledge-sqlite/entities.mjs#L46) | `db-mentions` counts nondeleted annotation segments directly, plus entity-reference BlockProperties. It would include canonical rows automatically, but does not deduplicate logical mentions or apply the selector's resolution filter. Define which count each UI displays. |
| [saved-facts.ts:12](src/knowledge-sqlite/saved-facts.ts#L12) and [query-services.ts:10](src/knowledge-sqlite/query-services.ts#L10) | Saved facts require a Resource, file hash, path and extraction policy. Add a canonical-block reader with revision evidence rather than bypassing those saved-file checks. |
| [entity-service.ts:64](src/application/entity-service.ts#L64) | Entity summaries collect mentions through a vault facts scope; selector evidence carries resource IDs. Both need a canonical source variant. |
| [feature-api/backlinks.ts:4](src/feature-api/backlinks.ts#L4), [facts-backlinks.ts:29](src/application/facts-backlinks.ts#L29), [canonical-backlinks.ts:74](src/application/canonical-backlinks.ts#L74) | Existing backlinks describe Documents and resolve document/block-reference targets. An Entity for a proposition enables semantic identity, but does not automatically turn these document backlinks into proposition backlinks. |
| [document-entity-changes.ts:49](src/application/document-entity-changes.ts#L49) | The narrow watcher distinguishes changed semantic references from automatic offset shifts. Preserve this behavior; changing ordinary prose must not refresh unrelated Entity inventories. |
| [document-graph-layout.ts:3](src/features/flint/graph/document-graph-layout.ts#L3) | Current graph layout is Document-to-Entity presentation. It is not a whole-vault semantic graph engine. |
| [document-vault.ts:27](src/application/document-vault.ts#L27) and [server/cavern-lifecycle.ts:122](server/cavern-lifecycle.ts#L122) | Vault browsing is file-oriented; Cavern close disposes service hosts. A proposition catalog needs a separate bounded SQL listing and must participate in the same session/cancellation boundary. |

Legacy SurrealDB paths also remain in `server/index.ts` and `server/entity-search.ts`; they are separate from the v7 SQLite authority. New proposition operations must not fall back to those stores when SQLite is unavailable.

## Proposed ownership and identity contract

Use an explicit `Block.storageKind`, with a CHECK tying it to resource nullability:

| Kind | Resource | Authority and lifecycle |
| --- | --- | --- |
| `file-derived` | Required | Saved file; reconciler may replace the projection. Ordinary Blocks default to this kind. |
| `canonical` | NULL | Mutable SQLite; only canonical mutations may change authored content. No file reconciliation, file disappearance or index invalidation may remove it. |

NULL resource ownership could technically discriminate the two classes, but the named field makes service authorization and maintenance predicates auditable. Store this discriminator only on Block; enforce child ownership against it through resource equality and the mandatory source/owner Block FK. Do not permit changing an existing Block between storage kinds. Materialization and import create explicit copies with new identities.

`Block.entityGuid` remains nullable for ordinary and future generic Blocks. A canonical `mutable/proposition-block` must reference an existing `Entity(typename='Proposition')`. Generate independent UUIDv4 values for Block and Entity. For initial proposition authoring, enforce **at most one canonical Proposition Block per Proposition Entity**, using a scoped partial unique index. Do not impose global uniqueness on every non-NULL Block.entityGuid: other views or future Block types may legitimately represent the same Entity.

The foreign key should use `ON DELETE RESTRICT`. Entity deletion must never cascade into authored Block content. Prevent changing a bound Proposition Entity to a different type, and make the association immutable during ordinary edits. A dedicated future merge/reassociation operation can provide its own conflict policy.

Entity.name is a short independently editable label, such as “Ada's objection” or a generated “Proposition 7a93”. Keep Entity.description optional and separate. Neither is the authoritative proposition text. Renaming an Entity changes its revision but does not change the Block text, annotation offsets or identity. Text edits increment a new Block revision; annotation/definition changes in that aggregate increment it as well.

A Proposition Entity may exist temporarily within a creation transaction before its Block. Successful service commits must leave the pair complete. The FK enforces Block-to-Entity existence, not the reverse; coordinated services and an explicit integrity check must detect orphaned authored Proposition Entities. Imported unresolved references may legitimately name missing targets, and recovered Proposition Entities need an explicit recovered state rather than fabricated text.

### Deletion

Offer archive as the nondestructive default. For explicit hard deletion, check the expected Block revision, incoming standoff references, entity-reference BlockProperties, other Block associations, Relationships, Claim participants/qualifiers, Time and other canonical Entity dependencies. Existing Relationship FKs cascade, so a service must reject or explicitly handle those edges before deleting the Entity. Never silently erase unrelated relationships as a side effect.

When deletion is permitted, remove owned annotations, definitions, BlockProperties and search runs, then the Block, then its Proposition Entity, in one audited transaction. Record the children before removing them: SQL cascading alone does not produce the ledger's before/after events. On any failed dependency check, roll back the whole operation. Incoming references in undiscovered files cannot be proven absent; report saved-index coverage and preserve unresolved-reference behavior.

## Proposed schema v8 sketch

**Rebuild Block, StandoffProperty and AnnotationDefinition.** Resource, Entity and BlockRelation retain their table shapes. The snippets below describe replacement definitions and new guards, not a migration to run against a live Cavern.

For Block, retain all v7 columns and constraints, change `resourceGuid` to nullable, and append:

```sql
-- Replacement Block.resourceGuid declaration:
resourceGuid TEXT REFERENCES Resource(guid) ON DELETE CASCADE,

-- Additional Block columns:
storageKind TEXT NOT NULL DEFAULT 'file-derived'
    CHECK(storageKind IN ('file-derived','canonical')),
entityGuid TEXT REFERENCES Entity(guid) ON DELETE RESTRICT,
revision INTEGER NOT NULL DEFAULT 0 CHECK(revision >= 0),

-- Additional table constraints; keep UNIQUE(resourceGuid,guid):
CHECK (
    (storageKind='file-derived' AND resourceGuid IS NOT NULL)
    OR (storageKind='canonical' AND resourceGuid IS NULL)
),
CHECK (
    storageKind!='canonical'
    OR (text IS NOT NULL AND coordinate IS 'cell' AND cellCount IS NOT NULL)
),
CHECK (
    storageKind!='canonical' OR typename!='mutable/proposition-block'
    OR entityGuid IS NOT NULL
)
```

The cell constraint is a deliberate initial authoring contract. Generic UTF-16 canonical text can be added after its editing adapter is qualified; the existing file-derived `cell` and `utf16` behavior remains valid. SQL `IS` avoids accidentally allowing NULL through a CHECK expression. Service validation additionally checks exact text length, cell boundaries, annotation ranges and the canonical attribute envelope.

For StandoffProperty, retain every v7 field, index and CHECK, replacing its ownership declarations with:

```sql
resourceGuid TEXT,
sourceBlockGuid TEXT NOT NULL,

FOREIGN KEY(sourceBlockGuid)
    REFERENCES Block(guid) ON DELETE CASCADE,
FOREIGN KEY(resourceGuid,sourceBlockGuid)
    REFERENCES Block(resourceGuid,guid) ON DELETE CASCADE
```

The simple FK protects canonical rows when resourceGuid is NULL. Retaining the composite FK preserves existing file-owned constraints, but it is not sufficient by itself: SQLite exempts a composite child key containing NULL. Add ownership guards on both INSERT and UPDATE. [SQLite foreign-key rules](https://www.sqlite.org/foreignkeys.html).

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
```

AnnotationDefinition needs corresponding changes for locally shared canonical annotations:

```sql
-- Replacement declarations within AnnotationDefinition:
resourceGuid TEXT,
ownerBlockGuid TEXT NOT NULL,
UNIQUE(ownerBlockGuid,annotationId),
FOREIGN KEY(ownerBlockGuid)
    REFERENCES Block(guid) ON DELETE CASCADE,
FOREIGN KEY(resourceGuid,ownerBlockGuid)
    REFERENCES Block(resourceGuid,guid) ON DELETE CASCADE
```

Global Block GUID uniqueness makes ownerBlockGuid plus annotationId sufficient. Keeping only the old UNIQUE(resourceGuid,ownerBlockGuid,annotationId) would allow duplicate definitions under NULL resource ownership. Add the same two ownership triggers to AnnotationDefinition, substituting `ownerBlockGuid` for `sourceBlockGuid`.

New indexes and parent ownership protection:

```sql
CREATE INDEX IX_Block_Entity ON Block(entityGuid)
    WHERE entityGuid IS NOT NULL;
CREATE UNIQUE INDEX UX_Block_PropositionEntity ON Block(entityGuid)
    WHERE storageKind='canonical'
      AND typename='mutable/proposition-block'
      AND entityGuid IS NOT NULL;
CREATE INDEX IX_Block_Canonical ON Block(typename,guid)
    WHERE storageKind='canonical';
CREATE INDEX IX_Definition_Owner ON AnnotationDefinition(ownerBlockGuid);

CREATE TRIGGER Block_ownership_immutable
BEFORE UPDATE OF guid,resourceGuid,storageKind ON Block
WHEN NEW.guid IS NOT OLD.guid
  OR NEW.resourceGuid IS NOT OLD.resourceGuid
  OR NEW.storageKind IS NOT OLD.storageKind
BEGIN SELECT RAISE(ABORT,'Block ownership immutable'); END;
```

Add INSERT and UPDATE triggers for canonical Proposition Blocks requiring `EXISTS(SELECT 1 FROM Entity WHERE guid=NEW.entityGuid AND typename='Proposition')`. Add an Entity `BEFORE UPDATE OF typename` guard prohibiting a non-Proposition type while such a Block exists. Add a Block association/type immutability guard for an existing canonical Proposition Block. These cross-table rules belong in triggers because a simple CHECK cannot validate another table.

Keep targetEntityGuid, targetBlockGuid and definition target fields without FKs. They represent references, including unavailable targets. Extend `Entity_referenced` wording to cover stored references, and extend its predicate to nondeleted `BlockProperty` entity references as well as StandoffProperty. The latter extension is a proposed consistency improvement; the existing trigger and the SQL probe protect standoff references only.

No separate Proposition table is needed. BlockProperty can already attach to a canonical Block via its simple FK. BlockTextRun remains a rebuildable text-search projection. BlockRelation remains resource-scoped in this phase: a proposition is one annotatable text Block, not a standalone owned subtree.

### Migration execution and rollback

The local runtime requires table recreation for these changes. Use SQLite's create-copy-drop-rename procedure, preserving STRICT declarations, explicit column lists, indexes and triggers. Do not rename the old parent first and accidentally retarget children. [SQLite generalized ALTER TABLE procedure](https://www.sqlite.org/lang_altertable.html), [STRICT tables](https://www.sqlite.org/stricttables.html).

1. Acquire the vault writer lease, stop background work, close competing application readers/writers, validate the v7 checksum/shape, and make a verified database backup. Check free space for the rebuilt tables and journal.
2. Disable foreign keys on the migration connection **before** beginning the transaction. The current `migrate` function enables FKs and starts its own transaction, so it needs an explicit maintenance-migration path. Putting `PRAGMA foreign_keys=OFF` inside migration SQL will not work.
3. Begin an immediate transaction. Capture the relevant index/trigger definitions, including Entity_referenced. Create the three replacement tables and copy old rows with explicit columns, retaining local IDs and initializing Block defaults.
4. Drop/recreate dependent triggers as needed; remove the three old tables with FK enforcement disabled, then rename replacements to their final names. Restore old indexes and create new guards. Keep BlockProperty, BlockRelation and BlockTextRun rows intact.
5. Assert row preservation, `foreign_key_check` and integrity checks. Verify FTS content against its external-content tables. Update schema metadata/checksum/user_version in the same transaction using the approved runner. Make `expectedShape` replay the same final schema for fresh and upgraded databases.
6. Commit; restore and verify FK enforcement in a finally path. Reopen the application only after validation succeeds. Do not edit the historical migration files or their hashes.

The small SQL probe preserved all six fixture tables, including existing child rows and a BlockSearch hit, and rolled back an injected failure. It also verified that changing the foreign-key pragma inside a transaction has no effect. These are mechanism checks, not full release qualification. Disabling FKs without this controlled path would be unsafe because dropping a referenced table with FKs enabled can invoke cascades. [SQLite foreign-key behavior](https://www.sqlite.org/foreignkeys.html).

Before commit, rollback restores the previous schema and data. After commit but before canonical writes, recovery may restore the verified v7 backup. After canonical writes, an old backup would lose new authored content: keep v8 and disable the feature, or export/restore all new canonical data through a supported tool. Do not offer a destructive automatic downgrade. Pending audit receipts containing new record kinds must also remain readable.

## Annotation fidelity and editing

### Reusable components and required adapter

Reuse the existing editor's immediate cell editing, caret/selection/IME behavior, undo operations, rendering and range mapping. [TreeCommands.replaceInlineRange](src/block-tree/commands.ts#L730) creates text cells by JavaScript code-point iteration and calls [mapStandoffPropertiesForReplacement](src/interchange/ranges.ts#L30). Cells are not universally interchangeable with UTF-16 offsets or grapheme clusters. Preserve explicit boundaries when importing existing cell streams.

[RangeAnnotations.apply](src/runtime/range-annotations.ts#L16) already creates UUID-backed ordinary properties. However, [LinkedAnnotations.createBatch](src/runtime/linked-annotations.ts#L46) requires `resourceOwner`, even for a one-segment group. [resourceOwner](src/block-tree/resource-identity.ts#L30) recognizes Document/Workspace ownership, and a bare standoff Block has none. The current legacy decoder also special-cases `standoff-editor-block` when constructing cells ([codecs.ts:57](src/block-tree/codecs.ts#L57)). Registering a new type name alone is insufficient.

Introduce a canonical text-session adapter that builds a bounded repository view for the edited Block and supplies a definition-owner capability. Reuse the standoff renderer through explicit type/capability registration. Do not persist a fake Document wrapper. Narrow document-specific toolbar, search, annotation and save commands to operate on the active canonical session where appropriate.

### Canonical representation

Block.text is authoritative text; Block.attributes should contain a versioned canonical editor envelope with cell boundaries, block metadata, provenance and any supported inline-object descriptors. Avoid a second authoritative copy in Entity or an embedded full Document. Initially author plain text cells with native standoff properties; reject unsupported inline object edits with a clear message rather than flattening them. Supporting existing rich cells later requires lossless payload and managed-asset references.

StandoffProperty.attributes retains the complete authored property, including unknown fields, affinity and original inclusive offsets. SQL range/value/target columns are validated query projections computed from that authored record within the same canonical transaction. They must never be edited independently. This preserves the distinction already present in file projections without making the file projector the canonical writer.

| Field group | Proposed canonical contract |
| --- | --- |
| `guid`, `authoredId`, `identityKind` | Allocate a stable UUIDv4 at annotation creation; use it for guid and authoredId, with identityKind `authored`. Retain original imported IDs in provenance when remapping is necessary. Never regenerate identity from array order, text hashes or mutable offsets. |
| `logicalGuid` | Direct annotation uses its stable annotation identity. Segments sharing a local definition use that definition's stable canonical identity. Preserve grouping through edits and serialization. |
| `resourceGuid`, `sourceBlockGuid` | NULL resource and mandatory canonical source Block. Canonical guards prohibit attaching the segment to a file-owned Block by accident. |
| `startIndex`, `endIndex`, `coordinate` | Validated half-open SQL ranges. Ordinary ranges use native cell units. LLM/export UTF-16 ranges are generated from the boundary map. |
| `resolution`, definition fields | `direct` for self-contained properties; `resolved` only for a definition available in the declared scope; otherwise `unresolved`. Definition hashes record the effective definition used. |
| targets and values | Preserve unresolved target IDs and the lossless authored-value encoding. Entity existence is independent of definition resolution. |
| `isDeleted`, attribution | Preserve tombstones and authored attribution. Deletion of a local definition makes its segments effectively deleted; update them atomically. Canonical audit retains removed record states. |
| `topology` | Keep NULL until a defined consumer requires it. |

Initially support definitions owned by the same canonical Block. Preserve external file/workspace definition descriptors without fetching or silently resolving them. Cross-proposition shared definitions require an explicit canonical-block target variant and dependency tracking; the existing external-definition source vocabulary must not be overloaded with a fake Resource ID. A missing definition is an unresolved reference, not permission to discard annotation attributes or invent meaning.

### Confirmed zero-width incompatibility

The editor's `replacePoint` and interchange tests represent a point with `isZeroWidth=true` and `start===end`. The saved projector requires `end===start-1`, then emits an equal-start/end UTF-16 SQL range ([saved-projection.ts:121](src/knowledge-sqlite/saved-projection.ts#L121)). The probe established:

- For `A😀B`, an editor point at cell boundary 2 with start/end 2 is rejected by the saved projector with “marked zero-width annotation is not collapsed”.
- The projector accepts start 2/end 1 and emits `[3,3)` in UTF-16.
- Inserting a cell at position 0 moves the editor-shaped point to 3; the projector-shaped point bypasses the mapper's point branch because its end is already less than start, and remains at 2.

Adopt one explicit boundary conversion: native point `start=end=k`, SQL point `[u,u)` generated from the cell boundary map, with affinity retained. Convert back on loading. Verify legacy variants explicitly rather than applying an unversioned heuristic to all annotations. This is a release blocker for claiming native annotation fidelity; no production fix was made during this investigation.

### Atomic saves and low-latency typing

Typing changes only the active in-memory session and cheap dirty state. A proposition Save action or Command-S commits to SQLite; ordinary Document Command-S continues saving its opened Mutable JSON filename. No background document saves or Markdown sidecars are introduced.

On explicit save, validate the bounded Block aggregate, compare expected Block revision, write text/properties/definitions and their query projections, update BlockTextRun, and enqueue canonical audit events in one transaction. Use a stable operation ID for retries and query the receipt when an interrupted request has an unknown outcome. Preserve the local edit buffer on conflict or failure; never overwrite a newer revision silently.

The ledger must admit only canonical rows, including their owned annotation/definition/property records. Simply adding the mixed Block table to a global canonical allowlist would also admit file projections. Audit identity, collision detection and snapshot reads need storage-aware predicates. The 256-event and 32-KiB limits require bounded import batches and a reviewed large-aggregate policy, not hidden partial saves.

Semantic inventory updates occur only when reference identity, target, deletion or definition semantics change. Ordinary offset rebasing updates ranges without rebuilding the graph or Entity summaries. Resolve current ranges at preview/navigation time. Keep DOM measurements shared and frame-coalesced, preserve the editor's geometry validity rules, and never add a vault scan or full-document snapshot to typing.

## Search and graph construction

Provide a typed source locator, for example `{kind:'canonical-block', vaultGuid, blockGuid, revision}`, alongside the existing saved-resource locator. Search results, mention evidence, backlinks and navigation must carry the variant explicitly. Missing canonical targets remain navigable as unresolved identities without a filename.

Mention lookup can combine two bounded branches: valid saved-file mentions with current Resource coverage, and canonical mentions joined to canonical Blocks. Keep Entity existence optional for graph stubs, while the Entity selector can continue returning actual Entities. Preserve definition-resolution and deletion filters. Use `(targetEntityGuid,typename)` for reverse lookup and `(sourceBlockGuid,typename,startIndex,endIndex)` for outgoing ranges. Count distinct logicalGuid when presenting logical mentions; retain separate segment counts where useful.

BlockSearch/BlockTextRun already provide an FTS substrate. Add canonical text search and typed navigation; existing fact/search adapters do not become standalone-aware merely because FTS contains rows. EntitySearch indexes labels/descriptions and must not be mistaken for proposition full-text search.

Represent a Proposition Entity as an Entity node with an attached Block locator, avoiding duplicate semantic nodes for the same proposition. Construct mention edges from active standoff entity references, retaining logical annotation identity, segment IDs, ranges, source revision and resolution. A proposition mentioning two people yields two mention edges. It does not establish a relationship between those people.

Load authored Relationship edges separately. Inferred edges require inference provenance, review state and the source proposition revision; never promote model inference to an authored fact automatically. Contradictions can coexist as separately attributed propositions and explicitly typed relationships. No proposition has an implicit truth flag.

First-order traversal follows a selected node's typed adjacent edges. Second-order traversal expands the resulting frontier with a visited set, depth/node/edge/time budgets and an explicit truncation marker. Popular entities create large neighborhoods even at depth two. Keep unresolved targets as stubs; cycles and self-references are ordinary graph structures. Load texts and annotation detail lazily, and cap the visible graph independently of stored graph size.

Use a worker for graph reads/building, anchored to the Cavern session and a consistent SQL revision. Apply committed semantic deltas to adjacency, and reload only affected node labels or annotation identities. A gap in the change stream invalidates the affected cache or initiates a cancellable rebuild. `data_version` alone is insufficient for same-connection changes; the existing SQL revision combines it with total_changes, but a future typed change stream should avoid invalidating everything for an unrelated file-index commit.

### Completed measurements and limits

Load testing was stopped at the user's request. The last scheduled process had already completed when cancellation was checked. All probe/benchmark scripts, raw outputs, SQL sketch files and temporary databases were then removed at the user's request; no further load tests were run.

The completed synthetic measurements used Node 22.12.0, SQLite 3.50.4 and an Apple M1 with 8 GiB RAM. Each proposition had a 240-character text, three reference segments in the main series, one additional Person Entity per ten propositions, and one separate semantic relationship per ten propositions. References included cycles and a popular-entity hub. A density-eight case was also completed at 100k propositions.

The benchmark read a narrow on-disk SQL projection into a node dictionary and typed-array forward/reverse adjacency, retaining ranges and loading text lazily. It used three constructions per fixture, a 16-MiB SQLite cache, and explicit garbage collection around memory samples. The first construction used a reopened connection, but OS caches were not flushed.

| Propositions | References each | First construction | Subsequent constructions | Retained heap after first build | Array buffers after first build | Peak process RSS | Narrow fixture size |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1,000 | 3 | 7.0 ms | 5.4–5.5 ms | 4.5 MiB | 0.1 MiB | 50.4 MiB | 0.49 MiB |
| 100,000 | 3 | 464 ms | 425–427 ms | 24.8 MiB | 7.7 MiB | 159.9 MiB | 48.54 MiB |
| 1,000,000 | 3 | 13.30 s | 12.52–12.59 s | 209.6 MiB | 77.1 MiB | 428.8 MiB | 491.39 MiB |
| 100,000 | 8 | 984 ms | 887–898 ms | 24.8 MiB | 19.2 MiB | 200.1 MiB | 70.71 MiB |

These figures are **not production startup or database-size estimates**. The narrow fixture omitted full authored attributes, real GUID joins/remapping, production indexes/constraints, FTS and audit, and used synthetic surfaces rather than a real annotated corpus. No renderer, IPC or editor latency was measured. Peak RSS includes setup and repeated builds, not only retained graph objects. The small sample does not support a p95 claim.

Two-hop traversals completed within approximately 0.05–1.36 ms in these fixtures, but the larger cases hit the 2,000-node cap. That demonstrates the value of truncation, not cheap exhaustive traversal. Fetching 100 texts took approximately 0.9–3.2 ms locally. At one million propositions, even this restricted construction takes seconds: require lazy neighborhood access, cancellable optional graph construction and bounded display. Do not put a full graph build on Cavern startup or the input thread.

## LLM interchange and provenance

Use ordinary JSON with an Entity dictionary, uninterrupted text, and numbered references. IDs below are illustrative compact source identifiers; production payloads retain the actual UUIDs and revisions. The offsets in this example were checked with JavaScript UTF-16 slicing.

```json
{
  "version": 1,
  "coordinate": "utf16",
  "entities": [
    {"n": 1, "id": "entity-ada", "type": "Person", "label": "Ada"},
    {"n": 2, "id": "entity-earlier-claim", "type": "Proposition", "label": "Earlier claim"},
    {"n": 3, "id": "entity-objection", "type": "Proposition", "label": "Ada's objection"}
  ],
  "texts": [
    {
      "blockId": "block-objection",
      "entity": 3,
      "kind": "proposition",
      "revision": 4,
      "text": "Ada doubts that the earlier claim is correct.",
      "references": [
        {"n": 1, "annotationId": "annotation-ada", "entity": 1, "start": 0, "end": 3},
        {"n": 2, "annotationId": "annotation-claim", "entity": 2, "start": 20, "end": 33}
      ],
      "provenance": {"origin": "authored", "review": "unreviewed"}
    }
  ]
}
```

Dictionary numbers are payload-local aliases, never persistent identities. Sort texts by a declared stable selection order and references by start/end/annotation ID; number them deterministically. Preserve overlaps and repeated mentions as separate references. Include logical IDs when linked segments occur. Unknown targets can have dictionary entries marked unresolved. A poem or passage uses another `kind` and may omit `entity`, without needing a new language or ontology.

Generate offsets from the actual text and cell boundary map. Validate bounds, safe UTF-16 boundaries and optional quoted surfaces, including zero-width points. Reject duplicate dictionary numbers, missing IDs, stale revisions and incompatible source coordinates before serialization. Do not normalize Unicode silently after computing ranges.

For model-generated annotations, request a quoted surface with context, such as `{"surface":"earlier claim","prefix":"the ","suffix":" is correct","entity":2}`. Resolve anchors locally against the unchanged proposed text. Repeated or ambiguous matches require disambiguation/review; a model-supplied offset is only a hint. Drafts pass the same range validation and review as human imports before becoming canonical.

Select a bounded graph neighborhood, include the seed and provenance, deduplicate shared Entities, and expand only on demand. As an initial planning assumption, a short English proposition plus IDs and several references may consume roughly 100–250 tokens; that is not a measured tokenizer result. Count with the actual chosen model's tokenizer before sending, reserve room for instructions/output, and truncate by whole propositions with explicit continuation IDs.

Keep user-authorized selection local until transmission is requested. Show the selected texts and optional provenance/context, avoid automatically following private references, and exclude unnecessary actor metadata. Treat all proposition text and quoted sources as untrusted input data: their instructions cannot authorize tool calls, expand export scope or commit inferred claims. Validate returned IDs and anchors against the sent selection.

Source-backed assertions should preserve source resource/block IDs when available, the exact saved hash/revision, excerpt and capture time, and actor/review provenance. Use versioned canonical attributes for initial proposition provenance; existing ClaimEvidence remains available for actual Claims with file-backed evidence. Neither a source citation nor review approval makes the proposition true.

## Recovery and portability

[openFoundation.backup](src/knowledge-sqlite/foundation.mjs#L93) already uses SQLite's backup API, verifies database structure/integrity and records hashes. It includes pending canonical audit receipts in mutable.db. The manifest explicitly says database-only and not atomic across mutable/audit databases. This is a suitable base for proposition durability; a raw copy of a live WAL database is not an equivalent backup. [SQLite Online Backup API](https://www.sqlite.org/backup.html).

[restoreSnapshot](src/knowledge-sqlite/foundation.mjs#L133) restores into an empty destination, validates hashes and marks Resources stale. Canonical proposition rows should remain usable immediately; saved file projections require file restoration/reconciliation. [inspectVaultScope](src/knowledge-sqlite/vault-scope.mjs#L8) already refuses to manufacture a new database in damaged existing infrastructure. Preserve that behavior. Deleting `.mutable` and rebuilding from `.ink` files cannot recover standalone propositions, just as it cannot recover arbitrary canonical Entity knowledge.

Provide two distinct portability operations:

- A verified vault database backup/restore preserving the same vault identity, plus independently included document/assets when a full Cavern backup is intended.
- A bounded, versioned canonical content export/import carrying selected Blocks, Entities, raw annotation attributes, definitions, provenance and optional referenced knowledge. Preserve UUIDs into an empty destination; resolve collisions explicitly in an occupied vault and remap all selected references together. Keep unresolved external targets as such. Include hashes, counts, encoding and dependency reports; importing a read-only archival package must not silently execute its SQL.

Extend package selection to include the canonical Block behind a selected Proposition Entity and its annotation/definition closure. Include canonical BlockProperties where supported. Exclude file-derived rows except as explicitly selected document material. Audit and FTS are not substitutes for authoritative text export. A full index reset should rebuild canonical search runs from canonical text and file search runs from files, without regenerating canonical annotation GUIDs.

Vault switching must cancel reads, prevent old-session writes, dispose graph caches and preserve dirty buffers until explicitly saved or discarded. Reopening a Cavern loads the SQL catalog without discovering a proposition file. Same-vault restore retains identity; cross-vault import needs an explicit collision policy. File-only sync does not synchronize propositions. A future sync mechanism needs revision-aware canonical mutations or an explicit database transfer protocol; this proposal does not claim an existing multi-writer sync solution.

## User workflow

Add a Propositions collection in Flint, backed by paginated SQL reads. Creation opens a lightweight text editor and label/provenance controls, not a new file dialog. The initial committed operation creates Entity and Block atomically. Support multiline qualified prose, with no one-sentence restriction. A practical byte/annotation budget can protect requests without defining the meaning of a proposition.

In Ink, open the same canonical text session or a reference presentation with an explicit canonical locator. An embedded view must not serialize the canonical Block as an owned file Block using its original GUID. This would collide with global Block identity during indexing. A view can navigate to the canonical editor; exporting a materialized document makes fresh Block/annotation IDs and records origin metadata.

Entity Explorer shows the Proposition label and opens its text through Block.entityGuid. Search distinguishes label matches from text matches, and shows stored/live coverage. Graph views distinguish mentions, authored relationships and reviewed inference. Review actions preserve uncertainty and attribution; contradictions remain visible instead of being merged by similar wording.

Bulk import first previews texts, targets, anchor matches, provenance and conflicts. Commit bounded independent aggregates with operation receipts and explicit progress. Do not infer Entity identity from matching names. Source extraction and LLM suggestions enter a review queue, and user acceptance is an explicit canonical mutation.

“Materialize as Document” creates a normal editable document with copied text and annotations, fresh structural identities, and provenance linking back to the proposition revision. Its subsequent manual saves follow existing Document rules. It is a copy unless a separately designed reference view says otherwise; edits must never ambiguously update both authorities.

## Alternatives

| Approach | Benefits | Costs and fit |
| --- | --- | --- |
| Nullable resource ownership plus Block.entityGuid | Reuses native text/annotation concepts and reference identity; no per-proposition files; generic canonical text remains possible. | Three table rebuilds, ownership guards, editor adapter and export changes. Best fit if durability and fidelity gates are met. |
| Entity.description plus Entity-owned annotations | Avoids mixed Block authority initially. | Requires another canonical annotation model and editing adapter, duplicates text semantics, complicates native cell fidelity and general passage support. Smaller apparent DDL change, larger conceptual divergence. |
| One ordinary shared file Resource containing many Blocks | Existing native save/recovery and linked-definition ownership mostly apply; fewer files. | Canonical authority stays in a shared file, aggregate saves/conflicts grow with collection size, and independent lightweight mutations are harder. Valid fallback if SQLite canonical storage is deferred; does not meet the preferred authority model. |
| Synthetic SQL-only Resource | Could satisfy existing NOT NULL columns. | Requires fake path/hash/index fields and makes discovery/reconciliation semantics misleading. Reject. |
| Existing Claim.expression and participants | Useful for structured claims and existing canonical audit/revisions. | No native standoff text ownership or Proposition Entity bridge; introduces a Claim-centric model the brief does not require. Use selectively alongside propositions, not as the mandatory representation. |
| Association table instead of Block.entityGuid | Allows many-to-many mappings and role metadata. | Extra joins, lifecycle rules and UI ambiguity without a demonstrated requirement. The nullable FK works with global Block GUID uniqueness. |
| Entity.attributes mapping or shared Block/Entity GUIDs | Few immediate schema changes. | Hidden unenforced linkage or coupled identities, weak orphan/deletion guarantees. Neither is preferred. |

## Implementation phases and acceptance gates

Estimates are engineering judgment for one experienced contributor, including focused tests and review. They are not measured delivery times. A credible initial release is roughly **23–37 working days**, excluding a general distributed sync system and unrestricted cross-proposition definition sharing.

| Phase | Effort | Deliverable and gate |
| --- | --- | --- |
| 1 Migration and authority | 4–6 days, high risk | Reviewed v8 runner and table rebuilds; ownership guards; defaults and no-op reconciliation comparisons; verified backup and rollback. Ordinary Blocks keep NULL entityGuid. Wrong Entity type, duplicate proposition association and restricted Entity deletion all fail safely. |
| 2 Canonical service and recovery | 5–8 days, high risk | Typed operations, expected revisions, operation receipts, audit closure, export/import and restore. Create 100 propositions with zero Resource rows and no proposition files; reopen Cavern and compare exact text/annotations. Rebuild all file projections without changing canonical bytes/identities. |
| 3 Native editor and annotations | 5–8 days, high risk | Canonical session, manual Save, renderer adapter, zero-width normalization and local linked definitions. Unicode, repeated mentions, overlaps, insertion affinity, deletion, paste and undo/redo round-trip across reopening. |
| 4 Search references and workflow | 4–6 days, medium/high risk | Canonical source locators, search, Explorer, backlinks, review/import and coordinated deletion. Reference a Person and another Proposition; both directions navigate with accurate coverage. Missing targets and unresolved definitions remain intact. |
| 5 Graph and interchange | 3–5 days, medium risk | Bounded first/second-order graph, semantic deltas, provenance, dictionary/text payload and anchored model output validation. Cycles terminate; co-mention produces no inferred relationship. Verify every payload surface and offset. |
| 6 Release qualification | 2–4 days, high consequence | Restore/relocation/export drills, feature-off data access, failure injection, typing regression and documentation. Large-scale load qualification remains paused by the user's instruction. |

Additional measurable acceptance criteria:

- Inject failure after Entity creation, after text writes, after annotation writes and before audit publication: either the entire aggregate commits once or no part commits. Retrying the same operation ID produces the same result; altered retry payloads fail.
- Prove NULL resource annotations cannot refer to missing or file-owned source Blocks; mismatched non-NULL resource IDs also fail. Updating a parent resource/storage kind must not bypass child invariants.
- Run full and incremental file reconciliation twice; the second unchanged run must report zero changed file Blocks. A saved file claiming a canonical Block GUID must fail without modifying either authority.
- Count removed rows and audit events during proposition deletion. Unrelated Entities, file projections and relationships must remain identical. Block deletion alone must not cascade into its Entity.
- Export/import unknown annotation fields and authored values including undefined and special numbers, or reject unsupported values before mutation. Confirm stable direct and linked identities through reopen and index rebuild.
- A standalone local shared definition resolves without a Resource. An unavailable external definition preserves its descriptor and produces an unresolved result, not guessed effective data. Definition changes atomically invalidate dependent projections.
- Typing into one proposition performs zero SQLite writes, vault scans, full-document snapshots or unrelated Explorer-row updates. Offset-only rebasing performs zero graph topology rebuilds and zero Entity summary requests. Instrument affected-property/layout reads and preserve existing caret, IME and undo tests.
- Before approving editor performance changes, use the real Flint browser typing benchmark with the same fixture and environment before/after. Do not substitute headless timing for visible latency. This report did not change the editor or run that benchmark.
- Reopen/restore with resources absent and verify canonical content remains available. Recover a canonical export into a new vault and verify its selection/dependency report. A file-only rebuild must explicitly disclose that missing canonical data cannot be recovered from document files.

The completed research checks comprised 15 small SQL invariant/migration checks and six codec/payload checks. They support the conditional recommendation, but do not constitute the eventual implementation's acceptance suite. Further proposition load testing remains canceled unless the user requests it again.
