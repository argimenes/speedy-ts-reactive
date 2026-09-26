# Adding a Block type

For the complete Stage 5 tutorial, exact `BlockRuntime` inventory and a working Counter module, use [Creating a New Block Type / Block Application](CREATING_BLOCK_TYPES.md). This page remains a shorter checklist.

Start with the [Timer module](../../src/features/timer/index.tsx) and the
[copyable hosted Block example](MINIMAL_EXTENSION_EXAMPLES.md#minimal-hosted-block-module).
The implemented boundary is [`src/feature-api`](../../src/feature-api/index.ts).
No `AbstractBlock` subclass or general editor context is needed.

## 1. Define authored state and its interpretation

Keep a JSON DTO factory and narrow payload reader inside the feature, as Timer does
in [model.ts](../../src/features/timer/model.ts). Include a stable authored `id` and
`type`. The serialized Block is the application's authored state; its registered
type supplies executable behavior. Unknown fields and children must survive normal
load/save when the module is absent.

Separate three kinds of state:

* Authored: duration, deadline, explicit settings and geometry; persisted through core commands.
* Runtime: interval/audio handles, input drafts, drag previews and mounted resources; one set per occurrence.
* Derived: displayed time or effective size computed from authored state and runtime conditions.

A clock tick or drag preview should not create a document edit. Commit the authored
result when the user completes an action.

## 2. Implement a self-bound view

A hosted component accepts `{ runtime: BlockRuntime }`, not `ReactiveEditor` or a
projection. Read `runtime.field(name)` inside reactive expressions and use
`runtime.setField(name, value, label)` for authored edits. Reads are detached values:
mutating them has no effect, and storing one outside reactive computation will not
make that copy update.

Use `runtime.mountWidget(element)` in `onMount` for the instance's own opaque-widget
surface. It registers cleanup automatically. Use `runtime.own(disposer)` for its
interval, subscription or other external resource, including resources acquired
later in a local event handler. Local Solid effects already belong to the component
owner. `removeAndFocusFallback()` explicitly deletes this Block; unmount alone does
not delete document state.

A type can run many instances. Closing A must not stop B or C; editor disposal must
stop them all. Shared authored content can have distinct mounted occurrences, so
never use the feature module itself as the singleton owner of a Block's interval.

The current runtime supplies only Timer's demonstrated widget needs. It does not
expose child traversal, editable text/selection adapters, relation operations or
arbitrary overlay APIs. Discuss a concrete missing capability before extending
this boundary; do not recover unrestricted editor access from context.

## 3. Register the Block application and its actions

Inside `CodexFeature.activate(scope)`, obtain injected capabilities and call:

* `register.block({ type, aliases?, capabilities, create, view })`;
* `register.command(...)` for shared semantic actions;
* `register.binding(...)` only when a shortcut is needed;
* `register.action(...)` for `document-actions` or `add-block-menu` contributions.

The facade attaches the feature owner and tracks registration disposers. Type/alias,
command, binding and UI ID collisions fail rather than silently replacing another
owner. Capability strings describe existing behavior; they do not automatically
implement it. `create()` returns authored defaults, not runtime resources.

The creation controller can query a read-only Block summary, obtain origin bounds,
insert its registered type and defer focus with `FeatureBlocks`. Instance views get
the narrower runtime bound to their own occurrence. Use existing command dispatch
rather than adding a feature-specific input-gateway case or document listener.

## 4. Activate through application composition

Import the factory in [`src/application/features.ts`](../../src/application/features.ts),
where configuration decides whether to activate it. The dependency direction is
`feature -> public core API`; only application composition imports the feature's
implementation. New substantial features default off unless the user specifies
otherwise. Timer stays on because Stage 1 preserves its existing availability.

Call `registerApplicationViews(editor)` once for each new application editor.
Runtime hot activation is not supported; rebuild/reload the editor to change its
configuration. `registerCoreViews` remains legacy/core assembly and deliberately
omits optional Timer registration. Do not add a new hosted feature there.

Legacy/core components still receive `BlockViewProps` and use `useReactiveView`,
`ChildBlocks`, `RelationBlocks` and direct mount adapters. Those are internal paths
for unmigrated/fundamental views, not the public hosted-Block recipe.

## 5. Verify lifecycle and portability proportionately

Use [Timer's tests](../../src/features/timer/timer.test.tsx) and the
[feature-independent unknown-data test](../../src/rendering/unknown-feature.test.tsx):

* Check visible behavior, authored edits and undo/reopen.
* Check separate instances, removal/unmount and repeated editor disposal.
* Check ownership, failed activation rollback and duplicate registrations where changed.
* Round-trip authored data with the module enabled and disabled; fallback rendering is acceptable.
* In a temporary copy, remove its implementation and application activation; core should compile and unrelated documents should work.

Generic JSON payload changes normally need neither a serializer nor a history
adapter. A new owned slot, inline representation or external resource boundary is
a separate structural change requiring codec/identity/history review. Keep known
wire-format preservation independent of optional module activation.

Run focused suites, typecheck and relevant builds. Broaden browser/performance
qualification only when the changed boundary warrants it. See the
[Stage 1 report](../../CODEX_FEATURE_MODULE_STAGE_1_REPORT.md) for the Timer removal
experiment and the pre-existing History-disabled save limitation.
