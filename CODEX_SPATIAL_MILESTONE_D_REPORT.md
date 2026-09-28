# Spatial Milestone D — Interaction, recognition and restrained atmosphere

Status: **complete, awaiting review**. Stop here; no broader Spatial work has begun.

## Accepted baseline and scope

C is accepted, including manual confirmation of physical dragging and B's editing path after arrangement. Its preserved baseline is **`fe3a6ea` (`Dragging, etc`)**; the intervening D work snapshot is `d85a4b3`. D first investigated dragging and arrangement discoverability, then added recognisable non-live Document previews and a bounded static environment pass.

Perspective remains primary. The 150° desk, seated camera, ±45° swivel, physical page dimensions, independent placements and B's live-DOM handoff remain intact. Spatial retains its existing default-off feature flag; this checkout's ignored local opt-in enables it on **localhost:3000** and the rebuilt **localhost:3002** application.

The [review gallery](./artifacts/spatial-d/index.html) includes the measured drag comparison, recognisably different Documents, captured drag preview, explicit orientation controls, both landscape postures, live editing and photograph recovery.

## Drag investigation: three concrete findings

**1. Preview subscription was missing on the instrumented C startup path.** The effect called `scene?.previewPlacement(arrangement.preview())`. It initially ran before scene creation, so optional chaining skipped the signal read. It therefore never subscribed to preview changes. In the instrumented baseline, **100 pointer moves left the scene frame count unchanged at 2**, although transient placements were calculated and completion persisted the final move. This explains why nominally functional dragging could feel detached from movement. C's automated checks covered capture, persistence and resource counts, but missed whether the visual preview actually rendered.

The effect now always reads the preview signal before calling the scene. D's browser test explicitly checks a subsequent drag frame before commit, after the initial selection frame has settled.

**2. The controller and scene both deferred through RAF.** After fixing subscription alone, the controller published on one frame and the scene queued another. The controller now publishes the latest transient placement immediately; the scene retains its existing single pending render frame. Ownership, cancellation and one settled sidecar commit are unchanged. No generalized scheduler or gesture framework was introduced.

| Instrumented path | Rendered move samples | Median input-to-submission | p95 |
| --- | ---: | ---: | ---: |
| C startup, instrumented | 0 | No preview submission | — |
| Subscription repaired, two RAF stages | 100 | **17.9 ms** | **18.8 ms** |
| Single scene RAF, before visual additions | 100 | **1.4 ms** | **2.4 ms** |
| Final D, including previews/materials | 100 | **1.6 ms** | **2.3 ms** |

Final stage medians were approximately 0 ms for intersection and constraint calculation at browser timer resolution, 0 ms publication delay, 0.2 ms scene wait and 1.3 ms render submission work. These are **CPU/event-to-render-submission measurements**, beginning after pointer ownership/validity checks; they exclude GPU completion, OS compositor presentation and hardware mouse latency. CDP-delivered events often arrive near a frame boundary. They establish the eliminated extra frame, not a universal 1.6 ms mouse-to-screen guarantee.

The opt-in, drag-only probe records at most 600 samples, has no timers/observers and is inactive normally. Raw traces: [C baseline](./artifacts/spatial-d/drag-c-baseline.json), [subscription-only](./artifacts/spatial-d/drag-subscription-only.json), [single RAF](./artifacts/spatial-d/drag-single-raf.json), [final D](./artifacts/spatial-d/drag-final.json). The 101st sampled event is completion; 100 move samples reached preview render submission.

**3. A propped grab should not be projected onto the floor.** A point above the desk acquires the wrong movement gain when its pointer is intersected with the desk plane. A representative perspective move of 80 px horizontally and −12 px vertically produced **38.1 px of grab-point slip** with the old floor-plane calculation. The controller now captures the actual hit height and intersects a fixed desk-parallel plane through that point. The same geometric test has error below **0.000001 CSS pixel** before desk clamping. Only horizontal desk position changes; this adds no lift, Euler controls or free 3D movement. At the desk boundary the existing constraint intentionally prevents further movement.

Human mouse/trackpad ergonomics remain a review item. No manual improvement claim is substituted for the measured results.

## Discoverability and orientation

The controls now say **Rotate left** and **Rotate right**, with an explicit **Heading** value. Buttons rotate 5°; Shift-click rotates 1°. Existing bracket shortcuts and coarse/fine movement remain. Separate **Portrait** and **Landscape** buttons sit beside the existing **Lay flat / Prop up** posture controls.

| Placement concept | Meaning |
| --- | --- |
| Position | Desk-plane anchor in metres |
| Heading | Rotation around the desk's vertical axis |
| Posture | Lying flat or the existing restrained prop angle |
| Orientation | Portrait or landscape aspect; independent of heading and posture |

An optional `orientation` property extends the existing version-1 Spatial placement. An omitted value preserves old geometry exactly and infers the control state from the existing size pair. Explicit orientation assigns the pair's shorter/longer edge to width/height; it does not enlarge the paper or overwrite its stored size. Unsupported orientation values fail feature validation while the generic presentation envelope retains unavailable Spatial data. No workspace format migration is required.

Footprint constraints use the oriented dimensions. Position may be clamped inward when a changed footprint would cross the desk edge. Both orientations, in both postures, passed B activation/alignment/reverse checks and returned to the exact saved placement. Orientation survives local/server round-trip, presentation switching and physical feature removal. Photographs use the same property; image content is fitted without stretching.

## Recognisable, non-live Document previews

The application reads a small visual digest directly from existing authored records at a desk lifecycle boundary. It contains actual title, ordered text blocks, heading levels and up to three image references. The feature paints that digest into a static paper texture. There is no second Document DTO, hidden mounted editor, DOM rasterizer, selection engine or annotation/effect implementation.

The digest is bounded to **20 visible blocks, 160 traversed records, 6,000 text characters and 8,000 inline-cell reads**. It skips nested Window/portal roots, does not traverse margin relations, and safely draws authored text as canvas text. Image URLs use the existing permitted URL forms; unreadable or cross-origin images retain a labeled placeholder. Image completion is guarded by the scene generation and disposed scene state; listeners and pending loads are cancelled when rebuilding or disposing.

A session-local cache shares the digest between occurrences of the same Document. It refreshes on entering Spatial or returning from editing, and on relevant directory changes while browsing. Authored reads are deliberately untracked: ordinary typing neither rebuilds the digest nor generates textures. Return remains behind B's existing composition-completion guard, so the refreshed preview includes committed composition input. Digests and textures are transient and are never saved in the workspace.

Dragging updates existing transforms. Selection, heading, posture, position and overlap-order changes no longer rebuild all proxy textures; proxy rebuilding is keyed to physical dimensions, object membership and visual summaries. Orientation can repaint at its explicit action boundary to fit the new aspect. Nothing maintains a steady render loop.

The result is a **recognition preview**, not miniature full fidelity. It shows real title, approximate text structure, headings and significant first-page images. It does **not** reproduce prominent highlight spans, SVG/rainbow effects, exact columns, margins, pagination, inline image Cells or all styling. Those remain in ordinary Codex upon activation. Reimplementing effect semantics for a thumbnail would violate the chosen boundary; no such implementation was added. The captured Alpine and botanical Documents demonstrate distinct recognition cues, and two Alpine occurrences share one digest.

## Selected environment pass

The bounded selection is entirely static and procedural:

- quieter walnut grain with shallow bump response and adjusted roughness;
- subtle paper fibres behind actual preview content;
- layered Alpine ridges, restrained snow bands, atmospheric color separation, a lake, static distant shore lights/reflections and peripheral tree silhouettes.

No assets were acquired, so no external asset licenses were introduced. Camera, desk/page proportions and interaction mechanics remain authoritative. There is no new animation loop, rain, moving traffic, music playback, room navigation or general environment framework. Those optional D candidates were not selected. No additional live Block type was authorized; photographs remain static desk representations and the existing qualified Document Window remains the sole live activation target.

## Qualification

| Check | Result |
| --- | --- |
| Broad focused suite | **210 passed across 24 suites**, covering Spatial, workspace assembly, selection, cross-Block input, standoff editing, Grouping, Entity and Compact. [Output](./artifacts/spatial-d/focused-tests.txt) |
| Final preview bound check | **3 passed**, rerunning the two existing preview tests and adding empty-inline-cell work bounds/unsafe-image handling: **211 distinct tests** across the two runs. [Output](./artifacts/spatial-d/preview-limits-tests.txt) |
| D Chrome browser | **53 checks passed**: real preview frames before persistence, cancellation, save, resources, geometry independence, orientation/posture combinations, exact returns, identity/unknown fields, digest lifecycle, ordinary typing and idle scene behavior. [Results](./artifacts/spatial-d/browser-results.json) |
| B browser regression | **69 checks passed**: typing, selection, SVG alignment, Grouping, native controls, Entity focus restoration, composition deferral, margins/drawers, Compact/narrow behavior, undo/redo, switching, reduced motion, graphics recovery, identity and one-root ownership. [Results](./artifacts/spatial-d/b-regression/browser-results.json) |
| Repeated activation | Eight B cycles plateaued at **137 geometries, 13 textures and zero live roots after return**. |
| Typecheck / production build | Passed. Existing large-chunk and stale browser-mapping advisories remain. [Typecheck](./artifacts/spatial-d/typecheck.txt), [build](./artifacts/spatial-d/production-build.txt) |
| Physical Spatial removal | Passed in an isolated copy with Spatial, its preview adapter and Three.js dependency declarations removed. Desktop/Canvas editing, opening, saving/reloading and unknown Spatial data—including a **landscape placement**—survived. [Output](./artifacts/spatial-d/removal.txt) |

Chrome **153.0.8010.53**, Node **22.12.0**, Apple M1/macOS were used. Drag profiling used native ANGLE/Metal. Fixtures and browser profiles were isolated; no server Documents were written. Both main localhost URLs respond after the production rebuild.

The existing 250-paragraph / 25,000-character typing benchmark also passed real insertion, Backspace, split, undo/redo, content restoration and unrelated-cell stability. One final Desktop/Spatial pair recorded median handlers of **2.7 / 2.2 ms**, p95 **15.3 / 6.0 ms**, **zero repository snapshots** during ordinary typing and **zero Spatial scene frames**. These single runs are a functional/performance smoke check, not a controlled C→D timing comparison or a speedup claim. [Desktop output](./artifacts/spatial-d/typing-desktop.txt), [Spatial output](./artifacts/spatial-d/typing-spatial.txt). The Desktop harness retained a Node handle after all assertions and Chrome cleanup; that owned process was terminated before running Spatial separately. This did not affect the captured measurements.

Safari and human-operated OS IME were not requalified in D; B's Safari automation limitation remains. Chrome composition, reduced motion and viewport/DPR checks were rerun through B. CDP zoom-equivalent testing is not represented as manual browser-menu zoom. Visual review inspected the captured page proportions, orientation and preview differences; sustained manual drag feel still needs the user's review.

Reproduce with Node 22 and an opted-in Vite server on port 3000:

```sh
CANVAS_SOFTWARE_GPU=0 DRAG_RUN=final node scripts/profile-spatial-d-drag.mjs
CANVAS_SOFTWARE_GPU=0 node scripts/check-spatial-d-browser.mjs
BENCHMARK_URL=http://localhost:3000/ CANVAS_SOFTWARE_GPU=0 \
  SPATIAL_ARTIFACT_DIR=artifacts/spatial-d/b-regression \
  node scripts/check-spatial-b-browser.mjs
node scripts/check-spatial-removal.mjs
npm run typecheck
npm run build
```

The preserved earlier traces are sequential investigation checkpoints; rerunning the final profiler does not recreate the old subscription defect or two-RAF code.

## Review boundary

D needed only feature-local drag/representation changes and its narrow application preview adapter. Core continues to own authored storage, input/selection, measurement, focus and live Window behavior. No reusable general framework was justified.

**Stop for review.** GraphView/GraphData spatial work, History extraction, Text Superposition and broader Spatial architecture have not begun.
