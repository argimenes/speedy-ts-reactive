# Input-handler and annotation-boundary audit addendum

Source audit date: 11 September 2026  
Status: documentation-only investigation; no implementation changes or new runtime tests in this pass.

Subsequent annotation-monitor checkpoint, 12 September 2026: the intent of
`blocks-document-block-binding-44` and monitor bindings 01–10 is converted in
[ANNOTATION_MONITOR_MIGRATION.md](ANNOTATION_MONITOR_MIGRATION.md). Requested
Ctrl+period joins the original slash aliases. The session popup, inclusive-range
selection, movement/resize/deletion, focus return and new validated attribute
editor are qualified; original word-linking/contraction bugs are intentionally
fixed. Entity caches, plugin dialogs and historical AMD monitors are not claimed.

Subsequent margin checkpoint, 12 September 2026: ledger entries
`blocks-document-block-binding-12` and `blocks-document-block-binding-13` now route
Ctrl+Shift+Left/Right from Standoff editors to source-owned left/right margins.
Creation/reuse, relative gutters, smaller aligned text, selection clearing,
occurrence-local caret focus, history and persistence are qualified in
[MARGIN_HANDLER_MIGRATION.md](MARGIN_HANDLER_MIGRATION.md), including safety
differences, seven regression cases and real Chrome keyboard/geometry checks.
Other margin/navigation bindings remain unqualified unless separately recorded.

Subsequent implementation checkpoint, 12 September 2026: the active reactive
workspace now owns `document.open`, `document.save`, and `document.saveAs`
commands, with Ctrl/Cmd+O, Ctrl/Cmd+S, and Ctrl/Cmd+Shift+S. This ports the file
control intent and the active-document save intent of ledger entry
`blocks-document-block-binding-28`. The tree/list browser, unsaved-change guards,
load replacement/disposal, focus return, and Node endpoints are qualified in
[DOCUMENT_STORE_MIGRATION.md](DOCUMENT_STORE_MIGRATION.md). Complete legacy
multiple-window routing and the remainder of this audit are still open. The
source census and hashes below describe the original read-only snapshot.

Subsequent styling checkpoint, 12 September 2026: the first 22 of 27 current
Standoff schemas now have explicit reactive appearance rules, verified with
registry/editing tests and Chrome. See the inventory, source locations, evidence,
and remaining five grouped/plugin/embedded schemas in
[STANDOFF_PROPERTY_MIGRATION.md](STANDOFF_PROPERTY_MIGRATION.md). This qualifies
appearance and the tested style-update paths, not reference activation,
recognizers, every annotation-boundary case, or the full handler catalog below.

This addendum supplements [SOLID_RESTRUCTURE.MD](SOLID_RESTRUCTURE.MD), especially §§4, 6–10, 12 and 13. Read it with the [complete source ledger](INPUT_HANDLER_SOURCE_LEDGER.md) before generating more conversion code. Update [RESTRUCTURE_PROGRESS.md](RESTRUCTURE_PROGRESS.md) as individual parity requirements are implemented and verified.

Subsequent background/context-menu checkpoint, 12 September 2026: four background
adapters and a model-backed general menu now have the qualified paths described
in [BACKGROUND_CONTEXT_MENU_MIGRATION.md](BACKGROUND_CONTEXT_MENU_MIGRATION.md).
This ports the menu intent of `universe-block-binding-04`, Escape dismissal from
`blocks-context-menu-block-binding-01`, and the window-header theme control.
Per the user's explicit request, Control-left-click opens the menu on all
platforms rather than also toggling selection as in
`blocks-document-block-binding-07`; this is an intentional policy change, not a
claim that the old multi-Block selection gesture was ported. Native controls and
dialogs retain ownership. Test/browser evidence and disabled legacy/multi-window
actions are listed in the migration document; other ledger entries remain open.

## 1. Finding and scope

**The reactive reconstruction does not yet reproduce the complete original input behavior.** A registered Solid view, a callable structural command, or a passing split/join test does not demonstrate that the corresponding legacy gesture is routed or behaves correctly. Earlier progress wording that says the original boundary-deletion behavior was “matched” should be read as a tested subset, not full parity.

The reviewed original is /Users/iianneill/Documents/GitHub/speedy-ts, HEAD 5cb144cb2052cfde64ead65eff5f20b974906168. The target is its sibling speedy-ts-reactive. The actual current text-editor class is **StandoffEditorBlock**, in src/blocks/standoff-editor-block.ts; that is the editor referred to as “StandoffPropertyEditorBlock” in the discussion.

The ledger covers all 60 current TS/TSX source files, including:

- All 49 Block/panel classes, including AbstractBlock, UniverseBlock, component-defined panels, and multi-class files.
- All **97 input-binding declarations**, preserving owner, declaration order, mode, exact match/alternatives, and executable action body.
- **65 listener/subscription/removal sites**, **75 JSX event/callback attributes**, **121 callback-property sites**, **3 helper-handler entries**, **3 additional event-object entries**, **4 button-factory callbacks**, **15 class-property functions**, and **1 event-property assignment**.
- The **33 text replacements and 37 recognizer rules** in TextProcessor, which form part of the editing response even though they are not keyboard bindings.
- 28 inputEvents assignment/append sites, plus an index of all 1,059 named callable declarations, so inherited methods, indirect callbacks and disconnected handler methods are discoverable.

These are **454 evidence entries**, not 454 distinct installed input handlers. For example, a removeEventListener call is a cleanup site, onInit may be lifecycle rather than user input, and JSX onClose can forward another callback. Each is retained to avoid losing installation, forwarding or teardown behavior. Counts deliberately retain disconnected declarations.

Scope boundary: src/library/original is an older AMD/JavaScript archive, not the TS Block application being reconstructed; no reference to that archive was found in the current TS/TSX source. Its historical handlers are not silently claimed as audited or converted. Dependency-internal handlers, such as CodeMirror's basicSetup keymaps, belong to their native/widget adapter boundary. If either archive or dependency internals are brought into the migration, expand the ledger explicitly.

### 1.1 Audit method and closure rule

The inventory was made with a TypeScript AST census and cross-checked with source searches for binding installation, handler methods, native listeners, JSX callbacks, event objects, helpers and callers. Source bodies, not just descriptions, were inspected for the document/text paths and specialized controls. The ledger records SHA-256 hashes for all 60 files; line numbers describe that snapshot.

Each ledger ID defaults to **mapped, not parity-qualified**. To close an ID, record:

1. Its installed or intentionally dormant status and routing owner.
2. The destination command/controller/view adapter and exact platform/mode policy.
3. Cancellation, pass-through, focus/caret, selection, annotation, history and serialization effects.
4. Regression evidence, including browser evidence where native editing or geometry is involved.
5. Any deliberate change from original behavior, with a decision reference.

No counts or inventory alone prove the absence of all runtime defects. New findings must be added here/alongside the original ID; do not erase inconvenient source behavior or promote TODOs to implemented features.

## 2. Dispatch is part of the handler contract

### 2.1 Original event graph

    DOM event
      ├─ local DOM / Solid / native-widget listener
      │    └─ possibly a direct action call, bypassing central chord matching
      └─ Universe BODY bubble listeners
           ├─ keydown: logical focused Block → parent chain → Universe
           │    └─ first matching owner's action; args.block stays the origin
           ├─ click / dblclick: nearest registered container → parent chain → Universe
           │    └─ focus origin, then run a matching action at every eligible owner
           ├─ copy / paste / contextmenu / onTextChanged: target container → ancestors
           │    └─ first matching custom action, ignoring modes
           └─ beforeinput: special ". " substitution

This is the original graph, not a recommendation to preserve multiple DOM owners. The proposal moves interception to one capture gateway while retaining declared routing behavior.

Sources: [Universe routing](../speedy-ts/src/universe-block.ts):135, 200, 300, 335, 653; [Abstract matching](../speedy-ts/src/blocks/abstract-block.ts):136–224.

| Concern | Observed original behavior | Reconstruction obligation |
| --- | --- | --- |
| Native attachment | Eight BODY addEventListener sites: keydown twice, click, dblclick, contextmenu, copy, paste, beforeinput. No capture flag. | One owner per gesture; do not retain the second keydown notification as a second editing path. |
| Keyboard origin | Logical focus; event target must be contained in its container. With no focus, only the passover/modal path attempts target-based resolution. Modifier-only keys return. | Keep logical focus distinct from event target, binding owner and saved selection. Native form fields need explicit ownership. |
| Handler arguments | Owner action receives the originating focused/target Block. Keyboard/custom paths supply caret/selection only for Standoff. | Do not substitute the Document or panel owner for args.block. Validate required capabilities before invoking text-only operations. |
| Ancestry | getAncestors starts with the origin, follows relation.parent, then unconditionally appends Universe. Universe can be duplicated. | Derive and deduplicate routing ancestry. Margins have their own Document boundary; do not route through marginParent into the source text. |
| Mode precedence | AbstractBlock starts with default; owner modes are examined last-to-first; within a mode the first declaration wins. Universe starts with global/default. | Preserve mode-stack and declaration priority. A mode named global is not automatically active on every Block. |
| Match alternatives | An array of matches means any alternative for one action. | Do not treat alternatives as a key sequence or multiple actions. |
| Keyboard pass-through | A matched action that calls allowPassthrough stops routing and allows browser behavior. Otherwise preventDefault occurs after awaiting its handler. | Synchronous preflight/cancellation, then async command; pass-through means STOP + allow-native, not try-parent. |
| Mouse routing | Focus is set before dispatch; first matching binding per owner is invoked, then routing continues through all ancestors. suppressEventHandlers on the nearest Block skips central mouse processing. | Preserve declared broadcast versus first-match distinction and focus-suppression intent, without duplicate local/central execution. |
| Custom routing | Matches source=Custom and literal event name, ignoring modes; first owner wins. Normally cancellation precedes awaited handler. onTextChanged opts out of cancellation. | Keep custom dispatch separate from keyboard/mouse matching; emit post-edit notifications once after successful mutation. |
| Local subscription | AbstractBlock.subscribeTo/publish is a separate per-instance event store; publish catches synchronous exceptions and does not bubble. Document subscribes beforeChange to history. | Model notifications and input routing are different mechanisms; migrate both deliberately. |
| Direct click dispatch | Several tab/image/table handlers find a literal “click” entry and invoke it directly with their own arguments. | Inventory the direct path even if the same trigger cannot match centrally. |
| App/native boundaries | PlainText textarea, CodeMirror, context-menu fields, graph-search fields, media and iframe controls have local/native behavior. | Ordinary editing keys cannot blindly reach text-block Document operations. See proposal §10. |

### 2.2 Chord quirks that require explicit decisions

From AbstractBlock.toChord/compareChords/toMouseInput:

- Names are uppercased; keyboard comparison is case-insensitive. An unprefixed binding uses the detected platform. A colon prefix containing MAC means Mac; another colon prefix means Windows.
- CONTROL, META, ALT and SHIFT set modifier flags by substring. The text “Option” is not the ALT token. Do not silently reinterpret the commented Mac:Option-T binding as an active one.
- Quoted literal bindings, such as the checkbox "' '" and monitor "'d'", return true on character match **before modifier/platform checks**. This is observably different from an unquoted letter.
- Mouse comparison checks modifiers and left/right flags, **not the event kind**. click and dblclick can therefore hit the same match.
- “Right button” is coded as button === 1, i.e. the middle-button value. Plain “click” sets neither button flag, so it does not centrally match an ordinary left click; direct listeners can still call those actions.
- Keyboard numeric code uses parseInt(e.code), usually NaN for values such as KeyA. The input-buffer comment describes multi-part chords, but no sequence matcher implements that promise.
- The original generic keyboard path has no composing/dead-key/AltGraph guard and inserts a character only when input.key.length === 1. That UTF-16 check is not a Unicode-safe insertion contract.

These are source findings, not instructions to recreate bugs. The proposal already requires intentional platform/IME handling. Preserve each legacy trigger's intent, characterize its observed behavior, and document any correction.

The original beforeinput exception is specifically data === ". ": it prevents the
browser's substitution and inserts one space for a Standoff origin at
(caret.left ? caret.left.index : 0) + 1. At absolute start that expression is 1,
not 0. It also prevents the substitution on non-Standoff focus and dereferences
focus without a null guard. Characterize the intended macOS double-space policy
without propagating these scope/index defects to native fields.

### 2.3 Installation and reachability traps

- Universe.getGlobalInputEvents declares a global Delete handler, but no caller installing that factory was found. Its constructor installs getInputEvents instead.
- Universe.getTabBlockEvents has only commented callers. The active TabBlock owns its own click binding.
- Universe.createDocumentTabBlock and createDocumentTabRowBlock replace their constructed object's inputEvents with getDocumentTabBlockEvents. Builder and factory paths therefore need separate cases.
- Universe.getPlainTextInputEvents returns an empty list; createPlainTextBlock passes it to setEvents.
- SideBlock's inputEvents assignment is commented, but its direct dblclick listener is active.
- TabRowBlock's older binding factory/root click listener are commented. Its add-label object uses event.click; setElement only installs config.handler, so this declared add callback is **not attached**. DocumentTabRowBlock uses handler.click correctly.
- TableBlock, TableRowBlock and TableCellBlock have direct click listeners, but their local inputEvents lists are empty by default; the local handlers then do nothing.
- CodeMirrorBlock.handleKeyDown exists but attachEventHandlers is empty. ImageBlock.handleKeyDown exists but its keydown attachment is commented.
- MonitorBlock's handleKeyDown and destroy methods throw; actual monitor input bindings are appended when the Solid monitor ref initializes.
- The six Standoff schema onDoubleClick callbacks are declared but no invoking dispatcher was found. Do not count declaration as a working semantic-link gesture.
- StyleBarBlock and BlockMenuBlock suppress central mouse focus handling so controls can act on a retained editing origin. That flag is not a blanket keyboard ownership policy.
- DocumentWindowBlock inherits WindowBlock controls and replaces supplied onClose with its own destroy callback.

All sites, including commented alternatives and wrapper callbacks, remain searchable in the ledger.

## 3. Every Block and panel

The table gives each class an explicit destination/status and inherited-navigation reference. A class with no local binding still participates in Document/Universe routing, schema effects and externally exposed menu commands. Direct callbacks and all exact triggers are in its ledger section.

| Class | Original declaration | Local arrow overrides (source lines) | Migration mapping/status |
| --- | --- | --- | --- |
| AbstractBlock | [src/blocks/abstract-block.ts:14](../speedy-ts/src/blocks/abstract-block.ts) | handleArrowUp (278), handleArrowDown (288), handleArrowRight (301), handleArrowLeft (314) | Shared input dispatcher, focus and per-type navigation adapters; not fully ported. |
| BookBlock | [src/blocks/book-block.ts:8](../speedy-ts/src/blocks/book-block.ts) | AbstractBlock; WindowBlock first for DocumentWindow | Book/pages controller and commands; generic view only, page-turn controls absent. |
| FixedSizePageBlock | [src/blocks/book-block.ts:147](../speedy-ts/src/blocks/book-block.ts) | AbstractBlock; WindowBlock first for DocumentWindow | Book/pages controller and commands; generic view only, page-turn controls absent. |
| CanvasBackgroundBlock | [src/blocks/canvas-background-block.ts:11](../speedy-ts/src/blocks/canvas-background-block.ts) | AbstractBlock; WindowBlock first for DocumentWindow | Background effect adapter; inherits routing, native/media configuration must be preserved. |
| CanvasBlock | [src/blocks/canvas-block.ts:8](../speedy-ts/src/blocks/canvas-block.ts) | AbstractBlock; WindowBlock first for DocumentWindow | Canvas controller; generic view only, InfiniteCanvas gestures absent. |
| CheckboxBlock | [src/blocks/checkbox-block.ts:14](../speedy-ts/src/blocks/checkbox-block.ts) | handleArrowRight (99), handleArrowLeft (102), handleArrowUp (105), handleArrowDown (132) | Checkbox controller and navigation; native change is partial, quoted-space/navigation parity unported. |
| CodeMirrorBlock | [src/blocks/code-mirror-block.ts:11](../speedy-ts/src/blocks/code-mirror-block.ts) | AbstractBlock; WindowBlock first for DocumentWindow | Opaque CodeMirror adapter; current CodeBlockView is a textarea, not CodeMirror parity. |
| ContainerBlock | [src/blocks/container-block.ts:8](../speedy-ts/src/blocks/container-block.ts) | AbstractBlock; WindowBlock first for DocumentWindow | Container commands and inherited routing; generic renderer does not establish input parity. |
| ContextMenuBlock | [src/blocks/context-menu-block.tsx:13](../speedy-ts/src/blocks/context-menu-block.tsx) | AbstractBlock; WindowBlock first for DocumentWindow | Session window-theme panel; generic view only. |
| DocumentBlock | [src/blocks/document-block.ts:41](../speedy-ts/src/blocks/document-block.ts) | AbstractBlock; WindowBlock first for DocumentWindow | Document command controller and Standoff adapter; beforeinput edit subset only, full binding catalog unported. |
| DocumentTabRowBlock | [src/blocks/document-tabs-block.ts:10](../speedy-ts/src/blocks/document-tabs-block.ts) | AbstractBlock; WindowBlock first for DocumentWindow | Document tab/page commands and activation; generic tab selection is partial. |
| DocumentTabBlock | [src/blocks/document-tabs-block.ts:185](../speedy-ts/src/blocks/document-tabs-block.ts) | AbstractBlock; WindowBlock first for DocumentWindow | Document tab/page commands and activation; generic tab selection is partial. |
| DocumentWindowBlock | [src/blocks/document-window-block.ts:13](../speedy-ts/src/blocks/document-window-block.ts) | AbstractBlock; WindowBlock first for DocumentWindow | Window session/focus and StyleBar controller; partial window view, style bar absent. |
| EmbedDocumentBlock | [src/blocks/embed-document-block.ts:9](../speedy-ts/src/blocks/embed-document-block.ts) | AbstractBlock; WindowBlock first for DocumentWindow | Embedded-document boundary/controller; generic view only. |
| EntitiesListBlock | [src/blocks/entities-list-block.tsx:26](../speedy-ts/src/blocks/entities-list-block.tsx) | AbstractBlock; WindowBlock first for DocumentWindow | Entity-list session controller; generic view only. |
| ErrorBlock | [src/blocks/error-block.ts:7](../speedy-ts/src/blocks/error-block.ts) | AbstractBlock; WindowBlock first for DocumentWindow | Fallback/diagnostic view and inherited routing; no local input bindings. |
| GridBlock | [src/blocks/grid-block.ts:8](../speedy-ts/src/blocks/grid-block.ts) | AbstractBlock; WindowBlock first for DocumentWindow | Grid commands and navigation; layout view exists, specialized operations/navigation unported. |
| GridRowBlock | [src/blocks/grid-block.ts:81](../speedy-ts/src/blocks/grid-block.ts) | handleArrowDown (136) | Grid commands and navigation; layout view exists, specialized operations/navigation unported. |
| GridCellBlock | [src/blocks/grid-block.ts:178](../speedy-ts/src/blocks/grid-block.ts) | handleArrowDown (312) | Grid commands and navigation; layout view exists, specialized operations/navigation unported. |
| IframeBlock | [src/blocks/iframe-block.ts:8](../speedy-ts/src/blocks/iframe-block.ts) | AbstractBlock; WindowBlock first for DocumentWindow | Opaque/native iframe input boundary; app shortcuts require explicit escape policy. |
| ImageBackgroundBlock | [src/blocks/image-background-block.ts:10](../speedy-ts/src/blocks/image-background-block.ts) | AbstractBlock; WindowBlock first for DocumentWindow | Background controller; inherits routing and background menu actions. |
| ImageBlock | [src/blocks/image-block.ts:10](../speedy-ts/src/blocks/image-block.ts) | AbstractBlock; WindowBlock first for DocumentWindow | Image controller and insertion commands; media rendering only, Image Enter binding unported. |
| IndentedListBlock | [src/blocks/indented-list-block.ts:6](../speedy-ts/src/blocks/indented-list-block.ts) | handleArrowDown (54) | List commands and navigation; no collapse/expand or full inherited navigation parity. |
| MonitorBlock | [src/blocks/monitor-block.tsx:25](../speedy-ts/src/blocks/monitor-block.tsx) | AbstractBlock; WindowBlock first for DocumentWindow | Annotation-monitor session controller and endpoint commands; generic view only. |
| PageBlock | [src/blocks/page-block.ts:7](../speedy-ts/src/blocks/page-block.ts) | AbstractBlock; WindowBlock first for DocumentWindow | Page controller and focus policy; PageView lacks original background-click focus handler. |
| PlainTextBlock | [src/blocks/plain-text-block.ts:7](../speedy-ts/src/blocks/plain-text-block.ts) | AbstractBlock; WindowBlock first for DocumentWindow | Native textarea adapter plus declared ancestor commands; text capture is partial parity. |
| StandoffEditorBlock | [src/blocks/standoff-editor-block.ts:30](../speedy-ts/src/blocks/standoff-editor-block.ts) | handleArrowUp (1362), handleArrowDown (1393), handleArrowRight (1429), handleArrowLeft (1442) | Standoff controller, mapped inline commands, selection and decoration adapters; partial edit coverage. |
| StickyTabRowBlock | [src/blocks/sticky-tab-block.ts:21](../speedy-ts/src/blocks/sticky-tab-block.ts) | AbstractBlock; WindowBlock first for DocumentWindow | Sticky-tab commands and activation; shared tab view is partial. |
| StickyTabBlock | [src/blocks/sticky-tab-block.ts:149](../speedy-ts/src/blocks/sticky-tab-block.ts) | AbstractBlock; WindowBlock first for DocumentWindow | Sticky-tab commands and activation; shared tab view is partial. |
| SurfaceBlock | [src/blocks/surface-block.ts:9](../speedy-ts/src/blocks/surface-block.ts) | AbstractBlock; WindowBlock first for DocumentWindow | Surface/Side controller; generic view only, side double-click toggle unported. |
| SideBlock | [src/blocks/surface-block.ts:59](../speedy-ts/src/blocks/surface-block.ts) | AbstractBlock; WindowBlock first for DocumentWindow | Surface/Side controller; generic view only, side double-click toggle unported. |
| TableBlock | [src/blocks/tables-blocks.ts:6](../speedy-ts/src/blocks/tables-blocks.ts) | AbstractBlock; WindowBlock first for DocumentWindow | Table commands and inherited navigation; layout rendering only. |
| TableRowBlock | [src/blocks/tables-blocks.ts:52](../speedy-ts/src/blocks/tables-blocks.ts) | AbstractBlock; WindowBlock first for DocumentWindow | Table commands and inherited navigation; layout rendering only. |
| TableCellBlock | [src/blocks/tables-blocks.ts:105](../speedy-ts/src/blocks/tables-blocks.ts) | AbstractBlock; WindowBlock first for DocumentWindow | Table commands and inherited navigation; layout rendering only. |
| TabRowBlock | [src/blocks/tabs-block.ts:8](../speedy-ts/src/blocks/tabs-block.ts) | AbstractBlock; WindowBlock first for DocumentWindow | Tab controller and commands; activation is partial, full menu/structural behavior absent. |
| TabBlock | [src/blocks/tabs-block.ts:197](../speedy-ts/src/blocks/tabs-block.ts) | AbstractBlock; WindowBlock first for DocumentWindow | Tab controller and commands; activation is partial, full menu/structural behavior absent. |
| UnknownBlock | [src/blocks/unknown-block.ts:7](../speedy-ts/src/blocks/unknown-block.ts) | AbstractBlock; WindowBlock first for DocumentWindow | Lossless fallback plus inherited routing; no local input bindings. |
| VideoBackgroundBlock | [src/blocks/video-background-block.ts:10](../speedy-ts/src/blocks/video-background-block.ts) | AbstractBlock; WindowBlock first for DocumentWindow | Native media/background adapter; inherits application routing. |
| WindowBlock | [src/blocks/window-block.ts:30](../speedy-ts/src/blocks/window-block.ts) | AbstractBlock; WindowBlock first for DocumentWindow | Window controller and gesture/effect adapter; pointer drag/minimize/close subset only. |
| WorkspaceBlock | [src/blocks/workspace-block.ts:6](../speedy-ts/src/blocks/workspace-block.ts) | AbstractBlock; WindowBlock first for DocumentWindow | Workspace commands and inherited routing; save/load shortcuts absent. |
| YouTubeVideoBackgroundBlock | [src/blocks/youtube-video-background-block.ts:11](../speedy-ts/src/blocks/youtube-video-background-block.ts) | AbstractBlock; WindowBlock first for DocumentWindow | Opaque background player adapter; preserve disabled keyboard/pointer policy. |
| YouTubeVideoBlock | [src/blocks/youtube-video-block.ts:8](../speedy-ts/src/blocks/youtube-video-block.ts) | AbstractBlock; WindowBlock first for DocumentWindow | Opaque player adapter; native player controls, inherited application routing. |
| AnnotationPanelBlock | [src/components/annotation-panel.tsx:16](../speedy-ts/src/components/annotation-panel.tsx) | AbstractBlock; WindowBlock first for DocumentWindow | Annotation-panel session controller; not ported. |
| BlockMenuBlock | [src/components/block-menu.tsx:44](../speedy-ts/src/components/block-menu.tsx) | AbstractBlock; WindowBlock first for DocumentWindow | Block/context-menu command controller; not ported. |
| ControlPanelBlock | [src/components/control-panel.tsx:33](../speedy-ts/src/components/control-panel.tsx) | AbstractBlock; WindowBlock first for DocumentWindow | Workspace/file-control controller; original control panel not ported. |
| FindReplaceBlock | [src/components/find-replace.tsx:22](../speedy-ts/src/components/find-replace.tsx) | AbstractBlock; WindowBlock first for DocumentWindow | Find/replace session controller and mapped replacement commands; not ported. |
| SearchEntitiesBlock | [src/components/search-entities.tsx:41](../speedy-ts/src/components/search-entities.tsx) | AbstractBlock; WindowBlock first for DocumentWindow | Entity-search session controller and async commands; placeholder overlay is not parity. |
| StyleBarBlock | [src/components/style-bar.tsx:116](../speedy-ts/src/components/style-bar.tsx) | AbstractBlock; WindowBlock first for DocumentWindow | StyleBar focus-preserving controller and formatting commands; not ported. |
| UniverseBlock | [src/universe-block.ts:39](../speedy-ts/src/universe-block.ts) | AbstractBlock; WindowBlock first for DocumentWindow | Central dispatcher, workspace/document/focus commands; legacy routing not ported. |

Enum-only/alias cases also need explicit treatment:

- LeftMarginBlock and RightMarginBlock are built as DocumentBlock-based margins, not separate input-controller classes. Their owned content must stay inside their own document-input boundary.
- HTMLEditorBlock, HTMLBlock and PDFBlock are type tokens without separate class implementations in this source snapshot. IframeBlock is the actual iframe class; token availability does not establish a separate handler set.
- Monitor, annotation panel, find/replace, entity search, style bar, ErrorBlock and UnknownBlock cannot be excluded merely because a class lacks a matching BlockType enum member or persistence builder.
- Cell, Row, StandoffProperty, BlockProperty, TextProcessor, DraggableWindow, InfiniteCanvas, plugins and SVG helpers are supporting input/effect implementations, not additional Block classes. They are indexed separately in the ledger.

### 3.1 Navigation through structures

[AbstractBlock](../speedy-ts/src/blocks/abstract-block.ts):278 supplies Up/Left → previous else parent; Down/Right → first child else next, with deferred start-caret placement for a Standoff target. Document arrow handlers call the **origin Block's virtual arrow method**, not one generic DOM sibling traversal.

[StandoffEditorBlock](../speedy-ts/src/blocks/standoff-editor-block.ts):1362:

- Up/Down first use measured rows and the nearest Cell at the current x coordinate. At a visual boundary they use the owning Document's filtered index, not just immediate siblings.
- That index is depth-first traversal filtered to Standoff and Checkbox Blocks (Document.generateIndex, 2468).
- Crossing into a direct TabBlock child reveals the tab; focus goes to the target, its start caret is requested, and viewport scrolling is adjusted.
- Right clears selection/x cache, advances from the selected end or caret-right Cell, then delegates to Down at EOL. Left clears selection/x cache, moves to caret.left when present, otherwise delegates to Up. These are not symmetric “previous block end/next block start” implementations.
- Shift-Right starts an inclusive one-Cell selection or extends its end; Shift-Left does nothing without an existing selection and otherwise uses end.previous. setSelection does not use the supplied direction. Shift-Up/Down have separate existing-selection and visual-row branches in their binding bodies.
- Home/End use first Cell / terminal EOL boundary. Control-Left/Right use getWords/findNearestWord and their asymmetric fallbacks, not browser-native word navigation.

Checkbox has its own Up/Down filtered-index movement, tab reveal and scrolling, with Left/Right delegating to those methods. Some targets are cast to Standoff even though the index includes Checkbox; guard this in the replacement.

Word navigation also inherits getWordsFromText's source defects: the method
appends already-collected words again while linking neighbors, and skips linking
when there are exactly two words (lastIndex === 1). Characterize one-, two- and
many-word cases for Control-arrow, Control-Backspace and monitor word shifts;
do not assume the source's word list is normalized.

IndentedList, GridRow and GridCell override Down: child, then next, then attempted enclosing-list/grid/row fallback. In each fallback, the source tests the enclosing structure's next but focuses this.relation.next. Record this wrong-target path instead of propagating it as intended behavior.

## 4. Document input map and branch contracts

The [97-binding table](INPUT_HANDLER_SOURCE_LEDGER.md#all-97-binding-declarations) contains every exact declaration. Document contributes **50**, including one ArrowDown in global mode as well as the default ArrowDown. All its other declarations use default mode. Do not deduplicate away the mode distinction.

The full Document catalog comprises extraction; Enter; Delete/Backspace; both Shift structural-deletes; both Control deletion variants; Control-click Block selection; annotation menu; copy/paste custom handlers and keyboard pass-through; undo/redo; left/right margin creation; move-up/down; indent/deindent; all eight ordinary/Shift arrow directions; Home/End; word-left/right; save; text-change processing; vines; new tab; blue/white Block style; italics/bold/mirror; monitor; structural break-out; alignment-right; entities list/reference; find; clock. The ledger carries exact platform alternatives—do not replace them with a blanket Ctrl/Cmd convention.

### 4.1 Backspace and Delete are different handlers

The original direction convention is **Backspace at the start joins backward; Delete at the end joins forward**. The earlier discussion used those key names in the opposite positions. Use the source convention unless a remapping is explicitly chosen.

| Gesture/context | Original action, ordered branches | Focus/caret and boundary consequences |
| --- | --- | --- |
| Backspace with manager Block selections | Delete every selected Block via Universe.deleteSelections, then clear selection IDs. | This precedes local text selection handling; source has no normalized ancestor/descendant deletion plan. |
| Backspace with local text range | removeCellsAtIndex(start, end-start+1, true). | Range is inclusive; the method currently ignores its updateCaret argument. Do not assume the requested caret restoration happens. |
| Backspace on empty text Block | Remove current; prefer previous, else parent. | Previous Standoff gets end caret; parent gets focus only. This branch precedes at-start joining. |
| Backspace at start, previous empty Standoff | Remove previous, retain current. | Current start caret. |
| Backspace at start, previous nonempty Standoff | mergeBlocks(current, previous). | Previous is survivor; caret at its pre-join last-Cell index, i.e. join boundary. |
| Backspace at start, previous non-text | Focus previous without merging. | Source does not guard undefined previous in this path. |
| Backspace inside text | Remove caret.left Cell, update caret/view/text. | Annotation endpoint mapping applies to that Cell. |
| Delete inside text | Remove caret.right Cell, update caret/view/text. | Unlike Backspace, handleDelete has no local selected-range or manager-selection branch. This asymmetry needs an explicit resolution. |
| Delete at EOL, next empty Standoff | Remove next. | Keep current and restore its end caret, deferred. |
| Delete at EOL, next nonempty Standoff | mergeBlocks(next, current). | Current survives; restore old caret.right index, deferred. |
| Delete at EOL, next non-text | Focus next. | No merge. |
| Delete at EOL, no next | No operation. | Do not delete the protected terminator. |
| Shift-Delete | Delete current Block. | Prefer next → previous → parent; Standoff target at start. |
| Shift-Backspace | Delete current Block. | Prefer previous → next → parent; Standoff target at start. |
| Control-Delete | Remove from caret.right index to just before last Cell. | Restore setCaret(start, RIGHT); EOL retained. Source labels this TODO. |
| Control-Backspace | Find nearest word from caret.left; remove from nearest.previous.start or 0 through caret.left. | Restore start with LEFT. It is not simply “delete current word”; preserve executable word-boundary logic and characterize it. |

Sources: [Document](../speedy-ts/src/blocks/document-block.ts):734, 758, 786, 978, 1868, 2275; [Standoff range deletion](../speedy-ts/src/blocks/standoff-editor-block.ts):1632, 1738.

### 4.2 Enter, joins and splits

Enter lives both in Document and in Standoff's local binding. The latter looks up the **first registered Document**, not the originating editor's ancestor. This must not survive multi-document conversion.

Document.handleEnterKey (2305):

- Non-Standoff origin: create a following Standoff, copy Block properties, add EOL, focus its start.
- Middle: split after caret.left, insert following Block, focus its start.
- Start, including empty text: insert a preceding Standoff, copy Block properties. Explicit focus-to-new code is commented; however addEOL itself calls setCaret, so actual browser selection needs characterization.
- End: insert following Standoff, copy Block properties, focus its start.
- The start/end creation path marks a created item inside an IndentedList with list-item-numbered styling.
- There is no explicit deletion/replacement of an active text selection in this original Enter handler. The reactive handler currently deletes the selection first; that is a difference to decide, not an evidenced original branch.

Control-Enter separately finds an enclosing TabRow, Grid, Table or IndentedList and creates text **after the enclosing structure**, then focuses it. Tab and Shift-Tab are structural indentation commands, not literal tab insertion; first-child and missing-previous guards matter. Control-T appends a tab when already inside a TabBlock, otherwise converts the source.

[mergeBlocks](../speedy-ts/src/blocks/document-block.ts):461 retains the target, strips the source's last text character as assumed EOL, offsets source annotations by target.getText().length - 1, inserts text before the target terminator, adds annotation DTOs, reapplies styling, and deletes the source. It calls removeEOL, but that method is a **stub**. The actual behavior does not remove/recreate the target terminator. UTF-16 lengths are mixed with Cell indices. Source annotation serialization includes deleted records, while DTO reconstruction drops IDs/deleted/plugin state; do not emulate accidental resurrection or claim annotation identity survives this path.

[splitTextBlock](../speedy-ts/src/blocks/document-block.ts):480 copies Block properties to the right Block; selects properties reaching/past the split; clips right starts to zero and subtracts the split offset. Left text is removed through the usual Cell deletion mapper, contracting crossing annotations. The explicit pre-removal left-property loop only selects end < split; its ternary cannot fix crossing properties. Rebinding the right annotation DTOs loses identity and metadata through the original bind path. A new implementation needs an explicit identity/metadata/tombstone policy for both halves.

Join/split must become one validated structural-and-inline transaction with mapped annotations, focus and selection, but **the exact old implementation is not proof of atomic history**: it calls several beforeChange hooks, while history snapshots are time-throttled.

### 4.3 Clipboard, formatting, panels and history

[Document.handleCopy](../speedy-ts/src/blocks/document-block.ts):1831 writes application/json and appends to manager.clipboard. Its exact legacy envelope is:

    {
      source: "Codex",
      format: "StandoffEditorBlock",
      context: { blockId, selection: { start, end } },
      data: { text, standoffProperties }
    }

Capitalization and field names are contract data. Selected Cell ranges are inclusive. The source's annotation-overlap predicate uses an OR that can include disjoint properties, and its right clipping can yield end = selectedText.length rather than length - 1. Preserve the envelope while recording/deciding clipping corrections. Do not claim this handler writes a text/plain flavor: it only writes JSON.

[Document.handlePaste](../speedy-ts/src/blocks/document-block.ts):2212:

1. File presence takes precedence: first file → image dimensions → upload → add ImageBlock after source. It assumes an image and returns.
2. Plain text is split into lines. The first inserts at the caret; additional lines become following Standoff Blocks. The existing suffix is not moved to the final new Block. One line sets caret to ci + text.length; multiple lines focus the last created Block's EOL.
3. JSON is then parsed independently and passed to Universe.pasteCodexItem, which inserts text and offset annotations. With both plain text and JSON, both branches can run. No format validation or parse guard exists.
4. HTML conversion is commented. The original paste handler does not first remove a selected range.

These quirks require explicit decisions; they do not authorize changing the legacy clipboard envelope or dropping annotations. The new inline-image format needs a separate, compatible negotiation path.

Control-X calls extractIntoNewDocument, not native cut. Despite the method name,
it serializes the source into a new Document/window and saves it using a
Block-derived filename and the owning Document's folder; it does **not** remove
the original Block. Mac:Meta-C / Windows:Control-C and the corresponding V
bindings explicitly allow native copy/paste to reach custom clipboard handlers.
Ctrl/Cmd undo/redo alternatives are not interchangeable: preserve the actual
ledger matches, including Meta-D/Control-D for redo.

Formatting has distinct paths: Document bold/blur delegate to manager.applyStandoffProperty; italics/mirror/clock operate on a selected range, with no-selection TODOs. toggleStandoffPropertyMode is empty, so persistent “typing mode” is not supplied by that method. StyleBar clear formatting destroys all standoff properties and removes all Block properties, whereas AnnotationPanel's clear-format action is empty.

Margin creation clears source selection, creates or reuses a margin Document, ensures a Standoff child, and focuses its start with path-specific deferral. Find/entity/annotation/monitor panels retain source/caret/selection references and their close callbacks restore editing focus and clear temporary highlights. Model them as session-owned overlays with saved source anchors, not as ordinary descendants that route back through the source editor.

History: Document subscribes beforeChange to addToHistory; minimalTimeElapsedSinceLastChange rejects changes during loading or within 1,000 ms. Undo/redo serialize/rebuild a Document. Low-level Standoff commits also record operation-shaped undo/redo payloads, but a removeCell undo only carries text/index, not an annotation snapshot. The replacement's transaction history must restore text, annotations, structure and view bookmarks together.

## 5. Annotation boundaries: exact source mechanics

### 5.1 Four separate things must not be conflated

1. Cell sequence and stable Cell objects.
2. Annotation start/end **Cell references**, inclusive, plus isDeleted/value/metadata/plugin.
3. Visible decoration: CSS on Cells, wrapper DOM, SVG renderer output and transient search/monitor highlight.
4. Native caret/selection and measured row/Cell geometry.

A deletion can leave valid annotation endpoints but stale or missing decoration. An insertion can copy a CSS class without including that new Cell in the stored annotation range. Save/reload can then expose a different result. Tests must inspect all four, plus serialization/history, instead of asserting only text or one range offset.

[Cell conversion](../speedy-ts/src/blocks/standoff-editor-block.ts):1343 uses spread text, so **one Cell is a Unicode code point**, not a UTF-16 code unit and not necessarily a grapheme. Cell indexes and inclusive property endpoints must be converted deliberately to the new half-open boundary model. Emoji/ZWJ/combining-character tests are mandatory because several original substring/length/undo paths use UTF-16.

The carriage-return terminator is a special Cell. moveCaretEnd places the caret before it. removeCellAtIndex refuses a flagged isEOL Cell. toCells appends/flags EOL only when it adds CR; an already-present trailing CR is not flagged there. chainCellsTogether uses max > 1, so a two-Cell sequence is not linked. bind's empty-text branch appends after reindexing. These defects make short/loaded/EOL cases especially important; do not infer a safe invariant from the intention alone.

### 5.2 Single-Cell deletion

[removeCellAtIndex](../speedy-ts/src/blocks/standoff-editor-block.ts):1738 performs:

    beforeChange → locate Cell → reject missing/EOL
      → unlink neighbors
      → shift annotation starts right
      → shift annotation ends left
      → remove Cell DOM and array entry → reindex surviving Cells
      → optionally update view/caret/text
      → local onTextChanged hook → commit text-shaped inverse

Start adjustment filters live properties. End adjustment does not filter deleted ones. A single-Cell property is marked isDeleted; otherwise a start endpoint moves to cell.next and an end endpoint moves to cell.previous. Missing surviving neighbors also mark deletion. Renderer updates can be requested during boundary adjustment, before the Cell is removed/reindexed.

For the ordinary well-linked, non-EOL case, this yields:

| Deleted Cell relative to live inclusive range [s,e] | Surviving annotation result |
| --- | --- |
| Before the range | Same endpoint Cell identities; both numeric indexes decrease by one. |
| At start, with another annotated Cell surviving | Start becomes next Cell; end stays attached to the old end. |
| Strictly inside | Both endpoint identities survive; end's numeric index decreases; range shrinks. |
| At end, with another annotated Cell surviving | End becomes previous Cell; start stays attached to old start. |
| The only annotated Cell | Mark isDeleted = true. Do not treat it as a surviving zero-width range. |
| After the range | No endpoint change. |

Concrete fixture, original text abcdef plus EOL, annotation bcd = [1,3]:

| Independent edit | Text without EOL | Property after edit |
| --- | --- | --- |
| Remove a (index 0) | bcdef | live [0,2], bcd |
| Remove b (index 1) | acdef | live [1,2], cd |
| Remove c (index 2) | abdef | live [1,2], bd |
| Remove d (index 3) | abcef | live [1,2], bc |
| Remove e (index 4) | abcdf | live [1,3], bcd |
| Remove bcd (index 1, length 3) | aef | property retained but isDeleted = true; no live highlight |

Tombstone endpoints can retain a removed Cell whose index is no longer part of the live sequence. Do not reinterpret those numbers as a valid live range.

### 5.3 Range deletion, replacement and tombstones

[removeCellsAtIndex](../speedy-ts/src/blocks/standoff-editor-block.ts):1632 repeatedly removes **the same current array index**, once per requested Cell, with updateCaret false, then updates view/text once. Each removed Cell still causes the low-level boundary logic, beforeChange and local text-change call. Its updateCaret parameter is not used.

This is why deleting only part of an annotation should contract its range to surviving Cells, not drop the entire annotation. Complete coverage eventually reaches the single-Cell case and marks deletion. The same sequence applies independently to overlapping and nested annotations. A neighboring or overlapping annotation that still has surviving Cells must not disappear when another is fully deleted.

The record remains in standoffProperties. [StandoffEditor.serialize](../speedy-ts/src/blocks/standoff-editor-block.ts):1200 excludes clientOnly, **not isDeleted**. [StandoffProperty.serialize](../speedy-ts/src/library/standoff-property.ts):263 emits id/type/start/end/value/text/metadata/plugin/isDeleted. Its convenience text uses substring(start,end), omitting the inclusive end Cell; record this original inconsistency without changing the range convention.

Important reload difference: addStandoffPropertiesDto carries value/metadata/clientOnly but does not forward id/isDeleted/plugin; bind carries even less, omitting annotation metadata/clientOnly as well. The constructor initializes isDeleted false. Thus serialization retains tombstones but original reconstruction can lose their identity/deleted state. Proposal §3's lossless boundary takes precedence over reproducing that loss.

[insertCharacterAtCaret](../speedy-ts/src/blocks/standoff-editor-block.ts):1071 captures a caret **before** deleting a selection, removes that inclusive selection, then inserts at caret.right.index. Since that Cell may have been removed or reindexed, this is not a stable replacement bookmark. New replacements must snapshot/map boundaries, never reuse stale DOM/Cell references. Likewise FindReplace/Standoff.replace and TextProcessor replacement helpers go through deletion + insertion; route them through the same endpoint policy as typing.

### 5.4 Insertion: endpoint attachment and styling inheritance differ

[insertTextAtIndex](../speedy-ts/src/blocks/standoff-editor-block.ts):1127 chooses right = cells[index], left = right.previous, and anchor = left || right. It creates new code-point Cells and **copies decorate CSS from live properties enclosing anchor before knitting/reindexing**. It also invokes renderProperties(enclosing). It then knits/splices/reindexes, schedules DOM insertion, updates view, calls setCaret(index + 1), updates text and publishes/commits.

There is no analogous “shift annotation start/end onto inserted Cells” operation. Endpoints remain attached to the original Cells. Therefore ordinary insertion of n Cells at boundary k has this numeric effect:

| Boundary relative to inclusive [s,e] | Stored range after insertion |
| --- | --- |
| k ≤ s | [s+n,e+n], inserted Cells outside the range |
| s < k ≤ e | [s,e+n], inserted Cells inside the range |
| k > e | [s,e], inserted Cells outside the range |

That describes **stored endpoints**, not necessarily visible CSS. For abcdef, bcd = [1,3], insert X:

| Insert boundary | Stored property | Decoration inheritance from anchor |
| --- | --- | --- |
| 0, before a | [2,4] | Uses right a because no left; no bcd styling. |
| 1, before b | [2,4] | Uses left a; X not styled by bcd. |
| 2, between b/c | [1,4] | Uses left b; X styled and included. |
| 3, between c/d | [1,4] | Uses left c; X styled and included. |
| 4, after d | [1,3] | Uses left d; **X can inherit bcd CSS despite being outside its stored range**. |
| 5, after e | [1,3] | Uses left e; X not styled by bcd. |

At absolute document start, if the annotation starts at the first Cell, anchor = right is annotated: inserted text can inherit its CSS while the stored range shifts right and excludes it. Adjacent annotations can therefore produce different left/right-edge styling. Only decorate.cssClass is copied by this helper; wrapper and SVG properties have their own renderer/lifecycle paths.

Consequences for reconstruction:

- Do not claim “all edges are exclusive” fully matches the original editing experience. It may match endpoint indexes but not visible insertion styling.
- Do not choose universal edge expansion solely because it preserves highlights in one test. Semantic references, formatting, transient search matches and plugin ranges may need different insertion affinity.
- Record per-schema start/end affinity and explicit typing/replacement policy before coding. Keep legacy export inclusive and central operations half-open.
- Check immediate paint, post-layout paint, subsequent insertion/deletion, undo/redo and save/reload separately.
- setCaret(index + 1) is only correct for one inserted Cell; caller overrides and deferred DOM insertion currently affect paste/recognizer behavior. New operations must restore after the entire inserted sequence, including grapheme/atom cases.

### 5.5 Rendering, monitor edits and schema lifecycle

The ledger includes every schema event callback, including onInit/onDestroy/beforeStyling and the six unconnected onDoubleClick declarations. Its callable index locates the schema getters and rendering helpers; §5.6 maps the nested renderer callback definitions explicitly. They are not interchangeable with keyboard handlers, but editing must invoke their replacement lifecycle correctly.

- getEnclosingProperties excludes deleted properties and compares inclusive Cell indexes.
- renderProperties groups by type and calls schema.render.update; it does not itself filter deletion.
- updateView schedules Cell/row measurements then updateRenderers; the latter updates live properties whose offsets changed and destroys deleted renderer output.
- applyStandoffPropertyStyling iterates the entire property list. Per-property CSS helpers and renderer callbacks have their own deleted guards. Test actual decoration removal, not just isDeleted.
- StandoffProperty.destroy marks deletion, calls onDestroy, removeStyling, then unhighlight. removeStyling calls onDestroy again. A migration must clean up once; do not duplicate plugin disposal to mimic this.
- Monitor shiftLeft/Right moves both endpoints one Cell when neighbors exist. Whole-word shifts replace the range with the previous/next word. Contract moves end.previous; expand moves end.next. These methods remove old styling, reset offsets, reapply and sometimes flash for 125 ms.
- Contract does not guard against crossing start; expand can reach EOL. Neither should become an unchecked invalid canonical range. Source intent and bounds correction need explicit tests.
- Monitor keyboard delete destroys the property; its mouse delete also removes that row from the monitor's local list. Hover applies/removes transient text-highlight. Closing returns focus/caret through Document's callback.
- StandoffEditor.getCells(range) breaks after the first Cell; StandoffProperty.getCells walks the inclusive range. Do not substitute the former helper for the latter.

The current renderer's supported decoration types are only a subset. Original style/strikethrough is not style/strike, and text/colour is not style/color. Inventory schema tokens exactly; preserve unknown annotations losslessly even when their renderer has not been ported.

### 5.6 Schema-by-schema decoration and callback map

All 27 original Standoff schemas are listed here; callback source lines are in
[src/blocks/standoff-editor-block.ts](../speedy-ts/src/blocks/standoff-editor-block.ts).
The event callbacks already have ledger IDs. Renderer callbacks below are
supporting mutation effects, not additional user-input bindings. Start/end
insertion affinity and replacement inheritance remain an explicit decision for
each row; no universal policy is inferred from its visual appearance.

| Exact schema token | Definition line | Decoration model | Callback sites |
| --- | ---: | --- | --- |
| text/background-colour | 127 | Renderer-owned | event.onInit (130); render.destroy (136); render.update (142) |
| text/colour | 150 | Renderer-owned | event.onInit (153); event.onUpdate (157); event.onDestroy (161); render.destroy (167); render.update (173) |
| cell/micro-document | 181 | Lifecycle/plugin-owned | event.onInit (186); event.onDestroy (206) |
| animation/clock | 216 | Lifecycle/plugin-owned | event.onInit (221); event.onDestroy (227) |
| style/blur | 234 | Wrapper CSS: style_blur | None declared |
| style/flip | 241 | Wrapper CSS: style_flipY | None declared |
| style/mirror | 248 | Wrapper CSS: style_flipX | None declared |
| style/superscript | 255 | Cell CSS: style_superscript | None declared |
| style/subscript | 262 | Cell CSS: style_subscript | None declared |
| style/uppercase | 269 | Cell CSS: style_uppercase | None declared |
| style/italics | 276 | Cell CSS: style_italics | None declared |
| style/strikethrough | 283 | Cell CSS: style_strikethrough | None declared |
| style/highlight | 290 | Cell CSS: style_highlight | None declared |
| style/bold | 297 | Cell CSS: style_bold | None declared |
| style/underline | 304 | Cell CSS: style_underline | None declared |
| reference/url | 311 | Cell CSS: reference_url | event.onDoubleClick (318) |
| codex/search/highlight | 324 | Cell CSS: codex-search-highlight | None declared |
| codex/block-reference | 331 | Renderer-owned | event.beforeStyling (335); render.destroy (340); render.update (343) |
| codex/trait-reference | 349 | Renderer-owned | event.onDoubleClick (353); render.destroy (359); render.update (362) |
| codex/claim-reference | 367 | Renderer-owned | event.onDoubleClick (371); render.destroy (377); render.update (380) |
| codex/meta-relation-reference | 386 | Renderer-owned | event.onDoubleClick (390); render.destroy (396); render.update (399) |
| codex/time-reference | 405 | Renderer-owned | event.onDoubleClick (409); render.destroy (415); render.update (418) |
| codex/entity-reference | 424 | Renderer-owned | event.beforeStyling (428); event.onDoubleClick (431); render.destroy (437); render.update (440) |
| style/highlighter | 446 | Renderer-owned | render.destroy (450); render.update (453) |
| style/rainbow | 458 | Renderer-owned | render.destroy (462); render.update (465) |
| style/rectangle | 470 | Renderer-owned | render.destroy (474); render.update (477) |
| style/spiky | 482 | Renderer-owned | render.destroy (486); render.update (489) |

The renderer call chains are: semantic references → renderUnderlines →
createUnderline; style/rainbow → renderRainbow → createRainbow;
style/highlighter → renderHighlight → drawClippedRectangle; style/rectangle →
renderRectangle → drawAnimatedSelection; style/spiky → renderSpiky →
drawSpikySelection. The SVG helpers replace per-property cached underline,
highlight or svg elements; deleted-property rendering must remove the correct
cache, not another live property's layer. Underline/rainbow overlap lanes are
cached by offsetY, while monitor endpoint shifts reset that offset. Range edits
also need correct remeasurement and overlap-lane invalidation.

Additional lifecycle findings:

- beforeStyling is a placeholder on block/entity references; no caller was found.
  text/colour.event.onUpdate likewise has no invoking path in StandoffProperty.
  Keep these declarations distinct from the live render.update callback.
- CSS class removal is not reference-counted: destroying/removing styling for
  one property can remove a class also needed by an overlapping property of the
  same style. Colour cleanup similarly unsets a Cell style. Test recomputation
  from all remaining live properties, not only the property just changed.
- StandoffProperty.applyStyling invokes event.onInit each time; the constructor's
  onInit hook is commented internally. Clock and micro-document effects can
  therefore be recreated by repeated styling. The micro-document callback creates
  another UniverseBlock, including its BODY listeners, while its destroy callback
  restores Cell HTML without disposing that manager. Those are scoped-lifecycle
  migration obligations, not additional distinct handler declarations.
- BlockProperty is different: its constructor calls schema.event.onInit, but
  removeStyling calls render.destroy and does not call event.onDestroy. In
  particular, declaring block/draggable.event.onDestroy does not prove the
  DraggableWindow listeners are torn down through ordinary property removal.

## 6. Specialized UI and non-keyboard operations

Every individual callback is in the ledger. This section supplies the activation/behavior context needed to migrate those entries.

| Owner | User-input contract and investigation findings |
| --- | --- |
| Book / FixedSizePage | Two helper-installed page-turn clicks select preceding/following page pairs, activate/deactivate pages; the FixedSizePage class has no own binding. Generic containers do not implement this. |
| Canvas / InfiniteCanvas | Viewport mousedown, window mousemove/up, nonpassive Ctrl-wheel zoom around cursor; box modifier-selection and multi-box drag; background marquee selection transformed into canvas coordinates; minimap down/move/up/leave recentering. Dynamic drag listeners have separate cleanup. Declared panning fields do not implement panning. No general teardown removes all persistent canvas listeners. |
| Checkbox | Quoted-space action toggles, despite its action label; native change toggles model state rather than reading target.checked. check/uncheck affect DOM, saved state and history. Native change and parent routing must not toggle twice. |
| Image | Direct click focuses image; Enter intends following text creation but calls the async factory without await and then uses the Promise as a Block. Keep intended operation, flag executable defect. |
| Tabs / DocumentTabs / StickyTabs | Distinct label and root click paths; active metadata/classes, first-child focus/caret and label rerendering. DocumentTab factories can replace bindings. Sticky-tab label click toggles its activity. Add/extract/delete/rename/move operations are exposed via menus, not necessarily keyboard bindings. |
| Surface / Side | Side dblclick toggles visible sides; its central click binding is declared but not installed. Surface has no local input binding. |
| Window / DocumentWindow | Header contextmenu creates a theme panel. Controls minimize, maximize and close; button factories also install mouseenter/leave feedback. Arrow bindings move 10 px only while origin.isDragging. The source assignments making WindowBlock.isDragging true are commented; property-installed DraggableWindow has separate drag state. |
| DraggableWindow property effect | Handle pointerdown → document pointermove/up; resize-handle pointerdown stops propagation, then document pointermove/up with minimum 100 px sizes; handle dblclick minimizes/restores via body icon; icon click restores. Drag callback persists property metadata.position, not automatically Window metadata.position. No pointercancel/lostcapture path; destroy omits active resize move/up cleanup. New gateway must include cancellation/cleanup. |
| Window control state | Button minimize/maximize differs from DraggableWindow double-click minimization. onMaximize/onMinimize options are stored but not invoked by these controls. previousState.left is assigned rect.top. Do not collapse these state machines without a documented correction. |
| ContextMenuBlock | Escape destroys/deregisters the panel; there is no explicit source-focus restoration. Normal/Glass buttons alter source window theme. It is distinct from the richer BlockMenu. |
| BlockMenu / ContextMenu component | 64 callback-property sites in BlockMenu. Actions include all document/block creation, grids, tabs, pages, sticky tags, lists/pockets, themes, ancestor focus, saves/duplication, and background switching. Visibility depends on source ancestors/type. ContextMenu also owns outside mousedown, field Enter/OK, radio change, submenu enter/leave delays and disabled item gating. Standard item click does not auto-close—the close call is commented. |
| BlockMenu anomalies | “Move tab left/right” invokes GridCell move helpers; merge-tab actions likewise call grid merge helpers. Convert-to-pocket is a stub; rename-document alerts “not implemented.” Background video/YouTube/WebGL setters ignore their supplied parameter and select defaults. Keep all entries but do not label these actions successfully converted. |
| AnnotationPanel | Five bindings: outside-click declaration, Escape, i, b, u. Menu callbacks cover bold/italic/strike/highlight, clear-format stub, bullet-list indent, and eight Table sizes (1×1 through 1×4; 2×1 through 2×4). Numbered/task-list labels have no callbacks. Submenu expansion is its own click handler. Saved selection is used; apply/close cleans transient highlight and restores source focus. The outside-click binding is not a standalone document listener. |
| Monitor | Ten bindings, 16 JSX sites. Escape, cyclic Up/Down item focus, word Left/Right, Shift character Left/Right, literal = expand, - contract, d delete. Header toggles details; each of five action buttons has hover/out plus click. Edit button has no action. Empty-list and invalid-range branches need guards. |
| FindReplace | Four bindings and nine JSX sites: Escape cleanup/close; Control-H toggles replace mode; Enter next or replace+next; Meta-Enter replace-all; search input, up/down, clear, replace field, Next/All and Close, plus form submit. Enter incorrectly returns when replaceText is empty even in Find mode. setMatchFocus is a stub. Mouse Next replaces current without the Enter path's moveDown. replace-all iterates stale matches ascending. |
| SearchEntities | Six bindings and six JSX sites: select-all matches, clear-search, select result, Escape, Up/Down; form add, text search, alias/partial toggles, result Select, Close. Search API, minimum query length and debounce behavior are part of the flow. Keyboard Enter indexes search[index] rather than search.Results[index]. Several selection/add paths close twice. Async results need source/session/revision checks in the replacement. |
| EntitiesList | Escape closes/restores captured source caret; ArrowDown action is empty. Header close button directly destroys, bypassing close's focus return. Entity-list hover/out locates and highlights all matching references. Do not merge these close paths without recording the difference. |
| StyleBar | 17 button callbacks: bold, italic, four alignments, H1–H4, font/background colour prompts, increase/decrease visual indent, left/right 90° rotation, clear formatting. Acts on retained logical focus, not toolbar DOM focus. Visual Block indent is distinct from Document structural Tab indentation. |
| ControlPanel | Nine active JSX sites: new document; folder select/button; file select/button; template input/button; workspace input/button. Additional command-parser functions remain in render but its submit callback has no active form; workspace-source form is commented. Treat parser commands as dormant, not missing active keyboard shortcuts. |
| Native/opaque media | PlainText's local textarea click/key handler, CodeMirror's basicSetup + javascript extension, iframe/player input, background keyboard/pointer disabling and onload image-dimension callback remain distinct ownership/lifecycle contracts. Browser-native editing is not equivalent to an application handler being ported. |

Dormant ControlPanel command cases are still mapped in its callable index: load/save; make-checkbox; move-up/down; list-docs; bgimage/bgcol/color; add-image/right/left, video, URL, table, grid; swap; new-doc; cm; set-tab-name/add-tab/new-tab-row/to-tab/explode-tabs; multicols; test-load-doc (stub); load-micro-doc/embed-doc; merge-next/split; save-workspace. collapse/expand cases are commented. This preserves investigative knowledge without pretending the command form is exposed.

## 7. TextProcessor is an input consequence, not optional decoration

[TextProcessor](../speedy-ts/src/library/text-processor.ts) is invoked by Document's custom onTextChanged binding. Universe's second keydown listener dispatches that custom event even when no text mutation occurred. Standoff.publishOnTextChanged searches **only its own inputEvents** and does not publish through ancestor Document bindings. With the default local Enter-only binding, direct mutation paths do not automatically run Document's recognizer. This difference matters for typing, paste, deletion and programmatic commands.

The ledger includes every exact literal replacement, pattern, wrapper, schema token and custom process callback, in original order: **33 replacements and 37 rules**. Do not replace that catalog with “bold and italics Markdown support.”

Replacement families include arrows/shapes/heart, punctuation/em dash, checked/cross symbols, emoji and abbreviations b/n, c/d, w/d, r/n/s, b/c. Rules include superscript/strike/italic/underline/bold/capital/air-quotes/code; clock/highlight; font sizes/families/colour; alignment/headings; checkbox/list structural transforms; rectangle/spiky/rainbow; URL-to-video; and [today]. Exact tokens and source quirks are in the ledger, including /strike/ versus /s/ wrapper mismatch and /spiky/ versus [spike/ mismatch.

Process behavior:

- Replacements run before rules. A replacement pass captures text once and processes the first occurrence of each replacement token.
- Replacement deletes the source, retains a reference to the following Cell, inserts at its updated index and restores caret there.
- Rules scan captured text with regex matches whose end is inclusive. Several rules mutate content/structure while later matches still use old positions.
- Custom rule.process promises are not awaited; wrapper removal uses different indexes from the generic path.
- Missing schemas log and skip rather than supplying the advertised style. A declared recognizer is not proof its schema exists.
- The shared post-edit pipeline must run once, rebase rule matches, map annotations/selections, group history, and avoid recursion/duplicate notifications. Preserve every trigger while making these ownership changes explicit.

## 8. Comparison with the current reactive application

These are source-inspected gaps, not new browser test results. The copied legacy src/blocks directory is not imported by the reactive App, so leaving its code in the new folder does not satisfy a port.

| Area | Reactive evidence | Status / required follow-up |
| --- | --- | --- |
| Gateway routing | [input/gateway.ts](src/input/gateway.ts): install and onKeyDown | Capture gateway exists. No equivalent full owner-mode chord dispatcher or mouse broadcast; keydown handles only Shift-Delete/Backspace for native-text/standoff. Most of the 97 binding declarations are not wired. |
| Gateway event coverage | Same install method | Has input/beforeinput/focusin/keydown/compositionstart/end/selectionchange/pointerdown/copy/cut/paste. Missing proposal event coverage includes keyup, click/dblclick/contextmenu, compositionupdate, general pointermove/up/cancel/lostcapture, wheel/change and drag/drop. Local window callbacks do not constitute central coverage. |
| Boundary editing | Same onBeforeInput | Backward/forward sibling joins, empty-neighbor handling and paragraph operations exist. Empty-first-Block parent fallback, manager Block selections, full navigation and modifier branches are not original parity. Both Shift deletes use one fallback order. |
| Cancellation/native reconciliation | Same onBeforeInput/reconcileStandoffText | Some noncancelable beforeinput paths still execute canonical mutations although browser mutation cannot be prevented. Text-only diff cannot reconcile inline atoms. Do not label all such paths safe without browser checks. |
| Annotation deletion | [block-tree/commands.ts](src/block-tree/commands.ts):29 | Mapper contracts surviving ranges, but fully deleted annotations are removed with flatMap rather than preserved as isDeleted records. |
| Annotation insertion/style | Same mapper; [Standoff view](src/rendering/standoff-editor-view.tsx) | Numeric edge behavior covers part of Cell attachment. CSS inheritance, semantic affinity, all schema decorators/renderers and old metadata/tombstones are not parity-qualified. |
| Clipboard | [input/gateway.ts](src/input/gateway.ts): writeStandoffClipboard/onPaste | Uses source “codex”, format “standoff-inline-v1”, context.ranges and data fragments. It does not write/read the original Codex/StandoffEditorBlock annotation envelope. Native cut is not Control-X extraction. |
| Registry | [register-core-views.ts](src/rendering/register-core-views.ts) | Registers only history.undo, history.redo and block.remove commands; presence does not bind their original keys. Several specialized Block types render generic containers. |
| CodeMirror | [core-block-views.tsx](src/rendering/core-block-views.tsx): CodeBlockView | Native textarea placeholder, not CodeMirror basicSetup/javascript behavior. |
| Tabs/checkbox/windows | Same file | Click/change/drag/minimize/close subsets exist, but tab menu operations, navigation, window maximize/resize and lifecycle parity remain. |
| Panels/menu/text processing | Registry, overlay layer, model event bus | Generic containers/session overlay infrastructure are not annotation monitor, entity search/list, find/replace, style bar, BlockMenu or TextProcessor implementations. |
| History/focus | [reactive-editor/editor.ts](src/reactive-editor/editor.ts), runtime services | Foundations exist; every structural/editing path still needs selection bookmarks, cross-view mapping and origin-specific focus qualification. |

Existing tests and build results remain historical evidence from RESTRUCTURE_PROGRESS. They were not rerun to imply runtime qualification during this documentation-only investigation.

## 9. Acceptance matrix to use when coding resumes

These cases are requirements, **not tests created or passed in this pass**. Implement one behavior slice at a time and attach evidence to the relevant ledger IDs.

### 9.1 Dispatcher and every-Block coverage

- For each of the 97 binding IDs: match and nonmatch; exact modifier/platform alternatives; mode precedence and same-mode declaration order; origin versus owner; cancellation before async work; focus/caret side effects; no duplicate invocation.
- For each direct/JSX/helper/factory callback: actual installation, click/hover/form/pointer path, selected source, menu visibility, session closure, unmount teardown and no second central mutation.
- Exercise builder and convenience-factory construction separately, especially DocumentTab and PlainText.
- For every class in §3, verify inherited routing as well as local behavior. Include outer/inner documents, margin Documents, detached overlays, inactive tabs, nontext neighbors, windows and shared occurrences.
- Characterize middle/right button behavior, click versus dblclick, quoted characters with modifiers, native textarea/CodeMirror/form controls and browser/OS-reserved shortcuts.
- No missing-schema, disconnected binding or stub may be marked “ported” without an explicit dormant/corrected decision.

### 9.2 Document/text editing cases

- All §4.1 deletion branches, both Shift fallback orders, word deletion, selected Block batches and mixed Block types.
- Enter at start/middle/end/empty, active selection, list/checkbox/tab/grid/table nesting and multiple windows; Control-Enter structure break-out.
- Visual-row arrows at wrapped lines, filtered-index crossing, hidden-tab reveal, scroll adjustments, Shift ranges, word navigation, Home/End.
- Structural move/indent/deindent and every creation/conversion/extraction/menu action: IDs/metadata/children/relations, focus target and one undo transaction.
- Copy/paste legacy envelope and annotations, plain text with multiple lines and existing suffix, both clipboard flavors present, files, invalid JSON, mixed content and cut versus extraction.
- All 33 replacements and 37 rules, with repeated/adjacent matches and non-BMP text; typed, pasted, replaced, deleted and programmatic input must use the same deliberate post-edit policy.

### 9.3 Annotation matrix

Use non-EOL text plus terminal EOL; property bcd [1,3] in abcdef is the base fixture in §5. Add bold/CSS, semantic entity, SVG highlight/underline, wrapper/plugin, and clientOnly search highlight, with overlapping/nested/adjacent ranges.

- Single deletion before/start/inside/end/after; singleton deletion; whole-range deletion; partial prefix/suffix; a deletion spanning several properties; EOL refusal.
- Insert before/start/inside/end+1/after, including annotation at absolute first Cell; single/multiple code points; adjacent annotations with opposite edges.
- Replace a selected range when anchor is inside/deleted; forward/backward selection; replace-all with unequal lengths; IME composition, native fallback, dead keys, emoji, combining text and atoms.
- Split before/inside/after a property and exactly at its endpoints; join with annotations on both Blocks, including overlap at the join boundary, tombstones, metadata, plugins and reference identities.
- For each edit assert text, surviving Cell/anchor identity, inclusive export offsets, live/deleted/clientOnly status, value/metadata/plugin preservation, exact decoration after layout, caret, selection, undo/redo and save/reload.
- Closing a monitor/search/panel must remove only transient highlights, not user annotations. Deleting part of highlighted text must keep highlights on surviving annotated Cells.
- Fully deleted records: decide explicit canonical tombstone representation; preserve legacy serialized isDeleted contract and avoid resurrecting on reload.
- Compare immediate CSS inheritance with stored range/reloaded result. Resolve start/end affinity **per schema**, rather than masking discrepancies with wholesale decoration re-creation.

### 9.4 Required decision records before broad code generation

- [ ] D-01: Correct legacy source defects while preserving exact intended triggers; attach individual ledger IDs and characterization evidence.
- [ ] D-02: Annotation start/end insertion affinity and replacement typing policy by schema.
- [ ] D-03: Tombstone, ID, metadata and plugin behavior through delete/split/join/undo/reload.
- [ ] D-04: Inclusive code-point export versus half-open canonical boundaries, UTF-16 native offsets and grapheme motion.
- [ ] D-05: One edit/notification owner across keydown, beforeinput, input, composition, paste and TextProcessor.
- [ ] D-06: Native/widget/application shortcut boundaries and multi-document/margin/panel routing.
- [ ] D-07: Legacy clipboard compatibility plus separately negotiated mixed-inline format.
- [ ] D-08: Per-command history grouping and per-occurrence focus/selection bookmarks.

## 10. Handoff and progress discipline

Documentation completed in this pass: source census/ledger, per-Block mapping, dispatch/reachability analysis, annotation insertion/deletion mechanics, reactive gap comparison and acceptance/decision matrix.

Implementation status: **unchanged**. Full input parity remains open. No application source, dependency, configuration, server or test files were changed.

Documentation validation: all 454 ledger IDs are unique; all 97 binding entries
have summary rows; all 454 quoted excerpts match the original source at their
recorded line; all 60 source hashes still match; relative file links in both
proposal copies, this addendum, the ledger and the progress log resolve. This is
source/document validation, not browser behavior qualification.

Before the next implementation pass, read the proposal, this addendum, the affected ledger entries and RESTRUCTURE_PROGRESS. Append exact implemented IDs and verification results to the progress file. If interrupted, leave unfinished IDs open with a concrete next action. An entry is not complete because its Block has a view or its source code remains copied in the reactive repository.
