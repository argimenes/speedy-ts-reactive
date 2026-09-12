# Text-block tabs — 13 September 2026

There is no separate InlineTabBlock in the original. DocumentBlock's
`convertBlockToTab` (line 2354) wraps the current Block at its sibling position in
TabRowBlock → TabBlock, names the first tab "1", activates it and restores the
caret. `handleCreateNewTab` (line 1665) finds an ancestor TabBlock: outside a tab
it converts; inside one it calls `row.appendTab(textBlock.id)`.
TabRowBlock.appendTab/addTab (`blocks/tabs-block.ts`, lines 147–181) appends after
the last tab, copies the focused text Block, activates the copy and focuses offset
zero. This is whole-Block alternative text, not a selected-text inline atom.

Implement the shared behaviour in a runtime action, use it from the document
toolbar, the input gateway and existing Convert to tab menu. Retain canonical
TabRowBlock/TabBlock renderers/serialization; no invented DTO type. Conversion
moves rather than copies the original. Appending makes independent content with
fresh Block/annotation IDs while preserving text, properties, children and owned
margin relations. External reference values remain unchanged. Each operation is
one undoable transaction; focus follows the correct occurrence after rendering.

Original binding at document-block.ts:1400 is Control-T / Windows:Alt-T. Registry
action `tabs.create` includes name, description, category and tags. Bind Ctrl+T
and Alt+T (portable alternative extended to all platforms); no Shift/Meta combos.
Browsers may intercept Ctrl+T before the page receives it. Toolbar provides a
reliable alternative and displays effective registry bindings. Rebinding continues
to use the existing registry API; its unfinished preferences window is separate.
IME, repeat and native-field guards remain. Paragraph indentation and Tab/Shift-Tab
structural-list semantics are unchanged by this feature.

The text Block context menu exposes “To tab / add tab” both inside and outside
tabs; its target is the clicked Block, not stale document focus. The existing
Convert to tab alias shares the same implementation for text Blocks. Other Block
types retain their existing generic conversion. The Tabs → Add tab action still
creates an empty tab; it is distinct from this original copy-current-text action.

Tests cover wrapping at the original sibling position, preserved Unicode selection,
annotations and margins; independent-copy IDs/content; active tab and focus;
undo/redo; persistence; toolbar/context menu parity; rebinding; IME/repeat/extra
modifier and native-field guards.

Verification: 43 targeted tests across text tabs, toolbar, page creation, annotation
monitor and Standoff editor pass. Typecheck and client/server production build pass.
The full suite was not rerun; previously documented unfinished-binding context-menu
test failures are not claimed resolved by this feature.
