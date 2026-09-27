# Spatial Milestone B — Existing Document activation and DOM handoff

Status: **accepted**, including manual confirmation of Document proxy creation, activation and live editing. The accepted B baseline is commit `4481beb` (`3D verified`). [Milestone C](./CODEX_SPATIAL_MILESTONE_C_REPORT.md) follows this baseline.

## Scope and baseline

Accepted A's study, physical 150° desk, A4-like placements, seated camera, ±45° swivel and procedural materials remain the baseline. Perspective is the working/default camera; the inexpensive orthographic option remains. No arrangement tools, models, textures, environmental animation, persistence format or new editing engine were added.

The accepted source snapshot and SHA-256 manifest are recorded in `artifacts/spatial-b/baseline.json`; the repository's accepted A commit is `11a8b6d`. Spatial remains independently feature flagged and disabled by default. Opt in with `VITE_SPATIAL_WORKSPACE=1`, open Workspace → Presentations → Create Spatial, then double-click a qualified page, or select it and choose **Read Document**. Enter on the focused study canvas activates the selected Document. **Return to desk** reverses the handoff.

## B1: ordinary Codex first

The application authorizes one existing, unambiguous Document Window occurrence. The Window must contain one Document and have no nested Window, portal or opaque widget subtree. Images, unresolved references and unsupported shapes remain proxies. There is one WorkspaceSession, repository and projection throughout; no duplicate DTO, hidden editor or second editable root is constructed.

`spatial-actions.ts` owns authorization and selection bookmarks. Its feature-facing port exposes only object identity, eligibility, activation, guarded return and transient editing size. Runtime node keys, editor access and rendering authorization remain in application assembly. `WorkspacePresentationView` supplies an authorized `BlockOutlet` slot and the existing static `WindowGeometryHost`. Core continues to own Window composition, margins, drawers, Compact policy contribution, measurement, selection and focus.

The live Window sits in an ordinary, unscaled and unrotated DOM rectangle. The coordinate provider is the existing identity path. Its minimum width and margin behavior are ordinary Window behavior. The scene never receives the editor or editable DOM. Spatial control CSS is scoped so it cannot restyle editor buttons or form fields; an opaque backing keeps scenery out of the reading surface.

Return uses the application's existing composition-completion checkpoint, after core reconciliation and final input. It is blocked by an open panel/dialog and defers during composition. Last explicit presentation/return request wins. Deferred work is invalidated on disposal. No ordinary input event is routed through Spatial. Escape in the live editor retains existing editor priority; it is not repurposed as Return to desk.

B1 was qualified before B2: 45 Chrome checks and 186 focused tests passed after fixing a host-slot teardown bug and the composition test fixture. No core editor, selection, effect measurement or Window implementation changes were necessary.

## B2: transient physical pickup

The forward sequence takes approximately 480 ms: initial lift, rotation toward the reader, approach, delayed broadening into the editing rectangle, then an approximately 86 ms crossfade. The live root mounts only at the aligned end of the approach. Reverse takes approximately 400 ms, including an initial 80 ms fade, then returns the same physical page to its unchanged desk placement. Reduced motion activates and returns immediately.

The pose is computed from the physical page's world center/orientation and camera-facing unprojection of the CSS rectangle. Only scene-instance transforms change. The physical placement, heading, posture and A4 dimensions remain authoritative and unchanged in saved state. Both camera types are checked mathematically at center and swivel limits. Resizing uses the existing surface ResizeObserver; no additional observer or document reconstruction is introduced for alignment.

Animation has an owned frame handle and generation token. Escape on the study canvas cancels pickup; blur, hidden-document state, switching, graphics failure and disposal settle/cancel owned work. Return temporarily makes the outgoing DOM surface inert. During editing the physical proxy is hidden, and the scene has no steady render loop. A graphics retry replaces only its canvas and preserves the active editor.

## Qualification and review evidence

The [review gallery](./artifacts/spatial-b/index.html) includes six captured views and a [64-frame replay](./artifacts/spatial-b/sequence.html), with recorded timing, quarter-speed playback and a frame scrubber. The same sequence is reproducible from the feature controls. The visual review shows a page rising out of the existing desk composition, changing proportions only during approach, then yielding to ordinary Window chrome and live text. The reverse restores the physical page. No desk dimensions or stored page dimensions were changed.

| Qualification | Result |
| --- | --- |
| Focused tests | **193 passed in 21 suites**: Spatial authorization/pose math, session/host assembly, selection gestures/targets, cross-Block selection, standoff editing, Grouping, Entity and Compact. |
| Spatial Chrome browser | **69 checks passed**, including typing, selection, SVG alignment, Control-held Grouping, Ctrl-click removal, native control Backspace, grouped Delete/undo, Entity panel focus/selection restoration, IME return deferral, margins/drawers, Compact and automatic narrow margins. |
| Ownership and persistence | One live root/projection, shared identity, unchanged Desktop metadata and physical placement, local/server round-trip, server reopening with unsaved edits, removed/unsafe root revocation and stale callback cancellation. |
| Handoff lifecycle | Propped and lying Documents, Escape cancellation, switching during pickup, resize/DPR changes, reduced motion, graphics loss/retry with the same focused editor, repeated activation/return. Actual terminal scene corners align within **0.01 CSS pixel**. |
| Default Desktop/Canvas | **46 checks passed** on ports 3000 and 3002, including real server Document opening/editing, images, presentation selection and the existing sample demo. |
| Build and type checking | Normal production build passed. Physical Spatial removal **passed**: TypeScript checks, Desktop/Canvas editing/opening/save/reload test, unknown Spatial data preservation, and a production build without Spatial or Three.js. Existing large-chunk and stale browser-mapping advisories remain. |

Entity's existing suites cover stale asynchronous responses/candidates and revision changes. The Spatial browser test verifies that its panel stays in the shared overlay layer and restores the existing selection. No alternate Entity or linked-annotation implementation was introduced.

The main browser fixture has **nine directory objects and eight physical placements**, including two Window occurrences sharing one Document. A larger **18-object** directory retains the same eight physical placements, keeps unplaced objects available in the directory, and still mounts only the selected Document. Eight repeated activation/return cycles plateau at **137 geometries, 13 textures and zero live Document roots after return**. The separate 250-paragraph benchmark covers a much larger editable Document.

DPR 1 and 2, viewport resizing, and a 125% zoom-equivalent CSS viewport/DPR combination were exercised. Actual browser-menu zoom was not automated; this is not represented as a manual browser-zoom pass.

Reproduce with Node 22 and an opted-in Vite server on port 5188:

```sh
CANVAS_SOFTWARE_GPU=0 node scripts/check-spatial-b-browser.mjs
node scripts/write-spatial-b-review.mjs
node scripts/check-spatial-removal.mjs
node scripts/check-canvas-integration-browser.mjs
```

Detailed [focused-test output](./artifacts/spatial-b/focused-tests.txt), [Desktop/Canvas results](./artifacts/spatial-b/desktop-canvas-results.json), [production build](./artifacts/spatial-b/production-build.txt) and [physical-removal output](./artifacts/spatial-b/removal.txt) are retained.

The browser scripts use isolated profiles and in-memory fixtures; they do not write server Documents. Results and environment details are in [browser-results.json](./artifacts/spatial-b/browser-results.json) and [environment.json](./artifacts/spatial-b/environment.json).

## Performance

Benchmarks ran on an **Apple M1 / 8 GB, macOS 15.5, Chrome 153.0.8010.53, Node 22.12.0**. The existing typing benchmark used the same 250 × 100-character fixture and SwiftShader settings for baseline/current comparisons, at 1440 × 900 and DPR 1. The optional hosted mode uses that same benchmark and fixture inside an existing Window. Each run measures 40 insert/delete handlers, then checks real browser insertion, Backspace, split, undo and redo.

| Mode | Median handler ms, runs 1 / 2 / 3 | p95 handler ms, runs 1 / 2 / 3 |
| --- | --- | --- |
| Accepted A, existing standalone benchmark | 2.8 / 1.8 / 2.2 | 25.8 / 3.4 / 7.6 |
| B, existing standalone benchmark | 2.8 / 1.9 / 2.3 | 36.0 / 3.1 / 8.9 |
| Accepted A, Desktop Window host | 1.5 / 2.0 / 1.5 | 2.5 / 7.0 / 5.3 |
| B, Desktop Window host | 1.7 / 1.5 / 1.7 | 2.7 / 6.6 / 4.0 |
| B, Spatial Window host | 2.9 / 2.6 / 2.4 | 4.3 / 4.2 / 3.8 |

The standalone median difference is **0–0.1 ms**; Desktop-host differences change direction across runs. Tail timings are noisy, so these runs do not establish a systematic Desktop regression.

Spatial has a **small measurable hosting overhead**. After memoizing the structural authorization result, the final two Spatial medians are **2.6 and 2.4 ms**, versus paired Desktop medians of **1.5 and 1.7 ms**: **+1.1 and +0.7 ms**. This is not a zero-cost claim. The optimization is a disposable cached validation, not a new input path. The earlier CPU-profiler attempt did not complete; its partial output is excluded from the qualification numbers. Further performance claims would need a larger, controlled sample rather than inference from these few runs.

Every completed run preserved unrelated DOM cells, restored content after editing and took **zero full repository snapshots** during ordinary typing. Spatial recorded **zero scene frames during the measured typing loop**. Full outputs and the comparison are retained in [typing-summary.json](./artifacts/spatial-b/typing-summary.json).

Animation was measured separately, without screencast capture, using the native **ANGLE Metal / Apple M1** renderer. In three warmed pickup/return cycles with the 18-object directory, **159 requestAnimationFrame intervals** had a median and p95 of **16.7 ms**, maximum **16.8 ms**; observed phase durations were approximately **483 ms forward / 400 ms reverse**. These are headless browser frame-callback measurements, not GPU timings, first-open latency or a guarantee about OS compositor presentation. The replay intentionally retains capture/mount delays. See [motion-metrics.json](./artifacts/spatial-b/motion-metrics.json).

## Limits and next milestone

Safari's installed WebDriver rejected session creation because **Allow remote automation** is disabled. Safari has not been qualified; no system preference was changed. Chrome composition coverage uses real browser composition/input events through CDP, not a human-operated OS IME candidate window. Manual IME and Safari review remain explicit limits.

The preview is deliberately schematic: the physical page has its title and manuscript lines, not a rasterized duplicate of live text. The short final crossfade introduces actual content and essential Window chrome. Visual acceptance should judge the captured transition and reproducible browser interaction, rather than treating the projection math as sufficient evidence.

No revision to the approved C/D boundaries is required. B establishes that the physical-to-screen bridge can remain feature-local while editing retains identity coordinates. Arrangement in C must continue to keep saved placement separate from transient pickup geometry, revoke invalid authorization, and preserve one live root. Unsupported shapes and bare Documents still require separate qualification rather than relaxing the authorization guard.

At B completion, Spatial C remained unstarted. It may reuse the demonstrated pose math and lifetime rules for arrangement, but B supplies no general layout registry or arrangement machinery.
