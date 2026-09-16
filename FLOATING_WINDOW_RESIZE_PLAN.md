# Shared resizing for floating tools and dialogs

**Status:** Implemented, 16 September 2026.

The shared controller and accessible handle now back canonical and demo
Document windows, Timer, Annotation Monitor, Find, Entity Listing, Entity
Search, and the opted-in Document/Workspace browsers. Compact confirmations
and the other exclusions below remain intentionally content-sized.

## Outcome

Extend the established Window resize behavior to the new system's substantial
floating tools and browser dialogs through one shared, opt-in Solid primitive.
Each surface keeps its existing ownership and persistence rules. A resize must
never turn transient UI geometry into Document data merely because a canonical
`WindowBlock` stores its own size.

The convention is intentionally selective. A surface qualifies when additional
width or height exposes useful content, it already behaves like a movable or
modal window, and it can provide a stable internal scroll area. Small prompts,
menus and anchored indicators remain content-sized.

## Current audit

| Surface | Current behavior | Decision | Geometry owner |
| --- | --- | --- | --- |
| Canonical `WindowBlock` | Pointer/keyboard resize with one `metadata.size` commit | Keep as reference; migrate to the shared primitive after parity tests | Workspace Window metadata |
| Initial sample Document shell | Pointer/keyboard resize; final DOM size feeds Workspace Save | Keep as reference; share mechanics, not Document state | Demo session, then generated Workspace Window metadata |
| Find window | Draggable, fixed width, content scrolls; size resets to CSS | Add resize | Editor/view session only |
| Entity Listing window | Draggable narrow table with scrollable body; remounts on each open | Add resize | Editor/view session only |
| Timer window | Already pointer-resizable and persisted as `block/size`; handle is pointer-only | Migrate to the convention and add keyboard access | TimerBlock payload, one history entry |
| Annotation Monitor | Already draggable/resizable through direct DOM styles; no keyboard resize or true cancel | Migrate to local Solid preview and the shared handle | Overlay session only |
| Entity Search / candidate review | Large centered, responsive two-column dialog; not draggable or resizable | Add resize after converting centered transform geometry to an explicit rect; make its existing header the drag handle | Overlay session only |
| Open/Save Document browser | Modal, focus trapped, two panes with useful lists | Add through an explicit `DocumentDialog` opt-in | Dialog instance/session only |
| Open/Save Workspace browser | Modal list browser sharing `DocumentDialog` | Add through the same opt-in | Dialog instance/session only |
| Save/discard and other compact confirmations | Small, short-lived, content-sized modal | Do not add resize | None |
| Generic prototype `OverlayView` | Minimal anchored search stub, not a completed window type | Defer until its real replacement has a layout contract | Overlay session only |
| Context/block menus and sticky-tab panels | Pointer-anchored menu/panel semantics | Do not add resize | None |
| Minimap, chord hint and Block-selection inspector | Indicator/navigation/status surfaces rather than windows | Do not add resize | None |

## Why the exclusions matter

A universal CSS `resize: both` rule would be harmful here. It would add handles
to menus and confirmations, bypass the existing pointer transaction and
keyboard behavior, make cancellation inconsistent, and allow internal content
to overflow without component-specific layout rules. Resizing an anchored menu
also changes which item remains next to the invoking control. Compact prompts
gain blank space but no additional capability.

Accordingly, `DocumentDialog` will default to non-resizable. Document and
Workspace browsers opt in explicitly; the compact save/discard prompt continues
unchanged. New surfaces must make the same explicit choice.

## Shared resize primitive

Create a small rendering utility, provisionally
`createFloatingWindowResize`, plus a shared `WindowResizeHandle`. It should own
gesture mechanics but not persistence policy or window markup.

Inputs:

- an accessor for the current element and committed size;
- minimum-size and viewport-bound policies, which may be reactive;
- a local preview setter;
- `onCommit(size)` and optional `onCancel()` adapters;
- an enabled accessor for minimized, maximized or busy-state rules;
- an accessible label and optional dimension announcement.

Outputs:

- the effective preview-or-committed size;
- pointer and keyboard handlers for the shared handle;
- an active-resize signal/class for styling and tests;
- a viewport-fit helper that does not overwrite the preferred size.

The primitive must not know about `ReactiveEditor`, Block payloads, overlays or
dialogs. Those belong to thin adapters at each call site:

- `WindowBlock`: `onCommit` writes one `metadata.size` command;
- TimerBlock: `onCommit` replaces its `block/size` property once;
- floating tools and overlays: `onCommit` updates only their session signal;
- modal browsers: `onCommit` updates only the mounted dialog instance.

This separation prevents accidental history entries for Find or browser UI and
prevents the Timer's persistent size from being demoted to temporary state.

## Gesture and keyboard contract

The shared mechanics follow the completed Window convention:

1. Primary-button pointer down captures the pointer and records the rendered
   start rect.
2. Pointer movement changes only a local Solid preview signal.
3. Pointer up or a completed lost-capture path invokes `onCommit` once, and only
   when the rounded size changed.
4. Pointer cancel restores the committed size and invokes no commit.
5. The top-left corner remains fixed for a bottom-right resize.

The handle has a 24px target even when a compact control, such as Timer, uses a
smaller visible glyph. It receives a clear focus treatment, high-contrast
fallback and `nwse-resize` cursor. It does not begin header dragging.

There is no fully accurate ARIA role for a two-axis corner resizer. The planned
handle therefore remains an explicitly labelled, focusable resize control with
documented keyboard behavior rather than pretending to be a one-dimensional
separator or slider. Arrow keys change one dimension by 10px; Shift uses a 1px
fine step. Repeated keys form one transaction. Enter commits and Escape cancels
an active keyboard preview. A concise live message may announce the resulting
width and height without announcing every pointer move.

## Bounds and viewport changes

All dimensions use CSS pixels and `clientX`/`clientY`, so browser zoom and device
pixel ratio do not alter the model contract. Minimums are surface-specific;
maximums derive from the visual viewport/workspace edge with an 8px reachable
inset.

The controller should retain two concepts:

- **preferred size:** the user's last committed/session size;
- **effective size:** that size temporarily fitted to the current viewport.

If the viewport shrinks, the effective size and position may clamp so the title
bar, close control and resize handle remain reachable. This must not silently
rewrite a persisted Timer or Window size. When space returns, the preferred size
can return. `window.resize` and `visualViewport.resize` both require coverage.

Changing size may require a position adjustment, but only the minimum movement
needed to keep the window reachable. It must not re-anchor Find, the Annotation
Monitor or another manually positioned tool to its original caret/text anchor.

## Surface-specific layout contracts

### Find

- Start at the current width (up to 760px) and rendered content height.
- Provisional minimum: 360 x 150px, reduced only when the viewport is smaller.
- Keep the title bar drag and close behavior unchanged.
- Make `.document-find__content` the sole flexible scroll area.
- Preserve position and preferred size while the layer remains mounted; do not
  serialise them or dirty the Document.
- Re-clamp position after a size commit and on viewport changes.

### Entity Listing

- Provisional minimum: 300 x 200px; initial width remains 360px.
- Allow useful widening for long entity names and vertical growth for the table.
- Keep the three sticky sortable headings and the body as the scroll owner.
- Resizing must not clear hover/focus previews or trigger another Graph request.
- Keep geometry for the active window instance. A later session geometry store
  may preserve it across close/reopen, but no browser or Document persistence is
  needed now.

### Timer

- Retain the existing 110px minimum and container-relative display scaling.
- Replace its 14px pointer-only handle with the common accessible target while
  keeping the visible corner subtle on a 130px control.
- Continue storing final size in its TimerBlock `block/size` property because it
  is part of the reusable control, as previously agreed.
- Ensure pointer down/up without movement creates no history, pointer cancel
  restores exactly, and keyboard repetitions make one `Resize Timer` entry.
- Continue to avoid repository writes from countdown ticks.

### Annotation Monitor

- Preserve its current 320 x 180 minimum and useful 960px initial width.
- Replace direct `root.style` mutation with the shared local preview signal.
- Keep the existing responsive container queries and scrollable inner regions.
- Preserve `manualPosition`: resizing or changing annotations must not snap the
  monitor back to the annotation anchor.
- Size remains overlay-session state and creates no repository history.

### Entity Search and candidate review

- Provisional minimum: 480 x 320px, bounded by the viewport; initial preferred
  width remains 1200px when space permits.
- Replace `left: 50%` plus `translateX(-50%)` with an explicitly calculated
  initial top-left rect. A bottom-right drag cannot behave correctly while CSS
  recentres the left edge for every width change.
- Use the header as a drag handle, excluding its controls, after the explicit
  rect is established.
- Convert the existing 760px viewport-only column change to a container query so
  lookup and candidate columns stack based on the dialog's actual width.
- Preserve modal focus containment in ordinary entity search and the existing
  non-modal candidate-review behavior. Resize keys only act while the handle is
  focused.
- Do not restart searches, clear nominated candidates or change Document
  coverage when geometry changes.

### Document and Workspace browsers

- Add a `resizable`/policy prop to `DocumentDialog`; default it to false.
- Document and Workspace browser callers opt in with their own initial and
  minimum sizes. A reasonable starting point is 560 x 360px for the two-pane
  Document browser and 440 x 300px for the Workspace list, always bounded by the
  available viewport.
- On first move/resize, freeze the centered modal to an explicit top-left rect;
  otherwise a bottom-right gesture would also move the left/top edges as the CSS
  grid recentres it.
- Make the header draggable for opted-in browser dialogs, while keeping the
  backdrop, `aria-modal`, Escape handling, focus trap, busy state and focus
  restoration intact.
- Refactor browser bodies to flex into the chosen height. File/folder lists own
  overflow; headers, errors and action footers remain reachable.
- At narrow mobile widths, fit automatically to the viewport and hide or disable
  the resize affordance when no meaningful resize range remains.
- Compact confirmation dialogs do not opt in and retain their present centered,
  content-sized layout.

## Persistence and lifecycle matrix

| State | Document/Workspace history | Saved data |
| --- | --- | --- |
| Canonical Window preferred size | One entry on completed gesture | Workspace Window metadata |
| Timer preferred size | One entry on completed gesture | TimerBlock payload in its Document |
| Find, Entity Listing, Annotation Monitor, Entity Search size | No entry | Not saved |
| Open/Save browser dialog size | No entry | Not saved |
| Pointer/keyboard preview | No entry | Never saved |
| Viewport-effective clamp | No entry | Never saved |

Session tools close with their current behavior and focus return contract. The
initial implementation will not add `localStorage`; that would turn an ergonomic
default into a durable preference without an established settings model.

## Implementation sequence

### 1. Extract and prove shared mechanics

- Build the controller and shared handle from the canonical Window behavior.
- Add primitive tests for pointer preview, one commit, unchanged gesture,
  cancellation, lost capture, keyboard grouping, viewport fit and cleanup.
- Migrate canonical Window resizing first and require its existing tests and real
  browser check to remain unchanged.

### 2. Normalize existing resizers

- Migrate Timer and Annotation Monitor.
- Preserve Timer payload/history semantics and Monitor session-only semantics.
- Add keyboard, cancellation and focus tests before changing any other surface.

### 3. Add non-modal tool windows

- Add the shared controller to Find and Entity Listing.
- Make content regions flex/scroll correctly at minimum and maximum dimensions.
- Verify search results, minimap markers, entity previews and API requests remain
  independent of resize signals.

### 4. Add the large Entity Search overlay

- Establish explicit initial geometry and header drag.
- Add its responsive container and resize policy.
- Verify both modal search and non-modal candidate-review modes, including focus
  containment and close restoration.

### 5. Opt browser dialogs in

- Extend `DocumentDialog` without changing its default behavior.
- Opt in DocumentBrowser and WorkspaceBrowser only.
- Convert fixed pane heights to flexible inner scrolling and verify busy/error/
  overwrite states at several sizes.

### 6. Browser and regression pass

- Exercise mouse, touch-style pointer capture and keyboard resize at 100% and
  zoomed scales.
- Test narrow and changing visual viewports, long filenames/entity names, large
  result sets and simultaneous non-modal tools.
- Run focused tests, typecheck, both builds and the complete suite.

## Acceptance criteria

- Every opted-in surface uses the same target, cursor, focus treatment,
  pointer-capture lifecycle and keyboard rules.
- Pointer previews and all session-only resizes cause no repository revision,
  dirty state or saved-data change.
- Canonical Window and Timer gestures each create exactly one appropriate
  history entry; cancel and no-move gestures create none.
- Internal scroll owners keep title bars, close controls and action footers
  visible at minimum size.
- Resize never restarts Find/entity searches, clears highlights/previews, changes
  active rows, or loses form input.
- Modal browser focus traps and focus restoration remain intact; compact prompts
  are visually and behaviorally unchanged.
- All windows remain reachable after resize, browser zoom and viewport shrink.
- Multiple simultaneous overlays keep independent geometry and z-order.
- Context menus, anchored panels, minimap, chord hint and selection inspector do
  not acquire resize affordances.

## Stop conditions

Implementation should stop for a surface, while allowing the other independent
surfaces to proceed, if any of these cannot be resolved without broadening the
task:

- resizing requires persisting transient geometry in Document content;
- the surface cannot retain its header/actions inside a stable scroll layout;
- a modal loses its focus trap, Escape behavior or return focus;
- moving a mounted editor between layouts duplicates its occurrence or loses
  selection;
- the shared primitive makes canonical Window/Timer undo behavior less precise;
- an anchored menu or indicator would need to change semantic role merely to
  support resizing.

## Deferred

- Edge and all-corner resizing, aspect ratio locks, grid snapping and size
  presets.
- Durable user preferences or cross-session geometry for transient tools.
- Resizing legacy components under `src/components` or `src/library/original`;
  this plan applies to the new reactive rendering/demo system.
- A universal Window-frame component. Shared gesture mechanics are useful now,
  but forcing every surface into identical markup would risk their distinct
  focus, scrolling and persistence contracts.

Related reference: [WINDOW_RESIZE_PLAN.md](WINDOW_RESIZE_PLAN.md).
