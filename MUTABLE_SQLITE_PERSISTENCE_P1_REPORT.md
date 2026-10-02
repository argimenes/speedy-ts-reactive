# SQLite Persistence P1 — Build and migrations

**2 October 2026. P1 implemented and qualified; stopped for review before P2.**

The physical SQLite foundation passes its bounded gate on the project's local Node runtime. It creates independent vault-local `mutable.db` and `audit.db` databases, verifies and migrates their schemas transactionally, runs SQLite work in a dedicated worker, and supports inspection, FTS verification/rebuild and database-only backup/restore. No production Entity, search, backlinks, save, discovery or History consumer has been replaced. No user vault was initialized or migrated during qualification.

Two runtime compatibility problems were found and corrected: the initially tried driver crashed on this Node version, and the existing file-lock addon proved unsafe across worker isolates. Neither required a change to the approved authority or storage model.

## 1. Components and runtime

| Component | Responsibility |
|---|---|
| [Migrations](src/knowledge-sqlite/migrations/) | Independent version-1 current/audit schemas, based on the approved P0 DDL. |
| [schema.mjs](src/knowledge-sqlite/schema.mjs) | Transactional migration, checksums, identity/version/schema inspection, integrity/FK/FTS verification and derived-row invalidation. |
| [foundation.mjs](src/knowledge-sqlite/foundation.mjs) | Explicit vault open, database lifecycle, degraded audit availability, WAL-aware snapshot and guarded restore. Internal synchronous implementation; normal callers use the worker client. |
| [paths.mjs](src/knowledge-sqlite/paths.mjs) | Directory/file checks and host-owned OS writer lease. |
| [client.mjs](src/knowledge-sqlite/client.mjs), [worker.mjs](src/knowledge-sqlite/worker.mjs) | One serial worker queue per opened vault, typed operations, timeout/termination and explicit lifecycle. No SQL transport. |
| [CLI](scripts/sqlite-foundation.mjs) | Explicit initialization, inspection, verification, FTS rebuild, derived invalidation, backup/restore and guarded disposable-test reset. |
| [Build](scripts/build-sqlite-foundation.mjs) | Copies runtime modules and SQL into `dist/server/knowledge-sqlite`; native dependencies remain external. Included in `build:server`, without application startup integration. |

Qualified environment: **Node 22.12.0, macOS 15.5 / Darwin 24.5.0, Apple M1 arm64, 8 GiB RAM; pinned `better-sqlite3` 12.4.1, SQLite 3.50.4**. `fs-ext` 2.1.1 is the existing OS-lock capability and is required for writable access; inability to obtain that capability fails closed. Other OS/runtime combinations are not qualified by this report.

Each explicitly initialized vault contains `.mutable/mutable.db`, `.mutable/audit.db`, `writer.lock` and SQLite-managed sidecars. These runtime directories are ignored by Git. There is no global catalog, database service or implicit cwd-selected vault. Both DBs carry the same UUID vault identity, distinct application IDs/database kinds, `user_version`, schema version, migration SHA-256 and `codex-authored-value-v1` declaration.

Effective writable configuration: **foreign keys ON, WAL, synchronous FULL (2), busy timeout 1,000 ms**. Read-only opens reject initialization, restore, derived invalidation and FTS rebuild. Read-only verification reports FTS content verification as `not-checked-read-only`; writable verification checks all three FTS indexes against their external-content tables. Inspection includes effective PRAGMAs, schema and base-table counts.

## 2. Semantic and migration results

The approved schema retains opaque legacy identities; identical Entity names do not merge identities. Relationship endpoints must be existing Entities. Source-owned Block, relation and annotation rows use the approved foreign keys/composite source constraints. Target Block/Resource/Entity assertions and foreign annotation definitions may remain unresolved. Removing a target resource does not erase another resource's incoming assertion. Linked segments retain logical/provenance identity; SQL ranges are half-open. Known saved Entity references prevent Entity deletion, without claiming that partial coverage proves deletion safe.

The only semantic refinement to the P0 proposal is **alias uniqueness by `(entityGuid, aliasKey, origin)`**, rather than `(entityGuid, aliasKey)`. An observed alias and an independently curated/imported alias can therefore coexist. Removing rebuildable observations preserves the canonical alias. P3 lookup must deduplicate matching Entity targets while retaining alias provenance.

The user's clarifications are carried into the plan:

- Selected EntityReference text supplies the initial/default Entity name; no redundant name-entry requirement. Implementing that SQLite-backed workflow remains P3.
- Observed/recovered aliases supported by surviving authoritative reference text are rebuildable. Curated/imported aliases absent from files require backup. Entity preferred names and enrichment remain database-authoritative during normal operation.

JSON columns preserve tagged authored-value bytes; SQL `json_valid` is deliberately not a replacement for the existing authored-value codec. P1 tests storage of its tags. P2 adapters must validate/encode actual authored values with that codec; P1 has not implemented a second value grammar.

Fresh/repeated migration, a simulated successful version-2 migration and a deliberately failing migration were qualified. Failure rolls back schema, data and migration metadata together. Unsupported/newer versions, version disagreement, wrong application/database/vault identity, changed migration checksums, missing indexes and added schema objects are rejected. Existing corrupt current databases are never replaced with empty ones. Schema structure verification includes tables, indexes, triggers and FTS structures; a future driver/SQLite upgrade must pass this check against existing databases before its pin changes.

FTS5 covers Entity names/descriptions, aliases and separate Block text runs. Tests establish insert/update/delete, transaction rollback, external-content integrity and rebuild parity. A phrase cannot bridge separate inline-object text runs. Representative name/alias, bidirectional Relationship, reverse-reference and range queries select indexes. This is physical query support, not a replacement of C2 literal/Unicode semantics or a P6 latency claim.

## 3. Worker, failure and backup behavior

The host owns the OS writer lease; it is released **after worker exit**, including timeout, termination and startup failure. The worker owns SQLite connections and serializes operations. A maximum of 32 outstanding client requests prevents unbounded queuing. Concurrent writable opens of the same vault fail explicitly; read-only inspection can coexist. Independent vault workers retain separate identities and leases. No occurrence or editor lifecycle owns this worker.

Timeout/termination rejects pending requests. Operations are not automatically replayed: the error states that an in-flight mutation outcome may be unknown, and the caller must reopen/inspect before retrying. A terminated worker releases its lease and can be recreated. A conflicting external SQL transaction produces a bounded busy failure; derived/canonical rows remain intact and an explicit later retry succeeds. Process death during an open transaction was tested with SIGKILL; committed Entity/alias state and integrity survived reopening.

Missing, corrupt, foreign-vault or unsupported-version audit databases report `available: false` with a reason while current knowledge remains readable. `verify().ok` describes current-database integrity; audit has its own result. This does not claim complete history or implement audit delivery/gap handling. An orphan audit beside a missing current DB cannot authorize creating empty canonical knowledge. Corrupt current state stops opening. Symlink database directories/files/sidecars/lock files and multiply linked DB files are rejected by the foundation checks.

Backup uses the driver's SQLite backup API, including committed state present in a live WAL. It writes to a new destination, verifies snapshot schema/identity/integrity, hashes each closed snapshot and publishes a manifest only after successful completion. The manifest explicitly says **database-only** and **not atomic across databases**. Audit absence is recorded; it does not prevent backing up current knowledge. An interrupted backup without its final manifest is not an accepted snapshot.

Restore accepts an intact snapshot only into an **empty destination**. It checks hashes on private copies, database identity/schema/integrity and publishes without replacing existing files. Canonical names, IDs, aliases, Relationships, Actors, pending audit data and available audit records round-trip. It marks restored Resource projections **stale** because the snapshot contains no authoritative Document files. Source vault files are untouched. Missing audit remains missing rather than acquiring invented history. A corrupted snapshot is rejected before database publication.

## 4. Qualification evidence

| Gate | Result |
|---|---|
| `npm run test:sqlite` | **41/41 passed**: migrations, constraints, FTS/index plans, alias authority, audit isolation, worker queue/recreation/timeout, reader/writer exclusion, separate vaults, process death/rollback, busy failure/retry, read-only modes, symlink/hardlink rejection, backup/restore and guarded CLI reset. |
| Existing Entity transport/UI, native save/session/relocation and History value-codec regressions | **42/42 passed in 5 suites**. |
| `npm run typecheck` | Passed. |
| `npm run build` | Passed; existing client chunk-size warning remains. Foundation runtime and SQL included in server output. Final foundation-only edits were recopied and exercised by the built-artifact gate below. |
| Built client + worker + packaged SQL | **5/5 initialize → inspect → verify → backup → restore cycles passed**, using `scripts/qualify-sqlite-p1.mjs`. |
| `git diff --check` | Passed. |

The regression command was:

```sh
npm test -- server/entity-search.test.ts \
  src/features/entity-references/search-view.test.tsx \
  src/persistence/native-session.test.ts \
  src/persistence/native-vault-session.test.ts \
  src/history/preplan-spike/preplan.test.ts
```

[Recorded runtime/build evidence](docs/qualification/sqlite/p1-runtime.json) contains versions, hardware, effective PRAGMAs, snapshot sizes and all five timing samples. On empty schemas, fresh worker initialization measured **51.5–56.7 ms**, inspection including transport **1.9–2.5 ms**, verification **1.0–1.1 ms**, two-DB backup **14.9–16.8 ms**, and worker restore/open **49.4–57.9 ms**. Empty snapshots were **335,872 bytes current + 45,056 bytes audit**. These small physical checks are **not** mature-vault startup, query-throughput, power-loss durability or P6 performance results. Required Typical/Large qualification and optional cheap Stress characterization remain unchanged.

## 5. Compatibility findings and remaining boundaries

1. **Driver pin:** `better-sqlite3` 13.0.3's arm64 native module crashed during registration on Node 22.12.0, including a standalone in-memory probe without workers or locks. The tested 12.4.1 pin avoids that failure. The exact upstream cause was not established; no Node upgrade or driver-internal patch was attempted.
2. **Lock placement:** repeated worker loading of `fs-ext` 2.1.1 produced a native V8 handle failure. Host-owned locking avoids loading that addon in worker isolates and preserves exclusion through worker disposal. SQLite remains off the host thread. This is a runtime accommodation, not a new persistence coordinator.
3. **P2 is still required:** there is no file scan/index/reconciliation adapter. `clear-derived` is expressly invalidation, reports `repopulated: false`, preserves canonical knowledge and does not pretend to rebuild from files. `rebuild-fts` rebuilds only from existing SQL base rows. Nested/overlapping production vault admission must use existing scope leases when composition is introduced; this standalone CLI is not a new vault-discovery or scope service.
4. **P4 is still required:** pending audit tables exist, but bounded delivery, acknowledgements, retention and explicit audit gaps are not implemented. Current/audit initialization and restore do not claim cross-file atomicity. Explicit `init` may initialize a missing audit DB; that does not recover lost history.
5. **Failure scope:** this gate tests transaction rollback, process death, restart and snapshot rejection. Full disk/power-loss/checkpoint fault injection, crash points during first DB publication/restore, non-local filesystems and other operating systems remain unqualified. Initialization can leave temporary files after process death; it does not automatically delete or adopt them. Directory/file checks do not promise protection against an adversarial OS writer racing every check. These limits do not weaken the existing managed native-pair storage guarantees, which are unchanged.
6. **No product rollout:** existing SurrealDB routes, native Facts providers, History and file persistence remain in place. The future application switch stays default-on under the standing instruction when composition is introduced, but P1 introduces no running application consumer. Rollback now means not invoking this isolated foundation; no migration of user knowledge needs reversing.

There is **no unresolved architectural conflict requiring a P0 redesign**. P1's physical foundation is ready for review, with these later-stage limits explicit.

## 6. Reproducing the foundation gate

```sh
npm run test:sqlite
npm run build:server
node scripts/qualify-sqlite-p1.mjs
npm run sqlite -- init-test
```

`init-test` returns an automatically created disposable vault path. Use that path with `inspect`, `verify`, or `reset-test` via `--vault /absolute/path`. `reset-test` accepts only its marked temporary directories and refuses additional user files or an active writer. `init --vault /absolute/existing/vault` is explicit creation/migration, never invoked automatically during application startup in P1.

Backup: `npm run sqlite -- backup --vault /absolute/vault --destination /absolute/new-snapshot-directory`. Restore: `npm run sqlite -- restore --vault /absolute/empty-destination --source /absolute/snapshot-directory`. Read-only inspection is the default for `inspect`; other read operations accept `--read-only`.

**Stopped at the P1 qualification gate. P2 has not begun.**
