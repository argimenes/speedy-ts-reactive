# Milestone E — Remaining Deterministic Academic Resource Handlers

19 October 2026. **Accepted by the user and closed.** The authoritative Milestone E brief governs this delivery. Milestones A–C and F retain their accepted status. This report does not change D's recorded acceptance boundary. TEI, AI ingestion, OCR generation, publishing extensions and desktop packaging are excluded.

## Access and operation boundaries

The default-enabled `deterministicAcademicResources` feature flag gates the new handlers. Existing feature defaults are unchanged.

- Use Command/Control–Shift–V or **Inspect / Import linked resource…** for an ORCID, arXiv, explicit `PMID:…`, `PMC…`, or valid ISBN identifier/official URL. Ordinary paste is unchanged. Review acquisition and then the returned source metadata before insertion.
- Use Flint **Import external files…**, insertion or file drop for `.bib`, `.bibtex`, `.ris`, `.alto`, `.page` and `.epub`. For `.xml`, explicitly choose **Academic bibliography / OCR / EPUB**; automatic XML source viewing from Milestone F remains unchanged.
- Recognised BibTeX/RIS text can also use Command/Control–Shift–V. Citation checkboxes and **Export selected BibTeX/RIS** export mapped records; original fields remain available separately.
- OCR pages and EPUB chapters offer **Extract as editable Ink**. Geometry/fragment selections support independent source notes. OCR association with an existing image/canvas requires inspection and confirmation of a whole-page scale mapping.
- **Review canonical identity** explicitly binds the source identifier to a selected existing entity or a reviewed new Person/BookEdition/ScholarlyWork. No affiliations, authors, works, DOI equivalences or Claims are accepted automatically. The resulting document reference is undoable; canonical review is a separate ledger mutation.
- Failed acquisition reports a `mutable-academic-job:UUID` token. Command/Control–Shift–V or the inspection action resumes it after confirmation, revalidating the current insertion destination. Checkpointed originals are reused without network acquisition. An operation interrupted before its original checkpoint may reacquire that source.

Native insertion/extraction uses MutableFragment and the existing bounded insertion/history path. Saving remains manual. Loader services have no typing, caret, selection or document-change subscriptions.

## Delivered scope

| Handler | Recognition/acquisition and metadata | Reading, extraction and annotation | Retention/export and qualification |
| --- | --- | --- | --- |
| ORCID | Check-digit iD/profile URL; public official JSON; names, bounded works/affiliations and record dates | Source record; explicitly reviewed Person identity, no source assertion acceptance | Exact JSON; native/package copy; live provider and browser review |
| arXiv | Modern/legacy/version identifiers; Atom metadata, authors, abstract, dates, categories, DOI/journal reference | Citation resource pinned to returned version; separately inspected provider PDF candidate | Exact Atom; selected bibliography export; fixture/version tests and live API |
| PMID | Explicit identifier/official URL; EFetch metadata, abstracts, authors, journal, dates, identifiers and rights | Citation resource; explicit inspection of supplied PMC identity | Exact XML; namespace tests and live API |
| PMCID | Separate identity; current official ID converter plus PubMed metadata; bounded PMC Cloud version metadata | Rights/version evidence and declared eligible PDF candidates through existing managed-PDF workflow | Exact independent responses; live metadata and protected PDF/parser smoke test |
| ISBN | ISBN-10/13 checksums; Open Library ISBN URL; title, contributors, publisher, dates and supplied edition/language fields | Edition/product resource; supplied Work/edition links are not merges or full-text promises | Exact JSON/raw fields; live API and checksum tests |
| BibTeX | Files and explicit clipboard; maintained parser handles braces, quoted strings, concatenation, macros and authors | Selectable citation entries; duplicates stay independent and diagnostic | Exact source, raw fields/keys; selected normalized BibTeX/RIS; round trips |
| RIS | Files and explicit clipboard; repeated authors/keywords, multiline fields, required record delimiters | Selectable citation entries; unknown tags remain source fields | Exact source; normalized selected export and round trips |
| ALTO/PAGE | Local or explicit protected HTTPS XML; dialect/namespace, page/region/line/word hierarchy, geometry, confidence, supported reading order | SVG line selection/notes; immutable run-aligned editable derivatives; explicit existing image/IIIF binding | Exact XML; saved annotation index, deletion/Undo, package rebind; real reference samples and browser |
| EPUB 2/3 | Local bounded ZIP; container, OPF metadata, spine, navigation, safe XHTML, PNG/JPEG originals and internal targets | Script-free chapter iframe; explicit retained-image loading; chapter/fragment notes; native text derivative | Exact ZIP; source path/fragment anchors; native/package copy; fixtures, browser and real IDPF sample |

The source capture, retained binary, resource identity, occurrence identity, editable derivative and reviewed canonical identity remain separate. Foreign package occurrences and annotation instances get new identities; source snapshot provenance stays pinned. Archived captures cannot invoke canonical review. Package admission regenerates the supported projection from its retained originals and rejects mismatches. Bound image originals and derivative source originals enter package closure and rebind across Vaults.

## Safety and bounds

- Official single-record endpoints; pinned public DNS, credential-free HTTPS, same-origin redirects, existing byte/deadline protections. No provider graph crawling or automatic linked image/PDF acquisition. All API starts are spaced by at least 3.1 seconds per Node process. NCBI requests include `tool=MutableOS`; deployments can supply `MUTABLE_RESOURCE_CONTACT` for the documented contact email parameter.
- Provider responses: 2 MiB each, bounded JSON depth/node counts, 200 creators and 50,000-character abstracts. ORCID presentation is limited to 100 works and 100 affiliation summaries; the complete admitted public response is retained.
- Bibliography: 2 MiB and 200 entries. Unsupported/unmapped fields remain in the original/raw field representation. Normalized export is deliberately not a verbatim source round trip.
- XML: 8 MiB, 100,000 elements, depth 64, 1,000,000 text units, 200 pages and 10,000 lines/page. DTD/entity declarations are rejected; narrow external PubMed and standard XHTML doctype declarations are removed without resolving them. No external entities, stylesheets or page images are fetched.
- EPUB: 32 MiB compressed, 64 MiB expanded, 1,000 members, ratio 100, 200 chapters, 200,000 characters/chapter, 100 PNG/JPEG images and 1,000 navigation entries. Existing image dimension/format bounds apply. No archive path is written to disk. Encryption/DRM, obfuscated fonts, scripts, event handlers, active frames/objects, external archive paths and scripted manifest items are rejected.
- Service queue: eight admissions, serial execution per service, 60-second operation deadline and the existing bounded preparation executor. Durable journals and originals are Vault-scoped; no IndexedDB journal or operational knowledge tables were added. SQL schema migration 7 only extends the accepted external-identity namespaces while preserving previous identities/snapshots/reviews.
- Existing fragment, upload, HTTP, native-file and `.inkpkg` budgets still apply. A source within its parser budget can still exceed the native projection/package budget; the import then fails explicitly rather than silently truncating it.

## Qualification evidence

The broad regression run covered 219 tests. Two failures were investigated separately: an encyclopedia timing timeout passed in isolation, and IIIF queue pressure exposed eager bibliography-parser initialization. Academic parsing and original validation now load on demand; the complete eight-test IIIF suite passed after rebuilding. After the final namespace/alignment corrections and lazy-loading changes, the targeted eight-file rerun passed **40 tests**, covering all new parsers, persistence, packages, source previews, durable E services and service feature isolation. Matched typing measurements are below.

Completed checks include:

- `src/academic/academic.test.ts`: identifier checksums/namespaces, exact arXiv version agreement, metadata mapping, BibTeX macros/duplicates and RIS repeated/multiline fields, bounded XML, reading order, geometry, EPUB2/3, same-chapter links, unsafe/encrypted archives, expansion limits and PMC rights/PDF candidates.
- `src/academic/persistence.test.ts`: file-to-fragment admission, cross-Vault original equality, fresh occurrence/annotation identities, disabled archival canonical review, projection tampering rejection, saved annotation index reconstruction, deletion/Undo and derivative asset closure.
- `server/application-services/deterministic.test.ts`: real bounded worker, real managed assets/journal and SQLite ledger; explicit idempotent review, no implicit Claims, existing-name preservation, cancellation, failed-worker resume without refetch, returned version pinning and operation-field authority.
- `server/asset-remote.test.mjs`: 17 tests passed, including the new fixed-provider/OCR admission checks. A narrowly scoped PMC public-bucket octet-stream exception is allowed for declared PDF paths, followed by the existing managed PDF parser; arbitrary binary URLs remain rejected.
- `npm run test:sqlite`: **97 passed**, including migration, canonical ledger, knowledge reconstruction and filesystem tests.

### Real browser

`scripts/check-deterministic-browser.mjs` passed in Chrome 155.0.8059.80 on macOS with an isolated temporary Vault and the built Node service host. It exercised trusted Command-Shift-V bibliography import, actual file selection/review, six local source Blocks, exact original-byte comparisons, EPUB2/3 viewing, retained embedded PNG rendering, EPUB chapter annotations, OCR SVG annotation, explicit retained-image binding, aligned native extraction, one-step Undo/Redo, manual native save, package re-import with fresh identities, and offline reading. Live ORCID acquisition and the real explicit canonical-review controls created one Person and no Claims. Presentation-only operations produced no repository revision. No browser exceptions or forbidden external resource requests were recorded; ordinary SQLite UI calls remained zero, while the explicitly approved review used the typed service ledger.

The final browser rerun also executed the production module worker and its lazy EPUB/parser chunks successfully. Its package artifact was 45,026 bytes. UI probes inspect state/DOM and service outcomes; they are not a blanket cross-browser or screen-reader certification.

### Matched typing qualification

`scripts/benchmark-flint-typing-browser.mjs` was run six times, in mixed order, without concurrent builds/tests. It used the Michelangelo letter fixture (eight paragraphs; the measured paragraph contained 499 characters), 40 alternating insert/delete inputs plus real Chrome character input and Undo. `BENCHMARK_DETERMINISTIC_ACADEMIC=false` disables the feature; `BENCHMARK_ACADEMIC_SOURCE=1` mounts an OCR source beside the native text.

| Configuration | Run 1 synchronous median / p95 | Run 2 synchronous median / p95 |
| --- | --- | --- |
| Feature disabled | 5.3 / 8.3 ms | 7.7 / 9.8 ms |
| Enabled, no academic source mounted | 7.3 / 9.7 ms | 6.9 / 9.3 ms |
| Enabled, OCR source mounted | 5.7 / 8.1 ms | 6.7 / 8.7 ms |

All six runs restored the text and recorded **zero application-service requests, zero worker starts, zero repository snapshots and zero document-status reads during the measured edits**. The real-character/Undo checks passed. Frame timing was variable (median 16.6–23.8 ms, with substantially higher tail samples); these instrumented headless observations are not a guaranteed user-visible latency. They show no consistent feature-on deterioration and no forbidden loader work on the typing path. Raw profiles/results are under `/tmp/mutable-e-typing-{off,on,source}-{1,2}`.

### Failed probes and corrections

Initial failures were retained in `/tmp/mutable-e-*` logs: missing SQL migration distribution, optional non-JSON parser fields at fragment admission, a reactive polygon passed to native structured cloning, object-key order during package comparison, same-chapter EPUB paths, and an unhandled harmless doctype in an EPUB navigation document. Each received a targeted fix and rerun. Cross-realm typed-array comparison and CDP serialization of Solid proxies were corrected in the test harness. The live PMC probe detected the retired endpoint, the new metadata URL scheme, and its binary content type; only fixed official metadata/PDF paths received narrowly scoped handling.

One broad test run overlapped Vite's cleanup of `dist` and produced missing-worker failures. That run was stopped and excluded as a qualification pass. Later runs used stable built workers. The first production build with lazy imports exposed Vite's default IIFE worker-output restriction; explicitly using module-worker output corrected it. Cold browser startup exceeded the earlier short harness wait; the bounded wait was extended. This does not relax a production acquisition or worker deadline.

### Live providers and external samples

All provider acquisition uses the protected importer, not an unrestricted browser fetch. Live results on 19 October 2026:

| Input | Observed result |
| --- | --- |
| ORCID `0000-0002-1825-0097` | Public Josiah Carberry record; 22,690 bytes |
| arXiv `2301.00001v1` | Version-pinned NFTrig metadata; 2,436 bytes |
| PMID `31452104` | Molegro Virtual Docker for Docking metadata; 6,081 bytes |
| PMCID `PMC3071534` | Converter plus PubMed XML; 377 + 43,290 bytes |
| ISBN `9780140328721` | Fantastic Mr Fox edition metadata; 4,149 bytes |
| PMCID `PMC10009416` | Cloud version metadata/CC BY evidence; declared 471,593-byte PDF acquired and parsed as ten pages |

The final `node scripts/check-deterministic-live.mjs` rerun passed all five API families through the built application-service host in an isolated temporary Vault, verifying retained-original SHA-256 identities and completed-job resume without changing snapshot identity. Observed end-to-end times were 2.4 s ORCID, 2.9 s arXiv, 4.2 s PMID, 13.2 s PMC (three retained responses), and 2.8 s ISBN. These are network smoke measurements, not service latency guarantees. Output is retained in `/tmp/mutable-e-live-built-final.log`.

PMC's former OA discovery API was retired in August 2026. The implementation uses the [current ID converter](https://pmc.ncbi.nlm.nih.gov/tools/id-converter-api/) and [documented public Cloud article/version metadata](https://pmc-oa-opendata.s3.amazonaws.com/README.txt), with at most three versions and no bucket inventory scan. It does not assume version 1 exists or that the highest version is preferable. Provider `s3://pmc-oa-opendata/…` references are translated only to that bucket's documented public HTTPS endpoint. This is provider acquisition, not Vault/S3 synchronization.

The [ALTO reference newspaper sample](https://github.com/altoxml/reference_samples/blob/master/v2/sbb/newspapers/27971740_1890-04-01_38_077_0_001.xml) (559,997 bytes) and [PRImA SimplePage sample](https://github.com/PRImA-Research-Lab/PAGE-XML/blob/master/documentation/example/SimplePage.xml) (3,804 bytes) parsed with explicit source-order diagnostics. The [IDPF Accessible EPUB 3 release](https://github.com/IDPF/epub3-samples/releases/download/20230704/accessible_epub_3.epub) parsed as 22 chapters, three images and 96 navigation entries. The IDPF Children's Literature sample declared active/remote manifest content and was rejected by this conservative importer. Downloaded third-party fixtures were tested in temporary files and are not redistributed in the repository.

## Dependencies and licensing

Pinned additions: `saxes@6.0.0` (ISC) for namespace-aware bounded XML and `@retorquere/bibtex-parser@12.1.9` (ISC) for BibTeX grammar and normalization. Existing fflate, parse5, semantic HTML conversion, image validation, PDF.js and IIIF infrastructure are reused. No EPUB execution runtime, second Markdown parser, new editor or UI framework was introduced. Vite's worker output is now `es`, matching the existing `type: 'module'` worker constructors and permitting lazy parser chunks; the separately bundled standalone viewer remains self-contained. The shared HTML preview renderer was separated from its Markdown adapter so HTML-only service validation does not load a DOM-dependent Markdown dependency.

`npm audit --json` reports 13 findings (1 low, 4 moderate, 2 high, 6 critical), affecting the existing Vite/Vitest, Solid/Seroval, node-static/minimist and related dependency trees. Neither added parser appears in the reported vulnerability set. No unrelated dependency upgrade or audit fix was applied. Academic parser initialization is deferred in both preparation and interchange workers, and bibliography export has a parser-free module. The production build and TypeScript checks pass. Existing chunk-size/dynamic-import notices remain visible.

## Explicit limitations

- Provider outages, throttling, private/absent fields and inaccessible originals fail honestly. There is no automatic fallback to a different identity/provider, retry storm or title-based entity merge. PMCID records without supported PMID metadata are currently rejected with a diagnostic. Truncated/more-than-three-version PMC discovery offers no guessed PDF.
- Normalized BibTeX/RIS exports cover mapped fields, not arbitrary macros, TeX commands, original formatting, all date precision or every vendor tag. Raw source and fields remain authoritative. This is not a bibliography editing/merging UI.
- OCR nested/custom reading-order schemes, non-text regions and glyph alternatives remain in the original; incomplete order is marked uncertain. Geometry remains in its original units. Image/canvas association supports explicit whole-page scaling only, not rotation, crop calibration or automatic alignment. Notes select source line polygons; no OCR generation is performed.
- EPUB support is a conservative reflowable XHTML subset. SVG-spine books, scripted/remote-content manifest items, encrypted/obfuscated resources, media overlays, arbitrary external entities and some legal but unsupported ZIP variants are rejected. Fonts/audio/video and author styles outside the established bounded policy are not activated. Navigation selects chapters and retains fragment identity; it does not promise scroll-to-fragment positioning or CFI/reflow-stable pixel anchors. Native extraction preserves chapter/page provenance, text and source-run offsets, including source lines spanning multiple native paragraphs; embedded EPUB pictures remain in the retained original rather than becoming new managed native images.
- Offline academic reading is qualified in Flint from retained/package sources. The standalone Stage C offline viewer has not gained dedicated academic viewers or canonical service access. No new publishing renderer was added.
- Browser qualification is Chromium on macOS. Safari/Firefox and Windows/Linux are not claimed. Prior clipboard/provider-playback and package compatibility follow-ups remain in their existing reports.

## Future maintenance and enhancement candidates

Recorded at closure; these items do not authorise additional implementation:

- Dependency maintenance: triage the qualification-time audit's 13 findings (1 low, 4 moderate, 2 high, 6 critical) in the existing dependency trees, with compatibility and regression checks before upgrades. Preserve the recorded audit evidence; neither new parser appeared in that reported vulnerability set.
- OCR enhancements: assess nested/custom reading order, non-text regions and glyph alternatives, richer spatial selection, and explicit rotation/crop calibration beyond whole-page scaling. Preserve original coordinates, uncertain-order diagnostics and immutable source/run alignment. OCR generation remains outside the authorised scope.
- EPUB enhancements: assess the documented unsupported safe archive/content variants, chapter-fragment navigation and tested reflow anchors, and native extraction of retained pictures. Preserve original bytes, source/derivative separation and the script-free, network-inert preview boundary; unsupported active or encrypted content is not implicitly authorised.

The detailed limitations above remain the accepted supported-subset boundary. Existing platform/browser and standalone-viewer limitations remain recorded, without new qualification claims.

## Acceptance and closure

The user accepted and closed Milestone E within the documented supported subsets. Preserve this qualification report and regression coverage, original-source fidelity, explicit canonical review boundaries and package reconstruction guarantees. Earlier milestone acceptance boundaries are unchanged.

No further implementation is authorised by this closure. Do not begin TEI XML, AI-assisted ingestion, OCR generation or any subsequent milestone without explicit user authorisation.
