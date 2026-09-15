# Window resizing and responsive Document margins

**Status:** Implemented, 15 September 2026.

## Outcome

Add direct resizing to ordinary `WindowBlock` views while keeping the model,
history and persistence rules already used for window movement. A Document
window will progressively reduce and then collapse its left and right margin
lanes before the main text column is allowed to become narrower than its normal
design width.

The resize gesture is a view interaction. Only its completed size is document
state. Responsive margin presentation, open compact-margin panels and minimap
measurements are derived session state and are not serialised.

## Implementation result

Canonical Window views now provide a bottom-right pointer and keyboard resize
handle in their normal state. Pointer movement uses component-local Solid state;
completion writes one `Resize Window` metadata operation, cancellation writes
nothing, and keyboard repetitions are grouped into one delayed commit. Generic
Windows use a 240 x 160 minimum. Document Windows use a 560 x 240 minimum,
increasing to 602px wide while an active minimap needs its lane. Minimized and
maximized presentations do not expose the handle, and minimization continues to
preserve the committed normal size.

Document content is now an inline-size query container. Its margins move from
full to compact widths, then collapse at a 700px content boundary before the
main column is squeezed. The corresponding 730px outer-Window accessibility
controller exposes a counted `Margins` control. Opening it moves each mounted
left/right relation occurrence into a session-only drawer rather than creating
a second copy. Closing or widening restores it to its source. If a margin editor
has focus during collapse, the drawer opens automatically and restores its
focus and selection.

The initial sample Document shell has the same resize handle, container behavior
and margin drawer. Its geometry remains local until Workspace Save constructs
the canonical Window manifest; it never dirties the Document. Existing minimap
`ResizeObserver` measurement follows live resizing without repository writes.

Focused tests cover pointer preview/commit/cancel, grouped keyboard resize,
undo, collapsed-margin integrity, one mounted margin occurrence, focus and
selection restoration, and the initial demo shell. A real Chrome check covers
minimize/move/restore, resize preview versus committed metadata, margin drawer
access and resize undo. Typecheck and both builds pass. The full suite is
256/258; the two failures are the unchanged context-menu baseline failures.

## Current findings

- `WindowView` already reads `metadata.size`, defaults to 840 x 620 CSS pixels,
  preserves that size while minimized, and commits metadata changes through the
  command/history layer.
- Window dragging has the desired transaction shape: local preview during the
  pointer gesture and one history write when the gesture completes.
- `TimerBlockView` already provides a close precedent for pointer capture,
  component-local size preview, cancellation and one final `block/size` write.
- Page margins currently derive from the Workspace-level `--margin-column`
  custom property. Their narrow modes use viewport media queries, so they do
  not react when one Window is resized inside a wide browser viewport.
- Margin notes and relation data are canonical Document content. Maniculae are
  CSS presentation. Collapsing either visually must never delete or rewrite the
  underlying relations.
- The minimap is a fixed portal and session-only visualiser. A Window resize
  changes its geometry even though it does not trigger a browser `resize`
  event, so its measurements must observe the relevant container.

## Resize interaction

The first version will provide one bottom-right resize handle. This keeps the
Window's top-left position stable and avoids combining position and size changes
in the initial implementation. Edge and other corner handles can use the same
transaction later.

1. Primary-button pointer down captures the pointer and records the starting
   pointer and size.
2. Pointer movement updates a component-local Solid signal in CSS pixels. It
   does not call repository commands, serialise the tree or create revisions.
3. Pointer up (or a completed lost-capture path) commits one merged
   `metadata.size` change labelled `Resize Window`.
4. Pointer cancel discards the preview and creates no history entry.
5. Undo and redo restore the exact committed sizes.

The handle will be available only in the normal window state. Minimized icons
retain the full-size geometry but do not expose a resizer; maximized windows are
controlled by the available surface and likewise ignore it. The visible corner
can stay small while its hit target is at least 20–24 CSS pixels. It will use an
`nwse-resize` cursor and must not start a Window drag.

The first version should clamp a generic Window to a modest usable minimum
(provisionally 220 x 140 CSS pixels) and keep the active handle reachable within
the Workspace surface. It should not silently rewrite stored size merely
because the browser viewport later becomes smaller. Temporary viewport fitting
belongs to presentation.

Window size belongs to the particular `WindowBlock` occurrence, not to its
Document child. Two windows displaying the same Document may therefore have
different sizes.

## Document width contract

The Document's main text column gets an explicit design token rather than an
accidental minimum inferred from the browser's current layout:

```css
--document-main-min-width: 480px; /* provisional; confirm against typography */
--document-margin-width: clamp(145px, 16cqi, 235px);
--document-minimap-lane-width: 0px; /* 20px plus spacing when active */
```

The final main-column value should be selected after measuring representative
Pages, toolbars and long unbroken content at normal browser zoom. `480px` is a
starting point, not a hidden magic constant. The effective Document Window
minimum is:

```text
main-column minimum
+ Window content padding and borders
+ any always-visible Document chrome
+ the active minimap lane and gap
```

Margin lanes do not contribute to this minimum because they collapse first.
Height has a separate practical minimum sufficient for the Window header,
Document toolbar and a useful scroll viewport; approximately 240px is a sensible
initial value to verify in the browser.

## Container-responsive margins

The responsive boundary must be the Document Window content box, not the global
viewport. The content wrapper will become a named inline-size container (for
example `container-name: document-window`) and Page-specific rules will use
container queries.

The planned presentation has three modes:

- **Full:** normal left and right margin lanes, maniculae and configured minimap
  lane.
- **Compact:** progressively narrower margin lanes and gaps while preserving the
  main column.
- **Collapsed:** margin-note gutters and maniculae no longer consume horizontal
  space. The main column remains at its design minimum; Window resizing stops at
  the effective Document minimum.

Exact query thresholds will be expressed from the shared design tokens and
verified visually rather than duplicating unrelated numbers across selectors.
The existing viewport rules can remain as a fallback for Pages outside a
Window, but they must not override the local container behavior.

`display: none` is preferable to leaving invisible absolute content able to
overflow or receive pointer input. It is only a view rule: margin editors,
relations and text remain mounted in the model and remain in saves, history and
undo.

### Access to collapsed margins

A Document with hidden marginalia will show a compact `Margins` control in its
Document chrome, including a count when it is useful. Activating it exposes the
notes in a temporary overlay/drawer so narrow windows do not permanently give
up main-column width. The control and drawer are session UI state, not Block
payload.

The drawer must preserve left/right identity, relation navigation and editing.
If resizing crosses the collapse threshold while focus is inside a margin
editor, that editor must not vanish underneath the user. The responsive
controller should keep its compact drawer open until focus leaves (preferred),
or deliberately move focus to the related main-text anchor and announce the
change. A CSS-only focus disappearance is not acceptable.

This overlay is deliberately preferred to stacking all margin notes inline,
which would alter Page height, pagination and minimap positions whenever the
Window crossed a width threshold.

## Minimap and lane behavior

The existing visual order remains:

```text
main text -> manicule -> minimap -> margin note
```

on whichever side hosts the minimap. In compact mode, lane offsets derive from
the same custom properties as margin width. In collapsed mode, maniculae and
margin-note lanes collapse; an active minimap remains available and contributes
its 20px width plus gap to the effective Document minimum.

The Page/minimap measurement service must observe the Page, main column or
Window content with `ResizeObserver` (batched to animation frames as needed).
Pointer movement may update canvas geometry, scroll thumb placement and marker
positions, but it must not write to repository state. Left- and right-side
minimap configurations both require browser checks.

## Persistence and history

- The one completed `metadata.size` update is undoable and is already within the
  Window metadata saved by Workspace persistence.
- Document files do not acquire Window geometry. This preserves the separation
  between reusable Document content and its Workspace placement.
- Responsive mode, compact-margin drawer state, minimap state and intermediate
  pointer positions are not serialised and create no dirty state.
- Minimizing and restoring retains the last committed full Window size.
- Saving during an active gesture uses the last committed size; the local
  preview is not canonical state.

## Accessibility and input

- The resize target needs an accessible name such as `Resize <title> window`, a
  visible focus treatment and instructions available to assistive technology.
- A focused handle will support arrow-key resizing. A 10px step is the default;
  a modifier can provide a 1px fine step. Repeated keys should be grouped into
  one logical history operation rather than one undo step per pixel.
- The collapsed-margin control reports `aria-expanded`, the note count and the
  associated drawer. Opening it moves focus predictably; closing returns focus
  to its trigger.
- No size transition is required, which avoids lag during direct manipulation
  and respects reduced-motion expectations.
- Resizing must not consume browser-standard shortcuts or interfere with text
  selection, window dragging, minimap scrolling or margin editing.

## Implementation phases (completed)

### 1. Establish layout tokens and measurements

- Measure the existing default main column, Document chrome and representative
  margin content.
- Set the shared main-column, margin, gap and minimap-lane custom properties.
- Derive generic and Document-specific minimum sizes from those tokens.

### 2. Add the general Window resize transaction

- Extract or share the proven local-preview/pointer-capture behavior used by the
  timer rather than creating a second transaction convention.
- Add the bottom-right handle, clamping and state guards to `WindowView`.
- Commit one merged metadata update on completion and cover cancellation,
  minimization, undo and reload.

### 3. Make Documents container-responsive

- Add the named container at the correct inner wrapper.
- Move Page margin sizing from Workspace-only viewport assumptions to local
  container tokens and queries.
- Implement full, compact and collapsed lane styles.
- Add the count/control and focus-safe compact margin drawer.
- Recalculate minimap geometry from container resize without persistence writes.

### 4. Verify behavior

- Run focused unit/integration tests, typecheck and builds.
- Exercise pointer and keyboard resizing in a real browser at normal and zoomed
  scales.
- Verify Documents with no margins, one side, both sides, long margin notes and
  an editor focused during threshold crossing.
- Verify minimaps on both sides, overlapping markers, thumb scrolling and
  marker navigation throughout resizing.

## Test and acceptance checklist

- Pointer movement changes only local presentation; repository revision and
  dirty state remain unchanged until completion.
- One completed gesture creates exactly one history entry; cancel creates none;
  undo/redo restore exact sizes.
- Workspace save/load retains committed Window sizes, including after a
  minimize/restore cycle.
- Two Window occurrences of one Document retain independent geometry.
- Full and compact margin layouts do not overlap the text or each other.
- The main text column never shrinks below the agreed design minimum.
- Collapsing margins does not delete, mutate or omit their data from Document
  serialization.
- Hidden marginalia is visibly indicated and remains keyboard-accessible through
  the compact drawer.
- Focus is not lost when a threshold is crossed.
- The active minimap remains usable, correctly measured and session-only.
- Existing Page layouts outside Window containers retain an intentional fallback.

## Deferred options

- All edge/corner handles and resizing that also changes Window position.
- Aspect-ratio locking, grid snapping, size presets and double-click autosize.
- Persisted user preferences for always-open margins. Any future preference
  should be a Workspace/view setting, not Document semantic content.
- Separate per-Document repository, dirty and undo scopes; this plan neither
  requires nor precludes that later architecture.

Related work: [MARGIN_HANDLER_MIGRATION.md](MARGIN_HANDLER_MIGRATION.md),
[MINIMAP_MIGRATION.md](MINIMAP_MIGRATION.md), and
[WINDOW_ICON_MINIMIZATION_PLAN.md](WINDOW_ICON_MINIMIZATION_PLAN.md).
