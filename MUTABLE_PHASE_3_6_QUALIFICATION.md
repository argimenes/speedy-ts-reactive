# Phase 3.6 — Publish to Web: consolidated qualification

Date: 2026-10-17  
Status: Stages A–D accepted. Phase 3.6 — Publish to Web is complete, accepted on 2026-10-17. No subsequent project has begun.

## Scope and operation

Publish to Web remains behind the existing default-enabled `webPublishing` and application-service gates. Flint's **Publish to Web…** dialog provides saved-native scope selection, explicit settings/privacy review, durable preparation/build, isolated preview and static-folder/ZIP delivery. Independent sites retain stable identities, reviewed routes, disclosure policies and immutable release histories.

Accepted reports remain authoritative for their milestones:

- [Stage A — Safe Single-Document Publication](MUTABLE_PHASE_3_6_STAGE_A_QUALIFICATION.md).
- [Stage B — Directory Publication](MUTABLE_PHASE_3_6_STAGE_B_QUALIFICATION.md).
- [Stage C — Reader Experience](MUTABLE_PHASE_3_6_STAGE_C_QUALIFICATION.md).

Stage D adds **Reuse verified unchanged projections** and **Full rebuild (ignore prior cache)**. Both require a new saved-input/privacy review. Reuse/preparation counts appear in the review. Nothing watches edits or saves, and no publication work enters typing, selection, IME, snapshots, history or Command-S.

## Incremental dependencies and determinism

The cache is private, immutable projection data in completed publication-job units. The most recent usable completed job for the site's active release is the baseline. The host holds its execution lease while reading/copying cache data. Receipt verification, blob verification and copying one cache object share a single bounded storage transaction; destination write errors still stop the job. A new job copies all reused projection data into its own units and re-acquires approved managed originals; it has no lasting storage dependency on the old job. Missing, busy, incompatible or corrupt cache evidence falls back to preparation.

Dependency keys use canonical serialization of the saved native hash and resource identity, logical Vault and site identities, projection policy, public title/route, complete ordered route/navigation mapping, selected semantic bundle/context fingerprint, and generator/tokenizer versions. Original asset references/hashes are part of the saved input; each required original is retrieved and content-hash validated even when the projection is reused. Source filenames and machine paths are not cache authority or public identity.

CSS-only theme tokens are excluded from projection dependencies: changing typography, colour, width or spacing regenerates the stylesheet while reusing unchanged projection. Template/interaction settings remain dependencies. A content change invalidates its document; a route/scope/navigation change conservatively invalidates every affected collection projection. Research fingerprints conservatively invalidate projections when the reviewed context/input union changes. This is deliberately broader than a fine-grained backlink dependency graph.

Navigation, Reader assets, search shards and semantic detail pages are rebuilt deterministically from the current receipts and current selected DTOs. No previous public directory is copied wholesale. Removed documents, old routes and excluded semantic values cannot enter a new manifest or search index through reuse. Historical releases remain explicitly retained until deletion; removing current disclosure does not silently rewrite history or retract exported copies.

The canonical sealed manifest contains public paths, hashes, sizes, MIME types and the designated entry page; private staging-unit locations are excluded. Full and incremental builds share the same renderer and manifest path. Existing sealed output is verified before re-admitting an identical release. New manifests carry an explicit entry page so preview does not guess from alphabetical filenames. Earlier releases remain readable; incompatible pending reviews require fresh review under the new generator policy.

## Explicit maintenance and recovery

**Release and job maintenance** lists publication-owned artifacts in pages of 50. **Review deletion** calculates retained bytes/files and blocking references. **Confirm deletion of reviewed data** revalidates the site/job revision and the reviewed inventory before acquiring an OS lease. No arbitrary path, filesystem, SQL, shell or managed-asset deletion capability is exposed to the frontend.

- Active releases cannot be deleted. Retained jobs referencing a release must be removed first.
- Only completed or cancelled jobs can be deleted. Executing jobs and leased cache sources are protected; interrupted/failed jobs must be explicitly cancelled if their recovery evidence is no longer wanted.
- Local preview grants are revoked for release deletion. Shared read leases protect previews and exports; another host's lease blocks deletion until released. Identical-release builds remain possible while previewing immutable output.
- A durable deletion marker precedes detachment and file removal. Pending deletion is never served. Interruption/cancellation leaves an inspectable operation that requires explicit cleanup continuation. The previous active release remains intact.
- Pruning uses the existing pinned-directory worker and identity-checked file removal, plus a narrow identity-checked empty-directory removal operation. Symlinks/nonregular entries are refused. Work is bounded to 20,000 entries and depth 20 per target, with cancellation checks between entries.
- Small lock/deletion markers remain as private evidence; large blobs, receipts and public trees are removed. Completed job tombstones cannot be reused as job identities. A fully pruned release digest can later be rebuilt from newly approved inputs. There is no automatic garbage collection, historical rollback or deletion of managed originals.

Existing source/output/asset/revision ceilings remain. Operational directory enumeration has a 10,000-entry ceiling to accommodate small maintenance tombstones; live jobs remain capped at 1,000 and retained releases at 100. The existing 255-revision site history ceiling is unchanged; this milestone does not compact authored site history.

Application-service contracts, TypeScript workflows and Node platform adapters remain distinct. Filesystem jobs/caches/leases/grants stay device-local; no operational SQL tables or browser journals were added. Vault synchronization, temporary archive mounting and desktop packaging remain outside this milestone.

## Qualification results

### Automated checks

The final regression run passed **249 tests in 27 files** (399.03 s), including publishing A–D, Application Services, native persistence and the applicable Phase 3.5 clipboard/interchange/package/collection regressions. The separate pinned-filesystem suite passed **25 tests**, including empty-directory identity mismatch, nonempty-directory refusal, symlink refusal and the existing publication/locking durability tests. Client/server builds and TypeScript checks pass; existing large-client-chunk warnings remain.

After consolidating cache verification/copy into one storage transaction, the focused publishing A–D suite passed **52 tests in 7 files** (377.28 s), and the compiled-host Flint browser workflow passed again. These 52 overlap the broader suite; they are not an additional distinct-test count. Server build and typecheck also passed after the final storage change.

Stage D cases cover full/incremental ZIP equivalence, unchanged and single-document reuse, CSS-only reuse, route/scope/exclusion invalidation, damaged-cache fallback, explicit semantic narrowing, original-image retention after job cleanup, reference/lease protection, stale maintenance review, interrupted deletion and unsafe trees. Recovery checks also distinguish incompatible unfinished units from already committed historical manifests: the former require fresh review; the latter reconcile from their verified immutable release receipt.

### Browser and portability

Chrome **155.0.0.0** passed the actual Flint directory/Research workflow, incremental reuse, an identical-release rebuild while preview remained open, deletion review/confirmation for a completed job, and refusal to delete the active release. Original native bytes, editor revision and snapshot count remained unchanged; exported ZIP contents and preview revocation were verified.

The independent exported-site probe again passed after closing Mutable's host: Unicode/weighted/bounded search, stale-query handling, private-data canaries, keyboard preview activation/Escape/focus restoration, no-script reading/details, Compact presentation, 375 px layout, contrast/reduced-motion checks, relative static resources and zero external/application-service requests. Its 24 requests were local static resources. Browser runs overlapped some regression work and are functional checks, not throughput benchmarks.

Safari/WebKit and Firefox remain **unqualified**. Safari's remote automation is disabled; Firefox is not installed. No broader claim is inferred from Chrome.

### Representative site scale

The real Node host completed a disposable **500-document / 20-subdirectory** Reader site with search, using rich native fixtures, filesystem journals and per-document workers. Inventory took **2.94 s**. There were **506 public files / 672,264 bytes**. Sampled peak host RSS across the three builds was **139.91 MiB**; the executor ended with zero active/queued work and zero reserved bytes. This RSS includes Node worker threads, but not separate filesystem-helper processes or Chrome.

| Build | Review and build time | Reused / prepared | Public output |
| --- | ---: | ---: | --- |
| Full | 389.28 s (375.67 s review + 13.61 s build) | 0 / 500 | Baseline |
| Unchanged incremental | 348.19 s | 500 / 0 | Identical release digest |
| One saved input changed | 354.79 s | 499 / 1 | Identical release digest |

The final case appends JSON whitespace to one native file: its saved hash changes, but its public meaning does not. This proves selective invalidation and determinism together. Separate smaller integration cases change visible content, routes, scope, theme and semantic disclosure and compare full/incremental ZIP bytes. The full 500-document job finished at revision 26, demonstrating checkpointed progress beyond the individual preparation-worker deadline.

A preliminary scale run exposed three filesystem transactions per cached projection. Stage D consolidates verification and copying into one bounded transaction, then repeats qualification against that final implementation. The table records observed throughput, not an uncontended speedup claim: the full run overlapped regression/browser checks, and validation, durable writes and regeneration of current public indexes remain substantial. Reuse eliminates the measured conversion work; it does not make a large publication instantaneous.

These are many small rich documents, not 500 maximum-size inputs. Existing input/output ceilings and Stage B's separate 1,000-document qualification remain applicable. All scale sources and outputs were disposable; no user document was saved or changed.

### Matched typing

Six sequential Chrome 155 probes used the same Michelangelo fixture, a 499-character paragraph, eight mounted paragraphs, Normal caret mode and 40 alternating insert/delete events. Builds, regression suites and the scale job had finished first. Runs were ordered disabled, idle, loaded, idle-repeat, disabled-repeat, loaded-repeat. Loaded runs used a real 25-document Reader/search preparation job in a disposable Vault.

| Publishing state | Sync median / p95 (ms) | Next-frame p95 (ms) |
| --- | ---: | ---: |
| Disabled | 7.1 / 10.4 | 94.9 |
| Enabled, idle | 7.7 / 12.1 | 60.7 |
| Preparing publication | 7.9 / 11.5 | 70.2 |
| Enabled, idle — repeat | 7.3 / 13.8 | 134.5 |
| Disabled — repeat | 8.3 / 15.2 | 38.8 |
| Preparing publication — repeat | 5.5 / 7.7 | 34.3 |

Every run recorded **zero repository snapshots, zero persistence-status reads and zero application-service requests caused by typing**, restored the original text, and passed actual Chrome character input plus Undo. There is no repeatable deterioration attributable to publishing in this sample. Headless/software-rendered frame timings are variable; these measurements do not establish physical input-to-display latency or prove absence of all contention.

The two short loaded probes stopped their still-preparing jobs during cleanup; their sampled host RSS (including Vite and workers) was 173/148 MiB. Complete durable builds are separately established by the scale and host tests. One initial Chrome startup timed out before editor measurement; the subsequent complete six-run sequence passed. No production typing or history code changed.

### Reproduction

```sh
npm run build:client
npm run build:server
npm run typecheck
npx vitest run --maxWorkers=1 --minWorkers=1 src/interchange src/runtime/clipboard.test.ts src/runtime/document-interchange.test.ts src/runtime/collection-interchange.test.ts src/persistence src/publication server/native-document-store.test.mjs server/application-services server/cavern-lifecycle.test.ts server/collection-store.test.ts
npx vitest run --maxWorkers=1 --minWorkers=1 src/publication server/application-services/publication.test.ts server/application-services/publication-directory.test.ts server/application-services/publication-reader.test.ts server/application-services/publication-incremental.test.ts
node --test scripts/stage-c-gates/publication-maintenance.test.mjs scripts/stage-c-gates/storage.test.mjs
PUBLICATION_DIRECTORY=1 PUBLICATION_READER_UI=1 PUBLICATION_MAINTENANCE_UI=1 node scripts/check-publication-browser.mjs
node scripts/check-publication-reader-browser.mjs
PUBLICATION_DOCUMENTS=500 node scripts/check-publication-incremental-scale.mjs
BENCHMARK_WEB_PUBLISHING=false BENCHMARK_OUTPUT=/tmp/publication-d-off node scripts/benchmark-flint-typing-browser.mjs
BENCHMARK_WEB_PUBLISHING=true BENCHMARK_OUTPUT=/tmp/publication-d-idle node scripts/benchmark-flint-typing-browser.mjs
BENCHMARK_WEB_PUBLISHING=true BENCHMARK_PUBLICATION_LOAD=1 BENCHMARK_PUBLICATION_DIRECTORY_LOAD=1 BENCHMARK_PUBLICATION_READER_LOAD=1 BENCHMARK_OUTPUT=/tmp/publication-d-load node scripts/benchmark-flint-typing-browser.mjs
```

Build client before server because Vite clears server artifacts. Do not rebuild while qualification workers are active. Run typing probes separately from builds, suites and scale jobs.

Repeat typing in idle/disabled/loaded order with distinct `BENCHMARK_OUTPUT` directories. Local evidence for this run is in `/tmp/publication-d-regression-final.log`, `/tmp/publication-d-batched-final.log`, `/tmp/publication-d-filesystem.log`, `/tmp/publication-d-browser-final.log`, `/tmp/publication-d-static-browser.log`, `/tmp/publication-d-scale-final.log` and the six `/tmp/publication-d-{off,idle,load}[-repeat]/results.json` files. These temporary artifacts are not required by the application and may be removed by the operating system.

## Compatibility and limits

Interactive sites are qualified under ordinary static HTTP, including loopback hosting after Mutable closes. No Mutable editor/server/SQLite/service API is required by the exported runtime. Direct `file:` interactive fetch behavior is not guaranteed. Safari automation remains disabled and Firefox is unavailable on this machine; neither is claimed qualified. Existing manual video-playback and Phase 3.5 portability/storage follow-ups remain separate.

Cache reuse skips conversion/projection work, not saved-input validation, asset integrity checks, privacy review, current-scope bundle generation or durable publication. Changes to conversion/template/tokenizer semantics must advance the explicit generator policy version. Large-site timing is background-job throughput, not an editing latency promise. Small retained maintenance tombstones and bounded site history are explicit maintenance limitations. Corrupt ownership records fail closed; maintenance does not guess which site owns damaged journal metadata.

## Retained follow-up items

1. **Large-site incremental throughput:** the 500-document qualification establishes correct projection reuse and deterministic output, but end-to-end times remain high. Retain as future performance optimisation; no further refactoring is authorized now.
2. **Compatibility qualification:** Safari/Firefox and Windows/Linux remain follow-up qualification work; this acceptance does not extend the recorded browser or platform evidence.
3. **Publication retention and bounded history:** retain the existing limits and maintenance considerations, including small deletion tombstones and the 255-revision site history ceiling.
4. **Phase 3.5 follow-ups:** retain full-Cavern relocation/portability qualification, managed-asset maintenance considerations, and focused manual YouTube/Vimeo playback verification. Do not broaden player permissions or undertake unrelated provider work.

## Acceptance boundary

All four stages of Phase 3.6 are accepted and Publish to Web is complete. No further Phase 3.6 work is required or additional implementation authorized at this stage. The follow-ups above remain deferred. Phase 4 — Advanced Mutable Interchange, temporary Vault/archive mounting, multi-Vault lifecycle, S3 synchronization and Electron/Tauri packaging remain separate projects requiring their own planning and authorization.
