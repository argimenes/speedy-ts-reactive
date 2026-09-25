# Feature modules: Stage 0 / Stage 1 implementation report

25 September 2026 · implementation baseline `7602c66` · **stopped for review before Stage 2**

This implements the approved Timer pilot under [the architecture review](CODEX_FEATURE_MODULE_ARCHITECTURE_REVIEW.md), including the subsequent clarification that a Block Type supplies a hosted application's executable interpretation. It does not extract Grouping or change selection gesture ownership.

## 1. Baseline and scope

Before extraction, Timer was always available through central view registration, the document toolbar, Add Block, and `Ctrl+;` then `T` in both ordinary and cross-text input. Creation preserves the originating text; the old binding description incorrectly said empty text was replaced. Toolbar/keyboard creation positions the floating Timer beside the origin. Context-menu insertion uses its existing default position. Start/pause/resume/reset/duration/drag/resize/removal mutate authored state through core commands; clock ticks only update local display state.

Those behaviors, existing command/binding IDs and other feature defaults are preserved. The new `timer` configuration field defaults to `true`, retaining an existing capability. Application composition alone decides activation; `{ features: { timer: false } }` disables it at startup. Hot loading/unloading is not offered.

The future public boundaries were identified without moving their implementations:

| Boundary needed later | Existing implementation / constraint |
| --- | --- |
| Block identity and queries | `types.ts`, editor node/placement queries, projection; authored IDs, shared content, placements and view occurrences remain distinct. Stage 1 exposes only the small creation queries Timer needs. |
| Range snapshots / validation | `SearchRange`, logical/native/cross selection, validation currently in Grouping; half-open cell ranges versus inclusive standoff endpoints. No new range API introduced. |
| Annotation application | Existing helper in Grouping and cross-selection caller; remains unchanged pending Stage 2. |
| Transactions / undo | `TreeCommands` and canonical repository; synchronous validated mutations remain authoritative. Timer uses existing single-operation edits, so no speculative public transaction service was added. |
| Input / focus | Existing binding dispatch, mounts and focus service. Timer callbacks become registered commands; no generic event middleware or selection arbitration was added. |

Grouping's Ctrl eligibility, Escape reveal-and-clear, static highlights, Show/Hide membership, and operation-only deletion are unchanged. Find/Entity highlights remain separate. Existing compact/system-bar defaults and the Vercel-specific arrangement are untouched.

## 2. Resulting module and Block contracts

[FeatureHost](src/runtime/features.ts) owns a per-editor list of `CodexFeature { id, activate(scope) }` instances. Activation runs inside a Solid root. `FeatureScope` provides owner identity, active lifetime, tracked/idempotent disposers and cancellable deferred work. Failed activation rolls back acquired registrations. Editor disposal disposes its modules. There is no loader, dependency resolver or service locator.

Commands, Block registrations and bindings carry owner IDs. Their registration APIs return idempotent disposers; duplicate IDs are rejected. Block aliases are checked atomically against both aliases and type names. An old disposer cannot remove a replacement registration. UI contributions similarly expose ownership and reject duplicate IDs.

[The public boundary](src/feature-api/index.ts) separates three concepts:

* **Module:** registers types, commands, bindings and UI once per editor.
* **Block application definition:** stable type, optional aliases, capabilities, authored default factory and a view receiving a Block runtime. Timer owns payload interpretation in its model; there is no serializer/schema plugin system.
* **Mounted Block occurrence:** receives a fresh `BlockRuntime`, with its own existing Solid owner and cleanup. Registration does not instantiate an interval or a running application.

The core registry retains compatibility with legacy component registrations and now optionally records an authored default factory. The public hosted-Block adapter supplies the runtime when a view actually mounts. This is a small adapter over the existing Block outlet and Solid ownership, not another lifecycle framework.

## 3. Capabilities Timer receives

The module's creation policy receives only read-only Block summaries, origin bounds, insertion of its registered Block type, deferred placement focus, and owner-bound registration functions. It cannot access an editor, repository, arbitrary mount or DOM root.

Each Timer view receives a **self-bound** runtime:

* `nodeKey`: this mounted occurrence's identity.
* `field(name)`: detached, reactive reads of this Block's authored fields.
* `setField(name, value, label)`: validated core mutation of this Block.
* `removeAndFocusFallback()`: removal with the existing focus behavior.
* `mountWidget(element)`: register this widget's own element as an opaque input surface.
* `own(disposer)`: attach resources to this instance's Solid owner, including resources acquired later in an event handler.

Instance methods do not accept another Block's key. Mutations and mounts reject disposed instances or types not owned by the module. These are internal correctness boundaries for trusted code, not a security sandbox. The existing floating-window resize helper is exported as an editor-independent widget primitive.

Timer distinguishes:

| Authored, serialized | Instance-local, not serialized | Derived |
| --- | --- | --- |
| Duration, mode, deadline/paused remainder, size/position | Interval/audio handles, duration draft, messages, drag/resize preview, mount/focus resources | Remaining display time, Done state, effective dimensions |

Unmounting A releases A's resources without affecting B/C. Unmounting a view does not remove authored data. Removing a Block is a separate explicit canonical edit. Closing the editor releases all occurrences and then their module registrations. Multiple views of shared content can share authored state while owning separate occurrence resources; this follows the existing node/placement model, not a new global Timer state store.

A richer Block can later receive an additional explicit runtime capability at this adapter boundary. Child rendering, relationships, scoped instance commands and overlays have not been added speculatively.

## 4. Dependency direction and composition

[Application composition](src/application/features.ts) is the only production source importing `features/timer`. It activates Timer according to configuration after legacy view registration. Application entry points now use that composition function.

[Timer](src/features/timer/index.tsx) owns its model, view, CSS, authored defaults, commands, both binding registrations, document-toolbar and Add Block contributions, and instance resources. Its production code imports only the public feature API, its own files and Solid.

The two contribution slots are deliberately limited to `document-actions` and `add-block-menu`; existing toolbar/menu renderers consume them. Timer does not need a new system-menu, panel, overlay or effect registry.

There are no Timer implementation imports or Timer-specific cases left in the editor, input handlers, rendering assembly or context-menu builder. The configuration key and compatibility fixtures still contain its name, as expected.

## 5. Transitional adapters and review differences

* `registerCoreViews` remains the temporary legacy assembly for unmigrated features. Existing legacy tests can use it alone; real application entry points use `registerApplicationViews`.
* [feature-capabilities.tsx](src/application/feature-capabilities.tsx) captures current editor internals privately and implements narrow creation/instance ports. It can delegate to extracted public primitives as later stages justify them; the editor is never exposed to a feature.
* Cross-text input also had a direct Timer callback. Its replacement forwards an already matched scoped binding to the existing command registry, matching ordinary gateway dispatch. No Grouping condition, selection mechanics or capture order changed. This small compatibility bridge was necessary to remove Timer; it is not Stage 2 input participation.
* The course correction adds explicit authored defaults and an occurrence-bound runtime to the Block registration boundary. Component resources continue to use Solid cleanup. Module and Block lifetimes are intentionally distinct.
* Default-trigger conflict arbitration was not expanded. Existing binding IDs/scopes and preference handling remain in place; ownership and duplicate-ID checks were sufficient for this pilot.

These adapters are not a second command or persistence system. Legacy assembly should shrink during the review's later extraction stages; the Block runtime boundary should remain even after its internal adapters become simpler.

## 6. Preservation fixtures and the History issue

[The feature-independent wire fixture](src/block-tree/test-support/unknown-feature-document.ts) includes a Timer's duration/mode/remainder, geometry, nested unknown fields, child content, opaque relation data and unknown Block/standoff properties. It deliberately does not import Timer. Tests round-trip it with Timer active, configured off, and physically absent; the absent type uses the existing fallback, including its child content. No codec changes were needed.

**Confirmed pre-existing History-disabled save defect, deferred:** a temporary characterization test loaded a valid `codex-history-document` with an existing memoir ID, disabled History, and captured `PersistenceService.saveDocument`'s outgoing request. On both untouched baseline `7602c66` and this implementation, it saved ordinary Block JSON without `format`, `memoirId` or history proof; authored text remained intact. `BlockHistorySession.savePersistent` returns early when disabled and persistence falls back to ordinary encoding.

Inspection of `server/document-store.ts` confirms that its ordinary-save branch publishes without comparing the destination's prior format. Consequently, overwriting an enrolled file can drop its portable envelope/association. The probe used a mocked HTTP response; it did not overwrite a user's file or demonstrate archive deletion. This is narrower than claiming the archive itself is lost.

No History behavior was changed. The temporary probe was removed after running on both versions rather than retaining a test that enshrines the defect. Before Stage 6, separately review always-available envelope/identity preservation and destination downgrade protection. Stage 1's generic Timer storage does not use this path differently.

## 7. Qualification

* **100 tests passed across 12 focused suites:** Timer, lifecycle/registry ownership, runtime adapter, absent-feature rendering/preservation, bindings, document toolbar, cross-Block selection, Workspace, legacy codec fixtures, Block-tree operations, persistence and History persistence.
* **Typecheck passed** for reactive/client and server projects.
* **Client and server builds passed**, including the history worker. Vite still reports bundle-size advisories.
* **Three pre-existing failures:** `block-context-menu.test.tsx` has three Control-click/context-menu failures and four passing tests. The same three fail in an untouched checkout of baseline `7602c66`. They were not repaired as part of this Timer extraction.
* `git diff --check` passed. Qualification used existing jsdom suites and build tooling; no real-browser matrix or typing benchmark was introduced for this registration/lifecycle change.

The new lifecycle checks include partial activation rollback, duplicate owners/aliases, idempotent disposal, detached reactive field reads, cancelled deferred focus, repeated editor creation/destruction, and three simultaneous Timer applications. Removing Timer A stops only A's interval/audio/mount; B/C keep displaying advancing time. Ticks leave the canonical revision unchanged. Editor teardown leaves no Timer intervals, audio resources, mounts, registrations or UI contributions.

## 8. Physical Timer removal experiment

Performed in a separate copy of the working source, leaving the reviewable implementation intact:

1. Omitted the entire `src/features/timer/` directory, including its tests and stylesheet.
2. Removed Timer's import and activation from application composition.
3. Kept the rest of core/application unchanged, including the generic compatibility fixture.
4. Ran both typechecks and both builds successfully.
5. Ran **16 tests in five suites**, all passing: absent-feature preservation/rendering/editing, runtime adapter, feature lifecycle, existing document fixtures and Workspace behavior.

This exercised ordinary document rendering/editing/undo and preservation of unknown Timer data with the implementation physically unavailable. No Timer command, binding, menu/tool or running instance was created. Resource teardown with the module present was verified separately in the repeated-editor and three-instance tests above. **The removal criterion passed.**

## 9. Lessons for Stage 2

The pilot exposed one adapter pitfall: unwrapping a nested Solid payload before copying it loses reactive dependencies. Field reads now traverse only the requested field through its proxy and return detached values. The public read contract must preserve both reactivity and isolation.

Continue to distinguish module lifetime, mounted occurrence lifetime and authored content lifetime. Grouping is an editor operation, not a Block application; it should not be forced into the new Block runtime contract.

Existing scoped command dispatch can support feature commands without new input interception. This does **not** establish safe gesture arbitration for Grouping: its Ctrl-through-selection policy, native/cross geometry, IME and modal ownership still require the separately approved Stage 2 work. Likewise, Timer's limited edit port is not a reason to pre-emptively publish range/annotation/transaction services.

No change to the proposed migration order is necessary. Retain the small adapters and use the pilot's lifecycle/read-boundary lessons when reviewing Stage 2. **No Stage 2 implementation has begun.**
