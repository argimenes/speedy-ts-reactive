# Block history — minimum path to an initial UI slice

Date: 2026-09-18. This is the proposed next development scope for review, not a
claim that Stage C is complete or authorization to start the full P1–P6 programme.
The immediate target is one explicitly enrolled local Document: edit it, inspect
a Block's earlier revisions in Codex, restart, and inspect the same persistent
history. Keep ordinary undo, Save and current Document state independent of the
history preview. No new G3 qualification programme is part of this scope.

## 1. Required before the UI consumes real persistent history

These are narrow slices of P1–P5, not prerequisites to finish those phases in full.

| Required slice | Smallest useful deliverable |
| --- | --- |
| P1: supported wire and reader contract | Promote the proven resource/identity/record representation into a versioned shared core with checked decode/apply and immutable results. Fix resource, memoir, segment, revision, Block and semantic Placement selection; expose explicit incomplete/unsupported/ambiguous states. Retain golden compatibility and exact replay checks for the supported path. |
| P2/P4: stable identity and enrollment | Integrate stable bindings and portable read/write for the selected Document path, with a real baseline and incremental canonical subscription. Preserve external descriptors; do not resolve foreign current state into historical owned state. Associate the saved artifact with its actual revision/receipt. On reopen, distinguish the saved Document from later archived unsaved edits: no invented parent or automatic historical replay into current content. Legacy normalization must not add an undo step. |
| P3: durable write/restart path | Connect a confined, directory-local `.memory` store to real application endpoints and a single fenced writer. Publish verified prerequisites before acknowledging their records. Use strict IndexedDB transactions for immutable pending bytes, exact retry/deduplication, recovery, and separate browser-committed/server-durable/verified watermarks. Retain pending bytes until the appropriate acknowledgement is committed. Enforce supported record, baseline, outbox and queue bounds with explicit failure status. |
| P5: bounded read-only access | Read a verified checkpoint and the required state ancestry through a separate read-only capability. Supply an asynchronous, cancellable timeline page, subtree and location for a fixed branch/revision. Preserve external-reference and missing/ambiguous statuses. Use work budgets and continuations; budget exhaustion cannot mean “no history.” Start with exact revision entries; sentence grouping is unnecessary for the first prototype. |

The existing G1/G2/G3 implementations prove these mechanisms in harnesses; they
are not wired into ordinary Save/Open or a production history service. In
particular, the finite gate store's whole-journal scans and the existing memory
queries' full ancestry scans are not a ready-made lazy durable reader. Reuse the
checked core and contracts, then add the bounded application adapters needed by
this one path. Support a declared finite enrollment/record range initially, with
honest boundary status; do not delete old history, trim undo, or silently omit
results when a limit is reached.

Focused integration acceptance: edit → browser commit → durable/verified ack →
restart/reopen → timeline selection → exact historical subtree, with ordinary
undo/redo unchanged. Also cover a lost acknowledgement/retry, offline pending
recovery and the saved-versus-unsaved reopen branch. These protect the new seams;
they are not a request for a new broad test campaign.

## 2. Later or parallel Stage C hardening

- P6's large-scale valid 100,000-revision/>1 GiB archive, 10,000-memoir discovery,
  multi-Document/foreign-load and cross-platform performance matrices. Existing
  limits still apply to the initial slice; these qualify expanded support.
- Full copy/move/handoff and multi-writer lifecycle coverage beyond the admitted
  path. Until implemented, detect unsupported relocation/conflict and stop the
  writer explicitly; never guess the authoritative archive. Core fencing,
  append recovery and identity checks above cannot be deferred.
- Scalable directory/catalogue indexes, richer checkpoint policies, lossless
  consolidation, cache tuning and long-running resource-leak qualification.
  Initial bounded reads and cancellation are still required now.
- Full Workspace lifecycle integration, additional admission surfaces, richer
  external-resource resolution and automatic enrollment/default rollout.
- Sentence grouping, richer comparison, large-archive latency qualification and
  broader fault matrices. No history pruning, expiry or reduced undo depth.

The preserved hidden-page catch-up failure remains an explicit unsupported stress
case, not a new prototype prerequisite or a passing result. Revisit it if a
supported ordinary editing path demonstrates an equivalent commit burst. Do not
introduce a production backpressure contract speculatively.

## 3. Stage D/UI work that can begin immediately

Implement the Block context-menu/command entry and one `HistorySession`: selected
Block/occurrence, fixed branch head, revision selection, loading/status and request
cancellation. Show a keyboard-operable revision timeline with timestamp, cause
and location; selecting a revision shows an immutable historical subtree and a
simple authored-state comparison. Closing restores live editing focus.

Use a temporary asynchronous **read-only adapter** over established finite
history/query fixtures or the memory source. Keep the semantic selection and
typed result/status contract compatible with the durable reader. Clearly label
session-only history; do not display a persistence claim. The existing
`HistoryQueries`/`readOnlyHistorySource` and G1 resource query are useful behavior
references, not permission to expose editable stores or make unbounded archive
scans. The adapter is a replaceable backend, not a second history model.

Render text/annotations and the selected fixture's structural containers in an
isolated static preview. Other types get informative placeholders. Do not mount
the live InputGateway, editable toolbar, ticking timers, remote embeds or desktop
windows in historical content. Allow selection/copy; ignore stale asynchronous
results. Contextual scrubbing and richer renderers can follow the initial panel.
Historical insertion/restoration is a later write feature, not required to inspect
history in this first read-only slice.

## Recommended next increment

First build the small panel/session/adapter slice so Block history becomes
interactive in Codex. Alongside it, integrate only the persistent-path slices in
§1. Replace the adapter when that path proves restart/reopen equality. Demonstrate
one real Document end to end before extending supported cases or starting P6's
large qualification matrix. This advances the UI without claiming that a memory
prototype is durable or weakening the exactness/durability architecture.

References: [Stage C plan](BLOCK_SCOPED_HISTORY_STAGE_C_PLAN.md),
[gate results](BLOCK_SCOPED_HISTORY_STAGE_C_GATE_RESULTS.md),
[historical UI contract](BLOCK_SCOPED_HISTORY_SPEC.md#9-historical-ui-and-execution-isolation).
