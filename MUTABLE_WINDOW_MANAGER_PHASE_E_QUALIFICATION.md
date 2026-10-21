# Mutable Window Manager — Phase E release qualification

21 October 2026. Scope: finish application surfaces and demonstrate the smallest existing Desktop/Canvas interaction; E1.3 remains the experimental Detach/Return baseline.

## Result and changes

Phase E is complete for the current release, subject to the limitations below. Production changes are confined to two existing rendering components; no persistence, canonical ownership or session architecture changed.

- **Application tools:** reuse the existing application-surface portals, owner stacking groups, focus/modal coordinator and close guards. Actual Link Entity Reference remains a modeless Flint-owned tool through unrelated Thesis launches, activation, minimization, tiling and shell tabs. Query, pending creation/linking receipts, source selection and Thesis draft/undo state survive the qualified transitions. Window-modal Flint Storage and workspace-modal boundaries continue to block inappropriate operations.
- **Annotation inspector fix:** managed inspectors no longer discard pending fields on unrelated repository changes or activation of another application. Source-content changes still dismiss captured ranges safely, without stealing focus. Owner geometry/visibility refreshes the anchor; hidden inspectors retain their fields. Apply and undo retain the existing annotation-edit semantics. Closing the owner releases the surface. The legacy unmanaged invalidation path is unchanged.
- **Compact toolbar fix:** owner geometry or visibility changes dismiss ephemeral popups without moving focus. Menus, context overlays, inline panels and browser tooltips remain lightweight; no tool becomes a desktop window.

The new source-change listener uses the changed content key/set, not document scans or snapshots. A bounded-work check observes zero inspector geometry reads or repository snapshots for unrelated typing, including the next scheduled frame. This is not a typing benchmark or a general performance claim.

## Desktop/Canvas interaction

Using the existing **Presentations → Canvas → Desktop** controls, the browser fixture edits a managed standalone Ink Document, switches to Canvas, edits and undoes/redoes there, then returns to Desktop. Canonical Document/Block identity, workspace projection identity and unsaved text survive. The switch creates no canonical resource/edit for this already-identified Document, and no duplicate managed window or Save request. No Canvas production change was needed.

This is an existing presentation transition, **not retained DOM/session transfer**: rendering components remount. Existing guards still refuse open panels, sticky drafts, incompatible embedded applications and experimental detached topology, and defer IME composition. General Flint session rehosting and preservation of arbitrary component-local state on Canvas remain unsupported. First-time Canvas discovery can still assign missing workspace-object identities under its existing rules; this qualification uses existing identities. Canvas's existing application configuration and feature-flag defaults are unchanged.

## Qualification

| Check | Result |
|---|---|
| Focused editor, Entity lifecycle, Canvas, retained-session and transfer tests | **127 passed / 11 files** |
| Final inspector Apply/Undo and next-frame bounded-work check | **3 passed**, included in the separate rerun below |
| Chrome Phase E fixture | **92 passed**: 76 existing Entity/Thesis/layout checks + 16 focused inspector/Canvas checks |
| Accepted E1.3 Chrome fixture | **60 passed**; identity, selection, rollback, cancellation, Save routing and exact disposal counts retained |
| Accepted 41-file regression selection | Initial run: **432 passed / 14 failed**; one additional server timeout |
| Separate server + final inspector rerun | **10 passed**; all 7 server cases passed at the unchanged timeout |
| Baseline comparison after that file recheck | **433 passed / 13 established failures**; exact equality across all 446 file/test/status outcomes, including duplicate names |
| Client/server TypeScript and whitespace checks | **Passed** |

The 13 established failures remain six application-startup, three workspace-demo, three Timer and one block-selection failure, plus the previously recorded synthetic drag/drop unhandled error. The additional server timeout was not reproduced separately. The comparison uses accepted E1.3 evidence, not a new run of an old checkout. No tests were suppressed or timeout limits increased.

An initial implementation error during registry teardown was caught by the existing transfer-disposal test, fixed by tolerating absent activity after owner disposal, and requalified. The final clean browser run exited normally; an earlier run with a development HMR update needed its leftover runner/esbuild processes stopped after Chrome/profile cleanup.

Chrome checks use actual production components and trusted CDP pointer/keyboard/text input, with isolated in-memory native/Entity/Thesis responses. They do not qualify a live external backend or perform native filesystem saves. The existing Canvas action tests cover local/server persistence round trips without schema changes. Runner-owned Vite, Chrome and temporary profiles are cleaned up; no load testing was performed.

Evidence: [machine-readable results](MUTABLE_WINDOW_MANAGER_PHASE_E_EVIDENCE.json). Browser reproduction: `node scripts/qualify-window-manager.mjs --e` and `node scripts/qualify-window-manager.mjs --e13`. The evidence lists the exact targeted and regression files.

## Limitations and stop boundary

No unresolved new product defect was identified in these qualified workflows. Source edits deliberately close the annotation inspector; pending fields are not rebased onto a changed annotation. Its pending fields remain transient and explicit close discards them. Existing regression failures remain outstanding, as detailed in the evidence.

Reconstruction R1–R3 / DocumentViewBinding, E1.4 / Desktop 5, durable detached topology, generalized resource/viewer rehosting, additional independent views, docking/promotion, cross-Cavern transfers, Spatial/Acetate hosting, multi-display and Phase F are **deferred, not mandatory unfinished Phase E work**. Existing JSON formats, manual Document/Workspace Save, default-enabled Window Manager and exclusive legacy fallback are preserved. No new milestone or editor/Flint development has begun.
