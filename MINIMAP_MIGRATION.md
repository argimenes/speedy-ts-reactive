# Page minimap migration plan

Status: implemented for Page-scoped Find on 15 September 2026.

## Implementation checkpoint

The general session service is in `src/runtime/minimap.ts`; it accepts immutable
semantic text-range, Block-occurrence and normalised-ratio markers in isolated
owner layers. `src/rendering/page-minimap.tsx` provides the portalled,
device-pixel-scaled canvas renderer, dynamic scrollport geometry, viewport
indicator, hidden-marker accounting, overlap hit-testing and delegated marker
activation. `PageView` supplies a stable main-column anchor, and Document Find
publishes/disposes its yellow current-Page marker layer alongside its existing
session highlights.

The implemented options default to right-side placement, 20 CSS px width,
available scrollport height with a 480 px fallback, two-CSS-pixel minimum marker
thickness and `multiply` compositing. Left placement, numeric height and
`source-over` compositing are configurable. The minimap and all of its options
remain session-only and produce no canonical writes or history entries.

The desktop margin CSS now reserves coordinated lanes when a minimap is active:
the manicule remains closest to the main text, followed by the minimap and then
the margin note. The layout mirrors for a left-side minimap. Existing narrow-mode
rules keep margin notes inline, hide maniculae and allow the minimap renderer to
hide itself when the gutter is too small.

## Purpose

The minimap is a general-purpose, session-only visualisation of positions within
one Page. It is a narrow vertical rail adjacent to the Page's main
text column. Independent tools can publish coloured, translucent markers for
search results, entity references, syntax annotations, Blocks, or future sources.
The rail compresses the Page's entire rendered vertical extent into the height
currently available in the document window, including content outside the
viewport.

The minimap is not document content. Its layers, visibility, measured geometry,
hover state and selected marker must never be written to a Block payload,
`blockProperties`, the canonical repository, undo history, document JSON or saved
workspace state. A tool recreates its markers from its own session state when it
opens or refreshes.

## Findings from the original component

`src/library/original/parts/minimap.js` establishes these useful behaviours:

- It appends a 20 px vertical bar beside an editor container and scales document
  Y coordinates by `bar height / container scrollHeight`.
- Markers span the rail width. They may use a fixed two-pixel height or a height
  derived from the annotated range.
- Each marker carries a group identity (formerly the property's `value`), colour
  and source property. Groups can be independently shown, hidden, removed or
  temporarily changed to yellow.
- Opacity and optional `mix-blend-mode` make coincident markers visually combine.
- Clicking a marker scrolls to its source and briefly outlines the source range.
- Dragging the rail changes the editor container's scroll position. A separate
  pair of arrows can show the caret position.

The entity-listing and entity-highlighter consumers confirm that one minimap can
contain several colour-coded groups. They initially hide each entity's markers,
show them on hover or selection, and use 0.5 opacity.

Several implementation details should not be ported directly:

- Inputs are mutable legacy property objects containing live DOM nodes and custom
  `speedy.offset` fields. This is incompatible with projected occurrences,
  transclusion, remounting and inactive tabs.
- Geometry is sampled once. It becomes stale after editing, wrapping, image
  loading, font changes, resize, tab changes or other layout changes.
- `getPropertyHeight()` appears to return the scaled bottom coordinate for a
  Block marker rather than the Block's scaled height.
- Positioning uses hard-coded offsets and assumes one editor/container layout.
- One DOM `span` is created per marker. That is avoidable overhead for thousands
  of search results, especially during repeated layout changes.
- Navigation, overlap hit-testing, cleanup and accessibility are implicit rather
  than part of a defined contract.

## Recommended ownership model

Add a `MinimapService` to `ReactiveEditor`, analogous to session decorations but
kept separate because minimap visibility and geometry are not the same as inline
highlight visibility. It owns named, occurrence-scoped layers:

```ts
interface MinimapLayer {
  owner: string;
  pageKey: NodeKey;
  visible: boolean;
  priority: number;
  markers: readonly MinimapMarker[];
  onActivate?: (marker: MinimapMarker) => void | Promise<void>;
}

type MinimapAnchor =
  | { kind: "text-range"; range: SearchRange }
  | { kind: "block"; nodeKey: NodeKey }
  | { kind: "ratio"; top: number; height?: number };

interface MinimapMarker {
  id: string;
  group?: string;
  anchor: MinimapAnchor;
  colour: string;
  opacity?: number;
  minimumThickness?: number;
  label?: string;
}

interface MinimapOptions {
  side?: "right" | "left";                 // default: "right"
  width?: number;                           // default: 20 CSS px
  height?: "available" | number;            // default: "available"
  fallbackHeight?: number;                  // default: 480 CSS px
  blendMode?: "multiply" | "source-over";  // default: "multiply"
  minimumMarkerThickness?: number;          // default: 2 CSS px
}
```

The `ratio` form is an escape hatch for producers that already have stable
normalised positions. Text and Block producers should publish semantic anchors,
not pixels. Marker arrays should be immutable snapshots so a producer cannot
silently mutate service state.

Suggested service operations are `attach(owner, layer)`, `replace(owner,
markers)`, `setLayerVisible(owner, visible)`, `setGroupVisible(owner, group,
visible)`, `setActive(owner, markerId)`, and `dispose(owner)`. Owners isolate
tools from one another: closing Find removes only Find markers, for example.
Activation callbacks also remain in this session service and cannot enter saved
data.
Repository edits should invalidate affected semantic anchors; the producer then
publishes a fresh result set using the same rules it already uses for highlights.

All keys are occurrence keys in a particular projection. A transcluded source in
two visible places can therefore map to two different Page positions without
changing canonical content.

## Rendering and geometry

The recommended renderer is a `PageMinimapLayer` associated with a mounted
`PageView` and portalled outside scrolling/clipping ancestors. It should:

1. Find the main column's viewport rectangle, its effective scrollport and the
   Page's full scrollable height. The effective scrollport is the nearest active
   vertical scrolling ancestor (the Page in tabbed mode or the document flow in
   flow mode), intersected with the browser viewport.
2. Position the rail on the configured side of the main column. Right is the
   default; left uses the same geometry in the opposite margin. Its X position
   follows the Page as the document window moves or resizes.
3. With the default `height: "available"`, stretch the rail from the visible top
   to the visible bottom of that scrollport. A numeric height opts into a fixed
   size. The 480 px fallback is used only when a usable scrollport cannot yet be
   measured, not as a maximum on a large window.
4. Resolve each mounted text range or Block anchor through the measurement layer
   into coordinates relative to the Page content origin.
5. Clamp positions to the Page extent and map them to the rail using
   `railY = pageY / pageExtent * railHeight`.
6. Use the real scaled source height when requested, subject to a default
   two-CSS-pixel minimum so small matches remain visible.
7. Recompute in one animation-frame batch after relevant mount, resize, scroll,
   font, image-load or active-tab changes. Scrolling ordinarily moves only the
   viewport indicator; it does not require recomputing marker positions.
8. Clamp the rail itself to the available viewport and avoid covering the main
   column at narrow widths.

A small canvas is preferable to thousands of positioned elements. It permits
cheap batched redraws and direct alpha compositing. Draw order must be stable
(layer priority, then marker ID). A neutral rail plus `multiply` compositing is a
good default for colour-coded overlaps; repeated markers of one colour become
darker, while overlapping entity colours remain distinguishable. Consumers may
instead request ordinary canvas `source-over` alpha compositing through
`MinimapOptions.blendMode`. One mode applies to a rail so mixed compositing rules
cannot make layer order surprising. The canvas must be scaled for
`devicePixelRatio` so two-pixel markers remain sharp.

The rail may also draw a translucent viewport window, mapping the Page's current
visible top and height onto the same scale. This makes the off-screen meaning of
markers much clearer than the original caret arrows alone.

## Interaction

The first version supports marker-click navigation without rail dragging or
click-to-scroll. Activation remains outside persisted data:

- The renderer maintains a Y-bin hit index from the resolved marker snapshot.
- Marker hit targets use a small tolerance around thin lines, without changing
  their visual thickness.
- Pointer hover can report all markers intersecting that rail position, not just
  whichever marker happened to render last.
- Clicking a marker delegates to its owning tool. Search can use its existing
  `revealMatch()` path before scrolling. A stale or invalid marker is ignored and
  can prompt its producer to refresh.
- If several marker bands intersect the click, choose the band whose centre is
  nearest the pointer. Ties resolve by highest layer priority and then stable
  marker ID. The hover summary can disclose that multiple markers overlap.
- Equivalent navigation remains available in the owning tool (such as Find's
  Previous/Next controls); thousands of canvas markers do not become thousands
  of keyboard tab stops.

The bar should have an accessible label and summary (for example, “Page minimap,
24 search results”), but can keep the canvas itself `aria-hidden` when the owning
tool already exposes accessible result navigation.

## Hidden and non-spatial content

Inactive tab panels are present in the Page model and can be searched, but they
have no simultaneous rendered Y position. Mapping them onto the currently visible
panel would be false. For the first version, the minimap should draw only anchors
that are mounted in the active Page layout and report an omitted-marker count to
the owning UI. If navigation activates a hidden tab, the layout is remeasured and
its markers become spatially meaningful.

The same rule applies to collapsed or adapter-unsupported content. A future
non-spatial indicator could show that hidden results exist, but it should not
pretend they occupy a particular Page position.

## Initial integrations

The general component should be proven with one producer before entity and syntax
layers are added:

1. Document Find publishes the matches in its current Page scope using the same
   `SearchRange` objects already used by session decorations. Query changes,
   visibility changes and close replace or dispose only the Find layer.
2. Entity listing can later publish one group per entity with stable assigned
   colours. Hover controls group visibility while selection can keep groups shown.
3. Syntax visualisation can publish annotation ranges grouped and coloured by POS
   or another annotation type without changing the minimap component.

Only the current Page is mapped in the first version. Results belonging to other
Pages are treated as hidden content and omitted. The Page is captured from the
producer's current/focused scope and changes when that active context changes.
There is no Document-scale rail in this increment.

## Performance and correctness limits

- Geometry measurement must be restricted to mounted anchors and batched; no DOM
  measurement should occur in repository reducers or search workers.
- A Page resize should produce one redraw, not one Solid update per marker.
- Thousands of markers may share a pixel row. They should still composite, while
  hover results may be capped and summarized (for example, “17 markers here”).
- Zero-height ranges receive the minimum visible thickness. Invalid or stale
  ranges are omitted rather than clamped to an unrelated location.
- Tool close, Page unmount and editor disposal must remove layers, observers,
  animation frames and event handlers.
- Minimap activity must leave repository revision, dirty state and undo/redo
  availability unchanged.

## Verification contract

- Unit-test marker validation, owner/group isolation, ordering, invalidation and
  the guarantee that service operations never touch repository history.
- Geometry-test top, middle, bottom, Block-height and minimum-thickness mapping,
  including page growth and viewport scroll.
- Component-test resize/mount cleanup, narrow viewports, hidden-tab omission,
  group toggles, overlap hit-testing and delegated navigation.
- In a real browser, verify high-DPI canvas dimensions, exact adjacency to the
  main column, marker recomputation after text wrapping and images, source-overlap
  colour blending, Page scrolling and zero document revisions.
- Performance-test a 5,000-marker Find result with one batched redraw and no
  per-marker DOM nodes.

## Confirmed first-version decisions

- Omit inactive-tab, other-Page, collapsed, unmounted and otherwise non-spatial
  markers. Keep the omitted count available to the producing UI.
- Support marker-click navigation. Do not make empty rail space scrollable or
  draggable yet.
- Default to 20 CSS px wide and dynamically fill the active Page scrollport's
  visible height. Use 480 px only as the pre-measurement/standalone fallback.
- Map only the current Page.
- Default to `multiply` compositing and allow `source-over` in the minimap options.
- Default to the right-hand main-column margin and allow `side: "left"`.
- Include a viewport indicator and integrate Page-scoped Find first.

## Dynamic-height concerns and safeguards

Dynamic height is preferable because it uses the document window well and gives
markers more vertical resolution. It does introduce a few contained concerns:

- The scroll owner differs between tabbed and flow layouts. Resolve it from the
  mounted Page instead of assuming that the Page itself always scrolls.
- Document-window headers, style bars, tabs and partial off-screen placement all
  reduce usable height. Use the intersection of the scrollport and browser
  viewport, not `window.innerHeight` alone.
- Window, scrollport and visual-viewport changes can arrive together. Coalesce
  their observers/listeners into one animation-frame measurement and canvas draw.
- Very short windows can make the rail unusable. Below a small implementation
  threshold (proposed: 120 CSS px), hide it and expose its summary through the
  owning tool rather than covering content.
- The rail must stay clear of the native scrollbar and the main text column on
  both configured sides. If neither margin has 20 px available, hide it rather
  than overlay editable text.
- The current margin-note maniculae (`☞` and `☜`) are CSS pseudo-elements with
  hard-coded offsets immediately beside the main text. A minimap in the same
  gutter would collide with them. Page layout should define shared gutter lanes
  for main text, manicule, minimap and margin note rather than giving the minimap
  another unrelated pixel offset. Keep the manicule closest to the text it points
  at, place the minimap in the next available lane, and mirror that order when
  `side: "left"` is selected. On narrow layouts, where margin relations already
  become inline and the maniculae disappear, the minimap should follow the same
  available-space rule and hide rather than cover text.
- Every height change changes the scale and requires a redraw, but it still must
  produce one local canvas update, no per-marker Solid updates and no repository
  activity.
