# Block-scoped history — Stage B technical implementation plan

Status: **revised technical plan; not implemented**, 17 September 2026. Stage B
covers compact exact capture and isolated historical services, with playback
grouping derived from exact revisions. Existing Codex undo/redo behavior and
undo-stack semantics remain unchanged. Word-oriented undo is a separate editor UX
feature and is outside this plan. Proposed interfaces and initial playback tuning
values remain implementation design choices.

Architectural authority: [the specification](BLOCK_SCOPED_HISTORY_SPEC.md),
particularly sections 3, 5, 6, and 8. Baseline evidence:
[Stage A completion](BLOCK_SCOPED_HISTORY_STAGE_A_COMPLETION.md) and
[the original benchmark](BLOCK_SCOPED_HISTORY_STAGE_A_BENCHMARK.json).

## 1. Deliverable and boundaries

Stage B provides an explicitly enrolled, in-memory history segment for one
normalized Document, with compact exact capture, meaningful grouping, isolated
reconstruction, historical location/membership, subtree queries, and comparison.
The demonstration is automated: record edits, query earlier states while the
current Document continues to exist, and prove that queries leave it unchanged.

Implementation order is deliberate:

1. Reduce the cost of capturing each committed edit at the repository boundary.
2. Add exact in-memory replay/checkpoints and revision lookup.
3. Add a policy-neutral historical grouping layer with an initial sentence playback policy.
4. Add historical subtree, location, timeline, and comparison queries.
5. Verify exactness, grouping behavior, isolation, and measured costs together.

Normal editor commits remain immediate. Sentence completion never gates capture.
Playback groups reference exact revisions and normally present their endpoints;
every constituent revision remains independently addressable and replayable.
Grouping is a derived presentation layer, never replay authority. Compact capture
is the measured prerequisite for economical recording; grouping is not a
prerequisite for capture, reconstruction, or the existing undo system.

Stage B does not implement memoir files, journals, browser outboxes, save receipts,
reload rebinding, server endpoints, a resource partitioner, or multi-writer
coordination. Those are Stage C. History controls, playback rendering, production
history enablement, and historical copy remain Stages D–E. Optional inexpensive
input-intent hints may improve historical grouping; they do not change editing
transactions, composition handling, selection behavior, or undo steps.

Existing undo/redo behavior, step granularity, source causes, and global stack
ownership remain intact and receive regression coverage. Per-Document undo stacks,
cross-Document biography, CRDT/selective undo, retention expiry, asset-byte archival,
and a new text-buffer data structure are excluded. Existing command/projection
costs are measured separately from capture overhead.

## 2. Findings in the current code

| Code | Finding | Design consequence |
| --- | --- | --- |
| `commit-capture.ts` | `prepareCommitCapture()` clones whole touched preimages; `finishCommitCapture()` compares and clones whole final records. | A compact encoder downstream of this event cannot remove the original copying cost. Add a compact representation at capture preparation. |
| `repository.ts` | General, inline, split, and empty-paragraph routes share event delivery; only subscribed capture creates event data. | Keep route validation, observer isolation, and opt-in behavior. Support full and compact observers independently. |
| `inline-plan.ts`, `split-plan.ts` | Validators already examine old/new sequences and enforce freshness, ownership, and conservation. | Derive verified splice information during this work; do not trust command labels or arbitrary metadata as a patch proof. |
| `commands.ts` | Inline replacement already knows the edit range and inserted Cell keys, but publishes full-record operations. | Thread candidate edit facts to the validator or expose verified plans; keep raw direct commits and fallback exact. |
| `types.ts`, `repository.ts` | `HistoryEntry` represents one commit; causes name one `sourceCommitId`. | Preserve these contracts and existing undo/redo behavior. Playback groups reference revisions without reading or changing the undo stacks. |
| `input/gateway.ts` | Central beforeinput, focus, selection, paste, and composition handling already exists. | Optionally attach inexpensive descriptive hints at existing seams; preserve current IME reconciliation and editing behavior. Grouping must also work without these hints. |
| `input/multi-selection-editor.ts`, `cross-block-input.ts` | Multi-selection and cross-Block edits have their own transaction/input paths. | Preserve their transaction boundaries; existing command descriptors and optional hints can identify separate playback actions. |
| `input/graphemes.ts` | Canonical text coordinates count code points; grapheme segmentation avoids splitting composed text. | Historical sentence segmentation must map any UTF-16 offsets back to canonical Cell coordinates. |
| `test-support/captured-replay.ts` | A finite test oracle already proves exact every-revision replay. | Reuse its scenarios; production replay must not import Vitest or call repository commits. |
| `extended-codec.ts` | Full canonical graph encoding preserves keys and validates state. | Reuse for checkpoint payloads inside a separate versioned history envelope. |
| `projection.ts` | One PlacementKey may occur through several ancestor reference routes. | Historical occurrence selection may need a route as well as a placement; never choose an arbitrary first match. |
| `linked-annotations.ts` | Definitions live on the Document root; segments can inherit shared values. | Query dependencies and timeline relevance include definition changes outside the selected subtree's own records. |

Stage A typing captures measured 11,848 bytes for a 100-character paragraph,
550,852 bytes for 5,600 characters, and 2,452,054 bytes for 25,000 characters.
All three touch only three records. Reducing the number of visible history steps
alone will not fix paragraph-sized sequence copying.

## 3. Proposed implementation footprint

These paths are proposed, not existing Stage B files.

| Path | Proposed work |
| --- | --- |
| `src/block-tree/compact-changes.ts` | Versioned exact field/sequence/record change types, preparation, immutable finalization, and compact patch validation. |
| `src/block-tree/commit-capture.ts` | Reuse the commit envelope and existing causes; retain the Stage A full-record observer, isolate representation-specific payloads, and allow optional descriptive input hints. |
| `src/block-tree/repository.ts` | Compact subscription, shared capture delivery, and verified plan consumption; preserve existing undo/redo execution and stack semantics. |
| `src/block-tree/inline-plan.ts`, `split-plan.ts` | Return optional verified edit details alongside route eligibility without weakening rejection rules. |
| `src/block-tree/commands.ts` | Candidate edit facts for compact validation and optional descriptive input metadata; preserve command transaction boundaries. |
| `src/history/types.ts` | Segment/revision/checkpoint/query/group contracts; no server or DOM dependencies. |
| `src/history/replay.ts` | Pure exact application, precondition checks, isolated reconstruction, explicit version/gap errors. |
| `src/history/memory-store.ts` | Explicit finite in-memory enrollment, revision DAG, checkpoints, bounded ingest queue/cache, disposal. |
| `src/history/grouping.ts` | Policy-neutral derived grouping contracts and the initial sentence policy, with captured timestamps, injected segmentation, optional hints, and no undo dependencies. |
| `src/history/index.ts` | Rebuildable Block/placement lifetimes, historical locations, dependency and timeline relevance. |
| `src/history/query.ts`, `compare.ts` | State/subtree/location/timeline queries and authored-state comparison. |
| `src/input/gateway.ts`, `multi-selection-editor.ts`, `cross-block-input.ts` — only where inexpensive | Optional intent, composition, occurrence, and selection/focus-boundary hints at existing seams. No new undo configuration or required editor integration. |
| Corresponding `*.test.ts` files | Compact/full parity, grouping, failure/branch/dependency queries, and live-state invariance. |
| `scripts/benchmark-typing.mjs` | Capture off/full/compact cases; preserve the original Stage A artifact. |
| `scripts/benchmark-history.mjs`, `package.json` | New in-memory history/replay benchmark entry after the query implementation exists. |

Reuse identity normalization, UUID factories, canonical graph validation, and
extended checkpoint encoding. Do not route historical extraction through normal
Document DTO encode/decode or normal live rendering.

## 4. Compact capture contract

### 4.1 Observer compatibility

Retain `subscribeCommits(listener, onError)` with the Stage A full-record result.
Add an explicitly named compact subscription, provisionally
`subscribeHistoryChanges(listener, onError)`. Both events share the same commit
ID, cause, label, timestamp, commands, root, and repository revision envelope.
Only the exact change payload differs and the compact payload has a format version.

With only compact subscribers, never construct the full-record event. With both
subscribed, produce both representations from the same validated commit; the
extra full-copy cost is intentional only in compatibility/debug/parity tests.
With neither subscribed, skip capture preparation. Preparation/finalization
errors retain Stage A's per-observer reporting and reentrancy rules.

### 4.2 Exact changes

Proposed building blocks, with owned and deeply readonly event values:

```ts
type PresentValue<T> = { present: false } | { present: true; value: T };

interface SequenceSplice {
  index: number;
  removed: PlacementKey[];
  inserted: PlacementKey[];
}

interface ContentPatch {
  kind: "patch-content";
  key: ContentKey;
  beforeRevision: number;
  afterRevision: number;
  // Each sequence's indices apply successively in listed order.
  sequences: Array<{
    field: "inlineContent" | "children";
    beforeLength: number;
    afterLength: number;
    splices: SequenceSplice[];
  }>;
  // Explicitly supported scalar/object fields and payload keys only.
  fields: FieldChange[];
}

type ExactHistoryChange = ContentPatch
  | ContentRecordDelta  // full insert/delete or unsupported replacement
  | PlacementRecordDelta;
```

Define `FieldChange` as a closed set of permitted canonical fields or direct
payload keys, with `PresentValue` before/after values. No arbitrary executable
JSON paths. Preserve absent versus null, collection wire flags, identity, and
all final counters. Sequence patches never duplicate the same field in `fields`.
Placement records are small and retain full before/after deltas. New/deleted
Cells retain their exact ContentKeys, PlacementKeys, payloads, and descriptors.

For changed annotation arrays, initially retain the exact before/after array
for that payload key. Do not rerun annotation mapping during replay or assume
annotations are position-independent. This still makes cost proportional to
changed annotations rather than all unchanged character references. Measure a
dense annotation fixture separately; compact annotation splices can follow if
those arrays dominate. Unknown payloads retain a lossless field/record fallback.

### 4.3 Preparation and application

1. Coalesce operations by touched key. Derive patches against the first preimage
   and final validated record; repeated writes and create/delete cancellation
   must have the same net result as Stage A.
2. For ordinary inline replacement, collect verified splice range and Cell keys
   while validating the existing route. Candidate hints from commands are not
   authority. Invalid/unavailable hints must use verified derivation or fallback.
3. Own only changed values before mutation. Capture must not clone, stringify,
   hash, freeze, or retain an old mutable reference to the unchanged paragraph
   sequence. Reuse validator traversal where possible instead of adding another
   whole-paragraph scan. Existing command/validator array work is not claimed
   to become constant-time in this stage.
4. Finalize patches with the repository's actual adjusted counters. Use full
   records for insert/delete and initially for complex structural changes,
   including unsupported split variants. Report fallback frequency and bytes.
5. Replay verifies segment/state-parent ID, repository revision/root, touched
   record presence/revision, expected field values, sequence lengths, bounds,
   and removed keys. A counter alone is not a globally unique precondition.
6. Apply into a private candidate graph, then validate graph and authored identity
   invariants. Publish only the complete result. Unknown patch versions,
   mismatched preconditions, or malformed fields fail explicitly; no partial
   graph becomes a successful query result.

Start with inline insertion/deletion/undo/redo patches. Then compact parent
child-list changes and split transfers where measured and provable. Full-record
fallback is acceptable for complex operations, but not for the supported
single-character long-paragraph fixtures. Compression or background encoding
cannot substitute for removing the original capture copies.

## 5. Revision store, checkpoints, and branches

Enroll a fresh repository made from one explicitly normalized Document baseline.
Assign a segment ID and baseline revision ID. Baseline preparation is not an edit.
Within this session, archive revision IDs reuse commit UUIDs; graph keys remain
session-local. Stage C adds durable resource/placement mapping, not guessed IDs
or filename semantics in this spike.

Each stored revision records:

- `segmentId`, `revisionId`, append `sequence`, and `stateParentRevisionId`;
- `previousJournalRevisionId` as ordering metadata, even in memory;
- the exact immutable change envelope and optional descriptive input hints.

Computed playback groups live in a separate rebuildable index/cache; they are not
part of the exact change payload, state ancestry, or checkpoint validity.

Ordinary undo/redo append new state revisions. Editing after undo keeps earlier
states queryable; it does not change the replay parent to the original historical
commit whose content happens to match. Repository/content counters may repeat
across branch baselines; use UUID state ancestry to distinguish them.

Provide explicit in-memory `forkFrom(revisionId)` for branch tests: reconstruct
that state into a new isolated repository and bind its first commit to that
parent. Do not invent reopen, save receipt, or cross-resource behavior. A checkpoint
must lie on the requested state-parent ancestry, not merely precede it in append
sequence or time. Missing parents and ancestry cycles are errors.

Store the complete baseline and periodic immutable checkpoints. Start with
500 commits or 8 MiB of encoded replay changes between checkpoints, measured
outside the input callback. Build checkpoints from the private replay mirror,
not a fresh live-repository snapshot. Checkpoint envelopes name exact revision,
segment, and format version; reuse extended graph encoding for the state payload.
Retain original commits when adding a checkpoint.

The subscription only enqueues immutable compact events. A separately scheduled,
ordered drain performs encoding, replay/index updates, and checkpoint work.
Queries may await the recorded head; they must not report a queued revision as
missing. Inject scheduling in tests. A browser worker is a later deployment
choice, not a new requirement for this in-memory proof.

Require explicit capacity limits for retained events/checkpoint bytes and pending
queue length. The test/demo owns the finite store. On capacity exhaustion or a
capture gap, stop advancing the verified head, expose an incomplete status, and
keep current editing usable. Do not silently evict replay dependencies or skip
a failed commit and append its descendants as valid. Disposing unsubscribes,
cancels pending work, and releases memory. Stage C supplies durable draining and
recovery; Stage B must not masquerade as an outbox.

## 6. Historical/playback grouping over exact revisions

### 6.1 Derived data and policy-neutral interface

Grouping consumes captured revisions, their timestamps/command descriptors, and
isolated reconstructed state. It has no access to live editor mutation methods,
`HistoryEntry`, or undo stacks. Grouping can be disabled, rebuilt, or recomputed
under a different policy without changing a commit, state parent, checkpoint,
source cause, or the result of replay. A grouping failure cannot invalidate
otherwise verified history; callers can fall back to the exact revision timeline.

Proposed interfaces (supporting source/request types belong in `history/types.ts`):

```ts
interface PlaybackGroup {
  groupId: string;
  policyId: string;
  policyVersion: string;
  memberRevisionIds: readonly CommitId[];
  endpointRevisionId: CommitId;
  label: string;
  boundaryReason: string;
}

interface HistoricalGroupingPolicy {
  id: string;
  version: string;
  group(context: HistoricalGroupingContext): Promise<readonly PlaybackGroup[]>;
}

groupTimeline(
  source: HistoricalGroupingSource,
  request: GroupingRequest,
): Promise<readonly PlaybackGroup[]>;
```

The source exposes immutable exact revisions and isolated state lookup only.
The request selects policy ID/version, segment, branch/head, timeline scope,
traversal options, locale, and tuning options. Context provides the ordered
revision facts, reconstructed state access, optional descriptive hints, and
segmentation services. Grouping uses captured timestamps and an explicit as-of
boundary for an open tail, not whichever wall-clock time a rebuild happens to run.

Each group contains a nonempty ordered list of exact revision IDs from the
selected timeline/branch. Its endpoint is its last member. Normal playback
requests that endpoint's exact state; fine inspection can request any member.
Groups neither replace revisions nor supply patches. Validate member order,
ancestry, scope, and endpoint; never bridge missing history or an explicit branch
boundary. Page handling must preserve the member list and boundary information.

Namespace derived group IDs and cache keys by policy/version, segment, branch,
timeline scope, and relevant options. Different policies can later provide
coexisting views over the same exact history. Policy changes may change group
IDs and membership but never exact revision IDs. Implement only the initial
sentence-oriented policy in Stage B. Typing-burst, paragraph, session, and
semantic/AI-derived policies are future possibilities, not Stage B work; no AI
service, plugin registry, or generic policy framework is required now.

### 6.2 Optional descriptive input hints

Keep hints only where inexpensive and useful: input kind, content/placement key,
editing occurrence token, edit range or selection replacement, composition
boundary, paste, and intentional cursor/focus relocation. Any coordinates use
canonical Cell units; an occurrence token is session metadata, not Block identity.
These facts describe an edit or boundary; they do not direct undo execution,
authorize a compact patch, or become required replay data.

Use existing beforeinput/reconciled-edit seams; do not infer text from `keydown`.
Preserve the gateway's current suppression of composing input and reconciliation
at composition end. Do not introduce another commit, hold open a transaction,
or change selection/focus/IME behavior to collect grouping hints. A relocation
with no content change may be carried as a boundary-before hint on the next
captured edit; it must not create a synthetic repository revision. Distinguish
intentional relocation from a caret update caused by typing itself.

Historical grouping must also work with every optional hint omitted, including
headless/direct repository callers. Derive sentence candidates from reconstructed
text, edit continuity from exact changes, and pauses from revision timestamps.
Without an explicit hint, acknowledge uncertainty about intent rather than invent
an unobserved composition or cursor movement. Unsupported/malformed optional
hints are ignored for grouping; they never change exact history validity.

### 6.3 Initial sentence-oriented policy

Use sentence-boundary evidence, a 1-second idle break, and a 10-second maximum
span, alongside command/Block/branch boundaries and optional descriptive editing
boundaries. These are starting values for playback tuning, not undo settings.
Use contextual segmentation on reconstructed text off the typing callback;
convert UTF-16 offsets to canonical Cell coordinates. Do not treat every period
as a sentence boundary: cover abbreviations, decimals, unfinished sentences,
corrections, and languages without spaces. Do not split one exact transaction
into separately replayable invented states, including a multi-sentence paste.

For a fixed policy/version/options, only the open group may grow as new revisions
arrive. A later correction forms a new revision/group instead of rewriting a
finalized sentence state. Boundary calculations must be causal or use a specified
bounded lookahead before finalization so rebuilding the same recorded prefix
reproduces its finalized groups. Explicit regrouping under other options can
produce another derived view without modifying original revisions.

Existing undo/redo events are ordinary captured facts with their existing causes;
the initial playback policy treats them as separate display actions. A current
Undo may reverse only part of a displayed sentence, which is valid: playback
membership neither determines nor constrains undo steps. Source commit links
remain single-source as in Stage A. Stage D owns playback controls and animation.

## 7. Isolated query contract

Proposed public seams:

```ts
getStateAt(segmentId, revisionId): Promise<ReadonlyHistoricalState>;
getSubtreeAt(request: SubtreeRequest): Promise<SubtreeResult>;
getLocationAt(request: OccurrenceRequest): Promise<LocationResult>;
getTimeline(request: TimelineRequest): Promise<TimelinePage>;
compareSubtree(request: CompareRequest): Promise<SubtreeComparison>;
```

Every request is bound to a segment and exact revision/branch. No function takes
a live NodeKey or uses current membership as historical evidence. Request options
explicitly choose owned relations and same-Document reference traversal. Cache
keys include segment, revision UUID, root Block ID, occurrence selector, and all
traversal options; never key by a content revision counter alone.

`SubtreeRequest` selects a Block ID and optionally a PlacementKey and historical
root-to-placement route for this session. A single canonical placement beneath
a shared container can project through several ancestor paths. Return
`ambiguous-occurrence` with candidates when a location-dependent query has more
than one match; do not silently pick the first. A route describes an occurrence
at a revision, not permanent identity. Stage C introduces archive placement maps.

Results distinguish:

| Status | Meaning |
| --- | --- |
| `available` | Selected occurrence/content and required local dependencies resolve at the requested revision. |
| `not-yet-created` | Evidence in the retained branch shows creation after this revision. |
| `deleted` | A previously present selected identity/occurrence is absent at this revision; include its last available revision. |
| `unknown-block` | The segment supplies no evidence for this identity; do not claim it never existed elsewhere. |
| `ambiguous-occurrence` | The requested location is not uniquely identified. |
| `incomplete` | Required baseline, parent revision, capture, or dependency is missing. |
| `unsupported` | Unknown history/patch version or unsupported requested traversal. |

A Block present in the initial checkpoint is only known to exist by the baseline;
its actual creation time is unknown. Another branch's creation is not proof of
creation on the requested ancestry. Cut/reinsert can produce separate placement
lifetimes for one Block ID. Removing one reference marks that occurrence absent,
not the shared content deleted while another occurrence survives.

Reconstruction locates an ancestral checkpoint, applies exact changes into a
private graph, validates it, and extracts the root/closure. It never calls
`CanonicalRepository.commit()`, mutates a live store, or installs a normal
projection/input gateway. Query code receives the history store, not editor
mutation capabilities. Concurrent requests operate on independent snapshots;
publish only results for their requested revision, with optional abort support.

Return a frozen fragment with canonical content/placement records, an explicit
selected occurrence tree, historical parent/slot/index and ancestor trail,
reference/cycle edges, and dependency diagnostics. A filtered fragment is not a
complete `RepositoryState`; use a dedicated closure validator rather than feeding
it to the full Document validator or treating omitted traversal as data deletion.
Full reconstructed checkpoints still pass repository and identity validation.

Resolve local reference targets and linked annotation definitions at the same
revision. Guard cycles per traversal path, preserving shared content identity.
Record external references/assets as descriptors with availability diagnostics;
never resolve old content through today's registry, network, or media bytes.

## 8. Timeline indexing and comparison

Build correctness-first indexes while replaying the private history mirror:
Block ID to content lifetimes, placements to historical owner/slot/order,
revision ancestry, changed content/edges, and linked-definition dependants.
Indexes are rebuildable and contain no authoritative data absent from checkpoints
and exact changes. An initial slower scan/rebuild is acceptable outside capture;
measure it before adding interval trees or persistent data structures.

For each commit, derive relevant roots using both before and after membership:

- Moving B1 from B into A records departure for B and arrival for A.
- Later edits to B1 affect A's subtree timeline, not B's former subtree.
- Moving B under C preserves B's content identity and changes occurrence location.
- Edits to shared content affect each containing occurrence under the selected
  reference policy; reference-excluding queries do not claim those content edits.
- Changes to a referenced linked-annotation definition affect its historical users
  even when only the Document root record changed.

Keep own-content edits, location events, subtree membership changes, and genealogy
links distinguishable. Splitting P into P and Q records lineage; Q is not suddenly
P's descendant. A multi-root user selection is not a fabricated parent.

Timeline pages use exact revision cursors and explicit branch selection. Grouped
pages cannot silently cut a group or merge events across omitted unrelated edits;
return member IDs and boundaries. Exact chronological revisions remain accessible
alongside grouped views.

Comparison resolves both sides independently with the same traversal policy.
Report authored text/annotation/property changes, children/order changes,
creation/deletion, and location changes. Match Block identities and occurrence
edges explicitly; omit revision counters and derived/runtime-only view state from
user-oriented summaries. Keep raw exact revision results available for tests.
An initial before/after field and sequence comparison is sufficient; a polished
word-diff renderer belongs to Stage D.

## 9. Tests and performance gates

| Area | Required evidence |
| --- | --- |
| Compact parity | Off/full/compact subscriptions; dual observers share commit identity; compact replay equals full replay and live graph at every revision of all Stage A scenarios. |
| Patch correctness | Unicode/IME coordinates, annotation offsets, absent/null fields, inline images, repeated writes, roots, deletion, transient records, undo/redo, strict IDs, malformed hints, stale preconditions, unknown versions. |
| Capture overhead | Compact-only supported typing never constructs full events or copies unchanged sequence arrays; no added whole-Document scan/snapshot/hash/serialization. Unsupported cases use explicit exact fallback. |
| Grouping abstraction | Policy/version/scope-specific group identity and caches; valid ordered member IDs and endpoint; regrouping never alters exact revisions, checkpoints, ancestry, or replay. No undo-stack access. |
| Playback | Sentence hints/abbreviations/decimals/CJK, captured-time idle/max span, branch boundaries, finalized-group stability, endpoint presentation, and independent replay of every constituent revision. |
| Optional hints | Grouping succeeds with hints absent; captured changes/timestamps/reconstructed state provide the baseline. Where hints exist, test paste, selection replacement, composition, cursor/focus relocation, shared views, and structural boundaries without changing commits or undo behavior. |
| Undo/redo regression | Same step count, state after each undo/redo, single-source causes, failure/stack preservation, redo invalidation, and immediate commit behavior with grouping absent, enabled, or recomputed. |
| Replay/checkpoints | Baseline and every checkpoint yield identical states; out-of-order delivery, duplicate IDs, missing parents, capture gaps, sibling-branch checkpoints, repeated counters, fork-from-old-revision. |
| Query semantics | A/B/B1/B2/C movement scenarios; deleted roots without live keys; not-yet-created versus unknown; cut/reinsert; shared parent routes; cycles, margins, annotations, assets, missing dependencies. |
| Isolation/lifecycle | Query/scrub simulations leave current snapshot/revision, undo/redo availability, dirty state, selection/focus, and occurrence indexes unchanged; disposal and queue/capacity errors do not mutate the editor. |
| Regression | Stage A command/codec/persistence and undo/redo tests, fast-route rejection/performance guards, and input/rendering tests only where optional hint plumbing changes existing code. |

Extend typing measurements to off/full/compact using the same normalized fixtures,
warm-ups, sample counts, and off-callback serialization. Add dense annotations,
large sibling lists, and mixed structural edits. Report capture-specific copying,
median/p95 total latency, encoded bytes, fallback rate, retained history/group
cache bytes, and queue high-water marks separately. Existing undo memory costs
may be reported as context; optimizing the undo stack is outside Stage B. Keep
the Stage A JSON artifact unchanged and write a separate Stage B measurement
artifact when implementation is verified.

A structural gate is required: for a single-character edit with fixed annotation
count, compact payload and capture-owned sequence copying scale with the edit,
not paragraph length. Existing editing/validation/projection costs may still
scale with paragraph size. Do not claim total constant-time typing. Record the
measured improvement against the 550,852/2,452,054-byte Stage A events; do not
invent a latency percentage requirement before the new measurement exists.

Retain 256 KiB/event and 5,000-character paragraphs as investigation thresholds,
not truncation or data-dropping limits. Query benchmarks cover cold/warm replay,
checkpoint spacing, long histories, large subtrees, dependency closure, cache
memory, and index rebuild time. Choose final operational budgets from those results.

Proposed verification commands once the corresponding files exist:

```sh
npm test -- src/block-tree src/history src/input src/runtime/block-clipboard.test.ts src/reactive-editor/persistence.test.ts src/reactive-editor/workspace-manifest.test.ts
npm run typecheck
npm run benchmark:typing
npm run benchmark:history
```

Add affected existing input/rendering and browser IME/undo-regression checks
only if optional gateway hint plumbing lands. Verify that input commits and undo
steps remain unchanged. No Stage D history-panel browser test is required before
that UI exists.

## 10. Implementation sequence and exit criteria

1. Add versioned compact types and a standalone exact applier with failing parity
   fixtures. Define fallback and precondition behavior before repository wiring.
2. Integrate compact-only capture and verified inline plans; retain full observer
   compatibility. Run Stage A exactness and fast-path guards; measure long typing.
3. Implement explicit in-memory enrollment, ordered bounded ingest, ancestry,
   isolated replay, checkpoints, capacity/gap reporting, and disposal.
4. Implement the policy-neutral derived grouping layer and initial sentence policy
   using captured revisions, timestamps, and reconstructed state first. Add only
   inexpensive optional intent hints, then verify unchanged undo/redo behavior.
5. Implement historical identity/location resolution, dependency closure, timeline
   relevance, grouped timeline output, and before/after comparison.
6. Run branch/checkpoint, query isolation, grouping, and performance evidence;
   write `BLOCK_SCOPED_HISTORY_STAGE_B_COMPLETION.md` only when verified.

Stage B is complete when compact replay equals every exact committed state;
supported long-paragraph typing avoids full sequence capture; sentence playback
groups derive from a policy-neutral layer that works without input hints or undo
integration; every exact revision remains independently addressable and replayable;
existing undo/redo behavior, stack semantics, and source causes are unchanged;
historical subtree/location/dependency queries are correct on each branch and
leave current state untouched; observer/store failures and capacities are explicit;
regressions/type checks pass; and measured costs are recorded.

The completion report must distinguish implemented in-memory behavior from the
remaining durable Stage C protocol and Stage D–E product integration. Planning
and implementing Stage B do not authorize silently enabling persistent recording,
expiring history, or changing ordinary Document files.
