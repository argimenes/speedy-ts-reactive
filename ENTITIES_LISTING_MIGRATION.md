# Document entities listing migration

Status: **planning only**. No implementation has been authorized or started.

Planning direction confirmed by the user: prioritise the reactive client window
and do not make SurrealDB optimisation, locking or index repair a prerequisite
for this slice. Keep the database limitations visible and isolate them behind a
small client contract so they can be corrected later without redesigning the UI.

Product decisions confirmed by the user:

- the listing uses a chordal entity command family;
- a linked cross-Block entity reference counts as one logical Document mention,
  even though it is stored as several local property segments.

## Requested behaviour

Open a narrow, vertical, document-scoped window listing every distinct entity
referenced by a non-deleted `codex/entity-reference` standoff property in the
current Document. The table has three sortable columns:

1. **Entity** — graph entity name.
2. **Graph** — total indexed mentions of that entity across the graph, supplied
   by the API.
3. **Document** — references in the current Document, derived only from standoff
   properties, never from matching visible text.

Activating the same column heading reverses its direction. Activating another
heading selects it and starts in that column's natural direction: Entity
ascending, numeric columns descending. Sorting is stable, with Entity then ID as
deterministic tie-breakers. The initial view should be Document descending, which
matches the converted TSX prototype's useful default.

Pointer hover over a row temporarily highlights all visible matching entity
reference ranges in yellow. Keyboard focus on a row provides the same preview.
Pointer leave, focus departure, window close, document switch and disposal remove
only this window's highlights.

## Source findings

- `src/blocks/entities-list-block.tsx` is legacy imperative Block code. It is
  excluded from `tsconfig.reactive.json` and is not the implementation surface
  for the running Solid reconstruction. It finds document properties, calls the
  old `DocumentBlock.getEntities()`, shows only Entity and local Links columns,
  sorts local counts descending once, and calls mutable property
  `highlight()`/`unhighlight()` methods on hover.
- The requested second legacy path is actually
  `src/library/original/parts/entities-listing-panel.js`; there is no
  `src/library/parts/` directory. That AMD/Knockout script expects the missing
  `/Static/Templates/Agent/text-entities-panel.html`. It contains reusable
  behavioural clues—header sorting, row hover, a draggable window and minimap
  integration—but should not be revived or supplied with a new HTML template.
- The original panel's `total` sort is still its count of properties in the
  current text. Neither old implementation provides the requested graph-wide
  count as a separate third column.
- The active renderer already has the right primitives: model-based Document
  scope traversal, Solid portal layers, focus-returning session overlays, the
  input binding catalogue, linked-annotation resolution, and owner-isolated
  session SVG decorations.
- `/api/getEntitiesJson` can hydrate names for comma-separated IDs, but it has no
  graph mention count, robust validation, unavailable-database response or tests.
  The entity-search API already computes graph counts from
  `standoff_property_refers_to_agent`, but requires a name/alias query and is not
  a suitable per-row lookup API.
- `saveDocumentIndex()` contains a comment saying old TextBlocks and
  StandoffProperties are deleted, but no deletion occurs. It upserts property
  records and inserts fresh `standoff_property_refers_to_agent` edges without a
  visible deterministic edge identity or uniqueness constraint. Removed or
  retargeted references can therefore remain represented by stale edges, and
  repeated indexing may inflate counts depending on SurrealDB relation semantics.
  Graph-wide totals may therefore reflect the present index's limitations. This
  is recorded for later database work rather than blocking the client feature.
- Cmd+E is already the Entity reference action. The binding registry represents
  one keyboard event per trigger and cannot currently express multi-step chords.
  The user confirmed a chord is intended and asked for best-judgement defaults
  that do not interfere with standard browser bindings. Cmd+E, Cmd+N and Cmd+L
  are browser commands; Edge also assigns Ctrl+E and Ctrl+Shift+E. They are not
  suitable prefix/default strokes for the new chord family.

## Scope and counting contract

Resolve the nearest enclosing `document-block` from the invocation occurrence,
then traverse its canonical children and owned relations. Include pages, inactive
tabs, tables/grids, lists, sticky areas and margins inside that Document. Stop at
nested independent `document-block` boundaries. Do not derive membership from
currently mounted DOM nodes; hidden content still belongs to the Document.

Build the entity set locally before making a network request:

- Resolve each property through `editor.linkedAnnotations.resolve()` so shared
  entity ID/deletion state is honoured.
- Include only non-deleted properties whose resolved type is exactly
  `codex/entity-reference` and whose resolved value is a non-empty string.
- Group rows by the exact entity ID contract already used by entity search. Do
  not guess at or strip an `Agent:` prefix in the client.
- Prefer the API name, fall back to `metadata.entityName`, then display the entity
  ID as an explicit unresolved fallback. A broken/missing graph record must not
  make a real document reference disappear.
- Pre-index the range descriptors for each entity during the same traversal so
  hover never rescans all document text or properties.

The confirmed definition of **Document** is logical mentions. Every ordinary
non-deleted entity-reference property counts once. All live segments sharing the
same `annotationId` count once together, even if they cross several Blocks. Use a
logical key such as `linked:<annotationId>` for linked references and a canonical
property identity for ordinary references. Never group unrelated properties only
because their ranges or entity IDs happen to match.

The current graph index creates a relation for each stored segment and does not
retain enough linked-annotation identity to guarantee the same logical collapse.
Consequently, the Graph total may count physical segments while the Document
total counts logical mentions until the deferred index model is improved. This
rare mismatch should be described in help text rather than silently changing the
user's chosen Document semantics.

Repeated projections/transclusions must not inflate the Document count: count a
canonical ordinary property or linked annotation once, while retaining every
in-scope occurrence range so each visible rendering can be highlighted.

The **Graph** value is an index count, not a live count of unsaved editor state.
The UI should explain this in the heading title/help text. Local Document counts
remain live and can legitimately differ until the document is saved and indexed.

### Deferred graph-count integrity work

Later SurrealDB work should add disposable-database tests around the document
indexer. Indexing the same document twice should leave every Agent total
unchanged; removing, deleting or retargeting a reference and indexing again
should remove the old contribution and add only the new one. A removed text Block
should likewise stop contributing.

The current schema/data needs an explicit document ownership path for cleanup.
`TextBlock` declares `documentId`, but `saveDocumentIndex()` does not currently
write it. The implementation plan should make the index replacement operation
atomic per Document where SurrealDB permits: identify the previous TextBlocks,
remove their property relations/properties that no longer exist, upsert the new
records with document ownership, and ensure exactly one entity edge per current
property. A deterministic relation identity or a delete-then-rebuild strategy is
preferable to hoping `insert_relation()` deduplicates.

Existing databases may already contain orphaned/duplicate edges, so fixing future
writes alone does not repair historical totals. Any future reindex/rebuild
procedure must be explicitly authorized and must never run against the user's
populated graph as part of ordinary UI verification. For now, label the values as
indexed Graph counts rather than presenting them as an independently audited
source of truth.

## Proposed boundaries

### 1. Pure document inventory

Add a model-only collector, provisionally
`runtime/document-entities.ts`, returning immutable rows keyed by entity ID and
their canonical mention keys plus occurrence-aware, end-exclusive Cell ranges.
It should reuse the existing Document scope rules rather than inventing a DOM
walk. Keep this collector independent of UI and network code so scope, linked
properties, transclusion and count semantics can be unit tested.

On repository changes while the window is open, recompute the local inventory.
Preserve the selected sort, update rows/counts, remove a hover preview that no
longer exists, and request summaries only for newly encountered IDs. This window
is observational and must never create an undo entry or dirty the document.

### 2. Bulk graph summary API

Treat the graph lookup as a narrow asynchronous client dependency. The inventory,
sorting and highlighting controller consumes a `loadEntitySummaries(ids, signal)`
interface and must remain fully testable with an in-memory fake. This lets the UI
slice proceed before the Node/SurrealDB implementation is optimized or locked
down. Local Document rows and counts remain useful when that dependency is absent
or fails.

Add one parameterized bulk endpoint, rather than issuing one search/request per
entity. A proposed contract is:

```text
POST /api/entities/summary
{ "ids": ["entity-id", "another-id"] }

200
{ "Success": true,
  "Results": [
    { "id": "entity-id", "name": "Entity name", "mentions": 42 }
  ]
}
```

The route should deduplicate IDs, bound array size and individual ID length,
construct SurrealDB `RecordId` values server-side, use query parameters, and
return `400` for malformed input and `503` when the graph database is unavailable.
It performs no database writes. Missing Agent rows are simply absent from
`Results`; the client keeps their local fallback rows with Graph shown as an
unavailable em dash. Empty ID input returns an empty successful result without
querying SurrealDB.

When the endpoint is revisited, its count query should count unique current
StandoffProperty sources rather than raw relation-edge rows as an additional
defence against duplicate edges. That later improvement does not replace cleanup
of stale or retargeted records.

Keep this route beside the injectable/tested entity-search router, or place it in
a similarly injectable `server/entity-summary.ts`. Do not expand the permissive
comma-string `/api/getEntitiesJson` contract for new code unless backwards
compatibility requires maintaining its old response as a wrapper.

The client should use one abortable request per inventory generation, reject
malformed response rows, ignore stale responses and retain local results when the
server is offline. Loading and errors apply to Graph counts only.

### 3. Session controller and window ownership

Represent this as session UI, not an `entities-list-block` in the canonical
document tree. A small `DocumentEntities` controller owned by `ReactiveEditor`
should manage open document/view identity, inventory, API state, sorting, active
preview and cleanup. Opening it a second time for the same Document should focus
the existing window and refresh it instead of stacking duplicates.

Extend the session overlay/layer types with `entity-list`, or add a dedicated
session service following `DocumentFind`. Render one view-local Solid portal from
`ReactiveTreeView`. Capture and restore the originating focus/caret on close.
Escape and the labelled close button close it; document switching/disposal abort
requests and remove decorations.

Use a non-modal `role="dialog"` because the user must still be able to inspect and
interact with the Document. Keep position and any drag state session-only. A
viewport-bounded draggable header is consistent with the old panel, but the
initial position should be a visible right-side inset rather than the TSX
prototype's `left: -250px`. Use a narrow responsive width (roughly 320–400 px), a
bounded height, contained scrolling and a sticky table header.

### 4. Table interaction and accessibility

Use semantic table markup with real buttons inside each `th`. Set `aria-sort` on
the active heading and include an arrow that is not the only indication of sort
state. Numeric cells align right. Long names wrap or ellipsize with a title; IDs
need not occupy a fourth visible column.

Rows should be keyboard focusable for preview, with a visible focus treatment.
Use pointer enter/leave plus focus/blur delegation on the row, not a mouse-only
handler on the name text. Sorting must retain the active entity by ID rather than
by its old row index. Provide explicit loading, empty and partial/offline states:

- no references: `No entity references in this Document`;
- graph request pending: local names/counts remain usable, Graph shows loading;
- graph unavailable or record missing: Graph shows `—`, with one non-blocking
  status message rather than an error repeated per row.

No row click action is required in the first slice. Reveal/navigation, minimap
markers, pinning, filtering and persistent selected colours are separate future
features from the legacy scripts.

### 5. Hover/focus highlighting

Attach the pre-indexed ranges to `editor.decorations` under an owner such as
`entity-list:<session-id>`, using a dedicated type and yellow fill. Session
decorations are pointer-transparent, do not alter Cell wrappers, never enter
`standoffProperties`, history, save data or the dirty state, and coexist with
Find/entity-candidate owners.

The current decoration API accepts a full `SearchMatchSet`. Prefer extracting a
small shared decoration-range input interface (or adding an `attachRanges`
method) over fabricating fake text-search results. Painting remains in the
existing `StandoffEditorView` SVG pipeline. Only mounted/visible occurrences are
painted; hovering must not activate hidden tabs/pages just to reveal them.

Clear the owner before switching entities and in all cleanup paths. Repository
updates should rebuild the current entity's valid ranges so stale positions are
never resurrected.

### 6. Input binding

Register a named, reassignable `entity.list.open` action with description,
category and scope, and route it through the existing gateway from any supported
editor Block inside a Document. Protect composition, held-key repeats, native
fields and other dialogs just as current actions do. Add a visible toolbar or
menu entry so the feature is discoverable and remains usable if a browser keeps a
shortcut.

Add a general keyboard-chord trigger to the binding model rather than special
case state in the entity-list handler. A chord is an ordered sequence of keyboard
strokes with a bounded inter-stroke timeout. Extend persistence/import migration,
validation, labelling, conflict detection and the binding recorder so chordal
bindings remain visible and reassignable like current triggers.

Do not make one trigger both a complete action and a chord prefix. Use the same
conservative **Entities** prefix on macOS, Windows and Linux:

- `Ctrl+;`, then plain `L`: Entity listing;
- `Ctrl+;`, then plain `R`: Entity reference.

`Ctrl+;` is not assigned in the current official Chrome, Firefox, Safari or Edge
browser shortcut tables inspected for this plan, and it does not overlap an
existing application binding. Plain mnemonic second strokes avoid another
browser-level modifier combination. This is a conservative web default, not a
claim that an extension, assistive technology, desktop environment or alternate
keyboard layout can never claim it; the visible actions and binding editor remain
fallbacks.

Remove Cmd+E and Ctrl+Shift+E from the shipped Entity-reference defaults when the
chord family lands: Chrome documents Cmd+E as searching for selected text, while
Edge documents Ctrl+Shift+E as opening sidebar search. Existing user overrides
must still migrate without loss, with a reserved-browser warning where relevant.
The user's earlier Cmd+E/Cmd+L idea can remain assignable, but both strokes are
standard browser commands and it should not be shipped or described as reliable.

While a prefix is pending, show a small non-modal hint such as
`Entities: L Listing · R Reference · Esc Cancel`. Prevent the prefix's browser
default immediately. A recognized second stroke runs the action and clears the
hint; Escape, timeout, focus loss or composition cancels it. An unrecognized
second stroke cancels the chord without swallowing that stroke's ordinary editor
behaviour. Key repeat must not start or complete a chord.

Prefix conflicts must be detected structurally: duplicate sequences conflict,
and a complete one-stroke action cannot also be the prefix of another action in
an overlapping scope. Existing version-1 saved bindings must migrate without
loss; they do not gain chords implicitly.

### Browser shortcut audit

Checked against the current official shortcut references on 14 September 2026:

- [Google Chrome keyboard shortcuts](https://support.google.com/chrome/answer/157179)
- [Mozilla Firefox keyboard shortcuts](https://support.mozilla.org/kb/Keyboard%20shortcuts)
- [Apple Safari keyboard shortcuts](https://support.apple.com/guide/safari/keyboard-shortcuts-and-gestures-cpsh003/mac)
- [Microsoft Edge keyboard shortcuts](https://support.microsoft.com/en-us/edge/keyboard-shortcuts-in-microsoft-edge)

Maintain a small platform-aware reserved-shortcut warning catalogue sourced from
these browser-level commands. It protects defaults and informs custom assignment;
it should not pretend to enumerate OS, extension or assistive-technology keys.

Do not add an ad hoc document-level `keydown` listener outside the registry.

## Verification plan

### Model tests

- exact distinct IDs and property-derived counts across ordinary children,
  pages, margins, tables/lists and inactive tabs;
- nested Document boundary, deleted/malformed properties, unresolved entities,
  cached metadata names and linked-property resolution;
- logical linked-mention counting, canonical transclusion deduplication and
  occurrence ranges for highlighting;
- repository edits while open update counts without history or save-state side
  effects.

### Graph adapter/API contract tests

- client behaviour for empty, duplicate and missing IDs using the adapter fake;
- names and graph counts map to the correct local entity IDs regardless of row
  order;
- cancellation, stale responses, malformed responses and unavailable graph;
- server validation, parameterization and no-mutation tests can land with the
  later Node/SurrealDB hardening pass.

### Deferred index integrity tests

- indexing an unchanged Document twice is idempotent;
- deleting, retargeting or tombstoning a reference removes its former count;
- removing a text Block removes all of its indexed reference contributions;
- an indexing failure cannot leave a silently half-replaced Document index;
- any rebuild tool is opt-in, dry-run capable where practical, and never invoked
  by the listing UI or ordinary tests.

### Solid/UI tests

- open/focus/close/focus restoration, one window per Document and correct view;
- immediate local rows, loading/offline/missing-record fallbacks and stale request
  cancellation;
- all three header sorts, repeated reversal, deterministic ties and `aria-sort`;
- row pointer and keyboard preview highlights only matching property ranges,
  every visible occurrence, and clears on leave, re-sort, close and mutation;
- coexistence with ordinary Find and entity-candidate highlights;
- empty state, long names, narrow viewport and large scrollable tables.

### Input and browser checks

- final shortcut, reassignment/conflict reporting, repeat/composition guards and
  no interception in native inputs/dialogs;
- one- and two-stroke dispatch, timeout/Escape/focus-loss cancellation,
  unrecognized-stroke pass-through, prefix hints and version-1 preference
  migration;
- Chrome, Firefox, Safari and Edge checks that the default Ctrl+; then plain L/R
  sequences work, and that assigning known browser-reserved combinations gives a
  useful warning/fallback;
- document remains editable while the non-modal panel is open;
- a large fixture (for example 10,000 properties / 1,000 entity IDs) performs one
  model pass, bounded bulk API calls and no full-document scan on hover.

Run focused tests first, then `npm test`, `npm run typecheck`, `npm run build`, and
an actual workspace browser smoke test. No populated graph or document store is
modified during verification.

## Recommended implementation order after approval

1. Extend and test the configurable binding system with chord triggers and the
   agreed Entities prefix family.
2. Implement and test the pure document inventory with logical linked mentions.
3. Add the graph-summary client interface and test fake. Connect the simplest
   compatible read-only endpoint available; keep graph failure non-blocking.
4. Add the editor session controller and owner-isolated range decorations.
5. Add the Solid window/table, sorting, states and accessible pointer/keyboard
   preview.
6. Wire the agreed binding and visible action.
7. Run client automated/performance/browser checks and record the completed
   checkpoint in this document and `RESTRUCTURE_PROGRESS.md`.
8. Revisit Node/SurrealDB validation, idempotent indexing and historical index
   rebuilding as a separately scoped backend task.

## Explicitly deferred

Filtering/search within the list, clicking through to a mention, minimap marks,
pinning persistent highlights, entity editing/creation, graph writes, graph count
live subscriptions, SurrealDB index repair/locking, historical graph rebuilding,
virtualization before measurement proves it necessary, and reviving the old
Knockout template or legacy Block class.
