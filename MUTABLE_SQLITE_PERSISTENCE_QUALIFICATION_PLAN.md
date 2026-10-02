# SQLite Persistence Layer Qualification & Implementation Plan

**P0 review — 2 October 2026. No production persistence changes or user-data migration.**

P0 was subsequently approved. P1 implementation and qualification are recorded in [the P1 report](MUTABLE_SQLITE_PERSISTENCE_P1_REPORT.md); P2 remains behind its review gate. The P0 evidence below is retained as the planning baseline.

The SQLite direction fits Mutable. The existing SurrealDB implementation should become an import source, not the model for the replacement. However, installing the brief's illustrative DDL unchanged would lose placement semantics, reject valid unresolved references, and misrepresent linked annotations. This report proposes the specific corrections below and stops at the brief's architectural-review exception before P1.

The user's clarification is incorporated: **local Node.js is an available runtime; Vercel limitations do not constrain development.** Use embedded SQLite in the local Node process, without a separate database service, cloud account or remote server. An HTTP transport for the current browser UI is an adapter, not the knowledge model. An eventual desktop host can call the same service directly. Browser-only SQLite/OPFS and desktop packaging are not prerequisites for this implementation.

## 1. What is present today

This review rechecked source rather than assuming that the earlier [SurrealDB review](FLINT_SURREALDB_INFRASTRUCTURE_REVIEW.md) still describes every caller.

| Area | Current implementation and implications |
|---|---|
| Embedded SurrealDB | `server/index.ts:initDb` opens `surrealkv://./data/appdb`, namespace `codex-ns`, database `codex-db`. `SPEEDY_DISABLE_DATABASE=1` skips it. This is a cwd-relative global store, not one store per Flint vault. |
| Legacy file save → index | `server/document-store.ts` and `server/workspace-store.ts` invoke `saveDocumentIndex` after eligible legacy files publish. It upserts `Document`, `TextBlock`, `StandoffProperty` and inserts mention→Agent edges. Only child-tree StandoffEditorBlocks are visited. There is no complete removal reconciliation; repeated saves can duplicate edges. |
| Current Entity UI | `src/features/entity-references/search-view.tsx`, `entity-summary.ts`, and `server/entity-search.ts` implement name/alias lookup and summaries. The recently added `POST /api/entities` creates/retries an `Agent` record and immediately annotates the original live selection. It is now an additional active SurrealDB writer, beyond the earlier review. |
| Other legacy endpoints | `addToGraphJson` upserts Agents; `getEntitiesJson` reads them. `restoreDatabaseJson` loads Agent, Claim, Concept and subset-of-concept seeds. `indexAllDocumentsJson` is an obsolete shallow/page-only bulk indexer. Both maintenance GET endpoints write; do not call them during inspection or automatically migrate their behavior. |
| Separate JSON graph | `addToGraph`, `graph/update-entity-references`, `loadGraphJson` manipulate `{nodes,edges}` files. Similar route names do not imply a common persistence model. |
| Native persistence | `src/persistence/native-resource.ts`, `resource-pair.ts`, `managed-pair.mjs`, `native-session.ts`, and `server/native-{document,vault}-store.mjs` own native capture/admission, pair publication, caller baselines and relocation. They do not index into SurrealDB. SQLite must consume their successful publication evidence. |
| Native knowledge | `src/knowledge/{facts,collect-facts,saved-reader,live-observer,index,policy}.ts`, the knowledge coordinator/worker and application adapters provide qualified derived search/reference semantics. Their index is ephemeral TypeScript state, not SQLite. Their Facts omit important storage projections such as complete BlockProperties/placements; they cannot simply be inserted as a complete resource index. |
| SQLite/native host | No SQLite package, migration runner, database adapter, Electron or Tauri host was found in the current package/source inventory. Local Node is v22.12.0. Browser local file support in `src/demo/browser-json-file.ts` is JSON open/save, not a database host. |
| Write mode | `publicHostedVersion` currently defaults true; `SPEEDY_PUBLIC_HOSTED_VERSION=0` enables local server writes. This is unrelated to uncertainty over the Entity model. A local SQLite host must receive an explicit read/write capability; Vercel/public-host policy must not become a universal prohibition on local writes. This report changes no setting. |

No raw live SurrealDB directory was copied or opened with a second process. The on-disk seed inventory is evidence of import material, not evidence that every seed table is loaded into the running database. In `data/graph/nodes`, there are 9,057 Agent seed records, 990 Concepts and 1,990 Claims, plus properties/types, times, datasets/datapoints and meta-relations. At the top of `data`, 34 readable JSON files are `main-list-block` trees, one is a graph object, and `usher.json` is invalid JSON. The investigation read these files without changing them.

## 2. Existing file/resource formats and authority

| Supported implementation | Treatment in this programme |
|---|---|
| `.mutable.json`: `mutable-document` v1, graph v1/v2, optional declared authored-value grammar | First production native adapter. Preserve full-decoder validation as oracle, resource boundaries and graph-2 owned-external semantics. Markdown is never its source. |
| `.ink` | Existing qualification code demonstrates the native envelope under this suffix. Production `NativeVaultStore` still accepts `.mutable.json`; `.ink`/`.ink.md` discovery, receipts and relocation are not implemented. An extension alias must pass that compatibility gate before production discovery claims support. No rename/migration in P0. |
| Legacy `.json` Blocks, including `main-list-block`/`membrane-block` | Decode through existing legacy codecs. Index validated authored structures only; missing/ambiguous identity becomes a diagnostic or an explicit import prerequisite. Do not silently mint canonical IDs during a read-only scan. |
| `speedy-workspace` schema 1 and legacy workspace trees | Existing `src/reactive-editor/workspace-manifest.ts` separates the Workspace root and referenced Documents. A workspace adapter must index only its authored body and descriptors; it must not flatten or take ownership of referenced/native Documents. |
| Desktop/Canvas/Spatial | Currently presentations in Workspace metadata (`workspacePresentation`), not independent `.desktop`/`.canvas`/`.world` native serializers. `.space` is not an implemented standalone serializer either. Do not invent these wire formats to satisfy an extension list. |
| History-bearing documents and portable experiment envelopes | Read only through their actual codecs/current-state projection. Preserve explicit unsupported-version diagnostics. Do not replay the entire archive to index current state when a validated current snapshot exists. |

Use a small, explicit **saved-resource adapter** boundary: format detection from bytes, validated identity/root, authored Block definitions, placements/relations, native text runs and annotation-definition provenance. Reuse `ResourceSnapshot` and codecs where valid. Do not create a replacement authoring DTO or serialize the index back into a file. The existing native validator is intentionally Document-root-specific; wrap genuinely different existing formats rather than weakening it or broadly generalizing canonical admission. All applicable persisted Block types, including opaque application Blocks, get structural rows. Executable/opaque UI internals are not mounted, searched or inferred.

## 3. Required adjustments to the illustrative schema

| Current semantic evidence | Proposed correction |
|---|---|
| `ContentRecord` versus `PlacementRecord`; references can repeat content | One `Block` per canonical authored definition. Store authored placements as `BlockRelation` rows with placement identity, source resource, slot, ordinal, `owned`/`reference` kind and full external descriptor. Never create Blocks for transient occurrences or reference copies. |
| `definitionOwnerKey` retention; non-owning `resourceRegistration` | Record explicit definition retention separately from structural edges. Storage registration and Flint occurrences are not authored relations. SQL membership is derived evidence, never repository ownership authority. |
| Graph-2 owned-external Document edges | Keep target resource identity, target Block ID, source scope, version/pin and route. `external` does not mean `reference`. Missing targets must not delete the source edge. Remove the proposed target-Block cascade FK; retain source FKs. |
| Anchor metadata `{version,blockId,offset}`; named margin relations | Project `anchor-to` as a presentation relation, preserving offsets/version. Project left/right margins from actual owned slots with one documented direction (container→margin). Do not persist a second inverse fact; queries can expose `left-margin-of`. No `Block.parentGuid` duplicate column. `topology` is a qualified label, not an additional ownership system. |
| Property IDs can be absent or scoped, not globally unique UUIDs | Preserve existing IDs verbatim. Store `authoredId` and distinguish authored identity from a deterministic derived row key. Scoped/absent property IDs cannot become new portable GUIDs merely because SQL needs a primary key. New authored objects use UUIDs; legacy ID migration requires an explicit import map and rewritten destination references. |
| Shared annotation definition plus per-Block segments | Add file-derived `AnnotationDefinition`. `StandoffProperty` is a segment with a logical grouping key, definition owner/provenance and resolution state. A cross-Block annotation counts as one logical mention, with multiple navigable ranges. |
| Missing foreign definitions and Entity targets are valid authored states | Keep unresolved descriptors and raw properties. A source row cannot require every target Entity/definition to exist. Remove the proposed target-Entity FK, retain `targetEntityGuid` as an indexed assertion, and report unresolved coverage. Explicit recovery may create minimal recovered Entities; ordinary indexing must not silently manufacture canonical Entity knowledge. |
| Native wire ends are inclusive; runtime ranges are half-open | SQL uses `[startIndex,endIndex)` and converts native `end + 1` exactly once. Record `coordinate`: standoff Cell boundaries versus plain-text UTF-16. Do not treat offsets as arbitrary JavaScript string indices. |
| Inline images/widgets split native text runs | Add derived `BlockTextRun` with the existing boundary map. Index FTS per run so a phrase cannot cross an inline object. FTS offsets are not editor selection coordinates. |
| Undefined, non-finite numbers, negative zero, unknown authored bags | Use the accepted `codex-authored-value-v1` packing for `attributes`/`valueJson` and audit snapshots. A nullable scalar `value` is an additional query projection, never the only copy of authored values. JSON validity is not semantic validation of that grammar. |
| `codex/block-reference` is different from an Entity reference | Preserve the authored type and add indexed target Block/resource columns as well as `targetEntityGuid`. Do not reinterpret Document backlinks as Entity Relationships. |
| Native title/tags are authored metadata | Keep derived Resource title and a `ResourceTag` projection. Do not turn filesystem directories into semantic membership or fabricate authored BlockProperties for metadata fields. |
| Authored timestamps/actors may not exist | Retain unknown attribution as NULL. File mtime/index time is not an authored creation time. Indexing does not make the indexer the author of every Block. |

`Block.guid` and `Resource.guid` remain unique portable identities. Existing non-UUID strings are compatibility identities until explicitly migrated; there is no SQL UUID-only constraint that would silently discard already accepted native resources. Duplicate claims are unavailable/ambiguous evidence, not “first file wins.” A read-only index must not rewrite files to satisfy GUID policy.

For scoped/absent property or relation IDs, derive an index-only UUIDv5 from a versioned tuple of vault/resource/Block identity, record kind and authored ID; when absent, use ordinal plus a canonical authored-value fingerprint. That last key may change on reorder: it is explicitly a rebuildable row identity, not a new durable annotation identity. Preserve duplicate identical list entries by their ordinal. Logical mention keys also include definition provenance so unrelated same-named definitions cannot merge. Never put these derived keys back into authoritative files. Individual runtime Cells are not additional authored Block definitions in native files; compact text/image atoms supply text runs and boundary evidence without one SQL Block row per character.

An Entity is a general knowledge object. Map proven Agent subtypes into Entity types; retain an unknown historical AgentType as import metadata rather than classifying all Agents as people. `Actor` remains a separate attribution principal.

## 4. Proposed DDL, ownership and migrations

The complete review DDL is in [mutable-proposed.sql](docs/architecture/sqlite/mutable-proposed.sql) and [audit-proposed.sql](docs/architecture/sqlite/audit-proposed.sql). These are design artifacts, not installed migrations.

| Authority class | Tables |
|---|---|
| Canonical vault-level state, requires backup | `Entity`, curated/imported `EntityAlias`, `Relationship`, `Actor`; vault GUID/schema identity in `SchemaInfo` |
| Rebuildable observed knowledge | `EntityAlias` with observed/recovered origin, where supported by surviving authoritative EntityReference text |
| Rebuildable saved-file projection | `Resource`, `ResourceTag`, `Block`, `BlockProperty`, `BlockRelation`, `AnnotationDefinition`, `StandoffProperty`, `BlockTextRun` |
| Rebuildable query/inspection state | `BlockSearch`, `EntitySearch`, `EntityAliasSearch`, `IndexIssue` |
| Temporary delivery state | `PendingAuditMutation`; acknowledged rows are deleted, not retained as another history store |
| Separate history | `audit.db`: `AuditMutation`, `AuditEvent`, `SchemaInfo` |

`Relationship` contains **only Entity endpoints**, type, attribution and extensible attributes. It has no Resource/Block columns. Aliases have GUIDs and an explicit origin so observed aliases cannot be confused with curated ones. Entity names need not be unique. A `revision` column protects DB-owned mutations from stale UI updates; it is not a Document save generation. Current Actor GUID fields intentionally tolerate missing historical principals instead of inventing them.

**Accepted clarification:** an Entity created by linking selected text takes that text as its initial/default preferred name without a second name-entry requirement. Later forms may become observed aliases. Observed aliases are rebuildable only from surviving authoritative reference text; curated/imported aliases absent from those files require database backup for exact recovery. The current Entity preferred name/enrichment remains database-authoritative. P1 permits the same normalized alias under different origins, so removal/rebuild of observed knowledge cannot erase an independently curated/imported alias. The service must deduplicate matching Entity targets rather than collapse alias origins.

Resource paths are vault-relative location projections. A Resource row is not a persistence enrollment/binding. Hash, format/profile and availability fields qualify saved index evidence; unknown inspection is never absence. `IndexIssue` can describe two paths claiming one identity without breaking uniqueness or authorizing adoption. Native binding/discovery authority remains in the managed store.

P1 migration layout: `src/knowledge-sqlite/migrations/{mutable,audit}/0001-*.sql`, a small checksummed transactional runner, and CLI commands `init`, `inspect`, `rebuild-derived`, `verify`, `reset-test`. Use one `.mutable` directory per explicitly opened non-overlapping vault. Nested vault scope must follow current lease rules. Migrations verify schema version before writes; reject newer versions. Never “repair” corruption by replacing an existing canonical database with an empty file. Destructive reset is restricted to explicitly supplied disposable test directories; rebuilding derived data never drops Entities, aliases, Relationships or Actors.

Some indexes in the brief are redundant left prefixes of composite indexes. The proposal retains query coverage without automatically maintaining both copies. `EXPLAIN QUERY PLAN` and the P6 workload, rather than index count, are the gate. Source-resource consistency uses composite FKs on source-owned relation/annotation rows. Target descriptors deliberately have no existence FK. Entity deletion is rejected for known saved references; incomplete vault coverage cannot prove that deleting an Entity is safe, so the UI must not advertise such proof.

## 5. SQLite runtime and configuration

**Recommend `better-sqlite3` in a dedicated local Node worker**, pinned with the chosen SQLite engine/version during P1. It supplies prepared statements, transactions and a supported backup API. Keep synchronous database work off both the browser and the Node request loop; pass bounded typed operations, not arbitrary SQL, across the worker boundary. This is a bounded store worker, not a general job framework. [Library API](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md), [worker guidance](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/threads.md).

The installed Node 22.12 has `node:sqlite`, but that version requires an experimental flag and exposes synchronous operations. It is a reasonable later dependency simplification after a runtime upgrade, not a reason to change the runtime in this project. No library was installed during P0. [Version-specific Node documentation](https://nodejs.org/download/release/v22.12.0/docs/api/sqlite.html).

Use one writer/queue per vault, short transactions and bounded result pages. Start with `foreign_keys=ON`, WAL on supported local filesystems, `synchronous=FULL`, and a measured bounded busy timeout. Inspect effective PRAGMAs at startup. Benchmark FULL versus NORMAL only as an explicit durability tradeoff; canonical Entity/Relationship data makes blind performance tuning inappropriate. Handle busy/disk-full/checkpoint failures as visible state. WAL readers can coexist with a writer, but long readers delay checkpointing; do not share a live DB through a cloud-mounted/network folder. [SQLite WAL](https://sqlite.org/wal.html).

Local development composition should be writable by default unless explicitly opened read-only. Keep any public-host read-only policy in that deployment's composition, rather than making Vercel's limitations a requirement on the local store. Qualify both modes in P3; do not alter today's SurrealDB configuration as a side effect of P0.

No transactions promise atomic publication across files, `mutable.db` and `audit.db`. In particular, attaching two WAL databases does not provide a cross-database crash-atomic commit. [SQLite ATTACH](https://sqlite.org/lang_attach.html).

## 6. Save → index and reconciliation protocol

1. Capture the immutable canonical generation through existing persistence. Keep the current caller-baseline, dependency, native-encoding and publication guards. SQLite success never changes those outcomes.
2. After confirmed authoritative native-file publication, enqueue `{vault,resourceId,location,locationRevision,contentHash,generation,profile}`. The event belongs to the resource, not an occurrence. Externally loaded files may have no save generation; a hash is not a substitute generation ID.
3. Under the existing storage coordination boundary, verify current location/identity/hash and any pending operation. Reuse captured bytes only when their hash is confirmed. Decode in a bounded worker without creating editors. Unknown discovery, cancellation, stale inspection or a failed dependency withholds completion.
4. Build the projection using authoritative saved semantics. Preserve raw unresolved definitions and declared source hashes; never resolve a saved annotation from a dirty live definition and persist that mixed state as saved evidence.
5. In one SQLite transaction, apply changed Block/property/relation/segment/run rows, FTS updates, Resource evidence and any audit-outbox payload. Publish the index epoch only after commit. Readers see the previous complete transaction or the next one, never new text with old ranges.
6. File-save success plus DB failure reports **File saved; knowledge index pending**. Retry/reconciliation is idempotent by exact source evidence, not completion order. On restart, enumerate authoritative files and compare qualified evidence; do not depend on a volatile queue for recovery.

For partial native/Markdown publication, index the canonical file only when the managed store can positively attest that those native bytes were durably published and are still current. Otherwise leave saved indexing pending. Never index the failed native attempt, infer completion from the Markdown file, or clear pair-pending state as an indexing side effect.

The save writer and index worker must coordinate with relocation. A slow index task at an old binding is discarded. Internal file changes use the managed lock/evidence; external writers are detected by revalidation and later explicit refresh/reconciliation. There is no claim of atomicity against arbitrary OS writers racing between checks. Return evidence and revalidate before navigation. New external same-ID locations remain explicit conflicts until the storage layer resolves them.

**Incremental path:** coalesce existing classified commit/change records into affected authored Block IDs while accumulating an edit generation. Map changed Cells to their containing Block through maintained repository location/reference machinery. Do not scan the repository per keystroke or write SQL on typing. At a successful save, use that saved snapshot plus a contiguous known base to update the affected Blocks' text, ranges, properties and runs. An update may replace all segments of one changed Block; it need not rewrite every Block in the Resource. Undo branches, gaps or unclassified structural changes fall back to authoritative reconciliation. Measure existing full native serialization separately from SQL update cost.

**Reconciliation path:** supported-file discovery → qualified bytes → staged projection → transactional row diff. Remove stale source-owned rows only with positive evidence. An unreadable directory or worker timeout cannot authorize deleting indexed Resources. Confirmed file deletion invalidates/removes its derived rows, not Entities/Relationships or incoming source assertions in other resources. Repair and `rebuild-derived` use the same adapters. Missing foreign definitions stay unresolved; changed definitions invalidate affected derived resolutions through indexed provenance queries. No new repository ownership/membership graph is introduced.

## 7. Live state, SQLite queries and navigation

SQLite becomes the normal **saved-vault query infrastructure**. The existing live canonical observer remains necessary for unsaved edits; a saved DB cannot override them. Suppress saved hits for every live resource before accepting queries, including while its fresh Facts are pending. Merge only qualified live Facts, preserve coverage/epochs/cancellation, and hand back to saved results only after verified evidence. Failed live validation is unknown, not permission to expose stale saved text. This narrow ephemeral live overlay is not a second persistent index.

This is a deliberate clarification of “SQLite is normal query infrastructure”: it does not mean persisting unsaved file-owned state into current saved tables. Keep current C2 literal/Unicode matching and C3 logical-mention semantics. FTS provides a separate lexical candidate path; it is not a transparent replacement for substring search. For literal C2 queries use SQL candidate filtering plus the existing run-aware matcher, with a measured bounded fallback where FTS cannot provide a safe superset. Do not drop results because tokenization differs.

Expose vault-scoped services, owned by the local host rather than a Flint tab:

```ts
entities.get(guid)
entities.findByName(name, options) // ambiguity stays explicit
entities.findByAlias(alias, options)
entities.search({text, mode, cursor, limit}, signal)
entities.create({guid, name, type?, actorGuid}, mutationGuid)
entities.update(guid, expectedRevision, changes, actorGuid)
entities.remove(guid, expectedRevision, actorGuid) // reference/coverage guards
aliases.create/update/remove(...)
relationships.create/update/remove(...)
relationships.list({source?, target?, typename?, cursor, limit}, signal)
references.toEntity(entityGuid, scope, signal)
references.toDocument({resourceGuid?, blockGuid}, scope, signal)
references.entitiesInResource(resourceGuid, signal)
references.entitiesInBlock(blockGuid, signal)
blocks.list(resourceGuid, cursor, signal)
properties.forBlock(blockGuid, signal)
standoff.forBlock(blockGuid, signal)
standoff.intersect(blockGuid, start, endExclusive, coordinate, signal)
relations.incoming/outgoing(blockGuid, typename?, signal)
search.blocks({text, mode, entityGuid?, resourceGuids?, cursor, limit}, signal)
```

Query results include stable identities, logical mention/ranges, source evidence, coverage and an opaque scope epoch. They do not contain editor nodes or grant admission/focus/binding authority. Existing `ApplicationKnowledge`, backlinks and selected-result activation contracts continue to revalidate resource identity, current location and live revision/hash in the invoking Window.

Entity creation first commits the UUID, canonical name and optional first alias in SQLite. Then the live selection is annotated through the current `chooseEntity`/linked-annotation commands. Save publishes the file, then its saved mention rows. Live mentions are immediately visible via the overlay; saved mentions become queryable after indexing. A cancelled/stale selection can leave an unused Entity; do not delete canonical knowledge to disguise the absence of a cross-store transaction. Retry with the same mutation/entity GUID. Annotation Undo does not delete the Entity. Preferred-name edits update Entity, not all occurrences; existing embedded `entityName` values are fallback labels, not authority.

## 8. FTS and Unicode

`BlockSearch` uses external-content FTS5 over `BlockTextRun`; trigger changes are inside the same transaction as text/range changes. Entity names/descriptions and aliases have their own FTS projections. Rebuild using the FTS rebuild command against current base rows; verify integrity and compare result sets before publishing. SQL statements and FTS input are parameterized; quoting/escaping a literal user term is separate from parameter binding. No public raw-MATCH language is implied. [FTS5 documentation](https://sqlite.org/fts5.html).

Range queries use the brief's strict overlap predicate in matching coordinate units. Resolve navigation against native runs. Preserve non-BMP characters, combining sequences, newlines, images and zero-length properties without treating token offsets as Cell indices.

SQLite's built-in NOCASE is ASCII-oriented. `nameKey`/`aliasKey` use one versioned application normalization function (initially NFC plus locale-independent lowercase), while preserving original names. This is not a claim of complete Unicode case folding. Qualify Turkish I, Greek, accented and CJK text; keep equality, prefix, substring and lexical search modes explicit. [SQLite collation behavior](https://sqlite.org/datatype3.html).

## 9. Audit and existing History

Current `CanonicalRepository` Undo/Redo is ordinary editor behavior and remains. `src/runtime/block-history.ts`, History panels, durable recorders/outboxes, server archive routes, restore/preflight and selective readers are a separate product surface. Do not delete them in P1 or silently reinterpret their archives as audit.

There is a concrete dependency trap: `native-resource.ts` imports production-used resource projection, validation, portable encoding and `resourceToRepository` from paths under `src/history`. The authored-value grammar is also there. Removing that directory would break history-independent native persistence. Extract those pure reusable primitives to neutral codec/resource modules with unchanged wire bytes and regression tests before any retirement. Reuse exact comparison/change classification and restore preflight where helpful; do not reuse subgraph capture, archive replay or History enrollment as a prerequisite for an audit write.

For DB-owned mutations, append a bounded pending audit message in the same `mutable.db` transaction. Deliver it idempotently into `audit.db`, then acknowledge/remove it. Audit tables have no FKs into current state. A missing/corrupt audit file does not prevent reads of knowledge; current writes report degraded audit delivery. Define an explicit retention/overflow policy before enabling automatic dropping—never grow an unbounded outbox or pretend a lost interval is complete. After a configured loss/truncation, expose an audit gap and do not regenerate fictional history from current rows.

For file-owned changes, record the successfully indexed saved transition, with source hash/generation and known actor evidence. An indexing/reconciliation event must not be described as an authored keystroke. Restoring an old Entity value is a new optimistic mutation; restoring authored Block state uses existing editor/file commands and then normal save/indexing. This programme does not promise arbitrary old Block restore solely from SQL audit snapshots.

Retirement recommendation: stop adding subgraph-variant features, isolate neutral codec dependencies, then separately approve removal of the existing History UI/archive product after deciding how existing archives remain readable. This is not required to introduce audit.

## 10. Import, recovery and backup

Use a read-only legacy exporter and an explicit dry-run import manifest with source fingerprint, mapping version, row counts, errors and legacy-ID→GUID map. Preserve valid unique GUIDs. Allocate UUIDs only for approved new import identities; never conflate Agent, Block and annotation namespaces because their text keys happen to match. Re-running the same manifest is idempotent; collisions with different existing canonical knowledge require review.

Agents with clear meaning become Entities. Concept nodes can become Concept Entities. An `AgentType` alone is not guaranteed to identify a modern subtype. Claims, times, datapoints, property-type edges and meta-relations need semantic mapping; they are not automatically Entity Relationships. For example, `acted_in_claim` links an Agent and a Claim with a role, while `property_at_time` links a property and a time. Report these rather than inventing a direct Entity→Entity fact. A proven Concept subset relation can map after both endpoints are imported.

Prefer authoritative legacy Block files to stale `TextBlock`/`StandoffProperty` copies. When only legacy DB text survives, create a new authoritative Resource file through explicit import before indexing its Blocks. Never leave DB-only imported text pretending to be file-derived. Preserve original JSON, convert inclusive ranges with the existing decoder, retain unknown authored payloads, distinguish entity from block references, and report invalid files such as `usher.json`. Do not repair content speculatively.

After catastrophic DB loss, first rebuild derived rows, then run an explicit recovery pass over surviving Entity references. Recover GUIDs and observed forms without duplicating complete Entity records into every annotation. Use trustworthy durable creation order only when available; otherwise select a deterministic ordering by resource GUID, Block GUID, range and segment identity. Recovered entities are marked as such. Never overwrite a surviving preferred name with a mention. DB-only Relationships, enrichment and curated aliases need a database backup to recover exactly.

Use SQLite's supported backup/snapshot mechanism, not copying a live WAL main file. Current knowledge has priority over independently retained audit history. Backing up DB files alone is not a promise of a consistent files-plus-DB vault revision; that future checkpoint/sync layer remains out of scope. No cloud-mounted working DB, sync server, CRDT or provenance ontology is introduced.

## 11. Staged implementation and qualification gates

| Stage | Bounded implementation and affected components | Gate and rollback |
|---|---|---|
| P1 — build/migrations | New `src/knowledge-sqlite` store worker, migrations and CLI; package lock/library pin; test-only reset. No application provider replacement. | Fresh/repeated migration, newer-version rejection, constraints, FK/FTS availability, rollback, backup/restore smoke, local worker lifecycle and actual Node/platform compatibility. Keep existing behavior until this passes. |
| P2 — saved indexing | Explicit format adapters reusing native/legacy/workspace codecs, saved reader validation and managed publication/discovery evidence; source row diff and reconciliation. | Actual feature producers, all Blocks/retained definitions, margins/anchors, graph-2 external ownership, rich values, linked annotations, deletion/rename, malformed/unknown inspection, incremental/full differential equality, file hashes unchanged by rebuild. No repository admission redesign. |
| P3 — knowledge services/UI | SQLite Entity/Alias/Relationship services; injected Entity feature transport, native-reference/mentions queries, saved search adapter and existing live overlay/navigation contracts. | Create/link/save/reopen without SurrealDB; stale selection, retries, preferred rename, aliases, ambiguity, two Windows, read-only mode, live-over-saved suppression, zero occurrences, cancellation and ordinary Undo/Redo. Clearly label saved versus live coverage. |
| P4 — audit | Mutation grouping, pending delivery, audit writer, bounded retention/gap policy; neutral History utility extraction only as required. | Current state works with absent/lost audit; retry delivers once; append failure and crash gaps explicit; audit reset leaves Entity/Relationship/files unchanged. No automatic History removal. |
| P5 — importer | JSON/Surreal export adapter, dry run, identity map, semantically approved mappings, new native import files. | Representative real legacy content in a disposable destination; repeat import, invalid JSON, duplicate IDs, missing targets, cross-file references, rich properties and ambiguous graph types. Source untouched. |
| P6 — integrated performance/integrity | Typical and Large vault fixtures, query/save/audit benchmarks, crash/failure harness and native/Flint regressions. Optional inexpensive Stress characterization only. | Typical and Large are the required performance gates. Investigate material degradation between them; Stress does not determine acceptance. No production-qualified claim from schema smoke or small fixtures. Review regressions before removing old runtime routes. |

Add a `sqliteKnowledge` feature switch default-on when application composition is actually introduced, in line with the standing user default. Tests may exercise the adapter earlier. Never use rollback to resume writing a stale SurrealDB copy after SQLite has accepted canonical Entities: rollback disables affected writes or restores a verified snapshot. Do not dual-write as an implicit migration strategy. Remove normal SurrealDB startup/routes only after import and SQLite consumer gates pass; keep legacy export tooling isolated. No current semantic behavior genuinely requires a graph database.

**P6 performance tiers (revised by user direction):**

| Tier | Resources | Blocks | Standoff segments | Entities | Relationships | Qualification role |
|---|---:|---:|---:|---:|---:|---|
| Typical mature vault | 1,000 | 25,000 | 100,000 | 10,000 | 25,000 | Required; primary target for a mature personal vault. |
| Large personal vault | 5,000 | 100,000 | 400,000 | 30,000 | 150,000 | Required; unusually large or long-lived single-user vault. |
| Stress | 10,000 | 250,000 | 1,000,000 | 100,000 | 2,000,000 | Optional architectural-headroom characterization, never an acceptance gate. |

Counts are approximate. At Typical, common bounded interactive queries should generally achieve **p95 < 50 ms** on the recorded qualification hardware where feasible. Large must remain comfortably interactive; report absolute latency and the change from Typical, and investigate material degradation. Record hardware, runtime/SQLite versions, configuration, query bounds and cache conditions so comparisons are meaningful.

Run Stress only if the existing machinery can generate, populate and exercise it cheaply—ideally within a few minutes. Omit it if it would require a long run such as 20 minutes, significant fixture engineering or additional qualification effort. Do not introduce architectural complexity or optimize solely for Stress. Report any inexpensive results separately as headroom information; omitting Stress is not a failed or incomplete P6 gate.

Both required tiers must include skewed/high-degree Entities, heavily annotated Blocks, unusually large individual Resources, aliases, multiple annotation segments and inline objects. Pathological data shape is not reserved for Stress. Include a Cell-heavy real native fixture separately; do not confuse synthetic SQL population speed with cold vault startup performance.

Prioritize Entity GUID/name/alias lookup and autocomplete; EntityReference reverse lookup, logical mentions/backlinks; Relationship lookup in either direction; Block and Standoff loading; range intersection; FTS and FTS+semantic filtering. Measure cold/warm p50/p95/p99 and maximum latency, with bounded pages and separate high-degree pagination costs. Record query plans, rows returned/visited where observable, queue time, worker transport, UI publication, Node event-loop delay, RSS/heap, database/FTS/WAL bytes and checkpoint cost.

Measure changed-one-Block save/index versus full reconciliation, Entity+alias creation, annotation save and audit delivery; distinguish native capture/encoding, filesystem publication, SQL transaction and audit latency. Count touched rows to prove locality rather than hiding full reindex work. Vary unrelated vault size at constant target. Do not put repository-wide validation onto typing. Arbitrary structural repository admission remains global, as already qualified.

At both Typical and Large, also measure end-to-end cold vault startup, individual Resource reconciliation and complete derived-index rebuild time, including discovery, read/hash, extraction, database population and query readiness. Report progress/responsiveness and database/WAL growth during these operations. The performance objective is excellent realistic single-user behavior, not optimization for hypothetical multi-million-record workloads.

Failure gates include disk full, process death at each file/SQL/audit boundary, transaction rollback, queue recreation, external writes, relocation mid-index, ambiguous/unknown discovery, stale completion, concurrent optimistic Entity edits, unresolved definitions, read-only vault, FTS rebuild, derived rebuild with canonical knowledge intact, FK integrity, and supported backup round-trip. Re-run native B1/B1.1/B1.2/B2 and production save/relocation, C2/C3, P1–P5 Facts/live/saved, Entity UI, and focused History codec/restore tests for touched paths. Preserve the tracked legacy owner-cache and development-wrapper limitations; do not broaden this project to fix them without evidence.

## 12. P0 evidence and decisions for review

P0 inspected current sources, existing qualification reports, installed runtime/dependencies and legacy JSON shapes. The proposed DDL is checked independently in memory by [check-proposed-schema.py](docs/architecture/sqlite/check-proposed-schema.py); this is a syntax/constraint/FTS smoke, not a P1 worker/migration qualification or P6 performance result. No production `.mutable` directory, package dependency or database was created or migrated.

**Result: 28 checks passed using Python's SQLite 3.39.4**, including independent schemas, source FK constraints, unresolved targets, half-open ranges, FTS update/rebuild/rollback, audit isolation and preservation of canonical knowledge during derived-row removal. This is not a benchmark of the proposed Node driver, which has not yet been installed. The required Typical/Large P6 tiers and crash/recovery gates remain future qualification work; optional Stress characterization is not required.

The following recommendations require acceptance before installing a schema that becomes durable:

1. **Accept the semantic DDL amendments:** explicit placement/external provenance, linked definitions/segments, unresolved targets without target-existence FKs, Cell/run coordinates, and tagged authored values.
2. **Accept identity compatibility:** preserve existing opaque authored IDs and scoped property identities while requiring UUIDs for new durable objects; migration changes IDs only in explicit imported output with a coherent map.
3. **Accept the adapter/format scope:** cover actual current serializers first; `.ink` production pairing and genuinely new standalone Workspace/presentation formats have explicit gates, not guessed wire formats.
4. **Accept saved SQLite plus a transient live overlay:** file-owned SQL rows represent confirmed saves; existing live Facts preserve unsaved search and navigation semantics until a separately justified equivalent replaces that overlay.
5. **Accept bounded audit delivery with explicit gaps and deferred History retirement:** review retention/overflow behavior before P4; do not require atomicity across two DBs and files.

The local Node clarification resolves the runtime question; it is **not** a blocker. These remaining questions are real schema/authority changes relative to the illustrative SQL, which is why this execution stops at P0 rather than installing an incompatible interpretation.

**Implementation order after review: P1 → P2 → P3 → P4 → P5 → P6, with the gates above. No production implementation has begun.**
