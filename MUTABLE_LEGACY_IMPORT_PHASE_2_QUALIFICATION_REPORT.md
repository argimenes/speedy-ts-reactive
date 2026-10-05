# Mutable Legacy Import — Phase 2 Qualification

Qualification date: 4 October 2026. The implementation, real disposable publication and full saved indexing have completed. All 11 final semantic/fidelity/integrity checks and a complete repeat import in an isolated restored copy passed, including exact reconciliation of all 793 evidence attachments. No live Mutable vault has been populated.

## 1. Implementation

The reusable importer is `server/legacy-codex-import.ts`, with read-only source characterization in `server/legacy-import-source.ts` and explicit semantic mappings in `server/legacy-import-mapping.ts`. Run `npm run import:codex -- --source /path/to/codex-data`. `legacyCodexImport` is enabled by default. The importer uses the Phase 1 semantic application facade over the ordinary HTTP/SQLite worker contracts and the managed native publication routes. It contains no raw-SQL canonical write path.

A destination is automatically created in the system temporary directory. An explicit destination must be empty or be the same snapshot's previously marked disposable vault. Original and destination paths must be disjoint. The importer does not offer a live-vault mode.

## 2. Actual source corpus

Source: `/Users/iianneill/Documents/GitHub/codex-data`. The designated material is `data/`, `graph/nodes/` and `graph/edges/`; other repository folders are outside this phase's input.

Fingerprint: `60354ef4fdf4debe0358d19bbe5663679e4f80578f5bcb735376181fae86413a`.

The snapshot contains 2,983 files, 219,508,371 bytes, 17,979 graph node records and 16,196 edge records. There are 2,390 current document candidates containing 9,767 Block occurrences and 53,023 authored standoff properties. An additional 567 files are retained as excluded history/private material or non-document assets: 562 archive files, three images and two `.DS_Store` files. Historical archive identities are not admitted as competing current documents.

The original legacy editor uses `[...text]` cells and inclusive standoff ends (`src/blocks/standoff-editor-block.ts`, `toCells`/`bind`). The migration retains these authored coordinates; SQL projects them to the existing half-open cell-coordinate contract. The legacy editor's implicit trailing carriage-return cell and zero-point behavior are not fabricated in saved native text.

## 3. Legacy → Mutable mapping

| Legacy construct | Destination and rule |
| --- | --- |
| Named Agent | Entity with original GUID, exact name/type and full source attributes |
| Concept | Entity of type Concept; tombstones gated |
| Time | Atomic Entity plus Time extension with the same GUID; raw exported integer components and expression retained |
| Claim | Independent Claim aggregate; original nullable Name becomes expression, Role becomes kind; reviewed `claim-role-*` spellings map to the approved kinds |
| `acted_in_claim` | Ordered ClaimParticipant with exact role, Entity and raw edge provenance |
| `type_of_claim`, `claim_at_time` | ClaimQualifier with `type-of` or `at-time`; the general structure remains typed Entity-valued qualification |
| Qualified Claim/trait annotation | ClaimEvidence attached only to an exact published, range-qualified Block/span; attachment does not certify truth |
| DataSet | Independent DataSet identity |
| DataPoint | Independent observation identity with exact raw value/name; no ownership or value-based deduplication |
| Observation time/place/unit/referent edges | Ordered Entity-valued DataPointDimension rows |
| `part_of_dataset` | Many-to-many DataSetMembership, one row per unique collection/observation pair; all duplicate source incidence provenance retained |
| Proved simple MetaRelation | Directed Relationship only when the approved cardinality, role, type, reference and time checks all pass |
| Other MetaRelation | Preserved RelationAssertion Entity, descriptors and dominant/subordinate/time relationships; administrative display label is explicitly not authored |
| MetaRelationType | Full source dictionary and assertion descriptors preserved; separate canonical type-object lookup is deferred |
| Property / PropertyType | Preserved Entities with raw records; Property Value supplies the display label with `notAuthoredName` provenance |
| Subset/type edges | Ordinary Relationships preserving complete raw payloads, including the original `IsPimary` spelling |
| Corrupted property owner/time edges | QUARANTINE; no reassignment to their misleading endpoint labels |
| Document / owned Block tree | Native `.ink`, stable Resource/Block identities, exact authored hierarchy, text, properties, metadata and unknown fields |
| Authored standoff / Entity References | Preserved in `.ink`; StandoffProperty rows reconstructed by the normal saved indexer |
| Media references | Authored URLs/descriptors retained; source asset bytes preserved in the snapshot, active asset relocation/rendering deferred |
| `.memory`, workspace extensions, derived Markdown | Preserved source material; excluded from ordinary Document import |

No StandoffProperty node collection is present in the graph export. Reconstructing the document-derived SQL rows therefore exercises the established saved projection/index machinery. It does not reconstruct canonical Claims, Times or observations from Documents.

## 4. Identity and provenance

Valid legacy graph GUIDs and Document/Block identities are retained. Named things are not deduplicated by name, and observations are not deduplicated by value/dimensions. Edge-only records use deterministic SHA-256-derived UUIDv4-shaped identifiers, based on their source location, ordinal and payload. Membership identifiers derive from the collection/observation pair. Derived standoff identifiers remain the native indexer's identities; authored property IDs are retained separately.

Every original input byte is copied into `.mutable/imports/<fingerprint>/source/`. Canonical attributes record source file/hash/ordinal, original record, legacy GUID, import run, snapshot and transformation rule. Requests, observed parent revisions and native captures are frozen before dispatch. Command journals use the established lossless authored-value wire, including negative zero; replay rejects a parent command that differs from the new plan. The identity map includes canonical records, Documents, Blocks and reconstructed standoff rows. Ledger timestamps describe the import; no source authors or dates are invented.

## 5. Document conversion and publication

Recognition uses JSON content and the qualified compatibility codec rather than requiring a particular source extension. `.desktop`, `.canvas` and `.world` stay distinct. Conflicting Resource/Block identities or destination aliases gate all competing files; no arbitrary winner or silent remapping is selected.

Each admitted tree must serialize to native and decode back to the same authored legacy tree using a lossless comparison. A raw authored value that the compatibility codec would normalize gates that document rather than being silently converted. Captured native placements are retained for retries. Projection must preserve every authored range; no clamping, annotation deletion or implicit extra text is used. Each pair is saved through the managed publication route and reopened byte-for-byte before success is recorded.

For `document.ink`, the projection is `document.ink.md`; `document.md` remains an independent source. Derived `.ink.md` files are excluded from discovery/import candidates and rejected as independent Open/Import targets. Paired save, recovery, relocation, first save and source protection support `.ink`. Existing `.mutable.json` behavior remains compatible.

A qualified `Agent:⟨GUID⟩` value adapter is explicit and records the original property if used. It was not needed by any of the 1,712 published documents: their authored trees were retained exactly. The one such source reference occurs in gated material.

## 6. Canonical migration and isolation

The service batches stay within existing request, command, changed-record and audit budgets. Time Entity/extension creation is atomic. Claim participants/qualifiers and observation dimensions are created as complete aggregates; a failed dependency gates the aggregate. Membership/evidence commands freeze observed parent revisions and use stable operation receipts. Complete before/after audit events and operation outcome lookup remain in force.

Diagnostics distinguish imported, imported-with-warning, unsupported, dependency-failed, invalid source, ambiguous mapping, architecture conflict and unexpected implementation failure. Every row has IMPORT/PRESERVE/UNRESOLVED/QUARANTINE handling. Unknown mutation outcomes stop dependent work; known non-committed batch failures are isolated into individual records. An interrupted operation retains its source, requests, captures and diagnostic report.

## 7. Reconciliation after real publication

Disposable vault: `/private/var/folders/q0/2ktlxrj54ygdjxkg2vx_b30r0000gn/T/mutable-codex-phase2-mWU6iK`.

| Construct | Source | Imported/published |
| --- | ---: | ---: |
| Current Documents | 2,390 | 1,712 |
| Blocks | 9,767 occurrences | 5,750 |
| Authored standoff segments | 53,023 | 30,591 |
| Entity Reference segments | 35,880 | 21,131 |
| Agents | 9,057 | 8,991 |
| Concepts | 990 | 988 |
| Properties | 1,963 | 1,951 |
| PropertyTypes | 21 | 21 |
| Times with shared Entity identity | 2,929 | 2,929 |
| Claims | 1,990 | 1,972 |
| ClaimParticipants | 4,098 | 4,077 |
| ClaimQualifiers | 3,651 | 3,632 |
| ClaimEvidence | 793 eligible published annotations | 793 |
| DataSets | 19 | 19 |
| DataPoints | 30 | 30 |
| DataPointDimensions | 73 | 73 |
| DataSetMemberships | 30 source incidences | 30 |
| Preserved RelationAssertion Entities | 835 MetaRelations | 389 |
| Simplified MetaRelation Relationships | 446 eligible candidates | 444; two dependency failures |
| Total canonical Entities | mapped named things | 15,269, including 2,929 Time Entities |
| Total canonical Relationships | mapped relationships | 4,185 |

Entity reuse in the initially empty disposable vault is zero; exact repeat imports use ledger receipts. Imported alias count is zero: source mention labels are not manufactured as curated aliases.

Document exceptions reconcile exactly to 678: 586 with unsupported zero-point behavior, 70 conflicting Resource identities, seven further Block/destination identity conflicts, ten unrepresentable ranges, two missing/duplicate Block-identity cases, two nested-resource cases and one non-document root. These are disjoint final dispositions; several may contain additional underlying problems.

The 18 gated Claims account for 21 excluded participant rows and 19 qualifier rows. The graph contains 910 corrupted `agent_has_property` rows targeting Concepts and 1,955 corrupted `property_at_time` rows targeting PropertyTypes; all 2,865 are quarantined. Other exceptions include 66 unnamed Agents, two deleted Concepts, nine blank Properties and three Property Values over the existing 1,000-character Entity-name service limit. Their raw values are fully preserved without truncation. 145 relation definitions are retained in the source dictionary.

The publication pass recorded 33,853 Document warning occurrences, chiefly Markdown projection limitations/unresolved targets. Warnings are occurrences, not distinct failed documents or dropped native properties. The complete per-family reconciliation is in `artifacts/legacy-codex-phase2/source-reconciliation.json` and the vault's `qualification.json`.

## 8. Real-corpus qualification

The full normal saved indexing pass completed with 1,712 Resources, 5,750 Blocks, 30,591 StandoffProperty rows, 1,540 BlockProperty rows and 4,038 BlockRelation rows. Every Resource is complete, IndexIssue count is zero, SQL integrity is `ok` and foreign-key violations are zero. Discovery is complete and finds no standalone generated Markdown documents.

The normal Entity search and saved Facts APIs returned Florence (`671ee7e7-ae1b-4a5a-9591-b40203d5108f`) and its mention in Block `b9fd31b6-ce9a-4949-a436-e1bcfd2b3378`, Resource `8968eec3-ea58-4d0d-81eb-1cb848c3b0f8`, in `documents/luca-landucci_diary/1478-03-25-[8968eec3].ink`, with complete requested-resource coverage. Saved Facts retain both the Entity target and containing Block/Document identities.

The actual goldsmith Claim (`8b9429e0-639a-44af-8ea5-80ac47058529`) returns Luca Landucci as AccordingTo and Bernardo della Zecca as Subject, in exported source order. Its `type-of` qualifier targets Concept `b61690e1-abfc-4c9f-8540-841a9fb8ba66`; its `at-time` qualifier targets shared Entity/Time `d698e5d7-7df8-4a21-80f2-0fbce696fa0b`. The Time retains the expression `On       1471/May/27 --:--:--`, raw year 1471, unknown hour as null and no normalization profile. The bounded inverse Claim query using the Subject Entity and role returns that Claim.

Actual observation `05889265-3296-4b5f-9f98-b720c3840817`, value `Not very severe`, belongs to Earthquakes collection `8b75bc81-81ce-4514-9c0c-07ef970bdba2`. Members, reverse collections and dimension queries return the observation. A public-service mutation probe in a separate restored copy demonstrated membership in two actual collections, removal of one without destroying the observation or the other membership, and unchanged DataPoint revision. The probe restores original membership and removes the added one; its revision/audit changes remain only in that copy.

The real corpus has no exact pair with equal raw value and identical dimension GUIDs. The importer fixture therefore supplies the equal-observation case: two distinct source GUIDs with the same value/dimensions remain two observations. This is not claimed as a real-corpus example.

Every published native capture and `.ink.md` receipt is verified byte-for-byte. Representative native reopening after restart includes the first footnote document and `documents/edgar-allan-poe/masque-of-the-red-death-[1c48f303].ink`: 51 Blocks, 123 standoff properties, original Resource `5de5c3e7-983d-4467-829e-46cbdbe52b53`. All admitted authored trees preserve hierarchy/order, text, metadata, identifiers, annotations and unknown fields. Markdown is a lossy projection; native data remains authoritative.

Final quantitative evidence reconciliation caught an importer defect: StandoffProperty projection DTOs do not carry an ordinal. Using that absent field as an evidence key collapsed 793 eligible annotations onto 347 Block-level keys. The fix keys evidence by the stable derived segment GUID and validates frozen parent-command contents. A regression proves two annotations in one Block remain distinct with exact spans on rerun. The 347 early records were removed through public child services, then the normal importer created 793 correct attachments: 351 Claim references and 442 trait references. Independent reconciliation verified each identity, Claim, resource/Block, authored property ID, span, coordinate, excerpt, content hash and original annotation payload. All 30,591 derived identity-map source keys are distinct. The original ledger plus corrective removals/additions remain preserved, with a database backup taken before correction. The final primary vault contains 2,481 audit mutations and 35,220 events, with zero pending mutations. These include 347 early evidence creations, their 347 corrective removals, 793 corrected creations and the corresponding parent revision events. They are retained transparently; no audit history was reset. The exact repeat import retained these canonical/audit counts without duplication.

The final 11 public-service/native fidelity/integrity checks all passed in 17.61 seconds after correction. Evidence `00503e80-83b2-4543-871a-ef75f3592898`, for Claim `30cb3768-35ba-4d07-90a9-3178974188bb`, resolves the exact cell span [14, 24), excerpt `tabernacle`, in Block `fb740b47-dd47-4521-8ec8-f339cb5fc431` of `documents/luca-landucci_diary/1495-06-05-[8548ac4c].ink`. Of 21,131 Entity Reference segments, 34 lack a resolvable canonical target: 33 have no target GUID and one targets the gated unnamed Agent `e8445fae-fa0d-4adb-8ec0-53e7520a9fc2`. Their authored values remain unchanged; no target Entity is fabricated.

The full saved indexing/mention proof preceded this canonical evidence correction. Document bytes and derived rows are independently checked again afterward. Canonical evidence writes do not rewrite native documents or rebuild canonical knowledge from them. After application restart, saved Facts coverage still requires ordinary fresh reconciliation; durable SQL rows alone never establish a current scope.


### Rerun and recovery proof

The complete corrected importer was repeated against a separately restored database/file copy of the same snapshot. All 11 canonical table counts stayed identical, including 793 ClaimEvidence rows; audit counts stayed at 2,481 mutations and 35,220 events. Every one of the 1,712 native hashes matched its original capture. The original source fingerprint was unchanged. Stable command IDs/ledger receipts replay committed results, deterministic incidence identities prevent duplication, and frozen parent commands/native placements prevent revision or authored-tree drift. Individual known failures remain classified on each run; unknown outcomes stop dependent work.

This repeat intentionally used `--skip-index`: it tested canonical/native import idempotence without repeating the 41-minute saved reconciliation. Snapshot restore marks derived rows stale by design. The independent normal full saved-index/API proof is in `artifacts/legacy-codex-phase2/full-index-results.json`; current exact source/evidence/fidelity checks are in `semantic-query-results.json`. This distinction is explicit rather than treating restored SQL as current saved-scope authority.

The repeat took 639.69 seconds, including 5.20 seconds of canonical calls and 248.78 seconds of native publication/reopen. Sampled host heap peaked at 987.63 MB. Replay produced no new audit work: peak pending/outbox bytes were zero. The additional actual many-to-many service probe and final checks made total repeat qualification 642.66 seconds. Its public mutations and resulting audit/revisions remained confined to the restored disposable copy. Counts before/after exact replay and the probe result are recorded in `artifacts/legacy-codex-phase2/rerun-results.json`.

## 9. Measured performance

The first pilot took 109.26 seconds, including 11.17 seconds in 1,019 canonical requests, 3.93 seconds of audit delivery, 7.72 seconds in native publication and 3.93 seconds in saved indexing. It processed the complete semantic export and published 25 Documents.

Expanding to the full snapshot took 399.21 seconds: 1,712 pairs were confirmed, including the 25 prior publications; approximately 4.29 pairs/second overall. Canonical calls took 3.56 seconds in 1,787 requests because prior graph commands replayed their receipts; document publication took 246.75 seconds. The importer sampled a peak JS heap of 1.21 GB. This is sampled host heap, not a full worker/RSS peak measurement.

The first pass's outbox peak was 101 mutations and 8,446,195 bytes; the full expansion peaked at 100 mutations and 600,795 bytes. Audit was fully delivered, with zero pending mutations after publication.

The evidence corrective replay of all graph/native material took 664.27 seconds, including 10.02 seconds of canonical calls, 0.90 seconds of audit delivery and 246.88 seconds of native publication/reopen. Sampled host heap peaked at 941.22 MB; outbox peaked at 100 mutations and 597,460 bytes. This measured retry cost is distinct from the original import/index timings.

A 40-record sample using actual Agent commands took 225.03 ms individually and 45.80 ms in one public service batch, a 4.91x improvement on separate disposable sample vaults. Batching helps canonical calls; native inspection/publication and full source fencing remain the principal whole-corpus costs.

A real restart exposed 15,418 source/paired-archive entries exceeding the existing 10,000-entry vault-establishment budget. The bounded budget is now 100,000; overlap, symlink and partial-database rejection remain enforced. Full source fencing took about 1.26 seconds per traversal. A measured filesystem optimization overlaps at most 16 independent reads, preserves the exact fence fields/order, and validates directories/ancestors before and after traversal. No scope checks or SQL service contracts were bypassed. The complete full-vault indexing pass took 2,465.60 seconds (41.09 minutes), approximately 0.694 Resources/second. Full-vault source fencing before, during and after each publication dominates this cost. It is a measured bottleneck for bulk reconciliation and future cold-start refreshes; no raw-SQL canonical bypass, cached unverified scope or weakened fence was introduced. The 399.21-second expansion plus final full indexing account for at least 47.75 minutes, excluding the earlier pilot, intermediate interrupted reconciliation, retries and verification. Timings for those other activities are reported separately rather than presented as one uninterrupted import.

## 10. Tests

The Phase 2 pipeline fixture tests exact authored round-trip, multiple evidence annotations in one Block, frozen-command conflicts, raw negative-zero observation replay, gating of lossy document conversion, non-BMP cell evidence, two independently sourced equal observations, a point in two collections, safe membership removal, failed aggregate gating, selective relation simplification, source preservation, native publication, mention/evidence APIs, restart/rerun and disposable-destination safeguards. Publication tests cover `.ink.md` source protection, projection-loop exclusion, paired relocation/recovery and exact fence equivalence with the prior sequential algorithm. A replacement-directory race test proves the scope fence fails closed.

Final validation passed: 92 SQLite tests; 94 application/server tests across seven files, followed by all eight importer tests after the additional lossless document-conversion regression (95 distinct application/server tests across those files); TypeScript checking; server build; and the client build for the application/publication changes. Earlier focused publication/application suites also passed. Concurrent fixture suites initially contended for the existing vault-establishment lock; rerunning them serially passed without changing production lock rules. `git diff --check` passed.

## 11. Architecture and readiness

No genuine contradiction in the approved Phase 1 semantic model has been identified. The filesystem entry budget and measured index traversal cost are implementation capacity/performance issues. They do not alter Entity/Time identity, n-ary Claims, general Entity-valued qualifiers, independent observations, many-to-many memberships, raw-value preservation or audit/revision semantics.

The entire corpus is not qualified for live import: 678 document candidates and corrupted/unnamed graph records remain explicitly gated. Supporting zero-point/trailing-cell behavior, resolving identity conflicts, repairing the owner/time exports, choosing safe labels for unnamed/oversized records, recovering historical archives and relocating/rendering media require further scoped work or source correction. Markdown remains intentionally lossy interchange. No comprehensive visual reproduction of all 75 legacy standoff styles is claimed.

**Recommendation:** the explicitly admitted subset is qualified for a controlled initial import into a reviewed empty Mutable vault: 1,712 documents and the canonical records enumerated above, with their documented unresolved links and source-preservation dispositions. Retain the audit/provenance material and budget for the measured cold-start reconciliation cost. The complete 2,390-document corpus and merging into a populated live vault are not qualified. The command remains disposable-only in this phase; live publication/adoption requires a separately scoped step, not removal of the guard or an unreviewed copy into the working vault. No live-vault action has been performed.

The implemented semantic model remains the approved model. The discovered evidence identity defect was an importer bug, corrected without schema/API deviation. There are no unresolved architecture contradictions.
