# Mutable OS Tables and Columns Investigation and Implementation Plan

**Status:** Architecture and three increments approved. Increment 1 is implemented with correctness qualification and an explicit structural-latency limit; command/UI integration remains Increment 2. Existing task-list work is retained. See the [Increment 1 report](TABLES_AND_COLUMNS_INCREMENT_1_QUALIFICATION.md).

**Recommendation:** extend the existing table/grid family and canonical commands. Create new layouts as `table-block → table-row-block → table-cell-block`, retaining existing `grid-*` documents and supporting both families through the same operations. A separate ColumnBlock, layout engine or document migration is unnecessary.

Two product decisions were confirmed during investigation:

- Preserve columns with **horizontal scrolling** when the document pane is too narrow.
- Allow slash commands **anywhere within the current Block**, including mid-paragraph. Successful execution consumes only the invocation; it wraps the original whole Block. This is not restricted to an initial prefix.

The overall plan is approved, with the refinements below incorporated. No new keyboard bindings are authorised.

### Approved refinements

- **Independent cell content is central:** a single-row table can hold three paragraphs and a nested list in one cell, one paragraph in its neighbour, and any other supported Block sequence in another. Each cell flows vertically on its own; neighbouring child counts need not match. Row height is the tallest cell.
- **Individual list/task-item movement remains restricted initially.** Canonical movement retains an item's identity, annotations and `checked` state, but its bullet/number and ordered-list start belong to its enclosing list. Bare extraction therefore does not preserve the item's complete structural meaning. Whole lists and already-standalone task Blocks, including compound tasks, can move intact. No new list wrapper/conversion policy is added here.
- **Content transfer gets its own contextual action in Increment 2:** “Move selected Blocks to cell…” selects a destination and appends the selected sequence. It is distinct from “Swap cell…” and adds no keyboard shortcut.
- **Future widths fit the existing format:** optional table-owned `metadata.tableColumns = { version: 1, weights: number[] }` stores positive relative weights in column order. Native save/reload preserves it. Column insertion/removal adjusts that array; cell/row swaps do not move widths. Unknown metadata remains intact. The first release still renders equal widths; no resize control is implemented.
- **Dissolution removes direct shells only:** the canonical operation supplies `/unc` in Increment 2. Direct cell child sequences move out in row-major order with nested subtrees intact. Individual-cell extraction remains deferred.
- **Correctness before optimisation:** use existing canonical transactions and retained mounts; benchmark explicit operations and ordinary typing separately. No specialised table transaction or broad renderer rewrite is presumed necessary.

## 1. Verified current state

The investigation inspected the current working tree, including the preceding task-list changes, against repository HEAD `7aa2efd`. “Verified” below means source inspection plus the stated checks, not qualification of the proposed feature.

| Area | Concrete implementation | Verified finding and implication |
| --- | --- | --- |
| Legacy tables | [tables-blocks.ts](../../src/blocks/tables-blocks.ts), [grid-block.ts](../../src/blocks/grid-block.ts), [document-block.ts](../../src/blocks/document-block.ts) | Both table and grid families already exist. Legacy grid code includes insertion, swapping, merging and destructuring through mutable arrays/DOM and manager reindexing. Reuse its semantics as a reference, not its mutation implementation. |
| Reactive registration | [register-core-views.ts](../../src/rendering/register-core-views.ts) | `table-block`/`grid-block`, their rows and their cells already share renderer registrations. Cells have container capabilities. |
| Rendering | [core-block-views.tsx](../../src/rendering/core-block-views.tsx), [index.css](../../src/index.css) | Table/row/cell views render arbitrary `ChildBlocks`, using CSS table layout and `table`, `row`, `cell` roles. Header metadata selects `columnheader`. Cells top-align and have borders/padding. There is no special text-only cell editor. |
| Host styling | [workspace-demo.css](../../src/demo/workspace-demo.css) | Equal sizing in the inspected Flint host comes from `.workspace-demo .reactive-table { table-layout: fixed; }`, with cell overflow wrapping. The core stylesheet alone does not establish this contract. Promote the required layout behaviour into the table component’s own styling rather than depending on host/demo CSS. |
| Existing operations | [block-menu-actions.ts](../../src/runtime/block-menu-actions.ts) | Menus create grids, convert one Block to a 1×2 grid, add rows, move cells horizontally/vertically, merge cells and destructure a grid. These actions recognise `grid-*`, not the imported `table-*` family. No complete column insertion/removal or multi-Block distribution service exists here. |
| Structural commands | [commands.ts](../../src/block-tree/commands.ts), [repository.ts](../../src/block-tree/repository.ts) | Insert/move/unwrap and transactions provide canonical mutation and Undo. `childrenOf()` reads the pending transaction. Generic transactions capture a repository snapshot; generic structural planning also derives locations and plans intermediate drafts. They are a correctness foundation, not proof of bounded large-document cost. |
| Identity and ownership | [definition-ownership.ts](../../src/block-tree/definition-ownership.ts), [types.ts](../../src/block-tree/types.ts) | Authored Block/content identity, placement identity and mounted occurrence identity are distinct. Fresh definitions inherit document ownership; moving existing definitions does not redefine them. Resource registrations and owned resource transfers have separate restrictions. |
| Whole-Block selection | [block-selection.ts](../../src/runtime/block-selection.ts), [block-selection.tsx](../../src/rendering/block-selection.tsx) | Selection stores occurrence, placement, content and view identity. `actionTargets()` removes ancestor/descendant duplication and respects whole SurfaceBlocks. Rows and cells are explicitly excluded from ordinary eligibility. Existing drag reorder requires a common parent; it is not a cross-cell transfer operation. |
| Text selection | [cross-block-selection.ts](../../src/runtime/cross-block-selection.ts), [selection-snapshot.ts](../../src/runtime/selection-snapshot.ts) | Text ranges differ from Block selection. Ordinary cross-Block editing is restricted to compatible sibling paragraph streams; a rectangular cell selection is not implemented. Do not reinterpret selected text as selected Blocks. |
| Slash completion | [model.ts](../../src/features/autocomplete/model.ts), [session.ts](../../src/features/autocomplete/session.ts), [index.tsx](../../src/features/autocomplete/index.tsx) | The recogniser already accepts `/` after a text boundary anywhere in a paragraph and reads at most a 256-cell suffix. Commands currently use name-substring filtering and a fixed candidate list. `/c2`, `/mc l`, etc. have no registered semantics. Recognition is available; alias/argument dispatch needs a small explicit extension. |
| Structural slash precedent | [block-surfaces.ts](../../src/runtime/block-surfaces.ts) | Container/surface commands already remove a validated invocation through native inline editing inside the structural transaction. They also guard ordinary placements, shared occurrences, composition and live media continuity. Adapt this path rather than adding a second slash listener. |
| Mount continuity | [block-outlet.tsx](../../src/rendering/block-outlet.tsx), [retained-block-outlets.ts](../../src/rendering/retained-block-outlets.ts), [context.tsx](../../src/reactive-editor/context.tsx) | Retained outlets can reparent the same rendered root. They are currently enabled with `reversibleBlocks`; state-preserving media movement has additional browser requirements. Native data identity alone does not establish live viewer continuity. |
| Native persistence and clipboard | [native-resource.ts](../../src/persistence/native-resource.ts), [serializer.ts](../../src/interchange/serializer.ts), [materialize.ts](../../src/interchange/materialize.ts), [mutable-clipboard.ts](../../src/runtime/mutable-clipboard.ts) | Both type families are admitted. Native data carries subtrees, payload and relations. Clipboard copy has separate fresh-identity semantics; table movement must use move commands rather than clipboard cloning. |
| HTML/Markdown | [html-import.ts](../../src/interchange/html-import.ts), [markdown-import.ts](../../src/interchange/markdown-import.ts), [export-plan.ts](../../src/interchange/export-plan.ts) | HTML and GFM imports create `table-*` trees. Span metadata is retained with a flattening warning, not implemented as grid occupancy. HTML export supports both families. Markdown emits pipe tables only for simple rectangular header tables; headerless or rich tables currently become labelled rows with a warning. |
| Flint and geometry | [shell.tsx](../../src/features/flint/shell.tsx), [measurements.ts](../../src/runtime/measurements.ts), [range-rendering.tsx](../../src/rendering/range-rendering.tsx) | Reuse the document host, focus services and annotation geometry path. Read-only storage is not a reading presentation mode. No dedicated document read/edit presentation switch was identified in the inspected Flint/table paths. |

### Existing behaviour exercised

The [Chromium probe](evidence/tables-and-columns/probe-existing.mjs) runs the current menu actions inside real Flint components, using an in-memory copy of a native letter. [Observations](evidence/tables-and-columns/observations.json) and a [screenshot](evidence/tables-and-columns/existing-grid-wide.png) are retained.

| Probe | Observation |
| --- | --- |
| Convert annotated TextBlock to grid | Same content and placement identities; original entity annotation and owned margin survive; same mounted text root. |
| Selection restoration | Caret at offset 4 becomes offset 0. The existing menu’s focus helper deliberately focuses the start; this needs a targeted correction for the new operations. |
| Undo/Redo | One Undo restores the ordinary Block; Redo restores its grid placement and identity. |
| Native serialization/reload | Original Block ID, entity annotation and owned margin survive reopening serialized native bytes in a fresh editor. |
| Snapshot instrumentation | One repository snapshot for the measured single-Block conversion. This counts snapshots only, not all cloning or graph walks. |
| Structural selection | Current row and cell targets are both ineligible for ordinary Block selection. |
| Four-column sizing | A 1,031 px table has four 257.5 px cells. Constraining the table itself to 440 px leaves four 109.75 px cells and increases the row height from about 104 to 267 px. This is a constrained-width probe, not a complete responsive viewport qualification. |
| Nested grid | Renders within an outer cell. Current “Destructure grid” also dissolves the nested grid; Undo restores it. New dissolution must stop at the chosen table’s direct shells. |

Existing tests run: **161 passed, 1 failed, and 1 uncaught error across eight files**. The failure is the Block drag/drop test: its mock `DataTransfer` omits `files`, while the handler reads `files.length`. Running that file on unchanged `7aa2efd` reproduces the same failure and uncaught error, with 16 tests passing. It is a baseline qualification issue, not evidence of a new table defect. No production or test fix was made during this investigation.

Passing suites cover the Block menu (12), reversible surfaces (43), autocomplete (36), native resources (15), HTML import (14), Markdown import (9), and document interchange (16); 16 Block-selection tests also pass. See [test log](evidence/tables-and-columns/tests.txt) and [baseline reproduction](evidence/tables-and-columns/baseline-selection.txt). These are foundation checks, not acceptance tests for unimplemented table commands.

## 2. Architecture and lifecycle invariants

Use one genuine rectangular structure for both spatial columns and ordinary multi-row tables. New layouts use the table family because it already matches semantic import/export. Existing grids keep their original type names; operations use a small family adapter and create matching row/cell types when editing them. Do not migrate or silently rename imported structures.

```xml
<table-block id="new-table">
  <table-row-block id="new-row-1">
    <table-cell-block id="new-cell-1">
      <standoff-editor-block id="original-A">
        <!-- Existing Cells, standoff properties, relations and descendants -->
      </standoff-editor-block>
    </table-cell-block>
    <table-cell-block id="new-cell-2">
      <container-block id="original-B">
        <!-- Original subtree, including lists or SurfaceBlocks -->
      </container-block>
    </table-cell-block>
    <table-cell-block id="new-cell-3">
      <standoff-editor-block id="new-empty-text" />
    </table-cell-block>
  </table-row-block>
</table-block>
```

1. Each new table has at least one row and equal cell counts per row. A cell holds an ordered sequence of ordinary child Blocks, not an inline text field. New empty cells receive one editable empty TextBlock.
2. The original selected placements move into cells. Do not encode/decode, clone or reconstruct those Blocks. Only the table shells and genuinely empty cell TextBlocks receive new identities.
3. Keep content ownership in the same active Document. Reject unsupported resource roots, owned-relation placements, reference-placement transfers, cyclic targets and cross-document selections before mutation.
4. Preserve all descendants, annotations, task state, list state, owned/opaque relations and unknown payload fields of moved Blocks. A selected SurfaceBlock carries both faces; a selected ContainerBlock is one item. Do not flatten either to distribute its children.
5. A one-row table provides independent vertical content flow in each cell. Its row height is still the tallest cell; the next row begins below that height. Independent masonry rows or independently scrolling cell panes are different models and are not proposed.
6. Equal column widths are the default. Width changes invalidate affected text layout and annotation geometry, not the entire document unconditionally. Use the existing caches and frame-coalesced read-before-write path, accounting for pane size, font changes, zoom and horizontal scroll.
7. One accepted structural action publishes one history entry. Validation errors leave both structure and invocation text unchanged. No async transaction remains open while a command menu is displayed.
8. Restore focus from `{view, placement, content, local selection}` after publication. Resolve the surviving occurrence; do not use a generic “focus first descendant at offset zero” helper. Undo/Redo need equivalent occurrence/caret recovery tests, not just tree equality.

Retain nested table content when moving or dissolving an outer table. Initial creation of another table while already inside a cell should require choosing an explicitly labelled **nested table** action; ordinary insertion/movement commands target the nearest table. Existing nested tables remain readable and editable through their nested Blocks. This avoids silently choosing between operating on a table and creating one inside it.

Cells/rows with spans, ragged membership or unsupported structural metadata remain readable. Rectangular operations should explain why they are unavailable rather than silently normalize or discard data. Header metadata continues to render and round-trip; header authoring and complex span editing are deferred.

### Reuse boundaries

Implement a small table operations service shared by slash commands and context controls. It should resolve/preflight a target, produce a command request, execute it atomically and restore selection. Business semantics belong there and in canonical command planning, not in JSX handlers.

Reuse `TreeCommands.transaction`, insert, move and transaction-aware children reads for the first correctness path. Do not reuse the recursive menu `flatten()` helper for table dissolution. A transaction’s live projection does not reflect intermediate draft changes; use draft-aware canonical reads or a precomputed operation plan throughout.

Generic transactions currently have document/workspace-sized costs. Keep them exclusively on accepted structural actions. Measure that path before qualification; if repeated global planning dominates, add a table-specific batched plan using existing canonical commit/history facilities. Do not promise a new fast path without validating its structural invariants, or undertake a broad repository rewrite as part of this feature.

## 3. Selection and invocation specification

### Selection eligibility and distribution

| Input context | Recommended action |
| --- | --- |
| Caret in an ordinary TextBlock | Wrap that whole TextBlock, even if the caret/command is mid-paragraph. Preserve its subtree and map the caret through invocation removal. |
| One selected ordinary Block | Move that original Block to cell 1; create empty editable Blocks in other cells. |
| Contiguous selected sibling Blocks | Sort by the parent’s child order, then fill left-to-right, top-to-bottom. With five Blocks and three columns: `[A, B, C]`, `[D, E, empty]`. |
| Selected ContainerBlock or SurfaceBlock | Treat as one selected root; preserve its complete subtree/faces. Whole-surface targeting follows the existing surface service. |
| Explicitly selected children of one container | Operate on those children inside that same container, provided they form a contiguous sibling run. |
| Parent and descendant selected together | Normalize to the selected ancestor once, using existing whole-Block semantics; show the actual target count. |
| Noncontiguous siblings | Reject initially with “Select contiguous sibling Blocks”; do not move unselected intervening content or silently compact reading order. |
| Mixed parents, unrelated nested selections, multiple views/documents | Reject without mutation. |
| Noncollapsed text selection, cross-Block text selection, multiple carets | Do not infer Block selection. Ask the user to collapse the caret or select whole Blocks. No conversion of selected substrings into replacement Blocks. |
| Existing list/task item | Do not silently replace a list item with a table shell or distribute a compound task’s paragraphs. Require selecting the whole list/task container, or explicitly selecting eligible content inside a container; preserve list/task semantics. The approved initial restriction is retained for the structural reasons above. |
| Cell/row selected as structure | Use table-specific operations, not ordinary “wrap selected content”. |

The table replaces the selected sibling interval at its original location; surrounding siblings retain their order. Multi-Block invocation should capture the Block selection before opening an out-of-document command field or menu. It must not insert `/c3` into a selected child merely to operate on that selection. Do not revive an old Block selection when the user has switched to ordinary caret editing.

The current completion session requires one text-source bookmark. For a non-text or multi-Block selection, expose a small command input from the existing Block-selection context menu, using the same command catalogue and captured selection. Keep its query outside authored text and pass a Block-selection invocation to the table service, with no text range to remove. Do not create a dummy TextBlock, pretend that one selected item represents the whole selection, or refactor Entity/Scry sessions into a generic pipeline.

### Slash commands and exact Undo

Use the existing completion recogniser and overlay. Extend the local command catalogue with explicit aliases and validated arguments, not another global keystroke listener or an arbitrary command evaluator.

- `/c`, `/c2`, `/c3`, `/c4` select creation with two, two, three or four columns respectively. Display descriptive names and aliases together; exact aliases outrank prefix suggestions. `/c` must not accidentally match `/col` or `container` as an executable prefix.
- `/row`, `/col`, `/mc l|r|u|d`, `/mr u|d`, `/unc` are proposed aliases for the operations below. `/move-cell left` etc. can share the same typed request. `/mc 2` and custom ratios stay optional/deferred.
- An invocation can occur anywhere in the current TextBlock. Retain the recogniser’s lexical boundaries so a slash in a URL/path is not a command trigger. Once recognised, require explicit acceptance of a completion action; simply typing `/c2`, a space, or pasting command-like text does not restructure content.
- Capture the invocation’s exact range and inline revision, plus selected placements and parent membership. Revalidate at execution. Only the accepted invocation range is removed, through native inline editing in the same transaction as the structural operation. Preserve surrounding text and whitespace without normalization.
- Example: accepting `/c2` in `Alpha /c2 Beta` leaves the original Block containing `Alpha  Beta` in cell 1, if the captured invocation excludes surrounding spaces. One Undo restores `Alpha /c2 Beta` and its original position; Redo restores the same table identities. A command-only Block remains the original now-empty Block in cell 1.
- Escape, unavailable/unknown commands, stale targets and validation failures leave the literal invocation intact. Typing history before acceptance remains ordinary native history.
- Code/literal annotations, IME, paste and multiple selections do not start this structural command path. Active Scry Entity sessions own their input. The `/` operator inside LER Command mode remains LER’s command interface, not table creation.

The existing command candidate list supports names, not a complete alias/argument grammar. Add only the bounded grammar needed here, including exact-argument validation and contextual availability. Keep ordinary nontrigger typing at its current cheap early return. Suggestion filtering must not snapshot or validate whole documents on every character.

## 4. Distinct operations and edge behaviour

| Operation | Proposed semantics and edge policy |
| --- | --- |
| Navigate to a cell | Change focus/selection only. No canonical revision or history entry. Expose focusable cell controls and a command action; add no new keyboard bindings. |
| Move cell left/right | Swap the two cell placements and their complete subtrees in the same row. Do not wrap at the first/last column. |
| Move cell up/down | Swap cells at the same column index in adjacent rows. At the top/bottom edge, disable with a reason. Reject missing destinations in ragged/spanned tables. |
| Direct destination, if later accepted | `/mc 2` means a one-based destination in the current row, with swap semantics. It is not an insertion/reflow operation. |
| Move content between cells | Move selected child Blocks, in order, to the end of an explicitly chosen destination cell. Keep both cell identities and their table positions. Do not swap contents implicitly or overwrite destination content. A vacated cell receives an editable empty TextBlock if necessary. Reject ancestry cycles and ambiguous selections. |
| Move row up/down | Swap adjacent row placements with all cells intact. Do not redistribute content among columns. |
| Insert row | Insert below the current row, with the same number of cells and new empty TextBlocks. |
| Insert column | Insert to the right of the current column in **every** row in one transaction. Maintain rectangular shape and default equal sizing. |
| Remove empty row/column | Permit only after checking the whole affected structure is semantically empty, including annotations, children, relations and task state—not merely empty visible text. Keep at least one row/column; use dissolve for removing the final table structure. |
| Remove nonempty row/column | Offer “Extract contents and remove”, with a preview of row-major extraction after the table, or cancel. Do not silently delete content. Destructive content deletion is a separate existing Block operation, not the default table removal action. |
| Dissolve table (`/unc`) | Splice only the chosen table’s direct cell child sequences into its parent in row-major order. Preserve Containers, SurfaceBlocks, lists and nested tables as whole child Blocks. Keep empty child TextBlocks rather than guessing which are disposable placeholders. |

Cells, rows and tables also have identities. Dissolving their shells is an explicit structural removal, not a remapping of their IDs onto child content. Generic `unwrap()` rejects shared content and owned relations but directly removes the wrapper record; its placement-count check does not prove the absence of standoff references to that Block. Before enabling dissolution/removal for shared or referenced shells, qualify retained-definition/reference handling. Disable unsafe cases with an explanation; do not scan the Vault during typing or silently redirect references. The initial UI need not add new “link to cell/row” functionality.

All target resolution uses the nearest enclosing table and its own row/cell ancestry, stopping at document and owned-relation boundaries. Navigation, cell swapping, content transfer and row movement must remain separate command IDs and labels. Existing generic cell merge actions can create ragged grids; do not expose them as part of the new rectangular operations menu.

## 5. Keyboard conflict audit

This inventory records current defaults; user remapping and scope dispatch remain authoritative. It proposes **no table shortcuts**.

| Input | Current ownership or collision |
| --- | --- |
| Tab / Shift-Tab in TextBlocks | Create/indent and outdent lists. Within a table cell these must continue to operate on the text/list subtree. |
| Tab during completion | Existing Scry code does not treat it as an accept shortcut; outside the overlay it cancels completion and returns control. Do not repurpose it as next-cell navigation. |
| Unmodified arrow keys | Native caret movement, then generic adjacent-editable traversal at collapsed Block boundaries. The generic traversal is depth-first document order, not geometric table navigation. |
| Shift-arrow / Ctrl-Shift-arrow | Native text selection and experimental cross-Block selection. Structural barriers matter; do not introduce rectangular selection implicitly. |
| Ctrl/Alt/Shift-arrow combinations | Scry start/end character/word adjustment, native word movement, annotation controls and other focused tools. No modifier-arrow combination can be assumed free. |
| Arrow keys with a Block handle focused | Previous/next Block and range extension. Rows/cells require an explicit structural target model rather than borrowing text-focus scopes. |
| Enter | Paragraph/task editing in text; completion acceptance while its overlay owns input; edit selected Block on handles; other focused controls have their own actions. |
| `/` | Inline slash completion at lexical boundaries; LER Command mode opens its own commands. Ctrl-/ and Command-/ inspect annotations in the editor. |
| Command-/Control-period | Toggles LER Query/Command mode there; Control-period also has annotation inspection meaning in editor scope. |
| Command-/Control-Enter | Creates and links an Entity while Scry owns the input. |
| `*`, `@`, `~`, `\|` | LER operators/reservation; ordinary literal input in its query field. Asterisk and hyphen list prefixes remain owned by list recognition in eligible text. |
| Escape, Space, Home/End | Existing selection, disclosure, dialog, native editing and completion behaviours depend on focus. Preserve their scopes. |
| Undo/Redo and Save | Existing document-history and manual-save paths, including Scry history guards. Table operations participate; they do not install competing global handlers. |

Sources: [binding catalogue](../../src/input/binding-catalog.ts), [gateway](../../src/input/gateway.ts), [autocomplete binding leases](../../src/features/autocomplete/index.tsx), [LER bindings](../../src/features/entity-references/bindings.ts), [adjacent-editable traversal](../../src/reactive-editor/editor.ts).

The first release can be keyboard-operable through the existing command interface and native focusable controls without assigning new cell-navigation keys. Any dedicated bindings require a later reviewed proposal and binding-conflict tests.

## 6. UI proposal

Use the table’s existing document-native renderer with restrained borders and padding. Show cell/row handles on hover, keyboard focus or structural selection. Keep the existing content Block handles inside cells; distinguish “select cell”, “select row” and “select content Block” visually and in accessible names. Add an occurrence-local table selection target with table/row/cell identity; do not globally make all shells eligible for generic delete/cut/drag behaviour.

Table controls call the same semantic operations as slash commands. A small contextual menu can expose insert, swap, transfer, extract/remove and dissolve actions with availability reasons. Cross-cell drag/drop and drag-to-reorder rows are later enhancements unless the existing drag infrastructure can be safely constrained; they are not necessary to ship the first command interface.

**Confirmed narrow-pane behaviour:** keep columns and use one horizontal scroll viewport around the table. Size columns from a tested minimum readable width; 12–16 em per column is a design starting range, not a committed value. Long text wraps inside cells. Do not add independent vertical scrollbars to every cell. Preserve DOM reading order, focus visibility and horizontal scroll during movement; reveal the focused cell without moving the document window. Nested tables may have their own bounded overflow region, but require zoom/pointer qualification.

For a quieter reading presentation, recommend a per-view “Show table guides” control, initially on, with guides absent from ordinary exported reading presentation. This does not disable editing or alter canonical data. The brief’s read/edit distinction needs this explicit definition because Flint storage read-only state is not a reading mode. Keep focus/selection cues visible when guides are hidden; do not build a new global reading-mode system.

Retain table/row/cell semantics and add accessible labels/coordinates for structural controls, row/column counts where appropriate, visible focus and announced operation results. Do not add `role="grid"` and imply a new arrow-navigation contract. Validate the actual accessibility tree with the retained `display: contents` hosts and exercise VoiceOver; existing role attributes alone are not accessibility qualification.

Images, videos, SurfaceBlocks and Containers remain their normal Block views inside cells. Preflight mounted subtrees for IME and live-media continuity, reusing the surface checks where possible. Test front/back state, viewer state, margins, annotation overlays and scroll retention explicitly. Do not reset a loaded viewer simply because its canonical data survived.

## 7. Interchange and failure policy

- **Native save/reload and packages:** preserve both type families, identities, unknown payload, owned/opaque relations and assets through existing codecs. Save remains explicit; no Markdown sidecar or background save is introduced.
- **Clipboard:** copy creates an independent native copy according to current clipboard rules; moves preserve identity. Whole-table and whole-cell copy need tests. Existing cross-cell text selection is not broadened into rectangular spreadsheet paste. Reject paste targets that would insert a row/cell at the wrong structural depth; use an explicit table action instead.
- **HTML:** export genuine rows/cells with recursive supported content. Import through the existing sanitizer. Keep unsupported span degradation explicit, without authoring or silently normalizing spans in this feature.
- **Markdown:** a headerless rich layout cannot be promised as a lossless pipe-table round trip. Retain the current warned labelled-row fallback initially, and offer HTML/native for structural fidelity. Embedding a raw HTML table in Markdown is a possible later policy, not a prerequisite or an unannounced format change. Existing SurfaceBlock export restrictions also continue to apply.
- **Failure:** preflight targets, resource ownership, structure and invocation version before staging changes. Abort the whole action if any selected item is unsupported. A stale menu must not act on another occurrence or a changed selection. Queue focus/UI updates only after successful publication; report a failure without consuming literal command text.
- **Undo:** test the exact prior document and placement identities, not just visible text. Native invocation removal must restore all overlapping/zero-width annotations on Undo. Moving operations should not edit inline content at all. Repeated Undo/Redo and durable replay are separate gates.

## 8. Implementation increments and qualification gates

Use three coherent increments. Introduce a default-enabled feature flag for the new operations/UI under repository conventions, while keeping existing documents readable when it is off. A flag is not a reason to alter unrelated feature defaults.

### Increment 1 — Canonical table operations

Add family resolution, explicit target/preflight rules, create/distribute, cell/row swap, content transfer, insert row/column, safe extraction/removal and nonrecursive dissolution. Reuse canonical primitives and history. Implement precise selection restoration, and cover source ownership and wrapper-reference limitations before enabling unsafe operations.

Qualification: see the [Increment 1 report](TABLES_AND_COLUMNS_INCREMENT_1_QUALIFICATION.md) for passing correctness checks, live-viewer fixes and the measured canonical-transaction latency that remains a release limit.

Gate: deterministic tests for independent multi-Block cell flow with unequal neighbouring counts; future width metadata persistence; one/three/five Blocks; text and non-text subtrees; exact placement and Block identity; shared/reference rejection; atomic rollback; empty cells; first/last boundaries; ragged/span rejection; nested-table preservation; Undo/Redo and native history replay. No production slash/UI exposure until these invariants pass.

### Increment 2 — Command and document integration

Register shared commands, bounded alias/argument parsing and contextual candidates. Support inline invocation anywhere in a Block with atomic cleanup, and an out-of-document command entry for whole-Block selections. Add explicit cell/row controls, horizontal overflow and guide presentation, preserving existing text and Scry input ownership. Reuse retained mounts; make only demonstrated, targeted continuity changes.

Gate: real Flint interactions with actual typed commands, mid-paragraph literals, cancellation, stale sessions, multi-Block invocation, IME/paste exclusions, caret restoration, native keyboard controls, zoom, scroll, SurfaceBlock flipping, live media and both text-renderer paths. Confirm no new navigation bindings and no regression to list/task Enter/Tab/Shift-Tab, Scry or native text selection.

### Increment 3 — Interchange and release qualification

Qualify native/package/clipboard identity policies and HTML/Markdown results. Complete narrow-pane, guides-hidden and accessibility checks. Benchmark the accepted structural paths and ordinary typing inside/outside tables with real Flint. Save a concise qualification report with exact evidence, outstanding limits and before/after measurements.

| Acceptance scenario | Required evidence |
| --- | --- |
| Annotated TextBlock through `/c2` | Same Block/content/placement; original relationships; mapped caret; exact literal Undo/Redo; save/reload and durable replay. |
| Three selected siblings through `/c3` | One row, three original placements in order; surrounding siblings unchanged. |
| Five siblings through `/c3` | Two rows; sixth cell has new empty text; no duplicate or discarded subtree. |
| SurfaceBlock/ContainerBlock in a cell | Normal nested editing, front/back state, retained viewer/mount state and annotations after movement. |
| Cell and row reorder | Exact swap/reorder semantics; no text mutations or reference loss; edge actions do not publish empty history. |
| Dissolve a multi-row table | Direct cell contents in row-major order; nested tables, lists and compound content intact; unsupported shell relations/sharing rejected. |
| Input regression | Existing list/task, Scry, caret, clipboard and selection suites plus real-browser interactions. |
| Clean two-column Flint layout | Wide/narrow panes, guides visible/hidden, scrolling, long content, mixed media, magnification and assistive-technology inspection. |

Performance qualification must distinguish ordinary typing, slash suggestion filtering and accepted structural commands. Test realistic annotated documents around 16k and 25k characters, many sibling Blocks, deep nested cells, multiple open Documents and unrelated Vault rows. Record handler/settled timings, snapshots, repository scans, projection rebuilds, layout reads and service/index requests. Vary unrelated document size separately from the moved subtree size.

Unmatched typing and filtering must add no structural transactions, snapshots, vault discovery or unrelated projection work. Layout changes must reuse shared geometry and invalidate only affected regions/reflow dependencies. Compare sequential baseline/implementation real-Flint runs; do not present headless frame waits as guaranteed user-visible latency. Investigate a material increase before qualification. This investigation measured existing behaviour and snapshot count, not future feature latency.

## 9. Approved decisions and deferred scope

| Decision | Recommendation / status |
| --- | --- |
| Narrow panes | **Confirmed:** preserve columns with horizontal scrolling. Minimum readable column width remains to be visually qualified. |
| Inline position | **Confirmed:** commands anywhere in the Block; remove only the accepted invocation and preserve the whole original Block. |
| New structure | Existing `table-*` family; support legacy `grid-*` without migration. |
| Multi-selection | Contiguous ordinary siblings only initially; reject partial text and mixed-parent selection. |
| Cell movement | Adjacent swaps, without row-boundary wrapping; content transfer is a separate append operation. |
| Nonempty removal | Extract contents with a preview or cancel; no silent deletion. |
| Reading presentation | Per-view table guides rather than a new global reading mode. Approved as part of the overall architecture. |
| Markdown rich layouts | Keep explicit warned fallback; native/HTML for structural round trips. Raw HTML in Markdown remains deferred. |
| Nested creation and list items | Preserve existing nested tables; make new nesting explicit. Avoid automatic extraction/replacement of individual list/task items without a reviewed policy. |

Custom ratios/resizing, new keyboard mappings, rectangular selection/paste, cell merges/spans, header-authoring tools, sorting, formulas, rich table styling and broad outliner changes are deferred. None requires a new Block type now. Shared/referenced shell dissolution and live-media continuity remain qualification gates for the affected cases, not reasons to redesign the entire editor.
