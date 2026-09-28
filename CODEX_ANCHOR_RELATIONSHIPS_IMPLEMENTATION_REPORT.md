# Anchor Relationships — Implementation Report

Implemented as one bounded pass. The feature defaults **on**, following the user's updated project convention. Set `features.anchorRelationships: false` to disable its presentation and controls while retaining authored data. Existing feature defaults were not changed.

## Using it

1. Select an ordinary Block using its Block selection handle.
2. In the existing selection inspector, use **Anchor position → Relative to** to choose a Block in the same Document, or **Document**.
3. Drag the small handle above the positioned Block, or edit its X/Y offsets. Escape cancels a drag. **Detach anchor** returns it to normal flow.

For the StickyNote example, use the existing Block context menu's **Add Block → Insert Sticky Note Here**, then select and anchor that note. Insertion and attaching an existing Block remain separate ordinary UI actions/undo entries; each completed placement change is one transaction. There is no StickyNote-specific anchoring implementation. The same controls have been exercised with plain text and image Blocks.

## Resulting behaviour and ownership

`B.metadata.anchor` contains `{ version: 1, blockId, offset: { x, y } }`. Its ID names A's authored identity; offsets are unscaled CSS pixels. B keeps its original structural placement, content, children and authored dimensions. No structural placeholder was needed.

Ordinary A is measured at its outer border origin. B appears only while A intersects the clipped Document/Window viewport, and can extend outside that viewport. Scrolling A out hides the existing portaled view without deleting B or moving it into document flow; returning A reveals the same view. Hidden B is not measured or continually repositioned. The existing hidden DOM view preserves its editing lifetime; this is the sole view, not an additional hidden editor.

A missing, invalid or ambiguous reference falls back to structural rendering. The selected Block's controls explain an unresolved reference. Deleting A does not delete B, and undo resolves the relationship again. Unsupported metadata remains intact and inactive.

Document anchoring uses the same record and controls. Its origin is the non-scrolling Document content viewport, excluding Window chrome, rather than the moving page contents. Content scrolling leaves B fixed relative to that frame. Window movement, resizing, transforms and visibility still apply. Minimizing/disposal removes the presentation with its owning view.

An active drag may retain B after A leaves the viewport, provided A remains valid and measurable. Completion saves one anchor-local offset and reinstates normal visibility. Escape, pointer cancellation/lost capture or actual target invalidation cancels without saving. Gesture completion measures current geometry rather than committing a potentially stale animation-frame sample. Numeric controls provide keyboard access without replacing input handling.

## Implementation boundaries

- Feature policy, validation, controls and gesture state live in [anchor-relationships](src/features/anchor-relationships/index.tsx), using [narrow capabilities](src/feature-api/anchors.ts). The implementation does not receive `ReactiveEditor` or access arbitrary editor DOM.
- Core has one optional [Block presentation owner](src/runtime/block-presentation.ts), consumed by the existing Block outlet and selection inspector. It is not a registry or chain. The [Portal surface](src/rendering/positioned-block.tsx) renders the ordinary registered Block view with the original projection and coordinate context. Desktop uses the Window's peer stacking context where untransformed; scaled hosts use the outer viewport Portal.
- [Page layout notifications](src/rendering/page-layout.ts) extract the existing minimap scheduling responsibility. Minimap and Anchor share demand-driven observation and frame-local rectangle reads. Host ancestor style changes cover Window/Canvas translation and scale; scroll, reflow, image/font loads and viewport changes invalidate layout. There are no per-anchor observers or polling. The standoff scheduler is unchanged.
- The application adapter resolves mounted geometry through existing measurement infrastructure. A default Document without a Window uses its existing flow presentation frame, or the Document root when it is itself the presentation frame.
- Existing metadata codecs, transactions, history and workspace materialization remain authoritative. Clipboard copying adds only the known `metadata.anchor.blockId` remapping rule. No storage format, second DTO or persistence service was introduced.
- Core has no StickyNote-specific Anchor branch. The authored-reference remapping in clipboard code is deliberate shared persistence infrastructure; the optional presentation hook is the only new core rendering extension. Existing margin and StickyNote Window adapters remain unchanged.

References resolve within B's containing Document occurrence, including that Document. Repeated Document Windows therefore use their own geometry. Multiple occurrences of the same target inside one Document remain unresolved; offscreen duplicates do not disambiguate them. Shared B content shares its offsets. Self/ancestor/descendant references and chains are rejected, with the approved containing-Document exception. Window, Canvas and Workspace anchors remain excluded.

## Qualification

- **94 focused tests passed** across 14 files: five new Anchor tests, plus existing minimap, presentation switching, Spatial handoff geometry, Compact, StickyNote, cross-Block selection, Grouping, binding and optional annotation tests.
- Real Chrome checks cover 0.5×, 1× and 2× transformed DOM hosts, normal/offscreen/unresolved behaviour, reflow, Window movement/resizing, Compact, Document anchoring, minimize/restore, native standoff and textarea editing, an SVG effect, Chromium IME composition/commit, Entity panel selection/focus restoration, drag completion beyond the visibility boundary, cancellation, save/reopen and undo. Plain text and image proofs use the same feature path. An idle measurement check detects no polling.
- Both client and server TypeScript checks passed; the production client build passed. Existing bundle-size and browser-mapping age warnings remain unrelated to this change.
- **Physical removal passed** in an isolated source copy: the implementation directory and application adapter were deleted, only their composition imports/activation were removed, and the copy built successfully. Chrome then verified ordinary B rendering, editing and metadata round-trip with the feature physically absent. The working application's source was never removed for this check.

Reproduce with Node 22:

```sh
node scripts/check-anchor-relationships-browser.mjs
node scripts/check-anchor-removal.mjs
```

The main browser script expects Vite on `http://127.0.0.1:5191/`; override with `ANCHOR_URL`. The removal script builds a disposable copy and uses port 5192, then cleans it up. `ANCHOR_ARTIFACTS` optionally writes browser evidence.

Evidence: [browser results](artifacts/anchor-relationships/browser-results.json), [browser screenshot](artifacts/anchor-relationships/browser.png), [physical-removal results](artifacts/anchor-relationships/removal-results.json), [removal build](artifacts/anchor-relationships/removal-build.txt).

Qualification is intentionally bounded: transformed-host checks exercise the existing Canvas coordinate contract; the existing Spatial handoff tests are regression checks, not a new 3D anchoring qualification. Native OS IME candidate-window behaviour, arbitrary nested stacking contexts and a full viewport/theme matrix were not exhaustively tested. No Canvas/Spatial redesign, input replacement or broader core rearchitecture was required.

Implementation is ready for review. No further relationship or Spatial work has begun.

## Control-click follow-up

Manual testing exposed an existing input conflict: the Grouping gesture owner suppressed every Control-click inside standoff text, including ordinary clicks that neither selected text nor removed a grouped range. Core now suppresses the menu only for a real drag or successful range removal. An early native context-menu event waits for the existing pointer-completion microtask, so it cannot interrupt a Control-drag. Both native Control-contextmenu button variants are recognized. Native form-field menus remain native.

The follow-up passed 90 focused input/menu/Grouping/Block-selection tests, all 17 existing real-browser selection checks, and the expanded 56-check Anchor browser run. The latter now begins with real Control-click, menu insertion of an inline StickyNote, selection of the note's own Block handle, and anchoring through the inspector. Client typechecking and the production build also passed. The browser evidence linked above includes this complete entry path.
