# Phase 3.5 Stage E — Collection Interchange

Date: 2026-10-17. Stage E is implemented behind the existing default-on `documentInterchange` flag. Qualification uses temporary directories and Caverns; no user documents were imported, changed or saved. Stage E stops for acceptance. Phase 3.6 and Phase 4 remain outside scope.

## Access and operation contracts

Use the **Flint application menu → Import collection… / Export collection…**.

Import chooses a browser-authorized folder, inventories its files, allocates fresh document identities and paths, and reviews conversion diagnostics before writing. Choose **Convert to native Ink** or **Preserve Markdown / HTML source**, and keep-both, skip-colliding-documents or abort-on-collision. The default is keep-both using ` (2)`, ` (3)` suffixes. Destination paths are relative to the selected Vault; hidden/internal destinations are excluded. Source, destination directories, attachments, exclusions, outcomes and diagnostic counts are reviewable. **Download import report** includes paths, identities, hashes, diagnostics and any unacknowledged generation identifier.

**Import and Save collection** is a separate explicit action. It creates native `.ink` files through the existing native writer with an empty baseline and additional create-only collision guards. It never overwrites an external source, opens an external file for editing, creates Markdown sidecars or mounts the collection into the editor. Saved documents subsequently use ordinary native Open, editing/history and manual Command-S semantics. Refresh the Vault browser to display newly saved files.

This batch is **not one global Undo operation**. Cancellation stops further dispatches and retains completed saves. Outcomes distinguish completed, skipped, failed and pending; pending includes an unacknowledged save. Parse/asset failures can be skipped explicitly. **Review saved batch** reads the journal without source access; **Review resume** requires reselection of the original folder. **Abandon remaining import (keep saved files)** releases a reviewed journal only when no unacknowledged save remains. It never deletes documents or published assets.

Export reviews saved native documents within an explicitly named Vault directory and lets the user choose the set. **Prepare selected collection** generates a bounded ZIP; diagnostics are reviewed before **Download reviewed collection ZIP**. Unsaved editor changes are excluded. Export contains Markdown or source-format documents, required managed originals once, and `mutable-collection.json`. It rewrites links only against the chosen set, without crawling dependencies or generating a website/viewer/navigation/search interface.

## Implementation

The execution decisions are recorded in [Stage E execution plan](MUTABLE_PHASE_3_5_STAGE_E_EXECUTION_PLAN.md). The implementation reuses:

- The existing CommonMark/GFM-table parser, semantic HTML adapter, MutableFragment schema and materializer. A collection-only adapter handles wiki syntax on parsed text nodes; code, escapes and raw Markdown HTML are not rewritten by a second parser.
- Existing source Blocks, native snapshot codec and conflict-protected native publication/recovery. Batch creation is an operation-local resource capture and explicit filesystem save, not a new editor insertion mechanism or synthetic global history transaction.
- Cavern managed-asset validation, leases, staged publication, immutable original bytes and hash identities. Only supplied, inventoried PNG/JPEG references are admitted. No remote acquisition is requested, including for remote images in imported HTML/Markdown.
- Stage C resource serialization, semantic projection and strict ZIP machinery. The ZIP helper accepts a separate collection policy; `.inkpkg` defaults and admission limits remain unchanged.
- SolidJS signals and the existing application dialog/focus/cleanup infrastructure. Closing the view cancels its work. Collection code has no repository, caret, geometry, typing or autosave subscription.

### Named dialect: `mutable-markdown-vault-v1`

| Input | Behaviour |
| --- | --- |
| `.md`, `.markdown`, `.html`, `.htm`, `.txt` | Supported document inputs; shared semantic conversion. Source mode embeds authoritative Markdown/HTML; text uses native text. |
| Paragraphs, headings, formatting, lists, tables, ordinary links | Existing semantic parser policies; losses are diagnosed. |
| `[label](../folder/note.md)` | Exact inventoried relative path; percent-encoded filenames supported. |
| `[[path]]`, `[[path\|label]]` | Exact relative or Vault-root path, including extensionless document paths if unique. Conflicting relative/root or extension candidates are ambiguous. No basename/title search. `/path` explicitly chooses Vault root; `./` and `../` explicitly choose relative resolution. |
| `![[image.png]]`, `![alt](images/photo.jpg)` | Supplied PNG/JPEG descriptors resolve in place and become portable managed references after validation. |
| Missing/ambiguous/outside-root links; heading/block fragments | Retained unresolved with diagnostics. No target is guessed. |
| Transclusions, wiki embed parameters, plugin syntax, YAML metadata/aliases | Not activated. Unsupported wiki syntax remains literal; frontmatter source is also retained in provenance. |
| HTML/Markdown source mode | Exact decoded authoritative source is persisted in the source Block, with separate reconciliation metadata and attachment bindings. Existing isolated previews remain unchanged. |

Native document relationships use `codex/block-reference` and document identity metadata, including cyclic relationships allocated in the first pass. Export also handles references carried by shared annotation definitions. It does not invent Entity records. Source export rewrites only spellings/kinds that resolved during import: an ambiguous or newly edited reference cannot become active merely because another binding names a possible target. HTML source export adds a restrictive CSP. It is still a source export, not the Stage C offline viewer or a published site.

## Recovery and boundaries

A bounded IndexedDB journal stores the reviewed inventory/hashes, identities, paths, outcomes, diagnostic summary and at most one pending native generation. Journaling must succeed before dispatch. Exact bytes and generation IDs are retained across cancellation, connection loss, server publication interruption and failure to journal an acknowledgement. Resume retries the existing idempotent native writer, rather than generating another copy.

Resume validates the Cavern/Vault, reselected source hashes and completed destination hashes. Changed/missing completed destinations block resumption. Uncertain saves are recovered before other failed/pending documents. Pre-publication collisions can be reviewed again with fresh keep-both paths while retaining document identities. Server checks under the existing publication lock reject case/Unicode aliases and changed/occupied destinations; there is no overwrite mode. Browser Web Locks serialize cooperating tabs, and journal-version checks reject stale progress. Different browser origins still rely on the server's writer/conflict protections.

No operation is replayed on startup. If a journal is cleared or unavailable, automatic batch resumption is unavailable; existing native recovery remains authoritative. Clearing a journal is not a rollback. Published assets remain retained under the previously approved conservative policy. Interrupted operations may leave empty destination directories.

| Bound | Implemented limit |
| --- | --- |
| Import selection | 5,000 files, 1,000 text documents, 512 MiB total |
| Text/image admission | Existing 8 MiB / 200,000-scalar text bounds; 10 MiB per image; 20 referenced images / 40 MiB per document |
| Paths | Portable relative paths, maximum 240 characters; traversal, absolute/unsafe paths, case/NFC aliases and file/directory ambiguities rejected |
| Destination inventory | 5,000 entries / depth 32; no symlink traversal |
| Processing | One document and one asset operation at a time; cancellable worker preparation with existing 30-second worker deadline |
| Recovery journal | 24 MiB; at most one pending native generation, writer-limited to 20 MiB |
| Review/report diagnostics | Bounded 1,000-detail summary, 1,024 characters per displayed detail, with omission counts/notices and document diagnostic counts |
| Collection ZIP | 60 MiB content budget, 64 MiB archive, 96 MiB expanded policy, 5,001 members; larger exports require a smaller selection |

Directory access uses [`showDirectoryPicker`](https://developer.mozilla.org/en-US/docs/Web/API/Window/showDirectoryPicker) from a user action, with an explicit [`webkitdirectory` upload fallback](https://developer.mozilla.org/en-US/docs/Web/API/HTMLInputElement/webkitdirectory). Only browser-supplied File/Blob content is read; no source OS paths or directory handles are persisted and no server source-directory traversal is introduced. Hidden directories skipped by handle enumeration are listed separately. Collection operations require native document persistence. Batch saving requires IndexedDB and [Web Locks](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API); unavailable/refused storage or locking fails before publication.

## Qualification

The automated checks cover nested/cyclic links, duplicate names and extensionless ambiguity, missing targets, outside-root paths, case/NFC aliases (including parent directories), unsupported syntax, source fidelity, shared-definition references, filename/file-directory conflicts, source revalidation, feature-off behavior, journal refusal, cancellation, stale tabs/Caverns, explicit abandonment, lost acknowledgements and exact-generation recovery.

- **232 Vitest tests passed** across the broad regression suite, covering interchange, clipboard/editor integration, source Blocks, URI operations, definition ownership, native persistence, managed assets and the actual native HTTP writer. This includes collection conversion, batch and server tests; a subsequent **49-test focused run** also passed, including the newly diagnosed source-binding boundary (these runs overlap).
- **27 Node tests passed**, including exact PNG/JPEG original-byte validation/storage, deduplication, lease/publication recovery, remote-consent/security policy and independent package-data reconstruction regressions.
- `scripts/check-collection-interchange-browser.mjs` uses real Flint/SolidJS, Chrome 155 on macOS, the actual folder-upload control, preparation workers, HTTP native writer, managed assets and IndexedDB. It passes review-before-write, collision suffixes, independent saves without repository changes or sidecars, cyclic links, exact shared PNG export once, re-import and a page restart after loss of an acknowledged server save. There were zero external acquisition requests and zero application exceptions.
- Visual review of the actual collection dialog confirmed readable source/destination/outcome rows, accessible scrolling, existing dialog chrome and explicit review/save controls. Screenshot: `/tmp/stage-e-collection-review.png`.
- Production client/server builds and TypeScript qualification passed using `npm run build:client`, then `node scripts/build-sqlite-foundation.mjs`, `npm run build:server`, and `npm run typecheck`, in that order. The client retains its existing large-chunk warnings. A new worker code-splitting build failure was corrected by using a static source-export dependency; no build configuration changes were made.

### Batch and typing measurements

A browser fixture with four documents and one shared PNG took **552 ms to review** and **2,434 ms to save**. A separate **50-document** fixture (about 1,400 text characters each) took **6,150 ms to review** and **16,750 ms to save**. Instrumentation observed a maximum of **one active worker**, with zero workers remaining on completion. Sampled main-thread JS heap rose from **27.64 MB to a peak of 29.18 MB**. This excludes worker heaps, native allocations and server RSS; it is not an absolute process-memory claim. The admission ceilings are not maximum-scale throughput guarantees.

The existing real Flint Michelangelo-letter benchmark ran the same 40 alternating edits in a 499-character paragraph, eight paragraphs mounted, Normal caret mode and no Vault rows:

| `documentInterchange` | Synchronous median | Synchronous p95 | Snapshots | Save-status reads |
| --- | ---: | ---: | ---: | ---: |
| Disabled | 6.9 ms | 15.2 ms | 0 | 0 |
| Enabled | 7.2 ms | 12.1 ms | 0 | 0 |

Both restored original text and passed real character-input/Undo checks. These matched runs do not demonstrate a typing regression (median +4.3%, p95 lower); they are not a speed claim or guaranteed display latency. Headless frame timing remained variable. Raw results/profiles are in `/tmp/stage-e-typing-off` and `/tmp/stage-e-typing-on`; batch results are in `/tmp/stage-e-browser.log`.

## Limitations retained for acceptance

- This is a documented Markdown-vault subset, not full Obsidian plugin, frontmatter, alias/title-search, heading-anchor or transclusion compatibility. Unsupported files remain inventoried exclusions. Existing native Ink/package Open/Import commands retain their separate semantics; native `.ink` files are not reinterpreted as external Markdown.
- Empty source directories are not represented by directory-upload File lists. Document hierarchy is preserved; managed assets export to a deduplicated asset directory with rewritten references. Unreferenced attachments are not acquired.
- Source previews keep the existing isolation policy; collection bindings do not add a new live preview resolver. Source text editing does not automatically resolve newly authored links. Use **Export collection** for portable source-bound attachments: unchanged generic clipboard/source adapters do not reinterpret collection binding metadata. Single-document package/projection export now explicitly diagnoses this boundary rather than silently claiming those binaries are bundled. Source-format round trips cover single-source documents; mixed native/source documents use the existing semantic projection and can lose those bindings, with diagnostics. Plain text uses native text and its existing newline normalization.
- Semantic collection export can lose unsupported native annotations/layout, with diagnostics. It is not an archival replacement for `.inkpkg`. Source Markdown/HTML exports retain their current authoritative text, with supported link rewrites; HTML has the added CSP and should not be described as byte-identical source.
- Chrome/macOS folder upload, workers, IndexedDB and recovery were exercised. The OS directory-picker permission UI, revoked OS permissions, Safari/Firefox and Windows/Linux require manual/platform follow-up. Browser-authorized logical File paths are the source boundary; uploaded Files do not expose OS realpath/symlink metadata for independent inspection.
- Whole-Cavern relocation, clipboard browser compatibility, asset-storage maintenance and the focused manual YouTube/Vimeo playback check remain the previously accepted follow-ups. No iframe permissions or provider behavior were changed.

Stage E awaits acceptance. No Phase 3.6 or Phase 4 implementation has begun.
