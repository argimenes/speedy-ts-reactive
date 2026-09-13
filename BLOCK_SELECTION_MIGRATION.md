# Block multi-selection — 13 September 2026

## Conventions and chosen interaction

Notion documents Shift-click for a contiguous block range, modifier-click for
toggle selection (Cmd+Shift on Mac / Alt+Shift on Windows), Escape, and Shift+arrow
extension: https://www.notion.com/help/keyboard-shortcuts . Logseq's official DB
guide also describes mouse and Shift+arrow block selection:
https://github.com/logseq/docs/blob/master/db-version.md . There is no universal
modifier scheme across PKMs; block selection must be distinct from text selection.

The user chose a dedicated handle/gutter: click selects one Block, Shift-click
selects a range, Ctrl/Cmd-click toggles membership, Ctrl/Cmd+Shift-click adds a
range. Ctrl-click inside text continues to open its existing context menu.
Use keyboard-focusable handles with up/down traversal, Shift+up/down extension,
Escape to clear and Enter to return to editing. Native text-field navigation,
clipboard and editing remain untouched. All command combinations live in the
binding catalogue, with a separate `block-handle` scope.

## Session collection and boundaries

Add `editor.blockSelection`, separate from inline-text `editor.selections`.
Each selected entry records node/occurrence key, placement key, content key, view
ID and persisted Block ID (if present). DTOs without IDs remain unmodified; expose
their placement keys as session ID fallbacks. Anchor, lead and selection order
are explicit. Selecting is not a repository command, does not mark a document
dirty and is not serialized. Single selection replaces; toggling adds/removes;
range selects visible blocks in document order. Different views/documents/margin
documents start fresh selections. Hidden tab/face content is not range-selected.

Provide a raw collection and normalized action targets (remove selected descendants
of selected ancestors) for later copy/paste/delete/move operations. This slice adds
selection infrastructure and a count/ID inspector, not destructive bulk commands
or replacement clipboard behaviour. Existing single-block menu actions keep their
original meaning. Prune removed/hidden occurrences after structural changes; never
silently retarget a different shared-content occurrence. Clicking ordinary editor
content or Escape clears selection. Context menus and selection-inspector controls
do not clear it. Document reload/disposal clears the collection.

## Rendering/performance plan

Attach handle buttons to registered block roots without inserting wrappers around
Blocks or into editable Cell flows. Exclude inline Cells and document-layout shells
(pages, tab panels, grid rows/cells, margin containers, workspace/windows), while
allowing content blocks, media, lists, grids and tab rows. Selected state uses
per-occurrence reactive flags, not a document-wide rerender. Resolve visible order
only on selection/navigation, never during character insertion. Selection pruning
checks only existing selected entries and does no model snapshots.

Verify single/range/discontiguous selection, reverse ranges, keyboard navigation,
context-menu coexistence, nesting normalization, hidden/deleted targets, view
isolation, unchanged canonical state/serialization, and real-browser gutter layout.

## Reordering (added at user request during implementation)

The handle is natively draggable. Dragging an already-selected Block moves the
selection; dragging an unselected one first selects just that Block. Normalize
selected parents/children and duplicate placements, validate that all source roots
and the drop target are siblings in one parent list, then move them before/after
the target in one canonical transaction. Preserve source order for discontiguous
groups. Orange top/bottom indicators show the insertion position. Moving within
the selected group, no-op destinations and cross-parent drops do not mutate data.
Cancel leaves all Blocks unchanged. Native browser edge scrolling is available;
touch drag gestures and cross-parent/nesting drag operations are not implemented.
Undo/redo uses existing document history controls. Clipboard/delete/move-up/down
bulk actions are not added in this slice; their selection input is now available.

## API

```ts
editor.blockSelection.ids                 // persisted Block IDs, placement fallback
editor.blockSelection.nodeKeys            // exact selected occurrences
editor.blockSelection.snapshot()          // detached descriptor list
editor.blockSelection.actionTargets()     // normalized top-level unique placements
editor.blockSelection.select(key, "single" | "toggle" | "range" | "add-range")
editor.blockSelection.clear()
editor.blockSelection.moveTo(targetKey, "before" | "after") // same-parent reorder
```

The inspector displays selected IDs and count. The collection is per editor,
restricted to one view/document-or-margin scope at a time, and survives same-parent
reordering. Legacy Blocks missing persisted IDs are never dirtied just by selecting.
Hidden/unmounted selections are pruned after render; deleting and undoing a Block
does not silently reselect it. Ctrl-click inside text retains its original menu;
Ctrl-click on a handle normalizes macOS contextmenu/click ordering without toggling
twice. Standard keyboard commands in editable text are unchanged.

Verification: eight new tests cover the selection/reorder cases; Chrome smoke
`node scripts/check-block-selection.mjs` exercises real mouse selection, gutter hit
testing, native drag-start/drop of a discontiguous group and undo. Optional
`SCREENSHOT_PATH=/tmp/block-selection.png` captures the selected appearance.
Full suite: 137 pass, two previously documented context-menu tests fail (synthetic
contextmenu button-0 versus the unfinished registry migration's button-2 binding).
Typecheck and client/server build pass. Existing inline/split performance tests
pass; selection tests assert no repository snapshots or revisions from selecting.

## Selected Block operations

Copy, cut, paste, and delete are now implemented; see
[BLOCK_CLIPBOARD_MIGRATION.md](BLOCK_CLIPBOARD_MIGRATION.md) for clipboard scope,
identity handling, insertion rules, and verification. The selected IDs remain
session-only and the existing handle/range/toggle/drag conventions are unchanged.
