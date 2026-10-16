# Mutable OS Application Services Foundation

Date: 2026-10-17  
Status: Accepted and complete. Phase 3.6 architecture planning is separately authorized; Phase 3.6 production implementation, Phase 4 and Electron/Tauri implementation have not begun.

## Implementation

The minimum foundation from [the approved architecture review](MUTABLE_APPLICATION_SERVICES_DESKTOP_ARCHITECTURE_REVIEW.md) is implemented behind the default-enabled `applicationServices` flag. The active Cavern hosts the new API. Disabling the flag exposes no foundation operations and creates no job storage.

Three concerns are separate:

| Concern | Implementation |
| --- | --- |
| Application-service contracts | [contracts.ts](src/application-services/contracts.ts): typed operation inputs/results and serializable job records, independent of HTTP, Node, DOM and editor state. Existing MutableFragment and archival data types remain the document interchange models. |
| Application workflows | [service.ts](src/application-services/service.ts): preparation, validation, cancellation and recovery coordination through injected [capabilities](src/application-services/capabilities.ts). |
| Platform adapters | [Node host](server/application-services/host.ts), [filesystem journal](server/application-services/job-storage.ts), [worker executor](server/application-services/executor.ts), [HTTP adapter](server/application-services/http.ts) and [browser client](src/runtime/application-services.ts). Node is the initial implementation, not a requirement of the operation data contracts. |

The HTTP adapter is mounted at `/api/services` behind the existing Cavern session gate. It exposes only the named operations below; callers cannot supply arbitrary filesystem roots, SQL or shell commands. The browser client rejects results when its Cavern/session changes and has no subscriptions, polling or startup I/O.

| Operation | Behavior |
| --- | --- |
| `native.read` | Returns the saved native JSON, resource identity, exact byte hash and generation. Reuses the existing native Open implementation and conflict/relocation checks. Rejects pending publication and a mismatched expected hash. |
| `assets.original` | Retrieves an integrity-checked original from the current Cavern's existing immutable asset store. Binary HTTP transfer preserves its bytes. |
| `knowledge.packageData` | Uses the existing read-only SQLite worker and transactional logical-slice extractor, with bounded seed IDs and explicit closure options. |
| `jobs.create`, `jobs.list`, `jobs.inspect` | Persist explicit conversion/package preparation requests, discover jobs in pages of 50, and inspect/reconcile interrupted execution. Creation IDs support exact-request retry. |
| `jobs.run`, `jobs.cancel`, `jobs.result` | Execute a reviewed revision, cancel work, and retrieve a completed immutable result. No native document save or editor transaction is performed. |

Preparation supports Markdown/HTML/text conversion and `.inkpkg` generation. It reuses the existing parsers, native codec, inventory, package encoder and validation. Package preparation checks the reviewed document hash before and after work, retrieves referenced assets once, and retains the existing archival boundaries. This milestone introduces no publishing implementation or new UI menu.

## Durable jobs and recovery

Jobs live in `.mutable/jobs/<id>/`, outside the knowledge SQLite database. The Node adapter reuses the existing pinned-directory filesystem helper, OS locks, file/directory synchronization and create-only publication. Requests, numbered checkpoints and result artifacts are published from staged files; metadata updates use expected revisions. A separate execution lock excludes competing hosts.

The persisted request is immutable. Inspection of a running job whose execution lock is available marks it interrupted; it does not replay work. Explicit resumption of failed/interrupted preparation validates the revision and saved document hash again. The list operation permits rediscovery without browser-retained job IDs and reports malformed/incomplete records as diagnostics.

Cancellation and request disconnection stop preparation and retain its outcome. Host shutdown aborts active workers and drains job bookkeeping. Cancelled jobs require a new explicit job; failed/interrupted jobs can be resumed. A lost completion acknowledgement is reconciled by reading the published checkpoint. Corrupt records, source changes and result-hash mismatches fail closed.

These jobs prepare artifacts only. Existing native writer receipts remain authoritative for document publication, and asset leases remain authoritative for asset publication. There is no global filesystem Undo, background document save, automatic replay or journal migration. Stage E continues using its qualified IndexedDB/Web Locks implementation unchanged.

## Bounds and ownership

- One running preparation job per host. The executor supports one active worker and two queued tasks, with a 30-second deadline including queue time, termination on cancellation/error/timeout, and a 96 MiB aggregate queued/active input budget (64 MiB per task).
- Worker V8 limits: 384 MiB old generation and 32 MiB young generation. These are not an absolute process-RSS guarantee; buffers and serialization have additional costs.
- Conversion input: 200,000 UTF-16 code units. Existing parser/fragment limits also apply. Native package input remains limited to 8 MiB, with at most 20 originals totaling 40 MiB and the existing archive limits.
- Result payload ceiling: 64 MiB. Up to 1,000 jobs and 256 checkpoints per job; result publication refuses to increase retained job files beyond 128 MiB. Directory inspection also has a bounded entry count. Staging failures retain evidence; no automatic job garbage collection is introduced.
- HTTP concurrency is bounded at eight requests. Storage work and executor queues are explicitly bounded; no task is scheduled from ordinary editing.

Typing, selection, caret geometry, IME, annotation rendering, interactive previews and Undo/Redo remain in SolidJS/editor ownership. The production editor, clipboard workflows, collection controller and Stage E journal were not modified. The native-route change extracts the existing Open function for reuse while retaining its original route and writer behavior.

## Qualification

- **196 Vitest tests passed** across 20 files covering interchange, clipboard semantics, native persistence, collection saves, Cavern lifecycle and foundation services. After additional checkpoint-corruption validation, a **39-test focused run passed**, including one new test; these totals overlap.
- **18 Node tests passed** for immutable asset storage/security/recovery and independent SQLite package-data reconstruction.
- Foundation checks exercise HTTP and direct calls, native publication pending/recovery, original image bytes inside packages, asset deduplication, stale hashes/revisions, cross-Cavern evidence rejection, path traversal/symlink/SQL-field rejection, execution locks, checkpoint conflicts, cancellation of active/queued workers, deadlines, feature-off behavior, interrupted publication, rediscovery and lost completion acknowledgements.
- **Chrome 155 on macOS passed** the real HTTP client probe in a disposable Cavern: create, reload, rediscover via the host journal, execute, retrieve semantic content and reject a stale session. The browser probe found a `fetch` receiver-binding issue, which was corrected before final qualification.
- Production client/server builds, TypeScript checks and `git diff --check` passed. Existing client large-chunk warnings remain.

Build the client before rebuilding the server: Vite clears `dist`, including generated server workers. An initial overlapping build/test run lost those generated workers; the sequential rebuild and regression run passed.

Reproduction commands:

```sh
npm run build:client
npm run build:server
npm run typecheck
npx vitest run src/interchange src/runtime/clipboard.test.ts src/runtime/document-interchange.test.ts src/runtime/collection-interchange.test.ts src/persistence server/native-document-store.test.mjs server/application-services server/cavern-lifecycle.test.ts server/collection-store.test.ts
node --test --test-concurrency=1 server/managed-assets.test.mjs src/knowledge-sqlite/package-data.test.mjs
node scripts/check-application-services-browser.mjs
```

## Typing measurements

The existing real Flint benchmark used the same Michelangelo letter, a 499-character paragraph, eight mounted paragraphs, Normal caret mode and 40 alternating edits. Runs were sequential, without concurrent builds/tests. The repeat pair reversed the on/off order.

| Run | Synchronous median | Synchronous p95 |
| --- | ---: | ---: |
| Feature off | 7.0 ms | 9.6 ms |
| Feature on, idle | 8.0 ms | 13.4 ms |
| Feature on, repeat | 7.0 ms | 18.5 ms |
| Feature off, repeat | 6.4 ms | 12.0 ms |
| Feature on, concurrent preparation | 7.5 ms | 11.6 ms |

Every run recorded **zero document snapshots, zero save-status reads and zero application-service requests during typing**. All restored the original text and passed actual Chrome character-input and Undo checks. The concurrent run completed one durable conversion while another worker was active during the measurement interval.

The enabled idle runs had higher tail timings. Profile inspection found the existing selection `addRange`, cloning and reactive work among the leading costs, with no application-service code in the typing profile. The new flag has no production editor consumer or typing subscription. These small samples do not establish a latency improvement or statistical equivalence; they qualify the absence of new editor-triggered work and successful editing under host load, not a universal display-latency guarantee. No unrelated editor optimization was made.

Reproduce with `scripts/benchmark-flint-typing-browser.mjs`, setting `BENCHMARK_APPLICATION_SERVICES=false` or `true`; add `BENCHMARK_APPLICATION_SERVICE_LOAD=1` for real disposable host work. `BENCHMARK_OUTPUT` selects the artifact directory. Logs and profiles for this qualification are under `/tmp/application-services-*`.

## Remaining limits and acceptance boundary

The filesystem/locking implementation is qualified here on macOS. Windows/Linux durability, native-module packaging, desktop dialogs/clipboard bridges and Electron/Tauri distribution remain future platform qualification. The existing pinned-filesystem helper is still loaded from the repository's scripts directory; desktop packaging must supply it through the Node adapter.

There is no general job scheduler, journal maintenance UI or automatic garbage collection. Limits produce explicit errors and retain evidence. Future document-writing/publishing jobs need their own reviewed commit/recovery policy; the preparation workflow does not authorize them. Existing clipboard browser limitations, asset maintenance/relocation follow-ups and manual video-playback qualification remain unchanged.

The user has accepted the foundation implementation and qualification. No further foundation work is required by this milestone. The separately requested [Phase 3.6 architecture and implementation plan](MUTABLE_PHASE_3_6_ARCHITECTURE_AND_IMPLEMENTATION_PLAN.md) requires review before publishing implementation begins; Phase 4 remains outside authorization.
