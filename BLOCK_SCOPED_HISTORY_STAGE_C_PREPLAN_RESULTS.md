# Block-scoped history — Stage C pre-plan results

Date: 2026-09-17. Status: bounded investigation and executable experiments.
No production Document format, history recorder or endpoint has been introduced.
The subsequent [final Stage C implementation plan](BLOCK_SCOPED_HISTORY_STAGE_C_PLAN.md)
carries these settled contracts forward and sequences the still-unproved descriptor,
storage-lifecycle and live-cost gates before production integration. This report's
experimental evidence remains unchanged.
Implementation follow-up: [G1 gate results](BLOCK_SCOPED_HISTORY_STAGE_C_GATE_RESULTS.md)
document a separate definition-lifetime/structural-reachability counterexample and
the ownership-aware correction now being tested after authorization to continue.
Production codec and storage integration remain gated. This does
not reopen the settled ownership-boundary or `.memory` decisions below.

## Outcome and ownership-boundary decision

The accepted architectural direction is the
[portable Document spike](PORTABLE_CODEX_DOCUMENT_FORMAT_SPIKE.md): versioned
unique Block definitions, persistent semantic Block/placement identities,
explicit sharing, separate resource identity, read-old/write-new legacy
compatibility, and an explicit canonical load projection boundary. These are
inputs to this investigation, not questions reopened here.

The experiments support a lossless escaped-JSON history value codec, per-resource
local graph counters, a transactional bounded IndexedDB outbox, serialized and
fenced durable server appends, and a physical archive consisting of a small
manifest, immutable independently loadable data files and an active journal.
The subsequent storage decision places that machinery under the immediate parent
directory's reserved `.memory`, not visible per-Document sidecar files (§5).

**The subsequent architectural decision closes the environmental-dependency
blocker: exact historical closure stops at authoritative Document ownership.**
A memoir reconstructs its Document-owned state and recorded external references,
not the whole environment visible to that Document. An external target's missing
history does not make the Document's own history incomplete. A Workspace-owned
definition changing without a Document-owned change creates no Document revision.
The counterexample remains valid evidence about current resolver behavior; its
interpretation and the proposed remedy are superseded by this decision (§3).

The evidence is sufficient to draft the final Stage C plan with explicit gates
for ownership attribution, external-reference representation and isolated queries.
Those contracts are specified below, not implemented or proved by the existing
structural oracle. No further environmental-closure investigation is required.

| Area | Pre-plan result | What is still unproven |
| --- | --- | --- |
| Lossless history value codec | Suitable admitted domain and an executable collision-safe representation are established. Small edit packets remain small. | Hardened parsing/resource limits, long-term schema evolution and exhaustive payload coverage. |
| Workspace resource projection | Exact structural projection with local counters is proven for tested supported transitions; the accepted ownership boundary excludes external target state. | Authoritative ownership attribution, external-reference/provenance projection and isolated query behavior need proof. Incremental performance is not established. |
| Outbox/append/recovery | Bounded transactional behavior, retry/fencing rules and publication ordering are supported by browser, filesystem and protocol experiments. | Integrated application/server behavior, production OS-lock binding, write-failure handling and platform-specific durability qualification. |
| Physical layout | Select per-memoir manifests, immutable checkpoint/segment files and active journals under directory-local `.memory`. | New discovery/relocation/collision contracts, production reader/writer, adaptive checkpoint defaults, multi-GB behavior and sustained load gates. |

## 1. Evidence, reproduction and limits

Source experiments:

- [wire.ts](src/history/preplan-spike/wire.ts): exact value codec candidate.
- [projection.ts](src/history/preplan-spike/projection.ts): whole-state structural
  projection oracle, explicitly not a live input subscriber.
- [preplan.test.ts](src/history/preplan-spike/preplan.test.ts): value/replay,
  ownership, local counters, gaps and dependency counterexample.
- [protocol.mjs](scripts/preplan-spike/protocol.mjs): finite append/fencing and
  temporary-file publication/recovery laboratory.
- [browser.mjs](scripts/preplan-spike/browser.mjs): actual Chromium IndexedDB
  transactions, isolated browser profile, two local origins and process restart.
- [storage.mjs](scripts/preplan-spike/storage.mjs) and
  [projection.mjs](scripts/preplan-spike/projection.mjs): bounded measurements;
  [support.mjs](scripts/preplan-spike/support.mjs) bundles the current canonical
  code without writing compiled application output.

Recorded results:

- [Browser artifact](BLOCK_SCOPED_HISTORY_STAGE_C_BROWSER_EXPERIMENT.json).
- [Protocol/failure artifact](BLOCK_SCOPED_HISTORY_STAGE_C_PROTOCOL_EXPERIMENT.json).
- [Storage/checkpoint artifact](BLOCK_SCOPED_HISTORY_STAGE_C_STORAGE_EXPERIMENT.json).
- [Structural projection artifact](BLOCK_SCOPED_HISTORY_STAGE_C_PROJECTION_EXPERIMENT.json).

Reproduction commands, run from the repository root:

```sh
npm test -- src/history/preplan-spike/preplan.test.ts
node scripts/preplan-spike/protocol.mjs
node scripts/preplan-spike/browser.mjs
node --expose-gc scripts/preplan-spike/storage.mjs
node scripts/preplan-spike/projection.mjs
```

The scripts print JSON to stdout and use temporary files/profiles, which they
remove. The browser script needs local Chrome (or `CHROME_BIN`) and Node's
WebSocket support; the OS-lock probe uses Python's `fcntl` on this macOS host.
Those are laboratory tools, not new application dependencies or a proposed
Python production server. The scripts launch no Codex server and read/write no
authored Document files.

Measurements are local Node 22.12/macOS ARM64 and Chrome 153.0.8010.48. They are
finite experiments, not release-level performance gates or power-loss evidence.
The final storage artifact includes a rerun to compare compressed monolithic
storage with compressed chunks and to measure retained parsed heap with explicit
GC. Use that final artifact's figures; do not mix latency samples from earlier
exploratory runs. Baseline checkpoints use real canonical graphs; the large
layout workload repeats checkpoint-shaped data and is not a synthetic claim of
100,000 valid historical edits.

## 2. Lossless persistent history values and bytes

### Decision supported by the experiment

Keep the existing exact change model. Wrap baselines, exact events, external
reference/provenance records and checkpoint metadata in one versioned lossless value encoding. Do not
change the live graph to make ordinary JSON sufficient, and do not use the
portable authored Document format as an exact checkpoint.

The admitted domain for the candidate is:

- Null, booleans, strings, finite numbers, negative zero, NaN and infinities.
- Dense arrays, including explicit undefined elements.
- Own enumerable string-keyed data properties on ordinary/null-prototype
  records, including own-undefined values and unknown payload field names.

Prototype and descriptor attributes are outside this value algebra, matching the
plain-data replay contract. Unsupported cyclic values, sparse/extended arrays,
accessors, hidden/symbol fields, BigInt, functions, Date/Map and other object
types are rejected. Sparse arrays are deliberately excluded: the current
`equal()` helper compares enumerable keys, not arbitrary sparse-array length
semantics. A serializer alone cannot turn an unsupported capture/equality domain
into a proven exact history domain.

Object-reference aliasing inside opaque payload values is not a portable value
identity: repeated equal objects encode as equal values. Intentional canonical
sharing remains explicit in content/placement records. This candidate does not
claim to serialize arbitrary JavaScript object graphs or their reference equality.

Ordinary JSON-shaped values remain ordinary JSON inside the envelope. Special
values use an explicit reserved tag. Any user object containing that tag is itself
escaped as an object-entry list, so a user payload cannot impersonate undefined
or a special number. Property construction uses own data properties rather than
prototype-setting assignment. Tests include tag collisions and `__proto__` and
`constructor` payload keys.

The spike's decoder verifies the envelope/tag grammar and byte-canonical
re-encoding. This rejects duplicate JSON keys and noncanonical encodings instead
of accepting a parse that silently discarded information. This strict byte
grammar is for history packets; it does not constrain users' ordinary Document
JSON formatting. Packet bytes should be created once and retained for retries.
JSON member-order canonicalization across unrelated encoders is not assumed.

Unknown optional payload *fields* survive. Unknown required format versions or
value tags do not get skipped. The file framing layer additionally supplies byte
length and integrity hashes; it must bound bytes before parsing and enforce
depth/element limits during decoding. Those hostile-input limits are not provided
by this small recursive prototype.

The tests wire-round-trip a canonical Workspace baseline and every exact compact
revision through Unicode editing, own-undefined, special numbers, inline images,
margins, split/join and undo/redo. Each reconstructed full state equals the
original repository snapshot. These tests reuse the existing raw applier; they
do not replay commands or add a second state authority.

### Measured cost

| Paragraph size | Raw baseline JSON | Lossless baseline bytes | Gzip bytes | Small edit wire bytes |
| --- | ---: | ---: | ---: | ---: |
| 100 characters | 54,793 | 54,902 | 8,892 | 1,960–1,973 |
| 5,600 characters | 2,997,293 | 2,997,402 | 542,234 | 1,962–1,975 |
| 25,000 characters | 13,376,293 | 13,376,402 | 2,415,602 | 1,964–1,977 |

For these fixtures the lossless baseline adds 109 bytes over lossy ordinary JSON,
including the envelope and own-undefined representation. Small edit encoding
medians were 0.102/0.155/0.173 ms respectively; decode medians were
0.136/0.150/0.149 ms. The candidate preserves the compact-capture size benefit.
These samples do not establish a universal overhead for arbitrary opaque payloads.

Large baseline encoding/validation remains expensive (§5). Keeping special-value
overhead small does not make whole-graph traversal cheap. Durable value admission
must be checked on enrollment and newly captured values; unsupported values
produce explicit history failure/coverage boundaries without undoing an otherwise
successful ordinary edit.

## 3. Exact resource projection within authoritative ownership

### Accepted contract

The Document boundary is stronger than internal Block-tree boundaries. A Document
memoir guarantees exact reconstruction of historically Document-owned canonical
state, including its authored references and available provenance. It does not
guarantee reconstruction of every historically visible dependency.

| Category | Required evidence and behavior |
| --- | --- |
| Owned historical state | Retain the exact owned content, structural edges, inline state, definitions and descriptors, with the baselines/ancestry needed to replay them. Missing required owned records or parents is an exactness gap. |
| External historical dependency | Retain the Document-owned reference/placement and known stable target provenance. Do not copy the externally owned target state into this memoir merely because it is referenced. |
| Unavailable external history | Keep owned reconstruction available and exact; report the target as historically unresolved/unavailable. Do not substitute current target state or label the Document memoir corrupt. |

Authoritative **resource ownership** is distinct from the placement kind `owned`
or `reference`. Multiple internal placements and shared containers do not create
multiple resource owners. Removing an owned placement while internal references
remain does not transfer ownership or delete the still-retained definition.
Reachability, runtime ContentKeys, current focus and repository-root location
alone are not ownership evidence. A reference to B's Block X in A is an A-owned
edge to B-owned content; traversing that edge must not enroll X as A-owned content.
Reference-only and unplaced owned records still need explicit ownership evidence.

For known external reference forms, the archive must preserve a lossless reference
descriptor with the locally owned semantic placement/field location, target kind,
target Block/definition/asset identity, authoritative source resource identity
where known, and source revision/commit or immutable version/hash evidence where
actually recorded. Preserve any target placement/route needed to distinguish a
referenced occurrence. Runtime keys and filenames are not substitute identities.
Unknown source identity, unresolved target and unknown source version are explicit
states; preserve the original locator and uncertainty rather than guessing.
Workspace definitions need a source scope/resource descriptor even when that
Workspace has no memoir. Opaque payloads remain exact data, not guessed references.

A pinned source version identifies a target in its owner's history namespace,
including memoir/segment qualifiers where needed to identify the source evidence;
it is not an A state parent, A revision counter or timestamp-based join. An
unpinned reference preserves that fact and cannot promise which target state was
visible at A's revision. Do not silently pin it using today's target head or choose
the nearest timestamp. Source history, if later available, may resolve proven
version evidence; target deletion, missing memoir, unsupported version or insufficient
provenance produces a target-specific unresolved/unavailable reason. Stage C need
not implement a resolver, Workspace memoir or cross-resource catalogue.

Reference creation, removal, retargeting, explicit pinning, or a change to locally
owned reference metadata is an A change. A change solely to the external target
is not: no dependency-only revision, local-counter increment, subscriber-driven
pin refresh or timeline event in A. Availability or resolution results are
non-authoritative, separately keyed observations; they never rewrite archived
references. Cross-resource source pointers are provenance, never replay parents.

### Structural result

The oracle enumerates explicit Document resource roots, extracts their canonical
content/placement closures, and uses a stable synthetic root for each resource
segment. Repeated Workspace windows target the same resource and do not create
multiple memoirs. Moving a Document window does not move the Document's internal
Blocks in its memoir. The synthetic root is an archive-local graph symbol; it is
not a public semantic Placement ID or an identity derived from a filename.

Each projected revision retains the original successful commit UUID, timestamp,
single-source undo/redo cause and command provenance, while recording the source
global before/after counters separately. Its exact projected graph uses consecutive
local counters. Skipping a Workspace edit or an edit to another Document therefore
does not create a false missing-revision gap. Existing content counters/fields
inside the resource are retained exactly.

The oracle computes exact content/placement differences between independently
extracted before/after resource graphs. Applying each projected event to its
private resource mirror, including after wire serialization, equals the expected
post-edit projection. This is a deterministic projection of captured canonical
states, not command re-execution or a new editable hidden repository.

Covered cases include:

- Interleaved edits in different Documents and Workspace-only edits.
- Repeated placements/windows of one Document and moving its outer placement.
- Shared content within a Document, owned deletion while references survive,
  pruning, undo/redo, margins, inline images and definitions already in the
  Document root payload.
- Cross-resource moves and cross-resource shared content as explicit boundaries
  in this oracle (not the final policy for an explicit external reference);
  no half-transfer is emitted. Affected resources stay suspended until a declared
  new baseline, while an unrelated resource can continue.
- Explicit ownership evidence for otherwise unplaced records. Without evidence,
  an unattributed changed record is reported and recording is conservatively
  suspended; it is not assigned by focus, a payload ID or a guessed location.
- New resource resolution and root-identity replacement require explicit baseline
  boundaries, rather than invented state parents.

The retained before-state supplies deletion ownership. A future live adapter must
maintain that evidence incrementally across content/edge changes. The oracle
intentionally uses snapshots/scans and must not be installed on the input path.

| Three Documents, paragraph length in each | Canonical contents | Structural projection median, 3 samples |
| --- | ---: | ---: |
| 100 | 307 | 11.735 ms |
| 5,600 | 16,807 | 464.822 ms |
| 25,000 | 75,007 | 2,649.276 ms |

These measurements rule out wholesale pre/post Workspace extraction per keystroke
in production. The final plan needs an incremental ownership/reference index
index checked against this oracle, and bounded scheduling. Moving a 2.65-second
oracle into a timer does not solve throughput. This is an implementation/performance
requirement; it does not invalidate the exact structural projection model.

### Counterexample: root-scoped linked annotations

[linkedRegistry/resolveLinkedProperty](src/block-tree/linked-annotations.ts) read
`state.rootPlacementKey` and that root's `payload.linkedAnnotations`.
[LinkedAnnotations](src/runtime/linked-annotations.ts) creates/edits shared
definitions at that same repository root; its segment search ranges across the
repository. [Canonical fragment insertion](src/block-tree/commands.ts#L297) also
merges definitions into the repository root. In a live Workspace that root is the
Workspace, not each Document.

Consequently:

```text
Workspace root: definition D has value "before"
Document A: paragraph annotation points to D
Edit only Workspace-root definition D to value "after"
Document A's structural records do not change
Its live resolved annotation does change
```

The counterexample test confirms the actual live resolver changes while the
structural-only oracle emits no Document revision. Resolving against that
Document-only mirror produces a different result. Under the accepted boundary,
zero Document revisions is correct: D is Workspace-owned. The test still exposes
the resolver assumption; it does not yet prove preservation of source provenance
or an explicit historical-unavailability result.

Stage B's [historical extraction](src/history/query.ts#L28) likewise assumes the
historical graph root carries the relevant definition registry. Filtering a
Workspace to a Document subtree does not preserve that assumption. Nor can a
Document-local registry be assumed to override the Workspace registry: the live
resolver currently has no such lookup rule.

### Smallest implementation consequence and remaining proof gates

Project the owned graph plus explicit external reference descriptors. Follow
internal sharing at the same local revision; stop at resource boundaries. Do not
copy Workspace definition values into A, overwrite A's authored root registry,
or maintain a reverse-user fan-out that records external changes in every memoir.
A conflicting Document-local definition must not impersonate the Workspace target
selected by the captured reference's source scope.

The current graph validator/applier and Stage B extraction assume their referenced
canonical records are available. An external descriptor must not be passed to
them as a dangling canonical placement, fabricated owned Block or fake target
snapshot. The final plan must specify the smallest versioned projection/read
adapter that validates owned state and external descriptors separately, while
retaining a single authoritative captured representation. This is a required
early executable gate, not evidence that the unchanged oracle already supports
cross-resource references. A descriptor change must carry the corresponding exact
preimage/transition; a derived resolver cache must never become replay authority.

Explicit external references are supported scope, not by themselves a reason to
suspend A. Ambiguous ownership, a raw shared record lacking authoritative owner
evidence, or an unsupported ownership transfer remains an explicit affected-resource
boundary. Do not silently classify those cases as external. No coordinated
cross-resource ownership transfer is added to Stage C.

Query contracts to carry into the plan:

- `getStateAt` reconstructs owned state and external reference descriptors from
  A's checkpoint/state ancestry alone, with independent per-target availability.
- `getSubtreeAt` follows owned/internal shared structure and retains boundary
  edges with provenance; it does not recursively import external target state.
  An external target is not reported as a deleted or not-yet-created A-owned Block.
- `getLocationAt` reports A's historical reference placement and occurrence route;
  it does not invent the target's historical location inside B. Preserve existing
  ambiguous-occurrence handling for shared containers.
- `getTimeline` and `compareSubtree` use owned changes, internal dependencies and
  reference/provenance changes. External target edits alone do not enter A's
  timeline or become an owned-content difference. Unchanged unpinned references
  prove equal reference state, not equal historical target content.
- Queries remain isolated from the live repository and current registries.
  Optional future resolution is a separate result keyed by source identity/version;
  it does not change A's exactness, stored result, ancestry or grouping authority.

Required Stage C tests, not yet executed by these experiments:

1. A references B's X; change/delete X or remove B's memoir. A's owned state,
   revision count and timeline remain unchanged and exact. Preserve the reference,
   identity/pin and explicit target unavailability. Reference retargeting/pinning
   in A does create an exact local revision and survives wire/reload.
2. Change/add/delete Workspace-owned D used by one or several Documents. No
   dependency-only Document revisions result. Captured source scope defeats a
   conflicting local D; missing/unversioned Workspace history stays unresolved.
   Editing a genuinely Document-owned definition still produces local history.
3. Internal sharing, margins, reference-only definitions, unplaced ownership,
   moved placements, deletion/undo and repeated windows keep their exact semantics.
   Explicit external edges are distinguished from ambiguous ownership/transfers.
4. Baseline/delta wire round trips and isolated query/index/comparison tests prove
   reference descriptor presence, unknown provenance and pin semantics without
   foreign content or live reads. Pinned cycles terminate at the resource boundary.
5. Read-old/write-new migration and ordinary save/reopen preserve external
   references and known provenance without copying their targets. Missing legacy
   source evidence is reported, not invented. Enrollment baseline evidence retains
   newly assigned identities; canonical reload still starts a projection boundary.
6. Increasing an external target's size or edit rate does not enlarge A's captured
   owned snapshots or generate work/revisions proportional to foreign edits.
   Measure projection/retention with large foreign targets; descriptors must not
   retain foreign repository graphs through cached objects or closures.

The portable spike supports the accepted identity model but has not implemented
this external descriptor contract. Its unresolved-reference fixture is narrower
than a source-resource/version-aware external reference. No schema or test result
is retroactively claimed for that new work.

## 4. Outbox, append, fencing and recovery

### Browser evidence and recommended boundary

The real Chromium experiment uses an isolated profile, two temporary local origins,
and an IndexedDB packet store plus byte ledger updated in the same transaction.
It tests identical/conflicting retries, capacity rejection, explicit abort,
acknowledgement-driven deletion, origin separation and whole-browser process-group
SIGKILL/restart.

| IndexedDB durability request | Observed transaction median / p95, 30 small packets |
| --- | ---: |
| strict | 3.2 / 12.7 ms |
| relaxed | 0.6 / 1.2 ms |
| default | 0.6 / 1.0 ms |

A 13,376,402-byte baseline packet completed a strict transaction in 89.2 ms.
The byte-cap rejection left the packet count and byte ledger unchanged. After
deleting two acknowledged packets, 89 packets totalling 13,549,410 payload bytes
survived the abrupt browser restart. An explicitly aborted record did not survive.
The other origin had an independent empty outbox.

Choose explicit strict transactions for recoverability-oriented local enqueue
where supported, while exposing the actual durability mode/status. This remains
distinct from server confirmation. IndexedDB defines strict, relaxed and default
durability behavior; transaction completion should not be described as a universal
hardware/power-loss guarantee. See the [IndexedDB specification](https://www.w3.org/TR/IndexedDB/).

The bounded design should have both payload-byte and count limits, atomic packet
and ledger updates, immutable packet IDs/bytes, and durable-ack-only deletion.
Keep only a bounded batch in RAM and let the outbox outlive editor disposal.
The lab's 64 MiB payload cap is an experiment setting, not a validated browser
quota or production default. Actual storage overhead, eviction, disk-full,
long offline sessions, worker scheduling and sustained input remain release tests.

Normal controlled navigation can await transfer to the outbox owner. Browser/OS
termination cannot guarantee that the RAM-to-IDB interval has completed. For an
unsaved normalized legacy Document, persist its normalized baseline, resource and
identity-association evidence before acknowledging dependent history. Reopening
the legacy file remains file-authoritative and uses a new canonical projection
baseline with proven semantic identity links. No automatic Document Save is needed.

### Server protocol result

The filesystem/protocol lab passed 23 checks. It uses framed records with immutable
IDs, payload byte lengths, SHA-256 integrity, physical sequence and previous-frame
hash, and writes/synchronizes before returning a durable result. It models a
serialized writer and expected-head checks independently of state-parent ancestry.

Proven finite cases:

- Identical retry after lost acknowledgement; overlapping accepted prefix plus
  a fresh suffix; conflicting duplicate rejection.
- Only one of two competing expected-head appends succeeds.
- Record-byte, batch-byte and batch-count limits reject oversized work before
  publication, counting UTF-8 bytes. The small lab limits are not production defaults.
- A new durable writer epoch after restart fences old append requests. An entirely
  accepted identical retry can be answered without granting new write authority.
- A revision cannot be accepted without its known baseline/state parent. A new
  branch may use an older parent while appending chronologically after newer ones.
- Receipts and epochs are non-revision records; physical record order is distinct
  from previous journal *revision* and exact state ancestry.
- Consolidation recovery before/after archive publication and journal rotation,
  including duplicate prefixes and a concurrent tail append.
- Explicit incomplete-tail detection; a complete corrupted tail is rejected rather
  than reclassified as harmless truncation.
- A synchronized file survives actual child-process SIGKILL.
- An OS advisory owner lock excludes a second process and is released after the
  owner is killed. This probe uses Python only to establish local kernel semantics.
- The selected immutable-segment/manifest layout recovers after each of four
  publication boundaries: chunk durable, manifest prepared, manifest published,
  journal rotated.

The production mechanism must combine both ownership layers: one OS-protected
authoritative server owner for a memoir/storage namespace, and durable writer
epochs for browser producers. A JavaScript mutex alone does not fence another
server process; a stale PID file with a racy delete is not the tested OS lock.
Choose a supported Node/platform lock binding during technical planning and keep
the lock inode stable. No production lock dependency has been installed.

### Precise promises and untested failure handling

| Watermark | Meaning |
| --- | --- |
| Committed/captured | Exact edit exists in the live process; no durability claim. |
| Browser-committed | Outbox transaction completed under the stated mode; packet can be retried under supported restart conditions. |
| Server-stored | A named framed prefix and required local baseline/replay evidence crossed the promised sync/publication boundary; external source memoir availability is not a prerequisite. |
| Replay-verified | The named resource revision's owned state and external reference/provenance records have been validated; target resolution is a separate status. |
| Saved artifact | A separate Document file publication/receipt identifies the exported semantic projection; it does not advance history ancestry by itself. |

Checksums and schema admission are not full replay verification. Keep stored and
verified watermarks separate if full graph replay is asynchronous. Never present
unverified bytes or missing required owned replay evidence as a queryable exact
state. Unavailable external history does not prevent local verification, append
acknowledgement, consolidation or ordinary Document save/open.

After any uncertain append/sync failure, fail closed for that writer until recovery
establishes the actual prefix; blindly continuing from the old in-memory head
could reuse a sequence already partially written. Torn-tail repair must be explicit
and bounded by integrity/acknowledgement evidence. Complete bad checksums, missing
parents and interior gaps preserve readable independent history but stop dependent
replay. Preserve damaged/unsupported bytes and the current Document.

The lab does not inject disk-full/short-write failures into every filesystem call,
test arbitrary concurrent interleavings, integrate real HTTP acknowledgements with
IDB deletion, or prove power-loss behavior. The browser's ack input is modeled.
The server fixture uses small in-memory record lists and is not the bounded
production streaming parser. Save receipts are only modeled as distinct records;
Document/Workspace save publication and receipt reconciliation remain Stage C
implementation gates, as specified in the earlier investigation.

The protocol fixture's baseline record establishes an ID prerequisite; it does
not upload a real checkpoint blob. In the selected layout, large baselines must
be durably published as bounded immutable blobs before their declaration and
dependent revisions can be acknowledged. Choosing actual frame/upload limits and
proving interrupted blob-upload recovery belongs in the production protocol gates.

Node provides explicit synchronization APIs but describes their implementation as
OS/device dependent. Use an accurately qualified platform promise, not “rename
means durable” or “SIGKILL proves power-loss safety.” See [Node filesystem
documentation](https://nodejs.org/download/release/v22.12.0/docs/api/fs.html#filehandlesync).

## 5. Checkpoints and physical archive layout

### Decision: directory-local `.memory`, independent per-Document archives

The visible files are the user's Documents. `.memory` is Codex's local record of
their past. All manifests, checkpoints, segments, journals and maintenance files
belong beneath this reserved boundary, not in visible `poe.*` companions.

```text
Library/
    a.json
    .memory/
        store.json                    versioned management marker (illustrative)
        index.json                    optional rebuildable discovery index
        resources/
            <resource-id>/
                <memoir-id>/
                    manifest.json
                    journal.jsonl
                    checkpoints/
                    segments/
    Poetry/
        b.json
        c.json
        .memory/                      history for b and c only
        Romantic/
            d.json
            .memory/                  history for d only
```

Internal names are illustrative, not a frozen schema. A directory's `.memory`
contains history infrastructure for Documents whose **immediate filesystem parent**
is that directory. Never inherit the nearest ancestor `.memory`. Create it lazily
when there is historical state to preserve and its location can be safely claimed.
Retained orphan archives are allowed; this rule governs placement and discovery,
not automatic deletion when a file disappears.

Each memoir keeps its own resource/memoir identity, verified generations, state
ancestry and writer. Directory colocation creates no shared historical stream,
Workspace history, cross-memoir transaction or shared replay authority. References
may later compose histories without merging them. No database or opaque project
container is introduced. Keep versioned metadata inspectable and immutable data
independently loadable, with generated confined names and verified hashes/lengths.

### Discovery, portability and lifecycle contracts

**Discovery.** After ordinary Document decode, use its stable resource ID and
verified enrollment/receipt association to locate candidate memoir IDs only in
the immediate parent's `.memory`. The Document need not embed a required memoir
pointer. Verify candidate manifest/resource/memoir identity and authoritative
record evidence before binding a writable stream. Names, index entries, matching
IDs or equal content hashes alone do not prove an intended copy/continuation.
Multiple candidate memoirs must remain distinct until association is established;
do not choose the newest timestamp. No automatic ancestor/global scan is needed.

Use a small versioned management marker to identify a Codex-managed store. A
separate optional directory index can accelerate resource-to-memoir discovery and
last-known locators, but is rebuildable by bounded enumeration of valid per-memoir
manifests/records. Missing/corrupt/stale index entries cannot erase or authorize
history. Scope index updates under a short directory-metadata lock; per-memoir
append/fencing remains independent. Marker/version admission protects writes;
neither marker nor directory index becomes history authority. Losing a marker
requires safe recognition/recovery before writes, not destruction of readable
archives. Unrecognized newer stores remain untouched.

| Filesystem operation | Required behavior |
| --- | --- |
| Copy one Document without `.memory` | It remains a complete usable authored Document, with no transported history. It may contain explicitly unresolved external references under §3. No memoir is required to open, edit, understand or save its owned content. |
| Copy a directory including its `.memory` | Its associated archives travel too. Apply the same rule independently to included subdirectories. Verify complete generations/tails on discovery; preserve resource/memoir IDs and historical evidence. |
| Copy a directory excluding `.memory` | Documents remain valid. History is unavailable, not corrupt Document data; no inferred continuity or fetch from an ancestor store. |
| Rename within one directory | Keep resource/memoir and semantic identities; update verified locator hints only. Do not rename archive directories or start history because the Document filename changed. |
| Move a whole directory with its `.memory` | Relative locality travels with it. Revalidate locators and writer ownership; paths are not resource identity. |
| Move a Document between directories through Codex | Preserve identities and relocate its verified memoir to the destination's `.memory` using the bounded handoff below. Do not move unrelated colocated memoirs. |
| Move/delete a Document outside Codex, leaving its history | Retain the original archive as unlocated/orphaned. At a new location, use only that directory's store; no implicit old/ancestor-store fallback. Explicit reattachment may validate and relocate supplied evidence. |

A plain filesystem copy preserves IDs in the bytes; opening it must not silently
rewrite them or append to the source's mutable memoir. This includes a duplicate
Document in the same directory. Distinct simultaneously discovered paths claiming
one resource are an association conflict until a move/replica/copy decision is
established. Filename changes alone do not establish that decision. Opening and
editing remain possible while writable history attachment is unresolved.

Save As **as an independent copy** assigns a fresh resource/memoir identity and
applies the accepted Block/Placement copy-remapping rules, retaining only explicit
source provenance. Rename/move preserves those identities. Do not implement global
identity deduplication or quietly redefine authored Block identity as resource-local.
A copied directory with archives is a transportable snapshot, not proof of a
globally exclusive writable owner: two disconnected copies cannot fence one
another. When divergent copies meet, preserve both, refuse automatic journal
merging or last-writer-wins selection, and report conflicting lineage. Supporting
distributed multi-writer continuation/merge is outside Stage C.

**Bounded cross-directory handoff.** Fence/pause the source memoir writer, retain
pending outbox packets by resource/memoir ID, capture a verified prefix and required
blobs, and stage/synchronize a destination copy without deleting the source.
Verify destination identity, hashes, ancestry and collision-free admission before
binding a new writer and updating locator/relocation evidence. Record the handoff
so stale source requests cannot resume after recovery; pending packets retain
their immutable IDs/parents. Cross-directory/device file operations are not one
atomic transaction. Document publication success is distinct from history
relocation success. If interrupted, retain both copies/evidence, recover a proven
active location before appending, and report history unavailable/pending if that
cannot be proved. Never acknowledge destination durability based on the source
copy or delete the source merely because the Document moved. Source retirement
needs a verified durable destination and recoverable handoff evidence. This is
storage relocation of one memoir, not transfer of Blocks between owning resources.
If a supported move cannot satisfy this protocol, preserve the ordinary Document
move and suspend history attachment explicitly rather than fake continuity.

### Failure handling and directory safety

| Condition | Required behavior |
| --- | --- |
| `.memory` missing, deliberately excluded or offline | Ordinary Document open/save remains independent. Report history unavailable; if recording is enrolled anew, use a new memoir/baseline with an explicit boundary, not fabricated continuation. Use the bounded outbox where possible. |
| Store read-only or permission denied | Read verified history when possible; retain bounded pending packets and report history persistence status separately. Do not move writes to an ancestor/global store or claim server acknowledgement. |
| Partially copied/synced store | Validate manifest generations, blob hashes and framed tails. Expose only reconstructable states; distinguish missing owned evidence from unresolved external history. Do not treat a sync-incomplete interior or acknowledged tail as harmless truncation. |
| Document temporarily absent or an orphan archive | Keep history. Last-seen time, a missing index entry, absence from the directory listing or a missing external consumer is not permission to delete it. |
| Existing user-created `.memory`, file or symlink collision | Require a recognized compatible management marker before writes to an existing store. Do not adopt even an empty pre-existing directory by name alone, overwrite user content, follow escaping links or invent a second visible history convention. Report the collision while Document operations continue. Explicit adoption/recovery is separate; no automatic migration. |
| Concurrent first initialization | Use exclusive creation/admission and verify the winner's marker/version; partial initialization is a recoverable collision, not permission to overwrite. Enforce confined paths and symlink-safe access throughout mutation, not only at initial lookup. |

Safe maintenance is limited to proven redundant physical data: known abandoned
temporary files or superseded copies unreachable from all retained generations,
revision/branch baselines, receipts, active journals, handoff evidence and in-flight
operations. Perform it under the appropriate locks, after crash recovery and a
verified replacement publication. Unknown/unclassified files are preserved.
If reachability or copy/sync completeness is uncertain, defer cleanup. No automatic
orphan-memoir deletion, age-based expiry or destructive retention in Stage C.

Treat backup/cloud/sync inclusion of `.memory` as an explicit portability concern:
do not assume a hidden/reserved directory or all of its files will be transported.
Explain the with-history/without-history distinction. Sync may deliver manifests,
chunks and journals separately; readers must tolerate temporary absence without
rewriting valid source data. Existing local locks/epochs protect the local writer,
not disconnected replicas or third-party conflict resolution. Inspect and preserve
conflict copies; do not silently merge them. A live filesystem copy is not an
atomic snapshot: use a quiescent/verified generation for complete transport, and
report the recoverable coverage of an arbitrary partial copy truthfully. Provider
qualification is a release test, not a claim established by the local labs.

**Legacy/unsaved lifecycle.** Read-old/write-new remains unchanged. Bind a
normalized legacy Document's new resource/Placement IDs once in memory, backed
by durable enrollment baseline and exact-artifact association before acknowledging
dependent history. With a known source path, its immediate parent's `.memory`
may preserve that evidence without rewriting the legacy file. Hash plus path
alone cannot distinguish two identical legacy copies; preserve association
ambiguity. On first deliberate Save, write the modern IDs and finalize the receipt.
If the destination directory changes, use the same verified handoff rules.
Untitled Documents without a filesystem parent retain enrollment in the bounded
browser outbox until a deliberate destination is known; do not select an ancestor
or globally centralized server memoir store. Server durability is not claimed
before attachment/publication there. Reopening the old bytes uses proven identity
evidence and a new canonical load baseline, never an invented exact state parent.

The final plan must test all operations/failures above, including same-directory
rename and duplicate copy, cross-directory/device move interruption with pending
packets, full/partial directory copies, absent/read-only stores, exclusion from
sync, orphan preservation, index rebuild, marker collisions/races, and legacy
open → enrollment → first Save elsewhere → reopen. Measure bounded discovery
over many colocated resources and directory-index contention separately from
per-memoir replay/storage. These locality and handoff contracts are new planning
requirements; the existing temporary-file experiments did not execute them.

### Evidence for separating metadata and independently loadable data

The layout experiment wrote 11 copies of the 25,000-character checkpoint-shaped
payload, producing 147,140,446 bytes of monolithic JSON. It is a storage-shape
experiment, not a valid eleven-revision timeline.

| Measurement | Result |
| --- | ---: |
| Stream-build and synchronize raw monolithic JSON | 423.765 ms |
| Eager read/parse raw monolithic JSON | 966.812 ms |
| Retained parsed-heap increase with explicit GC | 208,434,728 bytes |
| Gzip monolithic bytes | 26,572,028 |
| Sum of independently gzipped chunk bytes | 26,571,622 |
| Stream gzip monolith and synchronize output | 2,174.773 ms |
| Read/inflate/parse compressed monolith | 1,378.274 ms |
| Manifest size / read-parse time | 522 bytes / 0.246 ms |
| Read/inflate/lossless-decode one checkpoint | 712.823 ms |
| Replace/synchronize a new manifest generation | 10.651 ms |

The compressed candidates have essentially the same total bytes in this fixture.
The reason to choose chunks is selective access and bounded publication work,
not an asserted compression advantage. Chunk publication timing excludes producing
the compressed payload; do not compare it directly with monolithic compression
time as if both measured the same work. The RSS delta was negative because of
allocator/GC effects and is not useful memory evidence; the explicit parsed-heap
measurement is the more relevant observation, still limited to this process.

There are no multi-GB measurements or OS-page-cache eviction here. A streaming
monolithic implementation could avoid eager parsing, but would need extra machinery
for selective compressed checkpoint access and small publication updates. The
immutable layout supplies those boundaries directly with little size penalty in
the tested data. Its catalogue must also remain bounded/paged as archives grow;
“small manifest” is an architectural requirement, not a guarantee from this fixture.

### Checkpoint spacing is a replay-cost decision

| Paragraph | Lossless checkpoint encode median | Decode median | Raw write+sync median | Apply+validate one edit median |
| --- | ---: | ---: | ---: | ---: |
| 100 | 1.759 ms | 2.321 ms | 4.687 ms | 0.706 ms |
| 5,600 | 87.290 ms | 130.334 ms | 9.255 ms | 44.608 ms |
| 25,000 | 389.008 ms | 614.257 ms | 28.048 ms | 239.695 ms |

Reconstructing the 25,000-character state at distances 0, 4 and 12 from a checkpoint
took 645.881, 1,557.240 and 3,572.439 ms. This includes lossless decoding and replay
validation, with caches cold at the reconstructed-state level; storage pages were
not forcibly cold. Twelve edits are not enough to extrapolate a precise 500-edit
latency, but they are enough to reject 500 commits/8 MiB as an evidence-based
universal checkpoint policy.

Retain enrollment/load baselines, branch evidence and all exact revisions. Place
additional checkpoints according to measured replay work, graph size and storage
budget, and schedule creation/encoding/compression away from foreground editing.
Use demand-created checkpoints for queried old states where appropriate. The
final plan should make initial limits tunable and require sustained-load evidence;
it need not invent a single optimal interval from this sample.

Lossless consolidation seals a fixed prefix into immutable data, synchronizes it,
publishes a manifest generation atomically, then rotates only the incorporated
journal prefix. A crash before rotation leaves verifiable duplicates. Retain old
generation references until the new manifest and its tail are recoverable. The
fault probe verifies this prefix/publication rule. Production garbage collection
of unreachable temporary/old files still needs its own careful tests.

Compression and removal of duplicate physical copies do not expire revisions.
At roughly 2 KB per simple edit, 100,000 edits are already roughly 200 MB of event
payload, before framing and checkpoints. If graph size stayed approximately
constant, 200 checkpoints of the measured compressed size would add roughly
483 MB; without compression those checkpoints would add about 2.68 GB. This is
illustrative sizing, not a promise about growing Documents or rich edits.
Retention/expiry remains outside Stage C.

## 6. Accepted direction, deviations and readiness

Carry these decisions into the final Stage C plan:

- Preserve portable semantic identities and the explicit canonical load boundary.
  Persist unsaved enrollment evidence independently of deliberate Document Save.
- Preserve exact captured revisions, single-source undo/redo causes, independent
  state ancestry, and derived grouping. No changes to editor undo are needed.
- Use a separately versioned lossless history value envelope for exact canonical
  packets; ordinary authored JSON and exact history have different value contracts.
- Use per-resource local counters and explicit source-commit provenance. Never
  confuse Workspace global counters, physical append sequence and state ancestry.
- Stop exact closure at authoritative Document ownership. Preserve external
  references/provenance without foreign target snapshots or dependency-only
  revisions; unavailable external history does not invalidate owned reconstruction.
- Use transactional byte-bounded outbox storage, immutable retry bytes, durable
  writer epochs and an OS-protected server owner. Keep durability and verification
  watermarks truthful and separate.
- Choose independently loadable immutable checkpoint/segment files plus a small
  manifest and active journal inside immediate-parent `.memory`. Memoirs remain
  independent; directory discovery indexes and groups are rebuildable caches.

Material qualifications to earlier assumptions:

1. Portable structure solves intentional sharing/reload identity for its supported
   surface, not canonical replay equality or a proven external provenance schema.
2. A Document memoir need not capture its whole live dependency environment.
   The user resolved that earlier architectural blocker by the ownership boundary;
   explicit external projection and query contracts still require implementation proof.
3. The in-memory projection/replay oracle is too expensive for per-input use.
   Production ownership maintenance and asynchronous work must be evaluated
   against it rather than copying its scheduling strategy.
4. The proposed literal three-file monolithic archive is replaced in the recommended
   physical layout by a manifest plus immutable data files and an active journal,
   all under directory-local `.memory`; visible per-Document sidecars are superseded.
5. Browser transaction completion, server synchronization and exact replay
   verification are distinct evidence boundaries. Process-crash tests do not
   establish universal power-loss guarantees.

Recorded experimental verification (before the ownership-boundary and `.memory` documentation
amendment; not evidence that the new external-reference gates pass):

| Check | Result |
| --- | --- |
| New pre-plan unit suite | **15 tests passed**, including the explicit dependency counterexample. |
| `npm test -- src/block-tree src/history src/reactive-editor/persistence.test.ts src/reactive-editor/workspace-manifest.test.ts` | **15 files / 161 tests passed**, including the portable spike, existing undo/redo, exact history and save/open regression coverage; 20.95 s wall time. |
| `npm run typecheck` | Client and server type checks passed. |
| Protocol laboratory | **23 checks passed**, including publication faults and OS/process probes. |
| Chromium outbox laboratory | **7 checks passed**, with transaction measurements and restart evidence in its artifact. |
| Storage and projection scripts | Completed all recorded workloads and assertions; temporary data/profile cleanup completed. |

Production parser hardening, Node lock binding selection, incremental ownership maintenance, bounded streaming I/O,
integrated fault injection, background scheduling, other-browser/platform coverage
and checkpoint tuning remain required implementation/release work. They should be
explicit gates in the eventual plan, not claims already proved by these labs.

**Readiness recommendation:** the [final implementation plan](BLOCK_SCOPED_HISTORY_STAGE_C_PLAN.md)
now includes the ownership-boundary contracts and early proof gates in §3, and the
directory-local discovery/relocation/safety gates in §5. The
environmental-dependency blocker is resolved by decision, not by a newly passing
experiment. No remaining pre-plan architectural blocker is identified; do not
treat ownership attribution, external descriptor/replay support, performance or
durability qualification as already implemented. No Stage C implementation or
production portable-format integration has begun.
