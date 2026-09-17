# Block-scoped history — Stage C implementation plan

Date: 2026-09-17. Status: final implementation plan, with mandatory early proof
gates. This document authorizes no code execution by itself; the current task is
planning. No Stage C or production Document-format implementation is claimed.

Requirements: [history specification](BLOCK_SCOPED_HISTORY_SPEC.md), the accepted
[portable Document direction](PORTABLE_CODEX_DOCUMENT_FORMAT_SPIKE.md), and the
settled ownership and directory-local `.memory` contracts in
[pre-plan results §§3 and 5](BLOCK_SCOPED_HISTORY_STAGE_C_PREPLAN_RESULTS.md).
Supporting evidence: [Stage B completion](BLOCK_SCOPED_HISTORY_STAGE_B_COMPLETION.md)
and [Stage C investigation](BLOCK_SCOPED_HISTORY_STAGE_C_INVESTIGATION.md).
Where older investigation alternatives differ, the subsequent accepted contracts
and this implementation sequence govern. Experimental success is not production
readiness; the gates below close the remaining implementation proofs.

## 1. Deliverable, scope and fixed requirements

Deliver a per-Document durable history service connected to explicit enrollment
of eligible live Documents, including Documents in a shared Workspace repository.
Record successful committed changes continuously, independently of deliberate
Save, and reconstruct retained owned states after process/browser restart through
isolated, bounded readers. Ordinary Documents remain independently usable.

Stage C includes the minimum production portable-format/read-old/write-new
integration needed for semantic identity and save receipts, after its early
descriptor proof. It does not ship the experimental codec as a stable format or
enable history on every file before admission/performance gates pass. The first
integrated slice is explicitly enrolled; production-default rollout is separate.
Record the enrollment policy and supported surfaces in the completion report.

The following are requirements, not options to reopen during implementation:

1. **Owned exactness.** Reconstruct all historically Document-owned state and its
   locally owned references/provenance. Internal sharing resolves at that local
   revision. Stop traversal at authoritative resource ownership, not merely an
   internal Block-tree boundary. Placement kind `owned` is not resource ownership.
2. **External independence.** Do not archive foreign target state merely because
   it is referenced. Preserve known source resource/scope, target identity and
   recorded version/occurrence evidence. Unknown/unpinned provenance stays explicit.
   Foreign-only changes generate no local revision, counter increment or timeline
   event. Missing external history is a target availability result, not local
   corruption. Never substitute the current target or infer a pin from timestamps.
3. **Separate authorities.** Exact captured revisions/checkpoints authorize replay.
   Sentence groups are derived, retain every member revision ID and normally
   present their endpoint. Editor undo/redo, stack granularity and single-source
   causes remain unchanged. Commands describe committed effects; reconstruction
   never reexecutes commands. No `UndoGroup` or grouped reversal is introduced.
4. **Separate identities.** Preserve authored Block IDs, persistent semantic
   Placement IDs, resource ID, memoir ID, segment identity and exact revision UUIDs.
   Runtime Content/Placement/Node keys remain private segment-local symbols.
   A shared container edge can occur through several routes; an occurrence route
   is not an extra authored edge. Copies allocate new authored/placement identities;
   identity-preserving moves retain them. Do not redefine Block identity as a
   `(resourceId, blockId)` pair to conceal duplication.
5. **Explicit reload boundary.** Portable semantic equality does not imply exact
   canonical equality. Open the actual file, establish a fresh canonical baseline
   and retain proven saved-projection provenance. Do not manufacture a state-parent
   edge across regenerated runtime keys, Cells, counters or field-presence changes.
6. **Directory locality.** Store all history infrastructure in the immediate
   parent's `.memory`. Each subdirectory has its own store; no ancestor inheritance
   or centralized fallback. Stable IDs authorize associations; paths locate files.
   Colocation and external references do not merge memoirs.
7. **Independent portability.** A Document without its memoir remains usable.
   Copying a directory with `.memory` transports its archives subject to verification;
   excluding it omits history. No on-open file rewrite, prerequisite disk migration,
   automatic foreign-content copy, or required history database is permitted.
8. **Truthful durability.** Captured, browser-committed, server-stored, replay-verified
   and deliberately saved are different watermarks. Missing local parents/baselines
   block exact reconstruction; missing foreign memoirs do not block local append,
   acknowledgement, verification or consolidation.

Excluded: Workspace memoir/layout history, cross-Document biography/catalogues,
coordinated Block ownership transfers, distributed collaboration/merge, destructive
retention or orphan expiry, historical rendering/scrubbing UI, restore/copy from
history, asset-byte versioning, new grouping policies and word-oriented undo.
Relocating one memoir between directories is included; it is not transferring
Blocks between resources. Minimal current-Document unresolved-reference handling
and recording/availability diagnostics are required, not a new history UI.

## 2. Evidence and actual integration seams

| Existing code/evidence | Consequence for Stage C |
| --- | --- |
| [compact-changes.ts](src/block-tree/compact-changes.ts), [repository.ts](src/block-tree/repository.ts) | Reuse immutable `subscribeHistoryChanges` events and existing capture routes. Small contiguous edits avoid unchanged sequence copies, but prefix/suffix scanning and editor/undo work remain O(paragraph length). Do not add a full-record observer or snapshot per commit. |
| [replay.ts](src/history/replay.ts) | Existing exact preimage/root/counter checks are reusable. The current applier clones and validates a closed `RepositoryState`; external targets require an explicit projection/validation adapter, not a type cast or dangling graph. |
| [memory-store.ts](src/history/memory-store.ts), [source.ts](src/history/source.ts) | The memory store creates private single-Document producers and exposes whole ancestry arrays. Do not force live enrollment or durable paging through that producer lifecycle. Preserve its tests while extracting only shared read/replay contracts needed by the durable reader. |
| [query.ts](src/history/query.ts), [index.ts](src/history/index.ts), [grouping.ts](src/history/grouping.ts) | Root-registry lookup and whole-ancestry/group scans are not the durable adapter. Introduce resource-aware reads and bounded iteration without changing occurrence/exactness semantics or making derived indexes authoritative. |
| [projection oracle](src/history/preplan-spike/projection.ts) | Independent pre/post extraction proves selected structural transitions/local counters. Its reachability-based ownership and rejection of cross-resource sharing do not implement the settled external-reference policy. Whole-Workspace scans cannot be the live recorder. |
| [portable codec spike](src/block-tree/portable-spike/codec.ts) | Unique definitions/placements and semantic round trips are proved. External descriptors, missing-target editing, transaction-time binding, production schema admission and real persistence remain unproved. Keep its fixtures as evidence. |
| [persistence.ts](src/reactive-editor/persistence.ts), [workspace-manifest.ts](src/reactive-editor/workspace-manifest.ts) | Save/Open, late resolution, Workspace materialization and exports use legacy DTOs. Integrate one format-dispatch/normalization boundary, immutable save snapshots and per-resource receipts; do not substitute global Workspace counters for resource history. |
| [document-store.ts](server/document-store.ts), [workspace-store.ts](server/workspace-store.ts) | Extend confined existing storage and validation paths for the portable format. Listing already omits hidden entries, but that is not safe `.memory` admission or crash durability. Return artifact evidence separately from injected presentation metadata. |
| [wire spike](src/history/preplan-spike/wire.ts), [protocol lab](scripts/preplan-spike/protocol.mjs), [browser lab](scripts/preplan-spike/browser.mjs) | Reuse tested value/framing/fencing/IDB contracts, not their small in-memory lists, simulated HTTP acknowledgement or Python lock probe as production implementations. |

Prior targeted verification was 15 files / 161 passing tests, plus type checks,
23 protocol checks and 7 browser checks. These predate the descriptor and `.memory`
contracts. Stage B reported two baseline context-menu failures; reproduce the
current baseline before attributing any failure. No test is marked passed by this plan.

## 3. Mandatory sequence and stop rules

Complete P0, then G1 and G2, then G3 before production schema freeze or ordinary
Document write integration. G1 and G2 are independent bounded development gates;
either can expose a reason to stop. Do not build the remaining production pipeline
around a failed assumption while continuing to label the gate pending.

| Step | Work and reviewable output | Gate to proceed |
| --- | --- | --- |
| P0 — establish baseline | Record current tests/type checks, supported host/browser, source revision and unchanged undo/save/open behavior; enumerate required fixtures and trace each to this plan. | Baseline failures classified; no unexplained new failure. |
| G1 — external descriptor and ownership proof | Isolated resource-state/transition prototype, ownership evidence lifecycle, portable descriptor round trip, isolated query fixtures; precise schema candidate and limitations (§4). | Every G1 case passes without foreign snapshots, live historical reads, guessed ownership or changed undo. |
| G2 — `.memory` lifecycle and storage proof | Real temporary-directory admission/discovery/rename/copy/move harness, production-capable local lock candidate, injected recovery faults and bounded transfer of real wire checkpoints (§5). | Every G2 case passes; at most one proven writable location in the tested local handoff, no data loss or unrelated overwrite, no dependence on a directory index as history authority. |
| G3 — live cost and queue feasibility | Incremental ownership/identity adapter compared to G1 oracle, actual worker/message/outbox cost and sustained workload prototype (§10). | Supported typing retains compact size and bounded queues; work does not scale with foreign target size/edit rate. Select measured limits before enablement. |
| P1 — shared schema and pure core | Freeze first supported value/resource/identity/record versions from passing gates; pure checked appliers/validators, reader contracts and golden packets. | Compatibility, malformed-input and every-revision equality tests pass. |
| P2 — portable lifecycle prerequisite | Production format dispatch, legacy normalization, stable bindings and minimal current-Document external-reference preservation in normal Document/Workspace save/open. | Read-old/write-new, sharing, missing-target use, copies and save/reopen tests pass independently of any memoir. |
| P3 — durable storage and outbox | Harden directory store, fenced server append/read, blob publication, IndexedDB owner, replay-verification watermarks and restart recovery. | Integrated browser → HTTP → filesystem faults meet §7; no Document auto-save or writer ambiguity. |
| P4 — live enrollment and save association | Attach incremental canonical capture, enrollment baselines, resource-local counters, artifact receipts, late resource resolution and directory handoff to existing application lifecycle. | Save races, stale writers, legacy first Save elsewhere and discard/reopen branches pass; ordinary undo unchanged. |
| P5 — bounded historical services | Durable lazy source, subtree/location/timeline/compare and sentence grouping adapters; immutable checkpoints/segments and lossless consolidation. | Ancestry, isolation, descriptor status, bounded pagination and maintenance tests pass with caches removed. |
| P6 — qualification and completion | Sustained/multi-GB measurements, crash/copy matrices, full regressions, documentation and completion report (§12). | Every exit criterion satisfied or explicitly reported unmet; do not declare completion while required gates fail. |

**Architectural stop:** stop the dependent Stage C work and report the failing
fixture, observed behavior, violated requirement and smallest alternatives if
exact owned replay needs foreign state; ownership requires guessing; references
cannot survive ordinary use without identity loss/undo changes; reload requires
a fabricated parent; or safe local discovery/relocation requires a global history
authority or destroys source evidence. Do not weaken a settled contract, quietly
exclude explicit external references, or expand into Stage D–E to get past a gate.

An ordinary defect, parser bug, slow path or internal naming mismatch can be fixed
within the gate. A material design deviation must be documented with parity and
performance evidence. A supported operation may encounter a declared runtime
boundary (e.g. genuinely ambiguous ownership or unavailable storage); using that
status for every required scenario is not passing its implementation gate.

## 4. G1: authoritative ownership and external reference representation

### Candidate representation to prove before freezing

Introduce a versioned resource snapshot/transition envelope around existing exact
canonical content changes. It carries resource/segment identity, local root/counter,
owned content, internal placements, external boundary records and semantic identity
bindings. A structural placement has a discriminated local target or external
target descriptor. Its semantic edge identity, slot/order and reference kind remain
owned state. An external target has no required local ContentRecord.

Keep ordinary canonical record fields/unknown payload fields exact within the
declared projection. Use Stage B content field/splice/preimage rules unchanged where
applicable, and full checked before/after deltas for boundary/identity records in
the first version. Do not serialize the full Workspace commit alongside each local
event; it can contain foreign data. Retain the source commit UUID/cause and permitted
provenance while storing only the relevant exact local effects.

For payload references such as `annotationId`, preserve authored payload values.
Associate source-scope/version evidence with a typed local reference location,
not an interpreted arbitrary string or a second editable target definition. If a
descriptor repeats a target field for indexing, it must be derived/validated against
the authoritative reference, not allowed to disagree. Structural descriptors live
at the edge; payload descriptors bind to their owning record and precise typed
field/element location. Runtime Cell locations may remain private segment symbols;
do not add authored Cell IDs to portable files. Element replacement/reorder must
not accidentally attach old provenance to a different annotation. G1 must settle
the minimal stable location/binding scheme with explicit tests.

External target contract:

| Field/concept | Meaning |
| --- | --- |
| Target kind and identity | Block, definition or asset; known stable target ID and original locator where needed. |
| Source owner | Known resource ID and scope, or explicit unknown source. Workspace-owned definitions remain Workspace-scoped even without a Workspace memoir. |
| Version evidence | Explicit unpinned/unknown, or a recorded revision/commit/immutable version with memoir/segment qualifiers where necessary. No invented timestamp join or lookup of the current head. |
| Occurrence evidence | Target placement/route only when the reference selects an occurrence; preserve the local reference placement independently. |
| Availability | A query observation separate from immutable reference state: unresolved source/version, source history absent, unsupported source, target absent at a proven source version, or resolution not attempted. |

Do not overload `RepositoryState` with invalid placements or weaken its global
validator to accept arbitrary missing targets. Prove a resource validator/read
adapter that recognizes external edges explicitly. Extract shared exact patch
mechanics from the raw applier if needed, leaving the existing closed-graph path
and tests intact. Resource validation checks local references, identity/slot
uniqueness and preimages without consulting external sources. No hidden mutable
editor repository, fabricated target Block or copied Workspace registry is allowed.

### Ownership and binding lifecycle

Seed authoritative ownership from admitted portable definitions, normalized legacy
enrollment and explicit resource/creation evidence, not arbitrary reachability.
Maintain before/after ownership at the committed transaction boundary; deletion
must use retained pre-pruning evidence. A new inline Cell belongs to its known
owner; an unplaced arbitrary record without attribution is unsupported evidence,
not Workspace-owned by default. Repeated windows select one resource, not recorders
per occurrence. Owned definitions survive removal of an owned placement while
internal references remain; pruning and undo follow existing editor semantics.

Bind semantic Placement IDs once when committed edges become part of the admitted
resource, retain evidence needed for undo/redo and archived history, and allocate
fresh IDs for copies/new edges. Rejected transactions cannot consume published
bindings. A metadata/enrollment table may supply historical identity; it must not
change undo step counts or generate a user edit solely for historical bookkeeping.
Bound runtime binding caches and retain durable retired-ID evidence without an
unbounded live map. Resource ownership transfers remain explicit unsupported
boundaries in Stage C; independent unaffected resources continue recording.

### G1 required fixtures and equality oracles

- Ordinary trees, margins/named relations, Unicode/combining/astral text, inline
  images, unknown admitted values, shared Blocks/containers, reference cycles,
  copies, moves, unplaced records, owned deletion with surviving references and
  every intermediate undo/redo state.
- A has a structural reference to B's X, plus payload references to external
  definitions/assets. Make B very large; edit/delete X or remove its history.
  A retains identical exact owned state, references, counters and timeline.
  Retarget/remove/pin the reference in A and verify exactly one local event for
  each successful local transaction, including descriptor preimages.
- Workspace D changes/adds/disappears, with several Documents referencing it and
  conflicting Document-local D values. Zero foreign-only Document revisions and
  no local-registry substitution. Editing a truly Document-owned definition remains
  an internal dependency event even outside the selected Block subtree.
- Unknown source, unpinned source, precise pinned source, duplicate references,
  reordered/replaced annotation elements, target occurrence routes and cycles
  across resource boundaries. No provenance fabrication or foreign traversal.
- Independently extract before/after owned resource states; replay **every** captured
  projected transition after wire encoding and compare exact values, presence,
  ordering, counters and boundary records. Use an independent extraction oracle,
  not encode/decode implementations that merely share the same omission.
- Portable encode/decode with fresh runtime keys preserves semantic Block/Placement
  IDs, owned authored content and external descriptors, while canonical snapshots
  may differ. Exercise a minimal current-Document adapter that can edit/save local
  content while foreign targets are absent. No historical renderer is needed.
- Isolated queries distinguish unknown/deleted/not-yet-created local content from
  an unavailable foreign target. Test mutation attempts and replace live registries
  with throwing sentinels; history must still work.

G1 passes only with a concrete candidate and executable evidence for all these
cases. The old structural-only oracle and unresolved-ID portable fixture alone
do not pass it.

## 5. G2: directory-local storage and identity lifecycle proof

Use real disposable filesystem directories, real encoded baselines and framed
revisions, process restart/competing processes and injected filesystem faults.
No authored user files are needed. Internal layout remains implementation-oriented:

```text
Notes/
    poe.json
    .memory/
        store.json                         compatible management marker
        index.json                         optional rebuildable discovery index
        resources/<safe-resource>/<safe-memoir>/
            manifest.json
            journal.jsonl
            checkpoints/...
            segments/...
            maintenance/...                temporary publication/handoff evidence
```

Encode arbitrary admitted IDs into confined internal names; never interpolate raw
user IDs into paths. Inspect/enforce path confinement and symlink safety throughout
writes. Exclusively initialize a new store and its marker. An existing unrecognized
directory, including an empty user-created `.memory`, is a collision, not permission
to adopt it. Losing a recognized marker requires safe recovery before writes;
preserve readable manifests and unrelated files. Newer versions are not overwritten.

Discovery consults only the immediate-parent store and verifies candidate resource/
memoir IDs plus enrollment/receipt evidence. Neither index entries, content hashes,
matching IDs, filenames nor latest timestamps establish a writable association.
Multiple candidates remain explicit. Rebuild a missing/stale index from per-memoir
authority with bounded enumeration; use short directory-metadata locks separately
from independent memoir writers. Do not add a global Block catalogue or database.

| Scenario | Required proof |
| --- | --- |
| Nested directory stores / absent child store | Exact immediate-parent locality; no ancestor fallback, even if an ancestor has the same resource ID. |
| Same-directory rename | Resource/memoir/Block/Placement identity and history unchanged; update verified locator evidence only. |
| Whole-directory move/copy with `.memory` | Discover and verify transported archives without absolute-path identity assumptions. |
| Document-only or directory copy without `.memory` | Open/edit/save remains usable without history; no implicit attachment to a source archive. |
| Duplicate IDs in one directory or discovered replicas | No shared mutable writer based on ID/hash equality; preserve conflicting bytes, report association conflict and keep normal use available. |
| Independent Save As | New resource/memoir and accepted authored/placement copy mapping; source writer and archive untouched. |
| External move/delete / temporarily absent file | Retain orphan memoir; no deletion based on absence, age, index loss or unavailable consumers. |
| Missing/read-only/offline/partially copied store | Truthful history coverage and bounded pending state; normal Document operations independent; no alternate visible/global history store. |
| Collision, symlink substitution, incompatible marker, init race | No unrelated overwrite or escape; fail closed for history writes while preserving normal Document use. |
| Index removal/corruption | Rebuildable discovery; no loss of replay authority or automatic choice between conflicting memoirs. |
| Legacy normalization and first Save elsewhere | Durable identity/baseline association without legacy rewrite; repeated unsaved use preserves IDs; first deliberate Save/reopen writes/reads modern IDs. |

Cross-directory/device handoff is one memoir's relocation, not an atomic file
rename assumption. Exercise the following ordered protocol as a candidate:

1. Fence/pause the source writer, persist a handoff ID and verified prefix plus
   source/destination identities. Pending browser packets keep immutable IDs/parents.
2. Stage and synchronize destination blobs/records without overwriting a collision
   or deleting the source. Verify hashes, ancestry, source association and generation.
3. Publish destination admission and durable handoff evidence, fence stale source
   authority, and bind the destination writer under a fresh accepted epoch. Recovery
   must know whether either location is allowed to append; uncertainty means neither.
4. Update locators/receipts only with actual Document publication evidence. Record
   Document-move success independently of history-relocation success.
5. Retain source bytes until a durable, recoverable destination and handoff permit
   retirement. Never treat a missing Document as this permission.

G2 must fix the precise durable handoff state machine/lock ordering from this
candidate and kill/fail at each transition, including cross-device copy failure,
pending outbox retry and reappearance of the old location. Avoid a two-lock
deadlock through deterministic acquisition or a staged exclusive handoff. Local
epochs/locks cannot fence disconnected filesystem/cloud replicas: preserve
divergent copies, do not auto-merge or claim global exclusion. Source/destination
ambiguity must not result in two locally authorized writers after recovery.

Select and test a production Node/platform OS-lock mechanism here. A process-local
mutex, stale PID-file deletion or the laboratory Python probe is insufficient.
Unsupported filesystem locking/sync semantics must be an explicit platform limit,
not a silent fallback. No new database is needed to establish this contract.

G2 also proves lossless publication with real checkpoint blobs: publish data before
manifest references, handle duplicate incorporated journal prefixes, preserve
incomplete transfers and classify damaged acknowledged data separately from an
uncommitted torn tail. A live arbitrary file copy need not be complete; it must
never be advertised as complete when required owned evidence is missing.

## 6. Durable records, replay and service contracts

After G1–G3, freeze the first supported versions and golden byte fixtures. Keep
ordinary portable Document schema, lossless history value schema, resource
projection/identity schema, exact patch version and physical framing version
independent. Do not expose runtime graph machinery in portable Documents.

The lossless value domain remains the tested plain-data algebra: null, booleans,
strings, finite/nonfinite numbers including negative zero, dense arrays with
explicit undefined, and own enumerable string-keyed data properties including
own-undefined. Preserve unknown admitted payload fields. Reject sparse/extended
arrays, accessors, symbols/hidden properties, cycles, functions, BigInt, Date/Map
and other unsupported objects explicitly. JS prototype/descriptor identity and
opaque object-reference aliasing are not authored value identity. Internal Block
sharing is represented explicitly, not by JS pointer aliasing.

Harden the collision-safe wire codec with bounds before allocation/parse, depth/
element/string limits, reserved-tag escaping, duplicate-member rejection and
decompression expansion limits. Verify serialized retry bytes without repeated
whole-packet conversion on the input path. Unsupported admission creates a history
boundary/status without rolling back an otherwise successful ordinary edit.
Never use lossy JSON byte accounting as proof of checkpoint exactness.

| Record | Required information |
| --- | --- |
| Memoir manifest | Format/required versions, resource/memoir identity, generation, small catalogue roots, verified physical prefix/hash and immutable file references. Large catalogues are paged, not embedded unbounded arrays. |
| Enrollment/segment baseline | Segment/baseline IDs, owned resource snapshot plus external reference evidence, semantic bindings/ownership evidence, local key namespace, optional artifact-bound origin and explicit continuity status. |
| Exact revision | Original commit UUID, producer/segment/resource identity, state parent, previous journal revision, source timestamp/cause/command provenance, source global counter pair, local counter pair and checked exact projected changes. |
| Checkpoint | Target segment/revision, resource snapshot codec/version, integrity and verified ancestral association. Never choose a checkpoint merely because its physical sequence is recent. |
| Physical frame | Record ID/kind, sequence, previous-frame hash, byte length/hash and writer epoch evidence. Receipts, baselines, epochs and boundaries are not editor revisions. |
| Save receipt | Save-attempt ID, resource/memoir/segment and source revision, export/schema/semantic binding evidence, exact written artifact hash/length, preparation and actual publication/finalization evidence. |
| Gap/projection boundary | Last proven head, known missed range/reason where available, retained source evidence and optional new baseline. Unobserved edits are not reconstructed or silently bridged. |
| Relocation evidence | Handoff ID, verified source prefix/generation, destination admission/publication and writer authority transition; independent of directory index hints. |

Store only source command provenance permitted by the resource boundary. Audit
commands/hints for foreign values: stable external identity/provenance may remain,
but full foreign payloads must not leak into a local event. If necessary persist
a clearly specified local command projection with the original commit UUID/cause;
commands are not replay authority. Document that material projection rule.

Chronological order, ancestry and producer state are separate. A new revision's
state parent is its exact baseline/previous branch state; `previousJournalRevisionId`
tracks journal revision chronology, and physical sequence includes non-revisions.
An old-file reopen uses a new baseline with an origin link. Archived unsaved edits
remain queryable on their old branch and are not replayed into the current file.
Foreign version pointers never enter local state ancestry. Duplicate UUID with
different immutable content is a conflict, not a new revision or rebased retry.

Do not retrofit the durable store as an editable `MemoryHistoryStore` producer.
The following are service contracts; exact names/module splits can be simpler:

| Capability | Inputs and output contract |
| --- | --- |
| Resource enrollment/projection | Admitted live resource, immutable commit and retained ownership/binding context → exact local transition, irrelevant commit, or explicit boundary. No disk/network await or full snapshot in the commit callback. |
| Memoir discovery/admission | Confined Document locator and resource/association evidence → verified candidates/admitted writer, missing, collision, conflict or unsupported. Does not mutate the Document. |
| Outbox enqueue | Immutable packet/blob IDs and bytes plus prerequisites → browser-committed watermark or bounded failure; no server-durable implication. |
| Blob publication | Bounded resumable/staged bytes and expected identity/hash → published immutable blob, or recoverable incomplete upload. No baseline declaration acknowledged before its blob is durable. |
| Append | Resource/memoir and epoch, expected physical head, bounded immutable frames → named accepted prefix/hash and IDs. Replay verification may lag. |
| Read source | Bounded manifest/catalogue, frame/checkpoint and paged ancestry reads; cancellation/work budget supported; no writer, editor or repository capability. |
| Queries | Stable resource/memoir/segment/revision and semantic Block/Placement/route selection → immutable owned state/fragment/location/timeline/comparison with local status and separate external diagnostics. |
| Maintenance/relocation | Verified fixed prefix/generation and explicit handoff intent → recoverable new publication/authority. No expiry or implicit multi-resource transaction. |

Read authority and write authority must be separate objects at runtime, as in
`readOnlyHistorySource`, not only TypeScript interfaces. Keep bounded asynchronous
ancestry iteration in the durable source; do not return an entire long-history
array to satisfy the old interface. Extract shared helpers and retain an adapter
for the finite Stage B source rather than silently making durable reads unbounded.

## 7. Outbox, append, acknowledgement and recovery

The recorder hands immutable edit-sized packets to a bounded asynchronous owner.
Maintain byte/count budgets for pending RAM, outbox data, upload/append batches,
decoded checkpoints, query work, caches and indexes. Whole-graph checkpoints may
be expensive but are occasional, isolated work; serialize/transfer them outside
the input callback. The bootstrap must catch edits arriving during baseline
construction using an immutable enrolled state plus bounded captured tail, never
a later live snapshot labeled as the earlier baseline. Exceeding that tail budget
requires an explicit boundary/re-enrollment, not dropped edits.

IndexedDB packet/blob storage and byte ledger update in one transaction. Request
strict durability where supported and report actual mode. Exact duplicates are
idempotent; conflicting duplicates reject. Delete packets only after verified
server acknowledgement of those IDs/prerequisites, with atomic ledger update.
The outbox owner outlives editor disposal. Controlled navigation can await transfer;
OS/browser termination can lose the RAM-before-IDB interval. State that limit.
An untitled Document has only browser durability until a real parent directory
is selected; do not create a global server archive to hide this distinction.

Server writes require both process-level OS exclusion and durable producer epochs.
Recover the authoritative prefix/accepted IDs before admitting a new epoch after
restart. Serialize expected-head validation and append. Check a wholly identical
accepted retry before rejecting its obsolete head/token; an overlapping batch may
acknowledge the existing prefix and append only a validated suffix under current
authority. Conflicting bytes or wrong state ancestry reject, retaining evidence.
No partial application of a single projected editor transaction is exposed.

Large blobs/events need explicit byte admission separate from small append frames.
Use bounded streaming uploads and either one bounded atomic event record or a
declared multipart event with a final integrity-checked commit record. Select the
smallest proven option at G2/P1; readers must not expose an incomplete event and
outbox prerequisites must be recoverable. Do not infer a 16 KiB production event
limit from the protocol lab or reject the tested 13 MB checkpoint by accident.

Synchronize file content and required directory/publication metadata before
server-stored acknowledgement. After an uncertain write/sync failure, stop that
writer until recovery identifies the actual prefix. Distinguish unfinished final
frames from complete bad checksums, interior gaps and lost acknowledged evidence.
Repair/quarantine only with explicit recoverable-boundary evidence; do not skip
a damaged parent. Supported independent branches/checkpoints may remain readable.
Stored hashes/schema admission do not replace exact replay verification.

Recovery/transport tests must include real browser → HTTP → server persistence,
not only the lab's simulated acknowledgement:

- Kill after capture, IDB commit, server write, sync, lost response, acknowledged
  IDB deletion, baseline upload, manifest publication and journal rotation.
- Inject quota/disk full, short writes, torn UTF-8/frame tails, sync/rename errors,
  conflicting duplicate IDs, stale tabs, two server processes and restart epochs.
- Interrupt large blob uploads and retry immutable IDs; no dependent revision is
  acknowledged with missing local prerequisites.
- Test outbox origin separation, disposal, offline cap exhaustion, recovery from
  a known gap, and Save/Close while backlogged. Preserve ordinary edit/undo success.
- Deliver partial/conflicting `.memory` copies and reordered blob/manifest files.
  Local locks do not promise coordination with a cloud service or remote replica.

Qualification names supported platform/filesystem/browser combinations and their
actual process-crash/synchronization promise. SIGKILL is not power-loss proof;
do not claim universal durability across unsupported stores/devices.

## 8. Portable Document, enrollment and save lifecycle

P2 introduces format dispatch around the legacy codec. Legacy bytes decode directly,
then normalize into the modern semantic model in memory. Preserve unambiguous
authored IDs, report ambiguous references/identities, and assign missing modern
resource/Placement IDs once before enrollment. Opening never rewrites files.
The first deliberate Save writes the versioned definition/placement format.

Production portable output contains unique owned Block definitions, explicit
structural placements and external descriptors from G1, authored rich inline
content, named relations and resource identity. It contains no history events,
undo stack, runtime key map or required memoir pointer. Admission must not silently
coerce unsupported authored values; normal save failure and history status remain
distinct. Missing foreign resources cannot prevent saving otherwise supported
local authored state and reference descriptors.

Keep canonical raw keys/Cells/counters in exact archive snapshots where required;
keep semantic binding evidence through enrollment, commands, undo and reload.
Normalize prior to historical enrollment rather than adding undo entries for
bookkeeping. Existing global undo remains global even when only one Document is
being recorded. A commit touching only another resource is irrelevant locally;
an unsupported coupled ownership transfer marks affected boundaries, not all
otherwise unrelated history. Late-resolved Documents enroll at declared baselines;
unresolved Workspace placeholders are not empty Document histories.

For legacy paths, persist enrollment baseline and artifact-bound identity evidence
under that parent's `.memory` before acknowledging dependent server history.
Hash/path alone does not disambiguate identical copied legacy files. Unsaved reopen
uses surviving association evidence, or reports uncertainty/new baseline. For
untitled resources retain bounded IDB evidence until first destination selection.
Save As copy assigns fresh resource/memoir and authored copy identities; rename/move
preserves identity. Never attach duplicate IDs to a writer merely because a file
opens successfully.

Save integrates with the existing immutable snapshot/request-token dirty-state
logic. Capture the export and named local source revision/bindings together before
asynchronous I/O. Prepare a receipt where history is available; write the actual
Document independently; finalize using server evidence for the exact bytes
published. Do not hash a DTO after the server adds filename metadata and call it
the source artifact. History failure does not turn a successful ordinary Save
into a failed Save or clear dirty state for newer edits.

| Race/failure | Required outcome |
| --- | --- |
| Save R100, edit R101 during write | Receipt/export names R100; R101 remains dirty and independently captured. |
| Archive succeeds, Document write fails | Existing file remains authoritative, no completed receipt, archived unsaved branch retained. |
| Document write succeeds, receipt finalization fails | Save success and history warning distinguished; reconcile surviving preparation with actual artifact hash, otherwise report unresolved origin. |
| Discard unsaved edits, reopen old saved file | Keep archived edits; open the file with a new canonical baseline/proven origin, not latest journal state. |
| File changed externally or older save copied back | Preserve prior branches; new load baseline/import boundary, no guessed intermediate commands or state parent. |
| Workspace save partly publishes Documents/manifest | Per-resource file/receipt evidence governs; no all-Document atomic save claim or global counter substitution. |
| First Save chooses another directory | Attach/relocate the same enrolled memoir through G2 evidence without dropping pre-save edits or claiming destination durability prematurely. |

Update Document/Workspace server validation, save-bundle hashing and ordinary
search/index adapters for the new format only as needed for existing features.
Keep the legacy decoder readable; no batch migration or automatic export of
foreign definitions. A missing memoir, unsupported history version, read-only
store or collision cannot block otherwise valid Document opening/editing/saving.

## 9. Historical queries, grouping and lossless maintenance

Every query names a memoir/segment/revision; resolve semantic placement selectors
through proven historical bindings, not current runtime keys. Check branch-selected
ancestry before reconstructing. State snapshots/results are immutable at runtime
and obtained through read-only archive capabilities. Reading history must not
change editor revision, dirty state, focus, selections, DOM, undo or repository.

| Query | Durable semantics |
| --- | --- |
| `getStateAt` | Load an ancestral validated checkpoint and exact local delta path; return owned resource state and recorded external descriptors. Foreign history availability is separate. |
| `getSubtreeAt` | Reconstruct historical membership/internal references and stop at external edges. Preserve margins/relations, reference-only/unplaced content, cycle guards and ambiguous occurrence candidates. Never fabricate foreign target content. |
| `getLocationAt` | Return the selected local historical placement/route(s), including a local external-reference occurrence. No invented historical location inside the source resource. |
| `getTimeline` | Use before/after membership, departures, owned/internal dependency changes and local reference/provenance changes. No foreign-only event. Page using fixed branch head, scope and stable cursor; indexes may narrow candidates but cannot omit valid history. |
| `compareSubtree` | Compare owned authored state, structure/location and reference descriptors with matched traversal options. Unknown identity/occurrence or owned replay gaps are non-comparable; external unavailability alone is not. Equal unpinned references establish only reference equality. |

Preserve Stage B distinctions: `deleted`, `unplaced`, `absent-occurrence`,
`unknown-block`, `not-yet-created`, `ambiguous-occurrence`, `incomplete`, `unsupported`.
Not-yet-created requires descendant branch evidence. Removing one occurrence does
not delete shared Block content. An external target request returns explicit
external-reference/target status, never an inferred local deletion. Add a result
variant if needed instead of overloading existing statuses. No cross-resource
historical resolver is required; an optional later resolver cannot mutate local
results or become local replay authority.

Replace whole-ancestry/current grouped-timeline materialization with bounded
iteration and resumable work. Derive indexes lazily from verified records and
checkpoint state; correctness must survive index deletion/corruption. Persist
derived cache versions/coverage/branch/scope only if worthwhile. Reuse the sentence
policy, with enough verified context at page boundaries to avoid splitting or
merging groups merely because a page ended. Groups retain exact member IDs and
endpoint, policy/version/locale/scope, and gaps/boundaries never disappear. Bound
scan work separately from result count; return a continuation when the work budget
is exhausted, rather than pretending there are no more results. Do not add a new
grouping policy, input gateway redesign or hidden unlimited scan.

Checkpoint according to measured replay work, graph size and bounded budgets,
not a universal 500-commit interval. Keep enrollment/load/branch baselines and
saved-receipt prerequisites. Snapshot/encode/compress in an isolated worker or
archive process with bounded transfer cost and cancellation; scheduling a large
clone on a timer is not moving it off the foreground thread.

Consolidation seals a fixed verified prefix into immutable files, synchronizes
them, publishes a manifest generation, then rotates only the included journal
prefix. Concurrent tail appends and crash duplicates remain recoverable. Retain
all exact revision IDs and state-parent evidence. Copying a quiescent complete
store transports history; a partial active copy exposes only its verified coverage.

Cleanup removes only proven redundant physical files unreachable from retained
generations, branches, baselines, receipts, journals, handoffs and in-flight readers/
writers. Protect concurrent readers with generation pins or deferred retirement.
Preserve unknown files and incomplete-copy evidence. Missing Documents, orphan age,
an unavailable foreign consumer or lost index entries never authorize deletion.
No destructive retention/expiry in Stage C.

## 10. G3 and release performance/exactness gates

Retain the pre-plan artifacts as immutable evidence, not performance promises:

| Observation | Required response |
| --- | --- |
| Small edit wire packets approximately 1,960–1,977 bytes at 100/5,600/25,000 characters | Preserve edit-sized retained/encoded changes after ownership/descriptor/binding metadata is added. Grouping cannot fix capture size. |
| Whole-state projection across three 25,000-character Documents: median 2,649 ms | No whole-Workspace scan/snapshot or graph-retaining capture subscription in the live path. Incremental ownership must be checked against the oracle. |
| 25,000-character baseline: 13,376,402 wire bytes; encode about 389 ms, decode about 614 ms | Budget baseline upload, worker transfer, parsing and cache memory explicitly. Admission limits must fit the supported fixture. |
| One large replay apply/validate: median about 240 ms; cold distance-12 reconstruction about 3,572 ms | Do not synchronously verify/reindex the entire graph per input. Bound backlog and choose checkpoints by measured work. Optimize with exact parity proof where needed. |
| Strict IDB small-packet median/p95 3.2/12.7 ms; large baseline transaction 89.2 ms | Enqueue asynchronously; include real serialization, transaction and byte-ledger costs in sustained measurements. |
| 147 MB raw monolith retained about 208 MB parsed heap; small-manifest selective reads avoided archive-wide parsing | Use immutable selective loading and paged catalogues under `.memory`; measure directory discovery separately. |

See the [recorded artifacts](BLOCK_SCOPED_HISTORY_STAGE_C_PREPLAN_RESULTS.md#1-evidence-reproduction-and-limits)
for sample counts, compression exclusions and platform limits. No fixture establishes
universal bounds or power-loss behavior.

G3 runs history-off, existing compact-capture-only, and candidate durable capture
modes on identical editing workloads. Measure capture callback, ownership update,
serialization/worker transfer, IDB/server append, verification/index work, query
latency, queue age/bytes and retained/transient memory separately. Preserve existing
undo allocation in the baseline so it is not misreported as history overhead.

Minimum workload matrix:

- 100, 5,600 and 25,000-character paragraphs; start/middle/end insertion/deletion,
  replacement, paste, split/join, inline images, undo/redo and structural moves.
- One and three live Documents; increasing unrelated Workspace size and foreign
  target size/update rate; repeated windows and shared containers.
- Real input-to-outbox-to-server runs of at least ten minutes at five ordinary
  edits/second on the largest supported paragraph, with burst/offline/reconnect
  periods. If a representative workload requires a different input trace, retain
  this fixed trace as a comparable stress case rather than replacing it silently.
- At least 100,000 valid small revisions with branches/checkpoints, plus a physical
  archive exceeding 1 GiB. Use both valid-history queries and clearly labeled
  layout-only stress where generating valid history is impractical; layout-only
  data cannot pass replay tests.
- Directories with 1, 100 and 10,000 memoir candidates; valid, absent and stale
  discovery indexes. Test independent concurrent memoir activity and bounded rebuild.

Acceptance gates (targets for implementation, not claimed measurements):

1. **Exactness:** every bounded semantic fixture revision round-trips exactly;
   randomized/property traces compare every intermediate state to the independent
   oracle. Long runs verify all frame/ancestry integrity and sampled/full designated
   reconstructed heads, branch roots, receipt states and checkpoint boundaries.
   No failed exactness assertion is traded for speed.
2. **Compactness:** supported single-character contiguous edits never retain/copy
   unchanged paragraph sequences in the added history layers. With equal-length
   IDs and comparable metadata, 25,000-character edit packets grow by no more than
   25% over the 100-character fixture. Report absolute bytes and every full-record
   fallback. Foreign-only edits emit zero A packets; increasing foreign target
   size retains no foreign graph in A's buffers/checkpoints/caches.
3. **Foreground:** on the declared reference host/browser, added synchronous work
   over compact-capture-only has p95 at most 4 ms for supported typing workloads,
   with no history-added task over 50 ms during steady typing. Report end-to-end
   latency separately. This is not a claim that existing editor work is O(edit size).
4. **Throughput:** at the fixed sustained workload, capture/outbox/server and required
   verification queues stay within declared limits and do not grow monotonically.
   After reconnect/input stops, they drain without event loss, unbounded RAM or
   blocked ordinary editing. Report drain time and oldest pending age. If the
   verifier cannot keep up, optimize or restrict enablement explicitly; do not
   advertise an indefinitely unverified archive as complete.
5. **Bounded resources:** publish and enforce a configuration table for RAM/outbox,
   record/blob/batch bytes and counts, parse/decompression, caches/indexes, concurrent
   readers and work budgets. Exercise limit−1/limit/limit+1 and oversized atomic
   edits. Select the table at G3/P1 from measurements; laboratory caps and Stage B
   defaults are not automatically production values. Supported baselines must fit
   admission or a proved bounded streaming path.
6. **Selective reads:** normal Document open/discovery reads no historical state
   graph or full revision list. A state query reads only bounded catalogue pages,
   an ancestral checkpoint and its required path. A paged timeline/group query
   stops at its work budget with a continuation. Retained memory must plateau
   under repeated open/query/cancel/dispose and incremental directory enumeration.
7. **Latency policy:** record cold/warm state, subtree, location, timeline, comparison
   and grouping p50/p95 at checkpoint distances 0/4/12 and longer measured paths.
   Set checkpoint/work budgets to keep reference-fixture state reconstruction p95
   within 2 s at 5,600 characters and 5 s at 25,000 characters, or report the gate
   unmet before enablement. Other queries must return a bounded page/progress result
   without monopolizing the foreground thread; never silently omit results to meet
   a latency target. Larger admitted graphs need explicit measured expectations.

The numeric reference targets may be revised only with documented measurements,
the reason and explicit effect on supported usage. Do not redefine workloads or
weaken ownership/exactness/durability to make a benchmark pass. G3 catches fundamental
throughput infeasibility before the full integration investment; P6 repeats these
measurements on the actual pipeline and qualifies supported platforms.

## 11. Proposed implementation footprint and checks

Paths below are proposals except where linked to existing files. Keep modules
small and reuse existing machinery; material changes in organization are acceptable
if the contracts/gates remain traceable. Do not move experimental code into
production solely by renaming it or import Vitest/browser/editor machinery in the
pure archive reader.

| Area | Planned footprint and responsibility |
| --- | --- |
| Portable semantics | New production portable-format module beside [codecs.ts](src/block-tree/codecs.ts); dispatch/legacy normalization and binding lifecycle beside [identity.ts](src/block-tree/identity.ts). Keep spike fixtures; add source/version-aware reference fixtures from G1. |
| Resource model/projection | Proposed `src/history/resource.ts` and `projection.ts`: owned snapshot/descriptor validation, incremental owner/binding updates, deterministic exact projection; new gate tests beside existing [pre-plan tests](src/history/preplan-spike/preplan.test.ts). |
| Shared replay/value core | Proposed `src/history/wire.ts`, `archive-types.ts`; narrowly factor [replay.ts](src/history/replay.ts), [compact-changes.ts](src/block-tree/compact-changes.ts) helpers when necessary, preserving existing raw applier behavior. |
| Client recording/outbox | Proposed `src/history/recorder.ts`, `outbox.ts` and worker/transport owner: explicit enrollment, bounded queues, immutable packets, truthful status. [repository.ts](src/block-tree/repository.ts) changes only for a demonstrated missing committed-evidence seam, never undo semantics. |
| Server archive | Proposed `server/history/` directory for confined store admission/discovery, frame/blob IO, locks/epochs, recovery, append/read, handoff and consolidation; thin router mounted through [server/index.ts](server/index.ts). No generic arbitrary-path file API. |
| Ordinary persistence | [persistence.ts](src/reactive-editor/persistence.ts), [workspace-manifest.ts](src/reactive-editor/workspace-manifest.ts), [document-store.ts](server/document-store.ts), [workspace-store.ts](server/workspace-store.ts): portable dispatch, stable resource registration, real artifact hashes, per-resource receipts and move/copy association. |
| Read services | Proposed durable source beside [source.ts](src/history/source.ts); adapt [query.ts](src/history/query.ts), [types.ts](src/history/types.ts), [index.ts](src/history/index.ts), [grouping.ts](src/history/grouping.ts) for external boundaries/semantic selectors and bounded iteration. Preserve finite Stage B adapters and regression coverage. |
| Fault/performance harness | Extend or replace bounded lab harnesses with production-path integration tests; new Stage C benchmark scripts and JSON artifacts, retaining prior artifacts unchanged. |
| Documentation | Gate evidence/deviations log, supported-version/platform/capacity table and `BLOCK_SCOPED_HISTORY_STAGE_C_COMPLETION.md` when implemented. |

Suggested verification commands using existing entry points:

```sh
npm test -- src/block-tree src/history src/reactive-editor/persistence.test.ts src/reactive-editor/workspace-manifest.test.ts server/document-store.test.ts server/workspace-store.test.ts
npm run typecheck
npm run build
npm test
```

Add the new server-history/gate tests to the actual targeted command once their
paths exist. Run new real-browser and process/fault harnesses separately; mocks
cannot replace IDB/process exclusion evidence. Define a reproducible Stage C
benchmark command during implementation. Do not rerun old benchmark artifacts
under the same filename and erase the original comparison data.

Required regression surfaces include general/inline/split/empty-paragraph capture,
observer exception isolation, undo/redo stacks and causes, IME/selection behavior,
ordinary legacy/new Document load/save, Workspace resolution/save races, missing
resources, path confinement and current search/listing behavior. Schema/adapter
changes must not make current Documents depend on history availability.

## 12. Exit criteria, completion evidence and remaining later work

Stage C is complete only when all of the following are demonstrated:

- G1/G2/G3 have recorded passing evidence or a resolved, documented implementation
  correction; no unresolved architectural stop condition is buried as a TODO.
- The admitted live standalone/Workspace slice records exact owned revisions with
  persistent semantic identity, local counters and source provenance, with no
  foreign target snapshots or foreign-only revisions and no undo semantic change.
- Legacy files open without disk rewrite; normalized identities persist through
  unsaved enrollment and first deliberate modern Save; sharing/references and
  missing external targets survive ordinary use without a memoir.
- `.memory` obeys immediate-parent locality, safe admission and ID-based discovery;
  rename/copy/move, duplicates, orphans, read-only/missing/partial stores, sync
  conflicts and index rebuild behave as specified. Interrupted local handoff
  cannot authorize two writers or delete the only recoverable history.
- Durable bytes/versions, baseline prerequisites, immutable retry semantics,
  writer fencing, acknowledgements, receipt publication and restart recovery pass
  integrated real-browser/server/filesystem and injected-failure tests.
- Reload uses file-authoritative canonical baselines with proven origin links;
  older saves, unsaved branches and gaps never confuse chronology with ancestry.
- Every retained exact revision is addressable; isolated queries preserve local
  statuses/occurrences and external diagnostics. Timeline/group pages are bounded,
  derived and correct with missing/stale caches. No live registry fallback occurs.
- Lossless consolidation/cleanup preserves retained revisions, branches, baselines,
  receipts and active readers; orphan/age-based expiry is absent.
- Performance, capacity, cancellation and memory tests meet §10 on named supported
  configurations, and ordinary editor/save/open regressions are classified and
  resolved for changes introduced by Stage C.

Produce `BLOCK_SCOPED_HISTORY_STAGE_C_COMPLETION.md` containing implementation
revision/range, gate-by-gate evidence, exact commands/results, benchmark artifacts
and environments, wire/portable/storage versions, supported resource/platform
limits, configured budgets and durability watermarks, material deviations,
unresolved issues and explicit remaining unproved claims. If a required criterion
fails, report partial progress/blocked implementation, not completed Stage C.

Remaining later work includes default rollout policy, historical rendering/UI,
cross-resource historical resolution/catalogues, coordinated ownership transfers,
historical copy/restore, collaboration/disconnected merge, destructive retention,
Workspace memoirs, asset-byte history and additional grouping policies. Stage C
provides durable owned history and read contracts without implementing those
features. Completion must not automatically begin Stage D or E.
