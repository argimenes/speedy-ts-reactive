# Spatial Milestone C — Restrained desk arrangement

Status: **accepted**, including manual confirmation of physical dragging and activation/editing after arrangement. The accepted C baseline is `fe3a6ea` (`Dragging, etc`). [Milestone D](./CODEX_SPATIAL_MILESTONE_D_REPORT.md) follows this baseline. The qualification results below describe C at completion; D reports the subsequently discovered live-preview subscription gap.

## Baseline and scope

The accepted B baseline is commit **`4481beb` (`3D verified`)**, including the user's manual confirmation of proxy creation, activation and live editing. C adds movement, heading rotation, lying/propped posture, overlap recovery and accessible controls. The physical 150° desk, A4-like page size, perspective default, ±45° swivel and procedural environment remain intact. Spatial retains its existing default-off feature flag; this checkout's ignored `.env.local` opts in for local use.

No core editor/input, repository, selection, Window geometry or persistence-format changes were needed. There remains one editor/repository/projection and at most one authorized live Spatial Document root. No hidden editor or live preview was introduced.

## Interaction and ownership

Drag a placed paper or photograph to move it; background drag retains A's swivel behavior. The existing raycaster identifies the object and the camera converts pointer coordinates to an intersection with the fixed desk plane. A four-CSS-pixel threshold distinguishes selection from movement. The original intersection is retained, so selecting a propped page does not jump its anchor to the point underneath the pointer.

The feature-owned controller captures exactly one pointer. It retains the starting placement, latest proposed placement and one pending animation-frame preview. The scene applies preview transforms to its existing meshes without rebuilding textures or geometries. Pointer completion settles one sidecar change and releases capture. Preview is not authored storage.

Escape, pointer cancellation, lost capture, window blur, hidden-document state, viewport resize, presentation switching, stale/missing targets, graphics failure and disposal cancel unfinished movement. Save uses the existing presentation interaction owner's `finish()` before capture, including a pending pointer delta that has not reached a preview frame. Completion from a different pointer is ignored. Expected-placement checks reject stale writes; arrangement is unavailable while the live editor owns the surface.

The existing application assembly adds one semantic operation: `arrange(objectId, change, expectedPlacement)`. Changes contain only desk position, heading, posture or a request to bring the item to the top. The feature receives no editor or arbitrary authored-DOM access. No observer, polling, generic gesture middleware or layout registry was added.

## Desk constraints, overlap and controls

Movement and rotation keep a conservative bounding disc around the page's projected footprint inside the existing annular desk sector, with 15 mm radial edge clearance. Posture changes use the same constraint and may shift an anchor inward enough to keep the whole page on the desk. Stored dimensions never expand to fit editing. Existing saved placements are not normalized on load; constraints apply to explicit arrangement operations.

Physical placement-array order supplies deterministic vertical clearance: the original 12 mm base plus 2 mm per item. Mesh render order follows the same sequence, with normal depth testing retained. **Bring to top** moves an item to the end of that existing array. Coplanar lying papers have stable separation; propped objects retain physical depth and may occlude one another. This is restrained desk placement, not collision physics: differently angled papers can intersect, and decorative props do not impose collision zones.

**Workspace objects** remains the accessible recovery route for covered and offscreen items. Selecting a placed, resolved Document or image exposes labeled movement/rotation buttons, **Lay flat**, **Prop up**, **Bring to top**, and **Arrange with keyboard**. The object list opens above the arrangement dock.

| Focused study keyboard action | Result |
| --- | --- |
| Arrows in arrangement mode | Move 1 cm in desk coordinates |
| Shift + arrows | Move 1 mm |
| `[` / `]` | Rotate heading 5° |
| Shift + brackets (`{` / `}`) | Rotate 1° |
| L / P | Lie flat / prop up |
| Escape during drag | Discard unfinished movement |
| Escape when idle in arrangement mode | Restore view controls |
| Enter | Activate the selected eligible Document |

Native buttons, the object list and **Read Document** also work without canvas shortcuts. Shortcuts are scoped to the focused study canvas; they do not intercept editing. Movement arrows use fixed desk axes, including when the camera is swivelled. Unplaced or unresolved entries remain visible but cannot be arranged through this milestone's controls.

## Persistence and editing continuity

Settled changes use the existing version-1 Spatial sidecar. Unknown environment/layout/placement/position fields survive. The shared directory and repeated Document identities remain unchanged; local and manifest round-trip retain all three presentations and one shared Document payload. Desktop/Canvas geometry and the authored repository are unchanged by arrangement.

Authored undo/redo remains separate from presentation changes. Cancel discards an unfinished gesture; completed layout changes are adjusted with the arrangement controls and saved with the workspace. No cross-domain history or new workspace format was introduced.

B's pickup derives its physical home pose from the current arranged placement and deterministic clearance. Forward/reverse transforms remain transient. Both lying and propped Documents activate into the existing untransformed DOM slot and return to exactly the saved arrangement. Arrangement controls disappear during editing. The camera, page dimensions and desk geometry were not changed to simplify alignment.

## Qualification

The [review gallery](./artifacts/spatial-c/index.html) contains six captured views: original study, transient drag, lying page, propped page, live editing after arrangement, and recovery of an overlapping photograph. The screenshots retain deliberately schematic page/image fixtures; richer previews are not part of C.

| Check | Result |
| --- | --- |
| Focused tests | **206 passed in 23 suites**: arrangement math/controller, Spatial authorization, workspace/session assembly, selection ownership, cross-Block selection, standoff editing, Grouping, Entity and Compact. [Output](./artifacts/spatial-c/focused-tests.txt) |
| C Chrome browser | **35 checks passed**: captured movement, one settled commit, preview resources, cancellation, stale targets, save during movement, keyboard/fine steps, posture, overlap recovery, outside-viewport completion, unknown fields, all-layout/shared identity, missing references, and activation/return after arrangement. [Results](./artifacts/spatial-c/browser-results.json) |
| B browser regression | **69 checks passed**: ordinary input/selection, representative SVG alignment, Grouping, native controls, Entity focus/selection restoration, composition deferral, margins/drawers, Compact/narrow behavior, undo/redo, root ownership, shared identity, switching, reduced motion, graphics loss/retry, repeated activation/return and terminal alignment. [Results](./artifacts/spatial-c/b-regression/browser-results.json) |
| Resource ownership | Drag previews retained geometry/texture counts. B's eight repeat cycles plateaued at **137 geometries, 13 textures, zero live Document roots after return**. No persistent render loop was added. |
| Typecheck and production build | Both passed. Existing chunk-size and stale browser-mapping advisories remain. [Typecheck](./artifacts/spatial-c/typecheck.txt), [build](./artifacts/spatial-c/production-build.txt) |
| Physical removal | Spatial source/application implementation physically removed in an isolated copy; TypeScript, production build and Desktop/Canvas editing/opening/save/reload test passed. Unknown Spatial sidecar data survived. [Output](./artifacts/spatial-c/removal.txt) |

Browser checks used Chrome **153.0.8010.53**, Node **22.12.0**, macOS on the Apple M1, native ANGLE/Metal rendering, an isolated browser profile and in-memory fixtures. No server Documents were written. Both `localhost:3000` (development) and the rebuilt `localhost:3002` application use the local opt-in; use the former for the browser harness.

The pointer tests use Chrome's real DOM pointer/capture path through CDP. They do not constitute a human mouse/trackpad ergonomics pass. Safari and human-operated OS IME remain the explicit B qualification limits; C did not change those input paths. No new controlled typing benchmark was run for this feature-local arrangement change, so C makes no new timing-regression claim. Captured views were inspected for physical scale and control visibility; sustained manual arrangement is part of review.

Reproduce with Node 22 and an opted-in Vite server on port 3000:

```sh
CANVAS_SOFTWARE_GPU=0 node scripts/check-spatial-c-browser.mjs
BENCHMARK_URL=http://localhost:3000/ CANVAS_SOFTWARE_GPU=0 \
  SPATIAL_ARTIFACT_DIR=artifacts/spatial-c/b-regression \
  node scripts/check-spatial-b-browser.mjs
node scripts/check-spatial-removal.mjs
npm run typecheck
npm run build
```

## D candidate and boundary

Recorded in the approved plan: investigate a lightweight, non-live preview that makes physical Documents recognisable from actual title/layout, headings, images and significant standoff features. It must not create hidden duplicate editors or regenerate textures per keystroke. This is a candidate for D, not implemented work or a commitment to a particular snapshot design.

C required no broader architectural generalization. Future preview work can reuse the existing feature-owned proxy lifetime and must preserve this separation between settled physical placement, transient animation, and ordinary live DOM editing. **D has not begun; stop here for review.**
