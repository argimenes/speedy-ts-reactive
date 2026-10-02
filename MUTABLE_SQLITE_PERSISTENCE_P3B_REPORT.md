# SQLite P3b — SQL saved Facts and bounded query services

**Implemented and qualified; stop for review before P3c.** The SQL adapter reproduces eligible native Facts, search matches and backlinks using the existing saved SQL projection. Verified HTTP read scopes and a browser adapter are available, but Flint still selects its accepted providers. No Entity authoring or P3d transition was implemented.

## 1. Scope and authority

This implements P3b in §11 of `MUTABLE_SQLITE_PERSISTENCE_P3_APPLICATION_COMPOSITION_PLAN.md`, following acceptance of the P3a foreground correction. No new architectural conflict was found.

Files remain authoritative for Blocks, properties, placements, annotation definitions and segments. SQL serves reconciled saved knowledge only. Resource identity, binding, admission, ownership, live-over-saved selection and C2/C3 activation/revalidation retain their existing owners. The read layer cannot save, enroll, relocate, admit or mutate a Document.

The accepted **Browse → Recognize → Admit → Save capability → Index** direction is unchanged. This adapter exposes the existing eligible native-Document scope; it does not make indexed legacy/History/Workspace records navigable automatically. Coverage names that native scope and distinguishes its eligible count from the host's overall saved-resource count. Compatibility Open, standalone `.ink` Save and optional `.ink.md` generation remain separate work. Existing enrolled-pair protection is reused; no new sidecar or filename requirement was added.

## 2. Production components

| Component | Change |
|---|---|
| `src/knowledge-sqlite/saved-facts.ts` | Bounded, read-only SQL snapshot and Facts assembly from existing tables. |
| `src/knowledge/facts-annotations.ts` | Extracted the existing annotation eligibility, identity, logical grouping and diagnostic rules; the native collector and SQL adapter share them. |
| `src/knowledge-sqlite/query-services.ts` | Revision-checked Facts, native Entity-mention and canonical Relationship reads with explicit provenance and bounds. |
| `client.mjs`, `worker-entry.mjs`, `foundation.mjs` | Typed internal worker operations; reuse cancellation, queue and lifecycle controls. No SQL text or database handle crosses the worker transport. |
| `server/sqlite-saved-scope.ts` | Verified scope, batch, current-evidence, mentions, relationships and release routes under `/api/sqlite/knowledge/facts/`. |
| `server/native-saved-scope.mjs` | Optional read callback; preserves the existing file reader by default and reuses its discovery, uniqueness, pair, confinement, byte/hash, scope and release checks. |
| `server/sqlite-knowledge-host.ts`, `sqlite-saved-indexer.ts`, `reconcile.mjs` | Read proofs bind the current host session/epoch to the precise SQL revision returned at completed reconciliation. |
| `src/application/sqlite-saved-facts-client.ts` | Implements the existing `VerifiedSaved` interface, with SQL coverage/proof checks, independent lease disposal and buffered-read freshness verification. |
| `src/application/saved-facts-client.ts` | Small protected transport/freshness seams and optional SQL-read timing; the original endpoint remains the default. |

There is no schema migration, persistence DTO, repository reconstruction, hidden editor, new ownership graph, persistent Facts cache or query-selection change. `nativeKnowledgeSaved` and existing application composition retain their previous settings.

### SQL-to-Facts semantics

The reader starts at the Resource root and follows local owned child/named-relation edges, in the same order as the native collector. It observes each eligible Block once. Reference and external-resource bodies are not expanded, and unplaced retained definitions do not become visible authored traversal. Opaque/application descendants remain excluded under the same exact extraction policy.

Text comes from `BlockTextRun`; Cell/UTF-16 coordinates, Unicode boundaries and image gaps are preserved. Temporary snippet strings are assembled from runs, without creating Cells. Authored annotation order comes from the retained Block payload; segment/definition tables supply provenance and definition values. SQL-generated row IDs never become semantic annotation or mention IDs. Rich/unknown values use the existing authored-value grammar and Facts transport.

`indexStatus='incomplete'` does not automatically discard useful Facts: an eligible Resource can contribute the same incomplete Facts and diagnostics as the native reader. Missing/foreign definitions remain unresolved. Invalid native input is still rejected by existing admission/indexing rules; the adapter does not invent semantics for it.

### Read-only services

- Entity mentions are native EntityReference assertions, grouped by the same logical annotation identity as Facts. A missing canonical Entity record does not erase an authored assertion or create an Entity. The worker's per-resource query supports bounded pagination; the server's bounded resource batch reuses verified Facts and reports truncation/diagnostics.
- Relationship queries read existing canonical SQLite Relationship rows, in either direction, with stable GUID continuation, revisions and authored-value transport. They explicitly describe canonical database records. Native references are not inferred Relationships, and empty Relationship results say nothing about unresolved native references or other databases.
- No canonical Entity/alias/Relationship writes, automatic recovery or legacy SurrealDB fallback were introduced.

## 3. Freshness, cancellation and boundedness

A usable read requires both managed-store evidence and a current host/SQL proof. The latter contains the server session, host epoch, extraction policy and SQL revision (`data_version` plus connection `total_changes`). Reconciliation returns its revision at completion; a later read cannot silently adopt arbitrary current SQL rows as a new baseline.

The worker copies one bounded snapshot inside a deferred read transaction, releases the transaction, then assembles Facts. Revision checks before and after assembly reject intervening SQL writes. The host verifies current file-scope and SQL evidence before and after a worker result. Native scope verification also checks exact resource identity, location, source hashes/stamps and the final scope fence.

The browser checks the scope again before consuming a buffered candidate and verifies identity/hash/location/policy against the requested discovery row. These are observed freshness checks, not instantaneous filesystem monitoring. P3c must continue existing activation-time verification; no navigation authority is granted by this adapter.

Failure, cancellation, unavailable worker, incomplete discovery, changed files, pending operations, expired lease or stale SQL proof yields explicit error/unknown coverage. It never supplies absence or deletion evidence. A read-only host without freshly established saved evidence remains unavailable; P3b does not silently initialize, reconcile or select a fallback in that mode.

Bounds include:

- existing eight scopes, ten-minute scope lifetime, 32 Resources per batch;
- existing 32 pending worker requests and saved input limits;
- 10,000 traversal visits and 10,000 annotations, matching the native Facts collector;
- 2,000,000 text units per Block;
- 2 MiB Facts/query output, existing 3 MiB aggregate saved-wire batch and 4 MiB browser response cap;
- 100 results per mention/Relationship page, bounded offsets/continuation and request IDs;
- 64 MiB accounted snapshot payload and 100,000 structural edges per visited Block as explicit safety rejection bounds.

The snapshot payload bound is not a claim that total JavaScript heap is limited to 64 MiB. Objects, decoded values and temporary strings add overhead. Cancellation reuses the worker's shared cancellation word; canceling a reader does not cancel another Window's reconciliation or retry a write.

P3a's lock/foreground architecture is unchanged. Its only publication extension is returning the SQL revision for subsequent read proofs. No decoding or query assembly was moved into the managed-store critical section.

## 4. Qualification

| Gate | Result |
|---|---|
| Exact native/SQL Facts | Passed against lightweight saved extraction and full native decode/collection, normalized through the production transport. |
| Search and backlinks | Exact matcher results and `FactsIndex.backlinks` results agree for differential fixtures. Existing Flint loaded/saved navigation suites pass. |
| Rich annotation semantics | Linked/local/foreign definitions, deleted/client-only properties, duplicate segment identities, rich unknown values, Entity/Document separation and ordered annotations pass. |
| Structural/text semantics | Unicode, combining characters, inline-image placeholders, empty text, plain/text Blocks, opaque/application hosts, retained definitions, reference cycles, owned-external Documents and actual rich saved fixture pass. |
| Admission boundaries | Missing ownership evidence and an invalid same-resource external definition are rejected by the existing codec/indexer, not made eligible by SQL. |
| Bounds | Oversized UTF-8 output rejected without SQL mutation; 10,000-visit truncation matches the native oracle and reports incompleteness; invalid request/page bounds rejected. |
| Freshness and failures | External file/SQL writes, Save, relocation, pending pair, worker death, released lease, policy mismatch, incomplete discovery and restart invalidate old scopes. |
| Cancellation | Real canceled worker read rejects; SQL revision is unchanged and another reader remains usable. |
| Independent lifetimes | Two scopes/clients share the vault worker; releasing one preserves the other. Reads do not rewrite native files. |
| Browser | Production browser client → real HTTP route → dedicated SQLite worker passed in isolated Chrome. External modification invalidated a buffered second result. |
| Regression | **235 Vitest tests in 18 files; 76 SQLite Node tests.** Type checking and client/server build pass. |

The Vitest selection includes the P2 producer/reconciliation tests, P3a host/input lifecycle tests, Flint occurrence/search/saved-navigation suites, production live/session tests and the native Knowledge qualification differentials. New P3b tests comprise nine SQL semantic tests, eleven HTTP/worker tests and four client lifecycle tests.

One high-concurrency regression run failed a saved-backlink navigation wait. Its isolated rerun and the complete selection at two workers passed without changing the test or product navigation. Final qualification uses that bounded-concurrency run. An initial broad Vitest command also picked up Node-runner `.mjs` files; those are excluded from the final Vitest command and run separately with their intended runner. Neither diagnostic is omitted from this record.

Final coverage-label adjustment was additionally checked with typecheck, all eleven real HTTP tests and the browser harness. Build warnings remain the existing large-client-chunk, Markdown mixed-import and baseline-browser-mapping notices.

### Browser observation, not a scale claim

Recorded hardware: Apple M1/arm64, Node 22.12.0, Chrome 154.0.8037.95. Two tiny native Documents, two explicitly constructed clients, warmed/reconciled host; no mounted editors. Final two-client initial read took approximately **130 ms** end to end. The first client's two-resource batch recorded approximately **2.0 ms SQL snapshot work**, **0.8 ms Facts assembly**, **4.0 ms total worker operation time**, **1.3 ms source read/hash** and **14 ms scope discovery**. Transport includes server verification/queue time and is not additive to worker time.

Sampled peaks during that small read were approximately **8.4 MiB worker heap** and **44.8 MiB server heap**. These are observations, not retained-memory deltas or large-vault bounds. Queue timing is not independently measured on this adapter. Native validation timing is zero because this read assembles Facts from already reconciled SQL; current managed discovery/source verification is still performed and reported separately.

This is a correctness/browser smoke control, not P6 Typical/Large qualification, a startup benchmark or a universal latency guarantee. The accepted approximately **5-second foreground native Save for the 10,000-Block control** remains recorded for later scoped investigation. It was not optimized or reclassified as a P3b blocker.

## 5. Evidence and reproduction

Evidence is in `artifacts/sqlite-p3b/`: final regression/Node/HTTP/typecheck/build logs and `browser.json`. Run:

```sh
npm run build
npm run typecheck
npm run test:sqlite
npx vitest run src/knowledge src/knowledge-sqlite src/application/flint-knowledge.test.tsx src/application/flint-saved-knowledge.test.tsx src/application/flint-lifecycle.test.tsx src/application/flint-transient-proof.test.ts src/application/sqlite-index-lifecycle.test.ts src/application/sqlite-saved-facts-client.test.ts server/sqlite-knowledge-host.test.ts server/sqlite-saved-scope.test.ts src/qualification/native-knowledge --exclude '**/*.test.mjs' --maxWorkers 2 --minWorkers 1
node scripts/qualify-sqlite-p3b-browser.mjs
```

The browser harness uses temporary files, an ephemeral server/Vite port and an isolated Chrome profile; it cleans them up and does not touch the user's vault. `CHROME_BIN` can override its local Chrome path.

## 6. Review boundary

P3b's adapter gate is complete. Flint has not switched to SQL saved Facts. P3c remains responsible for provider selection, coverage UI, fallback choice and the integrated live-over-saved/navigation gate. P3d remains responsible for the separately reviewed canonical Entity-service transition and writes. Read-only hosts without current evidence deliberately expose unavailability until those composition choices are made.

No further persistence hardening, format migration, native Save optimization or broader infrastructure work is included. Stop here for review.
