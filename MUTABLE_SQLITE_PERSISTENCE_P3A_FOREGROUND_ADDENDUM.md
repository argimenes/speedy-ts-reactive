# P3a foreground coordination qualification addendum

**The bounded correction is implemented and qualified. Stop for review before P3b.** Background decoding, projection, prior-SQL reading and comparison no longer hold the managed-store lock or prevent foreground persistence from starting. The 10,000-Block control reduced coordination wait during staging from the accepted baseline's approximately 1.4 seconds to below 0.1 ms. Whole-Resource reconciliation and the foreground native writer itself remain expensive; neither was redesigned.

## Protocol and preserved evidence

The host now distinguishes an active background operation from its active managed-store critical section. Foreground requests invalidate coverage, cancel background work and prevent new background critical sections. They wait only for a current critical section and preceding foreground requests, then invoke the unchanged storage operation. Background CPU work may finish or cancel afterward; it cannot publish using an expired attempt.

The indexer now performs:

1. Protected initial source-fence capture and bounded file reads, through existing confinement and locking.
2. Read-only discovery/inspection outside the lock. Existing worker discovery checks, global Resource/Block duplicate detection, unknown-candidate behavior and final scope validation remain in place.
3. Protected per-Resource source capture, followed by worker decode/projection and SQL preparation outside the managed lock.
4. Protected publication: recheck scope fence, file stamp/hash, native pair/location/pending evidence where applicable, and cancellation; commit transactionally only against the prepared SQL evidence; recheck file evidence after commit before accepting publication.
5. Protected positive-absence checks for deletion and protected final scope validation before clearing issues/claiming complete coverage.

SQL preparation uses a read transaction and the existing complete projection/diff algorithm. It retains one private, ephemeral worker-local plan. Publication uses `BEGIN IMMEDIATE` and rechecks the exact Resource baseline plus SQLite `data_version` and connection `total_changes()`. Those conservative counters invalidate preparation on external-connection and same-connection changes, including unrelated changes. They preserve the identity-collision proof made during preparation without rescanning/comparing the whole Resource inside the managed-store lock. There is no schema amendment, durable cache, ownership graph or new Resource representation.

Source tokens and SQL preparation are independent evidence: a valid SQL baseline does not authorize changed files. Conversely, unchanged bytes cannot authorize publication after a SQL change. Superseded tokens expire; failures do not replay uncertain transactions. Later reconciliation reads current authoritative bytes again.

An uncooperative filesystem writer is not excluded by an advisory managed lock. As in the accepted filesystem model, evidence is point-in-time and current eligibility requires revalidation. The added post-commit check detects a change during publication and marks the SQL row stale instead of publishing complete/current coverage. A test explicitly covers that case. Retained stale rows are not claims about current files; this does not claim atomicity between arbitrary external filesystem writes and SQLite.

## Cancellation

A small Node-worker shared cancellation word lets the host signal cancellation while the worker is busy. Checks run around existing codec calls, through projection and SQL comparison loops, during SQL row mutation and immediately before commit. Transaction cancellation rolls back Resource rows and FTS together. This does not change ordinary editor input or require a browser SharedArrayBuffer facility.

Existing synchronous codec/validation calls remain indivisible. Cancellation may therefore finish late, but that CPU work is outside the foreground-blocking lock. A prepared token rejected by file validation is explicitly discarded. No editor-supplied deltas, codec rewrite or general job framework was introduced.

## Contention measurements

Apple M1, 8 GiB RAM, Node 22.12.0, better-sqlite3 12.4.1. These are isolated single diagnostic samples using actual native encoding, the existing enrolled-pair writer and SQLite worker—not p95 or hard-deadline claims. Fixtures hold 100/1,000/10,000 child Blocks plus the root and change one text Block. Detailed evidence: [controls](artifacts/sqlite-p3a-foreground/controls.json), [earlier staging control](artifacts/sqlite-p3a-foreground/staging-control.json).

| Child Blocks | Wait during staging | Wait at publication dispatch | Total uncontented reconciliation |
|---|---:|---:|---:|
| 100 | <0.1 ms | 0.17 ms | 87 ms |
| 1,000 | <0.1 ms | 0.52 ms | 731 ms |
| 10,000 | <0.1 ms | 0.41 ms | 9050 ms |

The publication control requests foreground Save immediately after the guarded SQL commit request is dispatched. It proves cancellation/release at that boundary, not a worst-case arrival at every instruction. In both races, subsequent reconciliation published the latest saved text and database/FTS verification passed. The staged candidate canceled by the racing Save was never committed.

| Child Blocks | Decode/validation | Projection | Prior SQL read | Comparison |
|---|---:|---:|---:|---:|
| 100 | 9 ms | 2 ms | 13 ms | 7 ms |
| 1,000 | 126 ms | 27 ms | 191 ms | 45 ms |
| 10,000 | 963 ms | 576 ms | 2318 ms | 728 ms |

All four preparation columns run outside the managed-store critical section. Total reconciliation still includes native discovery/inspection and repeated read/hash/fence work, so it exceeds the sum of those columns. SQL mutation plus FTS for the text change was approximately 0.4/0.6/0.7 ms in the final control.

The longest uncontented managed critical sections in that run were approximately 7.1/16.5/80.6 ms. The earlier isolated control observed a 217 ms publication section at 10,000 Blocks; its worker SQL transaction itself took about 12 ms. File validation, worker round trips, scheduling and runtime pauses still contribute to held time. These results support removing the size-dependent CPU wait, not a universal sub-50-ms guarantee for every filesystem/transaction phase.

Observed cancellation-to-stage-settled time was approximately 15/76/2,639 ms. This includes delivery back to the host, which can itself be busy with foreground native validation. It is deliberately reported separately from foreground coordination wait. Explicit prepared-token discard in the publication race took approximately 0.13/0.07/0.14 ms. During the staging race, cancellation stopped preparation before a token was returned, so no prepared token needed discarding.

The foreground writer's own publication time was about 102/347/5,000 ms in these controls. That existing native validation/publication work is distinct from waiting for the background sweep. This follow-up neither qualifies it as fast nor expands into optimizing native Save or P6. Physical I/O, large SQL mutations/rollback and runtime pauses can still delay an in-flight protected section; the correction removes the requirement to finish background decode/project/compare first.

## Qualification and implementation scope

- **76/76 SQLite Node tests pass**, including twelve new contention/evidence cases and the updated existing foreground lifecycle assertion.
- Races cover foreground Save, relocation, interrupted-pair recovery, external file changes, duplicate Resource/Block identity, worker failure during staging and guarded publication, and lost acknowledgement after a committed transaction. Restart begins with unknown coverage and revalidates.
- External SQL writes expire prepared comparison even when the requested Resource row is unchanged. Existing same-connection stale-baseline and superseded-token checks remain green.
- An added final-checkpoint cancellation test verifies rollback of both Resource data and FTS, rejection of the consumed proof, and successful reconciliation with newly prepared evidence.
- The existing 215-test application/native/Workspace/Knowledge selection passed 214 in the concurrent run; one real-route recovery test hit its five-second timeout. The focused rerun passed **13/13**, including that test and the added transactional-cancellation test. No assertion failure remains. Existing no-SQL-on-editing, full-versus-incremental, native identity/owned-resource and navigation checks are retained.
- Reactive/server typecheck, server build and diff whitespace checks pass. This server/worker correction adds no browser UI; no new manual browser-latency claim is made.

Production changes are confined to the saved indexer/host, SQLite worker/client/foundation/reconciliation and cancellation hooks in the saved projector. The existing `sqliteKnowledge` rollback switch and active C2/C3 providers are unchanged. Tests and controls use disposable stores.

Reproduce with `npm run test:sqlite`, the P3a Vitest selection, and `node scripts/qualify-sqlite-p3a-foreground.mjs` after building the server. No database or authored format migration is needed.

## Recognition and persistence direction

The critical-section change does not alter Browse → Recognize → Admit → Save capability → Index. The [content-recognition strategy](MUTABLE_VAULT_CONTENT_RECOGNITION_STRATEGY.md) now explicitly records safe in-place saving for recognized historical formats, independent `.ink` authority for Open/Save/indexing, deferred regenerable `.ink.md`, preservation of existing enrolled-pair protections, and SQLite as the persistent database destination with P3d separately gated.

Compatibility Open, production `.ink` Save, Markdown generation and standalone typed handlers are not implemented by this correction. No new filename requirement or sidecar dependency was introduced. No P3b or Entity-backend transition has begun.
