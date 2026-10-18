# Structured Resources — Milestone F qualification

19 October 2026. **Implemented; submitted for user acceptance.** This milestone supplies bounded, read-only code and data presentations. It is separate from academic Milestone E and does not authorize any subsequent milestone.

## Delivered behaviour and UI

The default-enabled `structuredResources` feature registers one native `mutable/structured-resource-block` with four presentations. Use Flint's existing external-file import/insert picker or file-drop workflow. JSON, YAML, CSV, TSV, the supported source extensions and `.mmd`/`.mermaid` dispatch automatically. The explicit **Read-only code / data / diagram** format also allows inert HTML, Markdown and other text source. Existing HTML/Markdown import defaults and native Ink opening semantics are unchanged.

Each Block has a filename, read-only label, presentation selector and **Copy source**. Structured presentations offer a **Source** toggle; source offers language override and wrapping. These controls, expansion state and table-header choice are local presentation state, not authored edits or history entries, and reset when the view is recreated.

- **Tree:** JSON and YAML mappings/arrays, scalar type labels and collapsed branches. Children mount on expansion, in batches of 100. Malformed or unsupported structures show an error with source still available.
- **Table:** CSV/TSV with optional first-row headers, scrolling and explicit batches of 100 rows. Quoted delimiters, escaped quotes, embedded newlines and BOMs are supported. Leading zeros, dates and formula-looking values remain literal strings.
- **Source:** selectable, read-only CodeMirror 6 with line numbers, language override, copy and optional wrap. JavaScript, TypeScript, Python, C#, Java, Go, C, C++, Rust and SQL are supported. Existing grammars also provide XML, HTML, CSS, Markdown and TOML source highlighting. JSONL/NDJSON, JSONC/JSON5 and INI receive source display, not additional semantic parsers.
- **Diagram:** Mermaid preview and faithful source, including qualified flowchart and sequence examples. Invalid or disallowed diagrams report an error without losing source.

## Integration, originals and ownership

Imports use the existing MutableFragment preparation, insertion planner, native document writer and history. A batch insertion is one Undo operation; Redo restores the Blocks. Import does not save the document: the usual dirty state and explicit save remain in force.

The original file is validated as text and retained through existing Vault-scoped immutable asset leases, staged publication and content-hash deduplication. Original bytes, including BOM and line endings, are preserved; decoded source and filename/encoding/hash metadata accompany the Block. Copy uses the decoded authored source, preserving its line endings rather than CodeMirror's display normalization. The stored original remains authoritative for byte fidelity.

Native save/reopen retains the Block and original reference. `.inkpkg` includes exact originals, checks source/original agreement on opening, and rebinds managed references on import while allocating fresh occurrence identities. Cross-Vault rebinding is covered by automated tests. The browser package exercise uses real asset admission and the existing Flint import flow. Semantic HTML/Markdown/text export emits inert source with a conversion diagnostic, not an executable viewer. The standalone package reader does not gain these interactive presentations.

No Entity or Claim extraction, canonical writes, annotation ranges or code execution are introduced. The new `resources.original` capability uses the existing typed service operation and scoped asset authority; it can retrieve these originals without enabling academic/PDF operations. Existing academic, PDF, IIIF, image and native-persistence regressions were exercised.

## Libraries, isolation and limits

CodeMirror 6 was preferred over adding Shiki because the repository already uses CodeMirror and its language-data package. This reuses grammars and viewport rendering without adding another highlighting engine. The source instance is read-only, owns its selection within an opaque widget, and is destroyed on view change/unmount. All ten required language grammars and the five optional markup grammars loaded successfully in a direct dependency check; actual browser source rendering covered TypeScript and C#.

New pinned dependencies are `yaml` 2.9.1, `papaparse` 5.7.0 and `mermaid` 12.2.0, plus Papa Parse types. JSON uses the native parser. YAML uses the core schema; aliases, recursive aliases, custom tags, duplicate keys and complex mapping keys fall back to source. JSON numbers retain ordinary JavaScript numeric semantics; the original text is not rewritten.

| Area | Enforced bound / policy |
| --- | --- |
| Admission | 2 MiB, 200,000 Unicode scalar values; UTF-8 or BOM-identified UTF-16; invalid encoding/binary controls rejected. Empty text is allowed. |
| Structured parse | 200,000 UTF-16 code units; worker deadline 3 seconds; depth 48 and 20,000 tree nodes. |
| Table | 2,000 rows, 100 columns, 20,000 cells; oversized tables report a limit and offer source. |
| Source | 400 px scrolling viewport; a line over 10,000 characters disables syntax highlighting and wrapping. |
| Mermaid input | 20,000 characters, 500 lines, 500 edges; embedded configuration, HTML, links, images and icons rejected. |
| Mermaid output | 2 MiB SVG and 10,000 SVG nodes; 8-second parent timeout removes the frame and offers source. |

Mermaid is built as a local, self-contained approximately 5 MiB support bundle, fetched only when a diagram is displayed and cached in memory. No CDN is required. Each preview runs in an opaque `allow-scripts` sandbox **without** `allow-same-origin`; a nonce permits only the trusted support code. CSP denies network, images, fonts, forms and other resources. Source is serialized as data with HTML delimiters escaped. Mermaid strict mode and disabled HTML labels are supplemented by removal of active SVG elements, event attributes and external references. Parent messages require both frame identity and a random token. Listeners, timers, frames and source editors are released on view disposal.

The diagram guard deliberately rejects some benign text containing prohibited constructs. Only common flowchart and sequence examples were browser-qualified; the complete Mermaid diagram catalogue is not promised. The parent timeout and post-render SVG limits are practical bounds, **not** a hard CPU/memory isolation guarantee during a synchronous renderer stall. Sandbox initialization waits for document/font readiness and flushes its own layout before Mermaid measures text; it does not rely on animation frames, which browsers throttle for offscreen iframes.

## Automated qualification

**171 distinct Vitest tests across 17 files have passing results**, collected across targeted runs. The eight-file interchange/view regression passed 77/77. The eight-file service/native/URI regression initially passed 87/93, with six existing five-second timeouts under concurrent load. The affected foundation and academic suites subsequently passed 21/21 serially without increasing timeouts. A new host test initially used the wrong jsdom environment; after explicitly selecting Node, the final boundary/package run passed 21/21. These results are not represented as a single clean 171-test invocation.

The final Node asset/acquisition regression passed **32/32**, including the two new original-text tests. Coverage includes exact UTF-16 bytes, scoped admission, deduplication, empty source, binary/size rejection, foreign-Vault rejection, image/PDF boundaries, interrupted publication and recovery. Final TypeScript checks and production client/server build passed. Existing chunk-size/mixed-import warnings remain. Dependency auditing found no finding among the inspected new viewer/parser dependencies; 13 unrelated existing audit findings remain.

Reproduction commands:

```sh
npx vitest run src/structured/structured.test.ts src/rendering/structured-resource-view.test.tsx src/interchange/document-interchange.test.ts src/interchange/package/package.test.ts src/interchange/package/resources.test.ts src/rendering/document-interchange.test.tsx src/rendering/source-block-view.test.tsx src/interchange/clipboard.test.ts
npx vitest run --no-file-parallelism server/application-services/structured.test.ts server/application-services/foundation.test.ts server/application-services/academic.test.ts server/application-services/encyclopedia.test.ts server/application-services/iiif.test.ts server/application-services/pdf.test.ts server/native-document-store.test.mjs src/interchange/uri.test.ts src/interchange/resource-url.test.ts
node --test --test-concurrency=1 server/structured-original.test.mjs server/managed-assets.test.mjs server/asset-remote.test.mjs
npm run typecheck
npm run build
node scripts/check-structured-resources-browser.mjs
```

## Browser and typing qualification

The real Flint exercise uses headless **Chrome 155.0.8059.80 on macOS**, an isolated temporary Vault, real native persistence/assets and 13 files: JSON, YAML, CSV, TSV, TypeScript, C#, two valid diagrams, invalid YAML/JSON, unsafe/invalid diagrams and a long source line. It verifies actual tree/table/highlighted/diagram DOM, exact original bytes and CRLF copy, presentation changes without repository revisions, one-step Undo/Redo, explicit native save and reopen, and package import with fresh identities. A diagram is recreated with browser networking disabled after the local support bundle has loaded. The successful probe reports zero canonical API calls, zero Entity/Claim rows, zero external canary requests and zero runtime errors; its package is 66,057 bytes.

A final rerun exposed an intermittent sequence-diagram zero-size text measurement. Waiting for sandbox document/font readiness and flushing its layout corrected the observed failure; the complete browser workflow subsequently passed twice consecutively. An animation-frame wait was unsuitable because offscreen frames are throttled. Another run exceeded the browser harness's preparation wait while other qualification work was active; final browser checks ran serially. These earlier failures are retained here rather than describing all development probes as passing.

Matched typing probes used 250 paragraphs of 100 characters and 40 edits. The active case included a 1,000-record JSON tree, highlighted TypeScript and a rendered Mermaid diagram.

| Viewer state | Median edit handler | p95 | Maximum |
| --- | ---: | ---: | ---: |
| Feature off | 1.50 ms | 5.20 ms | 30.30 ms |
| Viewers active | 2.40 ms | 4.40 ms | 29.00 ms |

Both runs recorded **zero newly created workers during typing and zero document snapshots**, stable unrelated character cells and correct restored text. Insert, Backspace, Undo/Redo, Enter and split-Undo checks passed. A separate view regression dispatches ten actual input events and verifies zero structured reparses or snapshots. These individual headless runs do not establish a statistical speedup or guarantee user-visible latency. Parsing/highlighting is tied to this Block's source or presentation changes, not ordinary document revisions.

Reproduce with an idle development server and `BENCHMARK_STRUCTURED=off` / `BENCHMARK_STRUCTURED=active` when running `node scripts/benchmark-typing-browser.mjs`; `BENCHMARK_URL` selects the server. The recorded runs used an isolated Vite fixture with HMR disabled to avoid development reloads interrupting the probe.

## Remaining limitations and acceptance gate

- Safari, Firefox, Windows and Linux are not qualified. Offline qualification covers already loaded local support code and retained content, not cold loading an unavailable web application.
- Text encoding, row, node and rendering limits are explicit. No streaming multi-megabyte viewer or hard browser memory ceiling is claimed.
- Presentation settings are intentionally transient. There is no source editing, spreadsheet operation, formula evaluation, sorting/filtering, semantic code navigation, custom diagram engine or extra parser for the source-only formats.
- Older package readers may reject resource profiles they do not support. Interactive structured viewing is in Mutable; static export remains inert source.
- Published originals follow the existing conservative retention policy, including after Undo. No asset garbage collection or maintenance redesign is included.
- No code/data annotations, knowledge extraction, notebook, OCR, AI ingestion, IDE, TEI, maps or unrelated publishing/desktop work was added.

**Milestone F is complete for review and awaits user acceptance. Stop here before additional implementation.**
