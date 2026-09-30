# Flint C2 — Search and native reference navigation

**Implemented and qualified for review, 30 September 2026. Stop here; C3 backlinks is not implemented.** C1a/C1b and the accepted native persistence contracts remain in place. C2 is available with the existing default-on Flint/native-persistence features.

## Result and manual review path

Open Flint, **Open Vault**, and explicitly open the native Documents to include. Closing their tabs does not remove their canonical resources from search. In the left sidebar, enter text under **Search** and press **Search vault**. A result shows its title, physical location, canonical Document ID and native-text snippet. Activate it to open/reuse this Window's occurrence and select the passage. Unopened files and other coverage omissions are listed; they are not silently admitted.

Select annotated text in the active Document, choose **Link selected text**, then choose a loaded Document. Escape or **Cancel reference** restores the selection. **References in this Document** lists outgoing native mentions with **Follow reference** and **Remove reference** actions. Use ordinary Undo/Redo for creation/removal. This is an explicit outgoing-reference list, not a backlinks service.

Review evidence:

- [Search and two independent Windows](artifacts/flint-c2/browser/search-two-windows.png).
- [Native reference after server restart and file reopen](artifacts/flint-c2/browser/reopened-native-reference.png).
- [Saved source resource](artifacts/flint-c2/browser/source.mutable.json): the native reference stores identity, not a filesystem link.
- [C2 browser results](artifacts/flint-c2/browser/browser-results.json).

## Implementation and boundaries

### Canonical query sources

[canonical-search-source.ts](src/runtime/canonical-search-source.ts) extracts supported text directly from `repository.readState()`. The existing Document Find runtime uses the same extracted routine. Standoff text uses Cell boundaries mapped from UTF-16 matcher offsets; surrogate interiors cannot become selection boundaries. Combining graphemes are validated by the existing matcher. Inline images/widgets divide runs rather than concatenating text across an object. Plain text retains UTF-16 ranges.

[VaultKnowledge](src/application/vault-knowledge.ts) is a disposable query/reference adapter supplied by the existing Document application host. It consults the C1 vault lease/discovery and canonical native-session binding. A resource must have one canonical Document identity/root placement and a uniquely available discovered location matching that binding. Multiple occurrences never duplicate a source. The scan walks canonical owned content and relations, respecting separate Document, reference and external-resource boundaries. Unsupported hosted text and omitted bodies produce coverage diagnostics.

Search includes loaded, currently edited native title/text, including unsaved edits to an already bound resource. Markdown bytes, filenames and tags are not text-search sources. Tags retain C1b's separate simple filter. Search does not create projections, call Open/admission, snapshot the repository, export Markdown or retain a persistent index. A completed batch keeps only result locators/snippets and freshness evidence; extraction and the worker belong to that request.

Limits are explicit: 200 available Documents; 5,000 traversal entries per Document; 5,000 searchable text Blocks and 250,000 Cells per query; 2,000,000 native text code units; titles capped at 10,000 code units; 256-character query; 1,000 displayed passages. Coverage reports truncation. Extraction yields periodically, a running request has a 15-second cancellation budget after discovery, and the existing worker has its own 5-second budget and candidate limit. Discovery keeps its existing bounded server contract. Search is literal text with the existing default matching options; no new regex or Markdown syntax UI.

### Freshness and navigation

Freshness combines the selected vault lease, its discovery signature, and the repository's monotonic revision. Cancellation/replacement discards result tokens. Changes during extraction/matching abort the request. Undo followed by a new branch cannot revive old offsets. Completed results become visibly stale on observed repository/discovery changes. This is deliberately conservative: unrelated repository edits can also require a new search.

Activation refreshes discovery, revalidates the exact token, canonical identity, revision and current binding/location, then resolves the passage in the invoking Flint instance's projection. It reveals inactive nested tabs with the existing reveal capability and restores the native range/focus. Validation repeats after asynchronous mount/reveal steps. External filesystem changes are detected on Refresh/action, not through a watcher; an undiscovered outside change may leave a displayed row until activation, which refreshes and rejects it. A file can still change after a completed refresh; this is navigation freshness, not a filesystem lock or new durability claim.

Search/reference navigation uses an application-owned transient tab descriptor when no existing tab targets the Document. It does not insert an authored tab Block or create a History entry. Existing authored tab descriptors remain usable. The descriptors/bookmarks are retained across instance remount/minimize and disposed with the application; they are not added to Workspace persistence. Closing a navigation tab disposes only its occurrence. `TransientDocumentView` exposes a narrow internal projection registration callback so the host can select the right occurrence; no second editor or repository was introduced.

### Native references

The picker snapshots valid nonempty native standoff-text selection ranges and uses the existing `linkedAnnotations.createBatch` transaction. Single-Block selections use local annotations; cross-Block selections use the existing Document-owned linked-definition representation. The existing `codex/block-reference` wire semantics remain: `value` is the target root Block ID, and `metadata.documentId` is canonical Document identity. Qualification explicitly uses a target whose root Block ID differs from its Document ID.

Outgoing inspection resolves linked definitions through the existing ownership/provenance helpers, counts one linked mention once, ignores deleted annotations, and keeps separate mentions separate. Local removal uses existing annotation deletion; linked removal uses existing definition deletion. Both are ordinarily undoable. References survive native save/reopen, title edits and pair relocation without rewriting the source.

The approved reference subset remains Document/root-Block targets. Arbitrary internal-Block or unknown reference forms are preserved and reported as unsupported; unresolved/foreign linked ownership is not guessed or adopted. Unopened, missing or ambiguous targets remain unavailable until explicitly opened/resolved. The picker does not annotate a plain-text textarea, empty selection, composition in progress, a nested foreign Document or another Window's selection. Plain-text Documents remain searchable/navigable.

The feature UI receives semantic search/selection/reference capabilities, not `ReactiveEditor`, arbitrary DOM access or a repository service locator. There is no graph service, backlinks implementation, database, new storage format, autoload, filesystem watcher or change to Markdown parsing.

## Qualification

**458 tests passed in 46 files**, including every suite in the accepted C1b qualification set (435 tests), 12 new C2 integration tests and the existing 11 text-search tests. [Machine-readable results](artifacts/flint-c2/qualification-results.json) and [test log](artifacts/flint-c2/qualification.log). A subsequent focused 12-test run also passed after strengthening the distinct-root-ID/native-round-trip assertion: [focused log](artifacts/flint-c2/c2-focused.log).

| C2 gate | Evidence/result |
| --- | --- |
| Unmounted loaded Document; multiple occurrences | One native result, no hidden projection; activation opens the invoking Window's own occurrence. |
| Title, Unicode and inline content | Title search, emoji Cells, combining sequences and image run boundaries pass. Plain UTF-16 passage navigation reveals an inactive nested tab. |
| Coverage | Unopened, missing, duplicate/conflicting discovery, outside-vault resources, nested resource bodies and unsupported text are excluded or explicitly diagnosed. |
| Cancellation/freshness | Delayed matching rejects query replacement/cancellation, edits and Undo branches. Picker cancellation and source disappearance reject stale writes. |
| Filesystem changes | Rename during delayed query and external removal before activation reject stale results; no automatic same-ID rebinding. Real browser removal creates no occurrence or canonical mutation. |
| Two Windows | Search results are occurrence-independent; navigation and following the same reference use the invoking Window and preserve the other occurrence. |
| Native reference semantics | Single and cross-Block picker creation, linked mention deduplication, creation/removal Undo/Redo, target title/pair relocation, distinct canonical/root IDs and fresh native Save/Open pass. |
| Derived-only search/navigation | Exact repository snapshot and History event assertions remain unchanged. No native-save calls are introduced by queries/navigation. |
| Ordinary typing | Completed-query typing makes results stale without taking a repository snapshot. No query runs on each keystroke; only an active query temporarily subscribes to cancel on change. |

Real Chrome qualification used isolated profiles, a temporary managed store, real HTTP routes, a real search worker, native typing, pointer picker activation, keyboard Escape, two Windows and a killed/restarted server. **16 C2 assertions passed, with zero uncaught browser exceptions.** [Reproducer](scripts/check-flint-c2-browser.mjs): `node scripts/check-flint-c2-browser.mjs` after `npm run build`.

Earlier browser gates were rerun on this implementation:

| Gate | Passed | Evidence |
| --- | ---: | --- |
| Stage A transient occurrence/lifecycle | 28 | [Results](artifacts/flint-c2/regressions/stage-a/browser-results.json) |
| B1/B1.1/B1.2 native/owned-resource editing | 23 | [Results](artifacts/flint-c2/regressions/b1/native-browser-results.json) |
| B2 consumed-Markdown/pairing | 14 | [Results](artifacts/flint-c2/regressions/b2/browser-results.json) |
| Native production Save/Open/recovery | 13 | [Results](artifacts/flint-c2/regressions/production/browser-results.json) |
| C1b vault UI/relocation/restart | 16 | [Results](artifacts/flint-c2/regressions/c1b/browser-results.json) |

These regressions retain Grouping, Entity, native selection/controls, IME, shared content/history, occurrence disposal, native ownership/dependency guards, read-only storage behavior, stale-client protection, paired publication/recovery and legacy/Workspace bypass coverage. No user document store or existing localhost server was changed by qualification.

TypeScript checks and production/client/server builds passed: [typecheck](artifacts/flint-c2/typecheck.log), [build](artifacts/flint-c2/build.log). Existing bundle-size, mixed static/dynamic import and browser-mapping-data warnings remain. No new input dispatch or permanent typing subscription was introduced; no new timing benchmark comparison is claimed. The existing no-snapshot typing assertion and browser editing regressions passed.

## Remaining deliberate limits

Search is explicitly loaded-resource coverage, not a whole-vault disk index. Directory discovery does not admit files. Reference targets must be available in the selected vault and use the qualified native Document/root identity subset. Refresh/requery is required after stale evidence; there is no automatic reconciliation. Search-created tab descriptors are transient presentation state. No Workspace/native persistence contract, ownership rule, authored reference format or relocation semantics changed.

C2's gate is complete. **Stop for review before C3.**
