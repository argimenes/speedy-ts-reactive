# Caret Modes

Implemented 15 October 2026. The `caretModes` feature flag defaults to `true`;
the selected mode defaults to **Normal**. The compact Document toolbar exposes
Normal, Block Focus, Sentence Focus and Reading Spotlight. Selection is editor-session state shared
by its Document views, never a document preference or persisted annotation.

## Assessment and strategy

The existing input gateway and selection-restoration code already know the caret's
mounted Block occurrence and character-cell boundary. Standoff views already have
IntersectionObservers. The visual-effect registry already provides named TypeScript
implementations, JSON parameters, source-neutral ownership and Solid cleanup.

For Block and Sentence Focus these are sufficient without Temporary Ranges, annotation
snapshots, a new selection listener, document ancestor scans, or extra geometry measurement. Block Focus uses
the native occurrence. Sentence Focus calculates a logical region only in that Block.

Three rendering approaches were considered:

| Strategy | Decision |
| --- | --- |
| Opacity on the entire Block | Rejected: also fades controls, selections and annotation layers. |
| CSS on visible text surfaces | Selected: fade unfocused text flows once, and individual cells only around the focused sentence; no wrappers, layout changes or geometry reads. |
| Viewport overlay or mask | Unneeded for Block/Sentence Focus. Reading Spotlight now uses masks on visible text flows only, with shared caret geometry (see below). |

Both initial modes use the same `fade-outside-focus` renderer. Unfocused text flows
receive opacity once on their contenteditable container; controls and SVG layers
are siblings outside it. This avoids compositing every character of other Blocks. Visible flows in the
focused Document receive a session scope attribute. The focused flow receives a
separate attribute. Block Focus excludes all its cells from fading; Sentence Focus
excludes its half-open cell interval using `:nth-child` selectors. CSS updates apply
automatically to inserted cells, including DocumentFragment insertions. No renderer
or reactive owner is allocated per character, range, or Block.

## Registry and configuration

`editor.caretModes.registerMode()` accepts immutable, finite JSON data:

```json
{
  "id": "sentence-focus",
  "label": "Sentence Focus",
  "focusProvider": "current-sentence",
  "effect": "fade-outside-focus",
  "params": { "opacity": 0.3, "blur": 0, "scope": "viewport" }
}
```

Block Focus uses `current-block` and opacity `0.35`. Normal is a reserved mode
without a provider or effect. `select(id)` changes mode; `active()` and `list()` are
reactive. Definitions are copied, frozen and validated against registered providers
and renderers. Unknown references, duplicate IDs, non-JSON values, unsupported
focus kinds, invalid opacity, nonzero blur and non-viewport scope are rejected.

`registerProvider()` installs named TypeScript focus implementations. Both
registration methods return idempotent disposers. Application annotation
capabilities expose scoped `register.caretMode`, `register.focusProvider` and the
existing `register.renderer`; the feature scope owns their cleanup. Registration
order is renderer/provider, then mode. No generic plugin mechanism was introduced.

## Focus providers

`FocusRegion` is a discriminated union:

- `block`: mounted `nodeKey` (occurrence identity).
- `text`: mounted `nodeKey`, `start`, `end` in half-open character-cell boundaries.
- `geometry`: immutable rectangle inputs with explicit `space: "viewport"`, now used by the `caret-position` provider.

`FocusProvider` has a name, output kind and `create()` method. One provider instance
per mode activation exposes `identify(context)` and optional `dispose()`. The
context contains the active occurrence, caret, inline revision, and a lazy `cells()`
reader. It carries no annotation, canonical repository, or persistence capability.

`current-block` does not call `cells()`. Moving within that Block does not schedule
focus work. `current-sentence` uses `Intl.Segmenter` with sentence granularity;
a modest punctuation fallback supports older environments. It caches only the last
Block/revision and uses binary search for subsequent caret positions. Text edits
invalidate from the affected canonical content, including edits through another
occurrence. It never pre-segments other Blocks.

Segmenter offsets are UTF-16. A cached boundary map converts them to canonical
character cells, accounting for astral/multi-code-unit cells and an object-replacement
character for image cells. The boundary at a new sentence selects that sentence;
the end of the Block selects its final sentence. Segmenter's trailing whitespace
belongs to the preceding sentence. Empty Blocks yield an empty text interval.

## Renderer reuse and composition

`VisualEffectRegistry` now also accepts a `text-presentation` target. It declares
`focusKinds` and `create({owner, params, document})`, returning:

```ts
interface TextPresentationEffect {
  attach(flow: HTMLElement): () => void;
  focus(flow: HTMLElement | undefined, region: FocusRegion | undefined, frame?: PresentationFrame): void;
}
```

`create` runs inside a Solid-owned effect. Use `onCleanup` for style nodes, subscriptions,
and transient state. This contract is source-neutral; neither its owner nor its
focus input requires persisted properties or Temporary Ranges. Existing range SVG
and CSS-class renderers retain their contracts. Binding a presentation renderer to
an annotation range is explicitly rejected because that adapter lacks a viewport host.

The initial renderer adds only its own attributes and stylesheet. It does not change
annotation class contributions, inline styles, custom cell DOM, SVG underlines,
search/entity highlights, selection overlays, controls or layout. Removing it restores
the original appearance without needing to reconstruct those contributions. Inline
authored opacity retains CSS precedence. Custom classes which also set opacity follow
the ordinary CSS cascade; this is not a general algebra for combining arbitrary
third-party opacity effects. Existing annotation colours, filters and backgrounds
remain intact, with the faded cell composited as a whole.

Native selections suspend focus effects rather than dimming the selected text.
The focused contenteditable flow and native caret are never assigned opacity.
The renderer does not replace nodes or alter hit-testing. IME freezes focus updates
until composition ends; canonical input continues through the existing gateway.

## Viewport and lifecycle

The existing per-Block IntersectionObserver reports visibility. Only visible text
surfaces in the active Document are attached to the effect. Entering/leaving the
viewport adds/removes that surface's contribution (Block/Sentence Focus need no
geometry; Reading Spotlight measures the entering flow once). Browser
CSS handles clipping; no viewport-sized overlay cuts off annotations near an edge.
Without IntersectionObserver, mounted surfaces provide the fallback scope.

Mode changes dispose the previous Solid effect and its provider cache, style node,
flow attributes and queued frame. Normal and `setEnabled(false)` remove all effects.
Unregistering the active provider/mode/renderer returns to Normal. Clearing the caret
(blur or noncollapsed selection) clears the visual presentation immediately.
Unmounting the focused surface clears immediately. Document transitions release the
previous scope before attaching visible surfaces in the new one. Editor disposal is
terminal, cancels pending work and releases the coordinator root before the registry.

One animation-frame callback coalesces optional work. Ordinary caret moves do not
iterate all registered surfaces. Document transitions inspect the visible set only;
Block/Sentence Focus moves change at most two flow attributes and one short CSS rule. Moving
within the same sentence retains the rule without touching its style node. The
service never captures a document snapshot, writes text/properties, creates history,
marks a resource dirty, or makes network requests.

## Limits and future extensions

- Opacity only: blur is rejected, not silently approximated. It needs separate
  composition and caret/selection assessment before implementation.
- Visibility is Block-granular. A very large single visible paragraph still has its
  mounted cells subject to CSS matching. This is not character virtualization.
- Focus follows canonical source cells. A projected alternative is one outer cell
  presentation; independently segmenting its visual glyphs is future work.
- Reading Spotlight now uses geometry regions (see below). No scrolling mode, SVG
  distortion or animation system is implemented.
- Sentence segmentation follows browser locale heuristics, not document-specific NLP.
- Additional presentation effects can reuse the registry and lifecycle. Modes needing
  range SVGs should get an appropriate host using shared geometry caches, without
  manufacturing persisted annotations merely to draw them.

## Verification

Focused tests cover bounded work with 1,000 offscreen Blocks, coalescing, cached
segmentation and Unicode conversion, cross-document isolation, visibility, selection,
IME, typing/undo, disabled annotation events, registration removal, feature disable
and disposal. Rendering tests cover both direct DOM and Solid character paths and
coexistence with persisted and Temporary Range rendering, asserting no cell/path
replacement, geometry reads, repository writes or snapshots during focus changes.

The existing real Flint Chrome benchmark accepts `BENCHMARK_CARET_MODE` and
`BENCHMARK_CARET_MODES=false`. It also checks computed focus opacity in the live shell.
Timing results are diagnostic and should not be interpreted as guaranteed visible
input latency.

Initial Block/Sentence Focus validation: **78 tests across 9 files**, client/server type-checking, and
real Chrome character input/undo checks. The existing blur regression was updated
to identify regions by their rendered filter instead of assuming opaque renderer
instance keys contain authored IDs; its old assertion also failed with Caret Modes
disabled.

Chrome used the Michelangelo letter with 1,001 in-memory vault rows and 40 edits:

| Sample | Median synchronous handler | Median including queued caret work |
| --- | ---: | ---: |
| Feature disabled, initial control | 7.6 ms | 10.6 ms |
| Normal, initial control | 7.1 ms | 10.2 ms |
| Block Focus, final text-flow renderer | 3.9 ms | 5.5 ms |
| Sentence Focus, final text-flow renderer | 3.6 ms | 6.3 ms |

Every completed run recorded **zero snapshots**, 40 status reads for 40 edits, and
passed native character input/undo checks. Earlier per-cell-only fade samples were
10.0 ms (Block) and 7.1 ms (Sentence) synchronous medians. The final renderer avoids
per-cell compositing for unfocused paragraphs. Startup/warm-up and headless scheduling
vary between runs, so these samples do not establish a typing speedup over Normal.
Frame outliers remain; they are not a display-latency guarantee. Screenshots and
profiles are in `/tmp/flint-caret-block-final` and `/tmp/flint-caret-sentence-final`;
initial controls are in `/tmp/flint-caret-disabled` and `/tmp/flint-caret-normal`.


## Reading Spotlight — geometry mode

`readingSpotlight` is a separate default-on feature flag, gated by `caretModes`.
Normal remains the session default. The existing selector lists the registered mode
without a separate control or document preference. The standard registration is:

```json
{
  "id": "reading-spotlight",
  "label": "Reading Spotlight",
  "focusProvider": "caret-position",
  "effect": "reading-spotlight",
  "params": {
    "shape": "ellipse",
    "radiusX": 180,
    "radiusY": 85,
    "dimOpacity": 0.65,
    "feather": 0.7,
    "scope": "viewport",
    "transitionMs": 0
  }
}
```

Applications can register variants through the existing mode/provider/renderer
capabilities. Radii are positive viewport CSS pixels, dimOpacity and feather are
fractions from zero to one. A feather of 0.7 leaves the inner 30% fully visible,
then blends continuously to 35% text alpha at the ellipse boundary with the default
dimming. The centre tracks immediately: nonzero transitionMs is deliberately
unsupported to avoid trailing the native caret or adding an animation loop.

### Geometry and viewport host

The existing MeasurementService had selection rectangles but no caret cache.
`caretRect(nodeKey, index, frame)` now centralizes this query: it reads the native
collapsed Range, or uses the mounted view's existing `inlineBoundary` when an
Element-boundary selection yields no rectangle. That boundary may itself be a text
node. Empty Blocks/inline objects use a bounded adjacent-element fallback. There is
no walk through character cells. The last rectangle is cached by frame timestamp,
occurrence generation and selection boundary, and released on edits, blur, unmount
and editor disposal. Native text-node boundaries retain the browser's bidi/wrap
position; element-boundary fallback uses the editor's forward boundary convention.

The `caret-position` provider simply returns this rectangle in a viewport-space
geometry region. It reads no text and creates no annotation or Temporary Range.
`PresentationFrame` supplies the existing Document scope, uniform coordinate scale
and a layout revision to the reusable renderer.

### Rendering and clipping

A single Solid-owned renderer supplies radial alpha masks to **visible text
flows only**, using the existing IntersectionObservers. There is no covering DOM
overlay, background-colour approximation, extra hit target or glyph replacement.
The Document scope is only a coordinate reference; it is not masked. Controls,
menus, native scrollbars, annotation SVGs and Temporary Range layers remain outside
these masks. Custom character presentation remains intact and fades with its text.

Each attached flow has cached local bounds. Caret movement compares these cached
visible bounds with the ellipse; intersecting flows receive a non-inherited
`mask-image` with a local centre. Far flows keep a constant opacity and require no
style updates until the ellipse reaches them. The shared stylesheet is static.
There are no inherited CSS variables, dynamic rule edits, per-character updates,
or offscreen document traversal. Existing inline flow masks are retained for
restoration when the effect releases its contribution.

Native scroll containers continue to clip text. `mask-clip: no-clip` avoids adding
an additional box clip to the flow. CSS masks leave box geometry and hit testing
unchanged; see the [CSS Masking rendering model](https://www.w3.org/TR/css-masking-1/#the-mask-image-rendering-model)
and [mask clipping](https://www.w3.org/TR/css-masking-1/#the-mask-clip).

### Invalidation and cleanup

Caret, scroll and resize notifications share the coordinator's animation-frame
queue. Ordinary caret motion and outer scrolling read the caret and one scope
rectangle, reusing cached flow origins. New visible flows need only their own
origin. Existing view layout invalidation, resize, scale changes, nested scrolling
and Block removal refresh the visible-flow origins affected by reflow. This is
viewport-bounded Block geometry work, never a full document or per-cell sweep.
Geometry reads precede writes; unchanged values are not republished. View layout
notifications run untracked so switching modes cannot accidentally subscribe the
annotation layout effect to mode state.

Blur/noncollapsed selection removes the masks immediately. IME freezes visual
updates until composition ends. Normal, mode/provider/renderer removal, feature
disable, view closure and editor disposal release attributes, inline masks,
the stylesheet, cached origins, event listeners and pending frames through the
existing Solid ownership. Spotlight cannot change document data, dirty state,
undo history or persistence.

### Limitations and checks

- The spotlight intentionally affects text; annotation and highlight layers retain
  their independent appearance.
- It uses CSS masks, tested in Chrome; mask-capable browsers are required for the
  feathered effect. Arbitrary competing masks on the same flow are not a new
  composition API; descendant character masks are untouched.
- Coordinates follow the existing positive uniform scale/translation contract;
  arbitrary rotated or skewed text surfaces are not supported.
- A very large single paragraph remains Block-granular: its mounted text is one
  masked surface. This feature does not introduce character virtualization.
- Movement easing, blur and distortion are not implemented.

Focused tests cover native/element/empty caret boundaries, frame-cache invalidation,
scale conversion, 100 caret moves without rereading flow origins or restyling far
flows, restoration of prior flow masks, visibility and
layout invalidation, scrolling, IME, selection, disable and cleanup. Existing
annotation/search/character-rendering tests also pass. Chrome checks independently
compare the gradient centre with a DOM Range at the native character boundary,
exercise real scrolling and clipping, verify controls/SVGs remain unmasked, and
check native input/undo and immediate restoration on selection and Normal.


Reading Spotlight validation: **89 tests across 12 files**, client/server type checks,
and real Chrome input/undo, alignment, scroll, selection and teardown checks pass.
The Michelangelo fixture contains eight paragraphs; typing targets a 499-character
paragraph with 1,001 in-memory vault rows. Final sequential runs used Chrome's default
graphics backend (`BENCHMARK_NATIVE_GPU=1`), with 40 insert/delete operations each:

| Mode | Median handler | Median including queued caret work | Median frame | p95 frame |
| --- | ---: | ---: | ---: | ---: |
| Normal | 5.3 ms | 7.5 ms | 16.7 ms | 17.6 ms |
| Reading Spotlight | 5.4 ms | 7.6 ms | 16.7 ms | 18.3 ms |

Both runs recorded zero document snapshots and 40 status reads. Native character
input and undo passed. These samples show no material median typing regression on
this fixture; they are not a cross-device latency guarantee. The benchmark's default
SwiftShader software graphics path is slower for masks: the final software samples
were 19.4 ms Normal versus 27.6 ms Spotlight median frame intervals, with outliers in
both. Keep software rendering and very large single paragraphs in future performance
checks. The optional native-GPU setting leaves the existing benchmark default intact.

Screenshots, CPU profiles and JSON measurements are in
`/tmp/flint-spotlight-native-normal` and `/tmp/flint-spotlight-native-active`;
software comparisons are `/tmp/flint-spotlight-normal-final` and
`/tmp/flint-spotlight-direct`.
