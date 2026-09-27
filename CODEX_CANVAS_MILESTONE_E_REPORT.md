# Canvas Milestone E — explicit Desktop derivation

Status: **implemented; stopped for review.** The accepted D baseline remains commit `d8f97b1` (`Milestone D`). This completes the bounded reverse derivation in section 10 of the [approved plan](CODEX_CANVAS_WORKSPACE_PRESENTATION_PLAN.md).

## Result and access

Open a Canvas-only Workspace with the existing `canvasWorkspace` flag enabled, then choose **Workspace → Presentations → Create Desktop from Canvas**. The command appears only when the Desktop marker is absent. The regular Desktop choice is disabled until creation; ordinary open, save or switching does not create wrappers or reparent bank content. An existing Desktop marker, including an intentionally empty one, prevents derivation. The initial split demo remains a separate host.

The flag remains disabled by default. Development opt-in is `VITE_CANVAS_WORKSPACE=1 npm run dev:client`. No new workspace format, flag, presentation framework or rendering capability was needed.

## Derivation and identity

[The pure application adapter](src/application/desktop-derivation.ts) validates and plans against existing repository identity resolutions. Existing Windows are reused and restored to normal state. Direct owned Documents receive a `document-window-block`; qualified images, Counter and existing media/application types receive a `window-block`. The original placements move through existing tree commands. Their content keys and Document identities do not change, and Documents are not copied.

New wrapper IDs are deterministic (`desktop:` plus the encoded directory object ID). Collisions reject the operation before mutation. The directory records `desktopHostBlockId`; Canvas still targets the original inner object. Existing-object enumeration recognizes this host mapping, so it does not offer a second object for the wrapper.

Only placed Canvas objects that resolve to suitable owned workspace roots are converted. Unsupported, missing, ambiguous, replaced, nested, overlapping and Portal targets are retained and named with reasons in the host's status notice. Unplaced bank members remain in the bank. An unsupported-only Canvas can deliberately produce an empty Desktop marker without changing authored structure. Arbitrary nested Documents are never pulled out of their owners.

After validating the full candidate, the session buffers all wrapper insertions, moves and Window metadata changes in one existing tree-command transaction, then publishes the validated directory/marker within the same Solid batch. An injected failure on the third move leaves no wrappers, metadata changes, history entry or Desktop marker. Composition defers the explicit request until completion; existing panel, draft and opaque-application guards remain authoritative.

## Initial geometry and subsequent independence

Objects sort by Canvas order then placement ID. The eligible objects' minimum world x/y translates to Desktop `(24,56)`. Sizes start from Canvas world rectangles, independent of camera/zoom, with viewport allowances of 48 horizontal and 80 vertical pixels. Document minima are conservatively 602×240, accommodating the existing minimap; general Windows use 240×160. Minima take precedence on very small viewports. Overflow uses an eight-step, 24-pixel cascade constrained to keep the starting corner reachable. Existing Window metadata outside position, size, state and z-index is retained.

These are one-time Desktop policy choices. Canvas bounds/camera never write Desktop metadata, and Desktop drag/resize never writes Canvas bounds. Subsequent switches only mount the chosen presentation over the same repository and projection.

Reparenting changes occurrence routes even though placement/content identity is retained. Focus restoration therefore remaps a removed route using its retained placement and ancestor placements, distinguishing two Windows showing the same Document. Ordinary switches keep their existing bookmark path, including minimized-Window fallback. Native selection and live DOM/CSS/SVG editing remain in the existing editor.

## Qualification

**94 tests across 11 focused suites passed**, including 14 reverse-derivation cases. Coverage includes deterministic geometry, camera independence, shared identity and hashes, local/server materialization, repeated switches and edits, empty versus absent Desktop, bank membership, unavailable targets, identity collisions, rollback, composition, focus, flag-off behavior, existing Canvas actions/interactions and host/menu persistence behavior.

The [focused Chrome script](scripts/check-canvas-milestone-e-browser.mjs) passed **33 checks** in Chrome 153.0.8010.53; [recorded results](CODEX_CANVAS_MILESTONE_E_BROWSER_RESULTS.json) are included. It exercises the actual menu command, two shared-Document Windows leaving the bank, native selection restoration to the second occurrence, shared native typing, Canvas standoff typing, real Desktop move/resize, real Canvas movement, independent layouts across repeated switches, unique mounted occurrences, SVG alignment at 0.5×, and local/server round trips retaining one shared Document. Browser persistence qualification materializes captured files/bundles in memory; it does not write user workspaces or exercise a native file chooser.

`npm run typecheck`, the client/server production build and `git diff --check` passed. Existing chunk-size and browser-mapping-age warnings remain. No performance benchmark was rerun: the change affects explicit derivation/switching, not the ordinary typing or coordinate path.

[Physical removal](scripts/check-canvas-removal.mjs) now also deletes the reverse-derivation adapter from an isolated source copy. With Canvas, Counter, their actions/derivation, composition view and menu absent, that copy passed type checking, its Desktop editing/bank access/opaque round-trip test, and the client/server build. Temporary copies were removed; running user servers were not stopped.

Reproduce the browser run against the development server with `BENCHMARK_URL=http://localhost:5187/ node scripts/check-canvas-milestone-e-browser.mjs`.

## Retained boundaries and limitations

Structural derivation uses ordinary authored undo/redo. Undo returns the objects to their original owners; the independent presentation marker and host mappings remain, just as Canvas layout survives authored-content undo in D. Redo restores the wrappers. Switching never interprets this as permission to regenerate Desktop. Combined presentation/content undo remains outside this milestone and is covered explicitly by a regression test.

The media qualification list and opaque-application completion restrictions remain D's bounded policy. Direct Documents now obtain an editable Desktop Window; their existing unsupported direct-Canvas placeholder behavior is unchanged. This does not claim universal application conversion or playback-state preservation.

The application adapter and static Desktop/Canvas selection remain explicit. No core renderer, measurement scheduler, input dispatch, generic Window geometry or Block application API changed. Object-bank membership remains separate from placement. No universal camera/layout/renderer model, Spatial implementation, History extraction or Text Superposition work was introduced. Future Spatial may use an independent representation while activating the same full-fidelity live DOM editor; E adds no requirement that it adopt Canvas coordinates or DOM roots.

**Stopped for review after Milestone E.**
