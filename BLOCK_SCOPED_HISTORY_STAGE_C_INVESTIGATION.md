# Block-scoped history — Stage C architectural investigation

Date: 2026-09-17. Status: investigation, not an implementation plan or approval to
implement Stage C. No application behavior or persistent format is changed here.

Follow-up: the user has accepted the [portable-format spike's semantic direction](PORTABLE_CODEX_DOCUMENT_FORMAT_SPIKE.md).
The [bounded pre-plan results](BLOCK_SCOPED_HISTORY_STAGE_C_PREPLAN_RESULTS.md)
record new executable evidence and the accepted ownership/locality decisions:
exact historical closure stops at authoritative Document ownership; external
targets retain references/provenance without dependency-only Document revisions;
all per-memoir infrastructure lives in the immediate parent's reserved `.memory`.
These decisions supersede the environmental-closure blocker and visible sidecar
proposal. The results' §§3 and 5 specify the remaining implementation proof gates.
The [final Stage C plan](BLOCK_SCOPED_HISTORY_STAGE_C_PLAN.md) now sequences those
gates before schema freeze and application write integration; implementation has
resumed at G1 with an ownership-aware definition-lifetime correction. See the
[gate results](BLOCK_SCOPED_HISTORY_STAGE_C_GATE_RESULTS.md) for the original
counterexamples, new lifecycle regressions and remaining proof obligations.

The smallest credible architecture is a per-Document archive of exact revisions,
with a bounded asynchronous outbox, serialized server appends, independent save
receipts, and an isolated reader. Preserve Stage B's replay model and keep query
preparation off the recording path. Select small per-memoir manifests, immutable
checkpoint/segment files and active journals beneath directory-local `.memory`.
Directory colocation does not merge histories. No database is needed.

The original investigation identified three substantive gaps:
ordinary Document JSON is not an exact canonical checkpoint; Stage B's in-memory
values are not yet a lossless wire format; and a live Workspace repository is not
a collection of independent Stage B producers. In particular, a hash and save
receipt cannot by themselves make a non-bijective Document codec reversible.
The accepted portable model/load boundary and bounded codec/projection experiments
now supply planning direction, without claiming production integration is proved.

## 1. Evidence and limits of this investigation

Inputs examined:

- [Specification](BLOCK_SCOPED_HISTORY_SPEC.md), especially §§4–8 and §11;
  [Stage A plan](BLOCK_SCOPED_HISTORY_STAGE_A_PLAN.md), especially normalization,
  capture and exit boundaries; [Stage A completion](BLOCK_SCOPED_HISTORY_STAGE_A_COMPLETION.md).
- [Final Stage B plan](BLOCK_SCOPED_HISTORY_STAGE_B_PLAN.md), especially §§4–9;
  [Stage B completion](BLOCK_SCOPED_HISTORY_STAGE_B_COMPLETION.md), including its
  deviations, performance results and explicitly unproven durable contracts.
- [Stage A benchmark](BLOCK_SCOPED_HISTORY_STAGE_A_BENCHMARK.json),
  [Stage B typing benchmark](BLOCK_SCOPED_HISTORY_STAGE_B_TYPING_BENCHMARK.json),
  [Stage B history benchmark](BLOCK_SCOPED_HISTORY_STAGE_B_HISTORY_BENCHMARK.json),
  and their [typing](scripts/benchmark-typing.mjs) and
  [history](scripts/benchmark-history.mjs) workloads.
- Canonical identity, capture, replay, query and grouping implementation/tests;
  editor construction; ordinary Document and Workspace codecs; client save/open
  services and demo orchestration; server Document/Workspace storage and tests.

Reported suite results are existing completion evidence, not new test runs.
Stage B records 121 passing tests in its planned regression run, a later focused
32-test pass, and passing client/server type checks. Its full diagnostic run had
333 passing tests and two context-menu failures reproduced on the unchanged
baseline. Stage A records 107 distinct targeted tests. Those results establish
in-memory behavior, not crash durability or cross-session reconstruction.

One new, read-only, in-memory experiment bundled the current codecs with esbuild
without writing output. It confirmed that ordinary encode/decode changes graph
keys; JSON serialization of an extended checkpoint drops the Document content
record's own `inlineKind: undefined`; and encoding one paragraph shared by two
placements then decoding it produces two content records with the same public
ID, which normalization reports as ambiguous. No benchmark or application test
suite was rerun and no storage failure experiment was performed.

## 2. Stage B handoff: preserve contracts, not the proof harness

| Area | Carry into the durable model | Session-local or deliberately unsettled |
| --- | --- | --- |
| Compact capture | Every successful captured transaction has its own UUID, exact changed values/preimages, root/counter transition, cause and command provenance. Unchanged sequence members are not retained for supported contiguous edits. | `HistoryChanges` v1 is an in-memory representation, not an already shipped disk schema. Raw keys require a namespace/binding; JSON byte measurements are not a codec. |
| Revision graph | Separate state ancestry from chronological journal order. Every revision stays independently addressable and replayable, including undo/redo and abandoned branches. | Store-assigned sequence and randomly generated producer/segment IDs currently live only in one store instance. Durable branch/head publication and segment roots need envelopes. |
| Checkpoints | A complete validated graph at a named revision; replay only from an ancestral checkpoint. Preserve canonical fields, relations, Cells, counters and dependencies. | `ExtendedRepositoryDto` is a useful payload model, not proof of lossless JSON persistence. `savedAt` is incidental envelope data, not graph identity. |
| Identity | Authored Block ID differs from content-record identity, placement identity and projected occurrence. Shared content stays shared during exact replay. | Stage A's index knows only current identities. It is neither a retired-ID catalogue nor a reload mapper. ContentKey/PlacementKey/NodeKey are not durable public IDs. |
| Queries | Frozen isolated results; explicit unavailable/ambiguous states; historical membership/dependencies; comparisons require evidence. | `HistorySource` currently addresses one segment and returns whole ancestry arrays. Durable readers need bounded loading and resource-to-segment discovery. |
| Grouping | Policy/version/scope-specific derived groups, exact member IDs and endpoint. Optional descriptive input hints may be retained with events. | Only sentence policy is implemented. Engine/locale segmentation is not an archival invariant. No input-gateway collection or group cache is implemented. |
| Indexes/caches | Rebuildable acceleration only; exact records and checkpoints remain sufficient without them. | Current per-event full-graph indexing, full-state LRU sizes, synchronous drain and capacity defaults are feasibility choices. |
| Undo/redo | Preserve current stack entries, execution, single-source causes, redo invalidation and failure behavior. Capture resulting commits normally. | Never serialize the undo stack as temporal history, rebuild it by historical replay, or make a group a replay/undo unit. |

Evidence: [compact representation and diff](src/block-tree/compact-changes.ts#L5),
[capture envelope](src/block-tree/commit-capture.ts#L5),
[store contracts/enrollment](src/history/memory-store.ts#L12),
[pure replay](src/history/replay.ts#L18),
[current identity index](src/block-tree/identity.ts#L79),
[read-capability facade](src/history/source.ts#L3), and
[grouping contracts](src/history/grouping.ts#L5).

`MemoryHistoryStore` constructs a new strict repository from its baseline. It
does not attach to the editor already on screen. `flush()` drains memory work;
it promises neither browser persistence nor server acknowledgement. Disposal
clears retained state. A capture/capacity/replay failure stops that producer's
verified continuation. Persisting its maps or substituting an HTTP call inside
`drain()` would preserve these unsuitable lifecycle and throughput assumptions.
Reuse its invariants, pure applier and tests as the oracle; introduce persistence
through the existing compact subscription and a separate read implementation.
See [enrollment/drain](src/history/memory-store.ts#L87) and
[disposal](src/history/memory-store.ts#L227).

## 3. Actual save/open lifecycle and the recording boundary

| Existing path | Observed behavior | Consequence for Stage C |
| --- | --- | --- |
| `ReactiveEditor` construction | Decodes a DTO or accepts a loaded Workspace state, then creates a non-strict repository. It does not normalize or enroll history. | Establish eligible resource identity/baseline before recording its first edit. Do not replace an active repository or migrate its undo stack just to enroll it. |
| Document Save | Captures repository revision and encoded DTO; adds folder/filename to that DTO; sends it; only marks clean if the live revision still matches. | Capture revision UUID, immutable export and receipt mapping together before any await. Keep history acknowledgement separate from `lastSavedRevision`. |
| Document Open | Server parses file, adds filename metadata; client validates by decoding, then editor construction decodes again. | Capture raw artifact hash before server/client enrichment. Attach provenance to the actual editor decode, not to keys from the throwaway validation decode. |
| Canonical Workspace Save | Snapshots one repository, externalizes Documents, hashes their exported DTOs, writes Documents and then a manifest. | Associate each Document export with its own resource revision. The Workspace's global integer revision cannot stand in for every Document's history head. |
| Workspace Open/resolve | Resolves external resources, adds resource metadata, materializes a shared repository; missing resources remain placeholders. Later resolution can make several commits. | Enroll only resolved eligible Documents at a declared load boundary. Missing placeholders are not empty Document histories. |
| Split demo Workspace Save | Encodes foreground/background, constructs a temporary editor, saves its Workspace, then marks the original editors saved. | Receipt provenance must come from the original producers and snapshots, never from the temporary repository's new keys/counters. |
| Close/discard/dispose | Dirty-state guards and editor cleanup; no durable history drain protocol. | Discarding unsaved current edits does not delete their archived revisions. Outbox ownership must outlive editor disposal. Shutdown is not the only opportunity to persist. |

Sources: [editor constructor](src/reactive-editor/editor.ts#L69),
[Document persistence](src/reactive-editor/persistence.ts#L151),
[Workspace persistence](src/reactive-editor/persistence.ts#L186),
[load/resolve](src/reactive-editor/persistence.ts#L291),
[bundle export](src/reactive-editor/workspace-manifest.ts#L188),
[open/close orchestration](src/demo/workspace-documents.ts#L43), and
[split Workspace save](src/demo/workspace-demo.tsx#L329).

The clean attachment is a resource recorder observing successful
`subscribeHistoryChanges` events, plus explicit baseline/load/save lifecycle
notifications. The subscriber must not serialize a whole Document, replay a
graph, make a network request synchronously, or mutate the repository. Persistence
services provide immutable save evidence; they do not decide whether an edit is
historically recorded. A resource can be dirty with all history durable, clean
with a pending receipt, or editable with history unavailable.

There is one targeted existing save issue to address before trusting receipts:
the split demo calls `markCurrentRevisionSaved()` after awaiting the temporary
save. That method reads the original repository's *current* revision, potentially
marking intervening edits clean. Carry the captured original revision through
that path and retain the same equality guard as ordinary Save. This is a save
association correction, not a change to undo semantics. The ordinary race is
covered by [persistence tests](src/reactive-editor/persistence.test.ts#L10); the
split path needs equivalent evidence.

Server writes are not an existing durable transaction service.
[Document storage](server/document-store.ts#L89) writes a temporary file then
links/renames it, echoes `X-Speedy-Revision`, and treats search-index failure as
a warning. It does not synchronize file/directory durability or compare an
existing artifact hash for ordinary overwrites. [Workspace storage](server/workspace-store.ts#L167)
checks canonical-object hashes, stages files, renames Documents before the
manifest, and compensates on caught errors. Those checks/writes are not protected
by a shared writer lock; process death can interrupt a bundle between renames.
Preserve current usability and conflict handling, but do not claim the existing
headers, rollback code or extended-repository endpoint already solve memoir CAS,
crash recovery or save receipts.

## 4. Compact changes need a lossless wire boundary

Keep the exact patch representation. It compares validated before/after records;
commands and grouping hints do not authorize state changes. Full-record fallback
handles unknown canonical fields and insertions/deletions. Nested changed payload
values are retained whole; one verified sequence splice represents the changed
span. This is one replay authority, not a second text model.

However, ordinary `JSON.stringify` is insufficient. `PresentValue` distinguishes
absent from present-with-undefined, and undefined occurs in normal decoded
records, not only artificial tests. Plain JSON also needs an explicit policy for
non-finite numbers, negative zero, sparse arrays and non-JSON objects. The
current equality/freezing helpers assume JSON-shaped data and do not establish
support for arbitrary structured-clone values. Do not promise arbitrary Date,
Map, cyclic object, function or custom-prototype persistence merely because some
can pass through a clone call.

**Smallest corrective direction:** define an admitted value algebra for both
checkpoints and events, including the own-undefined distinction already required
by current code. Use an unambiguous tagged encoding or equivalent lossless codec
that cannot collide with user payload objects. Preserve unknown *field names*
whose values are admitted. Unsupported value types produce a recording error and
an explicit boundary, not silent JSON coercion and not a failed ordinary edit.
Decoding must validate tags, own properties, numeric domains and resource limits
before invoking the graph applier. Do not erase undefined from live records to
make the archive serializer convenient.

Proof needed before adopting the format: wire round-trip baseline plus every
revision against the same canonical equality oracle, including own-undefined
creation/deletion, null/omitted collections, Unicode Cells, shared references,
unknown fields, linked definitions, margins and inline images. Reject malformed
and unsupported packets without modifying a validated state. Test collision-like
payload objects and dangerous property names. Stage B's
[presence tests](src/block-tree/compact-changes.test.ts#L83),
[structural parity tests](src/block-tree/compact-changes.test.ts#L10) and
[raw applier](src/history/replay.ts#L19) are the starting oracle, not substitutes
for wire tests.

## 5. Identity across reload is the central unresolved assumption

### What the codecs actually preserve

[Ordinary decoding](src/block-tree/codecs.ts#L42) allocates new graph keys for each
DTO occurrence and each inline Cell, sets counters to zero, and creates owned
placements. [Ordinary encoding](src/block-tree/codecs.ts#L140) expands shared
content for each occurrence, strips client-only standoff properties, can add focus
metadata, and flattens text Cells. Inline image export throws by default; explicit
legacy lossy export is a separate operation. Unplaced content records have no
ordinary tree position to export. Normalized authored IDs survive an ordinary
tree round trip; the complete canonical graph does not.

An especially consequential case is one shared paragraph `P` at two placements.
Its normal DTO contains two objects with ID `P`. Reopening produces two different
content records with ID `P`; [normalization](src/block-tree/identity.ts#L24) correctly
reports ambiguity. It must not guess that duplicate IDs mean shared content.
Workspace hydration repairs repeated references to a *whole Document* using
manifest resource IDs; it does not generally reconstruct sharing inside that
Document. See [materialization](src/reactive-editor/workspace-manifest.ts#L284)
and [shared-Document test](src/reactive-editor/workspace-manifest.test.ts#L69).

A receipt can identify which graph produced an artifact. It cannot prove that
decoding that artifact produces the same graph, or recover lost sharing without
adding semantics from the memoir. Letting the memoir silently choose live sharing
would also mean copying only the Document changes its editing behavior. This
qualifies the receipt/rebinding assumption in specification §4 and the saved-head
branch shorthand in §6.

### Identity domains and safe rebinding

Keep distinct:

- `resourceId`: the Document resource. Existing `metadata.documentId` is the
  strongest integration point; current fallback to the root Block ID needs an
  explicit adoption policy. Resource identity and root Block identity remain
  different concepts even if legacy data uses the same string.
- `memoirId`: one archive's identity. A lost archive followed by a fresh recording
  creates a new archive identity, with an honest missing-history boundary.
- `blockId`: authored identity. Preserve valid IDs; never interpret arbitrary
  opaque ID-shaped strings as references. Copy/fork policy must respect the
  specification's global uniqueness intent; resource namespacing alone does not
  resolve duplicated authored identities.
- Archive record and placement IDs: identify canonical contents, Cells and edges.
  Map runtime keys explicitly within a producer/segment. Existing raw keys may
  remain opaque local symbols in a frozen segment representation, but may not be
  treated as identities of newly decoded records or exported as permanent IDs.
- Projected occurrence: a historical route of archive edges, when required.
  One descendant placement can be reached along multiple routes through a shared
  ancestor. A durable placement ID alone does not always select one occurrence;
  preserve Stage B's route ambiguity. See [occurrence test](src/history/history.test.ts#L69).

A receipt should bind resource/memoir identity, save-attempt ID, source exact
revision, export/codec version, actual artifact byte hash/length, and a versioned
export mapping. Artifact-bound array locators can locate objects in those exact
bytes; they are not identities and are invalid for a different artifact. Bind the
*actual* decode to that evidence; never match newly generated keys or equal text
alone. Match authored IDs only when unambiguous, and record unresolved occurrence
continuity separately from known Block identity.

The server must hash the precise bytes it writes and the precise bytes it reads,
before adding filename metadata. The existing Workspace `contentHash` sorts parsed
object keys; it is useful optimistic-conflict evidence but is not the artifact
byte hash. Keep the two meanings separate. See [server load](server/document-store.ts#L71),
[Workspace hashing](src/reactive-editor/workspace-manifest.ts#L144) and
[export enrichment](src/reactive-editor/workspace-manifest.ts#L227).

### Recommended direction and decision still required

Prefer an explicit exact baseline for each newly decoded/enrolled segment, with
a saved-projection provenance link to the older revision. Reuse Block/placement
identity only where the export/decode mapping proves it. This handles regenerated
counters, removed transient properties and save-only metadata without rewriting
past revisions or seeding the live editor from an archived graph.

It does **not** automatically create an exact state-parent edge to the saved
revision. Such an edge requires a recorded, validated transformation from that
revision's canonical state to the new baseline. Otherwise the new segment is an
exact root with a provenance link, not a fabricated replay continuation. A known
save/load projection boundary is distinguishable from a missing-edit gap.

Before the plan, decide the supported ordinary-Document round-trip surface:

| Choice | Assessment |
| --- | --- |
| Treat receipts as sufficient to make every ordinary decode exact | Reject: contradicted by current codecs. |
| New exact load baselines, proven identity links, explicit projection boundaries; ambiguous imports remain history-ineligible | Smallest safe starting direction. Preserves ordinary file behavior and old exact states. Does not claim uninterrupted placement identity for unsupported cases. |
| Add a self-contained ordinary Document representation of sharing/occurrence semantics | Required if transparent continuity for those graphs is a first durable-release requirement. This is a Document codec/product contract change requiring a bounded design decision and tests, not something to hide in the memoir loader. |
| Replace ordinary load with the archived canonical graph | Reject: violates current-file authority and memoir independence. |

Normalizing missing IDs must happen at a deliberate enrollment boundary before
an undo stack exists, preserve the original file until Save, and report ambiguous
inputs without blocking ordinary editing. Assigned IDs/resource identity must
survive the first save or be recoverably associated with the unchanged initial
artifact. Do not repeatedly allocate new identities on every unsaved reopen.
Legacy artifact association remains a blocking enrollment question, not permission
to use the filename as identity.

## 6. Unsaved revisions, chronological order and save receipts

There are at least three independent facts: the editor's current branch/head, the
archive's durably stored records, and the current file's saved projection. One
`latestRevision` field cannot represent them.

For the familiar example, first assume an exact reload binding has been proven:

```text
File saved from R100
R101: stateParent=R100, previousJournal=R100
R102: stateParent=R101, previousJournal=R101
Server confirms history durable through R102
Crash; ordinary reopen reads the file saved from R100
R103 (next edit): stateParent=R100, previousJournal=R102
```

The old branch ending at R102 remains available to isolated history queries. The
new active branch starts from the file, not R102. R101/R102 are archived unsaved
material, not automatically applied edits. Viewing or recovering them through
product UI is later work; Stage C must preserve and expose the evidence needed
for that work without implementing restoration.

With the current lossy canonical round trip, use the more precise variant:

```text
Old segment S: R100 -> R101 -> R102 (all retained)
New segment T: baseline L100 = exact enrolled decode of the current file
L100.origin = saved projection of S/R100 (verified receipt)
L100 has no exact state parent unless an explicit bridge is recorded
R103: stateParent=L100
```

The archive's chronological record stream still places T's baseline declaration
after R102; the next revision's previous journal *revision* is R102 if baselines
are a separate record kind. Distinguish physical record sequence/hash from
`previousJournalRevisionId`: save receipts, checkpoints, segment declarations and
gap records are not editor transactions. Define this once in the durable envelope.
Never replay R101/R102 into T merely because they precede R103 on disk.

| Scenario | Required result |
| --- | --- |
| Reopen an older known saved artifact | Use its verified receipt/projection as origin; preserve all newer branches. Do not choose a checkpoint by maximum journal sequence. |
| Save R102 while R103 is edited during I/O | Receipt names R102's immutable export; R103 remains dirty. Current history may already be durable beyond the saved file. |
| File modified externally | File opens normally. If an exact import transformation can be proved, record that transition; otherwise create a new exact baseline with an external-change boundary. IDs/hash similarity do not reconstruct unobserved intermediate edits. |
| Missing/wrong receipt but otherwise valid memoir | Retain/query the old memoir independently; do not claim a saved-parent match. Re-enroll from the file with explicit unresolved lineage. |
| User discards dirty edits on close | Keep their durably archived revisions; ordinary reopen still uses the file. Discarding is not history expiry. |
| New unsaved Document | Allocate stable resource/memoir identity and stage its baseline/outbox before first save. First save binds a locator to the same resource; it does not drop its earlier edits. |
| Resource rename | Keep resource/memoir identity; update verified location association. A pathname is only a locator. |
| Save As an independent copy | Allocate a new resource and mutable archive; carry only explicit source provenance. Decide authored-ID copy/remapping policy before implementation; current Save As preserves payload IDs and cannot silently count as a globally unique independent copy. |
| Same embedded resource ID encountered in another file/tab | Do not silently share a mutable stream. Resolve copy/rename identity and writer ownership; fence stale writers. An identical hash is evidence of bytes, not proof of intended resource ownership. |

Save receipt publication must tolerate independent failures. Capture immutable
source/export evidence first; durably prepare a receipt where history is available;
write the Document through its normal storage path; finalize the receipt only
with exact file-write evidence and a durable source revision. A prepared receipt
alone is not proof a save occurred. If history is delayed/unavailable, ordinary
Save can succeed with a separate pending/unavailable receipt status. Preserve
enough outbox/server evidence to reconcile later; if it was lost, report the
boundary instead of inventing a source association. A matching artifact hash can
reconcile a surviving prepared receipt but cannot repair absent revision data.

Do not demand a cross-file transaction covering Document, memoir and Workspace.
Per-Document publication/receipt recovery is sufficient. For partially published
Workspace bundles, inspect each actual Document artifact and associate only the
bytes present. A manifest's intended hash is not evidence that all its Documents
were published. Strengthening ordinary file durability and serializing competing
Codex writes are targeted save-protocol prerequisites; they do not make external
filesystem editors transactional participants.

## 7. Resource scope: the minimum live partitioner

Stage C cannot enroll an entire Workspace in `MemoryHistoryStore` and call it a
Document memoir. The [scope check](src/history/memory-store.ts#L40) explicitly
rejects that. [Workspace enumeration](src/reactive-editor/workspace-manifest.ts#L155)
finds roots for export; it is not a temporal ownership algorithm. Specification
§6 already requires single-resource recording when several Documents share a
repository, so silently limiting Stage C to the standalone demo would narrow
the agreed scope.

The minimum required ownership model must establish:

- Each resolved Document's authoritative ownership, root and owned canonical
  closure, including Cells, margins, internal sharing and Document-owned definitions.
  Retain locally owned external edges plus stable target/source/version provenance
  where known; do not traverse them into foreign-owned state. The placement kind
  `owned` is not proof of resource ownership. Repeated Workspace windows onto the same
  Document are one resource, not multiple recorders.
- Before/after ownership for changed and deleted records/edges. Preserve ownership
  evidence before pruning; current focus or a post-edit tree walk alone is
  insufficient. Valid unplaced records also need an ownership rule; inability to
  attribute them is an explicit unsupported boundary, not silent omission.
- Whether a transaction affects no Document, exactly one resource, or several.
  Background/window layout and standalone Workspace Sticky Notes do not enter a
  Document memoir. A moved Document window is not a moved paragraph inside it.
- A valid resource graph with a resource root independent of the Workspace's
  external placement. Repeated root occurrences cannot arbitrarily select one
  window as durable Document identity. Global repository counters cannot simply
  be copied into a filtered stream that skips Workspace/other-Document commits:
  the current applier requires consecutive repository transitions.

A projected resource capture should retain the original source commit UUID and
provenance while explicitly defining its local graph/counter transition and key
mapping. This is a deterministic exact projection of canonical capture, not a
second semantic edit log. It must be checked against an independently extracted
before/after resource graph. Do not fork an editable hidden repository per resource
and reexecute commands to approximate this projection.

An explicit external reference is an owned edge to a foreign-owned target, not
multiple ownership of the target or an unsupported transaction by itself. Editing
Workspace-owned D or B-owned X creates no A revision when A's own state/reference
is unchanged. Preserve unavailable/unknown source provenance explicitly; do not
refresh pins or infer target versions from timestamps. Exact owned history remains
valid if the target memoir disappears. A truly ambiguous owner or unsupported
ownership transfer still requires an affected-resource boundary; unrelated resources
continue. No cross-memoir atomic ownership-transfer protocol is introduced.

The final plan must prove the minimal external-descriptor projection/read adapter:
current canonical validators must not receive dangling placements, synthetic
owned targets or copied foreign definitions to simulate closure. Baselines and
exact deltas must capture descriptor transitions as well as owned state. Existing
structural-oracle tests prove local counters and selected transitions, not this
new descriptor contract. See [pre-plan results §3](BLOCK_SCOPED_HISTORY_STAGE_C_PREPLAN_RESULTS.md#3-exact-resource-projection-within-authoritative-ownership)
for query contracts and the required early implementation tests.

## 8. Memoir storage: directory-local `.memory`

The accepted user-facing convention groups all history infrastructure beneath the
Document's immediate filesystem parent's reserved `.memory`. Each subdirectory
uses its own `.memory`; never inherit an ancestor's store. Create it lazily only
when historical state needs preservation and the location is safely admitted.

```text
My Notes/
    poe.json
    keats.json
    .memory/
        resources/<resource-id>/<memoir-id>/
            manifest.json
            journal.jsonl
            checkpoints/
            segments/
```

Internal names are illustrative. Use per-memoir manifests, immutable independently
loadable checkpoint/segment blobs and an active framed journal, as supported by
[pre-plan storage measurements](BLOCK_SCOPED_HISTORY_STAGE_C_PREPLAN_RESULTS.md#5-checkpoints-and-physical-archive-layout).
The previously proposed visible `poe.memoir.*` files are superseded. There is no
shared directory memoir, database, opaque project container or Workspace history.

| Artifact | Role and authority |
| --- | --- |
| Authored Document JSON | Complete usable owned authored state and references, independent of history availability. |
| Per-memoir manifest and records under `.memory` | Stable resource/memoir identities, baselines, exact revisions/ancestry, receipts, boundaries and verified generation evidence. |
| Per-memoir immutable blobs and active journal | Exact owned state and reference records; bounded reads, framed tails and lossless consolidation. |
| Directory management marker / optional discovery index | Compatible-store admission / rebuildable resource-to-memoir locators. Neither is historical replay authority. |
| Browser outbox | Bounded immutable pending packets and enrollment evidence, keyed by resource/memoir/writer, independent of filename. |

Discovery validates resource/memoir identity and receipt/enrollment evidence inside
the immediate parent's store. Paths and equal IDs/hashes are not sufficient proof
of writable continuation. A same-directory rename retains identity; a whole-directory
move including `.memory` carries the locality with it. A directory copy including
`.memory` transports its archives, subject to verification; excluding it transports
usable Documents without history. Copying only a Document does not entitle it to
append to another file's memoir just because its IDs match.

Codex-controlled cross-directory moves preserve identities through a fenced,
verified, recoverable handoff of one memoir. Keep source evidence until destination
publication and relocation evidence are durable; file movement and history movement
are not an atomic multi-file transaction. On uncertain recovery suspend attachment,
not ordinary Document usability. External file moves/deletion leave retained orphans;
do not search ancestors, infer deletion consent or auto-merge copied archives.
Independent Save As copies allocate new resource/memoir identities and use the
accepted Block/Placement copy rules. Duplicate filesystem IDs remain a reported
association conflict until intent/evidence establishes a copy, move or replica.

A missing, excluded, read-only, unavailable or partially copied `.memory` never
prevents ordinary Document opening/editing/saving. Report archive coverage and
pending durability accurately. Preserve unrecognized data, orphan histories and
conflicting generations. Limit garbage collection to proven redundant physical
files after recovery/publication checks; no orphan deletion or expiry in Stage C.
An optional bounded directory index rebuilds from per-memoir evidence; no index entry
can confer writer authority. Local writer locks do not fence disconnected sync copies.

A pre-existing unrecognized `.memory` directory, file or unsafe link is a storage
collision. Never overwrite/adopt it merely by name, even if empty. Safely claim new
stores exclusively with a versioned marker; keep current Documents usable on
collision and report history status. Backup/sync inclusion and consistent snapshot
copying must be explicit; partial/conflicting deliveries require validation, not
last-writer-wins repair.

Legacy normalization binds new identities once without rewriting the source file.
For a known path, retain durable enrollment evidence under that parent's `.memory`;
first deliberate Save writes modern IDs. Untitled resources remain in the bounded
browser outbox until a destination is chosen; there is no implicit global/ancestor
server store. The first Save elsewhere follows the same handoff and receipt rules.

The [pre-plan results §5](BLOCK_SCOPED_HISTORY_STAGE_C_PREPLAN_RESULTS.md#5-checkpoints-and-physical-archive-layout)
provide the full lifecycle matrix, safe cleanup rules and tests required by the
final plan. The existing layout/append labs establish publication primitives, not
production `.memory` discovery, relocation, sync or collision handling.

## 9. Durability protocol and honest acknowledgements

Track separate watermarks for captured/queued, browser-committed, server-durable,
and replay-verified data. Also track the saved-artifact receipt and derived-index
coverage. These are status concepts; their final API names are not prescribed.

| Boundary reached | Truthful promise |
| --- | --- |
| Repository commit only | Edit exists in the live editor. A synchronous capture error or crash before durable enqueue can lose its history. Ordinary commit/undo behavior remains successful. |
| Immutable RAM enqueue | Exact event is queued while the process survives. This is not persistence. |
| Browser outbox transaction complete | Packet is committed to origin-scoped browser storage under the selected durability mode. It can be retried after a supported browser restart; it is not yet server-confirmed. Quota, eviction, clearing and origin changes remain separate failure cases. |
| Server has received/written bytes but not completed its promised sync | Request may survive or may be retried. Do not show server-durable status. |
| Server durable acknowledgement | The identified verified record prefix and its required baseline/identity dependencies have crossed the stated filesystem durability boundary. It can be recovered without that browser's outbox. |
| Replay verification complete | Exact reconstruction is validated through a named branch revision. Durable bytes alone do not prove a previously unseen payload is replayable. |

IndexedDB distinguishes strict, relaxed and default durability; select and report
the supported behavior rather than assuming every completed transaction implies
the same physical write boundary. See the [IndexedDB specification](https://www.w3.org/TR/IndexedDB/#transaction-durability-hint).
The browser outbox is an asynchronous reliability layer, so even strict mode does
not close the interval before enqueue completes. Ports/origins can have different
outboxes; server-confirmed history must be shared through the resource archive.

Server acknowledgement should follow completed, serialized writes and explicit
file synchronization, with directory/publication synchronization as required by
the supported filesystem. Node exposes `FileHandle.sync()`; successful
`writeFile()` or `rename()` alone is not the intended durable-ack contract. Its
documentation notes OS/device-specific behavior, so a universal power-loss
guarantee would be unjustified. Define and test the supported local platform
boundary. See [Node 22 filesystem documentation](https://nodejs.org/download/release/v22.12.0/docs/api/fs.html#filehandlesync).

Protocol properties needed before choosing an implementation:

- Frame records with declared kind/version, bounded byte length, checksum/hash,
  sequence and previous-record hash. Bind the journal header to resource, memoir
  and archive generation. Hash specified stored bytes, not incidental later JSON
  reserialization. Integrity hashes detect accidental damage; they are not an
  authenticity or tamper-proofing claim.
- Serialize writes per memoir. Use a server-issued writer epoch/fencing token and
  expected journal head; record the actual state parent independently. A single
  active writer is the smallest first-pass policy. The lock must cover every
  supported server writer, including restart/two-process behavior, not merely
  two requests through one in-memory object.
- Stable record/revision IDs plus immutable payload hashes make retries
  idempotent. Check an identical already-accepted prefix before rejecting its old
  expected head; the first acknowledgement may have been lost. Same ID with
  different content is a conflict. Overlapping batches acknowledge the accepted
  prefix and validate only the suffix under the same writer rules.
- Acknowledge a contiguous record watermark/hash and explicit accepted IDs where
  needed. Persist the necessary baseline/map before acknowledging dependent edits.
  Keep a distinction between structurally accepted bytes and replay verification
  so expensive graph indexing is not required for append. Unknown/invalid data
  cannot be advertised as verified history.
- Batch disk sync by bounded time/bytes independently of sentence boundaries and
  explicit Save. The specification's 250 ms/1 MiB values are experiment inputs,
  not proven defaults. Limit both packet bytes and event count; large structural
  edits need an atomic framing strategy, not truncation to fit a typing budget.
- Delete browser outbox records only after a matching server acknowledgement is
  recorded. A lost acknowledgement produces safe retry, not duplicate revisions.
  A stale writer's outbox remains recoverable evidence; never rewrite its parents
  to attach it to the server's latest branch.
- Drain continuously during use. Normal close may request a bounded flush, but
  cannot rely on `beforeunload`, a final network request or editor disposal to
  finish it. Quota/disk-full/backlog policy must bound memory while leaving editing
  available and explicitly marking any uncaptured tail.

For application-controlled Document switching, transfer pending packets to the
outbox owner before disposing the recorder; completion can be awaited there.
Browser termination or an OS crash has no equivalent reliable final callback.
The release's close/reopen promise must distinguish those cases and state which
watermark survived. On server restart, recover accepted IDs/hashes and branch
heads from authoritative records before accepting retries; an in-memory dedupe
map or remembered active branch is not recovery evidence. New writer epochs must
fence old requests even when the server process that granted them no longer exists.

Recovery verifies a base and contiguous framed prefix before exposing it.
An incomplete final frame can be quarantined/truncated to the last valid boundary
when it is genuinely an uncommitted tail. A complete frame with a bad checksum,
an interior gap, or evidence of loss within an acknowledged range is corruption,
not automatically a harmless tail. Never skip a damaged parent and replay its
descendants. Previously verified independent branches/checkpoints can remain
available if their complete dependencies are intact. Preserve damaged bytes for
diagnosis/recovery; do not silently rewrite them into a supposedly complete file.

## 10. Checkpoints, consolidation and derived data

Keep the initial baseline and all exact revisions. A checkpoint accelerates access
to a state; it does not replace revision identity, state ancestry or retained
intermediate edits. Saved-file receipts and branch roots must stay reconstructable
even if they are older than the active branch. Stage B's 500-commit/8 MiB interval
and 64 MiB checkpoint cap are not production policy.

For the selected immutable layout, consolidation takes a fixed verified prefix,
writes and validates its immutable files, then synchronizes and publishes a new
per-memoir manifest generation under `.memory`. It rotates only the incorporated
journal prefix while preserving concurrent
tail appends. Serialize the rotation/head transition. A crash before rotation
leaves duplicate records which recovery verifies/deduplicates; it must not leave
an archive that points to a removed baseline or discarded tail. Keep the old
generation until the new generation and its journal binding are recoverable.
This ordering needs injected failures at every publication step. It is not
sufficient to say both files are individually renamed atomically.

Lossless consolidation changes layout, removes duplicate storage and may compress
data or discard redundant *derived* checkpoints if every revision remains exactly
reconstructable. It cannot make an unlimited stream of distinct edits occupy a
fixed amount of storage. Retention/expiry would delete historical information and
remains later work. Do not use Stage B's finite-cap behavior as an expiry policy;
report capacity problems without claiming a continuous archive.

Rebuild timeline indexes and sentence groups from exact data. No derived cache is
required in the first authoritative format. An optional persistent acceleration
cache must declare memoir/segment identity, verified coverage, branch, scope,
algorithm version and relevant policy/locale options. Corrupt or stale cache data
is discarded; it never repairs a gap. Sentence groups reference exact member IDs
and normally present their endpoint. Regrouping cannot rewrite archived revisions,
change replay parents, hide an exact query target or touch undo/redo.

Retain the isolated [history source](src/history/source.ts) boundary for server or
browser readers. Opening the Document should load its file and small history
metadata, not reconstruct every historical state or rebuild every timeline.
`getStateAt` follows ancestry and verifies the requested segment; `getSubtreeAt`
and `getLocationAt` retain occurrence/content distinctions; `getTimeline` uses
historical before/after membership; `compareSubtree` remains non-comparable when
required owned replay evidence is incomplete. Owned definitions and external
reference/provenance descriptors are captured data; closures and resolver caches
are derived. `getSubtreeAt` stops at external edges, `getLocationAt` reports the
local reference occurrence rather than a foreign target location, and timelines/
comparisons exclude foreign-only changes. Unchanged unpinned references prove
reference equality, not target-content equality. Unknown/unavailable external
history has a separate per-target status and does not make owned state incomplete.
Never substitute live external state. Missing owned records or state parents is
an exactness gap; local verification/acknowledgement never waits for a foreign memoir.

## 11. Performance and storage: measured facts versus estimates

Stage B typing measured 108 mode/workload rows with five warm-up and twenty
measured cycles. The following are **maximum raw JSON event bytes**, not framed
durable packet sizes:

| Paragraph | Full capture | Compact capture | Sequence keys retained: full / compact |
| --- | ---: | ---: | ---: |
| 100 characters in a 1,000-character Document | 11,848 B | 1,941 B | 201 / 1 |
| 5,600 characters | 550,852 B | 1,947 B | 11,201 / 1 |
| 25,000 characters | 2,452,054 B | 1,951 B | 50,001 / 1 |

This proves edit-sized retained sequence data for those supported edits. It does
not prove O(edit-size) execution: prefix/suffix verification scans the sequence;
nested payload comparisons, existing editor mutations and undo allocations still
scale with content. At 25,000 characters the typing benchmark reports 95.361 ms
compact median/233.396 ms p95 versus 86.234/167.883 ms capture-off. The untimed
structured-clone accounting remains about 6.13 MB per sampled typing operation
with compact capture; it excludes JavaScript spread copies. Retained undo data
is about 122.58 MB in that typing workload in every capture mode. Do not change
undo granularity to conceal that cost. Stage A's older latency numbers are a
different run; do not present cross-run differences as a controlled speedup.

History-service measurements from the Node 22.12/macOS ARM64 artifact:

| Fixture; edit count; checkpoint interval | Median drain | Cold / warm state | Timeline | Grouping |
| --- | ---: | ---: | ---: | ---: |
| 100 chars; 120; 20 | 1.635 ms | 25.313 / 0.053 ms | 1.823 s | 0.025 s |
| Same; 120; 100 | 1.840 ms | 31.145 / 0.011 ms | 4.705 s | 0.008 s |
| 5,600 chars; 30; 10 | 79.662 ms | 479.773 / 0.019 ms | 14.916 s | 9.953 s |
| 25,000 chars; 12; 5 | 535.060 ms | 773.797 / 0.132 ms | 27.519 s | 12.459 s |
| 5,600 chars, 500 annotations; 20; 10 | 87.256 ms | 526.117 / 0.074 ms | 10.809 s | 6.814 s |
| 300 sibling paragraphs; 30; 10 | 43.941 ms | 552.138 / 0.027 ms | 6.070 s | 5.301 s |

These are finite in-memory workloads with explicit flush after each edit,
queue high-water one, and sequential queries that influence cache warmth.
They do not measure sustained input/backlog, disk I/O, fsync, browser outbox,
compression, cold process reopen or production throughput. The 25,000-character
drain p95 is 1,212.203 ms. Moving that drain into `setTimeout` does not make it
off-thread; a median of 535 ms already consumes more than the 200 ms interval in
an illustrative five-edit/second workload.

The large fixture retains 13.38 MB mirror, 26.76 MB state cache, 53.52 MB across
four checkpoints and 3.72 MB revision records, plus 31.88 MB existing undo data.
These are encoded-size estimates, not measured heap residency. The history
benchmark totals include a split and its undo/redo **after** the typing queries;
do not divide 3.72 MB by twelve to estimate one keystroke. A large split revision
is about 1.23 MB. Dense annotation updates likewise need separate accounting.

Illustrative, uncompressed sizing using 1,951 B per simple edit and an approximately
13.38 MB full checkpoint; decimal MB/GB throughout this paragraph:

- Five simple edits/second: about 9.76 KB/s or 35.1 MB/hour of event payload;
  twenty/second: 39.0 KB/s or 140.5 MB/hour. These are chosen workload rates, not
  measured user behavior or promises about achievable typing throughput.
- 100,000 such edits: about 195 MB event payload. Checkpointing every 500 would
  add roughly 200 × 13.38 MB = 2.68 GB, plus baseline, envelopes and maps. Naively
  retaining frequent full checkpoints can dominate a roughly 2.9 GB archive.
- One minute offline at five edits/second: about 0.59 MB simple-edit payload,
  **plus** a baseline if not yet durable, framing, identity records and any large
  structural events. A 1,024-event queue may be about 2 MB of simple events or
  vastly larger; count-only limits are insufficient.
- Thirty-two MiB of cache accommodates only about two of these full states.
  Persistent storage must allow eviction of in-memory history independently of
  durable retention. A worker's cloned graphs/messages also consume memory.

Measurements needed before defaults or layout freeze:

| Experiment | Decision it informs |
| --- | --- |
| Durable codec encode/decode/hash sizes and p50/p95/p99 cost across typing, paste, split/join, annotations, sharing and unknown fields | Packet limits, outbox bytes, codec overhead and preservation of compact capture benefit. |
| Sustained foreground editing with outbox, server sync, slow/offline transport and recovery; include browser/main-thread pauses and heap high-water | Whether worker ingestion is necessary, batch latency, backpressure and acknowledged-loss window. |
| Checkpoint load/apply/validation at several spacings and branch depths, with caches cold and histories of realistic duration | Replay budget, checkpoint spacing and lazy loading. A timer/byte threshold alone does not bound replay cost. |
| Whole sidecar streaming rewrite/open versus immutable chunks, at hundreds of MB and multiple GB | Selective-access and transient disk-space/consolidation limits for the selected immutable layout; original alternatives remain measurement controls. |
| Lossless compression and repeated Cell/key/checkpoint data | Actual archive size; no compression ratio is assumed here. |
| Ownership projection under Workspace-only edits, deletes and multiple Documents | Correct local-counter mapping and whether hidden whole-Workspace scans undermine capture responsiveness. |
| Process kill, browser restart, write faults, short writes, stale writers and supported-platform sync behavior | The exact durability statement and recoverable boundary. |

At minimum, recording must sustain the chosen workload without an ever-growing
queue, and ordinary open must not wait for historical indexing. Keep existing
graph validation as the correctness oracle; incremental validation/checkpoints
are options to investigate, not permission to weaken exactness.

## 12. Minimum persistent envelope and compatibility policy

The first durable format needs explicit versions independent of ordinary Document
and extended-repository versions. Minimum information, without fixing interfaces:

| Record/envelope | Required meaning |
| --- | --- |
| Archive header | Format/version, required feature set, resourceId, memoirId, identity/value/patch codec versions, generation and integrity base. |
| Segment baseline | Segment ID and baseline ID, exact owned graph plus external reference/provenance descriptors, archive-key namespace/maps, authoritative ownership evidence, optional saved-projection/import origin and explicit continuity status. |
| Exact revision | Original commit UUID, segment/producer identity, exact state parent, previous journal revision, captured timestamp/cause/commands/hints, exact changes; source/global and local counters distinguished if resource-projected. |
| Physical journal frame | Record ID/kind, sequence, previous-frame hash, byte length and checksum/hash; writer fencing evidence. Non-revision records do not impersonate edits. |
| Checkpoint | Target segment/revision, owned graph and external descriptor codec versions/integrity; sufficient local ancestry/base evidence to validate its use. No foreign target snapshot prerequisite. |
| Receipt | Save-attempt/resource/memoir IDs, source revision, export version/map, exact artifact hash/length and prepare/finalize evidence. |
| Boundary | Reason and last proven head, known affected resource/segment, new baseline/origin if available. Never label missing history as a deletion. |

Retain raw supported packets and stable IDs across consolidation. Unknown optional
metadata may be preserved opaquely only when its version explicitly declares it
non-authoritative. Unknown patch operations, value tags, required features or
checkpoint versions stop dependent replay. They must not be skipped merely
because a later record looks understandable. Already supported earlier prefixes
can remain readable with an explicit boundary.

An older Codex must not overwrite or consolidate a newer unsupported memoir,
including unknown fields it cannot round-trip. Allow ordinary Document editing;
leave the archive untouched and report unsupported history. If separately starting
a compatible archive is permitted, it must use a new memoir identity and preserve
the old artifact. That is a declared new recording, not an in-place downgrade.

No historical durable format exists to migrate today. Implement a version gate
and test fixtures, not a general migration framework. Future migration must be a
verified rewrite to a new generation that preserves revision identity and leaves
the original recoverable until publication succeeds. Wire/schema migrations must
not be run through live editor commands or reinterpret unknown reference strings.

## 13. Failure analysis and Document independence

History availability and Document usability are separate. Retain Stage B's
`available`, `deleted` (content/placement), `unplaced`, `absent-occurrence`,
`ambiguous-occurrence`, `unknown-block`, branch-specific `not-yet-created`,
`incomplete` and `unsupported` query distinctions. Add resource-level recording
status/reason and exact coverage, rather than overloading “deleted” for a missing
memoir. `invalid` replay errors should become explicit corruption diagnostics at
the storage boundary, not an uncaught exception that prevents Document Open.

| Failure point | Authority and recovery | Honest history result / required protection |
| --- | --- | --- |
| Capture/encoding fails after an ordinary commit | Live editor still contains the edit; earlier archive prefix remains authoritative. | Recording boundary at the failed commit; no rollback of the edit and no claim of complete capture. |
| Crash before browser enqueue commits | Current file plus server history survive; RAM tail may not. | Do not invent unknown lost revisions or promise their count. Resume from file evidence. |
| Browser outbox committed; server unreachable | Retry the same immutable packets and dependencies after restart. | Pending server durability; bound RAM and local storage. |
| Browser quota/clearing/origin change | Server-confirmed data is independent; unconfirmed local packets may be unavailable. | Preserve last known coverage; report local recording failure/gap without preventing Save. |
| Partial append or server crash before sync | Recover only verified complete frames; retry retained outbox. | An incomplete uncommitted tail is recoverable; acknowledged/interior damage is not silently discarded. |
| Server sync completes; response is lost | Retry IDs/hashes and receive the existing accepted result. | No duplicate revision and no false stale-head rejection of an identical retry. |
| Disk full or new baseline cannot be persisted | Retain prior valid archive; bounded outbox retries if possible. | No acknowledgement of edits whose required baseline is absent. Document save failure/success is reported independently. |
| Stale tab/server writer | Fence append, retain its pending evidence and actual parents. | Never rebase by changing UUIDs/parents or interleave into an incompatible branch. Ordinary editing remains possible with history status. |
| Document write fails after history is durable | Old Document file remains current; new branch stays archived. | Dirty state remains; no completed save receipt. |
| Document write succeeds; receipt finalization fails | Actual file bytes are authoritative. Reconcile surviving prepared receipt and durable source revision by hash. | Save may succeed with history warning; absent evidence means unresolved origin, not failed Document Open. |
| New edits arrive during save | Save evidence still names captured export; new live state remains dirty. | Never bind receipt or clean state to the later integer/UUID. Cover split Workspace orchestration too. |
| Workspace process dies between file publications | Each existing Document file and its individual receipt evidence govern; manifest may reflect an older/partial bundle. | No inferred all-Document save transaction; preserve current load issues and per-resource warnings. |
| Consolidation interrupted before/after manifest publication or journal rotation | Choose a verified generation and preserve/reconcile any exact duplicate prefix and tail. | Never delete the only baseline, an unincorporated revision, or evidence needed by a saved receipt. |
| Memoir missing or deliberately not copied | Open/edit normal Document. A journal is usable only with its required matching baseline. | History unavailable or a new baseline with new memoir ID; no continuity claim based on basename. |
| Memoir corrupt / checkpoint missing | Preserve damaged data and usable independent prefixes/branches; rebuild only derived data. | Explicit incomplete coverage. Do not reconstruct from the live repository or skip missing parents. |
| Memoir belongs to another resource | Leave it untouched; verify resource/artifact association. | Identity mismatch/unavailable history; never overwrite the collision. |
| Unsupported newer archive/patch | Preserve bytes and supported readable prefix if any. | Unsupported history; ordinary current Document remains usable. No downgrade write. |
| External edit or ambiguous duplicate IDs | Open actual file through ordinary codec; record only proven associations. | New baseline/boundary or ineligible recording; never coalesce Blocks by guessed identity. |
| Derived index/group/cache missing or corrupt | Rebuild lazily from exact records, or use correct slower queries. | No exact history loss, no effect on dirty state, focus or undo. |
| External Block/asset/definition history unavailable | Owned state and captured reference/provenance remain exact. | Target-specific unresolved/unavailable status; no foreign snapshots, live fallback or dependency-only revision. |

Before release, exercise these paths with faults, including repeated retries and
restart at each durable boundary. Existing [Document storage tests](server/document-store.test.ts)
cover path safety, create-only races and indexing warnings;
[Workspace storage tests](server/workspace-store.test.ts) cover validation and
content-hash conflict behavior. Neither suite proves the new crash protocol.
Reuse their confined-path rules for memoir locations and protect existing files;
do not add an unconstrained arbitrary-path write API.

## 14. Findings to carry forward

### Facts established by the current implementation

- Exact capture/replay, ancestry separation, immutable query isolation and
  independent grouping are proven for the supported normalized in-memory cases.
  Current undo/redo remains independent and must stay so.
- Compact typing capture removes paragraph-sized retained sequence copies, but
  replay/indexing and existing editor/undo work remain substantial. The memory
  store's throughput and capacities are not durable-production defaults.
- Normal application recording is not enabled. Save/open lacks artifact receipts,
  durable acknowledgements, cross-session maps and a live resource partitioner.
- Ordinary JSON loses canonical details; shared-content reload can become
  identity-ambiguous. Even extended checkpoint JSON currently loses own-undefined.
  Stage A's public-ID round-trip proof does not establish graph rebinding.

### Architectural decisions safe to carry into Stage C

- Keep exact revisions as replay authority; state ancestry is separate from
  journal order, grouping and undo. Preserve every retained revision ID.
- Record continuously from canonical compact capture, with bounded asynchronous
  durable enqueue/append; prepare historical queries separately and lazily.
- Keep current Document files authoritative and independently usable. Save
  receipts describe exact exported artifacts and their source, not automatic
  equality with decoded canonical state.
- Use per-Document resource/archive identity, single-writer fencing, idempotent
  append, explicit availability boundaries and lossless maintenance. Preserve
  unsupported data rather than guessing or overwriting it.
- Exact closure stops at authoritative Document ownership. External reference
  records survive without target history; foreign-only changes create no local revision.
- Use manifests, immutable chunks and active journals under immediate-parent
  `.memory`. Directory locality does not merge memoirs; discovery indexes are
  rebuildable and no database is introduced.

### Remaining implementation/release measurements

- Lossless wire codec and identity-map overhead; resource projection cost;
  baseline/reload mapping prototypes over real Document/Workspace fixtures.
- Browser outbox durability/throughput, server sync batching, worker boundaries,
  byte budgets and supported crash guarantees.
- Checkpoint spacing, bounded immutable-chunk reads, compression, cold-open
  metadata cost, directory discovery/index contention and long-history queries.

### Planning readiness and early proof gates

The portable spike, bounded pre-plan results and subsequent ownership/locality
decisions settle the original pre-plan architectural questions sufficiently to
write the final plan. No remaining environmental-closure blocker is identified.
These decisions do not claim production code already supports them. Carry forward:

1. Explicit canonical load baselines/projection links, read-old/write-new identity
   enrollment and durable pre-save evidence; no guessed exact reload parent.
2. Lossless value admission and bounded parsing for baselines and exact deltas.
3. Authoritative ownership plus external-descriptor projection, local counters,
   isolated query statuses and the tests in pre-plan §3. Do not install the
   whole-Workspace scanning oracle on the input path.
4. Bounded outbox/server fencing and integrated fault-injected recovery, save
   receipts and truthful platform-qualified acknowledgements.
5. Directory-local discovery, rename/copy/move/legacy lifecycle, collision handling,
   partial-sync recovery, conservative cleanup and the tests in pre-plan §5.

The final plan should sequence the unproved projection and storage adapters early
and stop if they expose a false architectural assumption. The new contracts do
not authorize production implementation, a stable wire schema declaration or
expansion into Stage D–E.

### Proposed Stage C scope and explicit non-goals

Stage C should deliver one per-Document durable vertical slice: deliberate
identity enrollment, exact lossless archive records and baselines, the minimum
live ownership/external-reference projection, directory-local `.memory` storage,
bounded outbox and server append/read/recovery,
separate save receipts and explicit reload/branch boundaries, lossless
consolidation, lazy isolated history access, and measured failure/performance
evidence. Include minimal recording/availability diagnostics needed to avoid
false durability claims; preserve ordinary save/open and undo/redo regression
coverage. Do not enable recording across unsupported resources without a declared
boundary.

Do not include cross-Document biography/catalogues, coordinated ownership transfers,
Workspace memoirs or layout history, destructive retention/expiry, in-place
restoration, historical rendering/playback UI, historical-copy insertion,
CRDT/multi-writer collaboration, new undo grouping, extra grouping policies,
semantic/AI history, or asset-byte versioning. Stage C preserves the exact data
and read contracts these later features may use; it does not implement them.

The [final Stage C plan](BLOCK_SCOPED_HISTORY_STAGE_C_PLAN.md) carries the accepted
ownership and `.memory` decisions into an implementation sequence with explicit
early proof and stop gates. This investigation remains supporting evidence; no
Stage C or production Document-format implementation is claimed here.
