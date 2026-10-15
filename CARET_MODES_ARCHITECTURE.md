# Caret Modes

Implemented 15 October 2026. The `caretModes` feature flag defaults to `true`;
the selected mode defaults to **Normal**. The compact Document toolbar exposes
Normal, Block Focus and Sentence Focus. Selection is editor-session state shared
by its Document views, never a document preference or persisted annotation.

## Assessment and strategy

The existing input gateway and selection-restoration code already know the caret's
mounted Block occurrence and character-cell boundary. Standoff views already have
IntersectionObservers. The visual-effect registry already provides named TypeScript
implementations, JSON parameters, source-neutral ownership and Solid cleanup.

These are sufficient without Temporary Ranges, annotation snapshots, a new selection
listener, document ancestor scans, or extra geometry measurement. Block Focus uses
the native occurrence. Sentence Focus calculates a logical region only in that Block.

Three rendering approaches were considered:

| Strategy | Decision |
| --- | --- |
| Opacity on the entire Block | Rejected: also fades controls, selections and annotation layers. |
| CSS on visible text surfaces | Selected: fade unfocused text flows once, and individual cells only around the focused sentence; no wrappers, layout changes or geometry reads. |
| Viewport overlay or mask | Deferred: foreground dimming also affects chrome/highlights, selective holes require geometry, and blur adds compositing complexity. |

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
- `geometry`: immutable rectangle inputs, reserved for future providers/effects.

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
  focus(flow: HTMLElement | undefined, region: FocusRegion | undefined): void;
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
viewport adds/removes that surface's contribution without reading geometry. Browser
CSS handles clipping; no viewport-sized overlay cuts off annotations near an edge.
Without IntersectionObserver, mounted surfaces provide the fallback scope.

Mode changes dispose the previous Solid effect and its provider cache, style node,
flow attributes and queued frame. Normal and `setEnabled(false)` remove all effects.
Unregistering the active provider/mode/renderer returns to Normal. Clearing the caret
(blur or noncollapsed selection) clears the visual presentation on the next frame.
Unmounting the focused surface clears immediately. Document transitions release the
previous scope before attaching visible surfaces in the new one. Editor disposal is
terminal, cancels pending work and releases the coordinator root before the registry.

One animation-frame callback coalesces optional work. Ordinary caret moves do not
iterate all registered surfaces. Document transitions inspect the visible set only;
in-document moves change at most two flow attributes and one short CSS rule. Moving
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
- Geometry regions are an interface extension point; no geometry provider, spotlight,
  scrolling mode, SVG distortion or animation system is implemented.
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

Validation completed: **78 tests across 9 files**, client/server type-checking, and
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
