# Phase 3.6 Stage A — Safe Single-Document Publication

Date: 2026-10-17  
Status: Implemented and qualified; awaiting Stage A acceptance. Stage B has not begun.

## Implementation

Flint's menu now includes **Publish to Web…**, behind the default-enabled `webPublishing` flag and the existing application-service flag. The dialog implements **Select → Review → Build → Preview → Export**. It can select a saved native file, create/select an independent site, explicitly review site settings and routes, review projected reading text/files/disclosures, approve a build, inspect/recover jobs, preview and download the completed site ZIP.

Sites have stable UUIDs, bound native resource identities, independent profiles and release histories. Titles, filenames and ordinary document edits do not derive public routes. A rename requires rebinding the saved location to the same resource identity; its public route remains unchanged. Route changes require a separate confirmation showing the old and proposed route, followed by a fresh publication review. Different sites can publish the same document with different image, margin and outbound-link policies.

The dialog explicitly requires confirmation that saved native content is being used. Users save through the existing Command-S/Control-S workflow if needed. Publishing does not capture the live editor repository, save a document, mark it clean or change Undo history. Closing the dialog stops observation and revokes its preview grants; admitted jobs continue while the host is available.

| Concern | Implementation |
| --- | --- |
| Transport-independent contracts | [Publication DTOs](src/application-services/publication-contracts.ts), extending the existing typed service operation map. No filesystem, SQL, shell or editor objects cross the API. |
| Application workflow | [Publication service](src/application-services/publication-service.ts), using injected [capabilities](src/application-services/publication-ports.ts). Saved-read, immutable-asset and executor capabilities are reused. |
| Public projection | [Pure TypeScript projection](src/publication/projection.ts), reusing the native codec, MutableFragment, semantic exporter, Markdown/HTML parsers and exact collection image bindings. |
| Durable storage | [Node publication storage](server/application-services/publication-storage.ts), using the existing pinned-directory filesystem helper, OS locks, staged create-only publication and synchronized files/directories. |
| Preview | [Loopback static adapter](server/application-services/publication-preview.ts), restricted to committed manifest files, with expiring/revocable grants and a separate origin. |
| UI | [Publication dialog](src/rendering/publication-dialog.tsx), mounted only by an explicit existing Flint menu action. No background polling while closed. |

## Privacy and output

Stage A produces a static reading page and bundled reader stylesheet. Supported text, headings, lists and tables use semantic HTML. Managed PNG/JPEG originals are verified, copied without transformation and deduplicated by hash. Original metadata is retained and disclosed in review. No remote acquisition, video player, third-party script, hosted font or analytics is introduced.

Projection follows approved reading ownership. It removes annotation identities/attributes, point markers, retained definitions, PackageDataBlock rows, private native metadata and unsupported Blocks before HTML generation. Margins and HTTP(S) links require explicit profile choices. Review includes outbound URLs, public filenames, omitted contribution counts and conversion warnings. Unsupported/reference Blocks remain omitted with diagnostics; Stage A does not resolve directory/document relationships.

Source Blocks are semantically converted with the existing parsers. Authored scripts/CSS are not published. Exact previously established collection image bindings can resolve managed originals; unresolved resources stay inert. Markdown frontmatter can be rendered as reading text by the existing converter and receives an explicit review warning. Legacy HTML Blocks are not reinterpreted as source Blocks and are reported as omitted.

The public tree contains no native document, journal, profile, raw archive context or operational diagnostic file. Static HTML has no script runtime. The initial theme is fixed; theme controls, navigation, search and semantic interactions remain deferred.

## Durability, consistency and limits

Publication records use version 2 under `.mutable/jobs/publication-<job-id>/`. Existing version-1 preparation journals, request-disconnection behavior and limits are unchanged. Publication jobs are host-owned after admission. The browser retains no recovery journal. Discovery is paginated in batches of at most 50 job identities; sites remain Cavern-scoped.

Immutable, hash-addressed private blobs hold captured native input and prepared files. Hash-linked revision records hold the pinned site/profile, reviewed source hash, output receipts and explicit approval. Builds recompute the approval fingerprint using the publication policy version, revalidate the saved resource/hash and site revision, verify all prepared files, then seal a complete release under `.mutable/publications/<site-id>/releases/<digest>/public/`. The site record advances only after the manifest/files are durable. A per-job commit receipt in that record reconciles lost acknowledgements without confusing another build of identical bytes with this job's commit.

Execution leases exclude competing execution of a job. Expected revisions serialize site/profile commits. Corrupt/stale evidence fails closed. Cancellation before commit preserves the previous active release; successful commit remains authoritative if cancellation or acknowledgement loss happens afterward. Host shutdown/interruption requires explicit recovery/resumption. A changed source/profile requires another review. There is no automatic startup replay, global Undo or browser-owned publishing loop.

Stage A intentionally uses tighter bounds than the future multi-document ceilings:

- One saved document per site; native input at most 8 MiB, with existing fragment/parser limits and 200,000 UTF-16 code units per source conversion.
- At most 20 distinct PNG/JPEG originals, 10 MiB each and 40 MiB total; output files at most 16 MiB each.
- One active publication per host, one shared CPU worker and two queued worker tasks. Each worker task retains the existing 30-second deadline and memory/input/output limits. A 30-minute job allowance interrupts work for explicit continuation.
- ZIP preparation is worker-owned and bounded to 60 MiB of member bytes and a 64 MiB result. Member ordering and DOS timestamps are fixed. Stage A's bounded site fits this delivery path; broader folder-delivery controls belong with directory publication.
- Up to 100 sites, 100 retained distinct releases per site, 1,000 publication jobs and 256 revisions per record. Each review/revision record is bounded to 2 MiB. Stage A job files, including subsequent checkpoints and interrupted stages, are capped at 128 MiB, with bounded directory enumeration. Reaching a ceiling fails explicitly; it does not delete evidence or overwrite files.

Completed releases are immutable and conservatively retained. There is no release-deletion UI or garbage collector in Stage A; maintenance and larger segmented multi-document journals remain later-stage work. Knowledge extraction is not invoked by this reading-only milestone. Stage E IndexedDB journals and qualified clipboard/package/native workflows are not migrated.

## Qualification

- **212 tests passed across 21 files** in the broader interchange, native persistence, collection, Cavern lifecycle and application-service regression run. This included the then-current 15 publication tests.
- **20 publication tests passed** in the subsequent focused run. These totals overlap. Coverage includes the HTTP workflow, distinct sites, explicit route changes/rebinding, stale hashes/revisions, original PNG bytes, deduplication, source conversion and exact image bindings, privacy canaries, hostile paths/fields/symlinks, feature-off behavior, cancellation, restart/recovery, corrupt artifacts, record/storage budgets, journal interruption before/after publication, release sealing, lost commit acknowledgements and simulated `ENOSPC` while retaining the previous active release.
- **Chrome 155 on macOS passed the real Flint workflow** in a disposable Cavern. The probe opens the actual menu/dialog, reviews and approves a saved Michelangelo letter, builds it, opens the separate preview origin and downloads/unpacks the ZIP. It verifies zero preview scripts/opener access, grant revocation, unchanged native bytes, unchanged editor repository revision and zero editor snapshots throughout the workflow. Firefox and Safari were not run.
- Client and server production builds, TypeScript checks, local documentation links and `git diff --check` passed. Existing large-client-chunk and mixed static/dynamic-import warnings remain. No new dependencies or build-system refactoring were introduced.

The durability tests simulate interruption and storage exhaustion at controlled boundaries; they do not claim physical power-loss or real full-volume testing on every platform. Initial admission ceilings are implemented guards, not a throughput guarantee for every maximum-sized document.

### Matched typing measurements

The existing real Flint benchmark used the same Michelangelo letter, 499-character paragraph, eight mounted paragraphs, Normal caret mode and 40 alternating edits. Runs were sequential with no simultaneous builds/test suites. The repeated pair reversed feature order.

| Run | Synchronous median | Synchronous p95 |
| --- | ---: | ---: |
| Publishing disabled | 7.4 ms | 19.8 ms |
| Publishing enabled, idle | 5.3 ms | 10.5 ms |
| Enabled, repeat | 5.9 ms | 8.5 ms |
| Disabled, repeat | 6.7 ms | 17.9 ms |
| Enabled, real host publication preparation active | 5.6 ms | 11.0 ms |

Every run recorded **zero document snapshots, zero application-service requests and zero save-status reads during typing**, restored the original text, and passed actual Chrome character-input and Undo checks. These observations show no repeatable typing regression; they do not establish that enabling publishing improves performance or guarantee physical input-to-display latency.

The load helper starts an actual durable publication review/render job and waits for its worker to become active before measuring typing. That job was still preparing at the end of the short measurement interval and was stopped during cleanup; complete release publication is established separately by the service/browser tests. Sampled peak RSS of the benchmark host process, including Vite and the publication worker, was approximately **128 MiB**. This is a small-fixture observation, not a worst-case memory bound. Logs/profiles are in `/tmp/publication-{off,on,on-repeat,off-repeat,load}` and the corresponding `.log` files; the final browser log is `/tmp/publication-browser-final.log`.

Reproduction commands:

```sh
npm run build:client
npm run build:server
npm run typecheck
npx vitest run src/interchange src/runtime/clipboard.test.ts src/runtime/document-interchange.test.ts src/runtime/collection-interchange.test.ts src/persistence server/native-document-store.test.mjs server/application-services server/cavern-lifecycle.test.ts server/collection-store.test.ts
node scripts/check-publication-browser.mjs
BENCHMARK_WEB_PUBLISHING=false BENCHMARK_OUTPUT=/tmp/publication-off node scripts/benchmark-flint-typing-browser.mjs
BENCHMARK_WEB_PUBLISHING=true BENCHMARK_OUTPUT=/tmp/publication-on node scripts/benchmark-flint-typing-browser.mjs
BENCHMARK_WEB_PUBLISHING=true BENCHMARK_PUBLICATION_LOAD=1 BENCHMARK_OUTPUT=/tmp/publication-load node scripts/benchmark-flint-typing-browser.mjs
```

Build client and server sequentially: the client build clears `dist`, including server workers. Do not run typing measurements concurrently with builds or test suites.

## Acceptance boundary

Stage A establishes safe single-document publication. Cross-browser qualification beyond the recorded browser, Windows/Linux filesystem durability, remote browser access to a host-local preview, large directory builds, deployment-provider integration and desktop packaging are not claimed. Preview is local to the service host; current localhost development is the qualified environment.

Phase 3.5 browser/storage follow-ups and the pending manual YouTube/Vimeo playback check remain unchanged. Stop for Stage A acceptance. Stages B–D, Phase 4 and Electron/Tauri packaging are not implemented by this milestone.
