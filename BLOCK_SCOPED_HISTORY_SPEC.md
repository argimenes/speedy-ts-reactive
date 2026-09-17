# Block-scoped temporal history: feasibility and technical specification

Status: approved architectural direction, 17 September 2026. Stage A is implemented
and verified with the approved copy-policy amendment. Stages B–E remain proposed. See
[the Stage A implementation report](BLOCK_SCOPED_HISTORY_STAGE_A_COMPLETION.md).
Reviewed against the current repository and the supplied discussion,
`/Users/iianneill/Downloads/codex-block-scoped-history.md`.

The discussion is design input. The implementation choices and release staging
below are recommendations for review, rather than instructions imported from
that document or a claim that the feature already exists.

## 1. Feasibility and release decisions

Block-scoped temporal history is feasible and fits Codex's separation of content,
placement, and view. It is a substantial addition to identity, commit capture,
persistence, and rendering—not simply a filter on the current undo stack.

The core query is: **what did this Block and its then-owned subtree look like at
a particular historical revision?** Membership, order, properties, and
descendant content must all be resolved at that revision. Viewing this result
never moves or edits current Blocks. The Block is the logical subject of the
history; a Document memoir is its physical storage location, not its identity.

The following product decisions were confirmed during this review:

| Decision | Agreed specification baseline | Status |
| --- | --- | --- |
| Persistence of intermediate edits | Retain history across sessions, including edits between explicit saves. Archive durability and Document saving are separate states. | Confirmed. |
| First-release restoration scope | View, compare, and insert a historical copy first; add in-place content/subtree restoration as a subsequent milestone. | Confirmed. |
| Separation and retention | Keep current Documents independent of history; use a separate memoir sidecar, and allow compaction that expires old history states. | Principle confirmed; storage mechanics specified below. |
| Storage versus identity | Keep memoirs beside individual Documents; use stable Block identity and, later, provenance/locators to follow a Block across Documents. A Workspace-wide memoir is not the central store for every Block. | Confirmed. |

This specification develops those choices so their consequences are reviewable.
A session-only prototype remains a development stage, not a claim to satisfy
persistent history. Save-only history would not satisfy the agreed requirement.

**First pass** means a complete, persistent vertical slice for Blocks owned by
a Document: stable IDs; durable changes and checkpoints in that Document's
memoir; historical subtree query; read-only view, contextual scrub, and compare;
and insert a historical copy into that same Document. It must survive normal
close/reopen and retain intermediate edits between explicit Document saves.
Multiple Documents may each have a memoir, but a first-pass recorded transaction
is scoped to one Document; it is not a coordinated cross-Document transaction.
The first pass does not promise a continuous biography after a Block moves to a
different Document or Workspace-owned surface. It records any observed boundary
honestly rather than inventing missing history.

**After the first pass**: coordinated transfers and cross-memoir biography,
Workspace-owned history, user-directed expiry/retention compaction, broader
historical rendering and asset capture, and in-place restoration. Lossless
journal consolidation/checkpoint maintenance needed to keep first-pass storage
usable is distinct from deleting old states for retention.

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
For same-Document transclusions, a displayed reference resolves to content at the
same historical revision, with a visited-path guard for cycles. References out
of the captured Document show their recorded identity/version or an unavailable
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

## 4. Block-centred identity contract

A Block's biography is keyed by its stable `blockId`, not a filename, current
parent, array path, DOM element, or Workspace. A Document's memoir stores the
portion of that biography observed while the Block belongs to that Document.
The current Document file remains a snapshot of present content/arrangement;
the memoir is evidence of earlier states. Neither file has to contain the other.

Use the following identities; do not collapse them into one identifier:

| Identity | Purpose |
| --- | --- |
| `blockId` | Persistent, globally unique authored content identity. Reuse an existing unambiguous public payload ID where possible. It survives edits and identity-preserving moves. |
| `historyPlacementId` | Durable identity of an occurrence/edge inside the archive, distinguishing references to shared content. |
| `resourceId` / `memoirId` | Stable identities of the Document and its physical archive. They locate history segments; neither is a Block's identity. |
| `revisionId` | Globally unique identity of one successful captured transaction. |
| `sequence` | Append order within one memoir; not a global ordering across independent editors. |
| Runtime keys | ContentKey, PlacementKey, NodeKey, ViewId: mapped to archive identities but not treated as durable public identity. |

The archive should distinguish a Block-content version from a placement event.
For example, editing B's text does not imply that B moved; moving B from Page 1
to Page 2 does not imply its text changed. A selected occurrence may need a
`historyPlacementId` when shared content appears in more than one place. The
first-pass query is scoped to one Document memoir and one selected occurrence;
the later cross-memoir coordinator composes history segments by `blockId`.

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

Within one Document, moves retain Block identity; placement identity is retained
when the canonical occurrence survives and otherwise linked explicitly. Duplicate
and historical-copy actions create new identities with `copiedFrom` provenance.
Split retains the current left identity and assigns a new right identity; join
retains the left and records `mergedFrom`. A successful identity-preserving
cut/paste may reuse public Block identity but records its delete/reinsert steps
and a correlation ID. A copy or collision-remapped paste must not inherit the
source's identity. These provenance edges explain genealogy; they do not make
two different Blocks the same Block or change historical subtree membership.

For reload, record a save receipt containing resource identity, exact saved
artifact hash, archived revision, and mappings from serialized occurrences to
archive Block/placement identities. Paths in that receipt are locators tied to
that exact hash, not identities. A matching artifact permits precise rebinding
of freshly decoded runtime keys. A changed artifact requires identity-based
reconciliation or a new baseline; never assume yesterday's array positions still
refer to the same Blocks.

For the first pass, prefer a save receipt in the memoir keyed by stable resource
identity and the exact Document artifact hash. Add only the minimum resource-root
metadata actually required for stable rebinding; validate any file-format
extension against legacy consumers before shipping. A Document lacking its
memoir must still open normally. Matching repeated references must be supported
by explicit archive mapping; the legacy tree codec alone cannot reconstruct
shared identity. A later portable provenance hint on the Block may name prior
memoirs, but must not become the authoritative history or embed the history
stream in every Block.

## 5. Revision and transaction capture

Add a commit-result observation point to CanonicalRepository, shared by its
general, inline, split, and empty-paragraph paths. It must run exactly once after
a validated state change, capturing the normalized operations actually applied,
not just the caller's proposed records or the user-facing label.

The first-pass event envelope should contain:

- version, resourceId, memoirId, revisionId, sessionId, sequence, and timestamp;
- previous journal entry ID/hash for append integrity;
- state-parent revision ID: the state against which this change applies;
- cause: edit, undo, redo, import, or historical-copy;
- command ID and structured semantics where available, plus a display label;
- affected `blockId`s and archive placement IDs, normalized forward change data,
  and preimages needed for recovery/indexing;
- optional undo/redo source transaction and copy/split/join provenance.

The exact changes are the replay authority. Block IDs and semantic descriptors
are for querying and explanation. Parent/ancestor timeline entries are derived
from historical membership rather than logging a duplicate snapshot of every
ancestor on each keystroke. Later cross-resource transfer records add a shared
transaction/correlation ID and former/new resource membership.

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
shape. Measure actual journal growth on long paragraphs before shipping the
persistent first pass. If touched-record copies make typing unacceptably large,
add versioned compact insertion/deletion patches with expected-base checks and
a full touched-record fallback. This optimization is conditional on measurement,
not a prerequisite for defining a second event model. Semantic move/split
descriptions supplement exact replay data; they are not an alternative source
of truth.

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

**After the first pass**, a move between Documents should keep the Block's ID,
record a departure in the source memoir and an arrival in the destination memoir,
and link both records with a shared transfer ID. If both Documents live in one
repository, its commit order helps, but a durable two-memoir transaction still
needs coordination. If they live in separate repositories, the transfer itself
also needs a coordinated protocol. Do not infer a move from wall-clock time or
call clipboard cut/paste an atomic transfer. A missing source memoir leaves an
honest boundary in the Block biography, not fabricated earlier states.

The first-pass recorder must identify the owning Document for a single-resource
commit, even when several Documents share a live repository. It may observe an
unsupported cross-resource operation; it must mark the boundary or recording
gap clearly. It must not silently attribute changes to the wrong Document or
merge two memoir streams. Per-resource sequence numbers are never globally
comparable.

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

`poe.memoir.json` contains a tagged format/version envelope, `resourceId`,
`memoirId`, checkpoint catalogue and checkpoint data, retained revision records,
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
Save As as an independent copy creates a new resource history with optional provenance;
it must not silently share the source's mutable journal. If an unrelated file
already occupies the proposed memoir filename, refuse to overwrite it. Exclude
recognized memoir envelopes from the Open Document browser; do not assume every
user file ending in `.memoir.json` can safely be hidden or replaced.

**First pass:** record each eligible Document's single-resource edits in that
Document's memoir.
When an unsaved new Document is eligible for history, stage by stable `resourceId`
and attach its memoir on first save; do not silently drop pre-save edits. Do not
record the Workspace arrangement or standalone Sticky Notes in a Document memoir.
The scope boundary must be explicit in the UI and tests.

**After the first pass:** a Workspace memoir can record Background/window
arrangement and Workspace-owned standalone Blocks such as Sticky Notes. It should
reference exact Document revisions when needed, not duplicate entire Documents
or replace their memoirs. Cross-Document moves then require a resource partitioner
and durable coordinator: record pre/post ownership, append linked participants,
and expose the transfer only when complete. Recovery must not present half a
transfer as a complete revision. A small rebuildable catalogue may locate the
memoirs that contain a given `blockId`; it is an index, not the global memory or
sole copy of history. On a lost source memoir, the catalogue cannot reconstruct
its past.

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

First-pass store contract: open/read memoir metadata, append a batch with expected
head, read paginated revisions, read a checkpoint, and associate a save receipt.
Serialize writers per memoir, reject unexpected heads, and distinguish an
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
and user-directed retention compaction that deletes old states. **First pass:**
implement lossless consolidation and retain all history. Expose archive size and
earliest recorded state so growth is visible. **After the first pass:** add a
user-selected cutoff and deletion of expired states, with age/size defaults only
after storage measurements. Until that exists, do not advertise the memoir as
self-limiting.

For later expiry, reconstruct a complete checkpoint at each retained branch boundary,
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

Retention compaction must not change the current Document or its normal undo
stack. Its later maintenance UI should state the cutoff and the history that
will be lost.
Deleting current text does not itself erase its historical copies. A future
“forget history” operation must include the memoir, journal, outbox, and any
retained backups; it is distinct from ordinary Block deletion.

## 8. Query and reconstruction services

Suggested service boundaries (names are provisional):

- `HistoryRecorder`: receives committed change envelopes; maintains the outbox.
- `HistoryStore`: persistence/read protocol, without editor or DOM dependencies.
- `HistoryIndex`: rebuildable lookup for Block revisions and historical
  membership. An optimized temporal index can follow measured need.
- `HistoryQuery`: timeline, state-at-revision, location, and comparison queries.
- `HistorySession`: current selection/root/revision and asynchronous UI lifecycle.
- `HistoricalCopyPlanner`: validates and prepares insertion into current state.

First-pass `getSubtreeAt` takes a Document memoir locator, `blockId`, optional
`historyPlacementId`, `revisionId`, and explicit relation/reference traversal
options. The locator selects the available history segment; it is not part of
the Block's identity. The query returns an immutable
historical graph/fragment, historical location, dependency manifest, and status
such as available, deleted, not-yet-created, incomplete, or unsupported. A known
deleted root must be queryable through archive indexes without a live NodeKey.
Later, `getBlockBiography(blockId)` can find and compose segments across memoirs
using transfer links and a rebuildable catalogue; missing segments remain visible
as gaps.

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
keyed by memoir/revision/root/options, never by the resettable runtime revision
counter alone.

Suggested initial tunables: journal batching around 250 ms or 1 MiB, checkpoints
after 500 transactions or 8 MiB of replay data, and visual typing groups with a
1-second idle break and a 10-second maximum span. These are starting values for
measurement. Exact transactions remain addressable even when grouped visually.
Checkpoint an immutable revision in a worker/archive mirror; do not clone a
changing live tree opportunistically on each keystroke.

## 9. Historical UI and execution isolation

Provide History from a Block's context menu and the command registry. The
first-pass demonstration should select one root, show a keyboard-operable
timeline with timestamp/action/location and comparison, and scrub a read-only
historical representation in the selected Block's context while the surrounding
current Document is subdued. This is a preview overlay/session, not a mutation
or replacement of the live Block. A dedicated panel may house controls and the
comparison view; an unsupported Block type may fall back to a static panel
preview. The same `HistorySession` should support either presentation. Multi-root
scrubbing and richer view modes follow later.

Normal Block views are not automatically safe historical renderers. They can
register editing mounts, expose context-menu mutations, start timers, make
network requests, and portal floating windows into the current desktop. Introduce
an explicit historical/read-only rendering context with denied mutation and
controlled effects; do not rely solely on `contenteditable=false` or CSS.

First-pass renderer support should cover the Block types in the chosen Document
fixture: text/annotations and their structural containers, including Pages/tabs
and lists where present. Other types use informative static previews/placeholders.
Static Sticky Note rendering and richer tool/media support can follow later.
Timers must not tick/beep, remote embeds must not execute, and historical windows
must not create live desktop windows. Do not install the live InputGateway or
active ToolbarBlock targeting on history-only content.

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
references, and attach provenance to the source Block/memoir/revision.

Reuse canonical fragment capture/clone/insertion concepts rather than legacy
DTO conversion, which can lose inline atoms or shared structure. Treat linked
annotations and current UUID collisions explicitly. A selected historical
reference needs a documented copy policy: the default materializes its captured
content as an independent copy, with shared relationships preserved inside the
copied fragment where valid. It must not accidentally reconnect to live content.

Revalidate the current destination and dependency versions immediately before
committing. Insert once through TreeCommands as one undoable transaction and
record a `historical-copy` revision. The copy's provenance names its source
`blockId`, memoir, and revision; it has its own new `blockId`. Copying does not
rewind or mutate the source Block.

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

### First pass: per-Document, complete durable vertical slice

The implementation plan for Stage A only, including exact code locations,
proposed interfaces, normalization, tests, and exit criteria, is in
[BLOCK_SCOPED_HISTORY_STAGE_A_PLAN.md](BLOCK_SCOPED_HISTORY_STAGE_A_PLAN.md).

| Stage | Deliverable and exit condition | Main uplift |
| --- | --- | --- |
| A. Identity and capture spike | Audit/normalize missing or duplicate Block IDs; observe all successful repository commit paths; deterministic replay fixtures for text, structure, move, delete, split, join, and undo in one Document. | Medium–large. Repository and command boundary work. |
| B. Isolated temporal queries | Checkpoint/replay and `getSubtreeAt` for a Block in one Document memoir; historical location and old/new membership; no live-repository mutation. | Medium. Canonical graph reuse and reference/dependency rules. |
| C. Durable Document memoir | Sidecar plus journal, bounded outbox, idempotent append, recovery, save receipts, reload identity mapping, branch handling, and **lossless** consolidation. The Document remains usable without the memoir. | Large. Principal first-pass persistence risk. No cross-memoir coordinator or retention expiry. |
| D. Read-only historical experience | Context-menu/command entry, Block-centred timeline, in-context scrub preview with subdued surroundings, compare, static fallbacks, keyboard access, and unchanged live state. | Medium–large. Safe rendering and focus isolation. |
| E. Historical copy | Dependency-aware copy into the same Document, fresh identities, provenance, one undoable insertion, and save/reload. | Medium. Fragment remapping and transclusion audit. |

A–E constitute the first persistent release. A–B alone are useful feasibility
spikes but do not satisfy the agreed persistence requirement. Treat storage
volume and typing latency as measured release gates. The first pass does not
quietly expand to Workspace history or cross-Document continuity merely because
the current runtime can place several Documents in one repository.

### After the first pass: independent increments

| Increment | Deliverable | Why deferred |
| --- | --- | --- |
| Cross-Document Block biography | Linked departure/arrival records, durable transfer coordination, and a rebuildable `blockId`-to-memoir catalogue. | Requires reliable transfer semantics and multi-memoir atomicity. |
| Workspace-owned history | A separate Workspace memoir for Background/window arrangement and standalone Blocks, referencing exact Document revisions. | Different ownership and save boundaries. |
| Retention compaction | User-visible cutoff, checkpoint rebasing, dependency protection, verified rewrite, and explicit expired-state markers. | Destructive to old history; must be designed against real storage measurements. |
| In-place restoration | Preview conflicts, define content/subtree policies, validate current state, then apply as a new undoable edit. | Substantially harder than viewing or copying. |
| Richer historical rendering | Static or versioned media, more Block types, multi-root selection, and portable archive/export. | Requires type-specific side-effect and dependency handling. |

Calendar estimates should follow the identity/capture and replay spikes; this
is a multi-stage architectural feature, not a small toolbar task.

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

### First-pass release gates

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
   resource-save/receipt failure ordering, and externally edited JSON. Deleting
   or moving a memoir must leave the current Document usable. A missing memoir
   or unsupported cross-resource boundary is reported as a gap, not continuity.
9. Recording adds no whole-repository snapshots or file/network waits to ordinary
   typing/Enter. Extend existing [performance regressions](TEXT_EDIT_PERFORMANCE.md)
   and benchmark long paragraphs, large subtrees, journal growth, and replay time.
   Establish measured overhead budgets in the spike rather than guessing them.
10. Browser verification covers real history invocation, keyboard scrubbing,
    comparison/copy, live-state invariance, and save/reload against both the
    development server and rebuilt production client.

### Later-increment gates

11. Cross-Document transfer tests prove linked departure/arrival, atomic visibility
    across memoirs, rebuildable catalogue lookup by `blockId`, and honest gaps
    when a source memoir is unavailable.
12. Workspace history tests show standalone/arrangement history without embedding
    Document histories or silently loading a current Document into an old view.
13. Retention tests preserve every retained branch and required dependency,
    distinguish expired states from corruption, and leave the Document/undo
    state untouched.
14. Restoration tests cover conflict preview and a single undoable new edit;
    they do not reuse historical inverse operations as if they were current.

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
