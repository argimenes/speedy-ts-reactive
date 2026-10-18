# Mutable Academic Resource Loaders Architecture and Implementation Plan

18 October 2026 · Milestone A accepted (including user-tested live DOI import). Milestone B implemented and submitted for acceptance; C–D not started.

The academic ingestion brief calls for DOI, Wikipedia/Wikidata and IIIF resources to become native, citable Mutable content, with PDF integration. Extend the existing explicit resource-paste operation and application services. Keep canonical identities, captured source versions and document representations separate, so repeated imports reuse knowledge without losing the provenance of each occurrence.

This plan resolves the brief's design questions and divides implementation into its four milestones. It preserves manual document saving, the SolidJS editor's interaction and history ownership, immutable original assets, and the accepted Vault/application-service boundaries. Phase 4, synchronization, archive mounting, desktop packaging and publishing enhancements are outside this work.

## 1. Recommended decisions

| Question | Recommendation |
| --- | --- |
| CitationBlock or ScholarlyWorkBlock? | A dedicated `CitationBlock` view of a canonical scholarly Entity (publication, dataset, software or another provider-classified research object). Bibliographic identity belongs to the entity; each Block has its own identity, pinned source snapshot and display preferences. Avoid two competing scholarly Block types. |
| Wikidata enrichment? | Explicit opt-in per entity, followed by review of selected claims. Retrieval does not accept assertions, merge identities or overwrite authored facts. |
| IIIF annotations? | A versioned spatial anchor on a manifest/canvas snapshot. Text standoff properties remain text coordinates; link OCR text annotations to spatial anchors through an explicit alignment. |
| Immutable snapshots? | Preserve validated original response bytes, response identity, version, rights information and a versioned normalized projection. Refresh creates a new capture; existing annotations remain pinned until explicitly migrated. |
| Adapter location? | Pure TypeScript recognition and normalization; protected acquisition and canonical commits in explicitly Vault-scoped application services. SolidJS owns views, selection, previews and document Undo/Redo. |
| PDF implementation? | A dedicated PDF.js viewer over an immutable managed original, introduced as a prerequisite to Milestone D's work-to-PDF relationship. Do not use an arbitrary remote iframe as the durable PDF representation. |
| Network gesture? | Command/Ctrl-Shift-V invokes the recognized loader and authorizes bounded metadata retrieval for that resource. Normal text paste stays network-free. Enrichment, full-text acquisition and additional unapproved origins remain explicit actions. |

Introduce one coherent `academicResourceLoaders` feature flag, enabled by default when implementation ships. Disabled loaders retain existing URL behavior, and previously saved academic Blocks remain readable through inert cached representations. Bare DOI recognition is deliberately enabled only in resource paste and an explicit academic-import command, never in ordinary typing or plain paste.

## 2. Existing infrastructure and concrete gaps

| Existing component | Reuse and required addition |
| --- | --- |
| [URL resource dispatch](src/interchange/resource-url.ts), [clipboard controller](src/runtime/mutable-clipboard.ts) | Syntax-only recognition, captured insertion destination, cancellation and one document insertion. Add academic dispatch before generic iframe fallback. Preserve `sourceUrl` exactly as pasted after outer whitespace removal. |
| [Service contracts](src/application-services/contracts.ts), [capabilities](src/application-services/capabilities.ts), [Node host](server/application-services/host.ts) | Extend typed operations and scoped capabilities. Current preparation kinds cover conversion/package work; academic tasks need named additions, not arbitrary URLs, SQL or filesystem commands exposed through an unrestricted proxy. |
| [Remote acquisition](server/asset-remote.mjs) | Reuse HTTPS, public-address checks, pinned DNS resolution, redirect limits, cancellation and bounded bodies. Existing image/text policies do not admit API JSON and reject cross-origin redirects; introduce narrow academic policies without weakening old callers. |
| [Managed assets](server/managed-assets.mjs) | Reuse hashes, staged publication, leases and original-byte retention. Current asset contracts admit PNG/JPEG only. JSON/HTML captures and PDFs require explicit validation and media-type admission, not relabeling as images. |
| [Canonical entities](src/knowledge-sqlite/entities.mjs), [canonical ledger](src/knowledge-sqlite/canonical-ledger.mjs) | Existing GUID identities, revision checks, idempotent operation receipts and audit outbox. Add transactional external-identity resolution; name search is not DOI deduplication. |
| [Schema](src/knowledge-sqlite/schema.mjs), [semantic schema](src/knowledge-sqlite/migrations/mutable/0002-semantic-knowledge.sql) | Existing `Resource` records are derived document-index data. `ClaimEvidence` requires document/Block text coordinates. Neither can serve unchanged as an authoritative external resource or IIIF region record. |
| [Saved projection](src/knowledge-sqlite/saved-projection.ts), [canonical backlinks](src/application/canonical-backlinks.ts) | Existing entity-reference annotations participate in backlinks. A CitationBlock payload reference will need explicit fact extraction; merely storing `entityId` does not make it discoverable. |
| [PackageData extraction](src/knowledge-sqlite/package-data.mjs) | Canonical tables are explicitly enumerated; schemaless attribute references are not followed. New canonical records need bounded extraction/closure support, not an assumption that existing package code will discover them. |
| [Core views](src/rendering/register-core-views.ts) | Current `pdf-block` uses `IframeView`. Add a separate versioned managed PDF view without silently changing legacy PDF semantics. |

All additions retain the [application-service architecture](MUTABLE_APPLICATION_SERVICES_DESKTOP_ARCHITECTURE_REVIEW.md): contracts, implementations and platform adapters remain distinct. A service instance receives a logical Vault identity and authorized capabilities; it must not resolve a global active Cavern midway through an operation. Cavern remains Flint's presentation of that Vault.

## 3. Identity and persistence model

Use these conceptual records; introduce only those needed by each milestone.

| Record | Identity and responsibility |
| --- | --- |
| ExternalResource | Mutable GUID plus provider identity: DOI, wiki-site/page ID, QID or canonical IIIF URI. Records what was addressed or retrieved. Keep this concept separate from the derived SQLite `Resource`; A stores its GUID in the accepted mapping and capture, without another table. |
| Entity | Existing canonical GUID for a Work, Person, Object or other subject. An article resource can describe a Person without becoming that Person. |
| ExternalIdentity | GUID record with namespace, normalized key, target entity, evidence and revision. Unique accepted `(namespace, key)` within a Vault. Conflicting mappings require review. Suggested crosswalks do not occupy this accepted identity index. |
| SourceSnapshot | Immutable capture ID, resource ID, original-byte asset hash, provider revision, retrieval timestamp, final URL, rights/attribution, adapter version and normalized projection hash. Distinct captures can share identical bytes. |
| Representation | Native Block with independent Block identity, resource/entity links, pinned snapshot and local presentation settings. May represent a citation, article, PDF or IIIF object. |
| Annotation | Existing text standoff instance or new spatial anchor instance, with its own identity and pinned representation/snapshot coordinates. |

Preserve `sourceUrl` on every Block, including the original DOI spelling or bare identifier. Keep normalized identifier, resolved endpoint and final URL in separate fields. Do not strip historical query parameters from provenance merely because they are irrelevant to lookup. Public exports must not automatically disclose source URLs or captured metadata.

For DOI equivalence, parse a recognized resolver URL or deliberately enabled bare DOI, decode URL encoding once and apply ASCII case folding to the identifier key. Preserve its original spelling; do not apply the entity-name NFKC normalization or remove potentially meaningful trailing punctuation. Reject ambiguous input with a correction affordance rather than guessing. DOI equivalence and URI encoding are described in the [DOI Handbook](https://www.doi.org/doi-handbook/DOI_Handbook_Final.pdf).

Milestone A adds accepted ExternalIdentity mappings and immutable SourceSnapshot records through a versioned schema migration. ExternalResource identity is recorded in the mapping and snapshots; a separate resource table is unnecessary for DOI metadata captures in this milestone. Extend the canonical ledger's table/state allowlists, schema integrity checks, audit events and package extraction together. Store large source bodies in immutable assets; canonical rows retain bounded descriptors rather than provider JSON blobs. Current canonical requests are bounded at 32 KiB and 256 changed records, so large creator/claim batches require bounded separate operations and receipts.

Resolve-or-create Entity and claim its accepted DOI key in one canonical transaction. Concurrent imports must converge through the unique key, with no orphan duplicate Entity from a losing transaction. Retry with the same operation ID returns the prior outcome. Never merge on title or author similarity; preprints, versions, corrections and editions remain separate unless an explicit reviewed relationship establishes otherwise.

Canonical records and retained snapshots are portable Vault data. Jobs, locks, temporary grants, rate-limit state and evictable tile caches are device-local operational state. File paths are internal capabilities, never durable identities. A derived-index rebuild may clear document facts, FTS and backlinks; it must not delete canonical entities, source records or identity mappings.

## 4. Operation flow and recovery

Milestone A's implemented service surface is `academic.import`, `academic.inspect`, `academic.resume` and `academic.backlinks`. The host owns acquisition, preparation and canonical commit within one durable job; cancellation uses the existing request AbortSignal. Inputs are bounded DOI descriptors and operation IDs, not arbitrary URLs or SQL. Outputs contain normalized metadata, diagnostics and scoped references. Methods use the existing service adapter and its Vault authorization. Job identity is bound to its Vault and exact input; retrying an ID with different input fails. Refresh and reviewed enrichment remain later operations.

1. Recognize the input locally and capture the existing insertion bookmark. Display a transient loading affordance outside canonical document data.
2. Prepare through the host: consult accepted identity/snapshot records, acquire permitted metadata only when necessary, validate it and normalize in the bounded executor. A serializes jobs within a service instance; a queued repeat uses the completed canonical result. Independent hosts can acquire separately but converge transactionally on one accepted identity. Cancellation remains local to the requesting job.
3. Show concise diagnostics or required decisions. Routine DOI metadata import need not introduce another confirmation dialog. Claim acceptance, identity conflicts and full-text retrieval remain separate choices.
4. Publish validated capture assets, then commit canonical records through the existing ledger. The journal records each publication and canonical receipt; this is not a fictitious transaction spanning filesystem, SQLite and browser history.
5. Revalidate the destination and create a fresh representation using MutableFragment, native materialization and the existing insertion/history path. The document becomes dirty; Command-S/Control-S saves normally.

Undo removes the inserted representation in one document operation. It does not erase a shared Work, source capture or published asset. Redo restores the same local insertion state without another provider request. Closing the document or cancelling before insertion must prevent a late insertion; if canonical publication already committed, report that retained outcome and allow a later deliberate insertion. Never automatically insert into a recovered browser caret after restart.

Use the existing filesystem job primitives with an `academic` discriminator and the existing ready/running/completed/failed/cancelled/interrupted states. A checkpoints the exact canonical request after capture publication and before canonical dispatch, then stores the resulting citation. Resume verifies the published asset and replays the same request through ledger receipts if the commit outcome was ambiguous. Inspect marks a stale running job interrupted only after obtaining its execution lease. Resume requires fresh Vault authorization; it returns a result and never inserts automatically at a recovered caret. No academic journal belongs in IndexedDB or operational tables in the knowledge database. Retain published originals under the current conservative retention policy.

## 5. DOI and citation experience

Recognize DOI resolver URLs and bare DOIs in explicit resource paste. Fetch registration-agency information when needed, then use the appropriate Crossref or DataCite record endpoint. Prefer an existing local identity and pinned snapshot on repeat paste. A does not implement Refresh or publisher landing-page discovery. Later known scholarly landing-page adapters must extract one declared DOI from a bounded response; multiple identifiers require a choice, not a guessed Entity. Unknown pages retain existing URL-loader behavior without scholarly discovery probes.

Crossref documents work and registration-agency lookup in its [REST API](https://www.crossref.org/documentation/retrieve-metadata/rest-api/). DataCite exposes public metadata retrieval through its [REST API](https://support.datacite.org/docs/api). Do not chase the DOI redirect to a publisher to discover metadata by default. Unsupported agencies produce a failed, inspectable job retaining the supplied identifier and a diagnostic; no invented citation is inserted.

Normalize title, work type, creators and supplied ORCID identifiers, date components/precision, venue, publisher, DOI, landing link, available full-text candidates and license statements. Keep missing data absent. Treat abstract markup as untrusted; include an abstract only under the adapter's documented availability/reuse policy. Preserve the source of individual fields when combining providers. Do not create Person entities for every author merely to render a citation card.

CitationBlock displays the normalized metadata, provenance date, source link and offline/stale state. Store a small safe display projection in native data so the Block remains understandable if canonical lookup is unavailable. That projection is a view of a specific snapshot, not an independent authority that silently updates the Work.

Milestone A exports CSL JSON and provides one documented default citation format. Preserve ordering, name parts, dates and identifiers rather than reconstructing them from formatted strings. A general CSL style processor and BibTeX export follow as bounded citation work; qualify escaping and loss reporting before shipping them. OpenAlex is an optional later enrichment adapter, not a mandatory dependency for DOI insertion. Review its current access requirements when implementing it through the [official documentation](https://docs.openalex.org/).

A's default is a fixed author–year presentation: up to three creators, “et al.” for additional creators, year or “n.d.”, title, optional venue and DOI. It does not claim APA/MLA compliance. CSL downloads contain an array of items; ORCID identifiers and original provider types remain in `custom` extension metadata, following the [CSL JSON input schema](https://raw.githubusercontent.com/citation-style-language/schema/master/schemas/input/csl-data.json). Unknown provider types use CSL `document`, while the canonical Entity defaults to ResearchObject. Abstracts and author Person entities are not imported in A.

Provider references can yield proposed `cites` edges when identifiers are explicit. Do not infer a complete bibliography from incomplete metadata. `cited-by` is an inverse view of accepted `cites` edges; a provider citation count is not a set of known citing Works. Avoid fetching the referenced graph during paste.

## 6. Wikipedia and Wikidata experience

Resolve article redirects and language/site identity through MediaWiki. Capture a specific revision and retrieve that revision's content, rather than combining a revision number with independently fetched latest HTML. Preserve page ID, language, title at capture, revision ID, attribution and retrieval date. Use a page's declared Wikidata identity where available; the [page-properties API](https://www.mediawiki.org/wiki/API:Pageprops) and [revision API](https://www.mediawiki.org/wiki/API:Revisions) provide the relevant interfaces.

WebArticleBlock retains authoritative captured source and a sanitized readable projection using existing semantic HTML conversion and source-preview infrastructure. No scripts, remote styles, frames, automatic images or active forms enter the reader. Explicit conversion to editable native Blocks creates a derivative linked to the snapshot; it does not rewrite the captured article. Article identity is `(wiki site, page ID)`, while the described subject can have an accepted Wikidata key. Language editions remain distinct articles.

Wikidata enrichment starts from one selected QID. Fetch labels, descriptions, selected-language aliases and a bounded selected property set. Preserve statement IDs, rank, value types, qualifiers, references and revision; do not use a simplified truthy projection when those details matter. Wikidata describes full entity access and simplified representations in its [data access documentation](https://www.wikidata.org/wiki/Wikidata:Data_access).

Display candidate assertions as source-imported/unreviewed until selected. Acceptance creates source-aware records without overwriting user-authored assertions. Record origin separately from review status: authored/imported/inferred is not the same field as unreviewed/accepted/rejected. Store provider confidence only if actually supplied; do not invent numeric confidence. Preserve contradictions, unknown/no-value states and deprecated ranks explicitly.

Reuse Claim, participants and qualifiers where they express the imported assertion faithfully. Add explicit source-snapshot provenance rather than forcing remote statement evidence into `ClaimEvidence`'s required text coordinates. Unsupported statement semantics remain in the inert snapshot with diagnostics. External authority IDs are proposed crosswalks until accepted; `sameAs` requires an identity decision, not string similarity. Relationships such as `describes`, `authoredBy` and `publishedIn` carry their source statement/snapshot and retrieval provenance.

## 7. IIIF viewing and annotation

Start with Presentation v3 manifests and Image API services. Validate structure after explicit acquisition; a filename ending in `.json` is not proof of IIIF. A registered institutional adapter may discover advertised manifests from one bounded page. Multiple candidates require selection. Do not crawl institutional sites or dereference JSON-LD contexts.

IIIFManifestBlock owns canvas navigation and shared viewer state; IIIFImageBlock handles one image/service. Prefer a maintained deep-zoom viewer behind a small SolidJS adapter over implementing a tile engine. Select and qualify that dependency during Milestone C. Parse only supported painting structures, diagnose unsupported video/audio/multi-body compositions, and honor advertised image sizes/tiles rather than assuming arbitrary region requests. Preserve canvas identity/order, labels, metadata, rights and required attribution. These concepts come from the [Presentation v3](https://iiif.io/api/presentation/3.0/) and [Image v3](https://iiif.io/api/image/3.0/) specifications.

Viewer activation authorizes a bounded set of declared tile origins, displayed before first access. Additional origins require approval. Generate tile requests from validated service descriptors and numeric regions; use a scoped protected host route, never a general URL proxy. Tile bytes are evictable cache data unless explicitly retained. A captured manifest alone does not guarantee offline access to all canvases. Offline UI must distinguish retained imagery, cached tiles and unavailable remote regions.

Persist each spatial annotation with an independent annotation GUID and an anchor of this shape:

```ts
type CanvasRegionAnchor = {
  version: 1;
  manifestId: string;
  canvasId: string;
  snapshotId: string;
  kind: 'iiif-canvas';
  coordinateVersion: 1;
  canvasWidth: number;
  canvasHeight: number;
  region: { x: number; y: number; width: number; height: number };
};
```

Validate finite coordinates and positive bounded extents. Screen zoom, pan, rotation and image-service pixel dimensions are transforms, not anchor coordinates. A changed canvas geometry cannot silently rebase an old annotation. Reopening uses its pinned snapshot; refresh offers a comparison and explicit migration where necessary.

External annotation pages are untrusted input, fetched only within the chosen scope. Initially support supplied OCR/text and simple rectangular regions; preserve unsupported selectors inertly. Map OCR text to native standoff ranges only through a retained source-to-text alignment. User-requested OCR, complex selectors, IIIF v2 conversion and [Content Search](https://iiif.io/api/search/2.0/) are subsequent work, not prerequisites for the v3 MVP.

Rendering lifecycles follow the existing annotation/effect architecture: a SolidJS-owned viewer releases subscriptions, requests, canvases and renderer contributions on unmount. Deleting one annotation removes only its owned effects. No per-character instances, editor cell scans or geometry sweeps are needed for tile navigation.

## 8. PDF integration

Use PDF.js behind a dedicated managed PDF Block. It supplies browser PDF rendering and a worker architecture; integrate its rendering and text-layer interfaces rather than introducing another document parser. See [PDF.js getting started](https://mozilla.github.io/pdf.js/getting_started/) and the [API](https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib.html).

Extend managed-asset validation explicitly for PDFs, retaining original bytes and hash. Validate byte/page/resource budgets and parser outcomes; a `%PDF` prefix alone is insufficient. Run inspection with cancellation and limits; handle encrypted or malformed files with an explicit unavailable state. Render visible pages with a small overscan window, cancel offscreen work and cap canvas memory. Keep scripts, embedded actions and attachment execution disabled; external navigation remains deliberate.

Store original URL, final acquisition URL, asset reference, snapshot identity and resource identity. Associate a Work through an explicitly reviewed Claim; it remains absent until review. A DOI full-text candidate is only a link until the user chooses acquisition; neither DOI registration nor a PDF URL establishes access rights. Page regions use a versioned PDF coordinate anchor keyed to the original hash and page index. Text selection is viewer state; importing selected text into native Ink is an explicit history operation with provenance.

Do not convert the original into images for storage. Future thumbnails and extracted text are versioned derived resources. Existing legacy PDF iframes remain readable; migration into managed originals is explicit.

## 9. Bounds and typing isolation

The metadata limits below are implemented in A. B/C execution sections record their delivered limits; the PDF row records D's implemented bound rather than a total browser-memory guarantee.

| Work | Initial bound |
| --- | --- |
| Metadata acquisition | One active academic job and at most 16 accepted in-flight jobs per service instance; 15-second network deadlines; 60-second active workflow deadline and existing 30-second worker deadline. No automatic provider retries in A: inspect/resume is explicit. Independent host instances do not share a rate limiter. |
| Source bodies | A: streamed 2 MiB JSON cap, JSON content-type validation, UTF-8/identity checks and bounded worker normalization. No separate JSON nesting-count validator. Later article/IIIF admission needs its own structural budgets (proposed 2 MiB articles / 8 MiB manifests). |
| Record projection | A: 200 creators, 20 license links, 20 full-text candidates, bounded strings and 24 KiB normalized metadata budget before canonical dispatch. Larger canonical projections fail with a diagnostic. Later proposals: 200 aliases, 50 selected Wikidata statements per review page, 1,000 canvases per manifest. |
| IIIF viewport | Four active tile requests, 128 MiB decoded-image budget, current canvas plus bounded neighboring metadata. No whole-manifest prefetch. |
| PDF | 50 MiB original, 1,000 pages, one mounted page/canvas with at most 16 megapixels, 20,000 text items / 200,000 text characters per page, 500 spatial annotations per occurrence. No measured hard total browser-memory ceiling. Acquisition/inspection failures do not insert a managed Block. |
| Canonical commits | Stay within existing request/event limits; chunk explicitly with durable receipts. No unrestricted graph traversal or query language. |

Future multi-Vault/viewport implementation must enforce aggregate host budgets. Separate interactive viewport requests from durable imports without allowing either to starve editor work. Use scoped queues and bounded retry for storage backpressure; do not send a burst of tile reads through the current PNG/JPEG asset endpoint.

Recognizers perform bounded string parsing only. Ordinary typing must cause zero academic network requests, canonical mutations, snapshots, document scans or backlink rebuilds. Lazy-load PDF/deep-zoom libraries on view activation. Schedule view transforms per animation frame using cached viewport geometry; never scan editor character cells. Canonical/reference events refresh only affected views. Background work is cancellable and does not acquire a document-edit lock while waiting for the network.

## 10. Refresh, export and reconstruction

Refresh retrieves a new snapshot and compares normalized fields and provider versions. Keep the previous capture and annotations. Present changed fields, removed statements and changed canvas dimensions; accepting an update is an explicit canonical action and changing a Block's pinned snapshot is a document history action. Retrieval timestamps belong to capture envelopes, not deduplication hashes of normalized content.

Rebuild proof has two distinct parts. First, clear and rebuild derived document facts from saved Ink while retaining canonical knowledge; the same citation/subject references and backlinks must return. Second, export the explicitly selected canonical slice and referenced snapshot assets, reconstruct it in an isolated database/Vault, and rehydrate the Blocks offline. Native documents alone are not a backup of the canonical knowledge database.

Extend package extraction only for the new records and explicit closure. Record unresolved references and omitted bodies; never import archived claims automatically into the active canonical graph. Existing unsupported-type preservation remains the fallback for older readers. This is necessary compatibility for the new Blocks, not a Phase 4 interchange redesign. Publishing stays on its existing explicit disclosure model: imported abstracts, claims, URLs and snapshots do not become public merely because they are attached to a published document.

A implemented derived-index rebuilding and bounded Entity → ExternalIdentity → SourceSnapshot extraction. D extends the image-only package profile with `mutable-inkpkg-resources-v1`, preserving PDF and scholarly JSON originals, bounded IIIF child snapshots and retained tile originals. The legacy profile remains readable. PackageData retains exact logical canonical rows; importing never installs them into active canonical knowledge. Explicit local restoration reuses retained originals and does not grant network permission. Missing originals and partial IIIF retention are reported; required native assets must be available to export. See the D qualification report for bounds and the independent SQLite reconstruction proof.

## 11. Milestones and qualification

### A — Scholarly identities

Implement the feature flag and DOI dispatch, Crossref/DataCite adapters, protected JSON acquisition, canonical external identity transaction, immutable snapshots, CitationBlock, CSL JSON export and explicit Block-reference facts/backlinks. Add the minimal ledger/package/schema support required to preserve those identities. Qualify duplicate and concurrent DOI paste, percent-encoding/case handling, two document occurrences, canonical retry after interrupted commit, offline reopening, cancellation/stale destination, one-step document Undo/Redo and manual saving. Include upgrade/restart and existing clipboard regressions.

### B — Encyclopaedic entities

Implement Wikipedia page/revision extraction and readable WebArticleBlock, QID subject linking, bounded Wikidata retrieval and claim review with source provenance. Qualify redirect/language cases, revision races, unsafe HTML, contradictory authored/imported assertions, absent QIDs, unsupported value types, rejected claims, snapshot refresh and offline display. Add source provenance schema support only as required by these cases.

### C — Digitised objects

Before implementing spatial annotations, review the common ResourceAnchor direction below against the actual standoff and index contracts.

Implement Presentation v3/Image API viewing, canvas navigation, bounded tile acquisition/cache, spatial annotations and exact reopening. Qualify coordinate transforms, canvas changes, missing tiles, multiple origins, oversized/malformed manifests, cancellation, two overlapping annotations and independent deletion. Test supplied OCR alignment separately. Follow with v2 compatibility as a distinct increment rather than claiming it in the v3 MVP.

### D — Cross-resource links and reconstruction

Implement managed PDF admission/viewing and the reviewed Work-to-PDF relationship, article-to-subject links and institutional-object relationships. Qualify derived-index rebuilding and isolated archival reconstruction with snapshot/original fidelity. Verify that source refresh cannot alter pinned annotations or accepted facts silently. Complete bounded citation relationship/export additions only with their own reliable-source and escaping tests; no recursive citation graph harvesting.

Every milestone reports unit/service tests, real browser scenarios, compatibility limits and matched typing measurements. Use provider fixtures for reproducibility and separate live smoke tests for service availability. Measure typing with loaders idle and with bounded background acquisition/rendering active; count forbidden work as well as latency. Do not claim Safari/Firefox or desktop-platform qualification without running them.

The brief's five acceptance scenarios map to A (one Work/two backlinks), B (revision/QID/reviewed facts), C (canvas/zoom/anchor), all milestones (unsupported safe fallback), and A–D (offline retained captures). Repeated reopening and undo must not fetch again. Failed acquisition must leave a recoverable diagnostic, not a silently missing Block.

## 12. Adjacent loaders and implementation scope

| Later adapter | Reuse and boundary |
| --- | --- |
| ORCID, arXiv, PubMed/PMC | Existing identity/snapshot/Work pipeline; preserve preprint versions and distinguish metadata from full text. |
| ISBN/Open Library | Work versus edition identities; do not merge editions by title. |
| BibTeX/RIS/CSL JSON | Bounded bibliography conversion into the same identities and CitationBlock views. |
| TEI, ALTO/PAGE XML | Source-preserving captures, explicit conversion loss and image/text alignment. |
| EAD | Archival hierarchy with explicit scope, without recursive network discovery. |
| Zenodo/Figshare | DataCite metadata can enter A; dataset/software binary acquisition needs later media policies. |
| OAI-PMH | Separate bulk-harvesting work with durable jobs and reviewable limits. |
| IIIF Content Search | Provider-backed viewer search, separate from the Vault knowledge index. |

Milestones A–C are accepted. Milestone D is authorised and is submitted for review in the [Milestone D qualification report](MUTABLE_ACADEMIC_RESOURCE_LOADERS_MILESTONE_D_QUALIFICATION.md). Stop for user acceptance after D qualification; AI ingestion, Phase 4 and desktop packaging remain outside this work.

## 13. Approved refinements and Milestone A boundary

Identity, external identifier, external resource, snapshot, representation and annotation remain distinct concepts, without requiring six tables. A DOI can identify software, a dataset, an instrument or another research object. Retain the provider type and map it conservatively through Entity.typename; never merge versions, editions or preprints by descriptive similarity.

Multiple Blocks may share a resource ID and snapshot ID while retaining independent Block identities. CitationBlock implements only the compact citation representation now. Facsimiles, readable views and editable derivatives may refer to the same capture later; no general representation-conversion framework is introduced.

The future ResourceAnchor direction is a discriminated union of text ranges, canvas regions, PDF page/text regions and temporal anchors, with room for later object/mesh coordinates. Annotation identity, owner, provenance, source version and teardown belong to the common envelope; resource-specific coordinates belong to the anchor. Existing standoff ranges remain authoritative for text editing and offset rebasing. The existing renderer ownership and disposal model should also govern future non-text annotations, without making a spatial region masquerade as a character range.

Current knowledge-index standoff segments and ClaimEvidence are text-oriented. Future spatial/temporal indexing needs explicit typed projections with source-version checks, not invented cell positions. Review this boundary before Milestone C. Milestone A adds no unused anchor implementation and does not replace standoff properties.

Milestone A qualification must distinguish automated fixtures, actual browser checks, live provider probes and untested scenarios. Include concurrent DOI deduplication, exact identifier preservation, interrupted canonical commits, offline reopening, stale destinations, cancellation, one-step Undo/Redo, typing isolation and derived-index rebuild. Preserve source snapshots and canonical identity through package extraction; preserve existing package behaviour and disclose compatibility limits.

## 14. Milestone B execution decisions

Wikipedia resource paste accepts language-site article URLs and explicit `oldid` URLs. Resolve redirects and page identity through the Action API, then parse that exact revision with `oldid`; verify returned page/revision identity. Retain both original API responses as immutable assets. Parser output is a capture at retrieval time: transcluded templates can evolve independently of the pinned article revision. Preserve the returned wikitext as part of the original response, without claiming historical template reconstruction.

Use separate accepted `wikipedia` (site/page ID) and `wikidata` (QID) identities. The article has its own canonical WikipediaArticle Entity/resource; its subject is a separate Entity, shared across language editions only through the accepted QID. Page-properties QID association is observed at capture time, not represented as a historically revisioned assertion. Missing QIDs leave the article without an invented subject. Never merge on names or titles.

WebArticleBlock retains an independent Block identity, a pinned capture descriptor and a sanitized offline display projection. Reuse the script-free source preview and semantic HTML converter. Explicit whole-Block conversion creates native editable text with per-Block source/snapshot provenance and exact Undo restoration; it does not rewrite captured source. No preview regeneration or acquisition occurs on ordinary typing.

Enrichment is a separate explicit action against one QID. Capture one bounded Wikidata entity response, retain its revision and original bytes, and offer at most 50 statements from a fixed useful property set (instance/subclass, occupation, citizenship, birth/death dates and places, inception, official website). No related-entity graph acquisition. Preserve rank, unknown/no-value states, qualifiers and references. Unsupported values remain inert in the capture with diagnostics.

Review is explicit per statement, with no preselected acceptance. Accepted statements create source-imported Claims and a subject participant through the existing canonical ledger/model. Resource-specific typed values, qualifiers and references live in versioned Claim attributes; do not invent Entity or text-range coordinates for scalar qualifiers. Review receipts bind snapshot and statement identity. Rejecting records a review decision without creating a Claim. Existing authored/imported facts remain untouched; conflicting statements coexist with their provenance and review status. A subsequent source revision requires a fresh review.

Reuse durable Cavern job storage, bounded host workers, protected acquisition and existing editor insertion/history. Keep the existing academic feature flag coherent across A/B. Extend canonical/package closure only as necessary for article captures and review provenance. The existing snapshot-JSON package-original limitation remains visible; no Milestone C/D or general interchange redesign is included.

### Implemented B contracts and compatibility

The typed operations are `encyclopedia.import`, `encyclopedia.enrich`, `encyclopedia.inspect`, `encyclopedia.resume` and `encyclopedia.review`. Import/enrichment use existing filesystem journals with an `encyclopedia` preparation discriminator; review uses the canonical transaction/outbox receipt and re-reads the retained snapshot before accepting a decision. The browser cannot submit its own statement body as canonical truth. Generic semantic/entity authoring cannot dispatch these internal ingestion operations.

Schema migration 0004 broadens ExternalIdentity's accepted namespaces to DOI, Wikipedia and Wikidata while preserving existing rows. SourceSnapshot gains a unique identity/revision capture key. SourceClaimReview records one immutable decision per snapshot/statement, with an optional Claim link. Existing Claim/ClaimParticipant records hold accepted assertions and their subject; versioned Claim attributes retain the source snapshot/resource/revision, original statement ID, rank, typed value, qualifiers/order and references. No text ClaimEvidence coordinates or related-object Entities are fabricated. These scalar/resource qualifiers are preserved data, not newly indexed ClaimQualifier Entity relationships. Re-reviewing a different decision requires later explicit review-maintenance work; B does not silently reverse an accepted/rejected decision.

The initial property set is P31, P279, P106, P27, P569, P570, P19, P20, P571 and P856. Review displays English labels with `mul` fallback, plus the original QID. It preserves full language metadata in original bytes but does not create canonical aliases or overwrite existing Entity labels. Supported value carriers are item IDs, strings/external IDs/URLs, time, quantity, monolingual text and explicit somevalue/novalue states. Unsupported carriers in a main value, qualifier or reference disable acceptance for that statement; they remain in the immutable original. Statements over 12,000 UTF-8 bytes are also deferred without truncating an accepted Claim.

One active encyclopedia operation and at most 16 accepted in-flight operations per service instance use the existing shared worker executor. Each response is capped at 2 MiB; article capture uses two responses, enrichment one. The active workflow deadline is 60 seconds, each network deadline 15 seconds, and worker deadline 30 seconds. Up to 50 statements are offered; existing subject-claim summaries are limited to 100 visible rows and 2,000 expression characters each. No automatic graph or media retrieval occurs. Aggregate cross-process/multi-Vault rate limiting remains future work.

WebArticleBlock uses the existing script-free iframe/CSP and bounded CSS sanitizer. Stored display text is sanitized again in a view-owned worker on reopening; this creates no history or document save. Native conversion reuses whole-source-Block conversion and records provenance on resulting Blocks. This is an editable derivative with native standoff coordinates, not a mapping back into Wikipedia wikitext, historical templates or a PDF/IIIF coordinate system. Internal article anchors are inert, external links are listed separately (up to 100), and images/media remain text placeholders. Very large/complex conversions can hit existing fragment limits and fail without replacing the article.

Reopening needs only saved display data. A deliberate new URL import or enrichment acquisition requests current provider data; existing Blocks remain pinned. A completed durable job can be replayed offline using retained originals. Wikipedia diff/edit/history views and non-main-namespace pages are outside B's article loader. Oldid captures pin the article revision, while current page-property association and template expansion limitations remain disclosed.

Package extraction follows reviewed Claim → review receipt → snapshot → accepted identity/entity closure. It preserves canonical rows without activating archived assertions. B shipped with original JSON binaries outside the image-only package profile; D's resource profile now supports this bounded original-byte closure. Neither milestone automatically publishes these Blocks.


### Bulk native conversion correction — 18 October 2026

Native article conversion, prepared Block-fragment insertion and Mutable text-fragment paste now publish a `record-batch`: one structural repository operation containing the changed content/placement tables. Source conversion replaces the source leaf directly, rather than inserting the derivative and then cloning and pruning the expanded document to remove the source. Ordinary typing, cut and other existing editing commands retain their existing command paths.

The repository applies and validates the batch atomically. Undo stores a single inverse batch; Redo reuses the same authored identities. Identity/ownership validation, changed-record notifications and full/compact history capture inspect a streaming record view without allocating a per-character operation array. Existing durable history and native file formats are unchanged: their exact record data remains necessary for reconstruction. This is not constant-time import—cell construction, validation, rendering and serialization still scale with content size. Cancellation/stale-destination checks remain before publication, and no document is saved automatically.

See the Douglas Adams regression section of the Milestone B qualification report for the reproduced failure, large-article browser exercise, record-count assertions and matched typing measurements. This correction does not authorise Milestone C.

## 15. Milestone C execution and ResourceAnchor decisions

Milestones A–C are accepted, including the bulk insertion correction and the user’s live Bodleian IIIF test. Milestone D is authorised under `MUTABLE_ACADEMIC_RESOURCE_LOADERS_MILESTONE_D_IMPLEMENTATION_PLAN.md`. AI-assisted ingestion remains unauthorised.

The existing `feature-api/anchors.ts` describes relationships between positioned Blocks; it is not a resource-coordinate annotation contract. Native text standoff properties and saved `StandoffProperty`/segment rows carry cell ranges. They remain authoritative and are not repurposed for images. Saved `BlockProperty` projection already preserves a scoped authored ID, complete attributes and its owning Block without fabricated text coordinates. C therefore stores independent `mutable/resource-annotation` Block properties containing a versioned `ResourceAnchor` and a plain-text note. Ownership follows the canonical containing Block; the derived knowledge index uses the existing saved BlockProperty path. No parallel annotation database or automatic per-view canonical writes are introduced.

The initial ResourceAnchor discriminator is `iiif-canvas` with manifest/image identity, canvas identity, pinned snapshot identity, coordinate version, canvas dimensions and a rectangular region. Future PDF/page, media/time and mesh-relative variants can share annotation identity, provenance and ownership while defining their own coordinate payloads. Native text need not migrate into this representation. OCR alignment would associate retained transcription spans and native ranges with canvas rectangles and a snapshot-specific alignment map; C does not run OCR or manufacture text ranges.

OpenSeadragon 6.1.1 provides the tile renderer, viewport transforms and independent overlays through a small SolidJS-owned adapter. Only an explicitly activated canvas gets a viewer. The host generates requests from validated Image API tile descriptors and numeric tile coordinates; client-supplied arbitrary tile URLs are not a capability. Explicit activation reviews declared origins. Manifest import never loads canvases, tiles, contexts or external annotation pages automatically. Unsupported painting compositions remain diagnosed in the immutable manifest.

Initial bounds: 8 MiB JSON input, 2,000 canvases, 32 nested JSON levels, 100,000 JSON nodes, one painting image/service per supported canvas, 128–512 pixel tiles, four concurrent tile requests per viewer with a host-wide bound, a 64-tile viewer cache target, a 32 MiB/128-entry compressed host cache, and at most four active grants per Vault service. Image information is captured separately for the selected canvas and pinned to the manifest snapshot. Retention copies up to 32 already acquired tiles per action, with a 256-tile cap per canvas snapshot, preserving original validated PNG/JPEG bytes. It does not fetch an overview or imply a retained full-resolution original. Full resolution is available offline only to the extent actually retained/cached; missing tiles remain unavailable without silent network fallback.

A viewer owns requests, decoded tile cache, overlays and DOM through Solid cleanup. The bounded shared host cache is device-local and may survive viewer closure; it is cleared when its Vault service closes. Transient pan/zoom/navigation do not write canonical document state. Annotation create/delete uses the existing command/history system; each overlay is keyed by annotation instance identity. Refresh requires an explicit new import/capture; existing Blocks and annotations remain pinned with no automatic geometry migration. Native document projection and bulk insertion remain unchanged. Progressive native rendering, off-main-thread validation and responsive scheduling of non-atomic work remain future performance options, not C scope.

Implementation sequence: bounded IIIF models/anchors and tests; protected host acquisition and immutable capture/jobs; native Blocks and viewer/annotation controls; automated, Chrome and separate live-provider qualification; final report and acceptance stop. Sources: [Presentation v3](https://iiif.io/api/presentation/3.0/), [Image v3](https://iiif.io/api/image/3.0/), [OpenSeadragon API](https://openseadragon.github.io/docs/OpenSeadragon.html).


### Milestone C delivered scope and qualification

The default-enabled `iiifResourceLoaders` flag gates recognition and the host operations. Command/Control-Shift-V recognizes `info.json`, conventional manifest URLs and `/presentation/v3/…` URLs. Native types are `mutable/iiif-manifest-block` and `mutable/iiif-image-block`. No institutional HTML crawler is introduced. Presentation v3 and advertised power-of-two Image API 2/3 tile grids are supported; equivalent v2/v3 advertisements of one service URI are accepted. Distinct image services, multi-image painting, external AnnotationPages, OCR ingestion and complex selectors remain inert in the original source with diagnostics. Standalone Image API resources use their image-service identity as the explicitly typed canvas identity.

`iiif.import/inspect/resume/read/open/tile/retain/close` are transport-independent, explicitly Vault-scoped operations. Import jobs checkpoint immutable originals and canonical receipts in existing durable storage. Source URLs, final JSON acquisition endpoints, original content-hash assets and independent representation IDs are retained. Tile grants are transient, capped at four per Vault and expire after 30 minutes; closing is allowed even while normal request slots are occupied. All remote acquisition uses public pinned DNS, credential-free HTTPS and same-origin redirects. Tile requests accept validated numeric coordinates, not arbitrary URLs. The Node build keeps the acquisition adapter and decoder worker at their correct host-relative locations.

Migration `0005-iiif.sql` adds the `iiif` external-identity namespace and a source-association index while retaining existing identities, snapshots and accepted/rejected Wikidata claim reviews. It creates no spatial annotation table. Spatial notes are manually saved native BlockProperties and are projected into the existing saved index. Rectangle selection currently uses visible-image bounds or accessible numeric controls; freehand/polygon tools are not included. Each overlap owns its own overlay and is independently undoable/removable.

A pinned manifest and image-info JSON do not make the remote pixel server immutable. Retained tile originals are immutable; unretained regions still depend on provider availability and unchanged source pixels. C did not claim a complete archival scan, automatic refresh/migration, or complete IIIF original-asset closure in `.inkpkg`. D adds bounded packaging of retained originals; unretained manuscript imagery remains unavailable offline. OCR and AI ingestion remain outside scope.

See [Milestone C qualification](MUTABLE_ACADEMIC_RESOURCE_LOADERS_MILESTONE_C_QUALIFICATION.md) for reproducible tests, actual Chrome exercises, live-provider results, memory bounds and typing measurements. C is accepted, including the user's additional live Bodleian manuscript test; its qualification report remains unchanged.

## Milestone D authorisation — 18 October 2026

Milestone C is accepted; its qualification report remains the historical record of measured results and limitations. The authorised D execution plan is [Milestone D implementation plan](MUTABLE_ACADEMIC_RESOURCE_LOADERS_MILESTONE_D_IMPLEMENTATION_PLAN.md). D must be submitted for acceptance after qualification, not described as accepted by the implementer.

## 16. Milestone D implemented contracts — 19 October 2026

The default-enabled `crossResourceLoaders` flag gates managed PDF acquisition, resource-original access, explicit resource relationship review and archival restoration. Existing feature defaults are unchanged. See [Milestone D qualification](MUTABLE_ACADEMIC_RESOURCE_LOADERS_MILESTONE_D_QUALIFICATION.md) for evidence and limitations. D is submitted for acceptance; A–C remain accepted.

### Managed PDF and native derivatives

`pdf.import`, `pdf.resume`, `pdf.inspect` and `pdf.read` are typed, Vault-scoped application-service operations. The Node host uses the existing protected remote acquisition, bounded preparation worker, immutable asset store, durable job journal and canonical transaction ledger. PDF admission requires parser inspection, not just a file signature. At most two service operations run concurrently, with a 60-second workflow deadline, existing 30-second worker deadline and 15-second acquisition deadline. Checkpointed originals survive a lost canonical acknowledgement and resume without another download. Neither import nor viewer activation saves the document automatically.

`pdf-sha256` is the canonical external identity of a retained original. Original bytes, source URL and final acquisition endpoint are preserved. Different URLs serving the same bytes share a resource identity while preserving capture provenance. Changed bytes at the same URL produce a different resource; existing occurrences and annotations remain pinned. No Work identity is inferred from a URL or title. Migration 0006 extends the accepted namespace while retaining earlier identities, snapshots and reviews.

`mutable/pdf-document-block` owns the occurrence. PDF.js 5.4.624 is pinned to the project's Node-compatible release; its worker, fonts, CMaps and WASM are served locally. A lazy, Solid-owned viewer renders one page at a time, with page navigation, zoom, scrolling and selectable text. This intentionally replaces the proposed overscan window with a stricter initial bound. Canvas allocation is bounded to 16 megapixels; that is not a hard total memory bound for PDF.js. No PDF scripts, forms, actions, links or attachments are activated.

The ResourceAnchor union adds `pdf-page`: snapshot, original hash, page index, unrotated view box and rectangle in PDF units. Native `mutable/resource-annotation` BlockProperties own individual notes and overlays. Deleting one annotation preserves overlapping annotations; document Undo restores it. Closing/unmounting cancels rendering and disposes the PDF task and local viewer.

Explicit page/selected-text extraction uses the existing fragment materializer and one native insertion history operation. The PdfTextBlock concept is represented by an ordinary standoff text Block with `metadata.role: 'PdfTextBlock'` and source alignment metadata: immutable extracted text, UTF-16 run offsets, PDF transforms, original asset, snapshot and page. Native annotations can then use ordinary text ranges. Subsequent edits do not automatically realign the immutable extraction or alter the original PDF. Image-only pages retain their original and expose an explicit no-text/OCR boundary; OCR is not implemented.

### Reviewed relationships and reconstruction

`resource.context` and `resource.review` reuse existing canonical Entities, Claims, participants and SourceClaimReview receipts. The explicit review UI supports `representationOf`, `describes`, `heldBy`, `depicts` and evidence-backed `cites` against an existing Entity. A review note is required. Canonical review is deliberately separate from document Undo; structural occurrence references and spatial annotations remain document-owned. No label-based merging, automatic fact replacement or graph acquisition occurs.

Saved index reconstruction projects occurrence/entity references and native annotation facts from saved Ink. It neither invents missing originals nor rebuilds canonical facts from incomplete document metadata. Independent SQLite reconstruction tests verify exact archived ExternalIdentity, SourceSnapshot, accepted Claim and review rows with relational constraints.

### Resource package closure

`mutable-inkpkg-resources-v1` extends the existing archive to validated PDF/JSON originals alongside PNG/JPEG. Limits are 128 originals / 56 MiB original bytes, 64 MiB ZIP and 96 MiB expanded package; existing PackageData and service input budgets still apply. IIIF child snapshot closure is bounded to 128. Retained originals are unchanged, deduplicated by hash and resolved through separate portable asset bindings. Source SQL rows retain their original values.

Imports remain opaque and inactive. **Restore retained resource locally** is a deliberate reinterpretation of a known Block, using isolated PackageData and retained originals. It restores independently validated spatial notes, keeps canonical references inert and prohibits remote acquisition, canonical mutation and online IIIF activation. Fresh occurrence identities and rebased bindings survive subsequent export/import. Legacy image packages remain supported; older readers can reject the new resource profile rather than silently lose its dependencies.

Package review and the passive standalone reader expose missing-original and partial-IIIF boundaries. Original rights and attribution data are retained; export review remains the user's redistribution decision. The standalone reader stays passive and does not embed PDF.js or OpenSeadragon. Interactive offline reconstruction occurs explicitly inside Mutable. No changes to publishing disclosure, Phase 4 activation or desktop packaging are included.
