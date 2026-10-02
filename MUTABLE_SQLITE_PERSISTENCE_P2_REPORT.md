# SQLite Persistence P2 — Saved Resource indexing

**2 October 2026. Implemented and qualified within P2; stopped before P3.**

The authoritative reconciliation path is now available: validated saved bytes produce a complete Resource projection, and one SQLite transaction replaces that Resource's derived rows and FTS state. Incremental indexing uses the same complete projection and changes only differing Blocks. It does not trust a live delta or a caller's list of changed Blocks.

Files remain authoritative. SQLite does not write, save, admit, own, relocate or delete authored Resources. Existing application Entity/search/backlinks consumers, file-save routes, History and live Facts providers remain in place. P2 exposes explicit host/CLI reconciliation; automatic application scheduling and consumer composition have not begun.

## 1. Implementation

| Component | Role |
|---|---|
| [saved-projection.ts](src/knowledge-sqlite/saved-projection.ts) | Read-only adapters over existing native, legacy, History Document and Workspace codecs; complete table-ready projection, including raw authored bags. |
| [reconcile.mjs](src/knowledge-sqlite/reconcile.mjs) | Full Resource replacement oracle, incremental Block comparison, transactional FTS consistency, stale SQL baseline rejection and confirmed derived deletion. |
| [sqlite-saved-indexer.ts](server/sqlite-saved-indexer.ts) | Host coordination using `NativeVaultStore` confinement, discovery, scope fences, pair baselines, pending-operation and relocation evidence. |
| [worker-entry.mjs](src/knowledge-sqlite/worker-entry.mjs) | Bundled TypeScript codecs plus SQLite worker operations; private staging token before publication. |
| [client.mjs](src/knowledge-sqlite/client.mjs) | Bounded typed worker transport. Host-owned locking is retained. |
| [CLI](scripts/sqlite-foundation.mjs) | Explicit `reconcile` and `rebuild-derived`; optional incremental SQL updates. |

There is **no schema migration or driver change**. The P1 SQL, checksums, `better-sqlite3` 12.4.1 pin, alias-origin uniqueness, WAL/FULL configuration and host-owned writer lease remain. The server build packages the existing codecs into the worker; it does not introduce another Resource wire format. The staging object is private SQL projection data, not an authoring/admission model or durable cache.

The reserved `.mutable` database directory is excluded from native discovery and source fencing. Otherwise indexing its own WAL/database changes would invalidate source evidence and expose a database directory as a user folder. Pair archives and relocation evidence retain their existing treatment. The focused managed-store/discovery regressions pass with this exclusion.

## 2. Authoritative reconciliation protocol

1. Open the explicitly selected SQLite vault and require it to match the managed filesystem scope. Hold the existing managed-store lock so cooperating Save/relocation operations cannot interleave with reconciliation.
2. Obtain complete discovery and source-fence evidence. Native candidates must retain qualified identity and pair/location evidence; pending publication, pending relocation, duplicates and unavailable inspection prevent a successful scan. Legacy/Workspace/History `.json` candidates are inspected through the worker. Duplicate Resource or persistent Block identities are unavailable, never first-match wins.
3. Read and validate authoritative bytes. The adapter uses existing codecs and validation without creating an editor, projection host or repository admission. No filename supplies identity. Native Markdown is never read as the Document body.
4. Stage the complete Resource projection privately in the SQLite worker. Bind its token to the current SQL Resource baseline. At most one staged Resource is retained; supersession, commit, disposal or restart expires that token.
5. Revalidate the source scope, file stamp/hash and native pair/location baseline immediately before commit. Cancellation or changed evidence discards the staged result. Native external moves do not silently update a previous SQL location binding.
6. Commit the Resource row, tags, Blocks, properties, placements/relations, annotation definitions/segments, text runs and their FTS changes in one SQLite transaction. The prior Resource state remains intact on failure. A duplicate Block already attributed to another Resource rejects the transaction instead of adopting it.
7. Remove a previously indexed Resource only after a complete scan, an unchanged scope fence, positive absence of its old file and a matching SQL deletion baseline. Reappearance during this check prevents deletion. Completion is rechecked before clearing obsolete `IndexIssue` records.

The managed store remains the source of file/binding evidence. SQLite timestamps or receipts cannot authorize filesystem operations. A native save generation is recorded only when current native/Markdown pair evidence agrees; an external native edit is not attributed to an old receipt's generation.

Failures report incomplete reconciliation and retain prior derived content. `IndexIssue` records explain unavailable evidence; source-specific failures can mark Resource rows stale. **A future consumer must honor scan coverage and `IndexIssue`, not treat an old row's presence or status alone as proof of current vault completeness.** Incomplete discovery can conceal another claimant to any identity, so this first implementation conservatively withholds the sweep rather than publishing a partial claim of uniqueness.

There is no claim of atomicity against an arbitrary OS writer racing the final check and SQL commit, nor a multi-Resource transaction. Each Resource publication is transactional. External modifications are detected by the evidence checks and subsequent explicit reconciliation. This preserves the accepted managed-store boundary rather than inventing stronger filesystem guarantees.

## 3. Format and fidelity matrix

| Authored state / format | Result |
|---|---|
| `.mutable.json`, native v1 with graph v1/v2 | Uses `decodeNative` and the existing Resource-to-repository read representation. Native identity, reserved-version validation and graph-2 boundaries remain intact. |
| Legacy Block-tree `.json`, including `main-list-block` and `membrane-block` | Uses the existing Block codec and repository validation. Preserves authored type aliases and opaque IDs. Missing/duplicate identities are rejected without minting replacements. |
| `codex-history-document` v1 | Uses its existing validated current-state decoder. No archive replay or reinterpretation of audit/History ownership. |
| `speedy-workspace` v1 | Uses its manifest validator and root Block codec. Stores authored root structure and resource descriptors; does not fetch or flatten referenced Documents. Resource-only descriptors without a known Block target remain raw descriptors, not invented Block edges. |
| Legacy Workspace trees | Existing Block codec preserves the serialized embedded structure. This does not enroll embedded definitions as new independently saved Resources. |
| Persistent Blocks, including retained definitions | One row per authored definition. Retained unplaced content is included; reference cycles do not duplicate bodies or become ownership. Runtime Cells are not separate persistent Block rows. |
| BlockProperties | Raw bags and tagged values retained; scoped authored ID stored separately from index-only UUID. Unique authored property identity survives reorder. ID-less duplicates remain distinct. Ambiguous repeated IDs retain ordinal provenance and an incomplete diagnostic. |
| Children, references, margins, superposition relations | Preserve placement identity where the format has one, source, target, slot, ordinal and owned/reference kind. Legacy placements get deterministic index-only identities. Unknown opaque relation bags are retained without inventing semantic edges. |
| Graph-2 owned-external Documents | Preserve the owned edge, target Resource/Block IDs and complete external descriptor. Do not flatten or load the child Resource. |
| Anchors | Project `anchor-to` as a presentation relation with the authored anchor/offset bag; structural ownership remains separate. |
| Linked/cross-Block annotations | Definitions remain with their authored owner; segments retain raw payload, segment identity, logical grouping, definition provenance and resolution evidence. Local shared-definition changes update affected consumers in the next Resource projection. |
| External/missing definitions and targets | Preserve unresolved descriptors/assertions. Do not manufacture Entities or resolve definitions from unsaved live state or a potentially stale SQL row. Foreign definitions remain explicitly unresolved in this stage. |
| Standoff ranges | Convert inclusive saved endpoints to SQL half-open ranges once. Preserve Cell versus UTF-16 coordinates. Unrepresentable ranges fail staging rather than publish an incomplete replacement. |
| Unicode / inline objects | Existing canonical text-run reader supplies boundaries, including surrogate interiors and inline-object breaks. Image payloads remain in the raw Block projection; FTS phrases cannot bridge separate runs. |
| Plain-text and text Blocks | UTF-16 text runs preserved. FTS is lexical infrastructure, not a replacement of C2 matching semantics. |
| Opaque/application hosts | Persist authored structural rows/bags, while excluding hosted text and its owned descendants from search according to the shared extraction policy. No application is executed or mounted. |
| Unknown/rich values | Existing authored-value grammar preserves undefined, non-finite numbers, negative zero and escaped user tags in raw bags/values. SQL scalar columns are supplementary projections. |
| Title, tags, attribution | Native title/tags remain authored values; paths are independent. Missing authored actor/timestamps stay null rather than becoming indexing attribution. |
| Entity, curated/imported aliases, Relationships, Actor | Reconciliation and confirmed file deletion do not modify canonical database knowledge. No automatic Entity creation/import or alias service was added. |

Ordinary Markdown, `.ink` compatibility, legacy graph/Entity seed import and standalone experimental envelopes without an admitted file-format adapter remain outside P2. Unsupported/malformed JSON candidates report incomplete inspection. No format is invented to make them pass. Native Resources stored at unsupported suffixes are not silently treated as legacy Documents.

## 4. Incremental indexing and the oracle

Full mode replaces every persistent Block and its dependent derived rows for R, removing stale source rows and recreating FTS entries transactionally. It is the correctness oracle.

Incremental mode decodes and constructs **the same complete projection**, reads the previous SQL projection and compares normalized per-Block bundles. It replaces only changed/added Blocks, removes absent Blocks and updates Resource/tag evidence. Definition-owner changes can therefore update segments in otherwise text-unchanged Blocks. No caller-supplied changed list can accidentally omit a dependent segment.

Qualification compares the complete derived state after both modes across ordinary edits, Undo and a new branch, title/tags changes, shared-definition changes, Block addition/removal and repeat reconciliation. A forced failure before commit proves that Resource evidence, rows and FTS roll back together.

The recorded 101-Block control changed **one Block and left 100 unchanged**, with full/incremental derived equality. The recorded end-to-end runs were approximately **356 ms full / 324 ms incremental** on the P1 M1/8-GiB host, while other regressions were running. These are bounded correctness observations, not isolated performance measurements or P6 qualification. Both modes still decode/read/compare the whole Resource, and the host validates the vault scope. This stage does **not** claim delta-only decoding, resource-local discovery/admission, or work proportional only to changed Blocks. No indexing is attached to typing.

## 5. Qualification results

| Gate | Evidence |
|---|---|
| Foundation + worker/filesystem indexing | **58/58 Node tests passed**, including the retained 41-test P1 foundation gate. |
| Actual producer/codec and SQL differential checks | **9/9 passed** in `saved-projection.test.tsx`. |
| Native B1/B1.1/B1.2, Workspace, native relocation/restart and saved-scope regressions | **124 existing tests passed**, in addition to the projection tests included in that run. |
| Saved lightweight-reader / live observer / knowledge-session regressions | **92 existing tests passed**, in addition to the 9 projection tests included in that run. |
| Typecheck and application/server build | Passed. Existing client chunk-size warning remains. |
| Built worker/host + real legacy samples | **8/8 independently reconciled**: 424 Blocks, 238 BlockProperties and 80 Standoff segments. Every source file hash was unchanged. |
| Built 101-Block control | Full/incremental equality and one changed Block confirmed; integrity, FK and FTS checks passed. |

The eight real legacy samples are `20240830.json`, `20240902.json`, `20240914.json`, `Israfel.json`, `TLS.json`, `animation.json`, `blur.json` and `bullet-tabs.json` from the existing `data` directory. They were read independently into a disposable database, **not** merged by guessing whether repeated IDs across historical copies should be adopted. This is not a claim that the entire mixed legacy collection has unambiguous vault identity.

[Recorded runtime/sample evidence](docs/qualification/sqlite/p2-runtime.json) contains source hashes, row counts, diagnostics, configuration context and the control result. No authoritative file or existing user database was changed by qualification.

The filesystem gate includes:

- full reconciliation, external saved edits, repeat reconciliation, restart and identity-preserving location changes;
- real managed native-pair relocation with native/Markdown bytes and generation unchanged;
- rejection of silent external native rebinding and withholding publication while pair recovery is pending;
- duplicate Resource IDs, duplicate Block IDs, malformed files, symlinks and inspection failure remaining incomplete rather than becoming deletion evidence;
- source edits/new duplicates/cancellation between staging and commit, superseded tokens, changed SQL baselines and file reappearance during deletion;
- preservation of canonical Entities, curated aliases, Relationships and other Resources' incoming reference assertions after confirmed deletion;
- read-only rejection, CLI rebuild from authoritative files, and cleanup of obsolete diagnostics only after a successful sweep.

## 6. Limits and P3 handoff

**No architectural conflict required changing the accepted authority model.** The following limits are deliberate and visible:

1. Foreign definition resolution remains unresolved even if another saved Resource happens to be present in SQL. P3 must not mistake a fallback value or unresolved row for a verified resolved mention. A later saved-definition resolver needs current provenance/generation evidence; this stage neither guesses such evidence nor reads live unsaved definitions.
2. The first host sweep is conservative: unsupported/unreadable JSON can conceal identity ambiguity and withholds successful reconciliation. Mixed legacy seed/graph directories are not automatically treated as a clean Block-resource vault. P5 import is unchanged. Missing IDs, unsupported envelopes and unrepresentable annotation ranges produce explicit unavailable results, preserving the last good derived state.
3. Incremental SQL writes are qualified; extraction remains whole-Resource and full-decoder based. The 20-MiB input limit, 40-MiB queued byte budget, 32-request queue and one staged Resource bound transport/staging. Synchronous codec work is off the host thread; cancellation is checked before publication, while worker timeout/termination supplies the coarse interruption boundary. Typical/Large performance, pathological shapes, retained memory and broad disk/power-loss tests remain P6 work.
4. This is explicit saved indexing infrastructure and a CLI, **not application consumer rollout**. P3 must compose scheduling after qualified saved publication/refresh, preserve live-over-saved suppression and existing navigation revalidation, and honor incomplete/stale coverage. The indexer itself has no save, binding or navigation authority.
5. No audit delivery, Entity service/UI replacement, imported Entity knowledge, new Workspace format, watcher, synchronization, filename migration or History retirement has been added. No observed aliases are fabricated from unavailable Entity definitions. P1's canonical alias-origin distinction remains intact.

## 7. Running it

Build first, and initialize only an explicitly selected vault:

```sh
npm run build:server
npm run sqlite -- init --vault /absolute/vault
npm run sqlite -- reconcile --vault /absolute/vault
npm run sqlite -- reconcile --vault /absolute/vault --incremental
npm run sqlite -- rebuild-derived --vault /absolute/vault
npm run sqlite -- verify --vault /absolute/vault
```

`reconcile` defaults to full mode; `rebuild-derived` always uses full authoritative reconciliation. It does not clear everything before inspecting files. `clear-derived` remains an explicit invalidation operation and does not claim to repopulate data. An incomplete CLI reconciliation exits unsuccessfully and returns diagnostics.

Reproduce the bounded evidence with `npm run test:sqlite`, `npm test -- src/knowledge-sqlite/saved-projection.test.tsx`, and `node scripts/qualify-sqlite-p2.mjs` after the server build. The evidence script uses disposable SQLite state and checks real source hashes without altering those files.

**Stopped at the P2 review gate. P3 has not begun.**
