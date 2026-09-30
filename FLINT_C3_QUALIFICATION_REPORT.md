# Flint C3 — Derived backlinks and integrated Stage C qualification

**Implemented and qualified for Stage C review, 30 September 2026. No later roadmap work has begun.** C1a/C1b, C2 and the accepted native persistence contracts remain intact. C3 uses the existing default-on Flint/native-persistence features. SurrealDB and its legacy data are unchanged.

## Result and manual review path

In Flint, **Open Vault**, explicitly open the native Documents to include, and select the target Document. Choose **Show backlinks** in the sidebar. Each mention displays its source title, physical location, canonical ID and native-text context. Activate a row to open/reuse the source occurrence in this Flint Window and select the mention. Closing a source tab does not remove its loaded canonical resource from the scan.

Create references with C2's **Link selected text** picker. Remove them through **References in this Document**, then try ordinary Undo/Redo with the target open in another Flint Window. Backlinks refresh after editing pauses. Closing the panel releases its subscription and pending query; another Window continues independently.

The panel states available/discovered coverage and lists omissions. A target opened after restart can initially have zero backlinks with incomplete coverage because its sources have not been opened. Explicitly open those sources, then return to the target. Neither discovery nor backlinks silently admits files or creates hidden editors.

Review evidence:

- [Two Windows and source navigation](artifacts/flint-c3/browser/two-window-backlinks.png).
- [Native references after server restart and explicit reopen](artifacts/flint-c3/browser/reopened-backlinks.png).
- [Saved source](artifacts/flint-c3/browser/source.mutable.json) and [target](artifacts/flint-c3/browser/target.mutable.json).
- [Integrated browser assertions](artifacts/flint-c3/browser/browser-results.json).

## Service and host boundaries

[BacklinksService](src/feature-api/backlinks.ts) accepts explicit vault scope and canonical Document/root Block identity. It returns source/target identities, an opaque logical mention ID, half-open native Cell ranges, snippets, coverage diagnostics and provider-owned freshness validation. It supports asynchronous cancellation and disposable change notifications. There are no standoff records, repository keys, DOM nodes, projection objects or query-language strings in the UI contract.

[CanonicalBacklinks](src/application/canonical-backlinks.ts) is the default session-only implementation. Its injected capabilities are the canonical repository, native binding/pending-relocation reads, the existing vault lease and an opaque-widget predicate. It does not receive `ReactiveEditor`, mount Documents, call Open, save resources or mutate authored state. There is no backend registry, service locator, persistent index, polling or editable-DOM observer.

The application host supplies the service directly. Following a row refreshes discovery, revalidates canonical source identity, binding/location and repository revision, and rescans the mention before handing its range to the **same C2 host navigation action**. That action opens/reuses this Window's independent occurrence, reveals the passage and restores native selection/focus, with further validation after asynchronous mounting. The C2 query/reference implementation itself is unchanged. A future provider can implement the semantic service and supply its validated host navigation adapter without changing Flint's view.

This work does not change resource ownership, lifetime, persistence enrollment, save generations, pair relocation, Workspace serialization, Markdown behavior or History semantics. Search/backlinks/navigation remain derived operations.

## Reference subset, coverage and freshness

Only loaded, available canonical native Documents in the selected discovered vault are sources. A source requires one canonical identity/root placement and a matching unique discovery row and native binding. Missing, unopened, ambiguous, conflicting or externally moved same-ID resources are omitted; nothing is automatically rebound. Multiple occurrences do not duplicate a source. The target uses the same availability requirements.

The supported reference subset is the existing `codex/block-reference` annotation targeting a Document root Block ID, with canonical `metadata.documentId` where present. A legacy annotation lacking that metadata is accepted only if its root Block target uniquely resolves in scope. Different Document and root Block IDs are preserved. Internal-Block targets and unsupported ranges/forms are diagnosed rather than guessed into Document backlinks.

Definitions resolve through existing linked-annotation ownership/provenance helpers. A Document-owned linked definition with multiple segments counts as one logical mention; distinct local annotations remain distinct. Duplicate ambiguous local mention IDs are omitted. Deleted/client-only annotations, Entity and Find annotations, presentation descriptors, structural ownership and filesystem containment do not become backlinks. Foreign/unresolved linked definitions are diagnosed. Reference cycles do not cause traversal: the scan inspects authored mentions, not a recursively expanded relationship graph.

Canonical owned content/relations are scanned without following separate Document, reference or external-resource bodies. Unsupported hosted content is reported. Snippets read bounded native Cells, preserve Unicode and mark inline objects; they do not scrape the editable DOM or Markdown projection.

Limits are explicit: 200 available Documents; per resource, 5,000 traversal entries, 10,000 annotations, 1,000 mentions and 250,000 snippet Cells; at most 1,000 returned backlinks. Truncation produces incomplete coverage. Scanning yields every 64 traversal entries, 128 annotations and between resources. A query has a 15-second abort budget, including time awaiting discovery; this does not cancel the shared discovery request itself, so rejection can wait for that request to settle. No stronger transport cancellation guarantee is claimed.

Freshness combines vault lease, discovery signature and monotonic repository revision. Any repository edit conservatively makes a completed result stale; an Undo branch cannot revive old offsets. Filesystem changes are detected by existing Refresh/action discovery, not a watcher. An outside change may remain displayed until refresh/activation; activation refreshes and rejects stale evidence. Navigation is not a filesystem lock.

While subscribed, the provider caches only successfully inspected resource entries without diagnostics. Repository change notifications invalidate affected entries using changed content keys or the existing inline-owner fast path. Linked-definition owners are tracked as dependencies. There is no tree walk or snapshot in that synchronous typing callback. Scope/relocation changes clear the cache. The panel immediately disables stale rows, cancels its superseded query and coalesces refresh for 150 ms after changes settle. Unchanged resources reuse cached entries. Closing the last consumer clears the cache/subscriptions; cancellation of one query does not abort another consumer. Each Flint Window owns an independently disposable service instance.

## Qualification

**473 tests passed in 49 files**, comprising the complete accepted C2 regression set (458 tests across Stage A/B/B1/B1.1/B1.2/B2, native production, C1, selection/input and C2) plus 15 C3 service/UI/integration tests. [Machine-readable results](artifacts/flint-c3/qualification-results.json) and [test log](artifacts/flint-c3/qualification.log).

TypeScript checks and client/server production builds passed: [typecheck](artifacts/flint-c3/typecheck.log), [build](artifacts/flint-c3/build.log). Existing bundle-size, mixed static/dynamic import and browser-mapping-data warnings remain.

An initial run overlapped the client build clearing `dist`, causing two server-restart tests to miss their compiled module. Those passed once the build finished. A C2 reference test also assumed that the target tab becoming active meant asynchronous navigation was complete; it now waits for the existing reference controls to be enabled before starting another action. No C2 behavior was changed or assertion removed. The final complete run passed; earlier failure logs are retained separately.

The new service tests cover unmounted sources, exact no-mutation/History evidence, deterministic rebuild, multi-segment deduplication, deleted/Entity/Find filtering, unsupported/foreign/unresolved definitions, cycles, cancellation, stale Undo branches, source removal, independent disposal, affected-resource cache invalidation and duplicate mention identity. Integration tests use real native storage routes and two Flint instances. A delayed/partial semantic test double proves the UI's provider independence, stale completion rejection, cancellation and disposal; it is not a second production backend.

**13 integrated C3 browser assertions passed with zero uncaught browser exceptions.** Together with the six earlier browser gates below, **123 browser assertions passed**. The final screenshots were visually inspected: source identity/location and sentence context are readable, and navigation restores the native source selection.

The integrated Chrome workflow creates two Documents in real subdirectories, edits native title/tags, creates/follows a reference, renames a pair and a folder, searches an unmounted loaded source, follows its backlink in a second Window, checks exact canonical/History immutability, removes/restores the reference with Undo/Redo, refreshes an external directory change, then kills/restarts the server and explicitly reopens native files. It verifies partial coverage before reopening the source, retained authored properties, pointer and keyboard activation, and restored source selection/focus. It uses an isolated temporary store/profile and leaves user data and existing localhost servers alone.

Earlier browser gates were rerun on the final implementation:

| Gate | Passed | Evidence |
| --- | ---: | --- |
| Stage A transient occurrence/lifecycle | 28 | [Results](artifacts/flint-c3/regressions/stage-a/browser-results.json) |
| B1/B1.1/B1.2 native/owned-resource editing | 23 | [Results](artifacts/flint-c3/regressions/b1/native-browser-results.json) |
| B2 consumed-Markdown/pairing | 14 | [Results](artifacts/flint-c3/regressions/b2/browser-results.json) |
| Native production Save/Open/recovery | 13 | [Results](artifacts/flint-c3/regressions/production/browser-results.json) |
| C1b vault UI/relocation/restart | 16 | [Results](artifacts/flint-c3/regressions/c1b/browser-results.json) |
| C2 search/reference navigation | 16 | [Results](artifacts/flint-c3/regressions/c2/browser-results.json) |

These retain the accepted Grouping, Entity, native selection/controls, IME, shared history/content, occurrence disposal, ownership/dependency, read-only storage, stale-client, paired recovery and legacy/Workspace bypass coverage. The C3 workflow adds two-Window backlinks, unsaved native refresh and source navigation; it does not claim a new persistence or input architecture qualification.

The keyboard replay initially omitted Enter’s native character event; the harness now sends it and asserts button focus before activation. The final keyboard workflow passed without an application input change.

Reproducer: `npm run build`, then `node scripts/check-flint-c3-browser.mjs`. Evidence is written under `artifacts/flint-c3/browser`.

### Typing comparison

The existing browser benchmark gained an optional `BENCHMARK_BACKLINKS=1` fixture with the real service and open panel over the same canonical Document. The off/on comparison uses 250 paragraphs, 25,000 characters and 40 insertion/deletion handler samples per run. Six successful runs alternate order across three pairs; all also exercise real Chrome input, Undo/Redo and paragraph splits. Both conditions use the same current editor and authored fixture ID; the measured variable is the active backlinks subscription/panel, not a different repository revision.

| Trial | Off mean / median / p95 (ms) | On mean / median / p95 (ms) |
| --- | --- | --- |
| 1 | 3.52 / 1.60 / 21.10 | 2.93 / 1.60 / 4.00 |
| 2 | 4.38 / 2.50 / 5.70 | 3.86 / 1.60 / 6.60 |
| 3 | 2.94 / 1.50 / 4.30 | 2.47 / 1.30 / 3.00 |

No repeatable typing slowdown was observed. These short, noisy local runs do **not** establish a performance improvement or a large-vault latency guarantee. All six runs took **zero repository snapshots** during ordinary typing, restored the edited text and retained unrelated Cell identity. Service tests additionally verify that typing invalidates only the affected cached source. The synchronous burst benchmark measures input overhead, not the duration of a later deferred scan. [Summary and raw runs](artifacts/flint-c3/typing/summary.json).

A preliminary run stalled in the CDP harness and was discarded; the harness now times out requests. A later run passed its assertions but failed Chrome-profile cleanup with `ENOTEMPTY`; bounded cleanup retry was added and the complete pair rerun. The failed cleanup log is retained separately and excluded from the six-run comparison. These were qualification-harness changes, not application changes.

## Separate future work and review boundary

A future native-derived SurrealDB ingestion/reconciliation effort should begin from the [accepted infrastructure review](FLINT_SURREALDB_INFRASTRUCTURE_REVIEW.md). It needs canonical resource/Block identity, generation/freshness evidence, deletion/reconciliation, native Cell boundaries, linked-definition provenance and deterministic relationship identity. It must account for live unsaved canonical content rather than silently substituting stale disk/database state. SurrealDB stays derived/rebuildable and cannot become authority for identity, ownership, binding, save generation or unsaved editor state.

No database changes, legacy repair/migration/reindexing/cleanup, full-vault loading, filesystem watchers, graph UI, new reference format, Workspace persistence or broader durability claim is included. Loaded-resource coverage, the Document-root reference subset and conservative freshness rejection are deliberate limits.

**Stop for integrated Stage C review.**
