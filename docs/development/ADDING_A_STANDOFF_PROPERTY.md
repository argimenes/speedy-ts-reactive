# Adding a standoff property

For a new passive SVG effect, use [Creating an SVG Standoff Effect](CREATING_STANDOFF_EFFECTS.md), which documents the implemented Stage 4 provider contract and current Stage 5 limits. This page retains the core/legacy CSS property recipe. CSS/region property schemas are still central; a universal property renderer/editor registry does not exist.


A persisted standoff property is a JSON object in a Standoff Block's `payload.standoffProperties`. Active ranges use inclusive Cell indexes:

```ts
{ id: crypto.randomUUID(), type: "style/bold", start: 3, end: 7 }
```

`StandoffEditorView` resolves each object through `LinkedAnnotations` before rendering. A property may therefore carry its own values or refer to a linked definition. Editing text through `replaceInlineRange` automatically maps valid ranges around inserted/deleted Cells.

There is no separate semantic-property class registration. CSS/region appearance uses the exact `type` key in [`standoffStyleSchemas`](../../src/rendering/standoff-styles.ts). Passive SVG first checks `EffectContributions`, then falls back to legacy schema rendering.

## A. Simple CSS property

Add a schema entry:

```ts
export const standoffStyleSchemas = {
  // ...
  "style/small-caps": {
    cell: { "font-variant": "small-caps" },
  },
};
```

For a property whose `value` supplies a colour, use `valueStyle`:

```ts
"text/decoration-colour": { valueStyle: "color" },
```

`compileCellStyleRuns` calculates styles only at annotation endpoints and `cellStyleAt` supplies the current run to each Cell. Multiple `text-decoration-line` values are combined; later applicable properties otherwise follow source-order assignment.

Inside core/legacy code, associate the range with text through a command (a feature should use the validated range-annotation capability shown in the SVG tutorial):

```ts
const current = (node.payload.standoffProperties as Record<string, unknown>[] | undefined) ?? [];
editor.commands.setPayloadField(node.key, "standoffProperties", [
  ...current,
  { id: crypto.randomUUID(), type: "style/small-caps", start, end },
], "Apply Small Caps");
```

Do not mutate `current`. Clone/replace the array. For editing an existing property from the annotation monitor, use `editStandoffProperty`, which checks the expected snapshot and range validity.

## B. Graphical/SVG property

Register an `EffectDefinition` through the scope-owned `AnnotationCapabilities.register.effect`. The [worked dotted-underline tutorial](CREATING_STANDOFF_EFFECTS.md#worked-example-dotted-underline-with-an-apply-command) includes property application, composition and wrapping/lane rules. It needs no new `SvgStyle` kind or `StandoffEditorView.measure` branch.

Existing rainbow, highlighter, rectangle and other legacy effects still use schema kinds and the central switch. That remains the internal path for those implementations, not the preferred recipe for a new passive foreground SVG. Filters, backdrop regions and editable projections need separate assessment; see the tutorial's limits table.

## Editing and persistence

The semantic property is generic payload JSON, so the codec, ordinary undo, and durable history need no type-specific registration. The renderer registration does not make the property creatable: add a toolbar/menu/command action that writes the property array if users need one.

Use half-open boundaries in editing APIs but store active standoff ranges as inclusive `{start, end}`. An empty user selection has no visible range. Confirm how a feature should behave at insertion boundaries; `replaceInlineRange` currently keeps insertion at a range edge outside and expands an insertion strictly inside.

## Tests

- CSS: add a schema/run test in `standoff-styles.test.ts`; render only if integration differs.
- SVG: test pure paths in `decorations.test.ts` and one `StandoffEditorView` integration asserting the keyed path/layer.
- Editing: test range mapping only if the property has semantics beyond ordinary range mapping.
- Persistence: one encode/decode round trip for a new value shape is sufficient; type strings alone need no codec test.

See [SVG and overlays](../architecture/SVG_AND_OVERLAYS.md) for coordinate and lifecycle details.
