# Phase 3.5 Stage C — implementation and qualification

Date: 2026-10-16. Scope: approved Stage C plus PackageDataBlock/archival reconstruction refinement. Stages D–E, Phase 3.6 and Phase 4 are not implemented. Existing `documentInterchange` remains the single default-on feature flag.

## Delivered behavior

The Flint application menu now exposes **Export archival Ink package**, **Import Ink package**, **Packaged database context**, **Download offline Ink Viewer**, **Export HTML/Markdown with assets**, and **Export standalone HTML**. Block menus distinguish **Embed source file** from **Link to source file**. Linked source Blocks expose **Reconnect / refresh source**. Native Open and manual Save retain their existing semantics.

An archive contains the native ownership/retention closure with source identities, original PNG/JPEG binaries, a read-only relational PackageDataBlock, original schema metadata, hashes, provenance and explicit boundaries. Export leaves the open document, dirty state, undo history and save destination unchanged. Copy import uses fresh identities, destination asset admission and one existing insertion transaction. It preserves frozen SQL rows outside reading order; it never reconciles or creates canonical Entity/Claim records. Foreign semantic references stay inert even when GUIDs match destination records. The imported context is available from the Document menu; interactive entity/claim reading is provided by the offline viewer.

PackageDataBlock is a raw logical slice, not EntitySnapshot or a new domain model. Full SQL values and JSON-text attributes remain exact. Direct Entity, Time and Claim references seed indexed extraction. Optional one-hop relationships, adjacent claims, evidence, actors and observed/recovered aliases require explicit selection. No recursive graph, backlink, unrelated-document or full-Cavern traversal occurs. The implementation report delivered before extraction identified the absent Trait table and unverifiable historical evidence sources; the architecture additionally records the missing entity-first DataPointDimension index and its explicit exclusion.

## Archive fidelity and safety

- Original IDs, table/column names, PK/FK values, DDL/constraints, column metadata, named indexes, SchemaInfo and schema/SQLite versions are retained.
- SQL storage values distinguish int64 decimal strings, binary64 real bits, verbatim TEXT, BLOB base64 and NULL. Unsupported text decoding rejects rather than replacing data.
- Native relations, linked definitions (including unused ones), point affinity, retained unplaced definitions and reference cycles survive the resource-to-fragment boundary. The imported Document declares normalized ownership so its auxiliary definitions survive insertion, save/reopen and undo.
- Native non-JSON authored values use the existing authored-value codec in an inactive carrier; supported Block presentation fields removed by the passive policy are retained as inactive evidence. The archive itself remains unchanged native evidence.
- Imported objects use the existing passive policy before mounting. Active/unknown Blocks and foreign annotations cannot activate through a plugin matching their original type. Only typed local references are remapped.
- ZIP admission rejects path tricks, collisions, unsupported entries/extras, local/central disagreements, encryption/ZIP64, unlisted members, role ambiguity, expansion bombs, CRC/hash/length mismatches and missing managed originals. Decompression counts actual output in bounded chunks. Image headers/dimensions/animation/trailing bytes are checked before viewer decoding; destination publication repeats existing complete PNG/JPEG validation.
- Immutable originals are read and hashed without conversion. Repeated import shares destination content hashes. Existing leases, cancellation, conservative retention and recovery remain in use.

The new direct dependency is pinned `fflate` 0.8.3, already present in the lockfile transitively. Its documented incremental inflation and ZIP writer are reused, with application-specific admission and actual-byte limits. No unrelated dependency upgrades or audit fixes were applied. Reference: [fflate source and streaming documentation](https://github.com/101arrowz/fflate).

## Offline viewer and local sources

The separate viewer bundles the existing native decoder, safe semantic projection, ZIP validation and a small in-memory row adapter. It has no editor, SQLite/WASM, graph, persistence client or network dependency. A worker validates and prepares each selected file; CSP blocks network acquisition and package scripts. Entity/Claim controls display actual record fields, related claims/roles and explicit missing/excluded boundaries. Typed Trait claims are shown as claims; no Trait schema is invented. Images use validated package data URLs. Workers and their object URLs are terminated/revoked on completion, cancellation, replacement and close; displayed content and record details are released on close.

Measured standalone viewer: **367,361 bytes HTML; 107,421 bytes gzip-compressed executable script**, below the 4 MiB / 1 MiB targets. Build regenerates `public/ink-viewer.html` before client build/dev; Vite copies it to production output. The viewer entry points are included in project typechecking.

Local source refresh is explicit file reselection, not a watcher. It confirms rebind, compares the accepted source and local hashes, shows bounded before/after snippets, and offers replace/separate/cancel when local edits conflict. The source text and accepted baseline change in one undo transaction. Identical source bytes preserve local edits; a newly selected basename can update the explicit binding metadata. No source file is overwritten, and no hash, acquisition, preview or refresh runs on ordinary typing.

## Qualification evidence

Commands and repeatable fixtures are in the repository:

```sh
npm run build:client
node scripts/build-sqlite-foundation.mjs
npm run build:server
npm run typecheck
npx vitest run src/interchange src/rendering/document-interchange.test.tsx src/rendering/source-block-view.test.tsx src/block-tree/definition-ownership.test.ts src/persistence/native-resource.test.ts src/runtime/managed-assets.test.ts
node --test src/knowledge-sqlite/package-data.test.mjs server/managed-assets.test.mjs
node scripts/check-ink-package-browser.mjs
```

The build order retains the existing workaround: client build clears `dist`, while a server test imports generated SQLite modules during TypeScript compilation. Building the SQLite foundation before `build:server` resolves that existing dependency; no build-system refactor was introduced.

- **130 Vitest checks** cover existing clipboard/interchange/source/rendering/native ownership behavior and new package round trips, inactive values, internal/foreign references, retained cycles, source no-work counters, SQL transport validation and hostile archives.
- **17 Node checks** (five PackageDataBlock tests and twelve existing managed-asset tests) pass. Database tests verify original big integer IDs, exact JSON text, optional privacy policies, no write-side changes, indexed query plans and query counts independent of unrelated rows, cancellation, direct Claim closure, real read-only worker access and over-budget fan-out rejection.
- **Independent reconstruction:** a separate test decoder reads serialized JSON, creates fresh temporary SQLite tables from reviewed fixture DDL, binds reconstructed values, compares every selected logical record against the source and checks foreign keys. It includes generic int64/REAL/BLOB/NULL transport checks. Neither application import nor viewer executes packaged SQL.
- Existing managed-asset tests cover complete PNG/JPEG decode, immutable original bytes, hash deduplication, leases, aborted/expired publication, recovery, scope boundaries and storage safety.
- **Real Chrome, separate temporary Caverns:** imports the same package twice, produces independent document IDs, retains exact source SQL context, re-admits originals with byte equality/deduplication, preserves undo/redo, and manually saves/reopens the auxiliary context. A destination Entity with the same GUID and a different name remains untouched; no canonical Claim is created. The fixture also checks local-source conflicts and exact undo.
- **Real Chrome, `file://`, networking disabled:** bundled blob worker and WebCrypto work; entities, direct claims, related typed Trait claims, point markers and original images render; missing records are explicit; hostile HTML remains inert; close clears the view. No external probe requests or uncaught browser errors were observed.

Two issues found during integration were corrected: whole-document insertion initially dropped retained ownership without Document self-membership, and source-refresh metadata needed to come from the canonical record rather than a Solid proxy. Both are now exercised through the browser path and manual save/reopen or undo checks.

## Matched typing measurements

Fixture: the real Flint Michelangelo letter, 499 characters in the measured paragraph, eight mounted paragraphs; 40 alternating input events. Same benchmark command and fixture, with only `BENCHMARK_DOCUMENT_INTERCHANGE` changed.

| Interchange | Synchronous median | Synchronous p95 | Snapshots | Save-status reads |
| --- | ---: | ---: | ---: | ---: |
| Disabled | 7.2 ms | 20.3 ms | 0 | 0 |
| Enabled | 6.2 ms | 9.3 ms | 0 | 0 |

Real character input and undo also passed. These noisy headless results show no deterioration in this matched comparison; they are not a claim that interchange accelerates typing or a guarantee of screen latency. A linked-source typing regression check separately confirms zero hashes, network calls or preview preparation and unchanged baseline metadata.

## Explicit limits and follow-ups

- Browser qualification is Chrome only. Existing Phase 1 browser compatibility limitations remain tracked separately; Safari/Firefox `file://` worker/CSP/crypto behavior is not claimed qualified.
- The offline presentation is semantic and passive. It does not reproduce arbitrary SVG effects, 3D widgets, all layout fidelity or executable HTML. Unsupported presentation and export boundaries are visible. Rich native authored values remain inactive evidence, not automatically restored custom renderer parameters.
- Actor rows, evidence and adjacent graph records are optional. Whole included rows still contain their original actor IDs and attributes. Historical evidence documents and arbitrary DataPoint/Dimension associations are not silently acquired. Source document metadata and original binary metadata are not redacted by an archival export.
- The original native envelope is preserved in the archive; safe copy import deliberately remaps identities and applies the passive policy. Existing native/fragment complexity and opaque-object limits remain supported limits. Known managed binaries must be present; legacy unmanaged descriptors can be retained only with explicit missing-binary warnings.
- The controlled ZIP profile intentionally excludes comments, data descriptors, ZIP64 and most extra fields. It is not a generic ZIP import utility. Exported packages use stored members to stay within expansion limits.
- Full application package context is a read-only inventory; it is not a live canonical Entity service or reconciliation UI. Reconciliation, graph merging and general data editing are outside this stage.
- Published assets remain conservatively retained. Existing maintenance/garbage-collection and full-Cavern relocation follow-ups are unchanged and were not reopened.

Stage C is ready for acceptance. No Stage D/E, Phase 3.6 or Phase 4 work has begun.
