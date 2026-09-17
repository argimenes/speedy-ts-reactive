# Stage C implementation gate results

Status: **G1 functional candidate passing; G2 storage qualification in progress**. Stage C is not
complete. No production format dispatch, ordinary Save/Open integration, outbox,
`.memory` server store or Stage D–E work has been enabled.
Plan: [Stage C implementation plan](BLOCK_SCOPED_HISTORY_STAGE_C_PLAN.md).

## Resumed implementation — current evidence

The user's instruction to continue authorized the recommended ownership-aware
retention correction. The original stop and its evidence are retained below as
historical findings; they no longer describe the current candidate's behavior.

Canonical `ContentRecord.definitionOwnerKey` records membership in a Document's
definition table. It is captured by the existing field/record patch machinery and
restored by existing inverse operations. The Document's self-membership marks a
normalized table; Cells remain owned through their host. This is private canonical
metadata: portable Documents express membership by their definition table, without
runtime keys. Normalization precedes enrollment and is an explicit load projection
boundary, not an undo edit or an exact continuation of pre-normalization state.

The validator admits retained unplaced components; pruning retains their authored
definitions and reachable slots/Cells. Placement removal does not delete a retained
definition. Explicit unplaced-definition deletion, joins, unwrap and consuming
replacements retire definitions within one ordinary commit. Copies/insertions/splits
assign ownership in that same commit; whole-Document copies include unplaced
definitions. Optimized editing validators also check the added metadata. Legacy
repositories retain their previous pruning behavior until normalization.

The actual Workspace gate bridge converts known cross-resource pointers into
terminal descriptors during normalization. Removing a foreign target or evicting
its complete Document scope then leaves the referencing Document's exact projection
unchanged. No consumer scan, external snapshot or dependency-only revision is used.
Scope-eviction undo is tested; production enrollment end/reopen boundaries remain P4.

| Current functional verification | Result |
| --- | --- |
| G1 plus core membership tests | **31 passed**: 23 gate cases and 8 core lifecycle cases. Covers original counterexamples, rich unplaced content, margins, copy/insert/split/join/replace, existing undo/redo, Workspace scope removal, descriptor retarget/pin preimages, isolated queries, internal cycles and branch-aware existence. |
| Full regression run after the membership changes | **407 passed / 2 failed**, 409 total, 57 files passed / 1 failed, 51.40 s. Only the two pre-existing context-menu failures. This run preceded the later additional query/Workspace cases. |
| Typecheck after query/Workspace additions | Client and server passed. Later changes still require final recheck. |

G1's finite query oracle takes only immutable resource snapshots and explicit
selected-state-ancestry evidence. Foreign definition/asset markers travel with
their authored values; opaque extensions are not guessed into dependencies.
The oracle distinguishes an unplaced owned Block from an unavailable external
reference, avoids local-registry shadowing, and reconstructs historical internal
definitions after live access has been replaced by a throwing sentinel. It is
not the bounded production query service: P5 still needs paged readers/indexes.

## G2 — current storage candidate and limits

The isolated [storage harness](scripts/stage-c-gates/storage.test.mjs) uses real
temporary directories and the actual lossless wire codec/captured revisions.
It is not imported by production Document/server routes. All created infrastructure
stays inside the immediate parent's `.memory`; no ancestor fallback or global
history directory is introduced.

The candidate uses [fs-ext's OS flock binding](https://github.com/baudehlo/node-fs-ext)
(`fs-ext@2.1.1`, optional dependency) on this macOS/Node host, rather than the
pre-plan's Python probe. A confined child filesystem process checks its working
directory's device/inode before each operation, uses single-component names and
`O_NOFOLLOW`, and holds an inherited writer-lock descriptor during writes. This
avoids an absolute-path validation followed by an unguarded mutation after directory
substitution. Child requests serialize changes of working directory. Worker reuse
removed per-packet process-start costs. This process organization is a candidate
implementation choice, not a new persistence contract.

Physical directory/lock/file identity is private writable-association evidence,
separate from semantic resource/memoir IDs. Copying a Document or directory cannot
grant a writer merely by copying IDs/hashes. Exact-prefix handoff can authorize new
location evidence; journal activation records allow a verified return to an older
location. Normal directory rename preserves association without absolute-path IDs.
An explicitly supplied enrollment grant is required. Discovery never selects an
archive through the optional index, whose corrupt bytes are preserved in the test.

| G2 evidence so far | Result |
| --- | --- |
| Initial storage/association/locking/blob/journal cases | 6 passed, including real process `SIGKILL`, stale epochs, overlapping immutable retries, missing state parents, branches independent of append order, and torn/corrupt journals. |
| Combined suite before within-record fault extensions | **13 passed**, 10.03 s with worker reuse. Includes all five handoff publication boundaries, folder copy/rename and verified return handoff. |
| Additional handoff fault run | **10 passed**, 6.40 s: nine intent/publication/torn-write boundaries plus return handoff. Further hardening changes need rerun. |
| Real largest paragraph checkpoint | 25,000 characters; **13,376,402 wire bytes**; transfer chunks at most **262,144 bytes**. Interrupted uploads remain unreferenced; final bytes hash-verify and decode to the exact baseline. |

Source fencing precedes destination activation. Source bytes are retained. Handoff
intents bind the prior journal hash/offset and exact planned frame bytes; recovery
can finish those bytes without guessing from a coincidentally matching torn prefix.
Ordinary unproved torn tails still reject writes. Competing lock acquisition is
nonblocking, so handoff cannot deadlock waiting while holding the other lock.
Document-file publication and memoir relocation remain separate operations.

These are finite gate bounds, **not release capacities**: 32 MiB journal/blob,
256 KiB transfer packets, 128-record/128 KiB input batches, bounded directory pages
and a finite administration scan. The candidate still scans whole bounded journals
and retains checkpoint staging duplicates; production P1/P3/P5 must supply bounded
archive indexes/consolidation and verified cleanup. No old history is expired.
Unsupported native locking/sync semantics have no fallback. This host's fsync and
process-death tests are not a universal power-loss, network-filesystem or cloud-lock
guarantee; disconnected copies cannot be globally fenced.

**G2 is not yet declared passed.** Remaining qualification includes initialization
races/partial stores, damaged required checkpoint evidence, conflicting suffixes,
pending-packet handoff retry, and the legacy/outbox/first-save lifecycle. G3 sustained
worker/outbox performance, P1 schema hardening, production format dispatch, server
and browser integration, bounded durable queries and P6 release measurements remain.
No Stage C completion report or production readiness is claimed.

## P0 — baseline

Baseline commit: `6431645a6994e0ed98158ae060be8a1fc51a7e0e`.
Environment: Node v22.12.0, macOS Darwin arm64.

| Check | Result before implementation |
| --- | --- |
| `npm test` | 52 files passed, 1 failed; 381 tests passed, 2 failed (383 total), 44.27 s. |
| `npm run typecheck` | Client and server passed. |

The failures reproduce Stage B's documented baseline in
`src/rendering/block-context-menu.test.tsx`: missing Delete Block menu item, and
undefined tab `ownerKey`. No production change was present during this run.

## G1 — owned resource candidate

The isolated candidate in [resource.ts](src/history/stage-c-gates/resource.ts) distinguishes
local placements from external reference descriptors. Authoritative ownership,
semantic placement bindings and source provenance are supplied as explicit
enrollment evidence. The projection oracle stops at foreign targets and is not
suitable for the input path. It is not a frozen schema or a production recorder.

Fourteen positive gate tests cover owned projection with foreign edits, removal
of a foreign owned occurrence, captured source pins, absence of foreign state,
local occurrence queries, exact wire/transition replay, portable structural and
rich-inline round trips, source-scoped definition provenance through annotation
reorder/replacement/copy, and ordinary command/undo behavior for the tested adapter.
Two additional passing counterexample tests demonstrate **failed G1 obligations**;
they do not mean G1 passed.

The current-Document bridge in [editor.ts](src/history/stage-c-gates/editor.ts)
uses the real repository/commands/projection. Small core changes allow an explicit
terminal external-reference placement, without a fabricated target ContentRecord.
The placeholder is a projected view, not an authored Block with the target's ID.
The bridge is only invoked by gate fixtures; normal file decoding remains unchanged.

## Original architectural stop: definition lifetime depended on global reachability

Executable reproduction:
[ownership-lifetime.test.ts](src/history/stage-c-gates/ownership-lifetime.test.ts).

```text
Workspace
  Document A
    reference to B-owned P
  Document B
    owned placement of P
    owned placement of unrelated Q

Remove B's owned placement of P.
P remains in the live repository because A's reference reaches it.
P's authoritative resource remains B; only its local placement was removed.
```

Ownership in this fixture is established before transclusion from the independently
created B definitions. This is not ambiguous attribution, a cross-resource move,
an explicit deletion of P's definition, or a foreign-only edit requiring an A
revision. B's projection correctly retains P as an unplaced owned definition.
A's external reference need not copy P or merge memoirs.

The semantic codec round-trip preserves that B-owned state, but ordinary editor
use then has two failures:

| Variant | Reproduction and observed result |
| --- | --- |
| P is a Standoff paragraph with inline Cells | B's versioned definition table encodes/decodes exactly at the authored level. Opening the decoded owned state in the actual repository fails with `Placement … is unreachable from the root`. P's inline placements belong to its retained definition but have no route from B's structural root. |
| P is a plain leaf | The actual repository accepts the unplaced content initially. Removing unrelated Q after standalone reopen silently prunes P. Running the same Q removal in the original Workspace retains P because A's placement is still present there. Undo restores P, proving that pruning was part of the unrelated structural command. |

Relevant existing mechanics:

- [Repository validation](src/block-tree/repository.ts#L160) requires every
  placement to be reachable from the single structural root. An unplaced rich
  definition/component cannot satisfy it even though it is valid owned semantic
  state. The candidate resource validator can represent that state; the current
  editor cannot.
- [TreeCommands.pruneUnreachable](src/block-tree/commands.ts#L196) removes
  unreachable placements, then deletes every content record not targeted by a
  retained placement. It has no authoritative per-resource definition-retention
  concept. These reachability/pruning rules have not been changed by the gate work.
- The [earlier portable spike](PORTABLE_CODEX_DOCUMENT_FORMAT_SPIKE.md) proved
  representative internal sharing and unplaced leaf definitions, not this
  externally referenced, locally unplaced rich-definition lifecycle.

The false assumption is that a resource-owned definition table plus terminal
external-reference/read adapters is sufficient for ordinary editor use while
retaining the current **structural-root-based lifetime/validation model**. Semantic
codec equality alone does not preserve definition lifetime under ordinary commands.
This is more than a serialization or historical-query implementation detail.

The two settled decisions remain intact: owned history stops at the Document
boundary, and memoir infrastructure belongs in immediate-parent `.memory`.
Neither capturing foreign snapshots nor introducing a global memoir fixes this
local resource-lifetime problem.

## Corrective direction recorded at the original stop

Represent a Document's authoritative retained definition set independently of
its visible structural root. Validate retained unplaced components and make
pruning respect their resource ownership/lifetime. Removing a placement must
have a defined effect on definition retention; ordinary edits to Q cannot
accidentally decide P's lifetime because another Document is absent.

This requires a precise retention/release rule, including explicit definition
deletion, internal reference removal, detached components, resource opening/closing,
and undo/redo. Such metadata must participate in the same committed operation and
existing undo step where it changes authored semantics; do not maintain a hidden
second state that undo cannot restore. Preserve current undo stack structure,
single-source causes and step granularity. No synthetic authored placements,
runtime-only target Blocks, external consumer scan, or memoir dependency should
be introduced to fake reachability.

An alternative is to define last-local-placement removal as deletion of the
resource-owned definition even if foreign references survive. That would require
an explicit product/semantic change and consistent behavior in both live Workspace
and standalone use, with external references remaining unresolved thereafter.
It is not assumed here, and it differs from the currently observed shared-content
lifetime. Do not silently obtain that behavior by changing pointer representation.

The recommended direction was ownership-aware retained definitions. At the original
stop it had not been implemented, and G2/G3/P1–P6 had not been attempted. The resumed
implementation and current evidence above supersede that status.

## Changes made before the stop and remaining limits

- Gate-only owned resource/projection, transition, semantic codec and editor bridge
  modules, plus sixteen tests (fourteen positive cases and two counterexamples).
- Shared exact record/field/splice application factored into
  [apply-records.ts](src/history/apply-records.ts), retaining the existing raw
  replay wrapper, preconditions and full closed-graph validation.
- Candidate external target/definition-provenance types and explicit terminal
  placement handling in repository validation and projection. Move/unlink,
  transclusion and canonical fragment copying preserve the descriptor. No target
  definition is synthesized and no undo-stack execution/structure is changed.
- A typed external definition cannot resolve against a conflicting local registry;
  live unpinned resolution can use a matching explicitly identified owner root.
  No historical resolver/network lookup is introduced. Annotation provenance travels
  with its value rather than an independently mutable array-index cache.
- The finite Stage B memory store explicitly rejects native external-boundary
  graphs instead of passing them to its closed-graph query/index implementation.

These remain candidate changes for review, not production-ready APIs. The wire
codec used by gates is the existing lab codec; parser hardening, complete schema
admission, full query/status/branch coverage, all ownership/identity lifetimes,
runtime binding-cache bounds, incremental capture performance and actual durable
storage remain unproved. Ordinary format dispatch/server save routes are unchanged.
Native terminal-placement support does not prove that every editor command or UI
can operate on every new candidate graph shape.

Implementation notes: null-prototype dictionary identity is outside the accepted
wire value algebra, so exact wire checks use the existing own-property/value
equality contract. Existing undo advances canonical content counters; tests must
check the actual fresh transitions, not claim canonical equality with an earlier
snapshot merely because authored effects were undone.

At the original stop no new storage/throughput benchmark or production capacity
claim was made. The earlier Stage C experiment artifacts remain unchanged.

## Verification at the architectural stop

| Check | Result |
| --- | --- |
| Full `npm test` | 56 files passed, 1 failed; **397 passed / 2 failed**, 399 total, 39.14 s. The same two P0 context-menu failures remain. No additional failure. |
| New gate tests within that run | **16 passed**: fourteen positive candidate tests plus two counterexamples that demonstrate the failed architectural obligations. |
| `npm run typecheck` | Client and server passed after the candidate changes. |
| `git diff --check` | Passed. |
| Production persistence/storage/performance exit gates | Not attempted; no completion or new benchmark claim. |

To run the regression cases for the original architectural finding:

```sh
npm test -- src/history/stage-c-gates/ownership-lifetime.test.ts
```

At the original stop those tests asserted the observed rejection/pruning. They now
assert successful retained-definition lifecycle behavior after the correction.
