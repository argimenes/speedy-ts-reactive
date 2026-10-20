# Mutable Window Manager — A1 qualification

Date: 20 October 2026. Implementation baseline: `313b933` (accepted A0).

A1 activation, focus and lifecycle coordination is implemented behind the existing default-enabled `mutableWindowManager` flag. The disabled path remains exclusive. A0’s ordering and application-surface groups remain the foundation; this change does not introduce retained desktop hosts, tiling, docking, tool promotion or workspace-format changes. Milestone B has not begun.

## Changes

### Activation, input ownership and selection

[WindowLifecycle](src/application/window-lifecycle.ts) coordinates native focus, activation requests, modal leases, guarded transitions and cancellation. [WindowRegistry](src/runtime/window-manager.ts) records the active editing window and MRU order. Raising alone changes stacking without activating, restoring a selection or writing repository data. Launch/reveal adapters request activation separately; source navigation can open its supporting window without prematurely transferring focus.

The existing FocusService and MountRegistry still place the caret and route editor input. Pointer activation does not restore an old bookmark over a browser click. Clicking a non-focusable title activates the window and restores its editor bookmark. Explicit activation restores native selections, inline selections or live DOM ranges, with occurrence identity and source-revision checks. Cross-Block selection includes endpoint revision checks. Two mounted occurrences of one canonical Document retain independent selections. Unavailable/stale bookmarks fall back to a current focus target; they are not serialized.

Queued panel returns and app readiness use cancellation leases. Thesis’s initial asynchronous draft focus is tied to its window generation; a newer activation, interaction or closed/recreated window invalidates it. Subsequent explicit New/load operations obtain fresh readiness. The isolated Thesis editor retains one active child input router, releases it when managed focus leaves, and shares its host’s modal permission boundary. No additional editor gateway is installed per desktop window.

Activation requested during composition waits until composition ends. Close/minimize cannot destroy a composing view. An iframe’s outer element is the focus target; minimization of a window containing an iframe is blocked until retained-host qualification.

`window.next`, `window.previous`, `window.minimize`, `window.restore` and `window.close` are registered through the existing command registry, with window context actions. Cycling uses stable registration order; activation updates MRU independently. No new default accelerators were assigned. The accepted Thesis Command/Control-Shift-P binding and fallback chord remain unchanged. Move/resize retain their existing controls; new interaction infrastructure belongs to B.

### Lifecycle and application ownership

Managed close requests collect owned-tool guards before the application guard. Guards can return synchronously or asynchronously and receive an AbortSignal. Veto, rejection, cancellation, new input during a pending close, or a stale window generation prevents the close from committing. Newly registered guards invalidate an in-flight guard collection. Owned overlays are disposed only after guards pass; related Thesis windows remain independent of their source Flint window. Existing close callers retain synchronous completion when their guards are synchronous.

Lifecycle notifications expose activation/deactivation, requested/cancelled/completed close, minimize and restore transitions. Late completion cannot restore a disposed window. Thesis initialization and list requests are cancelled on disposal; existing pending Save receipt and retry semantics are preserved. Guards no longer clear Thesis dirty state during preparation. Document and Workspace Save remain manual and unchanged.

Because A1 does **not** retain desktop editing hosts, minimization is blocked for guarded app sessions, stateful tool/dialog surfaces and embedded iframe sessions. A status message explains the restriction. Safe existing minimize paths choose an eligible MRU successor, then restore the original mode and verified bookmark on reveal. Mounted, visible and active remain distinct facts; a minimized icon is not treated as a mounted editing view.

### Modal coordination

Modal leases coordinate pointer input, focus, keyboard commands, Tab containment, background `inert` state and guarded focus return. An owner modal blocks its owner; explicit window cycling can activate an unrelated app. A workspace modal blocks both cycling and launch commands. Nested owner-surface portals retain the modal’s ownership. Modal close returns to its permitted invoker only while its return lease is current.

Current surface classifications:

| Surface | A1 treatment |
|---|---|
| Flint Storage and recovery | Owner-local modal, including descendant popovers; named dialog with `aria-modal=false`, since unrelated apps can remain available |
| Flint reference-Document picker | Existing inline UI with owner-local modal coordination |
| Existing DocumentDialog callers | Existing workspace-blocking behaviour retained; includes shell open/save and the existing publication/collection dialog host |
| Block History | Existing workspace-blocking history overlay, registered while open; queued source return is cancellable |
| Entity lookup, Entity listing, Find, annotation monitor, Timer and context tools | Owned surfaces; Entity lookup is explicitly modeless and explicitly dismissed |
| Clipboard image consent and interchange status/pickers/questions | Existing nonmodal/status behaviour retained; no workspace-modal lease inferred merely from `role=dialog` |

The workspace Open controls now distinguish a registered workspace modal from an unrelated modeless Entity tool. Presentation switching retains its existing conservative guards against destroying active tools or opaque editing sessions.

### Link Entity Reference

The managed annotation capability adds a target-scoped change subscription. It captures source/structural dependencies once, uses repository change records, and performs no Document/vault inventory rebuild for unrelated commits. An unrelated commit advances only the revision fence; it does not replace the captured ranges, query, selection preview or tool session. Source changes invalidate the target, disable unsafe linking and leave the tool available for explicit dismissal/recovery. The final global revision and native range-validation checks remain in force.

A Document occurrence reuses its existing Entity lookup session; opening the command again does not silently retarget an outstanding operation. Another occurrence can have its own tool. Outside clicks and unrelated Thesis launches do not dismiss the lookup. Pending Entity creation guards close; an uncertain outcome retains its retry receipt unless explicitly discarded. Confirmed creation with a stale source remains “created but not linked,” with the existing recovery workflow. No late annotation is added after disposal.

Candidate searches keep their existing conservative revision validation: unrelated changes may make an already computed candidate set require an explicit rerun. A1 does not silently certify old search results or rebuild the whole Document to avoid that limitation.

## Qualification results

| Check | Result |
|---|---|
| TypeScript client/reactive and server checks | `npm run typecheck` passed |
| Expanded regression comparison | **310 passed, 13 failed**, 323 tests across 30 files; the failures are the same accepted baseline cases |
| Final focused verification after final readiness/modal changes | **51/51 passed** across window-manager, workspace-open, public-hosted-version and Thesis suites |
| Final Flint navigation/lifecycle verification | **44/44 passed** across Flint lifecycle and window-manager suites |
| New A1 integration checks | **15/15 passed**, added to the five existing A0 application-manager cases |
| Additional affected modal/import/clipboard coverage | Block History, Document Interchange and Mutable Clipboard included in the expanded regression run |
| A0 real-browser comparison | All original **22/22** checks passed during A1 qualification |
| Final A1 real-browser qualification | **47/47** checks passed in Headless Chrome 155, 1440 × 1000 |
| Patch hygiene | `git diff --check` passed |

The 30-file comparison uses the A0 report’s exact regression command plus `src/rendering/block-history.test.tsx`, `src/rendering/document-interchange.test.tsx` and `src/rendering/mutable-clipboard.test.tsx`. The final focused command was:

```sh
npx vitest run src/application/window-manager.test.tsx src/application/workspace-open.test.tsx src/demo/public-hosted-version.test.tsx src/features/thesis/view.test.tsx
```

The final focused run includes the additional owner-modal cycling and superseded-guard-response cases; it overlaps the larger regression run and should not be added to its count.

The new integration cases cover MRU and native selection restoration without persistence writes; clicked carets and stale overlay returns; asynchronous close veto/cancellation; child-before-app guards; IME deferral; safe minimize/restore and guarded minimization; owner/workspace modal scope; Entity continuity and source invalidation with bounded reads; stale readiness after remount; new input cancelling a close with ordered notifications; cross-Block restoration/stale endpoints; independent selections for two occurrences of one Document; non-focusable title activation; owner-modal versus workspace-modal cycling; and an old cancelled guard response arriving during a newer close request.

### Real-browser evidence

Run:

```sh
node scripts/qualify-window-manager.mjs --a1
```

The [fixture](src/application/window-manager-a1.browser-fixture.tsx) renders real WorkspaceSession, Flint, Entity and Thesis components. The [runner](scripts/qualify-window-manager.mjs) uses Chrome DevTools Protocol for trusted text insertion, pointer input, Tab events and accessibility-tree inspection. The [recorded result](MUTABLE_WINDOW_MANAGER_A1_BROWSER_EVIDENCE.json) contains the complete 47-check list and browser identity.

Evidence includes:

- Maximized Flint and its still-mounted ordinary Entity lookup remain below newly activated Thesis; actual overlap and `elementFromPoint` establish stacking.
- Real Thesis inline selection survives activation, trusted input edits the draft exactly once, and source text remains unchanged. A trusted pointer click places a collapsed caret without restoring the previous selection.
- Unsaved Thesis minimization and rejected close preserve the same editor DOM. Open source activates the original Flint occurrence and restores the verified passage range.
- Pending Entity creation blocks owner close. A source change produces a retained creation receipt without linking stale text. Owner close later removes the tool while leaving related Thesis drafts mounted.
- Owner-local Storage returns focus to its exact invoker. Workspace modal activation, launch, background input and Tab escape are blocked. Chrome’s accessibility tree exposes the named modal and modal semantics.
- Delayed Thesis readiness cannot steal a newer Flint activation. Closing a loading Thesis aborts initialization; resolving the deliberately delayed response afterward cannot recreate the window.
- One finite Flint input edit performs no window registration, order change, repository snapshot or owner lookup. This is a bounded-work assertion, not a latency benchmark.

All domain responses are in memory. The isolated server has no backend proxy; unrecognized API traffic is blocked. No live Entity, Proposition, Document, Workspace or vault files were created or saved. Each browser run removes its own Chrome profile and closes its own server/process. **No load testing or typing benchmarks were performed.**

### Regression comparison and fixes

The 13 remaining failures match the independently reproduced A0 baseline documented in [the accepted A0 report](MUTABLE_WINDOW_MANAGER_A0_QUALIFICATION.md): six application-startup fixture failures, three workspace-demo assertions, three Timer registration/lifecycle assumptions, and the block-selection drag fixture. The latter still reports its existing missing `dataTransfer.files` uncaught exception. These failures were neither fixed nor suppressed in A1; the final failing case names were compared with the accepted list. A second baseline extraction was unnecessary because that evidence was explicitly accepted.

Qualification found and corrected two implementation issues: the managed focus gate initially rejected the minimized-icon fallback when returning from Canvas, and Thesis attempted to assign its accessibility label before its native mount registered. The focused Canvas suite and the browser readiness checks pass after those fixes. Testing also added protection for non-focusable title activation, generation reuse, input arriving while an asynchronous close guard is outstanding, and old cancelled guard responses affecting a newer close request.

## Boundaries, deviations and remaining limitations

- Stateful minimization is deliberately guarded rather than implemented through retained hosts. Even a currently clean Thesis session remains guarded. This is the approved A1 safety option, not a claim of B-level retention.
- Existing DocumentDialog and Block History presentations retain their workspace-blocking scope. Reclassifying their individual invocation sites and changing their visual shells is not included. Flint’s existing owner-local modal supplies the qualified application-modal proof. Clipboard/interchange prompts are not newly made modal.
- The architecture’s generic move/resize commands and richer owned-window families are not added; current window controls remain, and current applications use one window per app instance. Tool surfaces are owned; a source-linked Thesis is related, not owned. No tool was promoted to a desktop window.
- Chrome accessibility-tree and keyboard checks are recorded; no human screen-reader session, real IME candidate-window session, Windows browser session or cross-origin iframe integration test was performed. IME deferral has a targeted synthetic composition test; cross-origin frame-internal caret restoration is not claimed.
- Background status/consent prompts retain their existing behaviour. Existing asynchronous domain operations still own their own validation and receipts; the manager cancels presentation/focus authority, not already-dispatched canonical writes.
- Shared geometry algorithms, editor typing architecture, saved workspace formats, Acetate identity, Save semantics and default feature settings are unchanged. No A1 result authorizes Milestone B or later work.
