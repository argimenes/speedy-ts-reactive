# Adding a Block property

This recipe documents the current core/legacy Block-property path. Stages 1–5 supply specific feature capabilities, including passive standoff effects and annotation UI, but no general Block-property renderer/editor registry. Follow these internal integration points for Block-property work; do not expose `ReactiveEditor` to a feature as a workaround. See [implemented extension boundaries](EXTENSION_ARCHITECTURE.md).


Block properties are persisted as JSON objects in `payload.blockProperties`, conventionally with `type`, optional `value`, optional `metadata`, and sometimes `isDeleted`. The active reactive implementation has no `BlockProperty` registry. Ordinary appearance is a switch in [`blockAppearance`](../../src/rendering/appearance.ts); specialized views may interpret properties themselves.

The similarly named legacy schemas in [`src/properties/block-properties.ts`](../../src/properties/block-properties.ts) belong to the imperative implementation. Do not register a new reactive property there.

## A. CSS/UI property

Add a `blockAppearance` case:

```ts
case "block/border/accent":
  classes.push("block_border_accent");
  style["border-left"] = `4px solid ${String(property.value ?? "#6b7cff")}`;
  break;
```

Views which call `blockAppearance(node())` receive the property automatically. Current examples include `GenericContainerView`, `PageView`, and `StandoffEditorView`. A bespoke view which does not call this helper must opt in.

Write the property by replacing the array through a command:

```ts
const properties =
  (node.payload.blockProperties as Record<string, unknown>[] | undefined) ?? [];

const next = [
  ...properties.filter(p => p.type !== "block/border/accent"),
  { type: "block/border/accent", value: "#8a5cff" },
];

editor.commands.setPayloadField(
  node.key,
  "blockProperties",
  next,
  "Set Accent Border",
);
```

Add a control to `DocumentStyleBar`, a context menu, or a type-specific view only when users need to edit it. A property renderer and an editing control are separate concerns.

Because the array is payload JSON, generic persistence, undo, commit capture, and Block history work automatically. Do not put runtime effect handles, elements, functions, or observers in `metadata`.

## B. Graphical/SVG property

There is currently no common Block-property SVG pipeline. Implement the smallest layer in the owning view or a deliberately shared wrapper used by the affected views.

A local outline example:

```tsx
function AccentOutline(props: { nodeKey: string }) {
  const { editor, projection } = useReactiveView();
  const property = () => {
    const values = projection.state.nodes[props.nodeKey]?.payload
      .blockProperties as Array<Record<string, unknown>> | undefined;
    return values?.find(p => p.type === "block/outline" && !p.isDeleted);
  };

  // When the SVG is inside the Block and uses a 100% view box/CSS inset,
  // it may need no DOM measurement at all.
  return <Show when={property()}>
    <svg class="block-outline" aria-hidden="true">
      <rect x="1" y="1" width="calc(100% - 2px)" height="calc(100% - 2px)" />
    </svg>
  </Show>;
}
```

Prefer layout-relative SVG/CSS like this when possible. If the graphic connects Blocks or depends on measured text:

1. register each participating root in `MountRegistry`;
2. read rectangles through `MeasurementService.blockRect` or native range rectangles;
3. convert viewport points with `toLayerPoint`;
4. own the layer in a stable component/portal;
5. observe resize/scroll/font/DOM causes actually affecting the geometry;
6. coalesce measurement with `requestAnimationFrame`;
7. dispose every listener, observer, and frame.

Do not reuse `StandoffEditorView.rangeFragments` for a Block property unless the property really targets Standoff Cell ranges. That function and its SVG layers are local to one Standoff surface. Cross-Block connectors need a common ancestor/portal coordinate space.

## Registration and coverage

“Registration” currently means:

- an appearance switch entry for generic CSS;
- ensuring every intended view calls `blockAppearance`;
- property-specific view/layer code for graphics;
- an action/control which writes the property, if editable.

Test the pure value-to-style or value-to-shape mapping, one representative view, command undo/redo, and an encode/decode round trip if the metadata shape is novel. Avoid tests for individual aesthetic pixel values unless they encode behaviour.

This integration cost is a known transitional weakness. See the friction notes in [Repository map](REPOSITORY_MAP.md).
