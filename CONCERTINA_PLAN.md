# Concertina search presentation

**Status:** Approved, 16 September 2026. No runtime implementation is included
in this planning change.

The proposed behavior and architecture have been accepted. In particular,
matching excerpts should show approximately **48px of visual context before
and after the active match** by default. This is a layout target rather than a
text-character count, so it remains meaningful across fonts, wrapping, zoom,
and different Block widths.

## Purpose

Concertina mode is a temporary way to read a set of text or entity matches in
context. While it is active:

- Blocks outside the matching branches are hidden;
- short matching Blocks keep their natural layout;
- tall matching Blocks become compact, internally scrollable excerpts with
  context around the relevant match;
- navigating to another match reveals the correct tab/branch and scrolls the
  relevant excerpt; and
- turning the mode off restores the exact ordinary view without changing the
  Document, undo history, dirty state, or saved data.

This is a presentation mode, not a Block property. It is owned by the active
Find or Entity Listing session and must never be serialised.

The wording “below a certain height a Block is left alone” is taken as the
intended threshold rule: a naturally short Block remains unchanged, while a
taller Block is clipped around its matches.

## What the original implementation does

The most complete version is
[`src/library/original/components/entity-highlighter.js`](src/library/original/components/entity-highlighter.js),
with an older near-duplicate in
[`src/library/original/components/text-references.js`](src/library/original/components/text-references.js).
The unfinished text-search shell in
[`src/library/original/bindings/text-window.js`](src/library/original/bindings/text-window.js)
declares a concertina toggle but never implements it.

The entity implementation performs these steps:

1. Find every editor text container and every entity property for the selected
   entity.
2. Resolve each property to its containing text Block.
3. Reset all containers to `display: block`, `height: auto`, and no maximum
   height, removing any previous concertina class and local minimap.
4. Hide every container without a matching entity property using
   `display: none`.
5. Add `concertina-block` to matching containers and highlight their matching
   properties.
6. Derive a compact height from the first and last matching line, subject to a
   minimum of roughly 75–100px and a maximum of 200px. One-line Blocks may use
   50px, and naturally tiny Blocks are allowed a little extra height.
7. Scroll each compact Block to approximately 25px before its first match.
8. Hide the document-level minimap/circles and create a small minimap for each
   compact Block.
9. On a second toggle, restore all Block display and height styles, remove the
   local minimaps, restore the global markers/circles, and recalculate offsets.

The original `hideSurroundingLines` option is misleading. Its code for adding a
`hide-cell` class to non-context lines is commented out. The stable behavior is
therefore a short scroll viewport over the real Block, not a DOM containing
disjoint line excerpts.

### Useful ideas to preserve

- Only matching Blocks occupy space in the outer document flow.
- A matching Block remains the real editor rather than a copied snippet.
- Short matching Blocks are not needlessly changed.
- A tall matching Block retains context before and after a match.
- Toggling back is immediate and leaves content untouched.
- Marker navigation remains available when a match is outside a clipped
  Block's current internal viewport.

### Problems not to copy

- The same `selected` flag controls both highlighting and concertina state.
- Geometry and authored styles are overwritten directly with no restoration
  ledger.
- Repeated toggles scan and rewrite every container and can force layout several
  times.
- Recursively switching from one entity to another briefly tears down and
  rebuilds both modes.
- The first match controls scroll even when another match is active.
- A 200px cap can hide widely separated matches without making navigation
  state explicit.
- Direct Cell hiding would change contenteditable wrapping, caret movement,
  range geometry, and annotation rendering.
- The behavior has no contract for tabs, Pages, transclusions, tables, margins,
  focus, or repository changes.

## Recommended user contract

### Activation

- Find gains a labelled **Concertina** toggle with `aria-pressed`. It applies to
  the current completed result set and current scope.
- Entity Listing gains an explicit **Focus occurrences** action for a row. It
  applies to that entity's standoff ranges. Hover remains only a temporary
  yellow preview and must not unexpectedly rearrange the Page.
- Only one concertina presentation is active in an editor view at once.
  Activating one owner replaces the other atomically; it does not recursively
  toggle the old owner off and the new owner on.
- Closing its owning window turns concertina off. Minimising the containing
  Document Window also clears it, matching the existing cleanup of Find and
  Entity Listing overlays.
- Highlight visibility remains an independent choice. Concertina uses the
  result ranges even if the user has hidden yellow highlights, although the UI
  should make the active layout mode conspicuous.

### Scope

- Use the existing `SearchScope` and occurrence `nodeKey`s. Do not infer
  matches from text or query the DOM again.
- Concertina affects only the owning Document/view and its chosen scope.
- Document and Window shells remain visible. Within the scope, maximal
  unmatched Block branches are hidden. Ancestors required to reach a matching
  Block remain present.
- Relations excluded by a `main` search scope—normally margins and sticky-tab
  content—remain untouched rather than being hidden as false non-matches.
- Inactive tab content remains unmounted, consistent with the current system.
  When Next/Previous reveals a match in another tab, the concertina projection
  is reapplied to that newly mounted branch. It does not attempt to show several
  mutually exclusive tab panels simultaneously.
- Occurrences are view-specific. A transcluded Block is hidden or clipped by
  occurrence key, not by canonical content key.

### Focus and editing

- Activation starts from the Find or Entity Listing control, so focus remains
  in that tool rather than being stranded in a Block that becomes hidden.
- A hidden Block must be removed from keyboard navigation and accessibility via
  the native `hidden` attribute, not only visual opacity or zero height.
- `adjacentEditable`, focus fallbacks, Block selection, and cross-Block
  navigation must skip session-hidden occurrences while concertina is active.
- Clicking a matching excerpt continues to edit the real Block. Caret movement
  may scroll its internal viewport normally.
- Block-wide destructive commands should either operate only on an explicitly
  selected visible Block or first leave concertina mode. They must never act on
  a hidden stale selection merely because that selection predates activation.
- Escape should continue to close the owning Find/Entity window according to
  its existing contract, which also restores the ordinary document layout.

## Session model

Add a small `ConcertinaService` to `ReactiveEditor`, parallel to session
decorations and minimap state. It owns no repository references beyond stable
keys and performs no commands.

Provisional public model:

```ts
interface ConcertinaOptions {
  naturalHeightThreshold: number; // initial default: 260
  excerptHeight: number;          // initial default: 200
  minimumExcerptHeight: number;   // initial default: 120
  maximumExcerptHeight: number;   // initial default: 240
  contextBefore: number;          // agreed default: 48 CSS px
  contextAfter: number;           // agreed default: 48 CSS px
}

interface ConcertinaRequest {
  owner: string;
  viewId: string;
  scope: SearchScope;
  matches: readonly {
    id: string;
    ranges: readonly SearchRange[];
  }[];
  activeMatchId?: string;
}

interface ConcertinaNodePresentation {
  hidden: boolean;
  matched: boolean;
  clipped: boolean;
  height?: number;
  scrollTarget?: { start: number; end: number };
}
```

Expected operations:

```ts
activate(request)
update(request)
setActiveMatch(matchId)
presentation(nodeKey)
deactivate(owner)
clearAll()
```

The state should expose a small Solid revision/store so controls, views, the
minimap, and tests can react without putting geometry into the Block tree.

## Deriving hidden branches

Build a parent/child index once for the relevant projection and derive a set of
protected keys:

1. Add every matching occurrence key.
2. Add every ancestor from that occurrence to the scope root.
3. Preserve required structural shells such as the Document, current Page, and
   Document Window.
4. Walk downward from the scope root. If a subtree contains no protected key
   and is an eligible flow branch, record only its highest eligible root as
   hidden; do not also enumerate all descendants.

This keeps the application cost proportional to the changed branch roots
rather than to every Cell or every descendant of an already hidden Block.

Structural policies need explicit adapters:

| Structure | Initial policy |
| --- | --- |
| Text/standoff Block | Hide when unmatched; clip when matched and tall |
| Ordinary container/list item | Hide the highest unmatched branch; preserve matching ancestors |
| Page/Document/Window | Preserve the shell; hide unmatched descendants |
| Table | Preserve the table structure; hide unmatched rows where safe, not arbitrary individual cells |
| Tabs/surfaces | Preserve the active structural control; apply to its mounted panel and reapply after reveal |
| Left/right margins | Leave untouched unless explicitly included by the search scope |
| Floating Timer/tools/overlays | Never part of the concertina tree |
| Unknown/custom Block | Preserve unless its registered adapter declares it safely hideable |

Being conservative for unknown layouts is preferable to corrupting table,
grid, or positioned-Block geometry.

## Mount and rendering integration

Avoid making every view component understand Find or entity state. Extend the
mount contract with an optional temporary-layout adapter, or add a companion
registry keyed by occurrence:

```ts
interface TemporaryLayoutAdapter {
  root: HTMLElement;
  viewport?: HTMLElement; // standoff surface or native textarea
  measureRange?(range: SearchRange): DOMRect[];
  safelyHide: boolean;
  safelyClip: boolean;
}
```

- Generic Block roots can advertise `safelyHide`.
- `StandoffEditorView` exposes its surface/flow and existing `inlineBoundary`
  geometry as a clipping adapter.
- `PlainTextBlockView` exposes its textarea; native selection already scrolls a
  selected range into view, although exact line rectangles are browser-limited.
- Table rows and other special structures provide their own policies rather
  than inheriting a universal wrapper element. Adding a wrapper in
  `BlockOutlet` would break table and grid display semantics and is not
  recommended.
- A mount subscription applies current presentation immediately when a tab or
  transcluded occurrence mounts.

Application should be a two-phase animation-frame job:

1. **Read phase:** temporarily clear old concertina classes on touched matched
   viewports, read natural heights and range rectangles, and compute excerpts.
2. **Write phase:** batch `hidden`, classes, CSS variables, height, overflow,
   and scroll positions.

Do not interleave geometry reads and style writes per Block. That would cause
layout thrashing on large result sets.

Track every touched element and its prior session attributes. Deactivation
visits only that ledger, removes concertina-owned classes/CSS variables, clears
`hidden` only where this service set it, restores internal scroll positions,
and releases observers. It must not reset authored inline height, overflow, or
display values.

## Matching Block height algorithm

For each mounted matching Block:

1. Measure its natural viewport height after ordinary layout is restored.
2. If the height is at or below `naturalHeightThreshold` (initially 260px), leave
   it entirely alone.
3. Measure the visual fragments for all current matching ranges in that Block.
4. Select the active match when present; otherwise use the first match in
   document order.
5. Compute an excerpt window with the agreed default of approximately 48px of
   visual context before and after the selected match. Clamp the result to
   120–240px, with 200px as the normal target. The context measurement is in
   rendered CSS pixels, not characters or source offsets.
6. If every match plus its surrounding context fits within 240px, position the
   viewport so all of them are visible.
7. If the first-to-last match span is larger, keep a 200–240px internal scroll
   viewport and centre the active match. Next/Previous and minimap activation
   scroll this viewport to the newly active match.

Use `overflow: auto` on the dedicated editor viewport, not `overflow: hidden`
on a root that also contains child Blocks or controls. Add subtle top/bottom
fade or continuation indicators when content exists outside the excerpt, and a
status/label such as “Collapsed match context; scroll for more text.”

This reproduces the reliable part of the original behavior: the long Block
occupies little outer-document space, but its real content remains intact and
scrollable.

### Why not hide individual Cells or lines initially

Hiding non-context Cells would reflow the remaining text, invalidate measured
annotation fragments, change contenteditable arrow behavior, and make a range
appear contiguous when it is not. CSS line boxes also have no stable model
identity. The original code attempting this was commented out.

If a later requirement demands several simultaneously visible, disjoint
snippets from one very long Block, implement a separate read-only excerpt view
with explicit omission separators and commands to open the real editor. Do not
simulate that by deleting or `display:none`-ing Cells inside the live editor.

## Find integration

`DocumentFind` already owns immutable match sets, active match identity,
decorations, reveal behavior, and minimap markers. It should be the sole source
for text concertina ranges.

- Store `concertinaRequested` separately from whether a valid presentation is
  currently applied.
- When the query/options/scope changes, immediately remove the old presentation
  so stale results cannot hide current content.
- If the toggle remains requested, reapply when the next complete or partial
  result arrives. An empty/error/cancelled result shows the ordinary layout.
- `activate()`/`navigateTo()` updates the concertina active match after
  `revealMatch` has mounted the required tab. The service then scrolls the
  matching Block's internal viewport; the outer Page only scrolls enough to
  show that Block.
- Closing Find deactivates its concertina owner before restoring focus.
- Repository edits already schedule a new search. Concertina follows the same
  invalidation boundary rather than retaining stale ranges.

## Entity Listing integration

`DocumentEntityList` already supplies standoff-derived `SearchRange`s for each
entity row, so it requires no text matching or API change.

- Add distinct `concertinaEntityId`/requested state; do not reuse `active`,
  because `active` currently represents hover/focus preview.
- An explicit row action activates or replaces the concertina request using
  that row's ranges.
- Keep the yellow decoration owner attached for the chosen entity while the
  presentation is active. Ordinary row hover must not replace the chosen
  concertina layout.
- Live standoff-property changes rebuild the row inventory. Reapply from the
  refreshed ranges if the entity still exists; otherwise deactivate and report
  that it no longer occurs.
- Graph mention counts remain irrelevant to layout. Only live Document ranges
  determine matching Blocks.
- Closing Entity Listing clears its concertina presentation and decorations.

## Navigation and minimap behavior

The Page minimap currently measures live DOM geometry. Hidden surrounding
Blocks and internally scrolled match ranges make those measurements represent
the compact presentation rather than the original document. Offscreen ranges
inside a clipped Block may also produce misleading geometry.

For the initial implementation:

- keep the existing match layer but switch its markers to a
  concertina-aware logical order/ratio while concertina is active;
- map markers to visible matching Blocks and their ordered ranges, not to
  hidden original Page offsets;
- clicking a marker activates the match, reveals its tab/branch, and scrolls
  both the outer Page and the Block's internal viewport; and
- redraw after the batched layout application.

This retains the useful global navigator without creating one minimap instance
per Block as the original code did. If logical marker mapping proves confusing,
the safe fallback is to hide the Page minimap during concertina mode and expose
Next/Previous controls; silently drawing incorrect physical positions is not
acceptable.

## Scroll and restoration

Collapsing surrounding Blocks changes the Page height dramatically. Before
activation, record:

- the outer scroll owner and an anchor occurrence nearest its visible top;
- the anchor's offset from the scrollport top;
- each matched viewport's existing `scrollTop`; and
- the current focus/selection only if focus is within the affected tree.

On deactivation, restore normal layout first, then restore the outer anchor and
offset in the next animation frame. An anchor is more stable than restoring a
raw `scrollTop` after content height changes. Restore internal scroll positions
only to viewports that still exist. Do not steal focus from the Find/Entity
window merely to restore scrolling.

## Efficiency strategy

- Compute from existing result ranges; never re-search text on a toggle.
- Maintain one exclusive active presentation and a diff of hidden, matched, and
  clipped occurrence keys.
- Hide maximal unmatched branches rather than every descendant.
- Keep hidden Blocks mounted. Toggling `hidden` is cheaper and preserves mount
  identity, editor selection state, and transclusion registrations.
- Measure only matching Blocks above the natural-height threshold.
- Use one read frame and one write frame, with a generation token so a stale
  query or rapid off/on toggle cannot apply late geometry.
- Observe only active matched viewports for resize/font changes. Coalesce
  observer callbacks into one frame.
- Deactivation walks the touched-element ledger, not the whole Document.
- Do not call repository commands, encode the Document, or rebuild projections.

Activation still has an unavoidable cost proportional to the visible scope,
because the system must determine which branches contain no match. Subsequent
active-match navigation and on/off restoration should be proportional to the
changed/touched Blocks.

## CSS and visual treatment

Provisional classes and variables:

```css
[data-concertina-hidden] { display: none !important; }
.reactive-concertina-match { /* restrained match-Block outline */ }
.reactive-concertina-viewport {
  max-height: var(--concertina-height);
  overflow: auto;
  overscroll-behavior: contain;
}
```

Prefer setting the native `hidden` property for semantics and using a data
attribute for diagnostics/tests. The viewport class belongs on the standoff
surface or textarea, not indiscriminately on every Block root.

Avoid height transitions for the first implementation. Animating many Blocks
from natural height to zero repeatedly triggers layout and can be unpleasant
with reduced-motion preferences. A brief opacity treatment can be considered
later, guarded by `prefers-reduced-motion`.

## Failure and cleanup rules

- If no valid matches remain, restore the normal view and keep the toggle in a
  clearly inactive/empty state.
- If a matched custom Block cannot supply safe clipping geometry, leave that
  Block at natural height while still hiding safe unmatched siblings.
- If the projection or scope root disappears, deactivate immediately.
- If applying the mode would hide the current tool owner or Document shell,
  reject that candidate from the hidden set.
- `ReactiveEditor.dispose()`, Workspace replacement, Document close/minimise,
  and owner-window close must all call `concertina.clearAll()`.
- A thrown measurement error must fail open: ordinary visible content is safer
  than a partially hidden Document.

## Implementation sequence

### 1. Pure derivation service

- Add `ConcertinaService` and tests for protected ancestors, maximal unmatched
  branches, scope exclusions, tables/tabs, transcluded occurrence keys, owner
  replacement, and zero-match cleanup.
- Prove that activation/deactivation does not change repository revision,
  snapshots, persistence dirty state, or encoded output.

### 2. Mount adapters and restoration ledger

- Add safe hide/clip capabilities without changing `BlockOutlet` structure.
- Implement batched read/write application, mount-late application, exact
  cleanup, generation cancellation, and scroll anchoring.
- Make editor focus/navigation skip session-hidden mounts.

### 3. Standoff matching Blocks

- Implement the height threshold and active-range context algorithm on the
  standoff surface.
- Ensure annotation, selection, entity-preview, and search SVG layers remeasure
  after internal scrolling.
- Verify caret editing and range coordinates inside the clipped viewport.

### 4. Find integration

- Add the accessible toggle and requested/applied states.
- Reapply only after current search results arrive.
- Coordinate Next/Previous, hidden-tab reveal, active decorations, Page scroll,
  and internal Block scroll.

### 5. Entity Listing integration

- Add an explicit per-row or selected-row Focus action.
- Keep hover preview separate from the chosen concertina entity.
- Refresh or clear the layout after live annotation edits without another Graph
  request.

### 6. Plain text and special structures

- Add the native textarea adapter and test browser scrolling behavior.
- Opt safe list/table/container structures in individually. Unknown or unsafe
  custom layouts remain visible until they have an adapter.

### 7. Minimap and browser verification

- Add concertina-aware logical markers or use the explicit safe fallback.
- Exercise long single-match Blocks, widely separated matches, many short
  Blocks, tabs, margins, tables, transclusions, zoom, resize, fonts, and rapid
  toggles in a real browser.

## Acceptance criteria

- Toggle on/off never creates repository history, dirty state, or saved fields.
- All safe unmatched branches in scope disappear from visual layout, tab order,
  pointer hit testing, and the accessibility tree.
- Matching ancestors remain valid; Document/Page/Window controls do not vanish.
- Matching Blocks no taller than the threshold keep their natural height and
  scroll position.
- Tall matching Blocks show useful context and scroll to the active match; a
  match is never hidden with no navigation path.
- Next/Previous and marker activation work across clipped Blocks and mounted tab
  changes.
- Annotation/search geometry remains aligned after clipping and internal scroll.
- Turning the mode off restores classes, visibility, dimensions, outer scroll,
  internal scroll, and ordinary focus navigation.
- Rapid owner switches and query changes cannot apply stale geometry.
- Multiple projections/transclusions are affected only by the requested
  occurrence scope.
- Unsupported custom structures fail open and remain readable.

## Deferred

- Persisted per-user concertina preferences.
- Animated accordion transitions.
- True disjoint, read-only excerpt rendering with omission separators.
- Applying concertina to arbitrary annotation types without a supplying result
  set.
- Simultaneous intersecting concertina owners in one view.
