# SQLite P3c — Application/provider composition

**Implemented and qualified; stop for review before P3d.** P3c composes the accepted SQL saved-Facts reader into Flint's existing saved/live Knowledge host. The changes preserve file authority, canonical live precedence and the existing C2/C3 activation path. No P3d Entity/Relationship write transition is included.

## 1. Provider selection and rollout

In hosts with saved coverage enabled, `sqliteKnowledge:true` selects the new `PreferredSavedFactsClient`. It first attempts the P3b SQL scope and currentness proof. Selection requires the existing managed-store discovery/file evidence plus the current host session, reconciliation epoch, policy and SQL revision; database rows alone cannot establish eligibility.

One saved substrate is selected for a scope generation. SQL and file copies are never unioned. Verified SQL can contribute incomplete Facts with their existing diagnostics; this does not turn truncated or unresolved content into complete knowledge. When SQL scope/proof establishment fails, the accepted file reader must independently establish its own evidence. A failure after SQL publication first invalidates the old query generation and withdraws it. If file verification also fails, saved coverage remains unknown, while independently valid live resources remain usable.

Cancellation or a superseded request cannot select fallback or invalidate a newer client generation. File fallback remains selected until an existing scope invalidation or explicit Refresh; there is no retry poller. Refresh can restore verified SQL selection. Read-only hosts may use the explicitly labelled file fallback without creating or reconciling a database.

**Defaults are unchanged:** `sqliteKnowledge:true`, `nativeKnowledge:true`, and `nativeKnowledgeSaved:false`. P3c therefore changes the preferred substrate in saved-enabled hosts; it does not authorize broader saved-coverage rollout. Setting `sqliteKnowledge:false` retains the original file provider. The existing loaded-only/Knowledge rollback remains available. Rollback neither clears SQLite nor changes source files.

## 2. Composition and freshness

| Component | Production change |
|---|---|
| `src/application/preferred-saved-facts-client.ts` | Small SQL-first/file-fallback selector, scope lifetime and coverage mapping. |
| `native-knowledge-scope.ts`, `document-application-capabilities.tsx` | Inject the selected saved reader through the existing host capability. |
| `src/knowledge/session.ts`, `contribution-state.ts` | Optional saved-currentness validation and coverage capabilities; resource authority selection remains unchanged. |
| `facts-query-provider.ts`, `facts-backlinks.ts`, `vault-knowledge.ts` | Verify saved evidence before reading cached Facts and again before publishing asynchronous query results; carry coverage to Flint. |
| `saved-facts-client.ts`, `sqlite-saved-facts-client.ts` | Expose the current-scope proof already required by the composition. |
| `server/native-saved-scope.mjs`, `native-knowledge-routes.mjs` | A read-only file-scope `current` endpoint reuses the existing scope expiry/release and managed-store fence checks. |
| `document-vault.ts` | Notify consumers when initial SQL reconciliation settles; explicit Refresh waits for reconciliation before its completion notification. Ordinary vault reads do **not** wait for background SQL. |
| `src/features/flint/saved-coverage.tsx`, search/backlinks views and public result types | Add one saved-provider status line alongside existing available/discovered and incomplete-query coverage. |

The UI distinguishes verified SQLite, incomplete/unknown SQLite, independently verified file fallback and unavailable file verification. Saved-substrate status is separate from composed query completeness: verified SQL does not mean every resource has already been read or every authored feature has complete Facts.

`NativeKnowledgeHost` still chooses one contribution per canonical resource. Ready live canonical state supersedes saved state even without mounted tabs. An invalid, ambiguous or pending live boundary cannot fall back to a saved copy. Only established canonical absence permits saved contribution. Closing an occurrence does not remove canonical state, transfer ownership or cancel a resource-owned save. Reappearance and repository/scope replacement invalidate stale work through existing epochs.

There are no SQL/indexing calls in the typing mutation path. New asynchronous proof checks belong to query/read publication. Existing resource observation and debounce scheduling are unchanged. Explicit Refresh may wait for reconciliation; ordinary Open/relocation and foreground storage operations retain P3a coordination and priority.

These are observed freshness checks, not a filesystem watcher or instantaneous cross-client synchronization. A synchronous result token cannot discover an unobserved external write by itself. Subsequent asynchronous queries and the mandatory selected-result activation checks revalidate evidence.

## 3. Navigation and authority

Search/backlinks still use `SavedResultActivation`, native `openVerified`, canonical boundary validation, live passage/logical-reference revalidation and the final selected-file check. Activation opens or reuses the invoking Flint Window's own occurrence. SQL offsets and IDs do not acquire admission or navigation authority.

Historical, Workspace, legacy, foreign-definition and externally indexed rows are not made automatically navigable. Changed bytes, duplicates, disappearance, stale revisions and external moves reject old results. A failed proof cannot establish absence, rebind a resource, acknowledge Save or supply deletion evidence.

No schema migration, format change, new persistence abstraction, canonical Entity/alias/Relationship mutation, inferred Relationship, SurrealDB fallback or backend migration was added. The existing native Save path, including its paired-publication behavior, is unchanged.

## 4. Qualification

The existing saved-scope and real Flint UI/server suites now exercise both the original file composition and SQL-preferred composition. SQL cases use the actual host, dedicated worker, native routes and foreground coordination. Additional cases cover published SQL proof expiry, independently verified file fallback, Refresh back to SQL, changed files that also invalidate fallback, continued valid live operation and query cancellation.

| Gate | Evidence |
|---|---|
| SQL selection and rollback | Verified SQL selected; file-only composition retains behavior; feature defaults asserted. |
| Live/saved precedence | Same canonical resource contributes once; zero/multiple occurrences, dirty live state, disappearance/hand-back and admission Undo cases pass. |
| Unknown/fallback | SQL proof failure withdraws cached results; fallback independently verifies; changed files cannot be laundered through fallback. Read-only activation and incomplete budgets retain explicit coverage. |
| Navigation | Two Windows, selected passage, logical backlinks, duplicate/external edit/move/removal, in-flight unrelated edits and dependency/ownership guards exercised. |
| Lifetimes | Scope release/reacquisition, repository replacement, cancellation, stale query tokens and occurrence-independent resource operations exercised. |
| Foreground coordination | Dedicated held-background-work test proves ordinary vault refresh completes without waiting; explicit Refresh waits and notifies after reconciliation. P3a host/coordination regressions retained. |
| Entity boundary | Existing Entity selection, candidate and creation/link tests remain regression coverage; their backend and write authority are unchanged. |

The stable final regression run passed **545 Vitest tests in 52 files**. The separate native file/owned-resource/paired-save compatibility selection passed **32 tests in three files**, and the P1/P2 SQLite Node suite passed **76 tests**. Typecheck and the client/server build pass. Existing large-chunk, mixed Markdown import and baseline-browser-mapping build warnings remain.

Intermediate runs were disrupted by recorded Mac idle/clamshell sleep; another broad run overlapped the final refresh-coordination correction and reported relocation/lifecycle waits. The unchanged relocation assertions passed independently, then the complete final selection passed at one worker with stable source and process-scoped idle-sleep prevention. No timeout or navigation assertion was weakened to obtain the final result. Final logs are retained in `artifacts/sqlite-p3c/`.

## 5. Browser evidence and measurement limits

The existing P5 harness now optionally enables the actual SQL host with `PROOF_SQLITE=1`. It uses the real application composition, Flint UI, HTTP routes and SQLite worker in isolated temporary storage. Saved coverage is explicitly enabled for qualification. Added checks require the displayed verified-SQL status and exercise backlink activation as well as search activation.

The three-resource control demonstrates saved search before any native admission, progressive/incomplete reporting, 36 complete search hits, four backlinks, correct source passage selection and no focus/selection theft from the other Window. It also exercises ordinary input, Refresh, cancellation and final scope disposal. Raw metrics and a screenshot are retained in `artifacts/sqlite-p3c/browser-integrated.json` and `vault-3.png`.

The existing **C2 and integrated C3 browser harnesses both pass with SQL and saved coverage explicitly enabled**. Their checks include native reference creation/removal and Undo/Redo, title versus filename separation, relocation, two-Window passage navigation, unmounted canonical sources, Grouping, IME, source disappearance, fresh reopen and server restart. JSON checks, screenshots and representative native files are under `artifacts/sqlite-p3c/c2/` and `c3/`.

The **native production Save/Open browser harness also passes all 13 checks** with the SQL-capable server. It covers native fidelity, two occurrences, continued editing and closing Windows during Save, Workspace guards, actual server restart/death, partial-publication recovery and explicit Markdown import without modifying its source. Its selectors were updated for the existing F1 application menu, storage sheet and labelled file selector; no production UI or assertion was relaxed. Evidence is under `artifacts/sqlite-p3c/native-production/`. This harness keeps ordinary application feature defaults and does not claim to exercise saved SQL query selection; the other controls do that explicitly.

This is an integration smoke control on Apple M1/arm64, Node 22.12.0 and Chrome 154, not P6, a startup benchmark or a latency guarantee. Worker snapshot/Facts work, read/hash/fence work, transport and sampled memory remain separately recorded. Queue latency is not independently measured by this harness. Browser heap after disposal includes the application and browser machinery; zero retained Facts bytes does not mean zero heap retention.

In the final small control, the first complete search took about **43 ms** inside the UI harness. Input-command samples had a **26.6 ms median / 28.6 ms maximum**, and the post-Refresh samples **27.2 / 31.6 ms**, with no recorded long tasks in those intervals. Adding the second Window did not increase cumulative worker extraction time (24.0 ms before and after). At the explicit SQL-verification checkpoint, cumulative snapshot reads were 14.3 ms, Facts assembly 8.5 ms, source read/hash 5.8 ms and client transport 361.8 ms; these are overlapping/cumulative measurements, not additive phases of one query. Sampled worker/server heap peaks at that checkpoint were 45.9/10.0 MiB. Browser used heap was about 35.7 MiB before disposal and 27.3 MiB afterward; the host's retained Facts accounting returned to **zero**. These observations do not establish a long-session memory bound.

The accepted approximately five-second foreground Save for the 10,000-Block control remains future work. P3c neither optimizes that path nor claims whole-resource reconciliation has become incremental in cost.

## 6. Reproduction and review boundary

```sh
npm run build
npm run typecheck
npm run test:sqlite
npx vitest run src/knowledge src/knowledge-sqlite src/application src/features/flint src/features/entity-references src/persistence src/qualification/native-knowledge src/qualification/native-b1 src/qualification/native-b2 server/native-saved-scope.test.ts server/sqlite-knowledge-host.test.ts server/sqlite-saved-scope.test.ts --exclude '**/*.test.mjs' --maxWorkers 1 --minWorkers 1
npx vitest run src/qualification/native-b1/owned-resource-files.test.mjs src/qualification/native-b1/server.test.mjs src/qualification/native-b2/paired-save.test.mjs --maxWorkers 1 --minWorkers 1
PROOF_SQLITE=1 P5_COUNTS=3 P5_ARTIFACTS=artifacts/sqlite-p3c P5_OUTPUT=browser-integrated.json node scripts/check-native-knowledge-p5-browser.mjs
PROOF_SQLITE=1 P5_SAVED=1 PROOF_ARTIFACTS=artifacts/sqlite-p3c/c2 node scripts/check-flint-c2-browser.mjs
PROOF_SQLITE=1 P5_SAVED=1 PROOF_ARTIFACTS=artifacts/sqlite-p3c/c3 node scripts/check-flint-c3-browser.mjs
PROOF_SQLITE=1 PROOF_ARTIFACTS=artifacts/sqlite-p3c/native-production node scripts/check-native-production-browser.mjs
```

Stop after P3c for review. P3d remains separately gated: canonical Entity/Relationship service selection and writes, alias authority and the no-SurrealDB create/link/reopen qualification have not begun. Compatibility Open, standalone `.ink` Save, Markdown generation, Save optimization and P6 remain separate work.
