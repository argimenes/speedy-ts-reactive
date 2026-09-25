# Adding a standoff property

This recipe documents the current core/legacy property path. The Timer feature-module pilot has not introduced a public property/effect registry or annotation-target API. Follow these internal integration points for scoped property work; do not expose `ReactiveEditor` to a feature as a workaround. See [implemented feature boundaries](../architecture/FEATURE_MODULES_AND_BLOCK_APPLICATIONS.md).


A persisted standoff property is a JSON object in a Standoff Block's `payload.standoffProperties`. Active ranges use inclusive Cell indexes:

```ts
{ id: crypto.randomUUID(), type: "style/bold", start: 3, end: 7 }
```

`StandoffEditorView` resolves each object through `LinkedAnnotations` before rendering. A property may therefore carry its own values or refer to a linked definition. Editing text through `replaceInlineRange` automatically maps valid ranges around inserted/deleted Cells.

There is no separate semantic-property class registration. Appearance is discovered by the exact `type` key in [`standoffStyleSchemas`](../../src/rendering/standoff-styles.ts).

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

Associate the range with text through a command:

```ts
const current = (node.payload.standoffProperties as Record<string, unknown>[] | undefined) ?? [];
editor.commands.setPayloadField(node.key, "standoffProperties", [
  ...current,
  { id: crypto.randomUUID(), type: "style/small-caps", start, end },
], "Apply Small Caps");
```

Do not mutate `current`. Clone/replace the array. For editing an existing property from the annotation monitor, use `editStandoffProperty`, which checks the expected snapshot and range validity.

## B. Graphical/SVG property

The current integration is explicit rather than registry-driven. For a new geometry kind, make these changes:

1. Add a case to the private `SvgStyle` union and a `standoffStyleSchemas` entry.
2. Add a pure geometry function in [`decorations.ts`](../../src/rendering/decorations.ts) if existing underline/highlight/outline geometry is insufficient.
3. Add the kind to the `measure()` switch in [`StandoffEditorView`](../../src/rendering/standoff-editor-view.tsx).
4. Choose background or foreground layer and any lane/collision behaviour.
5. Add schema/geometry and renderer-focused tests.

Minimal “bracket” skeleton:

```ts
// standoff-styles.ts
type SvgStyle =
  | { kind: "underline"; colour: string }
  | { kind: "rainbow" | "highlighter" | "rectangle" | "spiky" | "bracket" };

// in standoffStyleSchemas
"style/bracket": { svg: { kind: "bracket" } },
```

```ts
// decorations.ts — keep geometry independent of Solid/DOM
export function bracketShapes(
  key: string,
  fragments: VisualFragment[],
): DecorationShape[] {
  return fragments.map((f, i) => ({
    key: `${key}:${i}`,
    path: `M ${f.x - 3} ${f.y} h -4 v ${f.height} h 4`,
    stroke: "currentColor",
    strokeWidth: 2,
    fill: "none",
  }));
}
```

```ts
// StandoffEditorView.measure switch
case "bracket":
  shapes = bracketShapes(key, fragments);
  break;
```

`rangeFragments` already turns an inclusive Cell range into one local rectangle per wrapped line. The view schedules measurement for annotation/inline/selection changes and observes surface resize. The SVG follows scroll with its local surface. Add another invalidation only when your geometry depends on a cause the surface observer does not cover.

If an existing shape is sufficient, prefer a parameterized schema kind over copying measurement code. Underlines/rainbows currently receive noncolliding vertical offsets; a new below-text decoration must either join that allocation in `standoffSvgStyles` or document intentional overlap.

## Editing and persistence

The semantic property is generic payload JSON, so the codec, ordinary undo, and durable history need no type-specific registration. The renderer registration does not make the property creatable: add a toolbar/menu/command action that writes the property array if users need one.

Use half-open boundaries in editing APIs but store active standoff ranges as inclusive `{start, end}`. An empty user selection has no visible range. Confirm how a feature should behave at insertion boundaries; `replaceInlineRange` currently keeps insertion at a range edge outside and expands an insertion strictly inside.

## Tests

- CSS: add a schema/run test in `standoff-styles.test.ts`; render only if integration differs.
- SVG: test pure paths in `decorations.test.ts` and one `StandoffEditorView` integration asserting the keyed path/layer.
- Editing: test range mapping only if the property has semantics beyond ordinary range mapping.
- Persistence: one encode/decode round trip for a new value shape is sufficient; type strings alone need no codec test.

See [SVG and overlays](../architecture/SVG_AND_OVERLAYS.md) for coordinate and lifecycle details.
