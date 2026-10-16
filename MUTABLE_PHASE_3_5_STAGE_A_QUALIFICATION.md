# Mutable Phase 3.5 — Stage A qualification

Status: **Stage A implemented and qualified; awaiting acceptance.** Stage B has not begun. Stages B–D still need implementation authorization, Stage E needs its separate go/no-go decision, and Phases 3.6/4 remain outside this work.

## Delivered scope

The default-on `documentInterchange` flag controls the new file, conversion and projection commands. Existing clipboard flags and defaults are preserved. Flint uses its existing SolidJS shell, native persistence, MutableFragment adapters/materializer, insertion planner, command history and Cavern managed assets.

- **Flint menu → Import external files…**: HTML, explicit Markdown, literal TXT and PNG/JPEG. A normal multiple-file input supports explicit format choice. Each successful file creates an independent dirty Ink candidate with fresh identities, a basename title and suggested `.ink` filename. Failures are reported per file in supplied order. No original file is opened for writeback and no imported Document is automatically saved.
- **Open / Save native Ink…** retains native opening and manual saving. Native open preserves document identity and binding; import creates a copy. Embedding a source-preserving Block and linking an external source are not aliases for either operation and have not been implemented in A. Existing legacy server-side Markdown controls remain separate.
- **TextBlock menu → Insert file…** captures one contiguous text selection/caret. Multi-file insertion prepares and validates the complete ordered batch, then makes one command/history commit. It does not publish part of a failed batch.
- **External file drops** over a TextBlock show “Insert files after this Block” and insert at that explicit gap. Drops over the Library create new candidates. Live internal Block drags retain reorder ownership; mixed internal/file drops are rejected. An untrusted internal MIME marker cannot impersonate a live drag. Arbitrary pixel-to-character positioning is deliberately not inferred.
- **TextBlock menu → Convert to Mutable Ink → From Markdown / From HTML** interprets selected literal source through the existing semantic importers. Consumed source annotations are removed; unaffected sides and their identities are retained, with a fresh second occurrence when a spanning annotation splits. Attached/shared/structurally ambiguous source selections and inline objects reject safely. Undo/redo restores exact source and annotation state. A concise confirmation lists affected annotation types/counts and conversion losses.
- **Flint menu → Export as HTML / Markdown / Plain text…** downloads a semantic projection without editing, rebinding or marking the document saved. **TextBlock menu → Copy as → HTML / Markdown** writes semantic representations without a Mutable carrier. It uses the existing acknowledged async writer, with an unchanged-selection, time-bounded native-copy-event fallback when unavailable or denied.

## Implementation and operation boundaries

`src/interchange/formats.ts` defines the small built-in format/profile registry. File decoding, semantic conversion, diagnostics and export projection are data-only modules. `operations.worker.ts` prepares bounded explicit operations; it does not inspect DOM geometry. `runtime/document-interchange.ts` coordinates revision/session/view tickets, cancellation, concise confirmation, image consent and admission, and the existing insertion commands. No transaction remains open during parsing or acquisition.

Input limits remain 20 files/40 MiB total, 8 MiB per text source, 200,000 scalar positions and the existing fragment graph bounds. PNG/JPEG retain the accepted 10 MiB, full-decoding and dimension limits. UTF-8 decoding is strict, UTF-16 requires a BOM, and invalid binary/control content is rejected. TXT retains blank/final lines, tabs and trailing spaces; native conversion reports newline normalization. Import provenance records basename, format, original byte hash and text encoding/BOM. File extensions, MIME and image signatures are checked; unsupported or conflicting interpretations require explicit selection.

The managed asset owner is now the editor; `clipboard.assets` is a compatibility facade over that same service. File imports reuse the accepted stage/publish/lease/abort/recovery protocol. Published originals remain immutable and retained after cancellation or undo. No adjacent file lookup or URL acquisition is inferred from a pathname. Remote URLs require explicit per-URL consent; placeholders remain inert when consent is declined.

Export uses canonical selection/native-resource snapshots, not rendered DOM. HTML escapes authored text/attributes, segments overlapping marks, prevents nested anchors and emits a fixed semantic vocabulary. Equal-specificity link conflicts use source order. Markdown uses CommonMark/basic GFM tables, escaped delimiters and safe code fences; unsupported overlaps, complex tables, points and annotations report losses. Page/side content is flattened deterministically with diagnostics. Images export as alt-text placeholders; private API, filesystem and runtime blob URLs are never emitted.

## Qualification results

Executed on 2026-10-16:

| Check | Result |
| --- | --- |
| Targeted Vitest suites | 152 tests passed across interchange, rendered editor, clipboard, Flint lifecycle/compact shell and native persistence suites. |
| Managed-asset storage/remote security | 17 Node tests passed, including original-byte validation, deduplication, lease expiry, interrupted publication recovery and consent/network restrictions. |
| `node scripts/check-document-interchange-browser.mjs` | Passed in headless Chrome: actual Flint file input, new dirty tab, Command-S filename suggestion, explicit native save/source unchanged, worker conversion/undo/redo, acknowledged semantic OS copy, native-event Markdown fallback, owned gap drop, spoofed MIME and mixed-drag rejection, semantic export without a revision change, original image hash and native save/reopen, remote-consent cancellation. No uncaught errors or unconsented external requests. |
| `node scripts/check-mutable-clipboard-browser.mjs` | Passed in Chrome 155.0.8059.80: existing native copy/paste/cut, plain paste, stale worker cancellation, HTML/Markdown rendering, managed-image OS paste/undo/redo/native reload. No uncaught errors or external requests. |
| Production client/server build and TypeScript | Passed using the existing SQLite-generation prerequisite between client and server builds. Existing chunk-size and mixed static/dynamic-import warnings remain. |
| `git diff --check` | Passed. |

The test commands were:

```sh
npx vitest run src/rendering/document-interchange.test.tsx src/interchange/document-interchange.test.ts src/interchange/clipboard.test.ts src/interchange/html-import.test.ts src/interchange/markdown-import.test.ts src/interchange/clipboard-images.test.ts src/rendering/mutable-clipboard.test.tsx src/application/flint-lifecycle.test.tsx src/features/flint/compact-shell.test.tsx src/persistence/native-session.test.ts
node --test server/managed-assets.test.mjs server/asset-remote.test.mjs
node scripts/check-document-interchange-browser.mjs
node scripts/check-mutable-clipboard-browser.mjs
npm run build:client
node scripts/build-sqlite-foundation.mjs
npm run build:server
npm run typecheck
```

A new lifecycle test also cancels after image publication and verifies lease abort with **zero document commits**, respecting the conservative retention of already published originals. Other checks cover one-commit ordered insertion, invalid-batch atomicity, caret changes without edits, view closure, feature-off operation, clipboard-feature independence, exact spanning/point annotation undo, cross-paragraph conversion, and strict decoding/type detection.

### Typing responsiveness

The existing real Flint benchmark used the Michelangelo letter, 40 alternating edits, normal caret mode, identical configuration apart from `documentInterchange`. Each run also passed real Chrome character input and undo. All five runs recorded **zero document snapshots, zero save-status reads and restored text**. A bounded-work unit test found no snapshot or layout reads from 20 ordinary edits. New interchange operation modules did not appear in the typing CPU samples; the pre-existing annotation rebasing helper in `interchange/ranges.ts` did, as expected.

| Run order | Stage A | Synchronous median | Synchronous p95 |
| --- | --- | ---: | ---: |
| 1 | Disabled | 7.2 ms | 12.0 ms |
| 2 | Enabled | 6.7 ms | 32.3 ms |
| 3 | Enabled, repeat | 12.2 ms | 25.4 ms |
| 4 | Disabled, repeat | 6.3 ms | 10.8 ms |
| 5 | Enabled, confirmation | 5.7 ms | 11.4 ms |

The initially elevated enabled tails prompted repeat measurements. Results varied, including an enabled run with much more idle/GC time; the final enabled run was comparable to the disabled runs. These samples do not establish a consistent Stage A typing regression, and the bounded-work checks show no new per-keystroke preparation, snapshot or geometry work. They are not a guarantee of user-visible latency. All runs are disclosed rather than choosing only the fastest result.

Local timing JSON, CPU profiles and screenshots are in `/tmp/flint-interchange-off`, `/tmp/flint-interchange-on`, `/tmp/flint-interchange-on-repeat`, `/tmp/flint-interchange-off-repeat` and `/tmp/flint-interchange-on-confirm`. Reproduce with `BENCHMARK_DOCUMENT_INTERCHANGE=false` for the disabled comparison and `BENCHMARK_OUTPUT=<directory> node scripts/benchmark-flint-typing-browser.mjs`.

## Retained limitations and follow-up boundaries

- Browser end-to-end qualification is Chromium on this machine. The accepted Safari/Firefox and native-event OS-acknowledgement limitations remain tracked; an event write cannot prove OS clipboard acceptance. Explicit projection Copy provides a recoverable keyboard fallback and never cuts text.
- Native import snapshots and exports are bounded, explicit operations. Very large accepted imports still incur a final native insertion/validation cost; this work introduces no ordinary typing subscription or ongoing projection model.
- A exports image placeholders, not portable image bundles. Relative resources remain inert descriptors. Source-preserving Blocks, richer previews, packages and folder-vault import belong to later separately authorized stages.
- The existing conservative asset retention/maintenance policy and full-Cavern relocation follow-up remain unchanged.
- The repository's aggregate build currently compiles server tests against generated SQLite declarations after the client build clears `dist`. Qualification generates those declarations before the server build; this task does not refactor the build system.
