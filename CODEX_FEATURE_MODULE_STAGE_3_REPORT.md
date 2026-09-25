# Feature modules: Stage 3 implementation report

25 September 2026 · accepted Stage 2 baseline `075b3b8` · **Stage 3 implemented; stopped for review before Stage 4**.

The baseline remains committed and was preserved in a separate detached checkout. This stage extracts existing Grouping behavior. The new composition flag `features.grouping` defaults to true to preserve that behavior; false omits activation. Timer and the hosted Block Application architecture are unchanged.

## 1. Resulting module

[`src/features/grouping/`](src/features/grouping/index.tsx) contains:

* `index.tsx`: feature factory, activation, owned commands and toolbar contribution.
* `controller.ts`: transient ranges, eligibility/accumulation policy, Ctrl-click removal, annotation policy, cancellation, deletion requests, messages and owned highlights.
* Policy, lifetime, existing range-behavior and toolbar integration tests. The two implementation-dependent suites moved here from runtime/rendering, so removing the feature also removes its own tests.

There is no remaining `runtime/group-selection.ts` and no `ReactiveEditor.groupSelection` property. The factory retains a module-local controller inspection handle for tests; core does not use it.

## 2. Injected capabilities

[`TextOperationCapabilities`](src/feature-api/text-operation.ts) is an explicit compile-time contract, wired by [`text-operation-capabilities.tsx`](src/application/text-operation-capabilities.tsx):

| Capability | Purpose / authority |
| --- | --- |
| Versioned ranges | Snapshot and validate existing cell ranges. |
| Structural queries | Detached text identity/view/length, containment and document scope. No Block payload or mutable projection. |
| Annotation application | Apply ordinary annotations through the Stage 2 validated service and receive references. |
| Range deletion | Delete supplied validated ranges atomically and return the first document caret. No arbitrary command/repository access. |
| Selection completion | Consume the completed native/logical/cross selection and restore its head; restore a deletion caret; cancel a gesture. No DOM lookup. |
| Visibility | Existing narrow Stage 2 retained-selection Show/Hide port. |
| Decorations | Set or clear only this activation's owner-bound layer. No access to other layers as mutation targets. |
| Registration | Owner-bound gesture, operation, before-change notification, commands and the existing toolbar surfaces. All releases belong to the feature scope. |

## 3. Appropriate core dependencies

Production Grouping source imports only `../../feature-api`, its own controller and Solid. Core retains identity, coordinate validation, native/logical/cross geometry, pointer capture, focus restoration, transactions and authored annotation storage.

The one missing mutation capability was [`deleteTextRanges`](src/runtime/range-edits.ts). It moves the existing validated merge/order/delete algorithm behind a narrow core port: validate the entire batch, merge shared-content overlaps, order structural occurrences, remove ranges in reverse order inside one transaction, and return the first caret. `BlockQueries.documentOrder` now owns the structural traversal previously embedded in Grouping. Tests cover stale batches, shared aliases, overlap, atomic undo and rollback on a failed write.

No general transaction executor, arbitrary payload setter, event middleware, service locator or replacement selection engine was exposed to Grouping.

## 4. Removal of private editor access

The controller has no editor, repository, mounts, projections, DOM root, `document` or `window` access. Its former native-selection clearing and caret work is a small application adapter over existing selection/focus services. Small-fake policy tests run accumulation, cancellation and stale-deletion behavior without constructing an editor or manipulating DOM.

Source inspection finds no Grouping implementation import or Grouping-specific branch in core input, cross-Block selection/input, ordinary annotation application, toolbar implementation or renderer implementation. Application composition is the sole production importer of the module. The configuration name remains intentionally. Unrelated History timeline grouping is unchanged.

## 5. Commands, bindings, UI and decorations

The module owns `grouping.cancel` and `grouping.delete`, with scoped availability and the same controller policy as the current-operation callbacks. These commands expose existing actions; they do not add shortcuts or visible buttons.

The existing **semantic bindings** remain the Stage 2 policy/operation registrations: Control selection, Ctrl-click, Escape and Delete/Backspace. Those behaviors did not have separate remappable BindingRegistry entries at baseline. Adding duplicate key bindings would compete with the accepted priority/repeat protocol, so no competing listeners or BindingRegistry shortcuts were added. Grouping owns the registered behavior; core retains event mechanics.

`FeatureActions` gained one bounded toolbar contribution: a reactive notice, content for existing Selection details, and descriptions for existing annotation tools. The module supplies the retained count/help, Show/Hide selection hint and all Grouping messages. The toolbar just renders contributions. Entity-reference rejection for a manual operation moved from the toolbar into Grouping's annotation policy.

The decoration type remains `editor/group-selection`; its transient owner is now the module owner `grouping`. This ownership token is not authored/serialized state. The existing decoration renderer is unchanged, and visible Find/Entity ranges are never queried to obtain deletion authority.

## 6. Show/Hide interaction

Grouping consumes `SelectionVisibility`; it does not import ShowHideProjection. Show/Hide does not import Grouping. Ordinary annotation application still returns references, and the existing projection response retains them. Escape/disposal reveals and forgets current retained membership without altering authored text or properties. A later operation cannot inherit a cleared group's membership.

Authored `style/show-hide` storage, conceal/reveal rendering, document toggle behavior and ordinary annotation application stay in their existing implementations. All remain functional with Grouping configured off or physically absent. Without the optional operation provider, retained visibility does not itself grant grouped deletion authority.

## 7. Composition, lifetime and unchanged input model

Application composition activates Grouping alongside Timer after core view registration. A bare `ReactiveEditor` plus core views now has no implicit Grouping behavior. All normal application entry points already use application composition.

Activation runs in the Stage 1 FeatureHost/Solid scope. Registration disposers, the before-change subscription, controller cleanup, toolbar content and the owner-bound decoration layer belong to that scope. Failed activation rolls back acquired resources. Repeated/idempotent disposal removes commands/providers/policy/UI/subscriptions, clears highlights and invalidates pending pointer completion. Grouping uses no Block type, `BlockRuntime`, per-Block instance or interval.

**The Stage 2 input implementation is unchanged.** Single policy ownership, normalized snapshots, modifier continuity, generation cancellation, pointer IDs, capture release, scoped native/modal/composition exclusions, microtask completion and deletion repeat protection are retained. Ordinary typing still bypasses gesture dispatch; the before-change callback only tests whether its operation is active, as before.

## 8. Physical removal experiment — passed

In a separate checkout based on `075b3b8`, copied the completed candidate source, then:

1. Deleted the entire `src/features/grouping/` implementation and its feature-specific tests.
2. Removed only its application import/activation and the unused adapter import from application assembly.
3. Retained the rest of candidate Codex, including the configuration field, neutral capabilities, Show/Hide and Timer.
4. Passed both typechecks and both builds, including the history worker.
5. Passed **96 tests in 12 suites**: ordinary local/cross editing and selection, annotation application, validated range edits, standoff/Show-Hide rendering, Find UI, Entity listing/search, annotation monitor, bindings, compact toolbar and Timer.
6. Passed the existing real Chrome typing/editing workload against the physically removed checkout: insertion, Backspace, Enter/split, caret focus, undo/redo and boundary edits. Text restored, unrelated cells remained stable, and typing/split took zero whole-document snapshots.

The browser removal run used application composition with the normal configuration, so this was not merely a disabled-flag test. Both the feature directory and former core controller file were absent. **Removing Grouping removes Grouping behavior, not ordinary editing functionality.**

## 9. Tests and browser qualification

* **185 tests passed across 22 focused suites** in the main checkout, including Grouping policy/lifetime/toolbar, input ownership/targets, cross-Block editing, annotation/Show-Hide rendering, Find/Entity, bindings, Timer and Stage 1 runtime capability checks.
* Client/reactive and server **typechecks passed**. Client/server builds including the worker passed. The existing bundle-size advisory remains. `git diff --check` passed.
* The retained Stage 2 browser harness passed the same **17 assertions on Stage 2 and Stage 3**, using Chrome 153 on macOS. It now observes the neutral current-operation API and uses application composition. Assertions cover native/local/cross selection, held/early-released Control, keyboard completion, Ctrl-click, Escape, retained Show/Hide, native fields, modal ownership, grouped deletion repeat/undo and IME deletion exclusion.
* **IME limitation preserved:** after the CDP composition/Backspace/empty-cancellation sequence, the mounted handle remains `composing: true` on both versions. Grouped deletion is excluded, but successful native IME cancellation/recovery and all OS IMEs are not established. No broader support is claimed or input-engine fix attempted here.
* **Existing context-menu failures:** the separate core-only context-menu suite has two failures on the candidate; both also fail on Stage 2. Stage 2 has a third Control-click failure that passes in the candidate's core-only fixture because it no longer implicitly activates Grouping. This is not a repair of the two remaining context-menu issues. Composed Grouping Ctrl-click behavior remains covered by its tests and browser qualification.

The browser harness also now completes its CDP socket close handshake before killing its isolated Chrome process, avoiding an intermittent runner shutdown hang. This does not alter measured editor work.

## 10. Typing performance

Measurements use Node 22.12.0, separate Vite caches and temporary Chrome profiles. No test/build jobs ran alongside the timing runs. The existing browser benchmark now uses application composition on **both** revisions, ensuring Grouping is active when measuring the changed ownership. Its 25,000-character, 250-paragraph fixture and forty timed insert/delete edits are unchanged. Baseline/candidate runs alternated three times.

| Browser metric (ms) | Stage 2 runs 1 / 2 / 3 | Stage 3 runs 1 / 2 / 3 |
| --- | --- | --- |
| Median | 2.6 / 3.1 / 1.9 | 1.5 / 2.2 / 2.7 |
| Mean | 3.332 / 4.025 / 2.495 | 2.243 / 2.753 / 3.320 |
| p95 | 5.3 / 5.5 / 3.0 | 3.1 / 3.3 / 5.0 |

All six runs passed restoration, stable unrelated DOM, zero-snapshot and real keyboard/undo/split assertions. Stage 3 is faster in two pairs and slower in one; the variation does not establish a speedup or repeatable regression.

The existing in-memory benchmark also ran on both revisions, restricted to the representative 25,000-character/100-character-paragraph fixture while retaining all three capture modes, all edit/undo/split categories, five warmup cycles and twenty measured cycles:

| Typing median (ms) | Stage 2 | Stage 3 |
| --- | ---: | ---: |
| History capture off | 0.549 | 0.546 |
| Full capture | 0.617 | 0.768 |
| Compact capture | 0.549 | 0.586 |

The full-capture outlier received a focused repeat in reversed execution order: **0.641 ms Stage 2 / 0.632 ms Stage 3** (p95 0.813 / 0.822). The initial increase did not repeat. These lower-level workloads exercise unchanged command/repository/projection code; browser runs cover the extracted ownership path. All in-memory result rows recorded zero snapshots.

**No unexplained repeatable typing regression was found in these representative workloads.** No larger benchmark program or broad browser matrix was introduced. Measurements and qualification observations are in [the evidence artifact](CODEX_FEATURE_MODULE_STAGE_3_QUALIFICATION.json).

## 11. Remaining adapters

`text-operation-capabilities.tsx` captures editor internals privately to assemble the actual range/query/annotation/visibility capabilities, owner-bound registrations and selection completion/focus actions. This is explicit composition wiring, not an editor-shaped object returned to the feature. Selection restoration may eventually move wholly into an existing core selection service if another real caller needs it; no such refactor was required here.

ShowHideProjection remains the legacy implementation behind the Stage 2 port. Legacy core view registration still assembles unmigrated features. There is no transitional Grouping property, compatibility shim, toolbar branch or renderer hook left in core.

## 12. Lessons for Stage 4

Consume narrow semantic capabilities before adding registries. Grouping required validated deletion and the existing toolbar's concrete surfaces, not a panel/effect framework. Keep mutation authority distinct from decorations, and keep gesture ownership separate from the current operation. Test physical removal and activation failure, not just configured-off behavior.

Module lifetime and Block application lifetime remain different. The owner-scoped presentation pattern can inform later work, but it does not authorize or implement renderer providers, Entity Reference extraction, Compact Mode extraction or History extraction.

**Stop for review. Stage 4 has not begun.**
