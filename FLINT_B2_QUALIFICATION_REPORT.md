# Flint B2 — paired native/Markdown persistence and consumed Markdown

**Status: bounded B2 proof complete for review. Production native Save/Open remains disabled. Stop before Stage C.**

B2 demonstrates that a rich canonical resource can produce an unchanged native file and a useful, explicitly lossy Markdown projection from one captured generation. Interrupted publication can recover that exact generation independently of Flint occurrences. It does not establish production file synchronization, unrestricted conflict resolution, or durable multi-resource transactions.

The implementation is isolated in [`src/qualification/native-b2`](src/qualification/native-b2). No production Save/Open route, Workspace envelope, History codec, editor gateway or feature default changed. The Markdown input listener is installed explicitly by qualification hosts only. The accepted B1.2 baseline is commit `e97dd5f` (`B1 approved`).

## 1. Resource-owned capture and publication protocol

[`coordinator.ts`](src/qualification/native-b2/coordinator.ts) enrolls one coordinator per canonical repository/resource ID. Zero, one or several visible occurrences use the same resource operation. A second adapter for the same enrollment is rejected. Concurrent save requests share the current operation; an unresolved generation blocks newer saves, while editing remains possible.

Capture extracts the canonical ownership boundary through B1's resource graph. Native encoding completes before calling the writable adapter. Markdown is then exported from that captured resource with a copied link-path mapping and a declared profile, `mutable-markdown-subset-v1`. The generation, output strings, diagnostics and mapping are frozen. There is no extraction from a tab, Window or view and no native-to-tree conversion.

[`managed-pair.mjs`](src/qualification/native-b2/managed-pair.mjs) proves publication using real files in an isolated managed local directory:

1. Acquire an OS advisory lock for this resource; cooperating writers cannot overlap. Validate native identity and available owned dependencies.
2. Preflight both destination hashes against the last confirmed receipt, or require absent destinations for a new pair. Unknown existing files are conflicts.
3. Durably stage both byte strings and a versioned intent, then publish a pending-generation pointer.
4. Publish native first, Markdown second. A replacement moves the actual destination inode into the generation directory, verifies the displaced bytes, and creates the new destination exclusively using a separately written temporary inode. Staged generation bytes never share an inode with the published file.
5. Recheck output hashes, preserved inodes and required dependencies; write/sync the receipt. Check outputs again before clearing the pending pointer and reporting completion.

The private `.mutable-pair-<resource-ID-hash>/` directory contains the lock, staged generations, intent/pending evidence, receipts and preserved files. These are provisional adapter bookkeeping, **not fields added to the native Document or a new Workspace format**. Reserved bookkeeping fields/versions are validated. Native envelope/value/graph contracts remain exactly the accepted B1.1/B1.2 contracts.

There is no two-file atomicity claim. Observers can see a new native file and old/missing Markdown during publication. File and directory syncs are exercised on this Mac's local filesystem. Actual writer-process termination is tested; power-loss, Windows, network filesystem and browser file-handle durability are not qualified.

## 2. Same-generation, partial publication and recovery evidence

The filesystem tests compare the native output byte-for-byte with the canonical capture and Markdown with deterministic export of that capture. Re-decoding preserves the native resource. Changing the live link mapping after capture does not change the saved generation. A deliberately unencodable native value fails before either destination is published.

| Interruption or state | Qualified outcome |
| --- | --- |
| Before native publication | Failed/pending operation; exact staged generation remains recoverable. |
| Native published, Markdown not published | **Canonical saved; Markdown pending**. No ordinary Saved result. |
| Both files published, receipt interrupted | Confirmation pending; recovery verifies both hashes before confirming. |
| Receipt written, completion interrupted | Recovery verifies intent/files and completes idempotently. |
| Process killed with `SIGKILL` after native, Markdown or receipt | A new adapter acquires the released OS lock and completes the same generation. |
| Editing continues during pending save/recovery | Old generation completes; newer canonical state stays dirty. |
| Wrong or absent expected completion generation | Completion rejected; cannot clear dirty state or adopt a stale recovery baseline. |
| Corrupt staged native bytes | Recovery conflicts; never reconstructs native state from Markdown. |

The state is determined from actual published hashes, not merely the last attempted step. Receipt recovery also checks current files. A receipt is historical evidence, not authority to ignore subsequent external edits.

## 3. External modifications and explicit conflict workflows

Tests cover outside changes before publication, between preflight and displacement, recreation of a destination before exclusive publication, changes after publication/receipt, and writes through an already-open descriptor to the displaced inode. External bytes are retained; no test reports Saved for a detected conflict. Prior inodes are deliberately never garbage-collected by this proof, preserving even later writes through an old descriptor.

Read-only Compare returns external Markdown and its hash. Import creates a separate candidate native Document and leaves the original rich Document unchanged. Explicit Keep Mutable accepts a precisely reviewed external Markdown hash, rechecks it and retains the displaced external file. An intervening edit invalidates that permission. There is no automatic reconciliation or automatic ownership/identity adoption from Markdown.

**Remaining limitation:** Keep Mutable is qualified for a conflict found before starting a new generation. A genuinely conflicting, partly published generation stays blocked with its files and intent preserved. The proof does not rewrite that intent to force an in-place replacement. Resolving such a conflict in place, abandoning/re-enrolling a pending pair and presenting that choice in production UI remain future integration work. A fresh destination can be used by a separately constructed adapter, but a production coordinator relocation command is not implemented.

The lock coordinates participating writers only. The adapter does not claim universal filesystem compare-and-swap or permanent immunity to a writer changing a file after the final check. Subsequent operations detect divergence. Independently editing processes need an agreed file-version baseline policy before production enrollment; locking alone is not collaborative editing.

## 4. Consumed Markdown input and native admission

[`markdown.ts`](src/qualification/native-b2/markdown.ts) imports the bounded subset into existing native structures. Initial Markdown import may use the existing tree decoder to construct a **new** Document; it then enters the shared repository through native graph admission. This does not route an existing native resource through a lossy DTO. Identity is newly allocated for an imported candidate; wiki targets must resolve uniquely from the explicit supplied mapping.

| Construct | Native result | Qualification |
| --- | --- | --- |
| `**bold**` | Text Cells plus `style/bold` annotation | Import/export, typed completion, conversion Undo/Redo, Unicode offsets and existing annotation remapping. |
| `[[Poe]]` | Text label plus `codex/block-reference`, root Block ID and Document ID | Unique resolution, ambiguous/unresolved literals, browser completion and stable identity. |
| `# ` gesture / h1 import | Existing `block/font/size: h1` property | Prefix consumed; Undo restores literal; browser editing remains ordinary Codex. |
| Rectangular pipe table | Existing table/row/cell/standoff Blocks | Import/export of plain cells with one header row; irregular/rich shapes fall back with diagnostics. |

The table proof adds only `metadata.headerRows: 1` to retain the semantic header distinction for export. This is provisional authored table metadata in the existing payload, not a source-syntax association or a new table model. It does not change the renderer. Rich cell styles, relations or payloads trigger fallback rather than silent flattening.

[`input.ts`](src/qualification/native-b2/input.ts) installs one explicitly scoped listener after the existing gateway on the same capture target. Only closing `*`, `]` or the h1 space can trigger a bounded paragraph check. Ordinary characters return before graph/selection work; ordinary word spaces return before resource ancestry lookup or scheduling. Paragraphs over 2,048 Cells are not recognized. The delayed completion checks revision and occurrence lifetime before acting, retaining core caret ordering.

One command transaction consumes the delimiters and applies native semantics. One conversion Undo restores the completed literal; it does not immediately reconvert because recognition observes fresh input, not repository replay. Redo restores native semantics. No delimiter Cells remain after conversion. IME, code, escaped/incomplete syntax, native controls, dialogs/menus and non-collapsed/cross-Block selections are excluded. No whole-Document parser, source mode or replacement input pipeline is introduced.

This is a deliberately narrow grammar: no nested Markdown completeness, arbitrary wiki aliases, code-fence parsing, general paste conversion, filesystem resolution or Obsidian compatibility. Unsupported constructs remain literal at import/input, or receive explicit projection fallback when exporting richer native content.

## 5. Fidelity and degradation matrix

The native authority remains `.mutable.json`: envelope version 1, `codex-authored-value-v1`, resource graph version 2 where owned external boundaries require it. Unknown authored feature data is preserved; unknown reserved wire fields/versions remain rejected.

| Actual native producer/state | Native preservation | Markdown projection |
| --- | --- | --- |
| Text, Unicode, paragraphs, h1 and bold | Exact native graph/payload | Readable text, escaping and supported formatting. |
| Unique Document references | Canonical identity and annotation retained | Supplied portable wiki locator; diagnostic if ambiguous/unavailable or label differs. |
| Tables | Full native rows/cells/payloads | Qualified rectangular plain table; otherwise readable fallback and diagnostics. |
| Rich paste / inline image / own undefined dimensions | Accepted exact value encoding retained | Available URL/alt text; image layout/metadata diagnostic; no asset copying. |
| Rainbow/SVG, Entity, Grouping and other standoff features | Native authored annotations retained | Readable text; unsupported annotations/overlap diagnosed. |
| Linked definitions, foreign provenance and retained definitions | B1.1 semantics unchanged | Resolvable local annotation semantics where supported; omissions/retention diagnosed. |
| Margins, anchors, formats, Superposition and named relations | Native relations/payloads retained | Labeled relation content/typed fallback; layout not reconstructed. |
| Timer, 3D/hosted/unknown feature Blocks | Unknown authored payloads retained with implementation absent | Typed stable-ID fallback; additional payload diagnostic. |
| Shared/cyclic reference structure | Native identities/placements unchanged | Repeated body represented once; bounded traversal diagnostic. |
| Owned external resource | Separate resource identity and graph-2 owned edge | Link/placeholder only; no recursive Markdown body/save. |
| Own undefined, signed zero, non-finite numbers | Existing value tags retained | Not a full-fidelity Markdown claim. |
| Map/Set/Date/class/functions/cyclic value objects etc. | Existing explicit value-contract rejection unchanged | Cannot bypass a failed native encoding. No audited producer newly reclassified unsupported. |
| Ownership transfer, general unload/deletion, durable History graph 2 | Accepted deferrals/guards unchanged | Not implemented by B2. |

Exporter diagnostics are returned separately from readable Markdown; export does not write back into the repository or constrain authored features. Escaping is conservative and may be visually verbose in raw Markdown. This is an interchange projection, not a promise that reimport can reconstruct the rich original.

## 6. Occurrences, dependencies and compatibility

The tests save with zero visible occurrences, share one coordinator with multiple occurrences, edit while publication waits, close occurrences, complete the save and reopen newer canonical content. Closing a Flint Window does not cancel the resource operation or establish storage retention. Browser qualification uses a controlled deferred adapter for this lifecycle race; the separate filesystem tests exercise actual paired files and process death.

For an owner A, explicit resource locations must supply decodable B and its required owned closure with matching root identity. Conflicting ownership evidence/cycles/unavailable roots fail validation. A is not confirmed complete if B disappears during the save. Saving A does not generate `B.md` or alter B's native file. No multi-resource snapshot/transaction or recursive enrollment is inferred. Reference cycles and missing references remain distinct from required owned dependencies.

Existing legacy Document/Workspace paths and native legacy-tree rejection guards are unchanged. B1/B1.1/B1.2 admission and Stage A lifecycle tests are rerun; no Workspace persistence extension or History codec migration was needed for this bounded proof.

## 7. Qualification evidence

The consolidated regression run passed **341 tests across 37 files**: Stage A, B1, B1.1, B1.2, B2, legacy Document/Workspace stores, linked annotations/Entity, standoff/cross-Block editing and existing History/resource gates. B2 contributes **33 tests**. Client, server and B2 qualification type checks pass. The [production client build](artifacts/flint-b2/client-build.log) passes, with the existing browser-mapping and large-chunk advisories. Staged and unstaged whitespace checks are clean.

Real Chrome qualification passed **14 B2 checks**, **23 native checks** and **28 Stage A checks**, including existing native editing/selection, toolbar/SVG, Grouping, IME, Entity/focus, disposal and source disappearance. The B2 screenshot shows the ordinary DOM editor after conversion and reopening. No uncaught B2 browser exceptions were recorded.

The previous strict commit-capture enumeration failure remains the documented B1.1 baseline finding, not a passing test or a change in this work. See the accepted [B1.2 report](FLINT_B12_OWNED_RESOURCE_QUALIFICATION_REPORT.md) and its B1.1 reference.

Typing comparison uses the existing 25,000-character, 250-paragraph Chrome benchmark with its optional qualification listener OFF/ON. Three serialized pairs (runs 2–4) gave OFF medians **2.1 / 2.8 / 2.1 ms**, ON **1.5 / 1.4 / 1.4 ms**; p95 OFF **7.4 / 11.7 / 5.6 ms**, ON **3.4 / 5.0 / 3.3 ms**. All retained zero repository snapshots, ordinary typing/Backspace/Undo/Redo/Enter behavior and unrelated Cell stability. No repeatable slowdown was observed. These noisy host timings do not establish an improvement or measure every completion trigger. Run 1 overlapped other browser work and is retained as warm-up evidence, excluded from the comparison.

Review artifacts:

- [Rich native resource](artifacts/flint-b2/rich.mutable.json), [its Markdown projection](artifacts/flint-b2/rich.md), [degradation diagnostics](artifacts/flint-b2/degradation.json).
- [Consumed native resource](artifacts/flint-b2/consumed.mutable.json), [Markdown counterpart](artifacts/flint-b2/consumed.md), [ordinary editing screenshot](artifacts/flint-b2/consumed-editing.png).
- [Combined test results](artifacts/flint-b2/qualification-results.json), [B2 browser checks](artifacts/flint-b2/browser-results.json), [native regression checks](artifacts/flint-b2/regression/native-browser-results.json), [Stage A browser checks](artifacts/flint-b2/stage-a/browser-results.json).
- [Paired-save tests](src/qualification/native-b2/paired-save.test.mjs), [Markdown tests](src/qualification/native-b2/markdown.test.tsx), [reproducible B2 browser sequence](scripts/check-native-b2-browser.mjs).

Reproduce with Node 22 and the existing dev server for browser checks:

```sh
B2_ARTIFACTS=artifacts/flint-b2 node node_modules/vitest/vitest.mjs run src/qualification/native-b2
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.native-b2.json
node scripts/check-native-b2-browser.mjs
BENCHMARK_MARKDOWN=0 node scripts/benchmark-typing-browser.mjs
BENCHMARK_MARKDOWN=1 node scripts/benchmark-typing-browser.mjs
```

## 8. Remaining production requirements and review boundary

The answer to the B2 question is **yes within the bounded managed-store and input proof**, with explicit production limitations:

- Wire native resource dispatch into approved resource locations and all applicable Save/Open paths. Enrollment cannot be bypassed through legacy tree/Workspace saves; native files must remain authoritative even when Markdown is newer. No shipped route is enabled here.
- Provide persisted enrollment/location discovery and a load-time file-version baseline for independently editing sessions. The proof takes explicit paths/catalog inputs; it does not design a new catalog or Workspace contract.
- Present pending/confirmation/conflict states, diagnostics, Compare/import/Keep Mutable and fresh-destination choices. In-place resolution of an already-partial conflict remains unqualified.
- Specify retention/cleanup of staged generations and preserved inodes, including late external writers, before pruning anything.
- Qualify the chosen production platform's regular-file/path handling, durability and writer coordination. This trusted managed-directory adapter is not a hardened arbitrary-path, symlink, remote-store or browser-handle implementation. Two downloads cannot claim pair completion.
- Retain B1.2's existing ownership-transfer, destructive lifetime, unloading and durable History graph-2 limits. Production integration must not quietly remove their guards.

No evidence from B2 justifies a general persistence redesign. Whether production integration can remain within existing resource-location concepts is still a review decision; a materially new Workspace/storage contract requires a separate proposal. Stage C and broader application/Canvas/Spatial hosting have not begun.
