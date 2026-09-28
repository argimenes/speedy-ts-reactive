# 3DObjectBlock — implementation plan

Status: proposed; planning only. No feature implementation is authorized by this document.

Revision: the user approved including focused Spatial support in this plan. Separate widget input ownership from live-Document compatibility; qualify the new 3D Block and the existing inline Counter without opening all opaque widgets or extending the Spatial desk scene.

## 1. Outcome and boundaries

Introduce an ordinary, structurally owned `3d-object-block` containing an interactive Three.js object. Its first content is a steaming cup of black coffee in a white ceramic mug. The transparent canvas, restrained contact shadow and optional coffee ring should make the cup appear to rest on the Document surface. Selection, keyboard focus, an accessible menu button and a resize handle provide discoverable controls without permanent viewer chrome.

Implement this as a hosted Block application, with coffee as its first internal scene provider. The reusable part owns rendering, camera, lighting, interaction, sizing and lifetime; the coffee provider owns mug geometry, steam and coffee-specific actions. No new editor, repository, presentation system or general plugin framework is needed.

Add a `threeDObjects` feature flag **enabled by default**, following the user's standing instruction and current `AGENTS.md`. Disabling or physically removing the feature must preserve its authored data through the existing unknown-Block fallback. Leave unrelated flag defaults unchanged.

This pass excludes model import, GLTF/GLB, asset libraries, external textures, physics, scene/material/transform editors, timelines, arbitrary shaders exposed to users and multiple-camera authoring. It also excludes adding objects to the Spatial desk, changing Spatial composition, or introducing a new anchor type. An existing Anchor Relationship can position this ordinary Block without 3D-specific anchoring logic.

## 2. What already exists

| Existing code | Use and limitation |
| --- | --- |
| [`src/feature-api/index.ts`](src/feature-api/index.ts), [`src/application/feature-capabilities.tsx`](src/application/feature-capabilities.tsx) | `BlockApplicationDefinition`, self-bound `BlockRuntime.field/setField`, owned disposal, opaque-widget mounting, insertion commands and action contributions. The adapter retains editor access privately. |
| [`src/features/canvas-counter/index.tsx`](src/features/canvas-counter/index.tsx) | The closest small inline hosted-Block example. Follow its structural placement, rather than Timer's fixed-position Portal. |
| [`src/features/timer/`](src/features/timer/) | Examples of feature registration, authored updates, insertion and per-occurrence cleanup. Do not copy its floating-window presentation. |
| [`src/application/features.ts`](src/application/features.ts), [`src/configuration.ts`](src/configuration.ts) | Existing first-party assembly and feature flags. Register here, without adding discovery or a scene-plugin loader. |
| [`src/runtime/block-menu-actions.ts`](src/runtime/block-menu-actions.ts), [`src/rendering/block-context-menu.tsx`](src/rendering/block-context-menu.tsx) | Existing commands, nested menus and text-input forms. There is no slider/custom-control item or per-hosted-Block menu contribution today. |
| [`src/input/gateway.ts`](src/input/gateway.ts), [`src/runtime/overlays.ts`](src/runtime/overlays.ts) | Existing menu opening, deduplication and focus/selection restoration. Opaque widgets intentionally bypass normal editor input and context-menu handling. |
| [`src/rendering/floating-window-resize.tsx`](src/rendering/floating-window-resize.tsx) | Pointer capture, transient size, keyboard resize, cancellation and one final commit; supports scale but currently clamps width/height independently. |
| [`src/runtime/local-coordinates.ts`](src/runtime/local-coordinates.ts), [`src/reactive-editor/context.tsx`](src/reactive-editor/context.tsx) | Positive uniform DOM scale with translation; client coordinates remain viewport coordinates. Hosted BlockRuntime does not yet expose the scale accessor. |
| [`src/features/spatial/scene.ts`](src/features/spatial/scene.ts) | Local precedent for Three.js initialization, scheduling, resource disposal and graphics failure. Its study scene, renderer and decorative cup are not dependencies of this feature. |
| [`src/rendering/unknown-block-view.tsx`](src/rendering/unknown-block-view.tsx) | Existing fallback when the type is unavailable. Repository/DTO persistence retains unknown authored fields. |

The installed dependencies are already `three` 0.186.1 and `@types/three` 0.186.0. No additional rendering framework or package upgrade is proposed. See the existing [feature-module architecture](docs/architecture/FEATURE_MODULES_AND_BLOCK_APPLICATIONS.md) for ownership rules.

### The small shared changes

1. Opt-in, mounted hosted-Block context actions and a self-bound operation to open the existing menu.
2. A read-only occurrence scale accessor on `BlockRuntime`, supplied by the application adapter from the existing view context.
3. An optional aspect-ratio constraint on the existing resize helper, leaving its current behavior unchanged for other consumers.
4. An explicit `spatial-document-compatible` capability in the existing Block registration mechanism, checked separately from `opaque-widget` input ownership. Qualify only the 3D Block and inline Counter initially.

These are concrete gaps in the present implementation. No scene registry, layout registry, global animation service or broad editor capability is proposed.

## 3. Feature structure and ownership

Use `src/features/three-d-object/` with a lightweight registration/model layer and a lazily imported Three.js runtime:

```text
ordinary Block / existing repository and projection
  └─ ThreeDObjectBlockView (Solid, one mounted occurrence)
       ├─ own wrapper, transparent canvas, menu button, resize handle
       ├─ optional scene-owned SVG surface decoration
       └─ ObjectSceneRuntime
            ├─ renderer, scene, one perspective camera, lights
            ├─ constrained turntable controller and frame scheduler
            └─ CoffeeCupContent
                 ├─ procedural mug, liquid and steam
                 └─ semantic settings and coffee actions
```

Register `3d-object-block` with `control`, `opaque-widget` and `selectable` capabilities, plus `spatial-document-compatible` once the qualification in section 11 passes. Add **Add Block → 3D Object — Coffee Cup** through the current `add-block-menu` action slot; a one-item object picker is unnecessary. Use normal sibling/Document-child insertion and focus behavior. Keep the existing structural Block selection and removal affordances.

The view receives `BlockRuntime`, never `ReactiveEditor`, a repository or an arbitrary DOM-query port. It may manage its own canvas, wrapper and observers. The provider receives Three.js objects/settings belonging to this occurrence, not Codex internals.

Keep the provider contract internal and small: create a root group; describe stable framing bounds and a ground/contact origin; apply semantic settings; optionally update animation; dispose owned resources. Its lightweight descriptor supplies defaults and scene-specific menu actions without loading WebGL. Start with one explicit `coffee-cup` mapping, not a public registration framework. This separation leaves a clear place for a later globe or molecule without implementing those use cases now.

Each mounted occurrence owns its own renderer, controller, observers and transient animation state. Multiple occurrences of shared content observe the same authored settings through the existing runtime, but never share mutable Three.js objects. A lifecycle/generation check must discard a late dynamic-import completion after removal or scene replacement.

## 4. Rendering and the coffee reference scene

Create a WebGL renderer on the view's canvas with antialiasing and alpha enabled, a transparent clear color, and no scene background. Explicitly choose output color space/tone mapping and a bounded pixel ratio; begin with `min(devicePixelRatio, 2)`. The wrapper has no opaque background, border or title bar at rest. Focus and selected-state outlines remain visible when relevant. The current renderer requires WebGL 2, so initialization failure must leave an accessible Block fallback with Retry and ordinary Block actions. [Three.js renderer documentation](https://threejs.org/docs/pages/WebGLRenderer.html)

Use a single restrained perspective camera, initially about 35° vertical field of view. Treat FOV, clipping planes and light parameters as implementation details. Fit the content using both available dimensions and stable provider bounds that include the handle and maximum steam envelope. Allow modest padding; do not recompute framing from individual steam particles each frame. Keep the mug visually centred, with enough headroom for steam and a consistent contact point near the lower portion of the Block.

Construct the reference content procedurally:

- A revolved mug cross-section with outer wall, rounded rim, inner wall and bottom, so higher views show a real hollow cup rather than a capped cylinder.
- A dark, subtly reflective circular coffee surface slightly below the rim; no liquid simulation.
- A curved tubular handle attached at plausible upper/lower positions. Inspect its joins and silhouette from the side and three-quarter views.
- A white ceramic standard material with moderate roughness and restrained highlights. A broad fill and directional key should retain shape on both light and dark Document backgrounds without external environment maps.
- A few translucent, gently curling steam ribbons with bounded reusable geometry, fading upward. Use deterministic phase parameters, low opacity and no per-frame allocations. Avoid opaque smoke and hard rectangular sprite edges.
- A small soft contact shadow to ground the cup. Prefer a simple local SVG gradient ellipse alongside the stain; avoid a large visible floor or expensive shadow pipeline for this first object.

Lighting presets change the generic light rig: **Neutral** is the default, **Warm** shifts key/fill color gently, and **Dramatic** increases directional contrast while keeping the coffee and rim readable. The cup stays upright in scene coordinates. The existing Spatial cup is only a schematic prop and should not be extracted as the reference model.

## 5. Constrained interaction and presets

Use camera azimuth/elevation around a fixed target; do not rotate the mug on arbitrary axes. Allow continuous horizontal orbit, clamp elevation to **10–70° above the horizontal**, and disable pan and wheel zoom. Scrolling over the Block should continue to scroll the Document.

For this small two-angle interaction, use a feature-local pointer controller with pointer capture and explicit start/preview/commit/cancel states. This is an opaque widget's own input handling, not a new Codex input pipeline. It avoids adapting the installed OrbitControls' broader mouse/touch behavior: that implementation captures pointers before deciding the mouse action and installs its own context-menu handler. OrbitControls does support polar limits and disabling pan/zoom, but its full interaction policy is unnecessary here. [Three.js OrbitControls documentation](https://threejs.org/docs/pages/OrbitControls.html)

Only unmodified primary-button drags orbit. Right-click and Control-click open the Codex Block menu without rotating; other reserved modifier gestures do not start orbit. Normalize movement to the displayed canvas rectangle so the response remains proportional under Canvas scaling. Pointer-up commits one authored view change; Escape, pointer cancellation, unexpected capture loss or removal cancels without committing. Keep the camera snapshot transient during a drag. If an external authored update/undo replaces the state during a gesture, cancel the stale preview before applying it.

Provide focused-canvas arrow keys for stepped azimuth/elevation and Home for Reset View, with concise accessible instructions. Group held-key changes into one history entry. The menu button and presets are the non-drag alternative. Consume only keys handled by the widget; Tab leaves normally. On touch, favor horizontal rotation with vertical page scrolling (`touch-action: pan-y`), accepting cancellation when the browser takes over scrolling. Do not install global keyboard handlers or prevent wheel events.

Define +Y as up, front as looking from +Z, and the handle on the mug's +X side. Recommended presets:

| Menu label | Azimuth | Elevation | Purpose |
| --- | ---: | ---: | --- |
| Front | 0° | 20° | Readable front silhouette and visible rim |
| Side | 90° | 20° | Side inspection |
| Three-quarter | 45° | 25° | Default balanced view |
| Isometric | 45° | 35.264° | Familiar isometric direction |
| Top-ish | 0° | 65° | Inspect coffee and hollow rim without reaching a pole |

“Isometric” uses the isometric viewing direction with the same perspective camera; it is not a mathematically orthographic projection. Keep that distinction documented rather than adding camera modes for one preset.

**Reset View** restores three-quarter angles and fitted framing, stopping Auto Rotate so the reset remains visible. **Fit to Object** recalculates transient framing from current bounds/effective dimensions and preserves the chosen angles and authored Block size. Automatic fitting already handles ordinary resizes; this command is a harmless explicit recovery action, not a second size system.

Auto Rotate is off by default. When enabled, advance azimuth slowly using elapsed seconds; pause while interacting or a menu is open. Its changing animation phase is occurrence-local and never generates history entries. Starting a manual orbit uses the currently displayed angle and ends in one authored view commit. Hidden-time is not accumulated into a sudden rotation on return.

## 6. Sizing and coordinate contract

Start at **280 × 280 local CSS pixels**, with a fixed **1:1 ratio**, a nominal minimum of **160 × 160**, and a practical authored maximum of **640 × 640**. These are initial visual-review values, not an asset format requirement. Store size using the existing `block/size` property convention, preserving unrelated properties and metadata.

Extend `createFloatingWindowResize` with optional `aspectRatio`. Treat resize as one scalar extent, deriving the other dimension after applying compatible min/max/available-space constraints. Apply the same rule to pointer and keyboard resizing; one commit on completion, Escape/pointercancel rollback. Keep transient preview separate from authored size. Existing unconstrained consumers must remain unchanged.

Pass the runtime's narrow `scale()` accessor to the helper. Core supplies it from the occurrence's existing coordinate context, including a portaled Anchor presentation. Do not infer scale from devicePixelRatio or expose the whole view context to the feature.

| Quantity | Contract |
| --- | --- |
| Authored size and resize result | Local CSS pixels |
| Pointer location and menu anchor | Browser client/viewport CSS pixels |
| Resize movement | Client delta divided by occurrence scale |
| Renderer CSS size and camera aspect | Effective untransformed canvas content-box size |
| Canvas drawing buffer | Effective CSS size multiplied by bounded pixel ratio |
| Camera/geometry | Internal scene units, unrelated to saved Document placement |

Use one ResizeObserver on the owned content box to follow effective layout changes. Change the drawing buffer without letting renderer sizing write back into CSS layout. A narrow column may temporarily fit the square below the nominal minimum instead of overflowing the Document; preserve the larger authored size for restoration. Do not persist a temporary Compact/narrow-layout width.

At 2× Canvas scale the initial pixel-ratio cap may trade sharpness for cost; qualify it visually before adding any scale-aware resolution policy. A CSS transform must not change authored dimensions or scene geometry. No polling, Document-tree reconstruction or standoff measurement changes are needed.

## 7. Minimal authored state and undo

Illustrative DTO fields, in addition to ordinary Block identity and structural ownership:

```json
{
  "type": "3d-object-block",
  "blockProperties": [
    { "type": "block/size", "metadata": { "width": 280, "height": 280 } }
  ],
  "object3D": {
    "version": 1,
    "scene": "coffee-cup",
    "view": { "azimuth": 45, "elevation": 25 },
    "autoRotate": false,
    "lighting": "neutral",
    "settings": { "steam": true, "coffeeStain": false }
  }
}
```

The ratio is fixed by this Block version, so it needs no second persisted aspect field. Use a fixed procedural stain pattern initially; a random seed is unnecessary. Persist angles in degrees, normalize azimuth and clamp elevation on reading. Supply safe defaults for malformed known fields without overwriting source data merely because it was loaded. Unknown scene IDs or unsupported versions show a recoverable descriptive fallback rather than silently becoming coffee.

Use `runtime.setField` for semantic actions and the final orbit/size commit. Read and merge the latest detached field before writing, preserving unknown sibling/nested fields. Settings, view and lighting live in one `object3D` field so **Reset Object** can be one undoable update: reset known scene settings, lighting and view, stop Auto Rotate, but preserve identity, dimensions, anchor metadata, structural position and unknown fields. Resizing updates only the size property collection in one operation.

Do not persist renderer/camera instances, matrices, geometry, lights, observer state, visibility, steam time, animation phase, current fitted distance, pixel ratio or resources. An automatic turntable animation must not dirty the Document every frame. Reopening resumes from the authored view, with a fresh transient animation phase.

Use existing save/load, history and clipboard mechanisms. No new workspace envelope, server endpoint or special history subsystem is proposed. Shared Document occurrences should reflect authored changes while retaining independent resource lifetimes; copying a Block duplicates its declarative settings through existing identity/remapping rules.

## 8. Context menu integration

### Small hosted-widget opt-in

Extend the existing widget mount options with an optional `contextActions()` supplier. Store it on that occurrence's `MountHandle`; have `blockMenuItems` merge its declarative items with normal Block actions. Keep the menu-item data shape in a neutral runtime module if necessary to avoid importing the central editor-dependent menu builder into feature code. Do not add a second menu registry or modify Block-type registration just for these actions.

Add a self-bound `runtime.openContextMenu(clientPoint?)` operation, authorized only for this opted-in mounted widget. The application adapter opens the current context-menu overlay for its own Block using the existing focus/selection behavior. Reuse/factor the small generic open/deduplicate operation; do not teach the global input gateway about coffee or enable editor input for all opaque widgets.

The widget handles right-click/Control-click, Shift+F10/ContextMenu and its visible-on-focus menu button locally. Supply viewport coordinates for pointer invocation and a core-computed root-relative default for keyboard invocation. Dedupe the native contextmenu plus Control-click sequence. Exclude its native controls from canvas orbit handling. Dispose menu contributions with the mount; close or invalidate a menu on mount-generation change so stale actions cannot mutate a removed/remounted occurrence. Revalidate owner/generation on invocation.

### Menu contents

Keep the existing Block operations and add a **3D Object** submenu containing:

```text
View → Front / Side / Three-quarter / Isometric / Top-ish / Reset View
Auto Rotate: Off
Steam: On
Coffee Stain: Off
Lighting → Neutral / Warm / Dramatic
Fit to Object
Reset Object
```

The generic layer supplies View, Auto Rotate, Lighting, Fit and Reset. The coffee descriptor contributes Steam and Coffee Stain using self-bound setting updates. Evaluate current labels/settings when opening the menu; do not capture initial defaults. Menu commands should still work where meaningful if WebGL initialization fails.

**Omit the rotation slider.** The actual menu model supports commands, child menus and text-input forms, not sliders. Dynamic “On/Off” and selected-preset labels provide clear state using its existing button items; checkbox/radio renderers are not required for this first pass. A future slider or generalized property panel is not part of this work.

## 9. Coffee stain and surface contact

Choose a **Block-owned SVG beneath the transparent canvas**, with pointer events disabled and no accessibility noise. Draw a few fixed irregular brown arcs with uneven opacity and sparse marks. Keep it subtle and deterministic across reopening, copying, lighting changes and repeated toggles.

Position it at the projected provider contact origin and derive a small ground footprint from the camera. Update its local SVG coordinates on camera/framing/size changes, not through Document geometry observers. A rotationally symmetric footprint needs no per-frame DOM updates for constant-elevation Auto Rotate. Keep the mug's opaque pixels above the ring and the contact shadow. Contain the decoration within the Block's padded footprint for this pass.

This makes the transparent area reveal the actual Document background while the ring appears on that surface. It does not stain text content, create an annotation, introduce a sibling Block or leave a detached stain after moving/deleting the cup. The stain follows the Block, including an existing anchored presentation.

An in-scene ground ring would simplify true 3D occlusion but couple the mark to scene lighting and the virtual ground plane. The local SVG better expresses a Document-surface mark and avoids extra GPU resources. If contact alignment needs refinement, adjust this local projection; do not introduce a document-wide decoration/standoff provider. The central passive-effect measurement system remains untouched.

## 10. Scheduling, visibility and disposal

Initialize lazily on the first visible, nonzero-size mount. Use one owned IntersectionObserver for viewport/scroll-clipping visibility, one ResizeObserver, page visibility, and reduced-motion preference. An anchored Block may be hidden without unmounting; that case must stop rendering too. Observers only monitor this widget's own DOM, not unrelated Blocks.

The occurrence's requestAnimationFrame loop runs only while visible and changing: steam, Auto Rotate, or an explicitly requested redraw. With both animations off, render on camera, size, settings or lighting changes and then sleep. Pointer changes coalesce to one scheduled frame. At most one frame is pending; never allocate a second loop when toggles change. Freeze clocks offscreen and cap elapsed time when resuming.

Honor reduced motion by suppressing automatic rotation and moving steam at runtime while retaining the authored preferences; display a static subtle steam indication if useful. Manual orbit and menu controls remain available.

On unmount, feature disposal or scene replacement: cancel frames and gestures; invalidate async work; disconnect observers and listeners; release capture; dispose all provider geometry/materials and any generated textures, then renderer resources. Retaining a hidden instance's resources for quick reappearance is acceptable; continuing to animate it is not. Keep disposal idempotent and distinguish provider-owned resources from the generic light/renderer lifetime.

Handle graphics context loss without changing authored data. Stop scheduling, show the local fallback and allow a deliberate rebuild on Retry; no automatic retry loop. Several simultaneous Blocks mean several graphics contexts in this simple design. Test a small realistic set and report limits; do not build a renderer pool or assume unlimited contexts. Removal of one instance must not affect another.

## 11. Approved Spatial compatibility boundary

Desktop Documents are the primary acceptance environment. Canvas uses the existing positive uniform coordinate contract and should need only the narrow scale accessor. Include normal and anchored presentation smoke checks without adding any Anchor feature dependency to the 3D implementation.

**Current restriction:** [`src/application/spatial-actions.ts`](src/application/spatial-actions.ts) rejects a Document containing any `opaque-widget`. Without a change, inserting the new 3D Block into an active Spatial Document would revoke that Document's eligibility. This is a qualification policy inherited from the initial handoff, not a Three.js or DOM limitation.

### Live paper-style Document

Keep `opaque-widget` as the input boundary. Add `spatial-document-compatible` as a separate, explicit capability on existing Block registrations. In Spatial's traversal, reject an opaque widget only when that compatibility capability is absent. Preserve all other structural and identity checks, including nested Window/portal restrictions and at most one authorized live Document root. The new capability is a qualification declaration for trusted first-party code, not a sandbox or automatic proof of safety.

A qualifying widget must:

- Render inside the assigned Document container; any overlays use existing approved overlay mechanisms rather than an independent floating host.
- Use the existing editor/repository/projection and authored state, with no duplicate Document or hidden editor.
- Support mounting, unmounting and repeated activation without leaked observers, listeners, pointer capture, animation or graphics resources.
- Preserve meaningful state across handoff, return and presentation switching; transient gesture and animation state must not become saved placement data.
- Respect focus, existing panels, and the handoff's input restrictions, including return during an active gesture.

Qualify **`3DObjectBlock` and the existing inline Counter** as the first two cases. Do not infer compatibility for CodeMirror, media, iframes, Timer or every application using `mountWidget()`. They remain separate qualification decisions; Timer's current floating Portal is specifically outside this inline contract. No new registry, global widget manager or input middleware is needed.

After activation, use the exact same 3D Block view inside the ordinary, untransformed DOM Document as on Desktop. Its canvas remains transparent, with normal orbit, resize and context-menu behavior. The study renderer and the widget renderer own independent scenes and lifetimes. The page does not become a WebGL editor, and the cup does not become an object in the study scene.

### Paper resting on the desk

Keep the existing bounded, non-live Document preview. Add a generic labelled widget representation so supported widgets are not silently omitted from the preview; “3D Object” is sufficient initially. Fit this into the existing preview digest/drawing path, using registration capability information supplied by the application adapter. Keep coffee settings and geometry out of the central preview renderer. No second editor or per-widget live graphics context is created for a resting paper.

A recognisable static illustration or cached snapshot is a later refinement, not an acceptance dependency for this pass. If added later, refresh it at deliberate lifecycle boundaries such as return to desk, with revision/staleness checks. Do not capture every steam/rotation frame, persist generated thumbnails as authored scene state, or create a general snapshot-provider framework now.

### Focused handoff qualification

Verify opening a Document already containing the widget and inserting it while the Document is active. Insertion must leave the existing live Document active. Exercise orbit, resize, menu/focus restoration, undo/redo, return during a gesture, repeated activation and Desktop/Canvas/Spatial switching. Ensure the return path cancels unfinished widget previews without a late authored commit and releases resources when the live occurrence unmounts. Preserve the saved physical page placement throughout.

Test the study and widget graphics contexts together, including failure of either renderer: the other must remain independently usable where its host is still available, with authored data retained. Check a small realistic number of 3D widgets; no renderer pooling programme is implied. If safe handoff requires substantial core input or lifecycle rearchitecture, report that specific blocker rather than broadening this feature.

## 12. Likely files

| File or area | Planned change |
| --- | --- |
| New `src/features/three-d-object/index.tsx`, `model.ts` | Registration, insertion action, declarative defaults/validation and state helpers |
| New feature `view.tsx`, `view.css`, `menu.ts` | Inline wrapper, mount/menu integration, sizing, fallback and semantic actions |
| New feature `scene-runtime.ts`, `camera.ts`, `interaction.ts` | Lazy Three runtime, lights, framing, turntable and scheduler; combine files if they remain small |
| New feature `coffee-cup.ts`, `coffee-stain.tsx` | Procedural content, steam and local surface decoration |
| `src/feature-api/index.ts`, `src/application/feature-capabilities.tsx` | Opt-in mount actions, self menu opening and read-only coordinate scale |
| `src/runtime/mounts.ts`, `src/runtime/block-menu-actions.ts` | Mounted action supplier, merge into existing Block menu; optional neutral `block-menu-types.ts` |
| Small shared menu-opening helper; `src/input/gateway.ts` if factoring its current opener | Reuse current overlay/deduplication behavior; preserve opaque-widget input exclusion |
| `src/rendering/floating-window-resize.tsx` | Optional ratio constraint, without changing existing consumers |
| `src/application/features.ts`, `src/configuration.ts` | Assembly and default-on flag |
| `src/application/spatial-actions.ts`, `src/features/canvas-counter/index.tsx` | Separate Spatial compatibility from input classification; explicitly qualify the inline Counter alongside the new 3D Block |
| `src/application/spatial-document-preview.ts`, `src/features/spatial/document-preview.ts` and its existing drawing code | Bounded generic labelled-widget preview; no live renderer or coffee-specific scene logic |
| Focused feature/shared-helper tests and `scripts/check-3d-object-browser.mjs` | State, gesture, lifecycle and real rendering checks |
| Removal script based on `scripts/check-anchor-removal.mjs` | Disposable-copy build without feature source/assembly wiring |

No changes are expected to repository schemas, Document identity, server persistence, standoff rendering, Grouping, Entity References, Compact policy or Spatial scene code. Any discovered need for substantial changes there should be reported before expanding the implementation.

## 13. Implementation sequence and acceptance

1. **Hosted shell and authored state.** Register the default-on feature, insert an ordinary Block, save/load its declarative payload and confirm unknown-type preservation. Establish the menu opt-in and coordinate accessor with a small self-contained view.
2. **Static visual slice.** Add the lazy transparent renderer, procedural hollow mug/coffee/handle, neutral lighting, contact shadow and fitted camera. Review default, side and high views before adding animation.
3. **Interaction and size.** Add bounded orbit, presets, accessible controls, locked resize and one-commit undo/cancellation. Verify surrounding Document editing and menu focus remain ordinary Codex.
4. **Semantic scene controls.** Add restrained steam, slow Auto Rotate, lighting and deterministic SVG stain. Complete Reset/Fit behavior and scheduling/visibility/resource cleanup.
5. **Spatial qualification.** Introduce the separate compatibility declaration and qualify the inline Counter and 3D Block in the existing live DOM handoff. Add the generic resting-paper widget label. Preserve all other eligibility checks and prove insertion does not revoke an active Document.
6. **Focused qualification and removal.** Capture visual evidence and resource observations, run relevant checks, perform physical removal, and produce an implementation report. Stop for review; do not expand into another scene or broader 3D authoring.

### Focused verification

| Area | Essential checks |
| --- | --- |
| State/history | Defaults, invalid known values, unknown fields/version/scene, save/reopen, copy, shared-content occurrences, one orbit/resize history entry, toggle/reset undo/redo, no animation writes |
| Resize/coordinates | Fixed ratio and bounds; pointer and keyboard cancellation; effective narrow width restores authored width; 0.5×/1×/2× Canvas size and menu positioning; unchanged Timer/window resize behavior |
| Menus/input | Right-click and macOS Control-click open exactly once without orbit; keyboard menu/presets; normal scroll; Tab/focus restoration; removal with menu open; pointer cancellation and stale action rejection |
| Graphics/lifecycle | Real WebGL render; idle frame count stops; offscreen, hidden anchor and background tab stop frames; resume without jump; late import after removal; repeated mount/unmount; context failure/retry; two to four independent instances |
| Document integration | Type/select/undo in adjacent text; Block selection/removal/reordering; Compact/narrow layout; one ordinary anchor hide/show/reflow case |
| Spatial handoff | Existing/inserted 3D and Counter Blocks stay eligible; one live Document root; orbit/resize/menu/focus; return during a gesture; repeated activation and presentation switching; independent graphics failure/cleanup; physical placement unchanged; unqualified widgets and nested Window/portal shapes remain restricted |
| Resting-paper preview | Generic widget label present within existing digest bounds; no hidden editor, live widget renderer or animation-driven texture regeneration |
| Visual review | Mug hollow/rim/coffee/handle readable; steam subtle and unclipped; cup grounded without viewer rectangle; stain contact plausible; all presets; min/default/large sizes; one light and one dark background |

Use unit tests for meaningful state/framing/ratio/gesture edge cases and mounted adapter tests for ownership/menu cleanup. Use the existing browser-harness conventions for actual WebGL, focus, clipping and pointer behavior; DOM-only tests cannot establish graphics quality. Run client typechecking, production build and focused existing runtime/resize/menu/hosted-Block suites affected by the changes. Broad input, IME, Entity or Grouping qualification should remain inexpensive adjacent-editing smoke checks, not a new architecture programme.

For physical removal, use a disposable copy: delete the feature directory and its assembly import/activation, build, load a saved Document containing the Block, edit adjacent content, save/reopen and verify the entire unknown payload survives. Restore the feature and verify settings render again. The generic menu and coordinate additions must remain usable without importing any 3D code.

Capture a small screenshot set: default cup on a real Document, side/Top-ish views, stain on/off, focused controls/menu, and resized/narrow layout. Include the live cup in the activated Spatial Document and the resting-paper widget label. Include a short reproducible orbit/steam and activation/return sequence or recording where practical. Record frame-count/resource observations rather than claiming a general performance guarantee.

Acceptance is a visually convincing, editable-document-friendly cup with reusable internal scene ownership, accurate persisted semantics and clean disposal. A feature that saves correctly but resembles an opaque viewer box, clips its handle/steam, traps scrolling or leaks animation after hiding is not complete.
