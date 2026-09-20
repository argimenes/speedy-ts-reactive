# Compact editor toolbar and footer status: implementation plan

Status: original design proposal, 20 September 2026. Source inspection at `2f8bfee`.

**Implementation scope amendment (user direction):** The authoritative inventory is
`d046665^` (`04c27fe`), immediately before the server-hosting feature. Git comparison
confirms that the formatting toolbar, count component and canonical window view
were unchanged by that feature. Ignore Vercel/server-local controls completely;
leave their flag, routing and persistence behavior untouched. Implement this as
one bounded UI change with existing handlers, without command-system extraction
or rearchitecture. The compact feature is **default ON**, with an opt-out flag.
The user has authorized implementation; the review gates below are historical
planning suggestions, not requests for renewed approval.

The implementation uses the existing two desktop rendering call sites only because
they already rendered DocumentStyleBar before hosting was introduced. This does
not create or qualify two hosting variants. Shared presentation components reuse
the current callbacks; missing local binding registrations, public extension APIs,
new command routing and Vercel UI parity are outside this feature. More contains
existing Document/Block/options actions, avoiding an unrelated header redesign.
See EDITOR_TOOLBAR_STATUS_IMPLEMENTATION.md for final implementation and validation.

The remaining text records the original proposal; where it differs, this amendment
and subsequent user instructions take precedence.

The recommendation is one fixed-height, switchable formatting row and one thin
footer within each Document window. Separate command execution from toolbar
presentation first, retain the existing counting service, and make operation-specific
inputs appear in panels rather than additional rows. Default to Typography; remember
the chosen toolset for that window's lifetime without saving it in document history.

This is a major feature. Implement it behind a proposed `compactEditorChrome`
flag in [src/configuration.ts](src/configuration.ts), **enabled by default** by
explicit user instruction (overriding the repository default-off convention). The flag selects the complete toolbar/footer presentation; it
must not create two simultaneously mounted toolbars or count services.

## 1. Current implementation and source map

The converted implementation is **Solid**, not React. Its reactive stores and
signals need bounded subscriptions, not React component memoization. Legacy
`src/components/style-bar.tsx` and `src/blocks/document-window-block.ts` are not
the implementation to redesign.

| Source | Current responsibility and relevance |
| --- | --- |
| [document-style-bar.tsx](src/rendering/document-style-bar.tsx) | `DocumentStyleBar`, the 15-entry `annotationTools` catalogue, remembered target/range, colour and linked-annotation drafts, inline/layout mutations, application commands, notices, and embedded counts. These responsibilities are currently combined. |
| [document-style-bar.css](src/rendering/document-style-bar.css) | `flex-wrap: wrap`; both status and counts have `flex-basis: 100%`. Every toolbar `role=status` reserves `height: 2.5em`, including the always-rendered empty notice. Removing wrapping alone does not remove this vertical cost. |
| [workspace-demo.tsx](src/demo/workspace-demo.tsx) | `DemoSession` renders the toolbar with `projection.state.rootKey` above the document section. The initial showcase uses separate Background and Document editors. `CanonicalWorkspaceSession` instead renders a canonical Workspace with potentially multiple windows in one editor. |
| [core-block-views.tsx](src/rendering/core-block-views.tsx) | `WindowView` renders the same toolbar only for `document-window-block`, scoped to the window occurrence. Ordinary/sticky windows do not acquire a formatting toolbar. Owns window sizing, minimization and collapsed-margin presentation. |
| [workspace-demo.css](src/demo/workspace-demo.css), [index.css](src/index.css) | Demo toolbar min-height, button sizing, overflow and glass overrides coexist with toolbar CSS. Canonical windows use a flex column and a scrollable `.reactive-window__content`; demo tabs/pages have their own height chain. Both hosts must receive the footer. |
| [document-count-bar.tsx](src/rendering/document-count-bar.tsx) | Creates a worker and `DocumentCounts` on mount, terminates/disposes them on cleanup. Renders a native `details` summary plus counts table and inclusion explanation. |
| [document-counts.ts](src/runtime/document-counts.ts), [text-counts.ts](src/runtime/text-counts.ts), [text-count-worker.ts](src/runtime/text-count-worker.ts) | Debounced, cached, worker-backed counts and scope membership. Already independent of toolbar layout. |
| [registry.ts](src/block-tree/registry.ts), [types.ts](src/block-tree/types.ts) | `CommandRegistry` provides `register/list/canExecute/execute`; `CommandContext` has `targetKey` and typed `args`. `BlockRegistry` exposes capability strings. Neither has toolbar metadata today. |
| [binding-catalog.ts](src/input/binding-catalog.ts), [bindings.ts](src/input/bindings.ts) | Named actions, categories, effective/reassigned triggers and labels. Presentation must use these effective labels, not hardcoded shortcut strings. |
| [editor.ts](src/reactive-editor/editor.ts), [register-core-views.ts](src/rendering/register-core-views.ts) | Per-editor services and registration lifecycle. Existing registered commands include history, Block removal and sticky creation; not every toolbar action is registered. |
| [gateway.ts](src/input/gateway.ts), [cross-block-input.ts](src/input/cross-block-input.ts) | Input routing, native-field exclusions, model-owned cross-Block selection and toolbar selection exemptions. Exemptions currently depend partly on `.document-style-bar` and `[data-cross-text-controls]`. |
| [focus.ts](src/runtime/focus.ts), [selections.ts](src/runtime/selections.ts), [mounts.ts](src/runtime/mounts.ts), [overlays.ts](src/runtime/overlays.ts) | Existing occurrence-aware focus, selection and mounted-view access; overlays retain return focus/selection. Reuse these mechanisms. |
| [cross-block-selection.ts](src/runtime/cross-block-selection.ts), [linked-annotations.ts](src/runtime/linked-annotations.ts), [entity-search.ts](src/runtime/entity-search.ts) | Cross-range operations, linked shared definitions and entity chooser, including transaction/validation behavior. |
| [annotation-monitor.tsx](src/rendering/annotation-monitor.tsx) | Existing contextual inspector for type, ranges, IDs, value, metadata, entity details and linked segments; do not duplicate it in chrome. |
| [block-menu-actions.ts](src/runtime/block-menu-actions.ts), [text-tabs.ts](src/runtime/text-tabs.ts), [timer-block.ts](src/runtime/timer-block.ts) | Existing contextual operations and reusable tab/timer functions. Menu and toolbar timer insertion paths are not identical. |
| [standoff-styles.ts](src/rendering/standoff-styles.ts) | Appearance schemas, including deferred Blur/Flip/Mirror wrappers. Rendering capability is not the same as a user-facing command definition. |

There are two hosting integrations, not just one component replacement. The
canonical window's content container establishes its named size query; a toolbar
sibling cannot automatically use that descendant container. Observe toolbar width
itself, or establish an appropriate new chrome container without changing the
existing Page/margin queries.

Related design work: [ToolbarBlock/composition plan](BLOCK_COMPOSITION_AND_TOOLBAR_PLAN.md)
already proposes shared annotation operations and explicit tool targets. Reuse
that direction, but do not implement portable ToolbarBlocks, floating target
brokers, structural transfer or a public plugin API here. Also preserve the
contracts in [toolbar migration](DOCUMENT_STYLE_BAR_MIGRATION.md) and
[text-count migration](TEXT_COUNTS_MIGRATION.md); older verification reports are
historical evidence, not fresh results for this plan.

## 2. Inventory and classification of visible controls

“Frequent” below is a proposed interaction priority, not measured usage telemetry.
Every existing control has a destination; moving a control must not remove its
pointer, keyboard or touch access.

| Current control(s) | Current action/state | Classification and proposed destination |
| --- | --- | --- |
| **B, I, U, S̶** | `style/bold`, `style/italics`, `style/underline`, `style/strikethrough` | Core range editing; first Typography group. Applies annotations, not toggle-off behavior. |
| **x², x₂, AA** | Superscript, subscript, uppercase annotations | Typography, lower overflow priority than B/I/U. Uppercase changes presentation, not source text. |
| **Align left, centre, right, justify** | `block/alignment` on remembered text Block | Typography paragraph group; compact alignment chooser or individual buttons as space allows. Unavailable during cross-Block range selection. |
| **H1, H2, H3, H4** | `block/font/size` values | Typography heading chooser containing all four existing values. Do not reinterpret as structural headings or invent a “Normal” mutation. |
| **Increase/decrease indent** | Increment/decrement `block/indent`, clamped at zero | Typography paragraph group. Preserve 20px-per-level presentation and non-structural semantics. |
| **T× / Clear formatting** | Removes style/colour annotations across target Block and all its Block properties; preserves semantic annotations | Typography overflow. Explain Block scope. Remains unavailable for cross-Block range; do not silently turn it into range-only clear. |
| **Highlight, Marker** | `style/highlight`, `style/highlighter` (different renderers) | Annotations, as markup tools. Grouping does not turn them into semantic linked annotations. Keep both distinguishable. |
| **Entity reference** | `openEntitySearch`; local or cross-range attachment, or browse without a selected range | Annotations, high priority. Preserve browse-without-selection behavior rather than disabling it indiscriminately. |
| **Rainbow, □ Rectangle, Spiky** | Ordinary range styles | Visual effects. Less likely to need permanent first-row access than typography. |
| **Blur, Flip, Mirror** | Preserved annotation data; range-wrapper rendering deferred | Visual effects overflow, clearly described as stored effects whose rendering is pending. Preserve invocation/serialization; rendering work is separate. |
| **Text colour input + Apply colour** | Local draft (initial red), then `text/colour` annotation | Visual effects, first group. Compact Colour trigger opens labelled picker and explicit Apply; choosing a colour alone still does not mutate text. |
| **Fill input + Apply fill** | Local draft (initial yellow), then `text/background-colour` | Visual effects beside Colour, same explicit-Apply rule. |
| **Find** | `editor.find.open` with scoped fallback target | Document navigation/search. Move to visible Document menu in existing window header; preserve binding and dedicated Find panel. |
| **Entities** | `editor.entityList.open` | Document-wide inspection/navigation. Document menu, distinct from creating an Entity reference. |
| **Timer** | `createTimerBlock`; replace empty text or insert relative to target | Document menu → Insert → Timer; existing Block menu remains. No permanent formatting button. |
| **Cross-Block selection (experimental)** checkbox | `crossText.enable`, persisted browser preference | Document menu → Editor options. Preserve experiment label, storage key and enable/clear behavior. Not a formatting toolset. |
| **Resume text editing** | `crossText.collapseToHead`; shown whenever experiment is enabled, disabled without a range | Show only for an actual in-scope cross-range, through an explicit Selection control; keep Escape. |
| **Linked annotation type**, **Reference/value**, **Create linked annotation** | Local creation drafts (default `codex/entity-reference`, empty value), currently shown whenever experiment is enabled | Annotations → New linked annotation panel, available for an in-scope nonempty cross-range. These fields are **not** the currently selected annotation's inspector state. |
| **History** (feature gated) | `history.open` for eligible focused Block | Contextual Block tools and existing Block menu. Preserve `blockHistory` flag and non-text Block support. |
| **To tab / + Tab** | `createTextTab` using captured local range | Contextual Block tools and existing Block menu; retain binding and cross-range prohibition. |
| **Margins (n)** (narrow windows with margins) | Window-owned drawer visibility | Compact header View/Margins control while margins are collapsed; retain expanded state, count and accessible drawer relationship. |
| **History error/offline/stopped text** | Existing recording service state | Footer issue item only when relevant, with full explanation available; not a command or an always-reserved extra row. |
| **Notice / cross-selection message** | Validation/results/help; always-rendered status element | Compact feedback within footer plus an expandable message panel; selection action lives in contextual controls. No permanently blank message row. |
| **Block/Page/Document words**, expandable counts table | Derived text counts and worker pending/unavailable states | Footer counts item; move detailed table into an upward-opening panel. |
| Separator `<i>` | Visual grouping only | Replace with metadata-driven group separators; never count as a command. |

Existing workspace file buttons, revision/JSON demo controls, title/save state,
window buttons and Page/tab labels are adjacent chrome, not formatting tools.
Keep them outside the switchable toolsets; do not add another global operations
row. Preserve existing file-error handling even where it conditionally consumes
space; the fixed-row promise applies to the toolbar and footer, not suppression
of actionable save failures.

## 3. Proposed toolsets and contextual destinations

Start with **three stable toolsets**:

1. **Typography**: B/I/U/strike; superscript/subscript/uppercase; alignment,
   headings, indent/outdent; Clear formatting in overflow. Common inline and
   paragraph operations belong together, with groups and priorities preventing
   a long row from becoming a new horizontal catalogue.
2. **Annotations**: Highlight, Marker, Entity reference; New linked annotation
   when a cross-range permits it. Existing annotation inspection stays in the
   monitor; optionally expose its existing action here after the routing review.
3. **Visual effects**: Colour, Fill; Rainbow, Rectangle, Spiky; deferred
   Blur/Flip/Mirror in overflow with truthful descriptions.

Do **not** add a generic Document/Editor toolset merely to house displaced
controls. A discoverable **Document ▾** header menu holds Find, Entities, Insert,
View and Editor options. This header trigger is new chrome and must be built for
both hosts; the existing Block context menu alone is not a sufficient replacement
for always-visible toolbar entry points. Stop header drag propagation on controls.

A bounded **Block ▾** contextual trigger in the toolbar's trailing area exposes
History and To tab when applicable. Future Block types can supply descriptors
selected by type/capability, without growing the global row. Show a clear target
name in that menu; do not make a large global Block toolset for two initial actions.
A **Selection ▾** trigger appears for an in-scope cross-range and includes Resume
text editing and New linked annotation. At constrained widths merge these entries
into the labelled More menu under explicit Block/Selection sections.

Changes in context update availability or reveal that bounded trigger. They never
automatically switch the chosen toolset. Inactive toolsets remain directly
selectable even when their editing tools are disabled. If context disappears
while a popup has focus, retain the shell long enough to disable its stale action
or close it and return focus predictably; never remove the focused element without
handling focus. Opening a linked-creation panel does not change toolset selection.

## 4. Command and component architecture

### Reuse execution; add presentation metadata

Keep `TreeCommands` as the only canonical mutation/transaction path. Reuse
`CommandRegistry` for execution and availability and `BindingRegistry` for input
configuration. Add an internal, typed presentation catalogue referencing command
IDs; it is not a second action dispatcher. A descriptor may contain:

```ts
// Illustrative design, not an implementation contract.
type ToolPresentation = {
  id: string;
  commandId: string;
  bindingIds?: readonly string[]; // local/cross routes can have different IDs
  toolset: "typography" | "annotations" | "visual";
  group: string;
  order: number;
  priority: number;
  label: string;
  icon?: string;
  control: "button" | "choice" | "colour" | "panel";
  visible?: (context: ToolContext) => boolean;
  active?: (context: ToolContext) => "none" | "all" | "mixed";
  disabledReason?: (context: ToolContext) => string | undefined;
};
```

`canExecute` remains authoritative, including at invocation time. UI availability
adapters may supply explanations but must not independently reproduce mutation
validation. Parameterised colour/heading/alignment controls pass typed `args` via
the existing `CommandContext`. Toolset category and binding category need not be
identical. Keep a simple built-in catalogue/Block contribution map; no plugin
loading protocol, executable saved configuration, customization editor or new
command bus.

Register relevant commands once per editor, outside toolbar mount/unmount and
outside the selected-toolset branch. `CommandRegistry.register` rejects duplicate
IDs, so one registration per window would fail in a canonical multiwindow editor.
Extend the existing setup path rather than register commands from a Solid effect.

There is a real input gap to review: `binding-catalog.ts` lists local `style.*`
actions with **no default triggers**, but inspection found no corresponding
formatting command registrations; gateway fallback reaches `CommandRegistry`.
The working cross-range B/I/U shortcuts dispatch directly to `crossText.annotate`.
Do not claim all formatting shortcuts already share a command path, or invent
local Ctrl/Cmd+B defaults as part of layout work. Extract/register the missing
handlers in an independently reviewable routing change, preserve existing binding
IDs and overrides, and keep adding new default shortcuts a separate decision.

### Proposed boundaries

| Proposed responsibility | Behavior |
| --- | --- |
| Runtime formatting operations (for example `runtime/formatting-actions.ts`) | Move local `annotate`, `blockStyle`, `indent`, `clear` out of JSX without changing range/property rules. Delegate cross operations, entity search and linked creation to existing services. |
| Window chrome controller | Own scope, last valid editing target/bookmark, selected toolset, colour/linked drafts and open panel state. No repository writes for UI changes. |
| `EditorToolbar` + `ToolsetPicker` + tool renderers | Read descriptors and narrow context accessors; show one toolset and overflow. Do not own editor lifetime or recreate `ReactiveTreeView`. |
| `DocumentActionsMenu` | Header access to relocated Document operations/preferences, through existing services/registered adapters. |
| `ContextTools` | Fixed-space disclosure for applicable Block/Selection contributions. Existing Block menus remain usable. |
| `EditorStatusBar` / count item | Host the existing counts UI/service separately from toolbar switching. Small status descriptors, detailed below. |
| Selection/bookmark adapter | Use `selections`, `mounts`, `focus` and cross-range endpoints; capture before pointer or keyboard focus transfer, validate before execution and restore according to invocation mode. |

The runtime target must identify owning editor, view occurrence, scope and local
range or model-owned cross-range. The current toolbar retains the last in-scope
standoff target and recursively searches children/owned relations. It can keep a
text target after focus moves to another Block. Separate the **active Block** used
by History/context tools from the **last valid text selection** used while chrome
has focus. Native code/text/media focus must not silently format stale text.

Validate all cross-range segments against window scope and current visibility,
not just the anchor. Reject disposed/deleted/reparented/hidden targets, and never
fall back to a different Document to make a command succeed. Capture both anchor
and head to preserve reversed selections. Bookmark validity should use relevant
content/occurrence state; avoid invalidating solely because an unrelated Block
changed. If safe mapping cannot be established after text/structural edits,
require reselection. Do not retain naked offsets indefinitely.

Active appearance must describe existing semantics: repeat Apply Bold is an
idempotent apply, **not** a toggle that removes Bold. Show an “applied”/mixed state
with accurate descriptions; do not add `aria-pressed` implying unsupported
on/off behavior. Reserve true toggle semantics for preferences/disclosures.
Initial active-state derivation can inspect the current target's properties and
selected segments; it must not scan the whole document on every caret move.

## 5. State ownership and persistence

Recommend **window-local, session-only** selected toolset, default Typography.
`DemoSession` owns this in its existing host; canonical `WindowView` owns it per
window occurrence. Keep it above the minimized/restored content branch so changing
window state does not reset the toolset. Destroy it when that window closes;
opening/reloading a new window starts at Typography. Changing Page/tab within the
same window retains the chosen toolset but revalidates targets.

Editor-local state alone is wrong for canonical Workspaces containing multiple
windows. Workspace/global persistence would make unrelated windows influence
one another; saved document metadata would introduce history/dirty-state changes.
A future preference may choose the initial toolset, but is not needed here.
Colours and linked drafts likewise survive toolset switching without document
writes; clear their target bookmarks when invalid. Cross-Block enablement remains
the existing browser preference. Its current per-editor loading/storage behavior
must not be silently converted into a newly synchronized settings service.

## 6. Switching and narrow-window interaction

### Response to the supplied mockup

The user supplied a visual reference during planning. Adopt its named toolset
selector, separated command groups, trailing More menu, and bottom counts as the
visual direction. Its selected-toolset checkmark makes alternatives discoverable
without relying on wheel gestures. Treat its document artwork and application
tabs as illustrative; this task does not redesign the application's window/tab
system or document typography.

Recommended refinements against the actual command inventory:

- Keep the mockup's three formatting categories. Expose Block tools contextually
  and Document operations in the window header menu, as described above, rather
  than making either another permanent toolset.
- Defer Recently Used: there is no requirement for usage tracking or a changing
  command order, and stable locations are easier to learn in this first version.
- Keep H1–H4 and alignment as individual controls at generous widths if preferred;
  compact choosers/overflow use the same actions at smaller widths. List-like
  icons in the reference do not authorize adding list commands or replacing
  layout indent with structural list indentation.
- Retain only existing counts and relevant existing feedback in the footer.
  Do not add the illustrated save-age text, green check, zoom control, UTF-8,
  document-title repetition or Focus mode for decorative completeness. Existing
  save state remains in its current header location.
- Add accessible previous/next toolset controls where space permits, while keeping
  the selector as the primary control. Do not reserve the reference's unlabeled
  sparkle icon unless a real, explicitly named command needs it.

The sketches below show this narrower proposal. Visual polish can follow the
reference without assuming every illustrated control already has an editor action.

Illustrative desktop layout; dimensions are proposed review targets, not measured
results:

```text
[window controls]  Document title                 [Document ▾]
[‹] [ Typography ▾ ] [›]  B I U S̶  x² x₂ AA [Heading ▾] [Align ▾] … [More ▾]
[existing Page/tab labels, where present]
┌────────────────────────────────────────────────────────────────────────┐
│                            document                                    │
└────────────────────────────────────────────────────────────────────────┘
Block: 42 words    Page: 310 words    Document: 2,018 words             [▴]

[‹] [ Annotations ▾ ] [›]  Highlight  Marker  Entity reference  [Selection ▾]

Narrow / high zoom:
[ Typography ▾ ]  B I U  [More ▾]
Block 42 · Page 310 · Document 2,018 [▴]
```

Target toolbar block-size: **40 CSS px** at default text size, using a scaleable
size token; one invariant row across toolsets, notices and widths at a given
density/text setting. Never wrap. Use `min-width: 0`, nonshrinking reserved
controls, and priority overflow. Font enlargement and a coarse-pointer profile
may use a larger fixed row (for example 48px), not clip labels or tiny hit areas.

The picker names the current toolset and shows a disclosure indicator. Its menu
lists all three choices with the current choice marked. Previous/next buttons
cycle through the stable order and wrap; tooltips name the destination. On narrow
widths these redundant buttons can move into the picker menu, retaining all
navigation without gestures. Do not make them two tiny stacked arrow targets.

Wheel/trackpad switching is an optional accelerator **only over the picker**.
Normalize delta mode, accumulate to a threshold, and allow at most one step per
wheel burst until a short idle boundary; discard inertia/residual deltas after a
step. Ignore Ctrl/Meta-wheel (zoom), horizontal gestures and events while menus or
native fields are active. Capture scrolling only inside that intentional control
and only for handled gestures; document scrolling elsewhere remains untouched.
Test thresholds on real mouse wheels and trackpads before enabling the gesture.
No global wheel listener or gesture-only discovery.

Measure available toolbar width using a local `ResizeObserver`. Reserve picker,
More and contextual disclosure space, then include highest-priority command
groups that fit. Keep picker+Apply interactions together in panels; never orphan
an Apply button from its value. The More menu contains all overflowed commands in
stable group order with labels, availability and effective shortcuts. At the
smallest usable width, picker and More alone suffice. Popup contents can scroll
vertically within the viewport; the row cannot gain a horizontal scrollbar that
changes its height. Recompute on actual size/font/density changes, not caret moves.
If a focused item moves to overflow during resize, transfer focus to More or its
corresponding menu item.

Current Document resize minima are 560px, or 602px with minimap. Test those actual
host constraints; separately test the chrome component at 320 CSS px for zoom and
future embedding. Do not promise the whole document becomes 320px-responsive
without a separate decision about window/Page minima.

## 7. Footer and counting design

Move the count component from inside `DocumentStyleBar` to a sibling **after the
scrolling document region** in both hosts. The layout becomes header, toolbar,
flexible document region and footer; existing tab chrome stays within its current
host. Use `flex: 1; min-height: 0` for the document and nonshrinking chrome. The
footer must stay visible while Pages scroll and not cover the last line, minimap,
resize handle or margin drawer. Derive drawer offsets from chrome dimensions;
`index.css` currently hardcodes drawer `top: 84px; bottom: 12px`.

Target footer: **24 CSS px** at desktop defaults, scaling for text/coarse pointer
as needed. It contains Block/Page/Document words and a counts-details disclosure.
Preserve word labels when space permits; shorten labels/spacing at constrained
widths with full accessible scope names. At extreme widths retain Document total
and a labelled Counts disclosure exposing all three scopes, rather than clipping
counts or wrapping. Expanded details open upwards in a viewport-bounded panel;
opening them does not increase footer height.

Preserve all current details: words, characters, characters without whitespace,
counts inclusion explanation, Updating and Counts unavailable. A dash means
unavailable/inapplicable, not zero. Do not mark the whole rapidly updating count
summary as a live region. Announce errors and requested details deliberately.

Reuse `DocumentCounts` and its worker: 300ms trailing debounce, dirty-content cache,
delta totals, structural membership rebuild, generation checks, periodic yielding
while assembling text, and disposal. It counts main text across inactive Pages and
all tab alternatives, excludes margins/sticky/owned attachments from totals,
counts repeated content per occurrence, and uses graphemes for characters. Worker
failure must still show unavailable, never silently segment on the editing thread.
Do not change these rules or compute totals from mounted DOM.

Initially keep the worker/service lifecycle in the relocated count component.
It must remain mounted while changing toolsets or opening menus. Both hosts
currently unmount main content when minimized; retaining that worker teardown on
minimize is acceptable, with counts rebuilt on restore. Keeping counts alive while
minimized or sharing workers between windows is separate optimization, not a
prerequisite. A simultaneously mounted old and new count bar is prohibited.

Scope review is necessary: current `rows()` follows editor-wide focused/last-focused
keys, while `DocumentCounts` is rooted in the supplied window scope. Shared content
keys can make another window's Block count look valid. Use the window's last valid
in-scope count target, including eligible plain text and excluded-section own
Block counts; clear unavailable Page state. Keep the same count root initially
(the supplied window/root placement). Multiple Document children under one root
need a fixture and explicit review before relabelling the aggregate or changing
inclusion scope.

Use a small typed list of status items (`id`, order, visibility accessor, text/
accessible label and optional details renderer). The initial items are counts
and existing feedback/history problems only. No invented cursor, encoding, sync
or connection indicators. Derive service data where it already lives, without
copying it into a new global status store. Urgent existing errors take precedence
over low-priority counts at narrow widths; a labelled issue disclosure retains
full text. Do not silently ellipsize failures beyond recovery.

## 8. Accessibility and selection/focus contract

- Give the row `role="toolbar"` with a descriptive label and horizontal orientation.
  Use a tested roving-focus model: Tab enters/exits, Left/Right traverse controls,
  Home/End jump within the row, Enter/Space activate. Menus use their own arrow,
  Escape and selection behavior; native form fields retain ordinary editing keys.
- Picker is an accessible menu button (or equivalent single-choice control) with
  expanded/current state. Toolset names are visible. Icon-only actions receive
  explicit accessible labels; do not rely on ambiguous alignment glyphs/title.
- Provide hover **and focus** tooltips with action name, effective shortcut and
  disabled reason. “Unassigned” need not clutter every tooltip. Preserve access
  to explanations for disabled commands through the menu/help text.
- Use at least comfortable 32px desktop command targets inside the proposed row;
  a coarse-pointer density can raise targets/row height to approximately 44/48px.
  Touch has full picker/menu access without hover or wheel.
- Capture selection before pointer focus transfer **and keyboard Tab entry**.
  Simple pointer formatting/previous-next actions can preserve document focus;
  menu and colour input interaction must be allowed to take focus intentionally.
  Do not copy the current blanket button `preventDefault` onto every popup trigger.
- Keyboard users remain in the toolbar/menu while navigating or changing toolsets.
  Escape closes the innermost panel and returns to its trigger; a further Escape
  from the toolbar returns to the valid document bookmark. It must not accidentally
  invoke `cross.cancel` while a toolbar menu is consuming Escape. Pointer toolset
  switching alone must not move the caret or request document scrolling.
- Tag all relevant portaled controls for cross-selection preservation. Audit
  **every** input exemption: `[data-cross-text-controls]` is not currently checked
  uniformly by keyboard, pointer, guard and focus handlers. Add explicit owner/scope
  association so controls in window B do not preserve or operate on window A's
  selection merely because they have the same CSS class.
- Protect native field undo/copy/paste, composition and browser zoom. Avoid routing
  formatting through synthetic clicks on visible buttons. Restore focus to the
  original valid occurrence after editing; close/dispose never redirects elsewhere.
- Fit popups to viewport and current z-order; canonical window `overflow: hidden`
  can clip inline popups. Reuse existing overlay focus/return conventions, with a
  bounded extension or chrome popup adapter where needed (the overlay view-type
  union is currently closed). Verify transformed windows, glass and resize handles.

These are implementation acceptance requirements, not claims that current controls
already satisfy them. Keyboard/screen-reader and real-pointer verification are
required; DOM-only tests cannot prove usable hit targets or retained native ranges.

## 9. Performance and reactive update boundaries

The current component does not cause React-style whole-tree renders. Solid updates
tracked expressions. Nevertheless, target effects read node state and recursively
walk a scope; menu predicates or new active-state derivations could become broad
subscriptions. No runtime profile was collected for this document, so there is no
claim that the present toolbar is a measured typing bottleneck.

Keep the descriptor array static, render items by stable ID, and read narrowly
scoped accessors per control. Toolset switching should only change visible chrome.
It must not remount the tree/projection, reconstruct the editor or count worker,
serialize content, increment revision, dirty the document or add history entries.

Compute target ancestry/membership when target or relevant structure changes,
not by recursively walking every Cell for every button. Existing `blockAncestors`
scans projected nodes, so it is useful semantically but not a per-button hot-path
optimization. Start with a bounded cached scope resolver; do not introduce a new
repository-wide index without evidence. Active/mixed style inspection should use
selected Block properties; avoid `linkedAnnotations.segments()` workspace scans
just to enable a button. That service deliberately scans contents for the open
inspector and is not a cheap global toolbar selector.

Counts update only their status item. A cross-range update affects relevant
availability/context controls; picker state never propagates into Page rendering.
Coalesce resize measurements and avoid read/write layout loops; menus are mounted
on demand with drafts owned above their visibility branch. Do not run a count
rebuild or full command `canExecute` sweep on every mousemove.

Proposed performance acceptance: switching has no intentional async delay and
settles by the next frame under normal load; record browser timings on agreed
hardware rather than promise an unmeasured universal millisecond bound. Assert
unchanged document DOM nodes/mount registrations and zero repository mutations
for toolset/overflow/status interactions. Compare typing with the flag off/on on
the same large fixture; investigate regressions before widening scope.

## 10. Migration and compatibility risks

| Risk | Required mitigation |
| --- | --- |
| Mutation extraction changes formatting | Preserve inclusive annotation ends (`max(anchor, head) - 1`), UUID generation, exact duplicate no-op, unknown metadata, unrelated properties, semantic references and one-operation undo. Keep canonical command primitives. |
| Hidden toolset loses shortcuts | Register/route commands independently of presentation; test direct registry execution and existing/reassigned shortcuts with another toolset visible and with toolbar unmounted. Audit missing local `style.*` routes separately. |
| Menus destroy native/cross selection | Bookmark before focus transfer, carry owner/scope through portals, audit document-level capture handlers, validate before execution. |
| Shared editor acts on wrong window | Use explicit window scope and occurrence identity; separate current Block from last text target. Test two windows, shared content and separate demo editors. |
| Clear/indent/headings gain new semantics | Preserve whole-Block Clear, zero-clamped layout indent, and font-size properties. Changing names may clarify scope; changing mutations is outside this redesign. |
| Timer move changes insertion | Toolbar/shortcut `createTimerBlock` differs from Block menu `add(timerBlockDto())`, particularly for empty text. Relocated toolbar action must call the former; leave menu semantics intact unless separately approved. |
| Entity/linked workflow changes | Keep entity browse mode and chooser attachment validation. Generic linked creation accepts semantic types, rejects ordinary `style/`/`text/` types, and shares definitions; editing remains in monitor. |
| Deferred styles appear newly implemented | Keep truthful Blur/Flip/Mirror help; do not implement or remove their stored effects as a layout side effect. |
| Counts duplicate, leak or change scope | Exactly one worker/service per mounted count instance; unchanged inclusion rules and error policy; test focus across windows and scope replacement/disposal. |
| CSS/host drift | Explicitly test both host layouts, glass overrides, tabbed and flow documents, margins/minimap, resize/minimize/restore. Move count styles out of the toolbar stylesheet when extracted. |
| Popup clips or loses return focus | Viewport-aware positioning and owner-scoped overlay adapter; fix hardcoded drawer offsets and old `.document-style-bar__margins` focus queries in both hosts. |
| Feature-off regression | Legacy presentation remains default and uses the same extracted execution services. Avoid maintaining two implementations of formatting semantics. |

No document format, annotation meaning, persisted tool preference, Block transfer,
selection inclusion rules or default keybinding changes are required by the compact
presentation itself. Necessary routing/scoping fixes should be small separate
commits with their own compatibility evidence.

## 11. Tests and verification strategy

### Existing checks that depend on presentation

| Test/source | Required adjustment or preserved contract |
| --- | --- |
| [document-style-bar.test.tsx](src/rendering/document-style-bar.test.tsx) | Currently enumerates all 15 styles, expects 17 annotation buttons simultaneously, and selects by exact `title`. Retain catalogue/schema completeness and semantic assertions; locate commands by accessible name/stable ID after choosing their toolset/More. Do not weaken to “some button exists.” |
| [cross-block-selection.test.tsx](src/rendering/cross-block-selection.test.tsx) | Imports toolbar/catalogue and invokes visible style, Clear and indent controls. Exercise both presentation modes, popup preservation and unavailable-action explanations while keeping no-mutation assertions. |
| [text-tabs.test.tsx](src/rendering/text-tabs.test.tsx) | Assumes always-visible To tab and colour input; open Block/Visual menus explicitly. Preserve same-operation, range, rebinding, native-field and undo tests. |
| [block-history.test.tsx](src/rendering/block-history.test.tsx) | Directly mounts toolbar and finds button text `History`. Test new contextual access for text and non-text targets, and flag-off absence. |
| [document-entity-list.test.tsx](src/rendering/document-entity-list.test.tsx), [entity-search.test.tsx](src/rendering/entity-search.test.tsx) | Entity list uses toolbar title prefix; move that opening path to Document menu. Entity reference uses Annotations; retain browse/attach/cancel/stale selection contracts. |
| [workspace-demo.test.tsx](src/demo/workspace-demo.test.tsx) | Asserts `.workspace-demo__stylebar`, margin trigger class and revision stability. Keep flag-off coverage; add shared chrome contract for both hosts and relocated margin focus return. |
| [check-document-style-bar.mjs](scripts/check-document-style-bar.mjs) | Enumerates currently mounted annotation buttons and clicks by title. Enumerate catalogue expectations, choose toolsets/overflow and use actual pointer clicks including panel Apply controls. |
| [check-cross-block-selection.mjs](scripts/check-cross-block-selection.mjs) | Queries experimental checkbox, `.document-style-bar [role=status]` and counts, including standalone toolbar fixture. Open Editor options and mount complete chrome/count host in the new fixture; preserve real selection/IME/worker tests. |
| [check-window-icon.mjs](scripts/check-window-icon.mjs) | Finds `Margins (1)` directly. Verify relocated margin control and minimization/restore focus, counts teardown and toolset retention. |

### Focused new coverage

- Catalogue references resolve; stable order/priority, all legacy controls have a
  reachable destination, Block contributions do not require toolbar JSX changes.
- Command extraction parity for all styles, colours, layout and Clear; repeated
  applications, reversed/Unicode ranges, local/cross selections, semantic metadata,
  serialization and undo/redo. Existing style/rendering/Block-restore tests remain.
- Picker prev/next/direct/keyboard/touch paths; overflow and resize while focused;
  no automatic switching; window-local state survives minimize and resets on close.
- Stale bookmarks, deleted targets, active Page changes, non-text focus, two windows
  in one editor, and separate editors with document-level listeners. No cross-owner
  execution or accidental selection collapse from portal interactions.
- Colour draft survives toolset changes; picker alone changes no document state;
  linked drafts appear only in their panel; valid cross-range gates creation.
- Reuse [document-counts.test.ts](src/runtime/document-counts.test.ts): worker errors,
  debounce, invalidation, exclusions, inactive Pages, repeated content and unchanged
  count semantics. Add footer lifecycle/scope tests using worker stubs; actual worker
  load and built asset verified in browser.
- Input integration: existing B/I/U cross shortcuts, entity/timer/tab bindings and
  custom overrides work with any toolset visible; native fields/composition retain
  their behavior. Cover local registered style commands without inventing defaults.

Use Vitest/jsdom for state and routing, and real-browser checks for geometry,
selection, wheel inertia, keyboard focus, zoom and hit testing. Browser matrix:
both hosts; tabbed/flow content; default 840px canonical window and actual 560/602px
minima; short 240px windows; component-only 320px; 100/200/400% zoom; coarse pointer;
glass; minimap/margins; history on/off; expanded counts; errors; long labels/counts.

Measure toolbar/footer bounding heights, toolbar row alignment, document viewport
height and first-text position before/after on the same fixture. Pass requires one
row, no clipped/unreachable controls, footer outside scrolling content, and more
usable document height than the old wrapping layout at constrained widths. Record
actual recovered pixels; do not infer a numerical saving from CSS alone. Tab/reading
order, screen-reader names and announcements need manual review.

Future implementation checks: targeted affected suites, `npm run typecheck`,
`npm run build`, then the relevant browser scripts against Vite **and rebuilt
production artifacts**. Run the broader suite at integration, record pre-existing
failures separately, and avoid treating historical migration test counts as current
pass evidence. No tests/build are necessary merely to add this planning document.

## 12. Phased implementation and review gates

| Phase | Bounded deliverable | Review/exit gate |
| --- | --- | --- |
| **0 — Agree interaction and capture baseline** | Approve grouping/destinations, density and state policy; capture current screenshots/heights and targeted test baseline in both hosts. Confirm default-off flag. | User reviews this plan and the decisions below; no implementation starts from this document alone. |
| **1 — Extract execution and targeting** | Extract toolbar-local formatting with unchanged mutations; register commands once per editor; adapt bindings and legacy toolbar; introduce explicit scope/bookmark context. | Semantic, selection and history parity with old presentation. Missing local binding routes and target corrections reviewed as distinct changes. No new key defaults. |
| **2 — Add metadata and compact toolbar behind flag** | Static catalogue, three toolsets, picker/direct/prev-next navigation, priority overflow and isolated window state. Add wheel only after core keyboard/pointer routes work. | All commands reachable; hidden toolsets do not affect execution; narrow/high-zoom layout and no-mutation checks pass. Review screenshots before displacing controls. |
| **3 — Relocate operations and contextual inputs** | Shared Document menu in both headers, contextual Block/Selection disclosures, linked creation and colour panels, relocated margin trigger, input exemption/focus integration. | Destination parity and real pointer/keyboard/cross-range checks pass; no command disappears during migration. |
| **4 — Move counts and feedback into footer** | One count component/service below each scrolling region, details panel, compact notices/history errors, corrected drawer/resize geometry. | Identical count semantics, worker lifecycle and in-scope focus behavior; one toolbar row/one footer row; recorded height improvement in both hosts. |
| **5 — Integration and release review** | Complete accessibility, geometry, performance, build and compatibility evidence with flag on/off; update user-facing help and browser scripts. | Reviewer accepts measurable space gain, command parity and residual issues. Default remains off until explicitly approved. |

Phases 2–4 are an incomplete experimental UI while developing, not separate
production releases. Prefer small reviewable commits for runtime extraction,
input routing, chrome layout and count relocation. Keep a shared execution path
so flag-off remains a useful fallback. Formal plugin APIs, portable ToolbarBlocks,
new formatting semantics and global preferences remain deferred.

## 13. Decisions requiring user review

Implementation is not blocked on answering these during this documentation task;
the defaults below make the proposal concrete for the next review.

| Decision | Recommended default | Alternative/tradeoff |
| --- | --- | --- |
| Toolset grouping and priority | Typography / Annotations / Visual effects, with Highlight and Marker under Annotations | Colour could move to Typography if it is frequent enough to displace other first-row tools. Usage preference should settle this. |
| Find and Entities discoverability | Document header menu with existing shortcuts | Keep a single compact Find header button if one-click access is essential; avoid rebuilding an operations row. |
| Context disclosure | Block and Selection actions in bounded disclosures; merge into More at small widths | A visible Resume button during cross-selection improves immediacy but consumes more row space. |
| Density and footer size | Approximately 40px toolbar + 24px footer; larger coarse-pointer/text profile | Approve a larger default if touch comfort is more important than maximum vertical recovery. |
| Wheel gesture | Optional picker-only burst-based switching, no global interception | Ship the first version without wheel if trackpad testing shows accidental switches; direct selection and prev/next stay available. |
| Remembered toolset | Window lifetime only, default Typography, no automatic context switching | Global default/persistence can follow if explicitly desired; it needs preference UX and lifecycle rules. |
| Deferred effects | Retain in Visual overflow with rendering limitation explained | Hiding them entirely would be a separate availability change requiring agreement. |
| Missing local style binding routes | Restore usable handlers in separate reviewed routing work; retain IDs and unassigned defaults | New default keyboard shortcuts are a separate product choice, not assumed here. |
| Windows with multiple Document children | Preserve existing supplied-root count semantics initially and verify fixture | Active-Document-only totals would need an explicit scope decision and tests, beyond presentation relocation. |

The review should approve these bounded choices before authorizing implementation.
