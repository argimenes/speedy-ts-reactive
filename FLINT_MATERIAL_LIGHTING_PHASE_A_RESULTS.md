# Flint Material Lighting — Phase A Results

**Date:** 6 October 2026

This document records the initial Phase A implementation and its scale measurements. The later [material fidelity pass](FLINT_PHASE_A_MATERIAL_FIDELITY_REPORT.md) adds three-scale textures and a workspace light field, with updated captures and functional checks. The timings below were not remeasured for that pass.

Phase A is implemented as an isolated study at `/flint-material`. AntV X6 3.1.8 supplies graph selection, dragging, pan, zoom and minimap behaviour within Mutable's SolidJS application. Flint supplies the sculptural SVG forms, Cycladic palette, typography, materials and lighting. An existing graph package can support this treatment; writing a new graph library is not necessary to add stone texture.

The default-enabled `flintMaterialLighting` feature flag controls the lazy playground route. Hosts can opt out through `App`'s configuration, for example `{ features: { flintMaterialLighting: false } }`. This study does not replace production Flint chrome or change authored Document colours, formatting, semantic records or persistence.

## What to inspect

Open `/flint-material` on the running Mutable client. The reference fixture contains 13 deliberately positioned reliefs. Use **Stone finish** to compare fine-grained limestone, pale veined marble and limestone with shading only. Full relief displays the object texture; simplified and flat modes omit it. Light direction, elevation, intensity and softness apply across the study. The **Local response** controls exercise contact illumination, press, lift and a finite wave on the selected SVG relief or DOM panel below the graph.

Reset to Flint Default restores limestone, the default light and neutral local inputs. Graph detail and fixture size are independent controls. The native cursor remains in use. Capability descriptors, local coordinates and bounded response parameters are available to a later Probe consumer; Phase A contains no pointer sculpture or tracking experiment.

The pale palette, flush inspector surfaces, carved library selection, directional shadows, serif labels and sculptural forms establish the reference's direction. The vector geometry and procedural texture remain approximations of the supplied artwork. Visual acceptance against that mockup and Safari comparison remain open before production chrome migration.

## Material and rendering architecture

`material-response.ts` resolves one screen-space light basis, material albedo, named elevation and optional local inputs. Limestone and marble differ in albedo while sharing the current bounded interaction travel. The DOM and SVG adapters consume that resolver; local feedback does not require a separate material renderer.

Neutral surface variation is separate from directional shading. `material-textures.ts` installs reusable SVG patterns containing a cached embedded grain image, restrained limestone pores or hand-authored branching marble veins. Static alpha silhouettes confine texture to filled and stroked forms. Shared gradient/filter attributes supply illumination, while target-local definitions are attached lazily for contact and height changes. Changing the light does not rewrite texture patterns or reconstruct nodes.

Texture attributes are explicit on symbol descendants because ancestor CSS selectors did not reliably style the cloned SVG `<use>` trees. Browser validation now includes actual raster output to detect a black fallback fill, in addition to structural checks. All definition IDs belong to one graph instance.

Each root owns one coalesced animation-frame scheduler. Global SVG lighting updates shared definitions; a CSS boundary blocks dynamic root lighting variables from cascading through every cloned form. Only affected targets receive local updates. Coordinates use the target's untransformed CSS-pixel frame; the X6 adapter accounts for pan and zoom. Geometry, shadows and hit areas have separate ownership. Finite waves expire, reset clears transient inputs, and unmount disposes graphs, observers, listeners and scheduled work.

## Validation

The focused material-response and scheduling tests plus existing feature-composition and Flint-lifecycle tests passed: **22 tests in four files**.

`npm run build` and `npm run typecheck` passed. Vite reports a 622.81 kB material-playground JavaScript chunk (182.74 kB gzip), loaded only by the flagged route, and the existing large main bundle warning. Bundle size remains a later integration consideration.

The Chromium browser run passed **50 checks**, covering 26 functional checks and 24 size/detail/zoom cases. A subsequent functional run passed **27 checks**, adding an actual raster-albedo check. Coverage includes finish switching without remounts, native label selection, real mouse dragging and background panning, keyboard movement, transformed local coordinates, target-scoped effects, finite-wave expiry, reset, reduced motion, forced colours, separate roots, disposal during an active wave, feature opt-out, narrow layout, and repeated fixture replacement without accumulating minimap views. The isolated route made no canonical/persistence API calls and produced no uncaught browser exceptions.

## Measured scale limits

Measurements used headless Chrome 154.0.8037.98 at 1536 × 1024, device scale 1, a development Vite client, 45 shared-light/contact updates per case and timeline tracing. Three warm-up samples were discarded. The static animation-frame baseline was **33.3 ms median / 33.4 ms p95**. The reference scene matched that cadence; these results do not establish 60 Hz operation.

The table shows frame interval median / p95 in milliseconds with all fixture nodes visible at fit zoom:

| Nodes | Full textured relief | Simplified relief | Flat vector |
| --- | --- | --- | --- |
| 13 | 33.3 / 33.4 | 33.3 / 33.4 | 33.3 / 33.4 |
| 50 | 33.4 / 50.0 | 33.3 / 33.4 | 33.3 / 33.4 |
| 250 | 150.0 / 150.1 | 33.3 / 33.4 | 33.4 / 50.0 |
| 1,000 | 450.0 / 466.7 | 100.0 / 116.8 | 150.0 / 150.1 |

At closer zoom, 250 and 1,000 fixtures had 204 and 682 visible nodes respectively; full-relief medians improved to 99.9 and 300.0 ms. Mounts remained stable and schedulers returned to idle in every case. Main graph plus surrounding/minimap DOM counts ranged from 813 to 28,499 elements. At fit zoom, full-relief controller p95 was 3.2 ms for 13 nodes and 11.4 ms for 1,000 nodes; recorded Paint CPU time over the 45-update cases grew from 94.0 to 1,201.0 ms.

The reference fixture is suitable for evaluating the material direction. Full textured relief is not suitable for continuous global relighting at hundreds of visible nodes in this implementation. Simplified mode helps substantially at 250 nodes, but none of the current modes qualifies a 1,000-node continuously relit live graph. Flat mode is not consistently faster than simplified mode because the underlying geometry and local-field updates remain present.

Retain X6 for the prototype. Before Phase D production integration, measure viewport culling, geometry reduction, cached relief artwork and restricted relighting against supported live-graph sizes. These results do not demonstrate that a custom graph engine would solve the rendering cost. No automatic production detail threshold is asserted from this single headless run.

Paint timings represent recorded CPU paint events, not GPU/raster completion. Input-dispatch timings measure JS injection, not physical input-to-display latency. Safari rendering, touch behaviour and physical-device responsiveness remain manual checks.

## Evidence and reproduction

The tracked [browser script](scripts/check-flint-material-browser.mjs) starts an isolated temporary-profile Chromium session and a local Vite client, without opening a Cavern. Run:

```sh
node scripts/check-flint-material-browser.mjs
```

For functional checks without repeating the benchmark:

```sh
MATERIAL_BENCH=0 node scripts/check-flint-material-browser.mjs
```

Local evidence is under ignored `artifacts/flint-material/phase-a/`: `browser-results.json` contains all 24 measurements, and screenshots include default limestone, marble, shading only, reversed light, local contact, forced colours and narrow layout. The final functional output is under `final-functional/`. These artifacts are reproducible development evidence rather than corpus data.

The [evaluation and staged plan](FLINT_MATERIAL_LIGHTING_EVALUATION_AND_PLAN.md) now records the implemented Phase A architecture. Phase B formalisation, Phase C chrome migration and later live graph/Probe work remain separate stages.
