# Verified Codex → Mutable legacy migration plan

**Investigated:** 4 October 2026 (Australia/Brisbane). **Scope:** verified investigative Stages 1–4 plus the 4 October architectural update. **Architecture/schema/API proposal: READY FOR REVIEW WITH SPECIFIED CAVEATS. Importer implementation: NOT YET IMPLEMENTED; REQUIRED WORK REMAINS.**

The repository is `/Users/iianneill/Documents/GitHub/speedy-ts-reactive`, remote `https://github.com/argimenes/speedy-ts-reactive.git`, commit `61a5fda2f2f80a7f2af2a45923a48c2282afd38f`. The user confirms that this repository is Mutable OS despite its Git/package name. The previous report's `arc-art-quizz` environment assessment is superseded.

All three source directories are readable:

- `/Users/iianneill/Documents/GitHub/codex-data/data`
- `/Users/iianneill/Documents/GitHub/codex-data/graph/nodes`
- `/Users/iianneill/Documents/GitHub/codex-data/graph/edges`

**VERIFIED:** most legacy documents need no authored-data transformation. All 2,390 Block-tree files decode and encode back to equivalent parsed JSON. Of these, 2,379 also pass current content recognition, legacy in-place encoding, and native-envelope encode/decode with exact recovery of the original tree. This is preservation of every authored field, array order, text, identifier, and omitted/null collection state, rather than a comparison of visible text alone.

**IMPLEMENTATION BLOCKERS:** the complete collection cannot currently be admitted and indexed together without policies for conflicting identities, exceptional containers, annotation boundaries, unresolved references, probable corruption in two graph exports, unnamed/tombstoned nodes, and a canonical import write API. The existing Entity/Relationship schema remains appropriate for named things and ordinary binary relationships. The updated architecture additionally requires Time extensions, n-ary Claims and analytical DataSet/DataPoint structures, with audited services and bounded audit delivery. Section 12 provides those proposals. Exceptional records gate their own dependent material; they must not automatically prevent an independently safe subset from proceeding once its implementation prerequisites are met.

The user clarified the destination priority after the initial investigation: **import `.json` document files from `/data` as `.ink` files**. Documents are authoritative for rebuilding missing standoff records. The user further confirms that **`.mutable.json` and `.ink` are the same native document format**: use the existing native serialization and name imported output files `.ink`. This is a filename convention, not a second format or a request to retain raw legacy-tree JSON as the chosen import output. The user confirms that “missing standoff property nodes” means nodes of Type **`StandoffProperty`**. If the legacy graph contains none, reconstruct those records in SQLite from the standoff property JSON in the Documents. This requirement is now resolved.

No importer, UI command, CLI, schema change, SQLite write, native document file, `.ink` output, vault establishment, or `imported/` directory was created. Only this report was changed in the repository. The latest attachment asks for an architectural plan/schema/API revision; executing that request here does not perform the later live import. Temporary scripts/results under `/tmp/codex-legacy-investigation.Te7kAo` and architectural findings under `/tmp/codex-migration-architecture.xkhcAx` support the investigation; they are not product/importer code. Source hashes were checked again after the investigation.

## 1. Method and integrity inventory — VERIFIED

Recursively enumerate the three source directories, hash every regular file, and parse all `.json` files. Classify document candidates by an actual root `type` string, not by extension alone. Traverse authored `children` and owned `relation.leftMargin`, `relation.rightMargin`, and `relation["superposition:…"]`; do not count arbitrary metadata as Blocks. Count each file's authored occurrences, including duplicate copies, rather than deduplicating before reporting. Cells created by the current decoder are not legacy Blocks.

The 182 non-document JSON records under `data/edgar-allan-poe/.memory` are historical storage evidence, not malformed documents. All 562 `.memory` files, including extensionless chunks/staged data and a lock file, are included in the source hash inventory but excluded from the current-document corpus. Historical archive migration is a separate unresolved scope. Three image assets and two `.DS_Store` files are also outside that corpus.

The source inventory covers **2,983 files**: 2,957 under `data`, 10 node exports, and 16 edge exports. The SHA-256 of compact, key-sorted JSON mapping source-relative filenames to their SHA-256 values is:

```text
e4ecd7e1dce78e494d32e01779ca9f873d284d1941244fbcf6bb9da7a08a9f62
```

| Measure | Actual count / interpretation |
|---|---:|
| JSON files under `data` | 2,572 |
| Block-tree document/container/template files | 2,390 |
| Non-document JSON history records | 182 |
| Authored Blocks, including roots and owned relations | 9,767 |
| Distinct nonempty Block IDs | 9,054 |
| Block occurrences missing IDs | 14, all in two templates |
| BlockProperty records, separate from standoff | 2,343 |
| Standoff properties | 53,023 |
| Standoff type strings | 75 |
| Entity Reference standoff properties | 35,880 |
| Active / deleted Entity References | 35,879 / 1 |
| Unique nonempty raw Entity Reference target strings | 6,493 |
| Bare referenced UUIDs matching graph nodes | 6,491 |
| Matching Entity Reference occurrences | 35,815, all targeting `agents.json` |
| Nodes referenced by a bare document Entity Reference | 6,491 |
| Nodes without a bare document Entity Reference | 11,488 |
| Additional node matched after qualified-ID parsing | 1 |
| Graph nodes | 17,979 |
| Graph edges | 16,196 |
| Graph endpoint occurrences | 32,392 |
| Globally absent graph endpoint IDs | 0 |
| Endpoint occurrences inconsistent with their declared node category | 3,775, across 2,865 edge records |
| Duplicate node GUIDs / missing node GUIDs | 0 / 0 |
| Existing edge GUIDs | 0: no export supplies an edge ID |
| Identical duplicate edge JSON payloads within an export | 0 |
| Duplicate root IDs across files | 34 groups, 36 additional occurrences |
| Duplicate Block IDs across the complete corpus | 430 groups, 699 additional occurrences |
| Files with within-file duplicate Block IDs | 2 |
| Standoff properties missing IDs | 28 |
| Duplicate standoff IDs across files | 148 groups, 148 additional occurrences |
| Duplicate standoff IDs within the same file/Block | 0 |
| Syntactically malformed JSON files | 0, across all 2,598 JSON source files |
| Standoff ranges rejected by current saved projection | 214 properties in 190 files |
| Blocks containing a non-BMP character | 1 |

“Matching occurrences” includes the deleted property; the active direct matches are 35,814. Distinct raw target strings exclude 54 null values. Parsing the one qualified target increases referenced graph nodes to 6,492 and reduces graph-only nodes to 11,487. “Graph-only” here means no Entity Reference standoff target; other annotation types and graph edges may still reference them.

**Unresolved Entity References:** 65 active occurrences: 54 null targets, 10 instances of `abd-def-ghi-123`, and one `Agent:⟨204c72fa-8881-4033-8f97-be83097ca62b⟩`. The last is resolvable by explicit namespace parsing, leaving **64 occurrences genuinely without a supplied node target**. The 10 placeholders occur in `test-01.json`, `test-02.json`, `uploads/20250729_2304.json`, `uploads/testy.json`, and `uploads/standard-page.json`, two each. No entity-name matching was used.

All 34 duplicate-root groups contain differences in their complete parsed JSON. These differences have not been adjudicated as meaningful versus incidental. For example, `cellini_autobiography/i-[32e115ba].json` and `misc/cellini_chapter-1.json` both claim root `32e115ba-4ffa-438c-8d4f-e6497b1e6f4d`. The Raven's `ba75c497-625b-415a-bbb5-d668fcbd67dc` appears as two standalone roots and within three upload containers. Preserve versions/provenance; neither silently choose one nor manufacture new identities for every copy.

## 2. Legacy documents — VERIFIED representation

The primary envelope is the BlockTree itself, without `format` or version fields. The six root field shapes are:

| Fields | Records |
|---|---:|
| `children,id,title,type` | 2,238 |
| `children,id,metadata,title,type` | 1 |
| `blockProperties,children,id,metadata,type` | 57 |
| `children,id,metadata,type` | 88 |
| `children,id,type` | 4 |
| `children,metadata,type` | 2 |

Root types are `main-list-block` (2,362), `document-block` (20), `document-tab-row-block` (5), and `membrane-block` (3). Counts include two identity-free templates; the tab/container exports are not all independently admissible Documents.

Blocks use lowercase `id`, `type`, `children`, `relation`, `text`, `blockProperties`, `standoffProperties`, and optionally `metadata`/`title`. IDs are strings: generally UUIDs, with real sample IDs such as `workspace-demo-0` also present. The current Block model does not require UUID formatting. Child order is authored order. Margins can themselves contain `main-list-block` trees. There are 34 Block types and 24 field-key variants; the exact observed variants are recorded in Appendix A below.

Two principal standoff record shapes account for almost the whole corpus:

```json
{"id":"b104b29f-c37c-48b3-b159-9f386fbc7387","type":"codex/entity-reference","start":4,"end":15,"value":"b91efccb-027c-4212-bfc5-e23a44c01ffc","zeroPoint":false,"metadata":[]}
```

```json
{"id":"5bf2f547-5ca1-48ac-8221-00ca25c6eb43","type":"codex/entity-reference","start":5,"end":8,"value":"501a8a32-2c8a-4934-9060-8c7e36339f0f","text":"Rom","metadata":{"offsetY":0},"plugin":null,"isDeleted":false}
```

The first is the Via Ricasole footnote; the second is the Rome mention in `misc/michelangelo_1557-10_To-Lionardo-di-Buonarroto-Simoni.json`. Seven property field variants were found:

| Fields | Records |
|---|---:|
| `end,id,metadata,start,type,value,zeroPoint` | 42,811 |
| `end,id,isDeleted,metadata,plugin,start,text,type,value` | 10,177 |
| `end,start,type` | 18 |
| `end,start,type,value` | 10 |
| `end,id,start,type` | 4 |
| `end,id,start,type,value` | 2 |
| `end,id,metadata,start,type,value` | 1 |

Entity References use `type: "codex/entity-reference"` and `value: <Agent GUID>`. Metadata is not uniformly an object: arrays such as `[]` or `["name|Rome"]` are real. Preserve them as authored values. `metadata.entityName`, legacy property `text`, and embedded labels are descriptive/cache evidence, not identity.

**Range semantics:** ordinary standoff ranges are inclusive cell indexes, with one Unicode code point per cell. Historical editor code in [standoff-editor-block.ts](src/blocks/standoff-editor-block.ts), `createCells` (line 1137), uses `[...text]`; [standoff-property.ts](src/library/standoff-property.ts), `serialize` (line 265), saves the start/end cells' indexes. The cached `text` uses `substring(start,end)`, excluding the last character, and does not establish half-open range semantics. All 10,177 properties with this cached `text` disagree with the inclusive current snippet. For example, range 5–8 is **Rome**, although the cached text is **Rom**. Do not shorten ranges to fit cached text.

The current codec also creates one code-point cell per character. No general UTF-16 or end-index conversion is required in canonical document data. The current SQLite projection converts inclusive `end` to half-open `endIndex = end + 1`; that is an index representation, not a document rewrite.

**Exceptions:** 518 `codex/document-reference` properties and 284 `hyphen` properties carry `zeroPoint: true`. Of the 214 rejected ranges, 177 are zero-point document references with `start=end=textCellCount`; the remaining 37 have an inclusive end equal to cell count: 26 `page`, 10 `text/sentence`, and one `manuscript/line`. All are active. Zero-point semantics require specific qualification, including in-range cases that pass arithmetic validation but can be interpreted as a one-cell annotation by current consumers.

The sole non-BMP example is `luca-landucci_diary/1499-04-26-[e9ebc0f8].json`, Block `d34bd780-0c2a-4caf-a018-54cf9d07b41e`, containing `😛`. It loads/admit-round-trips exactly, but its full-document SQL projection fails range validation. This is not evidence for converting every source offset to UTF-16; its exceptional spans and historical edits need review.

**Other preserved fields:** `baseIndex`, `len`, `lastCharCode` appear in 19 Blocks; `plugin`, `zeroPoint`, `checked`, arrays of metadata, focus bookmarks, media URLs, and older style/type names remain in authored bags. Examples of unnormalized names include `block/alignment/right`, `block/alignment/left ` (trailing space), `block/font/size/h3`, `tei/…`, `manuscript/line`, and `codex/trait-reference`. Unknown/obsolete fields round-trip; this does not prove an installed renderer or active feature understands their semantics. No blanket style renaming, text cleanup, metadata conversion, or conversion to linked annotations is justified.

Besides the 35,880 standoff Entity References, three `blockProperties` have the same type string. Preserve these too. Today's mention extraction keys off standoff properties; the three block-level assertions are not included in the reported Entity Reference standoff counts or automatically turned into mentions.

## 3. Legacy graph nodes — VERIFIED

Every node export is a UTF-8 JSON array. Each file has exactly one field-key variant. `Guid` is globally unique across all ten exports, and **all 17,979 GUIDs are UUIDv4**. There is no Surreal table prefix in the node arrays.

| File | Nodes | Actual fields (all also have Guid, IsDeleted) |
|---|---:|---|
| `agents.json` | 9,057 | AgentType; Name; Value |
| `claims.json` | 1,990 | Role; Name |
| `concepts.json` | 990 | Name; Code |
| `data-points.json` | 30 | Name; Value |
| `data-sets.json` | 19 | Name |
| `meta-relation-types.json` | 145 | Name; DominantName/Code; SubordinateName/Code |
| `meta-relations.json` | 835 | No label or attributes |
| `properties.json` | 1,963 | Value |
| `property-types.json` | 21 | Name; Code |
| `times.json` | 2,929 | DisplayName; Year/Month/Day/Minute/Second; Season/Around/Section |

The filename supplies node category. Only Agents have `AgentType`, with 22 distinct values including null: `Person`, `Place`, `Collective`, `Object`, `Concept`, `Event`, `Text`, `Artefact`, and others. 1,239 Agents have null type; 283 have non-null `Value`. `Value` sometimes names a referenced document/resource or stores other content. It is not an alias field.

There are **no explicit alias lists, authorship timestamps, source provenance fields, or separate `attributes` bags** in these exports. Preserve each entire source record and its file/ordinal in import provenance. Do not invent those missing facts or convert every Agent `Value` to an alias/relationship.

6,184 nodes have missing/blank `Name`, but some have `DisplayName` or `Value`. Even after considering `Name`, `DisplayName`, and `Value`, 1,236 nodes have no nonempty string label: 835 MetaRelations, 362 Claims, 29 Agents, nine Properties, and one MetaRelationType. 66 Agents have no nonempty `Name`; 37 of these have a nonempty `Value`, whose meaning must be checked before using it as a display label.

Two Concepts have `IsDeleted: true`; all other nodes are false. SQLite `Entity` has no native deletion/tombstone column. Retaining `IsDeleted` in attributes preserves evidence, but does not reproduce hidden/deleted behavior in current entity search. This needs an explicit policy.

**Revised proposed mapping:** named semantic things retain `Guid → Entity.guid`, using types such as Person, Place, Concept and Time. Time additionally has a structured extension. Claims, DataPoints and DataSets preserve their GUIDs in specialized canonical structures, without duplicate Entity records. Preserve source categories and all original fields in attributes/provenance. Null/unclassified Agent types stay explicit. Actor remains attribution machinery. Qualified MetaRelation assertions may instead reuse their GUID as a **Relationship.guid**; referenced/otherwise unqualified assertions remain temporary general RelationAssertion Entities. Type dictionaries can become descriptor attributes/provenance where lossless. Section 12 evaluates these decisions per construct; dedicated legacy tables and universal `codex/` prefixes are not proposed.

## 4. Legacy graph edges — VERIFIED structure and source corruption

All 16 exports are JSON arrays. Fifteen contain records; `datapoint_refers_to_agent.json` is empty. No edge has a GUID or timestamps. Endpoints are named nested objects with `Guid` and optional cached `Name`, `Value` or `DisplayName`; file names encode predicate families. Additional facts are `Role`, `Relation.IsDominant`, or the actually misspelled `IsPimary`.

The following source roles are observed from the exports. The user authoritatively confirms Agent → Property for `agent_has_property`, Concept → Concept for `subset_of_concept`, Property → Time for `property_at_time`, and Property → PropertyType for `type_of_property`. Their meanings are known despite corruption in two exported payloads. Other native predicate mappings remain explicit proposals. Source exports do not provide separate database `in/out` fields; preserve original roles and JSON in provenance.

| File / predicate family | Edges | Endpoint roles / extra fields |
|---|---:|---|
| `acted_in_claim.json` | 4,098 | Agent → Claim; Role |
| `agent_has_property.json` | 910 | Agent → Property; **mislabeled Concept endpoints** |
| `agent_is_related_metarelation.json` | 1,670 | Agent → MetaRelation; Relation.IsDominant |
| `claim_at_time.json` | 1,689 | Claim → Time |
| `datapoint_at_place.json` | 21 | DataPoint → Agent |
| `datapoint_at_time.json` | 27 | DataPoint → Time |
| `datapoint_measured_in.json` | 25 | DataPoint → Concept |
| `datapoint_refers_to_agent.json` | 0 | Empty; no observed endpoint schema |
| `metarelation_at_time.json` | 10 | MetaRelation → Time |
| `part_of_dataset.json` | 30 | DataPoint → DataSet |
| `property_at_time.json` | 1,955 | Property → Time; **Time GUIDs actually PropertyType** |
| `subset_of_concept.json` | 910 | Source Concept → Target Concept; IsPimary |
| `type_of_agent.json` | 109 | Agent → Concept |
| `type_of_claim.json` | 1,962 | Claim → Concept |
| `type_of_metarelation.json` | 825 | MetaRelation → MetaRelationType |
| `type_of_property.json` | 1,955 | Property → PropertyType |

The source is an incidence graph: `agent_is_related_metarelation.json` supplies exactly two records for each of 835 MetaRelations, one dominant and one subordinate. This does not require preserving its physical structure. Reuse the assertion GUID as Relationship.guid and transfer type/roles/provenance for qualified direct relationships; keep temporary RelationAssertion Entities when reference/time/other semantics are not yet safely representable. Section 12 supplies the actual reference analysis and per-record collapse gates.

**VERIFIED evidence of probable legacy export/data corruption:**

- All 1,955 `property_at_time` records use a `Time.Guid` that resolves to a **PropertyType**, not a Time. Their `(Property.Guid, Time.Guid)` pairs exactly repeat `type_of_property`'s pairs in the same order.
- All 910 `agent_has_property` records use endpoint GUIDs belonging to **Concepts**, not Agents/Properties. Their pairs exactly repeat `subset_of_concept`'s pairs in the same order.
- Thus there are zero globally dangling endpoints, but 3,775 incorrectly categorized endpoint occurrences. A global UUID join alone would hide the problem. Suspected export duplication is an inference from these comparisons; the intended predicate meanings are supplied authoritatively by the user, but the missing correct endpoint relationships cannot be recovered from names or guessed. Quarantine these payloads rather than reinterpret their meaning.

**Current binary representability:** SQLite `Relationship` supports directed connections between Entities, parallel edges, self-loops and JSON attributes; no uniqueness constraint collapses equal endpoint/type pairs. Preserve `IsDominant`, `IsPimary` and endpoint snapshots in attributes where those connections remain Relationships. Qualified MetaRelation simplification and temporary RelationAssertion Entities fit this binary model. Claim participation and observation dimensions instead require the specialized structures in section 12; their structural semantics must not be flattened merely to fit the current schema. Today's relationship mutation API also lacks attributes/provenance writes.

There is no original edge ID to reuse. Allocate a persistent UUIDv4-compatible identity map for import relationships, or approve deterministic UUIDv4-shaped hashes with collision checking. The current canonical API's validator rejects UUIDv5 even though SQLite TEXT columns would accept it. Keep distinct source records/predicate families in provenance and quarantine the corrupt exports; do not recast accidental pairs as other valid relationships. A MetaRelation that survives as a direct Relationship reuses its existing assertion GUID rather than allocating a new one. Record identity decisions in a manifest.

## 5. Current Mutable source trace — VERIFIED

| Area | Actual implementation and contract |
|---|---|
| Block wire/runtime model | [types.ts](src/block-tree/types.ts), `ExistingBlockDto`, `ContentRecord`, `PlacementRecord`, `RepositoryState`; authored IDs differ from private runtime keys |
| Legacy BlockTree loader/writer | [codecs.ts](src/block-tree/codecs.ts): `viewTypeFor` line 24, `decodeBlockTree` line 43, `encodeDocument` line 220; `main-list-block` and `membrane-block` view as `document-block`, preserving the original wire type |
| Content recognition | [compatible-document.ts](src/persistence/compatible-document.ts): `recognizeCompatibleDocument` line 8; 20 MiB/100,000 Blocks/depth 256; requires nonempty unique Block IDs, one root Document, no nested Document resources |
| Native serialization | [native-resource.ts](src/persistence/native-resource.ts): `captureNative` line 26, `nativeEnvelope` line 102, `nativeText` line 117, `decodeNative` line 166; `mutable-document` v1 with authored-value grammar and a portable resource definition table |
| Native admission | Same file, `admitNative` line 185: detached validation, existing object bank, identity/canonical ownership checks, one commit, no automatic disk/live overwrite |
| Native normalized graph | [portable.ts](src/history/stage-c-gates/portable.ts), `encodeGateDocument` / `decodeGateDocument`: Blocks keyed by authored ID, ordered placement edges, text atoms; `properties` preserve authored bags |
| Placement identity | [durable-core.ts](src/history/durable-core.ts), `durablePlacementId` line 21; legacy fallback includes runtime placement key, which is freshly allocated by [ids.ts](src/block-tree/ids.ts) |
| Open/save lifecycle | [native-session.ts](src/persistence/native-session.ts), `openCompatible`, `openResource`, `bind`, Save/recovery; verified path/hash evidence, pending-generation handling and canonical resource membership |
| Paired persistence | [resource-pair.ts](src/persistence/resource-pair.ts), `ResourcePair.save`; captures native plus derived Markdown once; [managed-pair.mjs](src/persistence/managed-pair.mjs) owns journaled publication/receipts/recovery |
| Managed HTTP storage | [native-document-store.mjs](server/native-document-store.mjs), `createNativeDocumentStoreRouter`: `/recognize`, `/open`, `/save`, `/recover`, `/save-recognized`; native destinations require `.mutable.json`, paired export is `.md` |
| Recognized legacy Save | [recognized-document-store.mjs](server/recognized-document-store.mjs), `RecognizedDocumentStore.save`: source format/hash verified, no implicit conversion; `encodeRecognizedDocument` refuses an unpreservable generation |
| Vault establishment/session | [document-vault.ts](src/application/document-vault.ts), `documentVaultService`, Open establishes then discovers; [sqlite-knowledge-host.ts](server/sqlite-knowledge-host.ts), `SqliteKnowledgeHost.establish` / `acquireContext` |
| Vault discovery | [native-vault-store.mjs](server/native-vault-store.mjs), `NativeVaultStore.discover` line 125: `.mutable.json` native rows; other files are candidates for recognition on explicit Open; excludes `.mutable` and `.mutable-*`; scan limit 10,000 |
| Identity/source proof | [recognized-source.mjs](server/recognized-source.mjs), `verifyDocumentSource`: confines source to vault, scans possible content identities, rejects duplicate identity, pending or changed evidence |
| SQLite ownership | [client.mjs](src/knowledge-sqlite/client.mjs), vault-owned worker; [foundation.mjs](src/knowledge-sqlite/foundation.mjs), `openFoundation`; [paths.mjs](src/knowledge-sqlite/paths.mjs), `<vault>/.mutable/mutable.db`, `audit.db`, writer lease |
| Migrations | [mutable SQL](src/knowledge-sqlite/migrations/mutable/0001-foundation.sql), [audit SQL](src/knowledge-sqlite/migrations/audit/0001-foundation.sql); [schema.mjs](src/knowledge-sqlite/schema.mjs) validates application IDs, vault UUID, checksums and schema structure; version 1 |
| Canonical knowledge | Mutable DB `Actor`, `Entity`, `EntityAlias`, `Relationship`; `Entity.guid` and `Relationship.guid` unique; Relationship endpoints FK to Entity.guid |
| Derived saved index | Mutable DB `Resource`, `ResourceTag`, `Block`, `BlockProperty`, `BlockRelation`, `AnnotationDefinition`, `StandoffProperty`, `BlockTextRun`; `Block.guid` globally unique, not merely resource-scoped |
| Search | FTS5 `BlockSearch`, `EntitySearch`, `EntityAliasSearch` with maintenance triggers; file-derived tables can be cleared/rebuilt without deleting canonical Entities/Relationships |
| Projection and reconciliation | [saved-projection.ts](src/knowledge-sqlite/saved-projection.ts), `projectSaved`: authored standoff retained in attributes, half-open cell ranges, exact `targetEntityGuid`; [reconcile.mjs](src/knowledge-sqlite/reconcile.mjs): staged comparison and transactional publication |
| Save/index lifecycle | [sqlite-saved-indexer.ts](server/sqlite-saved-indexer.ts), `createSavedIndexer.refresh`: discovery/fence/hash checks, duplicate Resource/Block checks, fail closed on issues; [sqlite-index-lifecycle.ts](src/application/sqlite-index-lifecycle.ts) and `SqliteKnowledgeHost` schedule/reconcile outside typing |
| Entity UI/service | [entity-service.ts](src/application/entity-service.ts), `entityService`: source-scoped vault resolver; `/api/sqlite/knowledge/entities` → worker → [entities.mjs](src/knowledge-sqlite/entities.mjs), `canonicalEntities`; `get` joins `Entity.guid` exactly |
| Entity Reference production | [entity-search.ts](src/features/entity-references/entity-search.ts): `value = entity.id`, optional metadata ID/name; [facts-annotations.ts](src/knowledge/facts-annotations.ts) and [document-entities.ts](src/features/entity-references/document-entities.ts): logical standoff mentions, deleted excluded |
| Composition/defaults | [configuration.ts](src/configuration.ts): native persistence, sqliteKnowledge, sqliteEntities and Entity References on; nativeKnowledgeSaved off; preserve these defaults |

**Architecture corrections:**

1. **`.ink` and `.mutable.json` denote the same native document format.** Use the existing `mutable-document` codec and save imports as `.ink`; no new format or serializer is needed. The inspected implementation has some suffix-sensitive path checks/discovery/indexing filters that currently name `.mutable.json` or `.json`. Those checks must honor `.ink` as an equivalent native filename when the importer is implemented; they are filename-support work, not a distinction in document meaning.
2. The legacy tree compatibility tests establish that Blocks and standoff data can survive native serialization unchanged in meaning and identity. Existing in-place legacy Save remains available for legacy sources, but the selected import output is the same native envelope used by `.mutable.json`, saved as `.ink`.
3. Selecting an actual Mutable Vault establishes SQLite infrastructure; merely dropping files into a arbitrary directory is insufficient. Do not initialize a nested `imported/` vault inside an existing selected vault: overlap is rejected. Document files can live below `imported/documents/` within the selected root; databases belong to that root's `.mutable`.
4. No authoritative `entities.json` is used by the inspected canonical vault Entity path. SQLite is the correct graph destination.
5. SurrealDB still exists in legacy server code: [server/index.ts](server/index.ts) imports/initializes it and `saveDocumentIndex` still handles older `/saveDocumentJson` indexing. The canonical global Surreal Entity router is explicitly unmounted (line 467). Do not claim SurrealDB has been removed from the application. The importer should target the vault SQLite/native path, without adding Surreal writes or requiring legacy database indexing.
6. Derived `StandoffProperty.targetEntityGuid` deliberately has **no Entity FK**. An indexed reference is a file assertion, not proof that a canonical Entity exists. Explicit entity joins are necessary for integrity checks; mention extraction does not create canonical entities.

## 6. Actual compatibility execution — VERIFIED

A temporary TypeScript harness, bundled using the repository's installed `esbuild`, ran against every classified Block-tree file under Node v22.12.0. It imported the actual source functions, did not mock their validators, and never opened a database/server or called filesystem save methods. Per-file results are in the temporary `compatibility-results.json`.

The comparisons canonicalize JSON object-key order only. Arrays, values, text, property bags and collections remain exact. Each file ran:

```text
bytes → decodeBlockTree → encodeDocument → compare original parsed tree
bytes → recognizeCompatibleDocument → encodeRecognizedDocument → compare tree
recognized resource → nativeBytes (in memory) → decodeNative
                    → resourceToRepository → encodeDocument → compare tree
bytes → projectSaved(bytes, fixed qualification vault UUID)  [no SQLite write]
```

| Check | Pass | Fail |
|---|---:|---:|
| Raw legacy decode/encode exact equality | 2,390 | 0 |
| Current content recognizer / native capture | 2,379 | 11 |
| Recognized legacy writer exact equality | 2,379 | 0 of recognized files |
| Native-envelope decode back to exact original tree | 2,379 | 0 of recognized files |
| Read-only saved SQL projection | 2,196 | 194 |

All 2,196 successful projections had no projection diagnostics under the default extraction policy. Seven projection-success files are not admissible standalone Documents; conversely 190 recognized documents fail projection on ranges. The intersection of recognition and projection success is **2,189 files**. Passing individually does not resolve collisions across files or guarantee complete vault-level indexing.

The 11 recognition failures and smallest qualified remedies are:

| Files | Actual failure | Smallest necessary action; no action performed |
|---|---|---|
| `templates/manuscript.json`, `templates/medieval.json` | Missing authored IDs, 14 Blocks total | Keep as templates outside Document import; if explicitly instantiated, assign IDs then. No old identity exists to preserve |
| `misc/test123.json` | Block `5842a11c-b7ce-4409-b37f-72c0cc0f035d` appears twice | Establish whether occurrences represent one shared Block or distinct authored Blocks. Raw nested tree cannot express this distinction safely; no blanket regenerate-ID rule |
| `uploads/leonardo-notes.json` | Block `1dc90b57-db02-43ac-acf5-c4eb81e3b864` appears twice | Same duplicate-identity review, plus container/resource qualification |
| `uploads/poe-the-raven-[ba75c497].json`, `uploads/poe-the-raven-pages.json`, `uploads/poe-the-raven.pages.json`, `uploads/standard-page.json` | Root is a `document-tab-row-block`, not a Document | Use a qualified container/workspace handler or plan contained Documents plus a retained presentation wrapper. Do not just rename the root type |
| `uploads/20250729_2304.json`, `uploads/testy.json`, `vernon-blake_the-art-and-craft-of-drawing/intro-20250802.json` | Nested Document resources, including aliases/margins | Qualify explicit resource boundaries and preserve their wrapper/layout relationships. Generic compatible admission intentionally refuses them |

The 194 SQL projection failures comprise the 190 range-failing files, two duplicate-Block files, and two identity-free templates. This is independent of content recognition; the 7 complex container files can be projected but cannot be admitted by the generic Document recognizer.

Four real documents also passed **`admitNative` into a fresh in-memory object bank with enforced Block identity**, followed by resource capture: the Via Ricasole footnote below, the 1557 Michelangelo letter, Cellini chapter I, and the non-BMP Landucci entry. No saved file or database was involved. Direct legacy export of a live object-bank registration is intentionally refused by `LegacyExportLossError`; capture the Document resource first, as production does.

**Limitations:** this qualifies actual codecs/admission and projection, not UI rendering of all 75 historic annotation types or persisted SQLite graph writes. No disposable SQLite population was attempted because this phase explicitly forbids SQLite writes. The selected live destination/vault was not specified; collision checks against existing destination canonical rows remain a later requirement.

## 7. REQUIRED versus OPTIONAL transformations

**REQUIRED for ordinary recognized documents:** preserve authored Blocks, IDs, text, properties and inclusive ranges, and serialize through `captureNative → nativeBytes` into the existing native document format. Save that result as `.ink`, which is equivalent to `.mutable.json`. The current codec moves payloads into definition-table `properties`, text into `inline` atoms, and owned children/relations into placement edges without changing the authored type/value data. Do not introduce an alternate `.ink` schema or modernize annotations merely to change the filename.


**REQUIRED for stable import packaging:** persist/derive new placement IDs. The current legacy fallback `legacy:<resourceId>:<runtime placement key>` includes freshly allocated keys, so two independent legacy decodes do not produce byte-identical native envelopes. This does not alter old Block identity, but a rerunnable importer must assign supported stable placement IDs or retain the first verified native generation in its reviewed manifest. No random regeneration on retries.

**REQUIRED for graph records:** assign IMPORT, PRESERVE, UNRESOLVED or QUARANTINE dispositions under section 12. Create canonical Entities for named things, Time extensions for temporal structure, Claim/ClaimParticipant/ClaimQualifier records for n-ary assertions, and DataSet/DataPoint/DataPointDimension records for observations. Preserve source UUIDs in the appropriate canonical storage kind and all source fields. Qualified reified MetaRelations reuse their GUID as Relationship.guid; type dictionaries may collapse into descriptors/provenance; corrupt rows remain quarantine evidence. Ordinary Relationships retain actual Entity endpoint UUIDs, direction and flags. Graph export records have no edge IDs, so newly allocated IDs do not replace a legacy edge GUID. Do not convert historical Agents into attribution Actors.

**REQUIRED reconstruction of `StandoffProperty` records — confirmed by the user:** if no legacy graph nodes of Type `StandoffProperty` exist, reconstruct the SQLite `StandoffProperty` records from each Document’s `standoffProperties` JSON. The inspected graph exports contain no such nodes, so reconstruction is required for this source snapshot. Cover all standoff types, not only Entity References; the source inventory contains 53,023 standoff properties before reviewed duplicate/version dispositions.

Use the existing `projectSaved` and saved-index reconciliation path. Each reconstructed record retains its Document/Block association, authored property ID where present, type, value, metadata, deletion state and original JSON. Specifically: `id → authoredId`, `type → typename`, `start → startIndex`, inclusive `end → endIndex = end + 1`, and standoff editor coordinates → `cell`. The complete property JSON is retained in the row’s `attributes` using the existing authored-value encoding; `valueJson` preserves the value’s shape. The projection derives a scoped SQL row GUID, including for the 28 properties without authored IDs, without inserting new IDs into the canonical Document. Entity Reference values additionally populate `targetEntityGuid` without creating an Entity record.

Reconcile from the final saved `.ink` files so reconstructed rows are consistent with the imported document generation. Preserve the one deleted Entity Reference as a deleted record rather than treating it as an active mention. Resolve the previously identified range and cross-file identity issues before claiming complete reconstruction; do not drop unsupported records to obtain a successful count. The absence of exported `StandoffProperty` nodes itself requires no new schema or standalone annotation store because the existing SQLite table/projection provides this representation.

This instruction reconstructs annotation records. The null/demo Entity Reference target dispositions identified elsewhere remain separate integrity issues; no target Entity creation is inferred from this clarification.


**REQUIRED for the one qualified reference:** after proving `Agent:⟨UUID⟩ → agents.json.Guid`, change only the canonical target string to that same UUID. Also update cached `metadata.entityId` if present and retain the original qualified string in manifest provenance. This preserves entity identity through an explicit namespace encoding change; it does not use a label lookup.

**REQUIRED decisions before any transformation:** duplicate versions/shared identities; name fallback for 1,236 entirely unlabeled records; tombstone behavior; the 64 null/placeholder references; zero-point semantics and 37 end-boundary spans; container/resource treatment; quarantine coverage for corrupt edge exports; and whether historical archives/assets are in scope. MetaRelation/definition decisions follow section 12; collapsed objects need no synthetic Entity label. Preserve exact originals as evidence when a record is quarantined. An excluded record must appear in counts/reasons rather than disappear from the manifest.

For a boundary zero-point at `start=end=N`, a possible empty-range representation is `start=N,end=N-1`; the SQL projector permits it and would produce `[N,N)`. However, `annotationCollector` rejects `end < start`, and arithmetic acceptance alone does not preserve point behavior. **This is a candidate representation, not an approved repair.** The current authored `zeroPoint` survives serialization but has no qualified dedicated behavior in the inspected current annotation path. For non-zero-point `end=N`, changing to `N-1` would pass bounds, but the intended span must be established first. Do not append text, globally clamp ranges, or change all end indexes merely to pass indexing.

**OPTIONAL:** mirror legacy top-level `title`/metadata `name` into `metadata.title` for current catalog/UI display; the native projection currently reads `metadata.title`, and original top-level `title` is preserved but not catalogued. Keep the original fields if an enrichment is approved. Also optional: imported aliases where authoritative evidence exists, rebuilding FTS after publication, and an explicitly approved historical archive/asset import. Style modernization and wholesale linked-annotation conversion are unnecessary and unqualified.

## 8. Revised migration architecture and lifecycle

| Previous proposal | Revised conclusion from current implementation |
|---|---|
| `.ink` canonical documents | Retain the existing native format; `.mutable.json` and `.ink` are equivalent. Name imported native documents **`.ink`** and make suffix-sensitive paths accept that name |
| SQLite canonical knowledge | Retain Entity/Relationship for things/binary connections; add the independently justified assertion, temporal and observation structures proposed in section 12 |
| SQLite-derived query indexes | Retain; use normal saved projection/reconciliation, never author them as an independent content copy |
| No authoritative `entities.json` | Retain |
| No Surreal persistence for migration | Retain as migration design; existing legacy Surreal code remains in the application |
| `imported/documents` | Retain as a **relative directory inside the selected existing vault**, subject to identity/asset/layout decisions |
| `imported/.codex-import` audit directory | Change: use **`<vault>/.mutable/codex-import/<run-id>/`** as a proposed audit location, outside the canonical documents |

`imported/.codex-import` is not automatically excluded by discovery. Its `manifest.json`/`report.json` would be passed to the saved JSON inspector, fail as non-Block data, and compromise complete indexing. `.mutable` is explicitly excluded from document discovery/source fencing. A `codex-import` subdirectory there is proposed storage, not an existing import subsystem; keep it distinct from DB filenames/locks. Do not modify the validated SQL schema to add manifest tables by assumption.

For a later approved implementation, establish/verify one selected vault, plan deterministic document/placement/edge identities and conflicts, use a qualified `.ink` publication/recovery path, and publish canonical knowledge through an audited import capability. The planned output files remain `.ink`; the existing native publication lifecycle must accept `.ink` as the equivalent native suffix. Only then reconcile derived Resource/Block/standoff/FTS tables against final saved `.ink` bytes, reconstructing the missing `StandoffProperty` SQL records from the Documents through the existing saved projection/reconciliation path. Preserve source hashes, per-record source→destination IDs, per-rule transformations, dispositions and integrity totals in the manifest.

There is no existing atomic transaction spanning all document files, current SQLite, and audit SQLite. `ManagedPair` journals one resource's file pair; SQLite reconciliation is transactional for derived rows, and canonical mutations retain pending audit receipts. A bulk import's journal/recovery/compensation must be designed around these actual boundaries. Do not claim a single SQL transaction makes the file publication atomic.

A major importer feature must follow [AGENTS.md](AGENTS.md): use a dedicated feature flag enabled by default unless the user specifies otherwise. This report creates no feature and changes no flag.

## 9. Implementation prerequisites and per-record qualification gates

| Status | Issue | Concrete condition to clear it |
|---|---|---|
| Gates affected identity groups | Conflicting root/Block identities and repeated uploads | Review source versions and shared-object intent, define authoritative source/retained variants and preserve manifest provenance; prove global Resource/Block uniqueness without indiscriminate reidentification |
| Gates affected files | 11 generic-admission failures | Exclude templates explicitly or qualify instantiation; approve duplicate/shared-Block and container/resource mapping without type flattening |
| Gates affected spans/files | Point semantics and 214 invalid ranges | Approve/qualify boundary point representation and intended non-point spans, including the emoji fixture, through current rendering/facts/projection behavior |
| UNRESOLVED targets; retain documents where otherwise safe | 64 null/placeholder Entity References | Recover actual IDs from authoritative evidence or approve explicit unresolved/quarantine treatment; no name-based guesses |
| BLOCKER for complete graph coverage; reviewed quarantine can allow partial import | 2,865 corrupt edge-export records | Predicate meanings are authoritative. Obtain correct endpoint exports or use QUARANTINE with explicit gaps; never reinterpret accidental pairs as canonical knowledge |
| REQUIRED before canonical import | Schema and canonical service capabilities | Versioned migrations and audited Time/Claim/observation services; full Entity/Relationship metadata; conservative tombstone/generated-label policy for retained Entities. Nullable Claim expression/DataPoint name avoid inventing labels for those structures |
| REQUIRED before bulk canonical import | Bulk audit capacity | `canonicalEntities` refuses ≥10,000 pending mutations or ≥16 MiB. Proposed destination counts differ from source counts, but batching must still respect byte/event limits. Current worker protocol has no audit-drain operation. Design durable delivery/retry before bulk writes; do not bypass/delete receipts |
| REQUIRED implementation detail | Equivalent native filenames | Make suffix-sensitive discovery, saved indexing and publication/recovery accept `.ink` for the existing native format; save imported files with that extension |
| REQUIRED qualification | Stable IDs and destination collisions | Persist new placement/edge identities, reuse unchanged node GUIDs, compare actual selected-vault rows, and prove reruns are no-ops |
| UNRESOLVED | Historical archives/media and unknown UI semantics | Declare scope for 562 `.memory` files/three assets; qualify needed historic annotations/styles and relative media targets. Raw preservation is proven; complete operational semantics are not |
| REQUIRED qualification | Persisted rehearsals and recovery | Once writes are authorized in the next phase, test disposable vault publication, foreign keys, counts, audit, restart, rollback and reconciliation. This phase did not write SQLite |

Both **schema and API** work are now required: version 1 has no structured Time, Claim or observation tables. Its existing **API** is also insufficient: `canonicalEntities({op:'create'})` writes guid/name/nameKey/timestamps only; `relationship-create` writes guid/endpoints/type/timestamps only. Extra request fields do not become attributes. It is not a lossless import service, does not expose multi-record atomic publication, and uses one bounded audit receipt per mutation. The read API also returns name/description/aliases rather than exposing all typed source fields. These are implementation requirements for later review, not permission to issue raw writes now.

## 10. Complete end-to-end examples

### 10.1 Actual document/Block → current native representation

Source: `data/luca-landucci_diary/1498-04-08-footnote-2-p136-[b4d9b723].json`. This is the **complete** original document:

```json
{
  "id": "b4d9b723-24bd-45b4-a301-4e2bb2b229da",
  "title": "1498/04/08: footnote 2 (p.136)",
  "type": "main-list-block",
  "children": [
    {
      "id": "1c9c101b-c9e7-407a-9268-25be8972aa91",
      "type": "standoff-editor-block",
      "text": "Now Via Ricasole.",
      "standoffProperties": [
        {
          "id": "b104b29f-c37c-48b3-b159-9f386fbc7387",
          "type": "codex/entity-reference",
          "start": 4,
          "end": 15,
          "value": "b91efccb-027c-4212-bfc5-e23a44c01ffc",
          "zeroPoint": false,
          "metadata": []
        }
      ],
      "blockProperties": []
    }
  ]
}
```

Below is the **complete envelope generated in memory by the current native codec**, the existing native document format, to be saved as `.ink`. This is the same serialization used for `.mutable.json`; only the filename extension differs. Placement IDs are actual IDs from this qualification run, not legacy identities and not an approved deterministic policy:

```json
{
  "format": "mutable-document",
  "version": 1,
  "resourceId": "b4d9b723-24bd-45b4-a301-4e2bb2b229da",
  "valueEncoding": "codex-authored-value-v1",
  "document": {
    "format": "codex-portable-resource-gate",
    "version": 1,
    "resourceId": "b4d9b723-24bd-45b4-a301-4e2bb2b229da",
    "root": {
      "placementId": "legacy:b4d9b723-24bd-45b4-a301-4e2bb2b229da:placement:4e79cd86-0509-4428-9e79-b3b6b05c320d",
      "kind": "owned",
      "target": {
        "kind": "local",
        "blockId": "b4d9b723-24bd-45b4-a301-4e2bb2b229da"
      }
    },
    "blocks": [
      {
        "id": "b4d9b723-24bd-45b4-a301-4e2bb2b229da",
        "type": "main-list-block",
        "properties": {
          "title": "1498/04/08: footnote 2 (p.136)"
        },
        "children": [
          {
            "placementId": "legacy:b4d9b723-24bd-45b4-a301-4e2bb2b229da:placement:65717e43-e07c-410c-8dc4-0ffbbf9dbeb6",
            "kind": "owned",
            "target": {
              "kind": "local",
              "blockId": "1c9c101b-c9e7-407a-9268-25be8972aa91"
            }
          }
        ]
      },
      {
        "id": "1c9c101b-c9e7-407a-9268-25be8972aa91",
        "type": "standoff-editor-block",
        "properties": {
          "standoffProperties": [
            {
              "id": "b104b29f-c37c-48b3-b159-9f386fbc7387",
              "type": "codex/entity-reference",
              "start": 4,
              "end": 15,
              "value": "b91efccb-027c-4212-bfc5-e23a44c01ffc",
              "zeroPoint": false,
              "metadata": []
            }
          ],
          "blockProperties": []
        },
        "inline": [
          {
            "kind": "text",
            "text": "Now Via Ricasole."
          }
        ]
      }
    ]
  },
  "definitionOwnerBlockIds": []
}
```

The resource/root UUID, child Block UUID, property UUID, entity target, inclusive range, title, metadata array and text are identical after native decode back to legacy-tree projection. Neither `main-list-block` nor the property type/range/value was rewritten. The codec packages structure and introduces placement identities only.

### 10.2 Actual Entity References → planned SQLite entities / verified derived segments

The same footnote property's range 4–15 covers `Via Ricasole`, excluding its final period. The actual authoritative Agent is:

```json
{"Guid":"b91efccb-027c-4212-bfc5-e23a44c01ffc","AgentType":"Place","Name":"Via Ricasole","Value":null,"IsDeleted":false}
```

The **planned canonical Entity row**, not a row written or observed in a database, is:

```json
{"guid":"b91efccb-027c-4212-bfc5-e23a44c01ffc","typename":"Place","name":"Via Ricasole","nameKey":"via ricasole","description":null,"attributes":{"legacy":{"sourceFile":"graph/nodes/agents.json","record":{"Guid":"b91efccb-027c-4212-bfc5-e23a44c01ffc","AgentType":"Place","Name":"Via Ricasole","Value":null,"IsDeleted":false}}},"recoveryState":"authored","revision":0}
```

`attributes` is shown decoded; storage requires a JSON string in the existing authored-value convention. Attribution/timestamps absent in the source remain absent or are explicitly labeled as new import audit times. SQLite's integer primary key is internal; identity is `guid`. Current API enrichment is required to write typename/attributes.

The actual read-only `projectSaved` segment is:

```json
{
  "guid": "e3f12c38-d3ce-5dd7-9454-2c83d5062243",
  "resourceGuid": "b4d9b723-24bd-45b4-a301-4e2bb2b229da",
  "sourceBlockGuid": "1c9c101b-c9e7-407a-9268-25be8972aa91",
  "authoredId": "b104b29f-c37c-48b3-b159-9f386fbc7387",
  "identityKind": "authored",
  "typename": "codex/entity-reference",
  "startIndex": 4,
  "endIndex": 16,
  "coordinate": "cell",
  "text": "Via Ricasole",
  "value": "b91efccb-027c-4212-bfc5-e23a44c01ffc",
  "targetEntityGuid": "b91efccb-027c-4212-bfc5-e23a44c01ffc",
  "isDeleted": 0,
  "resolution": "direct"
}
```

Here the derived segment `guid` is UUIDv5, scoped by qualification vault/profile/resource/Block/property. That is legitimate for derived indexes. `authoredId` preserves the original property UUID, and `targetEntityGuid` preserves the original node UUID. This must not be confused with the canonical mutation API's UUIDv4 restriction.

Three additional references in the complete 1557 letter trace through actual file/Block/property/Agent identities:

| Text / exact inclusive range | Document root | Block | Property | Exact Agent GUID → canonical Entity.guid |
|---|---|---|---|---|
| Rome, 5–8 | `4ffd0534-bafb-4a20-a982-6ba106c4e000` | `068a561c-1798-455b-a775-79a7ef89bb58` | `5bf2f547-5ca1-48ac-8221-00ca25c6eb43` | `501a8a32-2c8a-4934-9060-8c7e36339f0f` |
| Lionardo di Buonarroto Simoni, 3–31 | same | `3a62ac67-0351-453d-8605-8536c4e6bb1c` | `213ea1da-41b0-4ede-813e-8245e744f6e2` | `93ce2119-f2b8-4642-b551-7b8ca6b1ed96` |
| Florence, 3–10 | same | `78f66a24-cf7d-4b62-97e6-006380fd1fb9` | `e896c3cb-6caf-4f8a-81e9-b09af8ed6d76` | `671ee7e7-ae1b-4a5a-9591-b40203d5108f` |

These join respectively to `AgentType: Place/Person/Place` and names Rome, `Lionardo di Buonarroto Simoni (b. 1519/09/25 - d. 1599/11/18)`, and Florence. Their projected SQL ranges are `[5,9)`, `[3,32)`, and `[3,11)`, with those exact Entity UUIDs. The full letter passes recognition, native round trip, enforced-bank admission and SQL projection. This proves its document-side mapping and node join; no canonical SQLite rows were created.

Qualified-ID example: `data/test-02.json`, Block `90d3992f-8417-4cbd-bb5e-dfbe6e94f7c6`, property `9b69cbae-c5e8-4ba4-83e5-34659c1fcc1a` uses `Agent:⟨204c72fa-8881-4033-8f97-be83097ca62b⟩` in both `value` and `metadata.entityId`. Its exact embedded UUID exists in `agents.json` as `AgentType: Text` with `Value: "8e5fefba-6d63-4bbb-9f07-6501855d5feb"`. Parsing the namespace is required for current exact SQLite resolution. The cached Leonardo name is not used to find an entity or infer that this node is a Person.

### 10.3 Actual graph edge → planned current Relationship

Source `graph/edges/type_of_agent.json`, array index 1 (second record):

```json
{"Agent":{"Guid":"501a8a32-2c8a-4934-9060-8c7e36339f0f","Name":"Rome"},"Concept":{"Guid":"8dfdf246-3c8f-41d6-9dc0-b3ca6238e1f2","Name":"City"}}
```

Exact endpoint node records:

```json
[
  {"Guid":"501a8a32-2c8a-4934-9060-8c7e36339f0f","AgentType":"Place","Name":"Rome","Value":null,"IsDeleted":false},
  {"Guid":"8dfdf246-3c8f-41d6-9dc0-b3ca6238e1f2","Name":"City","Code":"city","IsDeleted":false}
]
```

Planned canonical rows reuse these GUIDs. Rome has `typename: "Place", name: "Rome", nameKey: "rome"`; City can have `typename: "Concept", name: "City", nameKey: "city"`, retaining its Code and original record in attributes. An exact **proposed** Relationship record is:

```json
{"guid":"d1921b45-4919-41c5-b24d-f313a50204cf","sourceEntityGuid":"501a8a32-2c8a-4934-9060-8c7e36339f0f","typename":"type-of","targetEntityGuid":"8dfdf246-3c8f-41d6-9dc0-b3ca6238e1f2","attributes":{"legacy":{"sourceFile":"graph/edges/type_of_agent.json","ordinal":1,"record":{"Agent":{"Guid":"501a8a32-2c8a-4934-9060-8c7e36339f0f","Name":"Rome"},"Concept":{"Guid":"8dfdf246-3c8f-41d6-9dc0-b3ca6238e1f2","Name":"City"}}}},"revision":0}
```

That new GUID was calculated for this mapping example only: first 16 bytes of SHA-256 over sorted-key compact UTF-8 JSON `{sourceFile,record}`, with UUID version/variant bits set to v4/RFC4122. This is a candidate deterministic policy requiring collision/duplicate handling and approval, not an implemented importer or an existing edge ID. Both endpoint identities remain exact. API attributes support remains required.

A role-bearing incidence demonstrates why ClaimParticipant needs explicit role and Claim identity:

```json
{"Role":"Subject","Agent":{"Guid":"edf0f17b-bf32-4cb2-9f4b-ba1141e167fc","Name":"[Florentine law enforcement]"},"Claim":{"Guid":"f541d7a2-0758-4858-8c18-46e56a319af3","Name":"Test"}}
```

`acted_in_claim.json[0]` maps to a new ClaimParticipant with `claimGuid: "f541d7a2-0758-4858-8c18-46e56a319af3"`, `entityGuid: "edf0f17b-bf32-4cb2-9f4b-ba1141e167fc"`, `role: "Subject"`, stable new participant GUID and deterministic per-Claim ordinal. Its attributes retain the entire source row/file ordinal. Claim keeps its original GUID in Claim storage; this is not an Entity→Entity Relationship. As source evidence for the simplification review, the two MetaRelation incidence records for `c05c5541-0691-4cc2-b5a4-6bd5a0c699d5` connect Franz Liszt `aba1d057-d3b6-488d-9751-474513c1347d` with `IsDominant:false`, and Anna Liszt `57d7d95a-df6d-46aa-957d-6f43ed76db61` with `IsDominant:true`. Preserve required incidence/type/time semantics under PRESERVE. The Liszt example qualifies as a candidate for direct Relationship simplification with the same assertion GUID, as section 12 explains; these incidence edges are not mandatory destination architecture.

### 10.4 Complete document/entity/edge identity chain

```text
Legacy 1557 letter root 4ffd0534-bafb-4a20-a982-6ba106c4e000
 → Block 068a561c-1798-455b-a775-79a7ef89bb58
 → property 5bf2f547-5ca1-48ac-8221-00ca25c6eb43, cells 5–8, "Rome"
 → value 501a8a32-2c8a-4934-9060-8c7e36339f0f
 → agents.json Agent.Guid 501a8a32-2c8a-4934-9060-8c7e36339f0f
 → type_of_agent.json[1]
 → concepts.json Concept.Guid 8dfdf246-3c8f-41d6-9dc0-b3ca6238e1f2, "City"

Current native resourceId 4ffd0534-bafb-4a20-a982-6ba106c4e000
 → same Block UUID and same standoff property UUID, start 5/end 8
 → derived StandoffProperty.authoredId 5bf2f547-5ca1-48ac-8221-00ca25c6eb43
   startIndex 5/endIndex 9, coordinate cell
   targetEntityGuid 501a8a32-2c8a-4934-9060-8c7e36339f0f
 → planned Entity.guid 501a8a32-2c8a-4934-9060-8c7e36339f0f
 → planned Relationship.guid d1921b45-4919-41c5-b24d-f313a50204cf
   sourceEntityGuid 501a8a32-2c8a-4934-9060-8c7e36339f0f
   typename type-of
   targetEntityGuid 8dfdf246-3c8f-41d6-9dc0-b3ca6238e1f2
 → planned Entity.guid 8dfdf246-3c8f-41d6-9dc0-b3ca6238e1f2
```

All pre-existing identities in this chain are preserved. Only normalized placement IDs, derived index row GUIDs, and a previously absent edge GUID are introduced. The document/derived projection/source joins were executed; canonical rows/edge publication remain a plan, explicitly untested with writes.

## Appendix A. Exact document Block field variants — VERIFIED

| Fields | Records |
|---|---:|
| `blockProperties,id,standoffProperties,text,type` | 4,530 |
| `blockProperties,children,id,metadata,relation,standoffProperties,text,type` | 2,398 |
| `children,id,title,type` | 2,238 |
| `blockProperties,children,id,metadata,type` | 278 |
| `children,id,metadata,type` | 170 |
| `id,metadata,text,type` | 40 |
| `blockProperties,id,metadata,text,type` | 38 |
| `baseIndex,blockProperties,id,lastCharCode,len,standoffProperties,text,type` | 19 |
| `blockProperties,children,id,metadata,text,type` | 8 |
| `children,metadata,type` | 6 |
| `id,metadata,type` | 6 |
| `blockProperties,checked,children,id,metadata,type` | 6 |
| `blockProperties,id,metadata,type` | 4 |
| `children,id,type` | 4 |
| `metadata,type` | 4 |
| `blockProperties,id,metadata,standoffProperties,text,type` | 4 |
| `blockProperties,id,metadata,relation,standoffProperties,text,type` | 4 |
| `checked,children,id,metadata,type` | 4 |
| `children,id,metadata,title,type` | 1 |
| `children,type` | 1 |
| `blockProperties,children,metadata,type` | 1 |
| `blockProperties,children,type` | 1 |
| `text,type` | 1 |
| `children,id,metadata,standoffProperties,text,type` | 1 |

These are key-set variants, not declared schema versions. Counts sum to 9,767. Source root/property/node/edge variants are listed in the corresponding sections. None of these files declares a native `mutable-document` envelope.

## 11. Final structure mapping

| Legacy structure | Current Mutable structure | Transformation required | Identity preserved? |
|---|---|---|---|
| Recognized standalone BlockTree JSON | Existing native Document format, saved as `.ink` | Lossless native serialization; preserve authored data | Yes, exact tree recoverable |
| `main-list-block` / qualifying `membrane-block` | Runtime `document-block`, authored type retained | Existing codec alias; no wire-type rename | Yes |
| Document root `id` | Native `resourceId` and root Block ID | Existing native envelope, saved as `.ink` | Yes |
| Block `id`, text, attributes/metadata | Native Block definition `id`, `properties`, text `inline` | Existing lossless packaging; no text cleanup | Yes |
| `children` and owned margins | Ordered native placements/owned relations | Allocate/persist stable new placement identities | Block IDs/order yes; placement IDs are new |
| Non-owned/unknown relation fields | Opaque relation authored bag | None unless semantics independently require a handler | Data yes; behavior unqualified |
| Standoff `id`, type, value, metadata, inclusive start/end | Native `properties.standoffProperties` | None for ordinary valid ranges | Yes |
| Missing graph nodes of Type `StandoffProperty` | Existing SQLite `StandoffProperty` rows reconstructed from Document JSON | Run saved projection/reconciliation for all standoff types; retain original property JSON and source Document/Block links | Authored IDs retained where present; SQL row GUIDs derived |
| Standoff source range | Derived `StandoffProperty`, coordinate `cell` | `endIndex = end + 1` in projection only | Authored property ID retained; index GUID derived |
| Bare Entity Reference Agent GUID | `value` → `StandoffProperty.targetEntityGuid` → `Entity.guid` | Import matching canonical node without remapping | Yes |
| `Agent:⟨UUID⟩` reference | Bare SQLite Entity UUID | Explicit namespace parse, cache-ID update, preserve source string | Same entity UUID yes |
| Null/demo placeholder reference | Unresolved authored assertion / reviewed quarantine | Requires explicit disposition; do not synthesize by name | Target cannot be established |
| Node `Guid`, category, name, other fields | Entity for named things; specialized Time/Claim/DataSet/DataPoint structures; qualified MetaRelations as Relationships | IMPORT/PRESERVE/UNRESOLVED/QUARANTINE mapping and lossless audited metadata | Surviving GUIDs retained; source identities/maps retained for deliberate collapse |
| Named Agents/people | Canonical Entity, not Actor | Preserve AgentType and historical values | Yes |
| Time | Entity(Time) plus canonical Time extension | Preserve expression/raw components; normalize only under an explicit temporal profile | Same Entity GUID |
| Claim / Trait / Event / Opinion / Intention | Claim with nullable expression and reviewed kind; ClaimParticipant and ClaimQualifier | Preserve attributed assertion, roles, exact wording/nulls; no Trait-to-Property conversion | Same Claim GUID; new incidence GUIDs |
| DataSet / DataPoint | Specialized DataSet/DataPoint; dimensions target Entity.guid | Exact raw Value/type, nullable name, dataset membership, time/place/unit dimensions | Same DataSet/DataPoint GUIDs |
| Unnamed Claim/Property and unqualified relation assertions | Claim.expression may be null; Property/RelationAssertion remain temporary typed Entities | No invented Claim wording; display-label policy only for retained Entities; qualified direct MetaRelations reuse Relationship.guid | Surviving assertion GUID yes; label new only if needed |
| `IsDeleted` node flag | Retained source attributes; no native Entity tombstone behavior | Policy/behavior qualification required | GUID yes; deletion meaning unresolved |
| Legacy edge endpoint GUIDs/predicate/roles | Relationship, ClaimParticipant/ClaimQualifier, DataPointDimension or DataPoint.datasetGuid according to semantics | Preserve semantic endpoints/roles/attributes; reuse qualified MetaRelation assertion GUID, otherwise stable new record GUID where needed | Semantic assertion/endpoints retained; obsolete incidence may collapse with proof/provenance |
| Corrupt `property_at_time` / `agent_has_property` export payloads | QUARANTINE; intended predicate meanings known | Retain complete evidence; obtain corrected endpoints or explicitly accept coverage gaps | Source IDs retained as evidence; no guessed canonical relationships |
| Repeated document/Block UUIDs | One canonical identity or reviewed retained variants | Source/shared-identity policy, not blanket ID rewriting | Conditional; currently blocked |
| Legacy tab/container roots and nested Documents | Qualified container/resources/presentation relationships | Separate admission plan preserving wrapper and ownership | Conditional; generic loader refuses |
| Historical `.memory` archive | Separate archive preservation/migration scope | Not included in current-document import | Unresolved; retain source |
| Source `.json` document files | Required `.ink` document files | Use the same native serialization as `.mutable.json`; name outputs `.ink` and support that equivalent suffix in existing file paths | Document/Block/property identity preserved |
| Document/entity querying | Derived SQLite Resource/Block/standoff/FTS indexes | Rebuild from final files/canonical knowledge | Exact target IDs; derived row identity scoped |
| Suggested `imported/.codex-import` | Proposed `<vault>/.mutable/codex-import/<run-id>` | Move audit artifacts to discovery-excluded metadata | Source→destination maps retained |

## 12. Mutable-first architectural update

**Authority and scope.** The user requested execution of [MUTABLE_CODEX_IMPORT_ARCHITECTURAL_UPDATE.md](/Users/iianneill/Downloads/MUTABLE_CODEX_IMPORT_ARCHITECTURAL_UPDATE.md). That attachment specifies a revision of this plan and evaluation of proposed schema/API structures against current Mutable code. Its conceptual SQL is design input for this revision. Earlier verified source, codec and integrity findings remain intact. The earlier architecture rejecting specialized Claim/Time/DataPoint/DataSet storage is **superseded throughout this report**.

Mutable benefits independently from three layers: **Entity** for represented things, **Claim** for attributed n-ary assertions, and **DataSet/DataPoint** for structured observations. Named Person/Place/Concept/Work/Organisation/Object/Text/Artefact objects use common Entity identity. Time keeps that identity with a structured extension. Claim/DataPoint/DataSet identities live in their own canonical structures; they are not duplicated as generic Entities to satisfy Relationship foreign keys. SQL specialization is justified by constraints, semantic queries and analytical computation, rather than by the legacy table names or whether JSON could retain the same bytes.

Document Entity References continue to target Entity.guid. Claim participants and observation dimensions also target that common identity, never legacy AgentGuid/ConceptGuid/PlaceGuid classes. Historical Claim/trait/DataPoint annotations keep their source type/value and resolve by their proper target kind. Trait, Event, Opinion and Intention are Claim kinds, not separate tables. Mutable records what sources said, believed, observed, intended or asserted without endorsing those statements as facts.

Use explicit dispositions:

- **IMPORT:** understood and safely mapped, including proved lossless simplifications. Admission requires the relevant destination capability and collision checks.
- **PRESERVE:** faithfully retained in a temporary compatible representation, with identity and useful connections intact.
- **UNRESOLVED:** original material retained without fabricated semantics; diagnostics say what interpretation or target remains unknown.
- **QUARANTINE:** corrupt/untrustworthy source evidence retained outside canonical knowledge, with expected/observed roles and explicit coverage gaps.

Dispositions apply independently to objects, connections and documents. A known Claim with unknown kind can be imported with nullable kind while its classification remains UNRESOLVED. An unresolved annotation target does not justify silently dropping the annotation or inventing an Entity. After implementation is qualified, independently safe material should proceed while exceptional material retains its own disposition. No fresh exhaustive inventory is required merely to decide an architecture; this revision inspected representative Claims, observation values/dimensions and Time components, plus the membership cardinality relevant to the proposed schema.

### 12.1 Construct-by-construct migration decisions

| Legacy construct | Disposition / proposed Mutable structure | Preserved identity and semantics | Mutable benefit / remaining qualification |
|---|---|---|---|
| Recognized Document JSON / BlockTree | IMPORT as existing native format, saved as `.ink` | Document/Block/standoff IDs, text, authored types, order, properties and nulls | Existing codec qualifies raw preservation; stable placements, equivalent suffix paths and cross-file identity groups still require implementation |
| StandoffProperty; no exported nodes of this Type | IMPORT annotation JSON into `.ink`; reconstruct derived SQLite StandoffProperty through saved projection/reconciliation | Original property ID/type/value/range/deletion/metadata and Document/Block association | Existing projection is sufficient; exceptional ranges remain individually unresolved |
| Agent / named semantic things | IMPORT Entity using reviewed AgentType, e.g. Person or Place | Exact GUID, Name, Value, type/null and deletion/source evidence | Common semantic identity and existing Entity Reference resolution; historical people are not Actors |
| Unclassified / unnamed Agent | IMPORT with nullable typename where label is valid; PRESERVE/UNRESOLVED if no safe label | Exact source identity and unknown fields | No guessed type/name; Entity still requires a nonblank name |
| Concept | IMPORT Entity(Concept) | Exact GUID, Name, Code, distinctions and valid relationships | General classification, no Concept subtype table |
| Time | IMPORT Entity(Time) + specialized Time extension | Exact GUID/expression/components; raw Season/Around/Section codes/nulls | Temporal precision/extent/filtering justify typed query storage; normalized bounds require an explicit profile |
| Claim, including Trait/Event/Opinion/Intention | IMPORT Claim + participants + qualifications; unresolved kind remains nullable | Exact Claim GUID, Name as expression including null, raw Role, each incidence and source | N-ary assertion semantics, attribution, role queries and future document understanding |
| Claim/trait references in Documents | IMPORT original annotation JSON; preserve/evaluate evidence link | Same Claim GUID, authored property ID and exact source span | Claim-aware resolution; avoid putting Claim GUID into targetEntityGuid or pretending it is an Entity |
| Property / PropertyType | PRESERVE as general Property / PropertyType Entities with trusted `type-of` edges | Exact GUID, Value/null, Name/Code and type assignment | Conservative interim structure; owner/time exports do not establish valid connections. Do not force Property into Trait |
| DataSet | IMPORT specialized DataSet | Exact GUID and Name/null, source metadata | Analytical collection, filtering, charts/tables and aggregation |
| DataPoint | IMPORT specialized DataPoint + dimensions and dataset membership | Exact GUID, Name/null, original Value and type, Time/Place/unit targets | Structured observation; numeric-looking strings remain strings |
| Simple qualified MetaRelation | IMPORT proved simplification as Relationship, reusing assertion GUID | Same assertion GUID, Entity endpoints, direction/type/roles and reconstructable provenance | Ordinary relationship identity; collapse obsolete reification only with proof |
| Referenced / temporal / unqualified MetaRelation | PRESERVE temporary RelationAssertion Entity with incidence/time connections and descriptor | Assertion target, roles, Time and definition identity | Avoid losing active navigation/query behavior; no permanent MetaRelation domain/table |
| MetaRelationType | IMPORT descriptor when lossless; PRESERVE unresolved definitions/dictionary | Original type GUID, exact name/codes/inverse labels and each use | Predicate definition metadata; document absence alone is insufficient proof of all future references |
| Valid exported connections | IMPORT into Relationship, ClaimParticipant/Qualifier, DataPointDimension or dataset FK according to section 12.7 | Endpoints, direction, exact roles, source payload and stable new incidence IDs | General binary, n-ary and dimensional structures; no predicate-specific tables |
| Corrupt Agent→Property / Property→Time payloads | QUARANTINE | Complete source files/rows/hashes and intended semantic contracts | No invented canonical facts or reinterpretation as their accidentally copied predicates |
| Exceptional IDs/containers/ranges, null/demo targets | PRESERVE or UNRESOLVED, per item | Original bytes and all identities; affected dependencies explicitly retained | Admit the independently safe subset; no indiscriminate rewriting or silent omission |
| `.memory`, assets, deleted records, absent authorship | PRESERVE source; UNRESOLVED operational/history scope | Source information and explicit unknowns | Migration audit time is not historical authorship; tombstone behavior needs qualification |
| Legacy export tables / Surreal machinery | Preserve immutable provenance, not a parallel canonical graph | Source identities/maps and complete reconstruction evidence | SQLite authority and native Documents; no entities.json or Surreal persistence for migration |

Acceptance is a complete justified source-disposition map and preservation of surviving semantic identities. Neither 17,979 Entity rows nor one Relationship per source edge is a valid invariant under this model.

### 12.2 Concrete canonical schema recommendation

The current [mutable schema](src/knowledge-sqlite/migrations/mutable/0001-foundation.sql) uses INTEGER internal keys, unique public GUIDs, STRICT tables, authored-value JSON, optimistic revisions and actor/timestamp fields. Keep those conventions. The table definitions below are a **design proposal in this report**, not applied SQL. All specialized structures live in canonical mutable.db and survive saved-index invalidation; audit.db remains the mutation/event store.

Every new canonical table has these common columns (Time uses entityGuid as its public identity):

```sql
id INTEGER PRIMARY KEY,
-- guid TEXT NOT NULL UNIQUE, except Time: entityGuid TEXT NOT NULL UNIQUE
attributes TEXT CHECK(attributes IS NULL OR json_valid(attributes)),
revision INTEGER NOT NULL DEFAULT 0 CHECK(revision >= 0),
createdByActorGuid TEXT, createdUtc TEXT,
lastUpdatedByActorGuid TEXT, modifiedUtc TEXT
```

Add the identity/core columns and indexes below. Foreign-key delete actions shown are recommendations: deleting an owner removes its subordinate incidence records, while deleting a participant/dimension Entity or a populated DataSet must be explicitly resolved rather than silently erasing canonical assertions/observations. Application validation enforces authored-value encoding; json_valid alone does not do so. Imported creation/modification timestamps describe the migration; preserve absent legacy timestamps instead of fabricating authorship.

| Table | Identity / concrete core columns | Foreign keys / constraints | Query indexes |
|---|---|---|---|
| Time | `entityGuid TEXT NOT NULL UNIQUE`, `expression TEXT`; `startYear/startMonth/startDay/startHour/startMinute/startSecond INTEGER`; same six `end* INTEGER`; `precision TEXT`, `approximation TEXT`, `certainty TEXT`, `extentKind TEXT`, `qualifier TEXT`; `normalizationProfile TEXT`, `lowerBoundDay INTEGER`, `upperBoundDayExclusive INTEGER` | entityGuid → Entity.guid ON DELETE CASCADE; bounds both null or both present with profile and upper > lower; Entity.typename must be Time through the service. Calendar/component consistency validated separately | `(normalizationProfile,lowerBoundDay,upperBoundDayExclusive)` and `(startYear,startMonth,startDay,entityGuid)`; only queries under the same profile compare normalized bounds |
| Claim | `guid TEXT NOT NULL UNIQUE`, `expression TEXT`, `typename TEXT` | Expression/kind nullable; typename is the reviewed Claim kind. No Entity FK and no forced nonblank expression or fixed kind enum | `(typename,guid)`; expression search optional when independently required |
| ClaimParticipant | `guid TEXT NOT NULL UNIQUE`, `claimGuid TEXT NOT NULL`, `entityGuid TEXT NOT NULL`, `role TEXT`, `ordinal INTEGER NOT NULL CHECK(ordinal>=0)` | claimGuid → Claim.guid ON DELETE CASCADE; entityGuid → Entity.guid with default NO ACTION; unique(claimGuid,ordinal), no unique entity/role constraint | `(claimGuid,ordinal)`, `(entityGuid,role,claimGuid)`, `(role,entityGuid,claimGuid)` |
| ClaimQualifier | `guid TEXT NOT NULL UNIQUE`, `claimGuid TEXT NOT NULL`, `entityGuid TEXT NOT NULL`, `role TEXT NOT NULL CHECK(length(trim(role))>0)`, `ordinal INTEGER NOT NULL CHECK(ordinal>=0)` | claimGuid → Claim.guid ON DELETE CASCADE; entityGuid → Entity.guid NO ACTION; unique(claimGuid,ordinal). Role semantics validated by service, not a separate table per predicate | `(claimGuid,role,ordinal)`, `(entityGuid,role,claimGuid)` |
| ClaimEvidence | `guid TEXT NOT NULL UNIQUE`, `claimGuid TEXT NOT NULL`, `resourceGuid TEXT NOT NULL`, `blockGuid TEXT NOT NULL`, `authoredPropertyId TEXT`, `sourceContentHash TEXT NOT NULL`, `startIndex INTEGER NOT NULL CHECK(startIndex>=0)`, `endIndex INTEGER NOT NULL CHECK(endIndex>=startIndex)`, `coordinate TEXT NOT NULL CHECK(coordinate IN ('cell','utf16'))`, `evidenceKind TEXT NOT NULL`, `excerpt TEXT` | claimGuid → Claim.guid ON DELETE CASCADE. Document/Block/standoff locators deliberately have no FK to derived tables: index invalidation must not destroy canonical evidence | `(claimGuid,guid)`, `(resourceGuid,blockGuid,authoredPropertyId)`, `(resourceGuid,sourceContentHash)` |
| DataSet | `guid TEXT NOT NULL UNIQUE`, `name TEXT` | Name nullable to preserve unknown authored names; no duplicate Entity for identity | `(name,guid)` |
| DataPoint | `guid TEXT NOT NULL UNIQUE`, `datasetGuid TEXT`, `name TEXT`, `valueJson TEXT NOT NULL CHECK(json_valid(valueJson))`, `valueType TEXT NOT NULL`, `normalizedNumber REAL`, `normalizationProfile TEXT` | datasetGuid → DataSet.guid NO ACTION, nullable; normalizationProfile required when normalizedNumber present. Raw encoded Value always retained. No Entity FK | `(datasetGuid,guid)` and optionally `(datasetGuid,normalizationProfile,normalizedNumber)` for explicit numeric analytical views |
| DataPointDimension | `guid TEXT NOT NULL UNIQUE`, `dataPointGuid TEXT NOT NULL`, `role TEXT NOT NULL CHECK(length(trim(role))>0)`, `entityGuid TEXT NOT NULL`, `ordinal INTEGER NOT NULL CHECK(ordinal>=0)` | dataPointGuid → DataPoint.guid ON DELETE CASCADE; entityGuid → Entity.guid NO ACTION; unique(dataPointGuid,ordinal); permit multiple targets/repeated semantic roles | `(dataPointGuid,role,ordinal)`, `(role,entityGuid,dataPointGuid)` |

**Identity and ordering.** Retain existing Claim/DataPoint/DataSet GUIDs. Time uses exactly its Entity GUID. Allocate stable new GUIDs only for incidence/qualification/evidence records lacking source identities, with a persisted source-key/identity map and collision checking. The snapshot's public node GUIDs satisfy current UUIDv4 validation. SQL uniqueness is per table: service/import preflight must reject accidental reuse across unrelated canonical kinds; the Entity+Time pair is the intentional one-to-one extension. Preserve the original global export ordinal in provenance; per-parent ordinal is a deterministic presentation/query order derived from source order, not an assertion that Codex authored a participant sequence. No automatic deduplication of equal participant/dimension tuples.

**Claim evidence is additive.** Claim/Participant/Qualifier, Time and observations are required semantic capabilities for their respective import subsets. ClaimEvidence is the recommended minimal source-span capability; full versioned evidence tracking, extraction agents and AI inference engines are not prerequisites. If evidence publication is deferred, keep exact evidence locators and original annotations in immutable provenance with an explicit UNRESOLVED evidence-link disposition. Never report that as an active canonical evidence query.

### 12.3 Claim, qualifications and exact source evidence

Claim is an n-ary assertion whose GUID identifies the proposition. Its expression preserves the original Name exactly, including null, whitespace and historical wording. Map Role to a reviewed kind: Trait → Trait, Event → Event, `claim-role-event` → Event, `claim-role-intention` → Intention, `claim-role-opinion` → Opinion, null → null. Preserve every original Role string in attributes/provenance, and document these normalizations. Future kinds remain extensible; a null source is not guessed to be Event or Trait.

`acted_in_claim` becomes ClaimParticipant. Preserve exact Subject/Object/At/To/From/With/By/Of/About/AccordingTo roles, including the literal source role `None`; a literal string is not SQL NULL. Participants target Entity.guid. A participant's AccordingTo attribution is part of the assertion, distinct from createdByActorGuid recording who performed a Mutable write. Do not turn the source's Subject or AccordingTo into import Actors.

A representative **actual source Trait** is Claim `8b9429e0-639a-44af-8ea5-80ac47058529`, expression `goldsmith`, Subject Entity `201f7063-5642-42a1-98bb-8d0d4bb4993d` (Bernardo della Zecca), and AccordingTo Entity `5d9cbd12-a35b-4b1c-9130-36c6786145b2` (Luca Landucci). It means that this characterization was attributed to that source; it does not become an objective Property of Bernardo. Likewise an authored characterization such as “untrustworthy” keeps its historical wording, source and context; an additional Concept classification cannot replace them.

Use **ClaimQualifier** for Claim→Entity links that qualify the assertion rather than the exported Agent participation: `type_of_claim` → role `type-of`, target Concept; `claim_at_time` → role `at-time`, target Entity(Time). This avoids illegal Claim GUIDs in Relationship.sourceEntityGuid. Future semantic source/context links may use reviewed qualifier roles if their target is an Entity. A Document source is a resource/evidence locator, not automatically a fabricated Entity. Preserve distinctions between a participant with Role At and an independently exported temporal qualification; do not deduplicate them by similar wording.

The 1,267 `codex/trait-reference` values join to Claims, not Property nodes. Preserve all original Claim/trait annotations in `.ink`; the derived standoff table already retains their full JSON/value. Current mention extraction/resolution recognizes Entity/Block reference families, not a general specialized target registry. Add Claim-aware resolution/service queries without assigning Claim GUIDs to Entity foreign keys or changing the ordinary Entity Reference contract.

For known Claim-linked source annotations, evidence can retain resource GUID, Block GUID, authored property ID (nullable), exact half-open coordinate range, saved-generation content hash and optional exact excerpt. Evidence kind `legacy-annotation` describes the attachment; do not assert that the excerpt is a quotation of Claim.expression or proves the proposition true. Keep original inclusive range and complete annotation JSON in authored attributes/provenance. Derive range coordinates through the qualified saved projection rather than JS UTF-16 substring assumptions; retain unresolved spans without clamping. Derived SQL standoff GUIDs can change with scope/profile and are not the canonical locator.

Future AI extraction publishes into the same audited Entity/Claim/observation services with source-generation evidence. It must not make a separate AI graph, overwrite historical expressions or convert inferred claims to endorsed facts. Evidence lookup validates generation/hash and returns stale/unavailable diagnostics after edits or missing files; it cannot silently reanchor old evidence. No FK to Resource/Block/StandoffProperty and no claim that an old hash itself stores the source generation: retained source bundles/files must provide that generation.

### 12.4 Time identity, precision and query policy

Time remains Entity(Time), so graph endpoints, Claim qualifiers and DataPoint dimensions all share Entity.guid. Its extension supplies queryable components and eventually normalized ranges. Keep both the exact expression on Time and the Entity display name at import; later editing may change a display label independently, so temporal expression updates and display rename have explicit separate semantics and revision checks.

Map legacy Year/Month/Day/Minute/Second to corresponding start components where their actual integer values are trustworthy. End components stay null because no end fields are exported. The first Time is `7edb01df-d780-4b37-ab41-2f37d9aa31af`, DisplayName `1452/April/15 03:00:--`, Year 1452, Month 4, Day 15, Minute 0, other fields null. **Hour was not exported**: startHour stays null even though DisplayName contains `03`. Preserve this discrepancy. Do not invent UTC instants, calendar conventions, source timestamps or zero-valued missing components.

Season, Around and Section are numeric source codes, with meanings not established by this revision. Keep exact codes, zeros and nulls in attributes plus complete original Time JSON; do not translate them to `spring`, `circa`, `early` or certainty labels without authoritative definitions. precision, approximation, certainty, extentKind and qualifier may remain null/unresolved. Structured source storage is useful before every temporal expression is normalized; a missing normalized range must not block importing its Time identity and raw components.

| Temporal distinction | Example | Representation / query obligation |
|---|---|---|
| Precision | certain `1475`, `March 1475`, `6 March 1475` | year/month/day precision when justified; omitted finer fields are unknown, not zeros |
| Approximation | `c. 1475` | separate approximation/qualifier; no implicit ±5-year policy |
| Epistemic certainty | `probably 1475` | separate certainty; not the same thing as coarse precision or approximation |
| Extent | `1475–1480` | start/end components plus extentKind; bounds/inclusivity documented under a normalization profile |
| Season/part | `spring 1492`, `early 1475`, `late 15th century` | preserve expression and supported descriptor; regional/calendar interpretation explicit |
| Relative time | `three days later`, `shortly before his death`, `during the siege` | reference/relation semantics and unresolved anchor; do not manufacture absolute dates |
| Temporal relations | before/after/during/overlaps | ordinary Entity→Entity Relationship where both sides are Entities; Claim temporal qualification where the subject is a Claim. No Claim GUID inserted into an Entity endpoint |

Recommend nullable indexed `lowerBoundDay` and `upperBoundDayExclusive` with a required **versioned normalizationProfile** defining calendar, ordinal epoch, expression policy and boundary semantics. This is a day-level candidate-search representation; exact subday and relative-time comparisons additionally inspect the structured components/relations. Leave bounds null whenever the profile or interpretation is unsupported. The fields are query machinery, not source historical facts. Do not store a numeric epistemic probability unless a source supplies one. A future subday/interval index can be added when actual query requirements justify it rather than implying the proposed day bounds already support exact time-of-day overlap.

### 12.5 DataSet, DataPoint and semantic dimensions

Use specialized observation structures for analytical queries and future Table/Chart Blocks, aggregation, filtering and time-series views. Claim is proposition-oriented n-ary assertion machinery; DataPoint is value-oriented n-dimensional observation machinery. Their shared use of Entity participants/dimensions does not make them the same table.

Actual supplied DataSets include Hangings in Florence, Wine Duties (Landucci), Florentine taxation on the clergy and Plague deaths. DataPoint `5a0b0323-87a5-41ff-abf9-790b566284b7` has Name `The Count of Urbino has a Siennese soldier hung.\t`, Value **string** `"1"`, DataSet `18051e50-0131-40a1-b107-490712ddb544` (Hangings in Florence), and measured-in Concept `312adf1e-37dd-4778-bf0b-71a63cee3d14` (Person). Name's actual trailing tab must remain; its display here uses escaped notation. Other actual values include `Rain`, `Rain cleared`, `Frozen`, `Not very severe` and `Overflowed its banks`. A unit-like dimension can be a semantic Concept such as Person, not merely a physical measurement unit.

`valueJson` uses the existing authored-value encoding of the exact source Value; `valueType` describes the decoded authored type, e.g. string, number, boolean, null, array or object. Imported `"1"`/`"123"` stay strings, not numbers. Preserve absent versus null in the complete original record. No string-number inference, case folding, trimming or taxonomy conversion is part of import. `normalizedNumber`/normalizationProfile are optional analytical projections only: populate under a separately specified and tested rule, retain the raw value, and reject lossy integer/decimal interpretations. REAL is not an exact decimal-money representation; exact monetary arithmetic needs an independently specified decimal representation. Default aggregation excludes strings/unresolved normalization and reports its coverage rather than treating them as zero.

Map exported dimensions to reviewed roles: `datapoint_at_time` → `time`; `datapoint_at_place` → `place`; `datapoint_measured_in` → `unit`; `datapoint_refers_to_agent` → `referent` if a supplied valid row exists. Preserve original predicates/endpoint category and source payload in provenance. All dimension targets are Entity GUIDs; validate that a time role targets an Entity(Time) with its extension. Do not force Place into a separate endpoint table or infer a Place type solely from this predicate. Role validation can be extensible without imposing a fixed SQL unit ontology.

The relevant membership check found that each supplied DataPoint has exactly one DataSet and none has multiple memberships. Thus the proposed nullable DataPoint.datasetGuid faithfully fits this snapshot; a point may still be a standalone observation. Preserve the complete `part_of_dataset` row in DataPoint attributes/provenance so its connection is auditable. If later source/input requires multiple memberships, use a reviewed DataSetMembership structure rather than silently choose one or duplicate the DataPoint. This cardinality decision is based on source relationships, not on a requirement to replicate the legacy edge table. A DataSet with no points still retains its identity/name.

### 12.6 Selective MetaRelation simplification and unsettled Property


A further read-only inspection of all 26 graph exports and the 2,390 classified current-document JSON files establishes the following. These reference counts do not inspect opaque `.memory` archive payloads or external/live destination references; those can disqualify a collapse candidate during its later full reference proof:

- All **835** MetaRelations have exactly two incidence records and exactly one dominant participant. **One** pairs an Agent with itself; preserve roles and permit a self-loop when its meaning is qualified.
- **825** have exactly one MetaRelationType; **10** have none. **10** have one Time attachment each; none of those ten is missing its type.
- Documents refer to **257** MetaRelation GUIDs in **372** properties: 371 `codex/meta-relation-reference` and one `metaRelation`. These are actual target joins, including non-Entity-Reference annotation types; the ordinary Agent-targeting Entity Reference contract remains unchanged.
- No exact MetaRelationType GUID is referenced anywhere as a string in the classified document JSON. **131** of 145 definitions are used by type-assignment edges; 14 are unused dictionary entries.
- **55** definitions have no nonblank DominantCode, **59** lack SubordinateCode, and two different definitions share `uncle-of`. Missing codes do not imply corrupt assertions, but automated predicate/inverse normalization is not proved.

| Actual MetaRelation population | Count | Architectural disposition proposed for review |
|---|---:|---|
| No document reference, one type, no Time attachment | 566 | Simplest IMPORT simplification candidates; test type/direction equivalence and full provenance reconstruction |
| Same, with unique nonblank DominantCode | 446 of 566 | Strongest initial candidates; code is source evidence, not automatic authority to merge types or normalize strings |
| Same, with missing/duplicate dominant code | 120 of 566 | PRESERVE until an explicit predicate mapping is reviewed |
| No document reference, one type, one Time | 4 | PRESERVE initially; attributes could retain Time GUID, but current generic graph does not traverse Relationship→Time |
| No document reference, no type/no Time | 8 | PRESERVE as untyped RelationAssertion; do not invent a predicate |
| Document reference, one type, no Time | 249 | PRESERVE initially; canonical reference target must survive, beyond copying a GUID into provenance |
| Document reference, one type, one Time | 6 | PRESERVE initially; both reference and attached Time semantics need preservation |
| Document reference, no type/no Time | 2 | PRESERVE with exact identity, untyped descriptor and document links |

The 446 are candidates, not an assertion that 446 collapses have already been proved or performed. A record can enter IMPORT through simplification only after every attached edge/reference (including any in-scope history/external references), inverse/direction semantics and destination collision is accounted for; otherwise retain PRESERVE. The remaining **389** stay PRESERVE under this initial conservative predicate gate. Retaining all 835 as mandatory first-class MetaRelation Entities is no longer the recommendation.

**Can move onto Relationship:** MetaRelation.Guid becomes Relationship.guid, Agent participants become its endpoints, a reviewed directional predicate becomes typename, dominant/subordinate labels/flags and legacy type GUID become attributes, and node/edge source records become provenance. Endpoint display snapshots stay descriptive, never ID lookup keys. Existing Relationship attributes can preserve all source JSON without a SQL change. There were no separate original GUIDs for the incidence/type edges.

**Would be lost without further handling:** document navigation/reference to a relation, traversable Time attachment, querying a first-class type object by GUID, any independent connections to the reified assertion, inverse-role semantics, and distinctions between two definitions sharing a code. Keeping a raw record in a manifest proves data retention but does not replace an active semantic connection. Do not claim losslessness by storing names alone or by making two Relationships with new GUIDs to replace one identified assertion.

**Illustrative lossless simplification candidate, using real data:** MetaRelation `c05c5541-0691-4cc2-b5a4-6bd5a0c699d5` connects dominant Anna Liszt `57d7d95a-df6d-46aa-957d-6f43ed76db61` to subordinate Franz Liszt `aba1d057-d3b6-488d-9751-474513c1347d`. Type `fefa7856-2ca4-48f9-81fe-eace11d390bd` has Name `parent / child`, DominantCode `parent of`, and SubordinateCode `child`. It has no document reference or Time edge in this snapshot. The proposed record below is a plan, not a database write:

```json
{
  "guid": "c05c5541-0691-4cc2-b5a4-6bd5a0c699d5",
  "sourceEntityGuid": "57d7d95a-df6d-46aa-957d-6f43ed76db61",
  "targetEntityGuid": "aba1d057-d3b6-488d-9751-474513c1347d",
  "typename": "parent-of",
  "attributes": {
    "roles": {"source": "parent", "target": "child"},
    "relationshipType": {
      "definitionGuid": "fefa7856-2ca4-48f9-81fe-eace11d390bd",
      "name": "parent / child",
      "dominantCode": "parent of",
      "dominantName": "parent",
      "subordinateCode": "child",
      "subordinateName": "child",
      "isDeleted": false
    },
    "provenance": {
      "rule": "qualified-reified-assertion-to-relationship-v1",
      "legacyKind": "MetaRelation",
      "legacyGuid": "c05c5541-0691-4cc2-b5a4-6bd5a0c699d5",
      "sourceRecords": [
        {"path": "graph/nodes/meta-relations.json", "guid": "c05c5541-0691-4cc2-b5a4-6bd5a0c699d5"},
        {"path": "graph/edges/agent_is_related_metarelation.json", "ordinal": 0},
        {"path": "graph/edges/agent_is_related_metarelation.json", "ordinal": 1},
        {"path": "graph/edges/type_of_metarelation.json", "ordinal": 82}
      ]
    }
  }
}
```

`parent of → parent-of` is an explicit proposed predicate spelling rule, not a source fact or Entity name match. The source records and the **complete original type definition** must also remain in the hashed provenance bundle. The Relation GUID survives unchanged while its storage class changes. Do not also create a MetaRelation Entity with that GUID for this same qualified assertion merely to reproduce the old wrapper.

**Counterexample:** `020fa38e-dfca-4d9e-994e-795478858a40` is the mother-in-law assertion in `data/luca-landucci_diary/1488-06-01-[6ae61c30].json`, Block `fa3f46b1-3a0f-4838-9026-64893bbdcb17`, property `daa045f1-f2ad-45a3-8fbd-234f217cc3c9`, range 149–161. Converting the canonical target into a Relationship while leaving only a source map would not provide a usable reference resolver. Retain its GUID in a temporary `RelationAssertion` Entity, two role-bearing incidence edges and its type descriptor until general relationship-reference support is justified and qualified.

**Relationship-about-relationship future:** a general typed target `{kind: "relationship", guid}` and generic assertion/reference/query service could benefit Mutable independently for evidence, dates, confidence and authorship attached to relationships. Existing Relationship endpoints are FK-constrained to **Entity.guid**; replacing those strings with Relationship GUIDs would violate the current model. Structured attributes can retain `timeEntityGuids` or relationship descriptors now, but they have no FK/graph-traversal authority. No polymorphic endpoint schema or link table is required by this import proposal; evaluate one later only if independent Mutable requirements justify it. Until then, PRESERVE is preferable to a Codex-specific workaround.

**MetaRelationType decisions:** a definition used only to describe a predicate can become a reviewed scalar type plus complete descriptor/provenance with its original GUID. Unused definitions can be preserved in the provenance dictionary without creating selectable canonical Entities. This intentionally removes a first-class type-object lookup; do not represent that as unchanged query behavior. Where definition identity is independently meaningful, cannot be safely reduced to a descriptor, or is a target of other relationships in another source, retain a generic typed definition Entity temporarily. The snapshot has no such independent references, but its missing/duplicate codes mean there is no blanket type-deduplication rule. Retained RelationAssertion Entities can hold descriptor attributes without recreating a MetaRelationType table or required Entity for every dictionary entry.


**Property:** keep identity as an Entity for now. The supplied property `1ba6f3bc-dd86-492a-a89c-ba51034cb512` has `Value: "180"`, and its trusted `type_of_property` edge targets `124dd96a-373d-4954-bf33-22fdfb84ee12`, Name `Height (cms)`. Represent this as a Property Entity plus a PropertyType Entity and a `type-of` Relationship. Preserve `"180"` as its original string; a numeric interpretation/unit normalization can be a future typed capability, not an import assumption. There is no trusted Agent owner or Time from the two corrupt exports. Do not attach this property to a guessed person or regard `Height (cms)` as a Time.

The 1,963 Properties have **1,955 single type assignments and eight with none**; all 21 PropertyTypes are used. No Property/PropertyType GUID is a direct target anywhere in the classified document JSON. That supports exploring future simplification, but does not prove that the identified assertion or reusable definition should vanish. Collapsing Property into owner attributes would need trusted ownership, time/version/parallel-assertion semantics and identity/reference analysis. Its current absence is not evidence that properties are ownerless by design; the export is incomplete/corrupt in that area.

**PropertyType:** current proposal is PRESERVE as a general semantic definition Entity. Copying its name into Property.typename alone would erase the distinction between the semantic class `Property` and a measurement definition, and would lose GUID, units in names, Code, reusable definition identity and possibly future statements about that definition. A later IMPORT simplification decision may keep Property.typename as `Property` and move its complete type descriptor/GUID to attributes, explicitly recording changed queryability. Do not collapse during this import without proving those semantics and maps. No dedicated type catalogue table is necessary.


The specialized Claim design does not imply that every legacy reified binary relationship becomes a Claim. Retain the existing per-assertion simplification proof. Property remains less settled because reliable owner/time connections are absent; Trait is an attributed Claim kind and is not a repair strategy for corrupted Property exports.

### 12.7 Mapping every exported connection family

| Source family | Disposition / destination | Semantic fidelity and constraints |
|---|---|---|
| acted_in_claim | IMPORT ClaimParticipant | Exact Agent GUID as entityGuid, Claim GUID, raw Role, deterministic ordinal; no Claim Entity shadow |
| agent_has_property | QUARANTINE supplied rows | Intended Agent→Property meaning known; accidental Concept endpoints do not become facts |
| agent_is_related_metarelation | IMPORT as direct endpoints for proved collapse; otherwise PRESERVE incidence Relationships | Reuse assertion GUID, dominant/subordinate semantics and complete source evidence |
| claim_at_time | IMPORT ClaimQualifier, role `at-time` | Claim→Entity(Time); exact temporal identity without Entity-only Relationship misuse |
| datapoint_at_place | IMPORT DataPointDimension, role `place` | Exact Agent-as-Entity target/type and source payload |
| datapoint_at_time | IMPORT DataPointDimension, role `time` | Exact Entity(Time) target and temporal components through extension |
| datapoint_measured_in | IMPORT DataPointDimension, role `unit` | Exact Concept target, which may denote a unit or a semantic counting class |
| datapoint_refers_to_agent | Empty source retained; future valid rows map dimension role `referent` | No invented records to complete an expected graph |
| metarelation_at_time | PRESERVE RelationAssertion Entity→Time Relationship, `at-time` | Attributes alone do not replace traversable attachment; future addressable relationships independent of import |
| part_of_dataset | IMPORT DataPoint.datasetGuid | One membership per supplied point; exact membership row in provenance |
| property_at_time | QUARANTINE supplied rows | Intended Property→Time meaning known; PropertyType targets are corrupt evidence |
| subset_of_concept | IMPORT Relationship, `subset-of` | Concept Entity endpoints; preserve raw misspelling IsPimary and value |
| type_of_agent | IMPORT Relationship, `type-of` | Entity→Concept asserted classification, distinct from Entity.typename |
| type_of_claim | IMPORT ClaimQualifier, role `type-of` | Claim→Concept classification, independent of Claim kind/expression |
| type_of_metarelation | IMPORT descriptor for qualified collapse; PRESERVE descriptor/needed definition lookup otherwise | Type GUID/codes/inverse labels/source assignment and acknowledged changed queryability |
| type_of_property | PRESERVE trusted Property→PropertyType Relationship, `type-of` | Exact reusable definition; no fabricated owner/time |

The existing verified corrupt-row totals remain relevant coverage diagnostics, not a requirement to recount all data. Destination adjacency spans Relationships, Claim participants/qualifiers and observation dimensions/membership. Tests must compare the correct semantic adjacency, not require all connections to exist in Relationship.

### 12.8 Corruption, provenance and reconstruction


The meanings are no longer unresolved:

```text
agent_has_property: Agent → Property
subset_of_concept: Concept → Concept
property_at_time: Property → Time
type_of_property: Property → PropertyType
```

Their intended semantics are independent. The earlier verified repeated endpoint sets remain evidence of **probable legacy export/data corruption**: all 910 supplied Agent/Property pairs join to Concepts and copy the subset export; all 1,955 alleged Time targets join to PropertyTypes and copy the property-type export. **QUARANTINE is the disposition**, not canonical reinterpretation. Original files/rows and diagnostic expected/observed categories must remain auditable. Quarantine allows a useful partial graph/document import after explicit coverage policy approval; it is not a completed reconstruction of the missing owner/time relationships. Regenerate corrected exports if those relationships are required. Do not deduplicate them into the valid predicates, use name heuristics, or create guessed endpoints.

Every IMPORT/PRESERVE/UNRESOLVED/QUARANTINE manifest item must contain: source snapshot fingerprint; source path and content hash; row ordinal and original JSON or immutable hashed bundle reference; source kind/GUID; disposition/rule/version; destination storage kind/GUID; original endpoint/type/direction/role facts; deliberately collapsed fields and approved semantic spelling changes; related source records; document/property references where relevant; and unresolved/quarantine diagnoses. Preserve orphan dictionary definitions and original nulls. Destination attributes retain the semantically useful descriptor/GUID/provenance pointer; the provenance bundle retains the complete historical structure for audit/reconstruction.

For a simplification admitted as IMPORT, verify in memory that destination semantic fields plus the immutable provenance bundle reconstruct the original MetaRelation record, two incidence rows, type assignment/definition, and any qualified attachments exactly as parsed JSON. Verify reusing the old assertion GUID and unchanged Agent GUIDs; no GUID/name matching. Record when canonical lookup/queryability intentionally changes. A source GUID mapped to Relationship must have `destinationKind: "Relationship"`, not a misleading Entity map entry.

Provenance is sufficient for obsolete physical wrappers and unreferenced type dictionary structure. It is insufficient by itself for an actively referenced assertion, a required temporal connection, or a reusable definition whose identity is meant to remain canonical. Do not add canonical “legacy provenance Entities” solely to keep the old graph visible. Import timestamps describe migration activity, not source authorship; `.memory` history is neither imported automatically nor replaced by audit entries.


Provenance maps must now distinguish Entity/Time, Claim, ClaimParticipant, ClaimQualifier, ClaimEvidence, DataSet, DataPoint, DataPointDimension and Relationship destinations. Store full original Name/Role/Value/component codes even when normalized columns additionally exist. UNRESOLVED normalization is not QUARANTINE of the entire trustworthy source object. For each canonical mutation, audit the destination record kind/GUID and before/after semantic payload; the migration manifest also explains the source relationship rows consolidated into it.

### 12.9 Schema, services, audit and existing behavior

**Verified current foundation.** [schema.mjs](src/knowledge-sqlite/schema.mjs) currently registers only version 1, validates migration checksums, application/vault IDs and exact schema structure, and rejects unrecognized modifications. [Relationship](src/knowledge-sqlite/migrations/mutable/0001-foundation.sql) endpoints reference Entity.guid. [canonicalEntities](src/knowledge-sqlite/entities.mjs) writes only name/nameKey/timestamps on Entity creation, no typed metadata or relationship attributes; its public reads are also limited. [EntityService](src/feature-api/entities.ts), [client.mjs](src/knowledge-sqlite/client.mjs), [worker-entry.mjs](src/knowledge-sqlite/worker-entry.mjs) and the [host](server/sqlite-knowledge-host.ts) do not expose specialized structures. Existing knowledge relationship reads already include attributes, but do not provide the required new mutations.

**Migration recommendation.** Add a reviewed version-2 mutable migration and register the additional ordered step in schema.mjs; leave the validated 0001 baseline unchanged. Apply through the current migration runner with its transaction, checksums and expected-shape validation; do not create ad hoc tables on a live vault or bypass worker/host ownership. Validate both a fresh database and a version-1 upgrade, with original Entities/Relationships/derived content retained and reopen/schema verification. Decide service/type constraints and delete policy before freezing DDL. The proposed table names and typed columns are general Mutable capabilities, not a copy of Codex's ten node tables/sixteen edge tables.

The existing [audit schema](src/knowledge-sqlite/migrations/audit/0001-foundation.sql) accepts generic recordType/recordGuid and JSON before/after payloads. It can record every proposed canonical kind without Claim-specific audit tables or an automatic audit schema bump. Add versioned audit payload/receipt handling in services as needed; only an independently required persistent schema change warrants its own audit migration. Do not claim audit delivery exists merely because the tables can store it.

| Proposed service / operations | Concrete contract and validation | Queries / independent benefit |
|---|---|---|
| Enriched Entity/Relationship service | Add optional typename/description/authored attributes, imported alias origin and complete read shapes; revision-checked updates; nameKey derived by existing policy. Relationship endpoints remain Entity GUIDs | Existing semantic things, reusable definitions and ordinary graph connections; backwards-compatible old create/rename calls |
| TimeService `get/create/update/query` | Create Entity+Time atomically when new; extension for existing Time with expected Entity revision; updates distinguish Entity revision from Time revision. Expression, raw components, typed distinctions and optional profile/bounds validated together | Filter/order by precision/components/profile-qualified range; diagnostic unsupported relative/subday cases |
| ClaimService `get/create/update/query` | Create aggregate with expression/kind, participants and qualifiers in one bounded mutable transaction; exact role strings and stable GUIDs; Entity endpoint and time/type qualification validation | Role-aware query, e.g. Trait with Subject X and AccordingTo Y, classification and temporal qualification; return attribution/evidence coverage |
| ClaimParticipant/Qualifier operations | Add/update/remove by public incidence GUID with expected child revision and expected parent revision; transaction increments Claim revision, preserves ordinal/source evidence and audits changed records | Retrieve ordered participants/qualifiers; inverse Entity→Claims traversal, no flattening into independent binary assertions |
| ClaimEvidence `attach/list/resolve` | Optional additive capability; verify source generation and exact Block/span when available. Keep locator/hash/original range; explicitly return stale/missing/unresolved and avoid destructive reanchoring | Exact document evidence now, future extraction through same canonical API; no dependency on complete AI/evidence engine |
| DataSetService `get/create/update/query` | Nullable exact name and authored attributes; UUID identity/revision; do not silently delete populated datasets | List datasets and their observations, future Table/Chart bindings |
| DataPointService `get/create/update/query` | Aggregate raw encoded value/type, nullable dataset/name and dimensions; validate dataset/Entity targets, enforce value normalization profile separately, revision-check edits | Filter by dataset and intersect time/place/unit/referent dimensions; aggregate only explicitly typed/normalized values and report exclusions |
| DataPointDimension operations | Stable child GUID/revision and expected DataPoint revision; edits reorder deterministically and increment parent revision; repeated roles/targets allowed | Ordered n-dimensional observation queries; avoid join fan-out counting a point multiple times |
| Bounded canonical batch capability | Typed validated operations only, never raw SQL; record/event/byte limits, deterministic operation IDs, exact full semantic payload conflict checks, cancellation before commit and unknown-outcome recovery | Atomic dependent writes, imports and general bulk editing without hiding unbounded event payloads |
| Durable audit delivery / operation outcome | Write before/after events plus pending receipt in same mutable transaction; copy to audit.db durably/idempotently before acknowledgement. Retain request fingerprint/result for retries after pending receipt is removed, e.g. in durable AuditMutation metadata; query durable outcome or report unavailable | Existing bounded outbox becomes operational for long-lived authoring/imports; restart/double-delivery/outcome correctness |
| Vault-scoped maintenance context | Explicit selected vault identity, host-owned lease/capability, read-only/flag checks and worker dispatch; retain verified source context for existing Document UI operations | Import/knowledge authoring without fake invoking Documents or globally unscoped writes |

Suggested Claim request shape is an aggregate typed DTO, for example `create({operationId, guid, expression, kind, attributes, participants:[{guid,entityGuid,role,ordinal,attributes}], qualifiers:[{guid,entityGuid,role,ordinal,attributes}]})`. DataPoint creation similarly accepts `{operationId,guid,datasetGuid,name,value,valueType,attributes,dimensions:[...]}`; encode value at the existing authored-value boundary and verify valueType against it. Each returns public GUIDs, revisions and diagnostics, not raw SQL rows/internal INTEGER IDs. A point whose dataset is unknown remains nullable with an explicit unresolved source connection rather than referencing a nonexistent DataSet.

Aggregate updates require parent and affected child expected revisions and produce record-specific audit events with a single mutation receipt. Direct child operations participate in the same rule; a client must not modify an incidence behind the parent's revision. Name-only Entity create retry behavior is insufficient for these richer payloads. Idempotency compares all supplied semantic fields, null/omission, kind, endpoints, roles, dimensions and attributes. Never overwrite an existing user-owned object just because its GUID or name appears in an export; explicit equivalence/conflict outcomes are necessary.

Current limits of 32 KiB per Entity request and 10,000 pending receipts/16 MiB outbox remain safety boundaries until a separately bounded typed protocol is qualified. Batches cannot evade event/byte limits. The worker/client/host mutation dispatch, cancellation, read-only checks, invalidation/reconciliation wakeups and query revision evidence must be extended together. Moving audit events to a second database is not an atomic transaction with file publication; use durable outbox recovery. Audit unavailability means backpressure/explicit unresolved outcome, not dropping events or deleting receipts to make room.

Existing clearDerived deletes derived Resource content and observed/recovered aliases; it must continue to preserve canonical Time/Claim/evidence/DataSet/DataPoint records and imported aliases. Their backup/restore/reopen/foreign-key verification use the same canonical vault lifecycle. Entity deletion must report new participant/qualifier/dimension blockers rather than cascade away claims/observations; removal/reassignment is an explicit audited operation. Specialized reference annotations need target-kind-aware stale/deletion diagnostics; the existing Entity saved-reference trigger alone does not provide Claim/DataPoint deletion protection. Until coverage-aware deletion is qualified, do not expose destructive specialized deletes.

Keep canonical Entity Reference lookup/search behavior for Person/Place/Concept/Time. Claim/DataPoint/DataSet require separate typed retrieval; no generic Entity shadow records to keep old UI routes apparently working. This revision does not implement new UI behavior or claim that all 75 legacy annotation renderers work. Equivalent `.ink` support uses the existing native codec, discovery, managed-pair save/recovery and saved projection; preserve existing `.mutable.json` compatibility and current feature defaults. Major importer/semantic capabilities follow AGENTS.md with appropriate feature flags enabled by default unless the user specifies otherwise. Documentation alone creates no flag, migration or service.

### 12.10 Readiness and ordered implementation boundaries

| Area | Assessment / condition |
|---|---|
| Architecture and construct mapping | READY FOR REVIEW: specialized assertion/temporal/observation structures are justified by Mutable semantics and computation; no legacy schema replica |
| Concrete schema/API recommendation | Supplied in sections 12.2–12.9; migration SQL and implementation still require definition/qualification of constraints, temporal normalization and aggregate/audit recovery |
| Documents → `.ink` | Native serialization preservation verified; equivalent suffix support, stable packaging and selected-vault collision handling remain required before publication |
| Missing Type StandoffProperty graph nodes | Reconstruction design resolved: reconcile from final `.ink` annotation JSON using existing projector; exceptional ranges remain per-file gates |
| Claim vs generic Entity / Trait vs Property | Resolved: first-class n-ary Claim; kind Trait preserves attribution and exact expression; no false objective-property conversion |
| Time fields and query range | Identity/raw components can be imported without completed normalization; unknown codes/DisplayName discrepancies stay explicit; range queries require a reviewed profile |
| Observation values/membership | Exact string/categorical values and dimensions mapped; nullable singular datasetGuid fits supplied memberships; normalized numeric aggregation is optional |
| Canonical writes / versioned migration / audit delivery | REQUIRED before importing the dependent canonical subset; no supported specialized write path exists yet |
| Property owner/time and other corrupt evidence | QUARANTINE, preserving source and explicit coverage gaps; corrected exports needed only for those missing semantics |
| MetaRelation / definitions | Selectively simplify only after the existing proof; preserve referenced/temporal/ambiguous cases rather than block independent claims/observations/documents |
| Labels, unknown kind, tombstones | Nullable Claim expression/kind and observation names avoid fabricated labels; valid retained Entity labels/tombstone behavior remain separate qualifications; no new census required |
| Exceptional identities/containers/ranges/placeholders/history | PRESERVE/UNRESOLVED per affected item and dependencies. No silent drop and no automatic whole-collection gate |
| Persisted qualification | Pending later implementation: disposable fresh/upgrade vault, native file round-trip/recovery, canonical FK/semantic adjacency, audit delivery/retry, clearDerived/rebuild and backup/reopen checks |

Implementation order should serve the user's document priority: qualify equivalent `.ink` paths, stable placements and independently safe document identity groups; provide enriched Entity/Relationship and bounded audit publication needed by references; add versioned Time/Claim/observation capabilities for their safe graph subsets; publish each reviewed source subset with explicit dispositions; reconcile derived standoff records from final saved bytes. Evidence links can be added without waiting for a full extraction engine. A partial run states exactly which records are imported, temporarily preserved, unresolved or quarantined, and why; “complete” never means the exceptional material vanished.

No live destination vault was selected or written during this architectural task. The report distinguishes a reviewed design direction from deployed schema/API functionality and from imported documents. Approval of a subsequent implementation is separate from completion of this requested plan revision; this task ends with a concrete reviewable recommendation rather than an attempted live schema change.

## 13. Final recommendation

**Architecture/schema/API proposal: READY FOR REVIEW WITH SPECIFIED CAVEATS.** Use common Entity identity for named things, a structured Time extension, first-class n-ary Claim with participants/qualifications and source evidence, and analytical DataSet/DataPoint/dimension storage. Keep ordinary Relationships and selectively simplify proved MetaRelation wrappers. Preserve uncertain Property semantics and quarantine corrupted exports.

**Importer: NOT YET IMPLEMENTED; REQUIRED WORK REMAINS.** The next phase must qualify versioned migrations, typed audited services/outcome recovery and native `.ink` lifecycle support. It should import independently safe material without waiting for every exceptional source item, with explicit IMPORT/PRESERVE/UNRESOLVED/QUARANTINE coverage. Verified document identities, annotation reconstruction, provenance and source integrity remain governing requirements. This revision changed only the plan; no importer, schema/API changes, SQLite writes or `.ink` files were created.
