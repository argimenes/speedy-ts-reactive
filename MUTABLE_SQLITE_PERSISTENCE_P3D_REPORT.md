# SQLite P3d — Canonical Entity service and Link Entity Reference

P3d implements the accepted independent Entity-commit policy and the revised Link Entity Reference (LER) interaction. The resolver uses a verified source Document's Flint vault, canonical SQLite Entities and explicit aliases, and eligible native live/saved mention evidence. Native prose and annotations remain file/repository-owned.

**Qualification status:** the targeted Entity/service/lifecycle gate passes; the SQLite and native compatibility suites pass; the actual LER/HTTP/worker browser route and existing C2/C3 browser gates pass. The broader regression selection has **552 passes and one failure reproduced on the unchanged accepted baseline**. That exception is described below, rather than presented as a clean regression run. Stop here for review; no P4/P6, compatibility Open or new Save-format work is included.

## 1. Product behavior

| Concern | Implemented behavior |
|---|---|
| Target versus query | The original range is retained in transient interaction state and decorated in the Document. LER displays `Target` separately from `Search`. Changing query, stream, match or scope does not change prose, target ranges or History. |
| Link | Default selection links the existing mention to the chosen canonical Entity GUID. `he` can resolve through `leonardo` to `Leonardo da Vinci`; `Firenze` can resolve to `Florence`. No alias is inferred. |
| Replace & Link | Explicit secondary action for one suitable plain-text Block. Existing replacement/range-remapping rules and annotation creation share one native transaction and Undo entry. The resulting range receives focus/selection. |
| Resolution | Independent All/Name/Alias/Mention, Partial/Exact and Current Document/Vault controls. Name means the current canonical name; Alias means curated/imported aliases; Mention means native EntityReference surface text. |
| Provenance | Candidates retain evidence kind/text; mention evidence additionally retains resource ID, logical mention ID and Block/range coordinates. Locally evidenced candidates rank first. All can offer existing local Entities when the query has no direct matches. |
| Creation | Explicit Create Entity exposes an editable canonical-name field, initially derived from query/selection. New Entity and mutation GUIDs are supplied once and retained for retry. Canonical names are not unique keys. |
| Partial outcome | Creation can be unconfirmed, or confirmed but not linked. Confirmed GUIDs remain in interaction memory. Bind to new selection rechecks the original vault and canonical Entity, validates a fresh native range/revision, and leaves that new selection active. It does not replay the stale command. |
| Aliases/name | Details / aliases provides preferred-name editing and explicit alias add/update/remove, using optimistic revisions. These are canonical database mutations, not native annotation edits. |
| Additional occurrences | Find other occurrences uses the existing candidate-review flow: nominate, review/check/exclude, then Bind. Matching text alone never causes annotations. |
| Range adjustment | Transient start/end character and word controls use grapheme-safe boundaries in one plain-text Block. No bracket/delimiter Cells. Existing cross-Block linked annotation creation remains available. |
| Keyboard | Scoped arrows, Enter, Escape, paging, numbered choices outside text fields, and Alt+S/M/V controls. Existing candidate bindings remain configurable; ordinary characters, native Tab and composition are not treated as Entity commands. |
| Document listing | Local Document counts remain live. Canonical names and qualified vault counts come through the semantic service. Incomplete coverage produces unknown counts (`—`), not zero. Native edits invalidate cached vault counts without querying SQLite on each keystroke; Refresh summaries is explicit. |

Creation is independently committed. Cancelling before dispatch creates nothing. Cancelling after dispatch cannot promise rollback; closing the panel prevents a late annotation. Undo/Redo changes native EntityReferences, never the Entity record. A transport failure is conservatively unconfirmed, even if the transaction actually committed. Retry uses the same identity/attempt. Dismissing recovery does not delete canonical knowledge.

## 2. Implementation and authority

| Component | Responsibility |
|---|---|
| `src/feature-api/entities.ts` | Semantic candidate, Entity, evidence, coverage, creation and alias capabilities. No SQL rows, worker handles or arbitrary editor/DOM access. |
| `src/application/entity-service.ts` | Invoking-occurrence context, verified source binding, bounded canonical resolution, native mention composition and service lifetime. Window contexts are disposable runtime registrations, not storage enrollment or a catalog. |
| `document-application-capabilities.tsx` | Registers each Flint Window's existing vault/Facts context and visible occurrences. Another Window's focus cannot choose this resolver's vault. |
| `server/sqlite-knowledge-host.ts` | Reuses managed-store discovery/fences and existing worker leases. The source must have one matching native identity, location and byte hash in a complete, nonambiguous scope with no pending relocation operation. Reads cannot adopt an external move. |
| `src/knowledge-sqlite/entities.mjs` | Canonical Entity lookup/create/rename, explicit alias CRUD, and explicit Relationship create/update/directional reads. Endpoint identities and optimistic revisions are validated. Mutations and their audit-outbox receipts commit together. |
| Existing worker/client/foundation | Bounded dispatch, read-only checks, locking, shutdown, restart and backup/restore. Existing driver pin, schema and storage ownership remain unchanged. |
| Entity feature views/listing | Orchestrate semantic capabilities and native annotation commands. They no longer fetch global SurrealDB Entity lookup/create/summary endpoints. |
| `annotation-capabilities.ts`, `block-tree/commands.ts` | Minimal native support for one replacement-plus-annotation transaction, current recovery selection, and validated focus restoration. Core commands contain no Entity-specific branch. |

The source Document's canonical ID, binding and selected vault are distinct evidence. No Entity database is selected from the last-focused Window, a filename-derived identity or an implicit global default. Unbound/ambiguous Documents fail explicitly; their existing references remain authored data. This stage does not generalize vault context into every Desktop/Canvas/Spatial host or implement compatibility admission of legacy files.

The managed store still owns confinement, discovery, binding, relocation and persistence semantics. Canonical Entity requests validate observed source evidence before dispatch. They do not create a transaction spanning filesystem state, SQLite and unsaved native annotations. Checks establish observed freshness, not a filesystem watcher or instantaneous cross-client synchronization.

Name/alias authority is SQLite. `entityName` in native annotation metadata remains a display snapshot. Mention resolution obtains Entity GUIDs from eligible Facts and resolves those GUIDs against the current canonical vault. Missing legacy identities remain unresolved; neither mention strings nor matching names fabricate or merge Entities.

Mention queries and summary counts reuse the accepted Facts composition and asynchronous currentness checks. Live unsaved assertions supersede saved assertions, including without mounted tabs. Unopened resources contribute only when the existing saved provider is explicitly enabled and eligible. P3d does not change `nativeKnowledgeSaved:false`. Worker/index failures, unresolved definitions, missing identities, traversal limits and stale evidence stay incomplete/unavailable, never authoritative absence.

Canonical writes invalidate saved SQL proof state through the existing host coordination; they do not mark unrelated saved state current. C2/C3 navigation and revalidation remain unchanged. No source file is rewritten by lookup, canonical-name/alias editing or Relationship mutation.

## 3. Canonical writes, aliases and recovery

New canonical operations use supplied UUIDs; lookup preserves existing opaque legacy IDs. Equal canonical names may belong to distinct Entities. Entity/alias/Relationship updates require the expected row revision. Relationships require existing endpoints and an explicit operation; adjacent references, mention binding and panel closure never create one.

Curated/imported aliases are canonical database knowledge. Mention text is file-derived/live evidence and is not inserted into the Alias table. Surviving files can recover authored references and their surface text; exact current names, enrichment, explicit aliases and Relationships require database backup. Clearing/rebuilding the derived projection preserves these canonical records.

The existing `PendingAuditMutation` holds the mutation request/result as the durable retry receipt. An exact repeated attempt returns its prior committed result; a changed request under the same operation ID is rejected. Pending delivery is bounded at **10,000 records / 16 MiB of UTF-8 payload**. A full outbox rejects new mutations without discarding events. The size check and canonical mutation are in the same transaction. Delivery/retirement belongs to the later audit stage; this is not a claim of end-to-end audit delivery.

Explicit bounds also include 100 returned candidates, 500 resolved mention identities, 2,000 examined mention assertions, 50 retained evidence entries per candidate, 100 summary identities, 20,000 summary assertions, 200 explicit aliases per newly mutated Entity, 32 KiB requests and a 1 MiB browser response budget. Truncation is reported as incomplete; transport-budget failure is unavailable, not an empty answer. Directional Relationship reads are bounded and report completeness. These are bounded P3d controls, not P6 performance qualification.

The independent, default-on `sqliteEntities` flag disables this capability without restoring legacy writes. Server composition can keep the canonical Entity service available independently of saved-query rollback. `npm run dev` now builds the SQLite worker payload as well as the existing server workers, so the new worker module is included on a fresh development launch. Existing read-only configuration is preserved.

The global legacy Entity router is no longer mounted. Other historical SurrealDB server facilities remain outside this pass; no claim is made that all legacy server database use has been removed. The P3d browser host runs without SurrealDB.

## 4. Qualification

| Gate | Result |
|---|---|
| Targeted Entity/application/server tests | **68 passed, 10 files.** Target/query independence; separate creation name; aliases; stale and cancelled requests; retry identity; fresh-selection recovery; replacement Undo; cross-Block linked identity; grapheme boundaries; candidate review/remapped bindings; lifecycle and focus; actual HTTP/worker Name/Alias/Mention semantics. |
| SQLite P1/P2 + canonical service | **78 passed.** Stable retry; distinct same-name Entities; optimistic conflicts; explicit Relationship endpoints/update; restart; read-only; backup/restore; canonical survival after clearing derived state; transaction rollback and bounded outbox. |
| Native resource/owned-resource/paired-save compatibility | **32 passed.** Existing codecs, ownership, publication, recovery and process-death controls. |
| Broader application/Facts/native regression | **552/553 passed in 53 files.** One unchanged-baseline exception below. |
| New real LER browser gate | **13 checks passed.** Flint → HTTP → dedicated SQLite worker, no SurrealDB; creation/link/Undo; alias provenance; live mention resolution; Replace & Link; unchanged native bytes under canonical edits; native pair relocation; server death/reopen; second-Window focus; actual committed-response hold followed by a stale target and fresh-selection recovery; database inspection confirms no inferred aliases/Relationships. |
| Existing C2 and C3 browser gates | **16 checks each passed**, with SQL and saved coverage explicitly enabled. Includes references/backlinks, native Undo, relocation, fresh restart/reopen, two Windows, Grouping and IME coverage from those harnesses. |
| Build / typecheck | Client/server build and TypeScript checks pass. Existing bundle-size, mixed-import and baseline-browser-mapping warnings remain. |

Service fault qualification includes a response deliberately lost **after** the server committed creation: the Entity is discoverable, and retrying the same attempt yields one identity. It also tests source duplication/disappearance/external move, forged source identity/location, wrong-vault authority, cancellation, read-only writes and stale live tokens. The browser recovery scenario holds a real create response while the canonical source is edited, then binds the confirmed Entity to a newly selected range.

The one broad regression failure is `Flint saved composition sqlite=true > selected Open retains the existing owned-external dependency/ownership admission guard` in `flint-saved-knowledge.test.tsx`. It receives **Saved result is stale** before reaching the expected **multiple semantic owners** error. The same failure was reproduced in a detached worktree at accepted commit **`b2fcfff`**, with its own baseline server build and Node 22.12.0. The file-provider variant passes. P3d does not change that test or relax either guard. See `artifacts/sqlite-p3d/baseline-regression.log` and `regression.log`. An intermediate concurrent run also rejected a saved backlink activation; the dedicated browser navigation gates pass. This report does not call the broad suite wholly green.

Measurements here are bounded functional integration controls on the existing Apple M1/Node 22.12.0/Chrome environment. They do not establish Typical/Large performance targets, end-to-end startup bounds or a native-Save optimization. No Entity query or canonical mutation is inserted into ordinary typing. Listing edits invalidate counts locally; resolver searches are explicit/debounced and cancellation-bound.

Evidence, screenshots and a representative native Resource are in [artifacts/sqlite-p3d](artifacts/sqlite-p3d). Browser test data and SQLite databases were isolated temporary fixtures; no user vault was migrated, indexed in bulk or modified by qualification.

## 5. Manual review and reproduction

Use a writable local Node server (`SPEEDY_PUBLIC_HOSTED_VERSION=0`), open a vault in Flint, and open/create a bound native Document. Select a mention and invoke **Entity reference**, or the existing **Ctrl+; then R** chord. Change Search while observing the separate Target; create under a different canonical name or choose an existing Entity. Details / aliases manages explicit names; Find other occurrences starts reviewed multi-binding. An unbound Document or read-only server reports its limitation rather than selecting another database.

```sh
npm run build
npm run typecheck
npm run test:sqlite
npx vitest run src/features/entity-references src/application/entity-service.test.ts src/application/flint-lifecycle.test.tsx server/sqlite-knowledge-host.test.ts --maxWorkers 1 --minWorkers 1
npx vitest run src/knowledge src/knowledge-sqlite src/application src/features/flint src/features/entity-references src/persistence src/qualification/native-knowledge src/qualification/native-b1 src/qualification/native-b2 server/native-saved-scope.test.ts server/sqlite-knowledge-host.test.ts server/sqlite-saved-scope.test.ts --exclude '**/*.test.mjs' --maxWorkers 1 --minWorkers 1
npx vitest run src/qualification/native-b1/owned-resource-files.test.mjs src/qualification/native-b1/server.test.mjs src/qualification/native-b2/paired-save.test.mjs --maxWorkers 1 --minWorkers 1
node scripts/check-sqlite-p3d-browser.mjs
PROOF_SQLITE=1 P5_SAVED=1 PROOF_ARTIFACTS=artifacts/sqlite-p3d/c2 node scripts/check-flint-c2-browser.mjs
PROOF_SQLITE=1 P5_SAVED=1 PROOF_ARTIFACTS=artifacts/sqlite-p3d/c3 node scripts/check-flint-c3-browser.mjs
```

## 6. Review boundary

Deferred: Entity merge/deletion, external authority import, semantic/AI candidate discovery, automatic alias extraction, Relationship-management UI, audit delivery, broader host/vault context, `.ink` compatibility/standalone Save, `.ink.md`, compatibility Open, new default Markdown behavior, native Save optimization and P6. No database migration or persistence redesign was needed for P3d. Candidate evidence and explicit canonical binding remain separate so later candidate sources can be added behind the semantic service without becoming canonical merely by appearing in results.

P3a–P3c authority, fallback and freshness rules remain intact. The reproduced baseline stale-result regression is carried forward explicitly. Stop for review after P3d.
