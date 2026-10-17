# Phase 3.6 Stage C — Reader Experience

Date: 2026-10-17  
Status: Implemented, qualified and accepted. Stages A–B are accepted. Stage D is separately authorized and tracked in the [consolidated qualification](MUTABLE_PHASE_3_6_QUALIFICATION.md).

## Use in Flint

Open **Publish to Web…**. New sites use **Public Reading**, the Reader theme and public-content search. Existing profiles retain their previous script-free behavior until **Configure Reader themes and search** is chosen. The existing default-enabled `webPublishing` flag and application-service gate cover Stage C; no parallel publishing implementation or editor listeners are introduced.

Reader settings offer Reader/Compact, system serif/sans serif, 16/18/20/22 px text, 60/72/84-character reading width, 1.4/1.6/1.8 line spacing, three contrast-conscious palettes, and system/light/dark appearance. These are validated tokens, not arbitrary CSS, fonts or scripts. **Static Reading** disables search and previews and emits no JavaScript. Settings remain explicit site-profile operations; source titles, filenames and native saves do not silently change routes.

For **Public Research**, first save the site's scope and reading settings. Choose current-Vault PackageData extraction or select an exact frozen PackageDataBlock for each document requiring context. **Load semantic disclosure candidates** performs a bounded, cancellable, read-only host inspection. Select individual records and optional fields, choose **Use these reviewed fields**, review/save the site settings, then request a fresh publication review and approve its actual disclosures. A changed scope, input or chosen context invalidates the stored semantic fingerprint and requires another review.

## Rendering and privacy

Both themes share semantic HTML templates, responsive images/tables, visible focus, system fonts, reduced-motion rules and native controls. No editor chrome, Three.js runtime, framework, SQLite, application-service client or privileged bridge ships with the site.

Search contributions are built from the **public projection's** title, headings and text. The generator consumes per-document receipts and writes bounded shards rather than accumulating all documents. Unicode NFKC normalization and lowercasing are shared between generation and querying. Exact normalized words match with title/heading weights, deterministic score/route ordering and bounded results. Approved research detail text can contribute; omitted fields, archival rows, original filenames and private metadata cannot.

The bundled runtime loads only generated local files. Queries are coalesced for 150 ms, cancel superseded fetches and reject stale results. Shards load lazily; a 4 MiB LRU cache is shared with small detail previews. Searches yield between bounded batches. Results use `textContent`, not authored HTML. There is no analytics, external network acquisition, browser database, service worker or persistent reader state.

Research uses the existing PackageData extractor/validator and an allowlisted public DTO. Required fields are the individually selected record's name and kind label, plus occurrences in published pages. Description, curated/imported aliases, Claim statement and Time expression each require selection. Observed aliases, arbitrary attributes, relationships, Claim participants/qualifiers/evidence, actors, raw rows and schema are never exported. Selecting a Claim does not disclose the names of participants returned by extraction's relational closure.

Current-Vault extraction uses one bounded union snapshot, with adjacent discovery and optional relationship/evidence/actor expansion disabled. Frozen context is selected explicitly; it is never enriched from live data. Equal canonical IDs in different frozen contexts receive different site-local public identities. Known inactive Entity/Time/Claim references from imported packages can be offered for **explicit frozen-context publication review**. Unknown types remain ineligible. This read-only interpretation does not activate or alter any native annotation or canonical record.

Public IDs are opaque, derived from site identity, chosen context identity and semantic target. Canonical IDs, context Block IDs and consistency hashes remain private. Public detail pages contain reviewed fields and in-scope occurrence links. Static links work without JavaScript. Optional **Preview** buttons open a small local detail region, support keyboard activation/Escape, expose expanded state and restore focus when closed. Editor SVG styles are not shipped; the review notes the approximate semantic link representation. Point references appear in the document's reviewed-reference list. Overlapping reference ranges use one inline destination to avoid invalid nested anchors; every approved target remains available in the reference list and detail-page occurrences.

## Service and recovery boundaries

Contracts, host workflows and filesystem/knowledge adapters remain separate. New research source/candidate operations receive an explicit site/revision and remain bound to the authorized Vault instance. They provide no SQL, arbitrary path or shell authority. Candidate loading is an explicit read-only review request; closing its dialog cancels that request. Admitted publication review/build jobs remain backend-owned and durable.

Jobs capture the selected semantic DTO and private context fingerprints. Live consistency hashes exclude extraction timestamps/metrics, but include the selected table values. Context and saved-input revalidation occurs at review/build/resume boundaries. A stale context cannot advance the active release. Raw archival datasets are not copied into public artifacts or search; the filtered DTO is sufficient for rendering the pinned reviewed disclosures.

Reader CSS/JS, search shards, semantic pages and normal document pages share one sealed release manifest. Additional artifacts use a private `reader` unit; directory page receipts retain their search contribution and approved occurrence map. A failure or interruption cannot publish a partial search/semantic bundle. Resume verifies existing receipts; semantic context inspection is repeated for consistency. This does not introduce Stage D reuse between separate builds.

Preview/ZIP accept only the specific generated reader filenames in addition to existing page/image paths. Interactive pages permit trusted same-origin scripts/data; script-free pages retain the stricter meta policy. Preview headers still deny frames and provide no application endpoints. Credentials are omitted from runtime fetches. Relative paths work beneath an ordinary static-host subdirectory. An exported site operates independently after the Mutable host closes.

Native writes, dirty state, Command-S, editor snapshots, Undo/Redo, caret/selection and IME ownership are unchanged. Publication remains an explicitly invoked operation, with no work attached to ordinary typing.

## Bounds

Stage A/B source, asset, output, executor, retention and ZIP limits remain. Stage C adds:

| Resource | Bound |
| --- | --- |
| Search | 32 MiB total, 1 MiB/shard/contribution; no silent text truncation to fit. |
| Browser query | 256 characters, 16 distinct normalized words, first 100 results; 4 MiB shard/detail cache. |
| Semantic context | 500 combined distinct context/Entity/Claim seeds; existing 5,000-row / 8 MiB extraction limits; 16 MiB aggregate selected frozen/live context values. |
| Semantic review | 500 candidates/selections, 512 KiB candidate list and 512 KiB selected bundle; 20,000 document-target pairs and public occurrences. |
| Fields | Names/kind labels/aliases at most 200 characters; optional text fields at most 4,000; at most 20 curated/imported aliases per target. |
| Detail page | 64 KiB, including occurrence links; explicit refusal if exceeded. |
| Reader extras | 48 MiB generation budget, within the existing complete-release 128 MiB / 2,002-file ceiling. |

Over-budget work fails with a narrowing/disable-search diagnostic. These lower semantic disclosure ceilings keep review, HTTP and durable metadata bounded; they do not raise the archival extractor's authority or limits.

## Qualification

The regression run passed **241 tests in 25 files** (231.22 s), covering publication A/B/C, application services, native persistence, clipboard, interchange, package/collection operations and Cavern boundaries. A final focused run against rebuilt workers passed **14 tests in 3 files** (66.75 s), including all seven Reader host tests. These counts overlap; they are not 255 distinct tests.

Stage C tests exercise both themes and script-free output; Unicode normalization/weighting; shard and aggregate search-budget refusal without truncation; reading-reachable references; overlapping links; actual SQLite PackageData extraction; individual optional-field disclosure; private metadata, observed alias, unrelated entity and Claim-participant canaries; stale context rejection; real package-imported inactive references; independent frozen contexts sharing original IDs; unchanged native bytes; and interruption after release sealing before the active pointer advances. The recovered release includes the complete search bundle. Existing A/B cancellation, conflict, source revalidation and durable receipt tests remain passing.

Client/server builds and TypeScript checks pass. Client build warnings about existing large chunks remain.

### Browser and static-host qualification

Chrome **155.0.0.0**, macOS, passed both the A/B script-free directory workflow and the Research workflow through the actual Flint menu/dialog. The latter chooses Compact, loads live disclosure candidates, selects a name and description, saves settings, approves the publication review, builds, opens isolated preview and downloads/verifies the ZIP. Both runs verify unchanged native bytes and editor revision, zero editor snapshots, and no preview opener access. The probe was corrected to await completion of profile saving before clicking the saved-native checkbox; no production change was required.

The separate reader probe builds Research and Compact releases, closes Mutable's service host, then serves exported files from a plain HTTP server beneath `/research/` and `/compact/`. It passed:

- Lazy search loading, Unicode full-width normalization, weighted results, query limits, rapid-query stale-result suppression, and excluded-data queries returning zero results.
- Keyboard Space activation of previews, Escape dismissal with focus restoration, and Tab navigation into search results.
- No-JavaScript document/detail reading and search fallback; script-free Compact output; relative detail/occurrence links.
- A 375 px viewport without horizontal page overflow, measured light/dark body-text contrast of at least 4.5:1, and reduced-motion rules.
- No external or application-service requests (24 local static requests in the probe); private canaries absent from every exported file.

Safari is installed, but its WebDriver refused session creation because **Allow remote automation** is disabled. That setting was not changed. Firefox is not installed. Safari/WebKit and Firefox are therefore **not qualified by this run**. Keyboard/landmark checks are not a comprehensive screen-reader audit. The static-host probe establishes operation without Mutable or external services, rather than a service-worker offline cache guarantee.

### Matched typing measurements

Six sequential runs used the same Michelangelo letter, 499-character paragraph, eight mounted paragraphs, Normal caret mode and 40 alternating edits. Builds and test suites had finished. The repeated idle/disabled pair reversed feature order. Active-load runs started a real 25-document Reader/search publication job in a disposable Vault and waited for a preparation worker before measuring.

| Run | Synchronous median | Synchronous p95 | Next-frame p95 |
| --- | ---: | ---: | ---: |
| Publishing disabled | 7.6 ms | 28.9 ms | 104.9 ms |
| Enabled, idle | 7.6 ms | 11.6 ms | 142.2 ms |
| Reader/search directory preparation active | 8.7 ms | 11.9 ms | 80.7 ms |
| Enabled, idle repeat | 6.5 ms | 10.2 ms | 79.9 ms |
| Disabled repeat | 11.2 ms | 26.8 ms | 391.8 ms |
| Reader/search directory preparation repeat | 8.2 ms | 11.3 ms | 154.3 ms |

All six recorded **zero editor snapshots, zero application-service requests and zero save-status reads during typing**, restored the starting text, and passed actual Chrome character input and Undo checks. These samples show no consistent publishing-related typing regression. Frame scheduling varied substantially, including with publishing disabled; headless profiling does not establish physical input-to-display latency or a guaranteed frame budget. No unrelated editor optimization was introduced.

The short load probes stopped their still-preparing jobs during cleanup; complete release generation is qualified separately by host/browser tests. Sampled host RSS, including Vite and preparation workers, was 200/136 MiB. This is not a maximum-size search throughput benchmark. Stage B's existing 1,000-document qualification remains separate; Stage C explicitly tests shard and aggregate search limits without claiming a new 1,000-document search benchmark.

Raw results and CPU profiles are under `/tmp/publication-c-{off,idle,load,idle-repeat,off-repeat,load-repeat}`. Regression/focused logs are `/tmp/publication-c-regression-final.log` and `/tmp/publication-c-reader-final.log`; browser logs are `/tmp/publication-c-browser-ab.log`, `/tmp/publication-c-browser-ui-2.log` and `/tmp/publication-c-reader-browser-final.log`. Local documentation links and `git diff --check` pass. Controlled fault injection covers the recorded interruption case; physical power-loss testing is not claimed.

Reproduction:

```sh
npm run build:client
npm run build:server
npm run typecheck
npx vitest run --maxWorkers=1 --minWorkers=1 src/interchange src/runtime/clipboard.test.ts src/runtime/document-interchange.test.ts src/runtime/collection-interchange.test.ts src/persistence src/publication server/native-document-store.test.mjs server/application-services server/cavern-lifecycle.test.ts server/collection-store.test.ts
PUBLICATION_DIRECTORY=1 node scripts/check-publication-browser.mjs
PUBLICATION_DIRECTORY=1 PUBLICATION_READER_UI=1 node scripts/check-publication-browser.mjs
node scripts/check-publication-reader-browser.mjs
BENCHMARK_WEB_PUBLISHING=false BENCHMARK_OUTPUT=/tmp/publication-c-off node scripts/benchmark-flint-typing-browser.mjs
BENCHMARK_WEB_PUBLISHING=true BENCHMARK_OUTPUT=/tmp/publication-c-idle node scripts/benchmark-flint-typing-browser.mjs
BENCHMARK_WEB_PUBLISHING=true BENCHMARK_PUBLICATION_LOAD=1 BENCHMARK_PUBLICATION_DIRECTORY_LOAD=1 BENCHMARK_PUBLICATION_READER_LOAD=1 BENCHMARK_OUTPUT=/tmp/publication-c-load node scripts/benchmark-flint-typing-browser.mjs
```

Build client then server: the client build clears server worker artifacts. Do not rebuild during worker qualification. Run typing measurements separately from builds/test suites and unrelated scale work.

## Limitations and acceptance boundary

Interactive search/previews are supported through static HTTP, including offline loopback hosting. Direct `file:` reading/detail links remain useful, but browser-specific `file:` fetch/CSP behavior is not an interactive-runtime guarantee. This milestone does not deploy a hosting provider or generate themes from arbitrary code.

Search supports normalized whole words, not prefixes, stemming, fuzzy/semantic search or arbitrary-language segmentation. Fixed public palettes replace an unrestricted colour picker. Research does not expose relationship graphs, evidence, actors, participant expansion, general archival tables or live knowledge APIs. Large fields/candidate sets require narrower disclosure rather than silent truncation. Unsupported and unresolved semantics retain readable text.

Existing Stage A/B and Phase 3.5 browser/storage maintenance limitations remain. Stage C introduced no Stage D incremental builds/maintenance, synchronization, archive mounting, multi-Vault lifecycle changes, Phase 4 or Electron/Tauri packaging. Subsequent work has its own qualification and acceptance gate.
