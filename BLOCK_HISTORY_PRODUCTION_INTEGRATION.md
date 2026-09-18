# Persistent Block History: bounded production read integration

2026-09-18. **Complete; stopped for review.** Implementation, focused parity/measurement and
browser/server crash–reopen checks passed. This adopts the accepted selective-reader direction
in the existing History panel. The archive, full reader, admission limits, undo
semantics and static rendering boundary remain authoritative and unchanged.
No P6 programme or additional UI feature is included.

## Display boundary

`ReadonlyHistorySession.select` now returns `HistoryDisplayResult`: inert text
runs with allowlisted classes, container/placeholder nodes, status and occurrence
information, exact comparison change kinds and resource/memoir/segment/fixed-head
provenance. The persistent worker computes the exact subtree comparison **before**
projection. Cell graphs, authored payloads and replay objects no longer cross into
the panel. The temporary adapter uses the same boundary. Results remain immutable;
no preview can be replayed, restored, edited, execute media or resolve remote targets.
The old full-graph renderer is retained only in the isolated spike as a markup oracle.

## Authority and maintenance

The native archive still independently verifies the complete transition and
publishes its immutable record before sending an optional derived-maintenance
hint. A separate worker retains one admitted private Document state. Ordinary
compact receipts enforce exact preimages and update only changed record buckets,
paged inline ordering and affected Merkle lookup paths. Unaffected immutable
shards retain their hashes. Stable hashed record buckets prevent insertion near
the start of a large paragraph from shifting every subsequent storage boundary.
Inline order uses semantic pages of at most 512 Placement keys; record buckets
target 256 KiB with the existing 1 MiB hard shard bound.

Structural changes rebuild structural/occurrence evidence and bundles in the
background. Ordinary text edits still scan structural metadata/index entries to
refresh closure cost; this is not a claim of constant-time maintenance for arbitrary
Block counts. They do not re-encode or re-verify the whole Document. The existing
independent native full validator is **not** bypassed or optimized by this change.

A volatile native certificate ties each derived root to resource, memoir, segment,
sequence, revision ID and its immutable archive envelope hash (the segment record
hash for the baseline). The shared experimental wire field is named `pathHash`;
in production it carries this authoritative revision anchor, not a second replay
chain. Each read rechecks that native evidence. Content-addressed manifests, lookup
pages and record shards are hash/length/canonical-decoding checked by the reader.
The compatible derived format tag remains `selective-history-spike`, version 1;
it is a disposable internal cache format, never an archive format or authored
per-Block snapshot. The spike imports the same shared page/reader implementation.

Certificates are not persisted or trusted on restart. A missing certificate
initiates a bounded background rebuild from the existing exact checkpoint path;
every step retains full validation. All revisions on that path (at most checkpoint
plus 12 records) receive certificates, so neighboring revision selections can
reuse the rebuilt data. The full reader answers without waiting for this maintenance.
Old or unavailable acceleration never implies deletion, absence or a fabricated
revision. Worker errors, queue gaps, cache exhaustion and generation changes only
lose acceleration; focused native tests show appends still acknowledge correctly
with an unavailable derived worker.

Bounds: one active resource/segment, eight pending maintenance jobs, sixteen
certified revision roots, 128 MiB disposable CAS, 4 MiB decoded read-page cache,
four concurrent shard reads, 200,000 derived record memberships and 200,000
occurrence-route components. These last work bounds limit duplication under sharing;
exceeding them loses acceleration, never historical access. The existing 20 MiB/100,000-record full-state admission
and 12-record replay distance are unchanged. CAS files live outside the archive
in a private temporary directory, removed on disposal/reset. Startup reclaims
this user's dead-process cache directories. No archive history is pruned. Bounds
or a switch to another segment may require rebuilding and full-reader fallback.
These are deliberately finite initial integration limits, not P6 qualification.

## Route selection

Before loading a closure, the authenticated Block entry supplies its actual
record/bundle/inline-page cost. Selective reading is eligible only if:

- closure bytes are at most `min(1 MiB, max(128 KiB, 0.4 × full-state bytes))`;
- closure pages are at most 48; and
- the certificate, identities, cost evidence and subsequent bounded reads verify.

Missing/stale/corrupt data, unsupported evidence and larger closures fall back to
the unchanged full reader. Cancellation propagates without invoking fallback.
One fixed selective comparison-head subtree is cached only behind a freshly
checked certificate; the full reader retains its original bounded checkpoint/head
cache. These are acceleration policies, not enlarged history support limits.

## Actual production UI measurements

Apple M1 / 8 GiB; isolated Chrome profiles and native servers, actual saved
Documents, editor input, context-menu History and the production worker/panel.
The selected Block is 200 characters for every surrounding-size row, with a bold
range. Surrounding text is in 100-character Blocks. Three exact commits insert one
character, undo and redo. A new HistorySession selects head 3, then 0, 1, 2, 1, 3.
All commits are natively verified with an empty outbox, and derived maintenance is
complete before these selection samples. Cold means empty session reader caches,
not cold OS filesystem caches. The separate initial enrollment selection is
recorded in the artifact and is **not** presented as acceleration-ready latency.
These are focused samples, not percentile or sustained-throughput qualification.
The first enrollment selections used full fallback and took 94 / 544 / 1,052 /
1,838 ms respectively while background initialization proceeded.

| Selected / surrounding characters | Exact baseline | Route | Cold selection | Subsequent selections | Cold selective bytes |
| --- | ---: | --- | ---: | ---: | ---: |
| 200 / 500 | 451,268 B | selective | 65 ms | 30–67 ms | 138,018 B |
| 200 / 5,000 | 3,350,119 B | selective | 37 ms | 23–67 ms | 154,621 B |
| 200 / 25,000 | 16,234,070 B | selective | 59 ms | 21–67 ms | 149,773 B |
| 25,000 / 0 | 15,926,778 B | full fallback | 2,230 ms | 567–909 ms | full checkpoint |

This materially preserves the spike's modest-Block scaling result. The largest
surrounding Document fetches about 0.92% of the full baseline. Repeating already
loaded revisions transfers zero additional shard bytes. Native certificate/HTTP
reads are included; modest-Block worker times are 34–39 ms cold.

For the large single Block, compact worker projection takes 3–36 ms; worker
transfer adds roughly 0.2–0.8 ms, result freezing 0–0.5 ms, and UI/render publication
14–34 ms. It still costs 0.57–2.23 s to reconstruct/compare the large selected graph
inside the worker. The reader correctly avoids the slower selective closure path;
this work does not claim that a 25,000-character Block itself is instant.

| Fixture | Initial rebuild worker total | Incremental edit/undo/redo worker time | Derived baseline | New derived bytes per revision | Derived total after 3 commits |
| --- | ---: | ---: | ---: | ---: | ---: |
| 200 / 500 | 113 ms | 12–17 ms | 479,761 B | 136,540–138,660 B | 892,164 B |
| 200 / 5,000 | 959 ms | 15–28 ms | 3,562,524 B | 153,143–155,265 B | 4,024,738 B |
| 200 / 25,000 | 2,486 ms | 31–44 ms | 17,266,981 B | 141,028–155,855 B | 17,705,555 B |
| 25,000 / 0 | 5,293 ms | 33, 43, 316 ms | 16,626,210 B | 89,750–237,394 B | 17,043,104 B |

Every measured ordinary revision updates three rows in one bundle. The 316 ms
single-Block redo sample is retained; there is no sustained maintenance-latency
claim. Initial totals include an additional verified baseline reconstruction in
the independent derived worker (42 / 306 / 948 / 1,576 ms respectively), plus
materialization and disk writes. These initial/restart costs remain real.

Initial derived storage is 1.04–1.06× the canonical baseline, **in addition to**
the unchanged archive. Native compact revision wires are only 1,817–1,921 B;
shard/index copy-on-write therefore still amplifies a compact edit by about
49–124×, although it avoids the spike's roughly 16.6 MiB rewrite for a tiny edit
in the large paragraph. The 128 MiB cap is enforced; old unreferenced CAS pages
are reclaimed by resetting/rebuilding the disposable generation, not by pruning
archive history. Fine-grained long-running cache reclamation is deferred.

## Evidence and scope stop

- [Production UI results](BLOCK_HISTORY_PRODUCTION_RESULTS_FINAL.json): 24 timed
  selections, exact independently observed selected/fixed-head text, live-state
  invariance, compact-only UI payload and expected cost-based route in every case.
- [Production crash/reopen check](BLOCK_HISTORY_PRODUCTION_RESTART_CHECK_FINAL.json):
  all six large-Document revisions recovered exactly after browser/server restart,
  including unsaved and offline edits; live content remains the saved revision.
  Its [failed initial launch](BLOCK_HISTORY_PRODUCTION_RESTART_CHECK.json) is also
  preserved: the client build had cleared the server build output; the server
  was rebuilt before the successful check.
- [Preserved failed first launch](BLOCK_HISTORY_PRODUCTION_RESULTS.json): harness
  variable shadowing prevented fixture startup; no qualification data was accepted.
- `selective/maintenance.test.ts`: full-reader and independent live-state graph /
  comparison parity through sharing, moved ancestors, annotations, external
  boundaries, retained definitions, deletion, undo/redo, branches and cycles;
  paged inline insert/delete boundary and undo tests on 25,000 characters. A
  single-character change writes less than 1 MiB; a 19-character replacement and
  its undo write less than 3 MiB without changing any graph semantics.
- `persistent-reader.test.ts`: certified routing, fixed-head cache, large-closure
  fallback, corrupt/missing certificate fallback and cancellation.
- Native HTTP seam: fully verified append/retry, checkpoint boundary, save,
  restart/full fallback, rebuilt neighboring revisions, and successful durable
  append despite derived-worker failure. Full-reader/native validation and static
  preview parity tests remain enabled.

Focused regression tests, TypeScript checks and both client/server builds pass.
The final change also retains all certificates on a verified restart replay path;
the native test checks neighboring checkpoint-boundary revisions after restart.

The next review concerns this production path and its explicit cold-rebuild and
large-selected-Block limitations. No richer rendering, restoration, sentence
history, broad Workspace support or general qualification is included.
