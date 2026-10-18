# Academic Resource Loaders — Milestone D qualification

19 October 2026. **Implemented and submitted for user acceptance.** Milestones A–C remain accepted, including the user's live Bodleian test. C's qualification report has not been altered. No AI ingestion, OCR service, Phase 4, publishing extension or desktop packaging is included.

## Delivered behaviour

The default-enabled `crossResourceLoaders` feature adds managed PDFs, explicit reviewed resource relationships, retained-resource reconstruction and `.inkpkg` original-asset closure. It reuses the existing application services, native Block model, immutable assets, canonical ledger, fragment insertion, history and manual save infrastructure.

**PDF acquisition and viewing.** Command/Control-Shift-V recognizes HTTPS PDF paths, retaining the supplied URL including its query. The existing resource inspection dialog offers **Import managed PDF original** for extensionless HTTPS URLs; citation full-text candidates can open that inspection flow. Protected acquisition checks public addresses, redirects, content type and byte limits. PDF.js validates the original in the bounded preparation worker before publication. Durable jobs checkpoint the retained original and resume after interruption without downloading it again.

Open **Open retained PDF** to view locally retained bytes. The viewer supports page navigation, zoom, scrolling, selectable text and independently owned spatial notes. Original hash, snapshot, page and PDF coordinates pin each note. **Extract page text as editable Ink** and **Extract selected text as editable Ink** create native standoff text derivatives with immutable extraction/run alignment metadata. Each insertion is one Undo operation. Ordinary native annotation remains available on those derivatives; the PDF original is unchanged. Image-only pages report that OCR is not included.

**Relationships.** Resource identity, source capture and document occurrence are distinct. Content-hash PDF identity deduplicates original resources, not document occurrences or asserted Work identities. An explicit review panel on PDF, article, citation and IIIF Blocks allows an existing Entity to be selected and a provenance-bearing relationship accepted as a Claim. Supported relations are representation-of, describes, held-by, depicts and explicitly evidenced cites. A note is mandatory. Existing facts and previous review decisions are preserved. This is canonical knowledge review, explicitly separate from document Undo. Archived resources cannot use this panel to mutate active knowledge.

**Reconstruction and export.** Packages include exact retained PDF, scholarly JSON and PNG/JPEG originals, bounded IIIF child snapshots and selected retained tiles. SourceSnapshot and related canonical rows stay logically faithful in PackageData. Imports allocate new occurrence and annotation identities, remain opaque, and never install archived claims into active knowledge. **Restore retained resource locally** restores supported viewers/notes using explicit local bindings with no remote permissions. Inactive resources can also be exported and imported again without losing their reconstruction envelope. Partial IIIF retention and missing source originals are exposed as boundaries, not described as complete offline manuscripts.

## Automated qualification

The targeted regression set comprises **172 Vitest tests across 16 files**. All have passing results. The initial combined run finished with 169 passes and three elapsed-time failures: two test timeouts and an expired IIIF viewer grant. That run stretched to 5,000 seconds around the paused session; individual affected tests reported 282–3,668 seconds. Without code changes or relaxed limits, rerunning both affected suites plus the package suites passed **27/27 in 24.21 seconds**. This is recorded as an interruption-sensitive run, not represented as one clean 172-test invocation.

Reproduction commands:

```sh
npx vitest run server/application-services/pdf.test.ts server/application-services/academic.test.ts server/application-services/encyclopedia.test.ts server/application-services/iiif.test.ts server/application-services/foundation.test.ts server/native-document-store.test.mjs src/interchange/clipboard.test.ts src/interchange/package/package.test.ts src/interchange/package/resources.test.ts src/iiif/model.test.ts src/iiif/persistence.test.ts src/rendering/uri-import.test.tsx src/rendering/document-interchange.test.tsx src/interchange/document-interchange.test.ts src/interchange/resource-url.test.ts src/interchange/uri.test.ts
node --test --test-concurrency=1 server/asset-remote.test.mjs server/managed-assets.test.mjs src/knowledge-sqlite/foundation.test.mjs src/knowledge-sqlite/package-data.test.mjs
npm run typecheck
npm run build
```

The Node group passed **59/59**. Final type checking and production client/server build passed. Build output retains existing chunk-size and mixed static/dynamic import warnings; no build-system cleanup was undertaken.

New and extended coverage includes:

- Valid text-bearing, image-only and multi-page PDFs; malformed, encrypted, oversized and over-page-limit rejection; bounded worker inspection.
- Exact original-byte retention; same-original resource deduplication; distinct source provenance; changed bytes at the same URL leave old snapshots and reviewed facts pinned.
- Lost canonical acknowledgement, checkpoint recovery, cancellation before mutation, unavailable originals and storage relocation without network reacquisition.
- Reviewed Work/PDF assertions with participants, source identity and immutable review receipts; no automatic merge or fact overwrite.
- Native saved-index clearing/rebuild with PDF occurrence and annotation facts preserved; independent SQL reconstruction of exact identities, snapshots, Claims and review rows with foreign-key checks.
- PDF/JSON package closure, byte hashes, passive imported types, fresh identities, profile compatibility, partial-asset diagnostics and repeated cross-Vault rebasing.
- Existing scholarly/Wikipedia/IIIF services, protected remote acquisition, asset leases/recovery, native persistence, clipboard bulk insertion and application-service boundaries.

## Real browser and provider qualification

Browser exercises used headless **Chrome 155.0.8059.80 on macOS**. Fixtures use deterministic transport unless stated otherwise; they exercise actual DOM, editor/history, PDF.js or OpenSeadragon, not mocked rendering.

| Probe | Result |
| --- | --- |
| `scripts/check-pdf-browser.mjs` | Trusted Command-Shift-V, one original acquisition, decoded PDF pixels, actual text selection, two-page navigation, one canvas, zoom-stable anchors, overlapping note deletion/Undo, full-page and selected-text native extraction, save/reopen without reacquisition, image-only OCR boundary and unmount cleanup passed. |
| `scripts/check-resource-package-browser.mjs` | Real Flint import into separate temporary Vaults with real SQLite/assets, two fresh imports, exact PDF/JSON/PNG original bytes, passive imported resources, explicit offline PDF and retained IIIF tile reconstruction, pinned note restoration, native save/reopen and Undo/Redo passed. 63,032-byte package; zero destination canonical mutations, external requests or browser errors. |
| `scripts/check-iiif-browser.mjs` | Existing 200-canvas OSD exercise passed: no tiles before activation, at most four concurrent requests, decoded pixels, overlap ownership, zoom/pan/resize, offline availability, native persistence/history and cleanup. |
| `scripts/check-ink-package-browser.mjs` | Existing package regression passed, including inactive foreign GUID collision, zero canonical writes, linked-source conflict/Undo, manual save, and the standalone `file://` reader with network disabled, blob worker, image decoding, typed Entity/Claim/Trait display and unsafe HTML inertness. 45,884-byte legacy package; zero external requests or browser errors. |

PDF and IIIF probes accept `BENCHMARK_URL` for a running development server. The package probes launch isolated temporary servers. Run them serially to avoid competing Vite dependency-cache invalidation.

`scripts/check-pdf-host.mjs` additionally exercised a **live public provider URL** through the built Node host, protected network path and real temporary SQLite:

`https://mozilla.github.io/pdf.js/web/compressed.tracemonkey-pldi-09.pdf`

It retained 1,016,315 exact bytes, inspected 14 pages and returned identical local original bytes in 3,033 ms. SHA-256: `3662ff519e485810520552bf301d8c3b2b917fd2f83303f4965d7abed367e113`. This is a live smoke test for one public fixture, not general provider or authenticated-download qualification. The explicit relationship UI is exercised by compilation/integration with existing entity selection; canonical review correctness is tested against real SQLite, but a separate end-to-end browser click-through of that new panel was not recorded.

## Typing and resource bounds

Matched `scripts/benchmark-typing-browser.mjs` runs used 250 paragraphs of 100 characters, 40 edits, and `BENCHMARK_PDF=off`, `idle` and `active`. The active run rendered/navigated the PDF during the benchmark.

| Mode | Median edit handler | p95 | Maximum |
| --- | ---: | ---: | ---: |
| Feature off | 2.40 ms | 5.60 ms | 29.70 ms |
| PDF idle | 2.00 ms | 3.30 ms | 27.00 ms |
| PDF active | 1.60 ms | 3.60 ms | 23.50 ms |

All runs recorded **zero PDF/IIIF service calls during typing, zero document snapshots, unchanged unrelated cells and correct restored text**. Insert, Backspace, Undo/Redo, Enter and split-Undo checks passed. These are individual matched headless runs, not a statistically demonstrated speedup or a user-visible latency guarantee. No ordinary typing hook was added for PDF acquisition, cell measurement, canonical review or index reconstruction.

Enforced admission/rendering bounds include 50 MiB PDF originals, 1,000 pages, one mounted page/canvas per occurrence, at most 16 megapixels per canvas, 20,000 text items / 200,000 text characters per page, 500 spatial annotations, two concurrent PDF service operations, 60-second workflow / 30-second worker / 15-second acquisition deadlines. Package bounds are 128 originals / 56 MiB bytes, 64 MiB ZIP and 96 MiB expanded; existing PackageData and service request limits also apply. Ordinary image admission remains 10 MiB. These limits are not a measured ceiling on PDF.js worker/font/parser or total browser memory.

## Limitations and departures

- PDF.js **5.4.624** is pinned because the inspected newer 6.x release requires a newer Node engine than the installed Node 22.12.0. Worker/support resources are local. No PDF.js advisory was reported by the performed audit; unrelated pre-existing audit findings were not changed.
- The proposed overscan window is initially **one page at a time**, preserving scroll/zoom/page navigation while bounding mounted work. No continuous multi-page layout, OCR, encrypted/password-protected PDFs, forms, scripting, attachment execution or complex spatial selectors are implemented.
- PdfTextBlock is a native text Block plus role/provenance metadata. PDF extraction order can differ from natural column order. Edited derivatives are not automatically realigned to their immutable source runs; no artificial native range is used for spatial evidence.
- HTTPS acquisition requires port 443, public addresses, same-origin redirects and PDF content type; cookies/authentication are not forwarded. Extensionless PDF URLs use explicit inspection. A separate local-file PDF picker is not added in this milestone; packaged originals are supported.
- Relationships require explicit existing-Entity selection and authored evidence. No automatic bibliography completion, CSL/BibTeX engine, graph harvesting or Work matching is added. Canonical review is not document Undo.
- Older readers may reject the new resource profile. Legacy image packages remain readable. The standalone offline reader stays passive; interactive PDF/IIIF restoration is available inside Mutable. Partial IIIF imagery remains partial, and export must not imply permission to redistribute retained source material.
- Missing required native originals prevent export; absent canonical-only originals are recorded as boundaries. Closure is bounded, including 128 IIIF child snapshots and existing 5,000-row / 8 MiB PackageData limits. Large combined inputs can reach application-service input limits before archive limits. There is no silent fetch or truncation to evade them.
- Archive reconstruction does not restore archived canonical records into the active Vault. Tests reconstruct the logical SQL slice in an isolated database. Retained originals are conserved; no asset garbage collection is introduced.
- Safari, Firefox, Windows and Linux have **not** been qualified. Existing cross-platform and asset-maintenance follow-ups remain.

## Acceptance gate

Milestone D is complete for review and is **not yet accepted**. Stop here for user acceptance. The existing A–C acceptance and all unrelated project scope boundaries remain in effect.
