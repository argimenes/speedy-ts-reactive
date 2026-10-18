# Academic Resource Loaders — Milestone B Qualification

18 October 2026 · Implemented and submitted for acceptance. Milestone A remains accepted; Milestones C–D have not begun.

## Access and implementation

After restarting the application backend, copy a Wikipedia article URL and use **Command-Shift-V / Control-Shift-V** in a document. The default-enabled `academicResourceLoaders` flag controls both DOI and encyclopedia acquisition. Plain paste and ordinary typing do not request encyclopedia data.

The inserted **WebArticleBlock** displays a retained reading copy, revision, capture date, attribution/license and a permalink. **Acquire Wikidata … for review** explicitly retrieves the declared subject's metadata. Each offered statement has an individual **Accept as Claim** or **Reject** action; acquisition itself accepts nothing. **Convert to editable Ink…** creates native text through the existing conversion/insertion pipeline after a loss confirmation. Document insertion and conversion have ordinary one-step Undo/Redo and manual-save semantics. Claim review changes Vault knowledge independently of document Undo, as explained before acceptance.

See the [updated architecture and implementation plan](MUTABLE_ACADEMIC_RESOURCE_LOADERS_ARCHITECTURE_AND_IMPLEMENTATION_PLAN.md), especially Section 14.

The implementation reuses existing services rather than introducing another document or annotation model:

- Lightweight recognition accepts language/mobile Wikipedia article URLs and explicit oldid URLs. The supplied URL is retained separately from canonical page identity and the resolved endpoint. Diff/edit/history views and non-main-namespace pages are outside the article loader.
- The protected host resolves redirects/page identity, selects a revision, requests `action=parse&oldid=…`, and verifies the returned page/revision. Both original JSON responses are stored byte-for-byte as immutable managed assets. The parse response contains the retrieved HTML and wikitext.
- Wikipedia article identity is `(site, page ID)`. It has its own canonical WikipediaArticle Entity/resource, distinct from its subject. An accepted Wikidata QID maps the subject separately; language editions share that subject only through the QID, never title similarity. Missing QIDs leave the article without a fabricated subject.
- Current page-properties association is explicitly distinguished from historical article content. Oldid pins the article revision, but parser output can use templates as they exist at retrieval. This is not historical reconstruction of every transclusion.
- SourceSnapshot pins identity, revision, endpoint, retrieval time and original asset references. Native article occurrences have independent Block identities and a safe display projection. Repeated capture of the same page/revision reuses its canonical snapshot; a new revision creates a new capture without changing existing Blocks.
- Wiki acquisition, normalization, storage and review use typed Vault-scoped application operations. The host owns filesystem journals and original-asset access; the bounded TypeScript worker owns parsing/normalization. Generic entity/semantic authoring cannot bypass the ingestion boundary. The browser cannot submit arbitrary statement bodies for acceptance.
- Wikidata enrichment captures one entity response, not a graph. The fixed review property set is P31, P279, P106, P27, P569, P570, P19, P20, P571 and P856. It offers at most 50 statements, preserving statement ID spelling, rank and somevalue/novalue states.
- Acceptance uses the existing Claim model, subject ClaimParticipant and canonical transaction/audit ledger. Versioned Claim attributes preserve provider/QID/revision, snapshot/resource IDs, property, typed value, qualifiers/order, references, source-imported origin and accepted review status. SourceClaimReview records accepted/rejected decisions. Rejection creates no Claim; existing authored or imported assertions remain unchanged. Conflicting values can coexist with provenance.
- WebArticleBlock uses the existing script-free sandbox, CSP and bounded CSS sanitizer. It makes no provider request on mount; a view-owned worker sanitizes the saved display projection before rendering. External links are deliberate links outside the sandbox; images/media remain inert placeholders.
- Conversion reuses semantic HTML conversion and whole-Block replacement. Resulting Blocks retain source URL/resource/snapshot/revision provenance. Text and formatting become native standoff content; no generalized anchor engine was introduced.

## Automated qualification

**174 selected automated tests passed:** 128 Vitest tests across ten files, plus 46 Node SQLite/network tests. After the final bounded-review, concurrency and UI changes, the affected 17-test subset passed again. These totals do not double-count reruns and do not claim an entire-repository test run.

`npm run typecheck` and `npm run build` passed. Vite still reports its existing large-chunk warning. No unrelated build or editor refactor was undertaken.

| Scenario | Exercised result |
| --- | --- |
| Recognition | Passed language/mobile URLs, retained query/fragment provenance, oldid, malformed/credentialed/lookalike hosts and unsupported diff/edit inputs. |
| Redirect and revision consistency | Passed redirect fixture, explicit second-request oldid, exact page/revision comparison and rejection of mismatched page/revision responses. The original lookup and parse bytes remain separate retained evidence. |
| Unsafe HTML | Passed removal of scripts, frames, active attributes and remotely loaded images; browser preview uses an empty sandbox and a no-network CSP. No HTML executes in the editor document. |
| Missing QID | Passed projection without page-properties QID; no QID is inferred from title or text. |
| Article/subject distinction | Passed independent article and subject identities; English and French article fixtures use different resource/article identities and the same accepted subject QID. |
| Concurrent capture | Passed two independent service instances sharing the fixture Vault: one accepted identity and snapshot for the same article/revision. This is not a multi-process load test. |
| Original retention | Passed managed-asset bytes equal the original revision-response fixture. Published source assets are independent of document history. |
| Bounded enrichment | Passed fixed property selection, 50-statement review limit, mismatched QID rejection, rank, no-value/unknown-value preservation and unsupported value diagnostics. Live lowercase statement IDs and multilingual-label fallback have regression coverage. |
| No automatic acceptance | Passed: acquisition leaves the existing authored Claim count unchanged; browser shows review controls before any decision. |
| Conflicting authored assertion | Passed: a contrary authored Claim is visible during review and remains byte-for-byte unchanged after accepting a new imported assertion. No name/type/identity merge occurs. |
| Qualifiers/references/provenance | Passed accepted Claim retains typed qualifier data, source references, rank, snapshot identity, revision and review status. No text evidence coordinates are fabricated. |
| Rejection and repeat acceptance | Passed rejection without Claim creation, unsupported acceptance refusal and idempotent repeated acceptance. Review performs no new provider acquisition. |
| Review transaction failure | Passed injected interruption: Claim and review record roll back together. |
| Lost acknowledgement / restart | Passed canonical commit followed by lost acknowledgement, service recreation, interrupted-journal inspection and explicit resume without reacquisition or duplicate identity. Completed results replay with acquisition disabled. |
| Cancellation / stale destination | Passed cancelled acquisition without canonical publication; clipboard cancellation or typing before completion prevents late article insertion. Cancelled conversion leaves the original article intact. |
| Native insertion / history | Passed independent article Block, historical URL, article/subject Block references, one-step Undo/Redo and no repeat request. |
| Native conversion / annotation path | Passed native standoff paragraphs and formatting, per-Block provenance and exact Undo restoration of the original captured Block. The real browser check confirms native bold standoff properties after conversion. |
| Service boundaries | Passed typed HTTP adapter, real preparation worker and real Vault SQLite host through import, enrichment and acceptance. File URLs/extra SQL fields and semantic-authoring bypass attempts are rejected. |
| Derived rebuild / archival rows | Passed clearDerived preserves captures/reviewed knowledge; package closure includes the selected Claim's review and source rows. Existing backlink/index, package and Foundation regression suites pass. Full original-binary reconstruction is not claimed. |
| Schema compatibility | Passed schema 3 → 4 migration preserving existing DOI identity and SourceSnapshot bytes, with foreign-key integrity. Milestone A's DOI suite passes against the current schema. |
| Typing work isolation | Passed zero new preview preparation, network calls or repository snapshots from typing in an unrelated paragraph while an article view is mounted. Existing Flint backlink bounded-work tests pass. |

## Actual browser qualification

`scripts/check-encyclopedia-browser.mjs` passed in **Chrome 155.0.8059.80 on macOS**, using an isolated profile and trusted OS clipboard/Meta-Shift-V. It exercised:

1. Wikipedia dispatch and original-URL retention.
2. One-step insertion Undo/Redo without a second import request.
3. Isolated sanitized reading view.
4. Explicit enrichment and acceptance, including display of an existing conflicting assertion.
5. Review leaving the document revision/history unchanged.
6. Explicit conversion into native standoff text with provenance and formatting, then exact article restoration by Undo.
7. Native capture and reopen into a new editor with the service unavailable; offline display makes no service request.

There were three service requests: import, explicit enrichment and explicit review. The browser exercise uses deterministic application-service responses in the real editor runtime. HTTP/worker/SQLite behavior is exercised separately by service tests. This is not a claim of a full-Flint live-provider end-to-end browser session.

## Live provider smoke tests

Protected acquisition and the actual Node normalization worker were exercised separately against live providers. No live response was committed to the user's Vault.

| Resource | Observed capture | Result |
| --- | --- | --- |
| English Wikipedia: Douglas Adams | Article revision **1380668285**; lookup 399 bytes, parse response 708,518 bytes; acquisition 3,792 ms | Identity/revision validation passed. Sanitized reading projection contained 181,756 characters. |
| Wikidata: Q42 | Entity revision **2557857485**; response 323,808 bytes; acquisition 1,899 ms | 15 configured-property statements offered. One oversized statement was marked unsupported for acceptance. |

Live data required two compatibility corrections: statement IDs can have a lowercase `q42` prefix, and a display label can use language key `mul` instead of `en`. Both are now handled while retaining original statement IDs. The deferred P570 statement was 13,180 bytes in compact UTF-8 JSON, above the 12,000-byte accepted-statement budget; its full data remains in the immutable original.

The API approach follows MediaWiki's documented [revision queries](https://www.mediawiki.org/wiki/API:Revisions) and [oldid parsing](https://www.mediawiki.org/wiki/API:Parsing_wikitext), and uses [Wikidata EntityData](https://www.wikidata.org/wiki/Special:EntityData/Q42.json) for a single entity capture. Endpoint availability and observed timings are not service guarantees.

## Typing measurements

Three completed rounds used the existing real-Chrome typing benchmark with 250 paragraphs / 25,000 characters and 40 edit samples per condition. Conditions were the academic flag disabled, enabled-idle and a controlled pending Wikipedia acquisition. These are feature-disabled controls in the current tree, not a pre-change checkout. The pending response models network waiting, not sustained backend CPU contention.

| Condition | Run means | Median run mean | Per-run p95 |
| --- | --- | ---: | --- |
| Disabled | 4.92 / 3.54 / 3.69 ms | 3.69 ms | 11.6 / 5.3 / 4.8 ms |
| Enabled, idle | 2.43 / 3.38 / 1.98 ms | 2.43 ms | 3.4 / 3.5 / 2.9 ms |
| Enabled, acquisition pending | 3.21 / 3.98 / 2.15 ms | 3.21 ms | 4.3 / 7.6 / 3.7 ms |

All nine runs recorded **zero repository snapshots**, preserved unrelated character DOM, restored text and passed the benchmark's edit/Undo/Redo assertions. Disabled/idle made zero encyclopedia requests; pending made one explicit initial request and none from typing.

Timing was variable. Pending runs were 0.17–0.78 ms slower than enabled-idle, but did not consistently deteriorate relative to the feature-disabled control. The first disabled run overlapped the separate browser probe during startup and is not a clean isolated timing comparison. These observations and bounded-work tests do not demonstrate a significant feature regression, but are not proof of equivalent latency under arbitrary load.

Two earlier batches were incomplete due to a development reload and a CDP evaluation timeout; they are excluded from this table. The completed batch used Chrome's `--disable-background-timer-throttling`, `--disable-renderer-backgrounding` and `--disable-backgrounding-occluded-windows` switches in a temporary launcher to reduce headless scheduling stalls. No application behavior or production browser flags were changed. Safari/Firefox and physical-device latency are not qualified.

## Migration and operational limits

[0004-encyclopedia.sql](src/knowledge-sqlite/migrations/mutable/0004-encyclopedia.sql) broadens accepted identity namespaces, adds SourceSnapshot's identity/revision key and introduces canonical SourceClaimReview receipts. The migration rebuilds the small identity/snapshot tables inside the existing migration transaction, preserving their previous rows. Mutable knowledge schema becomes **4**; audit and native document envelope versions are unchanged. Previous schema-3-only binaries cannot safely write the migrated database. No active user Vault was migrated by these tests; normal backend startup applies the migration when the writable Vault is opened.

Limits are one active encyclopedia operation and at most 16 accepted in-flight operations per service instance; 60-second active workflow, 15-second network and 30-second worker deadlines; 2 MiB per response; two responses per article capture, one per enrichment; 50 review statements and 12,000 bytes per accepted source statement. Existing job/worker limits and conservative original-asset retention remain in force. Existing-claim review summaries show at most 100 rows and 2,000 expression characters each. No automatic retry, graph traversal, media download or canonical garbage collection was added.

## Limitations, failed and untested cases

**Final executed functional checks:** none failed. The interrupted benchmark attempts above are retained as harness limitations, not reported as passing runs.

- Supported Wikidata carriers are item IDs, string/external-ID/URL values, time, quantity, monolingual text and somevalue/novalue. Coordinates, media/math/geoshape/tabular-data carriers, property/lexeme/form/sense IDs and other unsupported carriers are not accepted. An unsupported qualifier or reference also defers the whole statement. Original bytes preserve these values; oversized review projections omit detailed fields with a diagnostic rather than truncating an accepted Claim.
- Typed values, qualifiers and references remain faithful versioned Claim attributes. They are not all promoted to indexed ClaimQualifier/Time/Entity records. No referenced-entity graph is fetched or synthesized. P31 acceptance does not silently rewrite an Entity's type. Canonical subjects initially use their QID as a conservative label; captured English/`mul` names and descriptions are displayed without overwriting canonical labels or creating aliases.
- Accept/Reject receipts are immutable per snapshot/statement in B. Reversing a decision or replacing an accepted assertion requires future explicit review-maintenance design. A new provider revision is a new capture and needs fresh review. There is no automatic conflict reconciliation or snapshot refresh of existing Blocks.
- Page-property QID association is current at capture, even when the requested article oldid is historical. Templates may be expanded from their retrieval-time state. Exact retained responses do not establish historical template or historical subject-association reconstruction.
- Preview links/anchors are inert; safe external HTTP(S) links are offered separately, capped at 100. Images, math/SVG, media, scripts and unsupported presentation semantics are omitted or shown as placeholders. Native conversion preserves readable text/formatting within existing converter limits, not Wikipedia's full layout, footnote interaction or wikitext semantics. Oversized/complex conversion can fail without replacing the original.
- Native standoff annotations target the converted derivative's cells. There is no reverse coordinate mapping into original wikitext, an iframe selection, templates or spatial resources. Conversion retains source/snapshot provenance; it does not itself create annotation instances or a general ResourceAnchor implementation.
- `.inkpkg` preserves native display data and selected canonical identity/snapshot/review rows, but its image-only binary profile still omits original JSON captures and reports that limitation. Full cross-Vault original reconstruction is not qualified. No new publication projection was implemented for WebArticleBlock.
- Recovery operations are typed inspect/resume APIs plus existing job listings, not a new job-management UI. Review results belong to canonical knowledge and cannot be undone by undoing a document insertion. Cancelling late can leave published shared captures/knowledge retained, while stale document insertion is prevented.
- **Untested:** Safari/Firefox, Windows/Linux native clipboard, full-Flint live provider end-to-end interaction, physical power loss/process-kill during this workflow, multiple independent OS processes contending, live provider outage/rate limiting, simultaneous many-article preview stress and sustained acquisition CPU load during typing. Fault injection, service recreation, actual Chrome fixtures and separate live acquisition/normalization are the evidence exercised.

## Reproduction

```sh
npm run typecheck
npm run build
npx vitest run --environment jsdom --maxWorkers=1 --minWorkers=1 \
  src/interchange/encyclopedia.test.ts \
  server/application-services/encyclopedia.test.ts \
  src/rendering/web-article-block-view.test.tsx \
  src/rendering/mutable-clipboard.test.tsx \
  src/rendering/source-block-view.test.tsx \
  server/application-services/academic.test.ts \
  src/interchange/scholarly.test.ts \
  src/application/flint-backlinks.test.tsx \
  server/application-services/foundation.test.ts \
  src/interchange/package/package.test.ts
node --test --test-concurrency=1 \
  src/knowledge-sqlite/schema.test.mjs \
  src/knowledge-sqlite/entities.test.mjs \
  src/knowledge-sqlite/semantics.test.mjs \
  src/knowledge-sqlite/package-data.test.mjs \
  server/asset-remote.test.mjs
```

With Vite running on localhost:3000:

```sh
node scripts/check-encyclopedia-browser.mjs
BENCHMARK_URL=http://localhost:3000/scripts/academic-browser-fixture.html \
  BENCHMARK_ENCYCLOPEDIA=off node scripts/benchmark-typing-browser.mjs
BENCHMARK_URL=http://localhost:3000/scripts/academic-browser-fixture.html \
  BENCHMARK_ENCYCLOPEDIA=idle node scripts/benchmark-typing-browser.mjs
BENCHMARK_URL=http://localhost:3000/scripts/academic-browser-fixture.html \
  BENCHMARK_ENCYCLOPEDIA=pending node scripts/benchmark-typing-browser.mjs
```

Repeat the three conditions for matched rounds. `CHROME_BIN` can name a launcher that adds the three qualification switches listed above. Avoid editing source during a run: Vite reloads invalidate its measurements. The browser fixture does not require the live application backend or save a user document.

## Douglas Adams conversion regression and bulk import correction — 18 October 2026

The user reported `Maximum call stack size exceeded` when converting the article at `https://en.wikipedia.org/wiki/Douglas_Adams?utm_source=chatgpt.com` into editable Ink. Replaying the previously captured revision **1380668285** reproduced that exact error at `TreeCommands.publish`: `pending.operations.push(...operations)` exceeded the JavaScript function-argument limit. This was not a failed provider request or a worker deadline. The initial B qualification exercised large-article acquisition/normalization but only small native conversions; it did not cover this failure.

The sanitized article has 181,756 HTML characters and converts to 2,158 Blocks plus 90,223 character cells (92,381 content records). The old importer emitted a content operation and a placement operation for each record, exceeding 184,000 primitive operations inside one logical Undo transaction. An initial bounded append fixed the exception, but still retained that intermediate representation and the insert-then-remove work.

The final correction introduces **one bulk structural operation** for prepared fragment insertion and text-fragment paste, and **one inverse bulk operation** for Undo. Source conversion replaces the original leaf in that same commit, without a transaction snapshot or a second removal/pruning pass over the expanded article. Existing identity/ownership checks and durable record capture inspect records through an iterator; they do not flatten the batch into a retained per-character operation array. Native and durable-history wire formats remain unchanged. Original snapshots, provenance, formatting, retained-definition semantics, manual saving and existing cancellation/stale-destination gates are preserved.

**Automated evidence:** 218 selected tests across 17 files passed across the successive targeted runs, without double-counting reruns. This includes clipboard/source conversion, native persistence, full and compact commit capture, durable replay, identity/ownership, resource boundaries, undo-storage parity and bounded typing/splitting checks. The final affected tests passed after correcting a method-name typo in a newly added test. Typecheck and production client/server build passed; the existing Vite chunk-size warning remains.

- `src/block-tree/large-import.test.ts`: roughly 90,000 characters; asserts exactly one commit operation and one inverse operation, no transaction snapshot, exact source restoration, identical imported identities after Redo and retained provenance/formatting.
- `src/block-tree/record-batch.test.ts`: normal and normalized definition ownership, immutable caller isolation, exact full/compact/durable replay, native save/reopen, transaction rollback, malformed references/key maps, identity conflicts, mixed-operation validation and clipboard insertion at a caret.
- Existing view tests retain cancellation/stale-conversion checks and verify unrelated typing causes no preview/network work.

**Chrome 155/macOS:** the browser harness can now replay the saved provider responses using `WIKIPEDIA_CAPTURE_PREFIX`. It uses real editor rendering and preparation workers, with an isolated in-memory document and fixture application-service responses; it does not save a user's document or refetch the article. The full article successfully converted with provenance and formatting, and conversion Undo/Redo restored the original article and native derivative. The initial stack-only fix took **21,734 ms** from conversion request through the automated review/commit; the bulk implementation took **8,442 ms** in the equivalent exercise. A final run using the reported URI and revision metadata took **9,793 ms**; it additionally inserted text through Chrome’s real input path into a converted paragraph, then undid that edit and the conversion separately. These are individual observed runs, not a guaranteed latency or a controlled throughput benchmark. The source remains readable offline. Safari/Firefox and full-Flint live acquisition-to-conversion remain unqualified.

**Matched ordinary typing checks:** three alternating Chrome runs per implementation, using the existing 250-paragraph / 25,000-character / 40-edit fixture. The baseline was an isolated copy of the current source with the changed block-tree files restored to their pre-fix versions. Browser background throttling was disabled identically. Two baseline warm-ups were invalidated by Vite dependency reloads and excluded.

| Metric | Before (three runs) | Bulk implementation (three runs) |
|---|---|---|
| Median edit time, ms | 1.2, 1.4, 2.5 | 1.5, 1.5, 2.0 |
| Mean edit time, ms | 2.69, 2.21, 4.20 | 2.93, 2.36, 2.58 |
| p95 edit time, ms | 4.4, 4.7, 12.9 | 8.7, 3.5, 4.8 |
| Full-document snapshots during typing | 0 in all runs | 0 in all runs |
| Unrelated character DOM preserved | All runs | All runs |

All six runs passed real insertText/Backspace, Undo/Redo, splitting, empty-paragraph deletion and caret/focus checks. The variable timings do not establish a repeatable deterioration. This does not claim uninterrupted interactivity during the large synchronous import commit: record validation and native cell rendering still require substantial work, and the full article takes several seconds to convert.

To replay captured provider responses with Vite running:

```sh
WIKIPEDIA_CAPTURE_PREFIX=/path/to/wiki-live-article- node scripts/check-encyclopedia-browser.mjs
```

The prefix names `0.json` (lookup) and `1.json` (revision parse). These local smoke captures are not bundled into the repository; the committed large synthetic regression is self-contained. The capture harness otherwise retains its small deterministic fixture.

## Acceptance gate

Milestone B is submitted for review with the stated conversion, archival and qualification limitations. Stop here. IIIF Milestone C, Milestone D, Phase 4, synchronization/archive mounting and desktop packaging have not been started.
