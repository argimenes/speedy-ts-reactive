# Mutable Academic Resource Loaders Architecture and Implementation Plan

18 October 2026 · Proposed architecture · Exploration complete; production implementation not started.

The academic ingestion brief calls for DOI, Wikipedia/Wikidata and IIIF resources to become native, citable Mutable content, with PDF integration. Extend the existing explicit resource-paste operation and application services. Keep canonical identities, captured source versions and document representations separate, so repeated imports reuse knowledge without losing the provenance of each occurrence.

This plan resolves the brief's design questions and divides implementation into its four milestones. It preserves manual document saving, the SolidJS editor's interaction and history ownership, immutable original assets, and the accepted Vault/application-service boundaries. Phase 4, synchronization, archive mounting, desktop packaging and publishing enhancements are outside this work.

## 1. Recommended decisions

| Question | Recommendation |
| --- | --- |
| CitationBlock or ScholarlyWorkBlock? | A dedicated `CitationBlock` view of a canonical Work entity. Bibliographic identity belongs to the entity; each Block has its own identity, pinned source snapshot and display preferences. Avoid two competing scholarly Block types. |
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
| ExternalResource | Mutable GUID plus provider identity: DOI, wiki-site/page ID, QID or canonical IIIF URI. Records what was addressed or retrieved. Use a new name/table, separate from the derived SQLite `Resource`. |
| Entity | Existing canonical GUID for a Work, Person, Object or other subject. An article resource can describe a Person without becoming that Person. |
| ExternalIdentity | GUID record with namespace, normalized key, target entity, evidence and revision. Unique accepted `(namespace, key)` within a Vault. Conflicting mappings require review. Suggested crosswalks do not occupy this accepted identity index. |
| SourceSnapshot | Immutable capture ID, resource ID, original-byte asset hash, provider revision, retrieval timestamp, final URL, rights/attribution, adapter version and normalized projection hash. Distinct captures can share identical bytes. |
| Representation | Native Block with independent Block identity, resource/entity links, pinned snapshot and local presentation settings. May represent a citation, article, PDF or IIIF object. |
| Annotation | Existing text standoff instance or new spatial anchor instance, with its own identity and pinned representation/snapshot coordinates. |

Preserve `sourceUrl` on every Block, including the original DOI spelling or bare identifier. Keep normalized identifier, resolved endpoint and final URL in separate fields. Do not strip historical query parameters from provenance merely because they are irrelevant to lookup. Public exports must not automatically disclose source URLs or captured metadata.

For DOI equivalence, parse a recognized resolver URL or deliberately enabled bare DOI, decode URL encoding once and apply ASCII case folding to the identifier key. Preserve its original spelling; do not apply the entity-name NFKC normalization or remove potentially meaningful trailing punctuation. Reject ambiguous input with a correction affordance rather than guessing. DOI equivalence and URI encoding are described in the [DOI Handbook](https://www.doi.org/doi-handbook/DOI_Handbook_Final.pdf).

Milestone A adds ExternalResource, ExternalIdentity and SourceSnapshot through a versioned schema migration. Extend the canonical ledger's table/state allowlists, schema integrity checks, audit events and package extraction together. Store large source bodies in immutable assets; canonical rows retain bounded descriptors rather than provider JSON blobs. Current canonical requests are bounded at 32 KiB and 256 changed records, so large creator/claim batches require bounded separate operations and receipts.

Resolve-or-create Work and claim its accepted DOI key in one canonical transaction. Concurrent imports must converge through the unique key, with no orphan duplicate Work from a losing transaction. Retry with the same operation ID returns the prior outcome. Never merge on title or author similarity; preprints, versions, corrections and editions remain separate unless an explicit reviewed relationship establishes otherwise.

Canonical records and retained snapshots are portable Vault data. Jobs, locks, temporary grants, rate-limit state and evictable tile caches are device-local operational state. File paths are internal capabilities, never durable identities. A derived-index rebuild may clear document facts, FTS and backlinks; it must not delete canonical entities, source records or identity mappings.

## 4. Operation flow and recovery

The proposed service surface is small: `academic.prepare`, `academic.inspect`, `academic.commit`, `academic.cancel`, `academic.snapshot` and, later, `academic.refresh` and `academic.reviewClaims`. Inputs are bounded descriptors and operation IDs; outputs are normalized data, diagnostics and scoped references. Methods run through the existing authenticated service adapter. An opaque preparation handle is bound to a Vault, input digest, adapter version and permitted acquisition scope.

1. Recognize the input locally and capture the existing insertion bookmark. Display a transient loading affordance outside canonical document data.
2. Prepare through the host: consult accepted identity/snapshot records, acquire permitted metadata only when necessary, validate it and normalize in the bounded executor. Identical in-flight requests share acquisition, not cancellation ownership.
3. Show concise diagnostics or required decisions. Routine DOI metadata import need not introduce another confirmation dialog. Claim acceptance, identity conflicts and full-text retrieval remain separate choices.
4. Publish validated capture assets, then commit canonical records through the existing ledger. The journal records each publication and canonical receipt; this is not a fictitious transaction spanning filesystem, SQLite and browser history.
5. Revalidate the destination and create a fresh representation using MutableFragment, native materialization and the existing insertion/history path. The document becomes dirty; Command-S/Control-S saves normally.

Undo removes the inserted representation in one document operation. It does not erase a shared Work, source capture or published asset. Redo restores the same local insertion state without another provider request. Closing the document or cancelling before insertion must prevent a late insertion; if canonical publication already committed, report that retained outcome and allow a later deliberate insertion. Never automatically insert into a recovered browser caret after restart.

Use the existing filesystem job primitives with a new academic job discriminator and bounded checkpoints: prepared, captures-published, canonical-committed, available-for-insertion, cancelled/failed. Resolve ambiguous canonical outcomes through ledger receipts before retrying. Interrupted jobs resume only after fresh Vault authorization and validation of staged hashes and provider/input descriptors. No academic journal belongs in IndexedDB or operational tables in the knowledge database. Retain published originals under the current conservative retention policy.

## 5. DOI and citation experience

Recognize DOI resolver URLs first. Fetch registration-agency information when needed, then use the appropriate Crossref or DataCite record endpoint. Prefer an existing local identity and pinned snapshot on repeat paste; Refresh is explicit. Known scholarly landing pages require a narrow adapter that extracts one declared DOI from a bounded page response. Multiple identifiers produce a choice, not a guessed Work. Unknown pages retain safe fallback behavior without probing them.

Crossref documents work and registration-agency lookup in its [REST API](https://www.crossref.org/documentation/retrieve-metadata/rest-api/). DataCite exposes public metadata retrieval through its [REST API](https://support.datacite.org/docs/api). Do not chase the DOI redirect to a publisher to discover metadata by default. Unsupported registration agencies produce a retained identifier and diagnostic, not an invented bibliographic record.

Normalize title, work type, creators and supplied ORCID identifiers, date components/precision, venue, publisher, DOI, landing link, available full-text candidates and license statements. Keep missing data absent. Treat abstract markup as untrusted; include an abstract only under the adapter's documented availability/reuse policy. Preserve the source of individual fields when combining providers. Do not create Person entities for every author merely to render a citation card.

CitationBlock displays the normalized metadata, provenance date, source link and offline/stale state. Store a small safe display projection in native data so the Block remains understandable if canonical lookup is unavailable. That projection is a view of a specific snapshot, not an independent authority that silently updates the Work.

Milestone A exports CSL JSON and provides one documented default citation format. Preserve ordering, name parts, dates and identifiers rather than reconstructing them from formatted strings. A general CSL style processor and BibTeX export follow as bounded citation work; qualify escaping and loss reporting before shipping them. OpenAlex is an optional later enrichment adapter, not a mandatory dependency for DOI insertion. Review its current access requirements when implementing it through the [official documentation](https://docs.openalex.org/).

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
  coordinateSpace: 'iiif-canvas';
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

Store original URL, final acquisition URL, asset reference, snapshot identity and the associated Work GUID. A DOI full-text candidate is only a link until the user chooses acquisition; neither DOI registration nor a PDF URL establishes access rights. Page regions use a versioned PDF coordinate anchor keyed to the original hash and page index. Text selection is viewer state; importing selected text into native Ink is an explicit history operation with provenance.

Do not convert the original into images for storage. Future thumbnails and extracted text are versioned derived resources. Existing legacy PDF iframes remain readable; migration into managed originals is explicit.

## 9. Bounds and typing isolation

These are proposed initial application limits, to be measured and adjusted during qualification rather than claimed as existing capabilities.

| Work | Initial bound |
| --- | --- |
| Metadata acquisition | Two concurrent acquisitions per Vault, one per provider; bounded queue of 16; 15-second request deadline; two transient retries within a 60-second preparation budget, respecting Retry-After. |
| Source bodies | 2 MiB metadata/article response; 8 MiB IIIF manifest; enforce streaming byte caps, JSON nesting/node caps and content-type checks before normalization. |
| Record projection | 200 creators, 200 aliases, 50 selected Wikidata statements per review page, 1,000 canvases per manifest. Report truncation or reject incomplete required structures. |
| IIIF viewport | Four active tile requests, 128 MiB decoded-image budget, current canvas plus bounded neighboring metadata. No whole-manifest prefetch. |
| PDF | 50 MiB original, 1,000 pages, 128 MiB viewer rendering budget; visible pages plus one page on either side. Oversized content remains a link with a diagnostic. |
| Canonical commits | Stay within existing request/event limits; chunk explicitly with durable receipts. No unrestricted graph traversal or query language. |

Enforce an aggregate host budget across future Vault instances. Separate interactive viewport requests from durable imports without allowing either to starve editor work. Use scoped queues and bounded retry for storage backpressure; do not send a burst of tile reads through the current PNG/JPEG asset endpoint.

Recognizers perform bounded string parsing only. Ordinary typing must cause zero academic network requests, canonical mutations, snapshots, document scans or backlink rebuilds. Lazy-load PDF/deep-zoom libraries on view activation. Schedule view transforms per animation frame using cached viewport geometry; never scan editor character cells. Canonical/reference events refresh only affected views. Background work is cancellable and does not acquire a document-edit lock while waiting for the network.

## 10. Refresh, export and reconstruction

Refresh retrieves a new snapshot and compares normalized fields and provider versions. Keep the previous capture and annotations. Present changed fields, removed statements and changed canvas dimensions; accepting an update is an explicit canonical action and changing a Block's pinned snapshot is a document history action. Retrieval timestamps belong to capture envelopes, not deduplication hashes of normalized content.

Rebuild proof has two distinct parts. First, clear and rebuild derived document facts from saved Ink while retaining canonical knowledge; the same citation/subject references and backlinks must return. Second, export the explicitly selected canonical slice and referenced snapshot assets, reconstruct it in an isolated database/Vault, and rehydrate the Blocks offline. Native documents alone are not a backup of the canonical knowledge database.

Extend package extraction only for the new records and explicit closure. Record unresolved references and omitted bodies; never import archived claims automatically into the active canonical graph. Existing unsupported-type preservation remains the fallback for older readers. This is necessary compatibility for the new Blocks, not a Phase 4 interchange redesign. Publishing stays on its existing explicit disclosure model: imported abstracts, claims, URLs and snapshots do not become public merely because they are attached to a published document.

## 11. Milestones and qualification

### A — Scholarly identities

Implement the feature flag and DOI dispatch, Crossref/DataCite adapters, protected JSON acquisition, canonical external identity transaction, immutable snapshots, CitationBlock, CSL JSON export and explicit Block-reference facts/backlinks. Add the minimal ledger/package/schema support required to preserve those identities. Qualify duplicate and concurrent DOI paste, percent-encoding/case handling, two document occurrences, canonical retry after interrupted commit, offline reopening, cancellation/stale destination, one-step document Undo/Redo and manual saving. Include upgrade/restart and existing clipboard regressions.

### B — Encyclopaedic entities

Implement Wikipedia page/revision extraction and readable WebArticleBlock, QID subject linking, bounded Wikidata retrieval and claim review with source provenance. Qualify redirect/language cases, revision races, unsafe HTML, contradictory authored/imported assertions, absent QIDs, unsupported value types, rejected claims, snapshot refresh and offline display. Add source provenance schema support only as required by these cases.

### C — Digitised objects

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

Proceed in A–D order, with qualification attached to each implementation increment. The immediate next increment is A; the remaining milestones are not required to prove DOI ingestion. The five design decisions in Section 1 are resolved recommendations for implementation review. This exploration introduces no production code, schema migration, dependency, network-triggering editor behavior or Vault-data changes.
