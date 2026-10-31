# Command Bar Architecture Investigation

30 October 2026 · Research only · Repository HEAD `93959fd`, with the current working tree inspected.

“Command Bar” means the window opened by typing a slash-command in the editor. “Web OS” means Mutable itself, including its desktop, windows, documents and tools. The investigation includes launching without text-editor focus, both from Block handles and from the desktop. No application code, bindings, interfaces or implementation plan are introduced by this report. Existing uncommitted checkbox work is outside this investigation.

**Clarified example:** in `[3 selected Blocks] | table 3 | surface`, the intended final stage wraps **each original Block**, inside its resulting table cell. It does not wrap the table as a whole. The syntax and pipeline design remain exploratory.

## 1. Executive summary

Mutable already has most of the foundations for a Command Bar that accepts selected Blocks:

- A shared, occurrence-aware `BlockSelectionService`, independent of native text selection and DOM focus.
- A command registry with availability checks, generic arguments and asynchronous handlers.
- Reusable tree commands, table operations and surface/container services, plus canonical Undo/Redo and persistence capture.
- An existing **“Table command…” field** that captures selected Blocks and executes table commands without inserting command text into a Document.
- Scoped, remappable bindings and managed-window/overlay infrastructure that can support invocation outside an editor.

The current slash window is nevertheless **text-source dependent**. It requires a mounted Standoff TextBlock, an inline range and an inline revision. Its catalogue is curated rather than a general view of the command registry. Selecting Block handles and pressing `/` does not invoke it. There is no desktop Command Bar entry point either.

**Desktop invocation is architecturally feasible.** Receiving a key does not require a TextBlock: Mutable already listens for keys at document level. The missing pieces are an invocation route and a session/presentation that can operate without a text bookmark. This is an architectural conclusion from the current code and browser event model, not a newly implemented or browser-qualified interaction.

**There is no general command pipeline.** The registry has no typed result contract; the slash-command host does not await command execution; LER retains a prepared Entity but does not implement composition. The `|` key is explicitly reserved there. A pipeline cannot safely be obtained merely by parsing `|` and calling existing UI handlers in sequence.

**Recommended direction:** combine explicit invocation input (option B) with reuse of the registry, selection service and managed UI (option D). Capture selected Block identities once when applicable; otherwise open with an explicit application/workspace context. Keep existing inline invocation as a separate supported origin. This supports the application-wide direction without requiring a universal typed-value/pipeline framework now.

Shift–Command–/ should remain a candidate, not a promised universal default: on common US keyboards it corresponds to Command–?, which conflicts with the macOS Help shortcut. See §6.2 and the [Apple shortcut reference](https://support.apple.com/en-us/102650).

## 2. Current architecture

### 2.1 Command Bar and command definitions

| Component | Current responsibility |
| --- | --- |
| [`features/autocomplete/model.ts`](../../src/features/autocomplete/model.ts) | Recognizes bounded inline invocations, defines completion kinds/candidates, ranks results. `/` selects `kind: 'command'`. |
| [`features/autocomplete/index.tsx`](../../src/features/autocomplete/index.tsx), `createAutocompleteFeature` | Owns source capture, validity checks, catalogue assembly, command dispatch, input arbitration and overlay lifecycle. |
| [`features/autocomplete/session.ts`](../../src/features/autocomplete/session.ts), `CompletionSession` | Query/selection/pending/error state, candidate refresh, source validation, choosing and disposal. |
| [`features/autocomplete/view.tsx`](../../src/features/autocomplete/view.tsx), `CompletionPopup` | The visible window. Its current labels include “Autocomplete workstation” and “Scry · command”. Shares presentation with Entity/Document lookup. |
| [`block-tree/registry.ts`](../../src/block-tree/registry.ts), `CommandRegistry` | Named semantic actions, owner/disposer tracking, duplicate-ID rejection, `list`, `canExecute`, `execute`. |
| [`input/bindings.ts`](../../src/input/bindings.ts), `BindingRegistry` | Event-to-action mappings, explicit scopes, remapping, conflict checks and chords. Separate from semantic command definitions. |
| [`runtime/overlays.ts`](../../src/runtime/overlays.ts), `OverlayService` | Session-only panels, owner and return-focus state, optional retained editor focus, dismissal guards. |
| [`application/window-lifecycle.ts`](../../src/application/window-lifecycle.ts) | Application/window focus ownership, modal restrictions, activation leases and command permission hook. |

The existing registry interfaces are:

```ts
// src/block-tree/types.ts
export interface CommandContext<TArgs = unknown> {
  targetKey: NodeKey;
  args: TArgs;
}

export interface CommandDefinition<TArgs = unknown> {
  id: string;
  label: string;
  canExecute(context: CommandContext<TArgs>): boolean;
  execute(context: CommandContext<TArgs>): void | Promise<void>;
}
```

This is already an execution context, but it carries one target key and command-specific arguments. It has no standard selection, origin, result, cancellation token, argument schema or effect classification. Several feature-facing registration ports currently expose `CommandDefinition<void>`, even though the underlying registry accepts generic arguments. Feature registrations are owned and disposed through [`application/feature-capabilities.tsx`](../../src/application/feature-capabilities.tsx).

A different existing type, `CommandDescriptor` in [`block-tree/commit-capture.ts`](../../src/block-tree/commit-capture.ts), records the command ID and affected content/placement/Block identities for canonical history. Some descriptors describe split/join/copy/replace input-output relationships. These are **commit provenance**, not a parser schema or values returned to the Command Bar.

**Discovery and arguments.** The slash host does not enumerate `CommandRegistry.list()`. It assembles table candidates, surface/container actions, `entity`, `link`, `backlinks`, `proposition` and `date`. Some actions dispatch through the registry; others are special branches. Registered workspace actions, such as `workspace.presentation.desktop`, and application actions such as `flint.open` demonstrate existing non-text command capabilities, but they are not automatically exposed by this catalogue.

Table syntax has a small exact-alias parser: `/c`, `/c2`, `/c3`, `/c4`, `/row`, `/col`, `/unc`, `mc r`, `move-cell right`, and related direction aliases. It normalizes case/spaces and rejects queries over 64 characters. Invalid arguments such as `c2 extra` are not accepted. `/table 3` and `/surface` are **not existing commands with the proposed meanings**; current surface names include `reverse create` and `reverse flip`. Other catalogue entries use name substring matching rather than a general argument grammar. Entity `phrase : query` punctuation is explicitly kept out of command parsing. Sources: [`runtime/table-commands.ts`](../../src/runtime/table-commands.ts), `commands`/`command` in `autocomplete/index.tsx`, `inputParts` in `session.ts`.

**Availability.** `CommandRegistry.canExecute` combines the global `permit(targetKey, commandId)` hook with the handler predicate, and `execute` rechecks it. Window lifecycle installs the permission hook for modal restrictions. Domain predicates additionally check feature flags, target types, selection and structural context. Table completion deliberately uses cheap hints; full preparation occurs only on execution. An unavailable exact table alias remains disabled rather than falling through to a different command. Most other unavailable catalogue entries are omitted. Availability does not constitute a durable approval to execute against a later state.

### 2.2 Reusable transformations and their boundaries

| Mechanism | Implemented behavior and limits |
| --- | --- |
| [`TreeCommands`](../../src/block-tree/commands.ts) | `insert`, `insertFragment`, `move`, `remove`, `unwrap`, `replace`, relations, copies/transclusions, inline edits and list wrapping. Some primitives return placement keys; these are not propagated as a uniform registry result. |
| [`TableOperations`](../../src/runtime/tables.ts) | Explicit `TableRequest`, `prepare`, `execute`, `run`. Creation, rows/columns, swaps, transfer, dissolution and reviewed extraction. Plans preserve existing content placements while adding layout shells. |
| [`BlockSurfaces`](../../src/runtime/block-surfaces.ts) | Create/flip/unwrap/delete a reverse; group/dissolve containers. Grouping consumes the live selection. Most surface actions accept one logical Block. |
| [`BlockSelectionService`](../../src/runtime/block-selection.ts), clipboard services | Same-parent reorder; normalized multi-Block copy/cut/delete/paste. Clipboard captures are interchange data, not a lightweight pipeline input. |
| [`text-lists.ts`](../../src/runtime/text-lists.ts), [`tasks.ts`](../../src/runtime/tasks.ts) | List prefix, indentation/outdent, list exit and task-state operations. Preserve applicable existing placements; some are input adapters rather than named registry actions. |
| [`block-menu-actions.ts`](../../src/runtime/block-menu-actions.ts) | Mixed integration: reusable registry/service calls plus UI-owned add/convert/destructure closures. Not every menu operation is already a reusable semantic command. |

The active reverse model uses a `surface-block` with front/back `side-block` children; `surface.create` builds that structure. “Reverse” is not evidence of a separate active `ReverseBlock` command API. Older classes in `src/blocks/` and the original editor should not be mistaken for the active reactive service path.

**Preservation is operation-specific.** Moving a placement keeps its content identity, annotations, children and owned relations. Table creation moves existing Blocks into new cell shells rather than serializing and recreating the inputs. Table/surface continuity checks examine affected mounted occurrences, composition and live media support; table history retains caret bookmarks. Canonical ownership and relationship validation remain in the repository.

Conversely, `TreeCommands.replace` constructs replacement content and transfers children only under its explicit policy. Copy/paste can intentionally allocate new IDs. A future CLI cannot advertise every operation as identity-preserving simply because it uses `TreeCommands`.

**Selection breadth differs from operation breadth.** Table creation and container grouping require contiguous ordinary siblings, even though handle selection can span branches. Table admission excludes resource roots, reference/relation placements, ambiguous shared ownership, unsupported spanned cells and inappropriate individual list/compound-task items. Surface actions reject unsupported ownership/continuity cases. These are existing domain constraints, not restrictions a Command Bar should silently bypass.

### 2.3 Transactions, history and performance

The existing signatures are:

```ts
structuralTransaction(label: string, operation: () => void,
  descriptor?: CommandDescriptor): void
transaction(label: string, operation: () => void,
  descriptor?: CommandDescriptor): void
```

Both can stage multiple **synchronous** tree commands and publish one canonical commit/Undo entry. Nested transactions join the pending transaction. Failed assembly or final validation publishes nothing. `structuralTransaction` uses [`StructuralDraft`](../../src/block-tree/structural-draft.ts), copying changed records/edge evidence, with materialization for unsupported commands. [`structuralChangeFor`](../../src/block-tree/structural-plan.ts) supplies bounded admission evidence; [`CanonicalRepository`](../../src/block-tree/repository.ts) retains broader validation fallback. [`BlockTreeProjection`](../../src/block-tree/projection.ts) maintains admitted structural changes incrementally.

Table operations use this mechanism. Surface/container service operations and selection reordering still start the broader `transaction()` path when invoked independently. Table shell removal also deliberately inspects repository standoff references before destructive removal; table creation and completion suggestions do not need that scan. These differences matter for a CLI catalogue and prohibit a blanket claim that all structural commands have local cost.

The callbacks are not async transaction scopes: `runTransaction` does not await a returned Promise. It must not be held across remote lookup, user review or another stage's asynchronous execution.

**Several transformations can be atomic at the primitive layer; arbitrary existing services cannot yet be composed atomically.** They may read the published projection, manage their own receipts/bookmarks, clear selection, restore focus or catch errors. In particular, a newly inserted table is visible to draft-aware tree commands before it is visible as a published projection occurrence. `BlockSurfaces.run` catches errors and writes a selection message instead of returning a failure result. Table `execute` owns its commit/bookmark lifecycle. Wrapping both public `run` calls in an outer transaction is therefore not a qualified composition contract. This conclusion follows from the implementation; no new pipeline was exercised.

Existing canonical history/persistence should remain the authority. Opening or querying a Command Bar is session state. Structural completion should continue to mark the owning Document dirty through existing change tracking; saving remains manual.

## 3. Current execution flow

### 3.1 Slash typed in a TextBlock

1. `InputGateway.onBeforeInput` resolves a Standoff mount, reads its caret and commits normal text input. The completion `edited` hook recognizes the slash token. Recognition reads a bounded suffix (256 Cells plus a boundary check); ordinary non-trigger typing reads the affected Block and new Cell.
2. `snapshot` in the autocomplete feature requires a `standoff-editor-block` and captures occurrence/content/placement/view identities, inline revision, range, literal and `inline` mode. `valid` requires a connected, visible/non-inert mount, matching identities/revision and no active composition.
3. The feature creates a `CompletionSession` and opens an `autocomplete` overlay with `allowDocumentInput`, explicit dismissal and retained editor focus for inline invocation.
4. Command candidates refresh synchronously. Up/down and Enter operate through leased autocomplete bindings. Clicking a candidate prevents pointer focus theft. “Edit independently” expands and focuses the query field; its query is session state, separate from the authored slash literal.
5. `choose()` revalidates the source and calls `host.command(source, id)`. For table commands the host passes a range snapshot, and the service removes the literal inside the structural transaction. Date replaces the invocation. Entity/link switch tools. Navigation/tool actions can preserve the literal. Surface dispatch is queued into a microtask.
6. The command branch calls `complete()` without awaiting a handler result. Synchronous errors can be shown; asynchronous or microtask failures do not have a uniform completion/error channel. The registry's `Promise<void>` support alone does not make this window an async command runner.

The popup anchors to the source range, falling back to the Block rectangle. `placeScry` chooses a viewport-fitting position that protects the source; source/popup resize, scroll, viewport changes and window geometry schedule a coalesced animation-frame refresh. User move/resize geometry is supported. This positioning path also assumes a text source; a desktop origin needs a non-text anchor policy.

Escape, Cancel, Close, leaving the eligible source/window, invalidation and teardown can dismiss the session. Inline cancellation keeps the slash text. Autocomplete explicitly closes its overlay without generic return-focus restoration; successful mutations have their own restoration. Thus Escape from a focused independent query field must not be assumed to restore a structural handle or selection. The generic overlay return-focus mechanisms exist, but the new origin would need an explicit policy. Sources: [`index.tsx`](../../src/features/autocomplete/index.tsx), [`session.ts`](../../src/features/autocomplete/session.ts), [`view.tsx`](../../src/features/autocomplete/view.tsx), [`placement.ts`](../../src/features/autocomplete/placement.ts), [`overlays.ts`](../../src/runtime/overlays.ts).

### 3.2 Selected Blocks through the existing table field

`tableMenuItems` captures selected node keys, the context owner and repository revision when opened. Its “Table command…” form shares `parseTableCommand` and `tableCommandCandidates`, then executes a registry command with `{ targets }`, without an inline invocation to remove. It rejects a changed selection or repository revision. The service separately prepares and validates its operation.

This is a working example of **explicit selection input**, not the general Command Bar. Its parser/catalogue are table-only, its submission is synchronous, and its revision check can invalidate the form after an unrelated Document edit. `BlockContextMenu` supports asynchronous `run` actions, but its form `submit` contract is `void`. Sources: [`table-menu.ts`](../../src/runtime/table-menu.ts), [`block-menu-types.ts`](../../src/runtime/block-menu-types.ts), [`block-context-menu.tsx`](../../src/rendering/block-context-menu.tsx).

## 4. Block selection integration

### 4.1 What is stored and how it changes

The shared service is `editor.blockSelection`, created per `ReactiveEditor`. Its Solid store holds `items`, `anchorKey`, `leadKey`, `viewId`, `scopeKey` and a message. An entry is already more useful than a bare Block ID:

```ts
// src/runtime/block-selection.ts
export interface SelectedBlock {
  nodeKey: NodeKey;
  placementKey: string;
  contentKey: string;
  viewId: string;
  blockId?: string;
  type: string;
}
```

`ids` falls back to placement keys for legacy Blocks without IDs. `snapshot()` copies these small descriptors, not document records. They identify a selection; they are not, by themselves, a versioned execution receipt.

Handle selection is sorted into visible traversal/document order, **not click order**. Ctrl/Command-click toggles membership; Shift-click selects a traversal range; additive ranges are supported. The UI can select different parents and branches within one view/editing scope, including both an ancestor and descendant. It does not assemble a cross-document or cross-view selection: changing view/scope resets the prior set. Margins are separate scopes. `replaceKeys` is an explicit programmatic helper and preserves supplied order rather than applying all handle-selection rules.

`actionTargets()` maps whole reversible Blocks, removes selected descendants of selected ancestors and deduplicates placements. A CLI must distinguish raw highlighted items from independent action targets. Moving selected contents into a table cannot treat a selected parent and its selected child as two independent inputs.

Changes propagate through Solid store dependencies and per-node selection flags, not a dedicated event bus. `prune` removes missing, identity-mismatched or invisible occurrences; repository changes and handle detachment schedule pruning. View release, hiding relevant content and editor teardown also clear selection. It does not version every selected Block's payload or provide a prepared-operation lease. Sources: [`block-selection.ts`](../../src/runtime/block-selection.ts), [`rendering/block-selection.tsx`](../../src/rendering/block-selection.tsx), [`reactive-editor/editor.ts`](../../src/reactive-editor/editor.ts).

### 4.2 Focus and `/` after handle selection

Selecting a handle focuses its **button**, clears cross-Block text selection and preserves structural selection in the service. A caret elsewhere is not the selection authority. Blur alone does not clear this store; however, ordinary clicks into document content and lifecycle changes can clear it. A Command Bar must capture its input before its own focus transition and must not infer the input from the last TextBlock caret.

The current event path explains why `/` does nothing from a handle:

- `InputGateway.scopes` excludes Block handles/inspectors from normal editor scopes.
- The handle's key listener stops propagation and dispatches the `block-handle` bindings.
- That catalogue has selection, navigation, edit, clipboard and delete bindings, but **no slash invocation**.
- A focused button does not generate the authored Standoff text edit that calls autocomplete's `edited` hook.

This is verified by source tracing and existing handle-focus tests, not by a newly added slash-from-handle test. A successful implementation needs a non-text invocation route; redirecting focus to an editor and inserting `/` would change the input semantics.

### 4.3 Bounded-work implications

`select` currently builds a parent map from the view and traverses the visible selection scope. `actionTargets` builds a parent map too. These run for explicit structural-selection work today. Calling them afresh for every Command Bar query character would introduce avoidable document-size-dependent work. Surface grouping availability already calls `groupTargets`/`actionTargets`; reusing catalogue predicates indiscriminately can inherit that cost.

Capture normalized identity/order once at invocation, retain narrow validity information and recheck actual operation preconditions before mutation. Do not serialize selected subtrees, rebuild projections or scan unrelated Documents to update suggestions. The current table-candidate bounded-work tests are a useful reference, not proof that every other command predicate is equally cheap.

## 5. Pipeline capabilities: implemented versus proposed

| Capability | Verified status |
| --- | --- |
| Typed domain values | Present: `SelectedBlock`, `TextRangeSnapshot`, `TableRequest`, canonical Entity types and commit descriptors. They are separate domain contracts. |
| Structured command return value | No registry-wide contract. `execute` is `void | Promise<void>`; table/surface public runners return no result. |
| Preparation | Tables have a frozen receipt plus a private WeakMap plan. LER retains `{ id, name, revision }` for a prepared Entity. Neither is a generic pipeline stage. |
| Intermediate review | Table extraction counts and Entity candidate/range review exist. No arbitrary command-result preview or stage inspector. |
| Chaining / pipe grammar | No general parser, typed stage validation, stage scheduler or chain session found in active `src/`. |
| Command history | No CLI input history, command recall or reusable chains. `autocomplete/history.ts` records Entity usage for ranking; canonical Undo/history records mutations. |
| Multi-stage rollback | Synchronous tree-command assembly is atomic before publication. No general rollback across committed stages, network work or external Entity creation. |
| Pipeline Carousel | No implemented carousel/stage manager located in the inspected repository. Existing LER documents discuss future handoff; this does not establish infrastructure from discussions outside the repository. |

[`LerSession`](../../src/features/entity-references/ler-session.ts) freezes an original text-target snapshot and retains a prepared Entity. [`ler-view.tsx`](../../src/features/entity-references/ler-view.tsx) distinguishes inspection, preparation and linking; in Command mode `|` reports that composition is reserved for Feature Two. Its local `/` opens LER actions, not the editor slash Command Bar. Query fields retain punctuation as text.

The [LER research document's Feature Two handoff](LER_REDESIGN_RESEARCH_AND_PLAN.md#feature-two-handoff) proposes leases, target generations, origins and vault-context tokens; it explicitly says this is not a universal serialized pipeline schema. The [qualification report](LER_REDESIGN_QUALIFICATION.md) confirms no pipeline infrastructure was introduced. Reusable lessons are source identity, explicit preparation, cancellation, invalidation and authority boundaries. A disposed panel, DOM node or live service closure is not a durable command value.

**Effect of the clarified example.** After `table 3`, the next stage must still identify the three original Blocks, now under three cells. The table wrapper is a created object, but not the intended input to `surface`. Today the table service clears structural selection and keeps internal survivor/focus information; it does not publish an ordered transformation result. Surface operations normally reject a multi-Block selection and expose no batch result. The requested semantics therefore require explicit input/result identity and a defined per-Block application rule. Automatically reading the current selection after each stage would lose the intended input.

For future discussion, one-Undo composition and per-stage execution are different products: the former needs preparation against one draft and deferred UI effects; the latter exposes completed intermediate mutations and must explain failure after an earlier stage succeeds. Neither is approved here. External Entity creation already has separate lifetime/recovery semantics and cannot be undone merely by undoing a Document annotation.

## 6. Architectural options and interaction feasibility

### 6.1 Options A–D

| Option | Fit and complexity | Focus, validity and testability | Extensibility / compatibility |
| --- | --- | --- | --- |
| **A. Read shared selection** | Smallest initial hookup; existing services already do this. | Works without text focus, but live state can change, be cleared by a stage, or belong to a different window. Ambient dependencies make isolated tests and repeatable execution harder. | Good invocation discovery; weak as the execution contract. Cannot alone represent a desktop invocation with no selection. |
| **B. Explicit selection input** | Strong precedent in the table command form; moderate session adaptation. Reuses existing descriptors. | Capture origin/order before moving focus, validate identities and affected state on execute, retain return-focus policy independently. Straightforward fixture-based tests. | Preserves inline behavior while adding non-text input. An explicit application/workspace origin permits no-selection invocation. Does not by itself define pipelines. |
| **C. General typed input/output** | Potentially useful for a mature CLI, but highest design and implementation breadth. | Can make target provenance/results clear; also requires lifecycle, authority, cardinality, cancellation and invalidation rules for each value kind. Large test matrix. | Suitable if multiple value domains actually need composition now. Premature as a prerequisite to selected-Block or desktop launch; must not conflate text ranges, Entities and Block occurrences. |
| **D. Extend existing context/mechanisms** | Reuse `CommandRegistry`, `args`, services, overlays, bindings and local transactions. No existing pipeline engine to extend wholesale. | Existing permission/focus infrastructure reduces duplication. Services with live selection, swallowed errors or UI effects remain unsuitable as generic stage functions. | Best combined with B. Registry result/async semantics and catalogue exposure can be discussed independently from a universal value system. |

These are alternatives/combinations, not newly approved interfaces. A `targetKey` may identify a real workspace/application root for commands that operate there; it must not silently stand in for selected content. “No Block input” and “target this application” are compatible, distinct concepts.

### 6.2 Application-wide launch, including the desktop

An application-wide Command Bar is feasible **without requiring any text editor to own focus**. Keyboard events target the focused element; when no specific element is focused, the document/body provides the relevant focus context. Mutable already has document-level gateway and window-lifecycle listeners. The existing autocomplete `snapshot` and popup anchoring requirements, rather than a browser requirement for text input, are the architectural limitation. [HTML focus model](https://html.spec.whatwg.org/multipage/interaction.html#focus), [MDN activeElement](https://developer.mozilla.org/en-US/docs/Web/API/Document/activeElement).

| Invocation context | Current behavior / architectural assessment |
| --- | --- |
| Selected Block handle | No `/` binding. Feasible to launch with captured selection and handle/view origin, with query focus in the Command Bar. |
| Mutable desktop or non-editing chrome | No Command Bar route. Feasible with application/workspace context and a workspace/window anchor, including zero selected Blocks. |
| Standoff text editor | Preserve current inline slash recognition and authored-literal policy unless separately redesigned. Do not also open a second global bar. |
| Search field, filename input, textarea, code editor, native/opaque widget | Bare `/` normally belongs to that control. A blanket global interception would break legitimate input. A separately chosen explicit launcher could be considered where its event is available. |
| LER Command mode | `/` already opens LER-local actions. This context needs explicit precedence rather than an accidental global takeover. |
| Modal, IME, dead key, AltGraph, pending chord | Existing modal authority and input ownership must be respected. “Application-wide” must not bypass a blocking dialog or interrupt composition. |
| Embedded viewer/iframe | Parent-document handling alone is not sufficient for events originating in an embedded document; host focus tracking is not keyboard forwarding. A visible application launcher remains useful when keyboard events are unavailable. |

The desktop case should inspect actual DOM focus and active window ownership. A click on visually empty chrome must not be assumed to have cleared an editor's caret or a hidden window's selection. Conversely, retaining a selection in memory is not sufficient reason to apply it to every later desktop command. The input choice should be visible.

**Shift–Command–/ assessment.** There is no approved new binding in this report. It is viable to investigate an explicit application launcher, but this particular chord has two concrete issues:

- Apple documents the Help-menu shortcut as Shift–Command–Question mark. On common US layouts, the proposed physical combination overlaps that shortcut; whether Mutable receives/can consume it needs native browser/platform testing. It should not be advertised as reliable everywhere. [Apple keyboard shortcuts](https://support.apple.com/en-us/102650).
- `BindingRegistry.captureTrigger` uses `KeyboardEvent.key`, not physical `code`. Shift and keyboard layout affect that value: a shifted slash may arrive as `?`. Merely registering `keyboard('/', 'Meta', 'Shift')` is not sufficient on such a layout. Existing conflict checks detect registered Mutable bindings, not all browser/OS shortcuts. [KeyboardEvent.key](https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/key), [`bindings.ts`](../../src/input/bindings.ts).

The recommended launch principle is contextual bare `/` on handles/desktop, preserving text/control ownership, plus a remappable explicit application launcher if desired. The fallback chord remains undecided. “Universal” here means across eligible Mutable contexts; this investigation does not propose an operating-system-wide hotkey. A visible launcher also provides an entry point without depending on that chord.

### 6.3 Structural and lifecycle edge cases

| Case | Current evidence and implication |
| --- | --- |
| One vs many Blocks | Selection supports both; command cardinality differs. `surface.create` is not a bulk mapping action today. |
| Different parents / gaps | Selection can express them; table/grouping services reject unsupported combinations. Do not silently regroup, discard inputs or move unrelated siblings. |
| Parent and child both selected | Normalize to independent targets while retaining intelligible raw selection feedback. |
| Mixed types | Availability must consider all inputs and ownership/continuity rules. A valid lead Block does not prove the whole selection is valid. |
| Deleted or modified target while open | Selection pruning is not a reviewed-operation validator. Re-resolve captured identities and recheck dependencies; do not silently substitute the current lead Block. |
| Unrelated workspace change | Table menus/receipts currently invalidate on global revision; safe but conservative. A more durable session would need narrower validity evidence, not repeated full validation. |
| Escape / focus return | Current handle Escape clears selection and returns to editing. A Command Bar Escape could instead return to the selected handle and preserve selection; this is an open policy, not inherited behavior. |
| Success | Tables/surfaces clear selection and manage focus. Keeping the Command Bar open for another stage requires explicit result and focus ownership. |
| No Block selection | Inline `/` already works. Desktop opening should remain useful for application commands; document commands need an explicit eligible document/target rather than last-caret guessing. |
| Windows/views close or become inactive | Existing mount visibility checks, owner disposal and lifecycle leases should govern whether input can still be used and where focus can return. |
| Async work | Registry handlers can be async; the current slash host is not an end-to-end async runner. Pending state, late completion and errors need an agreed session lifetime. |
| Undo / failure | One local structural batch can be atomic; already committed stages and external effects cannot be treated as an uncommitted draft. |

## 7. Recommended direction

The smallest coherent extension is an **application-owned Command Bar invocation/session boundary using existing command and selection machinery**. It should be able to open from a text occurrence, selected handles, or the workspace without fabricating a TextBlock. Selected Blocks are explicit optional input; application/window origin is execution context. These responsibilities can be distinguished without designing a universal typed pipeline now.

Use the existing selection service to discover input, and capture its descriptors/order at invocation. Reuse command IDs, existing table aliases and domain validation rather than creating a second transformation engine. Keep a deliberate catalogue/exposure policy: the registry contains more commands than the current slash UI, and not every registered/internal command is automatically appropriate for a general CLI.

The existing table form is the strongest local precedent. Its conservative invalidation, table-only grammar and synchronous submission are limitations to document, not reasons to duplicate the service. Retain canonical local admission, incremental projections and the existing broader fallback. Keep selection discovery, query work and geometry updates outside repository-wide planning and serialization.

Treat launching and executing one command independently from approving pipe syntax. The clarified example requires identity-preserving per-input mapping after table creation, so any later result contract must distinguish original inputs from newly created wrappers. LER's prepared Entity is a useful domain value and lifecycle precedent, not a ready-made command engine.

This recommendation states architectural boundaries only. It is not an implementation sequence, approved API, binding change or commitment to a particular pipeline UI.

## 8. Open design decisions and verification status

### 8.1 Questions for discussion

The definition of Command Bar, application-wide ambition and “surface each original Block” example are now clarified. The remaining decisions are:

1. **Launch precedence:** should bare `/` open from all non-editing Mutable chrome or only desktop/Block handles? Should LER keep its current local `/` action? Which explicit fallback chord should be qualified, given the proposed chord's Help conflict?
2. **Desktop input:** if a Block selection remains in another view when launching from the desktop, should the bar attach it visibly, offer it, or start with no Block input? Which application/document is the default context for context-dependent commands?
3. **Selection lifetime:** snapshot at invocation or explicitly live input? If one input changes, reject the whole operation or offer an explicit refreshed selection? No silent retargeting is recommended.
4. **Ordering and normalization:** retain current document order and independent-target normalization, or expose click order? Current handle selection does not preserve click order.
5. **Mixed/ineligible inputs:** reject the complete operation, show per-input applicability, or support explicit filtering? Cross-parent/noncontiguous table semantics remain unspecified.
6. **Execution and history:** for future chains, one final atomic commit or immediately committed stages? What should cancellation mean after an external action has completed?
7. **Result ownership:** the example requires original Block identities after table creation. Should created wrappers be available separately, and what should `surface` pass onward: original front Blocks, new surfaces, or both? This is still open even after clarifying which objects to wrap.
8. **Session and focus:** close after one command, or retain a CLI session? Should Escape restore handle focus and selection? Where should a desktop invocation appear and return focus?
9. **Application command exposure:** curated registry entries or an explicit discoverability contract? Which existing tool/file/window commands belong in the initial catalogue, and how should their arguments, async errors and effects be explained?

No answers to these questions are assumed to authorize implementation.

### 8.2 Existing tests and gaps

The following existing suites were run, without modifying them for this investigation:

```sh
npx vitest run \
  src/rendering/block-selection.test.tsx \
  src/rendering/tables.test.tsx \
  src/rendering/reversible-surface.test.tsx \
  src/features/autocomplete/autocomplete.test.ts \
  src/features/entity-references/ler-interaction.test.tsx \
  src/block-tree/structural-performance.test.ts
```

**Result: 177 passed, 1 failed, plus one uncaught error; five of six files passed.** The failing test is `handles drag/drop events and rejects cross-parent list moves` in `block-selection.test.tsx`. Its `dataTransfer` mock supplies `setData`, `effectAllowed` and `dropEffect`, but no `files`; the handler reads `event.dataTransfer?.files.length` in `rendering/block-selection.tsx`. The same test fails in isolation. This establishes a current test-fixture/handler-contract mismatch; it does not establish that native browser drag/drop fails. No repair was made during research.

| Existing evidence | What it supports |
| --- | --- |
| `block-selection.test.tsx` | Selection order/toggling, handle focus and Escape, descendant normalization, separate margins/views, pruning, clipboard/reorder semantics. Native drag/drop remains limited by the noted fixture failure. |
| `tables.test.tsx` | Actual input-path slash conversions, stale source rejection, selected-Block command field, contextual controls, exact Undo/Redo, identities/annotations/caret and bounded work. |
| `reversible-surface.test.tsx` | Container grouping, reversible structure, guarded availability, retained mounted content and history. |
| `autocomplete.test.ts` | Bounded token recognition, source validation, Entity cancellation/ranking, Scry editing and exclusion rules. |
| `ler-interaction.test.tsx` | Command/Edit modes, native field input, distinct preparation/inspection, scoped live filtering and lifecycle behavior. |
| `structural-performance.test.ts` | Composed synchronous primitives, failed-batch rollback, local admission, fallback, durable replay and unrelated-Document isolation. |

Missing qualification for the proposed design includes `/` with a handle focused, `/` on the desktop with no editor, platform delivery of Shift–Command–/, alternate keyboard layouts, selection preservation through the new window, focus recovery after cancellation, workspace context with no document, mixed-input availability, asynchronous command results/errors and composed `table → per-original-Block surface` behavior. The current suites do not establish any of those new interactions.

No new browser performance matrix was run. Existing [Increment 2 qualification](TABLES_AND_COLUMNS_INCREMENT_2_QUALIFICATION.md) and [structural transaction qualification](STRUCTURAL_TRANSACTION_LATENCY_QUALIFICATION.md) remain prior evidence for their tested paths, not measurements of this proposed Command Bar. Browser-visible readiness and bounded work would need qualification for any later implementation.

## 9. Source references

All code excerpts above are existing interfaces. Source behavior was checked in the current working tree; feasibility conclusions and recommendations are labelled separately.

| Area | Primary source and relevant entry points |
| --- | --- |
| Inline recognition | [`autocomplete/model.ts`](../../src/features/autocomplete/model.ts): `invocation`, `TOKEN_LIMIT`, `CompletionCandidate`, `rank`. |
| Current Command Bar host | [`autocomplete/index.tsx`](../../src/features/autocomplete/index.tsx): `createAutocompleteFeature`, `snapshot`, `valid`, `open`, `commands`, `command`, `completionInput.edited/key`, `clearSession`. |
| Session/result limits | [`autocomplete/session.ts`](../../src/features/autocomplete/session.ts): `CompletionSource`, `CompletionHost`, `CompletionSession.refresh/choose/close`. |
| UI, anchoring, dismissal | [`autocomplete/view.tsx`](../../src/features/autocomplete/view.tsx): `CompletionPopup`; [`placement.ts`](../../src/features/autocomplete/placement.ts): `placeScry`; [`history.ts`](../../src/features/autocomplete/history.ts): Entity usage only. |
| Registry/contracts | [`block-tree/types.ts`](../../src/block-tree/types.ts): `CommandContext`, `CommandDefinition`; [`registry.ts`](../../src/block-tree/registry.ts): `CommandRegistry`; [`commit-capture.ts`](../../src/block-tree/commit-capture.ts): `CommandDescriptor`. |
| Registration/ownership | [`application/feature-capabilities.tsx`](../../src/application/feature-capabilities.tsx): `register.command`; [`register-core-views.ts`](../../src/rendering/register-core-views.ts): table/surface registration; [`feature-api/index.ts`](../../src/feature-api/index.ts). |
| Selection | [`runtime/block-selection.ts`](../../src/runtime/block-selection.ts): `SelectedBlock`, `select`, `snapshot`, `actionTargets`, `prune`, `moveTo`; [`rendering/block-selection.tsx`](../../src/rendering/block-selection.tsx): handle and inspector. |
| Input ownership | [`input/gateway.ts`](../../src/input/gateway.ts): `scopes`, `onKeyDown`, `onBeforeInput`, `onPointerDown`; [`binding-catalog.ts`](../../src/input/binding-catalog.ts): `block-handle` defaults; [`bindings.ts`](../../src/input/bindings.ts): key capture, scopes and conflicts. |
| Focus/window context | [`runtime/overlays.ts`](../../src/runtime/overlays.ts), [`runtime/focus.ts`](../../src/runtime/focus.ts), [`application/window-lifecycle.ts`](../../src/application/window-lifecycle.ts), [`application/window-manager.ts`](../../src/application/window-manager.ts). |
| Workspace commands/host | [`workspace-session.ts`](../../src/application/workspace-session.ts): workspace presentation commands; [`workspace-presentation-view.tsx`](../../src/application/workspace-presentation-view.tsx): desktop/canvas/spatial host; [`document-application-capabilities.tsx`](../../src/application/document-application-capabilities.tsx): `flint.open`. |
| Tables/selected command field | [`runtime/table-commands.ts`](../../src/runtime/table-commands.ts), [`runtime/table-menu.ts`](../../src/runtime/table-menu.ts), [`runtime/tables.ts`](../../src/runtime/tables.ts): request, prepare/execute and continuity; [`rendering/block-context-menu.tsx`](../../src/rendering/block-context-menu.tsx). |
| Other transformations | [`runtime/block-surfaces.ts`](../../src/runtime/block-surfaces.ts), [`runtime/block-menu-actions.ts`](../../src/runtime/block-menu-actions.ts), [`runtime/text-lists.ts`](../../src/runtime/text-lists.ts), [`runtime/tasks.ts`](../../src/runtime/tasks.ts), [`runtime/mutable-clipboard.ts`](../../src/runtime/mutable-clipboard.ts). |
| Canonical composition | [`block-tree/commands.ts`](../../src/block-tree/commands.ts): `runTransaction`, `structuralTransaction`, `transaction`, `current`, `publish`; [`structural-draft.ts`](../../src/block-tree/structural-draft.ts); [`structural-plan.ts`](../../src/block-tree/structural-plan.ts); [`repository.ts`](../../src/block-tree/repository.ts); [`projection.ts`](../../src/block-tree/projection.ts). |
| Other selection/value domains | [`runtime/selection-snapshot.ts`](../../src/runtime/selection-snapshot.ts), [`runtime/text-ranges.ts`](../../src/runtime/text-ranges.ts), [`features/grouping/controller.ts`](../../src/features/grouping/controller.ts): text-range grouping, not Block grouping; [`feature-api/entities.ts`](../../src/feature-api/entities.ts). |
| LER preparation and reserved composition | [`ler-session.ts`](../../src/features/entity-references/ler-session.ts), [`ler-view.tsx`](../../src/features/entity-references/ler-view.tsx), [`bindings.ts`](../../src/features/entity-references/bindings.ts), [`entity-candidates.ts`](../../src/features/entity-references/entity-candidates.ts). |
| Architectural/design context | [Input commands](../architecture/INPUT_COMMANDS_AND_KEYBINDINGS.md), [LER research](LER_REDESIGN_RESEARCH_AND_PLAN.md), [LER qualification](LER_REDESIGN_QUALIFICATION.md), [table investigation](TABLES_AND_COLUMNS_INVESTIGATION_AND_IMPLEMENTATION_PLAN.md). Treat earlier plans as historical when current code differs. |
| Legacy distinction | [`original/components/autocomplete.js`](../../src/library/original/components/autocomplete.js), [Autocomplete analysis](AUTOCOMPLETE_ANALYSIS.md): original interceptor behavior, not the active reactive Command Bar. |
| Browser/platform facts | [HTML focus model](https://html.spec.whatwg.org/multipage/interaction.html#focus), [MDN activeElement](https://developer.mozilla.org/en-US/docs/Web/API/Document/activeElement), [MDN KeyboardEvent.key](https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/key), [Apple keyboard shortcuts](https://support.apple.com/en-us/102650), consulted 30 October 2026. |
