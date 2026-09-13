# Reactive reconstruction progress

## Scoped Find — plan only, 14 September 2026

Recorded Page-default Container/Page/Document search, recursive model traversal,
literal/case/whole-word/regex options, immutable reusable match sets and caller-owned
session-only `editor/search-match` highlights. No runtime implementation yet.
[SCOPED_FIND_MIGRATION.md](SCOPED_FIND_MIGRATION.md) contains original-code findings,
official PKM comparisons, scope ambiguities, Unicode/regex/performance safeguards,
future bulk entity/replacement semantics and the resumable phase checklist.
Implementation requires a subsequent explicit request; grouped effects remain
deferred independently.

Design follow-up: user agrees with the scoped Find plan and confirms SVG-filled
text-region rectangles, inspired by `style/highlighter` and the existing
`highlightShapes()` pipeline. No wrappers or caret refactor. Session decoration
types should be extensible beyond `editor/search-match`; implementation remains
pending. The distinction from CSS-backed `style/highlight` is documented.

## Entity-reference search port

Selected text now opens the migrated name/alias search dialog through the Entity
reference toolbar button or Cmd+E / Ctrl+Shift+E. Choosing a result creates local
or linked cross-Block annotations with entity ID/name metadata; cancelling makes
no document change. Existing Node/SurrealDB API paths are hardened and tested
against disposable in-memory data. See [ENTITY_SEARCH_MIGRATION.md](ENTITY_SEARCH_MIGRATION.md)
for contracts, verification, operational requirements and deliberately deferred
entity-creation/bulk workflows. No populated user database was modified.

## Grouped annotation effects — explicitly deferred

User chose to document, not implement, grouped blur/flip/mirror because of caret,
selection, DOM ownership and performance risks. The preferred future compromise
is a shared inline-block object, accepting possible paragraph reflow and internal
wrapping. No length limit is selected. The risk assessment, alternatives and
staged verification plan are recorded in
[STANDOFF_PROPERTY_MIGRATION.md](STANDOFF_PROPERTY_MIGRATION.md#decision-grouped-effects-deferred-by-user-request).
No runtime code was changed for this decision. Implementation requires renewed
authorization; existing toolbar creation/persistence remains unchanged.

## Cached text counts

Added Block/Page/Document word and grapheme-character counts to the document
toolbar, with expanded whitespace-excluded counts and explicit inclusion rules.
Counting is debounced, cached per Block, and segmented in a background worker;
typing listeners only invalidate keys. See [TEXT_COUNTS_MIGRATION.md](TEXT_COUNTS_MIGRATION.md)
for scope decisions, performance safeguards, verification and follow-up options.

## Cross-Block editing and linked annotations

Implemented typing/deletion/Enter, plain-text copy/cut/multiline paste, atomic
undo, and shared semantic annotation identity across local Block ranges.
Monitor and Block clipboard understand linked records; legacy documents remain
compatible. This supersedes the earlier selection-only mutation guards and
deferral of linked semantics. See [CROSS_BLOCK_EDITING_MIGRATION.md](CROSS_BLOCK_EDITING_MIGRATION.md)
for rules, implementation checkpoints, verification, known baseline test failures
and remaining manual clipboard/IME checks. Existing experimental opt-in remains.

## Remember cross-Block selection preference

User confirmed selection works when enabled and approved remembering the opt-in.
The browser now remembers explicit enable/disable choices across reloads and new
document editors. Fresh installations remain default-off; selected ranges and
document data are never persisted as preferences. Storage failures fall back to
the current editor with a notice. See selection-plan checkpoint 5.

## Cross-Block text selection — experimental milestone, 13 September 2026

Agreed to pursue cross-Block text selection and independent Block-local style
properties incrementally, deferring linked semantic annotation identity until a
concrete use case warrants it. The authoritative
plan and resumable phase checklist are in
[CROSS_BLOCK_TEXT_SELECTION_PLAN.md](CROSS_BLOCK_TEXT_SELECTION_PLAN.md).
It records current-code constraints, browser feasibility checks, scope barriers,
mutation guards, acceptance/performance gates and checkpoint instructions.
Baseline verification and the browser prototype were the first implementation
steps. Existing Block clipboard work was preserved.

Implementation update: execution authorized. The 32 focused baseline tests pass.
Chrome native-selection feasibility confirmed editing-host boundaries; a
default-off model-owned cross-Block layer, local highlights, safe mutation guards
and independent toolbar style transactions are implemented and under test.
Seven new focused tests and typecheck pass. See checkpoint 1 in the plan for
current files, explicit conservative edit invalidation, pending browser/performance
checks and the exact resume command. Not yet a completed release milestone.

Checkpoint 2: selection and independent formatting are now implemented behind the
default-off toolbar checkbox. Nine focused tests, Chrome pointer/keyboard/style/
guard/autoscroll smoke, existing Block clipboard/drag smoke, typecheck and builds
pass. Model updates for a 20-paragraph selection in 300 paragraphs measured about
0.2–0.3ms p95 with no snapshots/revisions (not full paint latency). Explicit focus and
vertical-padding fixes came from browser testing. Safari/physical IME/accessibility
validation and the default-on release decision remain open; cross-Block replacement
and linked semantic annotations remain deferred. Resume from checkpoint 2 in
`CROSS_BLOCK_TEXT_SELECTION_PLAN.md`; do not redo the completed implementation.
Final full suite: 153 pass, two known context-menu failures, 155 total. No new
failures; final typecheck/build and cross-Block Chrome smoke pass. Uncommitted.

Selection interaction follow-up: added target-Block geometry fallback for native
caret APIs pinned to the originating editing host; cleared old local selection
highlights on click-away; made experimental horizontal Shift-arrow gestures
model-owned from the first keydown, including repeat. Chrome now checks the real
demo page/margins with both caret APIs deliberately clamped, both drag directions,
held Shift+Left and click-away. Eleven focused tests, typecheck/build and browser
checks pass. Full suite: 155 pass / 157, same two known context-menu failures.
Checkpoint 3 in the selection plan records the resume state and scope. Uncommitted.

Pointer follow-up (checkpoint 4): after the user still reported confinement,
added an actual WorkspaceDemo browser probe and changed experimental dragging to
own pointer-down/capture plus all local/cross moves, instead of taking over only
when leaving an editing host. Chrome actual-app and fixture smoke, 26 focused
tests and typecheck pass. User-browser reproduction is still unconfirmed; retain
that distinction and request browser/document/switch details if it persists.

## Block selection and drag reordering — 13 September 2026

Dedicated gutter handles support single, Shift-range, Ctrl/Cmd-toggle and additive
range selection, plus keyboard traversal. `editor.blockSelection` stores session
IDs/occurrence descriptors and supplies normalized future bulk-action targets.
Selected Blocks are highlighted with a count/ID inspector. Native handle dragging
reorders single or discontiguous sibling groups before/after a target, preserving
order in one undoable command; no structural nesting/cross-parent moves. Ctrl-click
inside text still opens its context menu. Eight new tests and native Chrome drag/
selection checks pass; typecheck/build pass. Full suite 137 pass / two known prior
context-menu binding-test failures. See BLOCK_SELECTION_MIGRATION.md for API,
PKM references, scope/lifecycle guarantees and deferred clipboard/bulk commands.

## Text-block tabs — 13 September 2026

Original convertBlockToTab/handleCreateNewTab behaviour now uses a shared runtime
action: wrap the current text Block in TabRowBlock/TabBlock, or append an independent
copy when already inside a TabBlock. Added “To tab / add tab” to the document toolbar
and Block context menu, plus registry bindings Ctrl+T / Alt+T. Existing Convert to tab
uses the same action for text Blocks. No separate InlineTabBlock DTO is invented.
See INLINE_TABS_MIGRATION.md for original semantics, browser-shortcut caveats,
identity/focus/undo safeguards and verification.

## New page layout — 13 September 2026

“Add page” now creates document-tab-block → page-block → empty standoff-editor-block,
matching the existing demo pages. Previously it omitted PageBlock, bypassing the
page's left/right gutter padding and scroll rules. “Convert to page” now inserts
the same wrapper around existing content. Gutters remain layout spaces; margin
notes are source-Block-owned relations created on demand, not empty independent
page-level documents. Activation/focus, atomic undo/redo, both margin relations
and save/reload are covered by page-creation tests. Existing saved pages are not
rewritten by this change.

## Document annotation toolbar — 13 September 2026

Shared DocumentStyleBar now serves demo and DocumentWindowBlock, exposing all 15
style schemas and both colour annotations. Range capture and unwrapped payload
data fix selection loss/DataCloneError when applying formatting. Paragraph indent
buttons adjust block/indent in 20px steps, not structural nesting. Original Tab /
Shift-Tab list commands are explicitly separate. See DOCUMENT_STYLE_BAR_MIGRATION.md
for inventory, limits (blur/flip/mirror visual wrappers remain deferred) and tests.

Last updated: 12 September 2026

This file is the hand-off log for the reconstruction described in
`SOLID_RESTRUCTURE.MD`. Update it whenever a migration slice starts, passes its
acceptance checks, or exposes a blocker.

## Annotation monitor — scoped conversion completed, 12 September 2026

Interaction follow-up: 21px annotation clearance, draggable header, resizable
corner grip with responsive container layout, per-row trash controls, and
shortcut labels. Plain arrows navigate the list/action group; whole-word edits
now use Alt/Option+arrows. Manual positioning persists for the open session.
See `ANNOTATION_MONITOR_MIGRATION.md` for navigation and ownership details.
Verified: 122 tests / 20 suites, typecheck, client/server build and Chrome checks
including real pointer drag/resize, lower positioning and narrow-screen bounds.

Horizontal-layout follow-up: a responsive three-column monitor now keeps the
annotation list at 23% of its grid width, range/actions in the middle and settings
on the right. It follows the selected annotation's start (100px left / 6px below,
viewport-clamped), with read-only annotation ID and conditional entity ID/name
fields from existing cached/embedded metadata. Missing names are explicit; no
automatic entity hydration was introduced. Chrome verified proportions, anchor,
visibility, narrow-screen overflow and editing/history. 119 tests / 20 suites,
typecheck and build pass. See the monitor migration document for details.

Original shortcut/window/property methods investigated and written up before
implementation in [ANNOTATION_MONITOR_MIGRATION.md](ANNOTATION_MONITOR_MIGRATION.md).
Ctrl+period and original slash aliases open a bounded caret-local annotation
popup, with range preview, keyboard/button movement, whole-word selection,
expansion/contraction, tombstone deletion and a working JSON attribute editor.
Commands are validated, paragraph-local, undoable and shared-view reactive;
external mutations dismiss stale sessions, and close restores source focus.

116 tests / 20 suites, typecheck and build pass. Real Chrome opening, geometry,
preview, editing, deletion, undo and focus-return checks pass. Seven new monitor
tests include zero-snapshot property edits and serialization/unknown-field
preservation. Cached entity lookup and schema/plugin-specific attribute pickers
remain outside scope; the original Edit button was unwired, now explicitly extended.

## Margin creation shortcuts — completed, 12 September 2026

Original Ctrl+Shift+ArrowLeft/Right handlers investigated and documented before
implementation in [MARGIN_HANDLER_MIGRATION.md](MARGIN_HANDLER_MIGRATION.md).
The converted gateway now creates/reuses source-owned left/right margin notes,
clears source selection and focuses the correct occurrence's note at its start.
Legacy gutter position, alignment, `.75rem` text, history and wire relations are
preserved; empty containers recover without replacing existing content.

All 109 tests / 19 suites, typecheck and build pass. Chrome verified both actual
shortcuts, typing/reuse, focus, gutter coordinates and text sizing. Native fields,
composition and held-key repeats are protected. First creation uses structural
validation; native PlainText shortcuts and other margin handlers are out of scope.

## Incremental Standoff editing — scoped pass completed, 12 September 2026

Empty-paragraph Enter follow-up: start/end/empty cases now use explicit sibling
insertion, local validation, parent-only projection updates and incremental
undo/redo instead of a full transaction draft. In the Vernon Blake chapter,
handler time fell from 1,183–1,321 ms to 0.6–4.4 ms; snapshots fell from three to
zero. Chrome two-frame times were 63–162 ms (layout/scheduling remain). Focus,
history, source text and unrelated DOM checks pass. Qualification: 102 tests /
18 suites, typecheck and build. Selected-range Enter remains on atomic structural
fallback. Benchmark details and remaining limits are in TEXT_EDIT_PERFORMANCE.md.

Long-paragraph/Enter follow-up: verified with a read-only copy of the Vernon Blake
introduction (40,255 characters; longest paragraph 5,632 characters / 33
annotations). Compiled Cell-style intervals remove per-Cell annotation scans;
Unicode deletion now counts segments linearly instead of recounting prefixes.
Validated split/unsplit batches and local projection updates avoid document-wide
cloning/rebuilds for collapsed-caret Enter inside a text-only paragraph.

Chrome typing mean: 289.11 → 22.06 ms; split: 1,752.40 → 139.10 ms;
split undo: 1,197.70 → 68.50 ms. Real Enter, typing, deletion and history checks
passed with original text/unrelated DOM preserved. 97 tests / 18 suites,
typecheck and build pass. The benchmark can now read a chapter through
`BENCHMARK_DOCUMENT_URL`; it never saves. Boundary/selection Enter, joins and
inline atoms remain on structural fallback where applicable. Details and exact
repeat command are in the performance document below.

Plan and evidence: [TEXT_EDIT_PERFORMANCE.md](TEXT_EDIT_PERFORMANCE.md).
Ordinary character edits now update the affected paragraph/Cells and their
projected occurrences only; undo/redo takes the same validated fast path.
Internal events use deltas, preserving opt-in legacy snapshot semantics.
Shared content reference counts are maintained through structural fallback.

The same model benchmark at 25k characters fell from 1,452.65 to 3.84 ms/edit
(fixed 100-character paragraph), with six snapshots reduced to zero. Chrome
rendered-input handling averaged 1.54 ms across 40 insert/delete events; real
Chrome insertion, Backspace, undo/redo and unrelated DOM identity checks passed.
All 88 tests / 16 suites, typecheck and build pass. Repeatable model/browser
benchmarks are available as `npm run benchmark:typing` / `:typing:browser`.
Long single paragraphs, dense annotation geometry, structural edits and explicit
live snapshot consumers remain outside this scoped performance guarantee.

## Backgrounds and general context menu — scoped pass completed, 12 September 2026

Development startup correction (same date): the `/uploads` proxy intercepted
Vite's `medieval-template.jpg?import` module request, returning JPEG bytes and
leaving the page blank. Both configs now bypass the proxy for `import`, `raw`
and `url` transforms while ordinary media still goes to Node. Six regression
cases cover routing and config consistency. Chrome verified the actual
`http://localhost:3000/` development page loads with 34 editable regions, its
background image, and no startup console errors. The full suite now passes
81 tests in 15 suites; typecheck and build pass. Earlier background browser
checks used the production server and did not cover this development-only path.

- [x] Inspect four original background classes, Universe contextmenu routing,
  BlockMenu actions, window themes, shader library and static media routes.
- [x] Record specific scope, event policy, legacy gaps and acceptance checks in
  [BACKGROUND_CONTEXT_MENU_MIGRATION.md](BACKGROUND_CONTEXT_MENU_MIGRATION.md).
- [x] Implement background lifecycles and workspace surface; wire contextual
  actions through the model and gateway with focus/selection-safe dismissal.
- [x] Qualify regression and browser behavior, update evidence and limitations.

All four background types now render through exact, separately cleaned-up media
adapters. Original presets and custom URLs, playback/sound controls, an actual
desktop surface, static-media development proxies and independent background
history are connected. Control-click, native contextmenu and keyboard menu
opening route to the clicked Block; general structural/file/theme actions use
model transactions, native fields retain input ownership, and dismissal restores
focus/selection. Menu layers are session-only and bounded to the viewport.

Verification: 75 tests in 14 suites, typecheck, and client/server build passed.
Chrome verified desktop image/native video/WebGL rendering, YouTube embed
configuration, switching without replacing document mounts, real Control-click,
glass theme, menu bounds and narrow-screen layout. Screenshot:
`/tmp/speedy-background-context-menu.png`.

Limits: desktop choices last for the browser session. Whole-workspace server
persistence/multiple-window creation and duplicate/extract workflows remain
disabled, as do original no-op/miswired Rename, Convert to pocket and tab merge
actions. Document file browsing/saving works from the menu. See the migration
document for detailed action boundaries; this does not close the full input audit.

## Standoff styling — first pass completed, 12 September 2026

- [x] Catalogue all 27 current Standoff schemas, source CSS/SVG/plugin locations,
  recognizer-only tokens, and saved tokens (75 across 2,388 store JSON files).
- [x] Record the migration sequence and acceptance gates before implementation in
  [STANDOFF_PROPERTY_MIGRATION.md](STANDOFF_PROPERTY_MIGRATION.md).
- [x] Replace generic styling guesses with explicit Cell/SVG schema rules and
  qualify the first 22 schemas; retain grouped wrappers/plugins as separate work.
- [x] Verify reactive updates, range/style cleanup, legacy round-trip, and browser
  geometry; record results and remaining limits here.

The renderer now uses `src/rendering/standoff-styles.ts` for explicit Cell and
SVG styles: original colour values, typography, pink highlights, URL appearance,
six fixed semantic-reference colours, the exact rainbow palette, colour-dodge
highlighter, and animated dashed/red spiky outlines. Overlapping rainbow ranges
reserve seven lanes. Unknown/deferred types retain their JSON without guessed
decoration; updates and undo preserve the flat Solid-owned Cell mounts.

Verification: 63 tests in 11 suites, typecheck, and client/server production build
passed. Chrome loaded a fixture through the real browser/API and checked all 22
implemented appearances, wrapped underlines, deleted/unknown annotations, and
reduced-motion suppression; screenshot: `/tmp/speedy-standoff-styles.png`.

Still open: grouped blur/flip/mirror, clock lifecycle, and embedded micro-documents
(five schemas). Connected multiline contours, bidi/zoom/transformed geometry,
reference activation, and annotation creation/recognizers also remain separate
work. Current outlines are per-line; this checkpoint does not close the complete
input-parity audit or migrate all 75 stored tokens.

## Document store browser — completed, 12 September 2026

The user requested original-server folder browsing and document load/save. The
[document-store migration plan](DOCUMENT_STORE_MIGRATION.md) and the main proposal
were updated before implementation, after inspecting the original workspace,
control panel, Universe loaders/savers, and Node routes.

- [x] Specify tree/list UI, Open/Save/Save As, unsaved-change handling, keyboard
  shortcuts, session lifetime, legacy JSON compatibility, and API behavior.
- [x] Implement nested folder listing and reliable, confined document I/O using
  the existing endpoints, with separate indexing-failure reporting.
- [x] Connect the workspace to the reactive persistence service and folder browser.
- [x] Verify round-trip, failure, race, focus, scrolling, and unsaved-change cases;
  update this log and usage instructions with actual results.
- [x] Make `npm run dev` start both Node and Vite, proxy the API, wait for server
  readiness, and stop both on Ctrl+C; document the store-root override.

Verification: 56 tests in 10 suites, typecheck, and client/server production build
passed. Real HTTP tests cover nested listings, legacy round-trip, concurrent
conditional creates, write validation, traversal/symlinks, and indexing failure.
Chrome opened an original document, scrolled to its end, and completed a separate
edit/save-as/reopen/save-shortcut round-trip in a temporary store. The original
file remained unchanged. Keyboard/focus, stale requests, save/discard/cancel,
and close/reopen of the saved baseline are covered. The browser fits 390×844;
screenshot: `/tmp/speedy-document-browser.png`.

## Workspace demo page — completed, 12 September 2026

- Source: the `doc2` fixture actually loaded by original
  `src/components/workspace.tsx`: 92 Blocks, 27 instantiated types, plus all
  39 registered builder types and the Universe context.
- Scope: add a runnable example page, validate fixture decode/render/export and
  all type registrations, retain the two-pane pilot, and reproduce the original
  workspace layout and interactions with safe demo media substitutions.
- This slice does not close the full input-parity audit. Specialized rendering
  previews and pending handler behavior will remain explicitly identified.
- [x] Captured the original fixture and builder-type manifest without importing
  legacy Block constructors.
- [x] Implemented the original-style window shell, formatting bar, margin
  gutters, edge-mounted sticky tabs, seven-lane rainbow and spiky decorations,
  draggable canvas preview, model-backed card flip, local image/iframe
  substitutions, and a paused-by-default YouTube embed.
- [x] Tested loading/export of all 92 Blocks, all source builder registrations,
  inactive tabs/card faces, margin and sticky-tab structure, PlainText editing,
  Enter insertion at a Block start, four-way boundary navigation, default video
  loading, decoration geometry, and reset.
- [x] Passed typecheck/build and a Chrome production render smoke check. With
  `npm run dev`, use `http://localhost:3000/` for the workspace and
  `http://localhost:3000/pilot` for the retained two-pane pilot.

## Input-parity audit checkpoint — read before resuming code generation

11 September 2026, documentation-only pass:

- [x] Audited all 60 current TS/TSX source files and mapped all 49 original
  Block/panel classes, inherited routing, direct listeners and indirect controls.
- [x] Recorded all 97 binding declarations and every discovered callback,
  installation/cleanup path, helper handler and text recognizer in the
  [source ledger](INPUT_HANDLER_SOURCE_LEDGER.md), with source hashes and IDs.
- [x] Documented annotation Cell-endpoint movement, CSS inheritance, partial
  deletion, retained `isDeleted` records, split/join/replacement caveats and
  clipboard compatibility in the [audit addendum](INPUT_HANDLER_AUDIT.md).
- [x] Compared those contracts against the reactive gateway/views and added
  per-behavior acceptance cases and explicit pending decisions.
- [x] Validated 454 unique evidence IDs/excerpts, all 97 binding-summary rows,
  all 60 unchanged source hashes and relative documentation file links.
- [ ] Implement and qualify the complete handler catalog. Every ledger ID
  remains open for parity verification; mapped does not mean ported.

The source census excludes the unused older AMD/JavaScript archive under
`src/library/original` and dependency-owned widget internals; those are not
claimed as converted. No application code, tests or configuration changed in
this audit, and no new runtime test results are claimed.

Correction to earlier completion language: existing boundary-editing tests
cover a subset, not the complete original Document/Standoff behavior. The
reactive mapper currently drops fully deleted annotations instead of retaining
the original serialized `isDeleted` record. Clipboard envelopes/annotation
payloads differ; most original bindings, panel workflows and TextProcessor
rules are not wired. See the addendum's gap matrix before relying on the
milestone checkmarks below.

Next implementation checkpoint: resolve addendum decisions D-01 through D-08,
select an explicit set of ledger IDs, then implement and attach regression
evidence. Preserve all remaining IDs as open, including native-event, focus,
annotation, history and save/reload acceptance requirements.

## Current boundary

The original `speedy-ts` repository is the read-only source reference. This
repository is a complete working copy without the original `.git`, `node_modules`,
or generated `dist` directories.

The implementation has advanced beyond the first vertical pilot:

- Stage 0: preserve representative wire-format behavior in fixtures.
- Stage 1: normalized canonical content/placement state, tree projections,
  validated transactions, structural commands, history, and codecs.
- Stage 1a: distinct content, placement, node, and view identities; allow two
  views of one placement to share content while retaining view-local state.
- Stage 2: render and edit PlainText Blocks through Solid without constructing
  legacy `PlainTextBlock` instances.

The old implementation stays in `src/blocks` as behavioral reference code. It
is no longer imported by the reconstructed application bundle.

## Completed

- [x] Created `/Users/iianneill/Documents/GitHub/speedy-ts-reactive`.
- [x] Copied the source project while excluding `.git`, `node_modules`, and
  generated `dist` output.
- [x] Read and scoped the migration against `SOLID_RESTRUCTURE.MD`.
- [x] Added canonical content and placement records with separate per-view
  occurrence keys and reactive normalized projections.
- [x] Added validated atomic operations, transaction grouping, undo/redo, and
  insert/move/remove/unwrap/replace/relation commands.
- [x] Added pilot legacy JSON codecs that preserve saved IDs/type tokens,
  unknown fields, omitted/null collections, relation slots, and external
  workspace document behavior.
- [x] Added a PlainText Solid view, mount registry, focus service, and native input
  gateway.
- [x] Added two linked pilot views backed by one canonical model and view-local
  DOM/focus/selection handles.
- [x] Added focused model/codec/browser-adapter tests and production build
  verification.
- [x] Added Solid views/capability registrations for structural containers,
  pages, lists, tables/grids, tabs, checkboxes, media, code editors, windows,
  backgrounds, margins, and unknown fallback Blocks.
- [x] Added declarative Block-property appearance for alignment, sizing,
  position, rotation, indentation, margin, font size, and themes.
- [x] Added stable background replacement that retains the content DOM mount.
- [x] Added session-owned portal overlays, focus return, owner cleanup, block
  measurement, and pointer-based window movement cleanup.
- [x] Moved Standoff text into a canonical `inline-content` Cell placement
  sequence while retaining identical text-only JSON output.
- [x] Added Solid TextCell rendering, controlled `beforeinput`, composition
  reconciliation, grapheme deletion, split/join, annotation offset mapping,
  model-owned selection sets, multi-caret transactions, and local SVG
  annotation/selection layers.
- [x] Added typed inline ImageCells, insert/move/remove/update operations, rich
  clipboard envelopes, and an explicit error/loss report for legacy export.
- [x] Added copy, live transclude, unlink, detach, bounded cycle placeholders,
  shared occurrence projection, and extended repository round-tripping.
- [x] Added named-slot insertion planning, command registration, typed model
  notifications, position-map contracts, and tagged text/Block/grid selections.
- [x] Added revision-aware client persistence, a separate extended-repository
  API, atomic server file replacement, and explicit server error handling.
- [x] Verified existing `medieval.json` and `manuscript.json` fixtures through
  the new codecs.

## Current status

Stages 0–6d now have runnable implementation coverage in the reconstructed
application. The renderer is Solid-owned from the root through ordinary Blocks,
inline Cells, and SVG layers; no legacy Block constructor participates in the
bundle. The remaining work is qualification and behavioral breadth, listed
below, rather than another ownership rewrite.

The reconstructed application now opens the original 92-Block sample as a
runnable workspace example. It decodes, renders, edits, resets, and exports the
sample without constructing legacy Block classes. All 39 source builder types
and the Universe context resolve through the reactive registry; types without a
specialized port intentionally use explicit structural previews. Initial load
uses local image/iframe assets, while the YouTube player loads immediately in a
paused state to match the source demo.

The workspace also browses the existing document store through a folder tree
and filtered file list. Open, Save, Save As, unsaved-change prompts, and keyboard
shortcuts use the reactive editor and unchanged legacy document envelopes.
`npm run dev` starts both the Node API and Vite. See the document-store plan for
the tested scope and remaining indexing/concurrent-writer limits.

The retained `/pilot` route shows two panes backed by the same canonical
PlainText and Standoff content. Its toolbar exercises insert, reorder, delete,
undo, redo, session overlays, and legacy JSON export. Ordinary textarea editing
stays native; Standoff input maps through canonical Cell operations.

## Remaining qualification and parity work

- [ ] Port the full catalog of legacy document commands and specialized panel
  behavior (annotation editing, entity workflows, the remaining style-bar and
  find/replace commands, advanced canvas tools, and every historical keyboard binding) onto the command
  registry.
- [ ] Replace whole-field PlainText synchronization with stale-base
  `ReplaceText` operations before enabling concurrent writers.
- [ ] Store and restore selection sets as history bookmarks for every undo/redo
  and cross-parent remount case.
- [ ] Complete non-cancelable Standoff DOM reconciliation when a sequence also
  contains inline atoms; current controlled `beforeinput` paths are safe, but
  an unpreventable browser mutation needs a typed DOM-sequence diff.
- [ ] Add reference-aware asset upload/retry/cleanup and durable source-catalog,
  backlink, recovery-journal, and query indexes.
- [ ] Qualify exact geometry for RTL, vertical writing, rotation/skew, zoom,
  fonts, media reflow, and overlapping lanes with real browser measurements.
- [ ] Run the required Chromium, Firefox, WebKit, iOS, Android, pen, dictation,
  screen-reader, dead-key, AltGraph, and IME device matrix.
- [ ] Profile and implement virtualization thresholds for realistically large
  documents while pinning focused/composing/selected occurrences.

## Known limits at this checkpoint

- The native PlainText adapter currently records a whole-field operation.
  Replace-text operations with base revisions and position maps are still
  required before concurrent/stale shared edits can be enabled.
- History stores reversible model operations, but selection position mapping and
  view-local selection restoration across every structural edit are not yet
  implemented.
- Only `leftMargin` and `rightMargin` are decoded as owned relation slots. Other
  relation fields are intentionally preserved as opaque wire data until their
  type schemas are migrated.
- The legacy `src/blocks` implementation remains copied as reference code and is
  excluded from the new strict client type-check. It is not part of the new
  bundle.
- Automated interaction tests currently run in jsdom. A real headless Chromium
  render smoke check passes, but that is not the proposal's full device matrix.

## Decisions and guardrails

- Existing document/workspace JSON and HTTP envelopes remain unchanged.
- Runtime node keys are never serialized.
- DOM elements and class instances never enter canonical state.
- Solid owns every migrated Block root; commands own structure.
- A native textarea owns ordinary text editing. The central gateway records its
  value and routes only declared application commands.
- No migration milestone is marked complete until its automated checks pass.

## Verification log

12 September 2026, Node 22.12.0:

- Added the original workspace `doc2` as an immutable source fixture and a
  deterministic demo copy with local media substitutions.
- Restored demo parity for the floating workspace shell, true left/right margin
  columns, side-attached sticky tabs, seven-colour and spiky annotations,
  draggable Canvas objects, same-space card flipping, and paused default video.
- Added Enter-at-start Block insertion and ArrowLeft/Right/Up/Down navigation at
  editable Block boundaries.
- Corrected document scrolling: the document flex item can shrink within the
  window, window/tool bars retain their height, and the active page has a vertical
  scrollbar with a reserved gutter. Removed minimum window heights that pushed
  the bottom beyond short viewports.
- Chrome scroll checks at 1440×900, 1280×600, 390×844, and maximized 1440×900
  confirmed mouse-wheel scrolling and access to the last Block while the
  formatting bar and sticky tabs remain stationary.
- `npm test` — 41 tests passed, including the workspace fixture/model,
  registration, inactive tabs/card faces, margin/sticky layout contracts,
  decoration geometry, default paused media, boundary input, editing, and reset.
- `npm run typecheck` — passed for the reconstructed reactive client and server.
- `npm run build` — passed for the Vite client and TypeScript server output.
- Google Chrome 153 headless — rendered the production workspace successfully
  at `http://127.0.0.1:4173/` with no browser-console errors; the final parity
  screenshot is `/tmp/speedy-reactive-parity-final.png`.

11 September 2026, Node 22.12.0:

- Corrected Standoff DOM-boundary mapping for a caret restored between Cell
  spans; consecutive typing now remains at the originally selected position.
- Added a tested subset of Document/Standoff boundary deletion behavior: Backspace
  joins with the previous text Block, Delete joins with the next, empty and
  non-text neighbours follow explicit focus/removal policies, and annotation
  ranges contract to surviving Cells instead of being indiscriminately lost.
  The subsequent input-parity audit above records unhandled branches and
  annotation tombstone/style compatibility gaps; this is not full parity.
- Replaced whole-sequence fallback Standoff reconciliation with a minimal text
  diff so uncancelled browser edits and composition preserve unaffected
  annotations; mixed text/atom DOM reconciliation remains separately tracked.
- `npm test` — 32 tests passed across legacy fixtures, model/codec,
  PlainText/Standoff browser adapters, transclusion, mixed inline content, and
  stable-background suites.
- `npm run typecheck` — passed for the reconstructed reactive client and server.
- `npm run build` — passed for the Vite client and TypeScript server output.
- Google Chrome headless — loaded the production app and rendered both linked
  views with measured SVG highlights/underlines; screenshot smoke pass saved in
  the system temporary directory for inspection.

The install reports inherited dependency audit findings; dependency
modernization is outside this renderer slice and remains to be assessed before
release.

## Selected Block clipboard checkpoint

Implemented session-memory copy/cut/paste plus atomic deletion of normalized Block
selections. The selection inspector exposes these actions; registry defaults use
Cmd+C/X/V on Apple platforms and Ctrl+C/X/V elsewhere, plus Delete/Backspace.
Lossless canonical fragments retain margins, nested Blocks, annotations, and inline
images. Paste inserts after the selection or at the retained cut/delete position.
See `BLOCK_CLIPBOARD_MIGRATION.md`. External and inline-text clipboard work remains
separate. Chrome smoke now exercises clipboard shortcuts and cut-all/paste as well
as native group dragging.
