# Thesis implementation and qualification

Date: 20 October 2026

Implemented the bounded Thesis brief behind the default-enabled `thesis` feature flag. Thesis creates and manages resource-independent Propositions through a native standoff editor. Permanent deletion, graph functionality, and LLM functionality are not included. **No load tests or typing benchmarks were run.**

## Delivered behavior

- **Open Thesis** is available in the workspace toolbar and system menu. The standalone Mutable window offers label/text search, a 30-row page, New, an archive filter, and the same editor used for selection drafts. New Thesis windows open above existing windows, including maximized Flint windows whose rendered z-index is higher than their stored value.
- `thesis.createProposition` opens an unsaved draft from the active native selection, or an empty draft at a caret. It is available through the text context menu and document actions. Bindings are Cmd+Shift+P, Ctrl+Shift+P, and the fallback **Ctrl+semicolon, then P**. These use the existing configurable binding registry. IME and modal input exclusions remain in the native gateway.
- The isolated native editor supports text feedback, multiline Enter, selection, range rebasing, undo/redo, direct formatting, and the existing Entity reference panel. It does not insert a Document or Resource into the source repository. Entity lookup uses an explicit Vault capability; annotation tools receive an explicit standalone Block scope. Existing Entity targets can be selected; Entity creation/renaming/alias editing belongs in the Entity manager and is rejected without dispatch from this editor.
- Save is manual, including Cmd/Ctrl-S inside Thesis. Successful text saves retain the mounted editor and its undo/caret state. Typing remains enabled while a text save is in flight; a cheap edit counter keeps newer edits dirty when the submitted version commits. Cancellation creates no Proposition records. Dirty state is a constant-work subscription to the isolated draft repository; there are no draft snapshots, list refreshes, or requests on ordinary typing. Only the active Thesis draft has a global input router attached, so opening more Thesis windows does not add more keyboard routers to each keystroke. Closing a dirty Thesis window asks before discarding it.
- Save keeps a stable operation ID and exact request after an uncertain response. Retry resolves the existing audit receipt. Stale `Entity.revision` values reject the entire write, with Reload offered in the UI.
- Archive hides the record from the normal list; Restore preserves the Entity, Block, annotation identities, source attribution, and text.

## Selection and source policy

Only a nonempty selection in one text-only Ink Block is accepted in this milestone. Multi-Block selections and Blocks containing embedded cells are rejected explicitly. The original passage is not edited.

Fully contained direct annotations receive new UUIDs and retain their authored values and original annotation identity in `thesisOrigin`. Overlaps and repeated Entity targets are preserved. Known formatting types—bold, italics, underline, strikethrough, highlight/highlighter, superscript, and subscript—may be clipped, with a visible transfer note. Crossing semantic annotations are omitted with a warning. A locally resolved linked annotation is materialized from its effective property data; unresolved definitions are omitted with a warning. No shared definition is written by Thesis.

Native ranges remain inclusive Cell coordinates while editing. Save explicitly converts them to half-open UTF-16 SQL ranges. Zero-width annotations are normalized to the native point convention for editing and stored as equal SQL start/end boundaries. Tests cover surrogate pairs, combining code points, overlaps, point affinity, rebasing, and authored-value tags. Authored annotation order is retained in Block attributes so overlapping style precedence survives a save/reopen.

`Block.attributes.thesis` is versioned and contains archive state, annotation order, and optional source provenance. Source provenance records Vault/Cavern identity, Resource and Block identifiers, the selected Cell range and text, capture timestamp, source revision, a SHA-256 fingerprint of the captured Block text, and available saved-file hash/location evidence. The whole source Block text is used transiently for hashing and is not persisted as provenance.

Open source first locates the loaded Resource or discovers its current file by Resource identity. It opens/selects the Document through the existing native/Flint path. It selects the old range only if current Block text, fingerprint, excerpt, and revision checks agree. Otherwise it opens the available source and reports a potentially stale range. Missing or ambiguous identities and incomplete discovery are reported separately. Stored filenames are hints, not filesystem authority.

## Persistence and migration

Migration `0008-propositions.sql` rebuilds **only Block and StandoffProperty**. Resource, AnnotationDefinition, and historical migrations retain their schemas/content.

- Block ownership is nullable, and `entityGuid` independently references Entity with `ON DELETE RESTRICT`. Standalone rows are constrained to `mutable/proposition-block`, have text and a Proposition Entity, and are unique per Entity through a partial index.
- StandoffProperty has nullable Resource ownership, its existing composite FK, an additional mandatory Block FK, and NULL-safe insert/update ownership guards. Standalone properties must be direct with no definition fields. Unresolved Entity target IDs remain supported.
- Ownership transitions are forbidden; a bound Proposition Entity cannot be changed to another type.
- The migration runner disables foreign keys **before** beginning the v8 rebuild transaction, validates the resulting exact schema and all foreign keys before commit, and restores enforcement in `finally`. A failed validation rolls back DDL, rows, and version metadata.
- File-derived Block projection now emits `entityGuid: null`, preserving unchanged incremental reconciliation as a no-op. Existing canonical/file Block GUID-collision protection remains effective.
- Vault-scoped create/get/update/list/search/archive/restore operations use the existing host writer lease, foreground coordination, read-only checks, canonical audit outbox, operation receipts, and backup/restore infrastructure. Aggregate writes are atomic. Complete final annotation sets are required for text updates.
- BlockTextRun/BlockSearch provide text search; EntitySearch supplies label matches. Rows disclose which field matched. Saved-file mention counts explicitly exclude standalone properties. Derived clearing and Resource cascades do not own standalone rows.

The application upgrades an existing supported database through the normal writable initialization path. This work adds no separate production migration command and does not run a migration against a selected user Cavern as part of qualification. Existing database backup/restore remains available; no automatic backup policy was added.

## Qualification evidence

Functional fixtures use temporary Vaults and cleanup hooks. The browser harness uses the real HTTP Proposition route, Vault host, worker, SQLite migration/service, and native editor; only the default-Vault discovery response is stubbed. It does not connect to a user Cavern.

| Check | Result and scope |
|---|---|
| `propositions.test.mjs` + `schema.test.mjs` | 25 tests: v7 preservation, ownership/FKs, failed migration rollback, aggregate rollback, receipts/audit events, Unicode/points, ordering, FTS, archive/restore, backup/restore, read-only/flag checks, real reconciliation and reopen |
| Thesis model/view tests | 12 tests: exact selection, real linked materialization, clipping/omission, native editing and undo, bounded dirty tracking, both modifier bindings/fallback, IME/modal exclusion, standalone direct Entity annotations, semantic inventory invalidation, one active draft input router, and rendered stacking above maximized source windows and earlier Thesis windows |
| Saved/Phosphor projection tests | 11 tests: rich saved properties/definitions, full/incremental parity, unchanged reconciliation, retained definitions, rollback, collision protection, and invisible semantic anchors |
| Entity watch/search-panel regressions | 25 tests: existing Document inventory and Entity panel behavior |
| Host permission test | 1 test: real Vault writer, path boundary, read-only mode, Thesis flag, and Entity service flag |
| Selected indexer regressions | 3 tests: unchanged/full reconciliation, confirmed deletion, and file reappearance during deletion |
| Selected foundation regressions | 3 tests: explicit initialization/read-only enforcement and WAL-aware backup/restore, including unavailable audit |
| Native editing regressions | 5 targeted tests: caret, combining-grapheme deletion, annotation contraction/movement, and composition shortcut checks |
| `scripts/check-thesis.mjs` | Headless Chrome 155 on macOS: unsaved selection draft; native Unicode annotations; existing Entity lookup and overlapping reference authoring; Save/search; source fingerprint and changed-source warning; archive/restore; native typing with **zero requests**; Command-S; undo/redo retained across Save; typing during Save retains newer unsaved edits; stable identity; stale-write rejection; lost-response receipt replay; empty-draft cancellation; no new document files |
| Build/static checks | Client production bundle, server/worker build, reactive/server TypeScript checks, and whitespace validation |

The browser test verifies functional behavior and was visually inspected with the application's real CSS. It is not a latency benchmark or a claim about physical keyboard/IME behavior on every platform.

## Limits and deferred qualification

- Physical macOS/Windows/Linux desktop accelerator handling still requires manual platform verification, including the Windows/Linux system-print shortcut and the DevTools Command Menu when DevTools has focus. Both Cmd/Ctrl+Shift+P paths consume the event in the editor; the former Cmd/Ctrl+Shift+T shortcuts are no longer consumed. Native input fields, IME composition, and modal input are excluded. Both modifier paths and the fallback chord are exercised through the input gateway; a host-consumed event cannot be guaranteed to reach the application. Menu/New access remains available.
- Real input-method composition, screen-reader use, and source relocation/missing-file navigation across a restarted full Cavern were not exhaustively exercised. Automated checks cover IME dispatch fences, semantic controls/focus, live source verification/staleness, and persisted locators. The browser harness exercises a loaded source; the unloaded-source discovery path is implemented but is a remaining manual integration check.
- Multi-Block flattening, inline-object transfer, linked annotation authoring, permanent deletion, and Entity-record authoring inside Thesis are deferred explicitly.
- Canonical requests retain the existing 32 KiB budget. A Proposition supports at most 100 annotations; list pages are capped at 100 through the service and use 30 in the UI. FTS search uses token/prefix matching, not arbitrary substring matching.
- No load/capacity/soak tests, latency measurements, or real Flint typing benchmarks were run, per the user's instruction. There is no performance-capacity claim. Tests verify bounded subscriptions and absence of typing-triggered requests.
- Unsaved drafts are session state and are not crash-recovery records or workspace document files. Archive is the only removal action.

## Changed files

**Persistence:** `src/knowledge-sqlite/migrations/mutable/0008-propositions.sql`, `schema.mjs`, `propositions.mjs`, `canonical-ledger.mjs`, `foundation.mjs`, `client.mjs`, `worker-entry.mjs`, `saved-projection.ts`, `entities.mjs`; `scripts/build-sqlite-foundation.mjs`.

**Host and assembly:** `server/sqlite-knowledge-host.ts`, `server/cavern-lifecycle.ts`, `src/configuration.ts`, `src/application/features.ts`, `src/application/thesis.tsx`, `src/application/entity-service.ts`, `src/application/annotation-capabilities.ts`, `src/application/document-entity-changes.ts`, `src/demo/workspace-demo.tsx`, `src/reactive-editor/editor.ts`, `src/runtime/block-menu-actions.ts`.

**UI and transfer:** `src/features/thesis/model.ts`, `service.ts`, `view.tsx`, `view.css`.

**Qualification:** `src/features/thesis/model.test.ts`, `view.test.tsx`, `browser-fixture.tsx`, `browser-fixture.html`; `src/knowledge-sqlite/propositions.test.mjs`, `schema.test.mjs`, `foundation.test.mjs`; `server/thesis.test.ts`; `scripts/check-thesis.mjs`; this report. The pre-existing revised feasibility report was left intact.

Temporary SQLite databases, browser profiles, fixture files, and the visual-review screenshot are removed after qualification. Test source files remain for repeatable regression checks.
