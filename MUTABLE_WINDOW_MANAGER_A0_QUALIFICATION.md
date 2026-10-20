# Mutable Window Manager — A0 qualification report

**Date:** 20 October 2026  
**Baseline:** `d0faa4c`  
**Scope:** approved A0 only, incorporating the user's four approval clarifications.

**Outcome:** A0 is implemented behind the default-enabled `mutableWindowManager` feature flag. The new A0 tests and finite Chrome qualification pass. The selected regression suite is **not entirely green**: 221 of 234 tests passed; all 13 failures also reproduce on the unchanged baseline. No additional failing case was found in this qualification. A1 and later milestones remain unimplemented.

## 1. Implemented changes

| Area | Implementation |
|---|---|
| Session ownership | [WorkspaceSession](src/application/workspace-session.ts) creates and disposes one [WorkspaceWindowManager](src/application/window-manager.ts), injecting it into its editor. Isolated editors and the disabled-flag path retain legacy behaviour |
| Registration and order | [WindowRegistry](src/runtime/window-manager.ts) registers actual window occurrences, assigns generation-scoped leases, maintains dense normal/pinned ordering and disposes dependent surface registrations. A single startup read seeds historical ordering; ordinary edits do not subscribe to or refresh that inventory |
| Shared rendering | [Window manager rendering](src/rendering/window-manager.tsx) and [styles](src/rendering/window-manager.css) put frames and owned Portal surfaces in stable owner groups. Historical z-index magnitudes cannot escape the desktop plane. Maximization changes geometry rather than granting a stacking privilege |
| Default desktop route | [Canonical workspace host](src/demo/workspace-demo.tsx) uses the managed rendering host even when Canvas is disabled. The disabled-manager/disabled-Canvas combination retains its original route |
| Launch and reveal | Thesis launch/source reveal, Flint launch, Phosphor launch, workspace resource creation/reveal and sticky creation/reopen call the coordinator. Icon restore raises through the same ordering path. Managed launches bypass local maximum-z scans and the Thesis floor workaround; the exclusive legacy path retains them |
| Application ownership | Surface descriptors include owner window/app instance, source projection, optional parent surface, kind and modality. Contributed Entity panels, annotation monitors, context menus, compact controls, Find, selection inspector and timers use owner-scoped leases. Ownerless sticky drafts use shell ownership within the bounded desktop plane |
| Other Portal content | Minimap and positioned-Block content use the owner's layer where a managed owner exists. Their geometry and editing implementations remain local |
| Existing app dialog | Flint storage retains its existing DOM, controls, save actions and focus handling. An ownership boundary registers it and places its frame above that owner's tools while the dialog is open; its child popovers can use the dialog layer |
| Activity facts | `mounted`, `visible` and `active` are separate runtime fields. `active` observes native focus; A0 does not request or restore focus, maintain MRU, or introduce a new text-input router |
| Compatibility | Existing JSON serializers, schema versions, resource authorities, manual Document/Workspace Save and document dirty tracking are unchanged. Raising a window does not commit repository metadata or create an undo step |

The flag is resolved at session construction through [configuration.ts](src/configuration.ts). Set `features.mutableWindowManager` to `false` before creating the session to select the legacy path. There is no live hot-toggle between managers.

## 2. Approval clarifications

1. **Future common tool chrome, docking and positioning:** shared surface ownership, parent references and rendering boundaries provide an extension point. Existing tools still own their chrome, drag/resize, positioning, fields and validation. No new docking controls, common chrome, placement engine or detachment affordance were added.
2. **Mounted, visible and active:** a retained view can eventually be mounted while hidden and inactive. A minimized icon is chrome, not proof that its editing view remains mounted. A0 records these distinctions without changing existing minimization/unmount behaviour or claiming state-preserving retention. Later adapters can observe visibility to suspend optional work without destroying their sessions.
3. **Acetate:** both planning documents now treat it as a distinct future application, potentially sharing Canvas infrastructure. No Canvas component, command or persisted identity was renamed to Acetate.
4. **JSON persistence:** no new file format, extension, schema, migration, automatic save or sidecar was introduced. Existing metadata remains the compatibility source for imported window geometry/order hints; runtime ordering is separate.

## 3. Checks performed

| Check | Result |
|---|---|
| `npm run typecheck` before implementation | Passed |
| `npm run typecheck` after implementation | Passed for reactive/client and server TypeScript projects |
| New A0 unit/integration suites | **9/9 passed**; rerun on the final focus-event integration |
| Selected regression suite | **221 passed, 13 failed**, 234 tests across 27 files; 23 files passed completely |
| Unchanged-baseline investigation | Ran the four failing suites from an isolated `git archive HEAD` extraction under Node 22.12.0 using the same installed dependencies. The set of 13 failing case names exactly matches the modified tree |
| Chrome qualification | **22/22 checks passed**, real rendered components and `elementFromPoint` hit-testing, Headless Chrome 155 at 1440 × 1000 |
| Patch hygiene | `git diff --check` passed |

The 9 new tests cover imported order versus mount order, normal/pinned ranking, frontmost no-op raises, distinct activity states, valid ownership, rejected parents, stale lease disposal, modal/shell metadata, Portal ownership, close cleanup, central resource launches, no metadata writes on raise, bounded typing work and the disabled-flag path.

The existing canonical workspace save test now also asserts that the default desktop has the managed layer host, that opening it does not save anything, and that explicit Save still produces `speedy-workspace` schema version 1 without runtime ownership fields.

### Selected regression command

```sh
npx vitest run \
  src/runtime/window-manager.test.ts \
  src/application/window-manager.test.tsx \
  src/rendering/window-icon.test.tsx \
  src/application/workspace-presentation-view.test.tsx \
  src/application/workspace-open.test.tsx \
  src/application/phosphor-integration.test.tsx \
  src/application/flint-lifecycle.test.tsx \
  src/features/thesis/view.test.tsx \
  src/features/compact-document/window.test.tsx \
  src/rendering/annotation-monitor.test.tsx \
  src/rendering/compact-toolbar.test.tsx \
  src/features/entity-references/search-view.test.tsx \
  src/features/entity-references/lifecycle.test.tsx \
  src/rendering/page-minimap.test.tsx \
  src/features/anchor-relationships/anchors.test.tsx \
  src/features/timer/timer.test.tsx \
  src/rendering/document-find.test.tsx \
  src/rendering/sticky-note.test.tsx \
  src/rendering/block-selection.test.tsx \
  src/demo/workspace-demo.test.tsx \
  src/demo/workspace-background.test.tsx \
  src/demo/public-hosted-version.test.tsx \
  src/demo/application-startup.test.tsx \
  src/application/workspace-session.test.ts \
  src/reactive-editor/workspace-manifest.test.ts \
  src/reactive-editor/local-workspace.test.ts \
  src/reactive-editor/workspace-presentation.test.ts
```

This was a selected regression run, not the entire repository test suite. No load tests, typing benchmarks, production builds, migrations or production-data exercises were run.

## 4. Browser qualification

Reproduce with:

```sh
node scripts/qualify-window-manager.mjs
```

The [runner](scripts/qualify-window-manager.mjs) creates its own loopback Vite server and temporary Chrome profile. It loads an isolated HTML page and the [browser fixture](src/application/window-manager.browser-fixture.tsx), with actual Flint, Thesis, Entity, system-bar and Document-dialog components. Entity creation is an in-memory service response. Backend requests are blocked; four background attempts were handled locally in the final run. No backend connection or persisted Entity is needed.

The 22 passing assertions establish:

1. Flint is actually maximized.
2. One real Flint `beforeinput` text edit commits.
3. That edit performs no window registration, order revision, owner lookup or repository snapshot.
4. The Entity Portal belongs to Flint's window group and source occurrence.
5. Its existing created-but-not-linked recovery branch remains mounted.
6. The real Entity tool is still present during the stacking assertion.
7. A normal Thesis window retains the canonical desktop coordinate origin.
8. Thesis and Entity genuinely overlap.
9. Hit-testing selects Thesis above maximized Flint and its Entity tool.
10. Opening Thesis leaves Flint maximized.
11. Raising Flint brings its tool group above Thesis.
12. Raising does not change repository revision or encoded workspace JSON.
13. Flint storage registers an application-owned dialog.
14. The storage dialog is above the existing Entity tool.
15. Closing storage releases only its own lease and retains the Entity tool.
16. Consecutive Thesis launches use central order.
17. A workspace dialog is above the normal window groups.
18. A pinned window remains above a newly launched normal window.
19. Real system chrome remains above an overlapping pinned window.
20. A workspace dialog remains above an overlapping pinned window.
21. Closing the owner removes its group and Entity Portal.
22. Owner close releases its surface ownership records.

The Entity recovery branch is intentional: an ordinary Entity lookup still has its existing repository-wide invalidation behaviour. A0 does not claim that ordinary lookup survives an unrelated Thesis launch; that domain/lifecycle correction belongs to A1. A disappearing tool was not accepted as a stacking success.

These are functional DOM and bounded-work checks, not user-visible latency measurements. They do not replace future Safari/Firefox, screen-reader, IME or full modality qualification.

## 5. Regressions and baseline failures

**No new failing case was detected in the selected qualification.** The following failures remain, all independently reproduced on `d0faa4c`:

| Suite | Failing cases | Observed baseline issue |
|---|---:|---|
| [application-startup.test.tsx](src/demo/application-startup.test.tsx) | 6 | Expected startup controls are absent/null; the test expecting Canvas without opt-in also fails |
| [workspace-demo.test.tsx](src/demo/workspace-demo.test.tsx) | 3 | Two tests expect a revision-only toolbar text value; another expects an older shortcut title |
| [timer.test.tsx](src/features/timer/timer.test.tsx) | 3 | One teardown test expects all mounts gone; two assume Timer is the only/first document action despite other registered features |
| [block-selection.test.tsx](src/rendering/block-selection.test.tsx) | 1 | Synthetic drag/drop data lacks the `files` member accessed by the existing drop handler; it also emits one uncaught TypeError |

Baseline case names:

- Startup: opening server Documents in an empty desktop; the corresponding canvas case; default Canvas exposure; saving/reopening initial workspace and Canvas layout; explicit application opt-out; explicit sample-demo link.
- Workspace demo: inactive document tabs/card faces; editing/reset; distinct workspace controls and safe chords.
- Timer: three independent instances/unmount; repeated editor teardown; enabled/disabled authored-data preservation.
- Block selection: drag/drop events and cross-parent list rejection.

These unrelated failures were not repaired or suppressed as part of A0.

Issues identified and addressed during implementation:

- The canonical desktop's Canvas-disabled branch initially bypassed the managed host. It now uses the managed host whenever A0 is enabled; the existing save test covers this route.
- Portal frames need an explicit origin, with the canonical desktop's existing 48px content offset retained. Sticky windows retain their viewport coordinate space.
- Minimap and positioned-Block Portal content require an owner layer too; otherwise decorations can escape a newly ordered frame.
- The Chrome harness initially fell through to the normal application entry point, displacing its fixture. The runner now serves its isolated page before Vite's HTML fallback and has no API proxy. This was a qualification-harness issue, not an application regression.

## 6. Architectural refinements and limits

| Planned concept | A0 realization / boundary |
|---|---|
| Pure model plus coordinator | The small registry co-locates transitions with a Solid reactive store; it has no DOM, repository, persistence or network dependency. The workspace coordinator and DOM adapters remain separate |
| Application scopes | A0 assigns a runtime app-scope identity per adopted window and preserves source projection/parent surface identities. It does not implement a separate local registry or multi-window application factory |
| Shared layers | Desktop groups and application surfaces share central ordering. Existing shell dialogs/system chrome keep their current rendering and focus implementations above the bounded desktop plane. A1 still owns comprehensive modal arbitration |
| Existing inline dialogs | Flint storage gets ownership/layer metadata without reparenting or rewriting its focus trap, dismissal or save workflow |
| View lifetime | Registration is coupled to actual frame lifetime. Mounted/visible/active facts are available, but retained editing hosts and suspension of app-specific services remain later work |
| Persistence | Runtime raises are not serialized into a new layout structure or written back into legacy metadata. Existing JSON Save paths remain intact. Restoring the last runtime activation order is not promised by A0 |
| Future tool unification | Common ownership and Portal boundaries can support shared chrome/placement/docking later. Tools retain their current UI and local positioning now |
| Canvas and Acetate | Canvas/Spatial geometry hosts are excluded from desktop window adoption. Acetate remains a distinct future app identity |

There is no new MRU selector, central focus-return algorithm, asynchronous close protocol, Entity singleton/revision rewrite, automatic document save, dirty-document scan, shell tiling, dock layout, promotion, crash journal or workspace schema.

## 7. Cleanup and review boundary

The browser runner closes its Chrome process and Vite server and deletes its temporary profile in `finally`. The isolated baseline source extraction, symlink and logs were removed after comparison; shared dependencies were preserved. Qualification creates no saved Documents, Entities, vaults or database fixtures.

The [architecture plan](MUTABLE_WINDOW_MANAGER_PLAN.md) and [application-surface design](MUTABLE_WINDOW_MANAGER_APPLICATION_SURFACES.md) now record A0 approval and the user's clarifications. **A1 and all later milestones still require separate approval.**
