# Native whole-vault knowledge index — architectural/prototype report

Investigation following the accepted C3 and [post-C3 review](MUTABLE_POST_C3_ARCHITECTURAL_FEASIBILITY_REVIEW.md). Prepared 1 October 2026. This is an isolated qualification prototype, not an application feature or a replacement for C2/C3.

## Recommendation

Keep ordinary TypeScript maps and adjacency lists for metadata, native relationships, Entity mentions and bounded traversal. The measured relationship workload does not justify a graph database. The expensive part is reading native Documents through the current full-fidelity decoder, which reconstructs and validates Cell/resource state; map construction is a small part of startup.

A disposable cache is worth a separately approved experiment for larger vaults. A database has not yet earned its additional integration and packaging cost. Before choosing its storage technology, qualify a cheaper read-only extraction route using the existing native codec's semantics, and measure warm-cache validation against the vault. Keep expensive work off the editor thread. Rebuilding everything through today's decoder is a correctness reference, not an acceptable default synchronous vault-open experience.

Adopt **`.ink` + `.ink.md` as the recommended naming convention for new rich Document pairs**, retaining legacy `.mutable.json` + `.md` pairs in place. Compound naming solves the collision with an independent Markdown import source. Pair evidence must still establish identity and publication status. This recommendation is not implemented here.

## What was built and what remains unchanged

The [isolated prototype](src/qualification/native-knowledge/) contains native extraction, derived maps, a read-only directory probe, a live canonical overlay demonstration, fixtures and benchmarks. Its [runner](scripts/benchmark-native-knowledge.mjs) creates temporary vaults and deletes them afterwards. Committed samples are generated qualification artifacts, not migrated user files: [native `.ink` sample](artifacts/native-knowledge/sample.ink) and [legacy-suffix sample](artifacts/native-knowledge/sample.mutable.json).

There are no production imports of this prototype. C2/C3 services, UI, native Save/Open, Workspace persistence, ownership, History, resource registration and filesystem relocation remain unchanged. No database dependency was introduced and no existing SurrealDB data was opened, indexed or modified. No editor occurrences are created by disk extraction. The headless projection in one test exists solely to exercise the ordinary typing command; it is not an extraction mechanism.

The read-only prototype accepts both native suffixes using the existing JSON decoder. That demonstrates extension-independent encoding, not production `.ink` support. Its collision probe deliberately retains the earlier **shared `stem.md` rule** to expose that rule's ambiguity; it does not implement the later compound-extension proposal. No generated-projection filename has been migrated or rewritten.

## 1. Derived data model

A per-resource `Facts` contribution contains:

| Fact | Meaning |
| --- | --- |
| `id` | Canonical native resource ID from the validated envelope |
| `rootBlockId` | Separate authored root Block ID; never assumed equal to the resource ID |
| `location` | Observed vault-relative physical path, not persistence binding authority |
| `generation` | SHA-256 of observed bytes, or a session/revision token for live extraction; not a native save generation |
| `title`, `tags` | Native root metadata; tags are a bounded semantic string-list, not folders |
| `blocks` | Canonically owned Block identities/types and supported native text runs |
| `annotations` | Typed segment facts: source Block, logical identity, native Cell interval, decoded value and definition provenance |
| `mentions` | Typed Document-reference or Entity-reference logical mentions, their ranges, snippets and segment identities |
| `diagnostics` | Unsupported, omitted or truncated facts; absence of a result need not mean complete coverage |

The index keeps saved contributions separately from effective contributions. Maps/Sets provide resource lookup, tags, root-ID resolution, outgoing Document mentions, inverse references keyed by target root, Entity mentions and their source Documents. Replacing one resource removes its previous contributions before inserting new ones. Reverse edges are derived; no authored reverse relationship is invented.

`codex/entity-reference` and `codex/block-reference` remain distinct. An Entity identifier is opaque: finding mentions does not prove that the Entity record exists or convert it into a Document ID. A Document reference resolves using its canonical resource ID and root Block ID when both are supplied. Legacy root-only references require exactly one candidate. Ambiguity never chooses a winner.

All Block-reference facts retain their typed target data, but the demonstrated navigation/reference subset is **Document-root targets**, matching C2/C3. Internal-Block targets are not silently promoted into Document relationships. They remain unresolved in the traversal/query demonstration. Ownership edges, directory containment, transient occurrences and Entity annotations are not Document backlinks.

Logical mention keys are deterministic tuples of resource ID and linked annotation identity, or resource ID/Block ID/local annotation ID. Multiple local segments of one Document-owned linked definition count once, retaining ordered ranges and provenance. Independent mentions remain independent, even when they target the same resource. Duplicate/conflicting segment identities are omitted with diagnostics.

The maps are internal mutable prototype structures, not a proposed public API or an identity registry. Any production provider should preserve the existing narrow search/backlinks contracts rather than exposing these implementation details to Flint.

## 2. Extraction semantics and fidelity limits

The reference pipeline is:

```
read native bytes and record file evidence
  → decodeNative (qualified envelope/value/graph checks)
  → detached resource snapshot
  → resourceToRepository (plain detached state, no repository admission)
  → canonical owned traversal and native Cell extraction
  → replace one derived contribution
```

`decodeNative` already validates reserved wire fields/versions, native tagged values, graph-2 boundaries, root identity, ownership and retained-definition membership. It also recaptures detached state to check preservation. Reusing it avoids a second, permissive interpretation of native files. It is also the dominant measured cost.

Extraction walks owned children and owned relations once, including margin content, without following reference occurrences or external resource bodies. Owned-external resources keep their own serialization boundaries. A separately discovered child may contribute its own facts; that neither establishes nor transfers ownership. Missing dependency/owner evidence is not repaired by the index. Per-file validation also does not certify that every file can be admitted together into one repository: cross-resource ownership consistency and global Block-ID admission collisions remain existing admission responsibilities. Query facts do not override those guards.

Existing linked-definition helpers resolve provenance. Foreign/unresolved definitions are diagnosed rather than borrowed from an arbitrary nearby file. Deleted and client-only annotations do not become facts. Unknown valid annotation types and decoded values can remain typed facts without inventing query semantics for them. Unknown authored feature bags remain in the native resource; the index is deliberately a projection, not a full-fidelity backup or a route for re-saving a Document.

Text comes from native standoff Cells using `canonicalSearchSource`, never Markdown or rendered DOM. The prototype keeps UTF-16-to-Cell boundary maps, so surrogate pairs and combining text retain their native coordinate meaning. Inline objects split searchable runs and appear as markers in mention snippets; text on opposite sides of an image is not concatenated into a false match. Annotation intervals are half-open Cell intervals in the index, converted from current inclusive authored ranges.

The synthetic fixture includes linked annotations, native reference metadata, margins, Unicode and tagged unknown values. A separate actual B1.2 rich-native fixture exercises inline-image boundaries and a `3d-object-block`; native bytes before and after extraction are equal.

**Limits requiring explicit treatment before production:**

- This extractor's searchable text profile covers standoff content. It does not promise every plain-text/opaque application Block's text, embedded widget contents, visual text, or foreign definition resolution. It is not yet a complete C2 provider.
- Retained but unplaced definition content is not an additional visible text occurrence. A later extraction profile must explicitly define whether any of its independent knowledge facts belong in queries.
- Generic owned traversal is not a qualification of recursively hosted applications. Existing C2/C3 opaque-host rules must be preserved by a production adapter; the prototype is not permission to generalize hosting.
- Discovery has entry/depth limits; extraction has traversal, annotation and per-Block text limits. Truncation/unsupported facts must make coverage incomplete. Native decode itself is synchronous and is not preemptible by an abort signal.
- The read-only file probe checks confinement, symlink components, no-follow open, regular-file/size limits and before/after file evidence. It is **not** the production managed-store adapter or a new adversarial filesystem guarantee: directory-component replacement races need that adapter's protections. There are no filesystem mutations to user vaults here.
- A file can change after a successful read. An observed hash does not grant overwrite, binding or navigation authority. Actions still need current identity/location/revision revalidation.
- The probe does not read pair receipts or relocation journals to establish production availability. It can extract observed native facts while a Markdown counterpart is pending, but cannot certify a complete pair or an actionable binding. A production provider must retain C2/C3 eligibility/conflict guards and separately consult existing operational evidence; neither a filename nor a cache hit may bypass them.

## 3. Live canonical overlay

A loaded canonical resource supersedes disk even when it appears clean. Its contribution replaces, rather than joins, the saved contribution before relationship aggregation or result limits. Multiple visible occurrences must share that one resource contribution.

The proof subscribes to repository change notifications. It uses the existing inline-owner hint or changed content keys to invalidate an affected resource, immediately suppresses its old facts, and coalesces deferred capture/extraction. While extraction is pending, conservative invalidation prevents newly introduced content or another revision from leaving a stale completion usable. Unaffected saved contributions stay in place.

Deferred capture uses `captureNative`, not a tab/Window/projection. Completion checks a request token and monotonic repository revision; Undo branches cannot resurrect old offsets. Errors, disappearance and ambiguous identity leave the contribution suppressed and expose an error. Disposing the demonstration does **not** automatically reveal old disk facts. Hand-back requires explicit verification that disk is current and no loaded canonical authority remains.

The ordinary typing test observes zero repository snapshots and zero synchronous native captures from this subscription. A general metadata edit already takes a repository snapshot without the overlay; the proof does not attribute that existing work to indexing. This is evidence about the **invalidation callback**, not a claim that later capture is free. Full native capture/extraction can still block for a noticeable interval; a production design needs scheduled/worker execution and bounded work, not merely a timeout wrapping expensive synchronous code.

The live demonstration has one canonical Document in its repository. `captureNative` also examines repository-wide identity/ownership state, so affected-resource invalidation does not establish that capture cost is independent of the size of a shared repository. That scalability question remains a qualification requirement.

No unsaved data is written to a persistent cache. A future cache stores saved-file contributions only; a live overlay remains session-local. Cache eviction, panel disposal or tab closure cannot confer permission to overwrite native resources or change ownership.

Compatibility with C2/C3 requires a provider adapter to retain explicit scope, cancellation, coverage and provider-owned freshness checks. Disk-derived whole-vault results would additionally need an approved **explicit result activation** path for opening one selected resource and verifying the passage. This prototype does not change today's loaded-only C2/C3 coverage or automatically load unseen Documents.

## 4. Benchmark method and measurements

Reproduce from the repository root:

```sh
npx tsc --noEmit --project tsconfig.native-knowledge.json
npx vitest run src/qualification/native-knowledge/index.test.ts
node scripts/benchmark-native-knowledge.mjs 100 1000 10000
```

Each size runs in a fresh Node process. Fixtures are generated using the qualified native encoder, written into nested temporary directories, and then read sequentially. Twenty percent have `.ink` names and the rest `.mutable.json`; all use the same qualified native encoding. Their Markdown companions contain deliberately different text and are never used as authority. Fixture creation is excluded from rebuild timing.

Per Document: seven Blocks, four 306-Cell paragraphs plus a margin paragraph (1,245 characters total), 17 annotation segments, four Document-reference mentions and three Entity mentions, including a two-segment linked Entity mention. References form a cyclic graph with next/skip targets; tags span 20 topics and Entities span 50 IDs. This is a synthetic research-note workload, not an empty-JSON test, but it is **not** a distribution of large real manuscripts, dense adversarial graphs, large media or all application types.

The machine is an Apple M1, eight logical CPUs, 8 GiB RAM, macOS arm64, Node 22.12.0. Files have just been generated and are normally in the OS cache: these are **fresh-index rebuilds, not cold-disk measurements**. No tests or other benchmark runs were deliberately run concurrently. Low-cost source inspection/report writing continued; this is a local development-machine measurement, not a controlled hardware lab.

Explicit GC brackets retained-heap measurements. RSS includes the Node runtime, allocator and temporary decoder work; it is not index-only memory. Sampled peak heap can miss intra-decode peaks. Retained facts include full text and numeric boundary arrays, so a metadata-only index would be smaller, but that unimplemented variant is not credited with a measured saving.

| Measurement | 100 Documents | 1,000 Documents | 10,000 Documents |
| --- | ---: | ---: | ---: |
| Discovery (ms) | 5.166 | 30.357 | 266.493 |
| Read + hash (s) | 0.087 | 1.484 | 28.057 |
| Native decode (s) | 7.432 | 80.138 | 1,070.243 |
| Facts extraction (s) | 0.737 | 8.271 | 90.501 |
| Map insertion (ms) | 1.808 | 21.289 | 345.494 |
| Total rebuild (s) | 8.270 | 89.980 | 1,189.739 |
| Native file bytes (MiB) | 0.91 | 9.15 | 92.05 |
| Retained heap delta (MiB) | 6.17 | 62.70 | 628.56 |
| Sampled peak heap (MiB) | 79.83 | 337.67 | 1,314.67 |
| Retained process RSS (MiB) | 180.44 | 305.91 | 1,150.73 |
| Process peak RSS (MiB) | 187.25 | 372.34 | 1,218.45 |
| One-resource replace median / p95 (ms) | 87.146 / 101.454 | 83.477 / 87.145 | 93.164 / 124.412 |

The 10,000-Document rebuild took **19 minutes 50 seconds**, including **17 minutes 50 seconds in native decode** (about 90%). Map insertion took 0.35 seconds. Retained heap increased by 629 MiB for 70,000 Blocks, 170,000 annotation segments, 70,000 logical mentions (40,000 Document references and 30,000 Entity mentions), and 12.45 million text characters. Counts scale exactly by ten between the datasets; every native file was indexed without a discovery/extraction diagnostic.

| Query median / p95 (ms) | 100 Documents | 1,000 Documents | 10,000 Documents |
| --- | ---: | ---: | ---: |
| Incoming Document mentions | 0.001 / 0.001 | 0.001 / 0.001 | 0.001 / 0.001 |
| Entity mentions | 0.000 / 0.000 | 0.000 / 0.000 | 0.001 / 0.002 |
| Entity source Documents | 0.001 / 0.001 | 0.002 / 0.002 | 0.023 / 0.025 |
| Tag sources | 0.000 / 0.000 | 0.000 / 0.000 | 0.001 / 0.001 |
| Three-hop traversal | 0.008 / 0.008 | 0.009 / 0.009 | 0.008 / 0.009 |
| Per-Document bold/italics intersection | 0.003 / 0.004 | 0.003 / 0.004 | 0.003 / 0.004 |

The separate dense full-text query returned 1,200 matches in **71.5 ms** at 100 Documents and 12,000 in **672.6 ms** at 1,000. At 10,000, it **rejected after 2,956.2 ms** on the existing 50,000-candidate limit; that is not a completed whole-vault result. This identifies a separate search-budget/candidate-selection issue, not a failure of relationship lookup.

Raw measurements: [100](artifacts/native-knowledge/benchmark-100.json), [1,000](artifacts/native-knowledge/benchmark-1000.json), [10,000](artifacts/native-knowledge/benchmark-10000.json); [progress/completion log](artifacts/native-knowledge/benchmark-final.log).

The graph has repeated next/skip targets rather than a high-degree hub distribution. Bounded traversal and these lookup costs do not qualify arbitrary dense graphs or unbounded result materialization.

Lookups have 100 warmups and 1,000 measured samples in one process, not 1,000 independent vault builds. One-resource reread/hash/decode/extract/replace has five samples. Rebuild has one final run at each size; do not infer statistical confidence or precise scaling laws. Values rounded to 0.000 ms mean below the reporting precision, not zero cost. Raw files include counts, environment, examples and stage timing.

Full-text scanning is measured separately using the existing exact native matcher. Its `1,000` argument is a **per-source** result limit; it also enforces its existing 50,000-candidate memory guard. The dense 10,000-Document query hit that guard; a rejection is reported rather than weakening it. Fast graph lookups are not evidence of fast full-vault text search, and a broad query failure is not evidence that a graph database is needed.

## 5. Demonstrated queries

The generated resource `resource-0` has root Block `resource-0-root`; these intentionally differ. The [raw benchmark artifacts](artifacts/native-knowledge/) contain concrete results for:

```ts
index.effective.get('resource-0');             // native title, location, typed facts
index.tags.get('topic-0');                    // canonical resource IDs
index.outgoing.get('resource-0');             // four authored Document mentions
index.backlinks('resource-0');                // four incoming logical mentions
index.entityMentions('entity-0');             // three mentions per source Document
index.entitySources('entity-0');              // deduplicated canonical sources
index.traverse('resource-0', 3, 250, 1000);    // bounded hops/nodes/examined edges
```

At 10,000 Documents, topic 0 contains 500 sources, Entity 0 has 600 logical mentions across 200 Documents, and `resource-0` has four incoming mentions. Three-hop traversal over the ring/skip fixture reaches ten resources and examines 24 mention edges. Visited-resource tracking prevents cycles from causing recursive expansion. Unresolved targets consume the edge budget too; the result includes unresolved count, truncation and index revision.

A range-query example intersects `style/bold` and `style/italics` within the same Block, yielding `[3, 8)` for each of four paragraphs. This is a small per-Document interval filter, not an interval-index benchmark or a promise about arbitrary overlap queries across an entire vault.

## 6. `.ink` and compound projection recommendation

Use the native media/artifact distinction without changing the envelope:

| Physical name | Proposed interpretation |
| --- | --- |
| `poe-raven.ink` | Canonical rich Mutable Document; initially existing native JSON encoding |
| `poe-raven.ink.md` | Candidate generated Markdown counterpart of that native artifact |
| `poe-raven.md` | Independent Markdown source unless existing legacy pair evidence says otherwise |
| `poe-raven.mutable.json` + `poe-raven.md` | Existing legacy pair, retained under its existing evidence and naming rule |

Check complete suffixes: `.ink.md` must not be classified as `.ink`; `.mutable.json` must be recognized as a compound legacy suffix. Decode and validate native identity after discovery. Do not guess format from contents of arbitrary files or infer resource ID from path, title or extension.

### First import/save and collisions

For an independent `poe-raven.md`, explicit import creates a new native candidate with a new canonical identity. First paired publication may create `poe-raven.ink` and `poe-raven.ink.md`, leaving the original bytes untouched. Merely opening/discovering the vault does not import it. Re-import is not identity deduplication by filename.

Require both destination names to be vacant or covered by the caller's existing pair baseline/evidence. An unrelated `.ink.md` is not safe to overwrite because its name looks generated. Existing `.ink`, an existing projection, a normalized/case-equivalent name, a directory at either path, duplicate native identity or conflicting receipts must stop publication and offer a different stem or explicit conflict handling. Preserve confinement, symlink, read-only, external-write and no-replace protections.

A `.ink.md` suffix is a useful **candidate classification**, not proof of provenance. Discovery should group a verified counterpart beneath its native resource; a candidate with absent, inconsistent, changed or pending evidence needs visible unresolved/changed status. Do not hide or silently import it as an unrelated note. Explicit independent import remains a deliberate user operation when provenance cannot be established.

Legacy pair evidence takes precedence over the apparent ordinary `.md` shape: a verified `poe-raven.md` belonging to `poe-raven.mutable.json` is a projection, not a fresh source to import automatically. Pending/changed legacy evidence also must not be mistaken for a free source merely because it is no longer in the fully paired state.

Coexisting `Poe.ink` and `Poe.mutable.json` with distinct IDs can claim `Poe.ink.md` and `Poe.md` respectively without a filename collision. If they contain the same canonical ID, compound naming does not resolve the identity conflict; omit ambiguous results and require explicit resolution. There is no newest-file winner.

### Rename, relocation and recovery

Rename a new pair from `poe-raven.ink`/`poe-raven.ink.md` to `raven.ink`/`raven.ink.md`. Leave an independent `poe-raven.md` alone. Directory relocation moves actual descendants under the accepted durable relocation protocol, including pair evidence/history as already qualified. Neither operation changes authored title, native resource ID, references or save generation. There is no automatic vault-wide Markdown link rewrite.

The minimum additive production work is concentrated in existing paths:

| Existing surface | Necessary later change |
| --- | --- |
| [Native routes](server/native-document-store.mjs), [session](src/persistence/native-session.ts) and Flint file prompts | Accept/select `.ink` for new native destinations while retaining `.mutable.json` bindings; keep explicit standalone Markdown import |
| [Vault discovery/relocation](server/native-vault-store.mjs) | Share suffix-aware pair-name logic, discover both native types, distinguish projection candidates/verified pairs, preserve conflict and ambiguous-ID states |
| [ManagedPair](src/persistence/managed-pair.mjs) | Add `.ink` to native-location validation and supply `.ink.md`; retain caller baselines, hashes, pending states and dependency checks |
| Receipt and relocation recovery | Validate the exact recorded names and historical intent; preserve old-name recovery and all captured generations |
| Tests/UI labels | Qualify mixed new/legacy pairs, unchanged import sources, destination collisions, stale clients, external changes and restart at publication/relocation boundaries |

Current receipts already record both actual filenames, resource ID, generation and hashes. Compound naming does not by itself require a new native envelope, global catalog or speculative receipt fields. Existing strict readers, suffix guards and path derivations do need coordinated additive compatibility work. New recovery code must replay legacy intents under the legacy rule; it must never reinterpret an old `Poe.md` receipt as `Poe.ink.md`. Pending work should finish under its recorded names before any separately approved conversion. Renaming a bound legacy pair into the new convention would be an explicit compatibility operation, not an incidental filename edit or a bulk migration in this task.

### Markdown-tool interoperability

Obsidian officially accepts `.md` files. It is reasonable to expect `poe-raven.ink.md` to open as Markdown, since the final suffix remains `.md`; this is an inference from its documented format support, **not a manual Obsidian qualification performed here**. The visible basename may be `poe-raven.ink`, which usefully distinguishes it from the independent source. `.ink` itself is not a documented built-in Markdown type. [Obsidian accepted formats](https://obsidian.md/help/file-formats).

For a later path-aware exporter, explicit URL-encoded targets such as `[The Raven](poe-raven.ink.md)` are preferable to relying on another tool's shortest-name lookup. Obsidian documents both Markdown links and wikilinks with explicit extensions. This is compatibility guidance, not a change to the bounded current Markdown exporter. Obsidian’s automatic link-update feature does not know Mutable's pair receipts or canonical identities. Renaming/editing just the projection in another tool must be treated as an external change, never as authorization to move or replace the native resource. [Obsidian internal links](https://obsidian.md/help/links).

The source and projection may both appear in a third-party vault, and that tool may index both texts. This is an expected tradeoff, not a reason to erase the original or claim bidirectional synchronization. Flint should display which is canonical, generated or an import source. A newer `.ink.md` never becomes native authority; external edits trigger existing conflict behavior.

The same **append a projection suffix to the full canonical artifact name** convention is a sensible future default when another real artifact/exporter exists. Do not create a universal projection registry, `.space` persistence, or additional media types solely to generalize the naming pattern now.

## 7. Rebuild, cache or database

| Strategy | Benefit demonstrated or plausible | Cost/limit | Judgment |
| --- | --- | --- | --- |
| Rebuild maps on open | Simple, fully disposable, no cache migration; measured queries are cheap | Current decode dominates even with warm files; full text/boundary arrays consume memory | Keep as reference/fallback, not a blocking large-vault startup default |
| Saved-file facts cache + maps | Can skip unchanged native decode; one-resource replacement already works | Reconciliation, stale/partial entries, extractor versioning and memory remain; warm-cache speed not measured here | Best next persistence experiment if cheaper extraction still warrants it |
| Local database-derived index | Potential incremental storage and selective text/range queries without materializing all text | Same native decode/freshness obligations plus database packaging/schema/overlay work | Not justified merely by inverse edges/traversal; assess against a measured cache baseline |

A cache must record path, file size/mtime, content hash, canonical ID and extractor/schema profile. Path and stat are hints, not identity or definitive freshness: same-size writes and restored mtimes are possible. Reconcile current discovery, hash bytes before trusting an unchanged contribution where strict freshness is required, decode changed/uncertain files, discard deleted/duplicate/invalid contributions, and rebuild on corrupt or incompatible cache data. Root Block ID and facts must agree with the decoded resource. Persisted fact values would need a declared encoding as well: reuse qualified authored-value handling for values retained in the index, or explicitly omit unsupported query facts with diagnostics. Plain JSON serialization must not silently turn tagged native values into different query facts. Atomically replacing one derived cache entry may be useful, but it must not claim a whole-vault snapshot transaction.

Changed path with the same ID can be reported by the derived view; it must **not** silently rebind an already enrolled live resource. Publication receipts/relocation journals remain operational authority and are not cache files to discard. The proposed `.mutable/` cache namespace would need an explicit reservation decision because it is not already reserved by production discovery; do not quietly repurpose an existing user directory. The prototype excludes it only as an investigation convention.

On startup, expose partial coverage while validating/rebuilding. On corruption/crash, throw away only this derived cache, not native artifacts, pair evidence or legacy Entity records. A cache entry is never an authorization baseline for saving. No watchers, synchronization or stale-write reconciliation are implied.

### Technology comparison against this workload

| Concern | Plain TypeScript maps | SQLite, optional FTS | Embedded SurrealDB | Persistent SurrealDB |
| --- | --- | --- | --- | --- |
| IDs/tags/inverse refs/Entities | Direct maps and source sets; measured | Straightforward indexed tables | Typed records/relations possible | Same, with durable derived records |
| Bounded graph traversal | Small BFS already demonstrated | Materialize bounded adjacency or query edges | Query-language traversal; no measured need here | Persistence adds no demonstrated traversal advantage |
| Range/annotation queries | Per-resource interval filtering; richer interval index only if needed | Block/type/range columns, selective queries | Records/query predicates; native Cell semantics still application-defined | Same freshness/range obligations |
| Text search | Existing matcher preserves native coordinates but broad scans are costly/bounded | FTS can preselect candidates; must revalidate native matching/ranges | Search facilities require schema/tokenizer decisions | Saved search index still needs unsaved overlay and reconciliation |
| Startup/incremental cost | Native decode plus fact insertion; affected-resource replacement | Persisted saved facts may avoid decode; not benchmarked | `mem://` still rebuilds facts and adds engine startup | May reuse disk facts; still must reconcile native files |
| Memory | Measured retained text/boundary arrays plus maps | Selective reads may reduce application heap; engine/cache cost unmeasured | Engine/native heap additional and unmeasured | Cache/engine memory and transport if separate process |
| Deployment | Current TS/Node tooling only | Choose/package an adapter and required FTS build | Native addon or browser WASM variant; version/platform qualification | Embedded durable path or separate service/process operations |
| Staleness/crash/schema | Drop and rebuild; live overlay suppresses saved source | Derived schema/version migrations; invalid cache rebuild | Same semantic overlay, engine lifecycle | Same plus durable reconciliation/rebuild and potentially service lifecycle |

SQLite FTS5 offers token and trigram indexing, but its default tokenizer and matching are not identical to C2's Unicode/substring/native Cell behavior. It can be a candidate filter, not a drop-in semantic replacement. A database implementation would still need native range mapping, live-source suppression before limits, and final identity/revision validation. No SQLite latency or memory advantage was measured here. [SQLite FTS5](https://sqlite.org/fts5.html).

Current SurrealDB documentation describes Node embedded engines with in-memory and persistent options, and a browser WASM engine with different deployment characteristics. The repository's installed beta Node package also documents `mem://` and `surrealkv://`, but uses an older API. Existing dependency presence is not a qualification of a new index or the current SDK examples. Nonpersistent Surreal would still pay rebuild cost; persistence would still need native reconciliation. Neither has a demonstrated advantage over maps for this workload. [SurrealDB embedded engines](https://surrealdb.com/docs/reference/javascript/concepts/embedded-engines).

**Decision:** neither SQLite nor SurrealDB should be adopted on this evidence alone. A disposable saved-facts cache is justified for investigation by startup cost, not by graph complexity. SQLite becomes a stronger candidate if selective full-text access or memory pressure remains after profiling; persistent SurrealDB needs a concrete advantage over that smaller alternative. Existing legacy SurrealDB remains untouched and is not presumed wholly disposable.

## 8. Qualification and next gate

The final focused run passed **86 tests in six files**, covering the 13 prototype tests plus native resource/compatibility/owned-resource gates and C2/C3 regression coverage. [Results](artifacts/native-knowledge/test-results.json), [log](artifacts/native-knowledge/tests.log), [typecheck](artifacts/native-knowledge/typecheck.log). This is proportionate prototype qualification; the full production browser, relocation/restart and all-stage suite was not rerun because there is no production integration.

Prototype cases include distinct resource/root identity, tag and inverse-reference maps, Entity separation, linked mention deduplication, unknown/deleted/client-only annotations, tagged native values, external-resource/foreign-definition boundaries, Unicode/inline objects, mixed extensions, no Markdown authority, duplicate identity and old-rule projection collision rejection, symlink/invalid path rejection, corrupt files/cancellation, incremental replacement, stale overlay completion, disappearance, Undo/Redo, disposal suppression and snapshot-free typing invalidation.

Initial test corrections concerned the actual rich fixture's `3d-object-block` spelling, the repository's existing metadata-edit snapshot, and monotonic runtime revision changes after Undo. Authored native bytes, not runtime revision counters, are the preservation comparison. No native editor behavior was changed to make these tests pass.

The smallest recommended next step is a separately approved **read-only extraction/cache qualification**, not product-wide rollout:

1. Profile and factor a detached facts-reading path from existing native validation/value/graph code. Differentially compare its facts, errors, unknown-value handling and ownership/provenance checks against this decoder-based reference. Do not add a permissive second parser or change the native wire format for speed.
2. Repeat the same datasets; measure scheduling responsiveness as well as elapsed time. If startup is still material, prototype a disposable per-resource saved-facts cache, with hash-based reconciliation, duplicate detection, cold/warm/mixed-change/crash tests and explicit incomplete coverage. Benchmark actual warm reuse before choosing a database.
3. Separately approve the bounded `.ink`/`.ink.md` compatibility patch through existing discovery, pair publication and relocation paths. Its gate should include unchanged import sources, both naming conventions, conflicts, stale baselines and restart/recovery. No migration by default.

Only after those gates should a production provider be proposed behind the existing C2/C3 semantic services, including explicit unseen-result activation and live resource overlay ownership. Do not expand this into graph UI, nested hosting, new Workspace persistence, general synchronization or legacy SurrealDB cleanup.

**Stop for architectural review.**
