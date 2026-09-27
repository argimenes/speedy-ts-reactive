# Canvas Milestone D — bounded interactions and object actions

Status: **implemented; stop for review before Milestone E.** The accepted C baseline remains commit `a14d2ef` (`Milestone C`). This implements D of the [approved plan](CODEX_CANVAS_WORKSPACE_PRESENTATION_PLAN.md), with the [C constraints](CODEX_CANVAS_MILESTONE_C_REPORT.md) retained.

## Result and access

An opened canonical workspace now has background pan, pointer-anchored zoom, reset/fit, single-object selection, move/resize handles, ordering, activation, non-destructive removal, add-existing/reveal, and small new Document Window, image and Counter actions. `canvasWorkspace` remains **disabled by default**. Development opt-in:

```sh
VITE_CANVAS_WORKSPACE=1 npm run dev:client
```

Open a local or server Workspace, then choose **Workspace → Presentations → Canvas**. The original split demo is still a separate host. Existing layouts, including empty ones, are never regenerated. Multi-selection, reverse derivation, graph drawing, general pan/zoom APIs, History extraction and Text Superposition were not added.

## Ownership and coordinates

[Canvas interactions](src/features/canvas/interactions.ts) and [Canvas controls](src/features/canvas/view.tsx) receive bounded operations and allowed render roots, not `ReactiveEditor`, tree lookup, or editable DOM access. [Application actions](src/application/canvas-actions.ts) adapt these operations to the existing repository and presentation store. The existing provider and `BlockOutlet` mount the live DOM/CSS/SVG editor. There is still one editor, repository and projection, with only the active presentation mounted.

The coordinate contract remains `viewportLocal = zoom × (world − camera)`. Camera positions and placement bounds are Canvas world units. Pointer deltas divide by the captured zoom. Modified-wheel anchors subtract the viewport's client origin before conversion. Native caret hit testing retains client coordinates; centralized standoff measurement retains A's existing scale conversion. Desktop's identity-coordinate path is unchanged.

Core's optional [Window resize port](src/rendering/window-geometry.ts) supplies presented size, current minimum dimensions and conversion back to expanded dimensions. This is the only additional core geometry capability. Canvas outer handles consume it; they do not infer margin width or implement Compact policy. Inner Windows retain their normal presentation machinery at local `(0,0)`. Explicit Compact resizing adds the existing reduction back before saving. Automatic narrow collapse remains distinct. Desktop position, size, state and z-index are not edited by Canvas operations.

During gestures, signals hold previews and animation frames coalesce DOM updates. Pointer completion commits one layout update. Escape, pointer cancellation, lost capture, browser blur, switching and disposal cancel and restore saved geometry. Listeners and capture belong to the active gesture. A temporary shield covers embedded frames only while an outer interaction owns input; every finish/cancel path removes it. A browser check caught inner Window stacking above the resize handle; scoped handle stacking now fixes this.

Background wheel pans; **Alt+wheel** zooms at the pointer. Ctrl/Meta wheel and document/form/iframe wheel remain native. Camera controls use 0.1–4× limits; the existing wider persisted-data validation remains compatible. Reset is 100%; fit uses saved bounds and viewport dimensions. Image hosts resize freely while `object-fit: contain` preserves the image's intrinsic aspect ratio. The transformed world advertises its transform to the compositor; there is no virtualization, new observer or polling loop.

Wheel previews settle after 160 ms without another event. Save synchronously settles the latest preview through an owned `finish/cancel` lifetime before capturing the presentation clock. Pointer gestures, including completion outside the viewport, do not write authored history. Switching cancels before unmount. B's captured-revision save acknowledgement remains intact.

Keyboard actions live on named Canvas handles: arrows move by 10 units (Shift: 1), Enter activates the existing editor, Delete/Backspace remove only that placement, and Escape clears Canvas selection or cancels its owned gesture. Toolbar controls provide move/order/remove equivalents. Removed controls return focus to the Canvas viewport. Canvas chrome is outside editable mounts; native input and current text-operation routing remain unchanged. No typing event traverses the Canvas controller. The only global interaction listeners exist during an owned gesture; the pre-existing composition completion handling is retained.

## Content membership, applications and media

New content is inserted once through existing tree commands into a `workspace-object-bank-block`. The directory/layout candidate is validated before insertion; a failed insertion publishes neither content nor directory entries. Documents have stable identities and UUID filenames in the existing document-store root (`.`), so saving does not require creating a new folder. Existing resource locations and server conflict/History restrictions are unchanged.

[The core bank view](src/rendering/workspace-object-bank.tsx) lists stored children on Desktop and opens one on demand. It does not automatically lay them out, clone them, or derive Desktop wrappers. This retained access works with Canvas physically absent. Ordinary content undo may leave a preserved unresolved Canvas placement, using the existing placeholder behavior; layout has no new undo system. Removing a placement retains its directory entry, membership, authored payload and any Desktop occurrence. Add-existing reveals an existing placement rather than duplicating it; missing/unavailable entries remain listed and produce an explanation.

Only Timer currently uses the hosted Block Application boundary; its Portal UI is not a clean inline pilot. Checkbox and code views remain core views. The approved **Counter fallback** therefore supplies the small real `BlockRuntime` application. It is hosted inside an existing Window and has only its own authored field, widget mount and owned lifecycle. Every increment/decrement commits immediately, with no draft, timer, observer or editor/window access. Separate instances and removal/remount preserve independent authored counts. Counter is activated with the Canvas flag; removing its implementation leaves its unknown authored payload intact.

Qualified render roots are ordinary Windows, images, the pilot, and bounded existing iframe/media hosts. Portal Windows and other opaque applications remain placeholders. Nested unqualified embedded applications retain C's guard. Direct iframe/PDF/HTML views use the same existing iframe renderer; Canvas sizes their outer rectangle and never inspects their editable contents. An open frame prevents silent removal or presentation switching. **Close embedded media (discard form drafts)** explicitly unmounts it; reopening starts a new frame. Native frame focus and a same-origin draft surviving an outer move are browser-qualified. This does not promise persistence of embedded forms, an external PDF viewer's internal state, or arbitrary third-party apps.

YouTube retains its existing iframe renderer and no-autoplay policy. Its playback is ephemeral and resets on remount; there is no playback-position persistence or media suspend API. Streaming/network playback and every provider-specific control were not qualified. Mounted opaque frames on Desktop still require their existing completion/close path before switching; D does not provide a universal safe-unmount mechanism for them.

## Qualification

**211 tests across 26 focused suites passed, run in batches.** Coverage includes presentation and identity/persistence, actual host Open/Save/Save As, server HTTP/filesystem storage, Canvas actions and gestures, native/cross-Block input, Grouping and bindings, Compact, Window behavior and coordinate helpers. New cases cover:

- One pointer commit at three scales; all cancellation paths; latest-preview settlement; anchored/coalesced wheel and browser-zoom exclusion.
- Creation rollback, one bank, add-existing identity assignment, non-destructive removal/re-add, independent application instances, and authored state after remount.
- Local/server bundle round-trip, flag-off preservation, recovery after re-enabling, and an actual HTTP Save As/Open of bank Documents and application/presentation data.

`npm run typecheck`, the client/server production build, and `git diff --check` passed. Existing large-chunk and browser-mapping-age warnings remain.

[The D Chrome script](scripts/check-canvas-milestone-d-browser.mjs) passed **75 checks** in Chrome 153.0.8010.53. It includes C's live editing/focus/undo and shared-Document checks; 0.5×/1×/2× typing, SVG alignment, move and resize; cross-Block and Grouping selection; Entity panel isolation and selection restoration; real IME completion; Compact resizing; native Backspace/wheel precedence; background pan/anchored zoom; pointer cancellation and completion outside the viewport; save during a gesture; application remounts; image fitting; and iframe focus, draft retention, shielding and explicit-close guards.

The original [A browser suite](scripts/check-canvas-milestone-a-browser.mjs) also passed **107 checks**, including Control-held Grouping, keyboard selection, margin/drawer focus, automatic narrow collapse, expanded-width restoration and Desktop identity coordinates. A was also run against the accepted C baseline. Startup SVG assertions were timing-sensitive during concurrent software-rendered profiling; the isolated D and baseline runs passed. The final D run uses Chrome's normal GPU choice and an isolated profile.

Browser saves capture and materialize local DTOs/server bundles in memory. Actual HTTP/file writes use temporary directories in the server suite; local file chooser/writer behavior remains covered by host mocks. No user workspace was modified. No typing benchmark was rerun: D changes Canvas-owned gestures and an optional Window binding, not the ordinary Desktop typing/coordinate path.

Reproduce the final browser run against Vite on port 5187:

```sh
CANVAS_SOFTWARE_GPU=0 node scripts/check-canvas-milestone-d-browser.mjs
node scripts/check-canvas-removal.mjs
```

A's script requires a server started with `VITE_CANVAS_MILESTONE_A=1`. Scripts also support `BENCHMARK_URL` and `CHROME_BIN`.

## Performance and physical removal

[Recorded results](CODEX_CANVAS_MILESTONE_D_BROWSER_RESULTS.json) use a 2400×1800 viewport and Apple M1/ANGLE Metal. Each cohort runs 90 anchored zoom frames, discarding the first three intervals:

| Cohort | Objects / mounted Blocks | Median | p95 | Maximum |
| --- | --- | --- | --- | --- |
| Two shared Document Windows with effects/margins, image, Counter Window, new Document | 5 / 24 | 16.6 ms | 17.5 ms | 17.7 ms |
| Above plus 20 Document Windows, 480 standoff characters each | 25 / 84 | 16.7 ms | 17.6 ms | 29.5 ms |

Both retained exactly the same mounted nodes and authored SHA-256 hash, with zero repository revisions and one settled layout revision. These are bounded fixture results, not arbitrary media/object-count guarantees. Exploratory forced-SwiftShader runs were substantially slower and split wheel bursts at idle boundaries; they do not establish a software-rendering frame budget. The evidence does not justify a virtualization framework.

[Physical removal](scripts/check-canvas-removal.mjs) deletes Canvas controls/controller, Counter, Canvas actions/derivation, the Canvas composition view/CSS and presentation menu from an isolated source copy. Static application assembly selects Desktop and removes the Canvas-specific session adapter branch. No substitute renderer is installed. The retained core wire parser, object directory resolver, snapshot merge, bank view and generic coordinate/Window seams remain.

That copy passed type checking, a Desktop/native editing and bank-access/opaque-save test, and the client/server production build. It preserves Canvas camera/bounds, unknown presentation fields and unknown Counter data through saving/reopening. The main-tree disabled/re-enabled test confirms the preserved layout resolves again. Temporary copies are deleted; the working implementation remains installed.

## Future Spatial and review boundary

No Spatial fields, Three.js, scene graph, texture editor, generalized camera/renderer/gesture registry or speculative suspension API was introduced. Canvas's camera, preview state, transforms, selection and actions are explicitly 2D and presentation-specific. Shared identities and authored content stay independent of layout. Unknown independent presentation envelopes survive round-trip.

C's `WorkspaceSession.canvasRoots` and static presentation dispatch remain explicit application adapters, now with a bounded app/media qualification list. These are Canvas-specific branches, not a universal assertion that every presentation has DOM roots or an x/y camera. A future Spatial presentation will need its own assembly and activation policy. The generic owned interaction lifetime has only finish/cancel semantics and carries no Canvas coordinates.

The optional resize port describes a live rectangular DOM Window. A future Spatial representation can still resolve the same content and activate that full-fidelity DOM editor in an aligned screen rectangle. Nothing added in D requires WebGL text, rasterized editing, duplicated documents or a replacement selection/effect engine. Spatial browsing proxies, transitions and their relationship to live DOM activation remain future decisions, not implemented contracts.

Milestone E remains separately reviewable. Bank access is not reverse derivation: D does not manufacture a Desktop layout or reparent bank content into Desktop wrappers. **Stopped for review before E.**
