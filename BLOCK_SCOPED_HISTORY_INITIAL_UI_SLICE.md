# Block history — minimum path to an initial UI slice

Date: 2026-09-18. **Status: initial UI review accepted; persistent restart slice
passed; read acceleration and a bounded selective-reader spike completed for
review. Production still uses the full reader.** The user authorized this increment and the minimum parallel
persistent-path slices below, not the full P1–P6 programme. Stage C is not complete.
The immediate target is one explicitly enrolled local Document: edit it, inspect
a Block's earlier revisions in Codex, restart, and inspect the same persistent
history. Keep ordinary undo, Save and current Document state independent of the
history preview. No new G3 qualification programme is part of this scope.

## Selective-reader spike — review checkpoint

The authorized bounded spike now has exact parity evidence and browser timings.
A fixed 200-character Block selects in **47–48 ms cold** across Documents with
500, 5,000 and 25,000 surrounding characters; the full reader takes **88, 322 and
1,049 ms**, respectively. Selective cold reads fetch only 138–155 KB of certified
record/index pages. The full reader remains the oracle and fallback.

Record-addressable immutable shards, semantic array paging and a hash-bound
Block/Placement/dependency index are derived only after complete archive replay
and validation. A separate trusted certificate binds each manifest to its exact
resource/segment/revision and current archive path. Losing, corrupting or changing
acceleration data cannot manufacture absence or history. This experiment is limited
to 16 materialized revisions and explicit storage/read/cache bounds.

The separate 25,000-character single-Block case confirms that selective reads
cannot avoid the selected Block's own size and can be slower than the full reader.
With identical exact graphs already retained in the worker, a compact immutable
preview reduces transfer/freeze/render time from **503–547 ms to 19–34 ms** with
matching markup. It is a display projection; exact graph/comparison authority stays
in the worker.

**Stopped for review.** The [spike report](BLOCK_HISTORY_SELECTIVE_READER_SPIKE.md)
contains parity coverage, all timings and preparation costs, preserved unsuccessful
and successful artifacts, and explicit integration limits. The production panel,
archive format and capture path are unchanged. Certificate persistence, incremental
materialization/update policy and production routing are not implemented by this
spike; P6, richer UI and restoration remain deferred.

## Read-path performance follow-up — 2026-09-18

The requested focused investigation reproduced the multi-second snapshot delay.
The persistent reader now retains one verified decoded checkpoint and one fixed
comparison-head subtree, fetches up to four chunks concurrently, and replays into
one private draft with the existing exact size accounting and full validation.
Redundant whole-state copies/encodings are removed. The panel publishes immutable
results through a signal, avoiding Solid deep-store copies. Existing UI controls,
admission limits, exact replay, cancellation and branch semantics are unchanged.

Final browser measurements, cold / subsequent same-session selections:

| Fixture | Before | After |
| --- | --- | --- |
| 500 characters | 111 ms / 139–221 ms | 103 ms / 69–107 ms |
| 5,000 characters | 839 ms / 837–1,464 ms | 413 ms / 241–402 ms |
| 25,000 characters, 15.2 MiB | 4,653 ms / 4,426–7,809 ms | 2,084 ms / 1,166–1,439 ms |

**Stopped for review:** the large case remains perceptibly slow. Reconstruction
and full graph validation remain expensive; this single large paragraph also
exposes substantial Cell extraction and worker-transfer cost even without replay.
The [performance report](BLOCK_HISTORY_READ_PERFORMANCE.md) contains separate
stage timings, preserved before/intermediate/final artifacts, cache/resource
bounds, focused parity/cancellation coverage and the proposed smallest selective
read architecture. It explicitly distinguishes derived exact record indexes from
history authority and notes that a compact preview transport is also needed for
the one-large-Block case. No selective reconstruction or richer UI was implemented.
47 focused tests, TypeScript checks and client/server builds pass. Existing
persistent restart and G3 evidence remains intact; P6 work is still deferred.

## Persistent vertical slice — 2026-09-18

The user accepted the initial UI and authorized the minimum §1 integration,
including a Document exceeding the temporary adapter's baseline/state budget.
The temporary adapter's limits remain unchanged. This is a bounded single-Document
increment, not completion of P1–P6 or a change to earlier G3 results.

Implemented connections:

- A saved repository-root `document-block` opts into persistent recording through
  **History…**. Unsaved samples retain the labelled temporary adapter. A portable
  enrolled file resumes capture when Open attaches its saved location, before the
  panel is opened. Workspace/nested-Document admission remains unsupported.
- Shared versioned wire, exact checked resource transitions and portable Document
  encoding preserve authored Block/structural Placement identities. Enrollment
  never normalizes the live repository or adds an undo step. Foreign descriptors
  stay terminal; no current foreign state enters an owned historical snapshot.
- A dedicated browser worker validates and commits immutable packets to strict
  IndexedDB before native delivery. Separate browser-committed/server-durable/
  verified watermarks, retained pending bytes, exact retries, lease heartbeats and
  recovery across worker/page restart are connected to the real editor source.
- The native server publishes under the Document directory's `.memory/` store,
  using the established confined filesystem helper and OS writer fence. A single
  leased writer, independent semantic verifier and content-addressed checkpoint
  chunks precede acknowledgements. History is independent of ordinary Save.
- Save serializes the exact captured revision and includes its verified proof.
  The server compares the artifact with that historical state, syncs publication,
  and stores its receipt. If history is unavailable, ordinary Save still writes a
  validated portable Document without claiming a saved history revision, and
  reports a warning. Receipt-finalization failure after file publication is also
  Save success plus a history warning, never a false file-save failure. Open loads
  only the saved artifact. Later unsaved
  historical edits remain in the earlier recording session. Fresh runtime keys
  require a new segment baseline; the saved receipt is an origin link, **not** an
  invented state-parent edge. History relocation/copy/Save As of enrolled files
  is explicitly unsupported for this slice; the portable Document remains usable
  without its memoir.
- The panel uses the same immutable preview/comparison contracts. Its small added
  **Recording session** selector exposes older sessions after reopening. Readers
  have a fixed verified head, metadata pages and checkpoint-plus-bounded-tail
  replay. Cancellation aborts read requests; stale results cannot publish into the
  UI. Failures and recording limits remain visible, with no pruning or fallback
  that would silently claim persistence.

Declared admission: one saved local Document, at most **20 MiB** encoded state and
**100,000** graph records, **1 MiB** checkpoint chunks, checkpoint spacing **12**,
at most **12** replay records, **25** timeline records per page, **128** segments
and **4,096** revisions per segment. The strict outbox retains its existing
**100 KiB** packet / **16 MiB** pending / **4,096** record limits; the native
record envelope is independently capped at **128 KiB**. The capture cap remains
**64** messages. These are explicit supported boundaries, not enlarged temporary
session limits. The state bound admits the measured 25,000-character G3 fixture;
inputs outside the bounds stop explicitly. No throughput qualification is implied
by these focused checks.

Small integration decisions: portable Documents are opened individually. Existing
Workspace reference loading reports that limitation instead of decoding the new
format as an empty legacy tree; the demo's Save Workspace route also refuses to
rewrite an enrolled Document through its legacy bundle codec. Search indexing for portable Documents is deferred
and Save returns a warning; the Document and history publication remain exact.
The worker bundle is built by both `npm run build:server` and `npm run dev`.

Focused validation: **40 tests pass** across the shared core, browser bridge,
native store/router/verifier, application enrollment/Save seams and existing
session-panel/Save/Open tests. Additional counter-boundary assertions reject a
forged source counter at enrollment and immediately after checkpoint 12; ordinary
valid transitions still pass. Graph and byte admission are checked before strict
IDB capture, including exact incremental serialized-size accounting. Readers can
open the verified prefix without waiting for all pending uploads.

The real-browser demonstration passed in Chrome 153.0.8010.48:

- One actual saved **25,000-character Document**, whose encoded checkpoint is
  **15,926,771 bytes** (about 15.2 MiB); the unchanged temporary adapter refuses it.
- Actual Block context menu → History panel, ordinary editor input → undo → redo,
  then a verified portable Save at revision 3.
- An additional unsaved edit reached native storage. A further offline edit reached
  strict IndexedDB: browser committed **5**, native durable/verified **4**, **one
  6,968-byte pending packet**. Both the browser and native server were killed.
- After restarting both, the old immutable packet recovered with its original
  enrollment under the new writer grant. The earlier session has revisions 0–5;
  reopening creates a distinct baseline session. The final outbox is empty.
- Each of the **six** historical states equals the independently exported live
  authored Document captured at that point; its actual panel preview also matches.
  The live reopened Document stays at saved revision 3, including while previewing
  the later unsaved/offline edits. No archive replay changes current content.

Evidence: [final-build larger-Document restart check](BLOCK_HISTORY_PERSISTENT_RELEASE_CHECK.json),
with the [first successful check](BLOCK_HISTORY_PERSISTENT_CHECK_FINAL.json) also
retained. The final build repeats the same six-state check after source-counter,
read-cancellation and bounded-intake refinements. Production client/server builds
and project TypeScript checks pass.
The [development-reload interruption](BLOCK_HISTORY_PERSISTENT_CHECK.json) and
[check-harness serialization failure](BLOCK_HISTORY_PERSISTENT_CHECK_REPEAT.json)
remain preserved as unsuccessful results. The second interruption occurred after
recovery but before all assertions; serializing the Solid store to plain data
fixed the check without changing its assertions. Vite file watching/HMR was
disabled only in the isolated check server to prevent code edits from reloading
that test page. No browser scheduling/throttling setting or G3 workload changed.

To use the persistent slice, restart `npm run dev` so the new native routes and
verifier bundle are loaded, then open a saved Document and choose **History…**.
The badge should read **Persistent**. Close the panel, edit, and Save normally.
After restart, use **Open…** for the same file and **History…** on its Block; choose
an earlier **Recording session** to inspect its exact revisions. Save captures
current authored content independently of history; warnings distinguish missing
association from file-write failure. Save unsaved work before restarting an
existing development session.

Reproduce the bounded integration check after `npm run build:server`:

```sh
HISTORY_PERSISTENT_RESULT=BLOCK_HISTORY_PERSISTENT_LOCAL_CHECK.json node scripts/check-persistent-block-history.mjs
```

The check refuses to overwrite evidence and owns its temporary Document, native
server, Vite server and Chrome profile. It does not touch the user's documents or
existing servers. This completes the admitted vertical-slice milestone. Further
Stage C expansion, P6 qualification, richer UI and restoration remain deferred;
prior G3 results and artifacts are unchanged.

## Initial UI review checkpoint — 2026-09-18

The ordinary Block context menu now includes **History…**, backed by the command
registry's `history.open`. The panel has a keyboard-operable revision timeline,
revision selection, immutable historical subtree preview, and side-by-side
comparison against the latest recorded state fixed when the panel opens. Escape
or Close restores editing focus/selection. Superseded and closed asynchronous
requests cannot publish stale results. Previewing never changes the live Document
or ordinary undo/redo.

Discoverability follow-up: **History** is now visible beside **Find** in the
Document toolbar, and **History…** is the first Block-menu action. The locally
served production client on port 3002 was still the pre-History build; the client
and server were rebuilt together. The served workspace was checked directly for
both controls and successful toolbar-to-panel opening. Save unsaved edits before
refreshing an already-open old client. Four focused panel tests now pass, including
the toolbar route; the production build and project TypeScript checks pass.

To try it, run the normal development client (`npm run dev:client`) and open the
workspace or `/pilot`. Right-click a text Block (or use Shift+F10 / Control-click)
and choose **History…**. The first opening records the baseline. Close the panel,
make edits, then reopen History and select **Recording started** or another
revision. History does not reconstruct edits made before enrollment. The client
is running at `http://127.0.0.1:3000/` at this review checkpoint.

The panel is deliberately **session-only** and says so prominently. Its recording
survives panel closes, but not Document-session disposal or page reload. Text,
basic annotation styles and structural containers use a separate static renderer;
unsupported tools/media use placeholders. No live editor views, InputGateway,
timers, embeds or desktop windows are mounted in historical content. More complete
annotation styling and contextual overlay rendering are outside this checkpoint.

The temporary adapter reuses compact commit events, exact replay and established
read-only subtree/comparison contracts. It captures no whole snapshot in ordinary
commit callbacks and creates no second editable producer. It admits one closed
Document, including one selected from a finite Workspace source log, but refuses
reference placements, nested Documents and foreign definitions. Its temporary
occurrence identities are explicitly session-local; they are not a durable
identity format. Capture limits (500 source commits, 128 KiB per event, 8 MiB
retained events and baseline/state budgets, 60,000 graph records) produce explicit
incomplete/unsupported status, never pruning or changed undo. Timeline scans have
continuations and replay budgets. This finite adapter is not the production lazy
archive reader or a newly qualified recorder.

Parallel persistent work stopped at the **strict IndexedDB outbox foundation**:
immutable hashed wire bytes, enrollment/epoch identity, separate browser-committed,
server-durable and verified watermarks, atomic acknowledgement byte release,
exact retries, recovery and explicit finite bounds. Its transport is injected;
it is **not connected to an editor or native server** and does not claim native
durability. Versioned shared resource/core promotion, portable Save/Open identity,
server publication/fencing integration, real enrollment/receipts, bounded durable
queries and the real-Document restart demonstration remain §1 work. The adapter
has not been replaced. Pausing those connections at this point implements the
user's instruction to review the first UI before substantial elaboration.

Validation completed:

- Six adapter tests: live edit/undo/redo and structural insertion, immutable reads,
  fixed head, one-Document isolation, continuation, capture boundaries and aborts.
- Four panel tests: actual context-menu/command and visible toolbar entry, historical selection and
  comparison, ordinary undo unchanged, keyboard/focus return, stale-result
  suppression and inert tool/media previews.
- Real Chrome UI check: baseline → ordinary editor input → reopen → select past
  revision → compare, with the live Document unchanged. The ordinary workspace
  sample also opens its first historical preview successfully.
- Real Chrome strict-IDB checks: fresh-page pending recovery, lost-ack exact retry,
  rejected identity/order/epoch/hash mismatches, delayed verification, atomic
  capacity failures and empty-outbox byte accounting. This is an outbox seam
  check, not the pending full Document restart/reopen demonstration.
- Project TypeScript checks pass. No broad regression or G3/P6 campaign was run.

Review artifacts: [panel screenshot](BLOCK_HISTORY_UI_PREVIEW.png),
[browser check result](BLOCK_HISTORY_UI_CHECK.json). Reproduce the focused checks:

```sh
npx vitest run src/history/ui-session-source.test.ts src/rendering/block-history.test.tsx
node scripts/check-block-history-ui.mjs # requires the Vite client on port 3000
node scripts/check-history-outbox.mjs
npm run typecheck
```

Implementation: [panel](src/rendering/block-history.tsx),
[session controller](src/runtime/block-history.ts),
[temporary read-only adapter](src/history/ui-session-source.ts),
[persistent outbox foundation](src/history/persistent-outbox.ts).

**Historical stop (now cleared by the user’s successful UI review):** the initial
UI was reported before adding persistent-path integration or richer UI.
No restoration/insertion, sentence grouping, broad Workspace support, P6-scale
qualification or additional G3 investigation was added. Prior G3 evidence and its
unestablished foreground-budget status remain unchanged.

## 1. Required before the UI consumes real persistent history

These are narrow slices of P1–P5, not prerequisites to finish those phases in full.

| Required slice | Smallest useful deliverable |
| --- | --- |
| P1: supported wire and reader contract | Promote the proven resource/identity/record representation into a versioned shared core with checked decode/apply and immutable results. Fix resource, memoir, segment, revision, Block and semantic Placement selection; expose explicit incomplete/unsupported/ambiguous states. Retain golden compatibility and exact replay checks for the supported path. |
| P2/P4: stable identity and enrollment | Integrate stable bindings and portable read/write for the selected Document path, with a real baseline and incremental canonical subscription. Preserve external descriptors; do not resolve foreign current state into historical owned state. Associate the saved artifact with its actual revision/receipt. On reopen, distinguish the saved Document from later archived unsaved edits: no invented parent or automatic historical replay into current content. Legacy normalization must not add an undo step. |
| P3: durable write/restart path | Connect a confined, directory-local `.memory` store to real application endpoints and a single fenced writer. Publish verified prerequisites before acknowledging their records. Use strict IndexedDB transactions for immutable pending bytes, exact retry/deduplication, recovery, and separate browser-committed/server-durable/verified watermarks. Retain pending bytes until the appropriate acknowledgement is committed. Enforce supported record, baseline, outbox and queue bounds with explicit failure status. |
| P5: bounded read-only access | Read a verified checkpoint and the required state ancestry through a separate read-only capability. Supply an asynchronous, cancellable timeline page, subtree and location for a fixed branch/revision. Preserve external-reference and missing/ambiguous statuses. Use work budgets and continuations; budget exhaustion cannot mean “no history.” Start with exact revision entries; sentence grouping is unnecessary for the first prototype. |

At the initial UI review, G1/G2/G3 proved these mechanisms only in harnesses;
the persistent increment above now connects the admitted single-Document path.
The original scope identified the following constraints. In particular, the finite gate store's whole-journal scans and the existing memory
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

The small panel and the admitted persistent path have reached the requested
review milestones. The subsequent focused read acceleration is implemented;
review the [completed selective-reader spike](BLOCK_HISTORY_SELECTIVE_READER_SPIKE.md)
before integrating selective reads/compact transport into production or expanding
the UI. Extend supported
cases or begin P6's large qualification matrix only as a separately scoped next
increment. The labelled temporary adapter remains available for unsaved samples;
saved admitted Documents use the persistent path proved above.

References: [Stage C plan](BLOCK_SCOPED_HISTORY_STAGE_C_PLAN.md),
[gate results](BLOCK_SCOPED_HISTORY_STAGE_C_GATE_RESULTS.md),
[historical UI contract](BLOCK_SCOPED_HISTORY_SPEC.md#9-historical-ui-and-execution-isolation).
