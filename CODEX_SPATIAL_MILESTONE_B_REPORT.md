# Spatial Milestone B — Existing Document activation and DOM handoff

Status: implementation and qualification in progress. Spatial C is not authorized.

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

Pending final qualification summary.

## Performance

Pending final paired benchmark summary.

## Limits and next milestone

Safari's installed WebDriver rejected session creation because **Allow remote automation** is disabled. Safari has not been qualified; no system preference was changed. Chrome composition coverage uses real browser composition/input events through CDP, not a human-operated OS IME candidate window. Manual IME and Safari review remain explicit limits.

The preview is deliberately schematic: the physical page has its title and manuscript lines, not a rasterized duplicate of live text. The short final crossfade introduces actual content and essential Window chrome. Visual acceptance should judge the captured transition and reproducible browser interaction, rather than treating the projection math as sufficient evidence.

Spatial C remains unstarted. It may reuse the demonstrated pose math and lifetime rules for arrangement, but B supplies no general layout registry or arrangement machinery.
