# Mutable Window Manager — E1.2 Qualification Report

Date: 21 October 2026. Accepted E1.1 baseline: `885701266782d298102ac8e2817e7484addac19a`.

## Scope and result

E1.2 implements the **internal Document session host-transfer coordinator**. The same retained Flint or eligible Ink editing session can move to a reserved slot in an existing managed Document window and return to its original, still-live slot. The session store remains the sole final disposal authority.

The scope discrepancy was reported before implementation: the supplied brief requests detach/return interactions, but the accepted [implementation plan](MUTABLE_WINDOW_MANAGER_E1_IMPLEMENTATION_PLAN.md) assigns product commands, standalone Document-host construction and source-tab reconciliation to **E1.3**. That plan explicitly takes precedence. This implementation exposes no product Detach/Return commands. Browser fixtures supply temporary controls and slots within existing production DocumentWindow components.

No Desktop 5 schema, migration, durable detached-host restoration, new host category, Canvas/Acetate integration, tool promotion, eviction or load testing was implemented. The existing Window Manager and retention flags retain their defaults and exclusive fallback. The new session-fixed `documentSessionHostTransfer` flag is enabled by default; disabling it rejects transfers and omits the transferred-session Save handler.

The supported internal boundary is qualified for connected, controlled desktop hosts with qualified descendants. This is **not acceptance of a finished user-facing detach feature**, nor proof that arbitrary embedded applications or tools can move safely.

## Ownership and changed boundaries

| Authority | Responsibility after E1.2 |
|---|---|
| WorkspaceSession / DocumentSessionStore | Owns retained records, independent Solid roots, editing DOM and private projections; disposes each exactly once. Shared Ink projections remain workspace-owned. |
| DocumentHostTransfers | Owns host leases, exclusive occupancy, preparation tokens, destination reservations, transfer validation, attachment journal and exceptional recovery containment. Never owns a Solid disposer. |
| DocumentHostBinding | Stable reactive context object; current owner, slot, window, coordinates, activity and generation can change without changing the session. |
| Window Manager | Owns window lifetime, stacking, activation/MRU, modal policy, layout and geometry. Window release requests disposal only for sessions currently hosted there. |
| Canonical repository / native resource service | Retains resource identity, history, dirty state, Save destination and pending operation authority. Transfer creates no resource, binding or content-history entry. |
| Flint application | Retains library, navigation, selected Vault, app-wide tools and original tab membership. Product reconciliation remains E1.3. |

The new coordinator is in [document-host-transfers.ts](src/application/document-host-transfers.ts). [DocumentSessionStore](src/application/document-sessions.ts) supplies constant-time private-view ownership lookup and DOM ancestry lookup for shared Ink islands and session-owned surfaces. These lookups take precedence over a moved Ink occurrence's original canonical ancestry.

[RetainedDocumentHost](src/rendering/retained-document-view.tsx) now creates a stable slot and registers its host lease. Cleanup releases that lease; it cannot dispose an editor that has moved elsewhere. Initial render/attachment failure also releases the lease. A stale source-window cleanup has no authority over the destination's occupant. Workspace disposal cancels work and releases every remaining session without allowing a late preparation to recreate it.

## Transfer, commit and rollback

1. Resolve the exact source record and destination lease within this store. Reject stale/forged leases, duplicate transfers, occupied or reserved destinations, disposed sessions and disconnected/foreign containers.
2. Validate managed-desktop visibility, selected slots, window generations, resource uniqueness, descendant capabilities, pending operations, modal/composition/gesture state and surface ownership.
3. Reserve the destination and hold conflicting window/layout operations. Preparation may await and receives an AbortSignal. The source stays mounted and editable; neither focus nor text is frozen during preparation.
4. Revalidate after preparation. Capture the **latest** focused element, native/inline/cross-Block selection and source/destination scroll offsets. Reject a changed canonical identity.
5. Within a synchronous reversible boundary, make the moving container inert, append the existing DOM, move qualified surface DOM and registry ownership, then publish the new occupancy and reactive binding in one Solid batch. Checkpoints are synchronous; returning a promise is rejected.
6. Release the old occupancy without disposing its editor. Invalidate old focus/readiness requests, restore eligible native focus/selection and destination scroll, and invalidate both windows' minimum geometry. Final focus failure is reported separately; it does not reverse a committed transfer.
7. Release the reservation, cancellation listeners and lifecycle hold in all outcomes.

Ordinary failures restore the same source DOM position, surface ownership and DOM, host binding, native selection and both scroll offsets. Tests inject failure at prepared, attached, surfaces and pre-commit boundaries. No rollback creates a replacement editor or rewrites canonical content.

Cancellation accepts an AbortSignal and Escape from an affected window when no modal/composition owns it. Affected window close cancels preparation before normal close proceeds; the original source has not been moved during an await. Destination close leaves the source usable. A completed source close can dispose its still-hosted session normally. Workspace teardown wins over transfer and prevents resurrection. New native operations, composition or invalid host generations discovered at final validation reject the move.

### Exceptional source disappearance

An injected external removal of the source container cannot satisfy the normal rollback guarantee. The coordinator detects it, retains the editor and owned surfaces in a connected, hidden/inert workspace recovery container, suspends visible work and reports failure. `restoreSource(session)` requires the exact original lease/container to be available again. It neither guesses another host nor reconstructs the editor.

This is an intentional negative control, **not a successful rollback**. The fixture proves identity survives containment and explicit recovery. No supported close/cancellation path reproduced this external-removal race. Recovery UI and a product policy for permanently lost source slots remain prerequisites before exposing commands; internal recovery alone does not satisfy that product requirement.

## Context, input and application audit

| Dependency | Finding and treatment |
|---|---|
| Solid owner, editor and projection context | Remain with the independently owned session root. No render/remount occurs during transfer. |
| WindowOwner | A stable provider object exposes the current binding through a reactive getter. Tested consumers observe the destination without changing owner identity. |
| Coordinates and activity | Stable delegated coordinate service follows the port. Binding publication invalidates activity consumers even when visibility remains true. Retained-session visibility follows the current window and slot, not the original Flint tab. |
| Window geometry | Desktop window geometry remains manager-owned. Both affected minimum-layout calculations are invalidated. Nested windows/positioned content are excluded; inherited Canvas geometry is not qualified. |
| Flint bookmark/activation callbacks | Original-tab selection effects invalidate their pending activation and stop directing the session while it is hosted elsewhere. Manager focus tickets invalidate stale requests; later focus in another window wins. |
| Native focus and selection | Browser adoption can clear native selection. The transaction explicitly captures/restores backward standoff selection, focused inputs and scroll. Cross-Block selection retains the same workspace input textarea; its owner attributes react to the session's host. |
| Native Save | An existing native service/binding is looked up without allocating a new one. Cmd/Ctrl-S outside the original host routes to the session's canonical Document and opened destination. At the original host, existing shell Save continues to handle it. Browser tests prove one Save invocation and unchanged targets, including after source-shell close. |
| Flint navigation and app services | `document-application-capabilities.tsx` still holds `activeTab`, `liveViews`, selected-Vault guards and application navigation. These remain source-application concerns. No product command can reach the internal transferred topology. Session-aware navigation and membership reconciliation must precede E1.3 release. |
| Native service lifetime | The existing workspace/editor-level service survives original Flint and Ink window close. The transfer never releases/reacquires a binding or cancels/reissues a Save. |
| Surface leases | Session-owned surfaces retain IDs, generations, DOM and release authority. A qualified adapter moves DOM and registry owner together. Parent-surface relationships must be entirely within the moving set. |
| Application tools / Entity panels | Application-owned tools are not promoted. Surface registration now records an optional runtime source occurrence so tools outside the session can be rejected. Existing Entity guards can capture an original window; these tools are **not** automatically declared transferable. |
| Portal capability | `ApplicationSurfacePortal.documentTransfer="retained"` is an explicit adapter opt-in after qualification. No production tool has been opted in here. The browser's instrumented tool probe proves the portal mechanism, not arbitrary Entity-tool transfer. |
| Modal/input policy | Live affected modals, pending window close, tab close guards, composition/settling, selection gestures, pointer gestures and window/divider manipulation block transfer. Existing modal behavior continues to govern ordinary editing. |

The production Entity tool and Thesis protections were exercised by the unchanged D1/C browser suites. Their survival through named layouts and shell layouts is separate evidence from the bounded E1.2 portal probe.

## Eligibility, pending work and limitations

- Eligible paths are retained Flint Document sessions and the E1.1 first-mounted Ink island within a managed desktop Document window. There is no retroactive extraction of a legacy shared Solid owner and no cross-workspace adoption.
- A stable, unambiguous canonical Document identity is required. No filename/title guessing, new resource or second view is used. A canonical identity edit that removes Flint's source membership cancels preparation through ordinary host disposal; that edit is not undone by the coordinator.
- Dirty canonical text is allowed. Typing during preparation is retained, and undo/redo remains repository-owned. Affected pending native Save/receipt/recovery/admission/relocation states reject transfer. The native service's relocation evidence is conservatively workspace-scoped.
- Active interchange imports/exports, pickers and questions block transfer without cancellation. That service currently exposes one workspace task rather than a resource-specific lease, so this restriction can also block an unrelated transfer.
- Iframes, media players, canvas, positioned/related content, nested windows, opaque widgets, application blocks, native-text editors and non-standoff inline editors are unqualified and rejected. A Document containing these needs a separate capability proof. Inline passive content is not a promise of arbitrary embedded-editor continuity.
- Live unqualified tools and external-owner overlays reject transfer. This avoids retaining stale portal anchors, close guards or source-Vault callbacks. Tool-specific adapters remain review work; closing a tool is never forced just to permit transfer.
- First Save As, standalone Document chrome, accessible product Detach/Return controls, source-tab replacement/selection and durable return addresses are not implemented. The internal transferred Save capability requires a pre-existing native destination and records an error when absent.
- Return requires the exact live original slot. Closing the source does not recreate it. Transferring to a closed/stale lease is rejected.

## Persistence and manual Save

Existing JSON formats and filename conventions are unchanged. No durable host identity or Desktop 5 collection is serialized. Current D1/C descriptors cannot faithfully encode this temporary resource-session/host relationship.

Consequently, workspace capture refuses while a transfer is pending, a session is away from its original host, or exceptional recovery is unresolved. The refusal happens before taking the workspace snapshot or writing it. Returning to the original host re-enables the existing capture path. Workspace dirty state includes transferred topology; it does not mark Document content dirty merely for a move. Non-desktop presentation switching is also blocked while such state exists.

These guards apply only to an internal experimental topology unreachable from product controls. Ordinary local/server workspace formats and manual Document/Workspace Save behavior remain governed by their existing implementations and compatibility tests. No automatic save, migration, Markdown sidecar or layout-driven native Save was added.

## Resource accounting and performance

Transfer does not call `createView`, mount a new Solid root, add a canonical subscriber, allocate another native service or mutate the repository. Runtime diagnostics report sessions, hosts, pending transfers, reservations, containment entries and successful transfers.

One workspace capture listener handles the transferred Cmd/Ctrl-S route. It returns immediately for other keys. Ownership lookup uses a view map or DOM ancestry; transfer validation's resource/descendant inspection is an explicit operation, outside typing. The cross-Block input effect observes its selection and current host rather than scanning documents on text revisions.

The accepted retained-hidden policy remains intact: canonical subscriptions stay live; hidden optional geometry/count work is suspended. Browser evidence records zero hidden-editor geometry reads during a visible peer edit. Bounded-work unit checks and existing C/D1 browser typing assertions remain part of qualification. No typing latency benchmark or load test was run, and headless timing is not presented as user-visible latency.

## Qualification results

Final results and machine-readable evidence are recorded in [MUTABLE_WINDOW_MANAGER_E1_2_EVIDENCE.json](MUTABLE_WINDOW_MANAGER_E1_2_EVIDENCE.json).

| Qualification | Final result |
|---|---|
| New E1.2 coordinator tests | **26 passed** |
| Accepted E1.1 targeted selection | **59 passed** |
| Combined targeted selection | **85 passed, 0 failed** across 6 files |
| Client and server TypeScript | **Passed** |
| E1.2 real Chrome interactions | **55 passed** |
| E1.1 compatibility browser fixture | **37 passed** |
| D1 compatibility browser fixture | **39 passed** |
| C compatibility browser fixture | **76 passed** |
| Accepted 41-file regression selection | **433 passed, 13 failed**, plus the established synthetic drag/drop error |
| Whitespace/diff validation | **Passed** |

The 13 failures match the accepted baseline exactly: six application-startup cases, three workspace-demo cases, three Timer cases and one block-selection drag/drop case. All **446** file/test-name/status outcomes also match the retained accepted E1.1 runner artifact, counting duplicate names. There are no new failures in this selection. This compares against the previously accepted/reproduced baseline; it is not a claim of a fresh independent baseline execution in E1.2.

New deterministic cases cover every injected pre-commit boundary, occupied/reserved and forged/replaced leases, AbortSignal/Escape cancellation, newer focus, composition and modal/pending-close restrictions, native/interchange pending work, source/destination/workspace closure, explicit recovery, feature-off behavior, surface eligibility, resource-identity invalidation and exact disposal.

The 55 E1.2 browser checks demonstrate retained actual owner/DOM/projection identity, backward and cross-Block selection, unchanged history, trusted input and native Save after original Flint/Ink closure, portal-local state and ownership, rollback/retry, Return, hidden canonical delivery, minimization, viewport changes and real 125% browser zoom. Three private projection lifetimes each end with exactly one canonical subscription, one unsubscribe and one disposal. Ink final close retains the workspace projection. Final coordinator diagnostics report no hosts, sessions, pending transactions, reservations or recovery containers.

All Chrome checks use real production WorkspaceSession, Window Manager, Flint/Ink and editing components. Chrome DevTools Protocol supplies trusted pointer, key and text input, viewport changes and actual browser zoom. Composition gating is tested with synthetic composition events, not an operating-system IME. Native Save uses the real native client with in-memory HTTP responses; no production Vault or resource writes are made.

Earlier parallel attempts stopped during collection with `ENOSPC`. Those are environmental failures, not passing test evidence. Final unit runs use one worker. Two new test expectations were corrected after observing actual lifecycle rules: a held transfer blocks source-tab switching, and changing the canonical Document ID removes Flint membership and cancels the session. Existing accepted tests were not edited or suppressed.

## Reproduction

```sh
npx vitest run --maxWorkers=1 --minWorkers=1 --fileParallelism=false \
  src/application/document-host-transfers.test.tsx \
  src/application/document-sessions.test.tsx \
  src/runtime/document-counts.test.ts \
  src/application/flint-transient-proof.test.ts \
  src/rendering/cross-block-selection.test.tsx \
  src/rendering/range-rendering.test.tsx
npm run typecheck
node scripts/qualify-window-manager.mjs --e12
node scripts/qualify-window-manager.mjs --e11
node scripts/qualify-window-manager.mjs --d1
node scripts/qualify-window-manager.mjs --c
git diff --check
```

The evidence JSON includes the exact 41 regression filenames. To reproduce that selection without shell interpolation:

```sh
node --input-type=module <<'JS'
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
const evidence = JSON.parse(fs.readFileSync('MUTABLE_WINDOW_MANAGER_E1_2_EVIDENCE.json', 'utf8'));
const result = spawnSync('npx', ['vitest', 'run', '--maxWorkers=1', '--minWorkers=1',
  '--fileParallelism=false', ...evidence.regression.files], { stdio: 'inherit' });
process.exitCode = result.status ?? 1;
JS
```

The finite browser runner owns and removes its temporary Chrome profile, browser process and Vite server in `finally`. Fixtures dispose workspaces, restore fetch and view instrumentation, and remove their DOM. No user data cleanup is required.

## Architectural decisions and readiness

The implementation keeps the E1.1 retained-session design and uses one small coordinator rather than a generic transaction framework. Its deliberate restrictions are explicit portal opt-in, conservative pending-operation rejection, selected/visible connected hosts, and refusal to persist experimental topology. Exceptional containment is separately reported rather than mislabeled rollback.

The coordinator foundation is ready for review as E1.2. Before product detach/return can ship, E1.3 needs an approved host/command design, source-tab and navigation reconciliation, standalone Save/error/close behavior, qualified tool adapters and a user-facing recovery policy. Desktop 5 remains separately subject to final contract and migration approval. **E1.3 and later work have not begun.**
