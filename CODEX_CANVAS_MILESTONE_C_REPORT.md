# Canvas Milestone C — presentation composition and derivation

Status: **implemented and qualified; stop for review before Milestone D.**

The accepted B baseline is preserved in `f0bc2e2` (`Milestone B finished`). This implements C of the [approved plan](CODEX_CANVAS_WORKSPACE_PRESENTATION_PLAN.md), retaining the constraints in the [B report](CODEX_CANVAS_MILESTONE_B_REPORT.md).

## Result and access

An opened canonical workspace can now switch between Desktop and a static Canvas. The same workspace session, editor, repository, projection, content identities, text undo and saved layouts survive switching. Content is neither exported/reloaded nor copied to a second store to change presentation.

`canvasWorkspace` remains **false by default**. For development:

```sh
VITE_CANVAS_WORKSPACE=1 npm run dev:client -- --host 127.0.0.1 --port 5187
```

Open a self-contained local Workspace or an existing server Workspace. The initial split demo does not expose presentation controls or migrate itself automatically. Use a workspace with ordinary document Windows and an image for this milestone; embedded applications/media with unqualified lifetimes can prevent switching, as described below. The environment opt-in applies only in development; hosts can explicitly supply the configuration flag.

With the flag enabled, **Workspace → Presentations → Desktop / Canvas** uses session-owned `workspace.presentation.desktop` / `.canvas` commands. The fallback toolbar invokes those same commands. The checked state reflects the actual rendered presentation. The submenu supports ArrowRight, ArrowLeft, Escape, Up/Down, Home/End, Enter and disabled-item skipping. Escape/Left returns focus to the submenu trigger; selecting a radio item closes the menu. Opening the submenu does not close its parent menu.

Canonical Local **Save Workspace as…** now passes `saveAs` to the existing browser writer using B's captured snapshot. Cancellation leaves dirty state and the original file untouched; a successful copy retains workspace/document identities. The existing server filename chooser continues to provide its create-only/overwrite flow and keeps referenced Document resource locations. No new persistence format or endpoint was added.

## Composition and ownership

[WorkspacePresentationView](src/application/workspace-presentation-view.tsx) holds one provider and one set of [view layers](src/rendering/reactive-tree-view.tsx) for the session. Desktop mounts the existing root. Canvas mounts resolved object roots through the existing `BlockOutlet`, in absolutely positioned hosts inside one transformed world. Global panels/layers and application chrome remain outside that world.

Object hosts use saved Canvas bounds and order. Camera `(x, y)` is the world coordinate at the viewport origin, with `viewportLocal = zoom × (world − camera)`. The existing A coordinate frame supplies the scale to native renderers and centralized standoff measurement. Native client-coordinate caret hit testing remains unchanged.

A minimal `WindowGeometryHost.static` policy displays normal Window content and suppresses Desktop minimize/close and move/resize actions. Canvas position belongs to its outer object host; the inner Window starts at `(0,0)` and consumes saved expanded dimensions. Static hosting neither rewrites Desktop Window state nor introduces a new window/layout registry. Compact and automatic margin mechanics continue through the existing core presentation port.

Before mounting, resolution rejects duplicate occurrences and overlapping ancestor/descendant roots. Missing, ambiguous, replaced or unsupported objects keep their directory entries and bounds and display labeled placeholders. C mounts ordinary Windows and images. Direct Documents, Portal Windows and embedded application/media subtrees remain unqualified; it does not infer a new occurrence or silently mount a Portal as inline content.

Root resolution responds to structural/identity changes. Ordinary text edits do not scan the workspace or remount object roots. There are no new observers, polling loops, all-feature input broadcasts or renderer/effect measurements.

## Deterministic first derivation

[deriveCanvas](src/application/canvas-derivation.ts) prepares and validates a candidate before committing anything:

1. Traverse known workspace/background containers in source order, stopping at object roots. Never enumerate Document descendants as workspace objects.
2. Retain existing directory entries and stable anchors. Allocate missing authored identities only during this explicit initialization. Reject ambiguous anchors, repeated object occurrences and identity collisions before writing.
3. Read Window positions and **expanded stored sizes**, including minimized Windows. Use the existing 840×620 Window defaults where size is absent. Canvas displays normal content without changing the source state.
4. Put direct objects on a deterministic three-column grid to the right of imported Window bounds. Use metadata dimensions or 320×240 defaults, with spacing based on the largest direct-object dimensions. No image-load or DOM timing determines geometry.
5. Order by Desktop z-index, source order and object ID. Copy only the first background's type/metadata as visual presentation data, never its authored children.
6. Fit saved bounds against a fixed 1200×800 reference viewport with 32px padding and zoom between 0.05 and 1. An empty source produces camera `(0,0,1)` and no placements. These are initialization rules; D's camera-control limits remain separate.

The candidate is validated before identity additions and layout initialization are committed synchronously. Identified source workspaces need no repository transaction to derive or switch. Missing object IDs produce one explicit identity transaction; Document descendants are untouched. Existing Canvas layouts—including deliberately empty layouts—are never regenerated. Returning to Desktop does not change its geometry. Deriving a missing Desktop layout remains E.

## Switching, focus and input

Views remount while session/content services remain alive. Switching captures native/inline focus and selection and restores them after mounting. A target hidden by a restored Desktop minimized Window falls back to the existing Window icon. In-progress selection gestures are cancelled and transient cross-Block selection is cleared; retained Grouping targets continue to reference the same projected identities. No selection engine was replaced.

Open panels, dialogs, Sticky drafts and mounted opaque applications block switching with an explanation. C requires their existing completion/close path rather than silently discarding transient state. Embedded application lifecycle qualification remains D; C does not claim arbitrary app/media state survives unmounting. Window-local transient chrome, including explicit Compact/drawer state, follows its existing mounted-view lifetime; authored expanded geometry remains independent and preserved.

Composition is the one deferred switch case. Two scoped composition listeners track it; after `compositionend`, an owned zero-delay task lets core finish reconciliation before a pending switch runs. Disposal cancels that task and removes listeners. A real Chrome test found that a microtask could run between Window and Document listeners, observe core still composing, and leave a switch pending indefinitely. The task boundary fixes that ordering. This is **not** an asynchronous pipeline for normal input.

## Qualification

**121 tests passed across 17 suites**, using Node 22.12.0. `npm run typecheck`, `npm run build` (client and server), and `git diff --check` passed. The build retained the existing browser-mapping age and large-chunk warnings.

Focused suites covered derivation, session/envelope/persistence, presentation rendering, system-menu keyboard behavior, actual host Open/Save/Save As, local identity conflicts, HTTP storage, Window icons, Compact geometry, background/focus retention, coordinate helpers and selection-gesture ownership. New checks include:

- Stable ordering/grid/camera, expanded minimized dimensions, one-time identity assignment and failed candidate validation without partial writes.
- Existing/empty layout retention, preserved directory entries, missing objects and overlapping-root placeholders.
- Repeated switching without editor/projection replacement, duplicate mounted occurrences, lost shared identity or lost text undo.
- Typing updates both shared Document occurrences without resolving or remounting Canvas roots.
- Composition completion before switching; panel/draft/application guards; native focus restoration and minimized-target fallback.
- Local Save As cancellation and successful copy with unchanged identities and the captured active Canvas envelope.

The reproducible [Chrome qualification script](scripts/check-canvas-milestone-c-browser.mjs) uses an isolated profile and in-memory fixtures:

```sh
node scripts/check-canvas-milestone-c-browser.mjs
```

It passed in **Chrome 153.0.8010.53**. Checks cover actual submenu keyboard activation, native selection restoration, two Windows sharing a Document, static Window controls, duplicate-mount exclusion, native typing and undo across switching; standoff typing and SVG alignment at **0.5×, 1× and 2×**; retained cameras; cross-Block native selection; Grouping across remounts; a single Entity panel outside the transformed world, its switch guard and selection restoration; real IME commit before Desktop mounting; Compact width restoration without narrowed bounds being saved; and local/server bundle materialization preserving the active layout and one shared Document.

The browser persistence check captures/round-trips DTOs and server bundles in memory. Real HTTP/filesystem writes are covered by the focused server suite; actual local host writer behavior is covered with browser file-handle mocks in jsdom. This does not claim a new end-to-end browser/server storage deployment test. No typing benchmark was rerun: the ordinary Desktop input/coordinate fast path was not changed, and the default-off path retains `ReactiveTreeView`.

## Handoff to D

No broader architecture is required. Carry forward the composition-event ordering lesson, stable keyed object mounts and explicit unsupported-application guard. D can build bounded gesture ownership on this static composition and the existing coordinate/Window seams.

Pan/zoom controls, object selection/handles, move/resize/order/remove/add actions, the inline application pilot, broader media qualification and physical Canvas removal remain **unimplemented D work**. Prefer an existing suitable inline Block application; Counter is only a fallback. Reverse derivation remains separately reviewable E. History extraction and Text Superposition remain out of scope.

**Stopped for review before Milestone D.**
