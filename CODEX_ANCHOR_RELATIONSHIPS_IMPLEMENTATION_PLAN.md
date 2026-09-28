# Codex Anchor Relationships — Implementation Plan

Status: implemented; see [implementation report](CODEX_ANCHOR_RELATIONSHIPS_IMPLEMENTATION_REPORT.md). Awaiting review.

This revision incorporates `CODEX_ANCHOR_RELATIONSHIPS_AMENDMENT.md`: the anchor supplies both the coordinate system and the visibility/lifecycle context.

Anchor positions an ordinary Block B relative to a nominated Block A, including its containing Document. It is independent of Block type: text, images, StickyNotes and other normal Block views use the same mechanism. StickyNote is the first proof case, not the feature's owner. 3DBlock is excluded and awaits a separate specification.

Implement one bounded pass behind a new `anchorRelationships` feature flag enabled by default, following the user's updated project convention. Preserve the accepted Canvas and Spatial implementations.

## 1. Can Anchor reuse the margin mechanics?

Partly. [`ensureMargin` and `setRelation`](src/block-tree/commands.ts) create structurally owned margin subtrees. [`RelationBlocks`](src/rendering/block-outlet.tsx) renders them beneath their source; CSS positions them beside that source. [`document-margins`](src/rendering/document-margins.ts) and the Window view handle collapse and drawer presentation.

This is useful precedent for ordinary Block rendering, exclusive mounting and focus restoration. It is not an existing arbitrary-anchor geometry service: margin placement benefits from DOM ancestry, and `ensureMargin` requires a Standoff source.

Reuse `BlockOutlet`, existing mount/measurement facilities and Solid Portal rendering. Leave margin ownership, CSS and drawer policy intact. Do not introduce an `anchor` owned relation beneath A, a third margin lane, or a generic relationship registry. The current StickyNote service's optional “anchor” point is only an initial viewport position; it does not implement this relationship.

## 2. Where should the relationship and offsets be stored?

Store one optional authored record on B, in its existing payload metadata:

```json
{
  "metadata": {
    "anchor": {
      "version": 1,
      "blockId": "durable-authored-id-of-A",
      "offset": { "x": 24, "y": 12 }
    }
  }
}
```

Offsets are finite, unscaled CSS pixels. Positive x points right and positive y down. For an ordinary Block, A's outer top-left border corner is the origin; for a Document, use its stable visible presentation frame as defined in section 4. The offset locates B's outer top-left border corner. Negative offsets are allowed. While A is visible, B may extend outside the Document or Window without clamping.

Persist A's authored Block ID, never a runtime NodeKey, DOM ID, measured rectangle or viewport position. Keep B's existing size/appearance data separate. Unsupported versions or malformed records remain preserved but inactive.

Initially support same-Document references to ordinary in-flow Block occurrences **and to B's containing Document itself**. The containing Document is an explicit exception to the ancestor restriction. Otherwise reject self-anchoring, ancestor/descendant pairs and anchoring to an already anchored Block; also reject a change that would turn an existing target into an anchored Block. This bounds the first pass to one-hop relationships, without a constraint solver. Cross-Document references, Window/Canvas/Workspace anchors and anchor chains remain outside this pass. Document anchoring uses the same identity/offset record, without an `alwaysVisible` flag or another placement category.

## 3. How does B remain owned and reachable?

Keep B at its existing structural placement in the Document/container. Creating the proof note inserts it as a normal independently owned Block in that Document, not as A's child or as a separate floating StickyNote Window. The relationship changes presentation only.

Add a narrow rendering decision at the ordinary Block outlet, with at most one live view and mount registration for that occurrence:

| Relationship state | Presentation of B |
| --- | --- |
| Resolved ordinary anchor intersects its Document/Window viewport | Existing Block view in the unclipped Portal. |
| Resolved ordinary anchor is offscreen | No visible anchored presentation; do not fall back into normal flow. |
| Resolved Document anchor | Portal presentation while that Document occurrence is visible, independent of content scrolling. |
| Missing/ambiguous anchor, inactive record or disabled feature | Ordinary structural rendering. |

Resolved anchored B is out of normal flow; detaching restores ordinary flow at its retained structural location. Introduce a non-editable placeholder/source slot only if existing navigation or rendering demonstrably requires it. It must not become a new ownership concept or contain a duplicate editor.

Preserve authored dimensions; for an auto-width Block, use the source container's normal available width as the layout constraint rather than the viewport width or Portal shrink-to-fit. Keep source styling, Document context, coordinate scale and Window association available across the Portal. The generic wrapper provides placement controls; StickyNote styling and resize behaviour remain owned by StickyNote.

Deleting A must not delete B. A missing or ambiguous target makes B render at its structural location with an unresolved indication and detach/re-anchor controls; undoing A's deletion can resolve it again. Offscreen is not unresolved: returning A to view restores B at its unchanged stored offset. A temporarily hidden/minimized Document must not leave floating content behind. Disposal, presentation switching and unmounts release Portal content and subscriptions. Visibility changes must preserve authored content and respect existing focus/composition lifecycles, without a duplicate editor or focusable invisible overlay. With the flag disabled or implementation absent, B renders normally and its metadata survives.

## 4. How is geometry obtained and converted?

Use mounted Block roots through [`MeasurementService.blockRect`](src/runtime/measurements.ts) and the existing [`LocalCoordinates`](src/runtime/local-coordinates.ts) contract. This supports translation and positive uniform scale, with Desktop's scale-one fast path; it does not introduce perspective-transformed editable DOM.

For an ordinary anchor, intersect its rendered border rectangle with its containing Document/Window's visible content viewport, accounting for clipping and the browser viewport. B is displayed only while that intersection is nonempty; a small runtime overscan may avoid boundary flicker. B's own rectangle may extend beyond that viewport. Visibility follows A, not B's potential global position.

For a Document anchor, resolve the containing Document occurrence and obtain the top-left origin of its existing non-scrolling Document presentation viewport, excluding Window chrome. Do not use the scrolling page's moving content origin. This is the Document's presentation geometry, not a separately persisted Window reference. Internal scrolling leaves B's relative position unchanged; moving, resizing or transforming that Document presentation updates it. Its visibility follows the visible Document occurrence, regardless of which paragraphs are onscreen. Expose this geometry through the existing host/measurement boundary if the mounted Document root does not itself supply the stable frame.

For source cumulative scale `s` and the applicable anchor viewport origin `a`:

```text
B viewport origin = a + s × stored offset
layer position = existing toLayerPoint(B viewport origin, layer, layerScale)
```

Use a fixed, unclipped Portal host outside the transformed Document surface. Translate its placement frame in viewport coordinates and scale the ordinary B view by the source scale, with top-left transform origin. Retain the matching coordinate context for selection and effects. The host must have no accidental border/scroll offset. `getBoundingClientRect()` already accounts for scrolling; do not add scroll a second time.

Associate stacking with the source Window, below dialogs and menus; apply the anchor visibility rules above. An empty overlay must not intercept input. Clicking B activates its source Window through the existing focus path. There is no independent global spatial position to maintain for an offscreen anchor.

**The concrete gap is invalidation.** The measurement service reads geometry but has no shared layout-change subscription. [`PageMinimap`](src/rendering/page-minimap.tsx) already owns a frame-coalesced combination of resize/mutation observation, scroll, viewport, image-load, font-load and mount notifications. Those facilities currently belong to the minimap component and are not available when it is absent.

Reuse/extract only the necessary part of that existing page-layout scheduling responsibility into a small disposable page-scoped helper shared by the minimap and Anchor. It must work when the minimap is hidden, and remain inactive without consumers. Reuse page/layout-container observation; do not add observers per anchor or a second competing Anchor measurement loop. Window move/resize previews, Canvas host translation/scale and Compact/drawer layout changes must explicitly invalidate it: a ResizeObserver alone cannot detect translation. Mount disappearance also needs notification or owner cleanup; the current mount subscription reports registration only.

On relevant dirty frames, use the existing measurements to check visibility, reading each distinct target at most once. Only visible resolved anchors need B positioning and Portal updates; offscreen anchors need only reevaluation when scroll/layout/host changes could bring them back. Do not continuously track hidden B geometry. Document anchors need host geometry/visibility updates, not repositioning for ordinary content scroll. Apply Portal positions after reads and reuse frame-local reads where the minimap needs the same rectangle. Include content reflow, delayed image sizing and font changes in qualification. Do not modify the standoff scheduler, poll, or introduce a general layout service. If reliable invalidation requires broader architectural replacement, report that blocker rather than expanding the pass.

Drag only from a dedicated generic placement handle. Preserve the pointer's grab offset and compute each preview against A's current viewport origin:

```text
preview offset = (desired B viewport origin − current A viewport origin) / s
```

This remains correct if the Document scrolls during a drag. Pointer capture owns the drag; Escape, pointer cancellation, lost capture or target disappearance/invalidation cancels without saving. An already-started drag temporarily retains its presentation while its anchor remains valid and measurable, even if the anchor leaves the viewport. Pointer completion saves once and restores normal visibility semantics. Geometry updates move the existing view without remounting it or disturbing composition. Attach/detach and visibility transitions must preserve content/selection and use existing composition and focus handling. Provide labelled x/y controls and detach/re-anchor actions for keyboard access; do not intercept ordinary text selection or native controls.

## 5. What about multiple occurrences and transclusion?

[`identity.ts`](src/block-tree/identity.ts) distinguishes authored Block IDs from placement identity; [`projection.ts`](src/block-tree/projection.ts) can render shared content along several routes. A global “first node for this Block” lookup would therefore be wrong.

Resolve A by authored ID **within B's containing Document occurrence, including that Document itself, in the current projection**. Require exactly one eligible occurrence before testing visibility; an offscreen duplicate does not disambiguate a reference. Repeated Windows showing the same Document each obtain their own geometry, visibility and Portal placement. A Document reference resolves to B's own containing occurrence, not another Window showing the same content. Multiple ordinary occurrences of A inside that Document occurrence are explicitly ambiguous: show B at its structural location rather than choosing the nearest or first match.

The relationship lives on shared B content, so editing its offset changes all occurrences of B, consistent with existing shared-content editing. Independent settings require an ordinary independent copy/detachment. Per-placement overrides and persistent occurrence paths are deferred. An occurrence ambiguity can later justify a more precise selector; it does not justify designing one now.

## 6. Which persistence and undo mechanisms are reused?

Existing payload metadata round-trips through the [Block codecs](src/block-tree/codecs.ts) and [Document/workspace persistence](src/reactive-editor/persistence.ts). Reuse those paths and the existing shared-Document materialization; no new workspace format, sidecar or second Document DTO is needed.

Use `setPayloadField` with merged current metadata and existing transactions for attach, detach, re-anchor and committed offset changes. A drag has transient previews and one undo entry at completion; cancellation has none. Creating and anchoring the proof note is one transaction. Reading geometry, scrolling and Window movement never write authored offsets. Preserve unrelated metadata and cancel an active preview if undo or another edit changes its relationship.

One explicit copy integration is required: [`remapKnownBlockReferences`](src/block-tree/clipboard.ts) currently remaps `codex/block-reference` properties, not the proposed metadata field. Extend this known-reference remapping narrowly so copying A and B together points copied B at copied A. Copying B alone retains A's ID and resolves only within the destination Document scope; otherwise it remains unresolved. Test this alongside shared-content serialization and target deletion/undo. Do not recursively rewrite arbitrary opaque IDs.

## 7. Can this be one small bounded feature?

Yes: one implementation pass with a contained rendering/scheduling integration, not merely a StickyNote CSS patch and not a milestone programme. Keep relationship policy, validation and controls in a feature-owned disposable module. Supply narrow operations for relationship reads/commits, scoped occurrence resolution, geometry subscriptions and focus; do not inject `ReactiveEditor` or create a service locator. Core retains generic measurement, mounting, coordinates and authored storage.

The pass should deliver:

1. The record, validation, scoped resolver and normal history/persistence integration.
2. Anchor-controlled Portal placement/visibility, including the stable Document origin, and only the limited shared layout hook required above.
3. Generic attach/re-anchor/detach, drag and numeric-offset controls, using existing Block selection/command UI rather than a new picking or input pipeline.
4. A StickyNote-to-text proof, followed by the same operation on an image Block and a plain text Block to demonstrate that the mechanism has no StickyNote branch; also demonstrate anchoring B to its containing Document with the same record and controls.

Qualification should be focused:

- Unit/integration checks for offsets, invalid records, one-hop restrictions and the Document ancestor exception, missing/ambiguous versus offscreen occurrences, repeated Document Windows, copy remapping, save/reopen, one-step undo/redo and cancellation.
- Real-browser proof of following scroll, insertion above, text reflow, delayed image loading, Window movement/resizing and Compact/margin changes. Verify disappearance/reappearance at the visibility boundary without offset changes, including completion of a drag that takes A out of view and cancellation if A disappears. Exercise negative offsets and B outside Window bounds while A is visible, including stacking and hit testing.
- Document-anchor proof: internal content scrolling leaves B fixed relative to the Document presentation; host movement/transforms move it; hiding/minimizing or leaving the presentation removes it. Verify independent visibility/geometry for repeated Windows sharing that Document.
- Desktop plus Canvas at 0.5×, 1× and 2×; smoke-test the existing Spatial live DOM editing handoff and return with no stranded Portal. No Spatial proxy or 3D anchoring work.
- Editable anchored text: native typing/caret/selection, IME, representative standoff rendering and cross-Block/Grouping selection. Check Entity panels, native controls and focus return across the Portal. DOM ancestry assumptions are a real risk; do not replace selection machinery to conceal failures.
- Existing margin/drawer and minimap regression checks, and a feature-removal build/run: ordinary Blocks stay reachable/editable and unknown anchor metadata round-trips. Confirm that scroll/drag frames do not create history entries and no layout loop runs while idle.

Provide a short implementation report and a reproducible browser example showing an independently owned StickyNote outside the Window while its paragraph anchor is visible, disappearance/reappearance as that anchor scrolls out/in, and the contrasting scroll-stable Document anchor. Include save/reopen and undo. If Portal editing or layout invalidation needs substantial core changes, stop with the specific blocker. Otherwise complete this single pass and return for review without expanding into a relationship framework or other Spatial work.
