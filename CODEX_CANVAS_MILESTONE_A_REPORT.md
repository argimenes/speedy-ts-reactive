# Canvas Milestone A — scaled Window and local identity proof

Status: **Milestone A only. Stop for review before Milestone B.**

Baseline: `36dedf6` (`Canvas planning`), preserving the accepted Stages 1–5 implementation. The [Canvas plan](CODEX_CANVAS_WORKSPACE_PRESENTATION_PLAN.md) remains the roadmap. No Canvas object directory, presentation envelope, object bank, presentation menu, layout derivation or general pan/zoom UI was implemented.

## Result and prototype

One ordinary core `document-window-block`, containing existing document/page/standoff/native-text/margin views, operates in a translated DOM surface at **0.5×, 1× and 2×**. Its host-owned position and expanded size are independent of authored Desktop geometry. This is a qualification fixture using the existing editor and renderers, not another editing engine.

The dev-only prototype is disabled by default:

```sh
VITE_CANVAS_MILESTONE_A=1 npm run dev:client -- --host 127.0.0.1 --port 5187
```

Open `/scaled-window-prototype?scale=0.5`, `?scale=1` or `?scale=2`. The production build removes this route and its lazy import. The fixture owns/disposes its editor, projection, view and gateway and never saves user files. See [prototype](src/demo/scaled-window-prototype.tsx).

No application pilot was needed to prove these two prerequisites, so no Counter was created. For Milestone D, prefer an existing suitable inline Block application; use Counter only if none provides a clean test, as requested.

## Coordinate-space contract

The core view provider now accepts an optional [local coordinate frame](src/runtime/local-coordinates.ts), defaulting to identity, and a narrow [Window geometry host](src/rendering/window-geometry.ts). These remain internal rendering/host seams. Features and hosted Blocks do not receive `ReactiveEditor`, parent traversal or arbitrary DOM access.

The supported transform is **positive uniform scale plus translation**, expressed in CSS pixels. The host supplies the cumulative scale; rotation, skew, perspective and independently transformed descendants are outside this contract. The prototype uses `transform-origin: 0 0`. Browser page/device zoom is not this application scale.

| Quantity | Contract |
| --- | --- |
| Native pointer/caret hit tests, DOM Range client rectangles, portal anchors | Client/viewport CSS pixels, unchanged. |
| Window position, expanded size, minima, resize keyboard increments | Unscaled local layout units. |
| Standoff fragments, SVG paths, selection/search highlights, local effect offsets | Unscaled surface-local units. Providers still consume centrally measured immutable fragments. |
| `scrollLeft` / `scrollTop`, CSS padding, ResizeObserver content sizes | Already local; never divide these by scale again. |
| Minimap rail and feature panels mounted through Portals | Viewport geometry. Page marker positions/scroll extents are converted into page-local units before mapping to the rail. |

For a client rectangle and its surface origin:

```text
localX = (clientLeft - surfaceClientLeft) / scale + surface.scrollLeft
localY = (clientTop  - surfaceClientTop)  / scale + surface.scrollTop
localWidth  = clientWidth  / scale
localHeight = clientHeight / scale
pointerLocalDelta = pointerClientDelta / scale
```

The native input gateway, native caret hit tests, cross-Block input and Grouping ownership rules were not replaced or put through a new dispatch pipeline. There are no new observers, polling loops, global transform discovery or document-tree reconstruction. Existing measurement scheduling remains centralized; a reactive scale accessor participates in the existing effect/minimap scheduling dependencies.

## Assumptions that changed

1. **Standoff fragments:** `rangeFragments` previously subtracted client rectangles, retained scaled dimensions and added unscaled scroll offsets. That would scale the resulting SVG geometry twice. The core now converts rectangles before line merging and before passive effects, selections and search highlights consume them. The same local rectangle helper is used at the pre-existing alternative-reading anchor calculation; no Superposition feature behavior or abstraction was added.
2. **Candidate controls:** hover coordinates and viewport clipping now use the same local units as their fragments. Feature code does not measure or edit the text DOM.
3. **Window drag:** client deltas convert to local deltas. Minimized-icon viewport corrections also convert back into local units.
4. **Window resize:** the measured starting rectangle and pointer deltas convert to local units. Desktop retains viewport constraints; a hosted Window uses its host geometry without treating the browser edge as a world boundary. Pointer previews still commit through the existing completion path.
5. **Compact:** measured starting width/height and the initial/fallback narrow-width check convert to local units. ResizeObserver sizes and CSS padding remain local. Expanded width survives explicit Compact and temporary automatic collapse.
6. **Minimap:** marker offsets, visible-page ratios and scrolling calculations previously mixed client heights with local scroll extents. Those calculations now normalize the client quantities. The viewport-mounted rail remains in screen coordinates and retains its existing visibility/fit policy.
7. **Generic HTML layer points:** `MeasurementService.toLayerPoint` accepts the explicit scale for HTML layers. SVG retains its existing inverse-screen-CTM path; it must not divide by scale a second time.

The [Window host port](src/rendering/window-geometry.ts) supplies only `position()`, `expandedSize()`, `move(position)` and `resize(size)`. Without it, `WindowView` continues reading/writing the same authored metadata. With it, move/resize updates host signals. Compact's existing per-window margin-collapse capability is unchanged and remains separate from this geometry port. Window chrome/state policy has not become a contribution framework.

## Browser qualification

Run [the Milestone A browser check](scripts/check-canvas-milestone-a-browser.mjs) against the opted-in dev server:

```sh
BENCHMARK_URL=http://127.0.0.1:5187/ node scripts/check-canvas-milestone-a-browser.mjs
```

Qualification used Node 22.12.0 and headless **Chrome 153.0.8010.53**, with actual CDP pointer, keyboard, `insertText` and IME events. The fixture is in memory; entity lookup is stubbed for deterministic panel checks. It uses a 2600×1900 CSS viewport so the same 1000-unit Window remains accessible at 2×. This is application-transform qualification, not an exhaustive viewport/browser matrix.

**107 checks passed**, including the following at each of 0.5×, 1× and 2×:

- Native typing and undo, pointer text selection and Shift+Arrow selection.
- Control held throughout a Grouping gesture, Escape cancellation, ordinary cross-Block selection and cross-Block Grouping.
- Wrapped Entity underlines, rainbow lanes and highlighter rendering.
- Entity search's selected query, panel mounting outside the transformed host, Escape selection restoration and focus restoration.
- Native form-field editing and an IME composition commit.
- Pointer Window movement by 40×20 local units and resize by 40×30 local units, with unchanged authored snapshot and repository revision.
- Compact's margin selection/focus restoration into a drawer, margin indicator access and drawer Escape focus, expanded-width retention and width restoration.
- Automatic collapse at local width 680, persistence of that automatic cause through explicit Compact toggles, restoration at width 1000 and effect alignment after restoration.

The first Entity underline's local y stayed **22.5** at all three scales. Its measured viewport x/y matched the corresponding text geometry exactly in the captured results; a 1000-unit Window measured as 500/1000/2000 client pixels. Each fixture produced two Entity underline fragments, fourteen rainbow lanes and a highlighter shape.

The script also qualifies native typing and effect alignment through the **unhosted identity-coordinate Desktop path**. Existing Stage 2 selection, Stage 4 annotation and Stage 5 presentation browser scripts separately passed on the ordinary Desktop host, including their native-input, panel, drawer, resize and focus checks. The Stage 2 script retains its pre-existing observation that cancelling an IME sequence can leave a mount marked composing; this milestone does not change that input lifecycle.

Boundary of the evidence: no Safari/Firefox matrix, arbitrary nested transforms, continuous camera movement, multi-object surfaces, culling or app suspend/resume was qualified. Portal panel anchoring retains existing viewport semantics; it is not a newly implemented follow-camera policy. Minimap scaling has focused unit coverage plus the existing unscaled suite, rather than a full scaled-browser navigation matrix.

## Local document identity

[`materializeLocalWorkspace`](src/reactive-editor/workspace-manifest.ts) now backs browser-local Workspace Open and the self-contained legacy branch of server Workspace Open. Server manifest materialization uses the same narrowly scoped document-sharing helper.

The loader:

1. Decodes into a fresh tree, leaving the supplied DTO and any live editor untouched.
2. Examines workspace-level Document roots, stopping at each Document rather than merging arbitrary internal Blocks.
3. Uses explicit `metadata.documentId`, or the legacy authored Document `id` when absent. Anonymous Documents stay independent; equal text alone never establishes identity. Malformed identities are rejected.
4. Compares the documents' canonical encoded authored payloads, ignoring object-key order. A repeated identity with a differing payload throws a clear conflict error before a new workspace is returned. This is deliberately conservative, not a field-by-field merge or “last copy wins” policy.
5. Repoints matching Document placements to one content record and marks subsequent placements as references. A reachability sweep removes only redundant decoded copies, preserving reachable shared descendants, Cells and owned margins. Repository validation runs afterward.

The [local identity tests](src/reactive-editor/local-workspace.test.ts) prove distinct view occurrences sharing one editable Document, edit propagation, local JSON save/reopen, retained shared margins and unknown authored fields, retained Window geometry, key-order independence, anonymous/distinct identities, legacy IDs and conflicting text/unknown/root-ID cases. The original DTO remains unchanged even when loading fails. Existing server manifest, persistence and workspace-store tests pass with the shared helper.

**No new workspace format was needed.** Local JSON can still contain repeated inline copies on the wire; opening materializes them as one canonical Document again. Runtime `ContentKey`, `PlacementKey` and `NodeKey` are not serialized as durable identities. Arbitrary Block transclusion, resource fetching from a server manifest in the local file picker, and History integration remain outside this work.

A qualification detail matters for later persistence work: `editor.encodeDocument()` can add the current **focus bookmark** to the exported DTO even when the repository has not changed. Layout-only mutation checks therefore compare the canonical authored snapshot and repository revision, separately from focus. Milestone B should preserve this distinction when defining dirty state and snapshot comparisons.

## Automated checks and Desktop performance

Focused suites passed across selection/input/bindings, Grouping, standoff rendering, Entity References and async lifecycle, linked annotations, Compact, Window resize/state, minimap, workspace load/save and server storage. The aggregate is **42 test files / 286 tests**, including the additional cross-Block/annotation suites and three scaled-minimap cases. Typecheck and client/server build passed; the build retains its existing large-chunk advisory.

The new tests are in [local identity](src/reactive-editor/local-workspace.test.ts), [coordinate conversion](src/runtime/local-coordinates.test.ts) and [minimap](src/rendering/page-minimap.test.tsx). No broad snapshot suite or viewport/theme matrix was added.

Desktop typing was compared against a detached `36dedf6` worktree using the [existing browser benchmark](scripts/benchmark-typing-browser.mjs): 25,000 characters in 250 paragraphs, 40 timed edits per run, three alternating baseline/current pairs in isolated Chrome profiles. No tests or builds ran concurrently with these paired measurements.

| Pair | Baseline median / p95 | Milestone A median / p95 |
| --- | --- | --- |
| 1 | 2.1 / 3.5 ms | 1.7 / 2.4 ms |
| 2 | 1.7 / 3.4 ms | 1.9 / 3.8 ms |
| 3 | 1.7 / 3.2 ms | 1.5 / 2.2 ms |

The median of the three run medians is **1.7 ms on both versions**. No repeatable slowdown was observed; the scatter does not establish an improvement either. Every run retained zero whole-document snapshots in the measured fast path, restored the original content and retained unrelated Cell identity. Real Chrome insertText, Backspace, undo/redo, Enter/split and boundary checks passed in all six runs.

An initial benchmark completed its assertions but hit `ENOTEMPTY` while deleting Chrome's temporary profile. The paired runs used an otherwise identical temporary copy of the existing script with filesystem-cleanup retries; all six exited successfully. No benchmark workload or production dependency changed.

## Consequences for Milestones B–D

The two prerequisites support continuing the approved design; no replacement editor, universal matrix framework or new workspace format is indicated.

- **B:** reuse the targeted materializer and retain explicit conflict diagnostics. Keep layout revisions separate from document revisions and exported focus bookmarks. This milestone establishes shared Document content after local reload; it does not yet create workspace-object IDs or resolve future directory anchors.
- **C:** supply a cumulative uniform scale through the core view boundary and retain a single mounted occurrence. Keep viewport overlays outside the transformed world. Continuous camera translation will still need explicit, coalesced invalidation for viewport-dependent anchors/clipping, and an owned gesture must finish/cancel before changing its coordinate frame; static scale qualification does not by itself implement those policies.
- **D:** compose Window geometry through the narrow host port and keep Compact's local expanded-size contract. Settle Canvas-specific close/minimize semantics separately, as planned. Qualify an existing suitable inline app first; Counter remains only a fallback. Add pointer-cancellation/camera-change and iframe/media cases when those interactions are introduced.

Milestone B has not begun. Review this report and its qualified limits before proceeding.
