# Block-scoped temporal history: feasibility and technical specification

Status: proposed specification, 17 September 2026. No implementation has begun.
Reviewed against the current repository and the supplied discussion,
`/Users/iianneill/Downloads/codex-block-scoped-history.md`.

The discussion is design input. The implementation choices and release staging
below are recommendations for review, rather than instructions imported from
that document or a claim that the feature already exists.

## 1. Feasibility and release decisions

Block-scoped temporal history is feasible and fits Codex's separation of content,
placement, and view. It is a substantial addition to identity, commit capture,
persistence, and rendering—not simply a filter on the current undo stack.

The core query is: **what did the subtree rooted at this Block look like at a
particular historical revision?** Membership, order, properties, and descendant
content must all be resolved at that revision. Viewing this result never moves
or edits current Blocks.

The following product decisions were confirmed during this review:

| Decision | Agreed specification baseline | Status |
| --- | --- | --- |
| Persistence of intermediate edits | Retain history across sessions, including edits between explicit saves. Archive durability and Document saving are separate states. | Confirmed. |
| First-release restoration scope | View, compare, and insert a historical copy first; add in-place content/subtree restoration as a subsequent milestone. | Confirmed. |
| Separation and retention | Keep current Documents independent of history; use a separate memoir sidecar, and allow compaction that expires old history states. | Principle confirmed; storage mechanics specified below. |

This specification develops those choices so their consequences are reviewable.
A session-only prototype remains a development stage, not a claim to satisfy
persistent history. Save-only history would not satisfy the agreed requirement.

Keep the existing global undo/redo behavior. Separate per-Document repositories,
dirty tracking, and undo stacks remain deferred as previously agreed. History
must coexist with that decision, not require a redesign of it.

## 2. Audit of the current implementation

| Question | Current behavior and evidence | Consequence |
| --- | --- | --- |
| Persistent identity | `ExistingBlockDto.id` is optional. [codecs.ts](src/block-tree/codecs.ts) preserves supplied payload IDs but generates fresh ContentKeys, PlacementKeys, and text Cells on normal JSON load. | Authored Block IDs need an explicit guarantee. Ordinary reload does not preserve runtime graph keys. |
| Identity versus location | [types.ts](src/block-tree/types.ts) separates ContentRecord, PlacementRecord, and projected BlockNode; [ids.ts](src/block-tree/ids.ts) generates runtime keys. | Content identity is not an array index or DOM path. Projected occurrences may acquire different NodeKeys after reparenting; never use those as archive identity. |
| Move/reparent | `TreeCommands.move` updates parent child lists and preserves the placement/content records. It currently supports ordinary child placements within one repository. | This is a sound basis for location history. Cross-repository moves and relation/inline extraction are not equivalent supported operations. |
| Deletion | `remove` prunes unreachable records. Referenced content can remain reachable elsewhere. | Capture deleted records and former edges before pruning; there are no durable tombstones today. |
| Cut/paste | [block-clipboard.ts](src/runtime/block-clipboard.ts) removes on cut and inserts a captured fragment on paste; `cloneBlocks` can preserve public IDs for an eligible cut, while regenerating runtime keys. | It is not one atomic move, and ID collision handling can turn a paste into a copy. History must record the actual result and correlation, not infer a move from labels. |
| Split | `splitStandoff` keeps the left content/placement; creates a new right content/placement; generates a new right payload ID only if the original had one. | Add explicit split lineage and ensure the new authored Block always has an ID. |
| Join | `joinStandoff` retains the left identity, incorporates right text/annotations, and prunes the right placement/content where unreachable. | Preserve the right Block's biography and record its contribution to the survivor. |
| Duplicate/detach | Commands and [clipboard.ts](src/block-tree/clipboard.ts) create new graph keys and generally new public IDs where present; annotation/reference remapping varies by operation. | Audit these paths before assigning provenance. A historical copy needs deliberate Block, annotation, and internal-reference remapping. |
| Undo/redo | [repository.ts](src/block-tree/repository.ts) holds private in-memory stacks of labels plus forward/inverse operations; a new edit clears redo. Undo and redo commit inverse/forward operations with `recordHistory=false`. | Useful reversible data exists, but stacks have no durable revision identity, timestamps, or retained abandoned redo history. |
| Transaction boundaries | `TreeCommands.transaction` batches operations into one repository commit. Operations are record upserts/deletions, not a complete semantic event vocabulary. | Capture one history revision per successful outer commit. Add semantic descriptors for biography and display. |
| Revision counters | Repository revision increases on commits, including undo/redo, but resets on ordinary JSON load. Content counters can repeat after undo or a new editing branch. | Neither is a durable timeline ID or reliable cross-session cache key. |
| Full graph snapshots | [extended-codec.ts](src/block-tree/extended-codec.ts) preserves a full RepositoryState, including runtime graph keys, and validates it. Normal Document/Workspace saves use other codecs. | Reuse it as a basis for versioned archive checkpoints; do not confuse extended export with an existing durable history service. |
| Projection | [projection.ts](src/block-tree/projection.ts) projects a repository independently of live DOM geometry. | Historical graph reconstruction is feasible without the live DOM. Normal views still need a dedicated read-only execution context. |
| Persistence | [persistence.ts](src/reactive-editor/persistence.ts), [document-store.ts](server/document-store.ts), and [workspace-store.ts](server/workspace-store.ts) save current JSON and coordinated Workspace bundles. | There is no transaction journal, historical query endpoint, or archive recovery protocol today. |

The normal JSON encoder expands repeated content into nested DTOs, rejects cyclic
legacy export, and cannot losslessly encode inline image Cells. History must not
round-trip through that format to capture state. The existing extended graph
format and canonical fragment capture preserve more information.

## 3. Product semantics

### Subtree, location, and biography

At revision R, resolve the selected root's owned children, ordered inline content,
and owned relations from R—not from the current tree. If B belonged to Chapter
at R but now lives elsewhere, Chapter's historical view includes B's state at R.
Current B remains untouched. A child added after R is absent from that view.

The root's historical parent/slot/order is separate location metadata. Scrubbing
B's history does not reposition current B. The history UI should identify the
historical container and provide an optional location trail.

A split illustrates the difference between exact subtree history and biography:
splitting paragraph P into siblings P and Q does not make Q a descendant of P.
P's subtree therefore does not include Q after the split. A `splitInto` lineage
event links to Q so the biography can explain where the text went. Joins,
copies, and transfers require analogous provenance links.

Before creation, return `not-yet-created`; after deletion of an owned occurrence,
return `deleted` with the last available state link. Removing one reference is
not necessarily deleting the shared content. A group selection is an ordered
set of selected roots at a common revision, not a fabricated historical parent;
support that UI after the single-root milestone.

### References and external dependencies

Owned descendants are the primary subtree. Record reference edges distinctly.
For in-lineage transclusions, a displayed reference resolves to content at the
same historical revision, with a visited-path guard for cycles. References out
of the captured lineage show their recorded identity/version or an unavailable
placeholder; they must not silently display today's external content as old.

Archive linked-annotation definitions and relevant asset descriptors with the
state that uses them. A URL is evidence of a historical reference, not a snapshot
of remote bytes. Initial history can guarantee text/structure/metadata while
showing an unavailable or externally changing media notice; exact historical
media requires retained, versioned asset bytes and belongs to a later increment.

### Current state and historical state

Opening, scrubbing, comparing, or closing history does not change the current
repository revision, undo stack, dirty flag, active selections, or content.
History is not another mutable view of the live repository. Restoring/copying
material is a separate explicit command against current state.

## 4. Identity contract

Use the following identities; do not collapse them into one identifier:

| Identity | Purpose |
| --- | --- |
| `blockId` | Persistent authored content identity, using an existing valid public payload ID where possible. |
| `historyPlacementId` | Durable identity of an occurrence/edge inside the archive, distinguishing references to shared content. |
| `lineageId` | A recorded resource editing lineage: a Document, or the Workspace-owned arrangement and standalone content. Several lineages can share one live repository. |
| `revisionId` | Globally unique identity of one successful captured transaction. |
| `sequence` | Append order within a lineage journal; not a global ordering across independent editors. |
| Runtime keys | ContentKey, PlacementKey, NodeKey, ViewId: mapped to archive identities but not treated as durable public identity. |

When history is enabled for legacy material, run an explicit normalization step
that assigns IDs to authored Blocks lacking them, detects duplicate/ambiguous
IDs, and preserves known references. Do not quietly equate duplicate IDs with
transclusion or rewrite unknown reference strings. If identity cannot be resolved,
start a clearly bounded import baseline and record the ambiguity.

Internal character Cells need archive identity for exact canonical replay, but
do not all need public UUIDs in Document JSON or separate user-facing timelines.
They are retained as graph records in the initial checkpoint implementation.
Existing nonempty public IDs need not be rewritten merely because they are not
UUID-shaped; new authored IDs should be UUIDs.

Moves retain Block and placement identity; duplicate and historical-copy actions
create new identities with `copiedFrom` provenance. Split retains the current
left identity and assigns a new right identity; join retains the left and records
`mergedFrom`. A successful identity-preserving cut/paste may reuse public Block
identity but records its delete/reinsert steps and a correlation ID. A copy or
collision-remapped paste must not inherit the source's identity.

For reload, record a save receipt containing resource identity, exact saved
artifact hash, archived revision, and mappings from serialized occurrences to
archive Block/placement identities. Paths in that receipt are locators tied to
that exact hash, not identities. A matching artifact permits precise rebinding
of freshly decoded runtime keys. A changed artifact requires identity-based
reconciliation or a new baseline; never assume yesterday's array positions still
refer to the same Blocks.

Propose a small versioned history reference in resource-root metadata, containing
the archive/lineage and saved revision identifiers. Keep the detailed mapping in
the receipt. This is an additive file-format extension to validate against
legacy consumers before shipping. History-disabled imports retain current codec
compatibility. Matching repeated references must be supported by explicit archive
mapping; the legacy tree codec alone cannot reconstruct shared identity.

## 5. Revision and transaction capture

Add a commit-result observation point to CanonicalRepository, shared by its
general, inline, split, and empty-paragraph paths. It must run exactly once after
a validated state change, capturing the normalized operations actually applied,
not just the caller's proposed records or the user-facing label.

The event envelope should contain:

- version, lineageId, revisionId, sessionId, sequence, and timestamp;
- previous journal entry ID/hash for append integrity;
- state-parent revision ID: the state against which this change applies;
- cause: edit, undo, redo, import, restore, or historical-copy;
- command ID and structured semantics where available, plus a display label;
- affected archive content/placement IDs, normalized forward change data, and
  preimages needed for inverse/recovery/indexing;
- optional undo/redo source transaction, copy/split/join provenance, transfer
  correlation, and resource membership information.

Do not infer causality by parsing labels such as `Undo ...`. `recordHistory=false`
controls the undo stack only; it must not suppress archival capture of an undo or
redo. Failed validation and abandoned transaction drafts create no revisions.

Capture deleted placements as well as deleted contents before mutation. Existing
`RepositoryChange.previousContents` is insufficient because it omits placement
preimages, semantic cause, and a complete durable commit envelope. Preserve the
current lightweight subscriptions for existing consumers; the new hook should
not force them to snapshot the entire repository.

The general path adjusts record revision fields, and the inline path prepares
cloned records before applying them. Archive the final record values. Replaying
unadjusted input operations could otherwise reconstruct counters differently
from the committed state. Multiple writes to one record in an outer transaction
may be normalized to its first preimage and final value, preserving atomicity.

Start with lossless touched-record changes, using the existing canonical graph
shape. Before persistent high-frequency recording ships, add compact patches
for long inline arrays/payloads and insertion/deletion spans; retaining a full
long paragraph array for every character has a material storage cost. Patches
must be versioned, have expected-base checks, and have a full touched-record
fallback. Semantic move/split descriptions supplement exact replay data; they
are not an alternative source of truth.

Freeze or clone affected records at capture time; queued work must not retain
mutable Solid store proxies. Do not write files, hash the whole repository, or
take a whole-document snapshot on the typing path. Queue encoding, indexing,
compression, and checkpoint work. An archive subscriber failure must be reported
as a recording gap/error without pretending that the already committed edit
was rolled back.

## 6. Undo, branches, imports, and ordering

History is append-only with respect to ordinary editing. Undo appends a revision
whose change reverses the referenced transaction; redo appends another. An edit
after undo can clear the UI redo stack without deleting the archived abandoned
states. Timeline grouping is independent of undo grouping.

A journal sequence is chronological recording order. It is not necessarily a
single replay chain: reopening the last explicitly saved revision while an
unsaved archived head exists starts a new state branch from the saved revision.
Therefore distinguish `previousJournalRevisionId` from `stateParentRevisionId`.
Replay follows state-parent ancestry; the UI can show branch origins and the
previous unsaved material without applying its changes to the reopened file.

An external file edit is an import revision only if it can be reconciled against
a known baseline. Otherwise establish a new checkpoint with an explicit gap or
lineage link. Codex cannot recover intermediate edits performed by another tool
unless that tool supplies history. Filename changes alone do not change identity;
Save As as a copy/fork must be explicitly distinguished from a resource rename.

One canonical Workspace provides a coherent commit order for moves between its
Document children. Partition captured changes into the affected resources'
memoirs, with a shared transaction ID and explicit transfer links. Both former
and new ownership matter. A departure remains in the source memoir and an
arrival includes the destination's required historical content/dependencies.
The archive catalogue can follow that explicit provenance across memoirs; if
the source memoir is unavailable, show the boundary instead of inventing the
missing biography. Per-resource sequence numbers are not globally comparable.

The initial split showcase has separate editors and streams. A cross-repository
move requires a later coordinated transfer protocol; do not infer causality from
wall-clock time or call clipboard cut/paste an atomic cross-resource transaction.

Future collaboration should add author/replica identities, causal parents, and
merge policy while retaining Codex revision semantics. This first implementation
does not choose or introduce a CRDT or promise collaborative selective undo.

## 7. Persistent archive and save integration

Keep current Document JSON files and the Workspace manifest as the normal
inspection/editing format. Adopt the user's suggested memoir convention:

```text
poe.json                       # complete current saved Document
poe.memoir.json                # consolidated, versioned history sidecar
poe.memoir.journal.jsonl        # append-only recent revisions awaiting consolidation
```

`poe.memoir.json` contains a tagged format/version envelope, resourceId,
lineageId, checkpoint catalogue and checkpoint data, retained revision records,
save receipts/identity maps, and the last consolidated sequence/hash. The
journal records its base and appends framed revision records. It is an
implementation companion for active recording, not another authored Document.
At a completed consolidation boundary the JSON memoir contains all acknowledged
history through that boundary; an active journal may contain newer history.

This keeps the settled memoir valid, inspectable JSON while avoiding rewriting
an increasingly large JSON array on every edit. A self-contained memoir export
must merge a consistent journal prefix into its output. Copying a live archive
by hand requires both files; copying the Document alone deliberately carries
only current content. Clean shutdown should attempt consolidation but crash
recovery must never depend on that attempt succeeding.

Use stable IDs inside the memoir; the filename is a discoverability convention,
not identity. Renaming a Document should move/update its memoir association.
Save As as an independent copy creates a new lineage with optional provenance;
it must not silently share the source's mutable journal. If an unrelated file
already occupies the proposed memoir filename, refuse to overwrite it. Exclude
recognized memoir envelopes from the Open Document browser; do not assume every
user file ending in `.memoir.json` can safely be hidden or replaced.

For a Workspace use the corresponding Workspace memoir for Background/window
arrangement and standalone Blocks such as Sticky Notes. Document content is
recorded in each Document's memoir. Workspace history refers to the exact
Document revision needed for a historical boundary, instead of silently loading
current Document content or duplicating every full Document on each layout edit.
Before a resource has a filename, use a history staging location keyed by its
stable resourceId; attach/move the memoir on Save As. Empty transient note drafts
remain excluded until promotion.

The resource partitioner records pre- and post-transaction membership. In a
multi-resource edit, append prepared participant records with a shared
transaction ID and acknowledge the history transaction after a durable
coordinator completion record. Recovery finishes idempotent pending writes or
reports an incomplete transaction; cross-resource historical queries must not
present half a transfer as a complete revision. This coordinator is archival
bookkeeping, not separate runtime repositories or per-Document undo stacks.

Reuse the extended repository codec as a checkpoint starting point, adding
history schema/version and identity maps. A resource checkpoint must form a
valid graph rooted at that resource, with explicit captured reference/dependency
closure; do not pass disconnected record fragments to the current repository
validator. Checkpoints and replay must retain
unknown payload fields, omitted/null collection distinctions, references, inline
atoms, and linked-annotation definitions. Archive schema migration is separate
from ordinary Document schema migration; unsupported versions open with an
explanation rather than speculative conversion.

SurrealDB can later index memoir metadata and resource locations. It is not the
authoritative history store, and losing an index must not destroy the memoir.

Recommended durability flow: enqueue immutable committed packets in memory,
persist a browser outbox asynchronously, then batch to the local server journal.
The server acknowledges only after the promised durable write boundary. Stable
revision IDs make retries idempotent. A short batching interval creates a bounded
unacknowledged tail; do not promise zero-loss recording before acknowledgment.
The outbox's origin dependence matters when switching between ports 3000 and
3002; server-confirmed history must be common to both.

Proposed store contract: open/read memoir metadata, append a batch with expected head,
read paginated revisions, read a checkpoint, and associate a save receipt.
Serialize writers per lineage, reject unexpected heads, and distinguish an
identical retry from a conflicting duplicate. Concurrent browser writers need
explicit separate branches or a single-writer policy for the first release;
silently interleaving incompatible baselines is invalid.

Use bounded records, checksums/length framing, and verified heads. Consolidation
captures a fixed acknowledged prefix, writes a temporary complete memoir,
flushes it, and atomically replaces the old memoir before rotating the included
journal prefix. Concurrent appends remain in the tail. Recovery deduplicates an
already-consolidated prefix by revision ID/hash if a crash occurred before
journal rotation. An incomplete final frame can be discarded; interior gaps or
corruption must be reported. Persisted indexes are optional and rebuildable.

If the memoir is missing, opening and editing `poe.json` must still work. Display
history as unavailable or start a new baseline without claiming continuity. A
leftover journal may be recoverable only if its required baseline is intact;
never replay it over an unrelated current file. Independent current-document
usability is a release requirement, not just an archive recovery convenience.

Integrate saving by associating the exact serialized resource with its captured
revision before acknowledging a completed save receipt. Journal/checkpoint data
may exist for a revision whose Document save fails. If the file write succeeds
but archive receipt finalization fails, report the separate history status and
reconcile using the file hash and prepared receipt on reopen. Preserve existing
Workspace bundle ordering and conflict handling; do not mark intermediate
archival recording as a Document Save or clear the Document's dirty state.

On reopening, the current file remains authoritative. Offer archived unsaved
material as recoverable history; never silently replace that file with the last
archived working state. In-place recovery, when requested, is a fresh edit/save.

Support two distinct maintenance operations: lossless consolidation/compression,
and user-directed retention compaction that deletes old states. Initially retain
all history until the user chooses a cutoff; age/size defaults can be discussed
after storage measurements. Expose archive size and the earliest retained state.

For expiry, reconstruct a complete checkpoint at each retained branch boundary,
retain all required subsequent changes/dependencies, and write a verified new
memoir before retiring the old data. A surviving saved-file receipt may require
an additional baseline even if it predates the user's viewing cutoff; retain it
as recovery infrastructure until that receipt is superseded. Do not delete
arbitrary old deltas while leaving later states dependent on them.

Retained revision IDs remain stable. Record a retention boundary so expired
history is distinguishable from corruption or a Block that never existed.
Historical copies already inserted into Documents remain valid; their provenance
may now point to an expired state. Cross-memoir pinned revisions must either
remain available or acquire an explicit expired-dependency status under the
selected retention policy. Do not promise unchanged exact cross-resource replay
after independently discarding one of its required states.

Compaction must not change the current Document or its normal undo stack. The
maintenance UI should state the cutoff and the history that will be lost.
Deleting current text does not itself erase its historical copies. A future
“forget history” operation must include the memoir, journal, outbox, and any
retained backups; it is distinct from ordinary Block deletion.

## 8. Query and reconstruction services

Suggested service boundaries (names are provisional):

- `HistoryRecorder`: receives committed change envelopes; maintains the outbox.
- `HistoryStore`: persistence/read protocol, without editor or DOM dependencies.
- `HistoryIndex`: temporal content versions, placement/parent membership,
  dependencies, provenance, and affected-ancestor lookup.
- `HistoryQuery`: timeline, state-at-revision, location, and comparison queries.
- `HistorySession`: current selection/root/revision and asynchronous UI lifecycle.
- `HistoricalCopyPlanner`: validates and prepares insertion into current state.

`getSubtreeAt` takes lineageId, blockId, optional historyPlacementId, revisionId,
and explicit relation/reference traversal options. It returns an immutable
historical graph/fragment, historical location, dependency manifest, and status
such as available, deleted, not-yet-created, incomplete, or unsupported. A known
deleted root must be queryable through archive indexes without a live NodeKey.

First correctness implementation: locate a checkpoint on the requested state
ancestry, replay the remaining verified deltas into an isolated graph, validate
it, then extract the historical root and dependency closure. Never apply these
deltas to the live editor. Optimize later using indexed content versions and
membership intervals without changing query semantics.

Timeline indexing must consider old and new ancestry. A child moved out of B
contributes a departure event to B; later unrelated edits to that child outside
B do not become B-subtree revisions. Edits to shared referenced content should
be discoverable for each containing historical occurrence under the chosen
reference policy. Initial implementation may derive this during replay; the
incremental index must maintain the same results.

Resolve dependency closure for shared annotation definitions and referenced
content at the same revision. A missing dependency produces an explicit result
diagnostic, not a fallback to a live registry. Full-history cached results are
keyed by lineage/revision/root/options, never by the resettable runtime revision
counter alone.

Suggested initial tunables: journal batching around 250 ms or 1 MiB, checkpoints
after 500 transactions or 8 MiB of replay data, and visual typing groups with a
1-second idle break and a 10-second maximum span. These are starting values for
measurement. Exact transactions remain addressable even when grouped visually.
Checkpoint an immutable revision in a worker/archive mirror; do not clone a
changing live tree opportunistically on each keystroke.

## 9. Historical UI and execution isolation

Provide History from a Block's context menu and the command registry. Begin with
one root and a dedicated history panel showing timestamp, action, location, and
a keyboard-operable scrubber/list. An in-place historical preview with the rest
of the Document subdued can follow once isolation and layout are dependable.
The same HistorySession should support either presentation.

Normal Block views are not automatically safe historical renderers. They can
register editing mounts, expose context-menu mutations, start timers, make
network requests, and portal floating windows into the current desktop. Introduce
an explicit historical/read-only rendering context with denied mutation and
controlled effects; do not rely solely on `contenteditable=false` or CSS.

Initial renderer support: text and annotations, containers, Pages/tabs, lists,
and a static Sticky Note representation. Other types use informative static
previews/placeholders. Timers must not tick/beep, remote embeds must not execute,
and historical windows must not create live desktop windows. Do not install the
live InputGateway or active ToolbarBlock targeting on history-only content.

Allow text selection/copy in the historical view. Opening and closing it should
restore current editing focus. Cancel superseded reconstruction requests during
scrubbing; publish results only if their request token still matches. Use cached
revisions and worker reconstruction for larger subtrees. Compare shows authored
content, property, structure, and location differences, excluding regenerated
runtime keys and derived measurement state.

## 10. Bringing historical material forward

### First release: insert a historical copy

Resolve the historical fragment and dependencies, select a supported current
destination, then generate a copy plan. Allocate fresh Block, placement, and
annotation identities; remap internal references, retain explicit external
references, and attach provenance to the source lineage/root/revision.

Reuse canonical fragment capture/clone/insertion concepts rather than legacy
DTO conversion, which can lose inline atoms or shared structure. Treat linked
annotations and current UUID collisions explicitly. A selected historical
reference needs a documented copy policy: the default materializes its captured
content as an independent copy, with shared relationships preserved inside the
copied fragment where valid. It must not accidentally reconnect to live content.

Revalidate the current destination and dependency versions immediately before
committing. Insert once through TreeCommands as one undoable transaction and
record a `historical-copy` revision. Copying does not rewind the source lineage.

### Later: restore content or subtree in place

Restore is a new forward transaction derived from a historical target and the
current graph. Never apply selected old inverse operations directly: unrelated
edits may have changed their preconditions.

Content restoration keeps current location/children while replacing an explicitly
defined content/property set. It needs policies for inline identities, current
annotations, attachments, and shared references. A command cannot overwrite text
while leaving today's incompatible annotation offsets attached.

Subtree restoration additionally reconciles historical membership/order against
current ownership. If historical B1 now belongs to C, restoring B's old subtree
must preview the conflict. Do not silently steal B1, duplicate its identity,
discard new descendants, or overwrite its later edits. Offer an explicit move,
independent historical copy, or exclusion policy, and describe other affected
containers. Shared content changes must disclose affected references.

Implement a restore plan with expected current versions, affected roots,
conflicts, and dependency/save impacts. Recheck it at application time, apply
atomically within one repository, and undo it as one current edit. Cross-repository
restoration remains outside the first release.

## 11. Implementation roadmap and uplift

| Stage | Deliverable and exit condition | Main uplift |
| --- | --- | --- |
| A. Identity and capture spike | Legacy-ID audit; precise commit envelopes for all commit paths; deterministic replay fixture covering edit/move/delete/split/join/undo. | Medium–large. Repository and command boundary work; no history UI yet. |
| B. Isolated temporal queries | Checkpoint/replay and historical subtree/location/lineage results; original discussion's reordered/moved-child examples pass exactly. | Medium. Reuse canonical graph and projection foundations; define reference/dependency semantics. |
| C. Durable memoirs | JSON sidecar plus journal, outbox, resource partitioning, idempotent append, recovery, receipts, reload identity mapping, branches, and retention compaction. | Large. Largest first-release risk; ordinary JSON remains independently usable. |
| D. Read-only history panel | Context-menu command, timeline, comparison, static rendering, cancelled scrub requests, and unchanged live state. | Medium–large. Rendering isolation matters more than drawing a slider. |
| E. Historical copy | Validated dependency-aware copy plan, new identities, provenance, one undoable insertion, save/reload. | Medium. Reuse fragment infrastructure but audit remapping and transclusions. |
| F. In-place restoration | Conflict preview, content/subtree policies, optimistic validation, atomic apply and undo. | Large; recommended later release. |

First persistent release comprises A–E, reflecting the confirmed scope above.
An internal A–B prototype is useful for validating feasibility but does
not substitute for C's durability guarantees. Calendar estimates should follow
the capture/replay and identity spikes; this is a multi-stage architectural
feature, not a small toolbar task.

Likely implementation locations are `src/block-tree/repository.ts`,
`commands.ts`, `types.ts`, and codec/clipboard modules; new `src/history/`
model/query/store modules; runtime and rendering history-session components;
`PersistenceService`; and a small file-backed server history router/store.
Index schemas, data validation, and archive version migrations belong beside
the history store. No SurrealDB schema change is required for the first release.

Before implementing the full feature, preserve these inexpensive design paths:
consistent authored IDs for newly created Blocks, explicit move/copy distinctions,
structured command/cause metadata, a commit envelope seam, and a rendering-mode
boundary. These are recommendations for future authorized work; none are being
changed as part of this specification.

## 12. Acceptance and regression criteria

1. Reproduce the supplied A/B/B1/B2/C examples. Historical order/membership
   comes from the selected revision, including descendants now elsewhere.
2. Capture text, properties, owned relations, reordering, deletion, split, join,
   and grouped transactions through every repository commit path. Replay equals
   the committed canonical state, including actual revision field values.
3. Undo, redo, and an edit after undo leave all archived states discoverable.
   Save/reopen with an unsaved archived head creates the correct branch rather
   than replaying incompatible deltas over the saved file.
4. IDs survive supported moves and reload mapping; missing/duplicate legacy IDs
   have explicit handling. Split/join biography links do not invent descendants.
5. Deleting a current root does not delete its archived states. Missing resources,
   references, and linked-annotation definitions produce honest diagnostics.
6. Scrubbing causes no current mutations, focus theft, timer activity, remote
   execution, or live-window portals. Multiple projections of shared content
   cannot route a historical interaction into the current editor.
7. Historical copies preserve content/annotation meaning, use fresh identities,
   resolve dependencies, insert atomically, undo correctly, and survive saving.
8. Crash tests cover an incomplete journal tail, corrupt interior entry,
   duplicate retry, stale writer, consolidation/journal rotation, offline outbox,
   multi-memoir transaction completion, resource-save/receipt failure ordering,
   and externally edited JSON. Deleting/moving a memoir must leave the current
   Document usable. Retention compaction must preserve retained states across
   branches, identify expired states, and keep required save-recovery baselines.
9. Recording adds no whole-repository snapshots or file/network waits to ordinary
   typing/Enter. Extend existing [performance regressions](TEXT_EDIT_PERFORMANCE.md)
   and benchmark long paragraphs, large subtrees, journal growth, and replay time.
   Establish measured overhead budgets in the spike rather than guessing them.
10. Browser verification covers real history invocation, keyboard scrubbing,
    comparison/copy, live-state invariance, and save/reload against both the
    development server and rebuilt production client.

## 13. Relationship to the broader Codex direction

Temporal identity strengthens portable Blocks and reusable tools: a Block's
biography follows its content identity, a placement has location history, and a
History tool can target any supported surface through explicit capabilities.
History need not force Documents to stop being files. Files can remain current
arrangements of persistent objects while an archive records their past states.

This aligns with [BLOCK_COMPOSITION_AND_TOOLBAR_PLAN.md](BLOCK_COMPOSITION_AND_TOOLBAR_PLAN.md)
and [WORKSPACE_PERSISTENCE_PLAN.md](WORKSPACE_PERSISTENCE_PLAN.md). Neither broad
cross-repository transfer nor global object storage is a prerequisite for the
bounded first release. Future CRDT integration, multi-author history, selective
undo, semantic/AI history search, automatic asset versioning, and arbitrary
subtree restoration remain separate increments with explicit contracts.
