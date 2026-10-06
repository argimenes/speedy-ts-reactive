# Flint 2.5D material chrome

The default-on `flintMaterialChrome` feature adds a material substrate to Flint
and the existing `/flint-material-three` Graph study. Set the flag to `false`
to retain the previous Flint shell and Graph spike. Existing feature defaults
are unchanged. No Graph fixture is added to production Document navigation.

## Integration decisions

- Solid/CSS owns every rectangle, semantic control and editor. A pointer-transparent,
  aria-hidden canvas sits below `.flint-surfaces` in each Flint root.
- `MaterialChrome` owns a lighting scheduler and the lazy-loaded `MaterialScene`.
  Its cleanup releases observers, subscriptions, GPU resources and pending frames.
- One CSS pixel is one scene unit. The orthographic camera faces the XY plane.
  Z is material relief only. The editor registers just its viewport; no Block
  geometry or text is inspected. ResizeObserver and explicit layout invalidation
  update this rectangle, including CSS-scaled host windows.
- Only application-owned editor backdrops become transparent. Authored Page and
  Document presentation backgrounds, colours and text styles remain intact.
  Consequently an opaque authored page intentionally hides the substrate.
- Initial chrome physicality stops at substrate and the shallow paper surface.
  Controls, panels and tabs use quiet CSS. No mesh-per-control conversion or
  additional aperture ornamentation was needed for this first review.
- Graph retains its existing independent XY pan/zoom renderer. It shares the
  FlintLight adapter, material registry and occlusion configuration; shell-relative
  occluders are mapped into Graph world coordinates on render. These are two sparse
  renderers, not a second application framework or a forced camera unification.

## Materials and environment

`material/material-registry.ts` supplies limestone, marble, paper, parchment and
chalk using nondirectional bitmap albedos and separate linear height/roughness data.
`stone-detail.ts` defines five related stone finishes at a shared material scale,
with deterministic per-object UV variation. Neutral ambient fill and warmer direct
sunlight are shared by the shell and Graph. A local standard-material shader adapter
controls albedo strength and estimates blocker distance for contact-hardening PCF.
Graph carvings retain fine self shadows. A floor-only colour pass excludes distant
architecture and uses near-normal visibility for a tight ambient contact footprint,
separate from the directional sunlight cast.
This is an approximate soft-shadow filter, not a full area-light simulation.

`material/light-environment-config.ts` contains `CYCLADIC_APERTURE`, `OPEN_ENVIRONMENT`
and the `LightEnvironment`/`Occluder` types. To supply a custom composition, call
`scene.setEnvironment({ name, enabled, occluders })`. Positions and scale are
normalised to the application rectangle; height/depth use its smaller dimension.
Rotation is degrees about Z. Each form can opt out of casting shadows. Sparse
slabs, beams and an irregular aperture surround the viewport at unequal heights. They write shadow depth
but neither colour nor picture-plane depth. No decorative light bands are used
in the enhanced study.

“Light & material” exposes material selection, effects opt-out, environmental
occlusion, direction, elevation, intensity, softness and reset. Controls are local
presentation state, not Document edits. Forced colours uses CSS fallback; reduced
motion remains static. WebGL failure/context loss leaves the editor complete and
readable; restored contexts redraw. Static scenes stop rendering after invalidation.

## Review and focused verification

Run `npm run build` before `node scripts/check-flint-chrome-browser.mjs` (the
browser harness uses the compiled isolated test server). It writes actual Chromium
captures and `browser-results.json` to `artifacts/flint-material/chrome`. It uses
only temporary fixture storage, never the user's Cavern.

The reference is the original Flint concept supplied in chat. Review the shell
and Graph captures against its continuous pale mineral environment, broad natural
light/shade, fine borders, sculptural forms and crisp typography. This initial
implementation does not claim exact visual parity. Graph is still the accepted
fixture study, not a newly implemented production knowledge graph.
