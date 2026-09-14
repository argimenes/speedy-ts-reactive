# Scoped Find and reusable match sets

Recorded 14 September 2026. **Implementation authorized and started.**
This document is the resumable design checkpoint. Replacement and bulk
entity binding are future consumers, not part of the initial Find release.
Grouped blur/flip/mirror rendering remains explicitly deferred.

User follow-up: the plan is agreed, with explicit confirmation that search
highlights use coloured SVG rectangles over text fragments, never wrappers.
The subsequent user request authorizes implementation of scoped Find only.

## Direction

Build three independent pieces: a scoped search engine returning immutable match
records, a caller-owned session highlight layer, and a Find UI. An entity-search
window or another tool can use the same engine without showing highlights or
opening Find. Search terms and matches remain local to the editor session; no
SurrealDB request is needed for document text search.

User requirements retained: a text box; Container, Page (default), and Document
scopes; recursive traversal of tables/grids/tabs and other structured children;
Page includes main text and margins; caller-controlled match highlighting;
reusable results for subsequent actions.

## Original-code findings

- `src/components/find-replace.tsx` searches all manager.registeredBlocks of type
  StandoffEditorBlock. There is no explicit subtree boundary or occurrence-aware
  scope. Porting that loop would risk crossing documents and missing unloaded
  content; new scope membership must come from the model, not registered mounts.
- `getAllTextMatches()` in `src/blocks/standoff-editor-block.ts` constructs a
  RegExp directly from the query with `gi`. Literal punctuation is thus treated
  as regex; invalid syntax throws. End offsets use query length rather than
  matched-text length, and regex UTF-16 positions are not converted to Cell
  positions. Zero-length matches have no explicit progress safeguard.
- Highlights are `codex/search/highlight` properties with `clientOnly: true`.
  Cleanup destroys all properties of that type in a Block, regardless of which
  caller created them. Replacement loops forward over captured matches, which
  needs redesign because earlier edits can invalidate later offsets.
- The old Find focus function is unfinished; one Enter path requires a nonempty
  replacement even in Find mode. These are not behaviours to reproduce.
- `src/components/search-entities.tsx` uses FindReplaceBlock through Ctrl+A to
  collect matching text, highlight it, and pass candidates to onBulkSubmit.
  Preserve the reusable search concept, not UI construction as a service or
  overriding Select All inside the query field.
- Converted codecs strip clientOnly properties from legacy document export, but
  canonical history/clipboard/state are separate paths. A clientOnly flag alone
  is not adequate isolation for temporary search state.
- Existing SVG range highlights and keyed Cells can support a new ephemeral
  decoration layer without wrapping/reparenting text. Existing count workers,
  revision notifications and input registry provide patterns to reuse.

## PKM comparison (official sources consulted 14 September 2026)

These are specific documented conventions, not claims that every product has
the same Find or Replace feature. Workspace search and in-document Find differ.

| Product/source | Documented behaviour | Implication for this design |
| --- | --- | --- |
| [Obsidian Search](https://obsidian.md/help/plugins/search) | Case-insensitive by default, case controls, regex and operators including path, block and section | Offer advanced options explicitly, but keep local Find literal by default; Obsidian's Markdown block/section query semantics are not our typed Block scope model |
| [Notion Search](https://www.notion.com/help/search) | Cmd/Ctrl+F searches a page; workspace search has an In filter including subpages | Page-default and explicit recursive scope are familiar. Do not confuse workspace-ranked results with text-range matches for editing |
| [RemNote search](https://help.remnote.com/en/articles/6030721-searching-your-knowledge-base) | Distinct document Find, Filter and Replace; also descendants search and text-reference search | Closest conceptual precedent: one document search foundation can support navigation, filtering and later reference workflows, with separate actions |
| [Joplin Searching](https://joplinapp.org/help/apps/search/) | Note search uses full-text word/prefix/phrase matching, notebook/subnotebook filters, and a separate basic literal search mode | Make substring vs whole-word semantics visible. Do not use note-level full-text ranking for exact match ranges needed by replacement |

No conclusion about absent features is drawn from undocumented behaviour.
Logseq search pages were discoverable but did not provide enough directly
retrievable official detail for a reliable feature-parity claim in this review.

## Scope contract

| Choice | Proposed membership |
| --- | --- |
| Current text container | Nearest meaningful text region: main text region, an individual margin container, table/grid cell, tab panel or explicit nested list/container. Recursively includes its structured text descendants, without climbing into neighbouring regions |
| Current PageBlock — default | That Page's main text, owned margins and all structured descendants, including inactive nested tab panels |
| Current DocumentBlock | That document's full text tree, including all PageBlocks and their margins, inactive Pages/tabs, and document-owned sticky/other text regions |

Important implementation detail: a Page's middle text region is not always a
distinct model Block. Page children form the main stream; paragraph margin
relations are rendered in side gutters. Represent Container scope as a root plus
an explicit region filter (`main` versus `subtree`), rather than using a DOM DIV
or inventing a saved Block. A main-region traversal excludes side-margin/sticky
branches even when those are owned by a descendant paragraph. Page/Document
traversals include those owned text relations.

- Resolve and display a breadcrumb/root identity when Find opens. Pin this scope
  during the search: navigating to a match must not silently redefine it. A
  deliberate scope change/reopen can resolve from the new editing context.
- With no Page ancestor, use Document and display that fallback; never search
  the whole workspace silently. Nested independent document editors are scope
  barriers, even when embedded in another document.
- Traverse canonical children/owned text relations independently of mounting,
  collapse or active-tab state. Do not follow arbitrary entity/backlink/graph
  references. Guard cycles along each ancestry path; don't globally discard
  repeated/transcluded occurrences.
- Order main children and their nested structures in model order, then owned
  margin/other text relations in a documented stable order. This is logical
  navigation order, not a claim to reconstruct geometric reading order.
- Navigating to a hidden result explicitly activates the required Page/tab and
  expands its ancestors, then scrolls/reveals it. Searching alone never opens
  tabs or moves focus. Tab activation must use session view state or be treated
  as navigation-only, not stale text; current saved metadata-based tab activation
  needs an adapter review before this phase passes.
- Display how many results are in hidden content and where they live. Search
  results cover all eligible content; only mounted visible matches can be painted
  now, with highlights applied on subsequent mount/reveal.
- Start with Standoff and plain-text Blocks; plain-text results advertise that
  standoff entity binding is unsupported. Code/editor widgets need adapters;
  iframe/PDF/media internals, image alt text, annotation metadata and remote
  documents are excluded initially. Report unsupported text-bearing Blocks so
  the UI does not imply a completely searched scope when adapters are missing.
- These inclusion rules intentionally differ from word-count defaults, which
  exclude margins/sticky notes. Share traversal infrastructure only with explicit
  policies, not by borrowing count totals or their exclusion rules.

## Matching defaults and options

- Default: literal substring, case-insensitive, Page scope. Spaces and punctuation
  are literal; do not trim meaningful query whitespace. Empty query means no
  results. No implicit Boolean operators, fuzzy matching, stemming or wildcard
  syntax in this local Find box.
- Independent Match case and Whole words options. Whole words prevents `he`
  matching `the`/`her`; entity-candidate callers should default Whole words on.
  Define word boundaries through Unicode-aware segmentation, not ASCII `\b`.
  Document apostrophe/hyphen/CJK behaviour in tests. For phrases, require word
  boundaries at the outer endpoints, not a single-token match.
- Advanced Regex mode: explicit toggle, pattern without slash delimiters. Flags
  controlled by UI/engine: Unicode/global matching and optional ignore-case;
  optional multiline/dotAll controls belong in advanced settings. Regex mode
  disables the separate Whole words toggle to avoid hidden pattern rewriting.
  Captures/named captures are retained for future actions. Invalid patterns show
  an error, clear that session's obsolete matches, and do not fall back to literal.
- Initial results are nonoverlapping, nonempty, Block-local matches. Skip and
  report zero-width regex results, advancing by a Unicode code point; never loop
  forever or pretend a zero-width match is an annotatable text range. Overlapping
  and zero-width replacement semantics are later work.
- Search each text run inside a Block; inline atoms are barriers, not deleted
  before matching (which could produce false joined words). Recursive scope
  does not mean a phrase may cross paragraph/table-cell/margin boundaries.
  Cross-Block phrase search is a separate deferred extension; reserve multi-range
  matches in the result model without enabling it in phase one.
- Search underlying text, not CSS uppercase/flip or rendered HTML. Map regex
  UTF-16 offsets to Cell/code-point offsets once per changed Block; reject ranges
  splitting grapheme clusters for destructive/annotation actions. Expose the
  reason instead of silently expanding a match to different text. Plain-text
  adapters declare their coordinate system explicitly.
- Accent-insensitive/canonical-normalized matching is deferred until reversible
  offset mapping exists. Initial matching must not lowercase or normalize text
  and then reuse the transformed string's offsets. State Unicode case-folding
  semantics; locale-specific full case folding is not assumed.

## Reusable API and result model (design contract; concrete API below)

`searchText({ query, options, scope, signal }) -> Promise<SearchMatchSet>`

Scope includes editor/session ID, view ID, root occurrence ID, canonical root
placement and region filter. The public caller may supply a current session Block
ID; resolve it to these identities and reject ambiguity. Saved Block IDs alone
are insufficient for transcluded/multiple occurrences.

SearchMatchSet contains:

- sessionId, generation/query signature, resolved scope, source text/structure
  versions, completion status (`complete`, `partial`, `cancelled`, `error`),
  diagnostics, returned count and whether total count is exact;
- ordered immutable matches and a canonical-target deduplication index;
- each match: session-local ID, matched text, bounded context snippet, capture
  values, breadcrumb/reveal path, and one or more range descriptors;
- each range: content key, placement/occurrence route, optional mounted node key,
  text version, start/end-exclusive offsets and coordinate kind, plus stable Cell
  boundary anchors where available;
- capability flags for highlighting, reveal, replacement and standoff annotation,
  including why an action is unavailable.

Use end-exclusive boundaries internally; convert to inclusive standoff endpoints
only when creating a real annotation. Match IDs identify results in a generation,
not durable database entities or guaranteed identities across arbitrary edits.
No DOM nodes or live Block instances belong in worker/result records.

Illustrative caller flow:

1. Find asks searchText for a match set; it optionally attaches that set to a
   highlight session and navigates its results.
2. Entity creation asks the same service for candidate matches, optionally shows
   them, lets the user select a subset, and separately looks up the entity ID.
3. Another tool consumes match records without any highlight or UI side effect.

## Highlight sessions

Use `editor/search-match` as a **session decoration type** with standoff-style
range descriptors, not a persistent annotation and not a DOM wrapper. It must
never enter canonical standoffProperties, linkedAnnotations, undo history,
autosave/dirty state, repository snapshots or Block/text clipboards.

Confirmed rendering choice: reuse the existing `rangeFragments()` →
`highlightShapes()` → SVG `DecorationLayer` pipeline. `style/highlighter` is the
existing SVG-backed annotation reference; `style/highlight` and the legacy
`codex/search/highlight` currently apply per-Cell CSS backgrounds instead.
The same SVG shape helper already serves selections, annotation previews and
entity-search target highlights. It emits filled rectangular paths, including
separate fragments for wrapped lines, without reparenting any Cells.

Search will have its own caller-owned, pointer-transparent SVG layer. Use a
translucent fill that leaves text readable and an outline for the active match;
do not blindly inherit the existing highlighter's color-dodge blend behaviour.
Paint each text-region fragment, not a single bounding rectangle spanning blank
space between lines. Scroll/resize/layout changes update geometry, not source
text. No wrapper, DOM ownership change, or wrapper-aware caret refactor belongs
to this feature.

Allow further temporary decoration types through a small extensible session
decoration registry (type, owner/session identity, range descriptors, visual
style, visibility and priority). `editor/search-match` is the first planned
consumer of that abstraction; future preview/candidate types need not become
persistent standoff properties. Existing temporary overlays can share this
infrastructure later, without requiring a broad migration for the Find release.

Proposed presentation API:

- `attachMatches(ownerId, matchSet)` creates/replaces only that owner's layer;
- `setHighlightsVisible(ownerId, visible)` toggles the layer without rerunning
  search or discarding results;
- `setMatchVisible(ownerId, matchId, visible)` supports caller-selected subsets;
- `setActiveMatch(ownerId, matchId)` distinguishes the current navigation result;
- `clearHighlights(ownerId)` / `disposeSession(ownerId)` clean up only that owner.

Find defaults to highlighting all matches. A caller's layer visibility and each
match's visibility are independent of whether the match is selected for a future
action. Hidden highlights do not mean excluded candidates. Multiple sessions can
coexist (Find, entity candidates, another tool) without deleting each other's
marks. Render with pointer-transparent background geometry; the active result
also gets an outline, so colour alone is not the identifier. Keep native text
selection/caret separate from active-match navigation. Close clears Find's layer
by default; an embedding caller explicitly owns a longer session lifetime.

## Correctness and performance gates

- Debounce queries, cache source text/offset maps per content revision, search in
  cancellable workers, and render only affected mounted Blocks. Don't repeatedly
  scan the entire DOM/document or add properties one match at a time.
- User regex can monopolize a worker. A main-thread watchdog must terminate and
  recreate that worker on timeout; AbortController alone cannot interrupt a
  synchronous regex call. Report timeout/partial status; do not run regex on the
  main thread as a fallback. Tune budgets using real documents before release.
- Batch result delivery, virtualize long result lists, cache match geometry and
  measure visible Blocks after layout. Explicit result/time limits must disclose
  truncation. A future “all” action requires a complete, fresh match set; never
  interpret a limited preview as every match.
- Invalidate affected results immediately on text edits, then rerun only dirty
  Blocks. Structural changes update scope membership/order; cancelled generations
  cannot repaint old highlights. Removed roots end the session. A snapshot
  handed to another tool is immutable and becomes stale rather than silently
  moving to different text. Initial bulk actions should conservatively require
  an unchanged snapshot; finer-grained validation can follow later.
- Search can report repeated occurrences. A future write deduplicates by content
  key and exact range to avoid modifying transcluded text twice, warns that other
  views/occurrences may change, and refuses unsupported or ambiguous targets.
- Capture baseline typing/Enter latency before implementation. Verify no new
  synchronous text scans, repository snapshots, whole-document projection builds,
  or layout reads on each keypress. Benchmark with Find open, hidden highlights,
  many matches and regex timeouts—not just with the feature idle.

## Find UI and bindings

Compact nonmodal window/bar: query, explicit scope breadcrumb, Match case, Whole
words, Regex; previous/next; “3 of 27”; show/hide highlights; close. Optional result
list shows snippets and Page/container paths, including hidden-tab indicators.
No matches is “0 of 0”; invalid regex and incomplete/unsupported scope are distinct
states. Find navigates in document order, not relevance order. Seed from a short
local text selection when useful; do not silently stringify cross-Block selection
into an unsupported cross-Block phrase query.

Register all actions in the existing bindings catalogue. Proposed defaults:
Cmd/Ctrl+F opens Find, Enter/Shift+Enter next/previous, Escape closes. Preserve
normal text-field selection/editing shortcuts and respect native/opaque widgets;
only claim Find within the document editor context. Keep query focus during
navigation, and return to the active result on close after explicit navigation
(otherwise restore the opening caret). Expose toolbar/button alternatives for
browser-reserved keys. Accessibility requires labelled controls, throttled status
announcements and a visible active-result indicator.

## Future consumers, deliberately not implemented now

Entity binding: offer explicit “Find other occurrences” controls inside entity
creation, prefilled from the selected term but with independently chosen scope.
Preview candidates with checkboxes; selection of `he`/`her` is not coreference
resolution. Default to whole words, require human review, and let users exclude
wrong referents or already annotated ranges. Bind all confirmed mentions to the
same entity ID, normally as **separate mention annotations**, not one giant linked
annotation. A single passage crossing Blocks is a different case and may retain
one linked annotation identity. Avoid duplicate identical references, and never
overwrite a conflicting entity silently. One explicit atomic undoable commit.

Replacement: consume a complete fresh candidate set, validate all targets before
writing, deduplicate shared content, detect overlapping matches, group by Block
and apply nonoverlapping edits from end to start in one transaction. Preserve
unaffected Cells/annotations, allow an empty replacement as deletion, preview
capture substitutions, and refresh matches afterward. Cross-Block replacement
and structural barriers require their own plan. Find itself has no writes.

## Phases and resumable checkpoint

- [x] Inspect old Find/entity attempts and current model/highlight infrastructure.
- [x] Compare official PKM conventions and record this proposal.
- [x] After explicit implementation authorization: scope resolver + pure search
  results, worker cancellation/regex budgets, Unicode offset mapping and tests.
- [x] Independent session decorations/visibility ownership, with no document or
  caret mutation; test coexistence and cleanup.
- [x] Find UI/bindings/navigation, including inactive tab reveal and scope pinning.
- [x] Real-document performance and browser qualification; update checkpoints
  with commands/results before declaring the initial Find feature complete.
- [ ] Separately authorize entity-candidate bulk actions and replacement later.

Acceptance fixtures: Page main/margins; table/grid cells; nested/inactive tabs and
Pages; no-Page documents; transclusions/cycles; excluded widgets; mixed-case and
literal regex punctuation; whitespace; accents/emoji/CJK; empty/zero-width/invalid
and pathological regex; overlapping candidate protection; independent highlight
sessions; edits during search; undo/redo; document close/reload; no history,
clipboard or persisted search decorations; large match sets and hidden mounts.

## Implementation checkpoint — 14 September 2026

Initial Find is implemented; no new dependencies or server/API changes.

- `runtime/text-search.ts`: `TextSearch.searchText()` and explicit
  `resolveSearchScope(editor, occurrenceKey, kind)`. Immutable, end-exclusive
  match sets retain occurrence paths, canonical-target deduplication, captures,
  Cell/UTF-16 coordinates, source versions and capabilities. Search never creates
  highlights as a side effect. The editor's reusable instance is
  `editor.find.search`; other callers may construct an independent `TextSearch`.
- `runtime/search-matching.ts`, `search.worker.ts`, `search-worker.ts`: literal
  Unicode regex matching, word/grapheme segmentation, inline-atom barriers,
  code-unit-to-Cell mapping, cached dirty-content results and cancellable worker
  execution. Queries debounce for 200 ms; source extraction yields between
  batches and inside long paragraphs. A worker is terminated after five seconds
  (including startup), with a visible error and no main-thread regex fallback.
- Preview maximum: 5,000 matches. A separate worker safety ceiling of 50,000
  intermediate candidates fails with an explicit memory-budget message. Partial
  sets and unsupported widget adapters are disclosed, never treated as all
  actionable matches. These conservative budgets can be tuned later.
- `runtime/session-decorations.ts`: typed, owner-isolated, occurrence-indexed
  session decorations. Whole-layer/per-match visibility, active match and owner
  disposal are independent of canonical annotations. Changed-content invalidation
  uses an index, with no text scan or layout read on keypress. Hidden layers are
  also invalidated, so toggling them cannot resurrect obsolete ranges.
- `rendering/standoff-editor-view.tsx`: separate pointer-transparent SVG search
  layer, fragment rectangles and active outline; no wrappers, Cell reparenting,
  blend-mode inheritance, persistence or caret-model changes. Offscreen Blocks
  defer search geometry through IntersectionObserver.
- `runtime/document-find.ts` / `rendering/document-find.tsx`: nonmodal Find bar,
  Page default, pinned Container/Page/Document scopes, literal/Match case/Whole
  words/Regex (including multiline and dotAll), count/status/snippet/breadcrumb,
  next/previous and visibility controls. Toolbar Find button and remappable
  Cmd+F (Mac)/Ctrl+F, Enter/Shift+Enter and Escape actions. Query focus stays in
  Find during navigation. Close restores the opening local selection or the
  explicitly navigated match. Searching alone does not navigate.
- Tab rows, document tab rows, sticky tabs and card surfaces accept session view
  overrides to reveal hidden ancestors without document writes or history. This
  includes initially unmounted nested tab rows. Existing manual card flips retain
  their prior saved behaviour; Find navigation itself is session-only.

### Explicit first-release boundaries

Native textarea Blocks are searched and have snippets and navigation, but cannot
paint per-match SVG ranges inside the native textarea. Results/UI disclose this;
closing on such a result selects its native range. Standoff Blocks receive the
full SVG treatment. Code/media internals remain excluded; text-bearing unsupported
Block types are reported. There is no full result-list UI yet (only the active
snippet and breadcrumb), so no large list requiring virtualization.

Matches remain Block-local. Replacement, bulk entity binding, cross-Block phrase
search, overlap/zero-width editing, normalized/accent-folded matching, and grouped
blur/flip wrappers remain deferred. Future actions must validate freshness and
capabilities, not assume that a returned preview is complete or still current.

### Verification

- Typecheck and client/server production build passed; Vite emits a separate
  search worker bundle.
- Initial full suite: 192 passed, 2 known pre-existing failures in
  `block-context-menu.test.tsx` (synthetic context-menu events omit the registered
  secondary-button value). Additional focused search cases are recorded in the
  final checkpoint below. No unrelated context-menu changes made.
- Existing inline performance (7) and split performance (6) tests pass, including
  their no-snapshot/no-whole-projection-rebuild assertions.
- `node scripts/check-document-find.mjs`: isolated Chrome, actual worker and SVG
  paths; seeded Find, hidden-tab reveal, pinned scope, query focus, close-to-match,
  no history, regex watchdog termination and successful subsequent search.
- 300-paragraph / 2,701-match Chrome fixture: model-edit p95 around 1.3 ms closed,
  1.3 ms highlighted, 1.7 ms hidden in one run; zero snapshots. These are model
  timings, not an end-to-end typing-latency guarantee; short runs include GC noise.
- Read-only `data/siena.json` loaded into a disposable editor: 39 matches, longest
  paragraph 564 Cells, mean model edit ~4.9 ms, mean edit-to-animation-frame
  ~14.6 ms, split model time ~17.3 ms, zero snapshots; undo restores the original
  encoded document exactly. No source document or database writes occurred.
- The Vernon Blake introduction is not present in this checkout's document store;
  qualification of that specific document remains a follow-up, not a claimed pass.

Final checkpoint: 14 new Find tests pass (11 engine/session/cache tests and 3 UI
tests). Final full run: **197 passed, 2 pre-existing context-menu failures**, 199
total. Typecheck, production client/server build and Chrome script pass again.
Added explicit coverage of undo followed by a different edit branch: session text
epochs are monotonic even when canonical inline revisions repeat. Nested inactive
tabs, transcluded occurrence deduplication, inline-image barriers, unsupported
widgets, cancellation, visibility ownership and stale worker responses are tested.
The concurrent final build/test/browser run showed higher timings under CPU load;
the earlier isolated figures above are indicative, not fixed latency guarantees.

For resumption: the initial scoped Find slice is complete. No commit was requested.
The next separately authorized feature can consume `TextSearch` match sets and
`SessionDecorations` without coupling itself to the Find window. Begin by reviewing
the deferred consumer contracts above rather than adding persistent search
annotations or reusing the legacy FindReplaceBlock.

Follow-up: the first such consumer is now implemented. See
`ENTITY_MATCH_CANDIDATES_PLAN.md` for entity candidate selection/exclusion and
atomic binding. It uses an independent TextSearch session and decoration owner;
shared reveal navigation now lives in `runtime/reveal-match.ts`. Ordinary Find
remains independent, and replacement remains deferred.
