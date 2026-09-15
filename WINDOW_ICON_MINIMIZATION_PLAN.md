# Window-to-icon minimization plan

Status: implemented on 15 September 2026.

## Implementation checkpoint

`src/rendering/window-icon.tsx` now supplies the shared, code-native semantic
icon view and normalizes window state, including the legacy `maximised` spelling.
The registered `WindowView` derives minimized state directly from reactive Block
metadata and retains one stable mounted window root while switching its children
between the full window and icon presentations. The Workspace demo uses the same
icon component and interaction rather than its former compressed title bar.

The document/page and generic-window glyphs are resolved from semantic keys.
Minimize, restore and completed icon drags are canonical, undoable metadata
operations; pointer movement remains a local preview. The window's full size is
never replaced by the 96 × 92 px icon dimensions. Child views unmount while
minimized, and document-scoped Find, entity-list and owned overlay sessions close
before their DOM anchors disappear. Focus and native or standoff selections are
captured before pointer focus reaches the minimize control and restored after the
child mounts again.

Focused tests cover identity and child preservation, exact selection restoration,
session cleanup, history synchronization, semantic icon overrides, legacy state
normalization, save/reload and demo parity. The repeatable real-Chrome check in
`scripts/check-window-icon.mjs` covers rendered dimensions, pointer drag, click
suppression, restoration geometry, exact selection and undo/redo.

## Outcome

Pressing the minimize control on a `window-block` or
`document-window-block` replaces the full window presentation with a compact,
draggable icon presentation. A minimized document window initially uses a
document/page glyph and its title. Activating the icon restores the full window.

This is a view transition, not a Block-type conversion. The canonical Block
remains the same window occurrence with the same key, children, relations and
payload throughout minimization and restoration.

## Decision record

Do not replace a WindowBlock with an `icon-block`. A literal conversion would
need to preserve the original Block type and capabilities, move or hide its
children, reconstruct the window on restoration and make the whole structural
operation undoable. It would also make transclusion, selection, focus and child
identity more fragile without improving the minimized presentation.

Instead, `WindowView` selects between two presentations of one Block:

- the existing full window presentation when the state is `normal`; and
- a `WindowIcon` presentation when the state is `minimized`.

An independent `icon-block` may still be useful later for desktop shortcuts,
links or files that are icons in their own right. That is a separate concept from
a window temporarily presenting itself as an icon.

## Existing implementation findings

The reactive `WindowView` in `src/rendering/core-block-views.tsx` already stores
window title, position, size, z-index and state in metadata. Its minimize button
currently commits `metadata.state` and hides the content, leaving a short title
bar. This supplies most of the required persistence and undo infrastructure.

The current view also holds a separate component-local `minimized` signal. That
duplicates `metadata.state` and can diverge after undo, redo or an external
metadata update. The implementation should remove that duplication and derive
the presentation directly from reactive Block metadata. Gesture preview state
may remain local, but the settled window state must have one source of truth.

`src/library/draggable-window.ts` contains an older precedent that hides a window
and appends a separate minimized icon directly to `document.body`. Its visual
idea is useful, but its imperative DOM ownership, live event listeners and
out-of-tree icon should not be carried into the Solid implementation.

The Workspace demo has a second local window implementation in
`src/demo/workspace-demo.tsx`. It currently minimizes to a header strip. Once the
core behavior is complete, the demo should use the same presentation rules—or a
shared minimized-icon component—so the demonstration and registered Block view
do not teach different interactions.

## Metadata contract

The window continues to own its state and restoration geometry:

```ts
interface WindowMetadata {
  title: string;
  position: { x: number; y: number };
  size: { w: number; h: number };
  state: "normal" | "minimized" | "maximized";
  zIndex: number;
  icon?: {
    kind: WindowIconKind;
  };
}
```

For compatibility, deserialization should accept the existing legacy spelling
`maximised` until stored documents have been migrated. Maximize behavior itself
is not part of this increment.

`position` and `size` remain the full window's restoration geometry. The icon is
rendered at `position`; dragging the icon updates that same position, so restoring
opens the window where the icon was moved. The full window dimensions are never
overwritten with icon dimensions. A separate `iconPosition` should only be added
later if product behavior requires the icon and restored window to occupy
different locations.

The optional icon metadata stores a semantic key, never JSX, a component
constructor, SVG markup or a URL. The first resolver rules are:

```ts
type WindowIconKind = "document" | "window";

defaultIcon("document-window-block") === "document";
defaultIcon("window-block") === "window";
```

The first implementation only needs the `document` rendering. The semantic
resolver lets later window types select icons without changing the window state
machine or persisted schema. An explicit metadata value is necessary only when
overriding the default derived from the Block type.

## Presentation and interaction

The minimized presentation should be approximately desktop-icon sized rather
than a compressed window. It consists of a document/page glyph and a short,
wrapping or ellipsized title. Its outer element remains associated with the same
Block occurrence and participates in the existing window z-order.

Confirmed interaction rules:

- The window's minimize button performs one undoable metadata update from
  `normal` to `minimized`.
- A single click on the minimized icon restores it. This is faster and more
  accessible than requiring the desktop convention of a double-click.
- The icon is keyboard operable as a button; Enter and Space restore it, and its
  accessible name is `Restore <window title>`.
- The icon is draggable through the same pointer model as the window. Pointer
  movement is preview-only; one position update is committed when the gesture
  ends, rather than creating history entries for every pixel.
- Dragging is clamped sufficiently to keep the icon reachable after window or
  viewport resizing.
- Restoring changes only `metadata.state` back to `normal`; the existing title,
  children, size, position, appearance and z-index are reused.
- The existing close behavior remains available on the full window. A close
  badge on the minimized icon is not required initially; the standard Block
  context menu can provide removal if needed.

The icon should use the installed icon system or a small code-native SVG. A
bitmap asset is unnecessary for a simple document/page glyph, and no graphic
content should be embedded in document JSON.

## Child views and transient state

The full child subtree should remain in the Block model but may be unmounted from
the DOM while the window is minimized, matching the current Solid `Show`
behavior. This keeps a minimized document lightweight and prevents hidden editors
from participating in layout or focus navigation.

Unmounting has deliberate consequences that must be handled:

- mounted editor handles and Page minimaps disappear while the document is
  minimized and are recreated when it is restored;
- session overlays tied to mounted child DOM must hide, close or safely wait for
  remounting;
- focus and inline selection should be captured before minimizing and restored
  when practical after remounting; and
- component-local controls reconstruct from their canonical payload. For
  example, a running TimerBlock uses its stored deadline rather than depending on
  its unmounted interval.

No child Block is deleted or rewritten by minimization. Unsaved document edits
remain in the repository even though their views are temporarily absent.

## Persistence and history

Window state is workspace/document presentation state and remains in Block
metadata, consistent with the existing persisted window position and size.
Therefore:

- saving while minimized reopens that window as an icon;
- restoring and saving reopens it as a normal window;
- minimize and restore are individually undoable and redoable;
- icon dragging is one undoable position change at pointer release;
- rendering, hover, focus and drag-preview signals are not persisted; and
- no Node.js, API or SurrealDB changes are required.

If window layout is later separated from document content into a dedicated
workspace store, state, position, size and icon overrides can move together. The
view contract does not depend on which repository owns that metadata.

## Implemented sequence

1. [x] Define a small typed window metadata/state helper that normalizes defaults and
   reads legacy `maximised` safely.
2. [x] Make reactive metadata the only settled source for minimized state; remove the
   independent initialized-once signal from `WindowView`.
3. [x] Add a code-native `WindowIcon` and semantic icon resolver, starting with
   the document/page glyph.
4. [x] Branch `WindowView` between icon and full presentations while preserving its
   root Block identity, appearance and z-index.
5. [x] Reuse or extract the current drag logic so normal-window and minimized-icon
   gestures preview locally and commit once on release.
6. [x] Align the Workspace demo with the same icon presentation and interaction.
7. [x] Add focused persistence, history, focus and browser interaction tests.

## Verification contract

- Minimizing a document window renders a document/page glyph and removes the
  child document from active layout and focus traversal without changing it.
- One click and keyboard activation restore the original window at its retained
  position and full size.
- Moving the icon changes the eventual restored window position but not its
  stored dimensions.
- Undo and redo synchronize the presentation because it is derived from
  metadata, including after save/reload.
- Repeated minimize/restore cycles preserve Block keys, child keys, annotations,
  relations and document text exactly.
- Focus does not remain trapped in an unmounted descendant and is restored where
  possible when the window returns.
- Minimap, Find and other mount-dependent session controls do not leave orphaned
  DOM or listeners while the document is minimized.
- Pointer moves do not create repository writes; the completed gesture creates
  one history entry.
- Narrow viewport and real-browser tests confirm that the icon remains reachable
  and does not inherit the full window's width or height.

## Planning estimate

A basic document glyph, restoration, persistence and focused tests should take
approximately three to five hours. Including polished icon dragging, responsive
bounds, focus restoration, undo/redo coverage and demo consistency is roughly
one working day. A general desktop/dock system or independently creatable
IconBlock is intentionally outside this estimate and would likely add at least
another day.
