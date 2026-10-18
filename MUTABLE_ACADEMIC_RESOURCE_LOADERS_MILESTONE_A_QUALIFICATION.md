# Academic Resource Loaders — Milestone A Qualification

18 October 2026 · Implemented; submitted for acceptance. Milestones B–D have not begun.

## Implementation and access

In an editable document in a writable Vault, copy a bare DOI or a `doi.org` / `dx.doi.org` URL and use **Command-Shift-V / Control-Shift-V**. The existing explicit resource-paste command resolves supported metadata and inserts a native CitationBlock. Ordinary paste and typing do not invoke scholarly acquisition. The default-enabled `academicResourceLoaders` flag gates acquisition; disabling it preserves existing resource-paste behavior and cached citation readability.

The implementation follows the [updated architecture](MUTABLE_ACADEMIC_RESOURCE_LOADERS_ARCHITECTURE_AND_IMPLEMENTATION_PLAN.md), including the approved identity/resource/representation distinctions and future ResourceAnchor direction. No general annotation engine or new non-text anchor implementation was added.

- DOI parsing preserves the supplied string as Block `sourceUrl`, decodes resolver paths once and folds ASCII case only. It does not remove suffix punctuation, normalize Unicode, or merge on descriptive similarity.
- The host uses Crossref's agency lookup, then the Crossref or DataCite metadata API. Fixed provider endpoints reuse public-address/DNS pinning, redirect, content-type, byte and time limits. No publisher crawling, full-text acquisition or author-entity expansion occurs.
- A single canonical transaction creates Entity, accepted ExternalIdentity and immutable SourceSnapshot records. The unique DOI key and existing idempotent ledger converge competing imports on one identity. Provider type is retained; known datasets/software/instruments receive corresponding types, known publications use ScholarlyWork, and other objects default to ResearchObject.
- Exact validated provider-response bytes are published through the existing immutable managed-asset store. Canonical rows retain a bounded metadata projection, provider endpoint, retrieval date, resource/snapshot IDs and original content-hash reference. Independent Blocks can share these records without sharing Block identity.
- CitationBlock displays retained metadata, provenance and an offline indicator without a mount-time request. It offers a DOI link, CSL JSON download and an explicit saved-references query. The fixed citation format is author–year with at most three names followed by “et al.”, title, optional venue and DOI; it is not a named CSL style.
- CSL JSON is an array of items. Name parts remain separate; ORCID/provider-type details use `custom` extension metadata. Unknown CSL types use `document`. No general citation-style processor or BibTeX exporter was introduced.
- A Block-level `codex/entity-reference` participates in live document entity counts and saved index facts/backlinks. It does not fabricate a standoff character range. Ordinary text edits retain the existing narrow reference-change handling.
- `academic.import`, `academic.inspect`, `academic.resume` and `academic.backlinks` are typed operations over explicitly scoped Vault capabilities. Pure normalization runs in the existing bounded preparation worker. The Node host supplies filesystem, asset, protected network and canonical knowledge adapters; the frontend receives no arbitrary SQL, filesystem or proxy capability.
- Durable filesystem jobs checkpoint the exact canonical request before dispatch. Resume verifies the published asset and replays the same operation receipt after an ambiguous commit. Request cancellation, destination validation and document insertion remain separate. Recovery never inserts at an old browser caret automatically.
- Insertion uses MutableFragment and the existing native insertion/history path. Undo removes the occurrence; Redo restores it without acquisition. Shared canonical records and published originals survive document Undo/cancellation. The document is dirty until the user saves; there is no background document save or Markdown sidecar.

The browser check exposed a real keyboard-routing issue: keydown targeted the editor DIV while paste targeted a character SPAN. Explicit-paste intent now compares the resolved editor mount, with a regression test for that target difference.

## Executed qualification

All **183 selected automated tests passed**: 138 Vitest tests across nine files and 45 Node tests across five files. The final affected Vitest subset (69 tests) also passed after the final metadata/CSL/backlink changes. These are targeted suites, not a claim that the entire repository test suite was run.

| Scenario | Result and evidence |
| --- | --- |
| DOI identity/provenance | Passed pure tests for resolver/bare forms, case folding, percent decoding exactly once, Unicode/punctuation preservation, original query retention, malformed/credentialed URLs and mismatched provider identifiers. |
| Metadata semantics | Passed Crossref and DataCite fixtures, including dataset and non-publication ResearchObject classification, bounded source input, unsafe full-text URL exclusion, date/name mapping and CSL identifier placement. |
| Repeat imports and offline canonical reuse | Passed: queued repeats acquire once and return the same canonical identity/capture. A replacement service with acquisition disabled reuses the retained record. Original managed bytes equal the fixture bytes. |
| Concurrent canonical uniqueness | Passed independent service instances sharing the fixture Vault/SQLite ledger: one DOI mapping, Entity and SourceSnapshot. This is concurrency within the test process, not a multi-process load test. |
| Transactional failure | Passed injected failure during canonical mutation: Entity, ExternalIdentity, SourceSnapshot and pending audit changes roll back together. |
| Ambiguous commit and recovery | Passed lost-acknowledgement injection after commit, service recreation and explicit resume: same receipt/result, no duplicate Entity or provider fetch. Reusing the job ID with different input fails. |
| Cancellation | Passed cancellation during acquisition: no canonical Entity commit; durable job records cancellation. UI cancellation prevents late insertion. Published shared data is deliberately not promised to roll back after a successful commit. |
| Stale destinations | Passed selection movement and ordinary typing while acquisition is pending: late results do not insert into the changed destination. |
| Insertion and history | Passed Meta/Ctrl resource-paste routes, independent occurrence identity, exact historical source URL, one insertion/Undo/Redo and no repeat acquisition. Native payload survives encoding/decoding. |
| Plain paste / feature disabled | Passed no scholarly request and existing paste fallback behavior. Existing resource URL, semantic URI import, image clipboard and mutable clipboard suites pass. |
| Service boundaries | Passed typed HTTP client/router with real preparation worker and real SqliteKnowledgeHost. Invalid source/extra SQL fields are rejected; the old generic entity route cannot bypass scholarly acquisition/commit validation. |
| Manual native save | Passed real native writer: no document exists before explicit save; saved `.ink` bytes exactly match the requested native envelope; no `.md` sidecar. |
| Two documents and backlinks | Passed two independently saved native projections referencing one canonical identity. Clearing derived data removes facts, rebuilding restores two Block references and preserves canonical IDs. No invented text ranges in live inventory. |
| Canonical audit / package slice | Passed identity/snapshot audit delivery and bounded package extraction of Entity, ExternalIdentity and SourceSnapshot. This proves row preservation, not bundled original-JSON portability. |
| Schema upgrade | Passed schema 2 → 3 migration preserving existing Entity identity and foreign-key integrity. Existing schema, semantic knowledge, entity and package tests pass. |
| Acquisition security | Passed fixed API origin/path policy, DOI path encoding, private-address and cross-origin redirect rejection, wrong media type and oversized response rejection. Existing remote-image tests pass. |
| Editor work isolation | Passed existing Flint backlink bounded-work regressions plus the matched browser measurements below. |

`npm run typecheck` and `npm run build` pass. The build retains Vite's large-chunk warning; no build-system refactor was undertaken.

### Actual browser exercise

`scripts/check-academic-browser.mjs` ran in **Chrome 155.0.8059.80 on macOS**, with an isolated profile, trusted OS clipboard and Meta-Shift-V command. It verified insertion, original URL preservation, one-step Undo/Redo and native reopen into a new editor with the service unavailable. There was one service request in total; reopening and Redo made none.

This browser exercise uses a deterministic application-service response in the real editor runtime. The HTTP/worker/SQLite/native-writer path is exercised separately by service tests. It is **not** a live-provider, full-Flint end-to-end browser claim. No user Vault was mutated during qualification.

### Live provider smoke tests

Protected read-only acquisition was exercised separately from fixtures:

| Provider | DOI | Original response | Observed acquisition |
| --- | --- | ---: | ---: |
| Crossref | `10.1038/nphys1170` | 4,918 bytes | 1,756 ms |
| DataCite | `10.5281/zenodo.3246595` | 8,730 bytes | 2,538 ms |

Agency selection and returned DOI matched in both probes. These observations establish endpoint availability during this run, not a latency guarantee or complete live GUI qualification. No live response was committed to the user's canonical knowledge database.

### Matched typing measurements

The existing real-Chrome typing benchmark ran three matched rounds of feature-disabled, enabled-idle and enabled-with-pending-acquisition conditions. Each used 250 paragraphs / 25,000 characters and 40 edit samples. The pending condition holds one controlled service response; it does not simulate sustained live provider/worker CPU load. These are feature-disabled controls in the current tree, not a checkout of the pre-change implementation.

| Condition | Median of three run means | Per-run p95 | Academic requests | Repository snapshots |
| --- | ---: | --- | --- | ---: |
| Feature disabled | 1.39 ms | 5.4 / 4.0 / 2.3 ms | 0 | 0 |
| Enabled, idle | 1.37 ms | 1.9 / 2.3 / 2.3 ms | 0 | 0 |
| Enabled, acquisition pending | 1.34 ms | 2.2 / 1.9 / 2.3 ms | 1 explicit initial request; none from typing | 0 |

All runs preserved unrelated character DOM and passed the benchmark's edit/Undo/Redo assertions. No repeatable typing regression appeared in this fixture. Headless timing is not a guaranteed user-visible latency, and does not establish performance under arbitrary host contention.

## Migration, bounds and compatibility

[0003-scholarly-identities.sql](src/knowledge-sqlite/migrations/mutable/0003-scholarly-identities.sql) adds two canonical tables and a partial index for entity-reference Block properties. The existing schema transaction/checksum machinery applies it; no derived-index rebuild can delete these canonical tables. Operational jobs remain filesystem records outside canonical SQLite.

The Mutable knowledge schema becomes version 3; audit schema and native document envelope versions do not change. A previous binary that only understands schema 2 cannot safely open a migrated writable Vault. Read-only package extraction tolerates older archives without the new tables. Existing package/image behavior is otherwise preserved. Older renderers are not qualified for CitationBlock display; safe native payload preservation does not imply an old UI can render it.

The normal startup migration was tested in temporary Vaults; this task did not migrate the user's active Vault. Restarting the application's backend with the new build is required to expose the new operations.

Initial bounds: one active academic job per service instance, at most 16 accepted in-flight jobs, 15-second remote request deadlines, 60-second active workflow timeout, existing 30-second worker deadline, 2 MiB response cap, 200 creators, 20 license/full-text links each, and a 24 KiB normalized metadata budget before canonical dispatch. Existing journal limits remain 1,000 jobs and 256 revisions per job. There are no automatic provider retries or cross-process rate limits; retry/resume is explicit. Captured JSON is admitted by the trusted host adapter; the existing public image upload/retrieval contract is not broadened into a generic binary endpoint.

## Failed, blocked and untested scenarios

- **Failed final executed checks:** none. Development failures in keyboard intent routing, original-byte staging and hard-coded schema-version expectations were corrected and rechecked.
- **Blocked/not supported in A:** complete scholarly snapshot-original reconstruction from `.inkpkg`. Its image-only binary profile omits JSON originals and reports that omission in both native inventory and canonical extraction. Metadata/asset identities survive, and the original source Vault retains the exact bytes. This is not full cross-Vault capture fidelity; extend binary closure deliberately before claiming it in D.
- **Untested:** Safari, Firefox, Windows/Linux clipboard/browser behavior; actual Ctrl-Shift-V OS clipboard outside macOS (the controller route is unit-tested); full-Flint live-provider import/restart; provider outage/rate-limit behavior against live services; physical power loss or process-kill recovery; multi-process contention/load; original download opening in an external CSL consumer; future multiple Vault lifecycle changes. Fault-injected rollback/lost acknowledgement and service recreation are the recovery evidence actually exercised.
- **Not claimed:** a general bibliography processor, APA/MLA compliance, automatic refresh, publisher landing-page DOI discovery, abstracts, enrichment, full-text download, PDF/IIIF/Wikipedia viewers, or universal annotation anchors.

Recovery is exposed through typed inspect/resume operations and existing job listings, with job identity included in service errors. A full recovery-management UI is not part of A. Saved references are explicitly requested, limited to the first 100 indexed occurrences, and disclose incomplete coverage/unsaved exclusions; the list does not add a new cross-document navigation mechanism. Citation data remains readable when the canonical store is unavailable, but that cached projection is not a backup of the canonical database or original assets.

Published originals follow the existing conservative no-automatic-GC policy. Existing journal retention limits and archived binary portability remain maintenance follow-ups. Preserved provider types/ORCID/date components can support later deliberate reinterpretation; similar titles or names never trigger identity merges.

## Reproduction

Run from the repository root with dependencies installed:

```sh
npm run typecheck
npm run build
npx vitest run --environment jsdom --maxWorkers=1 --minWorkers=1 \
  src/interchange/scholarly.test.ts \
  server/application-services/academic.test.ts \
  src/rendering/mutable-clipboard.test.tsx \
  src/application/flint-backlinks.test.tsx \
  src/interchange/resource-url.test.ts \
  src/rendering/uri-import.test.tsx \
  src/interchange/clipboard-images.test.ts \
  server/application-services/foundation.test.ts \
  src/interchange/package/package.test.ts
node --test --test-concurrency=1 \
  src/knowledge-sqlite/schema.test.mjs \
  src/knowledge-sqlite/entities.test.mjs \
  src/knowledge-sqlite/semantics.test.mjs \
  src/knowledge-sqlite/package-data.test.mjs \
  server/asset-remote.test.mjs
```

With Vite available on localhost:3000 (these fixture checks do not need the live backend):

```sh
node scripts/check-academic-browser.mjs
BENCHMARK_URL=http://localhost:3000/scripts/academic-browser-fixture.html \
  BENCHMARK_ACADEMIC=off node scripts/benchmark-typing-browser.mjs
BENCHMARK_URL=http://localhost:3000/scripts/academic-browser-fixture.html \
  BENCHMARK_ACADEMIC=idle node scripts/benchmark-typing-browser.mjs
BENCHMARK_URL=http://localhost:3000/scripts/academic-browser-fixture.html \
  BENCHMARK_ACADEMIC=pending node scripts/benchmark-typing-browser.mjs
```

Repeat the three benchmark conditions in the same order for three matched rounds. Browser scripts accept `CHROME_BIN` for another installed Chrome executable.

## Review gate

Milestone A is submitted for acceptance with the qualifications and portability limitation above. Milestones B–D, Phase 4, Vault synchronization/mounting, publishing changes and desktop packaging have not been started. No further milestone implementation is authorized by this report.
