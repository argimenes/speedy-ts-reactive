# Entity reference: find and bind matching mentions

Status: **implemented**, 14 September 2026.
The subsequent user request authorizes the candidate workflow and exclusion UI.
This extends `ENTITY_SEARCH_MIGRATION.md` using the implemented scoped Find
foundation in `SCOPED_FIND_MIGRATION.md`.

## Original behaviour verified

- `src/components/search-entities.tsx`, Control-A handler: reads the source
  selection's text (not the edited entity-name query), constructs FindReplaceBlock,
  stores its matches and applies `codex/search/highlight` properties. The label
  explicitly says all text Blocks. This is candidate collection, not native text
  selection and not Block selection.
- `src/components/find-replace.tsx`, `findMatches()`: searches the manager's
  registered Standoff Blocks, with no explicit document/page boundary. Reuse the
  new model-based scope resolver instead: mounted Blocks are not complete scope
  membership, and a manager can span multiple documents.
- `src/blocks/document-block.ts`, `applyEntityReferenceToText()` / onBulkSubmit:
  if no matches were collected, falls back to the original selection. Otherwise
  groups matches by Block and creates one `codex/entity-reference` per match,
  all sharing the chosen entity value. These are separate mentions, not one
  cross-Block annotation. It clears search highlights by type.
- Legacy Enter uses `search[currentResultIndex()]`, unlike the rendered
  `search.Results` list; do not reproduce that inconsistent lookup. Legacy bulk
  callbacks are invoked without awaiting their completion before closing.
- The converted `runtime/entity-search.ts` already captures source ranges and
  revision, creates entity ID/name metadata, and supports one linked annotation
  for a single passage crossing Blocks. The converted dialog currently commits
  immediately on selecting an entity and closes on any repository mutation.

## Proposed user workflow

Keep today's single-selection flow unchanged unless the user explicitly enters
**Find other occurrences** mode.

1. Select a passage and open entity search as today. Retain an immutable original
   target; do not create an annotation merely by opening the window.
2. Activate **Find/select all matching mentions** by button or its registered
   shortcut. Expand a candidate-review section in the same entity window.
3. Seed a separate **Mention text** field from the captured passage. Keep it
   independent of **Search entities**: searching the database for “Vernon Blake”
   must not change a mention query of “he”. Changing either query must not alter
   the other. A chosen entity remains visibly nominated by name and ID.
4. Default to Page scope, literal, case-insensitive, whole words. Offer the same
   Container/Page/Document choices, explicit breadcrumb/fallback and recursive
   membership as Find. Match case and substring options are visible; Regex may
   live in an advanced section using the existing worker safeguards. Entity API
   alias/partial options apply only to database lookup, not mention matching.
5. Show matching candidates with checkboxes, text/context, location breadcrumb,
   eligibility/conflict status and a Reveal action. Use bounded paging or
   virtualization for the candidate table. “Select all eligible” applies across
   the entire returned set, not just the visible table page; say so explicitly.
   Provide Select none and Highlight visibility independently.
6. An explicit “Find/select all” action checks all eligible, unique candidates
   when the initial complete result arrives. Subsequent query/option/scope changes
   clear approval of the old set: keep the original target's explicit checkbox,
   but require Select all or individual checks for the new candidate generation.
   Do not silently transfer checked IDs across generations or reselect exclusions.
7. In bulk mode, selecting an entity **nominates** it; it does not write or close.
   Show **Bind N selected mentions to [entity name]** as a separate commit button.
   Only that explicit action creates annotations. Enter in entity results
   nominates; Enter/Space on the commit button confirms. No global Enter-to-bulk-
   commit shortcut while typing a query. Cancel makes no changes.
8. Commit once, close on success, restore editing context and clear only this
   window's temporary highlights. On validation/commit failure, retain the window
   and selections with a useful explanation; never claim partial success.

### Original selection and cross-Block passages

Show the original passage as a distinct, initially checked target. If search
returns its identical canonical range, merge the rows: it must be counted/bound
only once. The user may uncheck it explicitly. An empty candidate search must not
silently fall back to binding the original after the user deselects everything;
zero checked targets disables commit.

The original selection may not satisfy whole-word matching (e.g. it is a selected
substring). Its explicit selection is still intentional; label it as the original
target instead of pretending it was found by the query. Editing Mention text
changes the additional search, not the original target's captured text/ranges.

For a cross-Block original passage, retain its ranges as **one mention**, using
the existing linked-annotation representation. Do not silently join those ranges
into a searchable phrase: scoped Find is currently Block-local. Require an
explicit Block-local Mention text for additional candidates, with a short notice.
Each additional occurrence receives its own annotation identity. Never pass all
discontiguous mentions to `createForSegments()` as one giant annotation.

## Agreed inline exclusion control

User approved this addition after reviewing the plan and subsequently authorized
implementation together with the candidate workflow.

- Show an unobtrusive circled × just to the right and slightly above a candidate
  match's final highlighted fragment. For multiline matches, use the final
  fragment rather than a bounding rectangle spanning all lines.
- Reveal the control on match hover, when the candidate is active, or when the
  control has keyboard focus. Keep it visible while the pointer moves from the
  highlighted text to the control. Avoid covering adjacent text; clamp/adjust
  placement at viewport or document edges.
- Clicking means **exclude this mention from the pending entity binding**. It
  never deletes text, removes an existing annotation, or modifies the document.
  Route the action through the same candidate-selection state as the list
  checkbox; update the checked count and confirmation button immediately.
- Retain excluded candidates in the review list, unchecked, so they can be
  restored. Offer Undo exclusion or rechecking; do not discard the match record
  or rerun the search to restore it. Its candidate highlight/control can disappear
  upon exclusion, independently of the session's overall visibility setting.
- For transcluded/shared text, exclusion applies to the unique canonical target
  and synchronizes every displayed occurrence and list row for that target.
- Use a real focusable button labelled “Exclude this mention”, with a tooltip and
  visible focus styling. SVG highlight geometry remains pointer-transparent;
  only the small button receives pointer events. Prevent its activation from
  moving the editor caret or initiating text/Block selection or drag operations.
- This control belongs only to the entity-candidate owner/session. It does not
  appear on ordinary Find highlights or affect another caller's match set.
- Anchor buttons using the existing measured range fragments; update with
  layout/scroll/reveal and render only relevant visible controls. Do not add a
  separate whole-document measurement pass or per-character wrappers.

Extend acceptance tests with checkbox/count synchronization, undo/reinclude,
multiline placement, edge clamping, hover-to-button movement, keyboard activation,
transclusion synchronization, no caret/document/history mutation, cleanup on
cancel, and coexistence with ordinary Find highlights.

## Keyboard proposal and concern

Control-A has useful historical meaning here, but text fields must retain native
editing shortcuts (including Cmd+A select-all on Mac and platform-specific
Control-A behaviour). Therefore register an action with name, description,
category/tags and a scoped handler, not an unconditional keydown interception.

- Proposed action: `entity.candidates.selectAll`, “Find/select all matching
  mentions”, category Entity references, tags search/bulk/selection.
- Control-A outside text-entry controls in the entity window starts candidate
  search if needed, or selects all eligible candidates in the current fresh set.
  Add Cmd+A in that same non-text context on Mac.
- Offer Ctrl+Shift+A / Cmd+Shift+A as the explicit “Find other occurrences”
  shortcut usable from query fields, subject to checking existing binding
  conflicts before assigning defaults. The visible button is always available.
- Within candidate rows, Up/Down moves the active candidate and Space toggles its
  checkbox; within entity results, Up/Down continues to select an entity. Tab
  changes regions; Escape cancels. Native input/select/button behaviour wins.
- Show actual registry-assigned shortcut labels. Test custom reassignment and
  ensure browser/editor Select All is not intercepted outside this window.

These defaults are now registered. The field-safe opener uses Cmd+Shift+A on Mac
and Ctrl+Shift+A elsewhere; Control-A outside fields is supported on all platforms,
with Cmd+A additionally supported on Mac. All bindings remain reassignable.

## Service and state boundaries

Introduce a small entity-candidate session, separate from the dialog JSX:

- `TextSearch` instance per candidate session, reusing the engine implementation
  without opening or controlling `DocumentFind`. Independent caches avoid query
  churn against an already open Find bar. Dispose the instance on close.
- Resolve and pin scope from the captured owner occurrence. Consume immutable
  SearchMatchSet records; maintain nominated entity, checked canonical target
  keys, generation, status and original target separately. Match IDs are only
  meaningful within their returned generation.
- Owner `entity-candidates:<overlay key>` in SessionDecorations. Reuse SVG search
  rectangles, optionally a distinct colour/type such as `editor/entity-candidate`.
  Visibility is not approval: a hidden highlight must not silently uncheck a
  candidate. One session must not clear another session's marks.
- Extract shared **reveal-match** navigation from DocumentFind's current method
  into an editor-level utility. Reuse session tab/card activation and range
  scrolling without taking over Find's state or moving focus out of the modal.
  Search itself must never activate hidden tabs.
- Retain generation/AbortController protection for text search independently of
  entity API request cancellation. A stale reply must not nominate an entity,
  repaint candidates, or change the chosen set. Editing the entity-name query
  clears any prior nomination until the user explicitly chooses a result again.
- Initial safe policy: retain the current close-on-document-mutation behaviour,
  with all candidate state/highlights disposed. The commit path uses the existing
  guarded own-write mechanism so it does not cancel itself. In-dialog refresh
  after external edits is a later enhancement, not silent target rebasing.

## Eligibility, duplicates and conflicts

Text matches are candidates, not assertions of identity: especially for pronouns,
spelling variants and ambiguous names. The application must not claim coreference
resolution or auto-bind without review.

Preflight and visibly classify candidates:

- Require current occurrence/content identities, valid nonempty Cell ranges and
  `capabilities.annotate`; verify actual text and current repository revision.
  The search engine's session text epochs are not canonical inlineRevision values
  and must not be compared as if they were. Exact snapshot revision plus current
  target/range/text validation is the initial conservative freshness gate.
- Plain-text textarea results and grapheme-splitting matches remain visible but
  disabled for annotation, with reasons. Code/widget exclusions remain disclosed.
- Canonical content key plus exact range(s) identifies a write target. Repeated
  transclusions may list several locations but are checked/grouped as one mention
  write; counts distinguish placements from unique targets. Warn that editing
  shared content also affects occurrences outside the chosen view/scope.
- Exact same-range reference to the nominated entity: already linked, skip rather
  than duplicate. Resolve linked definitions as well as ordinary properties and
  ignore deleted properties. Use the existing entity-ID contract, not guessed
  prefix stripping that could conflate different IDs.
- Different-entity or partially overlapping entity references: mark as conflicts
  and exclude by default. Initial bulk binding does not overwrite/retarget them.
  Ordinary style annotations are not conflicts. Overlaps between selected pending
  targets (including the original passage) require choosing one, not silent merge.
- Entity nomination can change duplicate/conflict classifications; recompute them
  and update the confirmation count. Do not auto-check newly eligible rows.
- A partial/truncated, cancelled, errored or stale set must never become “all
  matches”. Initial conservative release disables bulk commit for incomplete
  searches and asks the user to narrow the scope/query. Existing 5,000-match and
  worker time/memory limits remain; do not bypass them for this consumer.

## Atomic document operation

Proposed command/service: bind reviewed unique mention targets to a nominated
existing entity. Preflight every selected target before any mutation; recheck
revision immediately before synchronous commit (no network awaits mid-commit).

Group additions per canonical content record, preserving all existing properties.
Create unique annotation IDs and store `value`, `metadata.entityId` and
`metadata.entityName` using current conventions. Use independent properties for
separate mentions; only an individual multi-range original mention uses a shared
linked definition. Convert end-exclusive search ranges to inclusive standoff ends
at this boundary. Apply all additions in **one undoable transaction**.

Avoid calling `chooseEntity()` in a loop: its revision guard and immediate-write
semantics are for a single target and would not provide this atomic bulk workflow.
Existing `TreeCommands.transaction()` takes a snapshot for its draft; acceptable
for an explicit bulk operation, but measure its cost and batch one payload update
per Block, never one snapshot/commit per match. All-invalid/already-linked targets
produce a no-op with a clear count, not an empty history entry.

No new database APIs, entity creation or immediate graph/index writes are planned.
Entity lookup keeps using the existing Node/SurrealDB name/alias routes. Annotation
changes are local until the normal save/indexing workflow; server mention counts
may therefore lag and should not be incremented optimistically as if persisted.

## Implementation sequence and resumable checkpoint

- [x] Verify legacy Control-A and document bulk callback; inspect converted APIs.
- [x] Record workflow, keyboard proposal, validation and atomicity requirements.
- [x] On explicit implementation authorization, add candidate-session state and
  pure target classification/deduplication tests; no document writes yet.
- [x] Extract shared reveal navigation with regression tests for ordinary Find;
  add independently owned candidate highlights and lifecycle cleanup.
- [x] Add opt-in candidate review UI, separate mention/entity queries, nominated
  entity, registry bindings and explicit confirmation; preserve single mode.
- [x] Add prevalidated atomic bulk command, duplicate/conflict handling and
  independent versus linked mention creation.
- [x] Test end-to-end and performance, update this checkpoint with actual results.

Acceptance tests: seeded original and fallback-to-single mode; native text-field
shortcuts versus scoped Control-A/Cmd+A; all eligible vs visible page; checkbox
exclusions surviving entity lookup; separate queries; zero checked; incomplete
results; stale edits/undo/redo and late responses; Page margins and nested inactive
tabs; hidden highlight ownership with Find open; Unicode/atoms; transclusions;
existing same/different/linked entity references; single cross-Block original;
whole-word mismatch of original; one-step undo/redo; save/reload metadata; failure
without partial writes; large candidate lists and one update per affected Block.
Use disposable fixtures and mocked lookup/in-memory database tests, never live
document-store or populated-database writes for verification.

The planning checkpoint above is complete; the subsequent implementation and
verification are recorded below. No commit was requested.

## Implementation checkpoint

Implementation is complete in `runtime/entity-candidates.ts` and the entity search
views. Shared navigation is extracted into `runtime/reveal-match.ts`; session
decorations support an optional owner-managed exclude action. Measured SVG fragments
anchor circled exclusion buttons without wrappers. Bulk binding uses one repository
operation batch and one history entry, avoiding per-Block transaction draft copies.

Follow-up requirement retained explicitly: **any overlap with an existing reference
to the nominated entity is excluded**, not merely an identical text range. Larger,
smaller and linked reference ranges are checked, with a distinct visible reason;
commit preflight independently enforces the exclusion. Other-entity overlaps also
remain excluded, and ordinary styles remain untouched.

### Concrete implementation and verification

- `EntityCandidates` owns independent TextSearch state, original target, scope,
  nomination, checked unique targets, exclusion undo and session cleanup. Candidate
  rows are paged 25 at a time; Select all covers all eligible rows, not one page.
  Query/option changes require renewed approval of additional matches. Subsequent
  entity-query keystrokes do not repeatedly reclassify candidates once nomination
  has already been cleared.
- `bindEntityCandidates()` prevalidates freshness, identity, bounds, actual text,
  capabilities and entity overlaps, deduplicates targets, then commits one batch.
  Separate mentions get unique IDs; only the single multi-Block original uses a
  linked definition. Empty/already-linked direct batches create no history entry.
- Measured fragments anchor accessible circled × buttons on the final visible
  line, clamped to document/viewport edges. Hover/active/focus reveals the control;
  exclusion and Undo exclusion synchronize the row and all shared occurrences.
  Keyboard events on these buttons are isolated from paragraph-edit bindings.
- Bulk review is nonmodal: document-side controls, scrollbars and tab navigation
  do not dismiss it. Single-selection mode retains its previous behaviour. Actual
  repository mutation still closes review and disposes candidate state/highlights.
- 16 new tests pass: 10 runtime, 3 candidate UI and 3 geometry cases. Coverage
  includes same-entity larger/smaller/linked overlaps, atomic save/undo/redo,
  independent/linked mention identities, partial/stale rejection, transclusions,
  original deduplication, grapheme restrictions, shortcuts, exclusion recovery,
  query independence, no premature commits and geometry placement/clamping.
- A 300-mention / 100-Block fixture commits exactly once with 100 content updates
  and two repository snapshots, independent of match count. One Undo removes the
  whole batch. The operation uses a single validated repository batch rather than
  repeatedly cloning a TreeCommands transaction draft per affected Block.
- Latest full suite: **213 passed / 215 total**; the same two pre-existing
  `block-context-menu.test.tsx` synthetic-button failures remain. Existing Find,
  entity search, annotation monitor, typing and split tests pass.
- Typecheck and client/server builds pass. `node scripts/check-document-find.mjs`
  passes the real Chrome worker/SVG workflow plus candidate review: pointer
  exclusion preserves focus/caret, undo restores it, ordinary Find remains
  unchanged, nomination makes no writes, 28 mentions get 28 distinct IDs, one
  Undo removes them all. Lookup is mocked; no populated database was touched.
  The script cleans up only its disposable Chrome profile and owned stdio pipes.

No server/schema changes, entity creation, source document writes or live database
writes were made. Replacement, automatic coreference resolution, conflicting
reference retargeting and edits to incomplete search sets remain out of scope.
# Selection-free launching

Partial-coverage correction: unsupported blocks (such as code-mirror-block) or a preview limit do not invalidate individually reviewed, exact text ranges. Bind accepts checked targets from completed or partial searches, retaining all per-target freshness, capability, text and overlap validation. Failed/cancelled searches remain blocked. Automatic/select-all selection still requires complete, exact coverage. The UI explains incomplete coverage, visibly styles disabled buttons and shows the reason next to Bind.

Layout follow-up: use a wide, responsive two-column window with independently scrolling entity lookup (left) and always-present mention search (right). Search additional occurrences is enabled initially; a checkbox can pause it and return to selected-text-only linking. Pausing cancels pending search and clears its decorations, without changing the document. With no original selection, pausing cannot create a reference. Re-enabling refreshes candidates with existing scope/options. Small viewports stack the columns.

The entity toolbar and existing entity shortcut open with selected text when present. A collapsed caret does not infer a word: without a selection, Mention text and Search entities start empty. The window opens directly in candidate-review mode, scoped to the current Page (using the existing explicit scope fallback). There is no pinned original candidate in this mode; nomination alone cannot write an annotation. Users enter mention text, review/select matches, nominate an entity and explicitly Bind. Existing selected-text and cross-Block workflows remain unchanged.
