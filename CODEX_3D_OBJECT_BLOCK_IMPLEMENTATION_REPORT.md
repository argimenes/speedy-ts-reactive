# 3DObjectBlock implementation report

## Result and how to try it

The coffee-cup vertical slice is implemented and enabled by default through `threeDObjects`. Refresh the application, open a Document, then use its Block context menu: **Add Block → 3D Object — Coffee Cup**.

Drag the cup to orbit. The corner handle resizes it proportionally. Right-click, Control-click, or the **•••** button opens the ordinary Block menu; its **3D Object** submenu contains View presets, Auto Rotate, Steam, Coffee Stain, Lighting, Fit to Object and Reset Object. With the canvas focused, arrows adjust the view, Home resets it, Escape cancels a gesture, and Shift+F10 opens the menu. Existing menu Undo/Redo actions remain available; ordinary text-editor shortcuts continue to work when editing adjacent text.

The same Block works in Desktop, Canvas and the activated Spatial Document. Papers resting on the Spatial desk contain bounded generic widget labels, with no live embedded scene or hidden editor. The study's composition and existing decorative cup have not changed.

## Ownership and implementation

The feature lives in [`src/features/three-d-object/`](src/features/three-d-object/). It is an ordinary structurally owned `3d-object-block`, registered as a hosted application. The view receives a self-bound `BlockRuntime`; it does not receive the editor, repository or projection.

- The generic runtime owns the transparent renderer, perspective camera, light rig, framing, scheduling and graphics disposal.
- The internal content interface supplies a group, stable bounds/contact origin, settings application, animation and disposal. The sole definition supplies the coffee provider, its semantic actions and SVG surface treatment. There is no public provider registry.
- Coffee geometry is procedural: a revolved hollow wall/rim, curved tubular handle and recessed dark liquid. Three bounded shader ribbons provide steam; no models, external textures or asset library are loaded.
- Each occurrence owns its own canvas, resources, observers and animation phase. Three.js and scene content load lazily. Late initialization is guarded by an occurrence generation, and content created for a stale generation is disposed.
- Geometry, material and renderer resources are disposed when the occurrence goes away. A deliberate graphics retry replaces the lost canvas before constructing a new renderer.

Authored state consists of the existing `block/size` property and a versioned `object3D` field containing scene ID, view angles, Auto Rotate, lighting and scene settings. Semantic edits preserve unknown fields, including nested settings/view fields. Orbit and resize preview locally and commit once. Animation never writes repository state. Stopping Auto Rotate deliberately saves its displayed angle; lighting or steam changes do not restart its phase. Reset Object preserves Block identity, structural position, dimensions, anchor metadata and unknown fields.

The view stays square, initially 280 CSS pixels, with nominal authored limits of 160–640. The effective layout can shrink below the nominal minimum without changing saved dimensions. Using percentage width with the authored maximum avoids forcing a narrow grid column to the stored width. Camera framing uses stable bounds including the handle and steam, rather than tracking animated geometry.

## Narrow shared changes

| Boundary | Result |
| --- | --- |
| Hosted menus | An optional mounted `contextActions()` supplier, self-bound menu opening and an own-menu-open accessor. Core combines these actions with normal Block actions and owns the overlay. Stale action callbacks are guarded; disposing the occurrence closes its menu. |
| Menu data/opening | The existing item shape moved to a neutral type file. Core input and opted-in widgets share one opening/deduplication helper. Opaque-widget input exclusion remains intact. |
| Coordinates | `BlockRuntime.scale()` exposes only the existing cumulative scale accessor. Resize converts client deltas to local CSS pixels; menu anchors remain client coordinates. |
| Resize | Optional fixed ratio in the existing helper, including keyboard changes and cancellation. Existing unconstrained consumers retain their behavior. |
| Presentation qualification | `spatial-document-compatible` is independent of `opaque-widget`. Only the new 3D Block and existing inline Counter receive it. |
| Resting-paper digest | One generic widget-label variant in the existing bounded digest and painting path. No coffee geometry, animation, texture snapshots or editor instances enter that path. |

Qualification found two additional existing eligibility checks beyond Spatial's subtree check: presentation switching and Canvas Document-root qualification. Both now recognize the same explicitly qualified inline widgets. Existing media exceptions and restrictions for other opaque applications remain; nested Window/portal and single-live-root restrictions remain unchanged.

The widget responds to standard `inert`/`hidden` state on its own ancestry. This cancels a captured preview during Spatial return without introducing a Spatial class-name dependency or changing Spatial's gesture engine. One bounded mutation observer watches those ancestor attributes; resize/intersection observers watch the widget itself.

## Visual review and modest adjustments

I inspected browser captures at the default, minimum and large sizes, all five presets, warm lighting, a dark background, Canvas and the live Spatial Document. The rim has visible thickness and an inner wall, elevated views expose the coffee, and the handle remains part of the framed silhouette. The transparent canvas leaves no background rectangle; the dashed outline appears only with focus. Steam is deliberately faint, and the small SVG shadow/ring stays beneath the cup.

The implemented starting values use a 32° FOV instead of the plan's approximate 35°, explicit tone mapping, a simple three-light rig and conservative full-envelope fitting. Isometric remains an isometric-direction perspective view. These are modest visual choices within the approved discretion. The stain is a fixed irregular SVG ring; it moves with the Block and does not alter Document text or become a separate annotation.

Review evidence:

| View | Capture |
| --- | --- |
| Default, transparent Document surface | [Desktop cup](artifacts/three-d-object/desktop-default.png) |
| Stain and semantic controls | [Stain](artifacts/three-d-object/desktop-stain.png), [menu](artifacts/three-d-object/semantic-menu.png) |
| Useful inspection directions | [Front](artifacts/three-d-object/view-front.png), [Side](artifacts/three-d-object/view-side.png), [Three-quarter](artifacts/three-d-object/view-three-quarter.png), [Isometric](artifacts/three-d-object/view-isometric.png), [Top-ish](artifacts/three-d-object/view-top-ish.png) |
| Lighting/background | [Warm](artifacts/three-d-object/lighting-warm.png), [dark/Dramatic](artifacts/three-d-object/dark-dramatic.png) |
| Size limits | [160 pixels](artifacts/three-d-object/size-160.png), [640 pixels](artifacts/three-d-object/size-640.png) |
| Real presentation hosts | [Canvas](artifacts/three-d-object/canvas-live-document.png), [Spatial live Document](artifacts/three-d-object/spatial-live-document.png), [resting paper](artifacts/three-d-object/spatial-resting-preview.png) |

## Verification

The automated browser runs use isolated Chrome profiles, actual WebGL through SwiftShader, in-memory Documents and captured DTOs. They do not save test Documents to the user's server. Screenshots were inspected directly; browser automation is not presented as human-operated or hardware-GPU qualification.

- **56 focused tests passed** across nine suites: hosted capabilities, resize, object state/framing, Spatial authorization/preview, workspace switching, Canvas actions and feature lifetime. [Test log](artifacts/three-d-object/unit-tests.txt)
- **36 object browser checks passed:** real geometry, animation without authored writes, idle/hidden/offscreen suspension and reentry, two independent objects, native adjacent typing, real insertion through the menu, Control-click/keyboard menus and focus, orbit undo/cancellation, ratio resize at 0.5×/1×/2×, narrow-width restoration, reduced motion, save/reopen, disabled/unsupported fallbacks, initialization failure and retry. [Results](artifacts/three-d-object/browser-results.json)
- **20 Spatial/Canvas browser checks passed:** existing and newly inserted live widgets, Counter, Compact, an ordinary Anchor Relationship, menu behavior, cancellation on return, unchanged desk placement, repeated activation, independent graphics failure/retry and presentation switching. [Results](artifacts/three-d-object/spatial-results.json)
- **3 physical-removal browser checks passed:** the feature directory and assembly wiring are removed in a disposable copy. Its production build and browser checks verify unknown-Block fallback, complete authored-payload round-trip and adjacent editing. The working source is never removed. [Removal results](artifacts/three-d-object/removal-results.json), [removal build](artifacts/three-d-object/removal-build.txt)
- Client and server typechecks passed. Production client build passed; Vite reports a large main-chunk warning. Three.js and coffee rendering code are split into lazy chunks. [Build log](artifacts/three-d-object/build.txt)

Three existing Timer tests failed in the supplementary Timer suite. Running that suite against an isolated, unchanged `HEAD` reproduced the same three failures: one expects no mounted unknown fallback after module disposal, and two assume Timer is the only/first document action despite Entity References. They were not changed as part of this feature. [Baseline evidence](artifacts/three-d-object/timer-baseline.txt)

Reproduce with Node 22 and a running Vite server:

```sh
node scripts/check-3d-object-browser.mjs
node scripts/check-3d-object-spatial-browser.mjs
node scripts/check-3d-object-removal.mjs
```

The browser scripts default to `http://localhost:3000/`; `OBJECT_URL` selects another Vite URL and `CHROME_BIN` selects Chrome. Removal starts and closes its own temporary server.

## Limits and review boundary

WebGL 2 is required for the live object; failure preserves authored state and offers Retry. Safari, mobile touch hardware and hardware-GPU performance have not been qualified. Two simultaneous live cup instances plus the study were exercised; there is deliberately no renderer pool or promise of unlimited graphics contexts.

The resting-paper representation is a generic label, not a cup thumbnail. Snapshots remain deferred. Only coffee is implemented, and only the 3D Block and inline Counter have the new compatibility declaration. Existing unrelated applications retain their previous restrictions. No broader Spatial, model-import, scene-authoring, persistence or input architecture work was undertaken.

Implementation is ready for user review; no further scene or Spatial expansion is included.
