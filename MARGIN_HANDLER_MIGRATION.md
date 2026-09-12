# Left/right margin keyboard handlers

Investigation, implementation plan and results, 12 September 2026. Scoped pass complete.

## Original behavior

Verified in the original sibling `speedy-ts` source:

- `src/blocks/document-block.ts:908–935`: bindings `Shift-Control-ArrowLeft`
  and `Shift-Control-ArrowRight` (ledger entries blocks-document-block-binding-12/13).
- `document-block.ts:1989–2075`: handlers clear the current Standoff selection;
  create `relation.leftMargin` / `relation.rightMargin` on that block if absent;
  otherwise reuse the existing margin. Focus moves to its first text child at
  caret position zero. Creation is relative to the source block, not the document.
- The margin type is `left-margin-block` / `right-margin-block`, with
  `block/marginalia/left` / `block/marginalia/right`. Its first child is an empty
  `standoff-editor-block`, with `block/alignment` left/right and
  `block/font/size/three-quarters`. The right-margin builder additionally applies
  right alignment to the container (`document-block.ts:73–109`).
- `src/universe-block.ts:1171–1186`: builds/stages the owned margin relative to
  the anchor and assigns the runtime `marginParent` back-reference. The converted
  repository's owned-relation location supplies ownership; do not serialize a
  new cyclic runtime back-reference.

## Specific implementation plan

1. Add a model command that creates the owned margin and its empty editor in one
   history entry, returning the text placement to focus. Reuse a text child
   without mutations/history; repair empty margins by adding one child. Preserve
   any other children, annotations, opposite margin and opaque relations.
2. Route exact Ctrl+Shift+Left/Right on mounted Standoff editors through that
   command, clearing source selections and requesting caret-start focus after
   Solid mounts the new editor. No Cmd alias, Alt combination, IME interception,
   native-input interception or held-key repeat creating nested margins.
3. Use the existing relation gutter renderer, document codec and model history.
   New creation remains a fully validated structural command; repeated focus
   should require no repository snapshot or history entry. No new global keyboard
   listener or timer-based DOM construction.
4. Test both directions, current-block attachment, focus, selection clearing,
   repeat/reuse, empty-container recovery, undo/redo, persistence, shared views,
   incompatible/opaque data protection and shortcut exclusions. Verify actual
   Ctrl+Shift arrow input and gutter positioning in Chrome.

Safety differences from original: if the first child is not a text editor, focus
the first Standoff child or append one without replacing existing content. An
incompatible/opaque margin relation is not overwritten. Native PlainText fields
retain word-selection shortcuts; the original handlers cast their source to
StandoffEditorBlock, so this pass is scoped to that editor.

## Implementation and qualification

`TreeCommands.ensureMargin` creates/reuses the relation or repairs a container
without text. `InputGateway` routes the exact chord and requests focus after
mounting. Focus resolves within the originating occurrence, including transcluded
copies, rather than jumping to the first projection of shared content. Source
selection ranges and secondary carets are collapsed. Existing relation rendering
and serialization need no new wire format. The three-quarter font property now
sets `.75rem` explicitly: its old class was not active in the converted stylesheet.

Seven added regression cases cover both shortcut directions, active-block
attachment, focus/caret, source selection clearing, duplicate prevention, native/
IME/modified/repeat exclusions, shared occurrences, empty-margin recovery,
annotation and opposite-margin preservation, serialization round-trip, undo/redo,
and protection of incompatible/opaque data. Reopening a note takes no snapshot
and creates no history entry. All **109 tests in 19 suites**, typecheck and
client/server build pass.

Chrome check: actual Ctrl+Shift+ArrowLeft/Right events create editable notes in
the left/right gutters at the source block's vertical position. Both have 12px
text at the default 16px root size, appropriate alignment, caret zero and focus.
Typing and reopening preserve note text and revision; the other source block
remains unchanged. Repeat with `node scripts/check-margin-shortcuts.mjs` while
`npm run dev` is running (Node 22+, macOS Chrome by default; `CHROME_BIN` and
`BENCHMARK_URL` overrides supported). The isolated profile is removed and no
document-store files are saved.

Limits: first creation and empty-container repair use full structural validation;
they are not covered by the incremental typing/Enter performance guarantee.
This does not add margin deletion UI, Ctrl+Shift shortcuts for native PlainText
fields, or claim completion of other legacy margin/navigation handlers.
