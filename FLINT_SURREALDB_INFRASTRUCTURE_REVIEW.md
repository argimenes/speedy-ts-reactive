# Flint pre-C3 review — Existing Node/SurrealDB derived data

**Inspection only — 30 September 2026, repository baseline `80fd615`. C3 is not implemented.**

The existing direction is real: Node persists plain text and annotation-derived graph data in embedded SurrealDB, and the current Entity feature reads that database. However, this is a **partially active legacy save-time index**, not a current canonical native-resource index or a complete search/backlinks backend. It does not receive Flint `.mutable.json` saves. C2 has not duplicated an equivalent existing native-query implementation.

The records called “Text nodes” in the request are named **`TextBlock`** in the implementation. No production writer for a table named `Text` was found.

## 1. Exactly what writes, updates or deletes the text records

The implementation is [`saveDocumentIndex()` and `generateIndex()`](server/index.ts), starting at lines 545 and 603. The former is private to the server entry point. It traverses a legacy Block DTO's `children`, selects `type === "standoff-editor-block"`, and upserts `TextBlock:<block.id>` with `text`, raw `standoffProperties`, `blockProperties` and `metadata`.

It **does not extract text from live Cells itself**. It trusts the flattened `text` supplied by the save DTO.

| Trigger | Exact behavior |
| --- | --- |
| `POST /api/saveDocumentJson` | After publishing a non-History legacy tree file, the [Document store](server/document-store.ts) invokes the configured callback. [Server composition](server/index.ts) adds `metadata.filepath`, sets `lastUpdated`, and calls the indexer. Failure returns a successful file-save response with an indexing warning. |
| `POST /api/saveWorkspaceBundle` | After publishing the bundle's files, the [Workspace store](server/workspace-store.ts) invokes the same callback for each explicit Document write, not for the Workspace envelope or every resource in its catalog. Indexing failures become warnings. |
| `GET /api/indexAllDocumentsJson` | Manually scans immediate JSON files in immediate subdirectories of the legacy `data` root. Only DTOs with root `type === "page-block"` are accepted. It does not recurse through a vault hierarchy, scan root-level files, accept modern Document roots/native envelopes, or use `SPEEDY_DOCUMENT_ROOT`. No current caller or automatic startup invocation was found. |
| Flint native `/api/native/save`, Open, recovery and relocation | **No SurrealDB callback.** [Native routes](server/native-document-store.mjs) and [native-session](src/persistence/native-session.ts) use the qualified resource/pair store. |
| History-format Document Save | The legacy store explicitly skips indexing and reports that indexing this format is unsupported. |
| Legacy `/api/saveWorkspaceJson`, repository snapshot Save, local download | No index callback. |
| Typing, annotation editing, Undo/Redo, tab closure, file removal | No direct database indexing/deletion subscription. Later eligible legacy saves are the only normal update trigger. |

The current [reactive persistence client](src/reactive-editor/persistence.ts) still calls the eligible legacy routes for eligible legacy Documents/Workspace bundles. The older [`UniverseBlock.saveServerDocument`](src/universe-block.ts) also calls the Document route. This is executable infrastructure, not just abandoned type declarations.

**There is no implemented deletion/reconciliation path for these index records.** The comment “Delete existing TextBlocks and StandoffProperties” is followed by upserts, not deletion. No indexer transaction, old-member inventory, generation comparison, deterministic relation ID or uniqueness definition was found.

Consequences, confirmed against the unchanged indexer in an isolated embedded database:

- Re-saving a present Block updates its keyed `TextBlock` data.
- Removing a Block from the document leaves its prior `TextBlock` row.
- Removing/deleting an Entity annotation leaves its prior `StandoffProperty` and graph edges.
- Every eligible live Entity property inserts a fresh `standoff_property_refers_to_agent` relation. Saving the same mention twice produced two edges.
- Retargeting updates the property row but leaves relations to the previous Agent, alongside the new relation.
- Partial indexing failure can leave a partly updated graph; file publication is already complete. Concurrent index requests have no indexed-generation guard.

The bulk-index and restore endpoints are GET requests that **write**. Their paths are outside the current hosted-write-path guard. They were not invoked during this review. They should not be treated as harmless health checks or automatic repair actions.

## 2. Identity and resource relationships

| Stored record | Identity and fields actually written | Gap relative to native resources |
| --- | --- | --- |
| `Document` | Key is incoming DTO `doc.id`; body contains `metadata`. | It does not select `metadata.documentId` or the native envelope's `resourceId`. Root Block ID and canonical Document ID can differ. |
| `TextBlock` | Key is the standoff Block's authored `id`; flattened text and raw properties/metadata are copied. | The TypeScript type declares `documentId`, but the writer never sets it. There is no written Document→TextBlock membership edge. |
| `StandoffProperty` | Key is the segment/property `id`; `textBlockId` points to `TextBlock`; stores entity type, mention text, inclusive start/end, value and metadata. | It does not retain `annotationId`, linked-definition ownership/provenance, a canonical resource ID, or a source generation. |
| Entity relation | `StandoffProperty -> standoff_property_refers_to_agent -> Agent`. | This is an Entity mention, not a Document reference, containment edge, ownership edge or storage-retention record. |

`metadata.documentId` may incidentally remain inside a `Document` row's metadata, but that does not establish the missing membership mapping. Similarly, incidental metadata on a TextBlock is not validated canonical ownership evidence. `metadata.filepath` is copied from a legacy save location, not managed through the accepted native persistence binding or relocation protocol. The callback's `lastUpdated` assignment is not included in the fields the indexer writes; it provides no index-generation evidence.

The current native model explicitly separates canonical resource ID, authored root/Block IDs, repository content/placement keys, owned/reference/external edges, non-owning `resourceRegistration`, storage binding and transient occurrences. See [native capture/admission](src/persistence/native-resource.ts), [resource registration](src/block-tree/resource-registration.ts) and [resource identity](src/block-tree/resource-identity.ts). The database index models none of those distinctions beyond some copied authored IDs. It cannot currently establish resource membership, lifecycle ownership or vault availability.

The extracted-indexer probe uses `root-block` as the root ID and `canonical-resource` as `metadata.documentId`: the database record is `Document:root-block`, and its TextBlock still has no `documentId`. This is a concrete mismatch, not a hypothetical naming concern.

## 3. Compatibility with current Cells and StandoffEditorBlocks

**Compatible with the simplest legacy export; incomplete for the current native architecture.**

The [old StandoffEditorBlock](src/blocks/standoff-editor-block.ts) maintains Cells but serializes `this.text`. The current [legacy tree codec](src/block-tree/codecs.ts) reconstructs `output.text` from canonical inline Cells. Thus eligible all-text legacy saves can still feed useful text to the indexer. Its `[...text].slice(start, end + 1)` uses code points and inclusive standoff offsets; the probe confirms that an ordinary non-BMP emoji mention is sliced correctly. It would be inaccurate to call all existing Cell handling broken.

The following current semantics are absent:

- Canonical standoff content no longer owns a flattened `payload.text`; text resides in `inlineContent` placements. Passing canonical records or native graph envelopes to this tree indexer is not a supported adapter.
- Inline images/widgets occupy Cells but are not ordinary characters. Legacy encoding rejects an image unless explicitly exporting lossily; a flattened alternative/alt string cannot preserve native Cell boundaries. C2's [canonical extractor](src/runtime/canonical-search-source.ts) preserves the mapping and splits runs at non-text objects.
- `generateIndex` follows only `children`. It omits named owned relations such as margins and superposition relations. Conversely, it crosses nested Document children without a resource boundary rule. Its computed traversal path/depth are not stored.
- It indexes only StandoffEditorBlocks, not supported plain/native text Blocks generally. No production title/full-text query route over these TextBlock rows was found; the deployed database query APIs focus on Entity lookup/counts.
- Linked property resolution is only `doc.linkedAnnotations[property.annotationId]`. It does not use the current [definition owner/provenance resolver](src/block-tree/linked-annotations.ts), handle separate nested resource registries correctly, or qualify foreign definitions. The Document row itself does not store `linkedAnnotations`.
- Each segment is indexed as a separate Entity property/edge. One linked mention with two segments produced two property records in the probe; the flattened indexed records omit the shared annotation ID. This differs from C3's one-logical-mention semantics.
- There is no indexed revision/content fingerprint, source availability, boundary-map version, loaded/dirty-state knowledge or canonical-authority check.

## 4. Active, dormant, incomplete or obsolete?

The classification differs by component:

| Component | Assessment |
| --- | --- |
| Embedded database connection | Active server infrastructure. [`initDb`](server/index.ts) uses `surrealkv://./data/appdb`, namespace `codex-ns`, database `codex-db`, relative to process cwd. Startup attempts connection unless `SPEEDY_DISABLE_DATABASE=1`; failure leaves file storage available. The commented HTTP/RPC connection is dormant. |
| Legacy save-time text/entity indexing | Wired and executable, but incomplete/stale-prone. Writes require a writable eligible legacy route and a working DB. `publicHostedVersion` defaults true in [configuration](src/configuration.ts); the server environment can override it. |
| Current Entity search and summaries | Active consumers. [`search-view`](src/features/entity-references/search-view.tsx) and [`entity-summary`](src/features/entity-references/entity-summary.ts) call the tested [Entity router](server/entity-search.ts). Name/alias search and Graph counts use Agent/mention data. |
| Graph counts | Saved-index counts, not live canonical counts. The [Entity list](src/features/entity-references/list-view.tsx) already labels that distinction. Duplicate/stale edges make them unsuitable as exact current native-reference counts. |
| Manual seed restore / bulk document indexing | Callable maintenance code; no startup/current UI invocation found. Bulk indexing's page-only, shallow traversal is obsolete as a native-vault rebuild mechanism. |
| Flint native-resource indexing/search/backlinks | Not implemented in SurrealDB. Native saves, admission and relocation bypass the legacy index. |

Installed packages are `surrealdb` **1.3.2** and `@surrealdb/node` **1.0.0-beta.3**. No repository-managed SurrealQL schema, full-text index definitions, event triggers or graph cleanup migrations were found. This describes the checked-in implementation, not a claim that a user's persistent database has never been manually configured.

A read-only query against the existing `localhost:3002` Entity name endpoint returned HTTP 200 / `Success: true` with no match. The listener runs `dist/server/index.js` from this repository. However, its native-list route returned 404, so its running build/configuration is not established as the current source. It was not restarted. This live observation supports Entity query availability only; it is not a table inventory or a verification of current native deployment. [Recorded response metadata](artifacts/surreal-derived-query-review/live-read-status.json).

## 5. Other existing graph records and relationships

These are the records the checked-in writers can populate; exact live row counts and any manually added tables were not inspected.

| Record/relation | Producer and semantics |
| --- | --- |
| `Agent` | `saveAgents` upserts imported Guid/name/type/deleted fields; `/api/addToGraphJson` upserts an Agent name. The latter has an older Entity UI caller; current migrated Entity search does not create Agents. |
| `Claim` | `saveClaims` upserts Guid/name/role/deleted from the seed JSON. No Claim relationship loader is called by the current restore function. |
| `Concept` | `saveConcepts` upserts Guid/name/code/deleted from the seed JSON. |
| `subset_of_concept` | `saveSubsetOfConcepts` inserts Concept→Concept relations with `primary`. It has no deterministic edge key/cleanup, so restore is not an idempotent edge rebuild. |
| `Document`, `TextBlock`, `StandoffProperty` | Legacy saved-document/index records described above. |
| `standoff_property_refers_to_agent` | Indexed Entity mention→Agent relations; queried by name/alias lookup, entity summaries and [queries.md](queries.md). |

[`restoreDatabase()`](server/index.ts) invokes only Agents, Claims, Concepts and subset-of-concept imports. Its commented database removal is not executed.

The repository also contains [graph node seeds](data/graph/nodes) for properties, property types, meta-relations/types, times, datasets and datapoints, plus [edge seeds](data/graph/edges) for agent properties/types, acted-in-claim, temporal/place/datapoint relations and others. **Presence of those JSON datasets does not establish that the current server loads them into SurrealDB.** No such additional import calls were found.

There is a separate flat-JSON graph path: `/api/addToGraph`, `/api/graph/update-entity-references` and `/api/loadGraphJson` read/write `{nodes, edges}` files. Despite the naming, `/api/addToGraphJson` writes SurrealDB while `/api/addToGraph` writes JSON. [`src/library/graph.ts`](src/library/graph.ts) is an in-memory graph/JSON serializer, not another SurrealDB provider. Historical AMD graph viewers likewise do not constitute a current Flint/native graph service.

## 6. Could C2 eventually use this infrastructure unchanged semantically?

**The database technology could support a future implementation; the existing records/writers cannot be substituted for C2 today.**

C2 exposes stable identities, snippets, cancellation, freshness/coverage and a separate host-owned navigation action through [ApplicationKnowledge](src/feature-api/document-application.ts). Its [current adapter](src/application/vault-knowledge.ts) uses loaded canonical resources, including unsaved edits, and revalidates identity, revision and current binding before navigating in the invoking Window. Its injected matcher accepts already-extracted sources; that is not a ready-made database-provider slot.

A future database implementation could preserve the public semantic result/navigation boundary, but would need separately qualified evidence for:

1. Canonical resource + Block/mention identity and explicit resource membership, independent of path and occurrence.
2. A precise native generation/fingerprint and projection profile, including source completeness and deletion/replacement handling. Database completion order cannot establish freshness.
3. Native Cell/text-run boundaries, Unicode matching behavior and resource traversal equivalent to the canonical source semantics.
4. Loaded/available selected-vault scope and current binding checks. Returning every historical DB row would change C2's coverage contract.
5. Unsaved edits and Undo branches. A save-time-only index cannot replace current loaded state; it would need canonical local fallback/overlay or an explicitly different future saved-data query mode. A newer Markdown file must never fill that authority gap.
6. Cancellable requests, stale-completion rejection, explicit unsupported/incomplete coverage and core-owned final navigation.

Those are compatibility requirements, not authorization for an ingestion pipeline, persistent index or provider framework now. Database rows would remain derived and rebuildable; they must never confer resource ownership, storage retention or a new save baseline.

## 7. Could the proposed C3 backlinks service use existing graph data?

**Not correctly as it stands.** The only annotation relationship emitted is `codex/entity-reference`→Agent. C3 needs authored `codex/block-reference` mentions to stable Document/root-Block identity. Entity mentions, ownership, folder containment and presentation descriptors must not be reinterpreted as those references.

There is a limited nuance: `TextBlock.standoffProperties` copies the raw property array, so a legacy saved direct `codex/block-reference` can be present inside it. The probe confirms that it is copied but creates neither a dedicated `StandoffProperty` record nor a Document-reference edge. Linked references may retain only an `annotationId` segment whose definition was not stored. Flint's native files are not ingested at all. Combined with absent source-Document membership, stale deletions, missing logical-mention identity and missing generation evidence, those arrays cannot supply a trustworthy C3 result set.

A future native-derived database reference projection could implement the proposed narrow backlinks service. C3's current contract already anticipates a local index or application-database implementation while requiring declared coverage/freshness. Its semantic contract is the reusable architectural direction; the current Entity tables are not its default implementation.

### Recommendation for the C3 plan

Keep the approved default **bounded canonical scan of loaded available native resources** behind the read-only cancellable backlinks service. It is not a competing durable graph/index and supplies the live native semantics absent from the existing DB. Reuse C2's scope, identity/locator validation and navigation; keep the feature UI independent of the physical source. Do not build a second backend, provider registry or persistent index to demonstrate abstraction.

Record SurrealDB as an existing future integration candidate. Any native ingestion/reconciliation and historical-index repair should be a separate reviewed task, using this audit and the existing [deferred Graph-count integrity findings](ENTITIES_LISTING_MIGRATION.md) as its starting point. Repairing future writes alone would not remove old duplicate/orphan records. No bulk reindex or graph cleanup is required to implement the currently planned C3 service.

**No substantive C3 scope expansion is recommended. Review this finding before authorizing C3 implementation.**

## Evidence and changes made

- Read the server writers/routes, their client callers, legacy and native codecs, ownership/linked-definition helpers, Entity consumers, C2 implementation and C3 plan.
- Ran the exact existing indexer/traversal functions, extracted without modifying them, against the installed SurrealDB **`mem://`** engine: **16 assertions passed**. [Reproducer](artifacts/surreal-derived-query-review/probe.mjs), [results](artifacts/surreal-derived-query-review/probe-results.json). It never imports the server entry point, opens `data/appdb`, launches the application or mutates user data.
- Ran existing Entity-router and legacy Document/Workspace-store tests: **17 tests passed in 3 files**. [Results](artifacts/surreal-derived-query-review/regressions.json), [log](artifacts/surreal-derived-query-review/regressions.log). Tests use temporary storage/in-memory databases.
- Made only this report, inspection evidence and a plan cross-reference. No application/server implementation, persistence behavior, C2 behavior or C3 implementation changed.

**Stopped for review before C3.**
