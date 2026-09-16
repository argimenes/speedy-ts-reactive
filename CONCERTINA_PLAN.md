# Concertina search presentation

**Status:** Initial current-Page implementation, 16 September 2026. This document
retains the longer-term design as well as the shipped first-pass boundary.

The current implementation adds a session-only `ConcertinaService`, reusable
position markers and settings, pure structural derivation, DOM clipping for tall
standoff editors, and explicit controls in Find and Entity Listing. It acts on
the **current Page only**, even when Find has a wider result scope or Entity
Listing displays Document-wide counts. Markers on other Pages are excluded;
opening another Page through Find navigation ends the current concertina mode.
The chosen Page is captured from the invoking Block/focus, with a visible-Page
fallback for Document-level controls. No Document or Workspace field is saved.

The service request already carries an explicit `SearchScope` root, so a later
Page/Document boundary selector can be added without changing marker producers.
Document-wide mode is intentionally deferred until cross-Page navigation,
visibility, and large-Document performance have been checked.

The settings contract is available now. Context, height, nearby-match merge,
scroll-margin, and `continuationFadePx` values affect standoff excerpts. The
fade adds a non-interactive gradient at the top of a clipped excerpt and is
removed with the session. `visibleBlockGapPx` remains reserved for safe
renderer-specific spacing. Native-text clipping, custom Block
adapters, and real-browser geometry checks remain follow-up work. Unsupported
viewports stay at natural height rather than risking obscured editable content.

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
- In the current UI, concertina affects only the current Page in the owning
  Document/view. Find may search more widely, but only on-Page results drive
  the layout. The service itself accepts an explicit scope for future modes.
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

## Settings object

The operation that applies concertina layout must accept one settings object.
Callers should not pass a growing list of positional measurements, and Find and
Entity Listing should use the same defaults unless they have a demonstrated
reason to override one value.

Provisional public contract:

```ts
export interface ConcertinaSettings {
  naturalHeightThresholdPx: number;
  preferredExcerptHeightPx: number;
  minimumExcerptHeightPx: number;
  maximumExcerptHeightPx: number;
  contextBeforePx: number;
  contextAfterPx: number;
  nearbyMatchMergeGapPx: number;
  visibleBlockGapPx: number;
  activeMatchScrollMarginPx: number;
  continuationFadePx: number;
}

export const DEFAULT_CONCERTINA_SETTINGS: Readonly<ConcertinaSettings> =
  Object.freeze({
    naturalHeightThresholdPx: 260,
    preferredExcerptHeightPx: 200,
    minimumExcerptHeightPx: 120,
    maximumExcerptHeightPx: 240,
    contextBeforePx: 48,
    contextAfterPx: 48,
    nearbyMatchMergeGapPx: 24,
    visibleBlockGapPx: 12,
    activeMatchScrollMarginPx: 8,
    continuationFadePx: 18,
  });
```

The application entry point accepts a partial override and resolves it once per
request:

```ts
function applyConcertina(
  request: ConcertinaRequest,
  settings: Partial<ConcertinaSettings> = {},
): ConcertinaApplication {
  const resolved = resolveConcertinaSettings(settings);
  // Derive and apply session-only presentation.
}

editor.concertina.activate(request, {
  contextBeforePx: 48,
  contextAfterPx: 48,
});
```

`ConcertinaService.activate()` may be the eventual public entry point rather
than exporting `applyConcertina` directly, but it should retain this two-input
shape: a result/scope request and a settings object.

### Setting semantics

| Setting | Meaning |
| --- | --- |
| `naturalHeightThresholdPx` | A matching Block at or below this natural rendered height is left unchanged. |
| `preferredExcerptHeightPx` | Normal target height for a tall matching Block's viewport. |
| `minimumExcerptHeightPx` | Smallest allowed excerpt when viewport space permits. |
| `maximumExcerptHeightPx` | Largest concertina excerpt before internal scrolling is preferred. |
| `contextBeforePx` | Agreed visual context above/before the active match. |
| `contextAfterPx` | Agreed visual context below/after the active match. |
| `nearbyMatchMergeGapPx` | If two match/context rectangles are separated by no more than this gap, treat them as one visual cluster. This does not hide Cells between them. |
| `visibleBlockGapPx` | Desired outer-flow spacing between consecutive visible matching Blocks where the parent adapter supports safe gap control. Tables and custom layouts retain their native spacing. |
| `activeMatchScrollMarginPx` | Additional clearance preventing the active match/context window from sitting flush against the clipped viewport edge. |
| `continuationFadePx` | Height of the optional top/bottom visual fade indicating internally scrollable content. Zero disables the fade without changing clipping. |

All measurements are rendered CSS pixels. They are deliberately not Cell,
character, line, or device-pixel counts.

The resolver must:

- reject or replace non-finite and negative values;
- enforce `minimumExcerptHeightPx <= preferredExcerptHeightPx <=
  maximumExcerptHeightPx`;
- allow zero for the optional gap, scroll-margin, and fade values;
- return a fresh frozen resolved object without mutating either the caller's
  object or `DEFAULT_CONCERTINA_SETTINGS`; and
- fit the effective values to a genuinely smaller available viewport without
  rewriting the preferred settings.

Changing settings while concertina is active should recompute presentation from
the existing ranges; it must not rerun text search, reload entity summaries, or
create repository history. The resolved settings remain session state and are
not saved with the Document or Workspace. A future application-preferences
system may supply defaults, but that is separate from Document persistence.

## General marker input

Concertina input should use the same general shape as minimap markers rather
than accepting an entity-specific object. The caller supplies a collection of
positioned occurrences; the concertina engine decides which Block branches to
retain and which matching Block viewports need clipping.

The existing minimap vocabulary is:

```ts
type MinimapAnchor =
  | { kind: "text-range"; range: SearchRange }
  | { kind: "block"; nodeKey: NodeKey }
  | { kind: "ratio"; top: number; height?: number };

interface MinimapMarker {
  id: string;
  group?: string;
  anchor: MinimapAnchor;
  colour: string;
  opacity: number;
  label?: string;
}
```

The first two anchors are also suitable for concertina. A ratio anchor is not:
it describes a visual proportion but cannot identify the Block that must remain
visible, the ancestors that must be protected, or the text range around which
context must be measured.

Extract or mirror a common resolvable anchor and marker base:

```ts
export type DocumentPositionAnchor =
  | { kind: "text-range"; range: SearchRange }
  | { kind: "block"; nodeKey: NodeKey };

export interface DocumentPositionMarker {
  id: string;
  group?: string;
  anchor: DocumentPositionAnchor;
  label?: string;
}

export interface ConcertinaMarker extends DocumentPositionMarker {
  // Reserved for future presentation hints. Layout measurements belong in
  // ConcertinaSettings rather than being repeated on every marker.
}
```

`MinimapMarker` can extend the same base while retaining its colour, opacity,
minimum thickness, and optional ratio-only variant. Concertina must not depend
on canvas/minimap rendering classes merely to reuse this data shape; the small
anchor/marker contract should live in a neutral runtime module.

The concertina request then becomes:

```ts
export interface ConcertinaRequest {
  owner: string;
  viewId: string;
  scope: SearchScope;
  markers: readonly ConcertinaMarker[];
  activeMarkerOrGroup?: string;
}

editor.concertina.activate({
  owner: editor.find.owner,
  viewId: result.scope.viewId,
  scope: result.scope,
  markers: result.matches.flatMap(match =>
    match.ranges.map((range, index) => ({
      id: `${match.id}:${index}`,
      group: match.id,
      anchor: { kind: "text-range", range },
      label: match.context,
    })),
  ),
  activeMarkerOrGroup: activeMatch?.id,
}, settings);
```

This supports several producers without adding type-specific branches to the
layout engine:

- text Find emits one or more text-range markers per logical match;
- Entity Listing emits text-range markers from standoff-derived entity ranges,
  grouped by entity or logical mention as appropriate;
- annotation/property searches can emit their resolved text ranges;
- Block searches can emit `block` anchors even when there is no text range; and
- future tools can reuse the operation if they can resolve their results to an
  occurrence Block or range.

Markers are occurrence-specific and must carry the `nodeKey` from the relevant
projection. A canonical content ID alone is insufficient because the same
content may be transcluded into several visual positions.

### Marker rules

- `id` uniquely identifies a visual marker within the request.
- `group` joins several range segments into one logical match or entity mention.
  Active navigation may target either a marker ID or its group.
- Multiple markers in one Block are measured together for context clustering.
- Duplicate anchors may be deduplicated for layout while retaining every ID and
  group for navigation.
- Deleted, missing, out-of-scope, wrong-view, or unresolvable anchors are
  ignored and reported diagnostically. They must not cause unrelated Blocks to
  be hidden.
- A `block` anchor protects the Block and its ancestors but supplies no text
  rectangle. The matching Block remains visible at natural height unless its
  registered adapter provides a meaningful Block-level excerpt target.
- An empty valid-marker collection deactivates/fails open; it never hides the
  entire scope.

The API should accept any iterable or readonly array at its boundary, then copy
and freeze the normalised markers for the active session. This lets callers pass
cached arrays, generators, or mapped search results without permitting later
mutation to alter an applied presentation unexpectedly.

## Pipeline and composability

The marker contract is intended to be a reusable pipeline boundary, not merely
an input DTO for one service. Producers should emit neutral document-position
markers, small pure functions should transform them, and stateful/DOM consumers
should sit at the end of the pipeline.

A typical text-search path should be expressible as:

```ts
const markers = searchMatchesToPositionMarkers(result.matches);
const scoped = filterPositionMarkersToScope(markers, result.scope, projection);
const normalised = normalisePositionMarkers(scoped);

editor.decorations.attachMarkers(find.owner, normalised, highlightStyle);
editor.minimap.attach(find.owner, {
  pageKey,
  markers: normalised.map(toMinimapMarker),
});
editor.concertina.activate({
  owner: find.owner,
  viewId: result.scope.viewId,
  scope: result.scope,
  markers: normalised,
  activeMarkerOrGroup: activeMatchId,
}, concertinaSettings);
```

An entity path uses the same middle and end stages:

```ts
const markers = entityRangesToPositionMarkers(entity.id, entity.ranges);
const normalised = normalisePositionMarkers(markers);

editor.minimap.attach(entityOwner, {
  pageKey,
  markers: normalised.map(marker => toMinimapMarker(marker, entityColour)),
});
editor.concertina.activate({
  owner: entityOwner,
  viewId,
  scope,
  markers: normalised,
}, concertinaSettings);
```

This need not eliminate ordinary `.map()`, `.filter()`, or `.flatMap()` calls.
Those are desirable adapters when the collection type stays clear. Dedicated
functions are warranted when a transformation carries validation, coordinate,
scope, grouping, or deduplication semantics that should not be reimplemented by
each caller.

### Proposed functional layers

1. **Producers** convert a domain result into markers:
   `searchMatchesToPositionMarkers`, `entityRangesToPositionMarkers`,
   `annotationRangesToPositionMarkers`, and `blockResultsToPositionMarkers`.
2. **Pure transformations** filter, group, deduplicate, sort, validate, or map
   markers without consulting or changing the DOM.
3. **Projection resolution** verifies occurrence keys, scope, ancestors, and
   safe structural boundaries. It returns data plus diagnostics rather than
   performing layout.
4. **Presentation derivation** computes hidden/protected/matched occurrence
   sets and desired excerpt targets from resolved markers and settings.
5. **Measurement** is the first browser-dependent stage. It reads mounted range
   rectangles and natural Block heights in a batched read phase.
6. **Application** is the terminal side-effect stage. It writes session-only
   classes, attributes, CSS variables, scroll positions, and reactive service
   state in a batched write phase.

Provisional pure signatures:

```ts
type MarkerIterable = Iterable<DocumentPositionMarker>;

function normalisePositionMarkers(
  markers: MarkerIterable,
): ReadonlyArray<DocumentPositionMarker>;

function filterPositionMarkersToScope(
  markers: MarkerIterable,
  scope: SearchScope,
  projection: BlockTreeProjection,
): ReadonlyArray<DocumentPositionMarker>;

function resolvePositionMarkers(
  markers: MarkerIterable,
  scope: SearchScope,
  projection: BlockTreeProjection,
): {
  markers: ReadonlyArray<ResolvedDocumentPositionMarker>;
  diagnostics: ReadonlyArray<string>;
};

function deriveConcertinaPresentation(
  markers: Iterable<ResolvedDocumentPositionMarker>,
  scope: SearchScope,
  settings: Readonly<ConcertinaSettings>,
): ConcertinaDerivation;
```

The pure derivation result should itself be reusable and inspectable:

```ts
interface ConcertinaDerivation {
  protectedKeys: ReadonlySet<NodeKey>;
  hiddenBranchRoots: ReadonlySet<NodeKey>;
  matching: ReadonlyMap<NodeKey, ReadonlyArray<ResolvedDocumentPositionMarker>>;
  activeMarkerOrGroup?: string;
  diagnostics: ReadonlyArray<string>;
}
```

`measureConcertinaPresentation()` may enrich that derivation with viewport
geometry, and `applyConcertinaPresentation()` consumes the measured result.
Keeping those stages separate allows pure unit tests, alternate renderers, and
future non-DOM consumers.

### Shared collection rules

- Inputs are `Iterable<T>` where streaming/generator input is useful; outputs
  are frozen `ReadonlyArray<T>` when multiple downstream consumers need stable
  replay.
- Functions do not mutate input arrays, markers, ranges, settings, Sets, or
  Maps supplied by callers.
- Marker IDs, groups, occurrence keys, and coordinate systems survive ordinary
  transformations unless a function explicitly documents a remapping.
- Sorting is explicit. Producers preserve source order; a consumer requiring
  document order calls a named ordering function rather than relying on Map or
  DOM iteration accidentally.
- Invalid items produce diagnostics and are filtered before presentation.
  Low-level pure functions do not silently hide the entire scope or throw after
  partial DOM application.
- Domain-only fields such as entity Graph counts do not leak into the neutral
  marker type. Consumers that need them keep a side table keyed by marker/group
  ID or compose a richer local type.
- Presentation fields such as minimap colour/opacity are added by adapters at
  the relevant consumer boundary, not baked into every producer.
- Async stages are explicit. Text search may be asynchronous; marker mapping
  and structural derivation remain synchronous and pure; DOM measurement is
  scheduled/batched separately.

This separation also avoids a large `ConcertinaService` that searches,
normalises, measures, mutates the DOM, and controls UI itself. The service
coordinates a pipeline and owns its lifecycle, while the underlying functions
remain independently reusable.

## Session model

Add a small `ConcertinaService` to `ReactiveEditor`, parallel to session
decorations and minimap state. It owns no repository references beyond stable
keys and performs no commands.

Provisional request/presentation model:

```ts
interface ConcertinaRequest {
  owner: string;
  viewId: string;
  scope: SearchScope;
  markers: readonly ConcertinaMarker[];
  activeMarkerOrGroup?: string;
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
activate(request, settings?)
update(request, settings?)
configure(settings)
setActiveMarker(markerOrGroupId)
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
2. If the height is at or below `naturalHeightThresholdPx` (260px by default),
   leave it entirely alone.
3. Measure the visual fragments for all current matching ranges in that Block.
4. Select the active match when present; otherwise use the first match in
   document order.
5. Compute an excerpt window using `contextBeforePx` and `contextAfterPx`, both
   agreed as 48px by default. Include `activeMatchScrollMarginPx` at the
   viewport edge. Clamp the result to `minimumExcerptHeightPx`–
   `maximumExcerptHeightPx`, with `preferredExcerptHeightPx` as the normal
   target. The context measurement is in rendered CSS pixels, not characters
   or source offsets.
6. Merge nearby visual match clusters when their separating space is no larger
   than `nearbyMatchMergeGapPx`; this only affects viewport calculation and
   never hides or rewrites the real Cells between matches.
7. If every match plus its surrounding context fits within
   `maximumExcerptHeightPx`, position the viewport so all of them are visible.
8. If the first-to-last match span is larger, keep an internal scroll viewport
   between `preferredExcerptHeightPx` and `maximumExcerptHeightPx` and centre
   the active match. Next/Previous and minimap activation scroll this viewport
   to the newly active match.

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

- Add default-resolution tests for missing, partial, zero, invalid, and
  internally inconsistent settings, including proof that caller/default
  objects are never mutated.
- Add contract tests showing that text, entity, annotation, and Block producers
  feed the same normalisation/resolution functions and can be mapped into both
  minimap and concertina consumers without source-specific branches.
- Test every pure pipeline stage without mounting Solid or creating DOM nodes;
  reserve browser tests for measurement and application stages.
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
