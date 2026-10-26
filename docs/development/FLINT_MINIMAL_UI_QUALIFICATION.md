# Flint minimal UI: implementation and qualification

26 October 2026. Baseline: `5812773`. Implemented directly, **without a new feature flag**, as requested. Existing application feature settings remain intact.

## Implementation plan and boundaries

The plan and control inventory were supplied before application changes: consolidate the wide header/tab row, simplify Explorer, simplify the shared annotation bar, then qualify retained editing sessions and existing commands. The user's subsequent instruction removed the proposed presentation flag.

The implementation changes presentation and disclosure in the existing Flint shell, Vault forms and shared Ink toolbar. The Window Manager title bar, retained tab/editor DOM, projections, command implementations, resource ownership and persistence formats remain in place. Wide headers share the tab row through CSS positioning; narrower layouts separate the rows without transferring or remounting the editor.

## Control relocation inventory

| Existing control or capability | Location after redesign |
| --- | --- |
| Window title, drag, minimize, maximize, close, resize | Existing Mutable OS Window Manager title bar and handles |
| Flint brand and application menu | Start of the combined row; separate header below 1080 CSS pixels |
| Cavern identity | Explorer heading/tree and footer |
| Document tabs, title, dirty dot, close and Document actions | Existing retained tab strip, now sharing the wide header row |
| New Document and all existing Document Formats | Header **+**, or Explorer **+**; opens the existing creation form |
| Manual Save | Persistent **Save** control, accessible name “Save Document”, and existing Command-S/Control-S |
| Library and contextual pane visibility | Header toggle buttons; existing splitters and saved widths/visibility |
| File tree | Default **Files** explorer view; Cavern root initially expanded |
| Search | **Search** explorer view and header search button |
| Recent documents, reopen and persistent removal | Secondary **Recent** explorer view, retaining each entry's × button |
| Create directory | Explorer **New folder** button and existing form |
| Refresh files | Explorer refresh button; also available in Cavern options |
| Rename/move selected file or directory | Explorer **Actions → Rename / move selected item** |
| Markdown import | **Actions → Import Markdown**; existing destination/title/format form and source selector |
| Cavern selection, managed path, close, tag filtering, Verify files | **Actions → Cavern & filters**; Open Another Cavern also remains in Flint's menu |
| Pending Save/relocation recovery, discovery errors, read-only notices | Existing explicit recovery and alert controls in Explorer and shell |
| Graph / return to Document, Reading density | Flint application menu; selecting a Document tab also returns to Document |
| Backlinks, references and properties | Restorable Context pane, retaining its lens controls |
| Undo / Redo | Compact toolbar where space permits, otherwise More → Typography; invoke configured history keys through the existing editor input gateway |
| Bold, Italic, paragraph/heading style, H1/H2 | Primary compact annotation row; headings overflow at smaller widths |
| Underline, strike, super/subscript, case, H3/H4, alignment, indentation, clear | **More → Typography** |
| Text colour/fill, visual effects | **More → Visual effects**; colour panel retains its drafts |
| Specialist annotations, Entity reference, alternatives | Existing **More** categories, selection tools and shortcuts |
| Show/hide text | **More → Selection** |
| Find, Autocomplete/Scry, Entities, Proposition, Timer and contributed Document actions | **More → Document**, retaining existing eligibility and command handlers |
| Block History, text-to-tab, linked cross-Block annotations | Existing contextual **More** sections |
| Caret modes, spotlight, margin controls, cross-Block option | **More** session/editor options; also retained in Expanded presentation |
| Auto / Compact / Expanded / Hidden | Existing visible annotation presentation selector and saved preference |
| Open/native storage/recovery, publishing | Flint application menu and footer Storage details |
| Collection/file/package imports; collection, archival, portable, standalone and text exports; offline viewer | Existing Flint application menu, now height-bounded and scrollable |
| Save state, Cavern and discovery information | Quiet existing footer; failures continue to use explicit alerts |
| Block handles | Hover, keyboard focus, selected Block; remain visible for coarse/touch pointers |

New list editing and Quick Open are deferred. No mockup-only command was added. Advanced commands remain reachable; their semantics are unchanged.

## Measured browser result

Matched real-Flint fixtures at a **1500 × 990** browser viewport, using the same native Masque Document and saved Reading density. The application itself measures 1448 × 878 CSS pixels. There is no saved pane visibility preference in either run.

| Measurement | Before | After |
| --- | ---: | ---: |
| Header row top | 111 | 111 |
| Document tab row top | 150 | 111 |
| Document content viewport top | 223 | 190 |
| Content viewport width | 905 | 1207 |
| Content viewport height | 742 | 775 |

An entire header band is removed on wide layouts. The slightly taller tab row means a **33-pixel net vertical gain**. The **302-pixel width gain** includes removal of the duplicate icon rail and the new default-collapsed inspector. Existing users who saved an open inspector retain it; they do not automatically receive that portion of the width gain.

Screenshots: [before](evidence/flint-minimal/before-wide.png), [after](evidence/flint-minimal/wide.png), [medium](evidence/flint-minimal/medium.png), [narrow Explorer](evidence/flint-minimal/narrow.png). Measurements: [before JSON](evidence/flint-minimal/before.json), [after JSON](evidence/flint-minimal/after.json).

## Qualification

- Focused implementation/regression run: **121 passed, one baseline failure** across shared toolbar/policy, shell, native Vault Save, Flint lifecycle, retained host transfer and detachment. [Log](evidence/flint-minimal/tests.txt).
- Additional checks passed: **4 caret-mode, 4 recent-document and 11 provisional Scry integration tests**. These include bounded typing/row updates, persistent Recent removal, provisional edits, Save gating and exact undo behavior.
- New tests cover saved-open inspector preferences, session identity across explorer modes, fullscreen Flint defaults versus explicit overrides, and toolbar history through real editor/Scry/IME guards. The final history/Scry rerun is recorded [here](evidence/flint-minimal/history-tests.txt).
- Existing **44 real-Chrome annotation-bar checks passed**: actual wheel scrolling in maximized/floating Flint, Compact/Expanded controls, 280-pixel fit, formatting selection, detach/return, split presentation, native fullscreen and retained DOM. Presentation and scrolling produced no snapshots, commits or content revisions. [Log](evidence/flint-minimal/annotation-browser.txt).
- The **19-check** redesign-specific real-Chrome run checks merged/separate rows, default tree/admin disclosure, New Document formats, Search/Recent, keyboard dismissal, inspector/explorer toggles, formatting, Undo/Redo, narrow overlay and unchanged mounted editor identity. It additionally types the real Scry trigger and verifies history remains suspended. [Log](evidence/flint-minimal/browser.txt).
- Native Vault regression tests use temporary storage and cover every existing Document Format, manual Save, dirty state, overwrite/cancel, first-save destination, external-file copies, failures, recovery, readonly storage and bounded Explorer updates. No user Vault was modified.
- **140 distinct tests passed**, with the one independently reproduced baseline failure above. Reactive TypeScript and `git diff --check` pass. No load testing or full-repository test claim.

### Baseline comparison and limitations

The Flint lifecycle test `closes a Flint window without changing Documents or History and keeps it closed after saving` expects zero remaining projections immediately after close but receives one. This exact failure independently reproduces with unchanged application and test source from **5812773**. [Baseline log](evidence/flint-minimal/baseline-close-test.txt). No new regression remains in the checked suites. The historical set of 13 Window Manager baseline failures was not rerun wholesale.

The browser run exposed an important interaction to qualify: a floating Scry/LER tool may cover the toolbar and can be moved using its existing header. New Undo/Redo targets are excluded from Scry's outside-click cancellation, so attempting history while Scry is active cannot first cancel Scry and then bypass its guard. The existing history input path still enforces composition and other command restrictions.

Browser evidence is Chrome 155 on macOS, using real browser layout and input in an isolated headless profile. No new Safari/Firefox, physical touchscreen or screen-reader certification is claimed. Existing detached-view/live-resource transfer restrictions remain unchanged. No new editor, persistence or Window Manager architecture was introduced.

## Reproduction

```sh
FLINT_BASELINE=1 FLINT_BASE_REF=5812773 node scripts/check-flint-minimal-browser.mjs
node scripts/check-flint-minimal-browser.mjs
node scripts/check-annotation-bar-browser.mjs
npx tsc --noEmit --project tsconfig.reactive.json
```

The redesign runner serves a temporary Vault containing a copy of the native fixture, captures screenshots/metrics under `/tmp/flint-minimal-before` and `/tmp/flint-minimal-after`, and removes its test Vault/profile on completion. Baseline source is supplied to Vite from the specified Git revision, without replacing working-tree application files.
