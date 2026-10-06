# Flint object albedo assets

Generated 6 October 2026 using the built-in image_gen tool through the imagegen skill.

- `limestone-albedo.png`: generated warm pale limestone with pores/mineral inclusions, 1254 × 1254.
- `marble-albedo.png`: generated pale marble with restrained veins, 1254 × 1254.

These are new neutral albedo assets guided by the supplied texture kit's visual direction. They were not extracted from that kit. Broad directional shading is absent; local pore/mineral darkness is surface detail, not Flint cast lighting. Both maps multiply the SVG body shading and use the existing scoped pattern/alpha-mask adapter. Fine grain adjusts their blend strength alongside procedural pores. No height, AO or roughness map is used at runtime.

The original generated files remain under Codex's generated_images directory; these workspace copies are the runtime assets. PNGs are retained at original quality for Phase A visual review; together they add approximately 5.6 MB of image resources. Production compression/size selection is deferred with the later presentation integration.

## Exact generation prompts

### Limestone

Use case: photorealistic-natural. Asset type: seamless square 1024 x 1024 limestone albedo texture for a sculptural SVG interface. Produce ONLY one edge-to-edge warm pale Cycladic limestone material tile, not a texture sheet or scene. Orthographic flat material scan with irregular genuine-looking limestone substance: fine but clearly legible rounded pores, small natural fossil/mineral inclusions, faint cloudy chalk/ivory colour variation, sparse delicate mineral fractures. Detail at several scales, a few 8–20 pixel inclusions and many finer pores, so the surface still reads as stone when reduced onto a 100-pixel sculptural object. Predominantly warm chalk and ivory, subtle limestone and parchment greys, occasional restrained warm earth mineral marks. Neutral even illumination across the entire tile, no directional light, no highlights, no cast shadows, no beveled edges, no perspective, no vignette, no lighting gradient, no border, no labels, no lettering. This is colour/albedo information only; a separate renderer supplies all dynamic shading. Seamless edges, no recognisable repeated motif. Restrained natural variation, not beige noise, not a marble countertop, not polished plastic. Texture should be richer and more tangible than faint procedural SVG grain.

### Pale marble

Use case: photorealistic-natural. Asset type: square seamless pale marble albedo texture for SVG sculptural objects in a Cycladic interface. Produce ONLY one edge-to-edge square 1024 x 1024 material texture, no sheet, no scene, no letters or framing. Warm ivory/pale marble base with restrained cloudy mineral substance and sparse irregular branching veins in pale warm mineral grey, chalk, limestone and parchment tones. Fine real stone grain and faint granular crystalline detail should remain tangible, especially at close inspection. Veins quiet and uncommon, mostly hairline branching with a few softer diffuse mineral seams, not dramatic high-contrast gold strokes or a busy countertop. Neutral even diffuse scan, colour/albedo only: no specular highlights, no directional light, no cast shadows, no bevel, no depth shading, no perspective, no vignette or lighting gradient. Dynamic illumination is supplied separately by the browser renderer. Seamless across edges, natural non-repeating appearance, restrained mineral/earth palette with no saturated colours. This is a tactile but calm carved-stone material rather than a uniformly smooth pale fill.

