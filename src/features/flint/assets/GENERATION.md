# Flint object albedo assets

Generated 6 October 2026 using the built-in image_gen tool through the imagegen skill.

- `limestone-albedo.png`: generated warm pale limestone with pores/mineral inclusions, 1254 × 1254.
- `marble-albedo.png`: generated pale marble with restrained veins, 1254 × 1254.

These are new neutral albedo assets guided by the supplied texture kit's visual direction. They were not extracted from that kit. Broad directional shading is absent; local pore/mineral darkness is surface detail, not Flint cast lighting. In the original SVG study both maps multiply body shading through the scoped pattern/alpha-mask adapter; that study uses no height, AO or roughness map. The Three.js renderer now uses separate physical maps as described below.

The original generated files remain under Codex's generated_images directory; these workspace copies are the runtime assets. PNGs are retained at original quality for Phase A visual review; together they add approximately 5.6 MB of image resources. Production compression/size selection is deferred with the later presentation integration.

## Exact generation prompts

### Fine limestone — 7 October 2026 convergence pass

`limestone-fine-albedo.png` (1254 × 1254) was generated with the built-in image_gen
tool through the imagegen skill. It replaces the coarser albedo in the Three.js
plane and carvings, retaining the original assets for the SVG study. This is new
colour data guided by the material kit, not a crop of its shaded spheres or swatches.
Linear pore-height and roughness maps are generated separately in `stone-detail.ts`;
mask concavity AO is generated from its recess positions in `three-material-graph.ts`.

Original output: `/Users/iianneill/.codex/generated_images/01a1110c-1f3e-71c3-a9eb-191e6cb6b5e6/exec-3a57ed55-800e-4a1b-8654-09a4e23e0d00.png`.

Exact prompt:

Use case: photorealistic-natural. Asset type: a single production PBR base-color/albedo texture tile for a quiet Cycladic limestone interface in Three.js. Generate a square seamless tile, edge to edge material only, orthographic straight-on. Fine pale warm-grey ivory limestone, neutral mineral colour average roughly #ddd7cb, subtle cloudy calcite differences, extremely sparse fine faint hairline mineral seams and a little very fine grey/buff speckling. Broad tone variation must be low contrast. Refined clean natural limestone, not marble, not distressed plaster, not a kitchen countertop. The surface should have the substance and restraint of the fine limestone in an architectural materials kit. Absolutely NO directional lighting, NO light gradient, NO shadows, NO cast shadows, NO rim lighting, NO specular highlights, NO vignette, NO ambient occlusion painted into the colour. No large pits, craters, fossils, shells, circles, pebbles, bold veins or cracks. Micro pores and roughness will be rendered with separate physical maps: keep the albedo calm. Flat uniformly lit material-colour data, not a photograph of a slab in a room, no labels, borders, objects, text, sphere, or presentation board. Seamless tiling at all four edges, no obvious repeating motif.

### Limestone

Use case: photorealistic-natural. Asset type: seamless square 1024 x 1024 limestone albedo texture for a sculptural SVG interface. Produce ONLY one edge-to-edge warm pale Cycladic limestone material tile, not a texture sheet or scene. Orthographic flat material scan with irregular genuine-looking limestone substance: fine but clearly legible rounded pores, small natural fossil/mineral inclusions, faint cloudy chalk/ivory colour variation, sparse delicate mineral fractures. Detail at several scales, a few 8–20 pixel inclusions and many finer pores, so the surface still reads as stone when reduced onto a 100-pixel sculptural object. Predominantly warm chalk and ivory, subtle limestone and parchment greys, occasional restrained warm earth mineral marks. Neutral even illumination across the entire tile, no directional light, no highlights, no cast shadows, no beveled edges, no perspective, no vignette, no lighting gradient, no border, no labels, no lettering. This is colour/albedo information only; a separate renderer supplies all dynamic shading. Seamless edges, no recognisable repeated motif. Restrained natural variation, not beige noise, not a marble countertop, not polished plastic. Texture should be richer and more tangible than faint procedural SVG grain.

### Pale marble

Use case: photorealistic-natural. Asset type: square seamless pale marble albedo texture for SVG sculptural objects in a Cycladic interface. Produce ONLY one edge-to-edge square 1024 x 1024 material texture, no sheet, no scene, no letters or framing. Warm ivory/pale marble base with restrained cloudy mineral substance and sparse irregular branching veins in pale warm mineral grey, chalk, limestone and parchment tones. Fine real stone grain and faint granular crystalline detail should remain tangible, especially at close inspection. Veins quiet and uncommon, mostly hairline branching with a few softer diffuse mineral seams, not dramatic high-contrast gold strokes or a busy countertop. Neutral even diffuse scan, colour/albedo only: no specular highlights, no directional light, no cast shadows, no bevel, no depth shading, no perspective, no vignette or lighting gradient. Dynamic illumination is supplied separately by the browser renderer. Seamless across edges, natural non-repeating appearance, restrained mineral/earth palette with no saturated colours. This is a tactile but calm carved-stone material rather than a uniformly smooth pale fill.
