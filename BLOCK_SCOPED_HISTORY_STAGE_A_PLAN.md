# Block-scoped history — Stage A implementation plan

Status: Stage A implemented and verified with the user-approved copy-policy
amendment, 17 September 2026. The discrepancy and verification are documented in
[BLOCK_SCOPED_HISTORY_STAGE_A_COMPLETION.md](BLOCK_SCOPED_HISTORY_STAGE_A_COMPLETION.md).
Architectural authority: [BLOCK_SCOPED_HISTORY_SPEC.md](BLOCK_SCOPED_HISTORY_SPEC.md),
especially sections 4–6 and roadmap Stage A.

Follow-up decision: compact exact capture and derived sentence-oriented playback
are planned in [Stage B](BLOCK_SCOPED_HISTORY_STAGE_B_PLAN.md). Its revised scope
preserves existing undo/redo behavior; word-oriented undo is a separate editor UX
feature. This document remains the record of Stage A's full-record capture proof;
it does not claim the optimization or playback grouping is already implemented.

## 1. Deliverable and scope

Stage A establishes authored Block identity and proves that every successful
repository commit can supply sufficient, immutable evidence to reproduce its
exact result. Its demonstration is an automated, in-memory sequence on one
Document: normalize its identities, capture edits, and replay the captured
changes into a plain graph in a test. Compare that graph with the committed
repository after every step, including undo and redo.

The deliverables are a small identity module, an optional commit-result
subscription, structured command metadata where identity relationships matter,
and regression/performance evidence. Normal editor operation does not start
retaining an unbounded history array. The test harness owns its finite capture
array and initial snapshot.

Stage A does **not** include:

- Stage B's historical subtree queries, temporal indexes, checkpoint lookup,
  branch reconstruction, or comparison service.
- Stage C's memoir files, journals, browser outbox, server endpoints, receipts,
  restart/rebinding protocol, resource partitioner, or storage migrations.
- Stages D–E's history controls, rendering context, scrubber, historical-copy
  planner, or insertion of historical material.
- Workspace history, cross-Document transfer coordination, retention expiry,
  per-Document undo stacks, or a global history catalogue.

A test-only replay helper is required to verify capture completeness. It has no
production query API and is not a partial implementation of Stage B. Ordinary
existing copy/paste commands are in scope only to establish their identity
behavior and capture provenance.

## 2. Findings that determine the work

| Current code | Finding | Stage A consequence |
| --- | --- | --- |
| `CanonicalRepository.commit()` in `src/block-tree/repository.ts` | Selects the general path or calls `commitInline()` after `inlineOwnerFor()`, `splitChangeFor()`, or `emptyParagraphParentFor()`. | Cover all four routes, including their undo/redo variants. Do not force fast edits through full graph planning. |
| General `commit()` and `commitInline()` | Adjust content revision fields before applying state. Undo entries store the caller's operations, not necessarily those adjusted final records. | Capture final before/after records independently of the undo entry. |
| `RepositoryChange` | Includes content preimages but omits placement preimages, root changes, transaction identity, and structured cause. | Add a separate optional subscription; preserve the existing lightweight projection/editor subscriptions. |
| `TreeCommands.publish()` / `transaction()` | Nested commands accumulate operations against a draft and produce one outer commit. | Accumulate ordered command descriptors alongside operations; emit one result for the outer commit. |
| `ExistingBlockDto.id` and `decodeBlockTree()` | IDs are optional; decoding intentionally preserves legacy fields and regenerates runtime keys. | Keep legacy decoding lossless. Normalize explicitly in the spike harness before constructing its repository. |
| `splitStandoff()`, `detach()`, `copy()`, `cloneBlocks()` | Several new IDs are conditional on the source already having an ID. | Every newly authored Block needs an ID, including Blocks created from id-less input. |
| `replaceAcrossBlocks()` / `planCrossTextEdit()` | Keep the first Block and can remove several others or create several new paragraphs. | Cover this creation path and describe its input/output identities without pretending it is one simple join. |
| `replace()` | Retains a placement but installs a different ContentRecord and accepts a new public ID. | Record replacement separately from movement; do not redefine this command as identity-preserving conversion. |
| `BlockClipboardService` | Cut and paste are separate commits; eligible cut-paste preserves public IDs while regenerating runtime keys. | Correlate the existing operations and record whether the actual paste retained identities or made a copy. |
| `PersistenceService.saveWorkspace()` / `documentIdentity()` | Workspace resource identity can use `metadata.documentId`, separately from `payload.id`. | Do not conflate resource identity with Block identity or alter Workspace persistence in this spike. |

## 3. Exact implementation footprint

The implementation footprint below is verified by the linked completion report.
The recorded benchmark output is in `BLOCK_SCOPED_HISTORY_STAGE_A_BENCHMARK.json`.

| File | Functions/classes to add or change | Bounded purpose |
| --- | --- | --- |
| `src/block-tree/ids.ts` | Add `createBlockId()` and `createCommitId()`. | UUIDs for authored identity and commit correlation. Reuse the installed `uuid` package's v4 generator; do not use the runtime-key counter fallback for durable identities. |
| `src/block-tree/identity.ts` — new | `isAuthoredBlock()`, `readBlockId()`, `planBlockIdentityNormalization()`, `applyBlockIdentityNormalization()`, `prepareNewBlockIdentities()`, `BlockIdentityIndex`. | Explicit normalization, preparation of new authored content, and an opt-in current-state identity invariant. This index maps IDs to current ContentKeys only; it is not a historical locator. |
| `src/block-tree/commit-capture.ts` — new | Commit-result types; `prepareCommitCapture()`, `finishCommitCapture()`, immutable record copying/freezing. | Coalesce touched keys and capture first preimages/final values, including placements and root. No repository retention or storage. |
| `src/block-tree/types.ts` | Add `BlockId` / `CommitId` aliases; add `commitId` to existing `HistoryEntry`. | Distinguish authored and commit identity in signatures; connect undo/redo to their original transaction. Keep `ExistingBlockDto.id` optional and runtime record schemas compatible. |
| `src/block-tree/repository.ts` | `CanonicalRepository` constructor options, `commit()`, `commitInline()`, `undo()`, `redo()`; add `subscribeCommits()` and a common capture-delivery helper. | One successful-commit event, explicit causes, optional identity validation, and subscriber error isolation. |
| `src/block-tree/commands.ts` | `PendingTransaction`, `publish()`, `transaction()`; creation methods `insert()`, `insertFragment()`, `replace()`, `setRelation()`, `insertEmptyStandoffSibling()`, `splitStandoff()`, `copy()`, `detach()`; semantic descriptors for `move()`, `joinStandoff()`, `replaceAcrossBlocks()` and the preceding methods. | Guarantee new authored IDs; preserve existing identity semantics; accumulate provenance with the final transaction. |
| `src/block-tree/commands.ts` | `setPayloadField()` and `setBackground()`. | Respect the opt-in identity invariant. A background descriptor update keeps the existing surface ID; a conflicting incoming ID cannot silently rename it. |
| `src/block-tree/clipboard.ts` | `cloneBlocks()` and a small extracted helper for known Block-ID reference remapping; optional copy identity map on `BlockFragment`. | Fresh IDs for id-less copied Blocks, explicit source/copy mapping, correct remapping of already supported Block references. Preserve shared ContentRecords within a fragment. |
| `src/block-tree/cross-text-edit.ts` | `CrossTextEditResult`, `planCrossTextEdit()`. | Use the common authored-ID factory for additional paragraphs and return input/output identity information needed by `replaceAcrossBlocks()`. |
| `src/runtime/block-clipboard.ts` | Clipboard payload; `BlockClipboardService.remove()`, `copy()`, `paste()`. | Carry an in-memory cut/copy correlation token and actual preserve/copy outcome into command metadata. No OS clipboard or cross-resource transfer protocol. |
| `src/block-tree/identity.test.ts` — new | Normalization and authored identity tests. | Migration and identity proof. |
| `src/block-tree/commit-capture.test.ts` — new | Capture contract and replay tests. | Exact result, errors, atomicity, and undo/redo proof. |
| `src/block-tree/test-support/captured-replay.ts` — new | `applyCapturedCommitForTest()` and a single-Document spike setup helper. | Plain-data test oracle and normalized baseline; not exported by the application. |
| `src/runtime/block-clipboard.test.ts` — new | Existing clipboard identity/correlation behavior. | Exercise real cut/paste, repeated paste, and collision fallback. |
| Existing block-tree tests and `scripts/benchmark-typing.mjs` | Extend identity assertions and add capture-off/capture-on measurement modes. | Guard existing fast paths and measure capture cost. |

`src/block-tree/codecs.ts`, `extended-codec.ts`, `inline-plan.ts`, and
`split-plan.ts` are reused and tested. No production changes to them are expected.
In particular, adding identity metadata must not weaken a fast-path validator.

`ReactiveEditor`, `PersistenceService`, Workspace codecs/stores, renderers, and
the server require no new history wiring for Stage A. Existing tests can construct
a normalized `CanonicalRepository` directly with `TreeCommands` and a projection.
Application-level history enablement is a later integration decision.

## 4. Identity policy and normalization

### 4.1 What receives a Block ID

In the current canonical graph, `text-cell` and `image-cell` are internal inline
records. They retain runtime keys for exact replay and do not receive authored
Block UUIDs. An ordinary `image-block` does receive one. All other authored
ContentRecords, including containers, Pages, owned margin Blocks, and unknown
Block types, participate. Use an explicit internal-type check, not a blanket
test for a name ending in `-cell`.

Inspect ContentRecords once, rather than assigning IDs per occurrence. Several
placements pointing to the same ContentKey share one Block ID. Two different
ContentKeys claiming the same ID are ambiguous, even if their text is identical.

### 4.2 Explicit normalization of an initial graph

Proposed interface in `identity.ts`:

```ts
interface IdentityIssue {
  kind: "duplicate-id" | "invalid-id";
  contentKeys: ContentKey[];
  originalId: unknown;
}

type BlockIdentityNormalizationPlan =
  | {
      status: "ready";
      assignments: Array<{ contentKey: ContentKey; blockId: BlockId }>;
    }
  | { status: "ambiguous"; issues: IdentityIssue[] };

function planBlockIdentityNormalization(
  state: RepositoryState,
  createId?: () => BlockId,
): BlockIdentityNormalizationPlan;

function applyBlockIdentityNormalization(
  state: RepositoryState,
  plan: BlockIdentityNormalizationPlan,
): RepositoryState;
```

Rules:

1. Preserve existing nonblank string IDs exactly, including non-UUID legacy IDs.
   Assign fresh UUIDs for absent, null, or blank IDs. A non-string, non-null value
   is an `invalid-id` issue rather than permission to overwrite unknown data.
2. Detect all duplicate IDs before applying any assignments. An ambiguous plan
   makes no changes. Do not choose which Block an old ID or reference meant.
3. Apply a ready plan to a copy of the supplied graph before repository creation;
   recheck its preconditions. The input DTO and graph remain untouched. Applying
   normalization to the resulting graph again proposes no assignments.
4. Preserve all payload fields, collection presence/null distinctions, annotation
   IDs, opaque relations, inline atoms, and graph keys. Only the planned authored
   `payload.id` fields change. Initial normalization is baseline preparation, not
   a user edit or an undo entry.
5. Report an ambiguous import as ineligible for the normalized spike. Resolving
   it into a new bounded import baseline needs an explicit identity/reference
   policy later. The ordinary legacy decoder must continue to accept the file.

No on-disk migration runs in Stage A. Existing codec tests must still round-trip
their original input exactly. A normalized ordinary tree can be encoded and
decoded to prove that its public Block IDs survive; its runtime keys will change.
Shared graph identity is tested through the existing extended codec. Rebinding a
normal saved tree to old archive placements belongs to Stage C.

Do not enable strict identity halfway through a live repository with undo
preimages from before normalization. The Stage A harness constructs a fresh
repository from the normalized graph. Migrating a live undo stack is out of scope.

### 4.3 New content and ongoing invariants

`prepareNewBlockIdentities()` operates on newly decoded/cloned canonical content,
not arbitrary nested payload objects. Use it from creation commands; make the
right side of `splitStandoff()` unconditionally receive a fresh authored ID.
The extra paragraphs in `planCrossTextEdit()` already receive IDs and should use
the common factory. Do not give the surviving left/first Block a new ID.

Ordinary insertion may preserve supplied IDs when unambiguous. Copy and detach
allocate fresh IDs for copied authored content, including sources without IDs.
Transclusion retains the shared Block ID and creates a new placement. Removal
retains its old identity in the captured preimage even when pruning removes the
ContentRecord. An eligible cut-paste can retain the public ID with new runtime
keys; a later paste or collision fallback is a copy with fresh IDs.

Use an opt-in `BlockIdentityIndex` in the repository, enabled by
`enforceBlockIdentity: true` in the spike harness. Build it once at construction.
Before each commit, validate touched authored contents against the proposed final
ID mapping; update the index only after a successful commit. Check deletions and
insertions as one transaction so an identity-preserving replacement of runtime
keys does not fail merely because its operations have a particular order.
Use `BlockIdentityIndex.validateCommit()` to prepare an index delta without
mutation and `acceptCommit()` to install it after success. The fast path supplies
its touched final records; validation must not build a whole-graph draft.

Reject missing/duplicate IDs and changes to the ID of an existing authored
ContentKey in strict mode. A raw repository call or `setPayloadField("id", ...)`
must not bypass that invariant. Default legacy repositories continue to accept
their preexisting id-less material. This opt-in boundary keeps normalization
explicit while making the spike's identity guarantees enforceable.

The index checks the graph enrolled in this repository; it cannot prove the
uniqueness of arbitrary old IDs across unopened files. New UUID allocation and
later cross-memoir identity reconciliation address those different concerns.

### 4.4 Reference and replacement limits

Reuse the known remapping rules in `cloneBlocks()` for `codex/block-reference`
values in standoff/block properties and linked-annotation definitions. Build the
map from unambiguous source identities and record source-to-copy pairs by
ContentKey as well. Do not recursively rewrite every object containing an `id`:
opaque relations and remote/entity IDs have different meanings.

Approved amendment: `TreeCommands.copy()` uses the existing canonical
`captureBlocks()` / `cloneBlocks()` / `insertFragment()` helpers so one copied
ContentRecord receives one new authored ID and its internal placements remain
shared. Known internal Block references point to that unique copied identity.
Keep `encodeDocument()` as a compatibility check that preserves the existing
explicit failures for unsupported legacy export (inline-image loss and cycles).
Do not introduce a new general-purpose copy planner. This explicitly replaces
the original proposal to copy via decoded legacy DTOs, which expands shared
content and makes reference remapping ambiguous. Existing supported annotation
semantics remain intact; use the existing clone helper's annotation remapping.

`replace()` may replace Block A with a new Block B at A's placement. Capture the
old/new content identities and retained placement; test the existing behavior
with `childPolicy: "preserve"`. A surviving placement does not prove that Block
identity survived. Do not silently convert a caller-requested replacement into
a move or a resurrection of a different historical Block.

## 5. Proposed commit contract

The Stage A event is a repository fact with enough raw data for later history
recording. It contains no filename, memoir ID, journal sequence, save receipt,
archive placement mapping, or persistence acknowledgment.

The following interfaces belong in `commit-capture.ts`; `BlockId` and `CommitId`
are string aliases in `types.ts`. `DeepReadonly` can be a local utility type;
runtime capture must also clone/freeze nested records.

```ts
type CommitCause =
  | { kind: "edit" }
  | { kind: "undo" | "redo"; sourceCommitId: CommitId };

interface BlockCommitSubject {
  contentKey: ContentKey;
  placementKey?: PlacementKey;
  blockId?: BlockId; // Required for authored subjects in strict mode.
}

interface CommandDescriptor {
  commandId: string; // Stable identifier supplied by the command, not its label.
  subjects: BlockCommitSubject[];
  relation?:
    | { kind: "split"; source: BlockCommitSubject; created: BlockCommitSubject; at: number }
    | { kind: "join"; survivor: BlockCommitSubject; absorbed: BlockCommitSubject; at: number }
    | { kind: "copy"; pairs: Array<{ source: BlockCommitSubject; copy: BlockCommitSubject }> }
    | { kind: "replace"; previous: BlockCommitSubject; next: BlockCommitSubject }
    | { kind: "cross-text-replace"; inputs: BlockCommitSubject[]; outputs: BlockCommitSubject[] };
  clipboard?: { token: string; action: "cut" | "paste"; preservedIds?: boolean };
}

interface CommitMetadata {
  cause?: CommitCause; // Defaults to edit for existing direct callers.
  commands?: CommandDescriptor[];
}

interface RecordDelta<K, T> {
  key: K;
  before: T | null; // null means absent, not a null-valued record.
  after: T | null;
}

interface RepositoryCommitResult {
  commitId: CommitId;
  label: string;
  timestamp: string;
  cause: CommitCause;
  undoRecorded: boolean;
  beforeRevision: number;
  afterRevision: number;
  root: { before: PlacementKey; after: PlacementKey };
  contents: RecordDelta<ContentKey, ContentRecord>[];
  placements: RecordDelta<PlacementKey, PlacementRecord>[];
  commands: CommandDescriptor[];
}

interface RepositoryOptions {
  enforceBlockIdentity?: boolean; // Default false; explicit spike enrollment.
}

// Existing arguments retain their meaning; append an optional metadata argument.
commit(label: string, operations: RepositoryOperation[],
       recordHistory?: boolean, metadata?: CommitMetadata): void;

subscribeCommits(
  listener: (result: DeepReadonly<RepositoryCommitResult>) => void,
  onError: (error: unknown, commitId: CommitId) => void,
): () => void;
```

The corresponding `TreeCommands` seams are deliberately small:

```ts
private publish(label: string, operations: RepositoryOperation[],
                descriptor?: CommandDescriptor): void;

transaction(label: string, operation: () => void,
            descriptor?: CommandDescriptor): void;

insertFragment(fragment: BlockFragment, destination: Destination,
               descriptor?: CommandDescriptor): PlacementKey[];
```

Existing callers need no extra argument. The clipboard service supplies the
outer cut/paste descriptor; built-in commands supply their own descriptors.
`PendingTransaction` keeps the outer descriptor followed by the ordered nested
descriptors. `publish()` passes that array in the fourth repository argument.
Use a generic descriptor for direct repository edits lacking richer semantics;
use the fixed identifier `repository.commit`, never a parsed display label.
Their exact record deltas remain fully captured.

Generate one UUID per successful commit, including commits without a capture
subscriber, so an undo entry can identify its source later. Add that `commitId`
to `HistoryEntry`; retain the existing forward/inverse arrays and undo grouping.
Repository revision counters remain local counters. The future archive can wrap
this event with its own sequencing and resource information.

`undo()` and `redo()` supply structured causes referencing the original entry's
commit ID. Each execution receives its own fresh commit ID. Do not parse labels
such as `Undo ...`, and do not suppress capture when `recordHistory` is false.
Copy/split/join descriptors identify the original operation; undo/redo use the
explicit source link rather than falsely describing an undo as a new split.

## 6. Capture algorithm and commit boundaries

1. Preserve the existing path selection and validation. When there are capture
   subscribers, collect touched content/placement keys from the operations and
   retain each key's first preimage before any reactive mutation. Capture the
   old root and repository revision too. Coalesce repeated writes by key.
2. On the general path, obtain final values from `next` after the repository's
   revision adjustments. On a fast path, use the adjusted prepared operations
   and the resulting records; never clone the full Document to produce an event.
3. Publish only after the validated state has been installed and its revision
   advanced. Both commit implementations call the same finishing/delivery helper.
   Emit before existing after-change subscribers can obscure the successful
   capture by throwing. Preserve their existing projection notification contract.
4. Deltas contain the first before-value and final after-value. Omit record pairs
   that are exactly equal; keep the repository revision/root envelope. A
   create-then-delete within one transaction can therefore have no surviving
   record delta, while its command descriptor still explains the operation.
5. Clone records and descriptors into owned data and deeply freeze the event.
   Later edits, caller mutation of proposed operations, or one subscriber must
   not corrupt an event already delivered to another subscriber.
6. Isolate each new subscriber and its error handler. A capture failure must not
   turn a committed edit into a failed command or stop delivery to other capture
   subscribers. Report the affected commit ID. No archive retry queue is added.
7. Disallow synchronous repository mutation from the new capture callback and
   route the attempted reentrancy through its error handler. This observer is for
   facts about an already committed edit. It may queue later work separately.
8. With no capture subscribers, skip all event record cloning, freezing, and
   retention. Strict identity validation, when explicitly enabled, examines
   touched authored records using its current-state index.

An empty operations array, a command-level no-op, invalid operations, and an
aborted outer transaction emit no event. Preserve existing behavior for a
nonempty operations array that advances the repository revision despite having
no net content difference: it receives one event. Stage A does not redesign
commit/no-op semantics.

`PendingTransaction` accumulates descriptors only after each draft operation
successfully plans. Nested `transaction()` calls remain part of the outer
transaction. A failed outer transaction discards both operations and descriptors.
Cover `set-root`, deletion preimages, and multiple writes to the same key even
though ordinary typing does not exercise them.

For undo/redo, preserve the stack entry if commit validation fails. Capture
observer exceptions are isolated and cannot cause that failure. No abandoned
redo state is retained by a new production subsystem; the test's capture array
proves that discarding a redo stack need not discard previously observed events.

## 7. Exactness proof without Stage B

`applyCapturedCommitForTest()` takes a plain initial `RepositoryState` and the
next captured result. It checks the expected repository revision, root, and
record preimages; assigns/removes final content and placement records; assigns
the recorded final root and revision; then calls `validateRepository()`.

It must not call `CanonicalRepository.commit()` to replay: that would adjust
counters again and could hide an incomplete capture behind the live command
logic. It also must not call any historical subtree query or infer changes from
the semantic descriptors. Compare the replay graph to `repository.snapshot()`
after **each** source commit, including exact content/inline revision fields.
Test snapshots are taken outside the measured editing path.

Replay the sequence a second time from the same baseline to prove deterministic
results. The recorded runtime keys suffice for this one graph/session proof.
Save/reopen mapping, archive placement IDs, and a historical query spanning
different runtime graphs remain unproven until their later stages.

## 8. Tests to add and regressions to retain

| Test location | Required cases |
| --- | --- |
| New `identity.test.ts` | Missing/null/blank IDs; preservation of valid non-UUID IDs; deterministic injected allocation; invalid IDs; duplicate IDs across different contents; legitimate shared content; all-or-nothing normalization; idempotence; unchanged input; unknown/opaque payloads; owned margins; Cells excluded; strict mode rejects an ID rewrite or collision before mutation. |
| New `identity.test.ts` plus `block-tree.test.ts` | Insert nested id-less content; split keeps left/new right; empty sibling gets ID; cross-text multiline creation; copy/detach gets fresh IDs; shared references keep identity; replace retains placement but changes content identity; removal/undo restores original IDs; background update keeps identity. |
| New `commit-capture.test.ts` | One event per successful general, inline, split, and empty-paragraph path; route fallbacks with inline image atoms; property/annotation edits; relations; move/reorder; remove/prune; split/join; nested grouped commands; repeated record writes; root replacement; generic direct `commit()`; explicit `recordHistory=false`; no-op/failure behavior. |
| New `commit-capture.test.ts` | Undo/redo causes and source IDs; unique commit IDs; successful undo/redo replay; edit after undo; failed transaction emits nothing; deleting a referenced occurrence does not falsely delete shared content. |
| New `commit-capture.test.ts` | Immutable preimages including deleted placements; subsequent edits cannot mutate old events; throwing subscriber/error handler; unsubscribe; reentrant capture callback; one observer cannot prevent another from receiving the event. |
| New `commit-capture.test.ts` using test replay helper | Fixed mixed-operation scenario and seeded Unicode edits; annotations, null/omitted fields, linked definitions, owned relations, references, and inline image descriptors survive exact replay. Reproduce the relevant moved-child structure changes from the architectural spec by comparing whole graph states; no subtree query is added. |
| New `src/runtime/block-clipboard.test.ts` | Same-repository cut/paste retains public IDs when eligible but changes runtime keys; source cut and paste share a token; repeated paste makes new IDs; undo before paste triggers collision/copy fallback; capture reports the actual outcome. |
| Existing `inline-performance.test.ts`, `split-performance.test.ts` | Run snapshot/index/occurrence invariants with capture enabled as well as disabled. Include shared projections, large Document typing, split/undo/redo, empty siblings, and malformed fast batches. |
| Existing `compatibility-fixtures.test.ts`, `block-tree.test.ts` | Unnormalized codec round trips unchanged; explicit normalization preserves public IDs through ordinary encode/decode; extended codec preserves shared graph keys; no claim of lossless legacy inline-image export. |
| Existing `cross-text-edit.test.ts`, `margin-commands.test.ts`, Workspace and persistence tests | Existing identity, annotations, attachment, resource-ID, and save behavior survives the small shared-code changes. |

Keep tests behavior-based: exact committed graph, public identities, number of
events, and observable error/undo outcomes. Avoid assertions tied merely to the
number of private helper calls, except existing no-snapshot/performance guards.

## 9. Performance evidence

Extend the existing in-memory typing benchmark, without adding dependencies or a
benchmark service. Measure capture disabled and enabled with the same normalized
fixture and commands. Collect sample count, median/p95 edit time, cloning time,
snapshot count, and captured record count/encoded byte size. Serialize events
after the timed edit loop; serialization is not part of the typing callback.

Use the existing 1k/5k/10k/25k Documents, plus long single paragraphs (including
the 5,600-character split fixture) and a paragraph with annotations. Include
typing, deletion, empty insertion, split, undo, and redo. Warm up and repeat so
six individual operations are not treated as a stable latency estimate.

Stage A performance gates are structural: no added whole-Document snapshot,
hash, serialization, or scan on fast typing/Enter; no unchanged paragraph records
in an event; no retained events in the repository after delivery. Record measured
overhead rather than inventing a millisecond budget before the baseline exists.
Long paragraph before/after arrays may still be large: report that cost and a
recommended follow-up threshold. Compact text patches belong to a later measured
optimization unless the spike cannot preserve its existing editing invariants.

The completed measurements now justify that follow-up. Stage B plans compact
capture at the repository boundary before query/index work; grouping already
constructed full-record events would not remove Stage A's per-edit copying cost.

## 10. Implementation order

1. Add identity types/factories and explicit normalization with tests. Document
   malformed fixtures rather than rewriting repository data files.
2. Add the optional current-state identity invariant and update the enumerated
   new-Block creation paths. Run existing command/codec regressions.
3. Add the commit-result seam for general and optimized paths, including root
   and placement preimages; add immutability and failure tests.
4. Thread command descriptors through pending transactions and add undo/redo
   source IDs. Add split/join/copy/replace and clipboard correlation assertions.
5. Build the finite test capture/replay harness; verify every intermediate state
   in deterministic mixed-operation and Unicode scenarios.
6. Run targeted regressions, type checking, and capture-on/off measurements.
   Record results, limitations, and any issue that must be resolved before B.

Use the existing toolchain. Proposed verification commands after implementation:

```sh
npm test -- src/block-tree src/runtime/block-clipboard.test.ts src/reactive-editor/persistence.test.ts src/reactive-editor/workspace-manifest.test.ts
npm run typecheck
npm run benchmark:typing
```

Run additional existing rendering tests only where an actual failure or changed
command behavior calls for them. Stage A introduces no new user-facing control
requiring a history browser test.

## 11. Explicit exit criteria

Stage A is complete when all of the following evidence is recorded:

1. An explicit normalization report and passing tests show that every authored
   Block in the enrolled fixture has an unambiguous stable ID. Ambiguous legacy
   input is reported without silent data repair or a partial migration.
2. The enumerated creation/edit/move/copy/split/join/replace paths obey their
   stated identity rules. Strict mode enforces the invariant even for direct
   repository calls. Character and image Cells remain internal graph records.
3. Every successful outer commit through all four routes produces exactly one
   immutable capture event with final records and deletion/root evidence;
   failed/aborted operations produce none.
4. Undo/redo retain their current user behavior, carry explicit source commit
   identities, and are captured independently of the undo recording flag.
5. The test replay graph equals the committed canonical graph at every revision
   of the fixed mixed-operation and seeded Unicode scenarios. This comparison
   includes records, root, annotations, relations, atoms, and revision fields.
6. Capture observer failure cannot corrupt an event, roll back a committed edit,
   or prevent another capture observer from receiving it. Disposal unsubscribes
   cleanly and the repository owns no accumulated history stream.
7. Existing compatibility, command, performance, and persistence regressions and
   type checks pass. Any new ID fields expected in newly created Blocks are
   explained; legacy decoder fixtures are not rewritten to conceal breakage.
8. Capture-on/off measurements and structural performance guards are recorded,
   including the cost of long paragraph records and any recommended budget for
   the next stage.
9. A short completion note identifies what Stage A proved and what remains
   unproven: historical subtree queries, durable history, reload mapping,
   cross-Document continuity, rendering, and historical copy.

These criteria finish Stage A. They do not authorize proceeding into B–E.
