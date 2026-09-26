# Creating an Application Hosted by a Window Block

A core Window Block is a container with windowing behavior. Its child Blocks supply the application/content. That is different from a feature-owned floating panel, Timer's standalone Portal, and Compact Document's presentation contribution.

The active implementation is [`WindowView` in core-block-views.tsx](../../src/rendering/core-block-views.tsx), registered for both `window-block` and `document-window-block` by [`registerCoreViews`](../../src/rendering/register-core-views.ts). [`ChildBlocks` / `BlockOutlet`](../../src/rendering/block-outlet.tsx) render each child using its registered type. There is no special `application` field or Window application registry.

## Structure and a supported example

A general application can be an inline hosted Block inside `window-block`. A document window normally contains `document-block`, whose children are pages/content. `document-window-block` adds document style/status UI, margin context/drawer behavior and the optional document presentation control. `window-block` does not acquire that document chrome merely because it contains text.

After implementing and activating [Counter](CREATING_BLOCK_TYPES.md), this DTO is a supported initial tree for host code:

```ts
import type { ExistingBlockDto } from "../../feature-api";

export const counterWindow: ExistingBlockDto = {
  id: "counter-window", type: "window-block",
  metadata: {
    title: "Counter", state: "normal",
    position: { x: 40, y: 40 }, size: { w: 360, h: 260 }, zIndex: 2,
    icon: { kind: "window" },
  },
  children: [{ id: "counter-content", type: "example/counter-block", count: 0 }],
};
```

This snippet's import fits a fixture under `src/features/example-window/`; application/test hosts can adjust the relative path. Host code constructs `ReactiveEditor(counterWindow, { features: { counter: true } })`, calls `registerApplicationViews`, creates a projection and renders `ReactiveTreeView`. For a workspace, put the Window under the appropriate background/container instead of making it the root. Use new authored IDs for new instances.

The child receives only its own `BlockRuntime`. Its widget mount and `setField("count", ...)` work as usual. The window owns its own container mount and geometry. Neither nesting nor registration exposes a parent editor/window handle to the child. A feature's `FeatureBlocks.insert` only inserts its owned Block types, so the Counter feature cannot use that port to create the core `window-block` wrapper. Today a host constructs the wrapper DTO or uses core tree commands; a feature-side “open my application in a new Window” capability is not implemented.

Keep the child inline for this pattern. Timer's existing view deliberately renders a Portal with its own floating position, header and resize handle. Nesting its DTO under a Window would not convert that Portal into normal Window content.

## Window mechanics today

| Concern | Canonical `WindowView` behavior |
| --- | --- |
| Geometry | `metadata.position.{x,y}` defaults to 20/20; `metadata.size.{w,h}` defaults to 840/620 when absent/invalid; `metadata.zIndex` defaults to 1. Position is a CSS transform. |
| Title | Reactive `String(metadata.title ?? "Untitled")` in the normal header and minimized icon label. |
| Movement | Header pointer gesture previews locally, uses pointer capture when available, and commits position on completion; cancel discards the preview. Non-left-button and Control gestures do not start dragging. Minimized icons are draggable and viewport-clamped. |
| Resize | Shared [`createFloatingWindowResize`](../../src/rendering/floating-window-resize.tsx), only enabled/rendered for normal state. Pointer/keyboard previews stay local and commit once; Escape/cancel clears the preview. Keyboard arrows use 10px steps, Shift uses 1px. |
| Minimum size | General window 240×160. Document window 560×240, or 602px minimum width with a visible minimap lane. The resize primitive also clamps to available viewport space. |
| Storage | Completed move/resize/state changes replace metadata through core commands, retaining other metadata fields. Canonical geometry is authored, undoable and serialized. |
| Minimize | Stores `state: "minimized"`, replaces normal content with a 96px icon, and unmounts its child views. Authored child data remains. Focus/selection can be remembered and restored after remount. |
| Restore | Stores `state: "normal"`; restores the saved native/inline selection when available, otherwise focuses suitable editable content or the window root. |
| Close | Ordinary close removes the Window through core commands. Sticky-note windows use the existing StickyNote service's close behavior instead. |
| Focus | Window mount uses `container` input policy. Child application mounts retain their own input policy. Minimize closes relevant overlays/Find state and clears cross-text selection. |
| Presentation | Drag/resize previews, return-focus snapshots, drawers, automatic collapse and explicit compact state are transient. Compact resizing is converted back to expanded authored width. |

`resolvedWindowState` accepts `normal`, `minimized`, `maximized` and legacy spelling `maximised`. **Canonical `WindowView` does not expose a maximize button or implement a viewport-filling maximize branch.** A maximized value resolves but does not acquire the legacy demo's layout; the normal resize handle is suppressed. Do not advertise maximize support for a new canonical application on the basis of that enum alone.

The [`DemoSession` shell in workspace-demo.tsx](../../src/demo/workspace-demo.tsx) is a separate legacy host: it has a maximize button/class, local window state, a filename/save-state header and a workspace snapshot bridge. Its expanded snapshot was corrected in Stage 5 so compact/minimized displayed width is not saved as normal width. These demo conveniences are not public Window Block options. Generic Window views remain the target for new authored window containers.

## Window handle/title bar inventory

This table describes canonical Window Blocks, not Timer's custom header or the legacy demo shell.

| Question | Supported today | What would require a core change/capability |
| --- | --- | --- |
| Supply a title? | Set `metadata.title` in host-authored DTO/commands. | A child has no parent-title setter in `BlockRuntime`. |
| Supply an icon? | `metadata.icon` can be `"document"`, `"window"` or `{kind: ...}` for those two kinds. Defaults follow Window type. Used by the minimized icon. | No arbitrary image/SVG/component icon and no normal-header icon slot. |
| Add header controls? | Hard-coded minimize/close; document windows also render the single presentation contribution's control (Compact). | No per-application action/control slot. The presentation slot is not an application-header API. |
| Suppress standard controls? | No metadata flag to hide minimize or close. Sticky close behavior is hard-coded. | Core change; no `showClose`, `showMinimize` or standard-control policy today. |
| Add application-specific controls? | Put them in the application's own content UI. | Putting Filter/Refresh/etc. in the core title bar needs a new header contribution. |
| Change drag-handle behavior? | Core header owns pointerdown/move/up/cancel, capture and Control/button checks. Existing controls stop pointerdown propagation. | No application-provided drag region, drag veto callback or alternate gesture policy. |
| Choose standard/minimal/custom chrome? | Canonical normal and minimized presentations only; appearance properties can affect supported styling, not replace the header contract. | No chromeless/minimal variant or custom-header component option. |
| Provide status information? | Host code can change the title string; no separate status slot. | A child cannot supply a live badge/status node to the header. Demo filename/save text is hard-coded in `DemoSession`. |
| React to application state? | Window metadata reads are reactive; host/core commands changing the Window's own metadata update its title. | The child's fields are not automatically title inputs. No public child-to-parent header binding exists. |
| Custom toolbar? | Document windows use the existing document style/status bars and feature action/toolbar contributions. | No general per-application toolbar slot in a Window. Those document contributions are editor UI, not window-specific app chrome. |

The [window icon source](../../src/rendering/window-icon.tsx), `WindowView` header JSX and [document style bar](../../src/rendering/document-style-bar.tsx) are the authority for these options. CSS overrides that hide core controls are not a supported configuration API.

## Document-window presentation is a different boundary

[`WindowPresentationPort`](../../src/runtime/window-presentation.ts) currently has exactly:

```ts
interface WindowPresentationPort {
  readonly marginsCollapsed: Accessor<boolean>;
  requestMarginCollapse(collapsed: boolean): void;
}
```

A `WindowPresentationContribution` supplies `workspaceClass` and `create(port)`, which returns `{ className: Accessor<string>, control: Component }` per mounted document window. [`PresentationCapabilities.register`](../../src/feature-api/presentation.ts) is owned by the [application adapter](../../src/application/presentation-capabilities.ts); [`createWindowPresentation`](../../src/rendering/window-presentation.ts) keeps geometry/focus mechanics core-private. There is one optional slot, not a registry of competing layouts. A second registration conflicts with Compact when Compact is enabled.

[Compact Document](../../src/features/compact-document/index.tsx) owns its explicit signal, button and styles. Core combines its request with automatic narrow collapse, preserves expanded geometry and retains margins/drawer/focus behavior even without the feature. Disposal revokes the instance request. The port exposes neither Window children nor generic metadata, measurements, application launching or arbitrary DOM. Do not repurpose it to install a Graph Explorer title bar.

## Recommendation for review: an application header contribution

**Not implemented.** The smallest useful first step for the requested examples would be a per-hosted-window, disposable header contribution with an optional leading icon component, an application-actions component, and a `showMinimize` choice (default true). Core would keep the title's authored metadata, standard close action, pointer capture, drag region, focus and geometry. Core would also need to bind the contribution to the hosting window without exposing parent traversal or `ReactiveEditor` to the child. This association/lifetime is part of the proposal, not something `BlockRuntime` already supplies.

Conceptual requests, not accepted DTO fields or exported types:

```text
Graph Explorer:
  leadingIcon = GraphGlyph
  actions = FilterButton          (may read application-local Solid state)
  showMinimize = true

┌───────────────────────────────────────┐
│ ◈ Graph Explorer      [Filter] [—][×] │
├───────────────────────────────────────┤
│ application content                   │
└───────────────────────────────────────┘

Notes:
  actions = absent
  showMinimize = false

┌───────────────────────────────────────┐
│ Notes                            [×] │
├───────────────────────────────────────┤
│ application content                   │
└───────────────────────────────────────┘
```

Today, both can use a standard Window title and place their controls in content; neither illustrated custom header is directly configurable. A reactive actions component could cover a small status badge without a separate status framework. A dynamic child-driven title would need its own justified semantic request; do not smuggle it through arbitrary metadata access.

A genuinely minimal/chromeless window needs a separate decision about how users move, restore and close it, including keyboard/focus access. That should not be added implicitly to the small icon/actions proposal. There is no justification here for a universal layout registry, replacement Window view or unrestricted header/DOM middleware. No proposed API is implemented in this documentation task.

## Qualification to copy

Use [core window tests](../../src/rendering/window-icon.test.tsx), [resize tests](../../src/rendering/floating-window-resize.test.tsx) and [Compact tests](../../src/features/compact-document/window.test.tsx). Verify authored geometry vs transient presentation, minimize/remount of application resources, focus, pointer/keyboard resize, multiple windows and removal of the application implementation. The Window should remain usable and the unknown child's authored payload should survive.
