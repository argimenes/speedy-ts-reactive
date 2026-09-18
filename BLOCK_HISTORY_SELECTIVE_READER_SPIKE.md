# Bounded selective Block History reader spike

2026-09-18. **Complete; stopped for review.** The experiment demonstrates that a
modest historical Block can be loaded independently of most surrounding Document
content. This remains an isolated spike; the production History panel still uses
the existing persistent full reader. No production archive format, enrollment,
capture, undo, queue, admission limit or P6 qualification changed.

## Result: selected size separated from surrounding size

The selected Block starts at **200 characters** in every row. Surrounding content
is in separate 100-character Blocks. Three exact commits edit that Block, undo,
and redo. Cold selection chooses revision 3; subsequent selections are 0, 1, 2,
1, 3 with the same fixed comparison head. The edit increases selected length to
201 characters identically in all three Documents.

| Surrounding characters / Blocks | Full encoded baseline | Full reader cold | Selective cold | Full reader subsequent | Selective subsequent | Selective cold bytes fetched |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 500 / 5 | 451,151 B | 88 ms | 47 ms | 43–48 ms | 31–48 ms | 138,119 B |
| 5,000 / 50 | 3,349,821 B | 322 ms | 48 ms | 31–81 ms | 31–48 ms | 154,541 B |
| 25,000 / 250 | 16,232,971 B | 1,049 ms | 48 ms | 48–464 ms | 31–48 ms | 149,053 B |

The modest-Block result is material: roughly **22× faster cold** in the largest
Document, fetching about **0.9%** of its full baseline. Selective reconstruction
itself takes 23–27 ms cold; the remainder includes worker transfer, immutable
publication and a paint opportunity. Lookup depth/page packing accounts for the
small fetched-byte variation. Repeated revision selections hit the bounded cache
and transfer no further shard bytes. The full reader's fast revision-0 selection
uses its cached checkpoint and no replay; warm ranges include that special case.

Evidence: [complete browser comparison](BLOCK_HISTORY_SELECTIVE_SPIKE_RESULTS_FINAL.json).
All four revisions in all four fixtures also pass exact selected-graph and
comparison equality against the full reader outside the timed samples. Every
timed preview matches independent fixture text and the fixed head; full and
compact preview markup agrees (ignoring only Solid's comment markers).

## Separate large-single-Block cost

The fourth fixture has one **25,000-character** paragraph, no surrounding Blocks,
and a 15,926,681-byte baseline (15.2 MiB). IDs differ from the earlier performance
fixture; size, paragraph shape and annotation range are equivalent. It cannot
benefit from skipping unrelated Blocks.

| Reader / transfer | Cold selection | Subsequent selections |
| --- | ---: | ---: |
| Full reader / exact graph | 2,259 ms | 783–1,755 ms |
| Selective reader / exact graph | 3,856 ms | 1,240–4,250 ms |
| Full reader / compact preview | 1,327 ms | 261–699 ms |
| Selective reader / compact preview | 963 ms | 946–1,031 ms |

These sequential samples include JIT, GC and filesystem warming differences; the
two selective cold times must not be interpreted as a transport-only improvement.
The selective path requests 331 pages / about 16.6 MB here. Its 4 MiB cache cannot
retain the entire selected Block, so subsequent reads fetch those pages again.
It is **not a universal replacement** for the full reader. The full reader remains
the better fallback for a selection covering most of the Document. Cache limits
were not increased to improve this case.

An additional alternating comparison isolates transfer/render cost with the
**same exact revision-1 and comparison-head graphs already held in the worker**.
No checkpoint fetching, verification or reconstruction occurs inside these
measurements; four full/compact pairs use identical graph authority:

| Stage | Full graph | Compact immutable preview |
| --- | ---: | ---: |
| Worker display projection | 0 ms | 10–12 ms |
| Worker RPC including transfer/deserialization | 350–388 ms | 11–15 ms |
| Main-thread deep freeze | 106–117 ms | below timer resolution |
| Render through second animation frame | 41–53 ms | 8–22 ms |
| Total | **503–547 ms** | **19–34 ms** |
| Logical JSON body size | 49,483,173 B | 50,685 B |

Logical JSON size is a diagnostic, **not measured structured-clone wire size**;
structured clone can preserve repeated object references. Size serialization runs
after the timed publication. The worker retains the exact latest selection and
comparison graphs; it computes comparison there. Only the inert display tree,
text/style runs, status/provenance and exact comparison summary cross the compact
boundary. That projection cannot answer a history query, replay an edit, restore
content or replace archive authority.

Evidence: [isolated alternating transport experiment](BLOCK_HISTORY_SELECTIVE_TRANSPORT_RESULTS.json).

## Implemented design and exactness boundary

The code is in [src/history/selective-spike](src/history/selective-spike). It accepts
the established checkpoint/path/chunk contracts through `ArchiveIO`, plus an
authoritative revision-ID lookup. The measurement adapter uses immutable fixture
checkpoints/records on disk and a local native service; it does not open or modify
the user's Documents. Every materialized state undergoes full canonical decode,
checkpoint/chunk hash checks, exact replay/preimage checks, source/local counters,
whole-graph validation and the existing admission checks before certification.

1. **Exact, rebuildable materialization.** For this bounded spike, each requested
   revision is materialized after full replay. Its manifest names exact record
   versions at that revision, with immutable content-addressed shards reused when
   their contents agree. Query-time tail replay is unnecessary for a materialized
   revision; an unmaterialized revision falls back. This is not a new authored
   snapshot/history model, and does not alter archive checkpoint spacing or the
   original commit/cause/parent records. It is deliberately limited to 16
   materialized revisions, not an archive-scale build policy.
2. **Record-addressable shards.** A semantic Block bundle contains its exact
   content record, directed Placement records and inline Cell records. References
   to other Blocks are resolved through the index only when needed for the
   requested closure. Typical shards target 64 KiB; the hard cap is 1 MiB. Large
   ordered inline-placement arrays are paged at **element boundaries**, with
   recorded total length and checked concatenation. The exact array order and
   every identity survive reconstruction; shards are not arbitrary JSON byte
   slices. Other oversized/unsupported materialization cases fail explicitly and
   leave the full reader available.
3. **Authenticated lookup and structural evidence.** A content-addressed hash
   trie indexes stable Block ID, semantic Placement ID, content-key bundles and
   annotation definitions. Block entries include the complete ordered occurrence
   set, routes, parent/slot/index and the exact occurrence Placement records.
   Global location traversal work is included so the original incomplete/work
   boundary is preserved. This captures moved ancestors and shared/cyclic routes,
   not only directly touched Blocks. Retained unplaced definitions are indexed.
   Referenced foreign content remains terminal and is never fetched.
4. **Authority is outside derived storage.** A private certificate table is
   populated only by the full verifier/materializer after all writes finish. It
   binds resource/memoir/segment/sequence/revision, the archive path hash, and the
   derived manifest hash. A query asks that adapter again; it rechecks the current
   authoritative path and revision identity. A manifest self-hash or a filename
   alone is never accepted as certification. Every fetched page is checked against
   that hash chain and canonical grammar. Missing trie branches/entries are
   meaningful only beneath a certified complete index. Lost certificates after
   process restart mean fallback/rebuild, even when derived files remain present.
5. **Selective reconstruction.** Fetch the requested Block entry and its needed
   content/edge closure, selected occurrence evidence and annotation definitions.
   Shared records must agree; cycles stop exactly as before. The shared immutable
   fragment constructor is used by both readers. Global validation is not replaced
   by a partial-graph validator: its result is bound to the certified revision
   during materialization, and selective reads verify the complete addressed
   evidence for that result. Corrupt, missing or stale acceleration clears its
   cache and invokes the bounded full reader. A full-reader failure remains an
   error, not fabricated absence/deletion.
6. **Bounded resources/cancellation.** At most four shard reads concurrently;
   4 MiB encoded decoded-page cache; 24 MiB transfer and 4,096 page accesses per
   query; existing 100,000-record admission and 200,000 query-work limit. Derived
   build storage is capped at 128 MiB. These spike bounds are not changes to
   production admission. Encoded byte bounds do not claim equivalent JavaScript
   heap sizes. Cached decoded pages are private, query results are immutable, and
   aborts propagate through reader I/O without invoking fallback for cancellation.
   Synchronous JavaScript work still cancels at its next checked boundary.

The certificate adapter is a trusted boundary just like the existing native
archive verifier. This spike does **not** persist a trusted certificate catalogue
or promote untrusted disk manifests into authority on restart. Connecting that
lifecycle to the real native verifier is a subsequent production integration
decision, not a missing proof silently supplied by a cache.

## Preparation/storage costs and limitations

| Fixture | Initial materialization | Later revision materialization | Derived bytes for four revisions |
| --- | ---: | ---: | ---: |
| Modest / small surround | 81 ms | 91–127 ms | 739,070 |
| Modest / medium surround | 542 ms | 678–1,010 ms | 3,875,325 |
| Modest / large surround | 2,900 ms | 3,404–5,185 ms | 17,564,598 |
| Large single Block | 2,566 ms | 3,749–5,269 ms | 33,422,161 |

Preparation still scales with the Document and runs **outside** selection timing.
It is not suitable for the foreground commit callback. This simple materializer
fully verifies each requested revision; incremental maintenance is not implemented.
The large-single-Block edit also shifts many packed record boundaries, adding
about 16.6 MB of derived data once; subsequent undo/redo mostly reuse old shards.
This amplification is reported rather than hidden by larger storage budgets.
Do not adopt this packaging as a production update policy without a separate
decision about incremental maintenance and stable page boundaries.

The native fixture authority and browser code are isolated from production UI.
There is no production route-selection heuristic, persistent trusted-certificate
lifecycle, background scheduling contract or archive-wide indexing job. This is
the requested bounded feasibility result; no P6 matrix or second history model
was started.

## Focused evidence and reproduction

Focused tests cover independent canonical-state and full-reader equality across
14 states: edits, undo/redo, redo invalidation, sharing, moved ancestors, annotation
changes, retained unplaced definitions, deletion and checkpoint-12 crossing.
Selections cover explicit semantic placements, absent routes, unknown Blocks,
ambiguous occurrences and whole subtrees. Additional checks cover reference cycles,
external boundaries, immutable results, the existing full reader's base64/byte parity, missing
or corrupted acceleration, changed archive evidence, wrong-segment certificates,
certificate loss/rebuild, paged Unicode inline order, four-read concurrency and
in-flight cancellation. Compact rendering matches the existing inert renderer for
text/styles, containers, placeholders and status states.

**21 focused tests pass**, as do both TypeScript projects and the production
client/server build. Final descriptor-type checks, deduplicated closure scheduling
and concurrent cache accounting were reviewed after measurement; the selective
parity/bounds tests were rerun successfully. No additional qualification programme
was introduced.

The successful browser run has 60 timed end-to-end samples plus 16 full-graph /
comparison parity checks, and the separate transfer check has eight alternating
samples. These are focused feasibility timings on an Apple M1 / 8 GiB host,
Chrome 153.0.8010.48, headless isolated profiles, local filesystem/HTTP and a Vite
fixture. Cold means empty application reader caches, not cold OS caches. Timing
ends after the second animation frame, not a GPU measurement. Parallel fetch
durations are sums and can exceed wall time. They are not p95 production latency
claims; ordering/JIT/GC variability is visible in the raw artifacts.

The [initial interrupted build](BLOCK_HISTORY_SELECTIVE_SPIKE_RESULTS.json) is
preserved: the single large inline array exceeded the original shard bound. The
semantic array paging fix retains that bound; the subsequent full comparison
passes. Prior read-performance, persistent restart, G3 and failed/interrupted
artifacts remain untouched.

```sh
npx vitest run src/history/selective-spike/selective.test.ts src/history/selective-spike/preview.test.tsx src/history/durable-core.test.ts src/history/durable-reader.test.ts src/rendering/block-history.test.tsx
SELECTIVE_HISTORY_RESULT=BLOCK_HISTORY_SELECTIVE_LOCAL.json node --expose-gc scripts/measure-selective-history.mjs
SELECTIVE_HISTORY_TRANSPORT_ONLY=1 SELECTIVE_HISTORY_RESULT=BLOCK_HISTORY_TRANSPORT_LOCAL.json node --expose-gc scripts/measure-selective-history.mjs
```

Scripts refuse to overwrite results and own their temporary data, servers and
browser profiles. Stop here: the selective approach is promising for modest
closures, compact transport independently removes a major display cost, and the
full reader must remain available for large closures and unavailable acceleration.
