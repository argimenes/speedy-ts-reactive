# Flint Probe MVP

The default-on `flintProbe` experimental feature adds a stone pointer to each
Flint application and `/flint-material-three`. Set the feature to `false` to
omit its controller, controls and renderer. The **Probe experiment → Stone
pointer** checkbox disables it immediately within one Flint instance.

Move over Flint to show the Probe. Its lower tip is the actual client-coordinate
hotspot, including during rotation. **Alt + wheel** rotates about that tip on
the X axis; ordinary wheel/Control/Command zoom input retains its existing
meaning. Typing or beginning composition hides the Probe until the pointer
moves; caret, text selection and editing remain with the existing editor.

`probe/probe.tsx` owns the Solid lifecycle and semantic state. The controller
coalesces pointer coordinates directly into a bounded animation-frame loop.
Its window-capture observers see input before the editor's document gateway
consumes it, but never cancel editor events. Only active Alt-wheel rotation is
intercepted. Disabled, forced-colour and failed WebGL states restore native
cursor styling. Idle scenes stop rendering; disposal removes observers and GPU
resources. Reduced motion removes rotational easing.

The body-level, pointer-transparent canvas uses the owning Flint root's client
rectangle plus transparent room for the body behind the tip near host edges.
This avoids inheriting desktop window CSS transforms. The renderer
shares Flint's lighting character without merging scenes or changing Graph.

`probe/targets.ts` supplies instance-scoped registration by id, kind and a
client-bounds callback. Graph owns its projected node bounds and invalidates
them after camera/object changes; the eikon registers DOM bounds. Their
distance response uses a smooth falloff: blue for nodes, amber for the eikon,
off away from targets. No application-wide DOM or Three scene search runs on
each frame. Capabilities are reserved metadata, with no additional modes.

The latest crystalline reference is a rendered presentation sheet, not a GLB
or discrete PBR maps. `crystal-geometry.ts` reconstructs its narrow silhouette
with five broad front planes and four reverse planes; the curved geometry is
confined to the sigil's actual recess walls, floor and central island. The
42 CSS pixel standard size puts visual mass above the exact tip origin and
does not change with proximity. The size is a renderer parameter for future
accessibility options, with no extra controls added in this pass.

`crystal-optics.ts` supplies restrained roughness and thickness variation and
a small neutral PMREM lighting environment, generated once. The physical
material uses dark smoke colour, satin roughness, low transmission and
thickness-dependent absorption. This models optical depth within the overlay;
it does not refract DOM text or sample another scene's pixels.

The diode combines a bright emissive core, lens/socket, a small additive halo
restricted to the diode, and a real short-range point light illuminating the
adjacent Probe facets. Blue and amber use the same optical model. Off removes
emission, halo and local light. There is no global bloom. Cross-scene spill
onto the eikon or Graph remains deferred; input, state and target architecture
are unchanged.

Run `npm run build`, then `node scripts/check-flint-probe-browser.mjs` for the
bounded Chromium demo. Captures and results go to `artifacts/flint-probe` using
temporary fixture storage. It exercises actual pointer, click, wheel and
native editor input; it is not a hardware latency benchmark.

The crystalline review uses
`PROOF_ARTIFACTS=artifacts/flint-probe-crystalline node scripts/check-flint-probe-browser.mjs`.
Full-window captures preserve actual CSS size. Detail captures increase device
pixel ratio rather than scaling the Probe mesh or changing its light falloff.
