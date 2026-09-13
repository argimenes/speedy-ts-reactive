# Selected Block clipboard

Implementation plan: capture lossless canonical subtrees; add atomic clipboard commands; connect the binding registry and selection inspector; verify selection, identity, history, and text isolation.

- Copy/Cut/Paste use Cmd+C/X/V on Apple platforms and Ctrl+C/X/V elsewhere, in the Block selection UI only. Delete and Backspace delete selected Blocks. Bindings remain reassignable.
- The clipboard is session memory, shared between editor instances, not the operating-system clipboard. External data and editor text are outside this change.
- Parent/child selections are normalized to independent roots in document order. Children, margins, annotations, media payloads, and inline images are retained without legacy text export.
- Paste inserts after the last selected root. After cut/delete, a retained insertion point permits paste even into an emptied list. Stale destinations fail safely.
- Copy creates fresh Block/property IDs and remaps internal `codex/block-reference` values. Cut preserves IDs on its first paste if those IDs are absent from the destination; otherwise it safely clones. Later pastes clone. External entity IDs remain unchanged.
- Cut, delete, and paste each form one undoable transaction. Copy does not mutate the document. Clipboard contents are detached from subsequent source edits and are not persisted in saved documents.

Implementation: `src/block-tree/clipboard.ts` captures/rekeys canonical fragments;
`TreeCommands.insertFragment` publishes a single insertion; `BlockClipboardService`
owns clipboard actions and destination bookmarks. The selection inspector offers
buttons, registry-dispatched shortcuts, and native clipboard-event fallbacks.
Readonly ID fields retain their native text-copy behavior.

Verification includes discontiguous copy, fresh IDs/internal references, cut-all and
repeat paste, cross-document paste, undo/redo, failed-cut rollback, repeat-key guards,
platform defaults, immutable source snapshots, inline images, and owned margins.
`node scripts/check-block-selection.mjs` passes real Chrome keyboard clipboard,
empty-list paste, and existing selection/native drag checks. The full test suite
continues to have the two previously documented context-menu failures (synthetic
button-0 contextmenu versus the registry's button-2 default); Block selection tests
pass.
