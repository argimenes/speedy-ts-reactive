# Mutable / Flint post-C3 architectural feasibility review

**Review only, against repository `71b1198`. Recommendation: B — Agree with amendments.** The direction is sound: Mutable owns shared identities and resource/query infrastructure; applications consume narrow capabilities. A disposable SQLite index is a credible next experiment. General Block-artifact persistence and an authoritative resource-location registry are separate architectural changes, not consequences of choosing SQLite.

This reviews the supplied `MUTABLE_POST_C3_ARCHITECTURAL_DIRECTION_REVIEW.md`. C3 and its accepted contracts remain unchanged. No implementation, file migration, database access/mutation, dependency installation or new qualification run was performed. Findings below distinguish inspected code from proposed future behavior. The [C3 qualification report](FLINT_C3_QUALIFICATION_REPORT.md) remains the evidence for the accepted implementation; this review does not claim new SQLite, durability or performance qualification.

## 1. Platform ownership

**Agree.** Entities, canonical resource identity and collection-level indexing should belong to Mutable, with Flint supplying knowledge-management UI. Existing [resource identity](src/block-tree/resource-identity.ts), [native capture/admission](src/persistence/native-resource.ts) and [resource-scoped paired saving](src/persistence/resource-pair.ts) already live outside Flint. [BacklinksService](src/feature-api/backlinks.ts) is a semantic consumer boundary, not a database contract.

The current native session still takes a `ReactiveEditor` and production native Save/Open is exposed principally through Flint. Thus platform-level semantics are established, but host-independent access is not uniformly implemented. Legacy Documents can be saved independently; that does not mean every host already supports the qualified native route. Extend narrow host capabilities when a real consumer requires them; do not build an application framework or move persistence into Flint.

## 2. BlockTree persistence: a good model, not yet a universal capability

Documents, Windows, images and other content share the [content/placement model](src/block-tree/types.ts). However, a durable resource is an **ownership-aware capture**, not an arbitrary slice of the rendered tree. It must retain linked definitions, preserve external boundaries and distinguish canonical content from occurrences.

Today `captureNative` selects a unique `document-block`; admission registers a Document in the object bank. [Resource scopes](src/block-tree/external-reference.ts) are Document/Workspace; [owned-resource validation](src/block-tree/resource-registration.ts) specifically qualifies Document resource roots. The portable decoder rejects Workspace Block definitions. [Workspace manifests](src/reactive-editor/workspace-manifest.ts) remain a distinct tree/reference format, and [native binding guards](src/persistence/native-bindings.ts) deliberately block Workspace/tree saves that would flatten native resources.

Consequently, `.space` is not an already-supported larger native capture. Independently persisting an ImageBlock also needs a decision: export a copy, promote an owned subtree to a resource boundary, or save a snapshot? Those have different identity/ownership semantics. Preserve the conceptual unification, but qualify each expansion without removing current guards.

## 3. Artifact extensions and compatibility

The proposed names are feasible as media/profile hints. `.ink` can be the first candidate for the existing rich Document semantics; it must not imply text-only content. `.space`, `.graph` and generic `.mutable` should remain reserved proposals until their capture/admission contracts exist.

This is more than changing a file picker. The [native routes](server/native-document-store.mjs), [vault discovery/relocation](server/native-vault-store.mjs), [session link paths](src/persistence/native-session.ts), pair naming and Workspace source validation contain explicit `.mutable.json`/`.json` rules. Pair receipts retain filenames; recovery must still understand older names and generations. `Poe.ink` and `Poe.mutable.json` would both conventionally pair with `Poe.md`, creating a collision that must be rejected rather than silently shared.

Recommend additive read compatibility, opt-in new-file naming, and later explicit journalled conversion. Preserve existing IDs, bytes and evidence when merely changing bindings; do not silently rewrite existing files. Extension/envelope mismatches require explicit diagnosis, never unchecked decoder selection. Changing the envelope is a separately versioned compatibility operation.

## 4. Encoding independence

The code already separates repository capture, resource graph encoding and admission. It also separates native-envelope version 1, graph version 1/2 and `codex-authored-value-v1`. Those distinctions should survive any naming change.

JSON remains coupled above the final byte encoder: [ResourcePair](src/persistence/resource-pair.ts) stores native strings and compares `nativeText`; HTTP routes carry those strings; [ManagedPair](src/persistence/managed-pair.mjs) hashes encoded bytes; the [authored-value grammar](src/history/preplan-spike/wire.ts) uses tagged JSON to preserve `undefined`, non-finite numbers and negative zero. Unknown authored payloads cannot be reduced to ordinary JSON without losing accepted fidelity.

For now, document semantic media type, graph/value schema and encoding separately, and keep parsing behind codec entry points. Do not add speculative codec registries or alter historical byte hashes. An alternate encoding would require explicit byte/transport and semantic-equality contracts, with old decoders retained; `.ink` alone does not require that work. Existing reserved-envelope-field rejection also means a new `mediaType` field cannot simply be added to version 1 and assumed backward compatible.

## 5. `.mutable/` and durability domains

**Agree with the name**, once its collection root is defined. Current vault selection can be any managed subdirectory; it is not yet a persistent collection identity or metadata root.

The three-domain distinction needs one clarification: recovery evidence is neither authored knowledge nor a disposable query index. Existing `.mutable-pair-*` receipts/generations, `.mutable-relocations` journals and the store lock have operational roles. Preserve that evidence. A future `.mutable/storage/` could house it only through separately qualified migration; it must never be swept up by “rebuild index.”

The scanner currently excludes `.mutable-*`, **not `.mutable/`**. A future implementation must explicitly reserve/hide/protect the exact system directory in discovery and directory mutation paths. Keep authoritative metadata outside `.mutable/index/`; deleting the entire `.mutable/` is not an index reset.

## 6. Minimum safe durable Entity creation

Current [Entity selection](src/features/entity-references/entity-search.ts) annotates a returned Entity ID after revision validation. Current search/summary consumers use [SurrealDB routes](server/entity-search.ts). The older [`addToGraphJson`](server/index.ts) directly upserts an `Agent`; the migrated search UI does not expose equivalent creation. There is no existing independent, qualified Mutable Entity store to reuse unchanged.

A bounded candidate is a versioned collection-owned Entity file, accessed through semantic lookup/create/update capabilities. Require stable IDs, idempotent creation, expected-version/hash checks, serialized competing writes, bounded validation, durable replacement/recovery and read-only/conflict behavior. Duplicate names must not automatically merge identities. Preserve unknown supported metadata and keep authored aliases separate from enrichment.

Persist the Entity first; then revalidate the original selection and create the native annotation using its ordinary transaction. Failed/stale annotation leaves a valid unreferenced Entity. Undo removes the annotation, not a potentially shared Entity. Do not promise atomicity across the Entity file and unsaved Document. No generalized multi-resource transaction is needed for this bounded behavior.

**Existing-data caveat:** legacy Agent writes may be the only durable home of some Entity identities. Seed JSON and annotation `entityName` caches do not establish a complete authoritative copy. The claim that SQLite will be disposable is sound; claiming all existing SurrealDB data is already reconstructible is not. Audit/export decisions precede any future retirement, without altering that data in this review.

## 7. Entity identity, optional canonical page and shortcut

The separation is compatible with current data. Entity references use `codex/entity-reference` and an Entity ID; [C2](src/application/vault-knowledge.ts) and C3 deliberately use `codex/block-reference`, root Block ID and canonical Document ID. Keep these types distinct. Existing Entity IDs also include legacy naming variants; do not strip prefixes or mint replacements without a compatibility decision.

`canonicalDocumentId` can be a non-owning optional association. It must not imply that the Entity owns the Document, or that deleting/renaming one deletes/renames the other. An unavailable recorded page should report unresolved availability, not automatically create a replacement.

For explicit first-page creation, persist the new native Document before conditionally assigning the Entity's page ID. Concurrent creators must not overwrite that association; interruptions can leave an unassigned valid Document, requiring explicit recovery rather than automatic deletion. The storage destination and desired creation UX need agreement.

Ctrl-Space is unsuitable as an unconditional default: the [binding catalog](src/input/binding-catalog.ts) already uses it for Block-selection toggling in the gutter, and macOS uses it for input-source switching. Offer a semantic command/button and configurable, scoped binding that respects composition and native controls. Existing Entity commands use Ctrl-; chords. [Apple input-source shortcuts](https://support.apple.com/en-au/guide/mac-help/-mchlp1406/mac).

## 8. Resource registry: useful lookup, questionable new authority

There is **no global `resources.json` equivalent**. There are related but distinct mechanisms: envelope resource IDs; runtime native bindings and caller baselines; per-pair receipts; relocation journals and location revisions; and legacy Workspace source records. Discovery reconstructs physical hierarchy from directories.

The relocation journal already provides durable location evidence for moved resources and rejects stale clients/old paths. A second authoritative map would require coordinated updates with pair publication, moves and recovery, including conflicts when map, file identity and journal disagree. It cannot refresh a stale editor's save baseline, establish ownership, or adopt an external same-ID move.

My preferred first index uses **derived resource-location lookup from discovery plus existing binding evidence**, not a new authority. A future authoritative binding manifest might help resolve unopened dependencies or preserve explicitly approved bindings, but needs a separate justification/gate. Its authority would be the approved binding, never the resource's identity or semantic owner. Neither option recreates virtual folders: the real directory tree remains the hierarchy.

## 9. What the standoff implementations actually share

[RangeAnnotations](src/runtime/range-annotations.ts), [linked definitions](src/block-tree/linked-annotations.ts), [style schemas](src/rendering/standoff-styles.ts) and the Entity feature support a common **read projection**, not one uniform authored schema:

| Producer/category | Common facts | Distinctions an index must retain |
| --- | --- | --- |
| Bold/italics, colour, highlight, rainbow/SVG effects | Block, type, local inclusive Cell range, usually annotation ID; optional value/parameters | Value may be a colour, not an identity. Parameters can be top-level fields, metadata or attributes. SVG geometry is measured presentation, not authored knowledge. |
| Entity and Document references | Ranges plus typed semantic target | Different target domains; name caches are not identities; C3 supports Document roots only. |
| Linked annotations | Segment IDs/ranges plus `annotationId` | Definition owner, external provenance, resolution/version status and logical mention identity are essential. Do not duplicate shared meaning per segment. |
| Show/Hide and text superposition | Authored range/type/settings | Projection policy and owned alternative content must remain distinct; rendered visibility is not authored membership. [Superposition implementation](src/runtime/text-superposition.ts). |
| Find, Entity previews/candidates | Versioned ranges, session owner/type | [Session decorations](src/runtime/session-decorations.ts) are outside canonical state and occurrence-scoped. A persistent authored index must exclude them. |
| Unknown/legacy properties | Opaque authored bags, sometimes recognizable ranges | Preserve payloads; validate ranges/IDs and report unsupported semantics. Do not invent stable mention IDs from mutable array positions. |

Common native range properties use inclusive endpoints; [query snapshots](src/runtime/text-ranges.ts) use half-open ranges. Not every record has valid ranges or a globally unique ID. Index raw typed data plus validated facts and provenance; semantic adapters decide whether a value denotes an Entity, Document, URL or something else. Generated syntax annotations additionally need an agreed authored-versus-derived lifetime and generator/version evidence. A live-only decoration query could be added later without pretending those highlights survive restart.

## 10. SQLite feasibility and query semantics

**Feasible as a derived index; not yet measured or integrated here.** Resources, Blocks, annotation definitions/segments, Entities and mention aggregates fit relational tables; FTS and typed edge projections can be added where justified. Use composite source identity and generation evidence, not a bare property GUID or an ambiguous `ownerGuid`. An `attributesJson` cache must respect the native tagged-value grammar, or explicitly omit unsupported query facts; ordinary JSON stringification must not silently redefine authored values. Never write the narrowed index representation back into native content. Resource membership, semantic ownership, definition ownership and retention are different facts.

Refresh a resource's rows transactionally, replace/remove obsolete projections and publish an index-generation marker only after completion. A failed or partial discovery must not erase unseen resources. Deleting/rebuilding the index must recreate its results from native resources and authoritative metadata, including tombstone/deletion effects and unresolved diagnostics.

FTS5's tokenized search is not automatically equivalent to C2's literal matching, Unicode boundaries or substring behavior. Treat it as a candidate mechanism with a demonstrated no-false-negative strategy and native verification, or expose a separately specified search mode. Its content/index consistency also needs explicit maintenance. [SQLite FTS5 documentation](https://sqlite.org/fts5.html).

The current filesystem host is Node; a server-side local index is the smallest deployment candidate, not a browser-owned DB. No SQLite adapter/dependency was found in current production code. SQLite WAL supports readers alongside a writer but only one writer at a time, and requires same-host shared memory rather than a network-filesystem deployment. Runtime/driver packaging, cancellation and actual collection sizes remain qualification work. [SQLite WAL documentation](https://sqlite.org/wal.html).

## 11. Range intersection

Use integer half-open **Cell** offsets with resource/Block identity, source generation and coordinate-profile version. Text Cells are code points; inline images occupy Cells; combining sequences can span Cells. UTF-16, grapheme and FTS-token offsets are not interchangeable. Reuse the [native text-run boundary mapping](src/runtime/canonical-search-source.ts), including barriers at inline objects.

For nonempty ranges in the same Block/generation, overlap is `a.start < b.end AND b.start < a.end`; intersection is `[max(starts), min(ends))`; containment compares both endpoints. Cross-Block logical mentions require joins through their segments, not one fabricated global range. Any future point annotation needs separate semantics.

Start with equality-prefix B-tree indexes such as `(resourceId, blockId, generation, type, start)` and target-oriented indexes for reference queries. End filtering remains necessary; do not claim one B-tree efficiently solves every two-ended interval query. Measure selective real workloads before adding specialized spatial/interval structures. [SQLite query-planner guidance](https://sqlite.org/queryplanner.html). If R*Tree becomes warranted, assess integer `rtree_i32` and its bounds; default R*Tree coordinates use 32-bit floating point. [SQLite R*Tree documentation](https://sqlite.org/rtree.html).

## 12. Observed Entity mentions

Yes: derive mention text from validated canonical segments and resolved Entity-reference definitions. Retain exact display text, source evidence and a versioned search-normalization policy. An occurrence count counts logical mentions, not mounted occurrences; a Document count uses distinct canonical resource IDs. Linked segment joining/order, whitespace and inline-object handling require a declared policy, not arbitrary concatenation.

The existing [Document Entity inventory](src/features/entity-references/document-entities.ts) already distinguishes linked logical mentions from occurrence ranges. The legacy “alias” [server search](server/entity-search.ts) actually groups observed `StandoffProperty.text`, rather than consulting declared aliases. Preserve that useful search mode under an accurate label. `he`/`his` never become declared aliases just because they occur in indexed mentions.

## 13. Derived edges and provenance

An edge index is reasonable as a projection. Store its derivation kind/version, source resource/Block, local annotation or definition-owner/logical-mention identity, contributing segment IDs, typed target and generation/freshness evidence. Derive deterministic edge identity from the authored evidence plus derivation rule; keep changing generation separate so a repeated save does not create another logical edge.

Aggregated `Document → mentions → Entity` edges need contributor evidence, not just a count. Containment, reference, owned-resource, presentation and Entity relations must remain distinguishable. An index row grants no ownership. Unknown/foreign definitions may be retained as unresolved evidence; they must not silently acquire C3-supported semantics.

## 14. Authored graph facts

No implemented `GraphDataBlock`/`GraphViewBlock` registration was found. The [Spatial plan](CODEX_SPATIAL_WORKSPACE_PRESENTATION_PLAN.md) explicitly defers that work. Existing [Graph](src/library/graph.ts), `data/default.graph.json` and server graph routes provide older node/edge JSON machinery, not a qualified native authored-graph resource.

Use that work as design evidence, not as proof that `.graph` persistence already exists. A later minimal GraphDataBlock could own explicit relationship records with stable assertion IDs and typed Entity/resource targets, while its viewer remains derived UI. First prove native round-trip, ownership, editing and Undo/Redo inside a currently supported Document resource. Independent `.graph` admission then has its own gate. Do not persist inferred edges as authored assertions without an explicit user operation.

## 15. In-memory graph structures

Reasonable, with bounded materialization by query scope and generation. Keep IDs/types/adjacency and evidence references in memory; fetch text/attributes only when needed. Multiple assertions with the same endpoints require a multigraph/evidence distinction; hyperedges need actual semantics rather than an arbitrary pairwise expansion.

No current vault-size/edge-density evidence supports promising that every collection fits in memory. Start with bounded subgraphs, cancellation and explicit incomplete coverage. An always-live whole-collection graph is not a prerequisite for search, backlinks or interval queries.

## 16. SurrealDB's possible role

The concrete present value is the existing Entity lookup/summary backend and legacy Agent/Claim/Concept data. The [accepted audit](FLINT_SURREALDB_INFRASTRUCTURE_REVIEW.md) establishes why its saved Text/mention rows cannot replace native C2/C3 semantics.

For future workloads, native graph relations with attributes and server-side traversal could justify it; subscriptions or shared remote querying might matter if those become requirements. These are capabilities to assess, not evidence that the installed versions satisfy a new deployment. [SurrealDB RELATE documentation](https://surrealdb.com/docs/reference/query-language/statements/relate), [LIVE SELECT documentation](https://surrealdb.com/docs/reference/query-language/statements/live-select).

SQLite plus bounded in-memory graphs is a plausible simpler fit for the proposed local range/text workload. The next database decision should be driven by a measured query or deployment need that this approach cannot meet. Keep existing SurrealDB intact; retirement/migration and preservation of potentially authoritative legacy Entity data are separate decisions.

## 17. Unsaved state: compare before choosing

| Candidate | Fit with current code | Main cost/risk |
| --- | --- | --- |
| Update persistent SQL on every canonical change | Change notifications exist | Write traffic, update ordering and crash/session ownership of unsaved data; unacceptable synchronous typing work. |
| Invalidate changed indexed resources and scan live | Closest to C3 | Must suppress stale rows and account for scope/ranking before limiting results. |
| Persist unsaved generations explicitly | Technically possible | New session/crash and multi-client semantics; risks implying recovery guarantees not present today. |
| Saved-resource index plus live canonical overlay | Best first candidate | Requires clear generation joins and live replacement/removal rules, but keeps authority where it already is. |

**Recommendation for a future proof, not an implementation choice made here:** saved-resource SQLite plus a session-local live overlay. Initially replace indexed contributions for every loaded, eligible resource, not only resources classified dirty. This prevents externally newer disk content from silently overriding a clean but still-authoritative loaded instance.

[Repository changes](src/block-tree/repository.ts) expose affected content and an `inlineOwner` fast path; [C3](src/application/canonical-backlinks.ts) demonstrates cheap invalidation and deferred resource rescanning. Use those signals to invalidate immediately, then perform bounded extraction outside typing. Definition changes must invalidate consumers as well as owners.

A merged result needs index generation/content hash and extractor version, live repository session/revision evidence, authoritative Entity-metadata revision where relevant, and current availability/binding evidence. Suppress replaced disk rows **before** aggregate counts, ranking and limits. Handle live deletions and Undo branches; reject stale async completion. Never put unsaved data into the saved index without an explicit live-session namespace and lifetime.

C3 remains loaded/available scope. Whole-collection saved search is a separately declared coverage mode, not an invisible backend swap. Disk hits must not auto-mount Documents; explicit Open/admission and canonical revalidation precede native navigation. Two repositories with conflicting unsaved copies do not acquire a merger merely by sharing SQLite. No watcher or synchronization requirement is implied.

## 18. Migration safeguards

Keep `.mutable.json`, graph versions 1/2, value tags, unknown authored properties and reserved-field rejection working. Keep Markdown a paired projection. Keep per-resource save coordination, caller baselines, partial-publication recovery and ownership/dependency guards unchanged.

A future new extension must pass old/new mixed-directory discovery, pair-name collisions, case/Unicode paths, no-replace relocation, external modification, stale clients, restart/recovery and old receipt/generation compatibility. Index rebuilds must neither enroll resources nor establish bindings/ownership. Resource ID remains distinct from root Block ID and location; new artifact naming must not introduce another Document GUID. Workspace/native round-trip, ownership transfer and History graph-2 integration remain separately gated.

## 19. Proposed order and stop gates

These are suggested planning units, **not authorization to implement**. Extensions and general artifact persistence need not block an index proof.

| Stage | Bounded work | Required stop/review gate |
| --- | --- | --- |
| P0 — Resolve authority and scope | Agree collection root, Entity identity scope, binding-registry intent and artifact export semantics. Inventory legacy Entity authority read-only. | Review explicit decisions; no new store until authority is unambiguous. |
| P1 — Independent Entity identity | One collection-owned store; lookup/create and existing Entity-reference UI adaptation. No canonical-page creation or DB migration. | Durable creation, duplicate-name/concurrent-write behavior, stale selection, restart/read-only/conflict and annotation Undo without Entity deletion. |
| P2 — Disposable native-index proof | Isolated SQLite over existing `.mutable.json` plus Entity metadata; bounded annotation/range/mention projection and compare live-overlay alternatives. | Delete/rebuild equivalence; no authored mutations; native Unicode/inline/linked semantics; edits/Undo/deletion/stale completion; partial discovery; performance/typing budget. Review before production integration. |
| P3 — Narrow query integration | One justified consumer behind its semantic contract; explicit saved versus loaded coverage. No C3 redesign. | Existing C2/C3 behavior preserved, two-Window navigation and availability revalidation, index-unavailable fallback and honest coverage. |
| P4 — Entity page gesture | Optional canonical Document association through existing native Save/Open. | Concurrent first-open, partial failure/recovery, missing page, relocation and non-owning lifecycle. |
| Independent artifact track | First additive `.ink` compatibility; separately GraphDataBlock in a Document; later standalone `.graph`/`.mutable` and `.space`. | Stop after each. General capture/admission and Workspace/native persistence need explicit new plans, not a suffix migration. |

An authoritative resource-binding manifest, if still desired after P0, needs its own storage proposal and recovery gate before either track depends on it. Broader SurrealDB integration or retirement follows only a demonstrated requirement and legacy-data preservation plan.

## Questions required before implementation planning

1. **Collection boundary:** should `.mutable/` belong to an explicitly opened collection root, the whole managed server root, or another scope? May nested opened vaults share one Entity store?
2. **Entity scope and existing identities:** are Entities collection-local or shared across collections? Should existing SurrealDB Agent IDs remain resolvable alongside new Mutable-owned IDs during a transition? My recommendation is to preserve existing IDs and fail on ambiguity, never infer identity from a name.
3. **Binding authority:** is a new authoritative `resources.json` required, or is reliable platform lookup the actual goal? I recommend derived lookup plus current durable binding evidence first; a new authority needs separate approval.
4. **Standalone artifact meaning:** does saving an existing Block independently mean exporting a distinct copy, promoting its ownership boundary, or persisting a snapshot of the same identity? The current model cannot treat those as interchangeable.
5. **Entity page creation:** which collection/folder should receive the first page, and may a failed competing creation leave an explicitly unassigned native Document? The safe default is no ownership inference and no automatic destructive cleanup.

Mention normalization, cross-Block display joining and which syntax annotations are authored must also be specified before the relevant P2 query profiles; they need not delay the initial authority decision.

## Conclusion — B. Agree with amendments

Adopt the central direction: Mutable-level identities, distinct Entities and Documents, native authored resources, a rebuildable query index and specialized derived views. Amend it by (1) treating arbitrary Block/Workspace persistence as unqualified new work, (2) deferring a second authoritative location registry, (3) preserving durable recovery evidence separately from disposable indexes, (4) separating authored annotations from live decorations and generated analysis, (5) protecting any legacy Entity facts that exist only in SurrealDB, and (6) proving live canonical overlay semantics before choosing an index integration strategy.

There is no identified reason to reject the direction. The unresolved authority/scope decisions are prerequisites to planning the next implementation, not reasons to change accepted C3. **Stop for architectural review.**
