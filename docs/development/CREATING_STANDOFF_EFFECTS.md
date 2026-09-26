# Creating an SVG Standoff Effect

Use the Stage 4 passive effect boundary when a visual can be calculated from an authored property and measured text fragments. The canonical implementation is the purple underline registered by [`createEntityReferencesFeature`](../../src/features/entity-references/index.tsx): it returns one horizontal SVG path per fragment, with `laneHeight: 2`. You do not need to change the central renderer switch to add another passive path effect.

## Property and coordinate conventions

A standoff-editor Block's authored `standoffProperties` contains ordinary JSON:

```ts
{ id: "underline-1", type: "style/dotted-underline", start: 0, end: 4 }
```

That stored range includes Cells 0 through 4. It is not a pixel range or necessarily a UTF-16 substring range. A Cell can contain multiple code units, and inline content can include non-text Cells. Do not calculate Cell boundaries with JavaScript string slicing.

| Contract | Coordinates |
| --- | --- |
| Stored `StandoffAnnotation.start/end` | Inclusive Cell indexes, `[start, end]` |
| `AnnotationTarget` | Half-open selection boundaries, `[start, end)`; not versioned authority |
| `TextRangeSnapshot` / `SearchRange` | Half-open, versioned boundaries with content/placement identity and `coordinate: "cell" \| "utf16"` |
| `VisualFragment` | Surface-local CSS pixels: `x`, `y`, `width`, `height` |

[`TextRanges.snapshot/validate`](../../src/runtime/text-ranges.ts) validates identity, version, bounds and coordinate system. [`RangeAnnotations.apply`](../../src/runtime/range-annotations.ts) requires Cell coordinates, validates the whole batch, deduplicates exact shared-content ranges, and converts the exclusive end to the stored inclusive end. Its ordinary style annotations remain independent. Text edits use core range-mapping behavior rather than effect-specific Cell mutation.

Entity References is a semantic annotation, sometimes spanning several Blocks. [`LinkedAnnotations`](../../src/runtime/linked-annotations.ts) and its [stored registry format](../../src/block-tree/linked-annotations.ts) remain shared/core infrastructure. Linked segments have their own ranges and share an `annotationId`; the shared definition holds semantic values. `AnnotationCapabilities.annotate` uses the atomic linked/local batch path with revision checks. It explicitly rejects `style/` and `text/` types; do not route a simple style through that API.

## The rendering contract

The public API exports `EffectDefinition` and `MeasuredEffect`; their source is [`runtime/effect-contributions.ts`](../../src/runtime/effect-contributions.ts):

```ts
interface EffectDefinition {
  readonly type: string;
  readonly laneHeight: number;
  render(measured: MeasuredEffect): readonly DecorationShape[];
}
```

`MeasuredEffect` supplies `key`, a deeply immutable detached `property`, a readonly array of immutable `fragments`, and `offset`. `VisualFragment` and `DecorationShape` are defined in [`rendering/decorations.ts`](../../src/rendering/decorations.ts); they are not separately re-exported by the public feature barrel. Contextual typing an `EffectDefinition` avoids importing renderer internals.

A descriptor has required `key` and `path`, plus optional `stroke`, `fill`, `strokeWidth`, `opacity`, `propertyType`, `dashArray` and `animated`. Return path descriptors, not JSX, HTML or arbitrary SVG nodes. Core applies the property's type and puts contributed paths in the foreground layer. There is no contributed layer-selection or backdrop API.

`EffectContributions.register` registers by exact property type, rejects duplicates and non-finite/negative lane heights, and returns an identity-safe disposer. `AnnotationCapabilities.register.effect` owns that disposer in the feature scope. Registering a provider enables interpretation, not a toolbar action or property creation.

## Worked example: dotted underline with an apply command

Place this complete example at `src/features/dotted-underline/index.ts`. `DottedCapabilities` is a local narrowing of existing interfaces for this example, not a new Codex API.

```ts
import type {
  AnnotationCapabilities, CodexFeature, EffectDefinition,
  FeatureScope, TextOperationCapabilities,
} from "../../feature-api";

const TYPE = "style/dotted-underline";
export const dottedUnderline: EffectDefinition = {
  type: TYPE, laneHeight: 2,
  render: ({ key, fragments, offset }) => fragments.map((f, index) => ({
    key: `${key}:dots:${index}`,
    path: `M ${f.x} ${f.y + f.height + 1.5 + offset} H ${f.x + f.width}`,
    stroke: "#7257d8", strokeWidth: 2, dashArray: "1 4", fill: "none",
  })),
};

type DottedCapabilities = Pick<AnnotationCapabilities, "selection"> &
  Pick<TextOperationCapabilities, "ranges" | "annotations"> & {
    register: Pick<AnnotationCapabilities["register"], "effect" | "command" | "action">;
  };

export function createDottedUnderlineFeature(
  capabilities: (scope: FeatureScope) => DottedCapabilities,
): CodexFeature {
  return { id: "example-dotted-underline", activate(scope) {
    const api = capabilities(scope);
    api.register.effect(dottedUnderline);
    api.register.command({
      id: "example.dotted.apply", label: "Dotted underline",
      canExecute: ({ targetKey }) =>
        api.selection(targetKey).some(range => range.end > range.start),
      execute: ({ targetKey }) => {
        const ranges = api.selection(targetKey)
          .filter(range => range.end > range.start)
          .map(range => api.ranges.snapshot(range.nodeKey, range.start, range.end));
        if (ranges.length) api.annotations.apply(ranges, TYPE);
      },
    });
    api.register.action({ id: "example.dotted.toolbar", slot: "document-actions",
      label: "Dotted underline", command: "example.dotted.apply" });
  } };
}
```

Wire the factory in `src/application/features.ts`, importing it and the existing [`annotationCapabilities`](../../src/application/annotation-capabilities.ts) and [`textOperationCapabilities`](../../src/application/text-operation-capabilities.tsx) adapters. After adding an approved `dottedUnderline` configuration flag, default false:

```ts
if (editor.features.dottedUnderline) {
  editor.featureHost.activate(createDottedUnderlineFeature(scope => {
    const annotation = annotationCapabilities(editor, scope);
    const operation = textOperationCapabilities(editor, scope);
    return {
      selection: annotation.selection, register: annotation.register,
      ranges: operation.ranges, annotations: operation.annotations,
    };
  }));
}
```

This command applies to the current native standoff or cross-Block selection. It does not claim ownership of Grouping's retained operation. For a real product's annotation menu, inspect `AnnotationContribution` and the existing current-operation routing instead of adding another selection engine. An effect-only module can omit the command/action and render properties already present in a DTO.

## What core does for the provider

[`StandoffEditorView`](../../src/rendering/standoff-editor-view.tsx) resolves linked properties, filters active ranges, calls `rangeFragments`, caches same-range geometry for one measurement pass, freezes the boundary data and invokes the provider. A wrapped selection produces multiple local fragments; return a descriptor for each rather than spanning whitespace between lines. The SVG host and clipping/layer mechanics belong to the view.

[`standoffSvgStyles`](../../src/rendering/standoff-styles.ts) uses a contributed definition before any legacy schema effect for that type. For overlapping inclusive ranges it allocates below-text lanes in property order, using `laneHeight` and a one-pixel separation. The supplied `offset` is a vertical pixel offset to honor in your geometry. Legacy underlines reserve 2px and rainbows 14px. A zero-height provider does not reserve a lane. This is not arbitrary shape collision detection, above-text allocation or a new line-height/layout engine.

Measurement is coalesced by core through an animation frame (timer fallback), with a surface `ResizeObserver` and reactive invalidation for relevant annotations, inline length, selections, decorations and effect registrations. Cleanup disconnects observers/listeners and cancels scheduled work. Normal scrolling carries the local SVG with its text surface; the capturing scroll listener specifically remeasures visible exclusion controls, not every passive effect on every scroll.

Font/layout changes that resize the observed surface use that same schedule. **There is no dedicated `document.fonts` readiness listener or blanket external-layout invalidation hook in `StandoffEditorView`.** A font change that alters fragments without a surface-size change is not guaranteed to invalidate solely because it is a font change. If your feature demonstrates a missing trigger, propose a core invalidation correction; do not add a private font/resize/scroll observer to every provider. The minimap's broader invalidation logic is a separate system.

## Ownership, absence and verification

The feature scope owns provider registration; the view owns measurement lifetime. Providers should behave as pure `property + measured fragments → descriptors` functions. They must not query editable DOM, install ResizeObservers, measure independently, mutate Cells, own scroll/layout observation, or turn visible geometry into permission to edit/delete text.

When the provider is absent, an unknown type simply has no contributed SVG; its authored property remains serialized and text remains editable. If the type has a legacy schema, that fallback can still render it—absence does not disable unrelated existing schema behavior. Ordinary range validation/mapping and linked annotation identity remain core responsibilities.

Qualify pure descriptor output where useful, one mounted render, overlapping lanes, wrapping/resizing and absent-provider preservation. Inspect [effect tests](../../src/runtime/effect-contributions.test.tsx), [standoff renderer tests](../../src/rendering/standoff-editor-view.test.tsx) and the [Stage 4 browser harness](../../scripts/check-stage4-annotations-browser.mjs). A new passive effect does not justify a replacement measurement engine or an exhaustive viewport matrix.

## What this contract does not cover

| Existing path | Current status / decision |
| --- | --- |
| Purple Entity Reference underline | Extracted provider; canonical example for passive paths |
| Rainbow/ordinary underline, highlighter, rectangle, spiky outline | Deliberate legacy `standoffStyleSchemas` + central `measure()` switch; their existing rendering remains. New passive foreground paths can use a provider without migrating these. |
| Cell CSS such as bold/color | Central style schemas and `compileCellStyleRuns`; no feature-owned CSS-property registration contract |
| Blur/backdrop/motion-blur and other region effects | Central `regionAppearance`/region-layer path; measured rectangles plus filter/blend policy, not arbitrary foreground paths |
| Noise/shader regions | Existing schema/noise layer; no contributed region/shader lifetime contract |
| Show/Hide | Core authored annotation and conceal/reveal projection with a narrow selection-visibility seam; affects selection/editing semantics as well as appearance |
| Text Superposition | Editable projected readings, source mapping and child content; explicitly deferred, not a passive effect |

A blur/filter, interactive region or alternate editable reading may require a new reviewed capability. Record that limitation before implementation; do not disguise it as an SVG provider or migrate those paths as part of adding a simple line.
