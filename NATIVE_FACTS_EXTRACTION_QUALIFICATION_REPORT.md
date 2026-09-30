# Native Facts Extraction Qualification Report

1 October 2026. This qualifies a detached, read-only experiment following the accepted [Native Knowledge Index report](MUTABLE_NATIVE_KNOWLEDGE_INDEX_PROTOTYPE_REPORT.md). **Disk extraction passes the bounded differential gate. Production integration remains unimplemented; live extraction has a separate measured bottleneck.**

## Result and recommendation

The same 10,000-Document workload rebuilt in **21.6 seconds**, compared with **19m50s** in the accepted full-decoder baseline: approximately **55× faster**. Retained heap fell from **629 MiB to 279 MiB**. The native facts, counts, typed relationships and range semantics remain the same within the qualified extraction profile.

An ephemeral background rebuild is now plausible for the demonstrated 100–1,000-note vaults. At 10,000 notes, it is an approximately 22-second progressive operation, not instantaneous complete coverage. These warm-filesystem synthetic measurements do not establish cold-disk or arbitrary large-manuscript performance.

**Do not introduce a persistent cache or database on these results.** The next justified optimization gate is narrower: qualify a resource-scoped live facts adapter using the existing C2/C3 eligibility and canonical traversal rules, without paying `captureNative` on every deferred refresh. Then propose production adaptation of the ephemeral disk reader in a worker, behind the current provider contracts. No change to ownership, persistence or the repository model is implied or authorized here.

The live experiment explains that ordering. With 100 loaded Documents, capturing just one resource took a median of approximately **782 ms**, while extracting its facts from the resulting snapshot took about **7.4 ms**. Serializing that snapshot and using the fast disk reader does not eliminate capture and is not recommended. Disk speed alone is insufficient evidence for a responsive live integration.

## 1. Architecture: remove text-Cell reconstruction, retain semantic checks

[lightweight.ts](src/qualification/native-knowledge/lightweight.ts) uses this path:

```
original native bytes
  → existing reserved-wire parser
  → existing text-span grammar checks on every original text atom
  → private validation document with text atoms removed, image atoms retained
  → existing full native semantic decoder on that smaller document
  → existing facts collector, with original spans supplying native Cell coordinates
  → derived Facts only
```

The private validation document is a **validation witness**, not another resource model or a new file format. It retains every Block, structural/owned/reference edge, authored property bag, retention declaration, image atom and external descriptor. Only text atoms are absent from the witness. Their original strings remain private to the reader and provide the text runs, Cell count and snippets used by facts construction.

This is safe within the current native grammar because text atoms contain only a nonempty string, with one Unicode code point reconstructed as one Cell. They cannot declare authored Block identity, graph edges, linked definitions, asset provenance or resource ownership. The original reserved shape is checked *before* removing anything, so unknown text-atom fields cannot evade validation. Non-standoff inline data still reaches the ordinary decoder's rejection path. Images are deliberately retained because their authored property bags can carry values and provenance requiring semantic validation.

The full decoder validates the witness using the same authored-value, graph, ownership, identity and retention checks as ordinary native decoding. Nothing reinterprets an `external` edge as non-owning or follows a reference as owned content. The witness never escapes as a `ResourceSnapshot`: the preparation result exposes only validated resource identity, validation timing and a facts-construction closure. It is never saved, admitted, mounted or published.

This is a deliberately conservative optimization, not a final wire-direct parser. It re-encodes the private witness and calls the existing public `decodeNative` entry point. That small amount of extra JSON work avoids adding an unchecked semantic-decoder entry point. A future implementation may reduce it, but current results do not require that optimization.

## 2. Exact reuse and factoring

Only two production codec files have small, behavior-preserving refactors:

| File | Change/reuse |
| --- | --- |
| [native-resource.ts](src/persistence/native-resource.ts) | Extract `parseNativeEnvelope`: the existing UTF-8/JSON, reserved-field, envelope/value-version, edge-shape and retention-list checks. Ordinary `decodeNative` calls it and then executes its original reconstruction/validation path. Parsing alone explicitly does **not** certify a valid resource. |
| [stage-c-gates/portable.ts](src/history/stage-c-gates/portable.ts) | Extract `validateNativeTextSpan`, containing the existing nonempty-string check. Both ordinary decoding and the lightweight reader use it. Ordinary decoding still creates one Cell per code point. |

The existing `decodeGateDocument`, `decodeAuthoredValue`, `validateResource`, `resourceOwnership`, `captureNative`, `resourceToRepository`, linked-definition helpers and native identity checks continue to run on the witness. No new ownership algorithm, tag interpretation, wire envelope or value codec was introduced.

The qualification-only [facts collector](src/qualification/native-knowledge/extract.ts) gained an optional inline reader. Its ordinary path still uses `canonicalSearchSource` over real Cells. The lightweight path supplies equivalent text runs, boundaries, Cell count and mention slices from native text/image spans. Metadata, owned traversal, annotation filtering, reference typing, mention grouping, foreign-definition diagnostics and limits use the same collector.

The new span reader iterates code points using the same JavaScript string iteration as native Cell reconstruction. UTF-16 interior positions of a surrogate pair map to `-1`, as in the existing source helper. Combining marks retain separate Cell boundaries; this does not change grapheme/actionability rules in the search matcher. Adjacent text spans join; each image consumes one Cell and breaks a search run. Snippets preserve `[inline object]` markers.

The [lightweight rebuild](src/qualification/native-knowledge/light-files.ts) uses the prototype's existing discovery/read/hash helpers and the same TypeScript index. Identity is checked and duplicate contributions suppressed **before** facts materialization, matching the reference even when a duplicate's annotations would exceed extraction budgets.

## 3. Checks still using reconstruction

The witness still reconstructs Blocks and image Cells. Existing checks need their graph context for canonical root identity, local targets, unique placement/Block identity, nested-resource rejection, owned/reference cycles, multiple ownership, retained definitions, owned-external restrictions and provenance. Linked-definition resolution also needs canonical structural context.

No evidence here justifies independently reimplementing those rules over wire objects. Reusing them costs some time, but avoids a second permissive native interpretation. Text-Cell allocation, UUID generation, copying/freezing and repeated validation/ownership work over those Cell records are avoided. The current native JSON format remains unchanged.

This leaves a meaningful worst case: Documents containing many **Blocks or image atoms**, rather than long text spans, still pay reconstruction costs. A valid input with 10,001 child Blocks produced the same traversal-limit diagnostic through both readers. The lightweight scheduling probe still blocked its caller for approximately 1.2 seconds during validation of that structural workload. No claim of uniformly cheap or interruptible decoding is made.

## 4. Differential qualification

**161 tests passed in 12 files**, including **38 lightweight differential tests**, the existing 13 prototype tests, and focused native B1/B1.1/B1.2/B2, native-session/vault-session, portable/resource-codec and C2/C3 regressions. [Machine results](artifacts/native-facts/qualification-results.json), [log](artifacts/native-facts/qualification.log). The application/server and qualification TypeScript checks also pass: [production typecheck](artifacts/native-facts/production-typecheck.log), [prototype typecheck](artifacts/native-facts/typecheck.log).

The reference remains `extract(decodeNative(originalBytes))`. The candidate reads those same original bytes. Successful results compare the complete `Facts` structure using value-aware equality, not JSON-string equality. Failed inputs compare rejection by both routes. Original input bytes are checked unchanged. There is no golden-output replacement that simply copies candidate results.

The suite includes 24 generated notes, six existing historical/rich native artifacts, additional valid mutations and invalid wire/graph cases. A test can exercise several resources or mutations; 38 is the test count, not the total number of compared inputs.

| Requirement | Differential evidence |
| --- | --- |
| Canonical and root identity | Different resource/root IDs; envelope/root metadata disagreement rejected; filenames irrelevant |
| Metadata/tags and owned Block facts | Full-facts equality, malformed tags diagnostics, margins, retained unplaced definitions, owned traversal order |
| Text and Cell coordinates | Unicode, astral characters, combining marks, CR/LF, lone surrogate, adjacent spans, empty inline content |
| Inline objects | Leading, consecutive and middle image atoms; snippets and run boundaries equal |
| Typed annotations/relationships | Document and Entity separation, internal-Block target retained without promotion, unknown annotation types, deleted/client-only omission |
| Linked logical mentions | Multi-segment grouping/provenance, distinct local annotations, duplicate segment omission, foreign definitions and unresolved local links |
| Tagged values | Explicit `undefined`, `-0`, `NaN`, infinities and escaped tag-looking user objects in unknown annotation values; corrupt tags rejected |
| External/ownership checks | Valid external reference and graph-2 owned resource; graph-1 owned external, local-as-external, definition-as-owned-resource and duplicate owner claims rejected |
| Structural integrity | Invalid/missing roots/targets, duplicate Block/placement, multiple owners, owned cycle, reference cycle, nested Document, orphan and invalid retention membership |
| Strict wire validation | Invalid UTF-8/JSON, unknown envelope/atom fields, versions, reserved property keys, malformed property/image bags, invalid text spans and atom kinds |
| Incomplete coverage/limits | Annotation budget rejection, 10,001-Block traversal truncation, cancellation, unchanged diagnostics |
| Filesystem contribution semantics | Same facts/evidence/diagnostics, duplicate suppression even when the duplicate would exceed facts limits, corrupt native file and independent Markdown |

Historical artifacts cover the original untagged native profile and the current tagged-value/owned-resource profiles. Rich artifacts include actual image, 3D-object and linked-annotation producers. Unknown authored bags remain native data, not new query authority.

The shared collector means annotation/query policy is intentionally not implemented twice. Differential independence is concentrated where this change introduces risk: original full Cell reconstruction versus original-span coordinates and the reduced validation witness. These finite tests are strong evidence for the current grammar, not a proof against every future feature or arbitrary malformed graph. New native atom semantics must update this qualification before text atoms can continue to be omitted from the witness.

The original prototype's coverage limits remain explicit: standoff text, the qualified Document-root reference subset, no expansion of external resources or reference occurrences, and no claim to search arbitrary opaque/nested application internals. The reader is not a C2/C3 production adapter; their host/opaque eligibility rules must still govern any integration. This stage adds no recursive hosting support.

## 5. Comparable rebuild benchmarks

The generator, note sizes, folders, file mix, read/hash helper, index structures and query workload match the accepted baseline. Each Document has seven Blocks, 1,245 text characters, 17 annotation segments and seven logical mentions. The largest dataset contains 70,000 Blocks, 170,000 segments, 40,000 Document-reference mentions and 30,000 Entity mentions. Native byte totals and extracted counts match the baseline at every size; all three builds have no discovery/extraction diagnostics.

The machine remains Apple M1, 8 GiB RAM, Node 22.12.0 on macOS arm64. Each size starts a new process; generation is excluded, files are warm in the OS cache, and explicit GC brackets retained-heap measurement. Benchmarks did not overlap tests or each other. The new runs also sample a 5-ms event-loop heartbeat, so they include a small observation overhead absent from the historical baseline. This is a local measurement, not a browser end-to-end latency or cold-disk benchmark.

| Measurement | 100 Documents | 1,000 Documents | 10,000 Documents |
| --- | ---: | ---: | ---: |
| Discovery (ms) | 5.125 | 27.273 | 269.417 |
| Read/hash (ms) | 42.554 | 459.679 | 5,589.251 |
| Light validation (ms) | 144.891 | 1,449.594 | 13,435.419 |
| Facts construction (ms) | 24.782 | 212.118 | 1,939.025 |
| Map insertion (ms) | 3.187 | 10.336 | 254.524 |
| Total rebuild (s) | 0.223 | 2.176 | 21.611 |
| Accepted baseline total (s) | 8.270 | 89.980 | 1,189.739 |
| Total speedup | 37.0× | 41.3× | 55.1× |
| Retained heap delta (MiB) | 3.26 | 28.49 | 278.79 |
| Process RSS after rebuild (MiB) | 82.12 | 126.86 | 393.94 |
| Sampled peak heap (MiB) | 15.24 | 47.75 | 335.59 |
| Process peak RSS (MiB) | 85.70 | 140.06 | 417.41 |
| One-resource replacement median / p95 (ms) | 2.033 / 2.568 | 1.971 / 2.453 | 2.032 / 3.385 |
| Baseline replacement median (ms) | 87.146 | 83.477 | 93.164 |

Validation includes original parsing, original text-span grammar checks, witness serialization and the existing semantic decoder on the witness. Facts construction includes owned traversal, native text/range mapping, annotations and linked mentions. It is separate from map insertion. File reading/hashing is reported separately; improvements in that phase are not attributed solely to the algorithm because allocation pressure, GC and filesystem scheduling differ.

Retained heap includes the index and file evidence. The text reader also joins text runs into flat strings rather than retaining the original collector's character-by-character concatenation structure; this changes memory representation, not facts. RSS includes runtime/allocator effects. Sampled peak heap can miss intra-operation peaks; process peak RSS also includes the later query/incremental checks. No index-only RSS claim is made.

The bounded relationship queries still operate on the same maps and produce the same examples. Full-text behavior is unchanged: the dense 10,000-note query still encounters the existing 50,000-candidate limit. Its raw result is retained, but it is not used to justify a graph database or broaden this task into search redesign.

Raw measurements: [100](artifacts/native-facts/benchmark-100.json), [1,000](artifacts/native-facts/benchmark-1000.json), [10,000](artifacts/native-facts/benchmark-10000.json), [run log](artifacts/native-facts/benchmark.log). Repeated larger runs and a fresh full-decoder control are reported below to check that the improvement is not merely a different machine/session condition.

A fresh 100-note full-decoder control took **9.21 seconds**, consistent with the earlier 8.27-second baseline and far above the lightweight 0.223-second run. Repeating the lightweight measurements gave **2.00 seconds at 1,000** and **20.08 seconds at 10,000**, with effectively identical retained heap. These are two local trials at each larger size, not confidence intervals; the historical 10,000-note full-decoder run was not repeated.

[Fresh full control](artifacts/native-facts/control-full/benchmark-100.json), [1,000 repeat](artifacts/native-facts/repeat/benchmark-1000.json), [10,000 repeat](artifacts/native-facts/repeat/benchmark-10000.json).

## 6. Scheduling and editor-thread implications

During the new rebuilds, the 5-ms timer's additional delay had p95 values of approximately 2.43 / 1.45 / 1.47 ms for 100 / 1,000 / 10,000 Documents. Maximum observed delays were 3.47 / 72.38 / 160.26 ms. Low typical latency does not remove GC/validation spikes.

A separate [scheduling probe](artifacts/native-facts/scheduling-results.json) measured:

| Single probe | Elapsed | Maximum caller timer delay |
| --- | ---: | ---: |
| Full decoder, ordinary note | 102.6 ms | 102.2 ms |
| Lightweight reader, ordinary note | 3.4 ms | 3.0 ms |
| Lightweight reader, 10,001-Block input on caller | 1,399.9 ms | 1,201.6 ms |
| Same heavy input in disposable Node worker | 1,441.4 ms | 4.1 ms |

Both heavy-input runs returned 10,000 Block facts with `Block budget reached`. Worker timing includes startup and input transfer; its return message contains a small summary, not the whole index payload. This is a one-sample scheduling demonstration, not a production worker protocol or a browser typing benchmark.

The implication is clear: run saved-file parsing/validation away from the editor thread, bound jobs and results, yield between resources, and keep cancellation/stale-generation checks at boundaries. JSON parsing and native graph validation are synchronous within one job. An abort signal cannot preempt those operations mid-call; worker termination is a potential isolation mechanism, not a new guarantee implemented in Flint here. Returning or rendering thousands of results can itself require batching and remains unqualified.

Ordinary typing still uses the existing prototype's inline-owner invalidation fast path: no synchronous capture or database work was added. The existing snapshot-free typing, stale completion, Undo/Redo, disappearance and disposal-suppression tests pass. No claim is made that a timeout alone makes deferred capture safe for interactive latency.

## 7. Live canonical overlay

The existing overlay is unchanged in this stage. Loaded canonical facts completely supersede saved contributions; invalidation suppresses stale facts immediately, including before aggregate queries/result limits. Request serials and repository revisions still reject stale completion. Disposal does not resurrect old disk facts. Nothing writes unsaved edits to disk or grants the index save/binding/ownership authority.

The [live-state probe](artifacts/native-facts/live-results.json) constructs canonical shared state using existing non-owning resource registrations and measures three captures per size, excluding fixture setup. It compares ordinary facts with the lightweight reader after explicit native encoding of the captured snapshot; those facts agree.

| Loaded Documents | Content records | Median capture | Median ordinary facts | Median native encoding + lightweight facts |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 1,254 | 31.50 ms | 7.62 ms | 9.95 ms |
| 10 | 12,522 | 69.63 ms | 8.36 ms | 8.10 ms |
| 100 | 125,202 | 781.92 ms | 7.43 ms | 7.36 ms |

`captureNative` necessarily scans the current shared state's Document identities and placements, checks repository resource ownership, determines membership and copies/validates the captured graph. Its cost therefore grows with unrelated loaded resources. The lightweight disk path cannot remove that work after capture has already happened. Encoding live state just to parse it again is not a useful integration plan.

A future live reader should begin with the current canonical in-memory view, following the existing C2/C3 source-eligibility and owned-traversal approach, and retain their revision/availability checks. It needs a narrow qualification of resource selection, membership, retained/foreign definitions, source disappearance and complete replacement of saved facts. It must not substitute a faster but weaker ownership check. If that cannot be done within existing canonical query boundaries, stop at that concrete limitation rather than reconstructing the repository architecture.

## 8. Production integration complexity and remaining limits

Integration is **moderate in scope, with correctness risk concentrated in availability/live overlay**, rather than a storage redesign. It needs a worker/job adapter, explicit coverage and result freshness, managed discovery/source eligibility and a resource-owned live contribution adapter. A new database, global catalog, generic plugin registry or persistence format is unnecessary.

Two current production details matter:

- [NativeVaultStore discovery](server/native-vault-store.mjs) itself invokes full `decodeNative` to obtain identity/title and then checks pair state. Simply replacing C2/C3 query code would leave this expensive discovery step. A later patch must reuse lightweight validated discovery facts there while preserving managed-path security, receipt/baseline, pending-relocation and duplicate-ID behavior. This prototype's read-only filesystem probe is not a replacement for that adapter.
- Production discovery currently has a 10,000-entry limit and recognizes `.mutable.json`, while this experiment scans up to 100,000 entries and also reads `.ink`. A 10,000-note fixture with companions exceeds the current production entry limit. Measured whole-vault capacity must not be presented as already-enabled product coverage. Any capacity-policy change requires explicit incomplete coverage, and `.ink`/`.ink.md` remains its separately approved compatibility stage.

Per-file validation does not establish cross-file ownership or automatic live admission. External same-ID moves still cannot silently rebind resources. Index hashes are observation evidence, not caller save baselines or native save generations. Unknown native values remain native authority even when some query facts are unsupported.

Disk-reader qualification also does not establish all opaque-widget semantics, foreign definition loading, arbitrary internal-Block navigation, live asynchronous chunk transfer, cold-drive startup, a dense/high-degree graph workload or large media-heavy documents. The historical full-text limit remains future work. None is silently resolved by this optimization.

## 9. Next architectural gate

For the measured research-note workload, **ephemeral rebuilding is sufficient to pursue**: roughly a fraction of a second at 100 notes and a few seconds at 1,000. At 10,000, use progressive, cancellable background work with honest partial coverage; approximately 22 seconds and 279 MiB retained heap are material limits, not an instant-start guarantee.

Recommend the following bounded next gate, subject to review:

1. Qualify a narrow live-canonical facts adapter using existing C2/C3 query boundaries, with identical facts and conservative freshness/disposal semantics, avoiding repository-wide capture on each refresh. This responds to the measured 782-ms capture cost; it does not change ownership or persistence.
2. With that result, propose worker-backed production adaptation of the ephemeral disk reader and managed discovery. Preserve the current provider contracts and require browser input/navigation, cancellation, source-availability and two-Window qualification before enabling broader coverage.

A saved-facts cache is **not the next recommendation**. It would not solve live capture latency. Reconsider one only if the product requires substantially faster repeated large-vault startup than the measured background rebuild, or cold-disk/real-vault measurements demonstrate a remaining startup problem. No cache technology is selected here.

Reproduce:

```sh
npx tsc --noEmit --project tsconfig.native-knowledge.json
npx vitest run src/qualification/native-knowledge/lightweight.test.ts
node scripts/benchmark-native-facts.mjs 100 1000 10000
node scripts/check-native-facts-scheduling.mjs
node scripts/check-native-facts-live.mjs
```

The prototype writes generated evidence only under `artifacts/native-facts` and temporary fixture directories. No native file migration, naming compatibility patch, database, persistent facts cache, production index, graph UI, Workspace change, legacy SurrealDB operation or general search rewrite was performed.

**Stop for architectural review.**
