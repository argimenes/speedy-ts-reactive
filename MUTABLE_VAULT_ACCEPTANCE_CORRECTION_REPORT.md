# Mutable Vault and Raven acceptance correction

3 October 2026. Bounded follow-up to the accepted SQLite P3d and Flint manual findings. The user's removal of read-only server mode supersedes §15 of the preceding directive. No later product stage or P6 work is included.

## Result and normal launch

Normal Mutable composition is writable. `npm run build` followed by `npm start` serves the application on port 3002; no writable override is required. The managed Documents root defaults to this repository's `data` directory. The platform's default Vault is `.` relative to that root, configurable through `MUTABLE_DEFAULT_VAULT`. `SPEEDY_DOCUMENT_ROOT` remains the existing managed-root configuration.

The old port-3002 process had no environment override disabling writes. `src/configuration.ts` instead defaulted `publicHostedVersion` to `true`, which the server used to prohibit storage writes and the client used to hide server actions. That obsolete flag, its environment handling, the server write-denial middleware and the matching normal-application branches have been removed. Server and explicit local-file actions remain available.

Low-level read handles for inspection/backup and injectable denial cases in adapter tests remain. They are not a selectable Mutable server mode. Filesystem permission errors, SQLite errors, unavailable paths and failed validation still reject operations.

## 1. Mutable owns the Vault

Mutable establishes the root and its `.mutable/mutable.db` and `.mutable/audit.db`. The existing SQLite foundation owns schema, Vault identity and worker lifetime. The managed store owns confinement, source evidence and persistence operations. Flint consumes platform establishment, discovery and Document capabilities; it does not define a second database, hierarchy or membership catalog.

`server/sqlite-knowledge-host.ts` exposes establishment through the existing shared host. A warm context is reused without changing the application's extraction policy; establishment is not permission to replace that policy. Startup failures now fail acquisition rather than returning an apparently usable lease with no database.

## 2–4. Persistent existence, overlap and default root

`src/knowledge-sqlite/vault-scope.mjs` is shared by the worker host and direct foundation/restore entry points. It checks ancestor `.mutable` markers and performs a bounded descendant inspection, including hidden directories. A child or ancestor marker rejects the proposed topology. Symlinks, inaccessible entries, entry/depth/time exhaustion and partial infrastructure fail closed. Existing malformed or missing databases require explicit recovery; opening does not manufacture replacement canonical knowledge.

A purpose-specific per-user OS advisory lock serializes inspection and establishment across cooperating server/CLI processes, including different proposed roots. It is released after startup; ordinary reads, writes and queries retain their existing per-Vault machinery. It is neither a catalog nor a general filesystem lock. The async host retries contention within a bound; synchronous tooling reports busy.

The `.mutable` marker survives session closure. Closing the last Flint Window or lease does not make a child Vault legal. Reopening the same valid root preserves its Vault GUID. Siblings are independent. Fresh context startup rejects externally copied overlapping topology rather than choosing a winner.

This is a bounded point-in-time topology check, not a filesystem watcher or protection against arbitrary external changes after validation. Existing source/discovery currentness checks remain. No additional recursive *topology* scan was added to each Entity query; the pre-existing scope-fence/discovery checks for source uniqueness remain, now including content-recognized identities. Those source checks are still proportional to the discovered scope, not a constant-time lookup or a new performance qualification.

The normal `/data` root has been established through the production API. Its `.mutable` databases were created as authorized. The user's Document files were not modified during qualification against the actual collection; edit/Save/LER tests used a disposable byte-for-byte copy of Raven.

## 5–6. Recognition, codec proof and in-place Raven Save

The physical tree includes ordinary files and folders. Explicit Open recognizes bounded content with existing native, History and legacy codecs; it does not mint a replacement Document identity, rewrite a filename, enroll a Markdown export or treat every JSON file as a Document.

`src/persistence/compatible-document.ts` checks the actual writer capability. Legacy Save captures the canonical resource, encodes through the existing tree writer, decodes again and compares native authored semantics. Only structural placement IDs, which the legacy format does not persist, are excluded from that comparison; authored property fields are not removed. Every new generation must pass. An unrepresentable edit rejects Save with the original bytes retained.

The actual Raven representation passes. Its stable Document ID is `d7db09e8-45b3-4a93-b5c4-f3f707801eb6`. Editing and saving the fixture preserves its original legacy JSON format and identity, including the newly authored EntityReference. It produces no Markdown or converted native sibling.

The read-only corpus survey found 23 top-level files passing the legacy round-trip comparison. Eleven contain nested Document resources and stop at the existing admission boundary. `default.graph.json` is not a Document source; `usher.json` is a prose/export wrapper rather than whole-file JSON. These findings do not classify nested Documents as inherently unserializable.

`server/recognized-document-store.mjs` provides resource-scoped, single-file publication using the existing managed publication/dependency primitives. Journals under `.mutable/document-saves/<resource hash>/<generation>` retain the captured native generation, original-format output, intent, displaced source and completion. They are operation evidence, not a second Document format or membership database.

Caller hashes remain authoritative baselines. Retries must match the original generation; restart recovery uses its recorded bytes. Source displacement and create-only publication preserve late external writes rather than overwriting them. Pending operations appear in discovery and block complete evidence until resolved. Successful Save updates the binding hash without changing resource identity; newer edits remain dirty. The client does not silently convert a recognized Document through a Save-As path.

Identity verification inspects possible Documents by content, including files with unfamiliar extensions. A bounded prefix can positively exclude binary media or prose; a possible JSON candidate still requires full bounded inspection. An oversized candidate is unknown and blocks verification. Anonymous historical content contributes no authored identity assertion, but cannot be admitted as a canonical Document. Duplicate, malformed identifiable, stale or uninspectable evidence remains a rejection.

## 7–10. LER, new Documents and transient Notes

Verified Raven source identity/location/hash evidence selects the containing Mutable Vault's canonical Entity service. The native-only discovery-row prerequisite is replaced for recognized sources by server-verified content evidence; canonical boundary, scope, pending-operation and revision checks remain.

The browser scenario edits Raven, saves it in place, creates an Entity from selected text, links it, saves again, resolves its canonical name and curated alias, and exercises current-Document mention resolution. A real backend restart and browser reload reopen Raven with the same canonical Entity GUID and saved EntityReference. Entity creation and annotation remain independent operations.

The complementary New Document → explicit Save → LER → Save → restart/Open path remains on the existing native route. Existing enrolled native/Markdown pairs retain their accepted protocol. This correction neither requires Markdown for historical Documents nor changes accepted pair recovery semantics.

Starter Notes/Ideas remain unbound. Selecting a Vault does not save them. Attempting canonical creation explains the Save prerequisite and reports **Not created**.

LER preserves four outcomes: pre-dispatch rejection is **Not created**; confirmed creation and annotation is **Created and linked**; confirmed creation with failed annotation is **Created but not linked**; genuinely uncertain dispatched creation is **Creation outcome unconfirmed**. A subsequent local rejection does not erase an earlier uncertain attempt or manufacture a second Entity identity. Selected text supplies the initial Entity name.

## 11–12. Qualification and review evidence

| Qualification | Result |
| --- | --- |
| Client/server build; reactive/server TypeScript checks | Passed. Vite retains its existing large-chunk warning. |
| SQLite foundation and Vault topology, run serially | 28/28 passed, including direct entry points, dormant overlap, siblings, malformed/incomplete scope and real concurrent processes. |
| Recognized-source publication and corpus codec tests | 8/8 passed: in-place Save, stale caller, same-generation retry, interruption/restart recovery, external replacement preservation, duplicate identity, oversized candidates and actual-corpus verification. |
| Broad existing gate | 21 files / 199 tests exercised. Initially 198 passed; one import-UI test clicked before its previous operation completed. Waiting for the existing enabled state fixed the fixture; its full 15-test file subsequently passed twice. |
| Final integrated host, Entity service, vault UI and saved-scope regressions | 41/41 passed across four files, including warm-policy establishment, two Windows, relocation while editing, saved/provider invalidation and source guards. |
| Saved Flint composition, file and SQLite providers | 22/22 passed after updating the fixture to use normal writable SQLite establishment and inject denied writes only at the source adapter. The prior two failures attempted to open a nonexistent database through an obsolete read-only server setup. |
| Real production-entry browser/server acceptance | 21 checks passed; no uncaught browser exceptions. Real server restart, ordinary UI commands, no injected repository/source binding or writable override. |
| Ordinary running server and actual `/data` | Default `.`; `readOnly:false`; complete discovery; 15 folders and 91 other files; Raven source verification and `in-place` Save capability confirmed. |

The broad gate covers native Save/Open, native pair/directory relocation, ten process-kill/restart cases, native session, transient Flint occurrences, C2/C3, SQLite saved scope, Entity candidates/lifecycle and normal server/local UI actions. The final focused reruns cover the source-verification and warm-context changes made after that gate. Counts above overlap; they are not an aggregate number of distinct tests.

The browser caught and drove the fix for policy-neutral establishment: Save must not attempt to replace the extraction policy of a context held by LER. The corpus check similarly drove bounded content-prefix inspection for large media, with an adversarial oversized-JSON test proving uncertainty remains a rejection. No ownership, confinement or freshness assertion was removed to obtain passing results.

The browser harness uses `dist/server/index.js`, a disposable managed root containing the real Raven bytes, and the ordinary Vite application entry. Its only functional service override disables the unrelated legacy SurrealDB startup; it does not disable SQLite or grant storage permission. The final ordinary-server check uses `npm start` with the normal configuration and real root.

Evidence:

- [Browser results](artifacts/flint-manual-acceptance/browser/browser-results.json), [reopened Raven](artifacts/flint-manual-acceptance/browser/reopened-raven.png), [unbound prerequisite](artifacts/flint-manual-acceptance/browser/unbound-prerequisite.png).
- [Ordinary server and actual root](artifacts/flint-manual-acceptance/ordinary-server.json), [corpus codec matrix](artifacts/flint-manual-acceptance/corpus-codec-results.json).
- [Platform tests](artifacts/flint-manual-acceptance/vault-platform-tests.log), [recognized-source tests](artifacts/flint-manual-acceptance/recognized-source-tests.log), [final saved composition](artifacts/flint-manual-acceptance/saved-composition-final.log).
- Reproduce the browser sequence with `node scripts/check-flint-manual-acceptance.mjs` after building. Build the server after the client: Vite clears `dist`, including worker artifacts. Do not rebuild while qualification servers are running.

## Remaining boundaries

- Historical nested Document resources need a qualified multi-resource admission path; this correction does not invent one.
- A History Document can be recognized, but current-resource Save cannot preserve its enrolled History archive and is explicitly unavailable. There is no implicit flattening or conversion.
- The C2/C3 discovery cohort and saved-result activation remain conservative about historical sources. Raven can use canonical name/alias services and local live mentions, but this report does **not** claim complete historical-vault search/backlink coverage. The current Backlinks panel can report the target unavailable. No false complete zero count should be inferred from that state.
- Individual recognized-file rename/relocation is not newly generalized. Existing native pair/directory relocation remains covered by its established guards and regression tests.
- New native creation retains the accepted paired route. Optional standalone export naming, `.ink.md`, migration and broader typed-resource handlers remain deferred.
- Broader Desktop/Canvas/Spatial Entity-context composition, cross-Vault knowledge exchange, merging and deletion remain outside this pass.

Stop here for review. The architecture remains: Mutable owns non-overlapping Vault persistence domains; content and codec determine Document capability; Flint consumes those services.
