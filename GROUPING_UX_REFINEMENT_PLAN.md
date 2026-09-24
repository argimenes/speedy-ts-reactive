# Grouping UX refinement

Implemented — 25 September 2026. The agreed UX and deletion changes below are ready for review.

This is a small adjustment to the existing grouping interactions and presentation. Reuse the current range collection, annotation commands, Show/Hide state and highlight rendering. No new service, persistent grouping model or feature flag is proposed.

## Intended behaviour

- Remove **Group** and **Clear** from the toolbar. Keep **Show/Hide** in the **Selection** toolset. Remove the equivalent legacy buttons and the redundant “Cancel grouping” action in More.
- The first completed, non-empty **Control-held text selection** creates a group. Subsequent selections join it only when Control is held throughout their selection gesture. Holding Control alone, clicking a caret position or selecting without Control does not add a range.
- Releasing Control leaves already collected ranges grouped. Ordinary selections remain ordinary and do not replace the group; annotation commands continue to target the retained group until Escape. Existing cancellation on document edits remains.
- **Escape** reveals any text hidden by the active group, removes its highlights and discards its membership. This is cancellation, not a document Undo.
- **Delete or Backspace** deletes the text in every active grouped range, removes its highlights and ends the group. This applies both to collected ranges and ranges retained through Show/Hide, including hidden text. Only manual grouping membership qualifies: Find and Create Entity Relation result highlights are never deletion targets. Dialog inputs retain normal text deletion. Ranges previously removed or cancelled are excluded. Control need not remain held for deletion.
- Retain **Control-click to remove an individual grouped range**, including one highlighted after Show. Removed text stays visible and is excluded from subsequent group toggles.
- Render grouped ranges with the existing static highlight colour only. Remove the crawling outlines both while collecting ranges and after Show reveals them. Keep the existing SVG highlight layer; removing the animation does not require replacing SVG.

## Gesture rules

**Mouse:** Control must be held from pointer-down through pointer-up. Add the final range once on pointer-up. Releasing Control early invalidates that gesture for grouping, even if pressed again before pointer-up. Leave the resulting ordinary selection intact. A drag beginning inside an existing highlight must remain a selection gesture; defer Control-click removal until it is clear that no drag occurred. Cancel pending gestures on focus loss or pointer cancellation.

**Keyboard:** Control must be held before the first selection-extending keystroke and throughout extension. Keep one pending range as navigation keys repeat; do not add an overlapping range on every key-up. Agreed completion rule: releasing either Shift or Control commits the final range once. A fresh qualifying gesture can then add another range. Pressing Control after an ordinary selection has already begun must not retrospectively capture it.

These rules apply to editor text, including supported cross-Block selection, not text fields in menus or dialogs. Control means the Control key, including on macOS.

**Grouped deletion:** treat all targeted ranges as one undoable text edit. Delete only the selected text, preserving intervening text and Block structure; an emptied Block remains available for editing. Caret behaviour: collapse to the start of the first deleted range in document order. Undo restores the text and affected annotations using existing history, without recreating a transient group. Ignore key repeat from the consumed deletion gesture until key release so it cannot continue deleting ordinary text after the group disappears. With no grouped ranges, keep ordinary Delete/Backspace behaviour. Dialog and input-field deletion must remain local to those controls.

## Small implementation slice

1. In `src/runtime/group-selection.ts`, replace the current “capture whenever grouping is active” listeners with a small pending-gesture state. Start a group only when its first qualifying range is ready. Preserve deduplication, range validation and Escape cancellation. Resolve the pending range before starting the group so initialization cannot discard a cross-Block selection.
2. In `src/rendering/document-style-bar.tsx`, remove Group/Clear and obsolete handlers. Keep brief guidance near Show/Hide or in the existing status text: “Hold Control while selecting to group. Control-click removes a range. Esc cancels.” Retire the old `Ctrl+;`, then `G` toggle binding so there is only one creation model.
3. In `src/rendering/standoff-editor-view.tsx`, omit outline shapes for `editor/group-selection` and `editor/show-hide-selection`. Retain their fills and leave unrelated annotation/search outlines intact.
4. Add grouped Delete/Backspace handling alongside Escape. Snapshot and validate the active ranges before editing, resolving retained Show/Hide membership from current annotation positions. Merge overlapping ranges per content record and delete from the end backwards with existing `replaceInlineRange` commands in one transaction. This prevents duplicate deletion and shifted offsets; existing commands maintain annotation ranges. Clear group state after success and avoid the ordinary edit-cancellation hook interrupting the transaction.
5. Make only the input-binding adjustments needed for the keyboard decision below. Preserve other annotation, editing and persistence behaviour.

## Decisions and implementation concerns

1. **Keyboard completion — agreed:** releasing either Shift or Control commits the final range once. No particular modifier-release order is required.
2. **Selection priority — agreed:** Control+Shift+Left/Right will be available for grouped text selection in editor text; opening margins moves to different shortcuts.
3. **Replacement margin shortcuts — agreed:** **Control+Shift+L** opens the left margin; **Control+Shift+R** opens the right margin. These replace the proposed two-step shortcuts. Neither combination is assigned in the current Codex binding catalogue.

Browser consideration: Chrome on Windows/Linux uses Control+Shift+R for reload ignoring cached content ([Chrome shortcut reference](https://support.google.com/chrome/answer/157179?hl=en)). Check interception in the intended application environment during the existing smoke check; do not assume browser-reserved behaviour can always be overridden. On macOS, use Control as requested, not Command.

Control-click also has an existing Block-menu binding. Group selection/removal gestures must take precedence within editor text, while ordinary context-menu access remains available. This needs a focused check in the application's macOS browser. The existing selection movement handler now accepts Control+Shift+Arrow for grouping, including local selection when cross-Block selection is disabled. Cross-Block traversal still follows the existing preference.

## Proportionate verification

Update the existing focused grouping, toolbar and cross-Block tests: Control-gated addition, early Control release, one range per keyboard gesture, Control-click removal, Escape restoration and static highlights before/after Show. Keep a regression that a later group cannot affect cancelled ranges. Add focused deletion cases for disjoint/overlapping ranges across Blocks, hidden ranges, excluded ranges, a single Undo restoring text and annotations, and held-key repeat stopping after group deletion.

Perform one real-browser mouse/keyboard smoke check covering the agreed modifier-release rule and menu/margin conflicts. Run the relevant focused suites, typecheck and client build. No browser matrix, new test infrastructure or CSS-value tests. Stop for review when these interactions work.

## Implementation verification

All 93 focused tests across grouping, toolbar, selection rendering, cross-Block input, keybinding and entity-candidate suites pass. Chrome on macOS was exercised with actual Control-drag/click and keyboard input, both modifier-release orders, successive keyboard ranges, grouped deletion, static Show/Hide highlights and both margin shortcuts. Typecheck and the client build pass. The browser smoke script uses a temporary isolated profile and is not new project test infrastructure.
