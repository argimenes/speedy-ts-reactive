# Spatial Milestone A — study foundation and architecture proof

Status: **implemented and qualified; awaiting review before Milestone B**.

Baseline: `e869c2b` (accepted Spatial planning; Canvas A–E retained). This implements A only. The study contains physical proxies; no Spatial live Document editor, activation animation, arrangement tools, weather, music, acquired textures/models or generalized presentation framework was added.

## Review and launch

- [Captured-view gallery](./artifacts/spatial-a/index.html): 14 implementation captures, with paired camera comparisons and captions.
- [Browser results](./artifacts/spatial-a/browser-results.json): individual checks, resource observations and camera checkpoint timings.
- [Review workspace](./artifacts/spatial-a/study-review.workspace.json): the self-contained five-object browser fixture; open with **Workspace → Local files → Open Workspace…** on the opted-in application.

The opt-in development preview is running at **http://127.0.0.1:5188/**. Choose **Workspace → Presentations → Create Spatial**. An existing Spatial layout appears as **Spatial** instead. A fresh workspace starts with an empty desk; **New Document**, **Open Document from Server…**, and **Open Image…** add real workspace content represented by proxies. Use **Return to Desktop** for editing.

For a later launch, run the API server on 3002 and start the client with:

```sh
VITE_SPATIAL_WORKSPACE=1 npm run dev:client -- --host 127.0.0.1 --port 5188 --strictPort
```

`spatialWorkspace` remains false by default. The ordinary development/production sites on 3000/3002 do not expose Spatial or fetch its renderer. No persistent local environment flag was changed. Canvas keeps its accepted application default.

## Physical composition and camera decision

The scene uses metres, with X right, Y up and forward along negative Z. The desk contact surface is Y=0. The composition was tuned as a physical study first; the alignment rehearsal did not dictate its dimensions.

| Element | Implemented scale/framing |
| --- | --- |
| Desk | 150° curved working surface; inner radius 0.55 m, outer radius 1.45 m, nominal depth 0.90 m, thickness 6.5 cm plus a small bevel. |
| Documents | A4-like 21 × 29.7 cm faces; separate lying/propped posture and heading. Schematic previews, not rendered authored text. |
| Photographs | 18 × 12 cm prints; images fit inside a paper border without stretching their source aspect. |
| Cup / books / inkpot | Cup body 8.7 cm high; book covers approximately 19 × 26 cm; inkpot approximately 4.7 cm high. |
| Seated viewpoint | Eye 60 cm above the desktop, slightly behind the inner opening, modest downward pitch; bounded ±45° swivel, no walking/orbit. |
| Perspective | 52° vertical FOV; approach permits a 16 cm lean. |
| Orthographic | Same scene/placements; approach changes framing span from 1.75 m to 1.37 m. |

**Recommend restrained perspective as the default.** The centre view gives the working surface useful depth, brings the lamp and nearby props into the foreground, and connects the desk to the window and peripheral shelves. Orthographic retains predictable object sizes but flattens the working surface and makes the room feel more like an architectural display. Both remain selectable for this review.

Initial captures exposed excessive lamp brightness and too little peripheral room context. Lighting and camera/shelf framing were adjusted without enlarging papers or reducing desk depth. A ±60° swivel exposed too much unused wall at the endpoints; ±45° keeps the useful desk region more prominent. The desk itself still spans 150°.

The visual treatment is deliberately simple: procedural wood grain, primitive lamp/cup/books/inkpot/quill, warm interior lighting, a blue layered mountain/valley panorama with snow shapes, stars and sparse settlement lights, and shelves receding into shadow. One small spotlight shadow map serves the working surface. There is no environmental animation. The exterior remains visibly illustrative; the quill and other props remain primitive geometry. Endpoint walls are intentionally sparse. These are visual limits for review, not claims of finished architectural visualization.

My assessment is that perspective establishes a plausible seated working area and a calm warm/cool composition suitable for the next technical proof. Sustained writing comfort and the continuity of activation cannot be established by A's non-editable scene. Those remain B's acceptance questions.

## Session, identity and persistence

Spatial uses the same `WorkspaceSession`, repository, projection and shared object directory. The renderer receives a small semantic port of cloned layout data, object summaries, selection/camera actions, availability and owned interaction lifetime. It receives no editor, repository, `BlockOutlet`, arbitrary node lookup or editable DOM access.

The required shared changes were bounded:

1. [`workspace-presentation.ts`](./src/reactive-editor/workspace-presentation.ts) separates availability from the Canvas flag. It adds a named opaque Spatial entry and injected support predicate, rather than a registry or a Three.js dependency in core.
2. [`workspace-objects.ts`](./src/application/workspace-objects.ts) extracts the existing authored-root discovery and identity assignment from Canvas derivation. Canvas geometry generation and ordering remain in its existing derivation; its focused regression suite passes.
3. [`spatial-actions.ts`](./src/application/spatial-actions.ts) owns Spatial creation, representation admission, physical starter placement, camera commits and opening/reveal policy. It reuses the existing resolver's missing/ambiguous/replaced statuses.
4. [`workspace-presentation-view.tsx`](./src/application/workspace-presentation-view.tsx) keeps the existing provider and overlay layers, adds a lazy Spatial branch, and scopes interaction ownership to the active presentation. Composition observation remains installed once at the host.
5. [`workspace-open.ts`](./src/application/workspace-open.ts) explicitly handles Spatial insert/reveal. It reuses server loading, provenance and live-Document conflict handling; new content goes into the existing object bank. It also reuses directory entries mapped to an explicitly derived Desktop host.

Create Spatial uses deterministic source order and fixed physical slots, never Desktop or Canvas coordinates. It retains an existing layout, including an empty one. Up to eight objects receive starter slots; further objects remain in the accessible list as unplaced. Empty workspaces stay empty. Unsupported roots retain labelled placeholders; no authored tree is reconstructed to create a representation.

The existing outer `workspacePresentation` version and save capture protocol remain unchanged. Spatial v1 stores only its preset, camera kind/yaw/approach and desk placements (identity, contact position X/Z, heading, posture, physical size). Its decoder belongs to the removable feature. The shared envelope treats unsupported/malformed Spatial entries as opaque data that survive unrelated edits and saves. An unavailable saved preference falls back to Desktop with the existing notice rather than silently rewriting the preference.

Tests cover all four Canvas/Spatial flag combinations, deterministic creation independent of existing geometry, local and manifest round-trip, repeated Documents sharing one materialized identity, rejection of conflicting Document copies, missing targets, unknown field preservation, stale save acknowledgment and reuse of unsaved server Documents. Camera changes do not alter authored revisions, Document hashes or other presentations' geometry. No new workspace file format was needed.

## Coordinates, input and future handoff

Core's existing local-coordinate and standoff measurement contracts were not changed. Spatial owns world coordinates, CSS viewport conversion and projection/unprojection; GPU buffer pixels remain distinct. Device-pixel ratio is capped at 1.5 for rendering while input and the rehearsal target use CSS pixels.

The **Rehearse alignment** control projects a translucent, non-editable world plane into a comfortable CSS rectangle. It leaves every physical object and desk placement unchanged. Both projections were checked at centre/left/right and approach extremes in the mathematical tests; the browser verified alignment for each camera and at DPR 2. Corner error was below 0.001 CSS pixel. This proves the terminal alignment calculation, **not** a live editor handoff or a raise/rotate animation.

A has zero live Document mounts in Spatial. Returning to Desktop remounts the existing view, and actual native typing was verified there. A later B implementation can raise/approach the physical page, change its transient size/aspect as needed, then mount the original Window in an untransformed screen-space rectangle. No perspective-aware core editor changes are justified by A's findings.

Browsing uses scene-scoped pointer drag, a camera selector, approach slider, explicit swivel/recentre controls and keyboard arrows/Home. Object selection is available through raycasting or the accessible object list. Camera drags preview transiently; completion commits; Escape, blur, lost capture and cancellation restore the prior camera. The slider also previews until completion. Modal availability is checked before navigation. Ordinary editor typing is not forwarded to Spatial, and Ctrl/Cmd browser shortcuts are not intercepted.

The existing session's composition deferral, task ordering, overlay/opaque-widget restrictions and focus restoration remain intact. No B-specific Escape/Grouping/IME behavior is claimed or implemented.

## GPU lifetime and performance observations

Three.js `0.186.1` and its type package `0.186.0` are pinned. The renderer and scene live in a lazy chunk; ordinary Desktop/Canvas navigation does not fetch it. The production renderer chunk is approximately 578 kB minified / 150 kB gzip, separate from the main application. The existing build still reports its large-chunk advisory.

One Spatial lifetime owns one canvas/renderer, frame scheduler, viewport ResizeObserver, visibility listener and resource set. Frames are coalesced and requested only for changes. Image callbacks are generation-checked, canceled on rebuild/disposal, and uploaded into bounded print textures. Exit releases capture, listeners, pending image loads, frames, geometries, materials, textures, shadow resources and renderer/context resources.

The graphics-loss check found that requesting the restoration extension only after context loss was unreliable. The implemented recovery discards the failed scene's GPU resources and **Retry study** recreates just its owned canvas/scene. It preserves the workspace session, content, object directory, camera/layout preference and surrounding application. Simulated loss/retry now passes.

On the development Apple M1 with 8 GB RAM, Chrome 153 and the software-GPU override disabled:

- The static scene produced **zero extra frames** during the idle observation.
- Ten Desktop/Spatial cycles returned to **130 renderer-reported geometries and 10 textures** for the five-object centre fixture; counts stabilized rather than increasing per visit. These are renderer counters, not a claim of total GPU memory usage.
- That centre view issued approximately **135 draw calls**.
- Camera updates followed by two animation-frame checkpoints took approximately **33–35 ms** in the captured run. Raw observations are in the browser results. This is an end-to-end checkpoint measurement, not a GPU timer or a formal single-frame FPS benchmark.
- The browser completed without uncaught exceptions.

Typing benchmarks are deferred to B, where a live editor will coexist with the scene. A did not change the text input pipeline. No generalized caching, instancing, LOD or renderer framework was introduced.

## Qualification

| Check | Result |
| --- | --- |
| Focused unit/component suites | **90 tests passed** across 11 suites: Spatial state/camera/adapters; workspace sessions, presentation switching, opening, manifests/local files; Canvas derivation/actions/interactions. The final added host-mapping case was run in its 11-test adapter suite after the 89-test combined pass. |
| Type checking | Reactive client and server passed. |
| Production build | Client and server passed, with the existing chunk-size advisory. |
| Spatial real-browser qualification | **42 checks passed**, including actual application Create Spatial, empty desk, New Document, opening existing server `text1.json`, local save, no live editor mounts, camera cancellation/keyboard/modal priority, identity round-trip, ten switch cycles, DPR 2, graphics recovery and default-off behavior on 3000/3002. |
| Existing application regression | **46 checks passed** against actual sites on 3000 and 3002: Desktop/Canvas typing, focus restoration, opening Documents/images, local save/reopen, reverse derivation and sample navigation. |
| Physical Spatial removal | Passed in an isolated copy after deleting feature implementation and its assembly hooks/dependency declarations: typecheck, Desktop/Canvas editing, new/server Document opening (mock server transport), save/reopen and preservation of unknown Spatial data, plus full build. |
| Existing physical Canvas/Counter removal | Passed after updating its assembly stub's presentation-name type. Spatial's state/identity work did not break the accepted removal test. |
| Visual evidence | 14 captures: both cameras' centre/left/right/approach/alignment; smaller viewport/DPR 2; actual application opening; recovered scene. |

Commands are reproducible through [`check-spatial-a-browser.mjs`](./scripts/check-spatial-a-browser.mjs), [`check-spatial-removal.mjs`](./scripts/check-spatial-removal.mjs), the existing [`check-canvas-integration-browser.mjs`](./scripts/check-canvas-integration-browser.mjs), and [`check-canvas-removal.mjs`](./scripts/check-canvas-removal.mjs). Browser checks read the real server Document but never write server Documents; local file save is captured in memory. The screenshot fixture is synthetic workspace content.

Qualification used Chrome, not a Safari/Firefox matrix. Safari, real IME, native editing selection, Grouping, SVG standoff effects and Entity focus while a live Document is activated remain B work. No claim is made about them inside Spatial yet. Mathematical alignment and static captures do not establish the visual continuity of a moving handoff.

## Remaining branches and implications for B–D

The explicit presentation names, menu branches, shared sidecar entry, application opening policy and lazy assembly hook are deliberate three-presentation composition points. Core does not import the Spatial schema decoder or Three.js. There is no Spatial branch in text input, annotation measurement, effect rendering or feature panels. Existing Canvas admission and opaque-widget switching restrictions remain deliberate legacy adapters; they were not generalized to manufacture a universal presentation API.

A supports the approved B–D sequence without expansion. Use perspective as the initial B camera, preserve A4 desk scale, and first prove immediate activation of one qualified existing Document Window with its margins/Compact/focus context. Add the physical raise/approach/align transition only after that works. Keep the alignment plane's larger rectangle transient. B must still stop if substantial editor changes appear necessary.

C still owns object arrangement and its final desk-boundary interaction rules. D still requires a separately bounded selection of environment/media work. No graph, History, Superposition, rich environmental animation or asset acquisition was started.

**Stopped for review. Spatial Milestone B has not begun.**
