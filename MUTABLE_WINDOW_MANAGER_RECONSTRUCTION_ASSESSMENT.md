# Document reconstruction fallback — architecture assessment

21 October 2026. Baseline: accepted E1.3, commit `1ef3de0`.

## Decision and authorized stopping point

**Do not enable reconstruction fallback yet.** Existing opening and rendering primitives can create an independent editor over the same canonical Document without copying or saving it. They do not provide an atomic replacement of an existing editing session, its Flint navigation registration and its exact Return relationship.

The execution brief explicitly says: “If the investigation reveals that safe reconstruction requires a significant new session-ownership abstraction, stop before making that architectural change and present a concrete proposal.” This assessment reaches that condition. The required change is a **replaceable view-session binding and coordinated handover**, not a new disposer or a replacement for E1.2. No such abstraction has been added to production.

E1.3 remains accepted and operational within its qualified scope. This work changes only its close confirmation label to **Close window**, retaining the explanation that unsaved canonical edits remain in the workspace. Isolated proofs and the accompanying [qualification report](MUTABLE_WINDOW_MANAGER_RECONSTRUCTION_QUALIFICATION.md) demonstrate the gaps below. They are not a shipped fallback.

## Available mechanisms and demonstrated limits

| Existing mechanism | Useful capability | Why it is insufficient for handover |
|---|---|---|
| `DocumentSessionStore.mount` | Creates an independently disposed Solid root and private projection over an existing placement. Failed rendering releases the candidate. | Returns a fixed session; has no staged replacement, readiness or participant-publication contract. An occupied owner/slot is rejected. |
| `RetainedDocumentHost` | Owns a stable host lease; cleanup only releases its current occupant. | Constructs a session once. It does not retain a reusable, source-shell-independent renderer factory or publish a replacement session into its original renderer callbacks. |
| `TransientDocumentView` / Flint `liveViews` | Renders a borrowed retained session and registers its projection for navigation, Entity inventory and commands. | Registration/cleanup are tied to that renderer's lifetime. Mounting a generic independent renderer does not replace the source tab's `liveViews` entry; reusing the Flint closure also needs generation-safe bookmark and cleanup ordering. |
| `DocumentHostTransfers.attachInitial` | Publishes initial occupancy without canonical writes. | Sets the candidate's origin to its destination. Two initial attachments are two live sessions, not a replacement. The candidate then reports `atOrigin`, so a naïve adapter bypasses E1.3's moved-topology capture guard. |
| E1.2 `transfer` | Atomic same-session host movement with cancellation, guards and rollback. | Its journal moves one session. It cannot publish a different session and retire the old one while preserving the original Return identity. Unsupported live content remains correctly rejected. |
| Native resource service / repository history | Canonical edits, bindings, dirty state and undo can be reused by the new projection. | These authorities do not own component-local PDF notes, selection, playback or application-owned pending operations. |

Source evidence: [session store](src/application/document-sessions.ts), [retained host](src/rendering/retained-document-view.tsx), [transient renderer](src/rendering/transient-document-view.tsx), [Flint integration](src/application/document-application-capabilities.tsx), [coordinator](src/application/document-host-transfers.ts), [PDF component](src/rendering/pdf-block-view.tsx).

The real PDF proof confirms the distinction: canonical unsaved text and committed annotations survive creating another view; the Solid owner, DOM, projection and session are new; page, zoom, unfinished annotation text and PDF text selection are not restored. Mount completion also precedes explicit PDF loading. Disposing a candidate aborts its own PDF request while leaving the source request/view intact. These are useful primitives, not evidence of a safe committed transition.

## Proposed bounded extension for review

### 1. Replaceable binding, existing disposal authority

Add a workspace-owned `DocumentViewBinding` for the lifetime of one logical presentation. It references exact canonical authority, an optional current `RetainedDocumentSession`, a generation and the existing exact-source navigation/Return address. A separately staged candidate is not `current` and cannot receive input or be captured as committed topology.

This binding is not a second Document, a second canonical owner or another disposal store. `DocumentSessionStore` remains the **only final disposer**. A deliberate additional view has a different binding. Reconstruction replaces `binding.current`; retained transfer changes the host of that same current session. Runtime session/ViewId/occurrence identities necessarily change on reconstruction. A future durable Document-view restore key belongs to the binding, not to whichever runtime session happens to implement it.

Flint `liveViews`, detached-window Save routing, source-reference lookup and close behavior must subscribe to the committed binding. Candidate callbacks may not publish into those consumers before commit. Outgoing cleanup may remove only its own generation, never a newer projection/bookmark. Extract the existing resource renderer into a reusable construction function owned by the workspace/session infrastructure, with no dependence on a destroyed Flint closure.

### 2. Capability decision with structured reasons

Return a structured decision, not a parsed error string:

```ts
type Decision =
  | { kind: 'retain' }
  | { kind: 'reconstruct'; adapters: AdapterPlan[]; consequences: Consequence[] }
  | { kind: 'blocked'; code: string; component?: string; operation?: string; message: string };
```

Shared operation guards run first: authority/host validation, composition, native receipts, modals, text operations, source closure and resource operations. If those pass, prefer retained transfer. Only a **typed unsupported-transfer capability** can trigger reconstruction. An unexpected transfer failure rolls back and reports its error; it must never trigger fallback.

Adapters must explicitly declare local state, readiness, asynchronous operations and cleanup. Require a versioned component adapter for each unsupported descendant; unknown components reject. Aggregate only the affected Document's mounted components at invocation and transaction validation. No repository scans, snapshots or eligibility work on ordinary typing.

### 3. Handover transaction

1. Resolve one unambiguous canonical resource/placement and exact source/destination leases. Reserve the destination through the existing coordinator; record binding/host generations.
2. Acquire cancellable transition/operation guards. Ask about material transient losses only if a qualified adapter declares them; no general “technical reconstruction” warning.
3. Capture revision-checked text bookmarks, scroll and adapter state. Create a hidden, inert candidate through the session store using the same canonical placement. Keep the original fully usable during cancellable preparation. Do not clone a repository snapshot or reopen the resource from disk.
4. Await explicit renderer/adapter readiness. A PDF component being mounted is not equivalent to its original, page and text layer being ready. Candidate failure disposes only the candidate and releases its reservation.
5. Immediately before commit, recheck canonical identity, leases, source life, adapter versions and operation state. Recapture or safely rebase edits made during preparation. If mapping is ambiguous, abort; do not restore stale offsets. Freeze source input only for the bounded synchronous publication phase, never for network loading.
6. Journal and atomically publish destination occupancy, `binding.current`, Flint projection/reference, Save route and original Return address. The source root must remain undisposed until all fallible publication checks have passed. No asynchronous work inside this phase.
7. Commit the presentation revision and retire the outgoing session exactly once through the store. Subsequent focus failure does not reverse the committed handover or dispose the new current session. Restore focus only under a still-current lifecycle ticket.
8. A pre-commit failure reverses the publication journal and disposes only the candidate. Workspace/source close during preparation cancels and drains it; user-authorized source closure may end the source, but no candidate may later become an orphan committed editor. Source disappearance after publication follows an explicit, tested terminal-state policy.

The proposed change needs a recovery policy for a disposer throwing after commit: report cleanup failure, keep the committed replacement authoritative, and make cleanup idempotent. It must never attempt to resurrect a disposed source. This is one reason ordinary close/open sequencing is insufficient.

### 4. PDF adapter as the first qualified fallback

Preserve immutable snapshot/asset identity and canonical annotations. Capture page, zoom, viewport scroll and a versioned PDF selection range tied to the same snapshot/page/text runs; await those exact bytes/page before restoring. Preserve unfinished note/region state in the adapter or block with “Finish or clear the PDF annotation draft before detaching.” Do not silently discard it.

The adapter must report reading/rendering/extraction and nested `ResourceRelationships` activity. A pending knowledge Claim has domain semantics outside Document undo; it cannot be cancelled merely by destroying its component. Reject until settled/reconciled. Reader shutdown is local cleanup, not proof that a server operation was rolled back. Selection restoration must not turn a display annotation into a new canonical annotation.

Start with PDF states explicitly covered by these contracts. Do not automatically extend this approval to web/academic viewers, media, iframes, Canvas previews or generic opaque widgets. Their candidate policies appear in the qualification matrix.

### 5. Return and persistence

The logical binding retains the original exact source slot independently of the outgoing runtime session. Return first validates that slot; source closure disables Return without impairing independent Save/edit/close. If the replacement is now eligible, use E1.2 retained transfer. Otherwise run the same replacement transaction back into the exact slot with qualified adapters. No replacement Flint tab, host guessing or resource duplication.

Keep E1.3 workspace and named-arrangement guards. They must consult committed logical topology and pending replacement transactions, rather than only the origin of an individual newly created session. The separate [E1.4 proposal](MUTABLE_WINDOW_MANAGER_E1_4_DURABLE_TOPOLOGY_PROPOSAL.md) defines durable relationships without serializing the reconstruction strategy.

## Proposed implementation batches and acceptance gates

| Batch | Change | Required gate |
|---|---|---|
| R0 | Approve the replaceable-binding, renderer and handover contract above | No implementation before review under the current stop condition. |
| R1 | Binding and candidate/commit protocol; retain E1.3 behavior as the default path | Exact publication/disposal counts, cancellation/fault injection at every boundary, stale focus, source/workspace closure, unchanged Save/undo and capture guards. |
| R2 | PDF capability/operation/state adapter and single-command strategy dispatch | Real PDF viewer Detach/Return, dirty text and annotation continuity, note/selection/page state, failed reads, pending operations, no duplicate resources or editor after commit. |
| R3 | Compatibility qualification and broader adapter proposals | E1.1–E1.3 and 41-file baseline comparison; repeated finite cycles; two views of one resource; no schema implementation. |

The fallback should have its own default-enabled rollout flag behind the existing E1.3 prerequisites. Disabling it must preserve the accepted retained-transfer path and specific rejection explanations. Desktop 5 implementation remains a separate approval.
