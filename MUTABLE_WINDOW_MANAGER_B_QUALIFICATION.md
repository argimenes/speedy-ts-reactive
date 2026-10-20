# Mutable Window Manager — Milestone B qualification

Date: 20 October 2026. Implementation base: `56294b9` (`Window Manager: A1 implemented`). Status: implemented and qualified within the approved B scope; awaiting user acceptance. D0, C and later milestones have not begun.

## Outcome and scope

Managed desktop windows retain their mounted application bodies during minimization and restoration. The same editing components, DOM nodes, runtime window occurrence, registration generation and application ownership survive. This includes Thesis's isolated draft editor and undo stack, source bookmark, pending Save operation, and the Linked Entity Reference tool's local state. Hidden bodies and their owned portal surfaces are hidden and inert; they are not serialized, reconstructed or disposed to simulate continuity.

Floating desktop geometry now uses a session-owned coordinator. Pointer, touch and keyboard gestures preview without repository writes and commit once through the existing metadata/history bridge. Maximization, restored mode, viewport fitting and tool coordinates use the shared work-area calculation. Workspace → Windows exposes a registry-derived list and window operations.

The existing default-enabled `mutableWindowManager` flag remains the only adoption switch. Its disabled path retains legacy rendering and interaction; no second geometry controller is installed for a managed frame. Canvas and Spatial retain their existing geometry hosts. Document/Workspace saving remains manual, with existing Mutable JSON formats, filenames and dirty-state conventions. No new persistence fields, migrations, sidecars, domain storage writes, docking, promotion, tiling, shell tab groups or cross-host transfer support were added.

## Implementation

| Area | Change and ownership |
|---|---|
| Retained bodies | `RetainedWindowBody` in `src/rendering/window-manager.tsx` hides a stable managed subtree. `WindowView` continues rendering its body while displaying the minimized icon. The legacy path still removes the body on minimize. |
| View activity | Registry `mounted`, `visible` and `active` remain distinct. A minimized managed body is mounted, invisible and inactive. `useManagedViewActivity` exposes per-owner reactive state without repository enumeration. |
| Focus and input | Existing A1 bookmarks and MRU remain authoritative. Hidden focusout events cannot overwrite the captured editor/cross-Block bookmark. Thesis releases its active input router when hidden. Desktop return from Canvas targets the icon when the corresponding editor is retained but invisible. |
| Minimize/restore | Owned nonmodal tools remain mounted and follow owner visibility. Drafts, close guards, iframe presence and ordinary tools no longer cause A1's blanket minimize rejection. Composition, blocking modality and a pending close decision still prevent minimization. Close guards and resource ownership remain in force. |
| Geometry | `src/application/window-geometry.ts` supplies shared frame/tool controllers and one work-area observer/listener set per managed session. Geometry is in CSS pixels, including visual viewport offsets. Resize/scroll invalidation is frame-coalesced. No repository subscription, cell scan or per-keystroke geometry scheduler was added. |
| Gestures | Pointer/touch movement and resize, keyboard arrows, Shift for one-pixel steps, Enter to commit, Escape to cancel. Capture loss, touch cancellation, window blur, viewport changes and externally changed geometry cancel previews. Managed resize cancels on control blur; legacy resize behavior is unchanged. |
| Bounds and history | Normal metadata remains the restore source. Maximization and temporary small-viewport fitting do not overwrite normal bounds. Explicit gestures use one existing command/history commit. Compact-document presented/expanded size conversion is reused. Repository undo/import is reflected without a reimport/write loop. |
| Window operations | Existing context actions gain move, resize and maximize/restore. `window.move`, `window.resize` and `window.maximize` join the A1 commands. Workspace → Windows lists registered sessions, including hidden ones, and provides activation/restoration, movement, sizing, minimization, closure and cycling. Cycling uses the last application MRU entry while focus is in shell menus. |
| Tools and anchors | `src/rendering/managed-floating-tool.ts` supplies owner-relative floating coordinates and a reusable cached anchor port with explicit invalidation, visibility and source connectivity checks. It coalesces scroll/resize refreshes and supplies deterministic placement/clamping. Entity is the floating-tool integration proof and keeps its existing application UI. |
| Optional work | Entity suspends its search effect and selection preview while hidden; restoration resumes from the retained query/session. Thesis suspends input routing, not pending Save receipt processing. No generic eviction or application-wide forced shutdown policy was introduced. |

A title bar is keyboard-focusable. Its arrows move the window; Enter commits and Escape cancels. Resize is available through the existing resize handle or the window menu. Window cycling is available through the keyboard-navigable Windows menu and command registry. No browser/OS-reserved global accelerator was claimed, and Thesis's Cmd/Ctrl+Shift+P binding is unchanged.

## Tests and regression comparison

| Check | Result |
|---|---|
| Client/reactive and server TypeScript | `npm run typecheck` passed |
| Final focused suites | **47/47 passed**: application window manager (24), geometry (8), window icons (8), presentation switching (7) |
| Additional affected controls | **14/14 passed**: system bar (4), legacy floating resize (3), Flint compact shell (7) |
| Existing 30-file regression selection | **316 passed, 13 failed**, 329 tests; same 13 accepted baseline cases |
| Original A0 browser comparison | **22/22 passed**; its four unsupported fixture requests remained blocked by the isolated runner |
| Milestone B Chrome interactions | **93/93 passed**; zero unexpected backend requests |
| Patch hygiene | `git diff --check` passed |

B adds twelve tests: eight geometry cases and four application integration cases. They cover commit/cancel behavior, bounds/mode restoration, anchor placement, icon click suppression, retained tools and guards, cross-Block bookmarks, bounded typing work during unrelated movement, and undo/import cancellation. Existing minimize/presentation expectations were updated to assert retained hidden bodies explicitly.

The regression selection is the exact A0 report command plus Block History, Document Interchange and Mutable Clipboard, as used for A1. Its total is six greater than the A1 report's 323: the accepted A1 commit contains two additional final integration tests beyond that report's earlier large run, and B adds four integration tests to that selection. The eight new geometry tests are outside the 30-file comparison. Overlapping focused runs are not added together.

The unchanged failures are:

| Suite | Count | Previously accepted failure category |
|---|---:|---|
| `src/demo/application-startup.test.tsx` | 6 | Existing startup/button/empty-desktop/Canvas/demo expectations |
| `src/demo/workspace-demo.test.tsx` | 3 | Inactive tabs/card face, reset/revision text, shortcut label |
| `src/features/timer/timer.test.tsx` | 3 | Existing mount/registration/action ownership expectations |
| `src/rendering/block-selection.test.tsx` | 1 | Drag fixture lacks `dataTransfer.files`; includes the same unhandled exception and failed reorder assertion |

These baseline failures were compared against the accepted A1 record, not newly investigated or repaired. This is a selected regression run, not a claim that the full repository suite is green.

Reproduce targeted checks:

```sh
npm run typecheck
npx vitest run src/application/window-manager.test.tsx src/application/window-geometry.test.ts src/rendering/window-icon.test.tsx src/application/workspace-presentation-view.test.tsx
npx vitest run src/demo/codex-system-bar.test.tsx src/rendering/floating-window-resize.test.tsx src/features/flint/compact-shell.test.tsx
node scripts/qualify-window-manager.mjs --b
```

## Real-browser evidence

The [B fixture](src/application/window-manager-b.browser-fixture.tsx) renders actual WorkspaceSession, Flint, Entity and Thesis components in Chrome 155. The [93-check evidence file](MUTABLE_WINDOW_MANAGER_B_BROWSER_EVIDENCE.json) records every assertion and browser identity. This extends the A1 scenarios; the historical `--a1` fixture's assertion that unsaved Thesis minimization must be blocked is intentionally superseded by B's retained-host tests.

The runner owns a temporary profile, Vite server and Chrome process. All domain responses are in memory and `/api` routes cannot reach an application backend. Save tests execute the real Thesis client operation/receipt lifecycle against a deferred fixture response; they do not save a Proposition to a real vault.

Evidence includes:

- Trusted text replacement and caret placement in Thesis; owner activation and exact editor focus restoration; source text isolation and verified source backlink navigation.
- The identical draft DOM through minimize/restore, with undo and redo still functioning. Hidden bodies are inert and absent from layout.
- A pending Entity creation, query and eventual created-but-unlinked receipt surviving owner hiding/restoration. Owner-local movement preserves the tool's relative position and state.
- An uncertain Thesis Save returning while hidden; retry uses the byte-equivalent request and the same operation identity. A later receipt completes while hidden and preserves edits made after submission. Visibility transitions dispatch no automatic Save.
- Trusted mouse dragging/resizing with no preview commits and one final commit. Escape, real Chrome tab/window blur, trusted touch cancellation and keyboard resize cancellation discard previews.
- Maximization, a 780 × 550 viewport, restore to normal bounds, actual Chrome page zoom to 150%, visual-viewport scale 2, and temporary fitting at 320 × 260. Returning to the initial viewport restores normal geometry without persistence drift or draft replacement.
- Keyboard navigation through the registry-derived Windows menu and focus return. Dragging a minimized icon suppresses only its generated click; the next click restores the same editing session.
- Anchor validity during source visibility changes and explicit source-layout invalidation, followed by a fresh source-only measurement.
- A finite trusted Flint edit during another frame's geometry preview performs no repository snapshot, window registration or ownership scan. This is a bounded-work assertion, not a throughput or typing-latency benchmark.
- The previous overlap, pinned layering, scoped/storage modal, workspace modal, accessibility-tree, stale readiness, close-veto and ownership-cleanup scenarios remain exercised.

## Issues found and resolved during qualification

Making headers focusable initially bypassed A1's title-click editor restoration; the activation hit-test now distinguishes header chrome from native input targets. Retained hidden editors initially intercepted Canvas-to-Desktop restoration; it now selects the corresponding icon. The previous test assuming a minimized desktop textarea was unmounted was updated to require a retained, hidden occurrence instead.

Browser checks found a Solid store proxy passed into the maximization metadata bridge and a border-box mismatch at work-area edges. Metadata is unwrapped before the existing command, and managed outer dimensions now include borders while permitting temporary undersized fitting. Existing sticky/document-format direct-child styling was adapted for the retained wrapper; the legacy DOM shape remains unchanged.

Review also identified that a normal drag could leave a stale icon-click suppression flag. Suppression now applies only to the click generated by a minimized-icon drag and expires; unit and trusted browser checks cover the next restore click. Hidden focusout cannot replace the saved cross-Block bookmark. The browser runner's temporary-profile removal now retries transient Chrome shutdown file activity.

No additional regression failures remain in the selected comparison.

## Architectural qualifications and remaining limits

- B retains a desktop session across its own visibility transitions. It does **not** promise component continuity when switching into Canvas/Spatial, transferring across hosts or replacing a Workspace/Cavern session. Existing presentation-switch safety gates remain; the broader architecture's future workspace-retention language is not a cross-host implementation claim here.
- Existing occurrence keys, app owner identity and registration generation supply stable lifetime within this mounted desktop. No durable identity schema or new `ViewInstanceId` persistence format was added; D0 remains separate.
- The geometry bridge deliberately keeps existing metadata commands and undo behavior. There is no new layout store or persistence projection format. Temporary fitting can go below normal minimum dimensions on very small viewports so window controls remain reachable; application content may need scrolling.
- Entity proves reusable floating positioning. The anchor API and placement helper are infrastructure; they do not enable automatic docking, promotion or a redesigned universal tool chrome. Callers must explicitly invalidate anchors for source-layout changes such as transforms/font reflow that do not produce an observed resize/scroll.
- Hidden views retain memory. Activity hooks allow application-specific suspension; B does not forcibly pause every embedded media player, timer, worker or third-party iframe, and does not introduce eviction. Real cross-origin iframe internals were not separately qualified.
- Chrome accessibility-tree and keyboard behavior were checked. No human screen-reader session, Windows/Safari run, native IME candidate-window session or physical touch-device test is claimed. Touch and visual-viewport pinch are Chrome protocol interactions; page zoom is Chrome's actual zoom setting in the disposable profile.
- Existing Document/Workspace Save, compact Ink/Flint, Phosphor and other outer-window integrations are covered by their selected regression suites. The concentrated browser state-continuity proof is Flint/Entity/Thesis; it is not an exhaustive browser exercise of every document-format viewer.

No load testing, typing benchmark, production migration, user-data Save, production deployment or later milestone was performed. Temporary test profiles and processes were cleaned up; the qualification fixture, tests, report and evidence are retained as reviewable project artifacts.
