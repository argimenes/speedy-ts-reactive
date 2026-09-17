# Stage C implementation gate results

Status: **stopped at G1 — architectural assumption falsified**. Stage C is not
complete. No production format dispatch, ordinary Save/Open integration, outbox,
`.memory` server store or Stage D–E work has been enabled.
Plan: [Stage C implementation plan](BLOCK_SCOPED_HISTORY_STAGE_C_PLAN.md).

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

## Architectural stop: definition lifetime still depends on global reachability

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

## Smallest corrective direction to decide before resuming

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

The recommended direction is ownership-aware retained definitions. **It has not
been implemented.** As required by the plan's architectural stop rule, no further
dependent Stage C work proceeds until this lifetime/validation assumption is
resolved. G2/G3/P1–P6 have not been attempted.

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

No new storage/throughput benchmark or production capacity claim is made. The
earlier Stage C experiment artifacts remain unchanged; G2/G3 were not reached.

## Verification at the architectural stop

| Check | Result |
| --- | --- |
| Full `npm test` | 56 files passed, 1 failed; **397 passed / 2 failed**, 399 total, 39.14 s. The same two P0 context-menu failures remain. No additional failure. |
| New gate tests within that run | **16 passed**: fourteen positive candidate tests plus two counterexamples that demonstrate the failed architectural obligations. |
| `npm run typecheck` | Client and server passed after the candidate changes. |
| `git diff --check` | Passed. |
| Production persistence/storage/performance exit gates | Not attempted; no completion or new benchmark claim. |

To reproduce just the architectural finding:

```sh
npm test -- src/history/stage-c-gates/ownership-lifetime.test.ts
```

Those tests intentionally assert the observed rejection/pruning; they will need
to become successful-lifecycle regression tests when the ownership-lifetime
decision is implemented. Their passing status is **not** permission to pass G1.
