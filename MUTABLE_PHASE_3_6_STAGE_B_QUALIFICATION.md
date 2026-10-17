# Phase 3.6 Stage B — Directory Publication

Date: 2026-10-17  
Status: Implemented and qualified; awaiting Stage B acceptance. Stage A and the Vault architecture amendment are accepted. Stage C has not begun.

## Implementation

In Flint, choose **Publish to Web… → New independent site → Scope: Directory**. Select a directory inside the current Vault, choose whether to include subdirectories, and enter relative file/directory exclusions. **Inventory saved directory** lists eligible saved native documents, subdirectories and omissions. Review/edit public titles and routes, confirm site settings, confirm saved-only inputs, and request the publication review. Review page content and diagnostics before approving the build. Completed releases offer isolated preview, bounded ZIP delivery and **Locate static folder**.

The existing default-enabled `webPublishing` flag covers both publication scopes, alongside `applicationServices`. There is no competing publication implementation. Directory and document sites have distinct typed scope variants; existing single-document site records remain readable. Multiple sites retain independent policy, routes, active releases and history.

### Scope, routes and links

- The first pass inventories at most 5,000 entries and freezes document identities, saved hashes, locations and the approved route map. Hidden infrastructure and symlinks are not traversed. Unsupported files and explicit exclusions are reported; nothing is imported or fetched.
- Default public titles are generic and routes use site-scoped opaque aliases under `pages/`. Source filenames are not automatically disclosed. Users can choose reviewed nested ASCII `.html` routes. Existing mappings survive title changes and native renames; new allocation reserves existing routes and uses deterministic collision suffixes. Duplicate native identities are rejected as ambiguous.
- The second pass projects one document at a time through the existing native codec, MutableFragment and semantic exporter. Exact native document references and exact imported Markdown/HTML bindings resolve against the frozen map. Ordinary wiki spelling is not guessed. Conflicting imported bindings remain text with diagnostics.
- Supported local Block targets receive stable site/document/Block-derived opaque anchors. Cross-document Block fragments and unresolved heading fragments remain text when an exact published anchor is not established. Targets outside the approved route map are distinguished from ambiguous source bindings; their existence outside scope is deliberately not investigated.
- The site index lists approved public titles. Pages have Contents/Previous/Next navigation using relative links; nested CSS/image links work under a preview namespace or ordinary static hosting. Navigation works without JavaScript. Search, reader-theme controls and semantic popovers are not introduced.

PNG/JPEG originals use the existing immutable asset service. Originals are verified and deduplicated across pages; metadata-retention warnings remain in review. Raw native data, retained definitions, PackageDataBlock data, arbitrary metadata and canonical identifiers remain outside public output. Source conversion adds only a read-only identity observation hook and an optional exact-binding URL mapper to existing libraries; clipboard and collection defaults are unchanged.

### Jobs, recovery and delivery

Jobs belong to the authorized Vault service, not the browser. Membership, saved inputs and disclosure settings are revalidated before preparation, after preparation and before release publication. Changes require a fresh review. Closing a dialog stops its polling and revokes preview grants without cancelling admitted work; explicit cancellation and host shutdown retain their established meanings.

Private immutable document receipts live in `.mutable/jobs/publication-<job>/units/doc-NNNN/`, alongside bounded native/output blobs. The inventory has its own receipt. Phase checkpoints occur every 25 documents; 1,000 documents do not require 1,000 phase revisions. Resume verifies receipt integrity and captured inputs/output, reuses completed units, and prepares unfinished documents only. This is interruption recovery within a job, not Stage D incremental reuse between builds.

Complete releases are staged under a release-specific OS lease. Page copying does not hold the site metadata lock. A short final revision check advances the site only after all files and the manifest are durable. Lost commit acknowledgements reconcile through the existing per-job commit receipt. Unit/release retries remove only unreachable temporary stage names under their writer lease; immutable assets and published data are retained.

**Locate static folder** returns the Vault-relative path to the sealed release's `public` directory. Copy that directory to a chosen destination; private manifests and jobs are outside it. This is service-generated folder output, not an arbitrary frontend filesystem-write API or hosting-provider deployment. Preview still uses expiring grants on a separate loopback origin.

## Bounds

| Resource | Stage B admission policy |
| --- | --- |
| Scope | 1,000 documents, 5,000 entries, 16 enumerated directory levels; explicit relative exclusions. |
| Saved inputs | 8 MiB/document, 128 MiB aggregate; existing native/fragment/parser limits also apply. |
| Originals | 200 distinct PNG/JPEG assets, 10 MiB each, 80 MiB aggregate. |
| Public output | 2,002 files, 128 MiB aggregate, 16 MiB/file. |
| Receipts | 2 MiB/document receipt; existing 256 phase-revision and metadata-record limits remain. |
| Execution | One active publication and CPU worker per host; two queued tasks; 30 seconds/task; 30 minutes active work before explicit continuation. |
| UI/review | 20 route controls/page; 10 document reviews/request; existing 1 MiB HTTP request ceiling. |
| ZIP | Expanded members at most 60 MiB, result at most 64 MiB; larger sites use the static folder. |

These deliberately conservative byte ceilings are below the architecture's proposed upper bounds. No complete-site input/output buffer is accumulated during preparation or folder construction. ZIP delivery remains a separately bounded in-memory operation. Site/job/release retention limits from Stage A remain; no automatic garbage collection is added.

## Qualification

- **229 tests passed across 23 files**, including 20 existing publication cases, 10 new directory host cases and two directory projection cases. The run also covers existing clipboard, collection, package, native persistence, Cavern lifecycle and application-service behavior.
- Client and server production builds and TypeScript checks passed. Existing large-client-chunk and mixed static/dynamic-import warnings remain. No dependency or build-system changes were introduced.
- **Chrome 155 on macOS passed the real Flint directory workflow**, including nested preview navigation/CSS, ZIP download/unpacking and folder location. Preview contained no scripts or opener, and closing the dialog revoked access. Native bytes and the live editor revision were unchanged, with zero editor snapshots.

An earlier regression run overlapped the scale/browser workloads and exceeded existing test deadlines. The full suite was rerun alone with one Vitest worker and passed without changing test deadlines. The browser probe's fixed post-navigation delay was replaced with a bounded wait for the actual page and stylesheet to load.

The added host cases exercise nested duplicate filenames with distinct native identities, reviewed nested routes, relative CSS/navigation/document links, private-content canaries, exact original PNG preservation and cross-page deduplication. They also exercise membership changes, identity-preserving renames, duplicate identity rejection, explicit exclusions, symlink refusal, deterministic collision suffixes, repeated-build equivalence, cancellation, competing hosts, corrupted receipts, partial worker failure, and recovery before and after the active-release commit. Projection cases cover exact local anchors/imported source bindings, ambiguous bindings and unresolved targets whose names match JavaScript prototype properties.

The browser probe uses the actual Flint menu and dialog in a disposable Vault. It checks title-input focus across consecutive edits, the complete directory workflow, navigation and stylesheet loading on a nested preview page, ZIP contents, folder location and preview revocation. Native bytes, the live editor revision and snapshot count are checked independently of the service tests.

### 1,000-document execution

The real Node host completed **1,000 saved native documents across 40 nested directories**, using per-document preparation workers and durable filesystem receipts. The final release contained **1,002 files / 915,485 bytes**, and the job used **46 phase revisions**. Sampled peak host RSS was **151.4 MiB**, including its worker threads but excluding filesystem-helper child processes. The executor ended with zero active/queued tasks and zero retained task bytes.

| Phase | Observed duration |
| --- | ---: |
| Inventory and explicit site save | 32.1 s |
| Preparation, checkpoints and final review validation | 594.0 s |
| Approved build and complete release construction | 27.2 s |
| Entire run | 653.4 s (10.9 min) |

This fixture uses many small rich native documents, not 1,000 maximum-sized inputs or the maximum asset budget. Other qualification processes overlapped its initial two minutes; these are observed end-to-end timings, not an isolated throughput benchmark. Repeated worker startup and durable filesystem operations make preparation a background job. The release copy validates each file as it is written; it does not perform a redundant preliminary artifact sweep. The static-folder operation locates an already committed release, while preview/ZIP byte delivery retains integrity checks.

### Matched typing measurements

Six sequential runs used the same Michelangelo letter, 499-character paragraph, eight mounted paragraphs, Normal caret mode and 40 alternating edits. Builds, tests and the scale workload had finished. The repeated idle/disabled pair reversed feature order. The load helper prepared a real 25-document directory through the host service and waited for a preparation worker to be active before measuring.

| Run | Synchronous median | Synchronous p95 | Next-frame p95 |
| --- | ---: | ---: | ---: |
| Publishing disabled | 5.2 ms | 9.1 ms | 20.4 ms |
| Enabled, idle | 5.9 ms | 10.4 ms | 67.5 ms |
| Directory preparation active | 8.2 ms | 9.8 ms | 85.3 ms |
| Enabled, idle repeat | 6.9 ms | 12.6 ms | 87.2 ms |
| Disabled repeat | 5.4 ms | 12.0 ms | 104.1 ms |
| Directory preparation repeat | 5.3 ms | 10.9 ms | 81.5 ms |

All six runs recorded **zero editor snapshots, zero application-service requests and zero save-status reads during typing**, restored the initial text, and passed actual Chrome character input and Undo checks. The active-workload median increase did not repeat. Frame scheduling varied substantially, including with publishing disabled; these headless, profiled samples do not establish physical input-to-display latency or a guaranteed frame budget. They show no consistent publishing-related typing regression and no added forbidden editing work.

The short load probes stopped their still-preparing jobs during cleanup; full completion is qualified separately above. Their sampled host RSS, including Vite and preparation workers, was 125/169 MiB. Raw results and CPU profiles are under `/tmp/publication-b-{off,idle,load,off-repeat,idle-repeat,load-repeat}`. Final suite, browser and scale logs are `/tmp/publication-b-regression-serial.log`, `/tmp/publication-b-browser-verified.log` and `/tmp/publication-b-scale-final.log`.

Local documentation file links and `git diff --check` passed. Controlled fault injection establishes the recorded interruption/recovery cases; physical power-loss testing is not claimed.

Reproducible commands:

```sh
npm run typecheck
npm run build:client
npm run build:server
npx vitest run --maxWorkers=1 --minWorkers=1 src/interchange src/runtime/clipboard.test.ts src/runtime/document-interchange.test.ts src/runtime/collection-interchange.test.ts src/persistence src/publication server/native-document-store.test.mjs server/application-services server/cavern-lifecycle.test.ts server/collection-store.test.ts
PUBLICATION_DIRECTORY=1 node scripts/check-publication-browser.mjs
node scripts/check-publication-directory-scale.mjs
BENCHMARK_WEB_PUBLISHING=false BENCHMARK_OUTPUT=/tmp/publication-b-off node scripts/benchmark-flint-typing-browser.mjs
BENCHMARK_WEB_PUBLISHING=true BENCHMARK_OUTPUT=/tmp/publication-b-idle node scripts/benchmark-flint-typing-browser.mjs
BENCHMARK_WEB_PUBLISHING=true BENCHMARK_PUBLICATION_LOAD=1 BENCHMARK_PUBLICATION_DIRECTORY_LOAD=1 BENCHMARK_OUTPUT=/tmp/publication-b-load node scripts/benchmark-flint-typing-browser.mjs
```

Build client and server sequentially: the client build clears server worker artifacts from `dist`. Do not rebuild while a host qualification is running. Run matched typing measurements separately from build/test/scale workloads.

## Limits and acceptance boundary

Public routes are explicitly reviewed ASCII paths; source Unicode/case differences do not automatically create public paths. Duplicate canonical identities require correction or exclusion, rather than guessed relationships. Unsupported/missing heading or cross-document Block anchors remain inactive. Directory groups are not inferred as public navigation titles; users choose any nested public route layout explicitly. Generic titles must be edited when more descriptive public navigation is wanted.

The static folder resides on the service host. Browser-only arbitrary destination writing, remote preview access, Firefox/WebKit qualification, Windows/Linux durability and desktop packaging are not claimed. A retained older release or exported copy is not retracted by changing the next release's scope.

Vault identity and service scope remain independent of physical location. Site configuration is portable authored data; jobs, execution receipts, leases and preview authorization remain local operational state. This milestone introduces no synchronization, archive mounting, multi-Vault lifecycle changes, Stage C/D features, Phase 4 or Electron/Tauri packaging. Existing Phase 3.5 maintenance/browser follow-ups and the separate manual video-playback check remain unchanged. Stop after Stage B qualification for acceptance.
