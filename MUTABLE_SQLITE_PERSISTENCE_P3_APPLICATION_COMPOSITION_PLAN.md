# SQLite Persistence P3 Application Composition Plan

**Planning report for review. P2 is accepted. No P3 implementation or database changes have been made.**

The recommended first integration is to supply verified saved Facts from SQLite to the existing Native Knowledge host. That host should continue selecting between live and saved contributions; Flint should continue using its C2/C3 query and navigation contracts. This makes the durable saved projection useful without giving SQL authority over current editor state, files, bindings or navigation.

There are two distinct changes in the original P3: consuming saved file-derived knowledge, and moving canonical Entity/Alias/Relationship services from SurrealDB to vault-scoped SQLite. They should have separate implementation gates. This plan recommends completing the read-side composition first, then reviewing the explicit Entity authority transition described in section 12. It does **not** count read-side completion as passing the original create/link/save/reopen-without-SurrealDB gate.

Source inspection is against repository baseline `d239949`, including the accepted [P2 report](MUTABLE_SQLITE_PERSISTENCE_P2_REPORT.md) and [programme qualification plan](MUTABLE_SQLITE_PERSISTENCE_QUALIFICATION_PLAN.md). Statements labelled proposed describe changes still to be implemented and qualified.

**Subsequent user clarification:** [Vault Content Recognition Strategy](MUTABLE_VAULT_CONTENT_RECOGNITION_STRATEGY.md) separates candidate browsing, content recognition and admission. The native-only query scope below records current qualification, not a permanent exclusion of compatible generic JSON Documents. Compatibility Open must use existing format-specific validators and retain source identity without migration. Missing typed-resource handlers and native pair filename assumptions are recorded explicitly in that strategy update; they are not solved by weakening P2 guards during P3a.

**Export scope clarification:** default Markdown export is deferred. Compatible Document discovery/Open must not require or create a Markdown sidecar. Existing pair guards remain applicable to already enrolled pairs; adding `.ink.md` output is not a prerequisite for content-based compatibility opening. This strategy change does not silently alter the accepted paired-save implementation.

**P3a implementation status (2026-10-02):** see [P3a implementation and qualification report](MUTABLE_SQLITE_PERSISTENCE_P3A_REPORT.md). Host/coverage correctness is qualified; coarse cancellation can delay foreground Save for large Resources and needs review before P3b rollout. The planning-time descriptions below remain the proposed later-stage sequence, not a claim that those stages have shipped.

**P3a foreground follow-up:** the accepted architecture now separates unlocked worker preparation from protected, revalidated publication. See the [foreground coordination qualification addendum](MUTABLE_SQLITE_PERSISTENCE_P3A_FOREGROUND_ADDENDUM.md) for the correction, race tests and remaining costs. This replaces the earlier requirement to drain the entire sweep before foreground persistence. P3b remains unstarted pending review.

## 1 Scope differences requiring review

The programme's original P3 row says “SQLite Entity/Alias/Relationship services; injected Entity feature transport, native-reference/mentions queries, saved search adapter and existing live overlay/navigation contracts.” Its gate includes Entity creation, retries, preferred-name changes and aliases without SurrealDB. The new brief first requires a composition plan, preservation of working consumers and a narrow progressive adoption seam. The plan below makes that sequencing explicit rather than replacing all consumers at once.

Three additional baseline details affect the proposal:

- `src/configuration.ts` currently enables `nativeKnowledge` but disables `nativeKnowledgeSaved`. The production assembly passes those switches directly into the Knowledge host. Saved/live qualification exists, but its default rollout remains separate. A SQLite adapter must not silently enable that existing flag.
- P2 accepted whole-Resource extraction and comparison with incremental **SQL writes**. This supersedes the earlier programme paragraph proposing changed-Cell/Block hints at save time. P3 retains the accepted P2 method; it adds no typing-path delta collector.
- P2 withholds publication while native pair recovery is pending. P3 retains that conservative rule even when the native half of a pair has published. Supporting such a partial pair as current saved knowledge would require additional positive publication evidence and a separate guard change; it is unnecessary for this integration.

No fundamental conflict with the file/live authority model was found. The Entity scope transition, saved-coverage rollout, and managed-lock interaction are concrete design boundaries, described below, at which implementation must not silently change accepted behavior.

## 2 Current architecture and exact P2 interfaces

| Component inspected | Present behavior | Implication for P3 |
|---|---|---|
| [NativeVaultStore](server/native-vault-store.mjs) | Confined discovery, read/hash/fence evidence, identity uniqueness, pair state, directory operations and journalled relocation. `.mutable` is excluded from source discovery/fencing. | Continue using it as the storage authority; SQL Resource rows do not replace discovery. |
| [Native routes](server/native-document-store.mjs) | Own native Open, Save, recover and vault routes. Save validates captured native/Markdown correspondence, caller baseline, dependencies and location guards. | Add narrow host notifications around these operations, without changing their success criteria. |
| [NativeDocumentSession](src/persistence/native-session.ts) | Resource-owned pair enrollment and retained bindings; `subscribeKnowledge`, `knowledgeEvidence`, `knowledgeBindings`; admission/pending flags and selected Open verification. | Existing live scope invalidation and binding evidence remain authoritative. |
| [Document vault leases](src/application/document-vault.ts) | Shared per-root discovery within the application host, refresh/signature subscriptions, non-overlapping roots and mutation refreshes. No catalog. | Reuse acquisition, Refresh and release as application lifecycle boundaries. Server leases must also enforce non-overlap across clients. |
| [SQLite foundation client](src/knowledge-sqlite/client.mjs) | `openSqliteFoundation({vault, readOnly, initialize, timeoutMs})`; `inspect`, `verify`, backup/close; private indexing operations. Worker owns SQLite; host owns writer lock. | Acquire one bounded worker per opened physical vault, outside any Document occurrence. No public SQL transport. |
| P2 indexing operations | `inventory`, `resourceProjection`, `inspectSaved`, `stageSaved`, `commitSaved`, `discardSaved`, `deletionBaseline`, `removeConfirmed`, `indexIssue`, `finishReconciliation`. | These are internal capabilities, not a browser query API. In particular, do not expose whole `resourceProjection` results as a new public Resource model. |
| [Saved indexer](server/sqlite-saved-indexer.ts) | `createSavedIndexer(client, {root, vault, store, policy}).refresh({mode, signal})` returns `complete`, `issues`, `reconciled`, `removed`. Rejects concurrent refreshes. Holds the managed-store lock throughout. | Add a coalescing host scheduler around the accepted operation. Do not invoke it once per tab or keystroke. |
| [Reconciliation](src/knowledge-sqlite/reconcile.mjs) | Per-Resource transaction, full replacement oracle, normalized Block diff, FTS triggers, SQL baseline checks, positive deletion evidence. | Read transactions must observe one consistent Resource version. No change to ownership or serialization. |
| P2 stored evidence | Resource identity/root/path/hash/generation/profile/status/diagnostics, all persistent Block rows and their relations/properties/segments/runs; separate `IndexIssue`. | Enough material for a bounded read adapter, subject to semantic parity qualification. Status alone is not proof of current coverage. |
| [NativeKnowledgeHost](src/knowledge/session.ts) | Resource slots, live boundary audit/observation, cancellation, conservative epochs, saved verification and absence checks, ephemeral Facts index. | Keep this as the single live/saved selection mechanism. |
| [KnowledgeScope](src/knowledge/contribution-state.ts) | Discovery/native/policy subscriptions; optional `prepareSaved`; `verifySaved` returns Facts plus resource/hash/location/policy evidence. | This is the preferred saved-provider seam. Enrich it narrowly for coverage/freshness, rather than replacing the host. |
| [SavedFactsClient](src/application/saved-facts-client.ts), [NativeSavedScopes](server/native-saved-scope.mjs) | Bounded begin/batch/release scopes, discovery signature and fences, byte checks, policy checks, worker extraction. | Reuse the scope verification protocol and budgets; substitute a SQL read adapter after qualification. Keep the file extractor as a rollback provider and differential oracle. |

P2 does **not** yet supply consumer query operations, a persistent successful-scan certificate, an application host manager, a publication scheduler, Entity CRUD, or a browser coverage subscription. None should be assumed to exist because the tables exist. `finishReconciliation()` clears `IndexIssue`; it does not record a durable proof that the entire directory remains unchanged.

## 3 Consumer inventory and proposed treatment

| Consumer | Actual path | Proposed treatment |
|---|---|---|
| Flint title/text search | `VaultKnowledge` → `FactsQueryProvider` → Native Knowledge host; canonical scan rollback when Facts is disabled. Run matching uses the existing Unicode/grapheme-aware search worker. | Compose SQL-backed saved Facts through the host. Preserve loaded/live path, budgets, literal matching, snippets and result activation. No FTS-only replacement. |
| Flint Document backlinks | `FactsBacklinks`, with `CanonicalBacklinks` rollback and host-side revalidation. Groups native references into logical mentions. | Use the same composed Facts sources. Preserve linked-segment grouping and target ambiguity rules. |
| Document reference picker, creation/removal and outgoing navigation | `VaultKnowledge.selection/picker/createReference/references/removeReference/followReference`; linked-annotation commands and ordinary Undo/Redo. | Leave commands and current loaded-target eligibility unchanged. SQL does not nominate identity, mutate references or broaden picker admission. |
| Facts | `collect-facts`, saved lightweight reader, canonical live observer, `FactsIndex`, session lifecycle. | Keep shared semantics and live observer. Add a SQL saved reader; do not persist live Facts or duplicate the overlay. |
| Link text to an Entity | `features/entity-references/search-view.tsx` directly fetches global name/alias routes and `POST /api/entities`; `chooseEntity` validates the original revision then annotates. | Leave the legacy authority path intact during read-side work. Propose an injected vault-scoped Entity capability for the separately reviewed authority gate. |
| Entity summaries and graph mention counts | `entity-summary.ts` calls `/api/entities/summary`, backed by SurrealDB Agent/legacy mention edges. | Do not relabel these as SQLite/native counts. Keep backend provenance explicit until an adapter supplies coverage-aware native counts. |
| Entities in Document, candidate binding, preview and concertina | `collectDocumentEntities`, `DocumentEntityList`, candidate/binding modules; live annotation capabilities. The list already accepts a summary-loader injection. | Preserve live Document counts, ranges, editing and focus. Reuse the loader seam later; revise the summary contract before supplying incomplete vault counts. |
| Native Entity mentions across Resources | Facts already carry Entity mentions; SQLite stores segment target assertions and resolution evidence. No equivalent integrated native vault Entity-mentions UI was found. | Expose a bounded read service over the same selected contributions. Service and navigation tests are in scope; a new Flint panel is not required. |
| Entity relationships | SQL `Relationship` schema exists; legacy Surreal/JSON graph routes are separate stores, not a qualified native relationship service. | A paged SQLite read service can expose existing canonical rows without inferring relationships from references. Canonical mutation/migration is the later authority gate. No graph canvas. |
| Retained/unplaced Blocks | SQL includes every persistent definition; C2/C3 Facts traverse owned presentation content and use retained definitions for resolution. | Preserve existing C2/C3 traversal. Permit explicitly scoped structural inspection later; do not turn unplaced definitions into navigable passages automatically. |
| Legacy Document/Workspace save index hooks | `server/index.ts` injects `indexDocument` callbacks into the legacy stores, currently calling `saveDocumentIndex` for SurrealDB. | Add only a successful-file-publication notification for Resources inside an already-open SQLite scope. Keep legacy behavior until its own migration gate; no Workspace redesign. |
| In-Document Find and ordinary editor behavior | Native text/range/mount machinery. | Unchanged. Saved SQL is not an input, selection or editing engine. |

Flint's public `ApplicationKnowledge`, `BacklinksService` and `ApplicationBacklinks` remain consumer boundaries. Backend evidence stays private to the application host; UI receives stable targets, bounded results and explicit coverage.

## 4 Proposed saved query adapter

**Start with SQL-backed saved Facts, not a second merged search engine.** A new internal `src/knowledge-sqlite/saved-facts.ts` should read a requested Resource in the SQLite worker and produce the existing Facts contract. The host qualifies filesystem evidence separately. Reuse `encodeFacts`/`decodeFacts` for rich values on transport; SQL authored bags must be decoded with the existing authored-value grammar, never plain JSON assumptions.

The adapter reads only the columns needed for semantic contribution, using a consistent read transaction and bounded output. It traverses the requested Resource's stored local owned placements in authored order, once per definition, starting at `rootBlockGuid`. It does not follow reference/external bodies or reconstruct a `RepositoryState`, instantiate Cells, call admission, or turn P2's private staging representation into a public DTO. A temporary visited set is traversal bookkeeping, not a maintained ownership graph. SQL edges describe a qualified saved projection; the adapter cannot establish live ownership from them.

Semantic differences that must be handled explicitly:

- P2 stores Blocks sorted by identity; C2/C3 traversal order and budgets come from child ordinals and sorted named relations. Reconstruct that traversal from those columns, not SQL row order.
- P2 stores retained/unplaced definitions and annotations in opaque subtrees. Facts eligibility must exclude bodies that the existing collector excludes, even when SQL has text/segment rows. `BlockTextRun` availability alone is insufficient evidence of traversal eligibility.
- P2 segment UUIDs/logical UUIDs are index-only identities. Public Facts IDs must follow the existing authored resource/Block/segment/definition contract. Missing or duplicate authored segment IDs remain diagnostic; a derived SQL ID must not make an otherwise ineligible mention eligible.
- P2 permits directly stored UTF-16 segment ranges and zero-length ranges that current reference Facts may not accept. Preserve them in SQL, but retain current Facts eligibility. Do not broaden mention semantics through conversion.
- Direct/local linked definitions must retain root-owner restrictions, deletion and `clientOnly` rules, consistent targets and query-specific diagnostics. A SQL `resolution='resolved'` alone does not prove current C3 eligibility.
- Preserve Cell boundaries, surrogate interiors and inline-object gaps. Use stored text runs/boundary maps and inline-object positions for snippets. SQL segment text uses U+FFFC for objects, while Facts snippets use the existing readable placeholder; reproduce the Facts result. If the stored projection lacks information needed for exact parity, report the specific missing field rather than inventing Cell boundaries or weakening the gate.
- Match `hasTitle`, title fallback, native tags and diagnostic behavior. Decode raw metadata where SQL's supplementary scalar projection differs from Facts coercion.

Differential tests compare SQL-derived Facts with the existing saved reader and full-decoder/capture oracles for identical bytes and policy. Refactor small pure semantic helpers only where needed to prevent divergent eligibility/grouping rules. Do not route SQL reads back through an invented Resource codec merely to reuse `collectFacts`.

The initial adapter supports **native Document contributions already eligible for Flint**. P2's ability to index legacy JSON, History Documents or Workspace roots does not give `SavedResultActivation` a supported Open path for them. Their rows remain inspectable and file-derived; their absence from native Flint search is a declared format scope, not silent full-vault coverage. No legacy admission or import broadening in P3.

FTS remains available for a separately named lexical query. Existing literal C2 search initially receives bounded runs and uses its existing matcher. If SQL candidate filtering is added, it must be a proven superset for the current Unicode/literal semantics. The first integration need not introduce FTS ranking or a second search UI.

## 5 Coverage and freshness contract

Proposed read responses carry an envelope, not a naked array. The final TypeScript names may follow existing conventions, but these semantics are mandatory:

```ts
interface KnowledgeResult<T> {
  items: readonly T[];
  evidence: {
    session: string;        // expires on server/worker replacement
    scope: string;          // opaque, managed-store-verified read scope
    indexEpoch: number;    // SQL publication/invalidation epoch, not save generation
    policy: string;
  };
  coverage: {
    scope: 'native-documents';
    state: 'complete' | 'incomplete' | 'unknown';
    discovered: number | null; // null when inspection cannot establish a count
    available: number;
    live: number;
    saved: number;
    truncated: boolean;
    diagnostics: readonly CoverageDiagnostic[];
  };
}
```

Diagnostics need stable reason codes, affected Resource/path where known, query category and retry guidance; they are not just display strings. Resource evidence remains separate: canonical resource/root identity, current managed location, native byte hash, extraction profile/policy and optional actual save generation. A hash, SQL epoch and save generation are three different things.

P3 should add an ephemeral host coverage record to the opened vault session: current reconciliation attempt, scope signature/fence, publication epoch, failures and policy. It is discarded on shutdown, worker failure or scope invalidation. **No new durable scan receipt, sidecar catalog or persistent semantic cache is required.** At startup, existing rows are unverified until the current managed scope and hashes qualify them; `IndexIssue` being empty is not enough.

The read-scope protocol should reuse/factor `NativeSavedScopes`' begin/current/release checks. At begin, verify discovery uniqueness, pending operations and the current fence; compare requested SQL Resource identity, root, path, hash and profile with that evidence. At each batch, verify the scope before and after reading and ensure the SQL epoch did not change. Read/hash requested saved bytes as needed to preserve the accepted exact-byte evidence; this removes repeated decoding, not all filesystem checks. Read all data for one Resource from one SQL transaction. Reject stale or mixed pages rather than joining different generations.

The existing native-only saved scope does not inspect every legacy JSON candidate that P2 considers. It therefore cannot, by itself, certify P2 reconciliation coverage. SQL reads must also require the current successful P2 sweep evidence, or an equivalent read-only validation of those candidates against the unchanged fence. In read-only mode, if this bounded validation is unavailable, keep SQL coverage unknown and use only the independently qualified provider fallback. Do not silently drop legacy-candidate uncertainty when reusing the native scope helper.

`complete` means complete for the declared query, eligible format scope and bounded observation epoch. It requires current discovery, all eligible contributions available, no query-relevant unresolved diagnostics, no pending operations or truncation, and current SQL/live evidence. It is never a statement about unseen future filesystem edits.

P2's conservative unknown-candidate rule remains: an unreadable/unsupported candidate can conceal another identity claimant. Do not make old SQL rows actionable on the strength of their hashes when uniqueness is unverified. Such rows may be retained internally as last-known data, but must not be returned as current navigable matches. If managed native discovery and canonical live proofs remain independently qualified, those live contributions may still be shown with the saved scope explicitly incomplete. Do not weaken the existing `eligibleRow` requirement for complete native discovery to do so.

Distinguish incomplete **saved substrate** status from composed query status. For example, a current live contribution may safely replace its stale SQL row; that SQL mismatch alone need not remove the live result. A scope-level uniqueness failure still invalidates eligibility. Never infer complete coverage by subtracting an unknown number of missing rows.

Extend the existing search/backlink result types additively and centrally map the envelope into their UI-facing coverage. Preserve their existing `complete` field as a conservative projection, so adapters cannot discard unknown status by returning an empty diagnostic array. Totals on paginated/truncated queries must say returned/known, not exact global count.

Flint's existing result status lines already distinguish available/discovered and incomplete coverage. Reuse them for “known matches; index pending/incomplete” and a bounded diagnostic detail/Refresh action. No warning overlay is needed on the editor. Entity summary counts must carry the same evidence before the existing numeric `mentions` contract is reused; unknown is not zero.

## 6 Live over saved algorithm

Continue selecting contributions in `NativeKnowledgeHost`, per canonical resource and repository instance, independently of mounted tabs:

1. On repository or scope change, immediately expire query eligibility and cancel stale work using existing scalar epochs. Do not wait for debounce before suppressing the old contribution.
2. Audit the canonical boundary. If ready, choose **live**, even when clean or with zero mounted occurrences. Retire any saved contribution before live observation. Validate the existing discovery/binding/policy requirements, then publish revision-bound live Facts.
3. While live observation is pending, failed, invalid or ambiguous, return unavailable/incomplete for that Resource. Do not substitute SQL simply because its last row looks complete. A failed audit is not proof of absence.
4. Only a `missing` canonical boundary permits saved selection. Require eligible discovery, qualified SQL bytes/profile/location, and current scope evidence. Recheck canonical absence after asynchronous verification before publishing.
5. Merge one contribution per canonical Resource ID. Multiple occurrences never multiply results or mention counts. Deduplicate using the accepted logical mention identity and ranges, not SQL row IDs or filenames.
6. After Save, retain live precedence. Reconciliation may replace the durable saved row, but continued editing stays live and dirty; a SQL completion does not acknowledge the editor's save or reset any baseline.
7. Closing a tab disposes only that occurrence. It does not remove a canonical resource from the repository or hand selection back to SQL. Actual canonical disappearance triggers the existing verified hand-back; retained bindings must still agree with discovered bytes/location. Unsaved discarded content is never resurrected from SQL as live state.
8. Reopening/admitting a Document suppresses saved results before admission completes. Old saved tokens expire; only the selected activation may transition its own revision ticket through authorized Open. Other results remain stale.

For an Entity-reference query, saved mentions from shadowed Resources are excluded **before** counts, sorting or pagination. Compose the corresponding live Facts' Entity mentions; do not add a saved count to a live count for the same Resource. This client-side overlay describes that repository's current unsaved state. It does not claim to aggregate unsaved edits from independent browser repositories; cross-client synchronization remains outside scope.

## 7 Saved publication scheduling

Proposed ownership: a small `SqliteKnowledgeHost` in the Node composition owns per-vault workers, lifecycle leases, coalescing, SQL publication epochs and status. It receives a managed-store capability and successful-operation notifications. It cannot call Save, Open, admit, relocate or delete source files. Flint holds a consumer lease only.

| Lifecycle point | Proposed action |
|---|---|
| Open Vault / startup of an explicitly opened vault | Resolve the existing confined directory, validate non-overlap and DB identity, open/reuse the worker. Initialize a missing DB only in writable composition for that explicitly opened scope. Mark coverage unknown, verify/reconcile, and publish only qualified reads. Do not walk every directory at server startup. |
| Successful native Save | After the existing pair operation has returned confirmed `saved` and released the managed lock, notify the host with resource/location/hash/generation evidence. Coalesce an incremental P2 refresh; independently re-read current bytes before SQL commit. |
| Save as / first save | Use the existing first-binding path. A bound native Resource cannot be copied/rebound by this indexer. A new destination not covered by an open vault receives no implicit catalog enrollment; reconcile when that vault is opened. |
| Failed Save / dependency failure / uncertain response | Expire affected saved eligibility; report pending/unknown. Do not index supplied editor bytes or infer native publication from Markdown. A later qualified refresh/recovery determines the saved state. |
| Native saved but Markdown pending | Keep pair-pending status and SQL eligibility conservative. Preserve prior SQL rows, but do not label them current. Complete recovery supplies the normal notification. |
| Successful pair/directory relocation or recovery | Invalidate scope/location evidence at operation start. After verified completion, coalesce reconciliation at the destination. No new save generation; identity/references unchanged. External same-ID moves remain explicit binding conflicts. |
| Confirmed file deletion | No deletion UI is added. Explicit discovery/reconciliation may observe external deletion and use P2's positive absence check to remove only derived rows. Missing inspection is never deletion. |
| Legacy saved files | Existing successful file-publication callbacks may notify an already-open containing scope. Re-read through P2's supported adapters; do not use the mutable callback DTO as authority. Files outside that scope and legacy graph imports remain untouched. |
| Explicit Refresh / window focus refresh | Reuse vault refresh. Revalidate read scopes even if discovery's JSON signature is unchanged; `refresh(true)` is already an explicit invalidation seam. Coalesce reconciliation when source or index evidence is stale. No filesystem watcher. |
| Explicit rebuild | Invoke full P2 reconciliation; do not clear good rows first. Keep failures and completeness separate. Add a small host status/reconcile capability, not a new Flint storage framework. |
| Last consumer release / server shutdown | Release read scopes and abort abandoned query work. Allow a queued publication reconciliation to finish, or cancel before commit and leave coverage unverified. Close worker/lock only after active work settles. File Save continues to belong to its own resource/session. Restart rediscovers authoritative state. |

**Managed-lock integration is gate-critical.** `NativeVaultStore.lock()` uses a nonblocking lock and fails a competing operation; P2 holds it for the entire sweep. Naively starting a background refresh can therefore make an ordinary Save fail with “Another managed operation is active.” Native and legacy storage routes must share a bounded host coordination hook: before a user storage operation, stop queued indexing, abort an active sweep at its existing cancellation boundary, await release, then run the original storage operation. Notify/requeue indexing only after that operation releases its lock. Never call `refresh()` recursively while holding it.

This coordination does not replace managed locks or arbitrary OS-writer checks. It only orders this host's background work relative to foreground operations. Worker codec cancellation remains coarse, so measure the residual wait before proceeding. If acceptable interaction requires changing P2's transactional/evidence boundaries or redesigning storage locking, stop and report that specific blocker. Do not solve it by skipping confinement, fences or duplicate checks.

Serialize background sweeps by the managed-store lock root, including different opened vaults beneath that root. Foreground priority must quiesce any sweep holding that same lock, not just the selected vault's sweep. Keep this as bounded host scheduling over active leases; it is not a persistent global catalog or a replacement file transaction system.

Notifications are wakeups, not publication certificates. Coalesce by opened vault and retain bounded affected-resource hints; the actual P2 operation still validates the full scope. Out-of-order notifications never cause an older generation to overwrite a newer projection. A queue lost on crash is recovered by startup/Refresh reconciliation, not a new durable job system.

## 8 Navigation and Flint boundary

Keep [SavedResultActivation](src/application/saved-result-activation.ts) and `document-application-capabilities.tsx` as the authority for saved-result Open and passage reveal. Extend private saved evidence with the SQL read-scope token where required, but keep resource/root/hash/location/policy fields intact.

Activation must:

1. Check the invoking Window, vault lease, repository identity/revision, query token and policy.
2. Refresh managed discovery and revalidate native identity, location, pair status and exact byte evidence. A SQL Resource row does not update a stale binding.
3. If canonical state is absent, use the existing `openVerified`; if present, require a ready canonical boundary. Invalid/ambiguous state cannot be repaired by SQL selection.
4. Re-observe live content and re-match the selected search passage, or validate the logical reference/ranges through the existing backlinks resolver. Never navigate directly from FTS offsets.
5. Open/reuse an occurrence in the invoking Flint Window, preserving focus/selection restoration. Finish with the existing selected-file verification. No focus stealing and no History entry for navigation.

A move, external replacement, stale revision, target disappearance or changed match rejects the old result and offers refresh. P3 need not make old results follow relocated paths automatically.

Flint can safely receive title/text search, native Document backlinks and explicit coverage/status through existing controls. A narrow native Entity-mentions service can be qualified without building a new knowledge lens. Entity names remain from their explicitly selected canonical backend. Stored unresolved targets may be displayed as unresolved assertions, but not made navigable merely because a plausible SQL row exists.

Retained/unplaced Blocks may support future structural inspection. Ordinary navigation currently requires an eligible owned passage in the Document occurrence; P3 must not create a new placement or mount hidden content to make such a row actionable.

## 9 Foreign definitions and separate authorities

Foreign definition assertions remain unresolved even when SQLite contains a matching definition or Entity. A matching ID is not evidence that the definition's saved generation, source version/pin, owner and eligibility match the source segment. Do not join them into resolved saved mentions, and never persist a resolution obtained from dirty live state.

If a later consumer needs resolution, the minimum prerequisite is explicit source-segment provenance plus verified target Resource hash/generation/version, definition owner/ID/hash and policy, all under a current scope. Both source and target changes must invalidate that proof. That work is deferred; it is not necessary to search text or show qualified direct/local references in P3.

The authority distinctions remain:

- Authoritative files own Blocks, properties, placements, definitions and standoff assertions.
- Saved SQL records those files under current evidence and remains rebuildable.
- Canonical live state owns current unsaved Document semantics in its repository.
- SQLite Entity names/enrichment, curated/imported aliases and Entity Relationships are canonical database knowledge when that backend is explicitly adopted.
- Observed aliases are rebuildable only from surviving authoritative reference text. P3 read queries neither create them nor infer canonical relationships.

## 10 Failure recovery and concurrency

Use one writer worker per physical vault and share it across Windows; never attempt a second writer when another process owns the lease. Server-side leases validate the real root and DB vault identity rather than accepting a browser path as a capability. Different repositories may use the same saved vault worker while retaining separate live overlays.

Read requests use bounded pages/batches, cancellation and session/scope epochs. Retain existing bounds as the starting point: 32 pending SQLite requests, 20 MiB per input, 40 MiB queued byte payload; saved Facts transport at most 32 resources per batch, 2 MiB per Facts wire and bounded aggregate response. Add output/diagnostic bounds for SQL queries. A canceled Window query does not cancel another Window's resource-owned reconciliation.

| Failure | Required behavior |
|---|---|
| File saved, DB busy/crashed/disk full | Save remains successful; index status says pending/unavailable. Do not retry Save or edit native/Markdown receipts to repair SQL. |
| Worker death or timeout with unknown SQL commit outcome | Expire all session tokens; inspect/reopen and reconcile current bytes. Do not replay a presumed old transaction blindly. |
| Server restart | Discard ephemeral complete status and validate scope/profile/hashes anew. Existing canonical DB records survive; never initialize over a corrupt/newer DB. |
| Incomplete discovery, duplicate, symlink or pending operation | Preserve good rows but withhold current saved eligibility where uniqueness cannot be established. No deletion, empty-vault conclusion or automatic adoption. |
| Mixed or changed SQL page generation | Reject/restart the query under a new epoch; never combine old text with new ranges. |
| Read-only vault | Open an existing valid DB read-only; no migration, reconciliation or issue-row writes. Host coverage can be incomplete in memory. If no current SQL projection exists, use an explicitly labelled qualified file-reader fallback or live-only results. Never create a DB in this mode. |
| Policy/profile mismatch | Withhold SQL contribution and schedule qualified reconciliation if writable. A stricter application policy cannot consume rows extracted under a weaker one as though they matched. Incompatible clients do not repeatedly overwrite each other's profile; use a declared host policy or the existing file-reader fallback. |
| Last tab closes | Occurrence disposal only. Neither canonical ownership nor saved publication is canceled or reassigned. |
| Vault changes / repository replacement | Abort/release old query leases; dispose old live host. Tokens never migrate between repositories or DB instances. |

No watcher, periodic poller or synchronization service is proposed. Within one application host, existing native/vault/repository notifications expire local results. Server publication epochs are checked on subsequent reads and asynchronous activation. A synchronous `current()` cannot detect a remote client's write or arbitrary OS change it has not observed; do not claim instant cross-client invalidation. Focus/Refresh and mandatory server verification before navigation preserve the existing observation boundary.

Fallback is selected per contribution/provider and labelled in coverage. Never union SQL and file-extracted copies of the same Resource or use a file-reader fallback to bypass ambiguous live/managed evidence. There is no fallback from a failed canonical SQLite Entity write to SurrealDB.

## 11 Proposed implementation order and gates

All filenames below that are not in section 2 are proposals. Retain qualified P1/P2 code and the independent saved/live oracles; do not promote qualification fixtures into application composition.

| Stage | Production work and affected files | Qualification and stop gate |
|---|---|---|
| **P3a Host lifecycle and coverage** | Add `server/sqlite-knowledge-host.ts` and bounded routes; compose in `server/index.ts` and native routes. Add narrow worker status/read operations in `client.mjs`, `worker-entry.mjs`, `foundation.mjs`. Factor existing saved-scope verification only as necessary. Reuse P2 reconciliation and add foreground-operation coordination. | Two Window leases/one worker; non-overlapping confined scopes; writable/read-only startup; SQL failure after successful Save; no accidental save retry; restart with unknown coverage; pending pair/dependency failure; managed-lock priority; unknown inspection cannot become absence. **Report before changing the active saved reader.** |
| **P3b SQL saved Facts and query services** | Add `saved-facts.ts` and bounded typed reads over existing tables. Reuse pure semantic helpers, authored-value and Facts transport. Add `src/application/sqlite-saved-facts-client.ts` implementing the existing saved-verification seam plus coverage. Introduce read-only native Entity-mention and Relationship queries with explicit provenance; no canonical mutation. | Exact Facts/search/backlink parity for eligible content, including duplicates, client-only properties, linked/local/foreign definitions, Unicode/images, opaque hosts, retained definitions and graph-2 external resources. Snapshot/epoch/cancellation/output bounds. No hidden editor or file rewrite. **Report adapter parity before UI/provider selection changes.** |
| **P3c Application composition and Flint qualification** | Inject the saved provider into `native-knowledge-scope.ts`; narrow changes to session/coverage contracts and `FactsQueryProvider`. Keep `VaultKnowledge`, `FactsBacklinks` and selected activation as consumers. Add status mapping in existing Flint results/vault controls. | Full live-over-saved matrix, zero/one/multiple occurrences, two Windows, startup/reopen, edits/Undo branches during requests, save/reconcile/close races, external edits/moves/removal, invocation-specific passage navigation and read-only fallback. Run actual UI/server tests. **Stop with the read-side P3 report.** |
| **P3d Original Entity authority gate** | Only after the scope decision in section 12: injected Entity capability, vault-scoped canonical services and existing Entity panels. | Original create/link/save/reopen without SurrealDB; selected-text default name; stale selection/cancel/retry; preferred name/alias semantics; two vaults/Windows; explicit unresolved legacy IDs; read-only guards. **Separate review before writes switch backend.** |

Proposed `sqliteKnowledge` follows the standing default-on rule for a **new** integration switch, once composition is authorized. It selects the saved backend only in hosts that permit saved coverage. Preserve `nativeKnowledgeSaved:false` and `nativeKnowledge` rollback semantics unless their rollout is separately authorized. P3 qualification explicitly enables saved coverage to exercise SQL; a passing test is not a silent default change. Entity backend choice is not inferred from this read-provider flag.

Rollback for P3a–c: choose the existing saved file reader or loaded-only provider, dispose SQL query scopes and preserve the DB/files. Do not clear the database. No legacy canonical-write rollback is safe once SQLite Entity mutations have been accepted.

Required regression families include the P1/P2 Node suite and producer differentials; `knowledge/session`, `live-observer`, saved lightweight-reader suites; application `native-knowledge-scope`, `native-saved-scope`, `facts-query-provider`, Flint saved/search/backlinks/vault/lifecycle suites; native session, pair publication, relocation/restart and B1/B1.1/B1.2 guards. Existing Entity selection/list/candidate tests must remain green even before their transport changes. Run typecheck/build and the existing Flint C2/C3, native production and saved-coverage browser harnesses with explicit feature settings.

Measure enough to catch integration regressions: reconciliation lock duration and foreground Save wait, query queue/worker/transport/publication times, browser input stalls, memory before/after repeated scope cycles and cancellation, worker count and shutdown. Prove no SQL or reconciliation dispatch on typing and no multiplication of work by occurrence count. Do not rerun a broad P6 benchmark programme here. Typical/Large performance and pathological-scale optimization remain P6; no claim that whole-vault refresh or whole-Resource decode has become incremental in cost.

## 12 Original Entity scope and the recommended decision

The original Entity-write gate cannot be obtained by replacing URLs alone. Today's feature works without a Flint vault and queries a global legacy Agent store; SQLite knowledge is per managed vault. A live selection may belong to an unbound legacy Document, and existing references may target Entities absent from the new database. P2 correctly did not import or invent those records.

**Recommendation: authorize P3a–c first and retain P3d as the explicit canonical-service transition.** This is a proposed sequencing amendment, not an assertion that the original Entity requirement is complete. It avoids quietly making existing Entity lookup empty or routing a creation to whichever Flint Window last selected a vault.

For P3d, the minimum proposed scope is:

- Resolve an Entity capability from the selected source Document's verified persistence/vault context, not global focus or the last-opened vault. Missing/ambiguous context offers an explicit unavailable/context-selection result. Do not create a default hidden Entity database.
- Inject lookup/get/create and summary loading into the existing feature. Preserve live `chooseEntity`, revision checks, focus restoration, candidate binding and annotation Undo/Redo. The selected text remains the initial name; creation is an explicit user action.
- Use idempotent supplied Entity identity and optimistic revision checks. An Entity may have committed when selection becomes stale; do not delete it automatically or claim a cross-store transaction. Undo removes the annotation, not canonical knowledge.
- Keep curated/imported/observed alias origins distinct. No automatic Entity recovery, alias fabrication, bulk import or duplicate-by-name merging. Missing legacy Entity IDs stay unresolved until P5 or an explicit supported import supplies them.
- Reuse native mention composition for coverage-aware counts. Canonical Relationships remain Entity-to-Entity records; native references are not automatically Relationships. Add no broad relationship authoring UI.
- Preferred-name/alias/Relationship mutation and retry semantics must fit the original P3 service gate. Define their bounded audit-outbox behavior before enabling them; P4 still owns audit delivery and loss/gap policy. Do not accumulate an unbounded outbox or invent history in order to enable the first panel.

The global legacy routes can remain an explicitly legacy context during transition. They must never be an implicit failure fallback for a SQLite-scoped action. Retirement and existing-data migration remain behind their existing gates.

## 13 Non goals and review boundary

P3 introduces no authored format, `.ink` migration, Workspace persistence change, binding relocation policy, deletion/Trash feature, filesystem watcher, synchronization, global enrollment catalog, second ownership graph, persistent Facts cache, inferred relationships, automatic Entity/alias creation, foreign-definition resolver, hidden editor, broader Markdown support, decoder redesign or History retirement. SQL never writes Blocks or annotations back to files. Arbitrary structural admission remains outside the query layer.

The implementation must stop if exact SQL-to-Facts parity requires a new Resource/admission representation, if lock coordination requires weakened file evidence, if current coverage cannot be established without expanding storage authority, or if Entity integration cannot determine a unique authorized vault. Report the concrete case; preserve the working provider.

The next executable order, if this plan is approved, is **P3a → review → P3b → review → P3c → integrated read-side review**, with **P3d requiring the explicit Entity authority decision above**. Saved-coverage rollout is separately visible. This planning pass stops here; no P3 component has been implemented or enabled.
