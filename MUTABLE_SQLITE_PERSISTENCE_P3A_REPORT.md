# SQLite Persistence P3a — Host lifecycle and coverage

**Implementation and bounded qualification complete; review required before P3b.** Correctness checks pass. Large-Resource foreground waiting is a material integration concern, described below; this is not an unconditional performance pass. No P3b saved reader, P3c consumer replacement or P3d Entity authority transition was implemented.

## 1. Implemented boundary

`server/sqlite-knowledge-host.ts` owns one SQLite worker per opened physical vault, shared across bounded opaque leases. It uses the existing managed-store confinement and P2 reconciliation. Overlapping vault roots and incompatible extraction policies are rejected. Limits are eight vaults and 64 leases per host; inactive leases expire after ten minutes. A subsequent browser Refresh can acquire a new lease. Last release cancels that vault's active sweep and closes its worker. Shutdown drains foreground work and releases workers and locks.

The host queues/coalesces reconciliation at vault acquisition, explicit Refresh, and completion of coordinated native or legacy storage operations. It serializes sweeps across its managed root. Before foreground storage, it cancels queued/background work, waits for an active sweep to release its existing lock, then invokes the original operation. Filesystem locks, receipts, caller baselines, dependency validation and publication outcomes remain storage-owned. Failed foreground attempts also prompt authoritative reinspection; a notification never certifies a successful save. Index failure cannot convert successful file publication into a retry or replay.

Native save/recovery/relocation/directory routes and legacy Document/Workspace writers use this narrow coordinator. No deletion API, watcher, new persistence format, changed-Block hint or editor delta collector was added. Legacy SurrealDB save hooks remain unchanged.

The application vault lease acquires/releases a small HTTP lifecycle client. Opening two Flint Windows over the same physical vault shares the worker; closing one leaves the other lease valid. The lifecycle client has no editor, repository, admission, Facts or save capability. Failures leave index coverage unknown without preventing ordinary vault use. It does not poll or subscribe to typing.

`featureFlags.sqliteKnowledge` gates this new lifecycle composition and defaults on under the user's new-feature convention. Setting it false removes the browser/server composition without deleting databases or files. Existing `nativeKnowledge` and `nativeKnowledgeSaved` defaults and active providers are unchanged. Passing P3a does not enable SQLite query consumers.

## 2. Evidence and failure behavior

Coverage is ephemeral and tied to the host session, vault, epoch and exact P2 scope fence. Startup never infers complete coverage from pre-existing SQL rows. Successful reconciliation supplies its fence from inside the managed lock; a bounded worker status operation supplies incomplete-resource/issue counts and up to 32 issue details. The host publishes complete only when both sources support it. Status checks worker health and current filesystem fence; worker loss or changed evidence invalidates coverage.

Unknown candidates, ambiguous identities, malformed bytes, pending pairs/relocations and unresolved dependencies keep the accepted P2 conservative behavior. Unknown inspection never establishes absence. Positive authoritative absence is still required for derived deletion. Reference/ownership semantics, registration and external-resource boundaries are unchanged.

Read-only opening does not initialize a database, reconcile, repair or claim current complete coverage. Missing/corrupt/unavailable SQL remains unavailable. A dead worker is not silently recreated and its uncertain transaction is not replayed; close/reopen is the retry boundary. Native and legacy save success remains independent of SQL availability.

This is saved-substrate coverage only. Public C2/C3 query evidence and the composed live-over-saved result contract belong to the later gates. No consumer should interpret this host status as navigation authority.

## 3. Correctness and regression qualification

- SQLite Node gate: **64/64 passed**, covering P1/P2 foundation, constraints, worker failure, reconciliation, authoritative absence, external changes and six new lifecycle cases. The six host tests also passed after adding an explicit worker-death status assertion.
- Application/storage/native regression selection: **215 tests exercised across 17 files**. The concurrent invocation passed 214 and hit the existing five-second timeout in one native relocation test. The unchanged vault suite then passed **44/44** alone, including that test. No assertion failure remains.
- Three real Express/HTTP host tests cover two leases, native and legacy save publication, stale caller rejection, native reopen, partial pair interruption/recovery, missing owned dependency and read-only routes.
- Browser lifecycle tests cover shared application leases, late-open disposal and unavailable SQL. A real ReactiveEditor test covers text/style/Entity annotation, structural editing and Undo/Redo while the lifecycle is open, with **no additional SQLite requests from editing**.
- Existing live/saved Knowledge session and Flint saved-navigation tests, P2 full-versus-incremental projection tests, native B1 compatibility/owned-resource tests, Workspace manifest tests, and legacy/native storage suites were retained.
- Reactive/server typecheck, client/server builds and `git diff --check` pass. The client build retains its existing large-chunk warning.

These are automated Node, real HTTP and jsdom/editor checks. No new manual real-browser latency or multi-window visual qualification is claimed; P3a does not replace a UI query provider. Tests and benchmarks use disposable stores and do not migrate the user's vault.

Reproduce with `npm run test:sqlite`, the relevant Vitest files listed in the changed test sources and report evidence, `npm run typecheck`, and `npm run build:server`. The performance runners are `node scripts/qualify-sqlite-p3a.mjs` and `node --expose-gc scripts/qualify-sqlite-p3a-lifecycle.mjs`, after building SQLite.

## 4. Interactive Workload Performance Characterisation

Measured on Apple M1, 8 GiB RAM, Node 22.12.0, pinned better-sqlite3 12.4.1. Detailed phase timings and query plans are in [workloads.json](artifacts/sqlite-p3a/workloads.json). Measurements ran separately from test/typecheck workloads. First read means a new connection, **not** flushed filesystem caches. Warm query controls use 20 raw/worker samples and ten HTTP samples. Resource operations are individual diagnostic samples, not p95 guarantees or P6 qualification.

### Entity query feasibility

The disposable database uses the accepted schema: 10,000 Entities, 20,000 curated/imported aliases, 100 Resources, 25,000 Blocks and 25,000 standoff assertions, including a high-degree Entity, unresolved definitions and absent targets. Search outputs are bounded to 50 canonical Entity rows. The HTTP service is a qualification-only prototype, not a production Entity service or authority switch.

| Query | First connection SQL ms | Warm SQL p95 ms | Worker round trip p95 ms | HTTP round trip p95 ms |
|---|---:|---:|---:|---:|
| exact | 0.500 | 0.168 | 0.719 | 4.912 |
| prefix | 0.471 | 0.165 | 0.729 | 1.276 |
| lexical | 0.746 | 0.280 | 0.491 | 1.532 |
| substring | 17.249 | 18.915 | 17.657 | 94.217 |
| mention | 24.043 | 21.711 | 24.885 | 16.915 |
| guid 1 | 0.022 | 0.008 | 0.293 | 0.835 |
| guid 10 | 0.063 | 0.030 | 0.103 | 0.827 |
| guid 100 | 0.327 | 0.183 | 0.608 | 1.350 |
| guid 1000 | 2.188 | 3.106 | 3.231 | 9.036 |

Exact/prefix matching uses existing name/alias B-tree indexes. The prefix fixture exercises a normalized ASCII range; general Unicode normalization/range semantics still require P3d qualification. Lexical matching uses column-scoped name/alias FTS and is not arbitrary substring search. Arbitrary substring uses `instr` scans. Current costs are useful at this shape, but scale with scanned data; no trigram index/cache/schema amendment was made. A later P6 measurement should determine whether bounded substring support needs a dedicated structure.

The mention prototype unions canonical name/curated-imported alias matches with authored text from direct, nondeleted, authored-ID Entity-reference segments on standoff Blocks, then joins actual canonical Entity rows. Unresolved/foreign linked definitions remain excluded; a missing Entity target remains an assertion and does not create an Entity. Surviving mention text is not promoted to a curated alias. Live unsaved mentions are absent from this saved prototype and must be composed through the established live overlay before a production service can claim current results. Existing segment columns support this bounded experiment; it does not qualify arbitrary linked-definition provenance or final mention counts.

GUID lookup uses indexed `IN` with 1/10/100/1,000 identifiers. No batching crossover was demonstrated at these bounds. P3d should keep a request bound and missing-ID semantics; larger batching/temporary-table machinery is not justified by this experiment.

The JSON evidence separates worker SQL, serialization, transport/scheduling, payload decoding and HTTP round trip. These separately sampled percentiles are not additive. First connection/worker/HTTP timings are also retained; HTTP cold startup must not be reported as database execution.

### Saved single-Block and structural changes

Fixtures contain 100, 1,000 or 10,000 child Blocks plus the Document root. Most children are plain-text Blocks; one standoff Block supplies style and Entity-reference cases. They use actual native capture/encoding, the existing paired publication path and P2 indexing. Markdown work is measured separately because this is the already-qualified pair path; the user's new clarification defers default Markdown export for compatibility work and does not require creating new pairs.

| Child Blocks / change | Save total ms | Reconcile total ms | Stage decode / project ms | Prior SQL read / compare ms | SQL mutation + FTS ms | Changed / removed bundles |
|---|---:|---:|---:|---:|---:|---:|
| 100 / text | 104.1 | 97.5 | 13.5 / 3.5 | 13.6 / 9.2 | 0.42 | 1 / 0 |
| 100 / style | 82.4 | 87.5 | 12.9 / 3.0 | 13.2 / 4.9 | 0.40 | 1 / 0 |
| 100 / entity | 80.5 | 95.0 | 13.5 / 2.9 | 12.3 / 8.0 | 0.93 | 1 / 0 |
| 100 / add | 91.0 | 90.7 | 10.8 / 3.4 | 12.3 / 4.5 | 5.01 | 2 / 0 |
| 100 / delete | 86.3 | 100.0 | 11.0 / 2.7 | 12.2 / 8.6 | 4.48 | 1 / 1 |
| 100 / move | 90.9 | 92.4 | 9.9 / 3.1 | 12.4 / 4.3 | 4.42 | 1 / 0 |
| 1,000 / text | 359.6 | 604.0 | 103.7 / 25.5 | 122.6 / 81.8 | 0.48 | 1 / 0 |
| 1,000 / move | 336.4 | 592.6 | 95.6 / 15.9 | 133.8 / 65.3 | 40.32 | 1 / 0 |
| 10,000 / text | 2892.6 | 6734.6 | 962.0 / 212.6 | 1598.5 / 444.7 | 0.64 | 1 / 0 |
| 10,000 / move | 3102.8 | 6759.9 | 984.7 / 212.4 | 2233.2 / 494.8 | 523.23 | 1 / 0 |

Save totals include native encoding, existing Markdown projection and durable file publication; all three are separately recorded. Reconciliation includes discovery/inspection, repeated validation, staging, fences/read/hash work and SQL publication. Stage decode/validation and projection timings are separate from prior-SQL read and comparison. Mutation includes transactional FTS triggers: it cannot honestly be presented as a separately measured FTS duration without changing the operation. Commit is also recorded separately.

Text/style/Entity edits each replace one Block bundle. Style-only and Entity-only edits currently replace that bundle's text runs too, so FTS maintenance can occur even without a plain-text change. Adding one child replaces root plus new child; deleting it removes the child and replaces root. Moving one child changes the root placement/ordinal bundle only, preserving all child Block bundles. The move from ordinal 1 to 20 changes 20 ordered relationships semantically, but accepted bundle-level reconciliation rewrites the root's entire outgoing relation set. That is significant for a root with 10,000 children; it is not a rewrite of every child Block.

Ordinary text, style and structural operations stay live and issue no synchronous SQLite work. Saved reconciliation nevertheless remains whole-Resource in decode, projection, old-state loading and comparison. The small SQL mutation for a text change does not make the total saved operation Block-local. No delta extraction or alternate representation was introduced.

### Foreground wait and plan implication

| Child Blocks | Foreground wait during staging | Canceled sweep |
|---|---:|---:|
| 100 | 21.2 ms | 1 |
| 1,000 | 159.9 ms | 1 |
| 10,000 | 1422.0 ms | 1 |

These waits begin immediately after dispatching an actual worker staging operation. The coordinator cancels the sweep, waits for safe release, and then successfully publishes the foreground Save. This confirms priority and lock correctness but also exposes coarse cancellation latency. A request arriving during a longer SQL commit may wait longer; this is not a worst-case bound.

**Large-Resource automatic reconciliation needs review before P3b rollout.** Seconds of post-save indexing are background work, but residual lock wait is directly user-visible. The smallest next investigation should concern bounded staging/cancellation and the duration of the managed-store critical section, with unchanged byte/fence/uniqueness evidence and transaction guarantees. Root relation bundle churn and whole-Resource comparison are later P6 optimization candidates. Do not infer authorization for changed-Block hints, caches, schema changes or weakened validation from these findings. P3a stops here rather than redesigning P2 to manufacture a passing latency result.

No 100,000-Block control or full Typical/Large P6 dataset was run.

## 5. Workspace and owned-external Resources

The actual `speedy-workspace` schema-1 server manifest stores a workspace ID/root and Document descriptors keyed by stable Document ID, with optional title, `document-store` folder/filename location and optional content hash. Workspace root occurrences become `document-reference-block` descriptors carrying `documentId`; separately saved Document bodies go to their own files. The manifest validator rejects embedded Document bodies in that representation.

Normal Workspace Open does fetch the separately referenced files, validate identity/hash evidence and materialize shared canonical content. That runtime fetch is distinct from embedding bodies in the persisted Workspace. P2 Workspace indexing inspects the manifest/root descriptors and does not fetch or flatten referenced Documents.

Legacy local self-contained Workspace JSON is an existing separate format that can embed legacy Documents; it must not be described as an external-resource manifest. Native registered resources remain guarded against that legacy tree Save. No general native Workspace round-trip support is claimed or added.

Graph-2 owned-external edges retain semantic `owned` with an external target's resource/root identity and version evidence. The owned child remains its own serialization boundary and requires available authoritative dependency evidence for owner Save. Indexing stores the assertion without fetching/flattening the child. Existing manifest, native compatibility and owned-resource regressions pass. No new violation of the independent native-resource model was found; unsupported native Workspace saving continues to fail explicitly.

## 6. Lifetime and memory observation

[lifecycle.json](artifacts/sqlite-p3a/lifecycle.json) records ten small-fixture open/reconcile/release cycles, with two concurrent leases per cycle. Peak worker count was one, ten workers were opened in total, and active worker count returned to zero each cycle. Parent forced-GC heap rose from 7.02 MiB before initialization to 7.77 MiB after ten cycles. Whole-process RSS was 55.39 MiB initially, 64.02 MiB after the first close and 65.42 MiB after the tenth; open-worker RSS was approximately 75–76 MiB.

RSS includes worker/native allocations, while parent heap does not. This supports bounded worker disposal on a small fixture, not a retained-heap leak proof, large-vault memory guarantee or browser-session measurement. No per-occurrence index/worker multiplication was observed. Browser memory and realistic loaded-session behavior remain later consumer qualification concerns.

## 7. Content recognition and deferred export strategy

The requested investigation is recorded in [Vault Content Recognition Strategy](MUTABLE_VAULT_CONTENT_RECOGNITION_STRATEGY.md), and the P3 composition plan links it. There is **no suffix-based canonical identity invariant**. Current filters conflate candidate browsing, validated recognition and pair enrollment. Generic JSON must become visible to strict format recognition without minting identities, rewriting files or routing rich native state through a lossy legacy DTO.

Default Markdown export is now explicitly deferred: compatibility Open must work without a Markdown sidecar and must not generate one. `.ink.md` production support is not an Open prerequisite. Existing enrolled pairs retain their recovery/conflict evidence until an explicit qualified Save change is made.

This pass updates strategy, not compatibility Open behavior. Production `.ink` recognition and standalone `.canvas`/`.desktop`/`.world` handlers are not currently complete. Missing typed handlers must be explicit and must never feed those files through the generic Document decoder. The mixed-vault acceptance scenario is therefore still outstanding; the report does not claim that legacy JSON visibility/opening has been fixed by P3a.

Before P3b/P3c can claim broad saved-vault utility, complete that bounded content-recognition/admission prerequisite, retaining P2 positive evidence and deletion safeguards. SQLite is not allowed to adopt a persistence binding merely because bytes were recognized.

## 8. Review boundary

P3a establishes shared vault lifecycle, conservative coverage and storage coordination while retaining existing consumers. The meaningful remaining concern is foreground delay from coarse, whole-Resource indexing; this warrants a bounded scheduling/critical-section decision before consumer rollout. The content-first compatibility strategy and deferred default export also need to guide subsequent work. No automatic progression to P3b, no Entity backend switch and no persistence redesign has occurred.
