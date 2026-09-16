# Portable Blocks, reusable tools, and the ToolbarBlock demonstration

Status: design and implementation roadmap, 16 September 2026. Documentation
only; this document does not authorize implementation. Recommendations below
are proposals for the continuing design discussion, not shipped behavior.

## Purpose and assessment

Two principles should guide Codex Desktop:

1. Blocks can be embedded, extracted, and recomposed across Documents and
   other containers. Content retains its identity and meaning as its context
   changes. Codex becomes a choreographed interplay of containment.
2. Tools are reusable objects that can work across different surfaces. A
   toolbar can itself be a Block, placed where useful, without its tools being
   intrinsically tied to one Document type or window.

The pencil analogy is productive: a pencil travels between notebook, shopping
list, and sticky note. Its operation remains recognizable, while the surface
affects what that operation means and how it is presented. Similarly, Codex
should resolve a tool's requirements against a surface's capabilities.

Both goals are achievable through an evolution of the existing architecture.
Content records, placements, projected views, structural commands, and runtime
services already provide useful foundations. Universal portability is not yet
an established contract: components and commands still carry assumptions about
Document ancestry, editor ownership, presentation, and selection.

A paged Document and a Sticky Note already contain the same standoff text
Blocks. Their different chrome, geometry, and persistence arrangements should
not require different implementations of text annotation. They can be distinct
compositions with shared content and tools; they need not share one technical
Document class or identical layouts.

## The relationships to keep distinct

| Relationship | Question it answers | Example |
| --- | --- | --- |
| Content identity | What object is this? | The note, its paragraphs, and their annotations retain stable identities. |
| Ownership and placement | Where does this occurrence belong? | The note is a child of a Window or a Page. |
| Presentation | How is it shown? | In flow, in a margin, in a tab, or in a floating window. |
| Persistence | Which saved resource contains it? | A standalone note is in the Workspace; an embedded note is in its Document file. |
| Tool target | What will this action affect? | An annotation toolbar acts on a selected text range in a particular occurrence. |

These relationships may change together, but should not be inferred from one
another. A view can float without acquiring new content identity. A toolbar
can be physically in one container while explicitly targeting another.
Persisted ownership must come from the model, not the DOM position of a portal.

Moving, copying, transcluding, extracting, and opening another view are distinct
operations. A move preserves identity; a copy creates independent identities;
a transclusion adds a reference to shared content. Opening another view need
not transfer ownership at all. The UI must name the operation accurately.

“Any Block anywhere” means offering a supported route into and out of suitable
containment, including adaptation where needed. A table row still needs table
structure; an inline atom cannot simply become an arbitrary top-level child;
an opaque iframe cannot expose text editing without cooperation. A destination
can accept a Block, offer a wrapper, or explain why that particular placement
is unavailable. Structural validity and ownership-cycle prevention remain
essential to useful composability.

## What the current code supplies—and where it stops

| Area and source | Existing foundation | Required uplift |
| --- | --- | --- |
| [Model types](src/block-tree/types.ts), [repository](src/block-tree/repository.ts), [projection](src/block-tree/projection.ts) | Separate content, placement, and view occurrence records; owned/reference/inline placements; repository validation. | Define portability contracts above these primitives. Runtime occurrence keys are not durable file references. |
| [Tree commands](src/block-tree/commands.ts) | Move, unwrap, replace, transclude, detach, and grouped transactions. | `move` currently handles ordinary child placements in one repository. Moving roots, relations, inline content, or content across repositories needs additional semantics. |
| [Registries](src/block-tree/registry.ts), [view registrations](src/rendering/register-core-views.ts) | Block capability labels, optional slot declarations, command availability and execution. | Capability strings and slot types alone do not provide executable surface adapters or a universal insertion policy. Start with one concrete annotation adapter. |
| [DocumentStyleBar](src/rendering/document-style-bar.tsx) | Shared toolbar component; selection capture, annotation operations, and scoped targets. | Annotation mutation logic, focus handling, Document functions, counts, and layout controls are combined inside a UI component. Extract responsibilities incrementally. |
| [Editor](src/reactive-editor/editor.ts), [focus](src/runtime/focus.ts), [selections](src/runtime/selections.ts), [cross-Block selection](src/runtime/cross-block-selection.ts) | Per-editor command, mount, selection, focus, and history services. | Introduce explicit tool targets and selection bookmarks that survive toolbar interaction. Define behavior across editor instances and reject stale targets. |
| [Workspace host](src/demo/workspace-demo.tsx) | Loaded canonical Workspaces use one repository; the initial showcase has separate Background and Document editors. | A free toolbar cannot assume the editor that renders it owns its target. A structural transfer cannot be treated as one transaction across those separate editors. |
| [Sticky Notes](src/runtime/sticky-notes.ts), [card view](src/rendering/sticky-note.tsx), [WindowView](src/rendering/core-block-views.tsx) | Portable note type, floating shell, ordinary text children, saved size and presentation. | Generalize hosting deliberately. Recent portal-origin and paragraph-spacing bugs show why layout assumptions need browser verification. |
| [Workspace persistence](src/reactive-editor/workspace-manifest.ts), [clipboard](src/runtime/block-clipboard.ts) | Documents saved separately; Workspace manifest; coordinated save; content-fragment copying. | A clipboard cut/paste is not an atomic ownership transfer across repositories. Moving content between saved resources needs coordinated save/reload verification. |

The existing toolbar's detailed annotation behavior is documented in
[DOCUMENT_STYLE_BAR_MIGRATION.md](DOCUMENT_STYLE_BAR_MIGRATION.md). Its inclusive
annotation endpoints, Unicode handling, metadata preservation, no-op repeated
application, selection restoration, and undo behavior are compatibility
requirements during extraction, not opportunities to change semantics silently.

## Proposed tool architecture

Use a small composition of responsibilities:

```text
ToolbarBlock / context menu / key binding
                    |
         resolve and validate target
                    |
       shared annotation operation
                    |
     target editor's commands and history
```

The ToolbarBlock stores its configuration and renders controls. The shared
operation implements annotation semantics. A target resolver connects the
operation to an appropriate surface, occurrence, and selection. The existing
CommandRegistry should remain the command entry point; this does not require
another parallel command system.

The first adapter should expose annotatable text: a live editor/repository
owner, surface boundary, view/occurrence identity, selected Block-local ranges,
and validity information. Capability labels describe what can be requested;
the adapter provides the actual operation and target data. Resolve model
ancestry for scope, since floating DOM portals may have unrelated ancestry.

An image-region annotation adapter or a timeline selection can be added later.
Those surfaces need their own coordinate and selection semantics. A reusable
semantic annotation tool could support several adapters; Bold should remain
available only where its text-formatting semantics apply.

### Targeting, selection, and focus

Three target modes are useful, but need not all ship in the first increment:

| Mode | Proposed behavior |
| --- | --- |
| Containing surface | Default for an embedded toolbar: act within the nearest logical editable surface, including a Sticky Note inside a Page. |
| Follow active surface | Default for a floating toolbar: adopt the most recently activated eligible surface; show its name and whether a selection is available. |
| Pinned surface | Stay attached to one explicitly selected surface until unpinned, even while another surface is focused. |

Moving keyboard focus into toolbar buttons or a colour picker must not replace
the editing target. Capture a selection bookmark before interaction and restore
it when appropriate. Keyboard traversal must work as well as pointer clicks;
preventing pointer focus loss alone is insufficient.

Resolve the target once for an action, then validate it before mutation. Check
the owning editor is live, the occurrence still exists, every range is inside
the intended boundary, and the content has not invalidated its coordinates.
For the first increment, invalidating an affected bookmark and requesting a
fresh selection is preferable to silently applying obsolete offsets. Reuse
existing selection mapping where reliable; comprehensive mapping across every
structural operation can follow later. Validate all segments of a cross-Block
selection, not just its anchor.

Switching to an incompatible surface should visibly disable the relevant tools.
A deleted, closed, or unavailable target must not silently redirect an action
to unrelated text. Following and pinning should be visible behaviors, with a
small target label rather than an implicit dependency on browser focus.

For separate editors in the initial showcase, a small Workspace-level broker
can register live surface contexts and route actions to the target editor.
It must unregister on disposal and keep editor ownership with the target.
Toolbar placement history belongs to its owner; an annotation belongs to the
edited content's history. This broker is not a new repository or undo manager.

### ToolbarBlock configuration and persistence

Proposed first persisted settings are a schema version, toolset/preset ID,
ordered command IDs where customized, compact presentation, and target mode.
Tool definitions remain application registrations, rather than serialized
functions or executable code in a Document. A shared preset does not imply
that every ToolbarBlock instance shares transient state.

Persist an explicit target only when its reference can be resolved durably.
A stable resource and Block identity may still require placement identity or
a path to distinguish transcluded occurrences. Never serialize a live editor,
DOM Range, NodeKey, or JavaScript service reference. Persistent external pins
can wait; containing-surface behavior and session-only follow/pin are enough
to establish the concept.

Active selections, hover, menus, enabled states, measurement caches, and focus
bookmarks remain runtime state. A user-added ToolbarBlock is persisted as
configuration under its owner; an automatic Document chrome toolbar need not
be inserted into every old Document file. This preserves existing files while
allowing explicit, portable tool Blocks.

Classify ToolbarBlock as a control/tool role. Its labels and configuration must
not become prose, word-count input, Find matches, or a cross-Block text-editing
segment. Structured saves preserve the Block; future reading/print exports
should have an explicit policy for showing tools. Avoid implementing buttons
as editable text children merely to make them “Blocks.”

## Proposed first demonstration

The first milestone is shared tooling. The second extends it to containment
transfer. Both can use the same demonstration Workspace.

1. Open a paged Document and a populated floating Sticky Note. Select text in
   either surface and use the same floating annotation ToolbarBlock to apply
   Bold, Highlight, and text colour. Show which surface is targeted.
2. Place a ToolbarBlock into the Document or note through an explicit insertion
   command. It uses the same tool definitions and operations, with compact
   layout and containing-surface targeting. Sticky Notes remain toolbar-free
   by default; users can choose a floating toolbar to preserve writing space.
3. Move one ToolbarBlock between supported containers and its floating shell.
   Its identity and configuration survive; its declared target mode determines
   whether the target changes. Multiple separately configured instances also
   remain possible.
4. In a canonical Workspace, embed the annotated StickyNoteBlock into the
   current Page, then extract it to a floating Window again. Keep the note,
   paragraph, and annotation identities intact. The toolbar continues to work
   after resolving the new occurrence; invalid old bookmarks are discarded.
5. Undo/redo the transfer, save the Workspace and its referenced Document, and
   reload. Show that the note exists in the correct owner, without duplication
   or a leftover empty Window.

Use explicit “Insert toolbar,” “Move toolbar…,” “Embed note here,” and “Extract
to window” commands for the initial demonstration. The user has deferred the
drag/drop UX discussion; this plan does not select a drop gesture, target
indicator, or margin-pinning behavior. Future dragging should invoke the same
validated operations once that UX is agreed.

## Practical roadmap

### 1. Establish a bounded fixture and target contract

Create a small canonical Workspace fixture with one saved Document/Page,
one populated Sticky Note, and ordinary standoff text in both. Record the
existing annotation semantics and identify the minimal annotation capability.
Define target resolution and bookmark invalidation before adding portable UI.
Include the initial split-editor showcase as a separate routing case.

Exit criterion: the design can name the owning editor, logical surface,
occurrence, and range for either surface without looking for a specific Window
type or relying on DOM ancestry. Confirm the existing save path can round-trip
the chosen fixture before relying on it for the transfer demonstration.

### 2. Extract shared annotation operations

Move the local annotation application and selection-to-property conversion out
of DocumentStyleBar into a runtime service backed by existing TreeCommands.
Register the demonstration actions and have the current toolbar delegate to
them. Keep the full existing toolbar working while migrating related actions
incrementally. Share target validation and application semantics with matching
menu and binding entry points; preserve intentional differences between local
and cross-Block action scopes.

Exit criterion: Bold, Highlight, and colour operate through the shared path on
both surfaces. Existing annotation metadata, selection behavior, and undo are
unchanged. Colour-picker focus transfer and reversed/Unicode ranges pass.

### 3. Introduce ToolbarBlock and reusable targeting

Register `toolbar-block` as a tool/control Block and render a compact preset
using the extracted operations. Support insertion into the two demonstration
surfaces and a floating presentation with an explicit target label. Add
containing-surface and follow-active behavior; a session pin is a useful next
addition if it does not delay validation of these first two modes.

Implement the small context broker for split-editor targeting, or route that
host through an equivalent explicit adapter. Exercise disposal, closed notes,
tab switches, and competing toolbar instances. Add presentation rules for
narrow containers and shared window layering; retain viewport-based geometry
for any portaled floating shell.

Exit criterion: milestone one is demonstrable using one toolset across both
surfaces, including actual pointer and keyboard interaction in the initial
showcase and canonical Workspace. Tool labels do not affect document queries.

### 4. Add constrained, reversible structural transfer

Begin with ordinary owned child placements within one canonical Workspace
repository. Build a transfer plan that validates source, destination, cycles,
target capability, and any required wrapper before committing. Group moving
the existing placement and creating/removing its presentation shell into one
transaction. Reuse this operation for the supported ToolbarBlock moves and
StickyNoteBlock embed/extract commands.

Remove a source Window only when the plan confirms that its transferable
content has moved and no other owned content would be discarded. Invalidate
affected tool bookmarks, restore focus to the new occurrence, and explicitly
choose the destination presentation. Floating Window geometry belongs to the
shell; the note's embedded size belongs to its card. Extraction may choose a
fresh viewport-bounded position; exact restoration of old shell geometry is a
separate policy choice.

The initial split showcase needs either consolidation into the existing
canonical Workspace host or a later cross-repository transfer coordinator.
Recommend canonical consolidation as follow-up work; until then expose
transfer only where it can be atomic and explain its availability. Do not
approximate a move with destructive clipboard cut followed by a separate paste.

Exit criterion: milestone two preserves identities, annotations, content, and
tool configuration through embed, extract, undo, and redo in one repository.
Failed validation leaves the source intact. This does not claim arbitrary
relation/inline/root transfer or cross-Workspace moves.

### 5. Verify resource boundaries and demonstrate the complete round trip

For a floating note moved into a Document, saving must remove it from Workspace
layout content and include it in the receiving Document file. Extraction does
the inverse. Reuse coordinated Workspace saving, and check behavior when the
Document has no filename, has externally changed, or fails to save.

A Document-only save cannot persist both sides of a move across the Workspace
boundary. For this increment, identify such pending transfers and direct their
durable commit through Save Workspace; preserve existing unsaved-change guards
without introducing a new per-Document dirty-state architecture. Saving must
not declare the whole transfer complete after only one resource is written.

Exit criterion: save/reload has one correct owner, preserved identities, and
recoverable failures. The prototype demonstration is complete only after this
round trip, not merely after a visually successful move.

## Refactoring pain points and scale of uplift

Effort bands below describe scope, not delivery dates. The selection and
transfer spikes should precede any calendar commitment.

| Work area | Relative uplift | Pain point and approach |
| --- | --- | --- |
| ToolbarBlock rendering, preset, registration | Small | The existing controls are reusable, but their CSS must work outside Document chrome. Keep the first preset small. |
| Extracting annotation operations | Medium | Preserve current range conventions, unknown fields, idempotence, and linked-reference behavior; avoid separate toolbar and shortcut mutation implementations. |
| Target resolution and selection bookmarks | Medium–large | Focus changes, colour inputs, undo, edits, hidden tabs, and repeated content occurrences can make a remembered target wrong. Explicit ownership and validation are central. |
| Split-editor routing | Medium | Both editors install document-level input listeners and own distinct histories. Route once to the owning editor and avoid duplicate execution. |
| Same-repository note/tool transfer | Medium | Existing move commands help; shell lifetime, identity, wrappers, focus, and reversal still need a coordinated operation. |
| Persistence after transfer | Medium–large | Ownership can cross Document/Workspace files even with one runtime repository. Verify bundle saving and dependency closure. |
| General insertion and query policies | Large, incremental | Slot declarations, text traversal, counts, Find, and ancestor assumptions are scattered. Introduce the minimum tool-role behavior now; broaden per feature. |
| Arbitrary cross-repository transfer | Large; deferred | Coordinated undo, source lifetime, resource writes, reference repair, and failure recovery need their own design. |
| Unified window manager | Medium–large; separate track | A shared window presentation layer and consistent focus/z-order policy would remove portal exceptions. Full z-plane controls are not a prerequisite for the bounded demo. |

Several specific traps deserve attention:

- An embedded note is an editing boundary even though it is not a technical
  Document. Keyboard navigation and cross-Block selection should not escape
  into surrounding prose unexpectedly; audit the Document-type assumptions in
  `ReactiveEditor.adjacentEditable` and related traversal.
- Linked semantic annotations can depend on definitions in a root registry.
  Moving paragraphs alone may leave those definitions outside the saved
  resource. Verify dependency closure when transfer includes linked annotations;
  the first fixture can use local styles, but must not claim universal semantic
  portability until this is tested.
- References to shared content require occurrence-aware targets. Content identity
  alone cannot decide which view should regain focus or which placement moves.
- A copied tool configuration must not retain an unsafe runtime pin to the
  source editor. Missing tool registrations should render an understandable
  unavailable state while preserving serialized configuration.
- Local Solid signals suit transient tool state. Cursor movement and enabled
  button updates should not serialize the document, increment its revision,
  or scan the whole Workspace on every event.
- Toolbars can have saved configuration without behaving as authored prose.
  Their presence must not change paragraph splitting or annotation boundaries.

## Verification and demonstration evidence

Model tests should cover command equivalence, range validity, identity-preserving
moves, one-operation undo, cycle rejection, and configuration serialization.
Integration tests should cover target switching between editors, unavailable
surfaces, target disposal, and selection preservation through toolbar focus.

Use a real browser for layout and interaction: select text, click tools, use
Tab and keyboard activation, open a colour picker, move between the two
surfaces, and repeat after resizing and reparenting. Check pointer hit testing,
viewport coordinates, compact paragraph spacing, and scrolling. DOM existence
alone cannot establish that a floating control is visible or usable.

Run that demonstration against both Vite and the rebuilt production client.
The Sticky Note regression showed that a correct development result does not
prove the built app contains the change. Verify the served artifacts as part
of completion, including the Workspace save/reload sequence.

## Later work and decisions to revisit

The demonstration leaves arbitrary drag/drop, margin anchoring, generalized
relation/inline extraction, cross-repository transfer, image/timeline adapters,
toolbar customization UI, external persistent pins, and the full window-order
manager for later discussion. Existing Page-only minimap/concertina boundaries
do not expand merely because targeting infrastructure becomes more general.

Separate repositories per Document, refined dirty-state tracking, and independent
undo stacks remain deferred as previously agreed. Database optimization and
SurrealDB changes are not prerequisites for this work.

Product decisions to revisit are the visibility of target mode, default toolbar
placement, how embedded controls appear in reading/print modes, the intended
drop gesture, and whether extracting means moving ownership or opening another
view. Proposed defaults for the first demo are compact controls, explicit
insertion, visible targeting, in-flow embedding, and identity-preserving moves.

Related plans: [Sticky Notes](STICKY_NOTE_DOCUMENT_PLAN.md),
[Workspace persistence](WORKSPACE_PERSISTENCE_PLAN.md),
[Block clipboard](BLOCK_CLIPBOARD_MIGRATION.md),
[cross-Block selection](CROSS_BLOCK_TEXT_SELECTION_PLAN.md), and
[window resizing](FLOATING_WINDOW_RESIZE_PLAN.md).
