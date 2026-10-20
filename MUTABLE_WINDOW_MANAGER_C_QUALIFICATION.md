# Mutable Window Manager — Milestone C qualification

Date: 20 October 2026. Base: `becc09c` (accepted D0).

C implements snapping, binary split layouts and shell tab groups within the existing managed Desktop. The existing default-enabled `mutableWindowManager` flag remains the sole gate, with exclusive legacy rendering when disabled. D1, E, F and later milestones have not been implemented.

## Delivered behavior

- **Windows → [window] → Arrange window** offers halves, quarters, tiling beside/above/below another window, joining shell tabs and returning to floating. Dragging a floating title to a work-area edge previews a constrained snap; releasing commits it. Presets are also available through the existing keyboard/touch-accessible menus.
- Dividers support captured pointer/touch movement, arrow keys in five-percent steps, Shift+arrows in one-percent steps, Enter to commit and Escape to cancel. Blur, lost capture, touch cancellation, viewport/zoom changes, window mode changes and intervening layout transactions cancel pending previews. Divider hit regions extend beyond their six-pixel visible gutter.
- Shell tab groups expose tablist/tab semantics, selected state, panel references, roving focus, arrow navigation and Home/End. Selecting a tab by pointer restores its editor focus bookmark; keyboard tab navigation retains focus on the tab control. These controls are shell siblings of retained frames, not Flint Document tabs or application-owned tab containers.
- **Undo window layout / Redo window layout** reverse membership, split ratios and selected shell tabs. They also reverse the normal/maximized/minimized state normalization performed by a snap or tile command. They do not consume an application's text undo history. Floating bounds remain independently stored in the existing wrapper geometry bridge.
- An unsatisfiable new split is refused without changing membership or geometry. The notice directs the user to the **Join shell tabs** alternative. A viewport that becomes too small for an existing split instead shows explicitly labelled temporary tabs. The committed split and its ratios remain intact and return when the viewport expands.
- Minimize retains the slot and excludes it from visible constraint solving. Restore reuses the same mounted view. Maximize temporarily fills the work area at the existing application layer and leaves the slot intact. Pinning detaches to floating; unpinning rejoins a surviving nearby slot when constraints allow. Accepted close collapses empty branches and selects an adjacent surviving tab; a vetoed or cancelled close changes neither membership nor application lifetime.

A minimized icon is now placed above normal frames, which can fill the entire work area, and below pinned groups. Registry ranks remain dense; the CSS adapter reserves an intermediate icon layer. Shell chrome follows the tiled groups' stacking level; a maximized window underneath a raised tile does not suppress that tile's chrome. Workspace surfaces and layout status notices remain above application groups. This prevents a full-area tile from covering a minimized window's restore control.

## Architecture and session continuity

`src/runtime/window-layout.ts` is the pure layout model, validator, immutable membership operations and solver. Split axes mean side-by-side for `horizontal` and stacked for `vertical`. Constraints propagate bottom-up; ratios clamp to feasible child ranges, with deterministic rounding and a remainder assigned to the second child. Maximum sizes propagate where meaningful. Invalid or unsatisfiable constraints produce explicit diagnostics instead of negative or non-finite rectangles.

Constraint summaries cache by immutable subtree identity and capability/exclusion revision. Work follows layout entries, not Document size. The frame geometry memo compares coordinates before notifying consumers, so movement in a sibling subtree does not notify an unchanged frame. Work-area measurements remain shared and frame-coalesced; unchanged measurements do not publish new bounds. A Document minimap appearing or disappearing coalesces one owner capability refresh; typing and marker-label changes do not refresh minimum sizes.

`src/application/window-layout.ts` owns current membership, transactional previews, history, temporary tab selection and the persistence mapping. Runtime entries use existing placement keys; wire entries use D0 WindowRestoreKeys. A mutation validates a detached candidate before publishing it. It checks composition, owner/workspace modal and pending-close restrictions. Layout operations perform no domain I/O. Save refuses an unfinished divider transaction. Layout history is cleared after accepted close rather than attempting to revive a disposed application session.

`src/rendering/window-layout.tsx` supplies shell chrome. Existing application frames and owner groups stay mounted in the same Desktop plane. Floating → tiled → tabbed → floating changes geometry and visibility, never application parentage or resource identity. Inactive tab groups are hidden/inert; their registry entries remain mounted but not visible or active. Owned Entity tools and dialogs follow the same visibility and geometry boundary. Existing lifecycle leases retain caret/selection restoration and reject stale focus returns.

Thesis source navigation now reveals the owning shell tab before requesting editor focus and restoring the verified source range. No new Document Save, Proposition Save or Entity write is issued by a layout transition.

## Persistence and D0 compatibility

The surrounding JSON containers and filenames remain unchanged:

| Boundary | C behavior |
|---|---|
| Local managed Workspace | `speedy-local-workspace`, `schemaVersion: 2`; self-contained current Document content |
| Server managed Workspace | `speedy-workspace`, `schemaVersion: 2`; external resource references and an empty Document-write array |
| Presentation envelope | Existing `workspacePresentation.version: 1` |
| D0 Desktop entry | Version 2 floating layouts remain accepted and are not rewritten on load |
| C Desktop entry | Version 3, `kind: "managed-windows"`, with `layout.version: 1`, `kind: "split-tree"` |
| Filenames | Existing `.json` conventions; no new file types |

A C layout contains an optional binary `tree`, an explicit `floating` WindowRestoreKey array and the existing `normalOrder`/`pinnedOrder` arrays. Those order arrays continue to describe global stacking, including tiled entries. A leaf contains `id`, `kind: "tabs"`, `entries` and `active`. A split contains `id`, `kind: "split"`, `axis`, `ratio`, `first` and `second`. An `empty` leaf reserves an unoccupied half/quarter snap region.

For example, the layout portion of a two-window split is:

```json
{
  "kind": "split-tree",
  "version": 1,
  "tree": {
    "id": "layout-split",
    "kind": "split",
    "axis": "horizontal",
    "ratio": 0.5,
    "first": { "id": "layout-left", "kind": "tabs", "entries": ["WindowRestoreKey-A"], "active": "WindowRestoreKey-A" },
    "second": { "id": "layout-right", "kind": "tabs", "entries": ["WindowRestoreKey-B"], "active": "WindowRestoreKey-B" }
  },
  "floating": [],
  "normalOrder": ["WindowRestoreKey-A", "WindowRestoreKey-B"],
  "pinnedOrder": []
}
```

The example uses explanatory placeholders; actual WindowRestoreKeys retain D0's UUID namespace requirements.

Validation rejects cycles, shared/duplicate node identities, excessive tree depth, duplicate window memberships, missing references, invalid ratios, invalid active tabs, unsupported layout versions, tiled pinned/closed windows and incomplete or overlapping floating/tiled membership. D0's resource, anchor, bounds and unknown-field validation remains in effect. Missing durable mappings cause Save refusal, rather than silently dropping an entry. Layout-validation errors use the same client/server validation boundary as other malformed managed data.

The accepted D0 decoder at `becc09c` was executed against a C Desktop entry and rejected it with `Unsupported managed Desktop version.` Local and server overwrite guards also reject a C-to-D0 Desktop downgrade before replacement. C continues to load D0 data and preserve its restore identities. The real-server test opens a D0 file unchanged, explicitly saves its C extension with the matching hash, and then verifies C round-trip and downgrade protection.

A legacy session that has adopted shell layouts must use the existing **Upgrade Workspace and Save as…** operation. It cannot silently write those layouts into a legacy tree. For an already managed Workspace, explicit Workspace Save captures the current C entry. Loading does not migrate or write anything. There is one current layout, with no named-layout collection or recovery orchestration.

Workspace layout revisions are acknowledged separately from repository, presentation and visibility revisions. Changes made during a pending Save remain dirty. Document tab dirty state and manual Command/Control-S behavior are unchanged. A managed server layout Save still cannot acknowledge edited external Document content as saved. Selecting a different persistent shell tab changes layout state; ordinary window activation/MRU tracking alone does not.

Thesis draft state, undo stacks, source bookmarks, pending Save receipts, Entity tool state, modal stacks and focus leases remain runtime-only. A selected Thesis editing session without a reopen descriptor is omitted from the **detached saved tree**, with branch collapse and a visible notice; its live window, draft and layout remain untouched. Its ordinary shell anchor may still reopen as a floating Thesis entry, as in D0. Workspace Save does not recover that selected draft or Proposition after restart. Other runtime tools are not promoted into layout members or persisted.

## Qualification results

| Check | Result |
|---|---|
| Client and server `npm run typecheck` | Passed |
| Seven-file solver/lifecycle/geometry/persistence selection | 104 passed |
| New C cases in that selection | 35 passed: 16 solver, 17 application/layout and 2 HTTP persistence cases |
| Accepted 30-file regression selection | 316 passed, the same 13 accepted failures |
| Combined 38-file regression and qualification selection | 405 passed, the same 13 accepted failures |
| Final lifecycle/layout/minimap follow-up | 46 passed |
| C Chrome interaction fixture | 76 checks passed |
| C Chrome persistence fixture | 23 checks passed |
| Existing B Chrome fixture | 93 checks passed |
| Existing D0 Chrome fixture | 20 checks passed |
| Accepted D0 decoder against C data | Refused version 3 as intended |
| `git diff --check` | Passed |

Counts overlap and must not be added as independent coverage. This report does not claim the whole repository suite is green.

The solver tests include horizontal/vertical nesting, odd pixels, minima/maxima, ratio clamping, contradictory constraints, temporary fallback, minimized slots, close collapse, tab movement, quarter filling, reserved vacancy round-trip, malformed references and a finite 45-case dimensions/ratio grid. This is deterministic functional coverage, not load testing.

Application tests retain actual editor mount handles, native selections and owned tool elements; exercise modal, IME and asynchronous close cancellation; verify pin/unpin, layout undo, mode restoration, stale-save acknowledgement, local/server contract separation and feature-off behavior. Bounded-work assertions observe zero layout solves, repository snapshots and owner lookups for an ordinary edit in a tiled window. A separate check confirms no geometry notification to an unchanged sibling frame. No latency claim is inferred from these assertions.

Local write tests cover cancellation, write failure/abort and downgrade rejection. Real Express HTTP tests use temporary stores, verify unchanged Document files, reject malformed/future C data and stale/downgrade writes, and inject a partial staging failure while preserving the previous C file. Existing D0 rollback and failure tests remain in the combined selection.

### Browser evidence

[MUTABLE_WINDOW_MANAGER_C_BROWSER_EVIDENCE.json](MUTABLE_WINDOW_MANAGER_C_BROWSER_EVIDENCE.json) records all four runs in Chrome 155. The C fixture uses actual WorkspaceSession, Flint, Thesis, native standoff editor, Entity tool, owner dialog and workspace modal components. CDP supplies trusted text, mouse, touch and keyboard events, real browser zoom changes and viewport resizing.

The checks demonstrate:

- The same Flint mount and Thesis draft DOM across float, split, tabs and float, with draft undo/redo and verified source-selection navigation intact.
- Pointer/touch divider preview, commit and cancellation; keyboard divider commit and layout undo; shell tab click/arrow interaction; keyboard navigation through the Windows menu to a snap preset.
- Pending Thesis Save/retry identity surviving a hidden tab and floating transition; completion while hidden preserving newer unsaved edits.
- Entity query survival, pending creation guarding close while tabbed, and creation/linking receipt survival through hidden completion and return to floating.
- Actual owner/workspace modal restrictions, minimized-slot retention, maximize/restore, responsive temporary tabs, browser zoom, edge-snap preview/drop, quarters and accessible separator exposure.
- Local C Save/Open and fresh runtime sessions retaining D0 identities and the current layout; local picker cancellation; managed server client Save/load without Document writes; cancelled dispatch and future-file protection.

One browser rerun exceeded the runner's 45-second deadline while the full regression suite was also running. The isolated rerun passed all 76 checks; the saved evidence is from that completed run.

Picker results use real browser `File` objects with in-memory handles. Domain requests in browser fixtures are in memory and cannot reach an application backend or vault. Separate HTTP tests qualify actual server routes and temporary-file writes. This is not OS picker, physical touchscreen, human screen-reader, Safari/Firefox or crash/power-loss qualification.

### Regression comparison

The accepted 30-file selection still produces exactly:

| File | Established failures |
|---|---:|
| `src/demo/application-startup.test.tsx` | 6 |
| `src/demo/workspace-demo.test.tsx` | 3 |
| `src/features/timer/timer.test.tsx` | 3 |
| `src/rendering/block-selection.test.tsx` | 1 |

The established Block selection `dataTransfer.files` unhandled exception also remains. The failures were compared with the accepted D0/B record; they were neither fixed as part of C nor represented as passing.

### Defects identified and resolved during qualification

1. A minimized/restored view could miss later tab visibility updates because the capability map was not a reactive dependency. Inactive tabs now observe capability changes explicitly; a minimized-then-tabbed regression covers it.
2. Source navigation attempted focus while its retained Flint frame was hidden. It now reveals the owning shell tab first.
3. Full-area tiles could cover minimized restore icons. The reserved normal-frame/icon/pinned CSS ordering fixes the hit target; the C persistence browser fixture restores the reopened minimized window through a trusted icon click.
4. Pure layout validation errors initially reached the server as generic I/O errors. They now enter the managed validation boundary and return a malformed-request response before staging.
5. Closing a divider preview without moving could leave a pending transaction. No-op completion now cancels the preview without incrementing the layout revision.
6. A Document minimap could change its minimum width without invalidating the cached capability. An owner-scoped, coalesced visibility notification now refreshes it; bounded-work coverage excludes typing and marker-only updates.
7. Revealing a guarded hidden tab could fall through to the minimized-window restore path. A refused tab switch now returns before any window-mode write.

## Architectural decisions and remaining limits

- **Version boundary:** only the Desktop entry advances to version 3; outer D0 containers stay version 2. This is a deliberate compatible extension for C readers and a safe rejection boundary for older readers. It is not a new workspace file format or extension.
- **Reserved empty leaves:** the tree admits explicit vacancies for conventional half/quarter presets. These preserve unoccupied regions until another snap fills them; ordinary removal collapses redundant branches. This is a small extension to the plan's split/tab-leaf illustration.
- **Retained sibling chrome:** shell controls are siblings of stable frames. No application DOM is moved into a tab panel or split container. Application-owned tabs and resource edges remain unchanged.
- **History:** layout undo/redo is session-local and separate from text undo. Accepted close clears layout history; it cannot restore disposed apps. Pin return slots are best-effort session state, with floating fallback when their target or constraints no longer permit return.
- **Constraints:** existing window minimum-size capabilities remain the source of truth; the solver additionally supports maxima. An area smaller than even one app's minimum must temporarily clip that app to positive work-area bounds and report the constraint failure. It cannot make a physically undersized viewport satisfy the application's minimum.
- **Snap replacement:** placing a preset into an occupied region can return displaced windows to floating. It never closes them or discards their sessions. The operation is reversible through layout history.
- **Persistence exclusions:** D0 native-resource/history destination restrictions still apply. C does not package native resources, restore selected Propositions, recover unsaved drafts, persist tool sessions or replay pending writes. Existing local-download fallback and cancellation-after-dispatch limitations from D0 remain.
- **Scope:** current-layout serialization and loading use D0 anchor descriptors. No named layouts, partial recovery, cross-host transfer, Canvas/Spatial integration, tool docking/promotion, external window host or later-milestone restoration service was added. Viewport-fixed sticky notes remain outside the tile solver. Existing transitions into separate Canvas/Spatial presentations are not a retained cross-host guarantee from C.

## Reproduction

```sh
npm run typecheck
npx vitest run \
  src/runtime/window-layout.test.ts \
  src/application/window-layout.test.tsx \
  src/application/window-geometry.test.ts \
  src/runtime/window-manager.test.ts \
  src/application/window-manager.test.tsx \
  src/persistence/managed-desktop.test.ts \
  server/workspace-store-d0.test.ts
node scripts/qualify-window-manager.mjs --c
node scripts/qualify-window-manager.mjs --c-persistence
node scripts/qualify-window-manager.mjs --b
node scripts/qualify-window-manager.mjs --d0
```

For the combined regression selection, take the A0 report's 27 files, append Block History, Document Interchange and Mutable Clipboard, then add the two new layout test files, `window-geometry.test.ts`, `managed-desktop.test.ts`, both server workspace-store test files, `view-visibility.test.ts` and `workspace-d0.test.tsx` (38 unique files).

The tests/runners clean up their temporary stores, Chrome profiles/processes and Vite servers. Source tests, browser fixtures, evidence and this report remain as review artifacts. No load testing, production-data writes, migration, deployment or D1/later work was performed.
