# Mutable Window Manager — E1.3 Qualification Report

Date: 21 October 2026. Accepted E1.2 baseline: `c61da618b5bd9418c5bb32f2897505ee27bf489a`.

## Scope and result

E1.3 exposes **experimental Detach Document and Return to Flint** controls over the accepted E1.2 coordinator. Detach moves the existing retained editing session into an independent managed Document window. Return moves it back to its exact original, still-live Flint slot. Neither operation creates a canonical Document, editing projection or second editor.

The source tab remains a reference with a small detached-window indicator. This interpretation was stated before implementation: removing the source slot's *hosting responsibility* does not require deleting its navigation reference. It reconciles the user's preferred behavior with the [accepted implementation plan](MUTABLE_WINDOW_MANAGER_E1_IMPLEMENTATION_PLAN.md).

The new `documentDetachment` flag defaults to enabled. It requires the existing Window Manager, retained Document sessions and host-transfer flags; their defaults and exclusive fallback remain unchanged. Native Document persistence must also be enabled for the product command. Disabling the product flag removes its controls while leaving E1.1 retention and E1.2 available.

No Desktop 5 schema, migration, additional-view command, cross-workspace adoption, Canvas/Acetate integration, tool promotion, eviction or load testing was implemented. E1.4 has not begun.

## Product controls and source reconciliation

- Open the Flint Document tab context menu, or its accessible **Document actions** button, and choose **Detach Document**. Existing keyboard context-menu access remains available. An ineligible session has a disabled action and an explanation.
- Detach creates an empty managed Document shell, registers its slot, and calls the E1.2 transaction. Successful transfer raises the new window and restores eligible editing focus. A newer focus interaction retains precedence.
- The original tab remains, with a subtle ↗ indicator. After detachment Flint selects another hosted tab when one exists. Selecting the reference activates the independent window; its reference panel explains where the editor is and offers an activation button.
- **Return to Flint** is available in the independent toolbar and the original tab menu. It selects the exact original tab, validates its lease, transfers through E1.2, and retires the empty runtime shell and its layout membership.
- Closing the original Flint window destroys its tab reference and lease, not the moved session. Return is disabled thereafter. Editing, native Save and guarded independent-window close continue to work. There is no replacement-host search or implicit Return on close.
- Closing a detached tab reference delegates to the independent window's close guard. Successful close removes the original reference if it still exists.

`activeTab`, `liveViews`, selected-Vault guards and navigation remain Flint-owned. Navigation to an already-detached Document reveals its current host. The focus ticket is refreshed after that intentional synchronous activation; later asynchronous navigation still checks its original application/resource authority and current focus. Source-tab effects retain E1.2's protection against reclaiming an editor hosted elsewhere.

## Implementation and ownership

The product adapter is [document-detachment.tsx](src/application/document-detachment.tsx). It is owned by the WorkspaceSession's DocumentSessionStore. It owns runtime shell records and product UI state, **not** editor disposal.

| Authority | E1.3 responsibility |
|---|---|
| DocumentSessionStore | Sole final disposer of the retained Solid root, editing DOM and owned projection. |
| E1.2 DocumentHostTransfers | Existing leases, occupancy, reservations, validation, attachment journal, cancellation, rollback and containment. |
| Window Manager | Existing registry, group ownership, stacking/MRU, focus, geometry, minimization, shell tabs, modal and close policies. |
| Product adapter | Empty standalone shell, original-slot reference, notices, first-save form, close confirmation and recovery controls. |
| Canonical repository/native service | Unchanged Document identity, undo history, content dirty state, native binding and pending Save receipts. |

The existing `WindowView` accepts a content renderer and a runtime descriptor supplied by the same manager. A runtime descriptor has a window ID and presentation metadata but **no canonical Block or persisted descriptor**. Its source ViewId is the retained session's existing ViewId. Registration, resize, movement, maximize/minimize, window menus and shell layout continue through the ordinary manager. This small adapter avoids manufacturing authored content merely to display a window.

The transferred subtree retains its original Document style controls; the shell does not duplicate Flint navigation or render a second Document. Its toolbar provides Save, first Save As, Return and pending-transfer cancellation. The title observes canonical title and cheap native dirty state. The window frame is tagged with the current session so Cmd/Ctrl-S also routes correctly from its controls.

Two prerequisite adjustments emerged during product qualification:

1. A Document-tab invocation menu is marked as a cross-selection control, closes before transfer, and restores its invocation focus. The existing cross-Block input is recognized as belonging to its current session's managed window, including when physically outside the window group. This prevents activation from replacing a valid cross-selection bookmark with frame focus.
2. Return can reveal Flint within the **same shell tab group**, thereby hiding its source window. An explicit coordinator option permits that hidden source while retaining all connectedness, selection, lease, generation, modality and operation checks; the destination must be visible. Default E1.2 transfers still require visible hosts. Product focus restoration checks the lifecycle ticket before commit and does not override newer input. Each Return has its own cancellation controller.

## Save and close semantics

**Save Document / Cmd/Ctrl-S** invokes the existing native service for the session's canonical resource. It uses the already-admitted destination even after the source Flint window closes. There remains one workspace Save shortcut listener; the product installs one routing callback per detached session and removes it on Return/close.

**Save As** is the first-destination workflow for a resource without a native location. It collects folder and filename and calls the existing native binding/Save service. Cancel creates no binding or write. Once bound, Save As is disabled with an explanation: E1.3 does not add relocation or copy semantics for an existing binding. Save errors remain visible; pending receipts retain the native service's established dirty-state rules.

**Close independent window** rejects while transfer, Save or a pending native receipt is unresolved. A dirty Document opens an application-owned modal with **Keep editing** and **Close without saving**. Closing ends that editing session; canonical unsaved edits remain in the current workspace. It neither saves nor deletes the resource. A clean close disposes exactly once. Returning disposes only the empty shell, never the editing session.

Document content remains manually saved. Workspace layout changes do not issue Document Save. No background save, Markdown sidecar, filename change or new native persistence mechanism was introduced.

## Failures and recovery

An ordinary Detach failure rolls back through E1.2, removes the unused shell, and displays the failure. The source editor remains usable. Failed or cancelled Return leaves the session in its independent host and offers retry. Both operations reject late asynchronous preparation after cancellation; the Cancel control and existing Escape transfer cancellation apply.

Exceptional external removal of a source container remains distinct from successful rollback. E1.2 retains the session in its inert containment area. E1.3 retains a visible managed recovery shell, displays **Document retained for recovery**, and offers **Retry original host**, Save/first Save As, and guarded close. Retry requires the same lease/container to reconnect; failure remains explicit. The contained editor is suspended until that recovery succeeds. Permanently lost hosts are not reconstructed or replaced; the user can preserve canonical content with native Save and explicitly end the retained session. No supported ordinary close path was shown to require this exceptional policy.

Recovery controls and exact-source reconnection are demonstrated in component tests with actual editors. They are not claimed as an OS/browser crash-recovery feature.

## Embedded-content and surface capability matrix

This matrix concerns the currently mounted rendering path, not whether a resource file can eventually be imported. Eligibility checks run at explicit commands/transaction boundaries, outside typing.

| Content or surface | Classification and policy | Evidence / boundary |
|---|---|---|
| Retained Flint standoff Document, ordinary inline text/annotations | Transferable within the retained boundary | Real Chrome owner/DOM/projection/occurrence identity, native backward and cross-Block selection, scroll, trusted editing and undo/redo. Accepted range-rendering suite retained. This does not qualify arbitrary annotation-created external tools. |
| Passive inline image and ordinary `image-block` | Transferable within the retained subtree | Actual image components retain the same image DOM in unit tests. No claim of browser media-decoder, remote loading or every asset-provider behavior. |
| Ordinary layout/container descendants | Follow retained subtree when descendants pass validation | No reconstruction of the Document tree. Unqualified descendants still reject the whole operation; this is not universal Block rehosting. |
| Document tab context menu | Qualified bounded invocation adapter | Dismissed before movement; preserves invocation focus and cross-selection. Product browser evidence. The menu itself is not promoted or transferred. |
| Explicitly opted-in nonmodal session portal | Existing E1.2 adapter only | Unchanged E1.2 browser probe proves lease/DOM/owner continuity. No production tool is newly opted in by E1.3. |
| Other Document overlays, anchored tools and unqualified portals | Unsupported while live | Coordinator rejects external ownership or absent transfer opt-in. No forced tool dismissal to permit Detach. |
| PDF, web article/resource, academic, structured, IIIF and citation viewers | Unsupported/unqualified | Existing opaque-widget registrations reject movement; viewer-specific state and async work have not been qualified. |
| Video, audio, iframe/HTML viewers and nested windows/applications | Unsupported/unqualified | DOM and registry capability checks reject them. Product browser includes an iframe negative control. |
| Canvas, positioned content, relations/margin islands | Unsupported/unqualified | Existing DOM guards; explicit `canvas-preview` capability rejection also covers the DOM-only Canvas preview that has no `<canvas>` element. Real CanvasPreview component negative unit test. |
| Native/plain-text/source editors and CodeMirror | Unsupported/unqualified | Existing native-text/opaque/non-standoff editor checks reject them. |
| Entity and Thesis tools | No new transfer adapter or promotion | Application/resource ownership remains unchanged. Live affected unqualified surfaces block movement. C/D1 browser checks continue to exercise their established state protections, not Entity/Thesis detachment. |
| Existing eligible Ink retained island | E1.2 foundation remains qualified | Accepted E1.2 browser fixture exercises actual Ink transfer/source close. E1.3's new source menu targets Flint; an already-independent Ink window receives no redundant Detach command. No retroactive adoption of legacy shared owners. |

Dirty canonical edits are eligible. Composition/settling, selection/window/divider gestures, affected modal/close guards, text operations, pending native work and active interchange tasks remain conservative blockers. Custom components need their own capability/ownership qualification; DOM movability alone is insufficient.

## Persistence boundary

A persistent experimental notice explains that **detached Documents must return or close before Workspace or named-arrangement capture**. Native Document Save remains available. E1.2's pre-snapshot workspace refusal is preserved for moved/pending/recovery topology. Named-arrangement capture now uses the same guard, and selecting a named arrangement while runtime shells exist is rejected with an explanation. Neither rejection mutates existing arrangements or automatically moves Documents.

Existing local self-contained and server-manifest formats, JSON extensions, manual-save acknowledgment and explicit upgrade rules remain unchanged. There is no provisional serialization of runtime shell IDs.

General availability still depends on the separately approved final Desktop 5 contract and implementation: separate durable Document-view and host identities (`documentViews` / `documentHosts`), canonical resource references, Flint reference membership and return-address semantics, named-arrangement mappings, validation of missing/ambiguous resources, and explicit D0/C/D1 migration/Save As rules. Unsaved drafts, focus leases, modal stacks and pending domain operations must remain transient. E1.4 named-layout integration and schema implementation require further approval.

## Qualification and evidence

Machine-readable results, full browser check lists, regression case statuses and reproduction selection are in [MUTABLE_WINDOW_MANAGER_E1_3_EVIDENCE.json](MUTABLE_WINDOW_MANAGER_E1_3_EVIDENCE.json).

| Check | Result |
|---|---|
| E1.3 product component tests | 16 passed |
| Accepted E1.2 coordinator selection | 26 passed |
| Accepted E1.1/range/count selection | 59 passed |
| Combined targeted selection | **101 passed, 0 failed**, 7 files |
| E1.3 Chrome product fixture | **60 passed** |
| E1.2 / E1.1 compatibility browsers | **55 / 37 passed** |
| D1 / C compatibility browsers | **39 / 76 passed** |
| Accepted 41-file regression selection | **433 passed, 13 failed**, established synthetic drag/drop error |
| Client/server TypeScript and diff validation | Passed |

Product browser evidence uses actual WorkspaceSession, Flint, WindowView, Window Manager and standoff components. Chrome DevTools Protocol supplies trusted clicks, text/key input, viewport changes and actual 125% browser zoom. Checks include both directions of cancellation/rollback through product controls, unsupported content, source reference activation, source close, first Save As cancellation/completion, unsaved close cancellation, multiple detached Documents and a simultaneous independent peer of the same canonical resource.

The browser checks confirm no additional editing projection/session/canonical subscriber or canonical revision for the initial Detach. Existing tab switches replace the active Flint Entity inventory observer: two subscribe calls occur, but live subscriptions remain **4 before / 4 after**. This is not evidence of duplicate live subscriptions. Private projection lifetimes end with one canonical subscription, one unsubscribe and one disposal each. Final diagnostics are zero sessions, hosts, pending transfers, reservations, recovery entries and product windows, with four completed transfers.

Hidden canonical updates still arrive; the visible peer edit records **zero geometry reads in the hidden editor**. The product typing unit check records no full repository snapshot and no eligibility validation per keystroke. No typing latency claim is based on these headless checks, and no load test or typing benchmark was run.

The 13 regressions are the established six application-startup, three workspace-demo, three Timer and one block-selection drag/drop failures. All **446 file/test-name/status outcomes**, including duplicate names, match the retained accepted E1.2 runner artifact. This is an exact comparison against accepted evidence, not a claim that E1.3 independently reran the old baseline checkout. Existing tests were not suppressed or altered to hide failures.

One browser attempt timed out starting Chrome before executing tests; a subsequent run passed all 60 checks. This infrastructure failure is not counted as application evidence. Native Save browser responses are in-memory HTTP fixtures; no production Vault writes are claimed. Exceptional containment/recovery, passive image identity, pending-close protection, Canvas rejection and named-arrangement refusal have component-test evidence. OS-level IME input, remote viewer state and crash recovery remain outside qualification; the accepted E1.2 composition checks use synthetic events.

## Reproduction and cleanup

```sh
npx vitest run --maxWorkers=1 --minWorkers=1 \
  src/application/document-detachment.test.tsx \
  src/application/document-host-transfers.test.tsx \
  src/application/document-sessions.test.tsx \
  src/runtime/document-counts.test.ts \
  src/application/flint-transient-proof.test.ts \
  src/rendering/cross-block-selection.test.tsx \
  src/rendering/range-rendering.test.tsx
npm run typecheck
node scripts/qualify-window-manager.mjs --e13
node scripts/qualify-window-manager.mjs --e12
node scripts/qualify-window-manager.mjs --e11
node scripts/qualify-window-manager.mjs --d1
node scripts/qualify-window-manager.mjs --c
git diff --check
```

Reproduce the exact regression selection without shell interpolation:

```sh
node --input-type=module <<'JS'
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
const evidence = JSON.parse(fs.readFileSync('MUTABLE_WINDOW_MANAGER_E1_3_EVIDENCE.json', 'utf8'));
const result = spawnSync('npx', ['vitest', 'run', '--maxWorkers=1', '--minWorkers=1',
  ...evidence.regression.files], { stdio: 'inherit' });
process.exitCode = result.status ?? 1;
JS
```

Browser runners own and clean up their Chrome process/profile and Vite server. Fixtures dispose workspaces, restore instrumentation/fetch and remove their DOM. Qualification results are retained as repository documents; no production resources were created by these tests.

## Readiness and remaining limitations

E1.3 is ready for review as an experimental, conservatively eligible Flint Detach/Return feature. The bounded runtime WindowView adapter, invocation-menu focus handling, explicit hidden-source Return option and named-layout guard are the architectural adjustments; the session store and transfer coordinator remain the existing ownership/transaction authorities.

Durable detached topology, arbitrary-host reattachment, explicit second-view commands, application-owned tool transfer, unsupported viewers and broad Ink adoption remain deferred. Permanently lost source slots disable Return; exceptional containment preserves Save/recovery/close rather than inventing a replacement editor. **Work stops at E1.3 pending review.**
