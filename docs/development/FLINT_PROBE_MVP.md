# Flint Probe MVP

The default-on `flintProbe` experimental feature adds a stone pointer to each
Flint application and `/flint-material-three`. Set the feature to `false` to
omit its controller, controls and renderer. The **Probe experiment → Stone
pointer** checkbox disables it immediately within one Flint instance.

Move over Flint to show the Probe. Its top tip is the actual client-coordinate
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
rectangle. This avoids inheriting desktop window CSS transforms. The renderer
shares Flint's lighting character without merging scenes or changing Graph.

`probe/targets.ts` supplies instance-scoped registration by id, kind and a
client-bounds callback. Graph owns its projected node bounds and invalidates
them after camera/object changes; the eikon registers DOM bounds. Their
distance response uses a smooth falloff: blue for nodes, amber for the eikon,
off away from targets. No application-wide DOM or Three scene search runs on
each frame. Capabilities are reserved metadata, with no additional modes.

The supplied asset pack is a rendered presentation sheet, not a supplied GLB
or discrete PBR files. The MVP therefore reconstructs its double-pointed
silhouette and unlit circle/stem incision as real closed geometry (2,336
triangles), with separate stone height/roughness data and an emissive mineral
inclusion. The sigil is displaced into the front surface. No baked directional
lighting, image overlay, bloom or final production-model claim is involved.

Run `npm run build`, then `node scripts/check-flint-probe-browser.mjs` for the
bounded Chromium demo. Captures and results go to `artifacts/flint-probe` using
temporary fixture storage. It exercises actual pointer, click, wheel and
native editor input; it is not a hardware latency benchmark.
