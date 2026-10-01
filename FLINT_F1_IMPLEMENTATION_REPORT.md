# Flint F1 Workspace Shell and Context Report

**1 October 2026. F1 implemented for visual and product review. F2 has not begun.**

Flint now presents Library → Document → Context inside the existing Mutable Window. The shell uses the supplied identity and existing application capabilities. Canonical identity, occurrences, persistence, vault discovery and Knowledge providers are unchanged.

## The application

Library switches between Browse and Search. Browse retains the real directory tree, tags, new Document/import, directory creation, relocation and recovery controls. Search continues to query available native content and displays exact query coverage and stale-result diagnostics. The header Search action opens Library and focuses its search field.

Context selects Backlinks, References or Properties around the active Document. Existing reference selection capture, navigation, removal and Undo remain authoritative. Backlinks subscribe only while that lens is mounted. Properties retain native title/tags, canonical ID, format, location and save status; title and filename remain separate.

The Flint mark opens an application menu with Open Vault, Files and Close tab. **Storage details** in the footer opens the same storage sheet. List/Open, explicit Markdown import, first-save destination, recovery, Markdown comparison and Keep Mutable remain available. Save on an unbound Document opens the destination sheet; Save on a bound Document uses the existing resource-owned save capability. Storage Escape returns focus to its invoker, with a menu-button fallback if that invoker has disappeared. Reference-picker Escape also returns to its invoker.

The footer remains visible while the Library, editor and Context scroll independently. Read-only, incomplete discovery, pending relocation, diagnostics and operation notices remain outside the collapsible rails. The welcome surface offers existing vault/native-file actions when no Document is active. Existing bootstrap Documents are retained.

## Visual and mounting boundaries

The charcoal/stone shell, ivory text, ochre accents and mineral focus rings are scoped to Flint. The supplied master is unchanged; its small arrowhead mark is a CSS display crop of the same bundled image. No new image resources were needed. Authored text receives no shell font, annotation or formatting overrides.

There is one unconditional `app.tabs` slot. Library/Context state changes neither reparent nor remount that slot. Each rail can collapse independently at wide widths. Below 940px of **application/Window width**, rails become one selected overlay panel, leaving the same editor underneath. No resize observer, editor copy or global input handler was added. The standard Window title bar, controls and resize grip remain core-owned.

Visual inspection caught and corrected margin clipping caused by the new scroll surface. Direct-content Documents now reserve a gutter when a margin exists; narrow Flint occurrences use the existing in-flow margin presentation. Both are visibly reachable and editable in the browser checks. A transient Flint occurrence does not acquire a new Document-Window drawer/Compact controller. Existing Document-Window drawer, focus and Compact behavior was separately rerun unchanged.

## Implementation and authority

- [shell.tsx](src/features/flint/shell.tsx): composition, local rail/lens/menu state, status and welcome surface; one stable editor slot.
- [storage-sheet.tsx](src/features/flint/storage-sheet.tsx): existing file operations, local modal focus containment and return.
- [knowledge-view.tsx](src/features/flint/knowledge-view.tsx): separate Search/References presentations with independently appropriate cancellation and picker focus return.
- [flint.css](src/features/flint/flint.css): scoped material styling, Window-width responsiveness, scroll containment and margin accommodation.
- [index.tsx](src/features/flint/index.tsx), [vault-view.tsx](src/features/flint/vault-view.tsx) and [launcher](src/demo/workspace-demo.tsx): registration, first-save guidance and removal of Stage A wording.

No feature API, repository, native session/store, ownership, filesystem, provider or Window-host contract changed. The accepted vault row memo/reuse implementation and `QueryResults` batching/cancellation are untouched. Existing Flint/nativeKnowledge enablement is retained; `nativeKnowledgeSaved` remains disabled by default. No rollout or migration occurs.

## Qualification

| Gate | Result |
| --- | --- |
| TypeScript and production client/server build | Passed |
| Focused regression suite | **138 tests passed across 15 files** |
| F1 real browser and isolated managed-server sequence | **27 checks passed** |
| Existing Stage A browser lifecycle | **28 checks passed** |
| Existing C1b browser vault/storage route | **16 checks passed** |
| Existing C2 browser search/reference route | **16 checks passed** |
| Existing Document-Window presentation/drawer browser smoke | **47 checks passed** |

The regression suite covers transient lifecycle, two occurrences sharing content, reference/search revalidation, native Save/Open and relocation, owned-resource and legacy guards, consumed Markdown, property round-trip, read-only and recovery cases, stable vault DOM rows and cancellable result publication. All 26 focused lifecycle/reference tests passed again after the focus-return adjustment.

The F1 browser sequence launches the application, opens a real temporary vault, creates native Documents, types and saves, searches an unmounted source, follows its passage, creates/follows/removes a reference with Undo/Redo, follows backlinks in the invoking Window, edits properties, relocates files/directories and restarts the real server/editor. It also exercises Grouping, IME, Entity selection/focus return, margin visibility/editing, keyboard navigation, storage/picker Escape, standard Window resizing and continued typing. A second server restart in read-only mode proves that save is disabled and the warning remains visible with the rails closed.

Assertions explicitly compare editor mount identity and native selection before/after shell changes, and verify zero canonical snapshot/History change from rail/lens controls or derived navigation. The latest browser runs report no uncaught exceptions. These are Chrome checks, not an exhaustive cross-browser or accessibility certification.

Evidence: [F1 results](artifacts/flint-f1/browser/browser-results.json), [unit regression](artifacts/flint-f1/qualification/unit-regression.txt), [Stage A](artifacts/flint-f1/stage-a-regression/browser-results.json), [C1b](artifacts/flint-f1/c1b-regression/browser-results.json), [C2](artifacts/flint-f1/c2-regression/browser-results.json), [Document-Window drawers](artifacts/flint-f1/qualification/document-window-drawers.json). The reproducible F1 sequence is [check-flint-f1-browser.mjs](scripts/check-flint-f1-browser.mjs).

A concurrent C2 browser attempt timed out at the CDP harness boundary; an isolated rerun passed all 16 checks. Earlier UI tests were adapted to the relocated controls and to await the existing asynchronous refresh/invalidation boundary. The independent immediate-stale-row component test remains passing.

## Captured application views

All captures are from the running application, using temporary native fixtures and the existing editor.

| View | Capture |
| --- | --- |
| Wide workspace and Backlinks | [Wide Flint](artifacts/flint-f1/browser/wide-backlinks.png) |
| Narrow workspace with rails collapsed | [Narrow](artifacts/flint-f1/browser/narrow-collapsed.png) |
| Narrow Context panel | [Context overlay](artifacts/flint-f1/browser/narrow-context.png) |
| No vault and no active Document | [Welcome](artifacts/flint-f1/browser/welcome.png) |
| Properties | [Properties](artifacts/flint-f1/browser/properties.png) |
| Search results | [Search](artifacts/flint-f1/browser/search.png) |
| Incomplete coverage after restart | [Coverage](artifacts/flint-f1/browser/incomplete-coverage.png) |
| Read-only with rails closed | [Attention](artifacts/flint-f1/browser/read-only-attention.png) |
| Two Windows on the same canonical Document | [Independent occurrences](artifacts/flint-f1/browser/two-windows-same-document.png) |
| Advanced native operations | [Storage sheet](artifacts/flint-f1/browser/storage.png) |
| Entity overlay | [Entity](artifacts/flint-f1/browser/entity-overlay.png) |
| Visible authored margins | [Wide gutter](artifacts/flint-f1/browser/authored-margin.png), [narrow in-flow margin](artifacts/flint-f1/browser/narrow-margin.png) |

For manual review, open **Workspace → Open Flint** on Desktop. Open a managed directory in Library; use Context to select a lens, the header Search control to search, and the footer Storage details action for native operations. The existing development site on port 3000 serves the updated shell.

## Review boundary

F1 is complete for review. F2 resource cards/inspector, F3 trails/relationships and F4 mapping remain unstarted. Saved Knowledge rollout, `.ink`, persistence architecture and broader Desktop/Canvas/Spatial hosting remain outside this change.

The existing saved-resource activation/large-query performance limits remain recorded in the accepted plan; this work makes no new infrastructure performance claim. Rollback is a presentation/code revert with no data migration. Review the visual density, rail widths and narrow overlay behavior before choosing the next product slice.
