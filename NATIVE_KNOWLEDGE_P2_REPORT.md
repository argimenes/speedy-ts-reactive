# Native Knowledge / Facts — Stage P2 implementation and qualification

Date: 2026-10-01. Scope: **P2 only** of the accepted [production integration plan](NATIVE_KNOWLEDGE_PRODUCTION_INTEGRATION_PLAN.md).

## Result

P2 implements the shared semantic collector, lightweight saved reader, bounded Node worker and read-only saved-Facts route. Managed discovery now performs native semantic inspection in the worker by default. Existing Flint C2/C3 providers remain active; no background Knowledge provider, live overlay, production index or P3 lifecycle has been installed.

The qualified discovery results and storage guards are preserved. Worker uncertainty is explicit incomplete discovery, never evidence of absence or uniqueness. This was exercised through worker failure, cancellation, timeout, crash, incomplete/stale replies, filesystem changes and relocation guards.

The final integrated regression result is **524 passes and one known pre-existing failure (525 tests in 40 files)**, including the accepted pre-existing `BlockTreeProjection` / Solid development-wrapper enumeration failure. Production builds and client/server/qualification typechecks pass. This is not an assertion that every existing test is green.

## Production factoring

| Surface | Responsibility |
| --- | --- |
| `src/knowledge/facts.ts` | Semantic Document, Block, annotation and logical mention facts. Location/read evidence is separate; a byte hash is not a save generation. |
| `src/knowledge/policy.ts` | Immutable, serializable extraction policy: version plus explicit opaque types. Application-host bodies are always omitted. |
| `src/knowledge/collect-facts.ts` | Shared collection, coordinate handling, logical mention grouping, provenance, omission diagnostics and bounded traversal. No location, persistence or navigation authority. |
| `src/knowledge/saved-reader.ts` | Original-wire validation, private text-free structural witness, span-based text/Cell coordinates and read-only identity/title inspection. |
| `src/knowledge/transport.ts` | Versioned derived-response shape validation and the existing authored-value grammar at annotation `value` boundaries. |
| `server/native-knowledge-worker.ts` | Two byte-in operations: validated inspection or Facts extraction. Hash, validation, extraction and encoding timings are returned separately. |
| `server/native-knowledge-jobs.ts` | One lazily created worker, bounded queue/input, deadlines, cancellation, stale-response rejection, recreation and disposal. |
| `server/native-knowledge-routes.mjs` | Confined read-only `/api/native/vault/facts`, composed by the existing native router. |
| `server/native-vault-store.mjs` | Continues to own directory discovery, uniqueness, pairing, operation and confinement decisions. Adds read-evidence rechecks across worker yields. |
| `scripts/build-native-knowledge-worker.mjs` | Worker bundle, included by the existing server build and npm test setup. |

The old qualification `extract.ts` and `lightweight.ts` are small compatibility adapters, not parallel production collectors. Existing full-decoder/capture paths remain independent **reconstruction** oracles: they reconstruct full native text Cells, whereas the production saved reader uses spans. They intentionally share the semantic collector. Expected-result tests additionally check text coordinates, omissions, provenance and transport values; this report does not describe the shared collector as two independently implemented semantic algorithms.

The qualification filesystem walkers, `.ink` probes, ephemeral index, live adapter/overlay, fixtures and benchmarks remain test-only. No production import points into `src/qualification`. The built worker imports only `node:worker_threads` and `node:crypto`; it has no filesystem API, live repository, editor, admission, binding or write capability. The private witness is never returned or admitted.

## Shared semantic contract

- Resource identity and root Block identity remain distinct, stable identities. Paths and titles do not create identities.
- `standoff-editor-block` uses native Cell boundaries, including Unicode surrogate interiors and inline-image separators. `plain-text-block` and `text-block` use the same UTF-16 search source as C2.
- Explicit opaque types and `*-application-block` bodies are omitted consistently. Unsupported hosted text also remains an explicit omission. Worker Facts requests require a supplied policy; there is no guessed worker registry. P3 will supply the actual host capabilities.
- Owned native text is collected once. Reference occurrences do not multiply it; external resource bodies are not absorbed into an owner's contribution.
- Linked mentions retain logical identity, segment ranges, definition provenance and canonical target IDs. Deleted/client-only properties do not contribute. Duplicate segments/conflicting linked mentions are suppressed conservatively.
- Unresolved/foreign/ambiguous definitions and opaque/external omissions produce diagnostics. Such a partial contribution cannot establish complete absence of backlinks.
- All original reserved native fields and original text atoms are validated before making the private witness. Image atoms and their authored bags remain in structural validation. Unknown authored values are not stripped to make validation pass.
- Rich annotation values, including explicit `undefined`, `-0`, NaN, infinities and user objects containing the grammar's reserved tag, survive worker and JSON transport. Native bytes are unchanged. Facts select semantic information; they are not another lossless native DTO.
- Semantic results and their evidence are separately owned snapshots. Consumers should replace contributions rather than mutate published Facts. P2 does not install a publishing/index lifecycle.

The transport applies `encodeAuthoredValue` / `decodeAuthoredValue` to annotation values only. Ordinary derived text, boundaries and identifiers use the validated response shape. An early whole-Facts grammar encoding was correct but unnecessarily expensive; its measurements are retained as exploratory evidence, not the final implementation.

## Worker and discovery protocol

The facility permits one active operation, at most eight accepted active/queued requests, at most 40 MiB of waiting input and a 20 MiB per-input limit. Active transferred input can add up to 20 MiB. The worker has a 256 MiB old-generation limit; the inner Facts wire output is capped at 32 MiB (the HTTP JSON wrapper adds escaping/metadata overhead). The default 60-second deadline includes queue time. Existing 10,000-Block / 10,000-annotation and 2,000,000-text-unit extraction bounds remain in force. A bounded result with an omission diagnostic is distinct from complete extraction; a thrown validation/transport failure publishes no Facts.

Input is copied to a private transferable buffer, preserving caller bytes. Replies carry the request serial, kind, policy, validated header and byte hash. A mismatched/incomplete reply cannot complete the current operation. Active cancellation or timeout rejects that operation and terminates its worker, including synchronous validation. Queued unrelated requests survive recreation; cancelling a queued request removes only that request. Closing the facility rejects pending work and awaits worker termination. There is no synchronous heavy-decoder fallback on worker failure.

Discovery still walks the real managed tree, applies the same native filename and symlink rules, obtains receipts/baselines/pending-operation evidence in the store, groups duplicate IDs, and recognizes a generated Markdown projection only through accepted pair evidence. `.ink` / `.ink.md` behavior is unchanged and outside this stage.

Across the asynchronous inspection boundary, discovery checks:

1. Confined input bytes and a native file identity/stat stamp.
2. Worker inspection identity/header and matching byte hash.
3. Native bytes and file identity after inspection/baseline reads.
4. Earlier inspected candidates and their pair evidence again before publication.
5. Enumerated directory identity/change stamps, so late additions/removals cannot silently resolve uniqueness.

Read stamps include device/inode, size and nanosecond modification/change times. They are temporary scan evidence, not a catalog or persistent cache. Directory/file/pair changes make the scan incomplete. A raced or uninspected candidate has an explicit path in `uninspected` and/or a scope diagnostic. Previously enumerated candidates are never authoritative absence evidence merely because inspection failed.

`complete: false` remains the authority gate: no provisional unique row can authorize Open/relocation or the new saved-Facts route. Failed inspection does not repair receipts, change pair state, refresh a persistence binding or resolve an identity ambiguity. Cancellation rejects the discovery operation rather than returning an empty complete vault. Filesystem discovery is still an optimistic read, not an atomic filesystem snapshot or a watcher; consumers must keep the existing revalidation rules.

The internal `nativeDiscoveryWorker` composition flag defaults to **true**, consistent with the user's default-on rule. Setting it false explicitly selects the retained decoder inspector for controlled rollback/diagnosis. The inspector injection remains internal; an HTTP caller cannot choose a weaker inspector. Both modes retain the same managed-store checks. This flag does not switch Flint's C2/C3 provider or authorize the later P4 rollout.

## Saved-Facts route

`POST /api/native/vault/facts` accepts the vault, native location, expected canonical resource ID, discovery's native byte hash, and explicit extraction policy. It requires complete discovery, a unique matching location/identity, and conservative `paired` or `unenrolled` eligibility. Changed, ambiguous, pending or unavailable evidence does not contribute saved Facts.

The store checks confinement, native file identity/hash and pending relocation before dispatch. Before returning it rechecks target identity, bytes, location, pair/operation evidence and complete discovery. The response contains encoded Facts, separate read evidence and timings, never a native persistence DTO or permission to mutate a file. Read-only stores can use this route. Markdown is not a search/extraction source.

This is a deliberately bounded **single-resource** route. It currently repeats complete discovery before/after extraction. It is suitable for the P2 correctness gate; repeatedly invoking it for every note would repeat vault-wide I/O/inspection. The 100/1,000/10,000 extraction controls therefore exercise the worker directly, not this endpoint N times. Reusing a verified scope read for progressive saved coverage belongs to the already approved P3/P5 lifecycle/batching work; this report makes no whole-vault endpoint throughput or startup claim.

## Correctness qualification

Evidence: [integrated results](artifacts/native-knowledge-p2/tests.json), [focused results](artifacts/native-knowledge-p2/final-focused-tests.json), and `server/native-knowledge.test.ts`.

| Gate | Result |
| --- | --- |
| Accepted lightweight versus full-decoder oracle | All 38 cases pass, including actual B1/B1.1/B1.2/B2/C3 files, malformed wire/text atoms, rich values, reference/owned-external cases, retention, budgets and Unicode. |
| Accepted live versus capture consumer regression | All 30 cases pass, including qualification boundary off/on, opaque policy, edits, Undo branches and unresolved definitions. No live provider was promoted. |
| New worker/route/uncertainty cases | Native Facts equality; plain/text/standoff parity; rich worker and actual HTTP round-trip; malformed response/policy/native input; queue limit; active/queued cancellation; crash/timeout/stale/incomplete replies; worker recreation; disposal; oversized input and text-budget failure. |
| Discovery/storage regressions | Existing 44 C1a managed-store cases pass, together with process restart/recovery, native production routes, C1b vault/property and native session tests. |
| Publication races | Changed/replaced/deleted native files, late changes to earlier inspected files/pairs, late duplicate candidates, relocation and symlink replacement all invalidate evidence. |
| Ownership/native compatibility | Selected Stage A, B1/B1.1/B1.2/B2, graph/resource/portable, native session, C2/C3 and P1 boundary tests pass except the known unrelated projection enumeration assertion. |
| No write authority | Read-only HTTP test preserves native bytes and directory contents. Pair receipt evidence remains unchanged by successful/failed reads. Changed and partially published pairs stay ineligible. Existing destructive/write guards remain in place. |
| Build and static checks | `npm run build`, `npm run typecheck`, qualification TypeScript check and `git diff --check` pass. |

The final test selection is reproducible:

```sh
node scripts/build-history-worker.mjs
npx vitest run src/block-tree src/qualification/native-knowledge \
  src/qualification/native-b1 src/qualification/native-b2 \
  src/application/jet-stage-a-proof.test.ts \
  src/application/canonical-backlinks.test.ts src/application/flint-knowledge.test.tsx \
  src/application/document-vault.test.ts src/application/flint-vault.test.tsx \
  src/history/stage-c-gates/portable.test.ts src/history/stage-c-gates/resource.test.ts \
  src/persistence/native-session.test.ts src/persistence/native-vault-session.test.ts \
  server/native-document-store.test.mjs server/native-vault-store.test.mjs \
  server/native-vault-restart.test.mjs server/native-knowledge.test.ts \
  --maxWorkers=1 --minWorkers=1
```

## Performance: discovery is separate from extraction

Measurements use isolated temporary fixtures on this Mac (Node 22.12.0, Apple M1), warm OS files, one worker and a 5 ms server heartbeat. See the final raw [100](artifacts/native-knowledge-p2/final/benchmark-100.json), [1,000](artifacts/native-knowledge-p2/final/benchmark-1000.json) and [10,000](artifacts/native-knowledge-p2/final/benchmark-10000.json) controls. These are engineering controls, not general hardware guarantees.

### Complete managed discovery

Both implementations return the expected complete, identical resource set. The worker row includes all final store rechecks; it is not a worker-only parsing time.

| Resources | Legacy full-decoder discovery | Worker discovery | Guarded read time, worker path | Server hash time, worker path | Worker validation | Max heartbeat delay: legacy / worker |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 100 | 4,730 ms | 230 ms | 46.1 ms | 4.0 ms | 111.4 ms | 122.0 / 1.1 ms |
| 1,000 | 46,969 ms | 1,684 ms | 380.8 ms | 28.5 ms | 875.9 ms | 113.6 / 0.9 ms |

Read timing measures the store's guarded reads. Hash timing is instrumented in the qualification bundle, not by adding a production counter. Remaining wall time includes directory/stat/receipt/operation work, worker dispatch and transport. Some archive reads occur inside existing pair helpers and are included in remaining store time. This deliberately does not label every remaining millisecond “transport.”

Moving validation both removes full text-Cell reconstruction from discovery and removes semantic validation stalls from its server request thread. The 10,001-Block input makes the scheduling distinction clearer: full-decoder discovery took 474–544 ms with 464–533 ms heartbeat stalls; worker discovery took 560–720 ms with 0.9–2.9 ms stalls. Every one of those reads returned **complete ready inspection**, not an unavailable shortcut. Worker isolation is not a promise to reduce elapsed time for every shape.

### Synthetic extraction, transport and publication controls

Each resource is read/hashed, extracted by the worker, transported, decoded and held in a test Map. The matched direct-reader control performs equivalent extraction and the same encode/decode/retention work on the caller thread. No production index or provider is created. Total harness budget is raised; individual resource/store limits are unchanged.

| Resources | Worker end-to-end | Read/hash | Worker validation | Facts extraction | Worker encoding | Transport/startup remainder* | Server decode/Map publication |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 100 | 205 ms | 14.0 ms | 101.6 ms | 19.9 ms | 3.5 ms | 46.0 ms | 10.4 ms |
| 1,000 | 1,465 ms | 152.0 ms | 886.3 ms | 149.1 ms | 33.9 ms | 102.0 ms | 84.3 ms |
| 10,000 | 12,684 ms | 1,617.7 ms | 8,056.1 ms | 1,175.2 ms | 301.8 ms | 435.8 ms | 671.5 ms |

*Sum of round-trip minus worker execution; includes message transfer, startup and caller scheduling. Queue wait is separately available in individual replies. Worker execution also includes hashing and small setup costs, so columns are not an exact accounting identity.

At 10,000 resources the matched direct control took 11,681 ms, including 7,815 ms validation and 1,110 ms collection. Corresponding worker phases were approximately 3.1% and 5.9% slower, below the plan's repeatable 20% review threshold. The preceding matched repeat was approximately 16% slower in those phases, also below it. Initial unmatched/whole-Facts-encoding results were slower and triggered investigation: [initial control](artifacts/native-knowledge-p2/benchmark-10000.json), [matched intermediate control](artifacts/native-knowledge-p2/matched/benchmark-10000.json). Absolute wall times varied across runs; the final matched phases, not an old single wall-time number, define this comparison.

The earlier roughly 21.6-second lightweight benchmark included different phases and no production transport path. Neither it nor this 12.7-second extraction control is production startup latency. No complete managed 10,000-resource directory scan is claimed: existing entry limits remain unchanged and ordinary vaults include additional files/directories. Current providers still search their accepted loaded resources.

### Large result, cancellation and browser transport

[Scheduling evidence](artifacts/native-knowledge-p2/scheduling.json): a 10,001-Block plus root native input produces a 10,000-Block partial Facts result with `Block budget reached`, while identity inspection remains complete. The final roughly 1 MB Facts result took 557 ms validation, 255 ms collection, 5.0 ms encoding and 14.3 ms server decode/publication. Maximum caller heartbeat delay was 11.3 ms. Cancelling synchronous large inspection rejected after roughly 11 ms; cancellation plus recreation and a successful following identity read completed in roughly 42 ms.

[Real browser evidence](artifacts/native-knowledge-p2/browser-transport.json), isolated Chrome 154:

- 100 ordinary responses: 70.8 ms total HTTP/JSON transfer, 11.7 ms total semantic decoding, approximately 2 ms maximum heartbeat delay.
- One 1 MB large response: 11.5 ms transfer, 7.4 ms semantic decoding, 8.1 ms maximum heartbeat delay.
- The isolated HTTP host spent 8.6 ms total serializing the outer JSON responses.

This uses the production transport decoder but an array as the publication sink. It proves neither a browser index lifecycle nor editing responsiveness under P3/P4 workloads. P3 remains the appropriate scheduling/provider gate. Initial whole-Facts grammar encoding produced approximately 45 ms browser and 62 ms server decoding; narrowing the grammar to authored annotation values removed that avoidable work without changing the authored-value codec.

The isolated performance controls are reproducible with:

```sh
P2_MATCHED_CONTROL=1 P2_ARTIFACTS=artifacts/native-knowledge-p2/final \
  node scripts/check-native-knowledge-p2.mjs 100 1000 10000
P2_SCHEDULING=1 node scripts/check-native-knowledge-p2.mjs scheduling
node scripts/check-native-knowledge-p2-browser.mjs
```

The browser command reads the final sample and large-result artifacts produced by the preceding commands. Its local server and browser profile are isolated and disposed afterward.

## Memory and remaining limits

| Extraction control | Retained main-heap increase for test Facts | Peak sampled worker heap |
| ---: | ---: | ---: |
| 100 resources | 2.7 MiB | 9.8 MiB |
| 1,000 resources | 24.4 MiB | 20.6 MiB |
| 10,000 resources | 241.9 MiB | 28.2 MiB |

The worker samples are post-job live-heap readings, not forced-GC retained-size proofs or exact allocation peaks. The large 10,001-Block control sampled approximately 61.6 MiB in the worker. Worker old-generation and transport/input limits bound failures conservatively; a budget/crash is unavailable coverage.

At 10,000 resources, after clearing the test Map and closing the worker, main heap returned to 4.6 MiB versus a 4.9 MiB baseline. Combined process RSS did **not** return immediately to baseline (roughly 346 MiB after release versus 74 MiB initially); allocator reservation is not a claim of retained Facts, nor does the heap result prove every RSS category released. The process peak was approximately 390 MiB. Browser used heap rose from 0.43 MiB to 3.41 MiB while retaining 100 ordinary plus one large response, then returned to 0.48 MiB after clearing and collecting it. Browser, worker heap and combined server-process RSS are deliberately not added together as independent memory categories.

The accepted P1 caveats remain unchanged:

- Approximately 48 bytes/content-record of repository bookkeeping is an accepted production tradeoff. P2 does not alter it.
- Additional legacy-constructor retention through the existing weakly keyed `resourceOwner` cache remains a known limitation. This saved-reader/transport browser test does not retain a live legacy constructor graph and does not resolve that question. P3 session lifecycle measurements must test realistic production retention before proposing a bounded correction.
- P1's 4 ms cooperative target is not a hard deadline. P2 neither changes nor optimizes the P1 audit; P3 must assess actual provider/browser scheduling.
- The separately reproduced projection/Solid enumeration regression remains a known pre-existing test failure.
- Resource-local post-admission boundary reads are qualified; arbitrary structural repository admission remains global. No admission redesign is part of this work.

Other explicit limits: no persistent semantic cache, SurrealDB, filename migration, Markdown authority, filesystem watcher, new binding/ownership/storage contract, production index or provider rollout. The per-resource route is intentionally conservative and not yet the progressive saved-coverage lifecycle. Missing/unavailable/ambiguous evidence remains a coverage limitation, not permission to publish absence.

**Stop for P2 review. P3 has not begun.**
