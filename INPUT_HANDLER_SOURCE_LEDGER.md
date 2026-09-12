# Original input-handler source ledger

Audit snapshot: 11 September 2026. Original source HEAD: `5cb144cb2052cfde64ead65eff5f20b974906168`.

Read [INPUT_HANDLER_AUDIT.md](INPUT_HANDLER_AUDIT.md) first. This is its exhaustive, source-indexed companion, not generated application code and not a claim of runtime parity. All excerpts below are existing source. Do not implement directly from action labels: the executable body, dispatch rules, and anomaly notes are authoritative evidence.

## Scope and use

The census includes all **60 current TypeScript/TSX source files** under the original `speedy-ts/src`, all **49 Block/panel class declarations** including AbstractBlock and UniverseBlock, direct/helper-installed DOM listeners, callback properties, JSX event attributes, inherited navigation implementations, binding factories, and text recognizers. The 61 total class declarations also include supporting library classes. The older AMD/JavaScript archive in `src/library/original` has no reference from the current TS/TSX application and is outside this runtime migration; it is not silently treated as converted. Dependency-owned internals (CodeMirror, player widgets) are opaque input owners, not invented application bindings. Do not conflate these archived editors with the current `StandoffEditorBlock`.

Each entry has a stable audit ID, a source path/line, its enclosing context, the original expression, and a migration family. Binding declaration order is preserved in each file. Source line numbers are snapshot locations; hashes below detect drift. On future source changes, retain old IDs and append/reconcile entries instead of renumbering completed work.

**Default status of every ID: mapped from source; implementation parity and browser verification NOT signed off.** The family mapping identifies a destination, not a completed port. An ID can close only with a command/adapter link, legacy-live/dormant decision, regression evidence, and proposal-contract review. A listener-removal site, lifecycle hook, and callback forwarding site are deliberately included but are not additional distinct user gestures. The same behavior may have several installation/forwarding sites.

## Census totals

| Site category | Count |
| --- | ---: |
| helper | 3 |
| binding | 97 |
| listener | 65 |
| jsx | 75 |
| callback | 121 |
| button-factory | 4 |
| event-property | 3 |
| property-function | 15 |
| replacement | 33 |
| text-rule | 37 |
| assignment | 1 |

There are also **28 binding assignment/append sites** and **1,059 named callable declarations** indexed below to expose inherited, indirect, and disconnected paths. Comment evidence is indexed separately; comments are not counted as installed bindings.

## All 97 binding declarations

This table is a trigger-to-handler map; the linked entry contains the exact full body. `match` arrays are alternatives, not separate dispatch slots. See the addendum for literal quoting, platform parsing, modes and cancellation semantics.

For an inline handler, the call-target column lists syntactic call sites, including
guard/helper calls; it is not a claim that all branches run for every event. The
linked original body preserves branch conditions and execution semantics.

| ID | Owner/context | Source kind | Mode | Exact match | Handler / inline call targets | Declared action | Source |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [blocks-checkbox-block-binding-01](#blocks-checkbox-block-binding-01) | CheckboxBlock | Keyboard | default | <code>"' '"</code> | <code>inline → self.uncheck; self.check</code> | Decrease the length of the annotation. | [src/blocks/checkbox-block.ts:41](../speedy-ts/src/blocks/checkbox-block.ts) |
| [blocks-context-menu-block-binding-01](#blocks-context-menu-block-binding-01) | ContextMenuBlock | Keyboard | default | <code>"Escape"</code> | <code>inline → _this.destroy</code> | Close the context menu | [src/blocks/context-menu-block.tsx:20](../speedy-ts/src/blocks/context-menu-block.tsx) |
| [blocks-document-block-binding-01](#blocks-document-block-binding-01) | DocumentBlock.getInputEvents | Keyboard | default | <code>"Control-X"</code> | <code>inline → _this.extractIntoNewDocument</code> | Copy current block into a new DocumentWindow. | [src/blocks/document-block.ts:688](../speedy-ts/src/blocks/document-block.ts) |
| [blocks-document-block-binding-02](#blocks-document-block-binding-02) | DocumentBlock.getInputEvents | Keyboard | default | <code>"Enter"</code> | <code>_this.handleEnterKey.bind(_this)</code> | Create a new text block. Move text to the right of the caret into the new block. | [src/blocks/document-block.ts:704](../speedy-ts/src/blocks/document-block.ts) |
| [blocks-document-block-binding-03](#blocks-document-block-binding-03) | DocumentBlock.getInputEvents | Keyboard | default | <code>"Delete"</code> | <code>_this.handleDelete.bind(_this)</code> | Delete the character to the right | [src/blocks/document-block.ts:718](../speedy-ts/src/blocks/document-block.ts) |
| [blocks-document-block-binding-04](#blocks-document-block-binding-04) | DocumentBlock.getInputEvents | Keyboard | default | <code>"Shift-Delete"</code> | <code>inline → _this.deleteBlock; manager.setBlockFocus; (switchToBlock as StandoffEditorBlock).moveCaretStart</code> | Delete the entire block. | [src/blocks/document-block.ts:734](../speedy-ts/src/blocks/document-block.ts) |
| [blocks-document-block-binding-05](#blocks-document-block-binding-05) | DocumentBlock.getInputEvents | Keyboard | default | <code>"Control-Delete"</code> | <code>inline → block.getLastCell; block.removeCellsAtIndex; block.setCaret</code> | Delete all the characters to the right, up to the end of the text block. | [src/blocks/document-block.ts:758](../speedy-ts/src/blocks/document-block.ts) |
| [blocks-document-block-binding-06](#blocks-document-block-binding-06) | DocumentBlock.getInputEvents | Keyboard | default | <code>"Control-Backspace"</code> | <code>inline → manager.getParentOfType; block.getText; block.getWordsFromText; doc.findNearestWord; block.removeCellsAtIndex; block.setCaret</code> | Deletes leftwards one word at a time. | [src/blocks/document-block.ts:786](../speedy-ts/src/blocks/document-block.ts) |
| [blocks-document-block-binding-07](#blocks-document-block-binding-07) | DocumentBlock.getInputEvents | Mouse | default | <code>"Control-ClickLeft"</code> | <code>inline → manager.toggleBlockSelection</code> | Block selection | [src/blocks/document-block.ts:838](../speedy-ts/src/blocks/document-block.ts) |
| [blocks-document-block-binding-08](#blocks-document-block-binding-08) | DocumentBlock.getInputEvents | Keyboard | default | <code>["Mac:Meta-U","Windows:Control-U"]</code> | <code>this.loadAnnotationMenu.bind(this)</code> | Show the annotation menu. | [src/blocks/document-block.ts:854](../speedy-ts/src/blocks/document-block.ts) |
| [blocks-document-block-binding-09](#blocks-document-block-binding-09) | DocumentBlock.getInputEvents | Custom | default | <code>"paste"</code> | <code>this.handlePaste.bind(this)</code> | Paste | [src/blocks/document-block.ts:868](../speedy-ts/src/blocks/document-block.ts) |
| [blocks-document-block-binding-10](#blocks-document-block-binding-10) | DocumentBlock.getInputEvents | Keyboard | default | <code>["Mac:Meta-Z","Windows:Control-Z"]</code> | <code>inline → _this.undoHistory</code> | Undo | [src/blocks/document-block.ts:880](../speedy-ts/src/blocks/document-block.ts) |
| [blocks-document-block-binding-11](#blocks-document-block-binding-11) | DocumentBlock.getInputEvents | Keyboard | default | <code>["Mac:Meta-D","Windows:Control-D"]</code> | <code>inline → _this.redoHistory</code> | Redo | [src/blocks/document-block.ts:894](../speedy-ts/src/blocks/document-block.ts) |
| [blocks-document-block-binding-12](#blocks-document-block-binding-12) | DocumentBlock.getInputEvents | Keyboard | default | <code>"Shift-Control-ArrowLeft"</code> | <code>this.handleCreateLeftMargin.bind(this)</code> | Create a left margin block. | [src/blocks/document-block.ts:908](../speedy-ts/src/blocks/document-block.ts) |
| [blocks-document-block-binding-13](#blocks-document-block-binding-13) | DocumentBlock.getInputEvents | Keyboard | default | <code>"Shift-Control-ArrowRight"</code> | <code>this.handleCreateRightMargin.bind(this)</code> | Create a right margin block. | [src/blocks/document-block.ts:922](../speedy-ts/src/blocks/document-block.ts) |
| [blocks-document-block-binding-14](#blocks-document-block-binding-14) | DocumentBlock.getInputEvents | Keyboard | default | <code>"Control-Shift-ArrowUp"</code> | <code>this.handleMoveBlockUp.bind(this)</code> | Move the focus block up one block. | [src/blocks/document-block.ts:936](../speedy-ts/src/blocks/document-block.ts) |
| [blocks-document-block-binding-15](#blocks-document-block-binding-15) | DocumentBlock.getInputEvents | Keyboard | default | <code>"Tab"</code> | <code>this.indentBlock.bind(this)</code> | Indent the current block. | [src/blocks/document-block.ts:950](../speedy-ts/src/blocks/document-block.ts) |
| [blocks-document-block-binding-16](#blocks-document-block-binding-16) | DocumentBlock.getInputEvents | Keyboard | default | <code>"Shift-Tab"</code> | <code>this.deindentBlock.bind(this)</code> | De-indent the current block. | [src/blocks/document-block.ts:964](../speedy-ts/src/blocks/document-block.ts) |
| [blocks-document-block-binding-17](#blocks-document-block-binding-17) | DocumentBlock.getInputEvents | Keyboard | default | <code>"Shift-Backspace"</code> | <code>inline → this.deleteBlock; manager.setBlockFocus; (switchToBlock as StandoffEditorBlock).moveCaretStart</code> | Delete the entire block. | [src/blocks/document-block.ts:978](../speedy-ts/src/blocks/document-block.ts) |
| [blocks-document-block-binding-18](#blocks-document-block-binding-18) | DocumentBlock.getInputEvents | Keyboard | default | <code>"Control-Shift-ArrowDown"</code> | <code>this.handleMoveBlockDown.bind(this)</code> | Move the focus block down one block. | [src/blocks/document-block.ts:1002](../speedy-ts/src/blocks/document-block.ts) |
| [blocks-document-block-binding-19](#blocks-document-block-binding-19) | DocumentBlock.getInputEvents | Keyboard | default | <code>"Shift-ArrowUp"</code> | <code>inline → block.getSelection; console.log; block.getLastCell; block.getCellInRow; block.setSelection</code> | Move the cursor up one row. If one isn't found, do nothing. | [src/blocks/document-block.ts:1016](../speedy-ts/src/blocks/document-block.ts) |
| [blocks-document-block-binding-20](#blocks-document-block-binding-20) | DocumentBlock.getInputEvents | Keyboard | default | <code>"Shift-ArrowDown"</code> | <code>inline → block.getSelection; console.log; block.getLastCell; block.getCellInRow; block.setSelection</code> | Move the cursor down one row. If one isn't found, do nothing. | [src/blocks/document-block.ts:1050](../speedy-ts/src/blocks/document-block.ts) |
| [blocks-document-block-binding-21](#blocks-document-block-binding-21) | DocumentBlock.getInputEvents | Keyboard | default | <code>"ArrowUp"</code> | <code>this.moveCaretUp.bind(this)</code> | Move the cursor down one row. If one isn't found, move to the next block. | [src/blocks/document-block.ts:1084](../speedy-ts/src/blocks/document-block.ts) |
| [blocks-document-block-binding-22](#blocks-document-block-binding-22) | DocumentBlock.getInputEvents | Keyboard | global | <code>"ArrowDown"</code> | <code>this.moveCaretDown.bind(this)</code> | Set focus to the block below. | [src/blocks/document-block.ts:1098](../speedy-ts/src/blocks/document-block.ts) |
| [blocks-document-block-binding-23](#blocks-document-block-binding-23) | DocumentBlock.getInputEvents | Keyboard | default | <code>"Shift-ArrowRight"</code> | <code>this.moveSelectionOneCharacterRightwards.bind(this)</code> | Move the selection one character to the right. | [src/blocks/document-block.ts:1110](../speedy-ts/src/blocks/document-block.ts) |
| [blocks-document-block-binding-24](#blocks-document-block-binding-24) | DocumentBlock.getInputEvents | Keyboard | default | <code>"Shift-ArrowLeft"</code> | <code>this.moveSelectionOneCharacterLeftwards</code> | Move the selection one character to the left. | [src/blocks/document-block.ts:1124](../speedy-ts/src/blocks/document-block.ts) |
| [blocks-document-block-binding-25](#blocks-document-block-binding-25) | DocumentBlock.getInputEvents | Keyboard | default | <code>"Backspace"</code> | <code>this.handleBackspace.bind(this)</code> | Delete the character to the left | [src/blocks/document-block.ts:1138](../speedy-ts/src/blocks/document-block.ts) |
| [blocks-document-block-binding-26](#blocks-document-block-binding-26) | DocumentBlock.getInputEvents | Keyboard | default | <code>"ArrowDown"</code> | <code>this.moveCaretDown.bind(this)</code> | Move the cursor down one row. If one isn't found, move to the next block. | [src/blocks/document-block.ts:1154](../speedy-ts/src/blocks/document-block.ts) |
| [blocks-document-block-binding-27](#blocks-document-block-binding-27) | DocumentBlock.getInputEvents | Keyboard | default | <code>"ArrowLeft"</code> | <code>this.moveCaretLeft.bind(this)</code> | Move the cursor back one cell ... | [src/blocks/document-block.ts:1168](../speedy-ts/src/blocks/document-block.ts) |
| [blocks-document-block-binding-28](#blocks-document-block-binding-28) | DocumentBlock.getInputEvents | Keyboard | default | <code>["Windows:Control-S","Mac:Meta-S"]</code> | <code>inline → args.e?.preventDefault; manager.saveServerDocument</code> | Save document | [src/blocks/document-block.ts:1182](../speedy-ts/src/blocks/document-block.ts) |
| [blocks-document-block-binding-29](#blocks-document-block-binding-29) | DocumentBlock.getInputEvents | Keyboard | default | <code>"Control-ArrowLeft"</code> | <code>inline → manager.getParentOfType; block.getText; block.getWordsFromText; doc.findNearestWord; block.moveCaretStart; block.setCaret</code> | Skip back to the start of the previous word. | [src/blocks/document-block.ts:1200](../speedy-ts/src/blocks/document-block.ts) |
| [blocks-document-block-binding-30](#blocks-document-block-binding-30) | DocumentBlock.getInputEvents | Keyboard | default | <code>"ArrowRight"</code> | <code>this.moveCaretRight.bind(this)</code> | Move the cursor forward one cell ... | [src/blocks/document-block.ts:1232](../speedy-ts/src/blocks/document-block.ts) |
| [blocks-document-block-binding-31](#blocks-document-block-binding-31) | DocumentBlock.getInputEvents | Keyboard | default | <code>["Mac:Control-N"]</code> | <code>inline → args.block.addBlockProperties; args.block.applyBlockPropertyStyling</code> | Block vines | [src/blocks/document-block.ts:1246](../speedy-ts/src/blocks/document-block.ts) |
| [blocks-document-block-binding-32](#blocks-document-block-binding-32) | DocumentBlock.getInputEvents | Keyboard | default | <code>["Mac:Meta-V","Windows:Control-V"]</code> | <code>inline → args.allowPassthrough</code> | Paste | [src/blocks/document-block.ts:1262](../speedy-ts/src/blocks/document-block.ts) |
| [blocks-document-block-binding-33](#blocks-document-block-binding-33) | DocumentBlock.getInputEvents | Custom | default | <code>"copy"</code> | <code>this.handleCopy.bind(this)</code> | Copy | [src/blocks/document-block.ts:1276](../speedy-ts/src/blocks/document-block.ts) |
| [blocks-document-block-binding-34](#blocks-document-block-binding-34) | DocumentBlock.getInputEvents | Keyboard | default | <code>"Control-ArrowRight"</code> | <code>inline → args.block.manager.getParentOfType; block.getLastCell; block.getText; block.getWordsFromText; doc.findNearestWord; block.moveCaretStart; block.setCaret</code> | Skip back to the start of the previous word. | [src/blocks/document-block.ts:1288](../speedy-ts/src/blocks/document-block.ts) |
| [blocks-document-block-binding-35](#blocks-document-block-binding-35) | DocumentBlock.getInputEvents | Keyboard | default | <code>"Home"</code> | <code>this.moveCaretToStartOfTextBlock.bind(this)</code> | Move the caret to the left of the first character. | [src/blocks/document-block.ts:1321](../speedy-ts/src/blocks/document-block.ts) |
| [blocks-document-block-binding-36](#blocks-document-block-binding-36) | DocumentBlock.getInputEvents | Keyboard | default | <code>"End"</code> | <code>this.moveCaretToEndOfTextBlock</code> | Move the caret to the right of the last character. | [src/blocks/document-block.ts:1335](../speedy-ts/src/blocks/document-block.ts) |
| [blocks-document-block-binding-37](#blocks-document-block-binding-37) | DocumentBlock.getInputEvents | Custom | default | <code>"onTextChanged"</code> | <code>inline → _this.textProcessor.process</code> |  | [src/blocks/document-block.ts:1349](../speedy-ts/src/blocks/document-block.ts) |
| [blocks-document-block-binding-38](#blocks-document-block-binding-38) | DocumentBlock.getInputEvents | Keyboard | default | <code>["Mac:Meta-C","Windows:Control-C"]</code> | <code>inline → args.allowPassthrough</code> | Copy passthrough | [src/blocks/document-block.ts:1363](../speedy-ts/src/blocks/document-block.ts) |
| [blocks-document-block-binding-39](#blocks-document-block-binding-39) | DocumentBlock.getInputEvents | Keyboard | default | <code>"Control-I"</code> | <code>this.applyItalicsToText.bind(this)</code> | Italicise | [src/blocks/document-block.ts:1377](../speedy-ts/src/blocks/document-block.ts) |
| [blocks-document-block-binding-40](#blocks-document-block-binding-40) | DocumentBlock.getInputEvents | Keyboard | default | <code>"Control-B"</code> | <code>this.applyBoldToText.bind(this)</code> | Bold | [src/blocks/document-block.ts:1389](../speedy-ts/src/blocks/document-block.ts) |
| [blocks-document-block-binding-41](#blocks-document-block-binding-41) | DocumentBlock.getInputEvents | Keyboard | default | <code>["Control-T", "Windows:Alt-T"]</code> | <code>this.handleCreateNewTab.bind(this)</code> | To tab/add tab | [src/blocks/document-block.ts:1401](../speedy-ts/src/blocks/document-block.ts) |
| [blocks-document-block-binding-42](#blocks-document-block-binding-42) | DocumentBlock.getInputEvents | Keyboard | default | <code>"Control-L"</code> | <code>inline → block.createBlockProperty</code> | Blue and White | [src/blocks/document-block.ts:1413](../speedy-ts/src/blocks/document-block.ts) |
| [blocks-document-block-binding-43](#blocks-document-block-binding-43) | DocumentBlock.getInputEvents | Keyboard | default | <code>"Control-M"</code> | <code>this.applyMirrorToText.bind(this)</code> | Mirror | [src/blocks/document-block.ts:1430](../speedy-ts/src/blocks/document-block.ts) |
| [blocks-document-block-binding-44](#blocks-document-block-binding-44) | DocumentBlock.getInputEvents | Keyboard | default | <code>["Mac:Meta-/","Windows:Control-/"]</code> | <code>this.handleAnnotationMonitorClicked.bind(this)</code> | Monitor panel | [src/blocks/document-block.ts:1442](../speedy-ts/src/blocks/document-block.ts) |
| [blocks-document-block-binding-45](#blocks-document-block-binding-45) | DocumentBlock.getInputEvents | Keyboard | default | <code>"Control-Enter"</code> | <code>inline → manager.getParentOfType; manager.createStandoffEditorBlockAsync; newBlock.addEOL; this.addBlockAfter; setTimeout; manager.setBlockFocus; newBlock.setCaret</code> | ENTER break | [src/blocks/document-block.ts:1454](../speedy-ts/src/blocks/document-block.ts) |
| [blocks-document-block-binding-46](#blocks-document-block-binding-46) | DocumentBlock.getInputEvents | Keyboard | default | <code>["Control-R"]</code> | <code>inline → block                             .blockProperties                             .filter; x.type.indexOf; props.forEach; p.block?.removeBlockProperty; block.addBlockProperties; block.applyBlockPropertyStyling; block.updateView</code> | Right-align | [src/blocks/document-block.ts:1482](../speedy-ts/src/blocks/document-block.ts) |
| [blocks-document-block-binding-47](#blocks-document-block-binding-47) | DocumentBlock.getInputEvents | Keyboard | default | <code>["Meta-Q", "Control-Q"]</code> | <code>inline → manager.loadEntitiesList</code> | Match entities to the graph | [src/blocks/document-block.ts:1503](../speedy-ts/src/blocks/document-block.ts) |
| [blocks-document-block-binding-48](#blocks-document-block-binding-48) | DocumentBlock.getInputEvents | Keyboard | default | <code>["Meta-E", "Control-Shift-E"]</code> | <code>this.applyEntityReferenceToText.bind(this)</code> | Entity reference | [src/blocks/document-block.ts:1519](../speedy-ts/src/blocks/document-block.ts) |
| [blocks-document-block-binding-49](#blocks-document-block-binding-49) | DocumentBlock.getInputEvents | Keyboard | default | <code>"Control-F"</code> | <code>this.handleFind.bind(this)</code> | Find | [src/blocks/document-block.ts:1531](../speedy-ts/src/blocks/document-block.ts) |
| [blocks-document-block-binding-50](#blocks-document-block-binding-50) | DocumentBlock.getInputEvents | Keyboard | default | <code>"Control-K"</code> | <code>this.applyClockToText.bind(this)</code> | Clock | [src/blocks/document-block.ts:1555](../speedy-ts/src/blocks/document-block.ts) |
| [blocks-document-tabs-block-binding-01](#blocks-document-tabs-block-binding-01) | DocumentTabRowBlock.getInputEvents.events | Mouse | default | <code>"click"</code> | <code>inline → manager.setBlockFocus</code> | Set focus to the current block. | [src/blocks/document-tabs-block.ts:23](../speedy-ts/src/blocks/document-tabs-block.ts) |
| [blocks-document-tabs-block-binding-02](#blocks-document-tabs-block-binding-02) | DocumentTabBlock.getInputEvents.events | Mouse | default | <code>"click"</code> | <code>inline → manager.setBlockFocus</code> | Set focus to the current block. | [src/blocks/document-tabs-block.ts:239](../speedy-ts/src/blocks/document-tabs-block.ts) |
| [blocks-entities-list-block-binding-01](#blocks-entities-list-block-binding-01) | EntitiesListBlock.setupBindings | Keyboard | default | <code>"Escape"</code> | <code>inline → self.close</code> | Close the window | [src/blocks/entities-list-block.tsx:85](../speedy-ts/src/blocks/entities-list-block.tsx) |
| [blocks-entities-list-block-binding-02](#blocks-entities-list-block-binding-02) | EntitiesListBlock.setupBindings | Keyboard | default | <code>"ArrowDown"</code> | <code>inline → (no calls / no-op)</code> | Move the cursor down one row. If one isn't found, move to the next block. | [src/blocks/entities-list-block.tsx:101](../speedy-ts/src/blocks/entities-list-block.tsx) |
| [blocks-image-block-binding-01](#blocks-image-block-binding-01) | ImageBlock.getInputEvents | Keyboard | default | <code>"Enter"</code> | <code>inline → manager.getParentOfType; manager.createStandoffEditorBlockAsync; newBlock.addEOL; doc.addBlockAfter; setTimeout; manager.setBlockFocus; newBlock.setCaret</code> | Create a new text block underneath. | [src/blocks/image-block.ts:75](../speedy-ts/src/blocks/image-block.ts) |
| [blocks-image-block-binding-02](#blocks-image-block-binding-02) | ImageBlock.getInputEvents | Mouse | default | <code>"click"</code> | <code>inline → manager.setBlockFocus</code> | Set focus to the current block. | [src/blocks/image-block.ts:98](../speedy-ts/src/blocks/image-block.ts) |
| [blocks-monitor-block-binding-01](#blocks-monitor-block-binding-01) | StandoffEditorBlockMonitor.onInit | Keyboard | default | <code>"Escape"</code> | <code>inline → props.onClose</code> | Close Monitor | [src/blocks/monitor-block.tsx:82](../speedy-ts/src/blocks/monitor-block.tsx) |
| [blocks-monitor-block-binding-02](#blocks-monitor-block-binding-02) | StandoffEditorBlockMonitor.onInit | Keyboard | default | <code>"ArrowUp"</code> | <code>inline → properties.forEach; setProperties; setState</code> | Set focus to the item above. | [src/blocks/monitor-block.tsx:96](../speedy-ts/src/blocks/monitor-block.tsx) |
| [blocks-monitor-block-binding-03](#blocks-monitor-block-binding-03) | StandoffEditorBlockMonitor.onInit | Keyboard | default | <code>"ArrowDown"</code> | <code>inline → properties.forEach; setProperties; setState</code> | Set focus to the block below. | [src/blocks/monitor-block.tsx:119](../speedy-ts/src/blocks/monitor-block.tsx) |
| [blocks-monitor-block-binding-04](#blocks-monitor-block-binding-04) | StandoffEditorBlockMonitor.onInit | Keyboard | default | <code>"ArrowRight"</code> | <code>inline → item.property.shiftRightOneWord</code> | Set property at current index visible. | [src/blocks/monitor-block.tsx:142](../speedy-ts/src/blocks/monitor-block.tsx) |
| [blocks-monitor-block-binding-05](#blocks-monitor-block-binding-05) | StandoffEditorBlockMonitor.onInit | Keyboard | default | <code>"Shift-ArrowRight"</code> | <code>inline → item.property.shiftRight</code> | Set property at current index visible. | [src/blocks/monitor-block.tsx:157](../speedy-ts/src/blocks/monitor-block.tsx) |
| [blocks-monitor-block-binding-06](#blocks-monitor-block-binding-06) | StandoffEditorBlockMonitor.onInit | Keyboard | default | <code>"ArrowLeft"</code> | <code>inline → item.property.shiftLeftOneWord</code> | Set property at current index invisible. | [src/blocks/monitor-block.tsx:172](../speedy-ts/src/blocks/monitor-block.tsx) |
| [blocks-monitor-block-binding-07](#blocks-monitor-block-binding-07) | StandoffEditorBlockMonitor.onInit | Keyboard | default | <code>"Shift-ArrowLeft"</code> | <code>inline → item.property.shiftLeft</code> | Set property at current index invisible. | [src/blocks/monitor-block.tsx:187](../speedy-ts/src/blocks/monitor-block.tsx) |
| [blocks-monitor-block-binding-08](#blocks-monitor-block-binding-08) | StandoffEditorBlockMonitor.onInit | Keyboard | default | <code>"'='"</code> | <code>inline → item.property.expand</code> | Increase the length of the annotation. | [src/blocks/monitor-block.tsx:202](../speedy-ts/src/blocks/monitor-block.tsx) |
| [blocks-monitor-block-binding-09](#blocks-monitor-block-binding-09) | StandoffEditorBlockMonitor.onInit | Keyboard | default | <code>"'-'"</code> | <code>inline → item.property.contract</code> | Decrease the length of the annotation. | [src/blocks/monitor-block.tsx:217](../speedy-ts/src/blocks/monitor-block.tsx) |
| [blocks-monitor-block-binding-10](#blocks-monitor-block-binding-10) | StandoffEditorBlockMonitor.onInit | Keyboard | default | <code>"'d'"</code> | <code>inline → item.property.destroy</code> | Delete the annotation. | [src/blocks/monitor-block.tsx:232](../speedy-ts/src/blocks/monitor-block.tsx) |
| [blocks-page-block-binding-01](#blocks-page-block-binding-01) | PageBlock.getInputEvents | Mouse | default | <code>"clickleft"</code> | <code>inline → block.blocks.find; manager.setBlockFocus; first.moveCaretStart</code> | Clicking in a page area. | [src/blocks/page-block.ts:15](../speedy-ts/src/blocks/page-block.ts) |
| [blocks-standoff-editor-block-binding-01](#blocks-standoff-editor-block-binding-01) | StandoffEditorBlock | Keyboard | default | <code>"Enter"</code> | <code>inline → manager.registeredBlocks.find; doc.handleEnterKey</code> | Create a new text block. Move text to the right of the caret into the new block. | [src/blocks/standoff-editor-block.ts:101](../speedy-ts/src/blocks/standoff-editor-block.ts) |
| [blocks-surface-block-binding-01](#blocks-surface-block-binding-01) | SideBlock.getInputEvents | Mouse | default | <code>"click"</code> | <code>inline → block.toggle</code> |  | [src/blocks/surface-block.ts:69](../speedy-ts/src/blocks/surface-block.ts) |
| [blocks-tabs-block-binding-01](#blocks-tabs-block-binding-01) | TabBlock.getTabBlockEvents.events | Mouse | default | <code>"click"</code> | <code>inline → manager.setBlockFocus</code> | Set focus to the current block. | [src/blocks/tabs-block.ts:255](../speedy-ts/src/blocks/tabs-block.ts) |
| [blocks-window-block-binding-01](#blocks-window-block-binding-01) | WindowBlock.setupEventHandlers | Keyboard | default | <code>'ArrowDown'</code> | <code>inline → (no calls / no-op)</code> | Move window down by 10 pixels | [src/blocks/window-block.ts:151](../speedy-ts/src/blocks/window-block.ts) |
| [blocks-window-block-binding-02](#blocks-window-block-binding-02) | WindowBlock.setupEventHandlers | Keyboard | default | <code>'ArrowUp'</code> | <code>inline → (no calls / no-op)</code> | Move window down by 10 pixels | [src/blocks/window-block.ts:169](../speedy-ts/src/blocks/window-block.ts) |
| [blocks-window-block-binding-03](#blocks-window-block-binding-03) | WindowBlock.setupEventHandlers | Keyboard | default | <code>'ArrowLeft'</code> | <code>inline → (no calls / no-op)</code> | Move window left by 10 pixels | [src/blocks/window-block.ts:187](../speedy-ts/src/blocks/window-block.ts) |
| [blocks-window-block-binding-04](#blocks-window-block-binding-04) | WindowBlock.setupEventHandlers | Keyboard | default | <code>'ArrowRight'</code> | <code>inline → (no calls / no-op)</code> | Move window rihgt by 10 pixels | [src/blocks/window-block.ts:205](../speedy-ts/src/blocks/window-block.ts) |
| [components-annotation-panel-binding-01](#components-annotation-panel-binding-01) | AnnotationPanelBlock.render | Mouse | default | <code>"click"</code> | <code>inline → self.node.contains; self.destroy; self.events.onClose</code> | Close the panel. | [src/components/annotation-panel.tsx:34](../speedy-ts/src/components/annotation-panel.tsx) |
| [components-annotation-panel-binding-02](#components-annotation-panel-binding-02) | AnnotationPanelBlock.render | Keyboard | default | <code>"Escape"</code> | <code>inline → self.destroy; self.events.onClose</code> | Close the panel. | [src/components/annotation-panel.tsx:54](../speedy-ts/src/components/annotation-panel.tsx) |
| [components-annotation-panel-binding-03](#components-annotation-panel-binding-03) | AnnotationPanelBlock.render | Keyboard | default | <code>"i"</code> | <code>inline → applyAnnotation</code> | Apply italics. | [src/components/annotation-panel.tsx:71](../speedy-ts/src/components/annotation-panel.tsx) |
| [components-annotation-panel-binding-04](#components-annotation-panel-binding-04) | AnnotationPanelBlock.render | Keyboard | default | <code>"b"</code> | <code>inline → applyAnnotation</code> | Apply bold. | [src/components/annotation-panel.tsx:87](../speedy-ts/src/components/annotation-panel.tsx) |
| [components-annotation-panel-binding-05](#components-annotation-panel-binding-05) | AnnotationPanelBlock.render | Keyboard | default | <code>"u"</code> | <code>inline → applyAnnotation</code> | Apply underline. | [src/components/annotation-panel.tsx:103](../speedy-ts/src/components/annotation-panel.tsx) |
| [components-find-replace-binding-01](#components-find-replace-binding-01) | FindReplaceBlock.render | Keyboard | default | <code>"Escape"</code> | <code>inline → clearHighlights; self.close</code> | Close the find-replace modal. | [src/components/find-replace.tsx:75](../speedy-ts/src/components/find-replace.tsx) |
| [components-find-replace-binding-02](#components-find-replace-binding-02) | FindReplaceBlock.render | Keyboard | default | <code>"Control-H"</code> | <code>inline → mode; setMode</code> | Replace mode. | [src/components/find-replace.tsx:92](../speedy-ts/src/components/find-replace.tsx) |
| [components-find-replace-binding-03](#components-find-replace-binding-03) | FindReplaceBlock.render | Keyboard | default | <code>"Enter"</code> | <code>inline → mode; moveDown; replaceCurrent</code> | Replace current item. | [src/components/find-replace.tsx:112](../speedy-ts/src/components/find-replace.tsx) |
| [components-find-replace-binding-04](#components-find-replace-binding-04) | FindReplaceBlock.render | Keyboard | default | <code>"Meta-Enter"</code> | <code>inline → replaceAll</code> | Replace all. | [src/components/find-replace.tsx:134](../speedy-ts/src/components/find-replace.tsx) |
| [components-search-entities-binding-01](#components-search-entities-binding-01) | SearchEntitiesBlock.render | Keyboard | default | <code>"Control-A"</code> | <code>inline → self.source.getText; _text.substring; find.findMatches; matches.forEach; m.block.removeStandoffPropertiesByType; find.applyHighlights</code> | Select all matches of the text in all text blocks. | [src/components/search-entities.tsx:74](../speedy-ts/src/components/search-entities.tsx) |
| [components-search-entities-binding-02](#components-search-entities-binding-02) | SearchEntitiesBlock.render | Keyboard | default | <code>"Control-Backspace"</code> | <code>inline → setModel; searchGraph</code> | Clear the search field. | [src/components/search-entities.tsx:95](../speedy-ts/src/components/search-entities.tsx) |
| [components-search-entities-binding-03](#components-search-entities-binding-03) | SearchEntitiesBlock.render | Keyboard | default | <code>"Enter"</code> | <code>inline → currentResultIndex; self.onBulkSubmit; self.close; self.onSelected</code> | Select the current entity. | [src/components/search-entities.tsx:112](../speedy-ts/src/components/search-entities.tsx) |
| [components-search-entities-binding-04](#components-search-entities-binding-04) | SearchEntitiesBlock.render | Keyboard | default | <code>"Escape"</code> | <code>inline → self.close</code> | Quit the entity search. | [src/components/search-entities.tsx:139](../speedy-ts/src/components/search-entities.tsx) |
| [components-search-entities-binding-05](#components-search-entities-binding-05) | SearchEntitiesBlock.render | Keyboard | default | <code>"ArrowDown"</code> | <code>inline → currentResultIndex; setCurrentResultIndex</code> | Go down one item in the search results | [src/components/search-entities.tsx:155](../speedy-ts/src/components/search-entities.tsx) |
| [components-search-entities-binding-06](#components-search-entities-binding-06) | SearchEntitiesBlock.render | Keyboard | default | <code>"ArrowUp"</code> | <code>inline → currentResultIndex; setCurrentResultIndex</code> | Go up one item in the search results | [src/components/search-entities.tsx:176](../speedy-ts/src/components/search-entities.tsx) |
| [universe-block-binding-01](#universe-block-binding-01) | UniverseBlock.getGlobalInputEvents | Keyboard | global | <code>"Delete"</code> | <code>this.handleDeleteBlock.bind(this)</code> | Delete block currently in focus or selected. | [src/universe-block.ts:372](../speedy-ts/src/universe-block.ts) |
| [universe-block-binding-02](#universe-block-binding-02) | UniverseBlock.getDocumentTabBlockEvents.events | Mouse | default | <code>"click"</code> | <code>inline → manager.setBlockFocus</code> | Set focus to the current block. | [src/universe-block.ts:537](../speedy-ts/src/universe-block.ts) |
| [universe-block-binding-03](#universe-block-binding-03) | UniverseBlock.getTabBlockEvents.events | Mouse | default | <code>"click"</code> | <code>inline → manager.setBlockFocus</code> | Set focus to the current block. | [src/universe-block.ts:559](../speedy-ts/src/universe-block.ts) |
| [universe-block-binding-04](#universe-block-binding-04) | UniverseBlock.getInputEvents.events | Custom | default | <code>"contextmenu"</code> | <code>inline → manager.loadBlockMenu</code> | Context Menu. | [src/universe-block.ts:582](../speedy-ts/src/universe-block.ts) |
| [universe-block-binding-05](#universe-block-binding-05) | UniverseBlock.getInputEvents.events | Keyboard | default | <code>["Mac:Meta-1","Win:Control-1"]</code> | <code>inline → _this.saveWorkspaceAsync</code> | Save workspace | [src/universe-block.ts:598](../speedy-ts/src/universe-block.ts) |
| [universe-block-binding-06](#universe-block-binding-06) | UniverseBlock.getInputEvents.events | Keyboard | default | <code>["Mac:Meta-2","Win:Control-2"]</code> | <code>inline → _this.loadWorkspace</code> | Load workspace | [src/universe-block.ts:614](../speedy-ts/src/universe-block.ts) |

## Per-file evidence and implementation cross-reference

## src/App.tsx

Source: [src/App.tsx:1](../speedy-ts/src/App.tsx). SHA-256: `e2db7af5d50c573be4e2054e87f4567cf80bd69fe7fb820ee11b18aff080f66e`.

Migration family/status: Supporting application/library code; no local user-input installation was found unless explicitly listed below. Preserve any caller-owned lifecycle or native boundary.

No local binding/listener/callback/recognizer sites found by the census. For Block classes this **does not mean no behavior**: follow inherited AbstractBlock navigation, nearest Document commands, Universe routing, schema effects and native/widget boundaries in the addendum.

### Named implementation index

This index intentionally includes helper methods as well as handlers. Resolve named calls in the entries above here; methods with no caller/binding are **not** automatically live commands. Shared support methods may be implemented in another indexed file (notably AbstractBlock, DocumentBlock, UniverseBlock, StandoffProperty and SVG helpers).

| Context | Callable | Source |
| --- | --- | --- |
|  | `App` | [src/App.tsx:9](../speedy-ts/src/App.tsx) |
| App | `initControlPanel` | [src/App.tsx:11](../speedy-ts/src/App.tsx) |

### Commented/disabled evidence

These are source comments, not installed listeners. They also include relevant intent notes and TODO context. Use the addendum's reachability findings before treating an old commented design as a parity requirement.

- [src/App.tsx:13](../speedy-ts/src/App.tsx) — // const panel = new ControlPanelBlock({
- [src/App.tsx:16](../speedy-ts/src/App.tsx) — // panel.container = el;
- [src/App.tsx:17](../speedy-ts/src/App.tsx) — // const node = await panel.render();

## src/blocks/abstract-block.ts

Source: [src/blocks/abstract-block.ts:1](../speedy-ts/src/blocks/abstract-block.ts). SHA-256: `478e508476a114530656e278637ee192bbdf5bcc721d0956cdc5444ecbd34884`.

Migration family/status: Shared input dispatcher, focus and per-type navigation adapters; not fully ported.

Classes: `AbstractBlock` (implements IBlock).

Binding installation/override sites (first source line; inspect surrounding constructor/factory):

- [src/blocks/abstract-block.ts:66](../speedy-ts/src/blocks/abstract-block.ts) — `AbstractBlock`: `this.inputEvents = []`
- [src/blocks/abstract-block.ts:137](../speedy-ts/src/blocks/abstract-block.ts) — `AbstractBlock.setEvents`: `this.inputEvents.push(...events)`

No local binding/listener/callback/recognizer sites found by the census. For Block classes this **does not mean no behavior**: follow inherited AbstractBlock navigation, nearest Document commands, Universe routing, schema effects and native/widget boundaries in the addendum.

### Named implementation index

This index intentionally includes helper methods as well as handlers. Resolve named calls in the entries above here; methods with no caller/binding are **not** automatically live commands. Shared support methods may be implemented in another indexed file (notably AbstractBlock, DocumentBlock, UniverseBlock, StandoffProperty and SVG helpers).

| Context | Callable | Source |
| --- | --- | --- |
| AbstractBlock | `subscribeTo` | [src/blocks/abstract-block.ts:76](../speedy-ts/src/blocks/abstract-block.ts) |
| AbstractBlock | `publish` | [src/blocks/abstract-block.ts:84](../speedy-ts/src/blocks/abstract-block.ts) |
| AbstractBlock | `getOrSetOverlay` | [src/blocks/abstract-block.ts:95](../speedy-ts/src/blocks/abstract-block.ts) |
| AbstractBlock | `removeOverlay` | [src/blocks/abstract-block.ts:100](../speedy-ts/src/blocks/abstract-block.ts) |
| AbstractBlock | `triggerBeforeChange` | [src/blocks/abstract-block.ts:105](../speedy-ts/src/blocks/abstract-block.ts) |
| AbstractBlock | `removeBlockProperty` | [src/blocks/abstract-block.ts:108](../speedy-ts/src/blocks/abstract-block.ts) |
| AbstractBlock | `addOverlay` | [src/blocks/abstract-block.ts:116](../speedy-ts/src/blocks/abstract-block.ts) |
| AbstractBlock | `setEvents` | [src/blocks/abstract-block.ts:136](../speedy-ts/src/blocks/abstract-block.ts) |
| AbstractBlock | `getKeyCode` | [src/blocks/abstract-block.ts:141](../speedy-ts/src/blocks/abstract-block.ts) |
| AbstractBlock | `toChord` | [src/blocks/abstract-block.ts:145](../speedy-ts/src/blocks/abstract-block.ts) |
| AbstractBlock | `compareChords` | [src/blocks/abstract-block.ts:169](../speedy-ts/src/blocks/abstract-block.ts) |
| AbstractBlock | `getFirstMatchingInputEvent` | [src/blocks/abstract-block.ts:188](../speedy-ts/src/blocks/abstract-block.ts) |
| AbstractBlock | `toMouseInput` | [src/blocks/abstract-block.ts:213](../speedy-ts/src/blocks/abstract-block.ts) |
| AbstractBlock | `toKeyboardInput` | [src/blocks/abstract-block.ts:226](../speedy-ts/src/blocks/abstract-block.ts) |
| AbstractBlock | `setBlockSchemas` | [src/blocks/abstract-block.ts:239](../speedy-ts/src/blocks/abstract-block.ts) |
| AbstractBlock | `addBlockProperties` | [src/blocks/abstract-block.ts:242](../speedy-ts/src/blocks/abstract-block.ts) |
| AbstractBlock | `applyBlockPropertyStyling` | [src/blocks/abstract-block.ts:255](../speedy-ts/src/blocks/abstract-block.ts) |
| AbstractBlock | `getBlock` | [src/blocks/abstract-block.ts:262](../speedy-ts/src/blocks/abstract-block.ts) |
| AbstractBlock | `setCommitHandler` | [src/blocks/abstract-block.ts:265](../speedy-ts/src/blocks/abstract-block.ts) |
| AbstractBlock | `commit` | [src/blocks/abstract-block.ts:268](../speedy-ts/src/blocks/abstract-block.ts) |
| AbstractBlock | `setFocus` | [src/blocks/abstract-block.ts:275](../speedy-ts/src/blocks/abstract-block.ts) |
| AbstractBlock | `handleArrowUp` | [src/blocks/abstract-block.ts:278](../speedy-ts/src/blocks/abstract-block.ts) |
| AbstractBlock | `handleArrowDown` | [src/blocks/abstract-block.ts:288](../speedy-ts/src/blocks/abstract-block.ts) |
| AbstractBlock | `handleArrowRight` | [src/blocks/abstract-block.ts:301](../speedy-ts/src/blocks/abstract-block.ts) |
| AbstractBlock | `handleArrowLeft` | [src/blocks/abstract-block.ts:314](../speedy-ts/src/blocks/abstract-block.ts) |
| AbstractBlock | `toNodeList` | [src/blocks/abstract-block.ts:324](../speedy-ts/src/blocks/abstract-block.ts) |
| AbstractBlock | `newContainer` | [src/blocks/abstract-block.ts:331](../speedy-ts/src/blocks/abstract-block.ts) |
| AbstractBlock | `explode` | [src/blocks/abstract-block.ts:334](../speedy-ts/src/blocks/abstract-block.ts) |
| AbstractBlock | `replaceWith` | [src/blocks/abstract-block.ts:356](../speedy-ts/src/blocks/abstract-block.ts) |
| AbstractBlock | `destroy` | [src/blocks/abstract-block.ts:382](../speedy-ts/src/blocks/abstract-block.ts) |

### Commented/disabled evidence

These are source comments, not installed listeners. They also include relevant intent notes and TODO context. Use the addendum's reachability findings before treating an old commented design as a parity requirement.

- [src/blocks/abstract-block.ts:20](../speedy-ts/src/blocks/abstract-block.ts) — /**      * This will keep track of the last couple of key-combinations entered. The main purpose      * is for triggering two-part bindings, such as 'CTRL-K, CTRL-D'.      */
- [src/blocks/abstract-block.ts:166](../speedy-ts/src/blocks/abstract-block.ts) — // console.log("toChord", { match, chord, platform });
- [src/blocks/abstract-block.ts:189](../speedy-ts/src/blocks/abstract-block.ts) — // console.log("getFirstMatchingInputEvent", { input });
- [src/blocks/abstract-block.ts:197](../speedy-ts/src/blocks/abstract-block.ts) — // console.log("getFirstMatchingInputEvent", { events });
- [src/blocks/abstract-block.ts:358](../speedy-ts/src/blocks/abstract-block.ts) — /**          * Move all first-level block elements out of this.container into newBlock.container.          */
- [src/blocks/abstract-block.ts:369](../speedy-ts/src/blocks/abstract-block.ts) — /**          * Drop newBlock next to this.container and remove the old block's descendants.          */

## src/blocks/book-block.ts

Source: [src/blocks/book-block.ts:1](../speedy-ts/src/blocks/book-block.ts). SHA-256: `fb0622f4318588af63d53156e9cf60bbd45811b887a373d361fb7026246d041f`.

Migration family/status: Book/pages controller and commands; generic view only, page-turn controls absent.

Classes: `BookBlock` (extends AbstractBlock); `FixedSizePageBlock` (extends AbstractBlock).

Binding installation/override sites (first source line; inspect surrounding constructor/factory):

- [src/blocks/book-block.ts:16](../speedy-ts/src/blocks/book-block.ts) — `BookBlock`: `this.inputEvents = this.getInputEvents()`
- [src/blocks/book-block.ts:155](../speedy-ts/src/blocks/book-block.ts) — `FixedSizePageBlock`: `this.inputEvents = this.getInputEvents()`

### blocks-book-block-helper-01

Source: [src/blocks/book-block.ts:59](../speedy-ts/src/blocks/book-block.ts). Kind: `helper`. Context: `BookBlock.setupNavigationControls`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
"click": (e: Event) => {
                    e.preventDefault();
                    self.loadPreviousPageset();
                }
```

### blocks-book-block-helper-02

Source: [src/blocks/book-block.ts:69](../speedy-ts/src/blocks/book-block.ts). Kind: `helper`. Context: `BookBlock.setupNavigationControls`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
"click": (e: Event) => {
                    e.preventDefault();
                    self.loadNextPageset();
                }
```

### Named implementation index

This index intentionally includes helper methods as well as handlers. Resolve named calls in the entries above here; methods with no caller/binding are **not** automatically live commands. Shared support methods may be implemented in another indexed file (notably AbstractBlock, DocumentBlock, UniverseBlock, StandoffProperty and SVG helpers).

| Context | Callable | Source |
| --- | --- | --- |
| BookBlock | `getLastPage` | [src/blocks/book-block.ts:22](../speedy-ts/src/blocks/book-block.ts) |
| BookBlock | `setAllPagesInactive` | [src/blocks/book-block.ts:29](../speedy-ts/src/blocks/book-block.ts) |
| BookBlock | `loadPreviousPageset` | [src/blocks/book-block.ts:32](../speedy-ts/src/blocks/book-block.ts) |
| BookBlock | `loadNextPageset` | [src/blocks/book-block.ts:42](../speedy-ts/src/blocks/book-block.ts) |
| BookBlock | `setupNavigationControls` | [src/blocks/book-block.ts:53](../speedy-ts/src/blocks/book-block.ts) |
| BookBlock | `getBlockSchemas` | [src/blocks/book-block.ts:77](../speedy-ts/src/blocks/book-block.ts) |
| BookBlock | `getBlockBuilder` | [src/blocks/book-block.ts:83](../speedy-ts/src/blocks/book-block.ts) |
| BookBlock | `getInputEvents` | [src/blocks/book-block.ts:104](../speedy-ts/src/blocks/book-block.ts) |
| BookBlock | `build` | [src/blocks/book-block.ts:109](../speedy-ts/src/blocks/book-block.ts) |
| BookBlock | `update` | [src/blocks/book-block.ts:113](../speedy-ts/src/blocks/book-block.ts) |
| BookBlock | `bind` | [src/blocks/book-block.ts:117](../speedy-ts/src/blocks/book-block.ts) |
| BookBlock | `serialize` | [src/blocks/book-block.ts:124](../speedy-ts/src/blocks/book-block.ts) |
| BookBlock | `deserialize` | [src/blocks/book-block.ts:133](../speedy-ts/src/blocks/book-block.ts) |
| FixedSizePageBlock | `getBlockSchemas` | [src/blocks/book-block.ts:158](../speedy-ts/src/blocks/book-block.ts) |
| FixedSizePageBlock | `getBlockBuilder` | [src/blocks/book-block.ts:164](../speedy-ts/src/blocks/book-block.ts) |
| FixedSizePageBlock | `getInputEvents` | [src/blocks/book-block.ts:178](../speedy-ts/src/blocks/book-block.ts) |
| FixedSizePageBlock | `build` | [src/blocks/book-block.ts:183](../speedy-ts/src/blocks/book-block.ts) |
| FixedSizePageBlock | `update` | [src/blocks/book-block.ts:189](../speedy-ts/src/blocks/book-block.ts) |
| FixedSizePageBlock | `setActive` | [src/blocks/book-block.ts:197](../speedy-ts/src/blocks/book-block.ts) |
| FixedSizePageBlock | `setInactive` | [src/blocks/book-block.ts:201](../speedy-ts/src/blocks/book-block.ts) |
| FixedSizePageBlock | `bind` | [src/blocks/book-block.ts:205](../speedy-ts/src/blocks/book-block.ts) |
| FixedSizePageBlock | `serialize` | [src/blocks/book-block.ts:212](../speedy-ts/src/blocks/book-block.ts) |
| FixedSizePageBlock | `deserialize` | [src/blocks/book-block.ts:221](../speedy-ts/src/blocks/book-block.ts) |

## src/blocks/canvas-background-block.ts

Source: [src/blocks/canvas-background-block.ts:1](../speedy-ts/src/blocks/canvas-background-block.ts). SHA-256: `9a847ad9f0d03df68ee86a506e475dc759babe8276758d68bbf4288802a73cb5`.

Migration family/status: Background effect adapter; inherits routing, native/media configuration must be preserved.

Classes: `CanvasBackgroundBlock` (extends AbstractBlock).

No local binding/listener/callback/recognizer sites found by the census. For Block classes this **does not mean no behavior**: follow inherited AbstractBlock navigation, nearest Document commands, Universe routing, schema effects and native/widget boundaries in the addendum.

### Named implementation index

This index intentionally includes helper methods as well as handlers. Resolve named calls in the entries above here; methods with no caller/binding are **not** automatically live commands. Shared support methods may be implemented in another indexed file (notably AbstractBlock, DocumentBlock, UniverseBlock, StandoffProperty and SVG helpers).

| Context | Callable | Source |
| --- | --- | --- |
| CanvasBackgroundBlock | `createGradient` | [src/blocks/canvas-background-block.ts:33](../speedy-ts/src/blocks/canvas-background-block.ts) |
| CanvasBackgroundBlock | `getBlockBuilder` | [src/blocks/canvas-background-block.ts:51](../speedy-ts/src/blocks/canvas-background-block.ts) |
| CanvasBackgroundBlock | `serialize` | [src/blocks/canvas-background-block.ts:64](../speedy-ts/src/blocks/canvas-background-block.ts) |
| CanvasBackgroundBlock | `deserialize` | [src/blocks/canvas-background-block.ts:73](../speedy-ts/src/blocks/canvas-background-block.ts) |

## src/blocks/canvas-block.ts

Source: [src/blocks/canvas-block.ts:1](../speedy-ts/src/blocks/canvas-block.ts). SHA-256: `a68fad3a635d0b3d4de22083cceff855857067fdb90cabe5a37cfa7a85b5ce2e`.

Migration family/status: Canvas controller; generic view only, InfiniteCanvas gestures absent.

Classes: `CanvasBlock` (extends AbstractBlock).

No local binding/listener/callback/recognizer sites found by the census. For Block classes this **does not mean no behavior**: follow inherited AbstractBlock navigation, nearest Document commands, Universe routing, schema effects and native/widget boundaries in the addendum.

### Named implementation index

This index intentionally includes helper methods as well as handlers. Resolve named calls in the entries above here; methods with no caller/binding are **not** automatically live commands. Shared support methods may be implemented in another indexed file (notably AbstractBlock, DocumentBlock, UniverseBlock, StandoffProperty and SVG helpers).

| Context | Callable | Source |
| --- | --- | --- |
| CanvasBlock | `getBlockBuilder` | [src/blocks/canvas-block.ts:20](../speedy-ts/src/blocks/canvas-block.ts) |
| CanvasBlock | `build` | [src/blocks/canvas-block.ts:34](../speedy-ts/src/blocks/canvas-block.ts) |
| CanvasBlock | `bind` | [src/blocks/canvas-block.ts:51](../speedy-ts/src/blocks/canvas-block.ts) |
| CanvasBlock | `serialize` | [src/blocks/canvas-block.ts:58](../speedy-ts/src/blocks/canvas-block.ts) |
| CanvasBlock | `deserialize` | [src/blocks/canvas-block.ts:67](../speedy-ts/src/blocks/canvas-block.ts) |

## src/blocks/checkbox-block.ts

Source: [src/blocks/checkbox-block.ts:1](../speedy-ts/src/blocks/checkbox-block.ts). SHA-256: `3d600c34a9baf0a0d9da2e9e5aa6071a3a694fb51868132cfb4811827bf8a16c`.

Migration family/status: Checkbox controller and navigation; native change is partial, quoted-space/navigation parity unported.

Classes: `CheckboxBlock` (extends AbstractBlock).

Binding installation/override sites (first source line; inspect surrounding constructor/factory):

- [src/blocks/checkbox-block.ts:40](../speedy-ts/src/blocks/checkbox-block.ts) — `CheckboxBlock`: `this.inputEvents = [`

### blocks-checkbox-block-binding-01

Source: [src/blocks/checkbox-block.ts:41](../speedy-ts/src/blocks/checkbox-block.ts). Kind: `binding`. Context: `CheckboxBlock`.

Route: the owning Block's binding list, subject to actual factory installation, mode/trigger matching and origin-to-owner dispatch. Destination/status: the file's migration family above; unresolved until individually qualified.

```tsx
{
                mode: "default",
                trigger: {
                    source: InputEventSource.Keyboard,
                    match: "' '"
                },
                action: {
                    name: "Decrease the length of the annotation.",
                    description: "",
                    handler: async (args: any) => {
                        if (self.checked) {
                            self.uncheck();
                        } else {
                            self.check();
                        }
                    }
                }
            }
```

### blocks-checkbox-block-listener-01

Source: [src/blocks/checkbox-block.ts:80](../speedy-ts/src/blocks/checkbox-block.ts). Kind: `listener`. Context: `CheckboxBlock.setupEventHandlers`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
this.checkbox.addEventListener("change", () => {
            self.triggerBeforeChange();
            self.checked = !self.checked;
        })
```

### Named implementation index

This index intentionally includes helper methods as well as handlers. Resolve named calls in the entries above here; methods with no caller/binding are **not** automatically live commands. Shared support methods may be implemented in another indexed file (notably AbstractBlock, DocumentBlock, UniverseBlock, StandoffProperty and SVG helpers).

| Context | Callable | Source |
| --- | --- | --- |
| CheckboxBlock | `getBlockBuilder` | [src/blocks/checkbox-block.ts:64](../speedy-ts/src/blocks/checkbox-block.ts) |
| CheckboxBlock | `setupEventHandlers` | [src/blocks/checkbox-block.ts:78](../speedy-ts/src/blocks/checkbox-block.ts) |
| CheckboxBlock | `check` | [src/blocks/checkbox-block.ts:85](../speedy-ts/src/blocks/checkbox-block.ts) |
| CheckboxBlock | `uncheck` | [src/blocks/checkbox-block.ts:94](../speedy-ts/src/blocks/checkbox-block.ts) |
| CheckboxBlock | `handleArrowRight` | [src/blocks/checkbox-block.ts:99](../speedy-ts/src/blocks/checkbox-block.ts) |
| CheckboxBlock | `handleArrowLeft` | [src/blocks/checkbox-block.ts:102](../speedy-ts/src/blocks/checkbox-block.ts) |
| CheckboxBlock | `handleArrowUp` | [src/blocks/checkbox-block.ts:105](../speedy-ts/src/blocks/checkbox-block.ts) |
| CheckboxBlock | `getDocument` | [src/blocks/checkbox-block.ts:129](../speedy-ts/src/blocks/checkbox-block.ts) |
| CheckboxBlock | `handleArrowDown` | [src/blocks/checkbox-block.ts:132](../speedy-ts/src/blocks/checkbox-block.ts) |
| CheckboxBlock | `serialize` | [src/blocks/checkbox-block.ts:161](../speedy-ts/src/blocks/checkbox-block.ts) |
| CheckboxBlock | `deserialize` | [src/blocks/checkbox-block.ts:171](../speedy-ts/src/blocks/checkbox-block.ts) |

## src/blocks/code-mirror-block.ts

Source: [src/blocks/code-mirror-block.ts:1](../speedy-ts/src/blocks/code-mirror-block.ts). SHA-256: `8a1ee64ed2cf8ca2191a8659f2160ae319865d061e7914acb5755ecbc67d33ef`.

Migration family/status: Opaque CodeMirror adapter; current CodeBlockView is a textarea, not CodeMirror parity.

Classes: `CodeMirrorBlock` (extends AbstractBlock).

No local binding/listener/callback/recognizer sites found by the census. For Block classes this **does not mean no behavior**: follow inherited AbstractBlock navigation, nearest Document commands, Universe routing, schema effects and native/widget boundaries in the addendum.

### Named implementation index

This index intentionally includes helper methods as well as handlers. Resolve named calls in the entries above here; methods with no caller/binding are **not** automatically live commands. Shared support methods may be implemented in another indexed file (notably AbstractBlock, DocumentBlock, UniverseBlock, StandoffProperty and SVG helpers).

| Context | Callable | Source |
| --- | --- | --- |
| CodeMirrorBlock | `getBlockBuilder` | [src/blocks/code-mirror-block.ts:29](../speedy-ts/src/blocks/code-mirror-block.ts) |
| CodeMirrorBlock | `attachEventHandlers` | [src/blocks/code-mirror-block.ts:45](../speedy-ts/src/blocks/code-mirror-block.ts) |
| CodeMirrorBlock | `handleKeyDown` | [src/blocks/code-mirror-block.ts:48](../speedy-ts/src/blocks/code-mirror-block.ts) |
| CodeMirrorBlock | `getContent` | [src/blocks/code-mirror-block.ts:70](../speedy-ts/src/blocks/code-mirror-block.ts) |
| CodeMirrorBlock | `bind` | [src/blocks/code-mirror-block.ts:73](../speedy-ts/src/blocks/code-mirror-block.ts) |
| CodeMirrorBlock | `serialize` | [src/blocks/code-mirror-block.ts:76](../speedy-ts/src/blocks/code-mirror-block.ts) |
| CodeMirrorBlock | `deserialize` | [src/blocks/code-mirror-block.ts:86](../speedy-ts/src/blocks/code-mirror-block.ts) |

## src/blocks/container-block.ts

Source: [src/blocks/container-block.ts:1](../speedy-ts/src/blocks/container-block.ts). SHA-256: `094305bc7dc96f37d8d8a0a3b9a88b1ec2dc73e90d447f43f804a224d24ca228`.

Migration family/status: Container commands and inherited routing; generic renderer does not establish input parity.

Classes: `ContainerBlock` (extends AbstractBlock).

Binding installation/override sites (first source line; inspect surrounding constructor/factory):

- [src/blocks/container-block.ts:12](../speedy-ts/src/blocks/container-block.ts) — `ContainerBlock`: `this.inputEvents = this.getInputEvents()`

No local binding/listener/callback/recognizer sites found by the census. For Block classes this **does not mean no behavior**: follow inherited AbstractBlock navigation, nearest Document commands, Universe routing, schema effects and native/widget boundaries in the addendum.

### Named implementation index

This index intentionally includes helper methods as well as handlers. Resolve named calls in the entries above here; methods with no caller/binding are **not** automatically live commands. Shared support methods may be implemented in another indexed file (notably AbstractBlock, DocumentBlock, UniverseBlock, StandoffProperty and SVG helpers).

| Context | Callable | Source |
| --- | --- | --- |
| ContainerBlock | `getBlockSchemas` | [src/blocks/container-block.ts:15](../speedy-ts/src/blocks/container-block.ts) |
| ContainerBlock | `getBlockBuilder` | [src/blocks/container-block.ts:21](../speedy-ts/src/blocks/container-block.ts) |
| ContainerBlock | `getInputEvents` | [src/blocks/container-block.ts:35](../speedy-ts/src/blocks/container-block.ts) |
| ContainerBlock | `build` | [src/blocks/container-block.ts:40](../speedy-ts/src/blocks/container-block.ts) |
| ContainerBlock | `update` | [src/blocks/container-block.ts:44](../speedy-ts/src/blocks/container-block.ts) |
| ContainerBlock | `bind` | [src/blocks/container-block.ts:47](../speedy-ts/src/blocks/container-block.ts) |
| ContainerBlock | `serialize` | [src/blocks/container-block.ts:54](../speedy-ts/src/blocks/container-block.ts) |
| ContainerBlock | `deserialize` | [src/blocks/container-block.ts:63](../speedy-ts/src/blocks/container-block.ts) |

## src/blocks/context-menu-block.tsx

Source: [src/blocks/context-menu-block.tsx:1](../speedy-ts/src/blocks/context-menu-block.tsx). SHA-256: `e6750aa5a1b253631d45e0622563bcb995feb888ccd1d7a2c5054e64125f1f50`.

Migration family/status: Session window-theme panel; generic view only.

Classes: `ContextMenuBlock` (extends AbstractBlock).

Binding installation/override sites (first source line; inspect surrounding constructor/factory):

- [src/blocks/context-menu-block.tsx:19](../speedy-ts/src/blocks/context-menu-block.tsx) — `ContextMenuBlock`: `this.inputEvents = [`

### blocks-context-menu-block-binding-01

Source: [src/blocks/context-menu-block.tsx:20](../speedy-ts/src/blocks/context-menu-block.tsx). Kind: `binding`. Context: `ContextMenuBlock`.

Route: the owning Block's binding list, subject to actual factory installation, mode/trigger matching and origin-to-owner dispatch. Destination/status: the file's migration family above; unresolved until individually qualified.

```tsx
{
                mode: "default",
                trigger: {
                    source: InputEventSource.Keyboard,
                    match: "Escape"
                },
                action: {
                    name: "Close the context menu",
                    handler: async (args: IBindingHandlerArgs) => {
                        const _this = args.block as ContextMenuBlock;
                        _this.destroy();                        
                    }
                }
            }
```

### blocks-context-menu-block-jsx-01

Source: [src/blocks/context-menu-block.tsx:119](../speedy-ts/src/blocks/context-menu-block.tsx). Kind: `jsx`. Context: `View`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick={normalClicked}
```

### blocks-context-menu-block-jsx-02

Source: [src/blocks/context-menu-block.tsx:122](../speedy-ts/src/blocks/context-menu-block.tsx). Kind: `jsx`. Context: `View`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick={glassClicked}
```

### Named implementation index

This index intentionally includes helper methods as well as handlers. Resolve named calls in the entries above here; methods with no caller/binding are **not** automatically live commands. Shared support methods may be implemented in another indexed file (notably AbstractBlock, DocumentBlock, UniverseBlock, StandoffProperty and SVG helpers).

| Context | Callable | Source |
| --- | --- | --- |
| ContextMenuBlock | `setupPosition` | [src/blocks/context-menu-block.tsx:39](../speedy-ts/src/blocks/context-menu-block.tsx) |
| ContextMenuBlock | `getBlockBuilder` | [src/blocks/context-menu-block.tsx:53](../speedy-ts/src/blocks/context-menu-block.tsx) |
| ContextMenuBlock | `render` | [src/blocks/context-menu-block.tsx:63](../speedy-ts/src/blocks/context-menu-block.tsx) |
| ContextMenuBlock | `serialize` | [src/blocks/context-menu-block.tsx:68](../speedy-ts/src/blocks/context-menu-block.tsx) |
| ContextMenuBlock | `deserialize` | [src/blocks/context-menu-block.tsx:74](../speedy-ts/src/blocks/context-menu-block.tsx) |
| ContextMenuBlock | `destroy` | [src/blocks/context-menu-block.tsx:77](../speedy-ts/src/blocks/context-menu-block.tsx) |
| ContextMenuBlock | `switchThemeTo` | [src/blocks/context-menu-block.tsx:81](../speedy-ts/src/blocks/context-menu-block.tsx) |
|  | `View` | [src/blocks/context-menu-block.tsx:103](../speedy-ts/src/blocks/context-menu-block.tsx) |
| View | `normalClicked` | [src/blocks/context-menu-block.tsx:104](../speedy-ts/src/blocks/context-menu-block.tsx) |
| View | `glassClicked` | [src/blocks/context-menu-block.tsx:108](../speedy-ts/src/blocks/context-menu-block.tsx) |

## src/blocks/document-block.ts

Source: [src/blocks/document-block.ts:1](../speedy-ts/src/blocks/document-block.ts). SHA-256: `4fec9892654988424076a10bc1a692385195e4974c81319b2804701248be33a7`.

Migration family/status: Document command controller and Standoff adapter; beforeinput edit subset only, full binding catalog unported.

Classes: `DocumentBlock` (extends AbstractBlock).

Binding installation/override sites (first source line; inspect surrounding constructor/factory):

- [src/blocks/document-block.ts:52](../speedy-ts/src/blocks/document-block.ts) — `DocumentBlock`: `this.inputEvents = this.getInputEvents()`

### blocks-document-block-callback-01

Source: [src/blocks/document-block.ts:167](../speedy-ts/src/blocks/document-block.ts). Kind: `callback`. Context: `DocumentBlock.getBlockSchemas`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onInit: (p: BlockProperty) => {
                        const vines = new BlockVines(p.block);
                        vines.update();
                    }
```

### blocks-document-block-callback-02

Source: [src/blocks/document-block.ts:190](../speedy-ts/src/blocks/document-block.ts). Kind: `callback`. Context: `DocumentBlock.getBlockSchemas`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onInit: async (p: BlockProperty) => {
                        p.block.container.style.marginLeft = (parseInt(p.value) * 20) + "px";
                    }
```

### blocks-document-block-callback-03

Source: [src/blocks/document-block.ts:214](../speedy-ts/src/blocks/document-block.ts). Kind: `callback`. Context: `DocumentBlock.getBlockSchemas`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onInit: (p: BlockProperty) => {
                        const url = p.value || (p.value = prompt("Background image url: ") || "");
                        if (!url) return;
                        const panel = p.block.container;
                        setElement(panel, {
                            style: {
                                "background-size": "cover",
                                "background": "url(" + url + ") no-repeat center center fixed"
                            }
                        });
                    }
```

### blocks-document-block-callback-04

Source: [src/blocks/document-block.ts:231](../speedy-ts/src/blocks/document-block.ts). Kind: `callback`. Context: `DocumentBlock.getBlockSchemas`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onInit: (p: BlockProperty) => {
                        setElement(p.block.container, {
                            style: {
                                "background-color": p.value
                            }
                        });
                    }
```

### blocks-document-block-callback-05

Source: [src/blocks/document-block.ts:244](../speedy-ts/src/blocks/document-block.ts). Kind: `callback`. Context: `DocumentBlock.getBlockSchemas`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onInit: (p: BlockProperty) => {
                        setElement(p.block.container, {
                            style: {
                                "color": p.value
                            }
                        });
                    }
```

### blocks-document-block-listener-01

Source: [src/blocks/document-block.ts:256](../speedy-ts/src/blocks/document-block.ts). Kind: `listener`. Context: `DocumentBlock.setupSubscriptions`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
this.subscribeTo(EventType.beforeChange, this.addToHistory.bind(this))
```

### blocks-document-block-binding-01

Source: [src/blocks/document-block.ts:688](../speedy-ts/src/blocks/document-block.ts). Kind: `binding`. Context: `DocumentBlock.getInputEvents`.

Route: the owning Block's binding list, subject to actual factory installation, mode/trigger matching and origin-to-owner dispatch. Destination/status: the file's migration family above; unresolved until individually qualified.

```tsx
{
                mode: "default",
                trigger: {
                    source: InputEventSource.Keyboard,
                    match: "Control-X"
                },
                action: {
                    name: "Copy current block into a new DocumentWindow.",
                    description: `
                        
                    `,
                    handler: async (args) => {
                        await _this.extractIntoNewDocument(args.block.id);
                    }
                }
            }
```

### blocks-document-block-binding-02

Source: [src/blocks/document-block.ts:704](../speedy-ts/src/blocks/document-block.ts). Kind: `binding`. Context: `DocumentBlock.getInputEvents`.

Route: the owning Block's binding list, subject to actual factory installation, mode/trigger matching and origin-to-owner dispatch. Destination/status: the file's migration family above; unresolved until individually qualified.

```tsx
{
                mode: "default",
                trigger: {
                    source: InputEventSource.Keyboard,
                    match: "Enter"
                },
                action: {
                    name: "Create a new text block. Move text to the right of the caret into the new block.",
                    description: `
                        
                    `,
                    handler: _this.handleEnterKey.bind(_this)
                }
            }
```

### blocks-document-block-binding-03

Source: [src/blocks/document-block.ts:718](../speedy-ts/src/blocks/document-block.ts). Kind: `binding`. Context: `DocumentBlock.getInputEvents`.

Route: the owning Block's binding list, subject to actual factory installation, mode/trigger matching and origin-to-owner dispatch. Destination/status: the file's migration family above; unresolved until individually qualified.

```tsx
{
                mode: "default",
                trigger: {
                    source: InputEventSource.Keyboard,
                    match: "Delete"
                },
                action: {
                    name: "Delete the character to the right",
                    description: `
                        Delete the character to the right and move the cursor to the left of the character to the right.
                        If at the start of the block (i.e., no character to the left) then issues an event
                        named "DELETE_CHARACTER_FROM_START_OF_BLOCK" (?).
                    `,
                    handler: _this.handleDelete.bind(_this)
                }
            }
```

### blocks-document-block-binding-04

Source: [src/blocks/document-block.ts:734](../speedy-ts/src/blocks/document-block.ts). Kind: `binding`. Context: `DocumentBlock.getInputEvents`.

Route: the owning Block's binding list, subject to actual factory installation, mode/trigger matching and origin-to-owner dispatch. Destination/status: the file's migration family above; unresolved until individually qualified.

```tsx
{
                mode: "default",
                trigger: {
                    source: InputEventSource.Keyboard,
                    match: "Shift-Delete"
                },
                action: {
                    name: "Delete the entire block.",
                    description: ``,
                    handler: async (args: IBindingHandlerArgs) => {
                        const block = args.block;
                        const manager = block.manager as UniverseBlock;
                        const next = block.relation.next;
                        const previous = block.relation.previous;
                        const parent= block.relation.parent;
                        _this.deleteBlock(block.id);
                        const switchToBlock = next || previous || parent;
                        if (!switchToBlock) return;
                        manager.setBlockFocus(switchToBlock);
                        if (switchToBlock.type == BlockType.StandoffEditorBlock) (switchToBlock as StandoffEditorBlock).moveCaretStart();
                        return;
                    }
                }
            }
```

### blocks-document-block-binding-05

Source: [src/blocks/document-block.ts:758](../speedy-ts/src/blocks/document-block.ts). Kind: `binding`. Context: `DocumentBlock.getInputEvents`.

Route: the owning Block's binding list, subject to actual factory installation, mode/trigger matching and origin-to-owner dispatch. Destination/status: the file's migration family above; unresolved until individually qualified.

```tsx
{
                mode: "default",
                trigger: {
                    source: InputEventSource.Keyboard,
                    match: "Control-Delete"
                },
                action: {
                    name: "Delete all the characters to the right, up to the end of the text block.",
                    description: `
                        
                    `,
                    handler: async (args: IBindingHandlerArgs) => {
                        /**
                         * NB: not working as expected. Check the removeCellsAtIndex method chain carefully.
                         */
                        const caret = args.caret as Caret;
                        const block = args.block as StandoffEditorBlock;
                        if (caret.right.isEOL) {
                            return;
                        }
                        const last = block.getLastCell();
                        const si = caret.right.index;
                        const len = last.index - si;
                        block.removeCellsAtIndex(si, len);
                        block.setCaret(si, CARET.RIGHT);
                    }
                }
            }
```

### blocks-document-block-binding-06

Source: [src/blocks/document-block.ts:786](../speedy-ts/src/blocks/document-block.ts). Kind: `binding`. Context: `DocumentBlock.getInputEvents`.

Route: the owning Block's binding list, subject to actual factory installation, mode/trigger matching and origin-to-owner dispatch. Destination/status: the file's migration family above; unresolved until individually qualified.

```tsx
{
                mode: "default",
                trigger: {
                    source: InputEventSource.Keyboard,
                    match: "Control-Backspace"
                },
                action: {
                    name: "Deletes leftwards one word at a time.",
                    description: `
                        
                    `,
                    handler: async (args: IBindingHandlerArgs) => {
                        /**
                         * Not working properly yet.
                         */
                        const caret = args.caret as Caret;
                        const block = args.block as StandoffEditorBlock;
                        const manager = block.manager;
                        const doc = manager.getParentOfType(block, BlockType.DocumentBlock) as DocumentBlock;
                        if (!caret.left) {
                            return;
                        }
                        const i = caret.left.index;
                        const text = block.getText();
                        const words = block.getWordsFromText(text);
                        const nearest = doc.findNearestWord(i, words);
                        if (!nearest) {
                            return;
                        }
                        const start = !nearest.previous ? 0 : nearest.previous.start;
                        const len = (i - start) + 1;
                        block.removeCellsAtIndex(start, len);
                        block.setCaret(start, CARET.LEFT);
                    }
                }
            }
```

### blocks-document-block-binding-07

Source: [src/blocks/document-block.ts:838](../speedy-ts/src/blocks/document-block.ts). Kind: `binding`. Context: `DocumentBlock.getInputEvents`.

Route: the owning Block's binding list, subject to actual factory installation, mode/trigger matching and origin-to-owner dispatch. Destination/status: the file's migration family above; unresolved until individually qualified.

```tsx
{
                mode: "default",
                trigger: {
                    source: InputEventSource.Mouse,
                    match: "Control-ClickLeft"
                },
                action: {
                    name: "Block selection",
                    description: "Toggles selection of a block; handles multiple block selections.",
                    handler: async (args: IBindingHandlerArgs) => {
                        const block = args.block;
                        const manager = block.manager as UniverseBlock;
                        manager.toggleBlockSelection(block.id);
                    }
                }
            }
```

### blocks-document-block-binding-08

Source: [src/blocks/document-block.ts:854](../speedy-ts/src/blocks/document-block.ts). Kind: `binding`. Context: `DocumentBlock.getInputEvents`.

Route: the owning Block's binding list, subject to actual factory installation, mode/trigger matching and origin-to-owner dispatch. Destination/status: the file's migration family above; unresolved until individually qualified.

```tsx
{
                mode: "default",
                trigger: {
                    source: InputEventSource.Keyboard,
                    match: ["Mac:Meta-U","Windows:Control-U"]
                },
                action: {
                    name: "Show the annotation menu.",
                    description: `
                        
                    `,
                    handler: this.loadAnnotationMenu.bind(this)
                }
            }
```

### blocks-document-block-binding-09

Source: [src/blocks/document-block.ts:868](../speedy-ts/src/blocks/document-block.ts). Kind: `binding`. Context: `DocumentBlock.getInputEvents`.

Route: the owning Block's binding list, subject to actual factory installation, mode/trigger matching and origin-to-owner dispatch. Destination/status: the file's migration family above; unresolved until individually qualified.

```tsx
{
                mode: "default",
                trigger: {
                    source: InputEventSource.Custom,
                    match: "paste"
                },
                action: {
                    name: "Paste",
                    description: "Pastes plain text",
                    handler: this.handlePaste.bind(this)
                }
            }
```

### blocks-document-block-binding-10

Source: [src/blocks/document-block.ts:880](../speedy-ts/src/blocks/document-block.ts). Kind: `binding`. Context: `DocumentBlock.getInputEvents`.

Route: the owning Block's binding list, subject to actual factory installation, mode/trigger matching and origin-to-owner dispatch. Destination/status: the file's migration family above; unresolved until individually qualified.

```tsx
{
                mode: "default",
                trigger: {
                    source: InputEventSource.Keyboard,
                    match: ["Mac:Meta-Z","Windows:Control-Z"]
                },
                action: {
                    name: "Undo",
                    description: "",
                    handler: async (args) => {
                        _this.undoHistory();
                    }
                }
            }
```

### blocks-document-block-binding-11

Source: [src/blocks/document-block.ts:894](../speedy-ts/src/blocks/document-block.ts). Kind: `binding`. Context: `DocumentBlock.getInputEvents`.

Route: the owning Block's binding list, subject to actual factory installation, mode/trigger matching and origin-to-owner dispatch. Destination/status: the file's migration family above; unresolved until individually qualified.

```tsx
{
                mode: "default",
                trigger: {
                    source: InputEventSource.Keyboard,
                    match: ["Mac:Meta-D","Windows:Control-D"]
                },
                action: {
                    name: "Redo",
                    description: "",
                    handler: async (args) => {
                        _this.redoHistory();
                    }
                }
            }
```

### blocks-document-block-binding-12

Source: [src/blocks/document-block.ts:908](../speedy-ts/src/blocks/document-block.ts). Kind: `binding`. Context: `DocumentBlock.getInputEvents`.

Route: the owning Block's binding list, subject to actual factory installation, mode/trigger matching and origin-to-owner dispatch. Destination/status: the file's migration family above; unresolved until individually qualified.

```tsx
{
                mode: "default",
                trigger: {
                    source: InputEventSource.Keyboard,
                    match: "Shift-Control-ArrowLeft"
                },
                action: {
                    name: "Create a left margin block.",
                    description: `
                        Let's describe how this works ...
                    `,
                    handler: this.handleCreateLeftMargin.bind(this)
                }
            }
```

### blocks-document-block-binding-13

Source: [src/blocks/document-block.ts:922](../speedy-ts/src/blocks/document-block.ts). Kind: `binding`. Context: `DocumentBlock.getInputEvents`.

Route: the owning Block's binding list, subject to actual factory installation, mode/trigger matching and origin-to-owner dispatch. Destination/status: the file's migration family above; unresolved until individually qualified.

```tsx
{
                mode: "default",
                trigger: {
                    source: InputEventSource.Keyboard,
                    match: "Shift-Control-ArrowRight"
                },
                action: {
                    name: "Create a right margin block.",
                    description: `
                        Let's describe how this works ...
                    `,
                    handler: this.handleCreateRightMargin.bind(this)
                }
            }
```

### blocks-document-block-binding-14

Source: [src/blocks/document-block.ts:936](../speedy-ts/src/blocks/document-block.ts). Kind: `binding`. Context: `DocumentBlock.getInputEvents`.

Route: the owning Block's binding list, subject to actual factory installation, mode/trigger matching and origin-to-owner dispatch. Destination/status: the file's migration family above; unresolved until individually qualified.

```tsx
{
                mode: "default",
                trigger: {
                    source: InputEventSource.Keyboard,
                    match: "Control-Shift-ArrowUp"
                },
                action: {
                    name: "Move the focus block up one block.",
                    description: `
                        
                    `,
                    handler: this.handleMoveBlockUp.bind(this)
                }
            }
```

### blocks-document-block-binding-15

Source: [src/blocks/document-block.ts:950](../speedy-ts/src/blocks/document-block.ts). Kind: `binding`. Context: `DocumentBlock.getInputEvents`.

Route: the owning Block's binding list, subject to actual factory installation, mode/trigger matching and origin-to-owner dispatch. Destination/status: the file's migration family above; unresolved until individually qualified.

```tsx
{
                mode: "default",
                trigger: {
                    source: InputEventSource.Keyboard,
                    match: "Tab"
                },
                action: {
                    name: "Indent the current block.",
                    description: `
                        
                    `,
                    handler: this.indentBlock.bind(this)
                }
            }
```

### blocks-document-block-binding-16

Source: [src/blocks/document-block.ts:964](../speedy-ts/src/blocks/document-block.ts). Kind: `binding`. Context: `DocumentBlock.getInputEvents`.

Route: the owning Block's binding list, subject to actual factory installation, mode/trigger matching and origin-to-owner dispatch. Destination/status: the file's migration family above; unresolved until individually qualified.

```tsx
{
                mode: "default",
                trigger: {
                    source: InputEventSource.Keyboard,
                    match: "Shift-Tab"
                },
                action: {
                    name: "De-indent the current block.",
                    description: `
                        
                    `,
                    handler: this.deindentBlock.bind(this)
                }
            }
```

### blocks-document-block-binding-17

Source: [src/blocks/document-block.ts:978](../speedy-ts/src/blocks/document-block.ts). Kind: `binding`. Context: `DocumentBlock.getInputEvents`.

Route: the owning Block's binding list, subject to actual factory installation, mode/trigger matching and origin-to-owner dispatch. Destination/status: the file's migration family above; unresolved until individually qualified.

```tsx
{
                mode: "default",
                trigger: {
                    source: InputEventSource.Keyboard,
                    match: "Shift-Backspace"
                },
                action: {
                    name: "Delete the entire block.",
                    description: ``,
                    handler: async (args: IBindingHandlerArgs) => {
                        const block = args.block;
                        const manager = block.manager as UniverseBlock;
                        const next = block.relation.next;
                        const previous = block.relation.previous;
                        const parent= block.relation.parent;
                        this.deleteBlock(block.id);
                        const switchToBlock = previous || next || parent;
                        if (!switchToBlock) return;
                        manager.setBlockFocus(switchToBlock);
                        if (switchToBlock.type == BlockType.StandoffEditorBlock) (switchToBlock as StandoffEditorBlock).moveCaretStart();
                        return;
                    }
                }
            }
```

### blocks-document-block-binding-18

Source: [src/blocks/document-block.ts:1002](../speedy-ts/src/blocks/document-block.ts). Kind: `binding`. Context: `DocumentBlock.getInputEvents`.

Route: the owning Block's binding list, subject to actual factory installation, mode/trigger matching and origin-to-owner dispatch. Destination/status: the file's migration family above; unresolved until individually qualified.

```tsx
{
                mode: "default",
                trigger: {
                    source: InputEventSource.Keyboard,
                    match: "Control-Shift-ArrowDown"
                },
                action: {
                    name: "Move the focus block down one block.",
                    description: `
                        
                    `,
                    handler: this.handleMoveBlockDown.bind(this)
                }
            }
```

### blocks-document-block-binding-19

Source: [src/blocks/document-block.ts:1016](../speedy-ts/src/blocks/document-block.ts). Kind: `binding`. Context: `DocumentBlock.getInputEvents`.

Route: the owning Block's binding list, subject to actual factory installation, mode/trigger matching and origin-to-owner dispatch. Destination/status: the file's migration family above; unresolved until individually qualified.

```tsx
{
                mode: "default",
                trigger: {
                    source: InputEventSource.Keyboard,
                    match: "Shift-ArrowUp"
                },
                action: {
                    name: "Move the cursor up one row. If one isn't found, do nothing.",
                    description: `
                        
                    `,
                    handler: async (args: IBindingHandlerArgs) => {
                        const block = args.block as StandoffEditorBlock;
                        const caret = args.caret as Caret;
                        const selection = block.getSelection() as IRange;
                        console.log("Shift-ArrowUp", { selection, caret, lastCell: block.getLastCell() });
                        if (!selection) {
                            const row = block.getCellInRow(caret.right, RowPosition.Previous);
                            if (!row) {
                                block.setSelection({ start: block.cells[0], end: caret.right, direction: DIRECTION.RIGHT } as ISelection);
                            } else {
                                block.setSelection({ start: row.cell, end: caret.right, direction: DIRECTION.RIGHT } as ISelection);
                            }
                            return;
                        }
                        const row = block.getCellInRow(selection.end, RowPosition.Previous);
                        if (!row) {
                            block.setSelection({ start: block.cells[0], end: selection.end, direction: DIRECTION.RIGHT } as ISelection);
                            return;
                        }
                        block.setSelection({ start: selection.start, end: row.cell, direction: DIRECTION.RIGHT } as ISelection);
                    }
                }
            }
```

### blocks-document-block-binding-20

Source: [src/blocks/document-block.ts:1050](../speedy-ts/src/blocks/document-block.ts). Kind: `binding`. Context: `DocumentBlock.getInputEvents`.

Route: the owning Block's binding list, subject to actual factory installation, mode/trigger matching and origin-to-owner dispatch. Destination/status: the file's migration family above; unresolved until individually qualified.

```tsx
{
                mode: "default",
                trigger: {
                    source: InputEventSource.Keyboard,
                    match: "Shift-ArrowDown"
                },
                action: {
                    name: "Move the cursor down one row. If one isn't found, do nothing.",
                    description: `
                        
                    `,
                    handler: async (args: IBindingHandlerArgs) => {
                        const block = args.block as StandoffEditorBlock;
                        const caret = args.caret as Caret;
                        const selection = block.getSelection() as IRange;
                        console.log("Shift-ArrowDown", { selection, caret, lastCell: block.getLastCell() });
                        if (!selection) {
                            const row = block.getCellInRow(caret.right, RowPosition.Next);
                            if (!row) {
                                block.setSelection({ start: caret.right, end: block.getLastCell(), direction: DIRECTION.RIGHT } as ISelection);
                            } else {
                                block.setSelection({ start: caret.right, end: row.cell, direction: DIRECTION.RIGHT } as ISelection);
                            }
                            return;
                        }
                        const row = block.getCellInRow(selection.end, RowPosition.Next);
                        if (!row) {
                            block.setSelection({ start: selection.start, end: block.getLastCell(), direction: DIRECTION.RIGHT } as ISelection);
                            return;
                        }
                        block.setSelection({ start: selection.start, end: row.cell, direction: DIRECTION.RIGHT } as ISelection);
                    }
                }
            }
```

### blocks-document-block-binding-21

Source: [src/blocks/document-block.ts:1084](../speedy-ts/src/blocks/document-block.ts). Kind: `binding`. Context: `DocumentBlock.getInputEvents`.

Route: the owning Block's binding list, subject to actual factory installation, mode/trigger matching and origin-to-owner dispatch. Destination/status: the file's migration family above; unresolved until individually qualified.

```tsx
{
                mode: "default",
                trigger: {
                    source: InputEventSource.Keyboard,
                    match: "ArrowUp"
                },
                action: {
                    name: "Move the cursor down one row. If one isn't found, move to the next block.",
                    description: `
                        
                    `,
                    handler: this.moveCaretUp.bind(this)
                }
            }
```

### blocks-document-block-binding-22

Source: [src/blocks/document-block.ts:1098](../speedy-ts/src/blocks/document-block.ts). Kind: `binding`. Context: `DocumentBlock.getInputEvents`.

Route: the owning Block's binding list, subject to actual factory installation, mode/trigger matching and origin-to-owner dispatch. Destination/status: the file's migration family above; unresolved until individually qualified.

```tsx
{
                mode: "global",
                trigger: {
                    source: InputEventSource.Keyboard,
                    match: "ArrowDown"
                },
                action: {
                    name: "Set focus to the block below.",
                    description: "",
                    handler: this.moveCaretDown.bind(this)
                }
            }
```

### blocks-document-block-binding-23

Source: [src/blocks/document-block.ts:1110](../speedy-ts/src/blocks/document-block.ts). Kind: `binding`. Context: `DocumentBlock.getInputEvents`.

Route: the owning Block's binding list, subject to actual factory installation, mode/trigger matching and origin-to-owner dispatch. Destination/status: the file's migration family above; unresolved until individually qualified.

```tsx
{
                mode: "default",
                trigger: {
                    source: InputEventSource.Keyboard,
                    match: "Shift-ArrowRight"
                },
                action: {
                    name: "Move the selection one character to the right.",
                    description: `
                        
                    `,
                    handler: this.moveSelectionOneCharacterRightwards.bind(this)
                }
            }
```

### blocks-document-block-binding-24

Source: [src/blocks/document-block.ts:1124](../speedy-ts/src/blocks/document-block.ts). Kind: `binding`. Context: `DocumentBlock.getInputEvents`.

Route: the owning Block's binding list, subject to actual factory installation, mode/trigger matching and origin-to-owner dispatch. Destination/status: the file's migration family above; unresolved until individually qualified.

```tsx
{
                mode: "default",
                trigger: {
                    source: InputEventSource.Keyboard,
                    match: "Shift-ArrowLeft"
                },
                action: {
                    name: "Move the selection one character to the left.",
                    description: `
                        
                    `,
                    handler: this.moveSelectionOneCharacterLeftwards
                }
            }
```

### blocks-document-block-binding-25

Source: [src/blocks/document-block.ts:1138](../speedy-ts/src/blocks/document-block.ts). Kind: `binding`. Context: `DocumentBlock.getInputEvents`.

Route: the owning Block's binding list, subject to actual factory installation, mode/trigger matching and origin-to-owner dispatch. Destination/status: the file's migration family above; unresolved until individually qualified.

```tsx
{
                mode: "default",
                trigger: {
                    source: InputEventSource.Keyboard,
                    match: "Backspace"
                },
                action: {
                    name: "Delete the character to the left",
                    description: `
                        Delete the character to the left and move the cursor to the left of the character to the right.
                        If at the start of the block (i.e., no character to the left) then issues an event
                        named "DELETE_CHARACTER_FROM_START_OF_BLOCK" (?).
                    `,
                    handler: this.handleBackspace.bind(this)
                }
            }
```

### blocks-document-block-binding-26

Source: [src/blocks/document-block.ts:1154](../speedy-ts/src/blocks/document-block.ts). Kind: `binding`. Context: `DocumentBlock.getInputEvents`.

Route: the owning Block's binding list, subject to actual factory installation, mode/trigger matching and origin-to-owner dispatch. Destination/status: the file's migration family above; unresolved until individually qualified.

```tsx
{
                mode: "default",
                trigger: {
                    source: InputEventSource.Keyboard,
                    match: "ArrowDown"
                },
                action: {
                    name: "Move the cursor down one row. If one isn't found, move to the next block.",
                    description: `
                        
                    `,
                    handler: this.moveCaretDown.bind(this)
                }
            }
```

### blocks-document-block-binding-27

Source: [src/blocks/document-block.ts:1168](../speedy-ts/src/blocks/document-block.ts). Kind: `binding`. Context: `DocumentBlock.getInputEvents`.

Route: the owning Block's binding list, subject to actual factory installation, mode/trigger matching and origin-to-owner dispatch. Destination/status: the file's migration family above; unresolved until individually qualified.

```tsx
{
                mode: "default",
                trigger: {
                    source: InputEventSource.Keyboard,
                    match: "ArrowLeft"
                },
                action: {
                    name: "Move the cursor back one cell ...",
                    description: `
                        ... Or skip to the end of the previous block.
                    `,
                    handler: this.moveCaretLeft.bind(this)
                }
            }
```

### blocks-document-block-binding-28

Source: [src/blocks/document-block.ts:1182](../speedy-ts/src/blocks/document-block.ts). Kind: `binding`. Context: `DocumentBlock.getInputEvents`.

Route: the owning Block's binding list, subject to actual factory installation, mode/trigger matching and origin-to-owner dispatch. Destination/status: the file's migration family above; unresolved until individually qualified.

```tsx
{
                mode: "default",
                trigger: {
                    source: InputEventSource.Keyboard,
                    match: ["Windows:Control-S","Mac:Meta-S"]
                },
                action: {
                    name: "Save document",
                    description: "",
                    handler: async (args: IBindingHandlerArgs) => {
                        args.e?.preventDefault();
                        const manager = _this.manager as UniverseBlock;
                        const filename = _this.metadata.filename;
                        const folder = _this.metadata.folder;
                        await manager.saveServerDocument(_this.id, filename, folder);
                    }
                }
            }
```

### blocks-document-block-binding-29

Source: [src/blocks/document-block.ts:1200](../speedy-ts/src/blocks/document-block.ts). Kind: `binding`. Context: `DocumentBlock.getInputEvents`.

Route: the owning Block's binding list, subject to actual factory installation, mode/trigger matching and origin-to-owner dispatch. Destination/status: the file's migration family above; unresolved until individually qualified.

```tsx
{
                mode: "default",
                trigger: {
                    source: InputEventSource.Keyboard,
                    match: "Control-ArrowLeft"
                },
                action: {
                    name: "Skip back to the start of the previous word.",
                    description: `
                        
                    `,
                    handler: async (args: IBindingHandlerArgs) => {
                        const caret = args.caret as Caret;
                        const block = args.block as StandoffEditorBlock;
                        const manager = block.manager;
                        const doc = manager.getParentOfType(block, BlockType.DocumentBlock) as DocumentBlock;
                        if (!caret.left) {
                            return;
                        }
                        const i = caret.left.index;
                        const text = block.getText();
                        const words = block.getWordsFromText(text);
                        const nearest = doc.findNearestWord(i, words);
                        if (!nearest) {
                            block.moveCaretStart();
                            return;
                        }
                        const start = i >= nearest.start ? nearest.start : nearest.previous?.start;
                        block.setCaret(start as number, CARET.LEFT);
                    }
                }
            }
```

### blocks-document-block-binding-30

Source: [src/blocks/document-block.ts:1232](../speedy-ts/src/blocks/document-block.ts). Kind: `binding`. Context: `DocumentBlock.getInputEvents`.

Route: the owning Block's binding list, subject to actual factory installation, mode/trigger matching and origin-to-owner dispatch. Destination/status: the file's migration family above; unresolved until individually qualified.

```tsx
{
                mode: "default",
                trigger: {
                    source: InputEventSource.Keyboard,
                    match: "ArrowRight"
                },
                action: {
                    name: "Move the cursor forward one cell ...",
                    description: `
                        ... Or skip to the end of the previous block.
                    `,
                    handler: this.moveCaretRight.bind(this)
                }
            }
```

### blocks-document-block-binding-31

Source: [src/blocks/document-block.ts:1246](../speedy-ts/src/blocks/document-block.ts). Kind: `binding`. Context: `DocumentBlock.getInputEvents`.

Route: the owning Block's binding list, subject to actual factory installation, mode/trigger matching and origin-to-owner dispatch. Destination/status: the file's migration family above; unresolved until individually qualified.

```tsx
{
                mode: "default",
                trigger: {
                    source: InputEventSource.Keyboard,
                    match: ["Mac:Control-N"]
                },
                action: {
                    name: "Block vines",
                    description: "",
                    handler: async (args) => {
                        const prop = { type: "block/vines" };
                        args.block.addBlockProperties([prop]);
                        args.block.applyBlockPropertyStyling(); 
                    }
                }
            }
```

### blocks-document-block-binding-32

Source: [src/blocks/document-block.ts:1262](../speedy-ts/src/blocks/document-block.ts). Kind: `binding`. Context: `DocumentBlock.getInputEvents`.

Route: the owning Block's binding list, subject to actual factory installation, mode/trigger matching and origin-to-owner dispatch. Destination/status: the file's migration family above; unresolved until individually qualified.

```tsx
{
                mode: "default",
                trigger: {
                    source: InputEventSource.Keyboard,
                    match: ["Mac:Meta-V","Windows:Control-V"]
                },
                action: {
                    name: "Paste",
                    description: "Pastes plain text",
                    handler: async (args) => {
                        args.allowPassthrough && args.allowPassthrough();
                    }
                }
            }
```

### blocks-document-block-binding-33

Source: [src/blocks/document-block.ts:1276](../speedy-ts/src/blocks/document-block.ts). Kind: `binding`. Context: `DocumentBlock.getInputEvents`.

Route: the owning Block's binding list, subject to actual factory installation, mode/trigger matching and origin-to-owner dispatch. Destination/status: the file's migration family above; unresolved until individually qualified.

```tsx
{
                mode: "default",
                trigger: {
                    source: InputEventSource.Custom,
                    match: "copy"
                },
                action: {
                    name: "Copy",
                    description: "Copies standoff text",
                    handler: this.handleCopy.bind(this)
                }
            }
```

### blocks-document-block-binding-34

Source: [src/blocks/document-block.ts:1288](../speedy-ts/src/blocks/document-block.ts). Kind: `binding`. Context: `DocumentBlock.getInputEvents`.

Route: the owning Block's binding list, subject to actual factory installation, mode/trigger matching and origin-to-owner dispatch. Destination/status: the file's migration family above; unresolved until individually qualified.

```tsx
{
                mode: "default",
                trigger: {
                    source: InputEventSource.Keyboard,
                    match: "Control-ArrowRight"
                },
                action: {
                    name: "Skip back to the start of the previous word.",
                    description: `
                        
                    `,
                    handler: async (args: IBindingHandlerArgs) => {
                        const caret = args.caret as Caret;
                        const block = args.block as StandoffEditorBlock;
                        const doc = args.block.manager.getParentOfType(block, BlockType.DocumentBlock) as DocumentBlock;
                        const manager = block.manager;
                        if (caret.right.isEOL) {
                            return;
                        }
                        const i = caret.right.index;
                        const last = block.getLastCell();
                        const text = block.getText();
                        const words = block.getWordsFromText(text);
                        const nearest = doc.findNearestWord(i, words);
                        if (!nearest) {
                            block.moveCaretStart();
                            return;
                        }
                        const start = !nearest.next ? last.index : nearest.next.start;
                        block.setCaret(start as number, CARET.LEFT);
                    }
                }
            }
```

### blocks-document-block-binding-35

Source: [src/blocks/document-block.ts:1321](../speedy-ts/src/blocks/document-block.ts). Kind: `binding`. Context: `DocumentBlock.getInputEvents`.

Route: the owning Block's binding list, subject to actual factory installation, mode/trigger matching and origin-to-owner dispatch. Destination/status: the file's migration family above; unresolved until individually qualified.

```tsx
{
                mode: "default",
                trigger: {
                    source: InputEventSource.Keyboard,
                    match: "Home"
                },
                action: {
                    name: "Move the caret to the left of the first character.",
                    description: `
                        
                    `,
                    handler: this.moveCaretToStartOfTextBlock.bind(this)
                }
            }
```

### blocks-document-block-binding-36

Source: [src/blocks/document-block.ts:1335](../speedy-ts/src/blocks/document-block.ts). Kind: `binding`. Context: `DocumentBlock.getInputEvents`.

Route: the owning Block's binding list, subject to actual factory installation, mode/trigger matching and origin-to-owner dispatch. Destination/status: the file's migration family above; unresolved until individually qualified.

```tsx
{
                mode: "default",
                trigger: {
                    source: InputEventSource.Keyboard,
                    match: "End"
                },
                action: {
                    name: "Move the caret to the right of the last character.",
                    description: `
                        
                    `,
                    handler: this.moveCaretToEndOfTextBlock
                }
            }
```

### blocks-document-block-binding-37

Source: [src/blocks/document-block.ts:1349](../speedy-ts/src/blocks/document-block.ts). Kind: `binding`. Context: `DocumentBlock.getInputEvents`.

Route: the owning Block's binding list, subject to actual factory installation, mode/trigger matching and origin-to-owner dispatch. Destination/status: the file's migration family above; unresolved until individually qualified.

```tsx
{
                mode: "default",
                trigger: {
                    source: InputEventSource.Custom,
                    match: "onTextChanged"
                },
                action: {
                    name: "",
                    description: "",
                    handler: async (args: IBindingHandlerArgs) => {
                        await _this.textProcessor.process(args);
                    }
                }
            }
```

### blocks-document-block-binding-38

Source: [src/blocks/document-block.ts:1363](../speedy-ts/src/blocks/document-block.ts). Kind: `binding`. Context: `DocumentBlock.getInputEvents`.

Route: the owning Block's binding list, subject to actual factory installation, mode/trigger matching and origin-to-owner dispatch. Destination/status: the file's migration family above; unresolved until individually qualified.

```tsx
{
                mode: "default",
                trigger: {
                    source: InputEventSource.Keyboard,
                    match: ["Mac:Meta-C","Windows:Control-C"]
                },
                action: {
                    name: "Copy passthrough",
                    description: "Pastes plain text",
                    handler: async (args) => {
                        args.allowPassthrough && args.allowPassthrough();
                    }
                }
            }
```

### blocks-document-block-binding-39

Source: [src/blocks/document-block.ts:1377](../speedy-ts/src/blocks/document-block.ts). Kind: `binding`. Context: `DocumentBlock.getInputEvents`.

Route: the owning Block's binding list, subject to actual factory installation, mode/trigger matching and origin-to-owner dispatch. Destination/status: the file's migration family above; unresolved until individually qualified.

```tsx
{
                mode: "default",
                trigger: {
                    source: InputEventSource.Keyboard,
                    match: "Control-I"
                },
                action: {
                    name: "Italicise",
                    description: "Italicises text in the selection. If no text is selected, switches to/from italics text mode.",
                    handler: this.applyItalicsToText.bind(this)
                }
            }
```

### blocks-document-block-binding-40

Source: [src/blocks/document-block.ts:1389](../speedy-ts/src/blocks/document-block.ts). Kind: `binding`. Context: `DocumentBlock.getInputEvents`.

Route: the owning Block's binding list, subject to actual factory installation, mode/trigger matching and origin-to-owner dispatch. Destination/status: the file's migration family above; unresolved until individually qualified.

```tsx
{
                mode: "default",
                trigger: {
                    source: InputEventSource.Keyboard,
                    match: "Control-B"
                },
                action: {
                    name: "Bold",
                    description: "Bolds text",
                    handler: this.applyBoldToText.bind(this)
                }
            }
```

### blocks-document-block-binding-41

Source: [src/blocks/document-block.ts:1401](../speedy-ts/src/blocks/document-block.ts). Kind: `binding`. Context: `DocumentBlock.getInputEvents`.

Route: the owning Block's binding list, subject to actual factory installation, mode/trigger matching and origin-to-owner dispatch. Destination/status: the file's migration family above; unresolved until individually qualified.

```tsx
{
                mode: "default",
                trigger: {
                    source: InputEventSource.Keyboard,
                    match: ["Control-T", "Windows:Alt-T"]
                },
                action: {
                    name: "To tab/add tab",
                    description: "Either wraps the text in a new tab, or creates a new tab",
                    handler: this.handleCreateNewTab.bind(this)
                }
            }
```

### blocks-document-block-binding-42

Source: [src/blocks/document-block.ts:1413](../speedy-ts/src/blocks/document-block.ts). Kind: `binding`. Context: `DocumentBlock.getInputEvents`.

Route: the owning Block's binding list, subject to actual factory installation, mode/trigger matching and origin-to-owner dispatch. Destination/status: the file's migration family above; unresolved until individually qualified.

```tsx
{
                mode: "default",
                trigger: {
                    source: InputEventSource.Keyboard,
                    match: "Control-L"
                },
                action: {
                    name: "Blue and White",
                    description: `
                        Sets the background of the block to blue, and font to white.
                    `,
                    handler: async (args: IBindingHandlerArgs) => {
                        const block = args.block as StandoffEditorBlock;
                        block.createBlockProperty("block/blue-and-white");     
                    }
                }
            }
```

### blocks-document-block-binding-43

Source: [src/blocks/document-block.ts:1430](../speedy-ts/src/blocks/document-block.ts). Kind: `binding`. Context: `DocumentBlock.getInputEvents`.

Route: the owning Block's binding list, subject to actual factory installation, mode/trigger matching and origin-to-owner dispatch. Destination/status: the file's migration family above; unresolved until individually qualified.

```tsx
{
                mode: "default",
                trigger: {
                    source: InputEventSource.Keyboard,
                    match: "Control-M"
                },
                action: {
                    name: "Mirror",
                    description: "Mirrors the selected text",
                    handler: this.applyMirrorToText.bind(this)
                }
            }
```

### blocks-document-block-binding-44

Source: [src/blocks/document-block.ts:1442](../speedy-ts/src/blocks/document-block.ts). Kind: `binding`. Context: `DocumentBlock.getInputEvents`.

Route: the owning Block's binding list, subject to actual factory installation, mode/trigger matching and origin-to-owner dispatch. Destination/status: the file's migration family above; unresolved until individually qualified.

```tsx
{
                mode: "default",
                trigger: {
                    source: InputEventSource.Keyboard,
                    match: ["Mac:Meta-/","Windows:Control-/"]
                },
                action: {
                    name: "Monitor panel",
                    description: "",
                    handler: this.handleAnnotationMonitorClicked.bind(this)
                }
            }
```

### blocks-document-block-binding-45

Source: [src/blocks/document-block.ts:1454](../speedy-ts/src/blocks/document-block.ts). Kind: `binding`. Context: `DocumentBlock.getInputEvents`.

Route: the owning Block's binding list, subject to actual factory installation, mode/trigger matching and origin-to-owner dispatch. Destination/status: the file's migration family above; unresolved until individually qualified.

```tsx
{
                mode: "default",
                trigger: {
                    source: InputEventSource.Keyboard,
                    match: "Control-Enter"
                },
                action: {
                    name: "ENTER break",
                    description: "Breaks out of current container",
                    handler: async (args: IBindingHandlerArgs) => {
                        const block = args.block as StandoffEditorBlock;
                        const manager = block.manager as UniverseBlock;
                        const structure = manager.getParentOfType(block, BlockType.TabRowBlock)
                            || manager.getParentOfType(block, BlockType.GridBlock)
                            || manager.getParentOfType(block, BlockType.TableBlock)
                            || manager.getParentOfType(block, BlockType.IndentedListBlock)
                        ;
                        if (!structure) return;
                        const newBlock = manager.createStandoffEditorBlockAsync();
                        newBlock.addEOL();
                        this.addBlockAfter(newBlock, structure);
                        setTimeout(() => {
                            manager.setBlockFocus(newBlock);
                            newBlock.setCaret(0, CARET.LEFT);
                        }, 1);
                    }
                }
            }
```

### blocks-document-block-binding-46

Source: [src/blocks/document-block.ts:1482](../speedy-ts/src/blocks/document-block.ts). Kind: `binding`. Context: `DocumentBlock.getInputEvents`.

Route: the owning Block's binding list, subject to actual factory installation, mode/trigger matching and origin-to-owner dispatch. Destination/status: the file's migration family above; unresolved until individually qualified.

```tsx
{
                mode: "default",
                trigger: {
                    source: InputEventSource.Keyboard,
                    match: ["Control-R"]
                },
                action: {
                    name: "Right-align",
                    description: "",
                    handler: async (args) => {
                        const block = args.block as StandoffEditorBlock;
                        const props = block
                            .blockProperties
                            .filter((x) => x.type.indexOf("block/alignment/") >= 0);
                        if (props.length) props.forEach(p => p.block?.removeBlockProperty(p));
                        block.addBlockProperties([ { type: "block/alignment", value: "right" } ]);
                        block.applyBlockPropertyStyling();
                        block.updateView();
                    }
                }
            }
```

### blocks-document-block-binding-47

Source: [src/blocks/document-block.ts:1503](../speedy-ts/src/blocks/document-block.ts). Kind: `binding`. Context: `DocumentBlock.getInputEvents`.

Route: the owning Block's binding list, subject to actual factory installation, mode/trigger matching and origin-to-owner dispatch. Destination/status: the file's migration family above; unresolved until individually qualified.

```tsx
{
                mode: "default",
                trigger: {
                    source: InputEventSource.Keyboard,
                    match: ["Meta-Q", "Control-Q"]
                },
                action: {
                    name: "Match entities to the graph",
                    description: "Links to an entity in the graph database.",
                    handler: async (args) => {
                        const block = args.block as StandoffEditorBlock;
                        const manager = block.manager as UniverseBlock;
                        await manager.loadEntitiesList(args);
                    }
                }
            }
```

### blocks-document-block-binding-48

Source: [src/blocks/document-block.ts:1519](../speedy-ts/src/blocks/document-block.ts). Kind: `binding`. Context: `DocumentBlock.getInputEvents`.

Route: the owning Block's binding list, subject to actual factory installation, mode/trigger matching and origin-to-owner dispatch. Destination/status: the file's migration family above; unresolved until individually qualified.

```tsx
{
                mode: "default",
                trigger: {
                    source: InputEventSource.Keyboard,
                    match: ["Meta-E", "Control-Shift-E"]
                },
                action: {
                    name: "Entity reference",
                    description: "Links to an entity in the graph database.",
                    handler: this.applyEntityReferenceToText.bind(this)
                }
            }
```

### blocks-document-block-binding-49

Source: [src/blocks/document-block.ts:1531](../speedy-ts/src/blocks/document-block.ts). Kind: `binding`. Context: `DocumentBlock.getInputEvents`.

Route: the owning Block's binding list, subject to actual factory installation, mode/trigger matching and origin-to-owner dispatch. Destination/status: the file's migration family above; unresolved until individually qualified.

```tsx
{
                mode: "default",
                trigger: {
                    source: InputEventSource.Keyboard,
                    match: "Control-F"
                },
                action: {
                    name: "Find",
                    description: "Highlights all text matches.",
                    handler: this.handleFind.bind(this)
                }
            }
```

### blocks-document-block-binding-50

Source: [src/blocks/document-block.ts:1555](../speedy-ts/src/blocks/document-block.ts). Kind: `binding`. Context: `DocumentBlock.getInputEvents`.

Route: the owning Block's binding list, subject to actual factory installation, mode/trigger matching and origin-to-owner dispatch. Destination/status: the file's migration family above; unresolved until individually qualified.

```tsx
{
                mode: "default",
                trigger: {
                    source: InputEventSource.Keyboard,
                    match: "Control-K"
                },
                action: {
                    name: "Clock",
                    description: "Turns the text range into a ticking clock",
                    handler: this.applyClockToText.bind(this)
                }
            }
```

### blocks-document-block-callback-06

Source: [src/blocks/document-block.ts:1612](../speedy-ts/src/blocks/document-block.ts). Kind: `callback`. Context: `DocumentBlock.applyEntityReferenceToText.searchBlock`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClose: async (search: SearchEntitiesBlock) => {
                let block = search.source;
                block.removeStandoffPropertiesByType("codex/search/highlight");
                block.manager?.setBlockFocus(block);
                block.setCaret(block.lastCaret.index, block.lastCaret.offset);
            }
```

### blocks-document-block-callback-07

Source: [src/blocks/document-block.ts:1618](../speedy-ts/src/blocks/document-block.ts). Kind: `callback`. Context: `DocumentBlock.applyEntityReferenceToText.searchBlock`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onBulkSubmit: async (item: any, matches: FindMatch[]) => {
                if (matches.length == 0) {
                    matches.push({ start: selection.start.index, block, end: selection.end.index, match: "" });
                }
                const rows = _.groupBy(matches, m => m.block.id);
                _.each(rows, (items) => {
                    let block = items[0].block;
                    let props = items.map(m => ({
                        type: "codex/entity-reference",
                        value: item.Value,
                        start: m.start,
                        end: m.end,
                    }));
                    block.addStandoffPropertiesDto(props);
                    block.removeStandoffPropertiesByType("codex/search/highlight");
                    block.applyStandoffPropertyStyling();
                });
                // matches.forEach(m => {
                //     let prop = {
                //         type: "codex/entity-reference",
                //         value: item.Value,
                //         start: m.start,
                //         end: m.end,
                //     };
                //     m.block.addStandoffPropertiesDto([prop]);
                //     m.block.removeStandoffPropertiesByType("codex/search/highlight");
                //     m.block.applyStandoffPropertyStyling();
                // })
            }
```

### blocks-document-block-callback-08

Source: [src/blocks/document-block.ts:1807](../speedy-ts/src/blocks/document-block.ts). Kind: `callback`. Context: `DocumentBlock.handleAnnotationMonitorClicked.component`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onDelete: (p) => {
                p.destroy();
            }
```

### blocks-document-block-callback-09

Source: [src/blocks/document-block.ts:1810](../speedy-ts/src/blocks/document-block.ts). Kind: `callback`. Context: `DocumentBlock.handleAnnotationMonitorClicked.component`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClose: () => {
                block.cache.monitor?.remove();
                manager.deregisterBlock(monitor.id);
                block.setCaret(anchor.index, CARET.LEFT);
                manager.setBlockFocus(block);
            }
```

### blocks-document-block-callback-10

Source: [src/blocks/document-block.ts:2189](../speedy-ts/src/blocks/document-block.ts). Kind: `callback`. Context: `DocumentBlock.loadAnnotationMenu.panel`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClose: () => {
                    manager.deregisterBlock(panel.id);
                    block.removeStandoffPropertiesByType("codex/search/highlight");
                    block.manager?.setBlockFocus(block);
                    block.setCaret(block.lastCaret.index, block.lastCaret.offset);
                }
```

### Named implementation index

This index intentionally includes helper methods as well as handlers. Resolve named calls in the entries above here; methods with no caller/binding are **not** automatically live commands. Shared support methods may be implemented in another indexed file (notably AbstractBlock, DocumentBlock, UniverseBlock, StandoffProperty and SVG helpers).

| Context | Callable | Source |
| --- | --- | --- |
| DocumentBlock | `applyBlockStyle` | [src/blocks/document-block.ts:56](../speedy-ts/src/blocks/document-block.ts) |
| DocumentBlock | `applyStandoffProperty` | [src/blocks/document-block.ts:65](../speedy-ts/src/blocks/document-block.ts) |
| DocumentBlock | `getRightMarginBlockBuilder` | [src/blocks/document-block.ts:73](../speedy-ts/src/blocks/document-block.ts) |
| DocumentBlock | `getLeftMarginBlockBuilder` | [src/blocks/document-block.ts:91](../speedy-ts/src/blocks/document-block.ts) |
| DocumentBlock | `getBlockBuilder` | [src/blocks/document-block.ts:109](../speedy-ts/src/blocks/document-block.ts) |
| DocumentBlock | `getHistory` | [src/blocks/document-block.ts:131](../speedy-ts/src/blocks/document-block.ts) |
| DocumentBlock | `extractIntoNewDocument` | [src/blocks/document-block.ts:135](../speedy-ts/src/blocks/document-block.ts) |
| DocumentBlock | `getBlockSchemas` | [src/blocks/document-block.ts:152](../speedy-ts/src/blocks/document-block.ts) |
| DocumentBlock | `setupSubscriptions` | [src/blocks/document-block.ts:255](../speedy-ts/src/blocks/document-block.ts) |
| DocumentBlock | `deleteBlock` | [src/blocks/document-block.ts:258](../speedy-ts/src/blocks/document-block.ts) |
| DocumentBlock | `addBlockBefore` | [src/blocks/document-block.ts:267](../speedy-ts/src/blocks/document-block.ts) |
| DocumentBlock | `addBlockAfter` | [src/blocks/document-block.ts:280](../speedy-ts/src/blocks/document-block.ts) |
| DocumentBlock | `createTable` | [src/blocks/document-block.ts:293](../speedy-ts/src/blocks/document-block.ts) |
| DocumentBlock | `createGrid` | [src/blocks/document-block.ts:319](../speedy-ts/src/blocks/document-block.ts) |
| DocumentBlock | `addImageBlock` | [src/blocks/document-block.ts:345](../speedy-ts/src/blocks/document-block.ts) |
| DocumentBlock | `addImageLeft` | [src/blocks/document-block.ts:357](../speedy-ts/src/blocks/document-block.ts) |
| DocumentBlock | `addImageRight` | [src/blocks/document-block.ts:409](../speedy-ts/src/blocks/document-block.ts) |
| DocumentBlock | `mergeBlocks` | [src/blocks/document-block.ts:461](../speedy-ts/src/blocks/document-block.ts) |
| DocumentBlock | `splitTextBlock` | [src/blocks/document-block.ts:480](../speedy-ts/src/blocks/document-block.ts) |
| DocumentBlock | `addVideoBlock` | [src/blocks/document-block.ts:521](../speedy-ts/src/blocks/document-block.ts) |
| DocumentBlock | `addCanvasBlock` | [src/blocks/document-block.ts:533](../speedy-ts/src/blocks/document-block.ts) |
| DocumentBlock | `addIFrameBlock` | [src/blocks/document-block.ts:542](../speedy-ts/src/blocks/document-block.ts) |
| DocumentBlock | `addPreviousBlock` | [src/blocks/document-block.ts:553](../speedy-ts/src/blocks/document-block.ts) |
| DocumentBlock | `addBlockTo` | [src/blocks/document-block.ts:574](../speedy-ts/src/blocks/document-block.ts) |
| DocumentBlock | `insertBlockAt` | [src/blocks/document-block.ts:583](../speedy-ts/src/blocks/document-block.ts) |
| DocumentBlock | `makeCheckbox` | [src/blocks/document-block.ts:597](../speedy-ts/src/blocks/document-block.ts) |
| DocumentBlock | `moveBlockUp` | [src/blocks/document-block.ts:617](../speedy-ts/src/blocks/document-block.ts) |
| DocumentBlock | `moveBlockDown` | [src/blocks/document-block.ts:635](../speedy-ts/src/blocks/document-block.ts) |
| DocumentBlock | `minimalTimeElapsedSinceLastChange` | [src/blocks/document-block.ts:654](../speedy-ts/src/blocks/document-block.ts) |
| DocumentBlock | `updateLastChange` | [src/blocks/document-block.ts:667](../speedy-ts/src/blocks/document-block.ts) |
| DocumentBlock | `addToHistory` | [src/blocks/document-block.ts:672](../speedy-ts/src/blocks/document-block.ts) |
| DocumentBlock | `clearHistory` | [src/blocks/document-block.ts:678](../speedy-ts/src/blocks/document-block.ts) |
| DocumentBlock | `getInputEvents` | [src/blocks/document-block.ts:685](../speedy-ts/src/blocks/document-block.ts) |
| DocumentBlock | `handleFind` | [src/blocks/document-block.ts:1569](../speedy-ts/src/blocks/document-block.ts) |
| DocumentBlock | `applyEntityReferenceToText` | [src/blocks/document-block.ts:1594](../speedy-ts/src/blocks/document-block.ts) |
| DocumentBlock | `handleCreateNewTab` | [src/blocks/document-block.ts:1665](../speedy-ts/src/blocks/document-block.ts) |
| DocumentBlock | `deindentBlock` | [src/blocks/document-block.ts:1676](../speedy-ts/src/blocks/document-block.ts) |
| DocumentBlock | `indentBlock` | [src/blocks/document-block.ts:1703](../speedy-ts/src/blocks/document-block.ts) |
| DocumentBlock | `applyBoldToText` | [src/blocks/document-block.ts:1732](../speedy-ts/src/blocks/document-block.ts) |
| DocumentBlock | `applyBlurToText` | [src/blocks/document-block.ts:1735](../speedy-ts/src/blocks/document-block.ts) |
| DocumentBlock | `applyItalicsToText` | [src/blocks/document-block.ts:1738](../speedy-ts/src/blocks/document-block.ts) |
| DocumentBlock | `applyMirrorToText` | [src/blocks/document-block.ts:1747](../speedy-ts/src/blocks/document-block.ts) |
| DocumentBlock | `applyClockToText` | [src/blocks/document-block.ts:1756](../speedy-ts/src/blocks/document-block.ts) |
| DocumentBlock | `getAllStandoffPropertiesByType` | [src/blocks/document-block.ts:1765](../speedy-ts/src/blocks/document-block.ts) |
| DocumentBlock | `getEntities` | [src/blocks/document-block.ts:1777](../speedy-ts/src/blocks/document-block.ts) |
| DocumentBlock | `handleAnnotationMonitorClicked` | [src/blocks/document-block.ts:1791](../speedy-ts/src/blocks/document-block.ts) |
| DocumentBlock | `moveCaretToStartOfTextBlock` | [src/blocks/document-block.ts:1835](../speedy-ts/src/blocks/document-block.ts) |
| DocumentBlock | `moveCaretToEndOfTextBlock` | [src/blocks/document-block.ts:1839](../speedy-ts/src/blocks/document-block.ts) |
| DocumentBlock | `handleCopy` | [src/blocks/document-block.ts:1843](../speedy-ts/src/blocks/document-block.ts) |
| DocumentBlock | `handleBackspace` | [src/blocks/document-block.ts:1868](../speedy-ts/src/blocks/document-block.ts) |
| DocumentBlock | `moveSelectionOneCharacterLeftwards` | [src/blocks/document-block.ts:1922](../speedy-ts/src/blocks/document-block.ts) |
| DocumentBlock | `moveSelectionOneCharacterRightwards` | [src/blocks/document-block.ts:1937](../speedy-ts/src/blocks/document-block.ts) |
| DocumentBlock | `moveCaretUp` | [src/blocks/document-block.ts:1957](../speedy-ts/src/blocks/document-block.ts) |
| DocumentBlock | `moveCaretDown` | [src/blocks/document-block.ts:1960](../speedy-ts/src/blocks/document-block.ts) |
| DocumentBlock | `moveCaretRight` | [src/blocks/document-block.ts:1963](../speedy-ts/src/blocks/document-block.ts) |
| DocumentBlock | `moveCaretLeft` | [src/blocks/document-block.ts:1966](../speedy-ts/src/blocks/document-block.ts) |
| DocumentBlock | `handleMoveBlockUp` | [src/blocks/document-block.ts:1969](../speedy-ts/src/blocks/document-block.ts) |
| DocumentBlock | `handleMoveBlockDown` | [src/blocks/document-block.ts:1979](../speedy-ts/src/blocks/document-block.ts) |
| DocumentBlock | `handleCreateRightMargin` | [src/blocks/document-block.ts:1989](../speedy-ts/src/blocks/document-block.ts) |
| DocumentBlock | `handleCreateLeftMargin` | [src/blocks/document-block.ts:2031](../speedy-ts/src/blocks/document-block.ts) |
| DocumentBlock | `redoHistory` | [src/blocks/document-block.ts:2067](../speedy-ts/src/blocks/document-block.ts) |
| DocumentBlock | `clearDocument` | [src/blocks/document-block.ts:2078](../speedy-ts/src/blocks/document-block.ts) |
| DocumentBlock | `reloadDocument` | [src/blocks/document-block.ts:2081](../speedy-ts/src/blocks/document-block.ts) |
| DocumentBlock | `findNearestWord` | [src/blocks/document-block.ts:2094](../speedy-ts/src/blocks/document-block.ts) |
| DocumentBlock | `undoHistory` | [src/blocks/document-block.ts:2103](../speedy-ts/src/blocks/document-block.ts) |
| DocumentBlock | `pastePlainTextItemAsync` | [src/blocks/document-block.ts:2110](../speedy-ts/src/blocks/document-block.ts) |
| DocumentBlock | `embedDocument` | [src/blocks/document-block.ts:2144](../speedy-ts/src/blocks/document-block.ts) |
| DocumentBlock | `addCodeMirrorBlock` | [src/blocks/document-block.ts:2159](../speedy-ts/src/blocks/document-block.ts) |
| DocumentBlock | `loadAnnotationMenu` | [src/blocks/document-block.ts:2169](../speedy-ts/src/blocks/document-block.ts) |
| DocumentBlock | `handlePaste` | [src/blocks/document-block.ts:2212](../speedy-ts/src/blocks/document-block.ts) |
| DocumentBlock | `removeBlockAt` | [src/blocks/document-block.ts:2266](../speedy-ts/src/blocks/document-block.ts) |
| DocumentBlock | `handleDelete` | [src/blocks/document-block.ts:2275](../speedy-ts/src/blocks/document-block.ts) |
| DocumentBlock | `handleEnterKey` | [src/blocks/document-block.ts:2305](../speedy-ts/src/blocks/document-block.ts) |
| DocumentBlock | `convertBlockToTab` | [src/blocks/document-block.ts:2354](../speedy-ts/src/blocks/document-block.ts) |
| DocumentBlock | `convertToDocumentTab` | [src/blocks/document-block.ts:2406](../speedy-ts/src/blocks/document-block.ts) |
| DocumentBlock | `setFocus` | [src/blocks/document-block.ts:2454](../speedy-ts/src/blocks/document-block.ts) |
| DocumentBlock | `generateIndex` | [src/blocks/document-block.ts:2470](../speedy-ts/src/blocks/document-block.ts) |
| DocumentBlock.generateIndex | `traverse` | [src/blocks/document-block.ts:2472](../speedy-ts/src/blocks/document-block.ts) |
| DocumentBlock | `bind` | [src/blocks/document-block.ts:2484](../speedy-ts/src/blocks/document-block.ts) |
| DocumentBlock | `serialize` | [src/blocks/document-block.ts:2492](../speedy-ts/src/blocks/document-block.ts) |
| DocumentBlock | `deserialize` | [src/blocks/document-block.ts:2510](../speedy-ts/src/blocks/document-block.ts) |

### Commented/disabled evidence

These are source comments, not installed listeners. They also include relevant intent notes and TODO context. Use the addendum's reachability findings before treating an old commented design as a parity requirement.

- [src/blocks/document-block.ts:28](../speedy-ts/src/blocks/document-block.ts) — // The block the Property belongs to
- [src/blocks/document-block.ts:563](../speedy-ts/src/blocks/document-block.ts) — //const parent = this.getParent(sibling) as IBlock;
- [src/blocks/document-block.ts:825](../speedy-ts/src/blocks/document-block.ts) — //         source: InputEventSource.Custom,
- [src/blocks/document-block.ts:826](../speedy-ts/src/blocks/document-block.ts) — //         match: "contextmenu"
- [src/blocks/document-block.ts:829](../speedy-ts/src/blocks/document-block.ts) — //         name: "Context Menu.",
- [src/blocks/document-block.ts:831](../speedy-ts/src/blocks/document-block.ts) — //         handler: async (args: IBindingHandlerArgs) =&gt; {
- [src/blocks/document-block.ts:832](../speedy-ts/src/blocks/document-block.ts) — //             const block = args.block;
- [src/blocks/document-block.ts:833](../speedy-ts/src/blocks/document-block.ts) — //             const manager = block.manager as UniverseBlock;
- [src/blocks/document-block.ts:1546](../speedy-ts/src/blocks/document-block.ts) — //         source: InputEventSource.Keyboard,
- [src/blocks/document-block.ts:1547](../speedy-ts/src/blocks/document-block.ts) — //         match: ["Mac:Option-T","Windows:Alt-T"]
- [src/blocks/document-block.ts:1552](../speedy-ts/src/blocks/document-block.ts) — //         handler: this.handleCreateNewTab.bind(this)
- [src/blocks/document-block.ts:1796](../speedy-ts/src/blocks/document-block.ts) — // block.setMarker(anchor, this.container);
- [src/blocks/document-block.ts:1994](../speedy-ts/src/blocks/document-block.ts) — /**          * If there is no LeftMarginBlock already then create one and add          * a StandoffEditorBlock to it.          */
- [src/blocks/document-block.ts:2036](../speedy-ts/src/blocks/document-block.ts) — /**          * If there is no LeftMarginBlock already then create one and add          * a StandoffEditorBlock to it.          */
- [src/blocks/document-block.ts:2221](../speedy-ts/src/blocks/document-block.ts) — //const html = clipboardData.getData("text/html");
- [src/blocks/document-block.ts:2233](../speedy-ts/src/blocks/document-block.ts) — //             height: dimensions.height,
- [src/blocks/document-block.ts:2234](../speedy-ts/src/blocks/document-block.ts) — //             width: dimensions.width
- [src/blocks/document-block.ts:2256](../speedy-ts/src/blocks/document-block.ts) — //     const converted = this.convertHtmlToStandoff(html);
- [src/blocks/document-block.ts:2257](../speedy-ts/src/blocks/document-block.ts) — //     const item = {
- [src/blocks/document-block.ts:2259](../speedy-ts/src/blocks/document-block.ts) — //             text: converted.text,
- [src/blocks/document-block.ts:2260](../speedy-ts/src/blocks/document-block.ts) — //             standoffProperties: converted.standoffProperties

## src/blocks/document-tabs-block.ts

Source: [src/blocks/document-tabs-block.ts:1](../speedy-ts/src/blocks/document-tabs-block.ts). SHA-256: `ae0faeafef73625f4be514b402e110ed59b016545e59ee560a6c1d5394c5b793`.

Migration family/status: Document tab/page commands and activation; generic tab selection is partial.

Classes: `DocumentTabRowBlock` (extends AbstractBlock); `DocumentTabBlock` (extends AbstractBlock).

Binding installation/override sites (first source line; inspect surrounding constructor/factory):

- [src/blocks/document-tabs-block.ts:19](../speedy-ts/src/blocks/document-tabs-block.ts) — `DocumentTabRowBlock`: `this.inputEvents = this.getInputEvents()`
- [src/blocks/document-tabs-block.ts:194](../speedy-ts/src/blocks/document-tabs-block.ts) — `DocumentTabBlock`: `this.inputEvents = this.getInputEvents()`

### blocks-document-tabs-block-binding-01

Source: [src/blocks/document-tabs-block.ts:23](../speedy-ts/src/blocks/document-tabs-block.ts). Kind: `binding`. Context: `DocumentTabRowBlock.getInputEvents.events`.

Route: the owning Block's binding list, subject to actual factory installation, mode/trigger matching and origin-to-owner dispatch. Destination/status: the file's migration family above; unresolved until individually qualified.

```tsx
{
                mode: "default",
                trigger: {
                    source: InputEventSource.Mouse,
                    match: "click"
                },
                action: {
                    name: "Set focus to the current block.",
                    description: "",
                    handler: async (args: IBindingHandlerArgs) => {
                        const block = args.block;
                        const manager = block.manager as UniverseBlock;
                        manager.setBlockFocus(block);
                    }
                }
            }
```

### blocks-document-tabs-block-listener-01

Source: [src/blocks/document-tabs-block.ts:87](../speedy-ts/src/blocks/document-tabs-block.ts). Kind: `listener`. Context: `DocumentTabRowBlock.attachEventHandlers`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
this.container.addEventListener("click", this.handleClick.bind(this))
```

### blocks-document-tabs-block-listener-02

Source: [src/blocks/document-tabs-block.ts:114](../speedy-ts/src/blocks/document-tabs-block.ts). Kind: `listener`. Context: `DocumentTabRowBlock.renderLabels`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
label.addEventListener("click", (e) => {
                self.setTabActive(tab);
                self.handleClick(e, tab);
            })
```

### blocks-document-tabs-block-helper-01

Source: [src/blocks/document-tabs-block.ts:125](../speedy-ts/src/blocks/document-tabs-block.ts). Kind: `helper`. Context: `DocumentTabRowBlock.renderLabels`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
click: async (e) => {
                    await self.addTab({
                        previousTabId: self.blocks[self.blocks.length - 1].id,
                        name: "Page " + (self.blocks.length + 1)
                    });
                }
```

### blocks-document-tabs-block-binding-02

Source: [src/blocks/document-tabs-block.ts:239](../speedy-ts/src/blocks/document-tabs-block.ts). Kind: `binding`. Context: `DocumentTabBlock.getInputEvents.events`.

Route: the owning Block's binding list, subject to actual factory installation, mode/trigger matching and origin-to-owner dispatch. Destination/status: the file's migration family above; unresolved until individually qualified.

```tsx
{
                mode: "default",
                trigger: {
                    source: InputEventSource.Mouse,
                    match: "click"
                },
                action: {
                    name: "Set focus to the current block.",
                    description: "",
                    handler: async (args: IBindingHandlerArgs) => {
                        const block = args.block;
                        const manager = block.manager as UniverseBlock;
                        manager.setBlockFocus(block);
                    }
                }
            }
```

### blocks-document-tabs-block-listener-03

Source: [src/blocks/document-tabs-block.ts:274](../speedy-ts/src/blocks/document-tabs-block.ts). Kind: `listener`. Context: `DocumentTabBlock.attachEventHandlers`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
this.container.addEventListener("click", this.handleClick.bind(this))
```

### Named implementation index

This index intentionally includes helper methods as well as handlers. Resolve named calls in the entries above here; methods with no caller/binding are **not** automatically live commands. Shared support methods may be implemented in another indexed file (notably AbstractBlock, DocumentBlock, UniverseBlock, StandoffProperty and SVG helpers).

| Context | Callable | Source |
| --- | --- | --- |
| DocumentTabRowBlock | `getInputEvents` | [src/blocks/document-tabs-block.ts:21](../speedy-ts/src/blocks/document-tabs-block.ts) |
| DocumentTabRowBlock | `setFocus` | [src/blocks/document-tabs-block.ts:42](../speedy-ts/src/blocks/document-tabs-block.ts) |
| DocumentTabRowBlock | `deleteTab` | [src/blocks/document-tabs-block.ts:49](../speedy-ts/src/blocks/document-tabs-block.ts) |
| DocumentTabRowBlock | `destructure` | [src/blocks/document-tabs-block.ts:57](../speedy-ts/src/blocks/document-tabs-block.ts) |
| DocumentTabRowBlock | `getBlockBuilder` | [src/blocks/document-tabs-block.ts:65](../speedy-ts/src/blocks/document-tabs-block.ts) |
| DocumentTabRowBlock | `attachEventHandlers` | [src/blocks/document-tabs-block.ts:86](../speedy-ts/src/blocks/document-tabs-block.ts) |
| DocumentTabRowBlock | `handleClick` | [src/blocks/document-tabs-block.ts:89](../speedy-ts/src/blocks/document-tabs-block.ts) |
| DocumentTabRowBlock | `setTabActive` | [src/blocks/document-tabs-block.ts:94](../speedy-ts/src/blocks/document-tabs-block.ts) |
| DocumentTabRowBlock | `renderLabels` | [src/blocks/document-tabs-block.ts:101](../speedy-ts/src/blocks/document-tabs-block.ts) |
| DocumentTabRowBlock | `getTab` | [src/blocks/document-tabs-block.ts:135](../speedy-ts/src/blocks/document-tabs-block.ts) |
| DocumentTabRowBlock | `appendTab` | [src/blocks/document-tabs-block.ts:138](../speedy-ts/src/blocks/document-tabs-block.ts) |
| DocumentTabRowBlock | `addTab` | [src/blocks/document-tabs-block.ts:142](../speedy-ts/src/blocks/document-tabs-block.ts) |
| DocumentTabRowBlock | `createNewTab` | [src/blocks/document-tabs-block.ts:167](../speedy-ts/src/blocks/document-tabs-block.ts) |
| DocumentTabRowBlock | `serialize` | [src/blocks/document-tabs-block.ts:171](../speedy-ts/src/blocks/document-tabs-block.ts) |
| DocumentTabRowBlock | `deserialize` | [src/blocks/document-tabs-block.ts:180](../speedy-ts/src/blocks/document-tabs-block.ts) |
| DocumentTabBlock | `extract` | [src/blocks/document-tabs-block.ts:196](../speedy-ts/src/blocks/document-tabs-block.ts) |
| DocumentTabBlock | `explode` | [src/blocks/document-tabs-block.ts:213](../speedy-ts/src/blocks/document-tabs-block.ts) |
| DocumentTabBlock | `getRow` | [src/blocks/document-tabs-block.ts:234](../speedy-ts/src/blocks/document-tabs-block.ts) |
| DocumentTabBlock | `getInputEvents` | [src/blocks/document-tabs-block.ts:237](../speedy-ts/src/blocks/document-tabs-block.ts) |
| DocumentTabBlock | `getBlockBuilder` | [src/blocks/document-tabs-block.ts:258](../speedy-ts/src/blocks/document-tabs-block.ts) |
| DocumentTabBlock | `attachEventHandlers` | [src/blocks/document-tabs-block.ts:273](../speedy-ts/src/blocks/document-tabs-block.ts) |
| DocumentTabBlock | `handleClick` | [src/blocks/document-tabs-block.ts:276](../speedy-ts/src/blocks/document-tabs-block.ts) |
| DocumentTabBlock | `setName` | [src/blocks/document-tabs-block.ts:281](../speedy-ts/src/blocks/document-tabs-block.ts) |
| DocumentTabBlock | `moveRight` | [src/blocks/document-tabs-block.ts:285](../speedy-ts/src/blocks/document-tabs-block.ts) |
| DocumentTabBlock | `moveLeft` | [src/blocks/document-tabs-block.ts:288](../speedy-ts/src/blocks/document-tabs-block.ts) |
| DocumentTabBlock | `mergeLeft` | [src/blocks/document-tabs-block.ts:291](../speedy-ts/src/blocks/document-tabs-block.ts) |
| DocumentTabBlock | `mergeRight` | [src/blocks/document-tabs-block.ts:294](../speedy-ts/src/blocks/document-tabs-block.ts) |
| DocumentTabBlock | `setActive` | [src/blocks/document-tabs-block.ts:297](../speedy-ts/src/blocks/document-tabs-block.ts) |
| DocumentTabBlock | `setFocus` | [src/blocks/document-tabs-block.ts:304](../speedy-ts/src/blocks/document-tabs-block.ts) |
| DocumentTabBlock | `setInactive` | [src/blocks/document-tabs-block.ts:312](../speedy-ts/src/blocks/document-tabs-block.ts) |
| DocumentTabBlock | `serialize` | [src/blocks/document-tabs-block.ts:321](../speedy-ts/src/blocks/document-tabs-block.ts) |
| DocumentTabBlock | `deserialize` | [src/blocks/document-tabs-block.ts:330](../speedy-ts/src/blocks/document-tabs-block.ts) |
| DocumentTabBlock | `deleteTab` | [src/blocks/document-tabs-block.ts:333](../speedy-ts/src/blocks/document-tabs-block.ts) |
| DocumentTabBlock | `destroy` | [src/blocks/document-tabs-block.ts:336](../speedy-ts/src/blocks/document-tabs-block.ts) |

## src/blocks/document-window-block.ts

Source: [src/blocks/document-window-block.ts:1](../speedy-ts/src/blocks/document-window-block.ts). SHA-256: `c01a0c70a9d6028be62cc5f289fcc38acb5d7e501912caa657b69c4aaaf2cb8f`.

Migration family/status: Window session/focus and StyleBar controller; partial window view, style bar absent.

Classes: `DocumentWindowBlock` (extends WindowBlock).

### blocks-document-window-block-callback-01

Source: [src/blocks/document-window-block.ts:20](../speedy-ts/src/blocks/document-window-block.ts). Kind: `callback`. Context: `DocumentWindowBlock`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClose: async (b) => {
                b.destroy();
            }
```

### blocks-document-window-block-callback-02

Source: [src/blocks/document-window-block.ts:36](../speedy-ts/src/blocks/document-window-block.ts). Kind: `callback`. Context: `DocumentWindowBlock.getBlockBuilder.dcw`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClose: async (b) => b.destroy()
```

### Named implementation index

This index intentionally includes helper methods as well as handlers. Resolve named calls in the entries above here; methods with no caller/binding are **not** automatically live commands. Shared support methods may be implemented in another indexed file (notably AbstractBlock, DocumentBlock, UniverseBlock, StandoffProperty and SVG helpers).

| Context | Callable | Source |
| --- | --- | --- |
| DocumentWindowBlock | `getBlockBuilder` | [src/blocks/document-window-block.ts:29](../speedy-ts/src/blocks/document-window-block.ts) |
| DocumentWindowBlock | `getBlockSchemas` | [src/blocks/document-window-block.ts:53](../speedy-ts/src/blocks/document-window-block.ts) |

### Commented/disabled evidence

These are source comments, not installed listeners. They also include relevant intent notes and TODO context. Use the addendum's reachability findings before treating an old commented design as a parity requirement.

- [src/blocks/document-window-block.ts:46](../speedy-ts/src/blocks/document-window-block.ts) — /// It's just a reference for some useful functions; later we can move those functions.

## src/blocks/embed-document-block.ts

Source: [src/blocks/embed-document-block.ts:1](../speedy-ts/src/blocks/embed-document-block.ts). SHA-256: `df19d6978eccb6f81f8cd4e3004735989e4604b8e8e7bb3814d2fb18aba7c92e`.

Migration family/status: Embedded-document boundary/controller; generic view only.

Classes: `EmbedDocumentBlock` (extends AbstractBlock).

No local binding/listener/callback/recognizer sites found by the census. For Block classes this **does not mean no behavior**: follow inherited AbstractBlock navigation, nearest Document commands, Universe routing, schema effects and native/widget boundaries in the addendum.

### Named implementation index

This index intentionally includes helper methods as well as handlers. Resolve named calls in the entries above here; methods with no caller/binding are **not** automatically live commands. Shared support methods may be implemented in another indexed file (notably AbstractBlock, DocumentBlock, UniverseBlock, StandoffProperty and SVG helpers).

| Context | Callable | Source |
| --- | --- | --- |
| EmbedDocumentBlock | `getBlockBuilder` | [src/blocks/embed-document-block.ts:16](../speedy-ts/src/blocks/embed-document-block.ts) |
| EmbedDocumentBlock | `serialize` | [src/blocks/embed-document-block.ts:42](../speedy-ts/src/blocks/embed-document-block.ts) |
| EmbedDocumentBlock | `deserialize` | [src/blocks/embed-document-block.ts:52](../speedy-ts/src/blocks/embed-document-block.ts) |

## src/blocks/entities-list-block.tsx

Source: [src/blocks/entities-list-block.tsx:1](../speedy-ts/src/blocks/entities-list-block.tsx). SHA-256: `4c38c4a36c5a6c5e6000ed48e335d0dca9875c5418e77ff1e78c439c3a185839`.

Migration family/status: Entity-list session controller; generic view only.

Classes: `EntitiesListBlock` (extends AbstractBlock).

Binding installation/override sites (first source line; inspect surrounding constructor/factory):

- [src/blocks/entities-list-block.tsx:84](../speedy-ts/src/blocks/entities-list-block.tsx) — `EntitiesListBlock.setupBindings`: `this.inputEvents = [`

### blocks-entities-list-block-button-factory-01

Source: [src/blocks/entities-list-block.tsx:51](../speedy-ts/src/blocks/entities-list-block.tsx). Kind: `button-factory`. Context: `EntitiesListBlock.createControls.closeBtn`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
this.createWindowButton('×', async () => { 
            self.destroy();
        })
```

### blocks-entities-list-block-listener-01

Source: [src/blocks/entities-list-block.tsx:77](../speedy-ts/src/blocks/entities-list-block.tsx). Kind: `listener`. Context: `EntitiesListBlock.createWindowButton`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
button.addEventListener('click', onClick)
```

### blocks-entities-list-block-listener-02

Source: [src/blocks/entities-list-block.tsx:78](../speedy-ts/src/blocks/entities-list-block.tsx). Kind: `listener`. Context: `EntitiesListBlock.createWindowButton`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
button.addEventListener('mouseenter', () => button.style.background = '#e0e0e0')
```

### blocks-entities-list-block-listener-03

Source: [src/blocks/entities-list-block.tsx:79](../speedy-ts/src/blocks/entities-list-block.tsx). Kind: `listener`. Context: `EntitiesListBlock.createWindowButton`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
button.addEventListener('mouseleave', () => button.style.background = 'transparent')
```

### blocks-entities-list-block-binding-01

Source: [src/blocks/entities-list-block.tsx:85](../speedy-ts/src/blocks/entities-list-block.tsx). Kind: `binding`. Context: `EntitiesListBlock.setupBindings`.

Route: the owning Block's binding list, subject to actual factory installation, mode/trigger matching and origin-to-owner dispatch. Destination/status: the file's migration family above; unresolved until individually qualified.

```tsx
{
                mode: "default",
                trigger: {
                    source: InputEventSource.Keyboard,
                    match: "Escape"
                },
                action: {
                    name: "Close the window",
                    description: `
                        
                    `,
                    handler: async (args: IBindingHandlerArgs) => {
                        self.close();
                    }
                }
            }
```

### blocks-entities-list-block-binding-02

Source: [src/blocks/entities-list-block.tsx:101](../speedy-ts/src/blocks/entities-list-block.tsx). Kind: `binding`. Context: `EntitiesListBlock.setupBindings`.

Route: the owning Block's binding list, subject to actual factory installation, mode/trigger matching and origin-to-owner dispatch. Destination/status: the file's migration family above; unresolved until individually qualified.

```tsx
{
                mode: "default",
                trigger: {
                    source: InputEventSource.Keyboard,
                    match: "ArrowDown"
                },
                action: {
                    name: "Move the cursor down one row. If one isn't found, move to the next block.",
                    description: `
                        
                    `,
                    handler: async (args: IBindingHandlerArgs) => {

                    }
                }
            }
```

### blocks-entities-list-block-jsx-01

Source: [src/blocks/entities-list-block.tsx:225](../speedy-ts/src/blocks/entities-list-block.tsx). Kind: `jsx`. Context: `EntitiesListView`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onMouseEnter={(e) => onMouseOver(e, row.item, index())}
```

### blocks-entities-list-block-jsx-02

Source: [src/blocks/entities-list-block.tsx:226](../speedy-ts/src/blocks/entities-list-block.tsx). Kind: `jsx`. Context: `EntitiesListView`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onMouseLeave={(e) => onMouseLeave(e)}
```

### Named implementation index

This index intentionally includes helper methods as well as handlers. Resolve named calls in the entries above here; methods with no caller/binding are **not** automatically live commands. Shared support methods may be implemented in another indexed file (notably AbstractBlock, DocumentBlock, UniverseBlock, StandoffProperty and SVG helpers).

| Context | Callable | Source |
| --- | --- | --- |
| EntitiesListBlock | `createControls` | [src/blocks/entities-list-block.tsx:45](../speedy-ts/src/blocks/entities-list-block.tsx) |
| EntitiesListBlock | `createWindowButton` | [src/blocks/entities-list-block.tsx:64](../speedy-ts/src/blocks/entities-list-block.tsx) |
| EntitiesListBlock | `setupBindings` | [src/blocks/entities-list-block.tsx:82](../speedy-ts/src/blocks/entities-list-block.tsx) |
| EntitiesListBlock | `setFocus` | [src/blocks/entities-list-block.tsx:119](../speedy-ts/src/blocks/entities-list-block.tsx) |
| EntitiesListBlock | `render` | [src/blocks/entities-list-block.tsx:127](../speedy-ts/src/blocks/entities-list-block.tsx) |
| EntitiesListBlock | `close` | [src/blocks/entities-list-block.tsx:132](../speedy-ts/src/blocks/entities-list-block.tsx) |
| EntitiesListBlock | `serialize` | [src/blocks/entities-list-block.tsx:138](../speedy-ts/src/blocks/entities-list-block.tsx) |
| EntitiesListBlock | `deserialize` | [src/blocks/entities-list-block.tsx:141](../speedy-ts/src/blocks/entities-list-block.tsx) |
|  | `EntitiesListView` | [src/blocks/entities-list-block.tsx:157](../speedy-ts/src/blocks/entities-list-block.tsx) |
| EntitiesListView | `onMouseOver` | [src/blocks/entities-list-block.tsx:166](../speedy-ts/src/blocks/entities-list-block.tsx) |
| EntitiesListView | `onMouseLeave` | [src/blocks/entities-list-block.tsx:173](../speedy-ts/src/blocks/entities-list-block.tsx) |
| EntitiesListView | `countItems` | [src/blocks/entities-list-block.tsx:178](../speedy-ts/src/blocks/entities-list-block.tsx) |

## src/blocks/error-block.ts

Source: [src/blocks/error-block.ts:1](../speedy-ts/src/blocks/error-block.ts). SHA-256: `1d47ed3f3633d1211b1a96ea84e3341b984d40da198bd901388518ed2bffc65b`.

Migration family/status: Fallback/diagnostic view and inherited routing; no local input bindings.

Classes: `ErrorBlock` (extends AbstractBlock).

No local binding/listener/callback/recognizer sites found by the census. For Block classes this **does not mean no behavior**: follow inherited AbstractBlock navigation, nearest Document commands, Universe routing, schema effects and native/widget boundaries in the addendum.

### Named implementation index

This index intentionally includes helper methods as well as handlers. Resolve named calls in the entries above here; methods with no caller/binding are **not** automatically live commands. Shared support methods may be implemented in another indexed file (notably AbstractBlock, DocumentBlock, UniverseBlock, StandoffProperty and SVG helpers).

| Context | Callable | Source |
| --- | --- | --- |
| ErrorBlock | `getBlockBuilder` | [src/blocks/error-block.ts:11](../speedy-ts/src/blocks/error-block.ts) |
| ErrorBlock | `serialize` | [src/blocks/error-block.ts:24](../speedy-ts/src/blocks/error-block.ts) |
| ErrorBlock | `deserialize` | [src/blocks/error-block.ts:32](../speedy-ts/src/blocks/error-block.ts) |

## src/blocks/grid-block.ts

Source: [src/blocks/grid-block.ts:1](../speedy-ts/src/blocks/grid-block.ts). SHA-256: `5a8b6d1c11721c9ad8de1ca06d41971e9251828c7417655b96b7a78c65c2cf06`.

Migration family/status: Grid commands and navigation; layout view exists, specialized operations/navigation unported.

Classes: `GridBlock` (extends AbstractBlock); `GridRowBlock` (extends AbstractBlock); `GridCellBlock` (extends AbstractBlock).

No local binding/listener/callback/recognizer sites found by the census. For Block classes this **does not mean no behavior**: follow inherited AbstractBlock navigation, nearest Document commands, Universe routing, schema effects and native/widget boundaries in the addendum.

### Named implementation index

This index intentionally includes helper methods as well as handlers. Resolve named calls in the entries above here; methods with no caller/binding are **not** automatically live commands. Shared support methods may be implemented in another indexed file (notably AbstractBlock, DocumentBlock, UniverseBlock, StandoffProperty and SVG helpers).

| Context | Callable | Source |
| --- | --- | --- |
| GridBlock | `getBlockSchemas` | [src/blocks/grid-block.ts:15](../speedy-ts/src/blocks/grid-block.ts) |
| GridBlock | `getBlockBuilder` | [src/blocks/grid-block.ts:21](../speedy-ts/src/blocks/grid-block.ts) |
| GridBlock | `destructure` | [src/blocks/grid-block.ts:34](../speedy-ts/src/blocks/grid-block.ts) |
| GridBlock | `totalCells` | [src/blocks/grid-block.ts:53](../speedy-ts/src/blocks/grid-block.ts) |
| GridBlock | `getFirstCell` | [src/blocks/grid-block.ts:57](../speedy-ts/src/blocks/grid-block.ts) |
| GridBlock | `insertRowAfter` | [src/blocks/grid-block.ts:60](../speedy-ts/src/blocks/grid-block.ts) |
| GridBlock | `serialize` | [src/blocks/grid-block.ts:67](../speedy-ts/src/blocks/grid-block.ts) |
| GridBlock | `deserialize` | [src/blocks/grid-block.ts:76](../speedy-ts/src/blocks/grid-block.ts) |
| GridRowBlock | `getBlockBuilder` | [src/blocks/grid-block.ts:87](../speedy-ts/src/blocks/grid-block.ts) |
| GridRowBlock | `insertRowAfter` | [src/blocks/grid-block.ts:108](../speedy-ts/src/blocks/grid-block.ts) |
| GridRowBlock | `getGrid` | [src/blocks/grid-block.ts:112](../speedy-ts/src/blocks/grid-block.ts) |
| GridRowBlock | `getPrevious` | [src/blocks/grid-block.ts:115](../speedy-ts/src/blocks/grid-block.ts) |
| GridRowBlock | `getNext` | [src/blocks/grid-block.ts:121](../speedy-ts/src/blocks/grid-block.ts) |
| GridRowBlock | `serialize` | [src/blocks/grid-block.ts:127](../speedy-ts/src/blocks/grid-block.ts) |
| GridRowBlock | `handleArrowDown` | [src/blocks/grid-block.ts:136](../speedy-ts/src/blocks/grid-block.ts) |
| GridRowBlock | `swapCells` | [src/blocks/grid-block.ts:153](../speedy-ts/src/blocks/grid-block.ts) |
| GridRowBlock | `deserialize` | [src/blocks/grid-block.ts:170](../speedy-ts/src/blocks/grid-block.ts) |
| GridRowBlock | `destroy` | [src/blocks/grid-block.ts:173](../speedy-ts/src/blocks/grid-block.ts) |
| GridCellBlock | `getBlockSchemas` | [src/blocks/grid-block.ts:185](../speedy-ts/src/blocks/grid-block.ts) |
| GridCellBlock | `getBlockBuilder` | [src/blocks/grid-block.ts:190](../speedy-ts/src/blocks/grid-block.ts) |
| GridCellBlock | `removeStyling` | [src/blocks/grid-block.ts:215](../speedy-ts/src/blocks/grid-block.ts) |
| GridCellBlock | `setWidth` | [src/blocks/grid-block.ts:219](../speedy-ts/src/blocks/grid-block.ts) |
| GridCellBlock | `mergeLeft` | [src/blocks/grid-block.ts:227](../speedy-ts/src/blocks/grid-block.ts) |
| GridCellBlock | `merge` | [src/blocks/grid-block.ts:230](../speedy-ts/src/blocks/grid-block.ts) |
| GridCellBlock | `moveBlocksAndContainers` | [src/blocks/grid-block.ts:239](../speedy-ts/src/blocks/grid-block.ts) |
| GridCellBlock | `mergeRight` | [src/blocks/grid-block.ts:245](../speedy-ts/src/blocks/grid-block.ts) |
| GridCellBlock | `moveCellUp` | [src/blocks/grid-block.ts:248](../speedy-ts/src/blocks/grid-block.ts) |
| GridCellBlock | `moveCellDown` | [src/blocks/grid-block.ts:256](../speedy-ts/src/blocks/grid-block.ts) |
| GridCellBlock | `moveCellLeft` | [src/blocks/grid-block.ts:264](../speedy-ts/src/blocks/grid-block.ts) |
| GridCellBlock | `moveCellRight` | [src/blocks/grid-block.ts:270](../speedy-ts/src/blocks/grid-block.ts) |
| GridCellBlock | `swapWith` | [src/blocks/grid-block.ts:276](../speedy-ts/src/blocks/grid-block.ts) |
| GridCellBlock | `getRow` | [src/blocks/grid-block.ts:280](../speedy-ts/src/blocks/grid-block.ts) |
| GridCellBlock | `getCellIndex` | [src/blocks/grid-block.ts:283](../speedy-ts/src/blocks/grid-block.ts) |
| GridCellBlock | `getAboveCell` | [src/blocks/grid-block.ts:287](../speedy-ts/src/blocks/grid-block.ts) |
| GridCellBlock | `getBelowCell` | [src/blocks/grid-block.ts:292](../speedy-ts/src/blocks/grid-block.ts) |
| GridCellBlock | `getPreviousCell` | [src/blocks/grid-block.ts:297](../speedy-ts/src/blocks/grid-block.ts) |
| GridCellBlock | `getNextCell` | [src/blocks/grid-block.ts:303](../speedy-ts/src/blocks/grid-block.ts) |
| GridCellBlock | `getGrid` | [src/blocks/grid-block.ts:309](../speedy-ts/src/blocks/grid-block.ts) |
| GridCellBlock | `handleArrowDown` | [src/blocks/grid-block.ts:312](../speedy-ts/src/blocks/grid-block.ts) |
| GridCellBlock | `serialize` | [src/blocks/grid-block.ts:329](../speedy-ts/src/blocks/grid-block.ts) |
| GridCellBlock | `deserialize` | [src/blocks/grid-block.ts:338](../speedy-ts/src/blocks/grid-block.ts) |

### Commented/disabled evidence

These are source comments, not installed listeners. They also include relevant intent notes and TODO context. Use the addendum's reachability findings before treating an old commented design as a parity requirement.

- [src/blocks/grid-block.ts:35](../speedy-ts/src/blocks/grid-block.ts) — /**          * Explode the GridCellBlock contents back into the Document          * and destroy the Grid structure itself.          */

## src/blocks/iframe-block.ts

Source: [src/blocks/iframe-block.ts:1](../speedy-ts/src/blocks/iframe-block.ts). SHA-256: `19e434a80071c2863664c1f7d47f4dff02cdd0c3cb29166a67f4e2b887f54d12`.

Migration family/status: Opaque/native iframe input boundary; app shortcuts require explicit escape policy.

Classes: `IframeBlock` (extends AbstractBlock).

No local binding/listener/callback/recognizer sites found by the census. For Block classes this **does not mean no behavior**: follow inherited AbstractBlock navigation, nearest Document commands, Universe routing, schema effects and native/widget boundaries in the addendum.

### Named implementation index

This index intentionally includes helper methods as well as handlers. Resolve named calls in the entries above here; methods with no caller/binding are **not** automatically live commands. Shared support methods may be implemented in another indexed file (notably AbstractBlock, DocumentBlock, UniverseBlock, StandoffProperty and SVG helpers).

| Context | Callable | Source |
| --- | --- | --- |
| IframeBlock | `getBlockBuilder` | [src/blocks/iframe-block.ts:15](../speedy-ts/src/blocks/iframe-block.ts) |
| IframeBlock | `build` | [src/blocks/iframe-block.ts:29](../speedy-ts/src/blocks/iframe-block.ts) |
| IframeBlock | `bind` | [src/blocks/iframe-block.ts:43](../speedy-ts/src/blocks/iframe-block.ts) |
| IframeBlock | `serialize` | [src/blocks/iframe-block.ts:50](../speedy-ts/src/blocks/iframe-block.ts) |
| IframeBlock | `deserialize` | [src/blocks/iframe-block.ts:59](../speedy-ts/src/blocks/iframe-block.ts) |

## src/blocks/image-background-block.ts

Source: [src/blocks/image-background-block.ts:1](../speedy-ts/src/blocks/image-background-block.ts). SHA-256: `35d96521d55b6612a2f0424ecd7e02290cae7d3a8dac5c54587e7d29d5164b32`.

Migration family/status: Background controller; inherits routing and background menu actions.

Classes: `ImageBackgroundBlock` (extends AbstractBlock).

No local binding/listener/callback/recognizer sites found by the census. For Block classes this **does not mean no behavior**: follow inherited AbstractBlock navigation, nearest Document commands, Universe routing, schema effects and native/widget boundaries in the addendum.

### Named implementation index

This index intentionally includes helper methods as well as handlers. Resolve named calls in the entries above here; methods with no caller/binding are **not** automatically live commands. Shared support methods may be implemented in another indexed file (notably AbstractBlock, DocumentBlock, UniverseBlock, StandoffProperty and SVG helpers).

| Context | Callable | Source |
| --- | --- | --- |
| ImageBackgroundBlock | `getBlockBuilder` | [src/blocks/image-background-block.ts:11](../speedy-ts/src/blocks/image-background-block.ts) |
| ImageBackgroundBlock | `serialize` | [src/blocks/image-background-block.ts:24](../speedy-ts/src/blocks/image-background-block.ts) |
| ImageBackgroundBlock | `deserialize` | [src/blocks/image-background-block.ts:33](../speedy-ts/src/blocks/image-background-block.ts) |
| ImageBackgroundBlock | `setImage` | [src/blocks/image-background-block.ts:46](../speedy-ts/src/blocks/image-background-block.ts) |

## src/blocks/image-block.ts

Source: [src/blocks/image-block.ts:1](../speedy-ts/src/blocks/image-block.ts). SHA-256: `2e6c3a9b293a566869c2e601bb180b462d339212846508cfdd54df080cd3713e`.

Migration family/status: Image controller and insertion commands; media rendering only, Image Enter binding unported.

Classes: `ImageBlock` (extends AbstractBlock).

Binding installation/override sites (first source line; inspect surrounding constructor/factory):

- [src/blocks/image-block.ts:16](../speedy-ts/src/blocks/image-block.ts) — `ImageBlock`: `this.inputEvents = this.getInputEvents()`

### blocks-image-block-callback-01

Source: [src/blocks/image-block.ts:27](../speedy-ts/src/blocks/image-block.ts). Kind: `callback`. Context: `ImageBlock.getBlockSchemas`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onInit: (p: BlockProperty) => {
                        const container = p.block.container;
                        const {x, y, position } = p.metadata;
                        setElement(container, {
                            style: {
                                position: position || "absolute",
                                left: x + "px",
                                top: y + "px",
                                "z-index": p.block.manager.getHighestZIndex()
                            }
                        });
                    }
```

### blocks-image-block-callback-02

Source: [src/blocks/image-block.ts:45](../speedy-ts/src/blocks/image-block.ts). Kind: `callback`. Context: `ImageBlock.getBlockSchemas`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onInit: (p: BlockProperty) => {
                        const container = p.block.container;
                        const {width, height} = p.metadata;
                        setElement(container, {
                            style: {
                                height: isStr(height) ? height : height + "px",
                                width: isStr(width) ? width : width + "px"
                            }
                        });
                    }
```

### blocks-image-block-binding-01

Source: [src/blocks/image-block.ts:75](../speedy-ts/src/blocks/image-block.ts). Kind: `binding`. Context: `ImageBlock.getInputEvents`.

Route: the owning Block's binding list, subject to actual factory installation, mode/trigger matching and origin-to-owner dispatch. Destination/status: the file's migration family above; unresolved until individually qualified.

```tsx
{
                mode: "default",
                trigger: {
                    source: InputEventSource.Keyboard,
                    match: "Enter"
                },
                action: {
                    name: "Create a new text block underneath.",
                    description: "",
                    handler: async (args: IBindingHandlerArgs) => {
                        const imageBlock = args.block as ImageBlock;
                        const manager = imageBlock.manager as UniverseBlock;
                        const doc = manager.getParentOfType(imageBlock, BlockType.DocumentBlock) as DocumentBlock;
                        const newBlock = manager.createStandoffEditorBlockAsync();
                        newBlock.addEOL();
                        doc.addBlockAfter(newBlock, imageBlock);
                        setTimeout(() => {
                            manager.setBlockFocus(newBlock);
                            newBlock.setCaret(0, CARET.LEFT);
                        });
                    }
                }
            }
```

### blocks-image-block-binding-02

Source: [src/blocks/image-block.ts:98](../speedy-ts/src/blocks/image-block.ts). Kind: `binding`. Context: `ImageBlock.getInputEvents`.

Route: the owning Block's binding list, subject to actual factory installation, mode/trigger matching and origin-to-owner dispatch. Destination/status: the file's migration family above; unresolved until individually qualified.

```tsx
{
                mode: "default",
                trigger: {
                    source: InputEventSource.Mouse,
                    match: "click"
                },
                action: {
                    name: "Set focus to the current block.",
                    description: "",
                    handler: async (args: IBindingHandlerArgs) => {
                        const block = args.block as ImageBlock;
                        const manager = block.manager as UniverseBlock;
                        manager.setBlockFocus(block);
                    }
                }
            }
```

### blocks-image-block-listener-01

Source: [src/blocks/image-block.ts:117](../speedy-ts/src/blocks/image-block.ts). Kind: `listener`. Context: `ImageBlock.attachEventHandlers`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
this.container.addEventListener("click", this.handleClick.bind(this))
```

### Named implementation index

This index intentionally includes helper methods as well as handlers. Resolve named calls in the entries above here; methods with no caller/binding are **not** automatically live commands. Shared support methods may be implemented in another indexed file (notably AbstractBlock, DocumentBlock, UniverseBlock, StandoffProperty and SVG helpers).

| Context | Callable | Source |
| --- | --- | --- |
| ImageBlock | `getBlockSchemas` | [src/blocks/image-block.ts:20](../speedy-ts/src/blocks/image-block.ts) |
| ImageBlock | `getBlockBuilder` | [src/blocks/image-block.ts:59](../speedy-ts/src/blocks/image-block.ts) |
| ImageBlock | `getInputEvents` | [src/blocks/image-block.ts:73](../speedy-ts/src/blocks/image-block.ts) |
| ImageBlock | `attachEventHandlers` | [src/blocks/image-block.ts:116](../speedy-ts/src/blocks/image-block.ts) |
| ImageBlock | `handleKeyDown` | [src/blocks/image-block.ts:120](../speedy-ts/src/blocks/image-block.ts) |
| ImageBlock | `handleClick` | [src/blocks/image-block.ts:142](../speedy-ts/src/blocks/image-block.ts) |
| ImageBlock | `build` | [src/blocks/image-block.ts:147](../speedy-ts/src/blocks/image-block.ts) |
| ImageBlock | `bind` | [src/blocks/image-block.ts:161](../speedy-ts/src/blocks/image-block.ts) |
| ImageBlock | `serialize` | [src/blocks/image-block.ts:168](../speedy-ts/src/blocks/image-block.ts) |
| ImageBlock | `deserialize` | [src/blocks/image-block.ts:177](../speedy-ts/src/blocks/image-block.ts) |

### Commented/disabled evidence

These are source comments, not installed listeners. They also include relevant intent notes and TODO context. Use the addendum's reachability findings before treating an old commented design as a parity requirement.

- [src/blocks/image-block.ts:118](../speedy-ts/src/blocks/image-block.ts) — // this.container.addEventListener("keydown", this.handleKeyDown.bind(this));

## src/blocks/indented-list-block.ts

Source: [src/blocks/indented-list-block.ts:1](../speedy-ts/src/blocks/indented-list-block.ts). SHA-256: `90bcba057c00083887c76876d480610c3f36d5d7af3f1190671702a9db7db0aa`.

Migration family/status: List commands and navigation; no collapse/expand or full inherited navigation parity.

Classes: `IndentedListBlock` (extends AbstractBlock).

No local binding/listener/callback/recognizer sites found by the census. For Block classes this **does not mean no behavior**: follow inherited AbstractBlock navigation, nearest Document commands, Universe routing, schema effects and native/widget boundaries in the addendum.

### Named implementation index

This index intentionally includes helper methods as well as handlers. Resolve named calls in the entries above here; methods with no caller/binding are **not** automatically live commands. Shared support methods may be implemented in another indexed file (notably AbstractBlock, DocumentBlock, UniverseBlock, StandoffProperty and SVG helpers).

| Context | Callable | Source |
| --- | --- | --- |
| IndentedListBlock | `getBlockBuilder` | [src/blocks/indented-list-block.ts:11](../speedy-ts/src/blocks/indented-list-block.ts) |
| IndentedListBlock | `destructure` | [src/blocks/indented-list-block.ts:30](../speedy-ts/src/blocks/indented-list-block.ts) |
| IndentedListBlock | `serialize` | [src/blocks/indented-list-block.ts:45](../speedy-ts/src/blocks/indented-list-block.ts) |
| IndentedListBlock | `handleArrowDown` | [src/blocks/indented-list-block.ts:54](../speedy-ts/src/blocks/indented-list-block.ts) |
| IndentedListBlock | `collapse` | [src/blocks/indented-list-block.ts:71](../speedy-ts/src/blocks/indented-list-block.ts) |
| IndentedListBlock | `expand` | [src/blocks/indented-list-block.ts:75](../speedy-ts/src/blocks/indented-list-block.ts) |
| IndentedListBlock | `renderCollapsedState` | [src/blocks/indented-list-block.ts:79](../speedy-ts/src/blocks/indented-list-block.ts) |
| IndentedListBlock | `deserialize` | [src/blocks/indented-list-block.ts:87](../speedy-ts/src/blocks/indented-list-block.ts) |

### Commented/disabled evidence

These are source comments, not installed listeners. They also include relevant intent notes and TODO context. Use the addendum's reachability findings before treating an old commented design as a parity requirement.

- [src/blocks/indented-list-block.ts:31](../speedy-ts/src/blocks/indented-list-block.ts) — /**          * Explode the GridCellBlock contents back into the Document          * and destroy the Grid structure itself.          */

## src/blocks/monitor-block.tsx

Source: [src/blocks/monitor-block.tsx:1](../speedy-ts/src/blocks/monitor-block.tsx). SHA-256: `d19ea851b5f2e7f8bf4543b404816a8a421357bec3a8eebacd558482fddde1e0`.

Migration family/status: Annotation-monitor session controller and endpoint commands; generic view only.

Classes: `MonitorBlock` (extends AbstractBlock implements IHandleyKeyboardInput).

Binding installation/override sites (first source line; inspect surrounding constructor/factory):

- [src/blocks/monitor-block.tsx:81](../speedy-ts/src/blocks/monitor-block.tsx) — `StandoffEditorBlockMonitor.onInit`: `monitor.inputEvents.push(`

### blocks-monitor-block-binding-01

Source: [src/blocks/monitor-block.tsx:82](../speedy-ts/src/blocks/monitor-block.tsx). Kind: `binding`. Context: `StandoffEditorBlockMonitor.onInit`.

Route: the owning Block's binding list, subject to actual factory installation, mode/trigger matching and origin-to-owner dispatch. Destination/status: the file's migration family above; unresolved until individually qualified.

```tsx
{
                mode: "default",
                trigger: {
                    source: InputEventSource.Keyboard,
                    match: "Escape"
                },
                action: {
                    name: "Close Monitor",
                    description: "",
                    handler: async (args: IBindingHandlerArgs) => {
                        props.onClose();
                    }
                },
            }
```

### blocks-monitor-block-binding-02

Source: [src/blocks/monitor-block.tsx:96](../speedy-ts/src/blocks/monitor-block.tsx). Kind: `binding`. Context: `StandoffEditorBlockMonitor.onInit`.

Route: the owning Block's binding list, subject to actual factory installation, mode/trigger matching and origin-to-owner dispatch. Destination/status: the file's migration family above; unresolved until individually qualified.

```tsx
{
                mode: "default",
                trigger: {
                    source: InputEventSource.Keyboard,
                    match: "ArrowUp"
                },
                action: {
                    name: "Set focus to the item above.",
                    description: "",
                    handler: async (args: any) => {
                        properties.forEach((__,i) => setProperties(i, "visible", false));
                        const len = monitor.properties.length;
                        if (state.activeItem == 0) {
                            setState("activeItem", len - 1);
                            setProperties(len - 1, "visible", true);
                            return;
                        }
                        const i = state.activeItem - 1;
                        setState("activeItem", i);
                        setProperties(i, "visible", true);
                    }
                }
            }
```

### blocks-monitor-block-binding-03

Source: [src/blocks/monitor-block.tsx:119](../speedy-ts/src/blocks/monitor-block.tsx). Kind: `binding`. Context: `StandoffEditorBlockMonitor.onInit`.

Route: the owning Block's binding list, subject to actual factory installation, mode/trigger matching and origin-to-owner dispatch. Destination/status: the file's migration family above; unresolved until individually qualified.

```tsx
{
                mode: "default",
                trigger: {
                    source: InputEventSource.Keyboard,
                    match: "ArrowDown"
                },
                action: {
                    name: "Set focus to the block below.",
                    description: "",
                    handler: async (args: any) => {
                        properties.forEach((__,i) => setProperties(i, "visible", false));
                        const len = monitor.properties.length;
                        if (state.activeItem == len - 1) {
                            setState("activeItem", 0);
                            setProperties(0, "visible", true);
                            return;
                        }
                        const i = state.activeItem + 1;
                        setState("activeItem", i);
                        setProperties(i, "visible", true);
                    }
                }
            }
```

### blocks-monitor-block-binding-04

Source: [src/blocks/monitor-block.tsx:142](../speedy-ts/src/blocks/monitor-block.tsx). Kind: `binding`. Context: `StandoffEditorBlockMonitor.onInit`.

Route: the owning Block's binding list, subject to actual factory installation, mode/trigger matching and origin-to-owner dispatch. Destination/status: the file's migration family above; unresolved until individually qualified.

```tsx
{
                mode: "default",
                trigger: {
                    source: InputEventSource.Keyboard,
                    match: "ArrowRight"
                },
                action: {
                    name: "Set property at current index visible.",
                    description: "",
                    handler: async (args: any) => {
                        const item = properties[state.activeItem];
                        item.property.shiftRightOneWord();
                    }
                }
            }
```

### blocks-monitor-block-binding-05

Source: [src/blocks/monitor-block.tsx:157](../speedy-ts/src/blocks/monitor-block.tsx). Kind: `binding`. Context: `StandoffEditorBlockMonitor.onInit`.

Route: the owning Block's binding list, subject to actual factory installation, mode/trigger matching and origin-to-owner dispatch. Destination/status: the file's migration family above; unresolved until individually qualified.

```tsx
{
                mode: "default",
                trigger: {
                    source: InputEventSource.Keyboard,
                    match: "Shift-ArrowRight"
                },
                action: {
                    name: "Set property at current index visible.",
                    description: "",
                    handler: async (args: any) => {
                        const item = properties[state.activeItem];
                        item.property.shiftRight();
                    }
                }
            }
```

### blocks-monitor-block-binding-06

Source: [src/blocks/monitor-block.tsx:172](../speedy-ts/src/blocks/monitor-block.tsx). Kind: `binding`. Context: `StandoffEditorBlockMonitor.onInit`.

Route: the owning Block's binding list, subject to actual factory installation, mode/trigger matching and origin-to-owner dispatch. Destination/status: the file's migration family above; unresolved until individually qualified.

```tsx
{
                mode: "default",
                trigger: {
                    source: InputEventSource.Keyboard,
                    match: "ArrowLeft"
                },
                action: {
                    name: "Set property at current index invisible.",
                    description: "",
                    handler: async (args: any) => {
                        const item = properties[state.activeItem];
                        item.property.shiftLeftOneWord();
                    }
                }
            }
```

### blocks-monitor-block-binding-07

Source: [src/blocks/monitor-block.tsx:187](../speedy-ts/src/blocks/monitor-block.tsx). Kind: `binding`. Context: `StandoffEditorBlockMonitor.onInit`.

Route: the owning Block's binding list, subject to actual factory installation, mode/trigger matching and origin-to-owner dispatch. Destination/status: the file's migration family above; unresolved until individually qualified.

```tsx
{
                mode: "default",
                trigger: {
                    source: InputEventSource.Keyboard,
                    match: "Shift-ArrowLeft"
                },
                action: {
                    name: "Set property at current index invisible.",
                    description: "",
                    handler: async (args: any) => {
                        const item = properties[state.activeItem];
                        item.property.shiftLeft();
                    }
                }
            }
```

### blocks-monitor-block-binding-08

Source: [src/blocks/monitor-block.tsx:202](../speedy-ts/src/blocks/monitor-block.tsx). Kind: `binding`. Context: `StandoffEditorBlockMonitor.onInit`.

Route: the owning Block's binding list, subject to actual factory installation, mode/trigger matching and origin-to-owner dispatch. Destination/status: the file's migration family above; unresolved until individually qualified.

```tsx
{
                mode: "default",
                trigger: {
                    source: InputEventSource.Keyboard,
                    match: "'='"
                },
                action: {
                    name: "Increase the length of the annotation.",
                    description: "",
                    handler: async (args: any) => {
                        const item = properties[state.activeItem];
                        item.property.expand();
                    }
                }
            }
```

### blocks-monitor-block-binding-09

Source: [src/blocks/monitor-block.tsx:217](../speedy-ts/src/blocks/monitor-block.tsx). Kind: `binding`. Context: `StandoffEditorBlockMonitor.onInit`.

Route: the owning Block's binding list, subject to actual factory installation, mode/trigger matching and origin-to-owner dispatch. Destination/status: the file's migration family above; unresolved until individually qualified.

```tsx
{
                mode: "default",
                trigger: {
                    source: InputEventSource.Keyboard,
                    match: "'-'"
                },
                action: {
                    name: "Decrease the length of the annotation.",
                    description: "",
                    handler: async (args: any) => {
                        const item = properties[state.activeItem];
                        item.property.contract();
                    }
                }
            }
```

### blocks-monitor-block-binding-10

Source: [src/blocks/monitor-block.tsx:232](../speedy-ts/src/blocks/monitor-block.tsx). Kind: `binding`. Context: `StandoffEditorBlockMonitor.onInit`.

Route: the owning Block's binding list, subject to actual factory installation, mode/trigger matching and origin-to-owner dispatch. Destination/status: the file's migration family above; unresolved until individually qualified.

```tsx
{
                mode: "default",
                trigger: {
                    source: InputEventSource.Keyboard,
                    match: "'d'"
                },
                action: {
                    name: "Delete the annotation.",
                    description: "",
                    handler: async (args: any) => {
                        const item = properties[state.activeItem];
                        item.property.destroy();
                    }
                }
            }
```

### blocks-monitor-block-jsx-01

Source: [src/blocks/monitor-block.tsx:267](../speedy-ts/src/blocks/monitor-block.tsx). Kind: `jsx`. Context: `StandoffEditorBlockMonitor`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick={(e) => { e.preventDefault(); setItemVisible(item, !item.visible); }}
```

### blocks-monitor-block-jsx-02

Source: [src/blocks/monitor-block.tsx:275](../speedy-ts/src/blocks/monitor-block.tsx). Kind: `jsx`. Context: `StandoffEditorBlockMonitor`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onMouseOver={(e) => { e.preventDefault(); item.property.highlight(); }}
```

### blocks-monitor-block-jsx-03

Source: [src/blocks/monitor-block.tsx:276](../speedy-ts/src/blocks/monitor-block.tsx). Kind: `jsx`. Context: `StandoffEditorBlockMonitor`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onMouseOut={(e) => { e.preventDefault(); item.property.unhighlight(); }}
```

### blocks-monitor-block-jsx-04

Source: [src/blocks/monitor-block.tsx:277](../speedy-ts/src/blocks/monitor-block.tsx). Kind: `jsx`. Context: `StandoffEditorBlockMonitor`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick={(e) => { e.preventDefault(); item.property.shiftLeft() }}
```

### blocks-monitor-block-jsx-05

Source: [src/blocks/monitor-block.tsx:280](../speedy-ts/src/blocks/monitor-block.tsx). Kind: `jsx`. Context: `StandoffEditorBlockMonitor`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onMouseOver={(e) => { e.preventDefault(); item.property.highlight(); }}
```

### blocks-monitor-block-jsx-06

Source: [src/blocks/monitor-block.tsx:281](../speedy-ts/src/blocks/monitor-block.tsx). Kind: `jsx`. Context: `StandoffEditorBlockMonitor`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onMouseOut={(e) => { e.preventDefault(); item.property.unhighlight(); }}
```

### blocks-monitor-block-jsx-07

Source: [src/blocks/monitor-block.tsx:282](../speedy-ts/src/blocks/monitor-block.tsx). Kind: `jsx`. Context: `StandoffEditorBlockMonitor`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick={(e) => { e.preventDefault(); item.property.shiftRight() }}
```

### blocks-monitor-block-jsx-08

Source: [src/blocks/monitor-block.tsx:285](../speedy-ts/src/blocks/monitor-block.tsx). Kind: `jsx`. Context: `StandoffEditorBlockMonitor`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onMouseOver={(e) => { e.preventDefault(); item.property.highlight(); }}
```

### blocks-monitor-block-jsx-09

Source: [src/blocks/monitor-block.tsx:286](../speedy-ts/src/blocks/monitor-block.tsx). Kind: `jsx`. Context: `StandoffEditorBlockMonitor`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onMouseOut={(e) => { e.preventDefault(); item.property.unhighlight(); }}
```

### blocks-monitor-block-jsx-10

Source: [src/blocks/monitor-block.tsx:287](../speedy-ts/src/blocks/monitor-block.tsx). Kind: `jsx`. Context: `StandoffEditorBlockMonitor`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick={(e) => { e.preventDefault(); item.property.expand() }}
```

### blocks-monitor-block-jsx-11

Source: [src/blocks/monitor-block.tsx:290](../speedy-ts/src/blocks/monitor-block.tsx). Kind: `jsx`. Context: `StandoffEditorBlockMonitor`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onMouseOver={(e) => { e.preventDefault(); item.property.highlight(); }}
```

### blocks-monitor-block-jsx-12

Source: [src/blocks/monitor-block.tsx:291](../speedy-ts/src/blocks/monitor-block.tsx). Kind: `jsx`. Context: `StandoffEditorBlockMonitor`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onMouseOut={(e) => { e.preventDefault(); item.property.unhighlight(); }}
```

### blocks-monitor-block-jsx-13

Source: [src/blocks/monitor-block.tsx:292](../speedy-ts/src/blocks/monitor-block.tsx). Kind: `jsx`. Context: `StandoffEditorBlockMonitor`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick={(e) => { e.preventDefault(); item.property.contract() }}
```

### blocks-monitor-block-jsx-14

Source: [src/blocks/monitor-block.tsx:295](../speedy-ts/src/blocks/monitor-block.tsx). Kind: `jsx`. Context: `StandoffEditorBlockMonitor`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onMouseOver={(e) => { e.preventDefault(); item.property.highlight(); }}
```

### blocks-monitor-block-jsx-15

Source: [src/blocks/monitor-block.tsx:296](../speedy-ts/src/blocks/monitor-block.tsx). Kind: `jsx`. Context: `StandoffEditorBlockMonitor`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onMouseOut={(e) => { e.preventDefault(); item.property.unhighlight(); }}
```

### blocks-monitor-block-jsx-16

Source: [src/blocks/monitor-block.tsx:297](../speedy-ts/src/blocks/monitor-block.tsx). Kind: `jsx`. Context: `StandoffEditorBlockMonitor`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick={(e) => { e.preventDefault(); onDelete(item.property) }}
```

### Named implementation index

This index intentionally includes helper methods as well as handlers. Resolve named calls in the entries above here; methods with no caller/binding are **not** automatically live commands. Shared support methods may be implemented in another indexed file (notably AbstractBlock, DocumentBlock, UniverseBlock, StandoffProperty and SVG helpers).

| Context | Callable | Source |
| --- | --- | --- |
| MonitorBlock | `setFocus` | [src/blocks/monitor-block.tsx:32](../speedy-ts/src/blocks/monitor-block.tsx) |
| MonitorBlock | `handleKeyDown` | [src/blocks/monitor-block.tsx:40](../speedy-ts/src/blocks/monitor-block.tsx) |
| MonitorBlock | `setContainer` | [src/blocks/monitor-block.tsx:43](../speedy-ts/src/blocks/monitor-block.tsx) |
| MonitorBlock | `destroy` | [src/blocks/monitor-block.tsx:46](../speedy-ts/src/blocks/monitor-block.tsx) |
| MonitorBlock | `serialize` | [src/blocks/monitor-block.tsx:49](../speedy-ts/src/blocks/monitor-block.tsx) |
| MonitorBlock | `deserialize` | [src/blocks/monitor-block.tsx:52](../speedy-ts/src/blocks/monitor-block.tsx) |
|  | `StandoffEditorBlockMonitor` | [src/blocks/monitor-block.tsx:61](../speedy-ts/src/blocks/monitor-block.tsx) |
| StandoffEditorBlockMonitor | `toStandoffPropertyState` | [src/blocks/monitor-block.tsx:67](../speedy-ts/src/blocks/monitor-block.tsx) |
| StandoffEditorBlockMonitor | `setItemVisible` | [src/blocks/monitor-block.tsx:69](../speedy-ts/src/blocks/monitor-block.tsx) |
| StandoffEditorBlockMonitor | `onDelete` | [src/blocks/monitor-block.tsx:73](../speedy-ts/src/blocks/monitor-block.tsx) |
| StandoffEditorBlockMonitor | `onInit` | [src/blocks/monitor-block.tsx:79](../speedy-ts/src/blocks/monitor-block.tsx) |

## src/blocks/page-block.ts

Source: [src/blocks/page-block.ts:1](../speedy-ts/src/blocks/page-block.ts). SHA-256: `0af4a1cd833e280d6fb593d9abd1e05255e09cb5e1e3c08466b81071ef2871d5`.

Migration family/status: Page controller and focus policy; PageView lacks original background-click focus handler.

Classes: `PageBlock` (extends AbstractBlock).

Binding installation/override sites (first source line; inspect surrounding constructor/factory):

- [src/blocks/page-block.ts:11](../speedy-ts/src/blocks/page-block.ts) — `PageBlock`: `this.inputEvents = this.getInputEvents()`

### blocks-page-block-binding-01

Source: [src/blocks/page-block.ts:15](../speedy-ts/src/blocks/page-block.ts). Kind: `binding`. Context: `PageBlock.getInputEvents`.

Route: the owning Block's binding list, subject to actual factory installation, mode/trigger matching and origin-to-owner dispatch. Destination/status: the file's migration family above; unresolved until individually qualified.

```tsx
{
                mode: "default",
                trigger: {
                    source: InputEventSource.Mouse,
                    match: "clickleft"
                },
                action: {
                    name: "Clicking in a page area.",
                    description: "",
                    handler: async (args: IBindingHandlerArgs) => {
                        const block = args.block;
                        const manager = block.manager as UniverseBlock;
                        if (block.type != BlockType.PageBlock) return;
                        const first = block.blocks.find(x => x.type == BlockType.StandoffEditorBlock) as StandoffEditorBlock;
                        if (!first) return;
                        manager.setBlockFocus(first);
                        first.moveCaretStart();
                    }
                }
            }
```

### Named implementation index

This index intentionally includes helper methods as well as handlers. Resolve named calls in the entries above here; methods with no caller/binding are **not** automatically live commands. Shared support methods may be implemented in another indexed file (notably AbstractBlock, DocumentBlock, UniverseBlock, StandoffProperty and SVG helpers).

| Context | Callable | Source |
| --- | --- | --- |
| PageBlock | `getInputEvents` | [src/blocks/page-block.ts:13](../speedy-ts/src/blocks/page-block.ts) |
| PageBlock | `getBlockBuilder` | [src/blocks/page-block.ts:37](../speedy-ts/src/blocks/page-block.ts) |
| PageBlock | `setFocus` | [src/blocks/page-block.ts:52](../speedy-ts/src/blocks/page-block.ts) |
| PageBlock | `serialize` | [src/blocks/page-block.ts:55](../speedy-ts/src/blocks/page-block.ts) |
| PageBlock | `deserialize` | [src/blocks/page-block.ts:64](../speedy-ts/src/blocks/page-block.ts) |

## src/blocks/plain-text-block.ts

Source: [src/blocks/plain-text-block.ts:1](../speedy-ts/src/blocks/plain-text-block.ts). SHA-256: `3101fb03e44fad42487effb984556e666b29b9141dc66ef0b2c0c535678c9997`.

Migration family/status: Native textarea adapter plus declared ancestor commands; text capture is partial parity.

Classes: `PlainTextBlock` (extends AbstractBlock).

### blocks-plain-text-block-listener-01

Source: [src/blocks/plain-text-block.ts:42](../speedy-ts/src/blocks/plain-text-block.ts). Kind: `listener`. Context: `PlainTextBlock.attachEventHandlers`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
this.textarea.addEventListener("click", () => {
            (self.manager as UniverseBlock).setBlockFocus(self);
        })
```

### blocks-plain-text-block-listener-02

Source: [src/blocks/plain-text-block.ts:45](../speedy-ts/src/blocks/plain-text-block.ts). Kind: `listener`. Context: `PlainTextBlock.attachEventHandlers`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
this.textarea.addEventListener("keydown", this.handleKeyDown.bind(this))
```

### Named implementation index

This index intentionally includes helper methods as well as handlers. Resolve named calls in the entries above here; methods with no caller/binding are **not** automatically live commands. Shared support methods may be implemented in another indexed file (notably AbstractBlock, DocumentBlock, UniverseBlock, StandoffProperty and SVG helpers).

| Context | Callable | Source |
| --- | --- | --- |
| PlainTextBlock | `getBlockBuilder` | [src/blocks/plain-text-block.ts:24](../speedy-ts/src/blocks/plain-text-block.ts) |
| PlainTextBlock | `attachEventHandlers` | [src/blocks/plain-text-block.ts:40](../speedy-ts/src/blocks/plain-text-block.ts) |
| PlainTextBlock | `setFocus` | [src/blocks/plain-text-block.ts:47](../speedy-ts/src/blocks/plain-text-block.ts) |
| PlainTextBlock | `getSelection` | [src/blocks/plain-text-block.ts:50](../speedy-ts/src/blocks/plain-text-block.ts) |
| PlainTextBlock | `handleKeyDown` | [src/blocks/plain-text-block.ts:54](../speedy-ts/src/blocks/plain-text-block.ts) |
| PlainTextBlock | `bind` | [src/blocks/plain-text-block.ts:82](../speedy-ts/src/blocks/plain-text-block.ts) |
| PlainTextBlock | `serialize` | [src/blocks/plain-text-block.ts:85](../speedy-ts/src/blocks/plain-text-block.ts) |
| PlainTextBlock | `deserialize` | [src/blocks/plain-text-block.ts:95](../speedy-ts/src/blocks/plain-text-block.ts) |

## src/blocks/standoff-editor-block.ts

Source: [src/blocks/standoff-editor-block.ts:1](../speedy-ts/src/blocks/standoff-editor-block.ts). SHA-256: `5c52fb2a150dd8b22e69926748bdcba8382822112423475a07f17758f782a350`.

Migration family/status: Standoff controller, mapped inline commands, selection and decoration adapters; partial edit coverage.

Classes: `StandoffEditorBlock` (extends AbstractBlock).

Binding installation/override sites (first source line; inspect surrounding constructor/factory):

- [src/blocks/standoff-editor-block.ts:100](../speedy-ts/src/blocks/standoff-editor-block.ts) — `StandoffEditorBlock`: `this.inputEvents = [`

### blocks-standoff-editor-block-binding-01

Source: [src/blocks/standoff-editor-block.ts:101](../speedy-ts/src/blocks/standoff-editor-block.ts). Kind: `binding`. Context: `StandoffEditorBlock`.

Route: the owning Block's binding list, subject to actual factory installation, mode/trigger matching and origin-to-owner dispatch. Destination/status: the file's migration family above; unresolved until individually qualified.

```tsx
{
                mode: "default",
                trigger: {
                    source: InputEventSource.Keyboard,
                    match: "Enter"
                },
                action: {
                    name: "Create a new text block. Move text to the right of the caret into the new block.",
                    description: `
                        
                    `,
                    handler: async (args: IBindingHandlerArgs) => {
                        const block = args.block;
                        const manager = block.manager;
                        const doc = manager.registeredBlocks.find(x => x.type == BlockType.DocumentBlock) as DocumentBlock;
                        doc && await doc.handleEnterKey(args);
                    }
                }
            }
```

### blocks-standoff-editor-block-callback-01

Source: [src/blocks/standoff-editor-block.ts:130](../speedy-ts/src/blocks/standoff-editor-block.ts). Kind: `callback`. Context: `StandoffEditorBlock.getStandoffSchemas`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onInit: async (p: StandoffProperty) => {
                        const cells = p.getCells();
                        cells.forEach(c => c.element.style.backgroundColor = p.value);
                    }
```

### blocks-standoff-editor-block-callback-02

Source: [src/blocks/standoff-editor-block.ts:153](../speedy-ts/src/blocks/standoff-editor-block.ts). Kind: `callback`. Context: `StandoffEditorBlock.getStandoffSchemas`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onInit: async (p: StandoffProperty) => {
                        const cells = p.getCells();
                        cells.forEach(c => c.element.style.color = p.value);
                    }
```

### blocks-standoff-editor-block-callback-03

Source: [src/blocks/standoff-editor-block.ts:157](../speedy-ts/src/blocks/standoff-editor-block.ts). Kind: `callback`. Context: `StandoffEditorBlock.getStandoffSchemas`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onUpdate: async (p: StandoffProperty) => {
                        const cells = p.getCells();
                        cells.forEach(c => c.element.style.color = p.value);
                    }
```

### blocks-standoff-editor-block-callback-04

Source: [src/blocks/standoff-editor-block.ts:161](../speedy-ts/src/blocks/standoff-editor-block.ts). Kind: `callback`. Context: `StandoffEditorBlock.getStandoffSchemas`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onDestroy: async (p: StandoffProperty) => {
                        const cells = p.getCells();
                        cells.forEach(c => c.element.style.color = "unset");
                    }
```

### blocks-standoff-editor-block-callback-05

Source: [src/blocks/standoff-editor-block.ts:186](../speedy-ts/src/blocks/standoff-editor-block.ts). Kind: `callback`. Context: `StandoffEditorBlock.getStandoffSchemas`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onInit: async (p:StandoffProperty) => {
                        const manager = new UniverseBlock();
                        const container = p.start.element as HTMLSpanElement;
                        setElement(container, {
                            style: {
                                display: "inline-block",
                                zoom: 0.08
                            }
                        });
                        await manager.loadServerDocument(p.value);
                        container.innerHTML = "";
                        setElement(manager.container, {
                            style: {
                                maxWidth: p.start.cache.offset.w,
                                maxHeight: p.start.cache.offset.h,
                                "overflow": "hidden"
                            }
                        });
                        container.appendChild(manager.container);
                    }
```

### blocks-standoff-editor-block-callback-06

Source: [src/blocks/standoff-editor-block.ts:206](../speedy-ts/src/blocks/standoff-editor-block.ts). Kind: `callback`. Context: `StandoffEditorBlock.getStandoffSchemas`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onDestroy: (p: StandoffProperty) => {
                        const span = p.start.element as HTMLSpanElement;
                        setElement(span, {
                            display: "inline",
                            zoom: 1
                        });
                        span.innerHTML = p.start.text;
                    }
```

### blocks-standoff-editor-block-callback-07

Source: [src/blocks/standoff-editor-block.ts:221](../speedy-ts/src/blocks/standoff-editor-block.ts). Kind: `callback`. Context: `StandoffEditorBlock.getStandoffSchemas`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onInit: (p: StandoffProperty) => {
                        const clock = new ClockPlugin({ property: p });
                        p.plugin = clock;
                        self.plugins?.push(clock);
                        clock.start();
                    }
```

### blocks-standoff-editor-block-callback-08

Source: [src/blocks/standoff-editor-block.ts:227](../speedy-ts/src/blocks/standoff-editor-block.ts). Kind: `callback`. Context: `StandoffEditorBlock.getStandoffSchemas`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onDestroy: (p: StandoffProperty) => {
                        p.plugin?.destroy();
                        const i = self.plugins.findIndex(x => x == p.plugin);
                        self.plugins.splice(i, 1);
                    }
```

### blocks-standoff-editor-block-callback-09

Source: [src/blocks/standoff-editor-block.ts:318](../speedy-ts/src/blocks/standoff-editor-block.ts). Kind: `callback`. Context: `StandoffEditorBlock.getStandoffSchemas`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onDoubleClick: async (args: any) => {
                        const url = args.property.metadata.url;
                        window.open(url, '_blank')?.focus();
                    }
```

### blocks-standoff-editor-block-event-property-01

Source: [src/blocks/standoff-editor-block.ts:335](../speedy-ts/src/blocks/standoff-editor-block.ts). Kind: `event-property`. Context: `StandoffEditorBlock.getStandoffSchemas`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
beforeStyling: async (args: any) => {
                        // TBC : will show some interface where a block can be retrieved
                    }
```

### blocks-standoff-editor-block-callback-10

Source: [src/blocks/standoff-editor-block.ts:353](../speedy-ts/src/blocks/standoff-editor-block.ts). Kind: `callback`. Context: `StandoffEditorBlock.getStandoffSchemas`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onDoubleClick: async (args: any) => {
                        const prop = args.property;
                        alert(prop.value);
                    }
```

### blocks-standoff-editor-block-callback-11

Source: [src/blocks/standoff-editor-block.ts:371](../speedy-ts/src/blocks/standoff-editor-block.ts). Kind: `callback`. Context: `StandoffEditorBlock.getStandoffSchemas`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onDoubleClick: async (args: any) => {
                        const prop = args.property;
                        alert(prop.value);
                    }
```

### blocks-standoff-editor-block-callback-12

Source: [src/blocks/standoff-editor-block.ts:390](../speedy-ts/src/blocks/standoff-editor-block.ts). Kind: `callback`. Context: `StandoffEditorBlock.getStandoffSchemas`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onDoubleClick: async (args: any) => {
                        const prop = args.property;
                        alert(prop.value);
                    }
```

### blocks-standoff-editor-block-callback-13

Source: [src/blocks/standoff-editor-block.ts:409](../speedy-ts/src/blocks/standoff-editor-block.ts). Kind: `callback`. Context: `StandoffEditorBlock.getStandoffSchemas`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onDoubleClick: async (args: any) => {
                        const prop = args.property;
                        alert(prop.value);
                    }
```

### blocks-standoff-editor-block-event-property-02

Source: [src/blocks/standoff-editor-block.ts:428](../speedy-ts/src/blocks/standoff-editor-block.ts). Kind: `event-property`. Context: `StandoffEditorBlock.getStandoffSchemas`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
beforeStyling: async (args: any) => {
                        // TBC : will show a panel where the entity can be searched for
                    }
```

### blocks-standoff-editor-block-callback-14

Source: [src/blocks/standoff-editor-block.ts:431](../speedy-ts/src/blocks/standoff-editor-block.ts). Kind: `callback`. Context: `StandoffEditorBlock.getStandoffSchemas`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onDoubleClick: async (args: any) => {
                        const prop = args.property;
                        alert(prop.value);
                    }
```

### blocks-standoff-editor-block-callback-15

Source: [src/blocks/standoff-editor-block.ts:551](../speedy-ts/src/blocks/standoff-editor-block.ts). Kind: `callback`. Context: `StandoffEditorBlock.getBlockSchemas`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onInit: (p: BlockProperty) => {
                        const vines = new BlockVines(p.block);
                        vines.update();
                    }
```

### blocks-standoff-editor-block-callback-16

Source: [src/blocks/standoff-editor-block.ts:561](../speedy-ts/src/blocks/standoff-editor-block.ts). Kind: `callback`. Context: `StandoffEditorBlock.getBlockSchemas`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onInit: (p: BlockProperty) => {
                        const container = p.block.container;
                        const {x, y, position } = p.metadata;
                        setElement(container, {
                            style: {
                                position: position || "absolute",
                                left: x + "px",
                                top: y + "px",
                                "z-index": manager.getHighestZIndex()
                            }
                        });
                    }
```

### blocks-standoff-editor-block-callback-17

Source: [src/blocks/standoff-editor-block.ts:579](../speedy-ts/src/blocks/standoff-editor-block.ts). Kind: `callback`. Context: `StandoffEditorBlock.getBlockSchemas`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onInit: (p: BlockProperty) => {
                        const container = p.block.container;
                        const {width, height} = p.metadata;
                        setElement(container, {
                            style: {
                                height: isStr(height) ? height : height + "px",
                                width: isStr(width) ? width : width + "px",
                                "overflow-y": "auto",
                                "overflow-x": "hidden"
                            }
                        });
                        const minWidth = p.metadata["min-width"];
                        if (minWidth) {
                            setElement(container, {
                            style: {
                                "min-width": minWidth + "px"
                            }
                        });
                        }
                    }
```

### blocks-standoff-editor-block-callback-18

Source: [src/blocks/standoff-editor-block.ts:696](../speedy-ts/src/blocks/standoff-editor-block.ts). Kind: `callback`. Context: `StandoffEditorBlock.getBlockSchemas`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onInit: (p: BlockProperty) => {
                        const manager = p.block.manager as UniverseBlock;
                        manager.animateSineWave(p);
                    }
```

### blocks-standoff-editor-block-callback-19

Source: [src/blocks/standoff-editor-block.ts:713](../speedy-ts/src/blocks/standoff-editor-block.ts). Kind: `callback`. Context: `StandoffEditorBlock.getBlockSchemas`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onInit: (p: BlockProperty) => {
                        const url = p.value || (p.value = prompt("Background image url: ") || "");
                        if (!url) return;
                        const panel = p.block.container;
                        setElement(panel, {
                            style: {
                                "background-size": "cover",
                                "background": "url(" + url + ") no-repeat center center fixed"
                            }
                        });
                    }
```

### blocks-standoff-editor-block-callback-20

Source: [src/blocks/standoff-editor-block.ts:730](../speedy-ts/src/blocks/standoff-editor-block.ts). Kind: `callback`. Context: `StandoffEditorBlock.getBlockSchemas`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onInit: (p: BlockProperty) => {
                        setElement(p.block.container, {
                            style: {
                                "background-color": p.value
                            }
                        });
                    }
```

### blocks-standoff-editor-block-callback-21

Source: [src/blocks/standoff-editor-block.ts:743](../speedy-ts/src/blocks/standoff-editor-block.ts). Kind: `callback`. Context: `StandoffEditorBlock.getBlockSchemas`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onInit: (p: BlockProperty) => {
                        setElement(p.block.container, {
                            style: {
                                "color": p.value
                            }
                        });
                    }
```

### Named implementation index

This index intentionally includes helper methods as well as handlers. Resolve named calls in the entries above here; methods with no caller/binding are **not** automatically live commands. Shared support methods may be implemented in another indexed file (notably AbstractBlock, DocumentBlock, UniverseBlock, StandoffProperty and SVG helpers).

| Context | Callable | Source |
| --- | --- | --- |
|  | `groupBy` | [src/blocks/standoff-editor-block.ts:16](../speedy-ts/src/blocks/standoff-editor-block.ts) |
| StandoffEditorBlock | `getStandoffSchemas` | [src/blocks/standoff-editor-block.ts:124](../speedy-ts/src/blocks/standoff-editor-block.ts) |
| StandoffEditorBlock | `getBlockBuilder` | [src/blocks/standoff-editor-block.ts:496](../speedy-ts/src/blocks/standoff-editor-block.ts) |
| StandoffEditorBlock | `renderHighlight` | [src/blocks/standoff-editor-block.ts:511](../speedy-ts/src/blocks/standoff-editor-block.ts) |
| StandoffEditorBlock | `renderRectangle` | [src/blocks/standoff-editor-block.ts:521](../speedy-ts/src/blocks/standoff-editor-block.ts) |
| StandoffEditorBlock | `renderSpiky` | [src/blocks/standoff-editor-block.ts:532](../speedy-ts/src/blocks/standoff-editor-block.ts) |
| StandoffEditorBlock | `getBlockSchemas` | [src/blocks/standoff-editor-block.ts:543](../speedy-ts/src/blocks/standoff-editor-block.ts) |
| StandoffEditorBlock | `addMode` | [src/blocks/standoff-editor-block.ts:754](../speedy-ts/src/blocks/standoff-editor-block.ts) |
| StandoffEditorBlock | `replace` | [src/blocks/standoff-editor-block.ts:757](../speedy-ts/src/blocks/standoff-editor-block.ts) |
| StandoffEditorBlock | `getMapOfActiveInputEvents` | [src/blocks/standoff-editor-block.ts:773](../speedy-ts/src/blocks/standoff-editor-block.ts) |
| StandoffEditorBlock | `removeMode` | [src/blocks/standoff-editor-block.ts:792](../speedy-ts/src/blocks/standoff-editor-block.ts) |
| StandoffEditorBlock | `setSchemas` | [src/blocks/standoff-editor-block.ts:798](../speedy-ts/src/blocks/standoff-editor-block.ts) |
| StandoffEditorBlock | `removeFocus` | [src/blocks/standoff-editor-block.ts:801](../speedy-ts/src/blocks/standoff-editor-block.ts) |
| StandoffEditorBlock | `selectFontColour` | [src/blocks/standoff-editor-block.ts:804](../speedy-ts/src/blocks/standoff-editor-block.ts) |
| StandoffEditorBlock | `selectBackgroundColour` | [src/blocks/standoff-editor-block.ts:815](../speedy-ts/src/blocks/standoff-editor-block.ts) |
| StandoffEditorBlock | `getWordsFromText` | [src/blocks/standoff-editor-block.ts:826](../speedy-ts/src/blocks/standoff-editor-block.ts) |
| StandoffEditorBlock | `getWordAtIndex` | [src/blocks/standoff-editor-block.ts:850](../speedy-ts/src/blocks/standoff-editor-block.ts) |
| StandoffEditorBlock | `getSentencesFromText` | [src/blocks/standoff-editor-block.ts:856](../speedy-ts/src/blocks/standoff-editor-block.ts) |
| StandoffEditorBlock | `unsetMarker` | [src/blocks/standoff-editor-block.ts:866](../speedy-ts/src/blocks/standoff-editor-block.ts) |
| StandoffEditorBlock | `renderUnderlines` | [src/blocks/standoff-editor-block.ts:872](../speedy-ts/src/blocks/standoff-editor-block.ts) |
| StandoffEditorBlock | `renderRainbow` | [src/blocks/standoff-editor-block.ts:896](../speedy-ts/src/blocks/standoff-editor-block.ts) |
| StandoffEditorBlock | `setMarker` | [src/blocks/standoff-editor-block.ts:919](../speedy-ts/src/blocks/standoff-editor-block.ts) |
| StandoffEditorBlock | `getLastCell` | [src/blocks/standoff-editor-block.ts:942](../speedy-ts/src/blocks/standoff-editor-block.ts) |
| StandoffEditorBlock | `createEmptyBlock` | [src/blocks/standoff-editor-block.ts:946](../speedy-ts/src/blocks/standoff-editor-block.ts) |
| StandoffEditorBlock | `getAllTextMatches` | [src/blocks/standoff-editor-block.ts:954](../speedy-ts/src/blocks/standoff-editor-block.ts) |
| StandoffEditorBlock | `createLineBreakCell` | [src/blocks/standoff-editor-block.ts:965](../speedy-ts/src/blocks/standoff-editor-block.ts) |
| StandoffEditorBlock | `addToInputBuffer` | [src/blocks/standoff-editor-block.ts:972](../speedy-ts/src/blocks/standoff-editor-block.ts) |
| StandoffEditorBlock | `getCellFromNode` | [src/blocks/standoff-editor-block.ts:980](../speedy-ts/src/blocks/standoff-editor-block.ts) |
| StandoffEditorBlock | `getBlockPosition` | [src/blocks/standoff-editor-block.ts:990](../speedy-ts/src/blocks/standoff-editor-block.ts) |
| StandoffEditorBlock | `getCaret` | [src/blocks/standoff-editor-block.ts:998](../speedy-ts/src/blocks/standoff-editor-block.ts) |
| StandoffEditorBlock | `getEnclosingProperties` | [src/blocks/standoff-editor-block.ts:1014](../speedy-ts/src/blocks/standoff-editor-block.ts) |
| StandoffEditorBlock | `getEnclosingPropertiesByIndex` | [src/blocks/standoff-editor-block.ts:1021](../speedy-ts/src/blocks/standoff-editor-block.ts) |
| StandoffEditorBlock | `getEnclosingPropertiesBetweenIndexes` | [src/blocks/standoff-editor-block.ts:1030](../speedy-ts/src/blocks/standoff-editor-block.ts) |
| StandoffEditorBlock | `clearSelection` | [src/blocks/standoff-editor-block.ts:1044](../speedy-ts/src/blocks/standoff-editor-block.ts) |
| StandoffEditorBlock | `isEmpty` | [src/blocks/standoff-editor-block.ts:1059](../speedy-ts/src/blocks/standoff-editor-block.ts) |
| StandoffEditorBlock | `getSelection` | [src/blocks/standoff-editor-block.ts:1064](../speedy-ts/src/blocks/standoff-editor-block.ts) |
| StandoffEditorBlock | `insertCharacterAtCaret` | [src/blocks/standoff-editor-block.ts:1071](../speedy-ts/src/blocks/standoff-editor-block.ts) |
| StandoffEditorBlock | `addStandoffProperties` | [src/blocks/standoff-editor-block.ts:1083](../speedy-ts/src/blocks/standoff-editor-block.ts) |
| StandoffEditorBlock | `applyStylingAndRenderingToNewCells` | [src/blocks/standoff-editor-block.ts:1086](../speedy-ts/src/blocks/standoff-editor-block.ts) |
| StandoffEditorBlock | `renderProperties` | [src/blocks/standoff-editor-block.ts:1096](../speedy-ts/src/blocks/standoff-editor-block.ts) |
| StandoffEditorBlock | `getPlatformKey` | [src/blocks/standoff-editor-block.ts:1106](../speedy-ts/src/blocks/standoff-editor-block.ts) |
| StandoffEditorBlock | `addEOL` | [src/blocks/standoff-editor-block.ts:1109](../speedy-ts/src/blocks/standoff-editor-block.ts) |
| StandoffEditorBlock | `triggerBeforeChange` | [src/blocks/standoff-editor-block.ts:1122](../speedy-ts/src/blocks/standoff-editor-block.ts) |
| StandoffEditorBlock | `insertTextAtIndex` | [src/blocks/standoff-editor-block.ts:1127](../speedy-ts/src/blocks/standoff-editor-block.ts) |
| StandoffEditorBlock | `publishOnTextChanged` | [src/blocks/standoff-editor-block.ts:1161](../speedy-ts/src/blocks/standoff-editor-block.ts) |
| StandoffEditorBlock | `insertElementsBefore` | [src/blocks/standoff-editor-block.ts:1167](../speedy-ts/src/blocks/standoff-editor-block.ts) |
| StandoffEditorBlock | `reindexCells` | [src/blocks/standoff-editor-block.ts:1172](../speedy-ts/src/blocks/standoff-editor-block.ts) |
| StandoffEditorBlock | `insertIntoCellArrayBefore` | [src/blocks/standoff-editor-block.ts:1175](../speedy-ts/src/blocks/standoff-editor-block.ts) |
| StandoffEditorBlock | `knitCells` | [src/blocks/standoff-editor-block.ts:1179](../speedy-ts/src/blocks/standoff-editor-block.ts) |
| StandoffEditorBlock | `unbind` | [src/blocks/standoff-editor-block.ts:1194](../speedy-ts/src/blocks/standoff-editor-block.ts) |
| StandoffEditorBlock | `serialize` | [src/blocks/standoff-editor-block.ts:1200](../speedy-ts/src/blocks/standoff-editor-block.ts) |
| StandoffEditorBlock | `updateText` | [src/blocks/standoff-editor-block.ts:1221](../speedy-ts/src/blocks/standoff-editor-block.ts) |
| StandoffEditorBlock | `getText` | [src/blocks/standoff-editor-block.ts:1224](../speedy-ts/src/blocks/standoff-editor-block.ts) |
| StandoffEditorBlock | `applyStandoffPropertyStyling` | [src/blocks/standoff-editor-block.ts:1227](../speedy-ts/src/blocks/standoff-editor-block.ts) |
| StandoffEditorBlock | `deserialize` | [src/blocks/standoff-editor-block.ts:1232](../speedy-ts/src/blocks/standoff-editor-block.ts) |
| StandoffEditorBlock | `addMonitor` | [src/blocks/standoff-editor-block.ts:1236](../speedy-ts/src/blocks/standoff-editor-block.ts) |
| StandoffEditorBlock | `updateMonitors` | [src/blocks/standoff-editor-block.ts:1239](../speedy-ts/src/blocks/standoff-editor-block.ts) |
| StandoffEditorBlock | `addStandoffPropertiesDto` | [src/blocks/standoff-editor-block.ts:1247](../speedy-ts/src/blocks/standoff-editor-block.ts) |
| StandoffEditorBlock | `bind` | [src/blocks/standoff-editor-block.ts:1264](../speedy-ts/src/blocks/standoff-editor-block.ts) |
| StandoffEditorBlock | `getCellAtIndex` | [src/blocks/standoff-editor-block.ts:1320](../speedy-ts/src/blocks/standoff-editor-block.ts) |
| StandoffEditorBlock | `chainCellsTogether` | [src/blocks/standoff-editor-block.ts:1326](../speedy-ts/src/blocks/standoff-editor-block.ts) |
| StandoffEditorBlock | `toCells` | [src/blocks/standoff-editor-block.ts:1343](../speedy-ts/src/blocks/standoff-editor-block.ts) |
| StandoffEditorBlock | `handleArrowUp` | [src/blocks/standoff-editor-block.ts:1362](../speedy-ts/src/blocks/standoff-editor-block.ts) |
| StandoffEditorBlock | `handleArrowDown` | [src/blocks/standoff-editor-block.ts:1393](../speedy-ts/src/blocks/standoff-editor-block.ts) |
| StandoffEditorBlock | `handleArrowRight` | [src/blocks/standoff-editor-block.ts:1429](../speedy-ts/src/blocks/standoff-editor-block.ts) |
| StandoffEditorBlock | `handleArrowLeft` | [src/blocks/standoff-editor-block.ts:1442](../speedy-ts/src/blocks/standoff-editor-block.ts) |
| StandoffEditorBlock | `getCellAbove` | [src/blocks/standoff-editor-block.ts:1453](../speedy-ts/src/blocks/standoff-editor-block.ts) |
| StandoffEditorBlock | `getCellBelow` | [src/blocks/standoff-editor-block.ts:1462](../speedy-ts/src/blocks/standoff-editor-block.ts) |
| StandoffEditorBlock | `moveCaretStart` | [src/blocks/standoff-editor-block.ts:1472](../speedy-ts/src/blocks/standoff-editor-block.ts) |
| StandoffEditorBlock | `moveCaretEnd` | [src/blocks/standoff-editor-block.ts:1475](../speedy-ts/src/blocks/standoff-editor-block.ts) |
| StandoffEditorBlock | `setCaret` | [src/blocks/standoff-editor-block.ts:1479](../speedy-ts/src/blocks/standoff-editor-block.ts) |
| StandoffEditorBlock | `shiftPropertyBoundaries` | [src/blocks/standoff-editor-block.ts:1508](../speedy-ts/src/blocks/standoff-editor-block.ts) |
| StandoffEditorBlock | `shiftPropertyEndNodesLeft` | [src/blocks/standoff-editor-block.ts:1512](../speedy-ts/src/blocks/standoff-editor-block.ts) |
| StandoffEditorBlock | `shiftPropertyStartNodesRight` | [src/blocks/standoff-editor-block.ts:1530](../speedy-ts/src/blocks/standoff-editor-block.ts) |
| StandoffEditorBlock | `unknit` | [src/blocks/standoff-editor-block.ts:1548](../speedy-ts/src/blocks/standoff-editor-block.ts) |
| StandoffEditorBlock | `updateView` | [src/blocks/standoff-editor-block.ts:1554](../speedy-ts/src/blocks/standoff-editor-block.ts) |
| StandoffEditorBlock | `updateRenderers` | [src/blocks/standoff-editor-block.ts:1563](../speedy-ts/src/blocks/standoff-editor-block.ts) |
| StandoffEditorBlock | `batch` | [src/blocks/standoff-editor-block.ts:1575](../speedy-ts/src/blocks/standoff-editor-block.ts) |
| StandoffEditorBlock | `calculateCellOffsets` | [src/blocks/standoff-editor-block.ts:1586](../speedy-ts/src/blocks/standoff-editor-block.ts) |
| StandoffEditorBlock | `destroy` | [src/blocks/standoff-editor-block.ts:1617](../speedy-ts/src/blocks/standoff-editor-block.ts) |
| StandoffEditorBlock | `removeStandoffPropertiesByType` | [src/blocks/standoff-editor-block.ts:1627](../speedy-ts/src/blocks/standoff-editor-block.ts) |
| StandoffEditorBlock | `removeCellsAtIndex` | [src/blocks/standoff-editor-block.ts:1632](../speedy-ts/src/blocks/standoff-editor-block.ts) |
| StandoffEditorBlock | `calculateRows` | [src/blocks/standoff-editor-block.ts:1640](../speedy-ts/src/blocks/standoff-editor-block.ts) |
| StandoffEditorBlock | `getRows` | [src/blocks/standoff-editor-block.ts:1661](../speedy-ts/src/blocks/standoff-editor-block.ts) |
| StandoffEditorBlock | `getClosestRowOfCellsByOffset` | [src/blocks/standoff-editor-block.ts:1667](../speedy-ts/src/blocks/standoff-editor-block.ts) |
| StandoffEditorBlock | `getCellClosestByOffsetX` | [src/blocks/standoff-editor-block.ts:1683](../speedy-ts/src/blocks/standoff-editor-block.ts) |
| StandoffEditorBlock | `getCellInRow` | [src/blocks/standoff-editor-block.ts:1695](../speedy-ts/src/blocks/standoff-editor-block.ts) |
| StandoffEditorBlock | `setCarotByOffsetX` | [src/blocks/standoff-editor-block.ts:1721](../speedy-ts/src/blocks/standoff-editor-block.ts) |
| StandoffEditorBlock | `removeEOL` | [src/blocks/standoff-editor-block.ts:1731](../speedy-ts/src/blocks/standoff-editor-block.ts) |
| StandoffEditorBlock | `removeCellAtIndex` | [src/blocks/standoff-editor-block.ts:1738](../speedy-ts/src/blocks/standoff-editor-block.ts) |
| StandoffEditorBlock | `getCells` | [src/blocks/standoff-editor-block.ts:1777](../speedy-ts/src/blocks/standoff-editor-block.ts) |
| StandoffEditorBlock | `styleProperty` | [src/blocks/standoff-editor-block.ts:1789](../speedy-ts/src/blocks/standoff-editor-block.ts) |
| StandoffEditorBlock | `getTextNode` | [src/blocks/standoff-editor-block.ts:1792](../speedy-ts/src/blocks/standoff-editor-block.ts) |
| StandoffEditorBlock | `setSelection` | [src/blocks/standoff-editor-block.ts:1803](../speedy-ts/src/blocks/standoff-editor-block.ts) |
| StandoffEditorBlock | `toggleStandoffPropertyMode` | [src/blocks/standoff-editor-block.ts:1817](../speedy-ts/src/blocks/standoff-editor-block.ts) |
| StandoffEditorBlock | `createStandoffProperty` | [src/blocks/standoff-editor-block.ts:1820](../speedy-ts/src/blocks/standoff-editor-block.ts) |
| StandoffEditorBlock | `createBlockProperty` | [src/blocks/standoff-editor-block.ts:1835](../speedy-ts/src/blocks/standoff-editor-block.ts) |
| StandoffEditorBlock | `syncPropertyEndToText` | [src/blocks/standoff-editor-block.ts:1847](../speedy-ts/src/blocks/standoff-editor-block.ts) |
| StandoffEditorBlock | `unsynchPropertyEndToText` | [src/blocks/standoff-editor-block.ts:1850](../speedy-ts/src/blocks/standoff-editor-block.ts) |
|  | `log` | [src/blocks/standoff-editor-block.ts:1856](../speedy-ts/src/blocks/standoff-editor-block.ts) |

### Commented/disabled evidence

These are source comments, not installed listeners. They also include relevant intent notes and TODO context. Use the addendum's reachability findings before treating an old commented design as a parity requirement.

- [src/blocks/standoff-editor-block.ts:47](../speedy-ts/src/blocks/standoff-editor-block.ts) — /**      * Not unlike a StandoffProperty, a Selection denotes a highlighted range of text. Unlike a StandoffProperty,      * it is not intended to be committed to the document, but represents a transient intention.      *       * A Selection could be a background-color highlight that is applied as a CSS style to each cell in the      * range, or it could be a collection of one or more SVG lines generated to match the shape of the text range.      */
- [src/blocks/standoff-editor-block.ts:55](../speedy-ts/src/blocks/standoff-editor-block.ts) — /**      * An Overlay is a named DIV container for storing generated elements - such as SVG underlines - which are meant      * to be overlaid (like a layer) on top of the text underneath. An Overlay 'container' should be absolutely      * positioned to be aligned to the top-left of the Block 'container' element, and generated elements inside the Overlay      * 'container' should be absolutely positioned. Such generated elements will be drawn/undrawn when the StandoffProperty      * is rendered, and when anything affects the alignment of cells in those properties, such as adding or removing text.      */
- [src/blocks/standoff-editor-block.ts:774](../speedy-ts/src/blocks/standoff-editor-block.ts) — /**          * Events should be grouped by modes. The modes at the top of the modes array are higher in priority.          * If the same event trigger appears in the list more than once, the mode with the highest priority takes precedence          * and the event is dispatched to THAT handler.          */
- [src/blocks/standoff-editor-block.ts:1039](../speedy-ts/src/blocks/standoff-editor-block.ts) — // clearSelectionMode(selection: ISelection) {
- [src/blocks/standoff-editor-block.ts:1045](../speedy-ts/src/blocks/standoff-editor-block.ts) — // ref: https://stackoverflow.com/questions/3169786/clear-text-selection-with-javascript
- [src/blocks/standoff-editor-block.ts:1057](../speedy-ts/src/blocks/standoff-editor-block.ts) — //this.clearSelectionMode();
- [src/blocks/standoff-editor-block.ts:1257](../speedy-ts/src/blocks/standoff-editor-block.ts) — // Need to handle this properly ... can't just return early in a map().
- [src/blocks/standoff-editor-block.ts:1282](../speedy-ts/src/blocks/standoff-editor-block.ts) — // Need to handle this properly ... can't just return early in a map().
- [src/blocks/standoff-editor-block.ts:1292](../speedy-ts/src/blocks/standoff-editor-block.ts) — // Need to handle this properly ... can't just return early in a map().
- [src/blocks/standoff-editor-block.ts:1387](../speedy-ts/src/blocks/standoff-editor-block.ts) — //console.log("handleArrowUp", { previousRectBottom: previousRect.bottom, h });
- [src/blocks/standoff-editor-block.ts:1480](../speedy-ts/src/blocks/standoff-editor-block.ts) — /**          * Might want to investigate setting the caret by absolutely positioning an SVG ...          */
- [src/blocks/standoff-editor-block.ts:1483](../speedy-ts/src/blocks/standoff-editor-block.ts) — //console.log("setCaret", { index, offset });
- [src/blocks/standoff-editor-block.ts:1573](../speedy-ts/src/blocks/standoff-editor-block.ts) — //console.log("updateRenderers", { block, toUpdate, toDelete })

## src/blocks/sticky-tab-block.ts

Source: [src/blocks/sticky-tab-block.ts:1](../speedy-ts/src/blocks/sticky-tab-block.ts). SHA-256: `65461e87cfc23eb7b5a06385272935925a71c522a29fe467eb7d25da8d0c5623`.

Migration family/status: Sticky-tab commands and activation; shared tab view is partial.

Classes: `StickyTabRowBlock` (extends AbstractBlock); `StickyTabBlock` (extends AbstractBlock).

Binding installation/override sites (first source line; inspect surrounding constructor/factory):

- [src/blocks/sticky-tab-block.ts:30](../speedy-ts/src/blocks/sticky-tab-block.ts) — `StickyTabRowBlock`: `this.inputEvents = this.getInputEvents()`
- [src/blocks/sticky-tab-block.ts:161](../speedy-ts/src/blocks/sticky-tab-block.ts) — `StickyTabBlock`: `this.inputEvents = this.getInputEvents()`

### blocks-sticky-tab-block-listener-01

Source: [src/blocks/sticky-tab-block.ts:270](../speedy-ts/src/blocks/sticky-tab-block.ts). Kind: `listener`. Context: `StickyTabBlock.renderTag`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
container.addEventListener("click", (e) => {
            e.preventDefault();
            const row = self.getRow();
            const active = self.metadata.active;
            row.hideAllTabPanels();
            if (!active) {
                self.setActive();
            }
        })
```

### Named implementation index

This index intentionally includes helper methods as well as handlers. Resolve named calls in the entries above here; methods with no caller/binding are **not** automatically live commands. Shared support methods may be implemented in another indexed file (notably AbstractBlock, DocumentBlock, UniverseBlock, StandoffProperty and SVG helpers).

| Context | Callable | Source |
| --- | --- | --- |
| StickyTabRowBlock | `getBlockSchemas` | [src/blocks/sticky-tab-block.ts:34](../speedy-ts/src/blocks/sticky-tab-block.ts) |
| StickyTabRowBlock | `getNewTabColour` | [src/blocks/sticky-tab-block.ts:39](../speedy-ts/src/blocks/sticky-tab-block.ts) |
| StickyTabRowBlock | `createNewTab` | [src/blocks/sticky-tab-block.ts:44](../speedy-ts/src/blocks/sticky-tab-block.ts) |
| StickyTabRowBlock | `addTab` | [src/blocks/sticky-tab-block.ts:71](../speedy-ts/src/blocks/sticky-tab-block.ts) |
| StickyTabRowBlock | `deleteTab` | [src/blocks/sticky-tab-block.ts:77](../speedy-ts/src/blocks/sticky-tab-block.ts) |
| StickyTabRowBlock | `getBlockBuilder` | [src/blocks/sticky-tab-block.ts:81](../speedy-ts/src/blocks/sticky-tab-block.ts) |
| StickyTabRowBlock | `hideAllTabPanels` | [src/blocks/sticky-tab-block.ts:96](../speedy-ts/src/blocks/sticky-tab-block.ts) |
| StickyTabRowBlock | `getInputEvents` | [src/blocks/sticky-tab-block.ts:99](../speedy-ts/src/blocks/sticky-tab-block.ts) |
| StickyTabRowBlock | `build` | [src/blocks/sticky-tab-block.ts:104](../speedy-ts/src/blocks/sticky-tab-block.ts) |
| StickyTabRowBlock | `renderTabLabels` | [src/blocks/sticky-tab-block.ts:109](../speedy-ts/src/blocks/sticky-tab-block.ts) |
| StickyTabRowBlock | `bind` | [src/blocks/sticky-tab-block.ts:123](../speedy-ts/src/blocks/sticky-tab-block.ts) |
| StickyTabRowBlock | `serialize` | [src/blocks/sticky-tab-block.ts:130](../speedy-ts/src/blocks/sticky-tab-block.ts) |
| StickyTabRowBlock | `deserialize` | [src/blocks/sticky-tab-block.ts:139](../speedy-ts/src/blocks/sticky-tab-block.ts) |
| StickyTabBlock | `toggleActiveState` | [src/blocks/sticky-tab-block.ts:164](../speedy-ts/src/blocks/sticky-tab-block.ts) |
| StickyTabBlock | `updatePanelVisibility` | [src/blocks/sticky-tab-block.ts:168](../speedy-ts/src/blocks/sticky-tab-block.ts) |
| StickyTabBlock | `showPanel` | [src/blocks/sticky-tab-block.ts:175](../speedy-ts/src/blocks/sticky-tab-block.ts) |
| StickyTabBlock | `hidePanel` | [src/blocks/sticky-tab-block.ts:185](../speedy-ts/src/blocks/sticky-tab-block.ts) |
| StickyTabBlock | `getBlockSchemas` | [src/blocks/sticky-tab-block.ts:193](../speedy-ts/src/blocks/sticky-tab-block.ts) |
| StickyTabBlock | `getBlockBuilder` | [src/blocks/sticky-tab-block.ts:198](../speedy-ts/src/blocks/sticky-tab-block.ts) |
| StickyTabBlock | `getInputEvents` | [src/blocks/sticky-tab-block.ts:212](../speedy-ts/src/blocks/sticky-tab-block.ts) |
| StickyTabBlock | `deleteTab` | [src/blocks/sticky-tab-block.ts:217](../speedy-ts/src/blocks/sticky-tab-block.ts) |
| StickyTabBlock | `setName` | [src/blocks/sticky-tab-block.ts:221](../speedy-ts/src/blocks/sticky-tab-block.ts) |
| StickyTabBlock | `extract` | [src/blocks/sticky-tab-block.ts:225](../speedy-ts/src/blocks/sticky-tab-block.ts) |
| StickyTabBlock | `build` | [src/blocks/sticky-tab-block.ts:246](../speedy-ts/src/blocks/sticky-tab-block.ts) |
| StickyTabBlock | `update` | [src/blocks/sticky-tab-block.ts:250](../speedy-ts/src/blocks/sticky-tab-block.ts) |
| StickyTabBlock | `renderTag` | [src/blocks/sticky-tab-block.ts:253](../speedy-ts/src/blocks/sticky-tab-block.ts) |
| StickyTabBlock | `setActive` | [src/blocks/sticky-tab-block.ts:281](../speedy-ts/src/blocks/sticky-tab-block.ts) |
| StickyTabBlock | `setInactive` | [src/blocks/sticky-tab-block.ts:285](../speedy-ts/src/blocks/sticky-tab-block.ts) |
| StickyTabBlock | `getRow` | [src/blocks/sticky-tab-block.ts:289](../speedy-ts/src/blocks/sticky-tab-block.ts) |
| StickyTabBlock | `bind` | [src/blocks/sticky-tab-block.ts:292](../speedy-ts/src/blocks/sticky-tab-block.ts) |
| StickyTabBlock | `serialize` | [src/blocks/sticky-tab-block.ts:299](../speedy-ts/src/blocks/sticky-tab-block.ts) |
| StickyTabBlock | `deserialize` | [src/blocks/sticky-tab-block.ts:308](../speedy-ts/src/blocks/sticky-tab-block.ts) |

## src/blocks/surface-block.ts

Source: [src/blocks/surface-block.ts:1](../speedy-ts/src/blocks/surface-block.ts). SHA-256: `11908643a9529bdcc332d0d489bf1e1fdb2bac1037b527d7593836564e69f6f9`.

Migration family/status: Surface/Side controller; generic view only, side double-click toggle unported.

Classes: `SurfaceBlock` (extends AbstractBlock); `SideBlock` (extends AbstractBlock).

### blocks-surface-block-binding-01

Source: [src/blocks/surface-block.ts:69](../speedy-ts/src/blocks/surface-block.ts). Kind: `binding`. Context: `SideBlock.getInputEvents`.

Route: the owning Block's binding list, subject to actual factory installation, mode/trigger matching and origin-to-owner dispatch. Destination/status: the file's migration family above; unresolved until individually qualified.

```tsx
{
                mode: "default",
                trigger: {
                    source: InputEventSource.Mouse,
                    match: "click"
                },
                action: {
                    name: "",
                    description: "",
                    handler: async (args: IBindingHandlerArgs) => {
                        const block = args.block as SideBlock;
                        block.toggle();
                    }
                }
            }
```

### blocks-surface-block-listener-01

Source: [src/blocks/surface-block.ts:95](../speedy-ts/src/blocks/surface-block.ts). Kind: `listener`. Context: `SideBlock.getBlockBuilder`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
block.container.addEventListener("dblclick", (e) => {
                    e.preventDefault();
                    block.toggle();
                })
```

### Named implementation index

This index intentionally includes helper methods as well as handlers. Resolve named calls in the entries above here; methods with no caller/binding are **not** automatically live commands. Shared support methods may be implemented in another indexed file (notably AbstractBlock, DocumentBlock, UniverseBlock, StandoffProperty and SVG helpers).

| Context | Callable | Source |
| --- | --- | --- |
| SurfaceBlock | `getActiveSide` | [src/blocks/surface-block.ts:14](../speedy-ts/src/blocks/surface-block.ts) |
| SurfaceBlock | `getInactiveSide` | [src/blocks/surface-block.ts:17](../speedy-ts/src/blocks/surface-block.ts) |
| SurfaceBlock | `toggleActiveSides` | [src/blocks/surface-block.ts:20](../speedy-ts/src/blocks/surface-block.ts) |
| SurfaceBlock | `updateSides` | [src/blocks/surface-block.ts:27](../speedy-ts/src/blocks/surface-block.ts) |
| SurfaceBlock | `getBlockBuilder` | [src/blocks/surface-block.ts:30](../speedy-ts/src/blocks/surface-block.ts) |
| SurfaceBlock | `serialize` | [src/blocks/surface-block.ts:45](../speedy-ts/src/blocks/surface-block.ts) |
| SurfaceBlock | `deserialize` | [src/blocks/surface-block.ts:54](../speedy-ts/src/blocks/surface-block.ts) |
| SideBlock | `getInputEvents` | [src/blocks/surface-block.ts:66](../speedy-ts/src/blocks/surface-block.ts) |
| SideBlock | `getBlockBuilder` | [src/blocks/surface-block.ts:86](../speedy-ts/src/blocks/surface-block.ts) |
| SideBlock | `toggle` | [src/blocks/surface-block.ts:104](../speedy-ts/src/blocks/surface-block.ts) |
| SideBlock | `setInactive` | [src/blocks/surface-block.ts:108](../speedy-ts/src/blocks/surface-block.ts) |
| SideBlock | `setActive` | [src/blocks/surface-block.ts:111](../speedy-ts/src/blocks/surface-block.ts) |
| SideBlock | `update` | [src/blocks/surface-block.ts:114](../speedy-ts/src/blocks/surface-block.ts) |
| SideBlock | `serialize` | [src/blocks/surface-block.ts:122](../speedy-ts/src/blocks/surface-block.ts) |
| SideBlock | `deserialize` | [src/blocks/surface-block.ts:131](../speedy-ts/src/blocks/surface-block.ts) |

### Commented/disabled evidence

These are source comments, not installed listeners. They also include relevant intent notes and TODO context. Use the addendum's reachability findings before treating an old commented design as a parity requirement.

- [src/blocks/surface-block.ts:64](../speedy-ts/src/blocks/surface-block.ts) — //this.inputEvents = this.getInputEvents();

## src/blocks/tables-blocks.ts

Source: [src/blocks/tables-blocks.ts:1](../speedy-ts/src/blocks/tables-blocks.ts). SHA-256: `397301a7dd5adaad4316db49fc9216ceef1ea9ebbe7a8ffec7e6365b51a2a1ed`.

Migration family/status: Table commands and inherited navigation; layout rendering only.

Classes: `TableBlock` (extends AbstractBlock); `TableRowBlock` (extends AbstractBlock); `TableCellBlock` (extends AbstractBlock).

### blocks-tables-blocks-listener-01

Source: [src/blocks/tables-blocks.ts:31](../speedy-ts/src/blocks/tables-blocks.ts). Kind: `listener`. Context: `TableBlock.attachEventHandlers`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
this.container.addEventListener("click", this.handleClick.bind(this))
```

### blocks-tables-blocks-listener-02

Source: [src/blocks/tables-blocks.ts:78](../speedy-ts/src/blocks/tables-blocks.ts). Kind: `listener`. Context: `TableRowBlock.attachEventHandlers`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
this.container.addEventListener("click", this.handleClick.bind(this))
```

### blocks-tables-blocks-listener-03

Source: [src/blocks/tables-blocks.ts:132](../speedy-ts/src/blocks/tables-blocks.ts). Kind: `listener`. Context: `TableCellBlock.attachEventHandlers`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
this.container.addEventListener("click", this.handleClick.bind(this))
```

### Named implementation index

This index intentionally includes helper methods as well as handlers. Resolve named calls in the entries above here; methods with no caller/binding are **not** automatically live commands. Shared support methods may be implemented in another indexed file (notably AbstractBlock, DocumentBlock, UniverseBlock, StandoffProperty and SVG helpers).

| Context | Callable | Source |
| --- | --- | --- |
| TableBlock | `getBlockBuilder` | [src/blocks/tables-blocks.ts:17](../speedy-ts/src/blocks/tables-blocks.ts) |
| TableBlock | `attachEventHandlers` | [src/blocks/tables-blocks.ts:30](../speedy-ts/src/blocks/tables-blocks.ts) |
| TableBlock | `handleClick` | [src/blocks/tables-blocks.ts:33](../speedy-ts/src/blocks/tables-blocks.ts) |
| TableBlock | `serialize` | [src/blocks/tables-blocks.ts:38](../speedy-ts/src/blocks/tables-blocks.ts) |
| TableBlock | `deserialize` | [src/blocks/tables-blocks.ts:47](../speedy-ts/src/blocks/tables-blocks.ts) |
| TableRowBlock | `getBlockBuilder` | [src/blocks/tables-blocks.ts:64](../speedy-ts/src/blocks/tables-blocks.ts) |
| TableRowBlock | `attachEventHandlers` | [src/blocks/tables-blocks.ts:77](../speedy-ts/src/blocks/tables-blocks.ts) |
| TableRowBlock | `handleClick` | [src/blocks/tables-blocks.ts:80](../speedy-ts/src/blocks/tables-blocks.ts) |
| TableRowBlock | `setName` | [src/blocks/tables-blocks.ts:85](../speedy-ts/src/blocks/tables-blocks.ts) |
| TableRowBlock | `serialize` | [src/blocks/tables-blocks.ts:88](../speedy-ts/src/blocks/tables-blocks.ts) |
| TableRowBlock | `deserialize` | [src/blocks/tables-blocks.ts:97](../speedy-ts/src/blocks/tables-blocks.ts) |
| TableRowBlock | `destroy` | [src/blocks/tables-blocks.ts:100](../speedy-ts/src/blocks/tables-blocks.ts) |
| TableCellBlock | `getBlockBuilder` | [src/blocks/tables-blocks.ts:118](../speedy-ts/src/blocks/tables-blocks.ts) |
| TableCellBlock | `attachEventHandlers` | [src/blocks/tables-blocks.ts:131](../speedy-ts/src/blocks/tables-blocks.ts) |
| TableCellBlock | `handleClick` | [src/blocks/tables-blocks.ts:134](../speedy-ts/src/blocks/tables-blocks.ts) |
| TableCellBlock | `setName` | [src/blocks/tables-blocks.ts:139](../speedy-ts/src/blocks/tables-blocks.ts) |
| TableCellBlock | `serialize` | [src/blocks/tables-blocks.ts:142](../speedy-ts/src/blocks/tables-blocks.ts) |
| TableCellBlock | `deserialize` | [src/blocks/tables-blocks.ts:151](../speedy-ts/src/blocks/tables-blocks.ts) |
| TableCellBlock | `destroy` | [src/blocks/tables-blocks.ts:154](../speedy-ts/src/blocks/tables-blocks.ts) |

## src/blocks/tabs-block.ts

Source: [src/blocks/tabs-block.ts:1](../speedy-ts/src/blocks/tabs-block.ts). SHA-256: `e2dc5dde413225cffba083481c72de94316e165dfdb328fa8b6f071fc7344663`.

Migration family/status: Tab controller and commands; activation is partial, full menu/structural behavior absent.

Classes: `TabRowBlock` (extends AbstractBlock); `TabBlock` (extends AbstractBlock).

Binding installation/override sites (first source line; inspect surrounding constructor/factory):

- [src/blocks/tabs-block.ts:206](../speedy-ts/src/blocks/tabs-block.ts) — `TabBlock`: `this.inputEvents = this.getTabBlockEvents()`

### blocks-tabs-block-listener-01

Source: [src/blocks/tabs-block.ts:123](../speedy-ts/src/blocks/tabs-block.ts). Kind: `listener`. Context: `TabRowBlock.renderLabels`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
label.addEventListener("click", (e) => {
                e.preventDefault();
                self.setTabActive(tab);
                tab.setCustomFocus();
            })
```

### blocks-tabs-block-event-property-01

Source: [src/blocks/tabs-block.ts:135](../speedy-ts/src/blocks/tabs-block.ts). Kind: `event-property`. Context: `TabRowBlock.renderLabels`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
click: async (e) => {
                    const tab = await self.createNewTab(self.labels.length + "");
                }
```

### blocks-tabs-block-binding-01

Source: [src/blocks/tabs-block.ts:255](../speedy-ts/src/blocks/tabs-block.ts). Kind: `binding`. Context: `TabBlock.getTabBlockEvents.events`.

Route: the owning Block's binding list, subject to actual factory installation, mode/trigger matching and origin-to-owner dispatch. Destination/status: the file's migration family above; unresolved until individually qualified.

```tsx
{
                mode: "default",
                trigger: {
                    source: InputEventSource.Mouse,
                    match: "click"
                },
                action: {
                    name: "Set focus to the current block.",
                    description: "",
                    handler: async (args: IBindingHandlerArgs) => {
                        const block = args.block;
                        const manager = block.manager as UniverseBlock;
                        manager.setBlockFocus(block);
                    }
                }
            }
```

### blocks-tabs-block-listener-02

Source: [src/blocks/tabs-block.ts:290](../speedy-ts/src/blocks/tabs-block.ts). Kind: `listener`. Context: `TabBlock.attachEventHandlers`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
this.container.addEventListener("click", this.handleClick.bind(this))
```

### Named implementation index

This index intentionally includes helper methods as well as handlers. Resolve named calls in the entries above here; methods with no caller/binding are **not** automatically live commands. Shared support methods may be implemented in another indexed file (notably AbstractBlock, DocumentBlock, UniverseBlock, StandoffProperty and SVG helpers).

| Context | Callable | Source |
| --- | --- | --- |
| TabRowBlock | `getActiveTab` | [src/blocks/tabs-block.ts:20](../speedy-ts/src/blocks/tabs-block.ts) |
| TabRowBlock | `firstTab` | [src/blocks/tabs-block.ts:23](../speedy-ts/src/blocks/tabs-block.ts) |
| TabRowBlock | `setFocus` | [src/blocks/tabs-block.ts:47](../speedy-ts/src/blocks/tabs-block.ts) |
| TabRowBlock | `deleteTab` | [src/blocks/tabs-block.ts:59](../speedy-ts/src/blocks/tabs-block.ts) |
| TabRowBlock | `destructure` | [src/blocks/tabs-block.ts:67](../speedy-ts/src/blocks/tabs-block.ts) |
| TabRowBlock | `getBlockBuilder` | [src/blocks/tabs-block.ts:75](../speedy-ts/src/blocks/tabs-block.ts) |
| TabRowBlock | `setTabActive` | [src/blocks/tabs-block.ts:103](../speedy-ts/src/blocks/tabs-block.ts) |
| TabRowBlock | `renderLabels` | [src/blocks/tabs-block.ts:110](../speedy-ts/src/blocks/tabs-block.ts) |
| TabRowBlock | `getTab` | [src/blocks/tabs-block.ts:141](../speedy-ts/src/blocks/tabs-block.ts) |
| TabRowBlock | `lastTab` | [src/blocks/tabs-block.ts:144](../speedy-ts/src/blocks/tabs-block.ts) |
| TabRowBlock | `appendTab` | [src/blocks/tabs-block.ts:147](../speedy-ts/src/blocks/tabs-block.ts) |
| TabRowBlock | `addTab` | [src/blocks/tabs-block.ts:151](../speedy-ts/src/blocks/tabs-block.ts) |
| TabRowBlock | `createNewTab` | [src/blocks/tabs-block.ts:180](../speedy-ts/src/blocks/tabs-block.ts) |
| TabRowBlock | `serialize` | [src/blocks/tabs-block.ts:183](../speedy-ts/src/blocks/tabs-block.ts) |
| TabRowBlock | `deserialize` | [src/blocks/tabs-block.ts:192](../speedy-ts/src/blocks/tabs-block.ts) |
| TabBlock | `extract` | [src/blocks/tabs-block.ts:208](../speedy-ts/src/blocks/tabs-block.ts) |
| TabBlock | `explode` | [src/blocks/tabs-block.ts:229](../speedy-ts/src/blocks/tabs-block.ts) |
| TabBlock | `getRow` | [src/blocks/tabs-block.ts:250](../speedy-ts/src/blocks/tabs-block.ts) |
| TabBlock | `getTabBlockEvents` | [src/blocks/tabs-block.ts:253](../speedy-ts/src/blocks/tabs-block.ts) |
| TabBlock | `getBlockBuilder` | [src/blocks/tabs-block.ts:274](../speedy-ts/src/blocks/tabs-block.ts) |
| TabBlock | `attachEventHandlers` | [src/blocks/tabs-block.ts:289](../speedy-ts/src/blocks/tabs-block.ts) |
| TabBlock | `handleClick` | [src/blocks/tabs-block.ts:292](../speedy-ts/src/blocks/tabs-block.ts) |
| TabBlock | `setName` | [src/blocks/tabs-block.ts:297](../speedy-ts/src/blocks/tabs-block.ts) |
| TabBlock | `moveRight` | [src/blocks/tabs-block.ts:301](../speedy-ts/src/blocks/tabs-block.ts) |
| TabBlock | `moveLeft` | [src/blocks/tabs-block.ts:304](../speedy-ts/src/blocks/tabs-block.ts) |
| TabBlock | `mergeLeft` | [src/blocks/tabs-block.ts:307](../speedy-ts/src/blocks/tabs-block.ts) |
| TabBlock | `mergeRight` | [src/blocks/tabs-block.ts:310](../speedy-ts/src/blocks/tabs-block.ts) |
| TabBlock | `setActive` | [src/blocks/tabs-block.ts:313](../speedy-ts/src/blocks/tabs-block.ts) |
| TabBlock | `setInactive` | [src/blocks/tabs-block.ts:320](../speedy-ts/src/blocks/tabs-block.ts) |
| TabBlock | `setCustomFocus` | [src/blocks/tabs-block.ts:329](../speedy-ts/src/blocks/tabs-block.ts) |
| TabBlock | `serialize` | [src/blocks/tabs-block.ts:338](../speedy-ts/src/blocks/tabs-block.ts) |
| TabBlock | `deserialize` | [src/blocks/tabs-block.ts:347](../speedy-ts/src/blocks/tabs-block.ts) |
| TabBlock | `deleteTab` | [src/blocks/tabs-block.ts:350](../speedy-ts/src/blocks/tabs-block.ts) |
| TabBlock | `destroy` | [src/blocks/tabs-block.ts:353](../speedy-ts/src/blocks/tabs-block.ts) |

### Commented/disabled evidence

These are source comments, not installed listeners. They also include relevant intent notes and TODO context. Use the addendum's reachability findings before treating an old commented design as a parity requirement.

- [src/blocks/tabs-block.ts:18](../speedy-ts/src/blocks/tabs-block.ts) — //this.inputEvents = this.getTabBlockEvents();
- [src/blocks/tabs-block.ts:27](../speedy-ts/src/blocks/tabs-block.ts) — //     const events: InputEvent[] = [
- [src/blocks/tabs-block.ts:31](../speedy-ts/src/blocks/tabs-block.ts) — //                 source: InputEventSource.Mouse,
- [src/blocks/tabs-block.ts:32](../speedy-ts/src/blocks/tabs-block.ts) — //                 match: "click"
- [src/blocks/tabs-block.ts:37](../speedy-ts/src/blocks/tabs-block.ts) — //                 handler: async (args: IBindingHandlerArgs) =&gt; {
- [src/blocks/tabs-block.ts:38](../speedy-ts/src/blocks/tabs-block.ts) — //                     const block = args.block;
- [src/blocks/tabs-block.ts:39](../speedy-ts/src/blocks/tabs-block.ts) — //                     const manager = block.manager as UniverseBlock;
- [src/blocks/tabs-block.ts:95](../speedy-ts/src/blocks/tabs-block.ts) — // attachEventHandlers() {
- [src/blocks/tabs-block.ts:96](../speedy-ts/src/blocks/tabs-block.ts) — //     this.container.addEventListener("click", this.handleClick.bind(this));
- [src/blocks/tabs-block.ts:98](../speedy-ts/src/blocks/tabs-block.ts) — // handleClick(e: MouseEvent, tab?: TabBlock) {
- [src/blocks/tabs-block.ts:99](../speedy-ts/src/blocks/tabs-block.ts) — //     const onClick = this.inputEvents.find(x =&gt; (x.trigger.match as string).toLowerCase() == "click");
- [src/blocks/tabs-block.ts:100](../speedy-ts/src/blocks/tabs-block.ts) — //     if (!onClick) return;
- [src/blocks/tabs-block.ts:101](../speedy-ts/src/blocks/tabs-block.ts) — //     onClick.action.handler({ block: tab &#124;&#124; this, caret: {} as any });

## src/blocks/unknown-block.ts

Source: [src/blocks/unknown-block.ts:1](../speedy-ts/src/blocks/unknown-block.ts). SHA-256: `893c94836dd5684e022bcc6319808e7c2cd6047a5c7356cd5fe79e59a4bcec3b`.

Migration family/status: Lossless fallback plus inherited routing; no local input bindings.

Classes: `UnknownBlock` (extends AbstractBlock).

No local binding/listener/callback/recognizer sites found by the census. For Block classes this **does not mean no behavior**: follow inherited AbstractBlock navigation, nearest Document commands, Universe routing, schema effects and native/widget boundaries in the addendum.

### Named implementation index

This index intentionally includes helper methods as well as handlers. Resolve named calls in the entries above here; methods with no caller/binding are **not** automatically live commands. Shared support methods may be implemented in another indexed file (notably AbstractBlock, DocumentBlock, UniverseBlock, StandoffProperty and SVG helpers).

| Context | Callable | Source |
| --- | --- | --- |
| UnknownBlock | `getBlockBuilder` | [src/blocks/unknown-block.ts:11](../speedy-ts/src/blocks/unknown-block.ts) |
| UnknownBlock | `serialize` | [src/blocks/unknown-block.ts:24](../speedy-ts/src/blocks/unknown-block.ts) |
| UnknownBlock | `deserialize` | [src/blocks/unknown-block.ts:32](../speedy-ts/src/blocks/unknown-block.ts) |

## src/blocks/video-background-block.ts

Source: [src/blocks/video-background-block.ts:1](../speedy-ts/src/blocks/video-background-block.ts). SHA-256: `7c421e90d77efc6b4fa666cb218cbed2b74ed25fafc0f6b296a9a52a135a3619`.

Migration family/status: Native media/background adapter; inherits application routing.

Classes: `VideoBackgroundBlock` (extends AbstractBlock).

No local binding/listener/callback/recognizer sites found by the census. For Block classes this **does not mean no behavior**: follow inherited AbstractBlock navigation, nearest Document commands, Universe routing, schema effects and native/widget boundaries in the addendum.

### Named implementation index

This index intentionally includes helper methods as well as handlers. Resolve named calls in the entries above here; methods with no caller/binding are **not** automatically live commands. Shared support methods may be implemented in another indexed file (notably AbstractBlock, DocumentBlock, UniverseBlock, StandoffProperty and SVG helpers).

| Context | Callable | Source |
| --- | --- | --- |
| VideoBackgroundBlock | `serialize` | [src/blocks/video-background-block.ts:11](../speedy-ts/src/blocks/video-background-block.ts) |
| VideoBackgroundBlock | `getBlockBuilder` | [src/blocks/video-background-block.ts:20](../speedy-ts/src/blocks/video-background-block.ts) |
| VideoBackgroundBlock | `deserialize` | [src/blocks/video-background-block.ts:33](../speedy-ts/src/blocks/video-background-block.ts) |
| VideoBackgroundBlock | `setVideo` | [src/blocks/video-background-block.ts:46](../speedy-ts/src/blocks/video-background-block.ts) |

## src/blocks/window-block.ts

Source: [src/blocks/window-block.ts:1](../speedy-ts/src/blocks/window-block.ts). SHA-256: `7cc31fd273d72700242e7eec6b8e0ac3a622bf91c85e61d8ceaf9d838cad5c96`.

Migration family/status: Window controller and gesture/effect adapter; pointer drag/minimize/close subset only.

Classes: `WindowBlock` (extends AbstractBlock).

Binding installation/override sites (first source line; inspect surrounding constructor/factory):

- [src/blocks/window-block.ts:150](../speedy-ts/src/blocks/window-block.ts) — `WindowBlock.setupEventHandlers`: `this.inputEvents = [`

### blocks-window-block-binding-01

Source: [src/blocks/window-block.ts:151](../speedy-ts/src/blocks/window-block.ts). Kind: `binding`. Context: `WindowBlock.setupEventHandlers`.

Route: the owning Block's binding list, subject to actual factory installation, mode/trigger matching and origin-to-owner dispatch. Destination/status: the file's migration family above; unresolved until individually qualified.

```tsx
{
                mode: 'default',
                trigger: {
                    source: InputEventSource.Keyboard,
                    match: 'ArrowDown'
                },
                action: {
                    name: 'Move window down by 10 pixels',
                    description: '',
                    handler: async (args: IBindingHandlerArgs) => {
                        const block = args.block as WindowBlock;
                        if (!block.isDragging) return;
                        const pos = block.metadata.position;
                        pos.y += 10;
                        win.style.transform = `translate(${pos.x}px,${pos.y}px)`;
                    }
                }
            }
```

### blocks-window-block-binding-02

Source: [src/blocks/window-block.ts:169](../speedy-ts/src/blocks/window-block.ts). Kind: `binding`. Context: `WindowBlock.setupEventHandlers`.

Route: the owning Block's binding list, subject to actual factory installation, mode/trigger matching and origin-to-owner dispatch. Destination/status: the file's migration family above; unresolved until individually qualified.

```tsx
{
                mode: 'default',
                trigger: {
                    source: InputEventSource.Keyboard,
                    match: 'ArrowUp'
                },
                action: {
                    name: 'Move window down by 10 pixels',
                    description: '',
                    handler: async (args: IBindingHandlerArgs) => {
                        const block = args.block as WindowBlock;
                        if (!block.isDragging) return;
                        const pos = block.metadata.position;
                        pos.y -= 10;
                        win.style.transform = `translate(${pos.x}px,${pos.y}px)`;
                    }
                }
            }
```

### blocks-window-block-binding-03

Source: [src/blocks/window-block.ts:187](../speedy-ts/src/blocks/window-block.ts). Kind: `binding`. Context: `WindowBlock.setupEventHandlers`.

Route: the owning Block's binding list, subject to actual factory installation, mode/trigger matching and origin-to-owner dispatch. Destination/status: the file's migration family above; unresolved until individually qualified.

```tsx
{
                mode: 'default',
                trigger: {
                    source: InputEventSource.Keyboard,
                    match: 'ArrowLeft'
                },
                action: {
                    name: 'Move window left by 10 pixels',
                    description: '',
                    handler: async (args: IBindingHandlerArgs) => {
                        const block = args.block as WindowBlock;
                        if (!block.isDragging) return;
                        const pos = block.metadata.position;
                        pos.x -= 10;
                        win.style.transform = `translate(${pos.x}px,${pos.y}px)`;
                    }
                }
            }
```

### blocks-window-block-binding-04

Source: [src/blocks/window-block.ts:205](../speedy-ts/src/blocks/window-block.ts). Kind: `binding`. Context: `WindowBlock.setupEventHandlers`.

Route: the owning Block's binding list, subject to actual factory installation, mode/trigger matching and origin-to-owner dispatch. Destination/status: the file's migration family above; unresolved until individually qualified.

```tsx
{
                mode: 'default',
                trigger: {
                    source: InputEventSource.Keyboard,
                    match: 'ArrowRight'
                },
                action: {
                    name: 'Move window rihgt by 10 pixels',
                    description: '',
                    handler: async (args: IBindingHandlerArgs) => {
                        const block = args.block as WindowBlock;
                        if (!block.isDragging) return;
                        const pos = block.metadata.position;
                        pos.x += 10;
                        win.style.transform = `translate(${pos.x}px,${pos.y}px)`;
                    }
                }
            }
```

### blocks-window-block-listener-01

Source: [src/blocks/window-block.ts:224](../speedy-ts/src/blocks/window-block.ts). Kind: `listener`. Context: `WindowBlock.setupEventHandlers`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
x.addEventListener("contextmenu", this.onContextMenu.bind(this))
```

### blocks-window-block-button-factory-01

Source: [src/blocks/window-block.ts:274](../speedy-ts/src/blocks/window-block.ts). Kind: `button-factory`. Context: `WindowBlock.createControls.minimizeBtn`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
this.createWindowButton('−', () => {
            if (self.state == "minimized") {
                return;
            }
            if (self.state == "maximised") {
                self.state = "normal";
                setElement(win, {
                    style: {
                        top: previousState.top + "px",
                        left: previousState.left + "px",
                        width: previousState.width + "px",
                        height: previousState.height + "px"
                    }
                });
            } else {
                self.state = "minimized";
                setElement(win, {
                    style: {
                        bottom: 0,
                        right: 0,
                        width: "100px"
                    }
                });
                setElement(win.children[1] as HTMLElement , {
                    style: {
                        display: "none"
                    }
                });
            }
            const rect = win.getBoundingClientRect();
            previousState = {
                top: rect.top,
                left: rect.top,
                width: rect.width,
                height: rect.height
            };
            self.state = "minimized";
        })
```

### blocks-window-block-button-factory-02

Source: [src/blocks/window-block.ts:313](../speedy-ts/src/blocks/window-block.ts). Kind: `button-factory`. Context: `WindowBlock.createControls.maximizeBtn`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
this.createWindowButton('□', () => { 
            if (self.state == "maximised") {
                return;
            }
            if (self.state == "minimized") {
                self.state = "normal";
                setElement(win, {
                    style: {
                        top: previousState.top + "px",
                        left: previousState.left + "px",
                        width: previousState.width + "px",
                        height: previousState.height + "px"
                    }
                });
                setElement(win.children[1] as HTMLElement , {
                    style: {
                        display: "block"
                    }
                });
            } else {
                self.state = "maximised";
                const rect = win.getBoundingClientRect();
                previousState = {
                    top: rect.top,
                    left: rect.top,
                    width: rect.width,
                    height: rect.height
                };
                setElement(win, {
                    style: {
                        top: 0,
                        left: 0,
                        width: "100%",
                        height: "100%"
                    }
                });
            }
        })
```

### blocks-window-block-button-factory-03

Source: [src/blocks/window-block.ts:352](../speedy-ts/src/blocks/window-block.ts). Kind: `button-factory`. Context: `WindowBlock.createControls.closeBtn`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
this.createWindowButton('×', async () => { 
            if (self.onClose) {
                await self.onClose(self);
                return;
            }
            self.destroy();
        })
```

### blocks-window-block-listener-02

Source: [src/blocks/window-block.ts:385](../speedy-ts/src/blocks/window-block.ts). Kind: `listener`. Context: `WindowBlock.createWindowButton`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
button.addEventListener('click', onClick)
```

### blocks-window-block-listener-03

Source: [src/blocks/window-block.ts:386](../speedy-ts/src/blocks/window-block.ts). Kind: `listener`. Context: `WindowBlock.createWindowButton`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
button.addEventListener('mouseenter', () => button.style.background = '#e0e0e0')
```

### blocks-window-block-listener-04

Source: [src/blocks/window-block.ts:387](../speedy-ts/src/blocks/window-block.ts). Kind: `listener`. Context: `WindowBlock.createWindowButton`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
button.addEventListener('mouseleave', () => button.style.background = 'transparent')
```

### Named implementation index

This index intentionally includes helper methods as well as handlers. Resolve named calls in the entries above here; methods with no caller/binding are **not** automatically live commands. Shared support methods may be implemented in another indexed file (notably AbstractBlock, DocumentBlock, UniverseBlock, StandoffProperty and SVG helpers).

| Context | Callable | Source |
| --- | --- | --- |
| WindowBlock | `getBlockBuilder` | [src/blocks/window-block.ts:74](../speedy-ts/src/blocks/window-block.ts) |
| WindowBlock | `destroy` | [src/blocks/window-block.ts:90](../speedy-ts/src/blocks/window-block.ts) |
| WindowBlock | `updatePosition` | [src/blocks/window-block.ts:93](../speedy-ts/src/blocks/window-block.ts) |
| WindowBlock | `getBlockSchemas` | [src/blocks/window-block.ts:104](../speedy-ts/src/blocks/window-block.ts) |
| WindowBlock | `onContextMenu` | [src/blocks/window-block.ts:123](../speedy-ts/src/blocks/window-block.ts) |
| WindowBlock | `setupEventHandlers` | [src/blocks/window-block.ts:145](../speedy-ts/src/blocks/window-block.ts) |
| WindowBlock | `createControls` | [src/blocks/window-block.ts:263](../speedy-ts/src/blocks/window-block.ts) |
| WindowBlock | `setTitle` | [src/blocks/window-block.ts:369](../speedy-ts/src/blocks/window-block.ts) |
| WindowBlock | `createWindowButton` | [src/blocks/window-block.ts:372](../speedy-ts/src/blocks/window-block.ts) |
| WindowBlock | `serialize` | [src/blocks/window-block.ts:390](../speedy-ts/src/blocks/window-block.ts) |
| WindowBlock | `deserialize` | [src/blocks/window-block.ts:399](../speedy-ts/src/blocks/window-block.ts) |

### Commented/disabled evidence

These are source comments, not installed listeners. They also include relevant intent notes and TODO context. Use the addendum's reachability findings before treating an old commented design as a parity requirement.

- [src/blocks/window-block.ts:227](../speedy-ts/src/blocks/window-block.ts) — // const dragger = new DraggableWindow(win, handle, {
- [src/blocks/window-block.ts:229](../speedy-ts/src/blocks/window-block.ts) — //     minimizeDuration: 300,  // Optional: Customize minimize animation duration
- [src/blocks/window-block.ts:230](../speedy-ts/src/blocks/window-block.ts) — //     minimizeIconClass: 'minimized-icon',  // Custom class for minimized icon
- [src/blocks/window-block.ts:231](../speedy-ts/src/blocks/window-block.ts) — //     onDragStart: () =&gt; console.log('Started dragging'),
- [src/blocks/window-block.ts:232](../speedy-ts/src/blocks/window-block.ts) — //     onDragMove: (x, y) =&gt; console.log(`Dragging to ${x}, ${y}`),
- [src/blocks/window-block.ts:233](../speedy-ts/src/blocks/window-block.ts) — //     onDragEnd: () =&gt; console.log('Stopped dragging'),
- [src/blocks/window-block.ts:237](../speedy-ts/src/blocks/window-block.ts) — // handle.addEventListener('mousedown', (e) =&gt; {
- [src/blocks/window-block.ts:240](../speedy-ts/src/blocks/window-block.ts) — //     const startX = e.clientX;
- [src/blocks/window-block.ts:241](../speedy-ts/src/blocks/window-block.ts) — //     const startY = e.clientY;
- [src/blocks/window-block.ts:242](../speedy-ts/src/blocks/window-block.ts) — //     const rect = win.getBoundingClientRect();
- [src/blocks/window-block.ts:243](../speedy-ts/src/blocks/window-block.ts) — //     const offsetX = startX - rect.left;
- [src/blocks/window-block.ts:244](../speedy-ts/src/blocks/window-block.ts) — //     const offsetY = startY - rect.top;
- [src/blocks/window-block.ts:247](../speedy-ts/src/blocks/window-block.ts) — //     function onMouseMove(e) {
- [src/blocks/window-block.ts:253](../speedy-ts/src/blocks/window-block.ts) — //     function onMouseUp() {
- [src/blocks/window-block.ts:255](../speedy-ts/src/blocks/window-block.ts) — //         document.removeEventListener('mousemove', onMouseMove);
- [src/blocks/window-block.ts:256](../speedy-ts/src/blocks/window-block.ts) — //         document.removeEventListener('mouseup', onMouseUp);
- [src/blocks/window-block.ts:259](../speedy-ts/src/blocks/window-block.ts) — //     document.addEventListener('mousemove', onMouseMove);
- [src/blocks/window-block.ts:260](../speedy-ts/src/blocks/window-block.ts) — //     document.addEventListener('mouseup', onMouseUp);

## src/blocks/workspace-block.ts

Source: [src/blocks/workspace-block.ts:1](../speedy-ts/src/blocks/workspace-block.ts). SHA-256: `2c4275e9ac603175681925af725847322420432d5ac1769a0ffaeae6b63d5003`.

Migration family/status: Workspace commands and inherited routing; save/load shortcuts absent.

Classes: `WorkspaceBlock` (extends AbstractBlock).

No local binding/listener/callback/recognizer sites found by the census. For Block classes this **does not mean no behavior**: follow inherited AbstractBlock navigation, nearest Document commands, Universe routing, schema effects and native/widget boundaries in the addendum.

### Named implementation index

This index intentionally includes helper methods as well as handlers. Resolve named calls in the entries above here; methods with no caller/binding are **not** automatically live commands. Shared support methods may be implemented in another indexed file (notably AbstractBlock, DocumentBlock, UniverseBlock, StandoffProperty and SVG helpers).

| Context | Callable | Source |
| --- | --- | --- |
| WorkspaceBlock | `getBlockBuilder` | [src/blocks/workspace-block.ts:13](../speedy-ts/src/blocks/workspace-block.ts) |
| WorkspaceBlock | `build` | [src/blocks/workspace-block.ts:24](../speedy-ts/src/blocks/workspace-block.ts) |
| WorkspaceBlock | `bind` | [src/blocks/workspace-block.ts:27](../speedy-ts/src/blocks/workspace-block.ts) |
| WorkspaceBlock | `serialize` | [src/blocks/workspace-block.ts:34](../speedy-ts/src/blocks/workspace-block.ts) |
| WorkspaceBlock | `deserialize` | [src/blocks/workspace-block.ts:43](../speedy-ts/src/blocks/workspace-block.ts) |

## src/blocks/youtube-video-background-block.ts

Source: [src/blocks/youtube-video-background-block.ts:1](../speedy-ts/src/blocks/youtube-video-background-block.ts). SHA-256: `ee41d006b3b2d57390dabf79f5420dfe654e3121aeec3a4f37052366771bcfde`.

Migration family/status: Opaque background player adapter; preserve disabled keyboard/pointer policy.

Classes: `YouTubeVideoBackgroundBlock` (extends AbstractBlock implements ISetSource).

Binding installation/override sites (first source line; inspect surrounding constructor/factory):

- [src/blocks/youtube-video-background-block.ts:48](../speedy-ts/src/blocks/youtube-video-background-block.ts) — `YouTubeVideoBackgroundBlock`: `this.inputEvents = this.getInputEvents()`

No local binding/listener/callback/recognizer sites found by the census. For Block classes this **does not mean no behavior**: follow inherited AbstractBlock navigation, nearest Document commands, Universe routing, schema effects and native/widget boundaries in the addendum.

### Named implementation index

This index intentionally includes helper methods as well as handlers. Resolve named calls in the entries above here; methods with no caller/binding are **not** automatically live commands. Shared support methods may be implemented in another indexed file (notably AbstractBlock, DocumentBlock, UniverseBlock, StandoffProperty and SVG helpers).

| Context | Callable | Source |
| --- | --- | --- |
| YouTubeVideoBackgroundBlock | `getInputEvents` | [src/blocks/youtube-video-background-block.ts:50](../speedy-ts/src/blocks/youtube-video-background-block.ts) |
| YouTubeVideoBackgroundBlock | `setSource` | [src/blocks/youtube-video-background-block.ts:56](../speedy-ts/src/blocks/youtube-video-background-block.ts) |
| YouTubeVideoBackgroundBlock | `getBlockBuilder` | [src/blocks/youtube-video-background-block.ts:61](../speedy-ts/src/blocks/youtube-video-background-block.ts) |
| YouTubeVideoBackgroundBlock | `build` | [src/blocks/youtube-video-background-block.ts:75](../speedy-ts/src/blocks/youtube-video-background-block.ts) |
| YouTubeVideoBackgroundBlock | `bind` | [src/blocks/youtube-video-background-block.ts:82](../speedy-ts/src/blocks/youtube-video-background-block.ts) |
| YouTubeVideoBackgroundBlock | `serialize` | [src/blocks/youtube-video-background-block.ts:89](../speedy-ts/src/blocks/youtube-video-background-block.ts) |
| YouTubeVideoBackgroundBlock | `deserialize` | [src/blocks/youtube-video-background-block.ts:98](../speedy-ts/src/blocks/youtube-video-background-block.ts) |
| YouTubeVideoBackgroundBlock | `destroyAsync` | [src/blocks/youtube-video-background-block.ts:101](../speedy-ts/src/blocks/youtube-video-background-block.ts) |

### Commented/disabled evidence

These are source comments, not installed listeners. They also include relevant intent notes and TODO context. Use the addendum's reachability findings before treating an old commented design as a parity requirement.

- [src/blocks/youtube-video-background-block.ts:21](../speedy-ts/src/blocks/youtube-video-background-block.ts) — // Disables mouse interactions
- [src/blocks/youtube-video-background-block.ts:38](../speedy-ts/src/blocks/youtube-video-background-block.ts) — // Hide controls
- [src/blocks/youtube-video-background-block.ts:39](../speedy-ts/src/blocks/youtube-video-background-block.ts) — // Disable keyboard controls
- [src/blocks/youtube-video-background-block.ts:41](../speedy-ts/src/blocks/youtube-video-background-block.ts) — // Hide video annotations

## src/blocks/youtube-video-block.ts

Source: [src/blocks/youtube-video-block.ts:1](../speedy-ts/src/blocks/youtube-video-block.ts). SHA-256: `718ce1ae92ff0009c0f2fcbbed5b852f1fd4d172beee6cff4710ea4397c7e049`.

Migration family/status: Opaque player adapter; native player controls, inherited application routing.

Classes: `YouTubeVideoBlock` (extends AbstractBlock).

No local binding/listener/callback/recognizer sites found by the census. For Block classes this **does not mean no behavior**: follow inherited AbstractBlock navigation, nearest Document commands, Universe routing, schema effects and native/widget boundaries in the addendum.

### Named implementation index

This index intentionally includes helper methods as well as handlers. Resolve named calls in the entries above here; methods with no caller/binding are **not** automatically live commands. Shared support methods may be implemented in another indexed file (notably AbstractBlock, DocumentBlock, UniverseBlock, StandoffProperty and SVG helpers).

| Context | Callable | Source |
| --- | --- | --- |
| YouTubeVideoBlock | `getBlockBuilder` | [src/blocks/youtube-video-block.ts:21](../speedy-ts/src/blocks/youtube-video-block.ts) |
| YouTubeVideoBlock | `build` | [src/blocks/youtube-video-block.ts:35](../speedy-ts/src/blocks/youtube-video-block.ts) |
| YouTubeVideoBlock | `bind` | [src/blocks/youtube-video-block.ts:41](../speedy-ts/src/blocks/youtube-video-block.ts) |
| YouTubeVideoBlock | `serialize` | [src/blocks/youtube-video-block.ts:48](../speedy-ts/src/blocks/youtube-video-block.ts) |
| YouTubeVideoBlock | `deserialize` | [src/blocks/youtube-video-block.ts:57](../speedy-ts/src/blocks/youtube-video-block.ts) |
| YouTubeVideoBlock | `destroyAsync` | [src/blocks/youtube-video-block.ts:60](../speedy-ts/src/blocks/youtube-video-block.ts) |

## src/components/annotation-panel.tsx

Source: [src/components/annotation-panel.tsx:1](../speedy-ts/src/components/annotation-panel.tsx). SHA-256: `1536d4fddc1b36017f6e7aa6f82195a80fbced6d8e4ffaf2e7256f04186e6d89`.

Migration family/status: Annotation-panel session controller; not ported.

Classes: `AnnotationPanelBlock` (extends AbstractBlock).

Binding installation/override sites (first source line; inspect surrounding constructor/factory):

- [src/components/annotation-panel.tsx:33](../speedy-ts/src/components/annotation-panel.tsx) — `AnnotationPanelBlock.render`: `this.setEvents([`

### components-annotation-panel-binding-01

Source: [src/components/annotation-panel.tsx:34](../speedy-ts/src/components/annotation-panel.tsx). Kind: `binding`. Context: `AnnotationPanelBlock.render`.

Route: the owning Block's binding list, subject to actual factory installation, mode/trigger matching and origin-to-owner dispatch. Destination/status: the file's migration family above; unresolved until individually qualified.

```tsx
{
                mode: "default",
                trigger: {
                    source: InputEventSource.Mouse,
                    match: "click"
                },
                action: {
                    name: "Close the panel.",
                    description: `
                        
                    `,
                    handler: async (args) => {
                        const target = args.e.target as HTMLElement;
                        if (!self.node.contains(target)) {
                            self.destroy();
                            self.events.onClose();
                        }
                    }
                }
            }
```

### components-annotation-panel-binding-02

Source: [src/components/annotation-panel.tsx:54](../speedy-ts/src/components/annotation-panel.tsx). Kind: `binding`. Context: `AnnotationPanelBlock.render`.

Route: the owning Block's binding list, subject to actual factory installation, mode/trigger matching and origin-to-owner dispatch. Destination/status: the file's migration family above; unresolved until individually qualified.

```tsx
{
                mode: "default",
                trigger: {
                    source: InputEventSource.Keyboard,
                    match: "Escape"
                },
                action: {
                    name: "Close the panel.",
                    description: `
                        
                    `,
                    handler: async (args) => {
                        self.destroy();
                        self.events.onClose();
                    }
                }
            }
```

### components-annotation-panel-binding-03

Source: [src/components/annotation-panel.tsx:71](../speedy-ts/src/components/annotation-panel.tsx). Kind: `binding`. Context: `AnnotationPanelBlock.render`.

Route: the owning Block's binding list, subject to actual factory installation, mode/trigger matching and origin-to-owner dispatch. Destination/status: the file's migration family above; unresolved until individually qualified.

```tsx
{
                mode: "default",
                trigger: {
                    source: InputEventSource.Keyboard,
                    match: "i"
                },
                action: {
                    name: "Apply italics.",
                    description: `
                        
                    `,
                    handler: async (args) => {
                        applyAnnotation("style/italics");
                    }
                }
            }
```

### components-annotation-panel-binding-04

Source: [src/components/annotation-panel.tsx:87](../speedy-ts/src/components/annotation-panel.tsx). Kind: `binding`. Context: `AnnotationPanelBlock.render`.

Route: the owning Block's binding list, subject to actual factory installation, mode/trigger matching and origin-to-owner dispatch. Destination/status: the file's migration family above; unresolved until individually qualified.

```tsx
{
                mode: "default",
                trigger: {
                    source: InputEventSource.Keyboard,
                    match: "b"
                },
                action: {
                    name: "Apply bold.",
                    description: `
                        
                    `,
                    handler: async (args) => {
                        applyAnnotation("style/bold");
                    }
                }
            }
```

### components-annotation-panel-binding-05

Source: [src/components/annotation-panel.tsx:103](../speedy-ts/src/components/annotation-panel.tsx). Kind: `binding`. Context: `AnnotationPanelBlock.render`.

Route: the owning Block's binding list, subject to actual factory installation, mode/trigger matching and origin-to-owner dispatch. Destination/status: the file's migration family above; unresolved until individually qualified.

```tsx
{
                mode: "default",
                trigger: {
                    source: InputEventSource.Keyboard,
                    match: "u"
                },
                action: {
                    name: "Apply underline.",
                    description: `
                        
                    `,
                    handler: async (args) => {
                        applyAnnotation("style/underline");
                    }
                }
            }
```

### components-annotation-panel-jsx-01

Source: [src/components/annotation-panel.tsx:198](../speedy-ts/src/components/annotation-panel.tsx). Kind: `jsx`. Context: `AnnotationPanelBlock.render.MenuComponent`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick={(e) => { e.preventDefault(); handleItemClick(item); }}
```

### components-annotation-panel-callback-01

Source: [src/components/annotation-panel.tsx:219](../speedy-ts/src/components/annotation-panel.tsx). Kind: `callback`. Context: `AnnotationPanelBlock.render.Panel.menu`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick: () => boldClicked()
```

### components-annotation-panel-callback-02

Source: [src/components/annotation-panel.tsx:220](../speedy-ts/src/components/annotation-panel.tsx). Kind: `callback`. Context: `AnnotationPanelBlock.render.Panel.menu`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick: () => italicClicked()
```

### components-annotation-panel-callback-03

Source: [src/components/annotation-panel.tsx:221](../speedy-ts/src/components/annotation-panel.tsx). Kind: `callback`. Context: `AnnotationPanelBlock.render.Panel.menu`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick: () => strikethroughClicked()
```

### components-annotation-panel-callback-04

Source: [src/components/annotation-panel.tsx:222](../speedy-ts/src/components/annotation-panel.tsx). Kind: `callback`. Context: `AnnotationPanelBlock.render.Panel.menu`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick: () => highlightClicked()
```

### components-annotation-panel-callback-05

Source: [src/components/annotation-panel.tsx:223](../speedy-ts/src/components/annotation-panel.tsx). Kind: `callback`. Context: `AnnotationPanelBlock.render.Panel.menu`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick: () => clearFormattingClicked()
```

### components-annotation-panel-callback-06

Source: [src/components/annotation-panel.tsx:229](../speedy-ts/src/components/annotation-panel.tsx). Kind: `callback`. Context: `AnnotationPanelBlock.render.Panel.menu`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick: () => bulletListClicked()
```

### components-annotation-panel-callback-07

Source: [src/components/annotation-panel.tsx:240](../speedy-ts/src/components/annotation-panel.tsx). Kind: `callback`. Context: `AnnotationPanelBlock.render.Panel.menu`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick: () => addTableClicked(1,1)
```

### components-annotation-panel-callback-08

Source: [src/components/annotation-panel.tsx:241](../speedy-ts/src/components/annotation-panel.tsx). Kind: `callback`. Context: `AnnotationPanelBlock.render.Panel.menu`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick: () => addTableClicked(1,2)
```

### components-annotation-panel-callback-09

Source: [src/components/annotation-panel.tsx:242](../speedy-ts/src/components/annotation-panel.tsx). Kind: `callback`. Context: `AnnotationPanelBlock.render.Panel.menu`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick: () => addTableClicked(1,3)
```

### components-annotation-panel-callback-10

Source: [src/components/annotation-panel.tsx:243](../speedy-ts/src/components/annotation-panel.tsx). Kind: `callback`. Context: `AnnotationPanelBlock.render.Panel.menu`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick: () => addTableClicked(1,4)
```

### components-annotation-panel-callback-11

Source: [src/components/annotation-panel.tsx:245](../speedy-ts/src/components/annotation-panel.tsx). Kind: `callback`. Context: `AnnotationPanelBlock.render.Panel.menu`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick: () => addTableClicked(2,1)
```

### components-annotation-panel-callback-12

Source: [src/components/annotation-panel.tsx:246](../speedy-ts/src/components/annotation-panel.tsx). Kind: `callback`. Context: `AnnotationPanelBlock.render.Panel.menu`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick: () => addTableClicked(2,2)
```

### components-annotation-panel-callback-13

Source: [src/components/annotation-panel.tsx:247](../speedy-ts/src/components/annotation-panel.tsx). Kind: `callback`. Context: `AnnotationPanelBlock.render.Panel.menu`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick: () => addTableClicked(2,3)
```

### components-annotation-panel-callback-14

Source: [src/components/annotation-panel.tsx:248](../speedy-ts/src/components/annotation-panel.tsx). Kind: `callback`. Context: `AnnotationPanelBlock.render.Panel.menu`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick: () => addTableClicked(2,4)
```

### Named implementation index

This index intentionally includes helper methods as well as handlers. Resolve named calls in the entries above here; methods with no caller/binding are **not** automatically live commands. Shared support methods may be implemented in another indexed file (notably AbstractBlock, DocumentBlock, UniverseBlock, StandoffProperty and SVG helpers).

| Context | Callable | Source |
| --- | --- | --- |
| AnnotationPanelBlock | `render` | [src/components/annotation-panel.tsx:30](../speedy-ts/src/components/annotation-panel.tsx) |
| AnnotationPanelBlock.render | `annotate` | [src/components/annotation-panel.tsx:120](../speedy-ts/src/components/annotation-panel.tsx) |
| AnnotationPanelBlock.render | `applyAnnotation` | [src/components/annotation-panel.tsx:126](../speedy-ts/src/components/annotation-panel.tsx) |
| AnnotationPanelBlock.render | `addTableClicked` | [src/components/annotation-panel.tsx:140](../speedy-ts/src/components/annotation-panel.tsx) |
| AnnotationPanelBlock.render | `bulletListClicked` | [src/components/annotation-panel.tsx:147](../speedy-ts/src/components/annotation-panel.tsx) |
| AnnotationPanelBlock.render | `boldClicked` | [src/components/annotation-panel.tsx:153](../speedy-ts/src/components/annotation-panel.tsx) |
| AnnotationPanelBlock.render | `italicClicked` | [src/components/annotation-panel.tsx:156](../speedy-ts/src/components/annotation-panel.tsx) |
| AnnotationPanelBlock.render | `strikethroughClicked` | [src/components/annotation-panel.tsx:159](../speedy-ts/src/components/annotation-panel.tsx) |
| AnnotationPanelBlock.render | `highlightClicked` | [src/components/annotation-panel.tsx:162](../speedy-ts/src/components/annotation-panel.tsx) |
| AnnotationPanelBlock.render | `clearFormattingClicked` | [src/components/annotation-panel.tsx:165](../speedy-ts/src/components/annotation-panel.tsx) |
| AnnotationPanelBlock.render | `MenuComponent` | [src/components/annotation-panel.tsx:174](../speedy-ts/src/components/annotation-panel.tsx) |
| AnnotationPanelBlock.render.MenuComponent | `handleItemClick` | [src/components/annotation-panel.tsx:176](../speedy-ts/src/components/annotation-panel.tsx) |
| AnnotationPanelBlock.render | `Panel` | [src/components/annotation-panel.tsx:214](../speedy-ts/src/components/annotation-panel.tsx) |
| AnnotationPanelBlock | `serialize` | [src/components/annotation-panel.tsx:265](../speedy-ts/src/components/annotation-panel.tsx) |
| AnnotationPanelBlock | `deserialize` | [src/components/annotation-panel.tsx:268](../speedy-ts/src/components/annotation-panel.tsx) |
| AnnotationPanelBlock | `destroy` | [src/components/annotation-panel.tsx:271](../speedy-ts/src/components/annotation-panel.tsx) |

## src/components/block-menu.tsx

Source: [src/components/block-menu.tsx:1](../speedy-ts/src/components/block-menu.tsx). SHA-256: `b2cf0b74844ff3ee39750946f55bba9da7722afee80bd963c4b78dfa75cfbab0`.

Migration family/status: Block/context-menu command controller; not ported.

Classes: `BlockMenuBlock` (extends AbstractBlock).

### components-block-menu-jsx-01

Source: [src/components/block-menu.tsx:32](../speedy-ts/src/components/block-menu.tsx). Kind: `jsx`. Context: `BlockMenu`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClose={props.onClose}
```

### components-block-menu-callback-01

Source: [src/components/block-menu.tsx:372](../speedy-ts/src/components/block-menu.tsx). Kind: `callback`. Context: `BlockMenuBlock.render.itemDeleteBlock`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick: () => self.deleteBlock()
```

### components-block-menu-callback-02

Source: [src/components/block-menu.tsx:379](../speedy-ts/src/components/block-menu.tsx). Kind: `callback`. Context: `BlockMenuBlock.render.itemAdd`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick: () => self.addHtmlBlock()
```

### components-block-menu-callback-03

Source: [src/components/block-menu.tsx:382](../speedy-ts/src/components/block-menu.tsx). Kind: `callback`. Context: `BlockMenuBlock.render.itemAdd`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onInput: (url) => self.addVideoBlock(url)
```

### components-block-menu-callback-04

Source: [src/components/block-menu.tsx:387](../speedy-ts/src/components/block-menu.tsx). Kind: `callback`. Context: `BlockMenuBlock.render.itemAdd`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onInput: (url) => self.addImageBlock(url)
```

### components-block-menu-callback-05

Source: [src/components/block-menu.tsx:390](../speedy-ts/src/components/block-menu.tsx). Kind: `callback`. Context: `BlockMenuBlock.render.itemAdd`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick: () => self.addCanvasBlock()
```

### components-block-menu-callback-06

Source: [src/components/block-menu.tsx:394](../speedy-ts/src/components/block-menu.tsx). Kind: `callback`. Context: `BlockMenuBlock.render.itemAdd`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick: () => { self.addGridBlock(1, 1) }
```

### components-block-menu-callback-07

Source: [src/components/block-menu.tsx:395](../speedy-ts/src/components/block-menu.tsx). Kind: `callback`. Context: `BlockMenuBlock.render.itemAdd`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick: () => { self.addGridBlock(1, 2) }
```

### components-block-menu-callback-08

Source: [src/components/block-menu.tsx:396](../speedy-ts/src/components/block-menu.tsx). Kind: `callback`. Context: `BlockMenuBlock.render.itemAdd`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick: () => { self.addGridBlock(1, 3) }
```

### components-block-menu-callback-09

Source: [src/components/block-menu.tsx:397](../speedy-ts/src/components/block-menu.tsx). Kind: `callback`. Context: `BlockMenuBlock.render.itemAdd`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick: () => { self.addGridBlock(2, 1) }
```

### components-block-menu-callback-10

Source: [src/components/block-menu.tsx:398](../speedy-ts/src/components/block-menu.tsx). Kind: `callback`. Context: `BlockMenuBlock.render.itemAdd`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick: () => { self.addGridBlock(2, 2) }
```

### components-block-menu-callback-11

Source: [src/components/block-menu.tsx:399](../speedy-ts/src/components/block-menu.tsx). Kind: `callback`. Context: `BlockMenuBlock.render.itemAdd`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick: () => { self.addGridBlock(2, 3) }
```

### components-block-menu-callback-12

Source: [src/components/block-menu.tsx:406](../speedy-ts/src/components/block-menu.tsx). Kind: `callback`. Context: `BlockMenuBlock.render.itemSetWindowThemeToGlass`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick: () => self.setWindowThemeToGlass()
```

### components-block-menu-callback-13

Source: [src/components/block-menu.tsx:410](../speedy-ts/src/components/block-menu.tsx). Kind: `callback`. Context: `BlockMenuBlock.render.itemSetWindowThemeToDefault`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick: () => self.setWindowThemeToDefault()
```

### components-block-menu-callback-14

Source: [src/components/block-menu.tsx:415](../speedy-ts/src/components/block-menu.tsx). Kind: `callback`. Context: `BlockMenuBlock.render.itemConvertToGrid`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick: () => self.convertToGrid()
```

### components-block-menu-callback-15

Source: [src/components/block-menu.tsx:420](../speedy-ts/src/components/block-menu.tsx). Kind: `callback`. Context: `BlockMenuBlock.render.itemConvertToPage`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick: () => self.convertToPage()
```

### components-block-menu-callback-16

Source: [src/components/block-menu.tsx:425](../speedy-ts/src/components/block-menu.tsx). Kind: `callback`. Context: `BlockMenuBlock.render.itemConvertToTab`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick: () => self.convertToTab()
```

### components-block-menu-callback-17

Source: [src/components/block-menu.tsx:430](../speedy-ts/src/components/block-menu.tsx). Kind: `callback`. Context: `BlockMenuBlock.render.itemConvertToPocket`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick: () => self.convertToPocket()
```

### components-block-menu-callback-18

Source: [src/components/block-menu.tsx:435](../speedy-ts/src/components/block-menu.tsx). Kind: `callback`. Context: `BlockMenuBlock.render.itemConvertToIndentedList`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick: () => self.convertToList()
```

### components-block-menu-callback-19

Source: [src/components/block-menu.tsx:440](../speedy-ts/src/components/block-menu.tsx). Kind: `callback`. Context: `BlockMenuBlock.render.itemAddTag`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick: () => self.addTag()
```

### components-block-menu-callback-20

Source: [src/components/block-menu.tsx:445](../speedy-ts/src/components/block-menu.tsx). Kind: `callback`. Context: `BlockMenuBlock.render.itemDestructureGrid`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick: () => self.destructureGrid()
```

### components-block-menu-callback-21

Source: [src/components/block-menu.tsx:450](../speedy-ts/src/components/block-menu.tsx). Kind: `callback`. Context: `BlockMenuBlock.render.itemDestructureTabs`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick: () => self.destructureTabs()
```

### components-block-menu-callback-22

Source: [src/components/block-menu.tsx:455](../speedy-ts/src/components/block-menu.tsx). Kind: `callback`. Context: `BlockMenuBlock.render.itemExtractTab`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick: () => self.extractTab()
```

### components-block-menu-callback-23

Source: [src/components/block-menu.tsx:460](../speedy-ts/src/components/block-menu.tsx). Kind: `callback`. Context: `BlockMenuBlock.render.itemExtractPage`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick: () => self.extractPage()
```

### components-block-menu-callback-24

Source: [src/components/block-menu.tsx:465](../speedy-ts/src/components/block-menu.tsx). Kind: `callback`. Context: `BlockMenuBlock.render.itemExtractStickyTab`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick: () => self.extractStickyTab()
```

### components-block-menu-callback-25

Source: [src/components/block-menu.tsx:470](../speedy-ts/src/components/block-menu.tsx). Kind: `callback`. Context: `BlockMenuBlock.render.itemDestructureIndentedList`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick: () => self.destructureList()
```

### components-block-menu-callback-26

Source: [src/components/block-menu.tsx:475](../speedy-ts/src/components/block-menu.tsx). Kind: `callback`. Context: `BlockMenuBlock.render.itemMergeCellLeft`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick: () => self.mergeLeft()
```

### components-block-menu-callback-27

Source: [src/components/block-menu.tsx:480](../speedy-ts/src/components/block-menu.tsx). Kind: `callback`. Context: `BlockMenuBlock.render.itemMergeCellRight`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick: () => self.mergeRight()
```

### components-block-menu-callback-28

Source: [src/components/block-menu.tsx:485](../speedy-ts/src/components/block-menu.tsx). Kind: `callback`. Context: `BlockMenuBlock.render.itemMoveCellLeft`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick: () => self.moveCellLeft()
```

### components-block-menu-callback-29

Source: [src/components/block-menu.tsx:490](../speedy-ts/src/components/block-menu.tsx). Kind: `callback`. Context: `BlockMenuBlock.render.itemMoveCellDown`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick: () => self.moveCellDown()
```

### components-block-menu-callback-30

Source: [src/components/block-menu.tsx:495](../speedy-ts/src/components/block-menu.tsx). Kind: `callback`. Context: `BlockMenuBlock.render.itemMoveCellUp`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick: () => self.moveCellUp()
```

### components-block-menu-callback-31

Source: [src/components/block-menu.tsx:500](../speedy-ts/src/components/block-menu.tsx). Kind: `callback`. Context: `BlockMenuBlock.render.itemMoveCellRight`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick: () => self.moveCellRight()
```

### components-block-menu-callback-32

Source: [src/components/block-menu.tsx:506](../speedy-ts/src/components/block-menu.tsx). Kind: `callback`. Context: `BlockMenuBlock.render.itemMergeTabLeft`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick: () => self.mergeLeft()
```

### components-block-menu-callback-33

Source: [src/components/block-menu.tsx:511](../speedy-ts/src/components/block-menu.tsx). Kind: `callback`. Context: `BlockMenuBlock.render.itemMergeTabRight`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick: () => self.mergeRight()
```

### components-block-menu-callback-34

Source: [src/components/block-menu.tsx:516](../speedy-ts/src/components/block-menu.tsx). Kind: `callback`. Context: `BlockMenuBlock.render.itemMoveTabLeft`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick: () => self.moveCellLeft()
```

### components-block-menu-callback-35

Source: [src/components/block-menu.tsx:521](../speedy-ts/src/components/block-menu.tsx). Kind: `callback`. Context: `BlockMenuBlock.render.itemMoveTabRight`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick: () => self.moveCellRight()
```

### components-block-menu-callback-36

Source: [src/components/block-menu.tsx:533](../speedy-ts/src/components/block-menu.tsx). Kind: `callback`. Context: `BlockMenuBlock.render.itemRenameTab`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onInput: (name: string) => {
                    self.renameTab(name);
                  }
```

### components-block-menu-callback-37

Source: [src/components/block-menu.tsx:542](../speedy-ts/src/components/block-menu.tsx). Kind: `callback`. Context: `BlockMenuBlock.render.itemAddTabBlock`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick: () => self.addTab()
```

### components-block-menu-callback-38

Source: [src/components/block-menu.tsx:547](../speedy-ts/src/components/block-menu.tsx). Kind: `callback`. Context: `BlockMenuBlock.render.itemDeleteTab`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick: () => self.deleteTab()
```

### components-block-menu-callback-39

Source: [src/components/block-menu.tsx:555](../speedy-ts/src/components/block-menu.tsx). Kind: `callback`. Context: `BlockMenuBlock.render.itemAddBlankPages`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick: () => self.addBlankPagesToBook()
```

### components-block-menu-callback-40

Source: [src/components/block-menu.tsx:563](../speedy-ts/src/components/block-menu.tsx). Kind: `callback`. Context: `BlockMenuBlock.render.itemMovePageLeft`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick: () => self.movePageLeft()
```

### components-block-menu-callback-41

Source: [src/components/block-menu.tsx:568](../speedy-ts/src/components/block-menu.tsx). Kind: `callback`. Context: `BlockMenuBlock.render.itemMovePageRight`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick: () => self.movePageRight()
```

### components-block-menu-callback-42

Source: [src/components/block-menu.tsx:580](../speedy-ts/src/components/block-menu.tsx). Kind: `callback`. Context: `BlockMenuBlock.render.itemRenamePage`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onInput: (name: string) => {
                    self.renamePage(name);
                  }
```

### components-block-menu-callback-43

Source: [src/components/block-menu.tsx:589](../speedy-ts/src/components/block-menu.tsx). Kind: `callback`. Context: `BlockMenuBlock.render.itemAddPage`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick: () => self.addPage()
```

### components-block-menu-callback-44

Source: [src/components/block-menu.tsx:594](../speedy-ts/src/components/block-menu.tsx). Kind: `callback`. Context: `BlockMenuBlock.render.itemDeletePage`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick: () => self.deletePage()
```

### components-block-menu-callback-45

Source: [src/components/block-menu.tsx:604](../speedy-ts/src/components/block-menu.tsx). Kind: `callback`. Context: `BlockMenuBlock.render.itemSelectBlock`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onInput: (item: ListItem) => self.setChosenFocus(item.value)
```

### components-block-menu-callback-46

Source: [src/components/block-menu.tsx:613](../speedy-ts/src/components/block-menu.tsx). Kind: `callback`. Context: `BlockMenuBlock.render.itemDeleteTag`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick: async () => self.deleteStickyTab()
```

### components-block-menu-callback-47

Source: [src/components/block-menu.tsx:625](../speedy-ts/src/components/block-menu.tsx). Kind: `callback`. Context: `BlockMenuBlock.render.itemRenameStickyTab`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onInput: (name: string) => {
                    self.renameStickyTab(name);
                  }
```

### components-block-menu-callback-48

Source: [src/components/block-menu.tsx:642](../speedy-ts/src/components/block-menu.tsx). Kind: `callback`. Context: `BlockMenuBlock.render.itemResizePocket`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onInput: (value: string) => {
                    self.resizePocket(value);
                  }
```

### components-block-menu-callback-49

Source: [src/components/block-menu.tsx:651](../speedy-ts/src/components/block-menu.tsx). Kind: `callback`. Context: `BlockMenuBlock.render.itemExplodePocket`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick: () => self.explodePocket()
```

### components-block-menu-callback-50

Source: [src/components/block-menu.tsx:656](../speedy-ts/src/components/block-menu.tsx). Kind: `callback`. Context: `BlockMenuBlock.render.itemDeletePocket`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick: () => self.deletePocket()
```

### components-block-menu-callback-51

Source: [src/components/block-menu.tsx:664](../speedy-ts/src/components/block-menu.tsx). Kind: `callback`. Context: `BlockMenuBlock.render.itemAddGridRow`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick: () => self.addGridRow()
```

### components-block-menu-callback-52

Source: [src/components/block-menu.tsx:678](../speedy-ts/src/components/block-menu.tsx). Kind: `callback`. Context: `BlockMenuBlock.render.itemSave`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onInput: (filename) => {
                    if (membrane) {
                      membrane.metadata.filename = filename;
                    }
                    self.saveDocument(filename);
                  }
```

### components-block-menu-callback-53

Source: [src/components/block-menu.tsx:690](../speedy-ts/src/components/block-menu.tsx). Kind: `callback`. Context: `BlockMenuBlock.render.itemRename`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick: () => self.renameDocument()
```

### components-block-menu-callback-54

Source: [src/components/block-menu.tsx:695](../speedy-ts/src/components/block-menu.tsx). Kind: `callback`. Context: `BlockMenuBlock.render.itemDuplicate`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick: () => self.duplicateDocument()
```

### components-block-menu-callback-55

Source: [src/components/block-menu.tsx:831](../speedy-ts/src/components/block-menu.tsx). Kind: `callback`. Context: `BlockMenuBlock.render.itemDocumentAdd`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick: async () => {
            await self.createDocument();
          }
```

### components-block-menu-callback-56

Source: [src/components/block-menu.tsx:840](../speedy-ts/src/components/block-menu.tsx). Kind: `callback`. Context: `BlockMenuBlock.render.itemSaveWorkspace`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onInput: (filename) => self.saveWorkspace(filename)
```

### components-block-menu-callback-57

Source: [src/components/block-menu.tsx:869](../speedy-ts/src/components/block-menu.tsx). Kind: `callback`. Context: `BlockMenuBlock.render.itemBackgroundMenu`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick: () => self.setBackgroundImage("/image-backgrounds/green-aurora.jpg")
```

### components-block-menu-callback-58

Source: [src/components/block-menu.tsx:874](../speedy-ts/src/components/block-menu.tsx). Kind: `callback`. Context: `BlockMenuBlock.render.itemBackgroundMenu`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick: () => self.setBackgroundImage("/image-backgrounds/wood.jpg")
```

### components-block-menu-callback-59

Source: [src/components/block-menu.tsx:879](../speedy-ts/src/components/block-menu.tsx). Kind: `callback`. Context: `BlockMenuBlock.render.itemBackgroundMenu`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick: () => self.setBackgroundImage("/image-backgrounds/clouds.jpg")
```

### components-block-menu-callback-60

Source: [src/components/block-menu.tsx:884](../speedy-ts/src/components/block-menu.tsx). Kind: `callback`. Context: `BlockMenuBlock.render.itemBackgroundMenu`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick: () => self.setBackgroundImage("/image-backgrounds/snow-aurora.jpg")
```

### components-block-menu-callback-61

Source: [src/components/block-menu.tsx:892](../speedy-ts/src/components/block-menu.tsx). Kind: `callback`. Context: `BlockMenuBlock.render.itemBackgroundMenu`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick: () => self.setBackgroundVideo("rain.mp4")
```

### components-block-menu-callback-62

Source: [src/components/block-menu.tsx:898](../speedy-ts/src/components/block-menu.tsx). Kind: `callback`. Context: `BlockMenuBlock.render.itemBackgroundMenu`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick: () => self.setBackgroundYouTubeVideo("Scottish Mountain Stream")
```

### components-block-menu-callback-63

Source: [src/components/block-menu.tsx:904](../speedy-ts/src/components/block-menu.tsx). Kind: `callback`. Context: `BlockMenuBlock.render.itemBackgroundMenu`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick: () => self.setBackgroundWebGLComponent("Colour Cycling")
```

### components-block-menu-callback-64

Source: [src/components/block-menu.tsx:917](../speedy-ts/src/components/block-menu.tsx). Kind: `callback`. Context: `BlockMenuBlock.render.jsx`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClose: () => {
            console.log("onClose");
            self.destroy();
          }
```

### Named implementation index

This index intentionally includes helper methods as well as handlers. Resolve named calls in the entries above here; methods with no caller/binding are **not** automatically live commands. Shared support methods may be implemented in another indexed file (notably AbstractBlock, DocumentBlock, UniverseBlock, StandoffProperty and SVG helpers).

| Context | Callable | Source |
| --- | --- | --- |
|  | `BlockMenu` | [src/components/block-menu.tsx:27](../speedy-ts/src/components/block-menu.tsx) |
| BlockMenuBlock | `serialize` | [src/components/block-menu.tsx:59](../speedy-ts/src/components/block-menu.tsx) |
| BlockMenuBlock | `deserialize` | [src/components/block-menu.tsx:62](../speedy-ts/src/components/block-menu.tsx) |
| BlockMenuBlock | `deleteBlock` | [src/components/block-menu.tsx:65](../speedy-ts/src/components/block-menu.tsx) |
| BlockMenuBlock | `addHtmlBlock` | [src/components/block-menu.tsx:68](../speedy-ts/src/components/block-menu.tsx) |
| BlockMenuBlock | `addImageBlock` | [src/components/block-menu.tsx:72](../speedy-ts/src/components/block-menu.tsx) |
| BlockMenuBlock | `addVideoBlock` | [src/components/block-menu.tsx:76](../speedy-ts/src/components/block-menu.tsx) |
| BlockMenuBlock | `addCanvasBlock` | [src/components/block-menu.tsx:80](../speedy-ts/src/components/block-menu.tsx) |
| BlockMenuBlock | `addGridBlock` | [src/components/block-menu.tsx:83](../speedy-ts/src/components/block-menu.tsx) |
| BlockMenuBlock | `destructureGrid` | [src/components/block-menu.tsx:92](../speedy-ts/src/components/block-menu.tsx) |
| BlockMenuBlock | `extractStickyTab` | [src/components/block-menu.tsx:96](../speedy-ts/src/components/block-menu.tsx) |
| BlockMenuBlock | `extractTab` | [src/components/block-menu.tsx:100](../speedy-ts/src/components/block-menu.tsx) |
| BlockMenuBlock | `extractPage` | [src/components/block-menu.tsx:104](../speedy-ts/src/components/block-menu.tsx) |
| BlockMenuBlock | `destructureTabs` | [src/components/block-menu.tsx:108](../speedy-ts/src/components/block-menu.tsx) |
| BlockMenuBlock | `destructureList` | [src/components/block-menu.tsx:112](../speedy-ts/src/components/block-menu.tsx) |
| BlockMenuBlock | `convertToGrid` | [src/components/block-menu.tsx:116](../speedy-ts/src/components/block-menu.tsx) |
| BlockMenuBlock | `addTag` | [src/components/block-menu.tsx:126](../speedy-ts/src/components/block-menu.tsx) |
| BlockMenuBlock | `convertToList` | [src/components/block-menu.tsx:140](../speedy-ts/src/components/block-menu.tsx) |
| BlockMenuBlock | `convertToPage` | [src/components/block-menu.tsx:143](../speedy-ts/src/components/block-menu.tsx) |
| BlockMenuBlock | `convertToTab` | [src/components/block-menu.tsx:147](../speedy-ts/src/components/block-menu.tsx) |
| BlockMenuBlock | `convertToPocket` | [src/components/block-menu.tsx:150](../speedy-ts/src/components/block-menu.tsx) |
| BlockMenuBlock | `mergeLeft` | [src/components/block-menu.tsx:153](../speedy-ts/src/components/block-menu.tsx) |
| BlockMenuBlock | `mergeRight` | [src/components/block-menu.tsx:157](../speedy-ts/src/components/block-menu.tsx) |
| BlockMenuBlock | `moveCellUp` | [src/components/block-menu.tsx:161](../speedy-ts/src/components/block-menu.tsx) |
| BlockMenuBlock | `moveCellDown` | [src/components/block-menu.tsx:165](../speedy-ts/src/components/block-menu.tsx) |
| BlockMenuBlock | `moveCellLeft` | [src/components/block-menu.tsx:169](../speedy-ts/src/components/block-menu.tsx) |
| BlockMenuBlock | `resizePocket` | [src/components/block-menu.tsx:173](../speedy-ts/src/components/block-menu.tsx) |
| BlockMenuBlock | `explodePocket` | [src/components/block-menu.tsx:179](../speedy-ts/src/components/block-menu.tsx) |
| BlockMenuBlock | `deletePocket` | [src/components/block-menu.tsx:183](../speedy-ts/src/components/block-menu.tsx) |
| BlockMenuBlock | `deletePage` | [src/components/block-menu.tsx:187](../speedy-ts/src/components/block-menu.tsx) |
| BlockMenuBlock | `addPage` | [src/components/block-menu.tsx:191](../speedy-ts/src/components/block-menu.tsx) |
| BlockMenuBlock | `renamePage` | [src/components/block-menu.tsx:195](../speedy-ts/src/components/block-menu.tsx) |
| BlockMenuBlock | `renameStickyTab` | [src/components/block-menu.tsx:200](../speedy-ts/src/components/block-menu.tsx) |
| BlockMenuBlock | `getAncestorBlockTypesList` | [src/components/block-menu.tsx:205](../speedy-ts/src/components/block-menu.tsx) |
| BlockMenuBlock | `deleteStickyTab` | [src/components/block-menu.tsx:212](../speedy-ts/src/components/block-menu.tsx) |
| BlockMenuBlock | `deleteTab` | [src/components/block-menu.tsx:216](../speedy-ts/src/components/block-menu.tsx) |
| BlockMenuBlock | `addTab` | [src/components/block-menu.tsx:220](../speedy-ts/src/components/block-menu.tsx) |
| BlockMenuBlock | `renameTab` | [src/components/block-menu.tsx:224](../speedy-ts/src/components/block-menu.tsx) |
| BlockMenuBlock | `saveWorkspace` | [src/components/block-menu.tsx:229](../speedy-ts/src/components/block-menu.tsx) |
| BlockMenuBlock | `saveDocument` | [src/components/block-menu.tsx:232](../speedy-ts/src/components/block-menu.tsx) |
| BlockMenuBlock | `renameDocument` | [src/components/block-menu.tsx:238](../speedy-ts/src/components/block-menu.tsx) |
| BlockMenuBlock | `duplicateDocument` | [src/components/block-menu.tsx:241](../speedy-ts/src/components/block-menu.tsx) |
| BlockMenuBlock | `addGridRow` | [src/components/block-menu.tsx:247](../speedy-ts/src/components/block-menu.tsx) |
| BlockMenuBlock | `moveCellRight` | [src/components/block-menu.tsx:251](../speedy-ts/src/components/block-menu.tsx) |
| BlockMenuBlock | `movePageRight` | [src/components/block-menu.tsx:255](../speedy-ts/src/components/block-menu.tsx) |
| BlockMenuBlock | `movePageLeft` | [src/components/block-menu.tsx:259](../speedy-ts/src/components/block-menu.tsx) |
| BlockMenuBlock | `addBlankPagesToBook` | [src/components/block-menu.tsx:263](../speedy-ts/src/components/block-menu.tsx) |
| BlockMenuBlock | `moveTabLeft` | [src/components/block-menu.tsx:303](../speedy-ts/src/components/block-menu.tsx) |
| BlockMenuBlock | `setChosenFocus` | [src/components/block-menu.tsx:307](../speedy-ts/src/components/block-menu.tsx) |
| BlockMenuBlock | `switchThemeTo` | [src/components/block-menu.tsx:310](../speedy-ts/src/components/block-menu.tsx) |
| BlockMenuBlock | `setWindowThemeToGlass` | [src/components/block-menu.tsx:326](../speedy-ts/src/components/block-menu.tsx) |
| BlockMenuBlock | `setWindowThemeToDefault` | [src/components/block-menu.tsx:329](../speedy-ts/src/components/block-menu.tsx) |
| BlockMenuBlock | `moveTabRight` | [src/components/block-menu.tsx:332](../speedy-ts/src/components/block-menu.tsx) |
| BlockMenuBlock | `createDocument` | [src/components/block-menu.tsx:336](../speedy-ts/src/components/block-menu.tsx) |
| BlockMenuBlock | `setBackgroundImage` | [src/components/block-menu.tsx:340](../speedy-ts/src/components/block-menu.tsx) |
| BlockMenuBlock | `setBackgroundVideo` | [src/components/block-menu.tsx:343](../speedy-ts/src/components/block-menu.tsx) |
| BlockMenuBlock | `setBackgroundYouTubeVideo` | [src/components/block-menu.tsx:346](../speedy-ts/src/components/block-menu.tsx) |
| BlockMenuBlock | `setBackgroundWebGLComponent` | [src/components/block-menu.tsx:349](../speedy-ts/src/components/block-menu.tsx) |
| BlockMenuBlock | `render` | [src/components/block-menu.tsx:352](../speedy-ts/src/components/block-menu.tsx) |
| BlockMenuBlock | `destroy` | [src/components/block-menu.tsx:926](../speedy-ts/src/components/block-menu.tsx) |

### Commented/disabled evidence

These are source comments, not installed listeners. They also include relevant intent notes and TODO context. Use the addendum's reachability findings before treating an old commented design as a parity requirement.

- [src/components/block-menu.tsx:864](../speedy-ts/src/components/block-menu.tsx) — // onClick: () =&gt; self.setBackgroundImage(""),

## src/components/context-menu.tsx

Source: [src/components/context-menu.tsx:1](../speedy-ts/src/components/context-menu.tsx). SHA-256: `c793e1909fc92aacdf9b25be5f00a2f5d41c39af1d195d1246b652632c49b2e4`.

Migration family/status: Context-menu overlay/view adapter; generic overlay is not the original menu.

### components-context-menu-listener-01

Source: [src/components/context-menu.tsx:26](../speedy-ts/src/components/context-menu.tsx). Kind: `listener`. Context: `ContextMenu`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
document.addEventListener("mousedown", handleClickOutside)
```

### components-context-menu-listener-02

Source: [src/components/context-menu.tsx:28](../speedy-ts/src/components/context-menu.tsx). Kind: `listener`. Context: `ContextMenu`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
document.removeEventListener("mousedown", handleClickOutside)
```

### components-context-menu-listener-03

Source: [src/components/context-menu.tsx:33](../speedy-ts/src/components/context-menu.tsx). Kind: `listener`. Context: `ContextMenu`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
document.removeEventListener("mousedown", handleClickOutside)
```

### components-context-menu-jsx-01

Source: [src/components/context-menu.tsx:48](../speedy-ts/src/components/context-menu.tsx). Kind: `jsx`. Context: `ContextMenu`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClose={props.onClose}
```

### components-context-menu-jsx-02

Source: [src/components/context-menu.tsx:129](../speedy-ts/src/components/context-menu.tsx). Kind: `jsx`. Context: `MenuItem`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onMouseDown={(e) => e.stopPropagation()}
```

### components-context-menu-jsx-03

Source: [src/components/context-menu.tsx:130](../speedy-ts/src/components/context-menu.tsx). Kind: `jsx`. Context: `MenuItem`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onInput={(e) => setValue(e.currentTarget.value)}
```

### components-context-menu-jsx-04

Source: [src/components/context-menu.tsx:131](../speedy-ts/src/components/context-menu.tsx). Kind: `jsx`. Context: `MenuItem`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onKeyDown={(e) => {
            if (e.key === "Enter") submit();
            e.stopPropagation();
          }}
```

### components-context-menu-jsx-05

Source: [src/components/context-menu.tsx:140](../speedy-ts/src/components/context-menu.tsx). Kind: `jsx`. Context: `MenuItem`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick={submit}
```

### components-context-menu-jsx-06

Source: [src/components/context-menu.tsx:170](../speedy-ts/src/components/context-menu.tsx). Kind: `jsx`. Context: `MenuItem`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onChange={() => {setValue(opt.value); submit() }}
```

### components-context-menu-jsx-07

Source: [src/components/context-menu.tsx:185](../speedy-ts/src/components/context-menu.tsx). Kind: `jsx`. Context: `MenuItem`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onMouseEnter={() => {
        clearTimeout(submenuCloseTimeouts.get(props.level) ?? 0);
        setOpen(true);
      }}
```

### components-context-menu-jsx-08

Source: [src/components/context-menu.tsx:189](../speedy-ts/src/components/context-menu.tsx). Kind: `jsx`. Context: `MenuItem`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onMouseLeave={() => {
        const timeoutId = window.setTimeout(() => {
          setOpen(false);
        }, 300);
        submenuCloseTimeouts.set(props.level, timeoutId);
      }}
```

### components-context-menu-jsx-09

Source: [src/components/context-menu.tsx:201](../speedy-ts/src/components/context-menu.tsx). Kind: `jsx`. Context: `MenuItem`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick={(e) => {
          if (!item.disabled && item.onClick) {
            item.onClick();
            //setTimeout(() => props.onClose(), 100);
          }
        }}
```

### components-context-menu-jsx-10

Source: [src/components/context-menu.tsx:223](../speedy-ts/src/components/context-menu.tsx). Kind: `jsx`. Context: `MenuItem`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onMouseEnter={() => clearTimeout(closeTimeout)}
```

### components-context-menu-jsx-11

Source: [src/components/context-menu.tsx:224](../speedy-ts/src/components/context-menu.tsx). Kind: `jsx`. Context: `MenuItem`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onMouseLeave={() => {
            closeTimeout = window.setTimeout(() => {
              setOpen(false);
            }, 300);
          }}
```

### components-context-menu-jsx-12

Source: [src/components/context-menu.tsx:235](../speedy-ts/src/components/context-menu.tsx). Kind: `jsx`. Context: `MenuItem`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClose={props.onClose}
```

### Named implementation index

This index intentionally includes helper methods as well as handlers. Resolve named calls in the entries above here; methods with no caller/binding are **not** automatically live commands. Shared support methods may be implemented in another indexed file (notably AbstractBlock, DocumentBlock, UniverseBlock, StandoffProperty and SVG helpers).

| Context | Callable | Source |
| --- | --- | --- |
|  | `ContextMenu` | [src/components/context-menu.tsx:14](../speedy-ts/src/components/context-menu.tsx) |
| ContextMenu | `handleClickOutside` | [src/components/context-menu.tsx:17](../speedy-ts/src/components/context-menu.tsx) |
|  | `MenuItem` | [src/components/context-menu.tsx:95](../speedy-ts/src/components/context-menu.tsx) |
| MenuItem | `submit` | [src/components/context-menu.tsx:115](../speedy-ts/src/components/context-menu.tsx) |
| MenuItem | `submit` | [src/components/context-menu.tsx:152](../speedy-ts/src/components/context-menu.tsx) |

### Commented/disabled evidence

These are source comments, not installed listeners. They also include relevant intent notes and TODO context. Use the addendum's reachability findings before treating an old commented design as a parity requirement.

- [src/components/context-menu.tsx:99](../speedy-ts/src/components/context-menu.tsx) — // Handle separators early
- [src/components/context-menu.tsx:104](../speedy-ts/src/components/context-menu.tsx) — // Handle input field items
- [src/components/context-menu.tsx:148](../speedy-ts/src/components/context-menu.tsx) — // Handle input field items
- [src/components/context-menu.tsx:179](../speedy-ts/src/components/context-menu.tsx) — // Handle standard items
- [src/components/context-menu.tsx:204](../speedy-ts/src/components/context-menu.tsx) — //setTimeout(() =&gt; props.onClose(), 100);

## src/components/control-panel.tsx

Source: [src/components/control-panel.tsx:1](../speedy-ts/src/components/control-panel.tsx). SHA-256: `6262e8df5f070d946ba1bc791b2e0af022aa35d4919969c29f3651353e359a3c`.

Migration family/status: Workspace/file-control controller; original control panel not ported.

Classes: `ControlPanelBlock` (extends AbstractBlock).

### components-control-panel-jsx-01

Source: [src/components/control-panel.tsx:401](../speedy-ts/src/components/control-panel.tsx). Kind: `jsx`. Context: `ControlPanelBlock.render.ControlPanel`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick={createNewDocumentClicked}
```

### components-control-panel-jsx-02

Source: [src/components/control-panel.tsx:404](../speedy-ts/src/components/control-panel.tsx). Kind: `jsx`. Context: `ControlPanelBlock.render.ControlPanel`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onChange={folderChanged}
```

### components-control-panel-jsx-03

Source: [src/components/control-panel.tsx:411](../speedy-ts/src/components/control-panel.tsx). Kind: `jsx`. Context: `ControlPanelBlock.render.ControlPanel`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick={loadFolderClicked}
```

### components-control-panel-jsx-04

Source: [src/components/control-panel.tsx:414](../speedy-ts/src/components/control-panel.tsx). Kind: `jsx`. Context: `ControlPanelBlock.render.ControlPanel`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onChange={fileChanged}
```

### components-control-panel-jsx-05

Source: [src/components/control-panel.tsx:421](../speedy-ts/src/components/control-panel.tsx). Kind: `jsx`. Context: `ControlPanelBlock.render.ControlPanel`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick={loadSelectedFileClicked}
```

### components-control-panel-jsx-06

Source: [src/components/control-panel.tsx:424](../speedy-ts/src/components/control-panel.tsx). Kind: `jsx`. Context: `ControlPanelBlock.render.ControlPanel`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onInput={(e) => setModel("template", e.currentTarget.value)}
```

### components-control-panel-jsx-07

Source: [src/components/control-panel.tsx:431](../speedy-ts/src/components/control-panel.tsx). Kind: `jsx`. Context: `ControlPanelBlock.render.ControlPanel`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick={loadSelectedTemplateClicked}
```

### components-control-panel-jsx-08

Source: [src/components/control-panel.tsx:434](../speedy-ts/src/components/control-panel.tsx). Kind: `jsx`. Context: `ControlPanelBlock.render.ControlPanel`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onInput={(e) => setModel("workspace", e.currentTarget.value)}
```

### components-control-panel-jsx-09

Source: [src/components/control-panel.tsx:441](../speedy-ts/src/components/control-panel.tsx). Kind: `jsx`. Context: `ControlPanelBlock.render.ControlPanel`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick={loadSelectedWorkspaceClicked}
```

### Named implementation index

This index intentionally includes helper methods as well as handlers. Resolve named calls in the entries above here; methods with no caller/binding are **not** automatically live commands. Shared support methods may be implemented in another indexed file (notably AbstractBlock, DocumentBlock, UniverseBlock, StandoffProperty and SVG helpers).

| Context | Callable | Source |
| --- | --- | --- |
| ControlPanelBlock | `render` | [src/components/control-panel.tsx:40](../speedy-ts/src/components/control-panel.tsx) |
| ControlPanelBlock.render | `onWorkspaceSourceSubmit` | [src/components/control-panel.tsx:59](../speedy-ts/src/components/control-panel.tsx) |
| ControlPanelBlock.render | `onSubmit` | [src/components/control-panel.tsx:64](../speedy-ts/src/components/control-panel.tsx) |
| ControlPanelBlock.render | `embedDocument` | [src/components/control-panel.tsx:68](../speedy-ts/src/components/control-panel.tsx) |
| ControlPanelBlock.render | `loadMicroDocument` | [src/components/control-panel.tsx:75](../speedy-ts/src/components/control-panel.tsx) |
| ControlPanelBlock.render | `load` | [src/components/control-panel.tsx:91](../speedy-ts/src/components/control-panel.tsx) |
| ControlPanelBlock.render | `loadTemplate` | [src/components/control-panel.tsx:96](../speedy-ts/src/components/control-panel.tsx) |
| ControlPanelBlock.render | `loadWorkspace` | [src/components/control-panel.tsx:101](../speedy-ts/src/components/control-panel.tsx) |
| ControlPanelBlock.render | `save` | [src/components/control-panel.tsx:106](../speedy-ts/src/components/control-panel.tsx) |
| ControlPanelBlock.render | `listDocuments` | [src/components/control-panel.tsx:114](../speedy-ts/src/components/control-panel.tsx) |
| ControlPanelBlock.render | `listTemplates` | [src/components/control-panel.tsx:119](../speedy-ts/src/components/control-panel.tsx) |
| ControlPanelBlock.render | `loadFolderClicked` | [src/components/control-panel.tsx:124](../speedy-ts/src/components/control-panel.tsx) |
| ControlPanelBlock.render | `loadSelectedFileClicked` | [src/components/control-panel.tsx:130](../speedy-ts/src/components/control-panel.tsx) |
| ControlPanelBlock.render | `loadSelectedTemplateClicked` | [src/components/control-panel.tsx:134](../speedy-ts/src/components/control-panel.tsx) |
| ControlPanelBlock.render | `loadSelectedBackgroundClicked` | [src/components/control-panel.tsx:138](../speedy-ts/src/components/control-panel.tsx) |
| ControlPanelBlock.render | `loadSelectedWorkspaceClicked` | [src/components/control-panel.tsx:149](../speedy-ts/src/components/control-panel.tsx) |
| ControlPanelBlock.render | `createCodeMirrorBlock` | [src/components/control-panel.tsx:153](../speedy-ts/src/components/control-panel.tsx) |
| ControlPanelBlock.render | `createNewDocumentClicked` | [src/components/control-panel.tsx:159](../speedy-ts/src/components/control-panel.tsx) |
| ControlPanelBlock.render | `saveWorkspace` | [src/components/control-panel.tsx:163](../speedy-ts/src/components/control-panel.tsx) |
| ControlPanelBlock.render | `createDocument` | [src/components/control-panel.tsx:166](../speedy-ts/src/components/control-panel.tsx) |
| ControlPanelBlock.render | `setBackgroundColour` | [src/components/control-panel.tsx:173](../speedy-ts/src/components/control-panel.tsx) |
| ControlPanelBlock.render | `setBackgroundImage` | [src/components/control-panel.tsx:182](../speedy-ts/src/components/control-panel.tsx) |
| ControlPanelBlock.render | `setFontColour` | [src/components/control-panel.tsx:192](../speedy-ts/src/components/control-panel.tsx) |
| ControlPanelBlock.render | `addImage` | [src/components/control-panel.tsx:201](../speedy-ts/src/components/control-panel.tsx) |
| ControlPanelBlock.render | `addImageRight` | [src/components/control-panel.tsx:207](../speedy-ts/src/components/control-panel.tsx) |
| ControlPanelBlock.render | `addImageLeft` | [src/components/control-panel.tsx:213](../speedy-ts/src/components/control-panel.tsx) |
| ControlPanelBlock.render | `addVideo` | [src/components/control-panel.tsx:219](../speedy-ts/src/components/control-panel.tsx) |
| ControlPanelBlock.render | `addIFrame` | [src/components/control-panel.tsx:225](../speedy-ts/src/components/control-panel.tsx) |
| ControlPanelBlock.render | `createGrid` | [src/components/control-panel.tsx:231](../speedy-ts/src/components/control-panel.tsx) |
| ControlPanelBlock.render | `createTable` | [src/components/control-panel.tsx:241](../speedy-ts/src/components/control-panel.tsx) |
| ControlPanelBlock.render | `setTabName` | [src/components/control-panel.tsx:251](../speedy-ts/src/components/control-panel.tsx) |
| ControlPanelBlock.render | `addTab` | [src/components/control-panel.tsx:260](../speedy-ts/src/components/control-panel.tsx) |
| ControlPanelBlock.render | `collapse` | [src/components/control-panel.tsx:268](../speedy-ts/src/components/control-panel.tsx) |
| ControlPanelBlock.render | `expand` | [src/components/control-panel.tsx:273](../speedy-ts/src/components/control-panel.tsx) |
| ControlPanelBlock.render | `mergeNext` | [src/components/control-panel.tsx:278](../speedy-ts/src/components/control-panel.tsx) |
| ControlPanelBlock.render | `split` | [src/components/control-panel.tsx:286](../speedy-ts/src/components/control-panel.tsx) |
| ControlPanelBlock.render | `swapGridCells` | [src/components/control-panel.tsx:293](../speedy-ts/src/components/control-panel.tsx) |
| ControlPanelBlock.render | `setMultiColumns` | [src/components/control-panel.tsx:307](../speedy-ts/src/components/control-panel.tsx) |
| ControlPanelBlock.render | `explodeTabs` | [src/components/control-panel.tsx:311](../speedy-ts/src/components/control-panel.tsx) |
| ControlPanelBlock.render | `testLoadDocument` | [src/components/control-panel.tsx:315](../speedy-ts/src/components/control-panel.tsx) |
| ControlPanelBlock.render | `newTabRow` | [src/components/control-panel.tsx:318](../speedy-ts/src/components/control-panel.tsx) |
| ControlPanelBlock.render | `makeCheckbox` | [src/components/control-panel.tsx:322](../speedy-ts/src/components/control-panel.tsx) |
| ControlPanelBlock.render | `moveBlockUp` | [src/components/control-panel.tsx:327](../speedy-ts/src/components/control-panel.tsx) |
| ControlPanelBlock.render | `moveBlockDown` | [src/components/control-panel.tsx:332](../speedy-ts/src/components/control-panel.tsx) |
| ControlPanelBlock.render | `toTab` | [src/components/control-panel.tsx:337](../speedy-ts/src/components/control-panel.tsx) |
| ControlPanelBlock.render | `runCommand` | [src/components/control-panel.tsx:342](../speedy-ts/src/components/control-panel.tsx) |
| ControlPanelBlock.render | `folderChanged` | [src/components/control-panel.tsx:385](../speedy-ts/src/components/control-panel.tsx) |
| ControlPanelBlock.render | `fileChanged` | [src/components/control-panel.tsx:392](../speedy-ts/src/components/control-panel.tsx) |
| ControlPanelBlock.render | `ControlPanel` | [src/components/control-panel.tsx:397](../speedy-ts/src/components/control-panel.tsx) |
| ControlPanelBlock | `serialize` | [src/components/control-panel.tsx:470](../speedy-ts/src/components/control-panel.tsx) |
| ControlPanelBlock | `deserialize` | [src/components/control-panel.tsx:473](../speedy-ts/src/components/control-panel.tsx) |
| ControlPanelBlock | `destroy` | [src/components/control-panel.tsx:476](../speedy-ts/src/components/control-panel.tsx) |

### Commented/disabled evidence

These are source comments, not installed listeners. They also include relevant intent notes and TODO context. Use the addendum's reachability findings before treating an old commented design as a parity requirement.

- [src/components/control-panel.tsx:365](../speedy-ts/src/components/control-panel.tsx) — // case "collapse": collapse(); return;
- [src/components/control-panel.tsx:366](../speedy-ts/src/components/control-panel.tsx) — // case "expand": expand(); return;

## src/components/find-replace.tsx

Source: [src/components/find-replace.tsx:1](../speedy-ts/src/components/find-replace.tsx). SHA-256: `5b99cff9ef47d2bd63030eb7a516be2bb0fd0413bc848435a46ab14c191a7b0c`.

Migration family/status: Find/replace session controller and mapped replacement commands; not ported.

Classes: `FindReplaceBlock` (extends AbstractBlock).

Binding installation/override sites (first source line; inspect surrounding constructor/factory):

- [src/components/find-replace.tsx:75](../speedy-ts/src/components/find-replace.tsx) — `FindReplaceBlock.render`: `this.inputEvents.push({`

### components-find-replace-binding-01

Source: [src/components/find-replace.tsx:75](../speedy-ts/src/components/find-replace.tsx). Kind: `binding`. Context: `FindReplaceBlock.render`.

Route: the owning Block's binding list, subject to actual factory installation, mode/trigger matching and origin-to-owner dispatch. Destination/status: the file's migration family above; unresolved until individually qualified.

```tsx
{
            mode: "default",
            trigger: {
                source: InputEventSource.Keyboard,
                match: "Escape"
            },
            action: {
                name: "Close the find-replace modal.",
                description: `
                    
                `,
                handler: async (args) => {
                    clearHighlights();
                    self.close();
                }
            }
        }
```

### components-find-replace-binding-02

Source: [src/components/find-replace.tsx:92](../speedy-ts/src/components/find-replace.tsx). Kind: `binding`. Context: `FindReplaceBlock.render`.

Route: the owning Block's binding list, subject to actual factory installation, mode/trigger matching and origin-to-owner dispatch. Destination/status: the file's migration family above; unresolved until individually qualified.

```tsx
{
            mode: "default",
            trigger: {
                source: InputEventSource.Keyboard,
                match: "Control-H"
            },
            action: {
                name: "Replace mode.",
                description: `
                    
                `,
                handler: async (args) => {
                    if (mode() == Mode.Find) {
                        setMode(Mode.Replace);
                    } else {
                        setMode(Mode.Find);
                    }
                }
            }
        }
```

### components-find-replace-binding-03

Source: [src/components/find-replace.tsx:112](../speedy-ts/src/components/find-replace.tsx). Kind: `binding`. Context: `FindReplaceBlock.render`.

Route: the owning Block's binding list, subject to actual factory installation, mode/trigger matching and origin-to-owner dispatch. Destination/status: the file's migration family above; unresolved until individually qualified.

```tsx
{
            mode: "default",
            trigger: {
                source: InputEventSource.Keyboard,
                match: "Enter"
            },
            action: {
                name: "Replace current item.",
                description: `
                    
                `,
                handler: async (args) => {
                    if (!model.replaceText) return;
                    if (mode() == Mode.Find) {
                        moveDown();
                    } else {
                        replaceCurrent();
                        moveDown();
                    }
                }
            }
        }
```

### components-find-replace-binding-04

Source: [src/components/find-replace.tsx:134](../speedy-ts/src/components/find-replace.tsx). Kind: `binding`. Context: `FindReplaceBlock.render`.

Route: the owning Block's binding list, subject to actual factory installation, mode/trigger matching and origin-to-owner dispatch. Destination/status: the file's migration family above; unresolved until individually qualified.

```tsx
{
            mode: "default",
            trigger: {
                source: InputEventSource.Keyboard,
                match: "Meta-Enter"
            },
            action: {
                name: "Replace all.",
                description: `
                    
                `,
                handler: async (args) => {
                    replaceAll();
                }
            }
        }
```

### components-find-replace-jsx-01

Source: [src/components/find-replace.tsx:244](../speedy-ts/src/components/find-replace.tsx). Kind: `jsx`. Context: `FindReplaceBlock.render.SearchEntitiesWindow`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onSubmit={handleSubmit}
```

### components-find-replace-jsx-02

Source: [src/components/find-replace.tsx:254](../speedy-ts/src/components/find-replace.tsx). Kind: `jsx`. Context: `FindReplaceBlock.render.SearchEntitiesWindow`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onInput={onFind}
```

### components-find-replace-jsx-03

Source: [src/components/find-replace.tsx:259](../speedy-ts/src/components/find-replace.tsx). Kind: `jsx`. Context: `FindReplaceBlock.render.SearchEntitiesWindow`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick={upClicked}
```

### components-find-replace-jsx-04

Source: [src/components/find-replace.tsx:260](../speedy-ts/src/components/find-replace.tsx). Kind: `jsx`. Context: `FindReplaceBlock.render.SearchEntitiesWindow`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick={downClicked}
```

### components-find-replace-jsx-05

Source: [src/components/find-replace.tsx:261](../speedy-ts/src/components/find-replace.tsx). Kind: `jsx`. Context: `FindReplaceBlock.render.SearchEntitiesWindow`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick={clearClicked}
```

### components-find-replace-jsx-06

Source: [src/components/find-replace.tsx:270](../speedy-ts/src/components/find-replace.tsx). Kind: `jsx`. Context: `FindReplaceBlock.render.SearchEntitiesWindow`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onInput={(e) => setModel("replaceText", e.currentTarget.value)}
```

### components-find-replace-jsx-07

Source: [src/components/find-replace.tsx:272](../speedy-ts/src/components/find-replace.tsx). Kind: `jsx`. Context: `FindReplaceBlock.render.SearchEntitiesWindow`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick={replaceNextClicked}
```

### components-find-replace-jsx-08

Source: [src/components/find-replace.tsx:273](../speedy-ts/src/components/find-replace.tsx). Kind: `jsx`. Context: `FindReplaceBlock.render.SearchEntitiesWindow`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick={replaceAllClicked}
```

### components-find-replace-jsx-09

Source: [src/components/find-replace.tsx:277](../speedy-ts/src/components/find-replace.tsx). Kind: `jsx`. Context: `FindReplaceBlock.render.SearchEntitiesWindow`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick={handleClose}
```

### Named implementation index

This index intentionally includes helper methods as well as handlers. Resolve named calls in the entries above here; methods with no caller/binding are **not** automatically live commands. Shared support methods may be implemented in another indexed file (notably AbstractBlock, DocumentBlock, UniverseBlock, StandoffProperty and SVG helpers).

| Context | Callable | Source |
| --- | --- | --- |
| FindReplaceBlock | `close` | [src/components/find-replace.tsx:32](../speedy-ts/src/components/find-replace.tsx) |
| FindReplaceBlock | `findMatches` | [src/components/find-replace.tsx:37](../speedy-ts/src/components/find-replace.tsx) |
| FindReplaceBlock | `removeHighlights` | [src/components/find-replace.tsx:49](../speedy-ts/src/components/find-replace.tsx) |
| FindReplaceBlock | `applyHighlights` | [src/components/find-replace.tsx:53](../speedy-ts/src/components/find-replace.tsx) |
| FindReplaceBlock | `replace` | [src/components/find-replace.tsx:70](../speedy-ts/src/components/find-replace.tsx) |
| FindReplaceBlock | `render` | [src/components/find-replace.tsx:73](../speedy-ts/src/components/find-replace.tsx) |
| FindReplaceBlock.render | `replaceAll` | [src/components/find-replace.tsx:150](../speedy-ts/src/components/find-replace.tsx) |
| FindReplaceBlock.render | `replaceCurrent` | [src/components/find-replace.tsx:157](../speedy-ts/src/components/find-replace.tsx) |
| FindReplaceBlock.render | `handleClose` | [src/components/find-replace.tsx:170](../speedy-ts/src/components/find-replace.tsx) |
| FindReplaceBlock.render | `setMatchFocus` | [src/components/find-replace.tsx:175](../speedy-ts/src/components/find-replace.tsx) |
| FindReplaceBlock.render | `upClicked` | [src/components/find-replace.tsx:179](../speedy-ts/src/components/find-replace.tsx) |
| FindReplaceBlock.render | `moveUp` | [src/components/find-replace.tsx:183](../speedy-ts/src/components/find-replace.tsx) |
| FindReplaceBlock.render | `moveDown` | [src/components/find-replace.tsx:191](../speedy-ts/src/components/find-replace.tsx) |
| FindReplaceBlock.render | `downClicked` | [src/components/find-replace.tsx:199](../speedy-ts/src/components/find-replace.tsx) |
| FindReplaceBlock.render | `onFind` | [src/components/find-replace.tsx:203](../speedy-ts/src/components/find-replace.tsx) |
| FindReplaceBlock.render | `handleSubmit` | [src/components/find-replace.tsx:213](../speedy-ts/src/components/find-replace.tsx) |
| FindReplaceBlock.render | `clearHighlights` | [src/components/find-replace.tsx:216](../speedy-ts/src/components/find-replace.tsx) |
| FindReplaceBlock.render | `clearClicked` | [src/components/find-replace.tsx:221](../speedy-ts/src/components/find-replace.tsx) |
| FindReplaceBlock.render | `replaceNextClicked` | [src/components/find-replace.tsx:226](../speedy-ts/src/components/find-replace.tsx) |
| FindReplaceBlock.render | `replaceAllClicked` | [src/components/find-replace.tsx:230](../speedy-ts/src/components/find-replace.tsx) |
| FindReplaceBlock.render | `SearchEntitiesWindow` | [src/components/find-replace.tsx:240](../speedy-ts/src/components/find-replace.tsx) |
| FindReplaceBlock | `serialize` | [src/components/find-replace.tsx:288](../speedy-ts/src/components/find-replace.tsx) |
| FindReplaceBlock | `deserialize` | [src/components/find-replace.tsx:291](../speedy-ts/src/components/find-replace.tsx) |
| FindReplaceBlock | `destroy` | [src/components/find-replace.tsx:294](../speedy-ts/src/components/find-replace.tsx) |

## src/components/search-entities.tsx

Source: [src/components/search-entities.tsx:1](../speedy-ts/src/components/search-entities.tsx). SHA-256: `651fdcb0ac2bf4f79f5b1fc36e3349b392cb6e7c6168c638c6a30ed10be69ed3`.

Migration family/status: Entity-search session controller and async commands; placeholder overlay is not parity.

Classes: `SearchEntitiesBlock` (extends AbstractBlock).

Binding installation/override sites (first source line; inspect surrounding constructor/factory):

- [src/components/search-entities.tsx:73](../speedy-ts/src/components/search-entities.tsx) — `SearchEntitiesBlock.render`: `this.inputEvents.push(`

### components-search-entities-binding-01

Source: [src/components/search-entities.tsx:74](../speedy-ts/src/components/search-entities.tsx). Kind: `binding`. Context: `SearchEntitiesBlock.render`.

Route: the owning Block's binding list, subject to actual factory installation, mode/trigger matching and origin-to-owner dispatch. Destination/status: the file's migration family above; unresolved until individually qualified.

```tsx
{
                mode: "default",
                trigger: {
                    source: InputEventSource.Keyboard,
                    match: "Control-A"
                },
                action: {
                    name: "Select all matches of the text in all text blocks.",
                    description: `
                        
                    `,
                    handler: async (args) => {
                        const _text = self.source.getText();
                        const text = _text.substring(self.selection.start.index, self.selection.end.index + 1);
                        const find = new FindReplaceBlock({ source: self.source, manager: self.source!.manager as UniverseBlock });
                        const matches = self.matches = find.findMatches(text) as FindMatch[];
                        matches.forEach(m => m.block.removeStandoffPropertiesByType("codex/search/highlight"));
                        matches.forEach(m => find.applyHighlights(m.block, [m]));
                    }
                }
            }
```

### components-search-entities-binding-02

Source: [src/components/search-entities.tsx:95](../speedy-ts/src/components/search-entities.tsx). Kind: `binding`. Context: `SearchEntitiesBlock.render`.

Route: the owning Block's binding list, subject to actual factory installation, mode/trigger matching and origin-to-owner dispatch. Destination/status: the file's migration family above; unresolved until individually qualified.

```tsx
{
                mode: "default",
                trigger: {
                    source: InputEventSource.Keyboard,
                    match: "Control-Backspace"
                },
                action: {
                    name: "Clear the search field.",
                    description: `
                        
                    `,
                    handler: async (args) => {
                        setModel("search", "");
                        await searchGraph(model.search);
                    }
                }
            }
```

### components-search-entities-binding-03

Source: [src/components/search-entities.tsx:112](../speedy-ts/src/components/search-entities.tsx). Kind: `binding`. Context: `SearchEntitiesBlock.render`.

Route: the owning Block's binding list, subject to actual factory installation, mode/trigger matching and origin-to-owner dispatch. Destination/status: the file's migration family above; unresolved until individually qualified.

```tsx
{
                mode: "default",
                trigger: {
                    source: InputEventSource.Keyboard,
                    match: "Enter"
                },
                action: {
                    name: "Select the current entity.",
                    description: `
                        
                    `,
                    handler: async (args) => {
                        const item = search[currentResultIndex()];
                        if (self.onBulkSubmit) {
                            self.onBulkSubmit({
                                Text: item.name, Value: item.id
                            }, self.matches);
                            self.close();
                            return;
                        }
                        self.onSelected({
                            Text: item.name, Value: item.id
                        });
                        self.close();
                    }
                }
            }
```

### components-search-entities-binding-04

Source: [src/components/search-entities.tsx:139](../speedy-ts/src/components/search-entities.tsx). Kind: `binding`. Context: `SearchEntitiesBlock.render`.

Route: the owning Block's binding list, subject to actual factory installation, mode/trigger matching and origin-to-owner dispatch. Destination/status: the file's migration family above; unresolved until individually qualified.

```tsx
{
                mode: "default",
                trigger: {
                    source: InputEventSource.Keyboard,
                    match: "Escape"
                },
                action: {
                    name: "Quit the entity search.",
                    description: `
                        
                    `,
                    handler: async (args) => {
                        self.close();
                    }
                }
            }
```

### components-search-entities-binding-05

Source: [src/components/search-entities.tsx:155](../speedy-ts/src/components/search-entities.tsx). Kind: `binding`. Context: `SearchEntitiesBlock.render`.

Route: the owning Block's binding list, subject to actual factory installation, mode/trigger matching and origin-to-owner dispatch. Destination/status: the file's migration family above; unresolved until individually qualified.

```tsx
{
                mode: "default",
                trigger: {
                    source: InputEventSource.Keyboard,
                    match: "ArrowDown"
                },
                action: {
                    name: "Go down one item in the search results",
                    description: `
                        
                    `,
                    handler: async (args) => {
                        const len = search.Results.length;
                        if (currentResultIndex() == len -1) {
                            setCurrentResultIndex(0);
                            return;
                        }
                        setCurrentResultIndex(currentResultIndex()+1);
                    }
                }
            }
```

### components-search-entities-binding-06

Source: [src/components/search-entities.tsx:176](../speedy-ts/src/components/search-entities.tsx). Kind: `binding`. Context: `SearchEntitiesBlock.render`.

Route: the owning Block's binding list, subject to actual factory installation, mode/trigger matching and origin-to-owner dispatch. Destination/status: the file's migration family above; unresolved until individually qualified.

```tsx
{
                mode: "default",
                trigger: {
                    source: InputEventSource.Keyboard,
                    match: "ArrowUp"
                },
                action: {
                    name: "Go up one item in the search results",
                    description: `
                        
                    `,
                    handler: async (args) => {
                        const len = search.Results.length;
                        if (currentResultIndex() == 0) {
                            setCurrentResultIndex(len-1);
                            return;
                        }
                        setCurrentResultIndex(currentResultIndex()-1);
                    }
                }
            }
```

### components-search-entities-jsx-01

Source: [src/components/search-entities.tsx:318](../speedy-ts/src/components/search-entities.tsx). Kind: `jsx`. Context: `SearchEntitiesBlock.render.SearchEntitiesWindow`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onSubmit={handleSubmit}
```

### components-search-entities-jsx-02

Source: [src/components/search-entities.tsx:329](../speedy-ts/src/components/search-entities.tsx). Kind: `jsx`. Context: `SearchEntitiesBlock.render.SearchEntitiesWindow`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onInput={onSearchChanged}
```

### components-search-entities-jsx-03

Source: [src/components/search-entities.tsx:335](../speedy-ts/src/components/search-entities.tsx). Kind: `jsx`. Context: `SearchEntitiesBlock.render.SearchEntitiesWindow`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onInput={toggleByAlias}
```

### components-search-entities-jsx-04

Source: [src/components/search-entities.tsx:346](../speedy-ts/src/components/search-entities.tsx). Kind: `jsx`. Context: `SearchEntitiesBlock.render.SearchEntitiesWindow`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onInput={toggleByPartial}
```

### components-search-entities-jsx-05

Source: [src/components/search-entities.tsx:354](../speedy-ts/src/components/search-entities.tsx). Kind: `jsx`. Context: `SearchEntitiesBlock.render.SearchEntitiesWindow`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick={handleClose}
```

### components-search-entities-jsx-06

Source: [src/components/search-entities.tsx:372](../speedy-ts/src/components/search-entities.tsx). Kind: `jsx`. Context: `SearchEntitiesBlock.render.SearchEntitiesWindow`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick={(e) => { e.preventDefault(); onSelectFromList(item); }}
```

### Named implementation index

This index intentionally includes helper methods as well as handlers. Resolve named calls in the entries above here; methods with no caller/binding are **not** automatically live commands. Shared support methods may be implemented in another indexed file (notably AbstractBlock, DocumentBlock, UniverseBlock, StandoffProperty and SVG helpers).

| Context | Callable | Source |
| --- | --- | --- |
| SearchEntitiesBlock | `close` | [src/components/search-entities.tsx:58](../speedy-ts/src/components/search-entities.tsx) |
| SearchEntitiesBlock | `onSelected` | [src/components/search-entities.tsx:64](../speedy-ts/src/components/search-entities.tsx) |
| SearchEntitiesBlock | `render` | [src/components/search-entities.tsx:71](../speedy-ts/src/components/search-entities.tsx) |
| SearchEntitiesBlock.render | `searchGraph` | [src/components/search-entities.tsx:213](../speedy-ts/src/components/search-entities.tsx) |
| SearchEntitiesBlock.render | `addToGraph` | [src/components/search-entities.tsx:239](../speedy-ts/src/components/search-entities.tsx) |
| SearchEntitiesBlock.render | `onSearchChanged` | [src/components/search-entities.tsx:257](../speedy-ts/src/components/search-entities.tsx) |
| SearchEntitiesBlock.render | `addEntity` | [src/components/search-entities.tsx:267](../speedy-ts/src/components/search-entities.tsx) |
| SearchEntitiesBlock.render | `onSelectFromList` | [src/components/search-entities.tsx:273](../speedy-ts/src/components/search-entities.tsx) |
| SearchEntitiesBlock.render | `handleClose` | [src/components/search-entities.tsx:285](../speedy-ts/src/components/search-entities.tsx) |
| SearchEntitiesBlock.render | `toggleByAlias` | [src/components/search-entities.tsx:289](../speedy-ts/src/components/search-entities.tsx) |
| SearchEntitiesBlock.render | `toggleByPartial` | [src/components/search-entities.tsx:294](../speedy-ts/src/components/search-entities.tsx) |
| SearchEntitiesBlock.render | `handleSubmit` | [src/components/search-entities.tsx:299](../speedy-ts/src/components/search-entities.tsx) |
| SearchEntitiesBlock.render | `SearchEntitiesWindow` | [src/components/search-entities.tsx:314](../speedy-ts/src/components/search-entities.tsx) |
| SearchEntitiesBlock | `removeFocus` | [src/components/search-entities.tsx:397](../speedy-ts/src/components/search-entities.tsx) |
| SearchEntitiesBlock | `setFocus` | [src/components/search-entities.tsx:400](../speedy-ts/src/components/search-entities.tsx) |
| SearchEntitiesBlock | `serialize` | [src/components/search-entities.tsx:405](../speedy-ts/src/components/search-entities.tsx) |
| SearchEntitiesBlock | `deserialize` | [src/components/search-entities.tsx:408](../speedy-ts/src/components/search-entities.tsx) |
| SearchEntitiesBlock | `destroy` | [src/components/search-entities.tsx:411](../speedy-ts/src/components/search-entities.tsx) |

## src/components/style-bar.tsx

Source: [src/components/style-bar.tsx:1](../speedy-ts/src/components/style-bar.tsx). SHA-256: `b7e209a36f81ac391b22c6f1403daa356084418d1facb70992b92dcbc074ac17`.

Migration family/status: StyleBar focus-preserving controller and formatting commands; not ported.

Classes: `StyleBarBlock` (extends AbstractBlock).

### components-style-bar-jsx-01

Source: [src/components/style-bar.tsx:88](../speedy-ts/src/components/style-bar.tsx). Kind: `jsx`. Context: `StyleBar`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick={onBoldClicked}
```

### components-style-bar-jsx-02

Source: [src/components/style-bar.tsx:89](../speedy-ts/src/components/style-bar.tsx). Kind: `jsx`. Context: `StyleBar`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick={onItalicsClicked}
```

### components-style-bar-jsx-03

Source: [src/components/style-bar.tsx:91](../speedy-ts/src/components/style-bar.tsx). Kind: `jsx`. Context: `StyleBar`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick={onAlignLeftClicked}
```

### components-style-bar-jsx-04

Source: [src/components/style-bar.tsx:92](../speedy-ts/src/components/style-bar.tsx). Kind: `jsx`. Context: `StyleBar`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick={onAlignCenterClicked}
```

### components-style-bar-jsx-05

Source: [src/components/style-bar.tsx:93](../speedy-ts/src/components/style-bar.tsx). Kind: `jsx`. Context: `StyleBar`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick={onAlignRightClicked}
```

### components-style-bar-jsx-06

Source: [src/components/style-bar.tsx:94](../speedy-ts/src/components/style-bar.tsx). Kind: `jsx`. Context: `StyleBar`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick={onAlignJustifyClicked}
```

### components-style-bar-jsx-07

Source: [src/components/style-bar.tsx:96](../speedy-ts/src/components/style-bar.tsx). Kind: `jsx`. Context: `StyleBar`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick={onH1Clicked}
```

### components-style-bar-jsx-08

Source: [src/components/style-bar.tsx:97](../speedy-ts/src/components/style-bar.tsx). Kind: `jsx`. Context: `StyleBar`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick={onH2Clicked}
```

### components-style-bar-jsx-09

Source: [src/components/style-bar.tsx:98](../speedy-ts/src/components/style-bar.tsx). Kind: `jsx`. Context: `StyleBar`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick={onH3Clicked}
```

### components-style-bar-jsx-10

Source: [src/components/style-bar.tsx:99](../speedy-ts/src/components/style-bar.tsx). Kind: `jsx`. Context: `StyleBar`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick={onH4Clicked}
```

### components-style-bar-jsx-11

Source: [src/components/style-bar.tsx:101](../speedy-ts/src/components/style-bar.tsx). Kind: `jsx`. Context: `StyleBar`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick={onFontColourClicked}
```

### components-style-bar-jsx-12

Source: [src/components/style-bar.tsx:102](../speedy-ts/src/components/style-bar.tsx). Kind: `jsx`. Context: `StyleBar`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick={onBackgroundColourClicked}
```

### components-style-bar-jsx-13

Source: [src/components/style-bar.tsx:104](../speedy-ts/src/components/style-bar.tsx). Kind: `jsx`. Context: `StyleBar`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick={onAddOrIncreaseIndentClicked}
```

### components-style-bar-jsx-14

Source: [src/components/style-bar.tsx:105](../speedy-ts/src/components/style-bar.tsx). Kind: `jsx`. Context: `StyleBar`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick={onAddOrDecreaseIndentClicked}
```

### components-style-bar-jsx-15

Source: [src/components/style-bar.tsx:107](../speedy-ts/src/components/style-bar.tsx). Kind: `jsx`. Context: `StyleBar`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick={onRotateRightClicked}
```

### components-style-bar-jsx-16

Source: [src/components/style-bar.tsx:108](../speedy-ts/src/components/style-bar.tsx). Kind: `jsx`. Context: `StyleBar`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick={onRotateLeftClicked}
```

### components-style-bar-jsx-17

Source: [src/components/style-bar.tsx:110](../speedy-ts/src/components/style-bar.tsx). Kind: `jsx`. Context: `StyleBar`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClick={onClearFormattingClicked}
```

### Named implementation index

This index intentionally includes helper methods as well as handlers. Resolve named calls in the entries above here; methods with no caller/binding are **not** automatically live commands. Shared support methods may be implemented in another indexed file (notably AbstractBlock, DocumentBlock, UniverseBlock, StandoffProperty and SVG helpers).

| Context | Callable | Source |
| --- | --- | --- |
|  | `StyleBar` | [src/components/style-bar.tsx:16](../speedy-ts/src/components/style-bar.tsx) |
| StyleBar | `onBoldClicked` | [src/components/style-bar.tsx:17](../speedy-ts/src/components/style-bar.tsx) |
| StyleBar | `onItalicsClicked` | [src/components/style-bar.tsx:21](../speedy-ts/src/components/style-bar.tsx) |
| StyleBar | `onAlignLeftClicked` | [src/components/style-bar.tsx:25](../speedy-ts/src/components/style-bar.tsx) |
| StyleBar | `onAlignRightClicked` | [src/components/style-bar.tsx:29](../speedy-ts/src/components/style-bar.tsx) |
| StyleBar | `onAlignCenterClicked` | [src/components/style-bar.tsx:33](../speedy-ts/src/components/style-bar.tsx) |
| StyleBar | `onAlignJustifyClicked` | [src/components/style-bar.tsx:37](../speedy-ts/src/components/style-bar.tsx) |
| StyleBar | `onH1Clicked` | [src/components/style-bar.tsx:41](../speedy-ts/src/components/style-bar.tsx) |
| StyleBar | `onH2Clicked` | [src/components/style-bar.tsx:45](../speedy-ts/src/components/style-bar.tsx) |
| StyleBar | `onH3Clicked` | [src/components/style-bar.tsx:49](../speedy-ts/src/components/style-bar.tsx) |
| StyleBar | `onH4Clicked` | [src/components/style-bar.tsx:53](../speedy-ts/src/components/style-bar.tsx) |
| StyleBar | `onClearFormattingClicked` | [src/components/style-bar.tsx:57](../speedy-ts/src/components/style-bar.tsx) |
| StyleBar | `onFontColourClicked` | [src/components/style-bar.tsx:61](../speedy-ts/src/components/style-bar.tsx) |
| StyleBar | `onBackgroundColourClicked` | [src/components/style-bar.tsx:65](../speedy-ts/src/components/style-bar.tsx) |
| StyleBar | `onAddOrIncreaseIndentClicked` | [src/components/style-bar.tsx:69](../speedy-ts/src/components/style-bar.tsx) |
| StyleBar | `onAddOrDecreaseIndentClicked` | [src/components/style-bar.tsx:73](../speedy-ts/src/components/style-bar.tsx) |
| StyleBar | `onRotateRightClicked` | [src/components/style-bar.tsx:77](../speedy-ts/src/components/style-bar.tsx) |
| StyleBar | `onRotateLeftClicked` | [src/components/style-bar.tsx:81](../speedy-ts/src/components/style-bar.tsx) |
| StyleBarBlock | `selectBackgroundColour` | [src/components/style-bar.tsx:125](../speedy-ts/src/components/style-bar.tsx) |
| StyleBarBlock | `selectFontColour` | [src/components/style-bar.tsx:131](../speedy-ts/src/components/style-bar.tsx) |
| StyleBarBlock | `rotateRight` | [src/components/style-bar.tsx:137](../speedy-ts/src/components/style-bar.tsx) |
| StyleBarBlock | `rotateLeft` | [src/components/style-bar.tsx:140](../speedy-ts/src/components/style-bar.tsx) |
| StyleBarBlock | `addOrDecreaseIndent` | [src/components/style-bar.tsx:143](../speedy-ts/src/components/style-bar.tsx) |
| StyleBarBlock | `addOrIncreaseIndent` | [src/components/style-bar.tsx:146](../speedy-ts/src/components/style-bar.tsx) |
| StyleBarBlock | `applyStyle` | [src/components/style-bar.tsx:149](../speedy-ts/src/components/style-bar.tsx) |
| StyleBarBlock | `addOrEditBlockStyle` | [src/components/style-bar.tsx:152](../speedy-ts/src/components/style-bar.tsx) |
| StyleBarBlock | `clearFormatting` | [src/components/style-bar.tsx:155](../speedy-ts/src/components/style-bar.tsx) |
| StyleBarBlock | `render` | [src/components/style-bar.tsx:158](../speedy-ts/src/components/style-bar.tsx) |
| StyleBarBlock | `serialize` | [src/components/style-bar.tsx:163](../speedy-ts/src/components/style-bar.tsx) |
| StyleBarBlock | `deserialize` | [src/components/style-bar.tsx:166](../speedy-ts/src/components/style-bar.tsx) |

## src/components/workspace.tsx

Source: [src/components/workspace.tsx:1](../speedy-ts/src/components/workspace.tsx). SHA-256: `c7e8f8a11311a342aac3fe82bbeace5cca505dbdd354a3134486516d452bc483`.

Migration family/status: Application composition/factory setup; not itself an input handler.

No local binding/listener/callback/recognizer sites found by the census. For Block classes this **does not mean no behavior**: follow inherited AbstractBlock navigation, nearest Document commands, Universe routing, schema effects and native/widget boundaries in the addendum.

### Named implementation index

This index intentionally includes helper methods as well as handlers. Resolve named calls in the entries above here; methods with no caller/binding are **not** automatically live commands. Shared support methods may be implemented in another indexed file (notably AbstractBlock, DocumentBlock, UniverseBlock, StandoffProperty and SVG helpers).

| Context | Callable | Source |
| --- | --- | --- |
|  | `BlockManagerWindow` | [src/components/workspace.tsx:36](../speedy-ts/src/components/workspace.tsx) |
| BlockManagerWindow | `initialise` | [src/components/workspace.tsx:37](../speedy-ts/src/components/workspace.tsx) |

## src/index.tsx

Source: [src/index.tsx:1](../speedy-ts/src/index.tsx). SHA-256: `70574fa15c0839101b444c758223c5cf03b19111ebbd697217a2c9dc42a5c73c`.

Migration family/status: Supporting application/library code; no local user-input installation was found unless explicitly listed below. Preserve any caller-owned lifecycle or native boundary.

No local binding/listener/callback/recognizer sites found by the census. For Block classes this **does not mean no behavior**: follow inherited AbstractBlock navigation, nearest Document commands, Universe routing, schema effects and native/widget boundaries in the addendum.

## src/library/block-property.ts

Source: [src/library/block-property.ts:1](../speedy-ts/src/library/block-property.ts). SHA-256: `699a92883f892747a53a1020c5011f17e2b2a9264dc9e54a59fe1fe0bf93f44a`.

Migration family/status: Block-property lifecycle/effect adapter; declarative styles are partial coverage.

Classes: `BlockProperty` (no superclass).

No local binding/listener/callback/recognizer sites found by the census. For Block classes this **does not mean no behavior**: follow inherited AbstractBlock navigation, nearest Document commands, Universe routing, schema effects and native/widget boundaries in the addendum.

### Named implementation index

This index intentionally includes helper methods as well as handlers. Resolve named calls in the entries above here; methods with no caller/binding are **not** automatically live commands. Shared support methods may be implemented in another indexed file (notably AbstractBlock, DocumentBlock, UniverseBlock, StandoffProperty and SVG helpers).

| Context | Callable | Source |
| --- | --- | --- |
| BlockProperty | `onInit` | [src/library/block-property.ts:26](../speedy-ts/src/library/block-property.ts) |
| BlockProperty | `serialize` | [src/library/block-property.ts:31](../speedy-ts/src/library/block-property.ts) |
| BlockProperty | `applyStyling` | [src/library/block-property.ts:40](../speedy-ts/src/library/block-property.ts) |
| BlockProperty | `removeStyling` | [src/library/block-property.ts:52](../speedy-ts/src/library/block-property.ts) |

## src/library/cell.ts

Source: [src/library/cell.ts:1](../speedy-ts/src/library/cell.ts). SHA-256: `29c327f02d3d828904f6ab62b06158053433edc1c2beb81a50efee54245615b6`.

Migration family/status: Inline identity, Cell/Row geometry and navigation support; code-point model partial coverage.

Classes: `Cell` (no superclass); `Row` (no superclass).

No local binding/listener/callback/recognizer sites found by the census. For Block classes this **does not mean no behavior**: follow inherited AbstractBlock navigation, nearest Document commands, Universe routing, schema effects and native/widget boundaries in the addendum.

### Named implementation index

This index intentionally includes helper methods as well as handlers. Resolve named calls in the entries above here; methods with no caller/binding are **not** automatically live commands. Shared support methods may be implemented in another indexed file (notably AbstractBlock, DocumentBlock, UniverseBlock, StandoffProperty and SVG helpers).

| Context | Callable | Source |
| --- | --- | --- |
| Cell | `createElement` | [src/library/cell.ts:35](../speedy-ts/src/library/cell.ts) |
| Cell | `setText` | [src/library/cell.ts:42](../speedy-ts/src/library/cell.ts) |
| Cell | `createSpan` | [src/library/cell.ts:56](../speedy-ts/src/library/cell.ts) |
| Cell | `removeElement` | [src/library/cell.ts:72](../speedy-ts/src/library/cell.ts) |
| Cell | `getTextNode` | [src/library/cell.ts:75](../speedy-ts/src/library/cell.ts) |
| Row | `findNearestCell` | [src/library/cell.ts:101](../speedy-ts/src/library/cell.ts) |
| Row | `getLastCell` | [src/library/cell.ts:114](../speedy-ts/src/library/cell.ts) |

## src/library/common.ts

Source: [src/library/common.ts:1](../speedy-ts/src/library/common.ts). SHA-256: `e9276ca0ea5fd1e519bdc4ff3a52294b0af1382ebaa7d3c85c014a29736d904b`.

Migration family/status: Supporting application/library code; no local user-input installation was found unless explicitly listed below. Preserve any caller-owned lifecycle or native boundary.

No local binding/listener/callback/recognizer sites found by the census. For Block classes this **does not mean no behavior**: follow inherited AbstractBlock navigation, nearest Document commands, Universe routing, schema effects and native/widget boundaries in the addendum.

### Named implementation index

This index intentionally includes helper methods as well as handlers. Resolve named calls in the entries above here; methods with no caller/binding are **not** automatically live commands. Shared support methods may be implemented in another indexed file (notably AbstractBlock, DocumentBlock, UniverseBlock, StandoffProperty and SVG helpers).

| Context | Callable | Source |
| --- | --- | --- |
|  | `renderToNode2` | [src/library/common.ts:7](../speedy-ts/src/library/common.ts) |
|  | `renderToNode` | [src/library/common.ts:12](../speedy-ts/src/library/common.ts) |
|  | `fetchGetCache` | [src/library/common.ts:19](../speedy-ts/src/library/common.ts) |
|  | `fetchGet` | [src/library/common.ts:30](../speedy-ts/src/library/common.ts) |
|  | `toQueryString` | [src/library/common.ts:33](../speedy-ts/src/library/common.ts) |
|  | `fetchPost` | [src/library/common.ts:45](../speedy-ts/src/library/common.ts) |
|  | `flattenTree` | [src/library/common.ts:53](../speedy-ts/src/library/common.ts) |
| flattenTree | `traverse` | [src/library/common.ts:55](../speedy-ts/src/library/common.ts) |
|  | `nullSafety` | [src/library/common.ts:66](../speedy-ts/src/library/common.ts) |
|  | `nullSafe` | [src/library/common.ts:78](../speedy-ts/src/library/common.ts) |
|  | `toFormData` | [src/library/common.ts:81](../speedy-ts/src/library/common.ts) |

## src/library/copy.ts

Source: [src/library/copy.ts:1](../speedy-ts/src/library/copy.ts). SHA-256: `26584e630534b3b8fa00c6601ca5fe289c74b763a27b8038168f076a48a3a6f1`.

Migration family/status: Supporting application/library code; no local user-input installation was found unless explicitly listed below. Preserve any caller-owned lifecycle or native boundary.

Classes: `Copy` (no superclass).

No local binding/listener/callback/recognizer sites found by the census. For Block classes this **does not mean no behavior**: follow inherited AbstractBlock navigation, nearest Document commands, Universe routing, schema effects and native/widget boundaries in the addendum.

## src/library/draggable-window.ts

Source: [src/library/draggable-window.ts:1](../speedy-ts/src/library/draggable-window.ts). SHA-256: `82edbd3d0ffb63c7f847dd2932972ca0938c482e9a962d53f65ede7e40573e7e`.

Migration family/status: Scoped drag/resize/minimize adapter; drag subset exists, resize/double-click restoration absent.

Classes: `DraggableWindow` (no superclass).

### library-draggable-window-listener-01

Source: [src/library/draggable-window.ts:44](../speedy-ts/src/library/draggable-window.ts). Kind: `listener`. Context: `DraggableWindow.init`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
this.handleEl.addEventListener('pointerdown', this.onPointerDown)
```

### library-draggable-window-listener-02

Source: [src/library/draggable-window.ts:45](../speedy-ts/src/library/draggable-window.ts). Kind: `listener`. Context: `DraggableWindow.init`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
this.handleEl.addEventListener('dblclick', this.toggleMinimize)
```

### library-draggable-window-property-function-01

Source: [src/library/draggable-window.ts:52](../speedy-ts/src/library/draggable-window.ts). Kind: `property-function`. Context: `DraggableWindow`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
private onPointerDown = (e: PointerEvent) => {
    if (this.minimized) return;

    this.isDragging = true;
    this.lastX = e.clientX;
    this.lastY = e.clientY;

    this.options.onDragStart?.();
    document.body.style.userSelect = 'none';

    document.addEventListener('pointermove', this.onPointerMove);
    document.addEventListener('pointerup', this.onPointerUp);
  };
```

### library-draggable-window-listener-03

Source: [src/library/draggable-window.ts:62](../speedy-ts/src/library/draggable-window.ts). Kind: `listener`. Context: `DraggableWindow`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
document.addEventListener('pointermove', this.onPointerMove)
```

### library-draggable-window-listener-04

Source: [src/library/draggable-window.ts:63](../speedy-ts/src/library/draggable-window.ts). Kind: `listener`. Context: `DraggableWindow`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
document.addEventListener('pointerup', this.onPointerUp)
```

### library-draggable-window-property-function-02

Source: [src/library/draggable-window.ts:66](../speedy-ts/src/library/draggable-window.ts). Kind: `property-function`. Context: `DraggableWindow`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
private onPointerMove = (e: PointerEvent) => {
    if (!this.isDragging) return;

    const dx = e.clientX - this.lastX;
    const dy = e.clientY - this.lastY;

    this.offsetX += dx;
    this.offsetY += dy;

    this.windowEl.style.transform = `translate(${this.offsetX}px, ${this.offsetY}px)`;
    this.options.onDragMove?.(this.offsetX, this.offsetY);

    this.lastX = e.clientX;
    this.lastY = e.clientY;
  };
```

### library-draggable-window-property-function-03

Source: [src/library/draggable-window.ts:82](../speedy-ts/src/library/draggable-window.ts). Kind: `property-function`. Context: `DraggableWindow`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
private onPointerUp = () => {
    if (!this.isDragging) return;

    this.isDragging = false;
    document.body.style.userSelect = '';

    document.removeEventListener('pointermove', this.onPointerMove);
    document.removeEventListener('pointerup', this.onPointerUp);

    this.options.onDragEnd?.();
  };
```

### library-draggable-window-listener-05

Source: [src/library/draggable-window.ts:88](../speedy-ts/src/library/draggable-window.ts). Kind: `listener`. Context: `DraggableWindow`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
document.removeEventListener('pointermove', this.onPointerMove)
```

### library-draggable-window-listener-06

Source: [src/library/draggable-window.ts:89](../speedy-ts/src/library/draggable-window.ts). Kind: `listener`. Context: `DraggableWindow`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
document.removeEventListener('pointerup', this.onPointerUp)
```

### library-draggable-window-listener-07

Source: [src/library/draggable-window.ts:108](../speedy-ts/src/library/draggable-window.ts). Kind: `listener`. Context: `DraggableWindow.addResizeHandle`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
this.resizeHandleEl.addEventListener('pointerdown', this.onResizeStart)
```

### library-draggable-window-property-function-04

Source: [src/library/draggable-window.ts:111](../speedy-ts/src/library/draggable-window.ts). Kind: `property-function`. Context: `DraggableWindow`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
private onResizeStart = (e: PointerEvent) => {
    if (this.minimized) return;

    e.stopPropagation();
    this.isResizing = true;
    this.lastX = e.clientX;
    this.lastY = e.clientY;

    this.originalWidth = this.windowEl.offsetWidth;
    this.originalHeight = this.windowEl.offsetHeight;

    document.addEventListener('pointermove', this.onResizeMove);
    document.addEventListener('pointerup', this.onResizeEnd);
  };
```

### library-draggable-window-listener-08

Source: [src/library/draggable-window.ts:122](../speedy-ts/src/library/draggable-window.ts). Kind: `listener`. Context: `DraggableWindow`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
document.addEventListener('pointermove', this.onResizeMove)
```

### library-draggable-window-listener-09

Source: [src/library/draggable-window.ts:123](../speedy-ts/src/library/draggable-window.ts). Kind: `listener`. Context: `DraggableWindow`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
document.addEventListener('pointerup', this.onResizeEnd)
```

### library-draggable-window-property-function-05

Source: [src/library/draggable-window.ts:126](../speedy-ts/src/library/draggable-window.ts). Kind: `property-function`. Context: `DraggableWindow`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
private onResizeMove = (e: PointerEvent) => {
    if (!this.isResizing) return;

    const dx = e.clientX - this.lastX;
    const dy = e.clientY - this.lastY;

    const newWidth = Math.max(100, this.originalWidth + dx);
    const newHeight = Math.max(100, this.originalHeight + dy);

    this.windowEl.style.width = `${newWidth}px`;
    this.windowEl.style.height = `${newHeight}px`;

    const content = this.windowEl.querySelector('.window-block-content') as HTMLElement;
    if (content) {
      content.style.height = `${newHeight - this.windowEl.querySelector('.window-block-header')!.clientHeight}px`;
    }
  };
```

### library-draggable-window-property-function-06

Source: [src/library/draggable-window.ts:144](../speedy-ts/src/library/draggable-window.ts). Kind: `property-function`. Context: `DraggableWindow`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
private onResizeEnd = () => {
    this.isResizing = false;
    document.removeEventListener('pointermove', this.onResizeMove);
    document.removeEventListener('pointerup', this.onResizeEnd);
  };
```

### library-draggable-window-listener-10

Source: [src/library/draggable-window.ts:146](../speedy-ts/src/library/draggable-window.ts). Kind: `listener`. Context: `DraggableWindow`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
document.removeEventListener('pointermove', this.onResizeMove)
```

### library-draggable-window-listener-11

Source: [src/library/draggable-window.ts:147](../speedy-ts/src/library/draggable-window.ts). Kind: `listener`. Context: `DraggableWindow`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
document.removeEventListener('pointerup', this.onResizeEnd)
```

### library-draggable-window-property-function-07

Source: [src/library/draggable-window.ts:150](../speedy-ts/src/library/draggable-window.ts). Kind: `property-function`. Context: `DraggableWindow`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
public toggleMinimize = () => {
    if (this.minimized) {
      this.restoreWindow();
    } else {
      this.minimizeWindow();
    }
  };
```

### library-draggable-window-listener-12

Source: [src/library/draggable-window.ts:182](../speedy-ts/src/library/draggable-window.ts). Kind: `listener`. Context: `DraggableWindow.minimizeWindow`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
this.minimizeIconEl.addEventListener('click', this.restoreWindow)
```

### library-draggable-window-property-function-08

Source: [src/library/draggable-window.ts:214](../speedy-ts/src/library/draggable-window.ts). Kind: `property-function`. Context: `DraggableWindow`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
private restoreWindow = () => {
    if (!this.minimized) return;

    this.windowEl.style.transition = 'transform 300ms ease-out';
    this.windowEl.style.transform = this.preMinimizedTransform;

    // Show the window again and remove the minimized icon
    this.windowEl.style.visibility = 'visible';
    if (this.minimizeIconEl) {
      this.minimizeIconEl.remove();
    }

    this.minimized = false;
  };
```

### library-draggable-window-listener-13

Source: [src/library/draggable-window.ts:230](../speedy-ts/src/library/draggable-window.ts). Kind: `listener`. Context: `DraggableWindow.destroy`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
this.handleEl.removeEventListener('pointerdown', this.onPointerDown)
```

### library-draggable-window-listener-14

Source: [src/library/draggable-window.ts:231](../speedy-ts/src/library/draggable-window.ts). Kind: `listener`. Context: `DraggableWindow.destroy`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
this.handleEl.removeEventListener('dblclick', this.toggleMinimize)
```

### library-draggable-window-listener-15

Source: [src/library/draggable-window.ts:232](../speedy-ts/src/library/draggable-window.ts). Kind: `listener`. Context: `DraggableWindow.destroy`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
this.resizeHandleEl?.removeEventListener('pointerdown', this.onResizeStart)
```

### library-draggable-window-listener-16

Source: [src/library/draggable-window.ts:234](../speedy-ts/src/library/draggable-window.ts). Kind: `listener`. Context: `DraggableWindow.destroy`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
document.removeEventListener('pointermove', this.onPointerMove)
```

### library-draggable-window-listener-17

Source: [src/library/draggable-window.ts:235](../speedy-ts/src/library/draggable-window.ts). Kind: `listener`. Context: `DraggableWindow.destroy`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
document.removeEventListener('pointerup', this.onPointerUp)
```

### library-draggable-window-listener-18

Source: [src/library/draggable-window.ts:238](../speedy-ts/src/library/draggable-window.ts). Kind: `listener`. Context: `DraggableWindow.destroy`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
this.minimizeIconEl.removeEventListener('click', this.restoreWindow)
```

### Named implementation index

This index intentionally includes helper methods as well as handlers. Resolve named calls in the entries above here; methods with no caller/binding are **not** automatically live commands. Shared support methods may be implemented in another indexed file (notably AbstractBlock, DocumentBlock, UniverseBlock, StandoffProperty and SVG helpers).

| Context | Callable | Source |
| --- | --- | --- |
| DraggableWindow | `init` | [src/library/draggable-window.ts:42](../speedy-ts/src/library/draggable-window.ts) |
| DraggableWindow | `onPointerDown` | [src/library/draggable-window.ts:52](../speedy-ts/src/library/draggable-window.ts) |
| DraggableWindow | `onPointerMove` | [src/library/draggable-window.ts:66](../speedy-ts/src/library/draggable-window.ts) |
| DraggableWindow | `onPointerUp` | [src/library/draggable-window.ts:82](../speedy-ts/src/library/draggable-window.ts) |
| DraggableWindow | `addResizeHandle` | [src/library/draggable-window.ts:94](../speedy-ts/src/library/draggable-window.ts) |
| DraggableWindow | `onResizeStart` | [src/library/draggable-window.ts:111](../speedy-ts/src/library/draggable-window.ts) |
| DraggableWindow | `onResizeMove` | [src/library/draggable-window.ts:126](../speedy-ts/src/library/draggable-window.ts) |
| DraggableWindow | `onResizeEnd` | [src/library/draggable-window.ts:144](../speedy-ts/src/library/draggable-window.ts) |
| DraggableWindow | `toggleMinimize` | [src/library/draggable-window.ts:150](../speedy-ts/src/library/draggable-window.ts) |
| DraggableWindow | `minimizeWindow` | [src/library/draggable-window.ts:158](../speedy-ts/src/library/draggable-window.ts) |
| DraggableWindow | `restoreWindow` | [src/library/draggable-window.ts:214](../speedy-ts/src/library/draggable-window.ts) |
| DraggableWindow | `destroy` | [src/library/draggable-window.ts:229](../speedy-ts/src/library/draggable-window.ts) |

### Commented/disabled evidence

These are source comments, not installed listeners. They also include relevant intent notes and TODO context. Use the addendum's reachability findings before treating an old commented design as a parity requirement.

- [src/library/draggable-window.ts:8](../speedy-ts/src/library/draggable-window.ts) — // Optional: Custom class for minimize icon
- [src/library/draggable-window.ts:173](../speedy-ts/src/library/draggable-window.ts) — // this.minimizeIconEl.innerHTML = `
- [src/library/draggable-window.ts:176](../speedy-ts/src/library/draggable-window.ts) — //     &lt;text x="25" y="25" font-size="14" text-anchor="middle" alignment-baseline="middle" fill="white"&gt;Min&lt;/text&gt;
- [src/library/draggable-window.ts:198](../speedy-ts/src/library/draggable-window.ts) — //   this.minimizeIconEl = document.createElement('div');
- [src/library/draggable-window.ts:199](../speedy-ts/src/library/draggable-window.ts) — //   this.minimizeIconEl.className = this.options.minimizeIconClass &#124;&#124; 'minimized-icon';
- [src/library/draggable-window.ts:200](../speedy-ts/src/library/draggable-window.ts) — //   this.minimizeIconEl.textContent = 'Minimized Window';
- [src/library/draggable-window.ts:201](../speedy-ts/src/library/draggable-window.ts) — //   this.minimizeIconEl.style.position = 'absolute';
- [src/library/draggable-window.ts:202](../speedy-ts/src/library/draggable-window.ts) — //   this.minimizeIconEl.style.top = `${this.offsetY + 20}px`;
- [src/library/draggable-window.ts:203](../speedy-ts/src/library/draggable-window.ts) — //   this.minimizeIconEl.style.left = `${this.offsetX + 20}px`;
- [src/library/draggable-window.ts:204](../speedy-ts/src/library/draggable-window.ts) — //   this.minimizeIconEl.style.cursor = 'pointer';
- [src/library/draggable-window.ts:205](../speedy-ts/src/library/draggable-window.ts) — //   document.body.appendChild(this.minimizeIconEl);
- [src/library/draggable-window.ts:208](../speedy-ts/src/library/draggable-window.ts) — //   this.minimizeIconEl.addEventListener('click', this.restoreWindow);

## src/library/graph.ts

Source: [src/library/graph.ts:1](../speedy-ts/src/library/graph.ts). SHA-256: `819dbebbf8661b7437a41e3f97450ebc555ff70beeb52becbbfd40d4438bafe6`.

Migration family/status: Supporting application/library code; no local user-input installation was found unless explicitly listed below. Preserve any caller-owned lifecycle or native boundary.

Classes: `Graph` (no superclass).

No local binding/listener/callback/recognizer sites found by the census. For Block classes this **does not mean no behavior**: follow inherited AbstractBlock navigation, nearest Document commands, Universe routing, schema effects and native/widget boundaries in the addendum.

### Named implementation index

This index intentionally includes helper methods as well as handlers. Resolve named calls in the entries above here; methods with no caller/binding are **not** automatically live commands. Shared support methods may be implemented in another indexed file (notably AbstractBlock, DocumentBlock, UniverseBlock, StandoffProperty and SVG helpers).

| Context | Callable | Source |
| --- | --- | --- |
| Graph | `getNode` | [src/library/graph.ts:23](../speedy-ts/src/library/graph.ts) |
| Graph | `getNodesFrom` | [src/library/graph.ts:26](../speedy-ts/src/library/graph.ts) |
| Graph | `serialize` | [src/library/graph.ts:31](../speedy-ts/src/library/graph.ts) |

## src/library/infinite-canvas.ts

Source: [src/library/infinite-canvas.ts:1](../speedy-ts/src/library/infinite-canvas.ts). SHA-256: `1674be93105fa84a2fcdde1e9ea94a04282cbca02d00fe9122e01ad436a9596b`.

Migration family/status: Canvas selection/zoom/minimap/drag adapter; not ported.

Classes: `InfiniteCanvas` (no superclass).

### library-infinite-canvas-listener-01

Source: [src/library/infinite-canvas.ts:34](../speedy-ts/src/library/infinite-canvas.ts). Kind: `listener`. Context: `InfiniteCanvas`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
this.viewport.addEventListener('mousedown', this.onMouseDown)
```

### library-infinite-canvas-listener-02

Source: [src/library/infinite-canvas.ts:35](../speedy-ts/src/library/infinite-canvas.ts). Kind: `listener`. Context: `InfiniteCanvas`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
window.addEventListener('mousemove', this.onMouseMove)
```

### library-infinite-canvas-listener-03

Source: [src/library/infinite-canvas.ts:36](../speedy-ts/src/library/infinite-canvas.ts). Kind: `listener`. Context: `InfiniteCanvas`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
window.addEventListener('mouseup', this.onMouseUp)
```

### library-infinite-canvas-listener-04

Source: [src/library/infinite-canvas.ts:37](../speedy-ts/src/library/infinite-canvas.ts). Kind: `listener`. Context: `InfiniteCanvas`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
this.viewport.addEventListener('wheel', this.onWheel, { passive: false })
```

### library-infinite-canvas-listener-05

Source: [src/library/infinite-canvas.ts:39](../speedy-ts/src/library/infinite-canvas.ts). Kind: `listener`. Context: `InfiniteCanvas`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
this.minimap.addEventListener('mousedown', this.onMinimapDown)
```

### library-infinite-canvas-listener-06

Source: [src/library/infinite-canvas.ts:40](../speedy-ts/src/library/infinite-canvas.ts). Kind: `listener`. Context: `InfiniteCanvas`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
this.minimap.addEventListener('mousemove', this.onMinimapMove)
```

### library-infinite-canvas-listener-07

Source: [src/library/infinite-canvas.ts:41](../speedy-ts/src/library/infinite-canvas.ts). Kind: `listener`. Context: `InfiniteCanvas`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
this.minimap.addEventListener('mouseup', () => this.isDraggingMinimap = false)
```

### library-infinite-canvas-listener-08

Source: [src/library/infinite-canvas.ts:42](../speedy-ts/src/library/infinite-canvas.ts). Kind: `listener`. Context: `InfiniteCanvas`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
this.minimap.addEventListener('mouseleave', () => this.isDraggingMinimap = false)
```

### library-infinite-canvas-property-function-01

Source: [src/library/infinite-canvas.ts:69](../speedy-ts/src/library/infinite-canvas.ts). Kind: `property-function`. Context: `InfiniteCanvas`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
private updateTransform = () => {
      this.canvas.style.transform = `translate(${this.translateX}px, ${this.translateY}px) scale(${this.scale})`;
      this.renderMinimap();
    };
```

### library-infinite-canvas-property-function-02

Source: [src/library/infinite-canvas.ts:74](../speedy-ts/src/library/infinite-canvas.ts). Kind: `property-function`. Context: `InfiniteCanvas`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
private onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const zoomFactor = 1.1;
      const rect = this.viewport.getBoundingClientRect();
      const offsetX = e.clientX - rect.left;
      const offsetY = e.clientY - rect.top;
      const worldX = (offsetX - this.translateX) / this.scale;
      const worldY = (offsetY - this.translateY) / this.scale;
  
      this.scale *= e.deltaY < 0 ? zoomFactor : 1 / zoomFactor;
      this.translateX = offsetX - worldX * this.scale;
      this.translateY = offsetY - worldY * this.scale;
  
      this.updateTransform();
    };
```

### library-infinite-canvas-property-function-03

Source: [src/library/infinite-canvas.ts:91](../speedy-ts/src/library/infinite-canvas.ts). Kind: `property-function`. Context: `InfiniteCanvas`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
private onMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
  
      if (target.classList.contains('box')) {
        if (e.ctrlKey || e.metaKey || e.shiftKey) {
          // Toggle selection
          if (this.selectedBoxes.has(target)) {
            this.selectedBoxes.delete(target);
            target.classList.remove('selected');
          } else {
            this.selectedBoxes.add(target);
            target.classList.add('selected');
          }
        } else {
          if (!this.selectedBoxes.has(target)) {
            this.clearSelection();
            this.selectedBoxes.add(target);
            target.classList.add('selected');
          }
        }
        this.startDragSelected(e);
        return;
      }
  
      // Start canvas drag or selection rectangle
      if (e.button === 0) {
        this.clearSelection();
        this.selectionStart = { x: e.clientX, y: e.clientY };
        this.selectionBox.style.display = 'block';
        this.selectionBox.style.left = `${e.clientX}px`;
        this.selectionBox.style.top = `${e.clientY}px`;
        this.selectionBox.style.width = '0px';
        this.selectionBox.style.height = '0px';
      }
    };
```

### library-infinite-canvas-property-function-04

Source: [src/library/infinite-canvas.ts:127](../speedy-ts/src/library/infinite-canvas.ts). Kind: `property-function`. Context: `InfiniteCanvas`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
private onMouseMove = (e: MouseEvent) => {
      // Handle selection box
      if (this.selectionStart) {
        const sx = this.selectionStart.x;
        const sy = this.selectionStart.y;
        const ex = e.clientX;
        const ey = e.clientY;
  
        const left = Math.min(sx, ex);
        const top = Math.min(sy, ey);
        const width = Math.abs(ex - sx);
        const height = Math.abs(ey - sy);
  
        Object.assign(this.selectionBox.style, {
          left: `${left}px`,
          top: `${top}px`,
          width: `${width}px`,
          height: `${height}px`,
        });
      }
    };
```

### library-infinite-canvas-property-function-05

Source: [src/library/infinite-canvas.ts:149](../speedy-ts/src/library/infinite-canvas.ts). Kind: `property-function`. Context: `InfiniteCanvas`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
private onMouseUp = (e: MouseEvent) => {
      if (this.selectionStart) {
        const rect = this.viewport.getBoundingClientRect();
        const x1 = (this.selectionStart.x - rect.left - this.translateX) / this.scale;
        const y1 = (this.selectionStart.y - rect.top - this.translateY) / this.scale;
        const x2 = (e.clientX - rect.left - this.translateX) / this.scale;
        const y2 = (e.clientY - rect.top - this.translateY) / this.scale;
  
        const minX = Math.min(x1, x2);
        const minY = Math.min(y1, y2);
        const maxX = Math.max(x1, x2);
        const maxY = Math.max(y1, y2);
  
        this.clearSelection();
  
        const boxes = Array.from(this.canvas.querySelectorAll('.box')) as HTMLElement[];
        for (const box of boxes) {
          const bx = parseFloat(box.style.left);
          const by = parseFloat(box.style.top);
          const bw = box.offsetWidth;
          const bh = box.offsetHeight;
  
          if (
            bx < maxX &&
            bx + bw > minX &&
            by < maxY &&
            by + bh > minY
          ) {
            this.selectedBoxes.add(box);
            box.classList.add('selected');
          }
        }
  
        this.selectionBox.style.display = 'none';
        this.selectionStart = null;
      }
  
      this.stopDragSelected();
    };
```

### library-infinite-canvas-listener-09

Source: [src/library/infinite-canvas.ts:215](../speedy-ts/src/library/infinite-canvas.ts). Kind: `listener`. Context: `InfiniteCanvas.makeDraggable`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
el.addEventListener('mousedown', (e) => {
        if (!this.selectedBoxes.has(el)) {
          this.clearSelection();
          this.selectedBoxes.add(el);
          el.classList.add('selected');
        }
        this.startDragSelected(e);
      })
```

### library-infinite-canvas-listener-10

Source: [src/library/infinite-canvas.ts:249](../speedy-ts/src/library/infinite-canvas.ts). Kind: `listener`. Context: `InfiniteCanvas.startDragSelected.onUp`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
window.removeEventListener('mousemove', onMove)
```

### library-infinite-canvas-listener-11

Source: [src/library/infinite-canvas.ts:250](../speedy-ts/src/library/infinite-canvas.ts). Kind: `listener`. Context: `InfiniteCanvas.startDragSelected.onUp`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
window.removeEventListener('mouseup', onUp)
```

### library-infinite-canvas-listener-12

Source: [src/library/infinite-canvas.ts:253](../speedy-ts/src/library/infinite-canvas.ts). Kind: `listener`. Context: `InfiniteCanvas.startDragSelected`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
window.addEventListener('mousemove', onMove)
```

### library-infinite-canvas-listener-13

Source: [src/library/infinite-canvas.ts:254](../speedy-ts/src/library/infinite-canvas.ts). Kind: `listener`. Context: `InfiniteCanvas.startDragSelected`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
window.addEventListener('mouseup', onUp)
```

### library-infinite-canvas-property-function-06

Source: [src/library/infinite-canvas.ts:290](../speedy-ts/src/library/infinite-canvas.ts). Kind: `property-function`. Context: `InfiniteCanvas`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
private onMinimapDown = (e: MouseEvent) => {
      this.isDraggingMinimap = true;
      this.onMinimapMove(e);
    };
```

### library-infinite-canvas-property-function-07

Source: [src/library/infinite-canvas.ts:295](../speedy-ts/src/library/infinite-canvas.ts). Kind: `property-function`. Context: `InfiniteCanvas`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
private onMinimapMove = (e: MouseEvent) => {
      if (!this.isDraggingMinimap) return;
  
      const scaleFactor = 0.05;
      const rect = this.minimap.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
  
      const worldX = x / scaleFactor;
      const worldY = y / scaleFactor;
  
      this.translateX = this.viewport.clientWidth / 2 - worldX * this.scale;
      this.translateY = this.viewport.clientHeight / 2 - worldY * this.scale;
      this.updateTransform();
    };
```

### Named implementation index

This index intentionally includes helper methods as well as handlers. Resolve named calls in the entries above here; methods with no caller/binding are **not** automatically live commands. Shared support methods may be implemented in another indexed file (notably AbstractBlock, DocumentBlock, UniverseBlock, StandoffProperty and SVG helpers).

| Context | Callable | Source |
| --- | --- | --- |
| InfiniteCanvas | `zoomIn` | [src/library/infinite-canvas.ts:47](../speedy-ts/src/library/infinite-canvas.ts) |
| InfiniteCanvas | `zoomOut` | [src/library/infinite-canvas.ts:51](../speedy-ts/src/library/infinite-canvas.ts) |
| InfiniteCanvas | `applyZoom` | [src/library/infinite-canvas.ts:55](../speedy-ts/src/library/infinite-canvas.ts) |
| InfiniteCanvas | `updateTransform` | [src/library/infinite-canvas.ts:69](../speedy-ts/src/library/infinite-canvas.ts) |
| InfiniteCanvas | `onWheel` | [src/library/infinite-canvas.ts:74](../speedy-ts/src/library/infinite-canvas.ts) |
| InfiniteCanvas | `onMouseDown` | [src/library/infinite-canvas.ts:91](../speedy-ts/src/library/infinite-canvas.ts) |
| InfiniteCanvas | `onMouseMove` | [src/library/infinite-canvas.ts:127](../speedy-ts/src/library/infinite-canvas.ts) |
| InfiniteCanvas | `onMouseUp` | [src/library/infinite-canvas.ts:149](../speedy-ts/src/library/infinite-canvas.ts) |
| InfiniteCanvas | `clearSelection` | [src/library/infinite-canvas.ts:189](../speedy-ts/src/library/infinite-canvas.ts) |
| InfiniteCanvas | `addBox` | [src/library/infinite-canvas.ts:196](../speedy-ts/src/library/infinite-canvas.ts) |
| InfiniteCanvas | `makeDraggable` | [src/library/infinite-canvas.ts:213](../speedy-ts/src/library/infinite-canvas.ts) |
| InfiniteCanvas | `startDragSelected` | [src/library/infinite-canvas.ts:225](../speedy-ts/src/library/infinite-canvas.ts) |
| InfiniteCanvas.startDragSelected | `onMove` | [src/library/infinite-canvas.ts:236](../speedy-ts/src/library/infinite-canvas.ts) |
| InfiniteCanvas.startDragSelected | `onUp` | [src/library/infinite-canvas.ts:248](../speedy-ts/src/library/infinite-canvas.ts) |
| InfiniteCanvas | `stopDragSelected` | [src/library/infinite-canvas.ts:257](../speedy-ts/src/library/infinite-canvas.ts) |
| InfiniteCanvas | `renderMinimap` | [src/library/infinite-canvas.ts:261](../speedy-ts/src/library/infinite-canvas.ts) |
| InfiniteCanvas | `onMinimapDown` | [src/library/infinite-canvas.ts:290](../speedy-ts/src/library/infinite-canvas.ts) |
| InfiniteCanvas | `onMinimapMove` | [src/library/infinite-canvas.ts:295](../speedy-ts/src/library/infinite-canvas.ts) |

### Commented/disabled evidence

These are source comments, not installed listeners. They also include relevant intent notes and TODO context. Use the addendum's reachability findings before treating an old commented design as a parity requirement.

- [src/library/infinite-canvas.ts:128](../speedy-ts/src/library/infinite-canvas.ts) — // Handle selection box

## src/library/keyboard.ts

Source: [src/library/keyboard.ts:1](../speedy-ts/src/library/keyboard.ts). SHA-256: `ad25b2ea931ae547d145d1eb55d720bef7497060f41407c9540b2356902128ee`.

Migration family/status: Supporting application/library code; no local user-input installation was found unless explicitly listed below. Preserve any caller-owned lifecycle or native boundary.

No local binding/listener/callback/recognizer sites found by the census. For Block classes this **does not mean no behavior**: follow inherited AbstractBlock navigation, nearest Document commands, Universe routing, schema effects and native/widget boundaries in the addendum.

### Named implementation index

This index intentionally includes helper methods as well as handlers. Resolve named calls in the entries above here; methods with no caller/binding are **not** automatically live commands. Shared support methods may be implemented in another indexed file (notably AbstractBlock, DocumentBlock, UniverseBlock, StandoffProperty and SVG helpers).

| Context | Callable | Source |
| --- | --- | --- |
|  | `getCursorPos` | [src/library/keyboard.ts:3](../speedy-ts/src/library/keyboard.ts) |

### Commented/disabled evidence

These are source comments, not installed listeners. They also include relevant intent notes and TODO context. Use the addendum's reachability findings before treating an old commented design as a parity requirement.

- [src/library/keyboard.ts:4](../speedy-ts/src/library/keyboard.ts) — // Source: https://stackoverflow.com/questions/7745867/how-do-you-get-the-cursor-position-in-a-textarea

## src/library/plugins/block-vines.ts

Source: [src/library/plugins/block-vines.ts:1](../speedy-ts/src/library/plugins/block-vines.ts). SHA-256: `eb17aa6074929110a676182b08fe669ca746f7cc25ee3309a1618254761e4f2f`.

Migration family/status: Block animation effect adapter; not ported.

Classes: `BlockVines` (no superclass).

No local binding/listener/callback/recognizer sites found by the census. For Block classes this **does not mean no behavior**: follow inherited AbstractBlock navigation, nearest Document commands, Universe routing, schema effects and native/widget boundaries in the addendum.

### Named implementation index

This index intentionally includes helper methods as well as handlers. Resolve named calls in the entries above here; methods with no caller/binding are **not** automatically live commands. Shared support methods may be implemented in another indexed file (notably AbstractBlock, DocumentBlock, UniverseBlock, StandoffProperty and SVG helpers).

| Context | Callable | Source |
| --- | --- | --- |
| BlockVines | `generateSeedPoints` | [src/library/plugins/block-vines.ts:39](../speedy-ts/src/library/plugins/block-vines.ts) |
| BlockVines | `createVine` | [src/library/plugins/block-vines.ts:66](../speedy-ts/src/library/plugins/block-vines.ts) |
| BlockVines | `growVines` | [src/library/plugins/block-vines.ts:83](../speedy-ts/src/library/plugins/block-vines.ts) |
| BlockVines | `update` | [src/library/plugins/block-vines.ts:119](../speedy-ts/src/library/plugins/block-vines.ts) |
| BlockVines | `destroy` | [src/library/plugins/block-vines.ts:141](../speedy-ts/src/library/plugins/block-vines.ts) |

### Commented/disabled evidence

These are source comments, not installed listeners. They also include relevant intent notes and TODO context. Use the addendum's reachability findings before treating an old commented design as a parity requirement.

- [src/library/plugins/block-vines.ts:44](../speedy-ts/src/library/plugins/block-vines.ts) — // Generate points along the left and right edges
- [src/library/plugins/block-vines.ts:131](../speedy-ts/src/library/plugins/block-vines.ts) — // Update SVG dimensions and position

## src/library/plugins/clock.ts

Source: [src/library/plugins/clock.ts:1](../speedy-ts/src/library/plugins/clock.ts). SHA-256: `e62333fe3a214c9b5f621bd3d0094f689b6537a0c8c242508262c828a3ecb558`.

Migration family/status: Annotation animation effect adapter; not ported.

Classes: `ClockPlugin` (implements IAnimationPlugin).

No local binding/listener/callback/recognizer sites found by the census. For Block classes this **does not mean no behavior**: follow inherited AbstractBlock navigation, nearest Document commands, Universe routing, schema effects and native/widget boundaries in the addendum.

### Named implementation index

This index intentionally includes helper methods as well as handlers. Resolve named calls in the entries above here; methods with no caller/binding are **not** automatically live commands. Shared support methods may be implemented in another indexed file (notably AbstractBlock, DocumentBlock, UniverseBlock, StandoffProperty and SVG helpers).

| Context | Callable | Source |
| --- | --- | --- |
| ClockPlugin | `serialise` | [src/library/plugins/clock.ts:22](../speedy-ts/src/library/plugins/clock.ts) |
| ClockPlugin | `createCircle` | [src/library/plugins/clock.ts:27](../speedy-ts/src/library/plugins/clock.ts) |
| ClockPlugin | `wrap` | [src/library/plugins/clock.ts:47](../speedy-ts/src/library/plugins/clock.ts) |
| ClockPlugin | `unwrap` | [src/library/plugins/clock.ts:50](../speedy-ts/src/library/plugins/clock.ts) |
| ClockPlugin | `setSteps` | [src/library/plugins/clock.ts:58](../speedy-ts/src/library/plugins/clock.ts) |
| ClockPlugin | `setClockwise` | [src/library/plugins/clock.ts:61](../speedy-ts/src/library/plugins/clock.ts) |
| ClockPlugin | `setAnticlockwise` | [src/library/plugins/clock.ts:64](../speedy-ts/src/library/plugins/clock.ts) |
| ClockPlugin | `update` | [src/library/plugins/clock.ts:67](../speedy-ts/src/library/plugins/clock.ts) |
| ClockPlugin | `draw` | [src/library/plugins/clock.ts:81](../speedy-ts/src/library/plugins/clock.ts) |
| ClockPlugin | `pause` | [src/library/plugins/clock.ts:88](../speedy-ts/src/library/plugins/clock.ts) |
| ClockPlugin | `unpause` | [src/library/plugins/clock.ts:91](../speedy-ts/src/library/plugins/clock.ts) |
| ClockPlugin | `togglePause` | [src/library/plugins/clock.ts:94](../speedy-ts/src/library/plugins/clock.ts) |
| ClockPlugin | `start` | [src/library/plugins/clock.ts:97](../speedy-ts/src/library/plugins/clock.ts) |
| ClockPlugin | `stop` | [src/library/plugins/clock.ts:111](../speedy-ts/src/library/plugins/clock.ts) |
| ClockPlugin | `destroy` | [src/library/plugins/clock.ts:114](../speedy-ts/src/library/plugins/clock.ts) |

## src/library/standoff-property.ts

Source: [src/library/standoff-property.ts:1](../speedy-ts/src/library/standoff-property.ts). SHA-256: `9258fbe4d18089a6842d03e9b88efaf5812415b8fc10a8d01d77e9678211b26e`.

Migration family/status: Annotation endpoint commands and lifecycle adapter; offset mapper is only partial coverage.

Classes: `StandoffProperty` (no superclass).

No local binding/listener/callback/recognizer sites found by the census. For Block classes this **does not mean no behavior**: follow inherited AbstractBlock navigation, nearest Document commands, Universe routing, schema effects and native/widget boundaries in the addendum.

### Named implementation index

This index intentionally includes helper methods as well as handlers. Resolve named calls in the entries above here; methods with no caller/binding are **not** automatically live commands. Shared support methods may be implemented in another indexed file (notably AbstractBlock, DocumentBlock, UniverseBlock, StandoffProperty and SVG helpers).

| Context | Callable | Source |
| --- | --- | --- |
| StandoffProperty | `onInit` | [src/library/standoff-property.ts:44](../speedy-ts/src/library/standoff-property.ts) |
| StandoffProperty | `onDestroy` | [src/library/standoff-property.ts:49](../speedy-ts/src/library/standoff-property.ts) |
| StandoffProperty | `destroy` | [src/library/standoff-property.ts:54](../speedy-ts/src/library/standoff-property.ts) |
| StandoffProperty | `highlight` | [src/library/standoff-property.ts:60](../speedy-ts/src/library/standoff-property.ts) |
| StandoffProperty | `unhighlight` | [src/library/standoff-property.ts:63](../speedy-ts/src/library/standoff-property.ts) |
| StandoffProperty | `contract` | [src/library/standoff-property.ts:66](../speedy-ts/src/library/standoff-property.ts) |
| StandoffProperty | `render` | [src/library/standoff-property.ts:80](../speedy-ts/src/library/standoff-property.ts) |
| StandoffProperty | `shiftLeftOneWord` | [src/library/standoff-property.ts:85](../speedy-ts/src/library/standoff-property.ts) |
| StandoffProperty | `resetOffset` | [src/library/standoff-property.ts:102](../speedy-ts/src/library/standoff-property.ts) |
| StandoffProperty | `shiftLeft` | [src/library/standoff-property.ts:105](../speedy-ts/src/library/standoff-property.ts) |
| StandoffProperty | `flashHighlight` | [src/library/standoff-property.ts:121](../speedy-ts/src/library/standoff-property.ts) |
| StandoffProperty | `shiftRightOneWord` | [src/library/standoff-property.ts:126](../speedy-ts/src/library/standoff-property.ts) |
| StandoffProperty | `shiftRight` | [src/library/standoff-property.ts:143](../speedy-ts/src/library/standoff-property.ts) |
| StandoffProperty | `expand` | [src/library/standoff-property.ts:159](../speedy-ts/src/library/standoff-property.ts) |
| StandoffProperty | `hasOffsetChanged` | [src/library/standoff-property.ts:173](../speedy-ts/src/library/standoff-property.ts) |
| StandoffProperty | `scrollTo` | [src/library/standoff-property.ts:194](../speedy-ts/src/library/standoff-property.ts) |
| StandoffProperty | `applyStyling` | [src/library/standoff-property.ts:197](../speedy-ts/src/library/standoff-property.ts) |
| StandoffProperty | `removeStyling` | [src/library/standoff-property.ts:215](../speedy-ts/src/library/standoff-property.ts) |
| StandoffProperty | `applyCssClass` | [src/library/standoff-property.ts:229](../speedy-ts/src/library/standoff-property.ts) |
| StandoffProperty | `detachCssClass` | [src/library/standoff-property.ts:234](../speedy-ts/src/library/standoff-property.ts) |
| StandoffProperty | `removeCssClassFromRange` | [src/library/standoff-property.ts:238](../speedy-ts/src/library/standoff-property.ts) |
| StandoffProperty | `getCells` | [src/library/standoff-property.ts:243](../speedy-ts/src/library/standoff-property.ts) |
| StandoffProperty | `serialize` | [src/library/standoff-property.ts:265](../speedy-ts/src/library/standoff-property.ts) |
| StandoffProperty | `showBrackets` | [src/library/standoff-property.ts:279](../speedy-ts/src/library/standoff-property.ts) |
| StandoffProperty | `hideBrackets` | [src/library/standoff-property.ts:283](../speedy-ts/src/library/standoff-property.ts) |

## src/library/svg.ts

Source: [src/library/svg.ts:1](../speedy-ts/src/library/svg.ts). SHA-256: `9e245b67b77ac4b13a51251f752adf0185ae4a868fe634f18e4629d02fb6e676`.

Migration family/status: DOM/SVG view helper boundary; helper-installed handlers must move to view adapters.

### library-svg-listener-01

Source: [src/library/svg.ts:82](../speedy-ts/src/library/svg.ts). Kind: `listener`. Context: `setElement`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
el.addEventListener(key, config.handler[key])
```

### Named implementation index

This index intentionally includes helper methods as well as handlers. Resolve named calls in the entries above here; methods with no caller/binding are **not** automatically live commands. Shared support methods may be implemented in another indexed file (notably AbstractBlock, DocumentBlock, UniverseBlock, StandoffProperty and SVG helpers).

| Context | Callable | Source |
| --- | --- | --- |
|  | `createSvg` | [src/library/svg.ts:7](../speedy-ts/src/library/svg.ts) |
|  | `isElementVisible` | [src/library/svg.ts:12](../speedy-ts/src/library/svg.ts) |
|  | `unwrapRange` | [src/library/svg.ts:28](../speedy-ts/src/library/svg.ts) |
|  | `wrapRange` | [src/library/svg.ts:36](../speedy-ts/src/library/svg.ts) |
|  | `createElement` | [src/library/svg.ts:58](../speedy-ts/src/library/svg.ts) |
|  | `setElement` | [src/library/svg.ts:66](../speedy-ts/src/library/svg.ts) |
|  | `updateSVGElement` | [src/library/svg.ts:111](../speedy-ts/src/library/svg.ts) |
|  | `groupBy` | [src/library/svg.ts:145](../speedy-ts/src/library/svg.ts) |
|  | `drawRectangle` | [src/library/svg.ts:159](../speedy-ts/src/library/svg.ts) |
|  | `drawAnimatedSelection` | [src/library/svg.ts:227](../speedy-ts/src/library/svg.ts) |
|  | `drawSpikySelection` | [src/library/svg.ts:328](../speedy-ts/src/library/svg.ts) |
| drawSpikySelection | `generateSpikes` | [src/library/svg.ts:359](../speedy-ts/src/library/svg.ts) |
|  | `drawClippedRectangle` | [src/library/svg.ts:463](../speedy-ts/src/library/svg.ts) |
|  | `drawRectangleAroundNodes` | [src/library/svg.ts:540](../speedy-ts/src/library/svg.ts) |
|  | `createUnderline` | [src/library/svg.ts:616](../speedy-ts/src/library/svg.ts) |
|  | `createRainbow` | [src/library/svg.ts:677](../speedy-ts/src/library/svg.ts) |
| createRainbow | `createLine` | [src/library/svg.ts:707](../speedy-ts/src/library/svg.ts) |
|  | `svgElement` | [src/library/svg.ts:745](../speedy-ts/src/library/svg.ts) |
|  | `createSvgLine` | [src/library/svg.ts:750](../speedy-ts/src/library/svg.ts) |

### Commented/disabled evidence

These are source comments, not installed listeners. They also include relevant intent notes and TODO context. Use the addendum's reachability findings before treating an old commented design as a parity requirement.

- [src/library/svg.ts:19](../speedy-ts/src/library/svg.ts) — // The element is fully visible in the container
- [src/library/svg.ts:22](../speedy-ts/src/library/svg.ts) — // Some part of the element is visible in the container
- [src/library/svg.ts:244](../speedy-ts/src/library/svg.ts) — // Create SVG container
- [src/library/svg.ts:345](../speedy-ts/src/library/svg.ts) — // Create SVG container with extra padding for spikes
- [src/library/svg.ts:534](../speedy-ts/src/library/svg.ts) — //const parent = p.start.element.parentElement;

## src/library/templates.ts

Source: [src/library/templates.ts:1](../speedy-ts/src/library/templates.ts). SHA-256: `4d278f2f04b6e2b3d8212e79d76ab0bf39012a04a5215b65a7df8af92d418fb4`.

Migration family/status: Supporting application/library code; no local user-input installation was found unless explicitly listed below. Preserve any caller-owned lifecycle or native boundary.

No local binding/listener/callback/recognizer sites found by the census. For Block classes this **does not mean no behavior**: follow inherited AbstractBlock navigation, nearest Document commands, Universe routing, schema effects and native/widget boundaries in the addendum.

## src/library/text-processor.ts

Source: [src/library/text-processor.ts:1](../speedy-ts/src/library/text-processor.ts). SHA-256: `62a9e5ad556ef2c59c546cc01fb35dacee5c0732a496ec3ed7b76182c6d7944f`.

Migration family/status: Post-transaction recognizer pipeline; all rules/replacements unported.

Classes: `TextProcessor` (no superclass).

### library-text-processor-replacement-01

Source: [src/library/text-processor.ts:54](../speedy-ts/src/library/text-processor.ts). Kind: `replacement`. Context: `TextProcessor`.

Route: Document custom onTextChanged → TextProcessor.process → replacements before rules. Destination: mapped post-edit recognizer transaction; not ported.

```tsx
["->", "➤"]
```

### library-text-processor-replacement-02

Source: [src/library/text-processor.ts:55](../speedy-ts/src/library/text-processor.ts). Kind: `replacement`. Context: `TextProcessor`.

Route: Document custom onTextChanged → TextProcessor.process → replacements before rules. Destination: mapped post-edit recognizer transaction; not ported.

```tsx
["<>", "🔷"]
```

### library-text-processor-replacement-03

Source: [src/library/text-processor.ts:56](../speedy-ts/src/library/text-processor.ts). Kind: `replacement`. Context: `TextProcessor`.

Route: Document custom onTextChanged → TextProcessor.process → replacements before rules. Destination: mapped post-edit recognizer transaction; not ported.

```tsx
["<3", "❤️"]
```

### library-text-processor-replacement-04

Source: [src/library/text-processor.ts:57](../speedy-ts/src/library/text-processor.ts). Kind: `replacement`. Context: `TextProcessor`.

Route: Document custom onTextChanged → TextProcessor.process → replacements before rules. Destination: mapped post-edit recognizer transaction; not ported.

```tsx
[">-", "⤚"]
```

### library-text-processor-replacement-05

Source: [src/library/text-processor.ts:58](../speedy-ts/src/library/text-processor.ts). Kind: `replacement`. Context: `TextProcessor`.

Route: Document custom onTextChanged → TextProcessor.process → replacements before rules. Destination: mapped post-edit recognizer transaction; not ported.

```tsx
["--", "—"]
```

### library-text-processor-replacement-06

Source: [src/library/text-processor.ts:60](../speedy-ts/src/library/text-processor.ts). Kind: `replacement`. Context: `TextProcessor`.

Route: Document custom onTextChanged → TextProcessor.process → replacements before rules. Destination: mapped post-edit recognizer transaction; not ported.

```tsx
["[X]", "✅"]
```

### library-text-processor-replacement-07

Source: [src/library/text-processor.ts:61](../speedy-ts/src/library/text-processor.ts). Kind: `replacement`. Context: `TextProcessor`.

Route: Document custom onTextChanged → TextProcessor.process → replacements before rules. Destination: mapped post-edit recognizer transaction; not ported.

```tsx
[":x:", "❌"]
```

### library-text-processor-replacement-08

Source: [src/library/text-processor.ts:62](../speedy-ts/src/library/text-processor.ts). Kind: `replacement`. Context: `TextProcessor`.

Route: Document custom onTextChanged → TextProcessor.process → replacements before rules. Destination: mapped post-edit recognizer transaction; not ported.

```tsx
[":P", "😛"]
```

### library-text-processor-replacement-09

Source: [src/library/text-processor.ts:63](../speedy-ts/src/library/text-processor.ts). Kind: `replacement`. Context: `TextProcessor`.

Route: Document custom onTextChanged → TextProcessor.process → replacements before rules. Destination: mapped post-edit recognizer transaction; not ported.

```tsx
["::", "▀▄"]
```

### library-text-processor-replacement-10

Source: [src/library/text-processor.ts:64](../speedy-ts/src/library/text-processor.ts). Kind: `replacement`. Context: `TextProcessor`.

Route: Document custom onTextChanged → TextProcessor.process → replacements before rules. Destination: mapped post-edit recognizer transaction; not ported.

```tsx
["(\")", "✌"]
```

### library-text-processor-replacement-11

Source: [src/library/text-processor.ts:66](../speedy-ts/src/library/text-processor.ts). Kind: `replacement`. Context: `TextProcessor`.

Route: Document custom onTextChanged → TextProcessor.process → replacements before rules. Destination: mapped post-edit recognizer transaction; not ported.

```tsx
[":bolt:", "⚡"]
```

### library-text-processor-replacement-12

Source: [src/library/text-processor.ts:67](../speedy-ts/src/library/text-processor.ts). Kind: `replacement`. Context: `TextProcessor`.

Route: Document custom onTextChanged → TextProcessor.process → replacements before rules. Destination: mapped post-edit recognizer transaction; not ported.

```tsx
[":light:", "💡"]
```

### library-text-processor-replacement-13

Source: [src/library/text-processor.ts:68](../speedy-ts/src/library/text-processor.ts). Kind: `replacement`. Context: `TextProcessor`.

Route: Document custom onTextChanged → TextProcessor.process → replacements before rules. Destination: mapped post-edit recognizer transaction; not ported.

```tsx
[":time:", "⏲️"]
```

### library-text-processor-replacement-14

Source: [src/library/text-processor.ts:69](../speedy-ts/src/library/text-processor.ts). Kind: `replacement`. Context: `TextProcessor`.

Route: Document custom onTextChanged → TextProcessor.process → replacements before rules. Destination: mapped post-edit recognizer transaction; not ported.

```tsx
[":date:", "📅"]
```

### library-text-processor-replacement-15

Source: [src/library/text-processor.ts:70](../speedy-ts/src/library/text-processor.ts). Kind: `replacement`. Context: `TextProcessor`.

Route: Document custom onTextChanged → TextProcessor.process → replacements before rules. Destination: mapped post-edit recognizer transaction; not ported.

```tsx
[":watch:", "⌚"]
```

### library-text-processor-replacement-16

Source: [src/library/text-processor.ts:71](../speedy-ts/src/library/text-processor.ts). Kind: `replacement`. Context: `TextProcessor`.

Route: Document custom onTextChanged → TextProcessor.process → replacements before rules. Destination: mapped post-edit recognizer transaction; not ported.

```tsx
[":tent:", "⛺"]
```

### library-text-processor-replacement-17

Source: [src/library/text-processor.ts:73](../speedy-ts/src/library/text-processor.ts). Kind: `replacement`. Context: `TextProcessor`.

Route: Document custom onTextChanged → TextProcessor.process → replacements before rules. Destination: mapped post-edit recognizer transaction; not ported.

```tsx
[":thinking:", "🤔"]
```

### library-text-processor-replacement-18

Source: [src/library/text-processor.ts:74](../speedy-ts/src/library/text-processor.ts). Kind: `replacement`. Context: `TextProcessor`.

Route: Document custom onTextChanged → TextProcessor.process → replacements before rules. Destination: mapped post-edit recognizer transaction; not ported.

```tsx
[":joy:", "😂"]
```

### library-text-processor-replacement-19

Source: [src/library/text-processor.ts:75](../speedy-ts/src/library/text-processor.ts). Kind: `replacement`. Context: `TextProcessor`.

Route: Document custom onTextChanged → TextProcessor.process → replacements before rules. Destination: mapped post-edit recognizer transaction; not ported.

```tsx
[":grinning:", "😀"]
```

### library-text-processor-replacement-20

Source: [src/library/text-processor.ts:76](../speedy-ts/src/library/text-processor.ts). Kind: `replacement`. Context: `TextProcessor`.

Route: Document custom onTextChanged → TextProcessor.process → replacements before rules. Destination: mapped post-edit recognizer transaction; not ported.

```tsx
[":cry:", "😢"]
```

### library-text-processor-replacement-21

Source: [src/library/text-processor.ts:77](../speedy-ts/src/library/text-processor.ts). Kind: `replacement`. Context: `TextProcessor`.

Route: Document custom onTextChanged → TextProcessor.process → replacements before rules. Destination: mapped post-edit recognizer transaction; not ported.

```tsx
[":sweat:", "😓"]
```

### library-text-processor-replacement-22

Source: [src/library/text-processor.ts:78](../speedy-ts/src/library/text-processor.ts). Kind: `replacement`. Context: `TextProcessor`.

Route: Document custom onTextChanged → TextProcessor.process → replacements before rules. Destination: mapped post-edit recognizer transaction; not ported.

```tsx
[":disappointed:", "😞"]
```

### library-text-processor-replacement-23

Source: [src/library/text-processor.ts:79](../speedy-ts/src/library/text-processor.ts). Kind: `replacement`. Context: `TextProcessor`.

Route: Document custom onTextChanged → TextProcessor.process → replacements before rules. Destination: mapped post-edit recognizer transaction; not ported.

```tsx
[":anguished:", "😧"]
```

### library-text-processor-replacement-24

Source: [src/library/text-processor.ts:80](../speedy-ts/src/library/text-processor.ts). Kind: `replacement`. Context: `TextProcessor`.

Route: Document custom onTextChanged → TextProcessor.process → replacements before rules. Destination: mapped post-edit recognizer transaction; not ported.

```tsx
[":astonished:", "😲"]
```

### library-text-processor-replacement-25

Source: [src/library/text-processor.ts:81](../speedy-ts/src/library/text-processor.ts). Kind: `replacement`. Context: `TextProcessor`.

Route: Document custom onTextChanged → TextProcessor.process → replacements before rules. Destination: mapped post-edit recognizer transaction; not ported.

```tsx
[":dizzy_face:", "😵"]
```

### library-text-processor-replacement-26

Source: [src/library/text-processor.ts:82](../speedy-ts/src/library/text-processor.ts). Kind: `replacement`. Context: `TextProcessor`.

Route: Document custom onTextChanged → TextProcessor.process → replacements before rules. Destination: mapped post-edit recognizer transaction; not ported.

```tsx
[":open_mouth:", "😮"]
```

### library-text-processor-replacement-27

Source: [src/library/text-processor.ts:83](../speedy-ts/src/library/text-processor.ts). Kind: `replacement`. Context: `TextProcessor`.

Route: Document custom onTextChanged → TextProcessor.process → replacements before rules. Destination: mapped post-edit recognizer transaction; not ported.

```tsx
[":scream:", "😱"]
```

### library-text-processor-replacement-28

Source: [src/library/text-processor.ts:84](../speedy-ts/src/library/text-processor.ts). Kind: `replacement`. Context: `TextProcessor`.

Route: Document custom onTextChanged → TextProcessor.process → replacements before rules. Destination: mapped post-edit recognizer transaction; not ported.

```tsx
[":cold_sweat:", "😰"]
```

### library-text-processor-replacement-29

Source: [src/library/text-processor.ts:85](../speedy-ts/src/library/text-processor.ts). Kind: `replacement`. Context: `TextProcessor`.

Route: Document custom onTextChanged → TextProcessor.process → replacements before rules. Destination: mapped post-edit recognizer transaction; not ported.

```tsx
["b/n", "between"]
```

### library-text-processor-replacement-30

Source: [src/library/text-processor.ts:86](../speedy-ts/src/library/text-processor.ts). Kind: `replacement`. Context: `TextProcessor`.

Route: Document custom onTextChanged → TextProcessor.process → replacements before rules. Destination: mapped post-edit recognizer transaction; not ported.

```tsx
["c/d", "could"]
```

### library-text-processor-replacement-31

Source: [src/library/text-processor.ts:87](../speedy-ts/src/library/text-processor.ts). Kind: `replacement`. Context: `TextProcessor`.

Route: Document custom onTextChanged → TextProcessor.process → replacements before rules. Destination: mapped post-edit recognizer transaction; not ported.

```tsx
["w/d", "would"]
```

### library-text-processor-replacement-32

Source: [src/library/text-processor.ts:88](../speedy-ts/src/library/text-processor.ts). Kind: `replacement`. Context: `TextProcessor`.

Route: Document custom onTextChanged → TextProcessor.process → replacements before rules. Destination: mapped post-edit recognizer transaction; not ported.

```tsx
["r/n/s", "relations"]
```

### library-text-processor-replacement-33

Source: [src/library/text-processor.ts:89](../speedy-ts/src/library/text-processor.ts). Kind: `replacement`. Context: `TextProcessor`.

Route: Document custom onTextChanged → TextProcessor.process → replacements before rules. Destination: mapped post-edit recognizer transaction; not ported.

```tsx
["b/c", "because"]
```

### library-text-processor-text-rule-01

Source: [src/library/text-processor.ts:92](../speedy-ts/src/library/text-processor.ts). Kind: `text-rule`. Context: `TextProcessor`.

Route: Document custom onTextChanged → TextProcessor.process → replacements before rules. Destination: mapped post-edit recognizer transaction; not ported.

```tsx
{
                pattern: "\\^\\^(.*?)\\^\\^", type: "style/superscript", wrapper: { start: "^^", end: "^^" }
            }
```

### library-text-processor-text-rule-02

Source: [src/library/text-processor.ts:95](../speedy-ts/src/library/text-processor.ts). Kind: `text-rule`. Context: `TextProcessor`.

Route: Document custom onTextChanged → TextProcessor.process → replacements before rules. Destination: mapped post-edit recognizer transaction; not ported.

```tsx
{
                pattern: "~~(.*?)~~", type: "style/strikethrough", wrapper: { start: "~~", end: "~~" }
            }
```

### library-text-processor-text-rule-03

Source: [src/library/text-processor.ts:98](../speedy-ts/src/library/text-processor.ts). Kind: `text-rule`. Context: `TextProcessor`.

Route: Document custom onTextChanged → TextProcessor.process → replacements before rules. Destination: mapped post-edit recognizer transaction; not ported.

```tsx
{
                pattern: "_(.*?)_", type: "style/italics", wrapper: { start: "_", end: "_" }
            }
```

### library-text-processor-text-rule-04

Source: [src/library/text-processor.ts:101](../speedy-ts/src/library/text-processor.ts). Kind: `text-rule`. Context: `TextProcessor`.

Route: Document custom onTextChanged → TextProcessor.process → replacements before rules. Destination: mapped post-edit recognizer transaction; not ported.

```tsx
{
                pattern: "\\[\\((.*?)\\)\\]",
                type: "item-number",
                wrapper: { start: "[(", end: ")]" }
            }
```

### library-text-processor-text-rule-05

Source: [src/library/text-processor.ts:106](../speedy-ts/src/library/text-processor.ts). Kind: `text-rule`. Context: `TextProcessor`.

Route: Document custom onTextChanged → TextProcessor.process → replacements before rules. Destination: mapped post-edit recognizer transaction; not ported.

```tsx
{
                pattern: "`(.*?)`", type: "code", wrapper: { start: "`", end: "`" }
            }
```

### library-text-processor-text-rule-06

Source: [src/library/text-processor.ts:109](../speedy-ts/src/library/text-processor.ts). Kind: `text-rule`. Context: `TextProcessor`.

Route: Document custom onTextChanged → TextProcessor.process → replacements before rules. Destination: mapped post-edit recognizer transaction; not ported.

```tsx
{
                pattern: "\\*(.*?)\\*", type: "style/bold", wrapper: { start: "*", end: "*" }
            }
```

### library-text-processor-text-rule-07

Source: [src/library/text-processor.ts:113](../speedy-ts/src/library/text-processor.ts). Kind: `text-rule`. Context: `TextProcessor`.

Route: Document custom onTextChanged → TextProcessor.process → replacements before rules. Destination: mapped post-edit recognizer transaction; not ported.

```tsx
{
                pattern: '<<(.*?)>>', type: "capital", wrapper: { start: '<<', end: '>>' },
            }
```

### library-text-processor-text-rule-08

Source: [src/library/text-processor.ts:116](../speedy-ts/src/library/text-processor.ts). Kind: `text-rule`. Context: `TextProcessor`.

Route: Document custom onTextChanged → TextProcessor.process → replacements before rules. Destination: mapped post-edit recognizer transaction; not ported.

```tsx
{
                pattern: '""(.*?)""', type: "air-quotes", wrapper: { start: '""', end: '""' },
            }
```

### library-text-processor-text-rule-09

Source: [src/library/text-processor.ts:119](../speedy-ts/src/library/text-processor.ts). Kind: `text-rule`. Context: `TextProcessor`.

Route: Document custom onTextChanged → TextProcessor.process → replacements before rules. Destination: mapped post-edit recognizer transaction; not ported.

```tsx
{
                pattern: "/sup/(.*?)/", type: "style/superscript", wrapper: { start: "/sup/", end: "/" }
            }
```

### library-text-processor-text-rule-10

Source: [src/library/text-processor.ts:122](../speedy-ts/src/library/text-processor.ts). Kind: `text-rule`. Context: `TextProcessor`.

Route: Document custom onTextChanged → TextProcessor.process → replacements before rules. Destination: mapped post-edit recognizer transaction; not ported.

```tsx
{
                pattern: "/sub/(.*?)/", type: "style/subscript", wrapper: { start: "/sub/", end: "/" }
            }
```

### library-text-processor-text-rule-11

Source: [src/library/text-processor.ts:125](../speedy-ts/src/library/text-processor.ts). Kind: `text-rule`. Context: `TextProcessor`.

Route: Document custom onTextChanged → TextProcessor.process → replacements before rules. Destination: mapped post-edit recognizer transaction; not ported.

```tsx
{
                pattern: "__(.*?)__", type: "style/underline", wrapper: { start: "__", end: "__" }
            }
```

### library-text-processor-text-rule-12

Source: [src/library/text-processor.ts:128](../speedy-ts/src/library/text-processor.ts). Kind: `text-rule`. Context: `TextProcessor`.

Route: Document custom onTextChanged → TextProcessor.process → replacements before rules. Destination: mapped post-edit recognizer transaction; not ported.

```tsx
{
                pattern: "/spin/(.*?)/", type: "animation/clock", wrapper: { start: "/spin/", end: "/" }
            }
```

### library-text-processor-text-rule-13

Source: [src/library/text-processor.ts:131](../speedy-ts/src/library/text-processor.ts). Kind: `text-rule`. Context: `TextProcessor`.

Route: Document custom onTextChanged → TextProcessor.process → replacements before rules. Destination: mapped post-edit recognizer transaction; not ported.

```tsx
{
                pattern: "/h/(.*?)/", type: "style/highlight", wrapper: { start: "/h/", end: "/" }
            }
```

### library-text-processor-text-rule-14

Source: [src/library/text-processor.ts:134](../speedy-ts/src/library/text-processor.ts). Kind: `text-rule`. Context: `TextProcessor`.

Route: Document custom onTextChanged → TextProcessor.process → replacements before rules. Destination: mapped post-edit recognizer transaction; not ported.

```tsx
{
                pattern: "/u/(.*?)/", type: "style/underline", wrapper: { start: "/u/", end: "/" }
            }
```

### library-text-processor-text-rule-15

Source: [src/library/text-processor.ts:137](../speedy-ts/src/library/text-processor.ts). Kind: `text-rule`. Context: `TextProcessor`.

Route: Document custom onTextChanged → TextProcessor.process → replacements before rules. Destination: mapped post-edit recognizer transaction; not ported.

```tsx
{
                pattern: "/b/(.*?)/", type: "style/bold", wrapper: { start: "/b/", end: "/" }
            }
```

### library-text-processor-text-rule-16

Source: [src/library/text-processor.ts:140](../speedy-ts/src/library/text-processor.ts). Kind: `text-rule`. Context: `TextProcessor`.

Route: Document custom onTextChanged → TextProcessor.process → replacements before rules. Destination: mapped post-edit recognizer transaction; not ported.

```tsx
{
                pattern: "/strike/(.*?)/", type: "style/strike", wrapper: { start: "/s/", end: "/" }
            }
```

### library-text-processor-text-rule-17

Source: [src/library/text-processor.ts:143](../speedy-ts/src/library/text-processor.ts). Kind: `text-rule`. Context: `TextProcessor`.

Route: Document custom onTextChanged → TextProcessor.process → replacements before rules. Destination: mapped post-edit recognizer transaction; not ported.

```tsx
{
                pattern: "/lg/(.*?)/", type: "style/font/size/large", wrapper: { start: "/lg/", end: "/" },
                process: async (args: ITextPatternRecogniserHandler) => {
                    const { match, block } = args;
                    block.addStandoffPropertiesDto([
                        { type: "style/font/size/large", start: match.start, end: match.end }
                    ]);
                    block.applyStandoffPropertyStyling();
                }
            }
```

### library-text-processor-text-rule-18

Source: [src/library/text-processor.ts:153](../speedy-ts/src/library/text-processor.ts). Kind: `text-rule`. Context: `TextProcessor`.

Route: Document custom onTextChanged → TextProcessor.process → replacements before rules. Destination: mapped post-edit recognizer transaction; not ported.

```tsx
{
                pattern: "/sm/(.*?)/", type: "style/font/size/small", wrapper: { start: "/sm/", end: "/" },
            }
```

### library-text-processor-text-rule-19

Source: [src/library/text-processor.ts:156](../speedy-ts/src/library/text-processor.ts). Kind: `text-rule`. Context: `TextProcessor`.

Route: Document custom onTextChanged → TextProcessor.process → replacements before rules. Destination: mapped post-edit recognizer transaction; not ported.

```tsx
{
                pattern: "/l/", type: "block/alignment/left", wrapper: { start: "/l/",end:"" },
                process: async (args: ITextPatternRecogniserHandler) => {
                    const { block } = args;
                    self.removeBlockProperties(block, (x) => x.type.indexOf("block/alignment/") >= 0);
                    block.addBlockProperties([ { type: "block/alignment/left" } ]);
                    block.applyBlockPropertyStyling();
                }
            }
```

### library-text-processor-text-rule-20

Source: [src/library/text-processor.ts:165](../speedy-ts/src/library/text-processor.ts). Kind: `text-rule`. Context: `TextProcessor`.

Route: Document custom onTextChanged → TextProcessor.process → replacements before rules. Destination: mapped post-edit recognizer transaction; not ported.

```tsx
{
                pattern: "/r/", type: "block/alignment/right", wrapper: { start: "/r/",end:"" },
                process: async (args: ITextPatternRecogniserHandler) => {
                    const { block } = args;
                    self.removeBlockProperties(block, (x) => x.type.indexOf("block/alignment/") >= 0);
                    block.addBlockProperties([ { type: "block/alignment/right" } ]);
                    block.applyBlockPropertyStyling();
                }
            }
```

### library-text-processor-text-rule-21

Source: [src/library/text-processor.ts:174](../speedy-ts/src/library/text-processor.ts). Kind: `text-rule`. Context: `TextProcessor`.

Route: Document custom onTextChanged → TextProcessor.process → replacements before rules. Destination: mapped post-edit recognizer transaction; not ported.

```tsx
{
                pattern: "\\[ \\]", wrapper: {  start: "[ ]", end: "" },
                process: async (args: ITextPatternRecogniserHandler) => {
                    const { block } = args;
                    const doc = args.block.manager.getParentOfType(args.block, BlockType.DocumentBlock) as DocumentBlock;
                    doc.makeCheckbox(block);
                }
            }
```

### library-text-processor-text-rule-22

Source: [src/library/text-processor.ts:182](../speedy-ts/src/library/text-processor.ts). Kind: `text-rule`. Context: `TextProcessor`.

Route: Document custom onTextChanged → TextProcessor.process → replacements before rules. Destination: mapped post-edit recognizer transaction; not ported.

```tsx
{
                pattern: "^- ", wrapper: {  start: "- ", end: "" },
                process: async (args: ITextPatternRecogniserHandler) => {
                    const { block } = args;
                    const doc = args.block.manager.getParentOfType(args.block, BlockType.DocumentBlock) as DocumentBlock;
                    doc.indentBlock({ block });
                }
            }
```

### library-text-processor-text-rule-23

Source: [src/library/text-processor.ts:190](../speedy-ts/src/library/text-processor.ts). Kind: `text-rule`. Context: `TextProcessor`.

Route: Document custom onTextChanged → TextProcessor.process → replacements before rules. Destination: mapped post-edit recognizer transaction; not ported.

```tsx
{
                pattern: "/c/", type: "block/alignment/center", wrapper: { start: "/c/", end: "" },
                process: async (args: ITextPatternRecogniserHandler) => {
                    const { block } = args;
                    self.removeBlockProperties(block, (x) => x.type.indexOf("block/alignment/") >= 0);
                    block.addBlockProperties([ { type: "block/alignment/center" } ]);
                    block.applyBlockPropertyStyling();
                }
            }
```

### library-text-processor-text-rule-24

Source: [src/library/text-processor.ts:199](../speedy-ts/src/library/text-processor.ts). Kind: `text-rule`. Context: `TextProcessor`.

Route: Document custom onTextChanged → TextProcessor.process → replacements before rules. Destination: mapped post-edit recognizer transaction; not ported.

```tsx
{
                pattern: "/j/", type: "block/alignment/justify", wrapper: { start: "/j/", end: "" },
                process: async (args: ITextPatternRecogniserHandler) => {
                    const { block } = args;
                    self.removeBlockProperties(block, (x) => x.type.indexOf("block/alignment/") >= 0);
                    block.addBlockProperties([ { type: "block/alignment/justify" } ]);
                    block.applyBlockPropertyStyling();
                }
            }
```

### library-text-processor-text-rule-25

Source: [src/library/text-processor.ts:208](../speedy-ts/src/library/text-processor.ts). Kind: `text-rule`. Context: `TextProcessor`.

Route: Document custom onTextChanged → TextProcessor.process → replacements before rules. Destination: mapped post-edit recognizer transaction; not ported.

```tsx
{
                pattern: "/h1/", type: "block/font/size/h1", wrapper: { start: "/h1/", end: "" },
                process: async (args: ITextPatternRecogniserHandler) => {
                    const { block } = args;
                    self.removeBlockProperties(block, (x) => x.type.indexOf("block/font/size/") >= 0);
                    block.addBlockProperties([ { type: "block/font/size/h1" } ]);
                    block.applyBlockPropertyStyling();
                }
            }
```

### library-text-processor-text-rule-26

Source: [src/library/text-processor.ts:217](../speedy-ts/src/library/text-processor.ts). Kind: `text-rule`. Context: `TextProcessor`.

Route: Document custom onTextChanged → TextProcessor.process → replacements before rules. Destination: mapped post-edit recognizer transaction; not ported.

```tsx
{
                pattern: "/h2/", type: "block/font/size/h2", wrapper: { start: "/h2/", end: "" },
                process: async (args: ITextPatternRecogniserHandler) => {
                    const { block } = args;
                    self.removeBlockProperties(block, (x) => x.type.indexOf("block/font/size/") >= 0);
                    block.addBlockProperties([ { type: "block/font/size/h2" } ]);
                    block.applyBlockPropertyStyling();
                }
            }
```

### library-text-processor-text-rule-27

Source: [src/library/text-processor.ts:226](../speedy-ts/src/library/text-processor.ts). Kind: `text-rule`. Context: `TextProcessor`.

Route: Document custom onTextChanged → TextProcessor.process → replacements before rules. Destination: mapped post-edit recognizer transaction; not ported.

```tsx
{
                pattern: "/h3/", type: "block/font/size/h3", wrapper: { start: "/h3/", end: "" },
                process: async (args: ITextPatternRecogniserHandler) => {
                    const { block } = args;
                    self.removeBlockProperties(block, (x) => x.type.indexOf("block/font/size/") >= 0);
                    block.addBlockProperties([ { type: "block/font/size/h3" } ]);
                    block.applyBlockPropertyStyling();
                }
            }
```

### library-text-processor-text-rule-28

Source: [src/library/text-processor.ts:235](../speedy-ts/src/library/text-processor.ts). Kind: `text-rule`. Context: `TextProcessor`.

Route: Document custom onTextChanged → TextProcessor.process → replacements before rules. Destination: mapped post-edit recognizer transaction; not ported.

```tsx
{
                pattern: "/h4/", type: "block/font/size/h4", wrapper: { start: "/h4/", end: "" },
                process: async (args: ITextPatternRecogniserHandler) => {
                    const { block } = args;
                    self.removeBlockProperties(block, (x) => x.type.indexOf("block/font/size/") >= 0);
                    block.addBlockProperties([ { type: "block/font/size/h4" } ]);
                    block.applyBlockPropertyStyling();
                }
            }
```

### library-text-processor-text-rule-29

Source: [src/library/text-processor.ts:244](../speedy-ts/src/library/text-processor.ts). Kind: `text-rule`. Context: `TextProcessor`.

Route: Document custom onTextChanged → TextProcessor.process → replacements before rules. Destination: mapped post-edit recognizer transaction; not ported.

```tsx
{
                pattern: "\\[<(.*?)>\\]", type: "style/rectangle", wrapper: { start: "[<", end: ">]" }
            }
```

### library-text-processor-text-rule-30

Source: [src/library/text-processor.ts:247](../speedy-ts/src/library/text-processor.ts). Kind: `text-rule`. Context: `TextProcessor`.

Route: Document custom onTextChanged → TextProcessor.process → replacements before rules. Destination: mapped post-edit recognizer transaction; not ported.

```tsx
{
                pattern: "/spiky/(.*?)/", type: "style/spiky", wrapper: { start: "[spike/", end: "/" }
            }
```

### library-text-processor-text-rule-31

Source: [src/library/text-processor.ts:250](../speedy-ts/src/library/text-processor.ts). Kind: `text-rule`. Context: `TextProcessor`.

Route: Document custom onTextChanged → TextProcessor.process → replacements before rules. Destination: mapped post-edit recognizer transaction; not ported.

```tsx
{
                pattern: "/rain/(.*?)/", type: "style/rainbow", wrapper: { start: "/rain/", end: "/" }
            }
```

### library-text-processor-text-rule-32

Source: [src/library/text-processor.ts:253](../speedy-ts/src/library/text-processor.ts). Kind: `text-rule`. Context: `TextProcessor`.

Route: Document custom onTextChanged → TextProcessor.process → replacements before rules. Destination: mapped post-edit recognizer transaction; not ported.

```tsx
{
                pattern: "/arial/(.*?)/", type: "font/family/arial", wrapper: { start: "/arial/", end: "/" }
            }
```

### library-text-processor-text-rule-33

Source: [src/library/text-processor.ts:256](../speedy-ts/src/library/text-processor.ts). Kind: `text-rule`. Context: `TextProcessor`.

Route: Document custom onTextChanged → TextProcessor.process → replacements before rules. Destination: mapped post-edit recognizer transaction; not ported.

```tsx
{
                pattern: "/mono/(.*?)/", type: "font/family/mono", wrapper: { start: "/mono/", end: "/" }
            }
```

### library-text-processor-text-rule-34

Source: [src/library/text-processor.ts:259](../speedy-ts/src/library/text-processor.ts). Kind: `text-rule`. Context: `TextProcessor`.

Route: Document custom onTextChanged → TextProcessor.process → replacements before rules. Destination: mapped post-edit recognizer transaction; not ported.

```tsx
{
                pattern: "/red/(.*?)/", type: "font/color", wrapper: { start: "/red/", end: "/" },
                process: async (args: ITextPatternRecogniserHandler) => {
                    const { match, block } = args;
                    block.addStandoffPropertiesDto([{
                        type: "font/color",
                        value: "red",
                        start: match.start, end: match.end
                    }]);
                    block.applyStandoffPropertyStyling();
                }
            }
```

### library-text-processor-text-rule-35

Source: [src/library/text-processor.ts:271](../speedy-ts/src/library/text-processor.ts). Kind: `text-rule`. Context: `TextProcessor`.

Route: Document custom onTextChanged → TextProcessor.process → replacements before rules. Destination: mapped post-edit recognizer transaction; not ported.

```tsx
{
                pattern: "/blue/(.*?)/", type: "font/color", wrapper: { start: "/blue/", end: "/" },
                process:async (args: ITextPatternRecogniserHandler) => {
                    const { match, block } = args;
                    block.addStandoffPropertiesDto([{
                        type: "font/color",
                        value: "blue",
                        start: match.start, end: match.end
                    }]);
                    block.applyStandoffPropertyStyling();
                }
            }
```

### library-text-processor-text-rule-36

Source: [src/library/text-processor.ts:283](../speedy-ts/src/library/text-processor.ts). Kind: `text-rule`. Context: `TextProcessor`.

Route: Document custom onTextChanged → TextProcessor.process → replacements before rules. Destination: mapped post-edit recognizer transaction; not ported.

```tsx
{
                //pattern: "/https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=[\w-]+(?:[&=%\w-]*)?|youtu\.be\/[\w-]+)/",
                pattern: urlRegex(),
                type: "",
                process: async (args: ITextPatternRecogniserHandler) => {
                    const { match, block } = args;
                    const manager = args.block.manager;
                    const doc = manager.getParentOfType(block, BlockType.DocumentBlock) as DocumentBlock;
                    if (!doc) return;
                    const url = args.text.substring(match.start, match.end);
                    doc.addVideoBlock(block, url);
                    if (match.start == 0) {
                        doc.deleteBlock(block.id);
                    } else {
                        block.removeCellsAtIndex(match.start, match.end - match.start - 1)
                    }
                }
            }
```

### library-text-processor-text-rule-37

Source: [src/library/text-processor.ts:301](../speedy-ts/src/library/text-processor.ts). Kind: `text-rule`. Context: `TextProcessor`.

Route: Document custom onTextChanged → TextProcessor.process → replacements before rules. Destination: mapped post-edit recognizer transaction; not ported.

```tsx
{
                type: "agent",
                pattern: "\\[today\\]",
                process: async (args: ITextPatternRecogniserHandler) => {
                    const { match, block } = args;
                    block.removeCellsAtIndex(match.start, match.end - match.start + 1)
                    const now = new Date();
                    const day = ("0" + now.getDate()).slice(-2);
                    const month = ("0" + (now.getMonth() + 1)).slice(-2);
                    const year = now.getFullYear();
                    const dateText = `${day}/${month}/${year}`;
                    block.insertTextAtIndex(dateText, match.start);
                    // $.get("/Admin/Agent/FindOrCreate", params, (response) => {
                    //     if (!response.Success) {
                    //         return;
                    //     }
                    //     const guid = response.Data.Guid;
                    //     editor.createProperty(rule.type, guid, { start, end });
                    // });
                }
            }
```

### Named implementation index

This index intentionally includes helper methods as well as handlers. Resolve named calls in the entries above here; methods with no caller/binding are **not** automatically live commands. Shared support methods may be implemented in another indexed file (notably AbstractBlock, DocumentBlock, UniverseBlock, StandoffProperty and SVG helpers).

| Context | Callable | Source |
| --- | --- | --- |
|  | `getMatches` | [src/library/text-processor.ts:29](../speedy-ts/src/library/text-processor.ts) |
| TextProcessor | `process` | [src/library/text-processor.ts:324](../speedy-ts/src/library/text-processor.ts) |
| TextProcessor | `processReplacements` | [src/library/text-processor.ts:328](../speedy-ts/src/library/text-processor.ts) |
| TextProcessor | `processRules` | [src/library/text-processor.ts:346](../speedy-ts/src/library/text-processor.ts) |
| TextProcessor | `removeBlockProperties` | [src/library/text-processor.ts:401](../speedy-ts/src/library/text-processor.ts) |
| TextProcessor | `replaceTextWith` | [src/library/text-processor.ts:407](../speedy-ts/src/library/text-processor.ts) |

### Commented/disabled evidence

These are source comments, not installed listeners. They also include relevant intent notes and TODO context. Use the addendum's reachability findings before treating an old commented design as a parity requirement.

- [src/library/text-processor.ts:313](../speedy-ts/src/library/text-processor.ts) — // $.get("/Admin/Agent/FindOrCreate", params, (response) =&gt; {
- [src/library/text-processor.ts:314](../speedy-ts/src/library/text-processor.ts) — //     if (!response.Success) {
- [src/library/text-processor.ts:317](../speedy-ts/src/library/text-processor.ts) — //     const guid = response.Data.Guid;

## src/library/types.ts

Source: [src/library/types.ts:1](../speedy-ts/src/library/types.ts). SHA-256: `a13841e3f7b184067f7170b084459c1413ea1eaf3ffc37527d85ae073d09ead5`.

Migration family/status: Supporting application/library code; no local user-input installation was found unless explicitly listed below. Preserve any caller-owned lifecycle or native boundary.

Classes: `Word` (no superclass).

No local binding/listener/callback/recognizer sites found by the census. For Block classes this **does not mean no behavior**: follow inherited AbstractBlock navigation, nearest Document commands, Universe routing, schema effects and native/widget boundaries in the addendum.

### Named implementation index

This index intentionally includes helper methods as well as handlers. Resolve named calls in the entries above here; methods with no caller/binding are **not** automatically live commands. Shared support methods may be implemented in another indexed file (notably AbstractBlock, DocumentBlock, UniverseBlock, StandoffProperty and SVG helpers).

| Context | Callable | Source |
| --- | --- | --- |
|  | `isStr` | [src/library/types.ts:512](../speedy-ts/src/library/types.ts) |
|  | `isNum` | [src/library/types.ts:513](../speedy-ts/src/library/types.ts) |

### Commented/disabled evidence

These are source comments, not installed listeners. They also include relevant intent notes and TODO context. Use the addendum's reachability findings before treating an old commented design as a parity requirement.

- [src/library/types.ts:101](../speedy-ts/src/library/types.ts) — // for coordinating actions between Blocks
- [src/library/types.ts:178](../speedy-ts/src/library/types.ts) — /**  * A place to store collections of absolutely-positioned SVG elements that   * are overlaid on the text underneath, e.g., for overlapping underlines.  */
- [src/library/types.ts:361](../speedy-ts/src/library/types.ts) — // See the one below

## src/properties/block-properties.ts

Source: [src/properties/block-properties.ts:1](../speedy-ts/src/properties/block-properties.ts). SHA-256: `bb3fa4bd4b26196554d87383e70ed54bbace5a72c94f52edde6add0e8ae99553`.

Migration family/status: Declarative appearance plus scoped property effects; drag callbacks only partially represented.

### properties-block-properties-callback-01

Source: [src/properties/block-properties.ts:39](../speedy-ts/src/properties/block-properties.ts). Kind: `callback`. Context: `BlockPropertySchemas`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onInit: async (p: BlockProperty) => {
                const container = p.block.container;
                const handle = (container.querySelector(".drag-handle") || container) as HTMLDivElement;
                if (p.metadata.position) {
                    container.style.transform = `translate(${p.metadata.position.x}px, ${p.metadata.position.y}px)`;
                }
                const dragger = new DraggableWindow(container, handle, {
                    enableResize: true,
                    minimizeDuration: 300,  // Optional: Customize minimize animation duration
                    minimizeIconClass: 'minimized-icon',  // Custom class for minimized icon
                    onDragStart: () => console.log('Started dragging'),
                    onDragMove: (x, y) => {
                        console.log(`Dragging to ${x}, ${y}`);
                        p.metadata.position = { x, y };
                    },
                    onDragEnd: () => {
                        console.log('Stopped dragging');
                    },
                });
                p.metadata.dragger = dragger;
            }
```

### properties-block-properties-callback-02

Source: [src/properties/block-properties.ts:49](../speedy-ts/src/properties/block-properties.ts). Kind: `callback`. Context: `BlockPropertySchemas.dragger`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onDragStart: () => console.log('Started dragging')
```

### properties-block-properties-callback-03

Source: [src/properties/block-properties.ts:50](../speedy-ts/src/properties/block-properties.ts). Kind: `callback`. Context: `BlockPropertySchemas.dragger`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onDragMove: (x, y) => {
                        console.log(`Dragging to ${x}, ${y}`);
                        p.metadata.position = { x, y };
                    }
```

### properties-block-properties-callback-04

Source: [src/properties/block-properties.ts:54](../speedy-ts/src/properties/block-properties.ts). Kind: `callback`. Context: `BlockPropertySchemas.dragger`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onDragEnd: () => {
                        console.log('Stopped dragging');
                    }
```

### properties-block-properties-callback-05

Source: [src/properties/block-properties.ts:60](../speedy-ts/src/properties/block-properties.ts). Kind: `callback`. Context: `BlockPropertySchemas`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onDestroy: async (p: BlockProperty) => {
                (p.metadata.dragger as DraggableWindow).destroy();
            }
```

### properties-block-properties-callback-06

Source: [src/properties/block-properties.ts:175](../speedy-ts/src/properties/block-properties.ts). Kind: `callback`. Context: `BlockPropertySchemas`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onInit: (p: BlockProperty) => {
                const container = p.block.container;
                const {width, height} = p.metadata;
                setElement(container, {
                    style: {
                        height: isStr(height) ? height : height + "px",
                        width: isStr(width) ? width : width + "px",
                        "overflow-y": "auto",
                        "overflow-x": "hidden"
                    }
                });
                const minWidth = p.metadata["min-width"];
                if (minWidth) {
                    setElement(container, {
                    style: {
                        "min-width": minWidth + "px"
                    }
                });
                }
            }
```

### properties-block-properties-callback-07

Source: [src/properties/block-properties.ts:201](../speedy-ts/src/properties/block-properties.ts). Kind: `callback`. Context: `BlockPropertySchemas`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onInit: (p: BlockProperty) => {
                const manager = p.block.manager;
                const container = p.block.container;
                const {x, y, position } = p.metadata;
                setElement(container, {
                    style: {
                        position: position || "absolute",
                        left: x + "px",
                        top: y + "px",
                        "z-index": manager.getHighestZIndex()
                    }
                });
            }
```

### Named implementation index

This index intentionally includes helper methods as well as handlers. Resolve named calls in the entries above here; methods with no caller/binding are **not** automatically live commands. Shared support methods may be implemented in another indexed file (notably AbstractBlock, DocumentBlock, UniverseBlock, StandoffProperty and SVG helpers).

| Context | Callable | Source |
| --- | --- | --- |
| BlockPropertySchemas | `getDocumentBlockProperties` | [src/properties/block-properties.ts:7](../speedy-ts/src/properties/block-properties.ts) |
| BlockPropertySchemas | `getStandoffBlockProperties` | [src/properties/block-properties.ts:21](../speedy-ts/src/properties/block-properties.ts) |

### Commented/disabled evidence

These are source comments, not installed listeners. They also include relevant intent notes and TODO context. Use the addendum's reachability findings before treating an old commented design as a parity requirement.

- [src/properties/block-properties.ts:47](../speedy-ts/src/properties/block-properties.ts) — // Optional: Customize minimize animation duration

## src/universe-block.ts

Source: [src/universe-block.ts:1](../speedy-ts/src/universe-block.ts). SHA-256: `b25f47c7e0579e7ff37ff5e375e78d6c2e67396158bcb54f90f587c177186e6e`.

Migration family/status: Central dispatcher, workspace/document/focus commands; legacy routing not ported.

Classes: `UniverseBlock` (extends AbstractBlock implements IUniverseBlock).

Binding installation/override sites (first source line; inspect surrounding constructor/factory):

- [src/universe-block.ts:70](../speedy-ts/src/universe-block.ts) — `UniverseBlock`: `this.inputEvents = this.getInputEvents()`
- [src/universe-block.ts:113](../speedy-ts/src/universe-block.ts) — `UniverseBlock.destroy`: `this.inputEvents = []`
- [src/universe-block.ts:1568](../speedy-ts/src/universe-block.ts) — `UniverseBlock.createDocumentTabBlock`: `block.inputEvents = inputEvents`
- [src/universe-block.ts:1629](../speedy-ts/src/universe-block.ts) — `UniverseBlock.createPlainTextBlock`: `block.setEvents(events)`
- [src/universe-block.ts:1685](../speedy-ts/src/universe-block.ts) — `UniverseBlock.createDocumentTabRowBlock`: `block.inputEvents = inputEvents`

### universe-block-listener-01

Source: [src/universe-block.ts:301](../speedy-ts/src/universe-block.ts). Kind: `listener`. Context: `UniverseBlock.attachEventBindings`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
document.body.addEventListener("keydown", this.handleKeyboardInputEvents.bind(this))
```

### universe-block-listener-02

Source: [src/universe-block.ts:302](../speedy-ts/src/universe-block.ts). Kind: `listener`. Context: `UniverseBlock.attachEventBindings`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
document.body.addEventListener("keydown", this.handleOnTextChanged.bind(this))
```

### universe-block-listener-03

Source: [src/universe-block.ts:303](../speedy-ts/src/universe-block.ts). Kind: `listener`. Context: `UniverseBlock.attachEventBindings`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
document.body.addEventListener("click", this.handleMouseInputEvents.bind(this))
```

### universe-block-listener-04

Source: [src/universe-block.ts:304](../speedy-ts/src/universe-block.ts). Kind: `listener`. Context: `UniverseBlock.attachEventBindings`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
document.body.addEventListener("dblclick", this.handleMouseInputEvents.bind(this))
```

### universe-block-listener-05

Source: [src/universe-block.ts:305](../speedy-ts/src/universe-block.ts). Kind: `listener`. Context: `UniverseBlock.attachEventBindings`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
document.body.addEventListener("contextmenu", this.handleOnContextMenuEvent.bind(this))
```

### universe-block-listener-06

Source: [src/universe-block.ts:306](../speedy-ts/src/universe-block.ts). Kind: `listener`. Context: `UniverseBlock.attachEventBindings`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
document.body.addEventListener("copy", this.handleOnCopyEvent.bind(this))
```

### universe-block-listener-07

Source: [src/universe-block.ts:307](../speedy-ts/src/universe-block.ts). Kind: `listener`. Context: `UniverseBlock.attachEventBindings`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
document.body.addEventListener("paste", this.handleOnPasteEvent.bind(this))
```

### universe-block-listener-08

Source: [src/universe-block.ts:308](../speedy-ts/src/universe-block.ts). Kind: `listener`. Context: `UniverseBlock.attachEventBindings`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
document.body.addEventListener("beforeinput", (e) => {
            const focusedBlock = this.getBlockInFocus() as StandoffEditorBlock;
            const isStandoffBlock = focusedBlock.type == BlockType.StandoffEditorBlock;
            if (e.data == ". ") {
                // MacOS
                e.preventDefault();
                if (isStandoffBlock) {
                    const caret = focusedBlock.getCaret() as Caret;
                    const i = caret.left ? caret.left.index : 0;
                    focusedBlock.insertTextAtIndex(" ", i + 1);
                }
                return false;
            }
        })
```

### universe-block-binding-01

Source: [src/universe-block.ts:372](../speedy-ts/src/universe-block.ts). Kind: `binding`. Context: `UniverseBlock.getGlobalInputEvents`.

Route: the owning Block's binding list, subject to actual factory installation, mode/trigger matching and origin-to-owner dispatch. Destination/status: the file's migration family above; unresolved until individually qualified.

```tsx
{
                mode: "global",
                trigger: {
                    source: InputEventSource.Keyboard,
                    match: "Delete"
                },
                action: {
                    name: "Delete block currently in focus or selected.",
                    description: "",
                    handler: this.handleDeleteBlock.bind(this)
                }
            }
```

### universe-block-binding-02

Source: [src/universe-block.ts:537](../speedy-ts/src/universe-block.ts). Kind: `binding`. Context: `UniverseBlock.getDocumentTabBlockEvents.events`.

Route: the owning Block's binding list, subject to actual factory installation, mode/trigger matching and origin-to-owner dispatch. Destination/status: the file's migration family above; unresolved until individually qualified.

```tsx
{
                mode: "default",
                trigger: {
                    source: InputEventSource.Mouse,
                    match: "click"
                },
                action: {
                    name: "Set focus to the current block.",
                    description: "",
                    handler: async (args: IBindingHandlerArgs) => {
                        const block = args.block;
                        const manager = block.manager as UniverseBlock;
                        manager.setBlockFocus(block);
                    }
                }
            }
```

### universe-block-binding-03

Source: [src/universe-block.ts:559](../speedy-ts/src/universe-block.ts). Kind: `binding`. Context: `UniverseBlock.getTabBlockEvents.events`.

Route: the owning Block's binding list, subject to actual factory installation, mode/trigger matching and origin-to-owner dispatch. Destination/status: the file's migration family above; unresolved until individually qualified.

```tsx
{
                mode: "default",
                trigger: {
                    source: InputEventSource.Mouse,
                    match: "click"
                },
                action: {
                    name: "Set focus to the current block.",
                    description: "",
                    handler: async (args: IBindingHandlerArgs) => {
                        const block = args.block;
                        const manager = block.manager as UniverseBlock;
                        manager.setBlockFocus(block);
                    }
                }
            }
```

### universe-block-binding-04

Source: [src/universe-block.ts:582](../speedy-ts/src/universe-block.ts). Kind: `binding`. Context: `UniverseBlock.getInputEvents.events`.

Route: the owning Block's binding list, subject to actual factory installation, mode/trigger matching and origin-to-owner dispatch. Destination/status: the file's migration family above; unresolved until individually qualified.

```tsx
{
                mode: "default",
                trigger: {
                    source: InputEventSource.Custom,
                    match: "contextmenu"
                },
                action: {
                    name: "Context Menu.",
                    description: "",
                    handler: async (args: IBindingHandlerArgs) => {
                        const block = args.block;
                        const manager = block.manager as UniverseBlock;
                        manager.loadBlockMenu(args);
                    }
                }
            }
```

### universe-block-binding-05

Source: [src/universe-block.ts:598](../speedy-ts/src/universe-block.ts). Kind: `binding`. Context: `UniverseBlock.getInputEvents.events`.

Route: the owning Block's binding list, subject to actual factory installation, mode/trigger matching and origin-to-owner dispatch. Destination/status: the file's migration family above; unresolved until individually qualified.

```tsx
{
                mode: "default",
                trigger: {
                    source: InputEventSource.Keyboard,
                    match: ["Mac:Meta-1","Win:Control-1"]
                },
                action: {
                    name: "Save workspace",
                    description: `
                        
                    `,
                    handler: async (args) => {
                        _this.saveWorkspaceAsync();
                    }
                }
            }
```

### universe-block-binding-06

Source: [src/universe-block.ts:614](../speedy-ts/src/universe-block.ts). Kind: `binding`. Context: `UniverseBlock.getInputEvents.events`.

Route: the owning Block's binding list, subject to actual factory installation, mode/trigger matching and origin-to-owner dispatch. Destination/status: the file's migration family above; unresolved until individually qualified.

```tsx
{
                mode: "default",
                trigger: {
                    source: InputEventSource.Keyboard,
                    match: ["Mac:Meta-2","Win:Control-2"]
                },
                action: {
                    name: "Load workspace",
                    description: `
                        
                    `,
                    handler: async (args) => {
                        await _this.loadWorkspace();
                    }
                }
            }
```

### universe-block-callback-01

Source: [src/universe-block.ts:1802](../speedy-ts/src/universe-block.ts). Kind: `callback`. Context: `UniverseBlock.createDocumentWindowBlock.block`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
onClose: async (b) => b.destroy()
```

### universe-block-assignment-01

Source: [src/universe-block.ts:1988](../speedy-ts/src/universe-block.ts). Kind: `assignment`. Context: `UniverseBlock.getImageDimensions`.

Route: direct/helper/callback path shown below; see the file's migration family above and the addendum for activation, lifecycle and suppression qualifications.

```tsx
img.onload = resolve
```

### Named implementation index

This index intentionally includes helper methods as well as handlers. Resolve named calls in the entries above here; methods with no caller/binding are **not** automatically live commands. Shared support methods may be implemented in another indexed file (notably AbstractBlock, DocumentBlock, UniverseBlock, StandoffProperty and SVG helpers).

| Context | Callable | Source |
| --- | --- | --- |
| UniverseBlock | `addBlockBuilders` | [src/universe-block.ts:85](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `addBlockBuilder` | [src/universe-block.ts:89](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `setFolder` | [src/universe-block.ts:92](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `destroyAll` | [src/universe-block.ts:95](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `deserialize` | [src/universe-block.ts:106](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `destroy` | [src/universe-block.ts:109](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `findNearestBlockByElement` | [src/universe-block.ts:121](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `handleMouseInputEvents` | [src/universe-block.ts:135](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `isPassoverBlock` | [src/universe-block.ts:183](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `getBlockFromElement` | [src/universe-block.ts:191](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `handleKeyboardInputEvents` | [src/universe-block.ts:200](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `getWorkspace` | [src/universe-block.ts:266](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `getBackground` | [src/universe-block.ts:269](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `deactivateBlockSelection` | [src/universe-block.ts:272](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `activateBlockSelection` | [src/universe-block.ts:276](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `hasSelections` | [src/universe-block.ts:280](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `toggleBlockSelection` | [src/universe-block.ts:283](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `deleteSelections` | [src/universe-block.ts:292](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `attachEventBindings` | [src/universe-block.ts:300](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `handleOnContextMenuEvent` | [src/universe-block.ts:323](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `handleOnCopyEvent` | [src/universe-block.ts:326](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `handleOnPasteEvent` | [src/universe-block.ts:329](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `handleOnTextChanged` | [src/universe-block.ts:332](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `handleCustomEvent` | [src/universe-block.ts:335](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `getPlainTextInputEvents` | [src/universe-block.ts:364](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `getGlobalInputEvents` | [src/universe-block.ts:370](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `updateView` | [src/universe-block.ts:386](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `batchRelate` | [src/universe-block.ts:389](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `setFocus` | [src/universe-block.ts:417](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `setBlockFocus` | [src/universe-block.ts:420](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `animateSineWave` | [src/universe-block.ts:479](../speedy-ts/src/universe-block.ts) |
| UniverseBlock.animateSineWave | `scrollText` | [src/universe-block.ts:501](../speedy-ts/src/universe-block.ts) |
| UniverseBlock.animateSineWave | `getTime` | [src/universe-block.ts:519](../speedy-ts/src/universe-block.ts) |
| UniverseBlock.animateSineWave | `animate` | [src/universe-block.ts:524](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `getDocumentTabBlockEvents` | [src/universe-block.ts:535](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `getTabBlockEvents` | [src/universe-block.ts:557](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `getInputEvents` | [src/universe-block.ts:579](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `getParentOfType` | [src/universe-block.ts:633](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `getParent` | [src/universe-block.ts:643](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `getAncestors` | [src/universe-block.ts:653](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `switchBackground` | [src/universe-block.ts:666](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `deserializeBlock` | [src/universe-block.ts:669](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `serialize` | [src/universe-block.ts:679](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `getPlatformKey` | [src/universe-block.ts:689](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `getBlock` | [src/universe-block.ts:692](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `commit` | [src/universe-block.ts:695](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `handleDeleteBlock` | [src/universe-block.ts:698](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `loadEntitiesList` | [src/universe-block.ts:719](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `removeBlockFrom` | [src/universe-block.ts:745](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `insertBlockAfter` | [src/universe-block.ts:754](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `insertBlockBefore` | [src/universe-block.ts:781](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `deregisterBlock` | [src/universe-block.ts:808](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `generatePreviousNextRelations` | [src/universe-block.ts:812](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `storeCommit` | [src/universe-block.ts:822](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `stageRightMarginBlock` | [src/universe-block.ts:826](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `stageLeftMarginBlock` | [src/universe-block.ts:853](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `listFolders` | [src/universe-block.ts:880](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `listDocuments` | [src/universe-block.ts:885](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `listWorkspaces` | [src/universe-block.ts:890](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `listTemplates` | [src/universe-block.ts:895](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `loadServerTemplate` | [src/universe-block.ts:900](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `loadServerDocument` | [src/universe-block.ts:911](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `turnRightRotateBlockProperty` | [src/universe-block.ts:946](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `addOrDecreaseIndentBlockProperty` | [src/universe-block.ts:970](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `clearFormatting` | [src/universe-block.ts:992](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `addOrEditBlockStyle` | [src/universe-block.ts:1001](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `applyStyle` | [src/universe-block.ts:1016](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `turnLeftRotateBlockProperty` | [src/universe-block.ts:1023](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `addOrIncreaseIndentBlockProperty` | [src/universe-block.ts:1047](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `saveServerDocument` | [src/universe-block.ts:1067](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `buildUnknownBlock` | [src/universe-block.ts:1091](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `addBlockTo` | [src/universe-block.ts:1099](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `loadBlockMenu` | [src/universe-block.ts:1105](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `buildChildren` | [src/universe-block.ts:1147](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `generateParentSiblingRelations` | [src/universe-block.ts:1160](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `handleBuildingMarginBlocks` | [src/universe-block.ts:1171](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `getBlockBuilder` | [src/universe-block.ts:1187](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `migrateType` | [src/universe-block.ts:1191](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `updateFromMetadata` | [src/universe-block.ts:1196](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `recursivelyBuildBlock` | [src/universe-block.ts:1208](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `getBlockInFocus` | [src/universe-block.ts:1225](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `getDocument` | [src/universe-block.ts:1228](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `loadWindow` | [src/universe-block.ts:1252](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `clearWorkspace` | [src/universe-block.ts:1268](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `setDocumentFocus` | [src/universe-block.ts:1277](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `createYouTubeVideoBackgroundWorkspace` | [src/universe-block.ts:1292](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `createCanvasWorkspace` | [src/universe-block.ts:1311](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `switchToWebGLBackground` | [src/universe-block.ts:1327](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `switchToYouTubeVideoBackground` | [src/universe-block.ts:1333](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `switchToVideoBackground` | [src/universe-block.ts:1344](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `switchToImageBackground` | [src/universe-block.ts:1356](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `createImageWorkspace` | [src/universe-block.ts:1368](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `createVideoWorkspace` | [src/universe-block.ts:1387](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `loadWorkspace` | [src/universe-block.ts:1406](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `flatten` | [src/universe-block.ts:1426](../speedy-ts/src/universe-block.ts) |
| UniverseBlock.flatten | `traverse` | [src/universe-block.ts:1428](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `saveWorkspaceAsync` | [src/universe-block.ts:1437](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `createDocumentWithWindowAsync` | [src/universe-block.ts:1457](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `takeSnapshot` | [src/universe-block.ts:1501](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `loadDocument` | [src/universe-block.ts:1520](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `insertItem` | [src/universe-block.ts:1530](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `renderIndent` | [src/universe-block.ts:1533](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `createDocumentBlock` | [src/universe-block.ts:1546](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `createIndentedListBlock` | [src/universe-block.ts:1554](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `createDocumentTabBlock` | [src/universe-block.ts:1563](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `createTabBlock` | [src/universe-block.ts:1574](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `createGridCellBlock` | [src/universe-block.ts:1588](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `createGridRowBlock` | [src/universe-block.ts:1611](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `createPlainTextBlock` | [src/universe-block.ts:1622](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `createTableBlock` | [src/universe-block.ts:1635](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `createTableRowBlock` | [src/universe-block.ts:1646](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `createTableCellBlock` | [src/universe-block.ts:1657](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `createGridBlock` | [src/universe-block.ts:1668](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `createDocumentTabRowBlock` | [src/universe-block.ts:1679](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `createTabRowBlock` | [src/universe-block.ts:1690](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `createLeftMarginBlock` | [src/universe-block.ts:1704](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `createEmbedDocumentBlock` | [src/universe-block.ts:1714](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `createIFrameBlock` | [src/universe-block.ts:1724](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `createCanvasBlock` | [src/universe-block.ts:1734](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `createVideoBlock` | [src/universe-block.ts:1744](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `createImageBlock` | [src/universe-block.ts:1754](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `createRightMarginBlock` | [src/universe-block.ts:1764](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `randomIntFromInterval` | [src/universe-block.ts:1775](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `getRandomIpsum` | [src/universe-block.ts:1778](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `createWorkspaceBlock` | [src/universe-block.ts:1789](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `createVideoBackgroundBlock` | [src/universe-block.ts:1793](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `createImageBackgroundBlock` | [src/universe-block.ts:1797](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `createDocumentWindowBlock` | [src/universe-block.ts:1801](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `createWindowBlock` | [src/universe-block.ts:1806](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `createCheckboxBlock` | [src/universe-block.ts:1811](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `createStandoffEditorBlockAsync` | [src/universe-block.ts:1815](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `createStandoffEditorBlock__OLD` | [src/universe-block.ts:1822](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `applyImageBackgroundToBlock` | [src/universe-block.ts:1830](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `applyFlipToText` | [src/universe-block.ts:1835](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `applyStandoffProperty` | [src/universe-block.ts:1844](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `setupControlPanel` | [src/universe-block.ts:1852](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `updateEntityReferencesGraph` | [src/universe-block.ts:1861](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `getHighestZIndex` | [src/universe-block.ts:1895](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `undoHistory` | [src/universe-block.ts:1898](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `findNearestNephew` | [src/universe-block.ts:1912](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `swapCells` | [src/universe-block.ts:1924](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `setMultiColumns` | [src/universe-block.ts:1932](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `findNearestUncle` | [src/universe-block.ts:1940](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `getIndexOfBlockById` | [src/universe-block.ts:1949](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `getIndexOfBlock` | [src/universe-block.ts:1958](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `splitLines` | [src/universe-block.ts:1968](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `saveImageToServer` | [src/universe-block.ts:1971](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `getImageDimensions` | [src/universe-block.ts:1985](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `pasteCodexItem` | [src/universe-block.ts:1996](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `createCodeMirrorBlock` | [src/universe-block.ts:2007](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `convertHtmlToStandoff` | [src/universe-block.ts:2015](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `toCodexAnnotationType` | [src/universe-block.ts:2032](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `reindexAncestorDocument` | [src/universe-block.ts:2040](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `registerBlock` | [src/universe-block.ts:2046](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `addTabRowAfter` | [src/universe-block.ts:2052](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `explodeTabs` | [src/universe-block.ts:2059](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `tryParseInt` | [src/universe-block.ts:2070](../speedy-ts/src/universe-block.ts) |
| UniverseBlock | `appendSibling` | [src/universe-block.ts:2077](../speedy-ts/src/universe-block.ts) |

### Commented/disabled evidence

These are source comments, not installed listeners. They also include relevant intent notes and TODO context. Use the addendum's reachability findings before treating an old commented design as a parity requirement.

- [src/universe-block.ts:80](../speedy-ts/src/universe-block.ts) — //this.setupControlPanel();
- [src/universe-block.ts:129](../speedy-ts/src/universe-block.ts) — /**             const blockId = el.closest('[data-block-id]')?.dataset.blockId;             const match = this.registeredBlocks.find(x=&gt; x.id == blockId);             return match;          */
- [src/universe-block.ts:342](../speedy-ts/src/universe-block.ts) — // const focusedBlock = this.getBlockInFocus() as StandoffEditorBlock;
- [src/universe-block.ts:439](../speedy-ts/src/universe-block.ts) — //     const self = this;
- [src/universe-block.ts:445](../speedy-ts/src/universe-block.ts) — //                 onInit: (p: BlockProperty) =&gt; {
- [src/universe-block.ts:446](../speedy-ts/src/universe-block.ts) — //                     const container = p.block.container;
- [src/universe-block.ts:447](../speedy-ts/src/universe-block.ts) — //                     const {x, y, position } = p.metadata;
- [src/universe-block.ts:448](../speedy-ts/src/universe-block.ts) — //                     updateElement(container, {
- [src/universe-block.ts:464](../speedy-ts/src/universe-block.ts) — //                 onInit: (p: BlockProperty) =&gt; {
- [src/universe-block.ts:465](../speedy-ts/src/universe-block.ts) — //                     const container = p.block.container;
- [src/universe-block.ts:466](../speedy-ts/src/universe-block.ts) — //                     const {width, height} = p.metadata;
- [src/universe-block.ts:467](../speedy-ts/src/universe-block.ts) — //                     updateElement(container, {
- [src/universe-block.ts:526](../speedy-ts/src/universe-block.ts) — // delta time in seconds.
- [src/universe-block.ts:1578](../speedy-ts/src/universe-block.ts) — // const inputEvents = this.getTabBlockEvents();
- [src/universe-block.ts:1579](../speedy-ts/src/universe-block.ts) — // const block = new TabBlock({
- [src/universe-block.ts:1582](../speedy-ts/src/universe-block.ts) — // block.inputEvents = inputEvents;
- [src/universe-block.ts:1694](../speedy-ts/src/universe-block.ts) — // const inputEvents = this.getTabBlockEvents();
- [src/universe-block.ts:1695](../speedy-ts/src/universe-block.ts) — // const block = new TabRowBlock({
- [src/universe-block.ts:1699](../speedy-ts/src/universe-block.ts) — // block.inputEvents = inputEvents;
- [src/universe-block.ts:1959](../speedy-ts/src/universe-block.ts) — //const parent = this.getParent(block) as IBlock;
- [src/universe-block.ts:2064](../speedy-ts/src/universe-block.ts) — /**          * Extract all of the blocks inside each tab and put them as siblings of 'tabRow'.          * Then delete all of the TabBlocks inside 'tabRow', then 'tabRow' itself, leaving the contents          * disgorged into the document.          */
