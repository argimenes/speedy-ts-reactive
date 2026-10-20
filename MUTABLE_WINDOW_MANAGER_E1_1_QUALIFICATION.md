# Mutable Window Manager — E1.1 Qualification Report

**Date:** 21 October 2026  
**Baseline:** `8557f83` (`More proposals`), containing the accepted D1 implementation and E1.0 proofs.  
**Scope:** E1.1 — Retained Document Sessions only.

## Result

E1.1 is implemented. Visited Flint Document tabs retain their editing sessions when another internal tab is selected. Eligible Ink Documents establish a retained island at their first managed-desktop mount. WorkspaceSession owns final session disposal.

Qualification passed **59 targeted tests** and **37 E1.1 Chrome checks**. The existing D1 and C browser fixtures also passed **39** and **76** checks respectively. The 41-file regression selection and an independently run clean baseline both produced **433 passed, 13 failed**, with the same previously established drag/drop uncaught error. All 446 test-case outcomes match, including repeated test names. Client/server typechecks and `git diff --check` passed.

No detachment, rehosting, transfer transaction, new host type, Desktop 5 schema, Canvas integration or tool promotion was implemented. No load testing was performed. Work stops at E1.1.

Machine-readable results, browser observations, regression file selection and failure names are in [E1.1 evidence](MUTABLE_WINDOW_MANAGER_E1_1_EVIDENCE.json).

## Implementation and ownership

| Boundary | Implementation |
|---|---|
| Workspace authority | [WorkspaceSession](src/application/workspace-session.ts) creates and disposes `DocumentSessionStore` before disposing the Window Manager and editor. |
| Session lifetime | [document-sessions.ts](src/application/document-sessions.ts) owns each independent Solid root, its container, AbortController and private-projection disposal, where applicable. |
| Host binding | `DocumentHostBinding` holds immutable runtime owner/slot/window identity and coordinates, reactive activity, and generation tickets. It deliberately exposes no transfer/rebind operation. |
| First-mount boundary | [retained-document-view.tsx](src/rendering/retained-document-view.tsx) creates a detached Solid root that inherits existing contexts. It does not adopt an already mounted owner or move editing DOM. |
| Flint integration | [Document application capabilities](src/application/document-application-capabilities.tsx) mounts each visited tab once and controls selection through visibility and activity. |
| Document rendering | [TransientDocumentView](src/rendering/transient-document-view.tsx) borrows the retained projection when present; its legacy path still creates and disposes a transient projection. |
| Ink integration | [WindowView](src/rendering/core-block-views.tsx) establishes an island for a direct Document child of a managed desktop Document window. |

The new session-fixed `retainedDocumentSessions` feature flag defaults to **true**. It requires the existing default-enabled `mutableWindowManager` and a WorkspaceSession. Flint retention requires a managed window owner; the Ink boundary requires desktop registration. Disabling either flag leaves the existing transient Flint path exclusive. Bare ReactiveEditor callers also keep their existing path.

A session's runtime identity is distinct from its projection ViewId, occurrence NodeKeys, source placement, canonical content and window identity. None of these new session records is a durable restore descriptor.

Flint sessions own private projections rooted at existing canonical Document placements. They create no Document, authored child edge or resource service. Ink islands borrow the existing shared workspace projection, preserving occurrence ancestry and established resource/Save routes.

Tab membership requests release through the store; it never receives the render disposer. The store is the sole final disposal authority. A deterministic test disposes the creating Solid root while leaving the independently owned session alive, then releases that session exactly once through the store. This proves the lifetime separation required for later work; it does not implement an alternate host or claim independence from every inherited application service.

### Disposal and cancellation

| Event | Result |
|---|---|
| Select another visited Flint tab | Hide/inert the old panel; retain its session, projection, owner and editing DOM. |
| First visit to another tab | Allocate its session once. Unvisited tabs remain lazy. |
| Minimize or hide the owning window | Retain the session; update visibility/activity through the existing Window Manager. |
| Accepted tab close | Release that editing session and private projection; preserve canonical Document content and native binding. |
| Guard rejects tab close | Preserve the exact session and tab. |
| Application close | Release its retained editing sessions and abort outstanding tab-close requests. |
| WorkspaceSession disposal | Abort store lifetime and pending tab-close requests, dispose retained roots/projections, then dispose the remaining workspace services. |
| Failed initial render | Remove the record and dispose the newly allocated private projection; leave no occupied host slot. |
| Stale release/completion | Cannot release a replacement session, commit an aborted close or restore stale focus. |

Generic `closeView` accepts an optional cancellation signal for guarded tab closes. Tab-close completion checks its controller, application lifetime and selection generation. A delayed accepted close cannot select/focus over a newer tab or window activation. Duplicate close requests for the same pending tab do not start another guard.

Internal tab switching and close initiation respect the existing composition, application/workspace modal and pending window-close restrictions. Existing native Save operations remain resource-scoped and can finish while their view is hidden.

## Editing and input continuity

Flint's internal Document tabs remain separate from shell window tabs. Retention does not change the canonical undo authority, native-resource binding, file target, resource catalogue or application-owned navigation.

The browser fixture uses production WorkspaceSession, WorkspacePresentationView, Flint, Ink, Document and StandoffEditorView components. It records actual owner objects, mount handles, projection objects, occurrence keys and editing cells. Instrumented owner-local state corroborates Solid lifetime; actual text, selection and undo checks provide the editing evidence.

Demonstrated behavior includes:

- The same projection/ViewId, occurrence NodeKey, Solid owner, mount and connected DOM survive internal tab switches. Unchanged editing cells are the same DOM objects.
- A backward native standoff selection remains **anchor 7, head 3** after trusted tab clicks.
- The existing Document scrollport retains its nonzero scroll position; no scrollport reconstruction was introduced.
- A separate Flint view has a different projection/ViewId around the same canonical content. Trusted typing there updates the hidden first view and rebases its saved selection to **anchor 14, head 10**.
- Canonical undo remains available after switching and after editing through the other view.
- Cross-Block selection is bookmarked before tab controls relinquish input ownership, cleared from the global active selection while hidden, and restored on return when its endpoints remain valid.
- Window focus restoration rejects hidden/inert editing targets. Tab activation uses session lifetime, selection generation and existing Window Manager focus tickets.
- Real Ink typing, hidden canonical delivery and restoration preserve the original shared projection and mount. Closing the Ink island disposes its owner once without disposing that shared projection.

An external/structural edit without an existing input position map does not justify reusing unverified offsets. Revision checks retain the safe fallback: stale cross-Block bookmarks are discarded; an unmapped inline bookmark returns to the start rather than applying potentially invalid offsets. Input-mapped hidden edits are demonstrated separately. General structural selection mapping is not added by E1.1.

## Mounted, visible and active policy

These states are distinct:

- **Mounted:** the editing root and its session remain alive, including while hidden.
- **Visible:** the tab is selected and its managed owning window is visible.
- **Active:** the visible session belongs to the active managed window.

Hidden tab panels remain connected, with `hidden` and `inert` set. Document-owned portal surfaces inherit both session and window visibility while retaining their existing surface leases. Application-scoped tools retain their existing application ownership.

Required canonical projection subscriptions and reactive content delivery remain live while hidden. Hidden Standoff editors suppress annotation/layout measurement scheduling and visible caret work. Revealing them schedules geometry refresh through their existing invalidation path. [DocumentCounts](src/runtime/document-counts.ts) retains dirty/cache bookkeeping while suspended, defers counting, rejects stale in-flight results and resumes changed work when visible.

The browser counted **zero `getBoundingClientRect` reads within the hidden editor** during a trusted edit through its visible peer. Each of the three private projections constructed during qualification acquired one canonical subscription and released it once at final disposal.

Across the measured visited-tab cycle, the instrumented live repository-subscription count stayed **4 → 4**. Two non-projection subscriptions were replaced during application updates; this is balanced observer replacement, not a claim that every application observer remains unchanged. No private projection subscription was recreated by tab switching.

The bounded typing test asserts one edit dispatch, no repository snapshot and no session-inventory enumeration with a hidden retained peer. Count-service tests verify no hidden counting and correct resumption after a pending result becomes stale. These are bounded-work checks, not latency, throughput or memory measurements.

This is a minimal visibility policy. Visible but inactive sessions continue required rendering. It does not globally pause arbitrary embedded widgets, media, application services or every shell-specific CSS-hidden panel.

## Manual Save and persistence

The existing native-resource service remains the authority for Document Save and dirty state. Retention does not register another Save handler or create a second resource binding.

The E1.1 browser fixture runs the real native client and Flint shell shortcut against an in-memory HTTP transport:

1. Explicit Save binds the canonical Document to `e11-A.mutable.json`.
2. Trusted Control-S captures one Save for the selected Document.
3. The transport holds its receipt while the user switches tabs.
4. A newer canonical edit arrives while that Document is hidden.
5. Completing the receipt leaves the newer edit dirty and clears only the pending operation.

Both requests target the same canonical resource and opened filename. Neither contains a Markdown sidecar. No view switch/minimize operation dispatches Save.

There are **no production persistence-schema changes**. Desktop 2/3/4 compatibility, JSON workspace envelopes, resource identities, filenames, native workspace restrictions and manual Workspace Save remain unchanged. Store records, Solid owners, DOM, abort signals, visibility tickets and pending work are not serialized. No `documentViews` or `documentHosts` collections were introduced.

Desktop 5 remains an accepted-in-principle proposal awaiting its separate final contract and migration approval. E1.1 does not supply durable detached-session restoration.

## Test results

### Targeted automated qualification

| Suite | Passed |
|---|---:|
| `src/application/document-sessions.test.tsx` | 16 |
| `src/runtime/document-counts.test.ts` | 7 |
| `src/application/flint-transient-proof.test.ts` | 5 |
| `src/rendering/cross-block-selection.test.tsx` | 16 |
| `src/rendering/range-rendering.test.tsx` | 15 |
| **Total** | **59** |

The session suite includes real Flint/Ink components, lazy retention, canonical delivery, unmapped selection safety, exact release counts, application/workspace disposal, render failure, stale tickets, guarded-close cancellation and late completion, composition/modal restrictions, bounded input work, and both exclusive feature-flag fallbacks.

### Regression comparison

The accepted 41-file D1 selection was run against both the modified tree and a temporary clean archive of `8557f83`.

| Run | Passed | Failed | Other errors |
|---|---:|---:|---|
| Clean accepted code | 433 | 13 | Known synthetic drag/drop TypeError |
| E1.1 final code | 433 | 13 | Same error |

All **446 case identities and statuses**, including duplicate names, match. The clean rerun resolves the historical report's 431-pass count: this exact current selection produces 433 passes on the unchanged accepted code as well. No baseline tests were suppressed or repaired.

| Existing failing suite | Failures |
|---|---:|
| `src/demo/application-startup.test.tsx` | 6 |
| `src/demo/workspace-demo.test.tsx` | 3 |
| `src/features/timer/timer.test.tsx` | 3 |
| `src/rendering/block-selection.test.tsx` | 1 |

The evidence JSON contains the full selection and failure names. This is the accepted selected regression suite, not every test in the repository.

### Real browser qualification

Chrome **155**, through the finite isolated CDP runner:

| Fixture | Passed checks | Evidence |
|---|---:|---|
| E1.1 retained Document sessions | 37 | Trusted text/tab clicks/Control-S, real editor identity, selections/scroll, hidden delivery/measurement, native receipt, minimize/restore, viewport resize and actual 125% Chrome zoom, guarded close and exact teardown. |
| D1 compatibility | 39 | Named-layout continuity with actual Flint, Thesis and Entity tools, undo/redo, source backlink/bookmark, modal blocking, pending Save retry/dirty protection and browser zoom. |
| C compatibility | 76 | Existing floating/tiling/shell-tab interactions, pointer/touch/key paths, focus, actual application/tool state and pending Entity receipt continuity. |

The E1.1 composition check dispatches composition boundary events; it is not a real operating-system IME session. The native Save transport is simulated, while client capture, shortcut routing, pending state and receipt handling are real. OS file-picker permissions, disk durability and server native-write integration are not newly claimed here.

## Reproduction

```sh
npm run typecheck
npx vitest run \
  src/application/document-sessions.test.tsx \
  src/runtime/document-counts.test.ts \
  src/application/flint-transient-proof.test.ts \
  src/rendering/cross-block-selection.test.tsx \
  src/rendering/range-rendering.test.tsx
node scripts/qualify-window-manager.mjs --e11
node scripts/qualify-window-manager.mjs --d1
node scripts/qualify-window-manager.mjs --c
git diff --check
```

For the regression run, pass the `regression.files` array from the evidence JSON to `vitest run`. The regression command is expected to exit nonzero for the established failures.

The browser runner owns and cleans up Vite, Chrome and its temporary profile. The clean baseline archive was removed in a `finally` block. Browser application fetches were blocked or answered in memory; regression filesystem tests use their own temporary fixtures. No production workspace, native Document or external account was modified.

## Architectural decisions, deviations and limits

1. **Lazy retention:** only visited Flint tabs allocate editing sessions. This meets session continuity without eagerly mounting every tab.
2. **Ink retained island:** direct managed-desktop Ink Documents keep the shared projection at first mount. No private-projection conversion or retroactive owner adoption is attempted. Other Ink occurrence paths remain outside this initial boundary.
3. **Independent rollout flag:** `retainedDocumentSessions` separates retention from the already accepted Window Manager. Both default on; disabling either preserves the legacy path.
4. **Stable binding only:** host identity/context remains bound to its original application. There are no reservations, leases for competing hosts, commit/rollback transactions or surface reparenting APIs. Those are E1.2 responsibilities.
5. **Selection safety:** existing input maps support the demonstrated hidden peer edit; arbitrary external structural edits still use conservative stale-bookmark handling.
6. **Resource cost:** retained visited tabs retain DOM and projections until close. No eviction policy or memory/latency benchmark was introduced. Media/iframe/native embedded-editor continuity across a future host move remains unqualified.
7. **Persistence:** existing formats remain sufficient for E1.1's unchanged host topology. Desktop 5 is not implemented or silently emulated.

The principal in-development issues found were stale asynchronous close focus, hidden-target window focus, cross-Block input ownership during tab changes, and unverified offsets after unmapped external edits. They were corrected and requalified. No additional failing regression remains beyond the independently reproduced baseline.

**E1.1 is complete for review. E1.2 and all later batches have not begun.**
