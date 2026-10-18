# Academic Resource Loaders — Milestone C Qualification

Date: 18 October 2026. Status: implemented; submitted for acceptance. Milestones A/B remain accepted. No Milestone D or AI-assisted semantic ingestion work is included.

## Implementation and access

With the default-enabled `iiifResourceLoaders` flag, paste a manifest or `info.json` URL using **Command-Shift-V / Control-Shift-V**. Recognized routes include conventional `/manifest`, `/manifest.json`, `/iiif/…json` and `/presentation/v3/…` URLs. This captures metadata and inserts one IIIF Block through the existing MutableFragment/bulk insertion pipeline. It does not fetch every image. There is no institutional HTML crawler or general JSON-URL detector.

The Block shows attribution, rights, source information, diagnostics and a canvas selector. **Activate online viewer** explicitly authorizes the displayed image origin. **Open retained / cached tiles only** makes no remote request. The viewer supports pan, zoom and fit. **Spatial annotations** offers “Use visible region”, precise canvas-coordinate fields and a plain-text note. Notes can overlap and be deleted independently. **Retain cached tiles for offline viewing** retains up to 32 already acquired tiles per action; it does not download the entire image. Closing/cancelling destroys the viewer and revokes its grant.

Native types are `mutable/iiif-manifest-block` and `mutable/iiif-image-block`. Saved Blocks retain independent representation identities, the pasted URL, canonical resource/entity links and immutable source-snapshot references. The manifests and selected image-information responses are retained as their original JSON bytes in the existing managed-asset store. JSON captures also retain the final acquisition endpoint. Retained PNG/JPEG tiles preserve their original validated bytes and content hashes.

Supported: Presentation API v3; one embedded painting Image per canvas; Image API 2/3 information with advertised power-of-two tile scales; equivalent v2/v3 advertisements of one service URI; multiple canvases and independently reviewed image origins. Missing/unsupported compositions remain diagnosed and preserved in the original manifest.

## ResourceAnchor and ownership

The review found that `feature-api/anchors.ts` governs positioned Block relationships, while native standoff properties and their saved index use text/cell coordinates. Neither is repurposed for IIIF.

`src/iiif/resource-anchor.ts` defines an independently versioned `iiif-canvas` anchor: manifest/image identity, canvas identity, snapshot identity, coordinate version, canvas dimensions and a finite bounded rectangle. Each `mutable/resource-annotation` has its own ID, authored provenance and note. Its canonical containing Block supplies ownership. The existing saved BlockProperty projection preserves the complete anchor and scoped authored identity; no artificial text ranges or new annotation database are introduced.

Solid ownership disposes each annotation's own OpenSeadragon overlay. Updates replace that contribution; deletion cannot remove an overlapping annotation's contribution. Disposing the occurrence removes overlays, decoded imagery, event handlers and requests. Pan/zoom/resize transform the overlay without writing coordinates. Changing canvases filters by canvas/snapshot/dimensions. There is no automatic refresh or migration of existing anchors.

Future PDF/page, media/time and mesh variants can share identity, ownership, provenance and lifecycle while supplying their own typed coordinates. Native text standoff remains authoritative. Future OCR alignment should link retained transcription spans and native ranges to snapshot-specific spatial regions; no OCR acquisition/alignment service was implemented here.

## Service and persistence boundaries

`iiif.import`, `inspect`, `resume`, `read`, `open`, `tile`, `retain` and `close` are typed, transport-independent operations on an explicitly authorized Vault host. Import uses the existing durable job journal, operation leases and canonical receipts. A lost canonical acknowledgement can resume from retained bytes without reacquisition. Cancellation does not authorize insertion into a stale destination.

The existing protected acquisition path enforces public pinned DNS, HTTPS, no credentials/cookies, same-origin redirects, response byte limits and deadlines. The client supplies a grant and numeric tile coordinates, never an arbitrary tile URL. The host generates and validates requests against captured image information. Tiles are decoded in bounded disposable decoder processes before admission.

Migration **0005-iiif.sql** extends ExternalIdentity with the `iiif` namespace and adds a source-association index. It preserves existing DOI/Wikipedia/Wikidata identities, snapshots and claim reviews; foreign-key validation passes. Spatial notes remain ordinary saved BlockProperties. Older application versions that do not understand schema 5 must not open this Vault for writing.

Document insertion and each note edit use existing Undo/Redo. Navigation, tile loading, retention and viewer disposal do not create document history or save the document. Captured knowledge/assets persist independently of document Undo, as in A/B. Document saving remains explicit native JSON to the existing filename; no autosave or Markdown sidecar was added. Published asset originals retain the existing conservative no-GC policy.

## Automated qualification

Commands were run with serial Vitest workers; build and worker-dependent suites must run sequentially because Vite clears `dist` during a production build.

| Checks | Result |
|---|---|
| `npm run typecheck` | Passed |
| `npm run build` | Passed; existing large-chunk advisory remains |
| `src/iiif` + `server/application-services/iiif.test.ts` | 19 tests: structure/limits, service discovery, coordinates, original retention, deduplication, recovery, origin consent, offline reads, concurrent grants, cancellation, cache limits, migration and saved-index provenance |
| `server/native-document-store.test.mjs` under Vitest | 22 passed |
| `server/application-services/academic.test.ts`, `encyclopedia.test.ts`, `src/interchange/encyclopedia.test.ts`, `src/block-tree/large-import.test.ts` | 22 passed, including large bulk insertion with one operation/inverse and exact Undo/Redo |
| `src/rendering/mutable-clipboard.test.tsx`, `src/interchange/clipboard.test.ts`, `clipboard-images.test.ts` | 90 passed |
| `node --test server/asset-remote.test.mjs` | 15 passed, including IIIF MIME/size/origin/DNS boundaries and original PNG fidelity with a 513px rejection |
| `node --test server/managed-assets.test.mjs` | 13 passed: original validation, deduplication, leases, recovery, relocation, access boundaries |
| `node --test src/knowledge-sqlite/foundation.test.mjs` | 24 passed: migration version, locks, read-only access, recovery, corruption, backup/restore |

The foundation tests had two stale schema-2 expectations; these now assert schema 5. An initial native-store invocation used Node's runner instead of Vitest; the correct Vitest suite passes. An initial overlapping build/test run lost its generated worker when Vite cleared `dist`; the sequential rerun passes. These were qualification-harness issues, not ignored production failures.

The saved-projection test verifies two overlapping notes retain independent authored IDs and exact canvas anchors with no text coordinate or standoff segment. Deletion, Undo and Redo preserve the other note. A 140-tile cache exercise verifies the 32 MiB/128-entry compressed-cache bounds and cleanup. In-flight tile cancellation and cancelled-import publication are tested separately from already-aborted signals.

## Actual browser qualification

`scripts/check-iiif-browser.mjs` exercised **Google Chrome 155.0.8059.80, headless, macOS**, using the real Solid editor and OpenSeadragon 6.1.1 with deterministic service responses. It uses an isolated browser profile and does not save user documents.

Passed: trusted Command-Shift-V; 200-canvas navigation; no tiles before activation; actual decoded pixels on the canvas; a four-request maximum in the final run; correct approval of the second image origin; annotation creation and overlap; independent deletion and Undo/Redo; screen-position changes under zoom, real pointer-drag pan and resize with byte-identical saved coordinates; native serialization/reopening; offline-only activation; visible unavailable-tile errors; closing/unmounting removes grants, overlays and canvas elements. Normal typing, Backspace, Enter and Undo/Redo were exercised separately in the real-browser benchmark.

This is actual Chromium qualification with a deterministic transport. It is not a claim of interactive live-provider browser qualification. Safari, Firefox, Windows/Linux, touch/pen gestures and screen-reader use remain untested. Numeric fields, native controls and note lists provide keyboard access; a full accessibility audit was not performed.

## Separate live-provider checks

`scripts/check-iiif-live.mjs` uses the actual protected acquisition and preparation worker. It loads one selected canvas and one bounded tile per source.

| Source | Observed result |
|---|---|
| [IIIF cookbook book](https://iiif.io/api/cookbook/recipe/0009-book-1/manifest.json) | 5 canvases; selected image 3,204 × 4,613; decoded tile 401 × 512, 7,715 original bytes; approximately 3.0 seconds for manifest/info/tile |
| [Bodleian manuscript](https://iiif.bodleian.ox.ac.uk/iiif/manifest/eb45e6ee-395d-4da1-8337-d8bfdde72ae9.json) | 268 canvases; 386,170-byte manifest; selected image 5,224 × 3,317; decoded tile 164 × 104, 11,073 bytes; approximately 6.7 seconds. Equivalent ImageService2/3 advertisements were handled. |
| Wellcome `b30698327` | Captured as an unsupported video/Choice composition; no image service selected or player loaded |
| Wellcome `b19974760` | Rejected at the structural budget; no unbounded expansion |
| Wellcome `b18035742` | HTTP 404 reported explicitly |

`scripts/check-iiif-host.mjs` additionally used the **built production Node host**, real temporary Vault SQLite, real protected network acquisition and real immutable managed assets. The cookbook capture, selected canvas, tile retention and offline retrieval succeeded; retained bytes matched exactly (7,715 bytes), approximately 5.6 seconds. The temporary Vault was removed after orderly shutdown. This check also caught and qualified the necessary build boundary: the acquisition adapter remains separate from the service bundle so its disposable decoder resolves at the correct host-relative path.

Provider timings are observations, not latency guarantees. No active user Vault was modified by these probes.

## Performance and memory

A single current canvas is rendered. There are no per-character IIIF records, character-cell geometry reads, whole-document subscriptions, or network acquisition triggered by typing. OpenSeadragon is dynamically loaded on activation; ordinary Blocks only read their retained source on mounting.

Bounds: 8 MiB JSON; 100,000 nodes; depth 32; 2,000 canvases; 128–512px advertised/requested tiles; 2 MiB compressed bytes and 512 × 512 decoded pixels per tile; at most 64 tiles in the coarsest full-image grid; four concurrent requests per viewer; eight host requests; four active viewer grants; a 32 MiB/128-entry shared compressed LRU; 32 tiles per explicit retention action and 256 per canvas snapshot. JSON preparation uses the existing bounded worker executor. Viewer grants expire after 30 minutes and can be reactivated.

The viewer has a 64-tile cache target and a maximum 1,200 CSS-pixel width by 500px height. At 512² RGBA, 64 decoded tiles account for approximately 64 MiB before compositor surfaces, in-flight decodes and library/browser overhead. OpenSeadragon may retain currently visible tiles beyond its cache target; these are further constrained by the viewport and coarsest-grid bounds. **No hard process-RSS or exact 128 MiB browser-memory ceiling is claimed.** The host-cache bound is directly asserted; native decoder/GPU heap peaks were not profiled. The shared compressed cache can outlive a viewer but is bounded and cleared with its Vault service.

Matched browser benchmark: 250 paragraphs, 25,000 characters, 40 alternating insert/delete operations in a 100-character paragraph. Two repeated runs per mode, after warm-up, in mixed order and without concurrent builds/tests:

| Mode | Median handler ms (runs) | p95 handler ms (runs) |
|---|---|---|
| Flag off | 1.80 / 1.10 | 6.80 / 3.80 |
| Enabled, idle Block | 1.20 / 1.20 | 2.50 / 12.10 |
| Activated viewer | 1.30 / 1.20 | 3.80 / 5.00 |

All six runs: **zero IIIF calls during ordinary typing, zero repository snapshots, exact text restoration, unrelated cell DOM identity preserved**. An earlier active warm-up run had a 2.30ms median and 15.70ms p95; this did not recur consistently. These measurements do not demonstrate a repeatable typing regression, and handler timing is not guaranteed user-visible frame latency. The large native-document bulk-insertion regression also passes; no broad editor-performance refactor was undertaken.

Reproduce with `BENCHMARK_URL=http://localhost:3000/scripts/academic-browser-fixture.html BENCHMARK_IIIF=off|idle|active node scripts/benchmark-typing-browser.mjs` (choose one mode).

## Limitations and follow-ups

- Presentation v2 conversion, Collections, Ranges, multiple painting bodies, Choice, authentication, arbitrary scale grids, query-bearing Image API service IDs, direct non-tiled images, OCR/text alignment, complex shapes and IIIF Content Search are not implemented. Unsupported content remains in immutable originals with diagnostics; it is not silently guessed or crawled.
- Source manifests and image-info JSON are immutable captures, but an external image server can change pixel content at an unchanged URL. Retained tiles preserve exact acquired originals; unretained regions remain remote dependencies. This is not a guarantee of a complete immutable photographic scan.
- Offline reopening requires the local Vault service and retained originals. Only retained tiles survive a host restart; session-cached tiles may be evicted. Missing regions or resolutions stay unavailable without silent remote fallback. There is no whole-manuscript download or automated retention/GC.
- The first accepted image-information capture is pinned to each manifest snapshot/canvas. No automatic geometry refresh or annotation migration exists. Re-import creates a new occurrence and reuses identical source captures; changed image-only resources can be imported separately for review.
- Rectangle authoring currently uses viewport bounds or numeric coordinates. There is no freehand drawing, polygon editor or spatial ClaimEvidence integration. Notes are indexed as saved BlockProperties, not text segments.
- The shared native clipboard/package allowlist still preserves unsupported IIIF interchange payloads inertly; this milestone does not broaden Phase 4 activation rules. Same-Vault native `.ink` save/reopen is qualified. Complete original-asset/snapshot closure in `.inkpkg` remains incomplete, as in A/B; do not promise standalone package/archive offline viewing.
- Canonical capture/retention is independent of document Undo. Existing irreversible Wikidata claim-review decisions, source-asset maintenance considerations, and large native-article conversion latency remain documented A/B limitations.
- Follow up on browser/OS compatibility, native memory profiling under several simultaneous viewers, provider coverage, and richer explicitly reviewed spatial/OCR tooling. None has been silently expanded into this milestone.

Stop here for Milestone C acceptance. Milestone D and AI-assisted ingestion remain unauthorized.
