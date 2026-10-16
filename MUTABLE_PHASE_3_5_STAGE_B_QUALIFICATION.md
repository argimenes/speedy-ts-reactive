# Phase 3.5 Stage B — Source-Preserving Blocks

Implemented and qualified on 2026-10-16. Stage B is ready for acceptance. Stages C–E, Phase 3.6 and Phase 4 have not been implemented.

## Scope and UI

The existing default-on `documentInterchange` flag gates the new Block views and actions. No existing feature defaults changed.

- In a Document's Block context menu, **Add Block → Markdown source / HTML source** creates an editable source Block.
- **Embed source file…** copies selected Markdown/HTML source into independently owned Blocks in the current Ink document. This is distinct from opening an existing Ink document, importing external files as new Ink documents, or inserting converted native content. External files are never overwritten or implicitly linked.
- Each source Block provides **Source**, **Preview**, **Refresh preview**, and **Convert to Mutable Ink…**.
- Saving remains manual, through the existing dirty-state and Command-S/Control-S flow. Source is stored inside the Ink document, not saved back to the external filename.

New versioned wire types are `mutable/markdown-source-block` and `mutable/html-source-block`. Legacy `html-block`, `html-editor-block` and iframe registrations retain their existing semantics.

## Implementation

### Authoritative editing and lifecycle

`SourceBlockView` uses the existing native-text textarea, gateway, commands and history. It creates no per-character Cells. `payload.text` is authoritative; view mode, preview output, warnings, errors and worker state are occurrence-local Solid state.

The source adapter maps textarea UTF-16 edits to the original string. Mounting and previewing never normalize saved text. Edits preserve untouched CRLF/LF/CR endings and use the current dominant ending for new lines. Captured input ranges disambiguate repeated newlines and directional deletions. Composition commits once; a concurrent source edit from another occurrence is preserved instead of being overwritten by an older composition. Keyboard and cancelable native `historyUndo`/`historyRedo` use canonical history.

Preview starts only on an explicit action, through the existing cancellable interchange worker. An unchanged source can reuse its occurrence-local cached result. Changed source marks an existing preview stale without parsing it again. Failed/stale results do not replace source; disposal or return to Source aborts outstanding work and removes the iframe. Source selection is retained when returning from Preview.

A necessary native-text dependency correction changes `setPayloadField` to read the current repository rather than take a full snapshot before making its already-cloned content update. Transactions still use their draft. No persistence, document validation, indexing, geometry reads or preview work was added to typing.

### Preview security

Markdown uses the existing CommonMark/GFM-table parser's exposed data-only intermediate tree. Raw Markdown HTML remains literal text.

HTML is parsed as data and emitted by a positive allowlist serializer. Active elements, event handlers, source CSP, navigation, authored resource URLs, source stylesheets, SVG/MathML and custom element wrappers do not enter the application DOM. Passive content from unsupported wrappers can remain. CSS accepts a finite inline grammar for colors, typography, whitespace, alignment, bounded spacing and borders; URLs, variables, imports, positioning, filters and animation are excluded.

The result is a fresh `srcdoc` document in `sandbox=""`, with no permissions and `referrerpolicy="no-referrer"`. Generated CSP denies scripts, connections, images, fonts, media, objects, frames, base changes and forms. Only generated/allowlisted inline styles are permitted. The preview has its own scroll area, starts at 360 px and can be resized between 120 and 800 px. No height-measuring script or same-origin exception is introduced.

Image URLs become inert alt placeholders, with external-resource labels outside the frame. Safe HTTP(S)/mailto links are explicit parent-owned controls; the iframe contains no navigable anchors. Preview does not grant acquisition consent. Source-image binding/URL lifecycles are not introduced: no `sourceResources` mapping is created or interpreted in this stage.

### Conversion, copy and persistence

Whole-Block conversion reuses the existing source adapters, MutableFragment materializer and managed-image admission/consent path. A concise confirmation explains source/metadata/annotation loss. Insertion and removal form one history transaction; Undo restores the source Block's original identity, text, metadata and properties. Shared/reference occurrences, related/child content and non-child slots are rejected rather than ambiguously replaced. Revision, view, composition and session checks reject stale operations.

Source Blocks copy through the existing fragment schema and receive fresh Block identities. Foreign source standoff data is preserved under `inactiveSourceAnnotations`, retaining its original identifiers/data without participating in native annotation links, save dependencies or rendering. Existing raw source annotation data remains inactive in extraction. Unsupported source schema versions remain opaque on interchange and read-only on native presentation. Disabling the feature exposes escaped source text through the unknown-Block fallback.

Semantic HTML export recompiles the sanitized source projection; Markdown/plain-text export goes through the existing semantic conversion/export path. Export never reads the iframe DOM or changes document data. There is no new print command or active-HTML export mode.

### Source indexing

The declared source-text policy indexes authoritative `payload.text` once, in UTF-16 coordinates. Full, lightweight and SQLite saved readers agree. They do not parse source links into entity references or index rendered preview text. Live Find explicitly searches source text, including literal markup, without enabling standoff annotations/highlights in the textarea.

The SQLite extraction profile advances to `mutable-saved-sql-v2` so old extraction evidence cannot masquerade as current source-text coverage. Existing reconciliation rebuilds derived evidence; deterministic SQL object identities retain their previous identity namespace. Native document data and SQLite schema are unchanged.

## Executed qualification

- Focused regression suite: **153 tests passed** across 14 files, covering interchange, clipboard, source views, native text, menus, search and full/lightweight/SQLite facts. A final **58-test** targeted run passed after subsequent source/history refinements, including one additional native undo/redo case: **154 distinct tests qualified**. A further 32-test targeted run verified the final inactive-annotation preservation adjustment.
- `scripts/check-source-blocks-browser.mjs`: passed in real headless Chrome using Flint, actual workers, browser file selection and isolated temporary native storage. Verified Markdown and HTML source embedding, opaque iframe origin, rendered child text/color/CSP, source/preview selection restoration, zero preview history changes, real text input, Chrome IME, exact mixed-ending save/reopen, unchanged external source, one-transaction conversion/Undo and iframe disposal. No probe network requests or browser exceptions were observed.
- `scripts/check-document-interchange-browser.mjs`: Stage A browser regression passed, including actual clipboard acknowledgement/fallback, import, conversion, export, drag-and-drop and managed-image save/reopen.
- Client production build, SQLite worker bootstrap, server build and TypeScript checks passed. The existing large-bundle warning remains; no build-system refactoring was made.
- `git diff --check`: passed.

Commands used:

```sh
npx vitest run src/interchange \
  src/rendering/source-block-view.test.tsx src/rendering/plain-text-block-view.test.tsx \
  src/rendering/document-interchange.test.tsx src/rendering/block-context-menu.test.tsx \
  src/runtime/text-search.test.ts src/knowledge/live-observer.test.ts \
  src/knowledge-sqlite/saved-facts.test.tsx src/knowledge-sqlite/saved-projection.test.tsx
node scripts/check-source-blocks-browser.mjs
node scripts/check-document-interchange-browser.mjs
npm run build:client
node scripts/build-sqlite-foundation.mjs
npm run build:server
npm run typecheck
```

The explicit SQLite bootstrap retains the documented Stage A build ordering workaround. A browser launch attempted concurrently with the build timed out before the application initialized; isolated browser reruns passed. Benchmarks below were run serially without concurrent builds or test suites.

## Matched typing measurements

Existing `scripts/benchmark-flint-typing-browser.mjs`; same Michelangelo fixture, 499-character target paragraph, eight mounted paragraphs, Normal caret mode, 40 alternating insert/delete events. Flag-off/on comparison controls the complete `documentInterchange` capability, as in Stage A. Values are milliseconds; headless frame timings are not guaranteed user-visible latency.

| Run order | Flag | Synchronous median / p95 | Settled median / p95 | Frame median / p95 | Snapshots / status reads |
| --- | --- | --- | --- | --- | --- |
| 1 | off | 6.2 / 11.0 | 8.4 / 15.4 | 17.1 / 61.6 | 0 / 0 |
| 2 | on | 6.1 / 9.2 | 8.3 / 11.5 | 16.6 / 85.2 | 0 / 0 |
| 3 | on | 5.8 / 8.1 | 7.9 / 10.3 | 16.7 / 31.7 | 0 / 0 |
| 4 | off | 5.7 / 9.1 | 8.1 / 11.4 | 16.6 / 96.8 | 0 / 0 |

All runs restored the original text and passed real Chrome input/Undo. CPU samples included existing annotation range-rebasing code; none came from the new source view, source preview, Markdown parsing or document interchange operations. No repeatable typing deterioration was demonstrated. Source textarea browser qualification separately measured **zero repository snapshots and zero worker starts** for actual typing.

Raw results and CPU profiles are local qualification artifacts under `/tmp/stage-b-typing-{off-1,on-1,on-2,off-2}/`; the measurements above are retained in this report.

## Deliberate boundaries

- Source and Preview only; no Split mode or automatic preview refresh.
- Preview images remain inert placeholders. No source-image mapping UI, remote preview acquisition, arbitrary stylesheet support or active HTML execution.
- Whole-Block conversion only; attached/shared structures require an explicit prior restructuring.
- Chrome/macOS is qualified here. Safari/Firefox and the already documented clipboard browser limitations remain follow-ups, not claims of coverage.
- Asset maintenance and full-Cavern relocation follow-ups from Phase 3 remain unchanged.
- Await Stage B acceptance before any Stage C implementation.
